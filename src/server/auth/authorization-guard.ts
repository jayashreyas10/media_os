import prisma from "../db/prisma";
import { AuditService } from "../services/audit-service";
import { RateLimiter, RateLimitCategory, RateLimitResult } from "../security/rate-limiter";

export class AuthorizationError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode: number = 403, code: string = "FORBIDDEN") {
    super(message);
    this.name = "AuthorizationError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class RateLimitError extends AuthorizationError {
  retryAfterSeconds: number;

  constructor(message: string = "Rate limit exceeded. Please try again later.", retryAfterSeconds: number = 60) {
    super(message, 429, "RATE_LIMIT_EXCEEDED");
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class NotFoundError extends AuthorizationError {
  constructor(resourceName: string, id: string) {
    // Return 404 to avoid resource enumeration across tenant boundaries
    super(`${resourceName} not found`, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export interface SessionContext {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
  workspace: {
    id: string;
    name: string;
    slug: string;
    ownerId: string;
  };
  brand?: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

export class AuthorizationGuard {
  /**
   * Enforces that the session user has access to the target workspace.
   */
  static async requireWorkspaceAccess(session: SessionContext, targetWorkspaceId: string) {
    if (!session || !session.workspace) {
      throw new AuthorizationError("Authentication required", 401, "UNAUTHORIZED");
    }

    if (session.workspace.id !== targetWorkspaceId) {
      await this.logSecurityViolation(
        session.workspace.id,
        session.user.id,
        "CROSS_WORKSPACE_ACCESS_BLOCKED",
        { attemptedWorkspaceId: targetWorkspaceId }
      );
      throw new AuthorizationError("Access to workspace denied", 403, "FORBIDDEN");
    }

    return session.workspace;
  }

  /**
   * Enforces that the brand belongs to the session's workspace.
   */
  static async requireBrandAccess(session: SessionContext, brandId: string) {
    if (!session || !session.workspace) {
      throw new AuthorizationError("Authentication required", 401, "UNAUTHORIZED");
    }

    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { id: true, workspaceId: true, name: true, slug: true },
    });

    if (!brand || brand.workspaceId !== session.workspace.id) {
      await this.logSecurityViolation(
        session.workspace.id,
        session.user.id,
        "CROSS_BRAND_ACCESS_BLOCKED",
        { attemptedBrandId: brandId }
      );
      throw new NotFoundError("Brand", brandId);
    }

    return brand;
  }

  /**
   * Enforces that the campaign belongs to the session's workspace.
   */
  static async requireCampaignAccess(session: SessionContext, campaignId: string) {
    if (!session || !session.workspace) {
      throw new AuthorizationError("Authentication required", 401, "UNAUTHORIZED");
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        brand: {
          select: { id: true, workspaceId: true },
        },
      },
    });

    if (!campaign || campaign.brand.workspaceId !== session.workspace.id) {
      await this.logSecurityViolation(
        session.workspace.id,
        session.user.id,
        "CROSS_CAMPAIGN_ACCESS_BLOCKED",
        { attemptedCampaignId: campaignId }
      );
      throw new NotFoundError("Campaign", campaignId);
    }

    return campaign;
  }

  /**
   * Enforces that the task belongs to the session's workspace.
   */
  static async requireTaskAccess(session: SessionContext, taskId: string) {
    if (!session || !session.workspace) {
      throw new AuthorizationError("Authentication required", 401, "UNAUTHORIZED");
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, workspaceId: true, taskType: true, status: true },
    });

    if (!task || task.workspaceId !== session.workspace.id) {
      await this.logSecurityViolation(
        session.workspace.id,
        session.user.id,
        "CROSS_TASK_ACCESS_BLOCKED",
        { attemptedTaskId: taskId }
      );
      throw new NotFoundError("Task", taskId);
    }

    return task;
  }

  /**
   * Enforces that the content asset belongs to the session's workspace.
   */
  static async requireAssetAccess(session: SessionContext, assetId: string) {
    if (!session || !session.workspace) {
      throw new AuthorizationError("Authentication required", 401, "UNAUTHORIZED");
    }

    const asset = await prisma.contentAsset.findUnique({
      where: { id: assetId },
      select: { id: true, workspaceId: true, title: true, status: true, currentVersionId: true },
    });

    if (!asset || asset.workspaceId !== session.workspace.id) {
      await this.logSecurityViolation(
        session.workspace.id,
        session.user.id,
        "CROSS_ASSET_ACCESS_BLOCKED",
        { attemptedAssetId: assetId }
      );
      throw new NotFoundError("ContentAsset", assetId);
    }

    return asset;
  }

