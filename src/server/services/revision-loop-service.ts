import prisma from "../db/prisma";
import { WriterService } from "./writer-service";
import { EditorialReviewerService } from "./editorial-reviewer-service";

export interface ExecuteRevisionCycleInput {
  workspaceId: string;
  assetId: string;
  userId?: string;
  maxCycles?: number;
  customInstructions?: string;
}

export class RevisionLoopService {
  /**
   * Orchestrates the bounded revision loop:
   * ContentVersion -> EditorialReview -> RevisionRequests -> Writer -> NEW ContentVersion -> Review
   * Strictly bounded to maxCycles (default 3) before flagging REQUIRES_HUMAN_INTERVENTION.
   */
  static async executeRevisionCycle(input: ExecuteRevisionCycleInput) {
    const {
      workspaceId,
      assetId,
      userId = "AI_EDITOR",
      maxCycles = 3,
      customInstructions,
    } = input;

    const asset = await prisma.contentAsset.findUnique({
      where: { id: assetId },
      include: {
        campaign: true,
        brand: true,
      },
    });

    if (!asset || asset.workspaceId !== workspaceId) {
      throw new Error(`ContentAsset ${assetId} not found in workspace`);
    }

    // Count previous revision requests / reviews that required revision
    const pastRejectionReviews = await prisma.editorialReview.findMany({
      where: {
        contentAssetId: assetId,
        status: "REVISION_REQUIRED",
      },
      orderBy: { createdAt: "desc" },
    });

    const cycleCount = pastRejectionReviews.length;

    // Check ceiling: if cycle count exceeds maxCycles, halt and require human intervention
    if (cycleCount >= maxCycles) {
      const updatedAsset = await prisma.contentAsset.update({
        where: { id: asset.id },
        data: { status: "REQUIRES_HUMAN_INTERVENTION" },
      });

      await prisma.approvalRecord.create({
        data: {
          workspaceId,
          brandId: asset.brandId,
          campaignId: asset.campaignId,
          contentAssetId: asset.id,
          contentVersionId: asset.currentVersionId || "",
          action: "REVISION_REQUESTED",
          comment: `Bounded revision loop ceiling hit (${cycleCount}/${maxCycles} attempts). Halting automated loops. Human intervention required.`,
        },
      });

      await prisma.auditLog.create({
        data: {
          workspaceId,
          action: "REVISION_LOOP_EXHAUSTED",
          entityType: "ContentAsset",
          entityId: asset.id,
          detailsJson: JSON.stringify({
            attempts: cycleCount,
            maxCycles,
            status: "REQUIRES_HUMAN_INTERVENTION",
          }),
        },
      });

      return {
        success: false,
        requiresHumanIntervention: true,
        status: "REQUIRES_HUMAN_INTERVENTION",
        cycleCount,
        maxCycles,
        message: `Maximum automated revision cycles (${maxCycles}) reached without passing editorial criteria. Asset flagged for human intervention.`,
        asset: updatedAsset,
      };
    }

    // Fetch open revision requests from latest review
    const latestReview = pastRejectionReviews[0] || null;
    let openRequests: Array<{ id: string; instruction: string }> = [];

    if (latestReview) {
      openRequests = await prisma.revisionRequest.findMany({
        where: {
          reviewId: latestReview.id,
          status: "OPEN",
        },
      });
    }

    // Synthesize instructions
    const instructionParts: string[] = [];
    if (openRequests.length > 0) {
      instructionParts.push(...openRequests.map((r) => r.instruction));
    }
    if (customInstructions) {
      instructionParts.push(customInstructions);
    }

    const compiledInstructions = instructionParts.join("\n- ") || "Address editorial review feedback and fix evidence or brand discrepancies.";

    // Mark current open requests as IN_PROGRESS
    if (openRequests.length > 0) {
      await prisma.revisionRequest.updateMany({
        where: { id: { in: openRequests.map((r) => r.id) } },
        data: { status: "IN_PROGRESS" },
      });
    }

    // Generate a NEW ContentVersion via WriterService (non-destructive)
    const newVersion = await WriterService.generateContent({
      workspaceId,
      assetId,
      mode: "REGENERATE",
      instructions: `REVISION DIRECTIVES (Cycle ${cycleCount + 1}/${maxCycles}):\n- ${compiledInstructions}`,
      userId,
    });

    if (!newVersion) {
      throw new Error(`Failed to generate new revision for asset ${assetId}`);
    }

    // Mark previous requests as RESOLVED
    if (openRequests.length > 0) {
      await prisma.revisionRequest.updateMany({
        where: { id: { in: openRequests.map((r) => r.id) } },
        data: { status: "RESOLVED", resolvedAt: new Date() },
      });
    }

    // Run new Editorial Review on the newly produced version
    const newReview = await EditorialReviewerService.runReview({
      workspaceId,
      assetId,
      versionId: newVersion.id,
      reviewerType: "AI_EDITOR",
    });

    return {
      success: true,
      requiresHumanIntervention: false,
      cycleCount,
      maxCycles,
      newVersion,
      review: newReview,
      status: newReview.status,
    };
  }
}
