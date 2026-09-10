import crypto from "crypto";
import prisma from "../db/prisma";
import { decryptToken, sanitizeAccountDTO } from "../security/encryption";
import { PublisherRegistry, PublishBlock, PublishPayload } from "../publishing/publisher-adapter";
import { AuditService } from "./audit-service";
import { AuthorizationGuard, AuthorizationError } from "../auth/authorization-guard";

export interface PublishAssetInput {
  workspaceId: string;
  brandId: string;
  assetId: string;
  versionId: string;
  connectedAccountId: string;
  platform: string;
  userId: string;
  isAI?: boolean;
}

export class PublishingService {
  /**
   * Generates a deterministic SHA-256 idempotency key to prevent duplicate post delivery.
   */
  static generatePublishingIdempotencyKey(
    workspaceId: string,
    assetId: string,
    versionId: string,
    platform: string,
    connectedAccountId: string
  ): string {
    return crypto
      .createHash("sha256")
      .update(`${workspaceId}:${assetId}:${versionId}:${platform.toUpperCase()}:${connectedAccountId}`)
      .digest("hex");
  }

  /**
   * Publishes an approved ContentVersion of a ContentAsset to an external platform.
   * 
   * Strict invariants enforced:
   * 1. Hard Human Gate: AI agents and system identities are strictly blocked (403).
   * 2. Multi-tenant isolation: Asset, Brand, and Account must belong to session workspace.
   * 3. Approval Gate: Asset must be in APPROVED status.
   * 4. Version Binding: currentVersionId must equal versionId, and have active HUMAN_APPROVED record.
   * 5. Ingestion & Delivery Idempotency: Duplicate calls return existing published record without re-dispatching.
   * 6. Zero Token Exposure: Decrypted in memory at dispatch time only; never logged or serialized.
   */
  static async publishAsset(input: PublishAssetInput) {
    const { workspaceId, brandId, assetId, versionId, connectedAccountId, platform, userId, isAI } = input;

    // 1. Hard Human Gate Check
    if (isAI || !userId || userId === "AI_EDITOR" || userId.startsWith("AI_") || userId === "system") {
      await AuthorizationGuard.logSecurityViolation(
        workspaceId,
        userId,
        "AI_PUBLISH_ATTEMPT_BLOCKED",
        { assetId, versionId, platform }
      );
      throw new AuthorizationError(
        "AI agents and automated systems are strictly prohibited from publishing. Only authenticated human operators can trigger publication.",
        403,
        "AI_PUBLISHING_PROHIBITED"
      );
    }

    // 2. Multi-Tenant Account & Asset Verification
    const account = await prisma.connectedAccount.findUnique({
      where: { id: connectedAccountId },
    });

    if (!account || account.workspaceId !== workspaceId || account.brandId !== brandId) {
      await AuthorizationGuard.logSecurityViolation(
        workspaceId,
        userId,
        "CROSS_TENANT_PUBLISH_BLOCKED",
        { attemptedAccountId: connectedAccountId, assetId }
      );
      throw new AuthorizationError("Connected account not found in workspace/brand", 404, "NOT_FOUND");
    }

    if (account.status !== "ACTIVE") {
      throw new Error(`Connected account is ${account.status}. Re-authorization is required before publishing.`);
    }

    const asset = await prisma.contentAsset.findUnique({
      where: { id: assetId },
      include: {
        brand: true,
        campaign: true,
        versions: {
          where: { id: versionId },
          include: {
            blocks: { orderBy: { orderIndex: "asc" } },
          },
        },
      },
    });

    if (!asset || asset.workspaceId !== workspaceId) {
      throw new AuthorizationError("Content asset not found in workspace", 404, "NOT_FOUND");
    }

    // 3. Status Gate: Must be in APPROVED status (or PUBLISHED for idempotent query)
    if (asset.status !== "APPROVED" && asset.status !== "PUBLISHED") {
      throw new Error(
        `Asset cannot be published while in "${asset.status}" status. It must be in "APPROVED" status.`
      );
    }

    // 4. Exact Version Binding Check
    if (asset.currentVersionId !== versionId) {
      throw new Error(
        `Version mismatch: cannot publish version ${versionId}. Current active version of asset is ${asset.currentVersionId}. Subsequent edits invalidate previous approvals.`
      );
    }

    const targetVersion = asset.versions[0];
    if (!targetVersion) {
      throw new Error(`ContentVersion ${versionId} does not belong to asset ${assetId}`);
    }

    // Verify active human approval record exists for this version
    const activeApproval = await prisma.approvalRecord.findFirst({
      where: {
        contentAssetId: asset.id,
        contentVersionId: targetVersion.id,
        action: "HUMAN_APPROVED",
      },
      orderBy: { createdAt: "desc" },
    });

    if (!activeApproval) {
      throw new Error("Publishing rejected: No human approval record found for this content version.");
    }

    // Verify approval was not revoked
    const revocation = await prisma.approvalRecord.findFirst({
      where: {
        contentAssetId: asset.id,
        contentVersionId: targetVersion.id,
        action: "APPROVAL_REVOKED",
        createdAt: { gt: activeApproval.createdAt },
      },
    });

    if (revocation) {
      throw new Error("Publishing rejected: Approval for this version was revoked.");
    }

    // 5. Deterministic Idempotency Key Check
    const idempotencyKey = this.generatePublishingIdempotencyKey(
      workspaceId,
      assetId,
      versionId,
      platform,
      connectedAccountId
    );

    const existingRecord = await prisma.publishingRecord.findUnique({
      where: { idempotencyKey },
    });

    if (existingRecord) {
      if (existingRecord.status === "PUBLISHED") {
        return {
          isDuplicate: true,
          publishingRecord: existingRecord,
          message: "Asset has already been published to this channel with this version. Duplicate publication prevented.",
        };
      }
      if (existingRecord.status === "PUBLISHING") {
        throw new Error("Concurrent publish operation already in progress for this asset version.");
      }
    }

    // 6. Build Publication Payload
    const publishBlocks: PublishBlock[] = targetVersion.blocks.map((b) => ({
      blockType: b.blockType,
      orderIndex: b.orderIndex,
      title: b.title,
      content: b.content,
      example: b.example,
      transition: b.transition,
    }));

    const payload: PublishPayload = {
      title: asset.title,
      format: asset.type,
      versionNumber: targetVersion.versionNumber,
      blocks: publishBlocks,
      description: targetVersion.changeSummary,
      tags: ["MediaOS", asset.type],
      metadata: {
        campaignId: asset.campaignId,
        strategyId: asset.strategyId,
      },
    };

    const payloadSnapshotJson = JSON.stringify(payload);

    // 7. Acquire Atomic Publishing Lock
    const publishingRecord = await prisma.publishingRecord.upsert({
      where: { idempotencyKey },
      create: {
        workspaceId,
        brandId,
        campaignId: asset.campaignId,
        contentAssetId: asset.id,
        contentVersionId: targetVersion.id,
        connectedAccountId: account.id,
        platform: platform.toUpperCase(),
        status: "PUBLISHING",
        publishedByUserId: userId,
        idempotencyKey,
        publishAttempts: 1,
        payloadSnapshotJson,
      },
      update: {
        status: "PUBLISHING",
        publishAttempts: { increment: 1 },
        publishedByUserId: userId,
        lastError: null,
      },
    });

    await prisma.contentAsset.update({
      where: { id: asset.id },
      data: { status: "PUBLISHING" },
    });

    // 8. Decrypt Token Strictly in Memory & Dispatch
    try {
      const decryptedToken = decryptToken(account.encryptedAccessToken);
      const adapter = PublisherRegistry.getAdapter(platform);

      const result = await adapter.publish(payload, decryptedToken, {
        accountId: account.accountId,
        accountName: account.accountName,
      });

      // 9. Atomic Finalization on Success
      const completedRecord = await prisma.$transaction(async (tx) => {
        const updatedRecord = await tx.publishingRecord.update({
          where: { id: publishingRecord.id },
          data: {
            status: "PUBLISHED",
            externalPostId: result.externalPostId,
            externalPostUrl: result.externalPostUrl,
            publishedAt: result.publishedAt,
          },
        });

        await tx.contentAsset.update({
          where: { id: asset.id },
          data: { status: "PUBLISHED" },
        });

        await tx.auditLog.create({
          data: {
            workspaceId,
            userId,
            action: "CONTENT_PUBLISHED",
            entityType: "PublishingRecord",
            entityId: updatedRecord.id,
            detailsJson: JSON.stringify({
              platform: result.platform,
              externalPostId: result.externalPostId,
              externalPostUrl: result.externalPostUrl,
              assetId: asset.id,
              versionId: targetVersion.id,
              channelName: account.accountName,
            }),
          },
        });

        return updatedRecord;
      });

      return {
        isDuplicate: false,
        publishingRecord: completedRecord,
        publishResult: result,
      };
    } catch (publishErr) {
      // 10. Failure Handling: Revert asset status and record error
      const errorMessage = publishErr instanceof Error ? publishErr.message : "Unknown publishing error";

      await prisma.$transaction(async (tx) => {
        await tx.publishingRecord.update({
          where: { id: publishingRecord.id },
          data: {
            status: "FAILED",
            lastError: errorMessage,
          },
        });

        // Revert asset back to APPROVED so operator can inspect and retry
        await tx.contentAsset.update({
          where: { id: asset.id },
          data: { status: "APPROVED" },
        });

        await tx.auditLog.create({
          data: {
            workspaceId,
            userId,
            action: "CONTENT_PUBLISH_FAILED",
            entityType: "PublishingRecord",
            entityId: publishingRecord.id,
            detailsJson: JSON.stringify({
              platform,
              assetId: asset.id,
              versionId: targetVersion.id,
              error: errorMessage,
            }),
          },
        });
      });

      throw new Error(`Publishing to ${platform} failed: ${errorMessage}`);
    }
  }

