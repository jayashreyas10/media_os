import prisma from "../db/prisma";

export interface ApproveVersionInput {
  workspaceId: string;
  assetId: string;
  versionId: string;
  userId: string;
  comment: string;
  isAI?: boolean;
}

export interface RejectVersionInput {
  workspaceId: string;
  assetId: string;
  versionId: string;
  userId: string;
  reason: string;
  instructions?: string[];
}

export interface RevokeApprovalInput {
  workspaceId: string;
  assetId: string;
  versionId: string;
  userId: string;
  reason: string;
}

export class ApprovalService {
  /**
   * Approves a specific ContentVersion of a ContentAsset.
   * STRICT ENFORCEMENT: Only authenticated human operators can approve.
   * AI agents are blocked at the server level.
   */
  static async approveVersion(input: ApproveVersionInput) {
    const { workspaceId, assetId, versionId, userId, comment, isAI } = input;

    // Hard server-side barrier against AI approval
    if (isAI || !userId || userId === "AI_EDITOR" || userId.startsWith("AI_") || userId === "system") {
      throw new Error(
        "AI agents are strictly prohibited from granting approval. Only authenticated human operators may approve content assets."
      );
    }

    if (!comment || comment.trim().length === 0) {
      throw new Error("A comment is mandatory when granting human approval.");
    }

    // Resolve user in database
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ id: userId }, { email: userId }],
      },
    });

    if (!user) {
      throw new Error(`Authenticated user not found: ${userId}`);
    }

    // Verify workspace membership
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: user.id,
        },
      },
    });

    // Also check if workspace owner
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    if (!membership && workspace.ownerId !== user.id) {
      throw new Error("User does not have permission to approve assets in this workspace.");
    }

    return await prisma.$transaction(async (tx) => {
      const asset = await tx.contentAsset.findUnique({
        where: { id: assetId },
        include: {
          brand: true,
          campaign: true,
        },
      });

      if (!asset || asset.workspaceId !== workspaceId) {
        throw new Error(`ContentAsset ${assetId} not found in workspace`);
      }

      // State machine check: cannot approve directly from DRAFT, EDITING, or REVISION_REQUIRED
      if (asset.status !== "READY_FOR_REVIEW" && asset.status !== "REVIEW_PASSED") {
        throw new Error(
          `Asset cannot be approved while in "${asset.status}" status. It must be in "READY_FOR_REVIEW" or "REVIEW_PASSED".`
        );
      }

      // Version match check: approval is bound to the exact active version
      if (asset.currentVersionId !== versionId) {
        throw new Error(
          `Cannot approve version ${versionId}: current active version of asset is ${asset.currentVersionId}.`
        );
      }

      // Verify version exists
      const version = await tx.contentVersion.findUnique({
        where: { id: versionId },
      });

      if (!version || version.assetId !== asset.id) {
        throw new Error(`ContentVersion ${versionId} does not belong to asset ${assetId}`);
      }

      // Atomic status transition lock: prevents two concurrent requests from double-approving
      const lockResult = await tx.contentAsset.updateMany({
        where: {
          id: asset.id,
          currentVersionId: versionId,
          status: { in: ["READY_FOR_REVIEW", "REVIEW_PASSED"] },
        },
        data: { status: "APPROVED" },
      });

      if (lockResult.count === 0) {
        throw new Error("Concurrent approval collision: asset state changed during approval attempt");
      }

      // Create immutable approval audit record
      const approvalRecord = await tx.approvalRecord.create({
        data: {
          workspaceId,
          brandId: asset.brandId,
          campaignId: asset.campaignId,
          contentAssetId: asset.id,
          contentVersionId: version.id,
          userId: user.id,
          action: "HUMAN_APPROVED",
          comment: comment.trim(),
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          contentVersion: { select: { id: true, versionNumber: true } },
        },
      });

      const updatedAsset = await tx.contentAsset.findUnique({
        where: { id: asset.id },
      });

      await tx.auditLog.create({
        data: {
          workspaceId,
          userId: user.id,
          action: "CONTENT_HUMAN_APPROVED",
          entityType: "ContentAsset",
          entityId: asset.id,
          detailsJson: JSON.stringify({
            versionId: version.id,
            versionNumber: version.versionNumber,
            approvedBy: user.email,
            comment: comment.trim(),
          }),
        },
      });

      return {
        approvalRecord,
        asset: updatedAsset!,
      };
    });
  }

  /**
   * Rejects an asset or requests human revision.
   */
  static async rejectVersion(input: RejectVersionInput) {
    const { workspaceId, assetId, versionId, userId, reason, instructions = [] } = input;

    if (!reason || reason.trim().length === 0) {
      throw new Error("A reason is mandatory when requesting human revisions or rejecting.");
    }

    const user = await prisma.user.findFirst({
      where: { OR: [{ id: userId }, { email: userId }] },
    });

    if (!user) {
      throw new Error(`Authenticated user not found: ${userId}`);
    }

    return await prisma.$transaction(async (tx) => {
      const asset = await tx.contentAsset.findUnique({
        where: { id: assetId },
      });

      if (!asset || asset.workspaceId !== workspaceId) {
        throw new Error(`ContentAsset ${assetId} not found in workspace`);
      }

      const version = await tx.contentVersion.findUnique({
        where: { id: versionId },
      });

      if (!version || version.assetId !== asset.id) {
        throw new Error(`ContentVersion ${versionId} does not belong to asset ${assetId}`);
      }

      // Create approval record for rejection
      const approvalRecord = await tx.approvalRecord.create({
        data: {
          workspaceId,
          brandId: asset.brandId,
          campaignId: asset.campaignId,
          contentAssetId: asset.id,
          contentVersionId: version.id,
          userId: user.id,
          action: "HUMAN_REJECTED",
          reason: reason.trim(),
          comment: instructions.join(" | ") || reason.trim(),
        },
      });

      // Create revision requests from human instructions
      if (instructions.length > 0) {
        const latestReview = await tx.editorialReview.findFirst({
          where: { contentVersionId: version.id },
          orderBy: { createdAt: "desc" },
        });

        if (latestReview) {
          await tx.revisionRequest.createMany({
            data: instructions.map((inst) => ({
              reviewId: latestReview.id,
              contentVersionId: version.id,
              category: "QUALITY",
              severity: "ERROR",
              instruction: inst,
              status: "OPEN",
            })),
          });
        }
      }

      // Update asset status
      const updatedAsset = await tx.contentAsset.update({
        where: { id: asset.id },
        data: { status: "REVISION_REQUIRED" },
      });

      await tx.auditLog.create({
        data: {
          workspaceId,
          userId: user.id,
          action: "CONTENT_HUMAN_REJECTED",
          entityType: "ContentAsset",
          entityId: asset.id,
          detailsJson: JSON.stringify({
            versionId: version.id,
            reason: reason.trim(),
          }),
        },
      });

      return {
        approvalRecord,
        asset: updatedAsset,
      };
    });
  }

  /**
   * Revokes an existing approval.
   * Does NOT delete or alter historical approval records.
   * Appends an APPROVAL_REVOKED record and sets status back to READY_FOR_REVIEW.
   */
  static async revokeApproval(input: RevokeApprovalInput) {
    const { workspaceId, assetId, versionId, userId, reason } = input;

    if (!reason || reason.trim().length === 0) {
      throw new Error("A reason is mandatory when revoking approval.");
    }

    const user = await prisma.user.findFirst({
      where: { OR: [{ id: userId }, { email: userId }] },
    });

    if (!user) {
      throw new Error(`Authenticated user not found: ${userId}`);
    }

    return await prisma.$transaction(async (tx) => {
      const asset = await tx.contentAsset.findUnique({
        where: { id: assetId },
      });

      if (!asset || asset.workspaceId !== workspaceId) {
        throw new Error(`ContentAsset ${assetId} not found in workspace`);
      }

      if (asset.status !== "APPROVED") {
        throw new Error(`Cannot revoke approval: asset is in "${asset.status}" status, not "APPROVED".`);
      }

      const version = await tx.contentVersion.findUnique({
        where: { id: versionId },
      });

      if (!version || version.assetId !== asset.id) {
        throw new Error(`ContentVersion ${versionId} does not belong to asset ${assetId}`);
      }

      // Atomic transition lock
      const lockResult = await tx.contentAsset.updateMany({
        where: { id: asset.id, status: "APPROVED" },
        data: { status: "READY_FOR_REVIEW" },
      });

      if (lockResult.count === 0) {
        throw new Error("Concurrent revocation collision: asset status changed during revocation attempt");
      }

      // Create APPROVAL_REVOKED record (preserving historical HUMAN_APPROVED record)
      const approvalRecord = await tx.approvalRecord.create({
        data: {
          workspaceId,
          brandId: asset.brandId,
          campaignId: asset.campaignId,
          contentAssetId: asset.id,
          contentVersionId: version.id,
          userId: user.id,
          action: "APPROVAL_REVOKED",
          reason: reason.trim(),
          comment: `Approval revoked: ${reason.trim()}`,
        },
      });

      const updatedAsset = await tx.contentAsset.findUnique({
        where: { id: asset.id },
      });

      await tx.auditLog.create({
        data: {
          workspaceId,
          userId: user.id,
          action: "CONTENT_APPROVAL_REVOKED",
          entityType: "ContentAsset",
          entityId: asset.id,
          detailsJson: JSON.stringify({
            versionId: version.id,
            revokedBy: user.email,
            reason: reason.trim(),
          }),
        },
      });

      return {
        approvalRecord,
        asset: updatedAsset!,
      };
    });
  }

  /**
   * Retrieves chronological approval and review history for an asset.
   */
  static async listApprovalHistory(assetId: string, workspaceId: string) {
    const asset = await prisma.contentAsset.findUnique({
      where: { id: assetId },
    });

    if (!asset || asset.workspaceId !== workspaceId) {
      throw new Error(`ContentAsset ${assetId} not found in workspace`);
    }

    return await prisma.approvalRecord.findMany({
      where: { contentAssetId: assetId },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        contentVersion: { select: { id: true, versionNumber: true, changeSummary: true } },
        review: { select: { id: true, verdict: true, overallScore: true, reviewerType: true } },
      },
    });
  }
}
