import prisma from "../db/prisma";
import { assertValidTransition, CampaignStage } from "../domain/campaign-state-machine";

export class CampaignService {
  static async createCampaign(data: {
    brandId: string;
    title: string;
    brief?: string;
    priority?: string;
    targetDate?: Date;
    isDemo?: boolean;
    userId?: string;
  }) {
    const slug = `${data.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;

    const campaign = await prisma.campaign.create({
      data: {
        brandId: data.brandId,
        title: data.title,
        slug,
        stage: "DISCOVERY",
        priority: data.priority || "MEDIUM",
        brief: data.brief,
        targetDate: data.targetDate,
        isDemo: data.isDemo || false,
      },
      include: {
        brand: true,
      },
    });

    // Record initial stage history
    await prisma.campaignStageHistory.create({
      data: {
        campaignId: campaign.id,
        fromStage: "NONE",
        toStage: "DISCOVERY",
        reason: "Initial campaign creation",
        transitionedById: data.userId,
      },
    });

    // Record audit log
    await prisma.auditLog.create({
      data: {
        workspaceId: campaign.brand.workspaceId,
        userId: data.userId,
        action: "CAMPAIGN_CREATED",
        entityType: "Campaign",
        entityId: campaign.id,
        detailsJson: JSON.stringify({ title: campaign.title, stage: campaign.stage }),
      },
    });

    return campaign;
  }

  static async listCampaigns(brandId: string, workspaceId?: string) {
    if (workspaceId) {
      const brand = await prisma.brand.findUnique({
        where: { id: brandId },
        select: { workspaceId: true },
      });
      if (!brand || brand.workspaceId !== workspaceId) {
        return [];
      }
    }

    return await prisma.campaign.findMany({
      where: { brandId },
      orderBy: { updatedAt: "desc" },
      include: {
        tasks: {
          select: {
            id: true,
            taskType: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });
  }

  static async getCampaign(campaignId: string, workspaceId?: string) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        brand: {
          include: {
            workspace: true,
          },
        },
        stageHistory: {
          orderBy: { createdAt: "desc" },
        },
        claims: {
          orderBy: { createdAt: "desc" },
          include: {
            primarySource: true,
            evidence: true,
          },
        },
        tasks: {
          orderBy: { createdAt: "desc" },
          include: {
            attempts: true,
            agentRuns: true,
          },
        },
      },
    });

    if (!campaign) return null;

    if (workspaceId && campaign.brand.workspaceId !== workspaceId) {
      return null;
    }

    return campaign;
  }

  static async transitionStage(
    campaignId: string,
    targetStage: CampaignStage,
    reasonOrOptions?: string | { reason?: string; userId?: string; workspaceId?: string },
    maybeUserId?: string,
    maybeWorkspaceId?: string
  ) {
    let reason: string | undefined;
    let userId: string | undefined = maybeUserId;
    let workspaceId: string | undefined = maybeWorkspaceId;

    if (typeof reasonOrOptions === "object" && reasonOrOptions !== null) {
      reason = reasonOrOptions.reason;
      userId = reasonOrOptions.userId || userId;
      workspaceId = reasonOrOptions.workspaceId || workspaceId;
    } else {
      reason = reasonOrOptions;
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { brand: true },
    });

    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    if (workspaceId && campaign.brand.workspaceId !== workspaceId) {
      throw new Error(`Campaign ${campaignId} not found in workspace`);
    }

    const currentStage = campaign.stage as CampaignStage;

    // Strict state machine validation: throws InvalidStageTransitionError if illegal
    assertValidTransition(currentStage, targetStage);

    // Update stage
    const updated = await prisma.campaign.update({
      where: { id: campaignId },
      data: { stage: targetStage },
    });

    // Record stage history
    await prisma.campaignStageHistory.create({
      data: {
        campaignId,
        fromStage: currentStage,
        toStage: targetStage,
        reason: reason || `Transitioned from ${currentStage} to ${targetStage}`,
        transitionedById: userId,
      },
    });

    // Record audit log
    await prisma.auditLog.create({
      data: {
        workspaceId: campaign.brand.workspaceId,
        userId,
        action: "CAMPAIGN_STAGE_TRANSITION",
        entityType: "Campaign",
        entityId: campaign.id,
        detailsJson: JSON.stringify({ from: currentStage, to: targetStage, reason }),
      },
    });

    return updated;
  }
}
