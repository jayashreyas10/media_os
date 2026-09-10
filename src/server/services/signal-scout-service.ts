import prisma from "../db/prisma";
import { BrandBrainService } from "./brand-brain-service";
import { ProviderFactory } from "../ai/provider-factory";
import { MockResearchTool, LiveWebFetcher, wrapUntrustedContent } from "../ai/research-tool";
import { SignalScoutOutput, SignalScoutOutputSchema } from "../ai/schemas/agent-outputs";
import { KnowledgeBaseService } from "./knowledge-service";
import { validateAndNormalizeUrl } from "./evidence-graph-service";

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

  /**
   * Manually adds a human-observed signal without AI assistance.
   * Enforces URL sanitization, workspace tenancy, and audit logging.
   */
  static async addManualSignal(
    workspaceId: string,
    brandId: string | undefined,
    data: {
      title: string;
      description: string;
      source?: string;
      sourceUrl?: string;
      observedAt?: string | Date;
      topic?: string;
      relevance?: number;
      notes?: string;
      evidence?: string;
      campaignId?: string;
    },
    userId?: string
  ) {
    if (!data.title || data.title.trim().length === 0) {
      throw new Error("Signal title is required");
    }

    // Tenancy checks
    if (brandId) {
      const brand = await prisma.brand.findFirst({
        where: { id: brandId, workspaceId },
      });
      if (!brand) {
        throw new Error("Brand not found in authorized workspace");
      }
    }

    if (data.campaignId) {
      const campaign = await prisma.campaign.findFirst({
        where: { id: data.campaignId, brand: { workspaceId } },
      });
      if (!campaign) {
        throw new Error("Campaign not found in authorized workspace");
      }
    }

    // URL validation using standard Evidence Graph sanitization
    const sanitizedUrl = validateAndNormalizeUrl(data.sourceUrl);

    const relevance = Math.min(10, Math.max(1, data.relevance ?? 8));
    const observedDate = data.observedAt ? new Date(data.observedAt).toISOString() : new Date().toISOString();

    const formattedContent = [
      `Description / Event: ${data.description}`,
      data.source ? `Source: ${data.source}` : null,
      sanitizedUrl ? `Source URL: ${sanitizedUrl}` : null,
      `Observed At: ${observedDate}`,
      `Category / Topic: ${data.topic || "General"}`,
      `Audience Relevance: ${relevance}/10`,
      data.notes ? `Operator Notes: ${data.notes}` : null,
      data.evidence ? `Supporting Evidence: ${data.evidence}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const item = await KnowledgeBaseService.createItem({
      workspaceId,
      brandId: brandId || undefined,
      title: `Signal: ${data.title.trim()}`,
      content: formattedContent,
      type: "RESEARCH",
      sourceUrl: sanitizedUrl || undefined,
      tags: `signal,manual,relevance:${relevance},topic:${(data.topic || "general").toLowerCase().trim()}`,
      confidence: relevance * 10,
    });

    let resolvedUserId: string | null = null;
    if (userId) {
      const user = await prisma.user.findFirst({
        where: { OR: [{ id: userId }, { email: userId }] },
        select: { id: true },
      });
      resolvedUserId = user?.id || null;
    }

    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: resolvedUserId,
        action: "MANUAL_SIGNAL_CREATED",
        entityType: "KnowledgeItem",
        entityId: item.id,
        detailsJson: JSON.stringify({
          title: data.title,
          source: data.source,
          sourceUrl: sanitizedUrl,
          relevance,
          topic: data.topic,
          campaignId: data.campaignId,
        }),
      },
    });

    return {
      id: item.id,
      workspaceId,
      brandId: brandId || null,
      title: data.title,
      event: data.description,
      whyNow: data.notes || "Manual operator observation",
      suggestedAngle: data.topic || "General Analysis",
      opportunityScore: relevance,
      audienceRelevance: relevance,
      sourceUrl: sanitizedUrl,
      isManual: true,
      createdAt: item.createdAt,
    };
  }
}
