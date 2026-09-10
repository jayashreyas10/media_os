import prisma from "../db/prisma";

export const CONTENT_STATUSES = [
  "DRAFT",
  "GENERATED",
  "EDITING",
  "READY_FOR_REVIEW",
  "AI_REVIEW",
  "REVISION_REQUIRED",
  "REVIEW_PASSED",
  "REQUIRES_HUMAN_INTERVENTION",
  "APPROVED",
  "PUBLISHING",
  "PUBLISHED",
  "ARCHIVED",
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const VALID_STATUS_TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  DRAFT: ["GENERATED", "EDITING", "ARCHIVED"],
  GENERATED: ["EDITING", "READY_FOR_REVIEW", "AI_REVIEW", "ARCHIVED"],
  EDITING: ["READY_FOR_REVIEW", "AI_REVIEW", "ARCHIVED"],
  READY_FOR_REVIEW: ["AI_REVIEW", "APPROVED", "EDITING", "REVISION_REQUIRED", "ARCHIVED"],
  AI_REVIEW: ["REVIEW_PASSED", "REVISION_REQUIRED", "REQUIRES_HUMAN_INTERVENTION", "EDITING", "ARCHIVED"],
  REVISION_REQUIRED: ["EDITING", "AI_REVIEW", "REQUIRES_HUMAN_INTERVENTION", "ARCHIVED"],
  REVIEW_PASSED: ["APPROVED", "REVISION_REQUIRED", "EDITING", "READY_FOR_REVIEW", "ARCHIVED"],
  REQUIRES_HUMAN_INTERVENTION: ["EDITING", "READY_FOR_REVIEW", "AI_REVIEW", "ARCHIVED"],
  APPROVED: ["READY_FOR_REVIEW", "EDITING", "ARCHIVED", "PUBLISHING", "PUBLISHED"], // Phase 7 external publishing
  PUBLISHING: ["PUBLISHED", "APPROVED"],
  PUBLISHED: ["ARCHIVED", "EDITING"],
  ARCHIVED: ["DRAFT"],
};

export interface CreateAssetInput {
  workspaceId: string;
  brandId?: string;
  campaignId: string;
  strategyId?: string;
  type: string; // YOUTUBE_LONG_FORM, YOUTUBE_SHORT, NEWSLETTER, X_THREAD, LINKEDIN_POST, GENERIC_SOCIAL
  title: string;
  createdBy?: string;
}

