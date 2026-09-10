import prisma from "../db/prisma";
import { AgentType } from "./provider-interface";

export async function getAgentContext(
  agentType: AgentType,
  campaignId?: string | null,
  workspaceId?: string
) {
  let campaign = null;
  let brand = null;

  if (campaignId) {
    campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        brand: {
          include: {
            identity: true,
            audience: true,
            voice: true,
            pillars: true,
            editorialRules: true,
            goals: true,
            offers: true,
            proofs: true,
          },
        },
      },
    });
    if (campaign) {
      brand = campaign.brand;
    }
  } else if (workspaceId) {
    brand = await prisma.brand.findFirst({
      where: { workspaceId, isDefault: true },
      include: {
        identity: true,
        audience: true,
        voice: true,
        pillars: true,
        editorialRules: true,
        goals: true,
        offers: true,
        proofs: true,
      },
    });
    if (!brand) {
      brand = await prisma.brand.findFirst({
        where: { workspaceId },
        include: {
          identity: true,
          audience: true,
          voice: true,
          pillars: true,
          editorialRules: true,
          goals: true,
          offers: true,
          proofs: true,
        },
      });
    }
  }

  // Filter context per agent specification
  switch (agentType) {
    case "SIGNAL_SCOUT":
      return {
        brandName: brand?.name || "Apex Media",
        audienceProfile: brand?.audience || null,
        contentPillars: brand?.pillars || [],
        goals: brand?.goals || [],
        editorialRules: brand?.editorialRules.filter((r) => r.category === "TONE") || [],
        campaignTitle: campaign?.title || "Industry Shift Scan",
        campaignBrief: campaign?.brief || null,
      };

    case "RESEARCHER":
      return {
        brandName: brand?.name || "Apex Media",
        audienceProfile: brand?.audience || null,
        editorialRules: brand?.editorialRules.filter((r) => r.category === "FACT_CHECKING") || [],
        proofs: brand?.proofs || [],
        campaignTitle: campaign?.title || "Evidence Verification",
        campaignBrief: campaign?.brief || null,
      };

    case "STRATEGIST":
      return {
        brandName: brand?.name || "Apex Media",
        brandIdentity: brand?.identity || null,
        audienceProfile: brand?.audience || null,
        contentPillars: brand?.pillars || [],
        campaignTitle: campaign?.title || "Content Strategy",
        campaignBrief: campaign?.brief || null,
      };

    case "WRITER":
      return {
        brandName: brand?.name || "Apex Media",
        brandVoice: brand?.voice || null,
        editorialRules: brand?.editorialRules || [],
        campaignTitle: campaign?.title || "Flagship Script",
        campaignBrief: campaign?.brief || null,
      };

    case "DISTRIBUTION":
      return {
        brandName: brand?.name || "Apex Media",
        brandVoice: brand?.voice || null,
        audienceProfile: brand?.audience || null,
        campaignTitle: campaign?.title || "Multi-Platform Repurposing",
        campaignBrief: campaign?.brief || null,
      };

    case "EDITOR":
      return {
        brandName: brand?.name || "Apex Media",
        brandVoice: brand?.voice || null,
        editorialRules: brand?.editorialRules || [],
        proofs: brand?.proofs || [],
        campaignTitle: campaign?.title || "Editorial Verification",
        campaignBrief: campaign?.brief || null,
      };

    default:
      return {
        brandName: brand?.name || "Apex Media",
        campaignTitle: campaign?.title || "Default Task",
        campaignBrief: campaign?.brief || null,
      };
  }
}

export interface BuildWriterContextInput {
  workspaceId: string;
  campaignId: string;
  format: string; // YOUTUBE_LONG_FORM, YOUTUBE_SHORT, NEWSLETTER, X_THREAD, LINKEDIN_POST, GENERIC_SOCIAL
  assetTitle?: string;
  mode?: string; // GENERATE, REGENERATE, REWRITE_SELECTION, EXPAND, SHORTEN, CHANGE_TONE, CREATE_ALTERNATIVE
  targetSection?: string;
  instructions?: string;
}

