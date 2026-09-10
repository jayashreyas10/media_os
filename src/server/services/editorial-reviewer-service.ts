import prisma from "../db/prisma";
import { ContextBuilder } from "../ai/context-builder";
import { MockAIProvider } from "../ai/providers/mock-provider";
import {
  EditorialFinding,
  EditorialReviewOutput,
  EditorialReviewOutputSchema,
} from "../ai/schemas/agent-outputs";

export interface RunReviewInput {
  workspaceId: string;
  assetId: string;
  versionId?: string;
  reviewerType?: "AI_EDITOR" | "HUMAN";
}

export interface ReviewDiagnostics {
  evidenceCheck: {
    passed: boolean;
    totalBlocks: number;
    unsupportedBlocksCount: number;
    contradictedClaimsCount: number;
    unverifiedClaimsCount: number;
  };
  brandCheck: {
    passed: boolean;
    forbiddenWordsDetected: string[];
  };
  formatCheck: {
    passed: boolean;
    format: string;
    violations: string[];
  };
  qualityCheck: {
    passed: boolean;
    totalWordCount: number;
  };
}

export class EditorialReviewerService {
  /**
   * Runs deterministic pre-checks and AI editorial review on an asset's version.
   * Generates structured findings, revision requests, and updates asset status.
   */
  static async runReview(input: RunReviewInput) {
    const { workspaceId, assetId, versionId, reviewerType = "AI_EDITOR" } = input;

    // Build scoped context (validates workspace tenancy and resolves version)
    const context = await ContextBuilder.buildEditorialReviewContext({
      workspaceId,
      assetId,
      versionId,
    });

    const asset = await prisma.contentAsset.findUnique({
      where: { id: assetId },
      include: { brand: { include: { voice: true } } },
    });

    if (!asset) {
      throw new Error(`ContentAsset ${assetId} not found`);
    }

    const version = await prisma.contentVersion.findUnique({
      where: { id: context.currentVersionId },
      include: {
        blocks: { orderBy: { orderIndex: "asc" } },
        claimReferences: {
          include: {
            claim: {
              include: { evidence: true },
            },
          },
        },
      },
    });

    if (!version) {
      throw new Error(`ContentVersion ${context.currentVersionId} not found`);
    }

    // --- 1. DETERMINISTIC PRE-CHECKS ---
    const deterministicFindings: EditorialFinding[] = [];
    const forbiddenWordsDetected: string[] = [];
    const formatViolations: string[] = [];

    // Evidence Integrity Checks
    let unsupportedCount = 0;
    let contradictedCount = 0;
    let unverifiedCount = 0;

    for (const block of version.blocks) {
      if (block.unsupportedFlag) {
        unsupportedCount++;
        deterministicFindings.push({
          category: "EVIDENCE_INTEGRITY",
          severity: "ERROR",
          blockId: block.id,
          description: `Block #${block.orderIndex + 1} (${block.blockType}) contains unsupported factual assertions without verified evidence backing.`,
          recommendation: "Attach verified claim citations or qualify this statement as opinion/inference.",
          requiresRevision: true,
        });
      }
    }

    for (const cr of version.claimReferences) {
      if (cr.claim?.verificationStatus === "CONTRADICTED") {
        contradictedCount++;
        deterministicFindings.push({
          category: "EVIDENCE_INTEGRITY",
          severity: "CRITICAL",
          blockId: cr.blockId || undefined,
          claimId: cr.claimId,
          description: `Cited claim "${cr.claim.claimText.slice(0, 70)}..." is marked CONTRADICTED by retrieved evidence. Contradiction note: ${cr.claim.contradictionNote || "Conflicting sources detected"}.`,
          evidence: cr.claim.evidence?.[0]?.quoteSnippet,
          recommendation: "Remove the contradicted statement or address the nuance and conflicting data directly.",
          requiresRevision: true,
        });
      } else if (cr.claim?.verificationStatus === "UNRESOLVED" || cr.claim?.verificationStatus === "UNVERIFIED") {
        unverifiedCount++;
        deterministicFindings.push({
          category: "EVIDENCE_INTEGRITY",
          severity: "WARNING",
          blockId: cr.blockId || undefined,
          claimId: cr.claimId,
          description: `Cited claim "${cr.claim.claimText.slice(0, 60)}..." has not been fully verified (${cr.claim.verificationStatus}).`,
          recommendation: "Ensure primary source documentation is verified before approving for publication.",
          requiresRevision: false,
        });
      }
    }

    // Brand Voice Checks (Forbidden Buzzwords)
    const forbiddenWords = asset.brand.voice?.forbiddenWords
      ? asset.brand.voice.forbiddenWords
          .split(",")
          .map((w) => w.trim().toLowerCase())
          .filter(Boolean)
      : [];

    for (const block of version.blocks) {
      const contentLower = (block.content || "").toLowerCase();
      for (const word of forbiddenWords) {
        if (contentLower.includes(word)) {
          forbiddenWordsDetected.push(word);
          deterministicFindings.push({
            category: "BRAND_VOICE",
            severity: "ERROR",
            blockId: block.id,
            description: `Block #${block.orderIndex + 1} uses forbidden buzzword: "${word}".`,
            recommendation: `Replace buzzword "${word}" with precise, technical explanation.`,
            requiresRevision: true,
          });
        }
      }
    }

    // Format Compliance Checks
    if (asset.type === "X_THREAD") {
      if (version.blocks.length < 2) {
        formatViolations.push("Thread must contain at least 2 posts");
        deterministicFindings.push({
          category: "FORMAT_COMPLIANCE",
          severity: "ERROR",
          description: "X Thread requires at least 2 connected posts.",
          recommendation: "Expand the thread with additional breakdown steps.",
          requiresRevision: true,
        });
      }
      for (const block of version.blocks) {
        if ((block.content || "").length > 280) {
          formatViolations.push(`Tweet exceeds 280 chars (${block.content.length})`);
          deterministicFindings.push({
            category: "FORMAT_COMPLIANCE",
            severity: "ERROR",
            blockId: block.id,
            description: `Post #${block.orderIndex + 1} exceeds Twitter 280 character limit (${block.content.length} characters).`,
            recommendation: "Condense post to 280 characters or fewer.",
            requiresRevision: true,
          });
        }
      }
    } else if (asset.type === "YOUTUBE_LONG_FORM") {
      const blockTypes = new Set(version.blocks.map((b) => b.blockType));
      if (!blockTypes.has("HOOK")) {
        formatViolations.push("Missing HOOK block");
        deterministicFindings.push({
          category: "FORMAT_COMPLIANCE",
          severity: "ERROR",
          description: "YouTube Long-Form script is missing a HOOK block.",
          recommendation: "Add a compelling 30-second hook block to open the script.",
          requiresRevision: true,
        });
      }
      if (!blockTypes.has("CTA") && !blockTypes.has("CONCLUSION")) {
        formatViolations.push("Missing CONCLUSION or CTA block");
        deterministicFindings.push({
          category: "FORMAT_COMPLIANCE",
          severity: "WARNING",
          description: "Script lacks a clear Conclusion or Call to Action block.",
          recommendation: "Add a CTA or Conclusion block.",
          requiresRevision: false,
        });
      }
    }

    // Quality Checks
    let totalWordCount = 0;
    for (const block of version.blocks) {
      const words = (block.content || "").trim().split(/\s+/).filter(Boolean);
      totalWordCount += words.length;
      if (words.length < 3 && block.blockType !== "CTA") {
        deterministicFindings.push({
          category: "EDITORIAL_QUALITY",
          severity: "WARNING",
          blockId: block.id,
          description: `Block #${block.orderIndex + 1} is unusually brief (${words.length} words).`,
          recommendation: "Flesh out this section with substantive detail.",
          requiresRevision: false,
        });
      }
    }

    const diagnostics: ReviewDiagnostics = {
      evidenceCheck: {
        passed: unsupportedCount === 0 && contradictedCount === 0,
        totalBlocks: version.blocks.length,
        unsupportedBlocksCount: unsupportedCount,
        contradictedClaimsCount: contradictedCount,
        unverifiedClaimsCount: unverifiedCount,
      },
      brandCheck: {
        passed: forbiddenWordsDetected.length === 0,
        forbiddenWordsDetected,
      },
      formatCheck: {
        passed: formatViolations.length === 0,
        format: asset.type,
        violations: formatViolations,
      },
      qualityCheck: {
        passed: totalWordCount > 50,
        totalWordCount,
      },
    };

    // --- 2. AI EDITORIAL REVIEW DISPATCH ---
    const provider = new MockAIProvider();
    const aiResult = await provider.generate({
      agentType: "EDITOR",
      context: {
        ...context,
        reviewMode: "STRUCTURED",
        isStructuredReview: true,
      },
    });

    let aiFindings: EditorialFinding[] = [];
    let aiScores = {
      evidenceScore: 90,
      brandScore: 90,
      qualityScore: 90,
      formatScore: 90,
      overallScore: 90,
    };
    let aiSummary = "Editorial review completed.";

    if (aiResult.success && aiResult.data) {
      const parsed = EditorialReviewOutputSchema.safeParse(aiResult.data);
      if (parsed.success) {
        aiFindings = parsed.data.findings;
        aiScores = parsed.data.scores;
        aiSummary = parsed.data.summary;
      }
    }

    // --- 3. UNIFY FINDINGS & CALCULATE VERDICT ---
    // Merge deterministic findings (which take precedence) with AI findings
    const allFindings: EditorialFinding[] = [...deterministicFindings];
    for (const aif of aiFindings) {
      // Avoid duplicate block findings if already covered
      const exists = allFindings.some(
        (df) => df.blockId && df.blockId === aif.blockId && df.category === aif.category
      );
      if (!exists) {
        allFindings.push(aif);
      }
    }

    // Has blockers if any finding is ERROR or CRITICAL
    const hasBlockers = allFindings.some(
      (f) => f.severity === "ERROR" || f.severity === "CRITICAL"
    );

    // Compute composite scores
    const evidenceScore = Math.max(0, 100 - unsupportedCount * 25 - contradictedCount * 40 - unverifiedCount * 5);
    const brandScore = Math.max(0, 100 - forbiddenWordsDetected.length * 30);
    const formatScore = Math.max(0, 100 - formatViolations.length * 25);
    const qualityScore = Math.min(100, Math.round(aiScores.qualityScore));
    const overallScore = Math.round(
      evidenceScore * 0.4 + brandScore * 0.25 + formatScore * 0.2 + qualityScore * 0.15
    );

    const verdict = hasBlockers ? ("REQUEST_REVISION" as const) : ("PASS" as const);
    const reviewStatus = hasBlockers ? "REVISION_REQUIRED" : "PASSED";

    const scores = {
      evidenceScore,
      brandScore,
      qualityScore,
      formatScore,
      overallScore,
    };

    const summary = hasBlockers
      ? `Editorial Review flagged ${allFindings.filter((f) => f.requiresRevision).length} issue(s) requiring revision. Evidence score: ${evidenceScore}%, Brand score: ${brandScore}%.`
      : `Editorial Review passed all deterministic and AI checks with an overall score of ${overallScore}/100. Ready for human approval gate.`;

    // --- 4. PERSIST REVIEW & REVISION REQUESTS ---
    const review = await prisma.editorialReview.create({
      data: {
        workspaceId,
        brandId: asset.brandId,
        campaignId: asset.campaignId,
        contentAssetId: asset.id,
        contentVersionId: version.id,
        reviewerType,
        status: reviewStatus,
        verdict,
        overallScore,
        scoresJson: JSON.stringify(scores),
        summary,
        findingsJson: JSON.stringify(allFindings),
        metricsJson: JSON.stringify(diagnostics),
        completedAt: new Date(),
      },
    });

    // Create RevisionRequests for findings requiring revision
    const revisionRequestsToCreate = allFindings
      .filter((f) => f.requiresRevision)
      .map((f) => ({
        reviewId: review.id,
        contentVersionId: version.id,
        blockId: f.blockId || null,
        category: f.category,
        severity: f.severity,
        instruction: `${f.description} -> Fix: ${f.recommendation}`,
        status: "OPEN",
      }));

    if (revisionRequestsToCreate.length > 0) {
      await prisma.revisionRequest.createMany({
        data: revisionRequestsToCreate,
      });
    }

    // Transition ContentAsset status
    const targetAssetStatus = hasBlockers ? "REVISION_REQUIRED" : "REVIEW_PASSED";
    await prisma.contentAsset.update({
      where: { id: asset.id },
      data: { status: targetAssetStatus },
    });

    // Record review in ApprovalRecord audit log
    await prisma.approvalRecord.create({
      data: {
        workspaceId,
        brandId: asset.brandId,
        campaignId: asset.campaignId,
        contentAssetId: asset.id,
        contentVersionId: version.id,
        reviewId: review.id,
        action: hasBlockers ? "REVISION_REQUESTED" : "REVIEW_PASSED",
        comment: summary,
      },
    });

    await prisma.auditLog.create({
      data: {
        workspaceId,
        action: "EDITORIAL_REVIEW_COMPLETED",
        entityType: "EditorialReview",
        entityId: review.id,
        detailsJson: JSON.stringify({
          verdict,
          status: reviewStatus,
          overallScore,
          openRevisionRequests: revisionRequestsToCreate.length,
        }),
      },
    });

    const fullReview = await prisma.editorialReview.findUnique({
      where: { id: review.id },
      include: {
        revisionRequests: true,
        contentVersion: { select: { id: true, versionNumber: true } },
        contentAsset: { select: { id: true, title: true, status: true, type: true } },
      },
    });

    return fullReview!;
  }

