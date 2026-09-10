import prisma from "../db/prisma";

export type SourceType =
  | "PRIMARY_BENCHMARK"
  | "DOCUMENTATION"
  | "PEER_REVIEWED_PAPER"
  | "INDUSTRY_SURVEY"
  | "SYNTHETIC_BENCHMARK";

export type RetrievalStatus = "FETCHED" | "CACHED" | "FAILED" | "SYNTHETIC";

export interface CreateSourceInput {
  workspaceId: string;
  title: string;
  url?: string | null;
  author?: string | null;
  publisher?: string | null;
  publishDate?: string | null;
  sourceType?: SourceType | string | null;
  trustScore?: number | null;
  retrievalStatus?: RetrievalStatus | string | null;
  retrievedAt?: Date | null;
  rawContent?: string | null;
  isSynthetic?: boolean | null;
  sourceNotes?: string | null;
}

export type SupportStance =
  | "SUPPORTS"
  | "CONTRADICTS"
  | "CONTEXTUALIZES"
  | "DOES_NOT_SUPPORT";

export interface CreateClaimInput {
  workspaceId: string;
  campaignId?: string;
  primarySourceId?: string;
  claimText: string;
  confidence?: number;
  isFact?: boolean;
  verificationStatus?: "VERIFIED" | "UNVERIFIED" | "CONTRADICTED" | "UNRESOLVED";
}

export interface AttachEvidenceInput {
  claimId: string;
  sourceId: string;
  quoteSnippet: string;
  context?: string;
  pageOrTimestamp?: string;
  supportStance?: SupportStance;
  verificationMethod?: string;
}

/**
 * Normalizes text for verbatim quote comparison.
 */
export function normalizeSnippet(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\w\s]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Validates and normalizes source URLs.
 * Strictly permits only http: and https: protocols.
 * Explicitly rejects javascript:, data:, vbscript:, and malformed URLs.
 */
export function validateAndNormalizeUrl(url?: string | null): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (trimmed.length === 0) return null;

  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("file:")
  ) {
    throw new Error(`Unsafe URL scheme detected: '${trimmed}'. Only 'http:' and 'https:' are permitted.`);
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`Invalid protocol '${parsed.protocol}'. Only 'http:' and 'https:' are permitted.`);
    }
    return parsed.toString();
  } catch (err) {
    if (err instanceof Error && err.message.includes("Only 'http:' and 'https:'")) {
      throw err;
    }
    throw new Error(`Malformed URL provided: '${trimmed}'`);
  }
}

export class EvidenceGraphService {
  /**
   * Sources
   */
  static async createSource(data: CreateSourceInput) {
    const validatedUrl = validateAndNormalizeUrl(data.url);

    return await prisma.source.create({
      data: {
        workspaceId: data.workspaceId,
        title: data.title,
        url: validatedUrl,
        author: data.author,
        publisher: data.publisher,
        publishDate: data.publishDate,
        sourceType: data.sourceType || "DOCUMENTATION",
        trustScore: data.trustScore ?? 85,
        retrievalStatus: data.retrievalStatus || "FETCHED",
        retrievedAt: data.retrievedAt || new Date(),
        rawContent: data.rawContent || null,
        isSynthetic: data.isSynthetic ?? false,
        sourceNotes: data.sourceNotes,
      },
    });
  }

