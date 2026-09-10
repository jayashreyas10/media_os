import prisma from "../db/prisma";
import { ProviderFactory } from "../ai/provider-factory";
import { StrategyOutput, StrategyOutputSchema } from "../ai/schemas/agent-outputs";
import { BrandBrainService } from "./brand-brain-service";
import { CampaignService } from "./campaign-service";
import { KnowledgeBaseService } from "./knowledge-service";

export class StrategistService {
  /**
   * Synthesizes Brand Brain, campaign brief, and verified research claims into a singular high-conviction editorial thesis.
   */
  static async developStrategy(
    workspaceId: string,
    campaignId: string
  ): Promise<StrategyOutput> {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        brand: true,
        claims: {
          include: {
            primarySource: true,
            evidence: true,
          },
        },
      },
    });

    if (!campaign || campaign.brand.workspaceId !== workspaceId) {
      throw new Error(`Campaign ${campaignId} not found in workspace`);
    }

    const brandBrain = await BrandBrainService.getBrandBrain(
      workspaceId,
      campaign.brandId
    );

    // Format research claims for strategy formulation
    const claimsContext = campaign.claims.map((c) => ({
      claimText: c.claimText,
      confidence: c.confidence,
      isFact: c.isFact,
      status: c.verificationStatus,
      source: c.primarySource?.title || "Unknown source",
      evidenceSnippet: c.evidence[0]?.quoteSnippet || "",
    }));

    // Phase 6 Closed Feedback Loop: Query accepted strategy recommendations
    const acceptedRecommendations = await prisma.strategyRecommendation.findMany({
      where: {
        workspaceId,
        brandId: campaign.brandId,
        status: "ACCEPTED",
      },
      include: { learning: true },
      orderBy: { createdAt: "desc" },
    });

    const recommendationsContext = acceptedRecommendations.map((r) => ({
      title: r.title,
      recommendation: r.recommendation,
      targetFormat: r.targetFormat,
      targetPillar: r.targetPillar,
      actionType: r.actionType,
      category: r.learning?.category,
    }));

    const provider = await ProviderFactory.getProvider({ workspaceId });
    const runResult = await provider.generate({
      agentType: "STRATEGIST",
      promptVersion: "v1.0",
      context: {
        brandName: campaign.brand.name,
        brandIdentity: brandBrain.brand?.identity ? (brandBrain.brand.identity as Record<string, unknown>) : null,
        audienceProfile: brandBrain.audience ? (brandBrain.audience as Record<string, unknown>) : null,
        brandVoice: brandBrain.voice ? (brandBrain.voice as Record<string, unknown>) : null,
        contentPillars: brandBrain.contentPillars.map((p) => ({ name: p.name, description: p.description })),
        editorialRules: brandBrain.editorialRules.map((r) => ({ rule: r.rule, category: r.category })),
        campaignTitle: campaign.title,
        campaignBrief: campaign.brief,
        acceptedStrategyRecommendations: recommendationsContext,
        inputPayload: {
          campaignId: campaign.id,
          campaignStage: campaign.stage,
          verifiedClaims: claimsContext,
          acceptedStrategyRecommendations: recommendationsContext,
        },
      },
    });

    if (!runResult.success || !runResult.data) {
      throw new Error(runResult.errorMessage || "Strategist execution failed");
    }

    const output: StrategyOutput = StrategyOutputSchema.parse(runResult.data);

    // Persist strategy into campaign metadata
    const existingMeta = JSON.parse(campaign.metadataJson || "{}");
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        metadataJson: JSON.stringify({
          ...existingMeta,
          strategy: output,
          strategyCreatedAt: new Date().toISOString(),
        }),
      },
    });

    // Upsert into relational Strategy model
    await prisma.strategy.upsert({
      where: { campaignId: campaign.id },
      create: {
        campaignId: campaign.id,
        primaryHeadline: output.primaryHeadline,
        thesis: output.thesis,
        centralTension: output.centralTension,
        targetReader: output.targetReader,
        desiredOutcome: output.outcome,
        flagshipFormat: output.flagshipFormat,
        outlineJson: JSON.stringify(output.keySections),
        distributionJson: JSON.stringify(output.distributionEntryPoints),
      },
      update: {
        primaryHeadline: output.primaryHeadline,
        thesis: output.thesis,
        centralTension: output.centralTension,
        targetReader: output.targetReader,
        desiredOutcome: output.outcome,
        flagshipFormat: output.flagshipFormat,
        outlineJson: JSON.stringify(output.keySections),
        distributionJson: JSON.stringify(output.distributionEntryPoints),
      },
    });

    // Advance campaign stage if currently in RESEARCH
    if (campaign.stage === "RESEARCH") {
      await CampaignService.transitionStage(campaign.id, "STRATEGY", {
        reason: `Developed editorial thesis: "${output.thesis.slice(0, 80)}..."`,
      });
    }

    // Persist strategy as permanent Knowledge item
    try {
      await KnowledgeBaseService.createItem({
        workspaceId,
        brandId: campaign.brandId,
        title: `Strategy Thesis: ${output.primaryHeadline}`,
        content: [
          `Thesis: ${output.thesis}`,
          `Central Tension: ${output.centralTension}`,
          `Target Reader: ${output.targetReader}`,
          `Outcome: ${output.outcome}`,
          `Format: ${output.flagshipFormat}`,
          `Distribution Channels: ${output.distributionEntryPoints.join(", ")}`,
        ].join("\n"),
        type: "DOCUMENT",
        tags: `strategy,thesis,format:${output.flagshipFormat.toLowerCase()}`,
        confidence: 95,
      });
    } catch {
      // Non-blocking
    }

    // Record audit log
    await prisma.auditLog.create({
      data: {
        workspaceId,
        action: "STRATEGY_DEVELOPED",
        entityType: "Campaign",
        entityId: campaign.id,
        detailsJson: JSON.stringify({
          campaignTitle: campaign.title,
          primaryHeadline: output.primaryHeadline,
          flagshipFormat: output.flagshipFormat,
          sectionsCount: output.keySections.length,
        }),
      },
    });

    return output;
  }
}
