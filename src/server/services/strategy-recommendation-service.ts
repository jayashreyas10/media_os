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
    workspaceId: string,
    input: ReviewRecommendationInput
  ) {
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
}
