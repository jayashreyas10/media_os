import prisma from "../db/prisma";
import { ProviderFactory } from "../ai/provider-factory";
import { MockResearchTool, LiveWebFetcher, wrapUntrustedContent, PageContent } from "../ai/research-tool";
import { ResearchOutput, ResearchOutputSchema } from "../ai/schemas/agent-outputs";
import { EvidenceGraphService, SupportStance } from "./evidence-graph-service";
import { CampaignService } from "./campaign-service";

export interface ResearchPackageResult {
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  summary: string;
  sourceCount: number;
  claimCount: number;
  verifiedCount: number;
  contradictionCount: number;
  unverifiedCount: number;
  hasSyntheticSource: boolean;
  claims: Array<{
    id: string;
    claimText: string;
    confidence: number;
    isFact: boolean;
    verificationStatus: string;
    sourceTitle?: string;
    supportStance?: string;
    isQuoteVerified?: boolean;
  }>;
  sources: Array<{
    id: string;
    title: string;
    url?: string | null;
    sourceType?: string;
    isSynthetic?: boolean;
  }>;
}

export class ResearcherService {
  /**
   * Conducts deep fact-checking, primary source discovery, and grounded claim extraction for a campaign.
   * Enforces that claims can only become VERIFIED if supporting evidence verifiably originates from retrieved source content.
   */
  static async runResearch(
    workspaceId: string,
    campaignId: string,
    options?: { topic?: string; useLiveFetcher?: boolean }
  ): Promise<ResearchPackageResult> {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { brand: true },
    });

    if (!campaign || campaign.brand.workspaceId !== workspaceId) {
      throw new Error(`Campaign ${campaignId} not found in workspace`);
    }

    const researchTool = options?.useLiveFetcher ? new LiveWebFetcher(5000) : new MockResearchTool();
    const query = options?.topic || campaign.title;

    // 1. Discover primary sources
    const searchResults = await researchTool.search(query, { maxResults: 4 });

    // 2. Fetch pages, defuse untrusted text, and cache page content for quote grounding
    const rawSnippets: string[] = [];
    const fetchedPagesByUrl = new Map<string, PageContent>();

    for (const res of searchResults) {
      const page = await researchTool.fetchPage(res.url);
      fetchedPagesByUrl.set(res.url, page);
      rawSnippets.push(
        wrapUntrustedContent({
          url: page.url,
          title: page.title,
          text: page.text,
          sourceType: page.sourceType,
          isSynthetic: page.isSynthetic,
        })
      );
    }

    const combinedUntrustedContext = rawSnippets.join("\n\n");

    const provider = await ProviderFactory.getProvider({ workspaceId });
    const runResult = await provider.generate({
      agentType: "RESEARCHER",
      promptVersion: "v1.0",
      context: {
        brandName: campaign.brand.name,
        campaignTitle: campaign.title,
        campaignBrief: campaign.brief,
        inputPayload: {
          query,
          searchResults,
          untrustedEvidenceBodies: combinedUntrustedContext,
        },
      },
    });

    if (!runResult.success || !runResult.data) {
      throw new Error(runResult.errorMessage || "Researcher execution failed");
    }

    const output: ResearchOutput = ResearchOutputSchema.parse(runResult.data);

    // 3. Persist Primary Sources with Provenance & Raw Content
    const createdSources: Array<{
      id: string;
      title: string;
      url?: string | null;
      sourceType?: string;
      isSynthetic?: boolean;
    }> = [];
    const sourceUrlToIdMap = new Map<string, string>();

    for (const src of output.primarySources) {
      let page = fetchedPagesByUrl.get(src.url);
      if (!page && src.url) {
        try {
          page = await researchTool.fetchPage(src.url);
          fetchedPagesByUrl.set(src.url, page);
        } catch {
          // Fallback if fetch fails
        }
      }

      let existingSource = src.url
        ? await prisma.source.findFirst({
            where: { workspaceId, url: src.url },
          })
        : null;

      if (!existingSource) {
        existingSource = await EvidenceGraphService.createSource({
          workspaceId,
          title: src.title,
          url: src.url,
          author: src.author,
          publishDate: src.date,
          sourceType: page?.sourceType || src.sourceType || "DOCUMENTATION",
          trustScore: src.trustScore ?? (page?.trustScore || 85),
          retrievalStatus: page?.retrievalStatus || (src.isSynthetic ? "SYNTHETIC" : "FETCHED"),
          rawContent: page?.text || null,
          isSynthetic: src.isSynthetic || Boolean(page?.isSynthetic),
        });
      } else if (!existingSource.rawContent && page?.text) {
        existingSource = await prisma.source.update({
          where: { id: existingSource.id },
          data: {
            rawContent: page.text,
            sourceType: page.sourceType || existingSource.sourceType,
            retrievalStatus: page.retrievalStatus || existingSource.retrievalStatus,
            isSynthetic: page.isSynthetic ?? existingSource.isSynthetic,
          },
        });
      }

      createdSources.push({
        id: existingSource.id,
        title: existingSource.title,
        url: existingSource.url,
        sourceType: existingSource.sourceType,
        isSynthetic: existingSource.isSynthetic,
      });

      if (src.url) {
        sourceUrlToIdMap.set(src.url, existingSource.id);
      }
    }

    // 4. Persist Claims & Attach Evidence with Grounding Verification
    const createdClaims: Array<{
      id: string;
      claimText: string;
      confidence: number;
      isFact: boolean;
      verificationStatus: string;
      sourceTitle?: string;
      supportStance?: string;
      isQuoteVerified?: boolean;
    }> = [];

    for (const c of output.claims) {
      const sourceId = sourceUrlToIdMap.get(c.sourceUrl) || createdSources[0]?.id;

      // Check if output flags any contradictions for this claim
      const hasContradiction = output.contradictions.some((contra) =>
        c.claimText.toLowerCase().includes(contra.toLowerCase()) ||
        contra.toLowerCase().includes(c.claimText.toLowerCase().slice(0, 20))
      );

      // Determine initial support stance
      let stance: SupportStance = (c.supportStance as SupportStance) || "SUPPORTS";
      if (hasContradiction) {
        stance = "CONTRADICTS";
      }

      // Claims begin as UNVERIFIED; AI confidence does NOT verify claims!
      const claimRecord = await EvidenceGraphService.createClaim({
        workspaceId,
        campaignId: campaign.id,
        primarySourceId: sourceId,
        claimText: c.claimText,
        confidence: c.confidence,
        isFact: c.isFact,
        verificationStatus: "UNVERIFIED",
      });

      // Attach evidence with quote grounding against source.rawContent
      let isQuoteVerified = false;
      if (sourceId && c.evidenceSnippet) {
        const evidenceRecord = await EvidenceGraphService.attachEvidence(
          {
            claimId: claimRecord.id,
            sourceId,
            quoteSnippet: c.evidenceSnippet,
            context: `Extracted during research for campaign "${campaign.title}"`,
            supportStance: stance,
          },
          workspaceId
        );
        isQuoteVerified = evidenceRecord.isQuoteVerified;
      }

      // Fetch refreshed claim to read recalculateClaimVerificationStatus outcome
      const refreshedClaim = await prisma.claim.findUnique({
        where: { id: claimRecord.id },
      });

      createdClaims.push({
        id: claimRecord.id,
        claimText: claimRecord.claimText,
        confidence: claimRecord.confidence,
        isFact: claimRecord.isFact,
        verificationStatus: refreshedClaim?.verificationStatus || "UNVERIFIED",
        sourceTitle: createdSources.find((s) => s.id === sourceId)?.title,
        supportStance: stance,
        isQuoteVerified,
      });
    }

    // 5. Evaluate Research Status
    const verifiedCount = createdClaims.filter((c) => c.verificationStatus === "VERIFIED").length;
    const contradictionCount = createdClaims.filter(
      (c) => c.verificationStatus === "CONTRADICTED" || c.verificationStatus === "UNRESOLVED"
    ).length;
    const unverifiedCount = createdClaims.filter((c) => c.verificationStatus === "UNVERIFIED").length;
    const hasSyntheticSource = createdSources.some((s) => s.isSynthetic);

    let researchStatus: "SUCCESS" | "PARTIAL" | "FAILED" = "FAILED";

    if (createdClaims.length === 0 || verifiedCount === 0) {
      researchStatus = "FAILED";
    } else if (
      verifiedCount === createdClaims.length &&
      contradictionCount === 0 &&
      !hasSyntheticSource
    ) {
      researchStatus = "SUCCESS";
    } else {
      // Some verified, or contradictions present, or synthetic demonstration data used
      researchStatus = "PARTIAL";
    }

    // 6. Transition campaign stage forward if currently in DISCOVERY and research did not fail
    if (campaign.stage === "DISCOVERY" && researchStatus !== "FAILED") {
      await CampaignService.transitionStage(campaign.id, "RESEARCH", {
        reason: `Completed evidence research (${researchStatus}): ${verifiedCount} verified claims, ${contradictionCount} contradictions, ${createdSources.length} sources.`,
      });
    }

    // 7. Update campaign metadata
    const currentMeta = JSON.parse(campaign.metadataJson || "{}");
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        metadataJson: JSON.stringify({
          ...currentMeta,
          researchSummary: output.summary,
          researchStatus,
          unknowns: output.unknowns,
          contradictions: output.contradictions,
          hasSyntheticSource,
          lastResearchedAt: new Date().toISOString(),
        }),
      },
    });

    // 8. Record audit log
    await prisma.auditLog.create({
      data: {
        workspaceId,
        action: "RESEARCH_PACKAGE_GENERATED",
        entityType: "Campaign",
        entityId: campaign.id,
        detailsJson: JSON.stringify({
          campaignTitle: campaign.title,
          researchStatus,
          claimsCount: createdClaims.length,
          verifiedCount,
          contradictionCount,
          unverifiedCount,
          hasSyntheticSource,
        }),
      },
    });

    return {
      status: researchStatus,
      summary: output.summary,
      sourceCount: createdSources.length,
      claimCount: createdClaims.length,
      verifiedCount,
      contradictionCount,
      unverifiedCount,
      hasSyntheticSource,
      claims: createdClaims,
      sources: createdSources,
    };
  }
}