  /**
   * Revokes a connected account, destroying tokens and blocking subsequent publish attempts.
   */
  static async revokeConnectedAccount(input: {
    workspaceId: string;
    brandId: string;
    accountId: string;
    userId: string;
  }) {
    const { workspaceId, brandId, accountId, userId } = input;

    const account = await prisma.connectedAccount.findUnique({
      where: { id: accountId },
    });

    if (!account || account.workspaceId !== workspaceId || account.brandId !== brandId) {
      throw new AuthorizationError("Connected account not found in workspace/brand", 404, "NOT_FOUND");
    }

    const updated = await prisma.connectedAccount.update({
      where: { id: accountId },
      data: {
        status: "REVOKED",
        encryptedAccessToken: "REVOKED",
        encryptedRefreshToken: null,
      },
    });

    await AuditService.log({
      workspaceId,
      userId,
      action: "OAUTH_ACCOUNT_REVOKED",
      entityType: "ConnectedAccount",
      entityId: accountId,
      details: {
        platform: account.platform,
        accountName: account.accountName,
        revokedBy: userId,
      },
    });

    return sanitizeAccountDTO(updated);
  }

  /**
   * Returns list of connected accounts for a brand, strictly sanitizing encrypted tokens.
   */
  static async listConnectedAccounts(workspaceId: string, brandId: string) {
    const accounts = await prisma.connectedAccount.findMany({
      where: { workspaceId, brandId },
      orderBy: { createdAt: "desc" },
    });

    return accounts.map((acc) => sanitizeAccountDTO(acc));
  }

  /**
   * Lists publishing history for a specific content asset.
   */
  static async listPublishingHistory(assetId: string, workspaceId: string) {
    const asset = await prisma.contentAsset.findUnique({
      where: { id: assetId },
      select: { workspaceId: true },
    });

    if (!asset || asset.workspaceId !== workspaceId) {
      throw new AuthorizationError("Content asset not found in workspace", 404, "NOT_FOUND");
    }

    return await prisma.publishingRecord.findMany({
      where: { contentAssetId: assetId },
      orderBy: { createdAt: "desc" },
      include: {
        connectedAccount: {
          select: {
            id: true,
            platform: true,
            accountName: true,
            accountId: true,
          },
        },
        contentVersion: {
          select: {
            id: true,
            versionNumber: true,
            changeSummary: true,
          },
        },
        publishedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }
}
