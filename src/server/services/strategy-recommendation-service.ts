import prisma from "../db/prisma";
import { AuditService } from "./audit-service";

export interface ReviewRecommendationInput {
  recommendationId: string;
  action: "ACCEPT" | "REJECT";
  reviewNotes?: string;
  userId?: string;
}

export class StrategyRecommendationService {
  /**
   * Human operator decision gate: ACCEPT or REJECT a strategy recommendation.
   * STRICT GOVERNANCE RULE:
   * AI may recommend. Only an authenticated human operator may accept or reject.
   * Accepting or rejecting NEVER silently modifies Brand Brain.
   */
  static async reviewRecommendation(
    workspaceIdOrInput: string | (ReviewRecommendationInput & { workspaceId: string }),
    inputOrUndefined?: ReviewRecommendationInput
  ) {
    let workspaceId: string;
    let input: ReviewRecommendationInput;
    if (typeof workspaceIdOrInput === "string") {
      workspaceId = workspaceIdOrInput;
      input = inputOrUndefined!;
    } else {
      workspaceId = workspaceIdOrInput.workspaceId;
      input = workspaceIdOrInput;
    }

    const recommendation = await prisma.strategyRecommendation.findUnique({
      where: { id: input.recommendationId },
      include: {
        brand: true,
        learning: true,
      },
    });

    if (
      !input.userId ||
      input.userId === "AI_EDITOR" ||
      input.userId.startsWith("AI_") ||
      input.userId === "system" ||
      input.userId === "anonymous"
    ) {
      throw new Error(
        "AI agents and system identities are strictly prohibited from reviewing strategy recommendations. A human operator is required."
      );
    }

    if (!recommendation || recommendation.workspaceId !== workspaceId) {
      throw new Error("Strategy recommendation not found in this workspace");
    }

    if (recommendation.status !== "PENDING") {
      throw new Error(
        `Recommendation has already been reviewed (current status: ${recommendation.status})`
      );
    }

    const newStatus = input.action === "ACCEPT" ? "ACCEPTED" : "REJECTED";
    const reviewedAt = new Date();

    const updated = await prisma.strategyRecommendation.update({
      where: { id: recommendation.id },
      data: {
        status: newStatus,
        reviewedBy: input.userId || null,
        reviewedAt,
        reviewNotes: input.reviewNotes || null,
      },
    });

    await AuditService.log({
      workspaceId,
      userId: input.userId || null,
      action:
        input.action === "ACCEPT"
          ? "STRATEGY_RECOMMENDATION_ACCEPTED"
          : "STRATEGY_RECOMMENDATION_REJECTED",
      entityType: "StrategyRecommendation",
      entityId: updated.id,
      details: {
        title: updated.title,
        actionType: updated.actionType,
        previousStatus: "PENDING",
        newStatus,
        reviewNotes: input.reviewNotes,
        learningId: updated.learningId,
      },
    });

    return updated;
  }

  /**
   * Returns all active/accepted recommendations for a brand to feed into future strategy.
   * Only returns recommendations with status = "ACCEPTED".
   * Rejected and pending recommendations are strictly excluded.
   */
  static async getActiveAcceptedRecommendations(
    workspaceId: string,
    brandId: string
  ) {
    return prisma.strategyRecommendation.findMany({
      where: {
        workspaceId,
        brandId,
        status: "ACCEPTED",
      },
      include: {
        learning: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Lists all recommendations for dashboard review with optional status filter.
   */
  static async listRecommendations(
    workspaceId: string,
    brandId?: string,
    status?: "PENDING" | "ACCEPTED" | "REJECTED" | "ALL"
  ) {
    const where: Record<string, unknown> = { workspaceId };
    if (brandId) where.brandId = brandId;
    if (status && status !== "ALL") where.status = status;

    return prisma.strategyRecommendation.findMany({
      where,
      include: {
        learning: true,
        reviewer: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Manually creates a strategy recommendation by human operator.
   * INVARIANT: Always starts in PENDING status; requires human operator decision gate.
   * Never silently mutates Brand Brain.
   */
  static async createManualRecommendation(
    workspaceId: string,
    data: {
      brandId: string;
      title: string;
      recommendation: string;
      actionType?: string;
      targetFormat?: string;
      targetPillar?: string;
      rationale?: string;
      learningId?: string;
    },
    userId?: string
  ) {
    if (!data.title || data.title.trim().length === 0) {
      throw new Error("Title is required");
    }
    if (!data.recommendation || data.recommendation.trim().length === 0) {
      throw new Error("Recommendation text is required");
    }

    const brand = await prisma.brand.findUnique({
      where: { id: data.brandId },
    });
    if (!brand || brand.workspaceId !== workspaceId) {
      throw new Error("Brand not found in authorized workspace");
    }

    let learningId = data.learningId;
    if (!learningId) {
      const anchorLearning = await prisma.learningRecord.create({
        data: {
          workspaceId,
          brandId: data.brandId,
          category: data.targetPillar ? "PILLAR" : "FORMAT",
          sentiment: "OPPORTUNITY",
          observation: `Operator strategic recommendation: ${data.title.trim()}`,
          hypothesis: data.rationale || "Direct operator strategy input",
          sampleSize: 1,
          confidenceScore: 100,
          statisticalSignificance: "ANECDOTAL",
          supportingMetricsJson: "{}",
          limitations: "Manual operator strategy guidance; unassisted by automated metrics.",
          dataSourcesJson: JSON.stringify(["MANUAL_OPERATOR"]),
          status: "ACTIVE",
        },
      });
      learningId = anchorLearning.id;
    }

    const created = await prisma.strategyRecommendation.create({
      data: {
        workspaceId,
        brandId: data.brandId,
        learningId,
        title: data.title.trim(),
        recommendation: data.recommendation.trim(),
        actionType: data.actionType || "ITERATE",
        targetFormat: data.targetFormat || null,
        targetPillar: data.targetPillar || null,
        status: "PENDING", // STRICT: Always starts PENDING
      },
    });

    await AuditService.log({
      workspaceId,
      userId: userId || null,
      action: "MANUAL_RECOMMENDATION_CREATED",
      entityType: "StrategyRecommendation",
      entityId: created.id,
      details: {
        title: created.title,
        actionType: created.actionType,
        status: "PENDING",
      },
    });

    return created;
  }
}