  /**
   * Enforces that the source belongs to the session's workspace.
   */
  static async requireSourceAccess(session: SessionContext, sourceId: string) {
    if (!session || !session.workspace) {
      throw new AuthorizationError("Authentication required", 401, "UNAUTHORIZED");
    }

    const source = await prisma.source.findUnique({
      where: { id: sourceId },
      select: { id: true, workspaceId: true, title: true },
    });

    if (!source || source.workspaceId !== session.workspace.id) {
      await this.logSecurityViolation(
        session.workspace.id,
        session.user.id,
        "CROSS_SOURCE_ACCESS_BLOCKED",
        { attemptedSourceId: sourceId }
      );
      throw new NotFoundError("Source", sourceId);
    }

    return source;
  }

  /**
   * Enforces that the connected account belongs to the session's workspace.
   */
  static async requireAccountAccess(session: SessionContext, accountId: string) {
    if (!session || !session.workspace) {
      throw new AuthorizationError("Authentication required", 401, "UNAUTHORIZED");
    }

    const account = await prisma.connectedAccount.findUnique({
      where: { id: accountId },
      select: { id: true, workspaceId: true, brandId: true, platform: true, accountName: true },
    });

    if (!account || account.workspaceId !== session.workspace.id) {
      await this.logSecurityViolation(
        session.workspace.id,
        session.user.id,
        "CROSS_ACCOUNT_ACCESS_BLOCKED",
        { attemptedAccountId: accountId }
      );
      throw new NotFoundError("ConnectedAccount", accountId);
    }

    return account;
  }

  /**
   * Enforces that the actor is an authenticated human operator and not an AI or spoofed identity.
   */
  static requireHumanOperator(session: SessionContext, candidateUserId?: string) {
    if (!session || !session.user || !session.user.id) {
      throw new AuthorizationError("Authenticated human operator required", 401, "UNAUTHORIZED");
    }

    const userId = candidateUserId || session.user.id;

    if (
      !userId ||
      userId === "AI_EDITOR" ||
      userId.startsWith("AI_") ||
      userId === "system" ||
      userId === "anonymous"
    ) {
      throw new AuthorizationError(
        "AI agents and system identities are strictly prohibited from performing human operator actions.",
        403,
        "AI_ACTOR_BLOCKED"
      );
    }

    // Must match the authenticated session user
    if (candidateUserId && candidateUserId !== session.user.id && candidateUserId !== session.user.email) {
      throw new AuthorizationError(
        "Identity spoofing detected: specified user does not match authenticated session.",
        403,
        "IDENTITY_SPOOFING_BLOCKED"
      );
    }

    return session.user;
  }

  /**
   * Security audit logging helper.
   */
  static async logSecurityViolation(
    workspaceId: string,
    userId: string | null | undefined,
    action: string,
    details: Record<string, unknown>
  ) {
    try {
      let resolvedUserId: string | null = null;
      if (userId && !userId.startsWith("AI_") && userId !== "system" && userId !== "anonymous") {
        const user = await prisma.user.findFirst({
          where: { OR: [{ id: userId }, { email: userId }] },
          select: { id: true },
        });
        resolvedUserId = user?.id || null;
      }

      await AuditService.log({
        workspaceId,
        userId: resolvedUserId,
        action,
        entityType: "SecurityViolation",
        details: {
          ...details,
          attemptedActor: userId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch {
      // Do not allow audit logging failure to crash execution
    }
  }

  /**
   * Enforces multi-tenant rate limiting on a per-workspace basis.
   */
  static async checkRateLimit(
    session: SessionContext,
    category: RateLimitCategory = "GENERAL",
    cost: number = 1
  ): Promise<RateLimitResult> {
    const tenantId = session?.workspace?.id || session?.user?.id || "anonymous";
    const result = RateLimiter.consume(tenantId, category, cost);

    if (!result.allowed) {
      if (session?.workspace?.id) {
        await RateLimiter.logRateLimitViolation(
          session.workspace.id,
          session.user?.id || null,
          category,
          {
            limit: result.limit,
            remaining: result.remaining,
            retryAfterSeconds: result.retryAfterSeconds,
          }
        );
      }
      throw new RateLimitError(
        `Rate limit exceeded for ${category}. Try again in ${result.retryAfterSeconds}s.`,
        result.retryAfterSeconds
      );
    }

    return result;
  }
}