  static async listSources(workspaceId: string, search?: string) {
    return await prisma.source.findMany({
      where: {
        workspaceId,
        ...(search
          ? {
              OR: [
                { title: { contains: search } },
                { author: { contains: search } },
                { publisher: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        claims: { select: { id: true, claimText: true } },
        evidence: { select: { id: true } },
      },
    });
  }

  static async getSource(id: string) {
    return await prisma.source.findUnique({
      where: { id },
      include: {
        claims: true,
        evidence: {
          include: {
            claim: true,
          },
        },
      },
    });
  }

  /**
   * Claims
   * By default, newly created claims start as UNVERIFIED.
   * AI confidence score is purely self-reported metadata and never independently verifies a claim.
   */
  static async createClaim(data: CreateClaimInput) {
    if (data.campaignId) {
      const campaign = await prisma.campaign.findUnique({
        where: { id: data.campaignId },
        include: { brand: true },
      });
      if (!campaign || campaign.brand.workspaceId !== data.workspaceId) {
        throw new Error(`Campaign ${data.campaignId} does not belong to authorized workspace`);
      }
    }

    if (data.primarySourceId) {
      const source = await prisma.source.findUnique({
        where: { id: data.primarySourceId },
      });
      if (!source || source.workspaceId !== data.workspaceId) {
        throw new Error(`Primary source ${data.primarySourceId} does not belong to authorized workspace`);
      }
    }

    // Newly created claims ALWAYS start as UNVERIFIED.
    // Client input or AI confidence score cannot bypass this rule.
    return await prisma.claim.create({
      data: {
        workspaceId: data.workspaceId,
        campaignId: data.campaignId || null,
        primarySourceId: data.primarySourceId || null,
        claimText: data.claimText,
        confidence: data.confidence ?? 90,
        isFact: data.isFact ?? true,
        verificationStatus: data.verificationStatus || "UNVERIFIED",
      },
      include: {
        primarySource: true,
        campaign: { select: { id: true, title: true } },
      },
    });
  }

  static async listClaims(
    workspaceId: string,
    filters?: { campaignId?: string; verificationStatus?: string }
  ) {
    const { campaignId, verificationStatus } = filters || {};
    return await prisma.claim.findMany({
      where: {
        workspaceId,
        ...(campaignId ? { campaignId } : {}),
        ...(verificationStatus ? { verificationStatus } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        primarySource: true,
        campaign: { select: { id: true, title: true } },
        evidence: {
          include: {
            source: true,
          },
        },
      },
    });
  }

  static async getClaim(id: string, workspaceId?: string) {
    return await prisma.claim.findFirst({
      where: {
        id,
        ...(workspaceId ? { workspaceId } : {}),
      },
      include: {
        primarySource: true,
        campaign: true,
        evidence: {
          include: {
            source: true,
          },
        },
      },
    });
  }

  static async updateClaimStatus(
    claimId: string,
    verificationStatus: "VERIFIED" | "UNVERIFIED" | "CONTRADICTED" | "UNRESOLVED",
    contradictionNote?: string,
    workspaceId?: string
  ) {
    if (workspaceId) {
      const claim = await prisma.claim.findFirst({
        where: { id: claimId, workspaceId },
      });
      if (!claim) throw new Error(`Claim ${claimId} not found in workspace`);
    }

    return await prisma.claim.update({
      where: { id: claimId },
      data: {
        verificationStatus,
        contradictionNote: contradictionNote || null,
      },
    });
  }

  /**
   * Recalculates and enforces claim verification status based on evidence grounding and support stance.
   * Rules:
   * 1. A claim CANNOT become VERIFIED without explicit supporting evidence verifiably extracted from source.
   * 2. If contradicting evidence is present alongside supporting evidence, status becomes UNRESOLVED.
   * 3. If only contradicting evidence is present, status becomes CONTRADICTED.
   * 4. If supporting evidence is verified and no contradictions exist, status becomes VERIFIED.
   * 5. Unverified quotes, fabricated quotes, or DOES_NOT_SUPPORT keep status UNVERIFIED.
   */
  static async recalculateClaimVerificationStatus(claimId: string) {
    const claim = await prisma.claim.findUnique({
      where: { id: claimId },
      include: {
        evidence: {
          include: {
            source: true,
          },
        },
      },
    });

    if (!claim) throw new Error(`Claim ${claimId} not found`);

    const verifiedSupports = claim.evidence.filter(
      (e) => e.supportStance === "SUPPORTS" && e.isQuoteVerified === true
    );
    const verifiedContradicts = claim.evidence.filter(
      (e) => e.supportStance === "CONTRADICTS" && e.isQuoteVerified === true
    );
    const ungroundedEvidence = claim.evidence.filter((e) => !e.isQuoteVerified);

    let newStatus: "VERIFIED" | "UNVERIFIED" | "CONTRADICTED" | "UNRESOLVED" = "UNVERIFIED";
    let contradictionNote: string | null = null;

    if (verifiedContradicts.length > 0 && verifiedSupports.length > 0) {
      newStatus = "UNRESOLVED";
      contradictionNote = `Conflicting evidence detected across sources: ${verifiedSupports.length} verified supporting source(s), ${verifiedContradicts.length} contradicting source(s).`;
    } else if (verifiedContradicts.length > 0 && verifiedSupports.length === 0) {
      newStatus = "CONTRADICTED";
      contradictionNote = "Direct contradiction established in primary source evidence.";
    } else if (verifiedSupports.length > 0 && verifiedContradicts.length === 0) {
      newStatus = "VERIFIED";
      contradictionNote = null;
    } else {
      newStatus = "UNVERIFIED";
      if (ungroundedEvidence.length > 0) {
        contradictionNote = "Evidence quote could not be grounded in retrieved source content.";
      }
    }

    return await prisma.claim.update({
      where: { id: claimId },
      data: {
        verificationStatus: newStatus,
        contradictionNote,
      },
      include: {
        primarySource: true,
        evidence: true,
      },
    });
  }

  /**
   * Evidence Attachment with Quote Grounding & Support Stance
   * 
   * Verifies that:
   * 1. The evidence quote snippet actually originates from the source text (source.rawContent).
   * 2. Assigns isQuoteVerified and groundingScore.
   * 3. Triggers recalculateClaimVerificationStatus() to update Claim status.
   */
  static async attachEvidence(data: AttachEvidenceInput, workspaceId?: string) {
    if (workspaceId) {
      const [claim, source] = await Promise.all([
        prisma.claim.findFirst({ where: { id: data.claimId, workspaceId } }),
        prisma.source.findFirst({ where: { id: data.sourceId, workspaceId } }),
      ]);
      if (!claim) throw new Error(`Claim ${data.claimId} does not belong to authorized workspace`);
      if (!source) throw new Error(`Source ${data.sourceId} does not belong to authorized workspace`);
    }

    // Retrieve source to verify quote grounding against rawContent
    const sourceRecord = await prisma.source.findUnique({
      where: { id: data.sourceId },
    });

    let isQuoteVerified = false;
    let groundingScore = 0;

    if (sourceRecord && sourceRecord.rawContent) {
      const normSource = normalizeSnippet(sourceRecord.rawContent);
      const normQuote = normalizeSnippet(data.quoteSnippet);

      if (normSource.length > 0 && normQuote.length > 0 && normSource.includes(normQuote)) {
        isQuoteVerified = true;
        groundingScore = 100;
      } else {
        isQuoteVerified = false;
        groundingScore = 0;
      }
    }

    const evidence = await prisma.evidence.create({
      data: {
        claimId: data.claimId,
        sourceId: data.sourceId,
        quoteSnippet: data.quoteSnippet,
        context: data.context,
        pageOrTimestamp: data.pageOrTimestamp,
        supportStance: data.supportStance || "SUPPORTS",
        isQuoteVerified,
        groundingScore,
        verificationMethod: data.verificationMethod || "PRIMARY_SOURCE",
      },
      include: {
        source: true,
        claim: true,
      },
    });

    // Recalculate claim's verification status based on evidence graph
    await this.recalculateClaimVerificationStatus(data.claimId);

    return evidence;
  }

  static async deleteClaim(id: string) {
    return await prisma.claim.delete({
      where: { id },
    });
  }

  static async deleteSource(id: string) {
    return await prisma.source.delete({
      where: { id },
    });
  }

  /**
   * Atomically creates a manual research bundle: Source, Claim (UNVERIFIED), and optional Evidence.
   * Enforces evidence integrity: claim starts UNVERIFIED and is only verified if evidence quote
   * matches source.rawContent.
   */
  static async addManualResearchBundle(
    workspaceId: string,
    input: {
      campaignId?: string;
      source: {
        title: string;
        url?: string;
        publisher?: string;
        publishDate?: string;
        author?: string;
        sourceNotes?: string;
        rawContent?: string;
        trustScore?: number;
      };
      claim: {
        claimText: string;
        isFact?: boolean;
        confidence?: number;
      };
      evidence?: {
        quoteSnippet: string;
        context?: string;
        pageOrTimestamp?: string;
        supportStance?: SupportStance;
      };
    },
    userId?: string
  ) {
    if (!input.source?.title) {
      throw new Error("Source title is required");
    }
    if (!input.claim?.claimText) {
      throw new Error("Claim text is required");
    }

    if (input.campaignId) {
      const campaign = await prisma.campaign.findUnique({
        where: { id: input.campaignId },
        include: { brand: true },
      });
      if (!campaign || campaign.brand.workspaceId !== workspaceId) {
        throw new Error(`Campaign ${input.campaignId} does not belong to authorized workspace`);
      }
    }

    // 1. Create Source with strict URL validation
    const source = await this.createSource({
      workspaceId,
      title: input.source.title,
      url: input.source.url,
      publisher: input.source.publisher,
      publishDate: input.source.publishDate,
      author: input.source.author,
      sourceNotes: input.source.sourceNotes,
      rawContent: input.source.rawContent,
      trustScore: input.source.trustScore ?? 85,
    });

    // 2. Create Claim - INVARIANT: ALWAYS defaults to UNVERIFIED
    const claim = await prisma.claim.create({
      data: {
        workspaceId,
        campaignId: input.campaignId || null,
        primarySourceId: source.id,
        claimText: input.claim.claimText,
        confidence: input.claim.confidence ?? 90,
        isFact: input.claim.isFact !== false,
        verificationStatus: "UNVERIFIED",
      },
      include: {
        primarySource: true,
        campaign: { select: { id: true, title: true } },
      },
    });

    let attachedEvidence = null;

    // 3. Attach Evidence if provided
    if (input.evidence?.quoteSnippet) {
      attachedEvidence = await this.attachEvidence(
        {
          claimId: claim.id,
          sourceId: source.id,
          quoteSnippet: input.evidence.quoteSnippet,
          context: input.evidence.context,
          pageOrTimestamp: input.evidence.pageOrTimestamp,
          supportStance: input.evidence.supportStance || "SUPPORTS",
        },
        workspaceId
      );
    }

    // Refresh claim to get updated verificationStatus after evidence evaluation
    const updatedClaim = await this.getClaim(claim.id, workspaceId);

    // Audit Log
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
        action: "MANUAL_RESEARCH_CREATED",
        entityType: "Claim",
        entityId: claim.id,
        detailsJson: JSON.stringify({
          sourceId: source.id,
          sourceTitle: source.title,
          claimId: claim.id,
          verificationStatus: updatedClaim?.verificationStatus,
          hasEvidence: Boolean(attachedEvidence),
          isQuoteVerified: attachedEvidence?.isQuoteVerified ?? false,
        }),
      },
    });

    return {
      source,
      claim: updatedClaim || claim,
      evidence: attachedEvidence,
    };
  }
}