  /**
   * Retrieves an editorial review by ID with its revision requests.
   */
  static async getReview(reviewId: string, workspaceId: string) {
    const review = await prisma.editorialReview.findFirst({
      where: { id: reviewId, workspaceId },
      include: {
        revisionRequests: {
          include: {
            block: true,
          },
        },
        contentAsset: {
          include: {
            campaign: { select: { id: true, title: true } },
            brand: { select: { id: true, name: true } },
          },
        },
        contentVersion: {
          include: {
            blocks: { orderBy: { orderIndex: "asc" } },
          },
        },
      },
    });

    if (!review) {
      throw new Error(`EditorialReview ${reviewId} not found in workspace`);
    }

    return review;
  }

  /**
   * Lists editorial reviews with optional filters.
   */
  static async listReviews(
    workspaceId: string,
    filters?: {
      assetId?: string;
      campaignId?: string;
      status?: string;
      reviewerType?: string;
    }
  ) {
    const { assetId, campaignId, status, reviewerType } = filters || {};

    return await prisma.editorialReview.findMany({
      where: {
        workspaceId,
        ...(assetId ? { contentAssetId: assetId } : {}),
        ...(campaignId ? { campaignId } : {}),
        ...(status && status !== "ALL" ? { status } : {}),
        ...(reviewerType && reviewerType !== "ALL" ? { reviewerType } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        contentAsset: { select: { id: true, title: true, type: true, status: true } },
        contentVersion: { select: { id: true, versionNumber: true, changeSummary: true } },
        revisionRequests: { select: { id: true, status: true, severity: true } },
      },
    });
  }
}
