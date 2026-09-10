import prisma from "../db/prisma";
import { BrandBrainService } from "./brand-brain-service";
import { ProviderFactory } from "../ai/provider-factory";
import { MockResearchTool, LiveWebFetcher, wrapUntrustedContent } from "../ai/research-tool";
import { SignalScoutOutput, SignalScoutOutputSchema } from "../ai/schemas/agent-outputs";
import { KnowledgeBaseService } from "./knowledge-service";

export interface ScanSignalsOptions {
  topic?: string;
  useLiveFetcher?: boolean;
}

export class SignalScoutService {
  /**
   * Scans for high-opportunity signals aligned with Brand Brain pillars and audience.
   */
  static async scanSignals(
    workspaceId: string,
    brandId?: string,
    options?: ScanSignalsOptions
  ): Promise<SignalScoutOutput> {
    const brand = await BrandBrainService.getBrandBrain(workspaceId, brandId);
    const researchTool = options?.useLiveFetcher ? new LiveWebFetcher(5000) : new MockResearchTool();

    // Determine search terms from content pillars or supplied topic
    const searchQuery =
      options?.topic ||
      (brand.contentPillars.length > 0
        ? brand.contentPillars.map((p) => p.name).join(" ")
        : "AI engineering agent architecture");

    const searchResults = await researchTool.search(searchQuery, { maxResults: 3 });

    // Fetch top page for context
    let primaryContent = "";
    if (searchResults.length > 0) {
      const topPage = await researchTool.fetchPage(searchResults[0].url);
      primaryContent = wrapUntrustedContent({
        url: topPage.url,
        title: topPage.title,
        text: topPage.text,
      });
    }

    const provider = await ProviderFactory.getProvider({ workspaceId });
    const runResult = await provider.generate({
      agentType: "SIGNAL_SCOUT",
      promptVersion: "v1.0",
      context: {
        brandName: brand.brand?.name || "MediaOS Brand",
        brandIdentity: brand.brand?.identity ? (brand.brand.identity as Record<string, unknown>) : null,
        audienceProfile: brand.audience ? (brand.audience as Record<string, unknown>) : null,
        brandVoice: brand.voice ? (brand.voice as Record<string, unknown>) : null,
        contentPillars: brand.contentPillars.map((p) => ({ name: p.name, description: p.description })),
        editorialRules: brand.editorialRules.map((r) => ({ rule: r.rule, category: r.category })),
        campaignTitle: options?.topic,
        inputPayload: {
          searchQuery,
          discoveredSearchResults: searchResults,
          primarySourceSnippet: primaryContent,
        },
      },
    });

    if (!runResult.success || !runResult.data) {
      throw new Error(runResult.errorMessage || "Signal Scout execution failed");
    }

    const output = SignalScoutOutputSchema.parse(runResult.data);

    // Persist discovered signals to Knowledge Base for historical recall
    for (const signal of output.signals) {
      try {
        await KnowledgeBaseService.createItem({
          workspaceId,
          brandId: brand.brand?.id,
          title: `Signal: ${signal.title}`,
          content: [
            `Event: ${signal.event}`,
            `Why Now: ${signal.whyNow}`,
            `Urgency: ${signal.urgency}`,
            `Opportunity Score: ${signal.opportunityScore}/10`,
            `Audience Relevance: ${signal.audienceRelevance}/10`,
            `Suggested Angle: ${signal.suggestedAngle}`,
          ].join("\n"),
          type: "RESEARCH",
          tags: `signal,urgency:${signal.urgency.toLowerCase()},score:${signal.opportunityScore}`,
          confidence: signal.opportunityScore * 10,
        });
      } catch {
        // Continue if duplicate or warning
      }
    }

    return output;
  }

  /**
   * Promotes a discovered signal into a formal Campaign in the DISCOVERY stage.
   */
  static async promoteSignalToCampaign(
    workspaceId: string,
    brandId: string,
    signal: {
      title: string;
      event: string;
      whyNow: string;
      suggestedAngle: string;
      opportunityScore?: number;
      targetDate?: Date;
    }
  ) {
    const slug = signal.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 40) + `-${Date.now().toString().slice(-4)}`;

    const campaign = await prisma.campaign.create({
      data: {
        brandId,
        title: signal.title,
        slug,
        stage: "DISCOVERY",
        priority: (signal.opportunityScore || 7) >= 8 ? "HIGH" : "MEDIUM",
        brief: `Angle: ${signal.suggestedAngle}\n\nContext / Event: ${signal.event}\n\nWhy Now: ${signal.whyNow}`,
        metadataJson: JSON.stringify({
          sourceSignal: signal,
          promotedAt: new Date().toISOString(),
        }),
      },
      include: {
        brand: true,
      },
    });

    // Record initial stage history
    await prisma.campaignStageHistory.create({
      data: {
        campaignId: campaign.id,
        fromStage: "NONE",
        toStage: "DISCOVERY",
        reason: "Promoted from Signal Scout discovery",
      },
    });

    // Record audit log
    await prisma.auditLog.create({
      data: {
        workspaceId,
        action: "CAMPAIGN_PROMOTED_FROM_SIGNAL",
        entityType: "Campaign",
        entityId: campaign.id,
        detailsJson: JSON.stringify({
          signalTitle: signal.title,
          campaignId: campaign.id,
          campaignSlug: campaign.slug,
        }),
      },
    });

    return campaign;
  }
}