export class ContextBuilder {
  /**
   * Scopes and builds the precise context required for the Writer agent.
   * Feeds Brand Brain, approved Strategy, relevant claims, and verified evidence.
   * Defuses all external data with security boundary wrappers.
   */
  static async buildWriterContext(input: BuildWriterContextInput) {
    const { workspaceId, campaignId, format, assetTitle, mode = "GENERATE", targetSection, instructions } = input;

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        brand: {
          include: {
            identity: true,
            audience: true,
            voice: true,
            pillars: true,
            editorialRules: true,
          },
        },
        strategy: true,
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

    const brand = campaign.brand;

    // Retrieve approved strategy: from Strategy model or fallback to metadataJson
    let strategyData: {
      primaryHeadline: string;
      thesis: string;
      centralTension: string;
      targetReader?: string | null;
      desiredOutcome?: string | null;
      flagshipFormat?: string | null;
      keySections?: Array<{ title: string; keyPoints: string[]; purpose: string }>;
    } | null = null;

    if (campaign.strategy) {
      strategyData = {
        primaryHeadline: campaign.strategy.primaryHeadline,
        thesis: campaign.strategy.thesis,
        centralTension: campaign.strategy.centralTension,
        targetReader: campaign.strategy.targetReader,
        desiredOutcome: campaign.strategy.desiredOutcome,
        flagshipFormat: campaign.strategy.flagshipFormat,
        keySections: campaign.strategy.outlineJson ? JSON.parse(campaign.strategy.outlineJson) : [],
      };
    } else if (campaign.metadataJson) {
      try {
        const meta = JSON.parse(campaign.metadataJson);
        if (meta.strategy) {
          strategyData = {
            primaryHeadline: meta.strategy.primaryHeadline || campaign.title,
            thesis: meta.strategy.thesis || "",
            centralTension: meta.strategy.centralTension || "",
            targetReader: meta.strategy.targetReader || "",
            desiredOutcome: meta.strategy.outcome || meta.strategy.desiredOutcome || "",
            flagshipFormat: meta.strategy.flagshipFormat || "",
            keySections: meta.strategy.keySections || [],
          };
        }
      } catch {
        // ignore parse error
      }
    }

    // Map verified/relevant claims with prompt isolation
    const relevantClaims = campaign.claims.map((c) => ({
      id: c.id,
      claimText: c.claimText,
      verificationStatus: c.verificationStatus,
      confidence: c.confidence,
      isFact: c.isFact,
      sourceTitle: c.primarySource?.title || undefined,
      isSynthetic: c.primarySource?.isSynthetic || false,
      evidenceQuotes: c.evidence.map((e) => ({
        id: e.id,
        quoteSnippet: e.quoteSnippet,
        supportStance: e.supportStance,
        isQuoteVerified: e.isQuoteVerified,
      })),
    }));

    return {
      brandName: brand.name,
      audienceProfile: brand.audience ? {
        targetAudience: brand.audience.targetAudience,
        painPoints: brand.audience.painPoints,
        desires: brand.audience.desires,
      } : null,
      brandVoice: brand.voice ? {
        tone: brand.voice.tone,
        styleGuidelines: brand.voice.styleGuidelines,
        forbiddenWords: brand.voice.forbiddenWords,
        signaturePhrases: brand.voice.signaturePhrases,
      } : null,
      contentPillars: brand.pillars.map((p) => ({ name: p.name, description: p.description })),
      editorialRules: brand.editorialRules.map((r) => ({
        rule: r.rule,
        category: r.category,
        severity: r.severity,
      })),
      campaign: {
        id: campaign.id,
        title: campaign.title,
        brief: campaign.brief,
      },
      strategy: strategyData,
      relevantClaims,
      format,
      assetTitle: assetTitle || campaign.title,
      mode,
      targetSection,
      instructions,
    };
  }

  /**
   * Scopes and builds the precise context required for the Editorial Reviewer agent.
   * Isolates Brand rules, Voice, Evidence graph, blocks, and claim references.
   * Wraps all source and evidence snippets in secure untrusted-data tags.
   */
  static async buildEditorialReviewContext(input: {
    workspaceId: string;
    assetId: string;
    versionId?: string;
  }) {
    const { workspaceId, assetId, versionId } = input;

    const asset = await prisma.contentAsset.findUnique({
      where: { id: assetId },
      include: {
        brand: {
          include: {
            identity: true,
            audience: true,
            voice: true,
            pillars: true,
            editorialRules: true,
          },
        },
        campaign: {
          include: {
            claims: {
              include: {
                primarySource: true,
                evidence: {
                  include: {
                    source: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!asset || asset.workspaceId !== workspaceId) {
      throw new Error(`ContentAsset ${assetId} not found in workspace`);
    }

    const targetVersionId = versionId || asset.currentVersionId;
    if (!targetVersionId) {
      throw new Error(`ContentAsset ${assetId} has no version to review`);
    }

    const version = await prisma.contentVersion.findUnique({
      where: { id: targetVersionId },
      include: {
        blocks: {
          orderBy: { orderIndex: "asc" },
        },
        claimReferences: {
          include: {
            claim: {
              include: {
                evidence: {
                  include: {
                    source: true,
                  },
                },
              },
            },
            block: true,
          },
        },
      },
    });

    if (!version || version.assetId !== asset.id) {
      throw new Error(`ContentVersion ${targetVersionId} does not belong to asset ${assetId}`);
    }

    const brand = asset.brand;
    const campaign = asset.campaign;

    // Securely wrap all external/untrusted data
    const wrappedClaims = campaign.claims.map((c) => ({
      id: c.id,
      claimText: c.claimText,
      verificationStatus: c.verificationStatus,
      confidence: c.confidence,
      isFact: c.isFact,
      contradictionNote: c.contradictionNote,
      primarySourceTitle: c.primarySource?.title,
      evidenceQuotes: c.evidence.map((e) => ({
        id: e.id,
        quoteSnippet: `<<<BEGIN_UNTRUSTED_EXTERNAL_DATA>>>\n${e.quoteSnippet}\n<<<END_UNTRUSTED_EXTERNAL_DATA>>>`,
        supportStance: e.supportStance,
        isQuoteVerified: e.isQuoteVerified,
        sourceTitle: e.source?.title,
      })),
    }));

    return {
      workspaceId,
      assetId: asset.id,
      assetTitle: asset.title,
      assetType: asset.type,
      currentVersionId: version.id,
      versionNumber: version.versionNumber,
      brandName: brand.name,
      audienceProfile: brand.audience,
      brandVoice: brand.voice,
      editorialRules: brand.editorialRules,
      campaignTitle: campaign.title,
      blocks: version.blocks.map((b) => ({
        id: b.id,
        blockType: b.blockType,
        orderIndex: b.orderIndex,
        title: b.title,
        content: b.content,
        example: b.example,
        transition: b.transition,
        statementType: b.statementType,
        unsupportedFlag: b.unsupportedFlag,
      })),
      claimReferences: version.claimReferences.map((cr) => ({
        id: cr.id,
        blockId: cr.blockId,
        claimId: cr.claimId,
        citationText: cr.citationText,
        isGrounded: cr.isGrounded,
        claimText: cr.claim?.claimText,
        verificationStatus: cr.claim?.verificationStatus,
        contradictionNote: cr.claim?.contradictionNote,
      })),
      campaignClaims: wrappedClaims,
      isStructuredReview: true,
    };
  }
}