export class ContentStudioService {
  /**
   * Create a new content asset in DRAFT status.
   */
  static async createAsset(data: CreateAssetInput) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: data.campaignId },
      include: { brand: true, strategy: true },
    });

    if (!campaign || campaign.brand.workspaceId !== data.workspaceId) {
      throw new Error(`Campaign ${data.campaignId} not found in workspace`);
    }

    const brandId = data.brandId || campaign.brandId;
    const strategyId = data.strategyId || campaign.strategy?.id || null;

    const asset = await prisma.contentAsset.create({
      data: {
        workspaceId: data.workspaceId,
        brandId,
        campaignId: data.campaignId,
        strategyId,
        type: data.type,
        title: data.title,
        status: "DRAFT",
        createdBy: data.createdBy || "Operator",
      },
      include: {
        campaign: { select: { id: true, title: true, stage: true } },
        strategy: { select: { id: true, primaryHeadline: true, thesis: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        workspaceId: data.workspaceId,
        action: "CONTENT_ASSET_CREATED",
        entityType: "ContentAsset",
        entityId: asset.id,
        detailsJson: JSON.stringify({ type: asset.type, title: asset.title }),
      },
    });

    return asset;
  }

  /**
   * List assets with filtering.
   */
  static async listAssets(
    workspaceId: string,
    filters?: {
      campaignId?: string;
      type?: string;
      status?: string;
      search?: string;
    }
  ) {
    const { campaignId, type, status, search } = filters || {};

    return await prisma.contentAsset.findMany({
      where: {
        workspaceId,
        ...(campaignId ? { campaignId } : {}),
        ...(type && type !== "ALL" ? { type } : {}),
        ...(status && status !== "ALL" ? { status } : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search } },
                { type: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
      include: {
        campaign: { select: { id: true, title: true, stage: true } },
        strategy: { select: { id: true, primaryHeadline: true } },
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          select: {
            id: true,
            versionNumber: true,
            changeSummary: true,
            sourceType: true,
            createdAt: true,
          },
        },
      },
    });
  }

  /**
   * Retrieve asset by ID with its current version, blocks, and claim references.
   */
  static async getAsset(id: string, workspaceId: string) {
    const asset = await prisma.contentAsset.findFirst({
      where: { id, workspaceId },
      include: {
        campaign: {
          include: {
            brand: true,
            strategy: true,
            claims: {
              include: {
                primarySource: true,
                evidence: true,
              },
            },
          },
        },
        strategy: true,
        versions: {
          orderBy: { versionNumber: "desc" },
          include: {
            blocks: {
              orderBy: { orderIndex: "asc" },
              include: {
                claimReferences: {
                  include: {
                    claim: {
                      include: {
                        primarySource: true,
                        evidence: true,
                      },
                    },
                  },
                },
              },
            },
            claimReferences: {
              include: {
                claim: {
                  include: {
                    primarySource: true,
                    evidence: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!asset) {
      throw new Error(`ContentAsset ${id} not found in workspace`);
    }

    return asset;
  }

  /**
   * Enforces valid lifecycle status transitions.
   * Ensures generated content cannot automatically become APPROVED.
   * Prohibits external publishing transitions in Phase 4.
   */
  static async updateAssetStatus(
    id: string,
    newStatus: string,
    workspaceId: string,
    userId?: string
  ) {
    const asset = await prisma.contentAsset.findFirst({
      where: { id, workspaceId },
    });

    if (!asset) {
      throw new Error(`ContentAsset ${id} not found in workspace`);
    }

    const currentStatus = asset.status as ContentStatus;
    const targetStatus = newStatus as ContentStatus;

    if (newStatus === "PUBLISHED") {
      throw new Error("Publishing is prohibited. External publishing is restricted to Phase 7.");
    }

    if (!CONTENT_STATUSES.includes(targetStatus)) {
      throw new Error(`Invalid content status: "${newStatus}"`);
    }

    const allowed = VALID_STATUS_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(targetStatus)) {
      throw new Error(
        `Invalid status transition from "${currentStatus}" to "${targetStatus}". Allowed transitions: [${allowed.join(
          ", "
        )}]`
      );
    }

    const updated = await prisma.contentAsset.update({
      where: { id },
      data: { status: targetStatus },
      include: {
        campaign: { select: { id: true, title: true } },
      },
    });

    let validUserId: string | null = null;
    if (userId) {
      const user = await prisma.user.findFirst({
        where: {
          OR: [{ id: userId }, { email: userId }],
        },
        select: { id: true },
      });
      validUserId = user?.id || null;
    }

    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: validUserId,
        action: "CONTENT_STATUS_TRANSITION",
        entityType: "ContentAsset",
        entityId: id,
        detailsJson: JSON.stringify({
          fromStatus: currentStatus,
          toStatus: targetStatus,
          actor: userId,
        }),
      },
    });

    return updated;
  }

  /**
   * Duplicates an asset and its current active version.
   */
  static async duplicateAsset(id: string, workspaceId: string, userId?: string) {
    const original = await this.getAsset(id, workspaceId);

    const duplicated = await prisma.contentAsset.create({
      data: {
        workspaceId,
        brandId: original.brandId,
        campaignId: original.campaignId,
        strategyId: original.strategyId,
        type: original.type,
        title: `${original.title} (Copy)`,
        status: "DRAFT",
        createdBy: userId || "Operator",
      },
    });

    // Copy latest version if exists
    const latestVersion = original.versions[0];
    if (latestVersion) {
      const newVersion = await prisma.contentVersion.create({
        data: {
          assetId: duplicated.id,
          versionNumber: 1,
          changeSummary: `Duplicated from "${original.title}" v${latestVersion.versionNumber}`,
          sourceType: "DUPLICATED",
          author: userId || "Operator",
          contentSnapshot: latestVersion.contentSnapshot,
        },
      });

      // Copy blocks
      for (const b of latestVersion.blocks) {
        const newBlock = await prisma.contentBlock.create({
          data: {
            versionId: newVersion.id,
            blockType: b.blockType,
            orderIndex: b.orderIndex,
            title: b.title,
            content: b.content,
            example: b.example,
            transition: b.transition,
            statementType: b.statementType,
            unsupportedFlag: b.unsupportedFlag,
          },
        });

        // Copy claim references
        for (const cr of b.claimReferences) {
          await prisma.claimReference.create({
            data: {
              versionId: newVersion.id,
              blockId: newBlock.id,
              claimId: cr.claimId,
              citationText: cr.citationText,
              isGrounded: cr.isGrounded,
            },
          });
        }
      }

      return await prisma.contentAsset.update({
        where: { id: duplicated.id },
        data: { currentVersionId: newVersion.id },
      });
    }

    return duplicated;
  }

  /**
   * Archive an asset.
   */
  static async archiveAsset(id: string, workspaceId: string) {
    return await this.updateAssetStatus(id, "ARCHIVED", workspaceId);
  }

  /**
   * List version history for an asset.
   */
  static async listVersions(assetId: string, workspaceId: string) {
    const asset = await prisma.contentAsset.findFirst({
      where: { id: assetId, workspaceId },
      select: { id: true },
    });

    if (!asset) throw new Error(`Asset ${assetId} not found in workspace`);

    return await prisma.contentVersion.findMany({
      where: { assetId },
      orderBy: { versionNumber: "desc" },
      include: {
        blocks: {
          orderBy: { orderIndex: "asc" },
        },
        claimReferences: {
          include: {
            claim: {
              select: {
                id: true,
                claimText: true,
                verificationStatus: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Get a single version by ID.
   */
  static async getVersion(versionId: string, workspaceId: string) {
    const version = await prisma.contentVersion.findUnique({
      where: { id: versionId },
      include: {
        asset: true,
        blocks: {
          orderBy: { orderIndex: "asc" },
          include: {
            claimReferences: {
              include: {
                claim: {
                  include: {
                    primarySource: true,
                    evidence: true,
                  },
                },
              },
            },
          },
        },
        claimReferences: {
          include: {
            claim: {
              include: {
                primarySource: true,
                evidence: true,
              },
            },
          },
        },
      },
    });

    if (!version || version.asset.workspaceId !== workspaceId) {
      throw new Error(`Version ${versionId} not found in workspace`);
    }

    return version;
  }
}

