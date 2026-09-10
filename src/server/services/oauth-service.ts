import crypto from "crypto";
import prisma from "../db/prisma";
import { encryptToken, sanitizeAccountDTO } from "../security/encryption";
import { AuditService } from "./audit-service";
import { AuthorizationGuard, AuthorizationError } from "../auth/authorization-guard";
import { OAuthProviderRegistry, SupportedOAuthPlatform } from "../oauth/oauth-providers";

export const SUPPORTED_PLATFORMS = [
  "YOUTUBE",
  "X",
  "LINKEDIN",
  "NEWSLETTER",
  "GENERIC_WEBHOOK",
] as const;

export type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];

export interface InitiateOAuthInput {
  workspaceId: string;
  brandId: string;
  userId: string;
  platform: SupportedPlatform;
  redirectUri: string;
}

export interface HandleOAuthCallbackInput {
  stateToken: string;
  code: string;
  workspaceId: string;
  brandId: string;
  userId: string;
}

export class OAuthService {
  /**
   * Generates a cryptographically secure, tenant-bound OAuth state token (10 min TTL)
   * to protect against CSRF and cross-tenant state injection.
   */
  static async initiateOAuth(input: InitiateOAuthInput) {
    const { workspaceId, brandId, userId, platform, redirectUri } = input;

    if (!SUPPORTED_PLATFORMS.includes(platform)) {
      throw new Error(`Unsupported platform: "${platform}". Allowed: ${SUPPORTED_PLATFORMS.join(", ")}`);
    }

    // Verify brand belongs to workspace
    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { id: true, workspaceId: true, name: true },
    });

    if (!brand || brand.workspaceId !== workspaceId) {
      throw new AuthorizationError("Brand not found in workspace", 404, "NOT_FOUND");
    }

    // Generate 32 bytes of cryptographic randomness for CSRF defense
    const stateToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const stateRecord = await prisma.oAuthState.create({
      data: {
        workspaceId,
        brandId,
        userId,
        platform,
        stateToken,
        redirectUri,
        expiresAt,
        used: false,
      },
    });

    // Build authorization URL via registry
    const { authUrl, isLive } = OAuthProviderRegistry.getAuthorizationUrl(
      platform as SupportedOAuthPlatform,
      stateToken,
      redirectUri
    );

    await AuditService.log({
      workspaceId,
      userId,
      action: "OAUTH_INITIATED",
      entityType: "OAuthState",
      entityId: stateRecord.id,
      details: { platform, brandId, expiresAt: expiresAt.toISOString(), isLive },
    });

    return {
      stateToken,
      authUrl,
      isLive,
      expiresAt,
    };
  }

  /**
   * Validates OAuth callback state, exchanges code for tokens, encrypts tokens,
   * and creates an isolated ConnectedAccount record.
   */
  static async handleOAuthCallback(input: HandleOAuthCallbackInput) {
    const { stateToken, code, workspaceId, brandId, userId } = input;

    if (!stateToken) {
      throw new Error("Missing state parameter in OAuth callback");
    }
    if (!code) {
      throw new Error("Missing authorization code in OAuth callback");
    }

    const stateRecord = await prisma.oAuthState.findUnique({
      where: { stateToken },
    });

    if (!stateRecord) {
      throw new Error("Invalid OAuth state: state token not found or forged");
    }

    // CSRF & Replay Prevention
    if (stateRecord.used) {
      await AuthorizationGuard.logSecurityViolation(
        workspaceId,
        userId,
        "OAUTH_STATE_REPLAY_ATTEMPT",
        { stateToken: stateToken.slice(0, 8) + "..." }
      );
      throw new Error("Invalid OAuth state: state token has already been used (replay attack prevented)");
    }

    // Expiration check
    if (stateRecord.expiresAt < new Date()) {
      throw new Error("Invalid OAuth state: state token has expired");
    }

    // Multi-tenant boundary check
    if (stateRecord.workspaceId !== workspaceId || stateRecord.brandId !== brandId) {
      await AuthorizationGuard.logSecurityViolation(
        workspaceId,
        userId,
        "CROSS_TENANT_OAUTH_BLOCKED",
        { stateWorkspaceId: stateRecord.workspaceId, currentWorkspaceId: workspaceId }
      );
      throw new AuthorizationError("OAuth state tenant mismatch", 403, "FORBIDDEN");
    }

    // Atomically invalidate the state token immediately
    await prisma.oAuthState.update({
      where: { id: stateRecord.id },
      data: { used: true },
    });

    const platform = stateRecord.platform as SupportedPlatform;

    // Token exchange (Registry handles live OAuth vs deterministic mock)
    const tokenResult = await OAuthProviderRegistry.exchangeCodeForTokens(
      platform as SupportedOAuthPlatform,
      code,
      stateRecord.redirectUri,
      stateRecord.codeVerifier || undefined
    );

    // Encrypt tokens before storing in database (AES-256-GCM)
    const encryptedAccessToken = encryptToken(tokenResult.accessToken);
    const encryptedRefreshToken = tokenResult.refreshToken ? encryptToken(tokenResult.refreshToken) : null;

    const tokenExpiresAt = new Date(Date.now() + tokenResult.expiresInSeconds * 1000);
    const externalAccountId = tokenResult.accountId;
    const accountName = tokenResult.accountName || `${brandId.slice(0, 6).toUpperCase()} ${platform} Official`;

    const account = await prisma.connectedAccount.upsert({
      where: {
        brandId_platform_accountId: {
          brandId,
          platform,
          accountId: externalAccountId,
        },
      },
      create: {
        workspaceId,
        brandId,
        connectedById: userId,
        platform,
        accountName,
        accountId: externalAccountId,
        accountEmail: tokenResult.accountEmail || `${platform.toLowerCase()}@mediaos-brand.internal`,
        encryptedAccessToken,
        encryptedRefreshToken,
        tokenExpiresAt,
        scope: `${platform.toLowerCase()}.publish`,
        status: "ACTIVE",
        metadataJson: JSON.stringify({
          channelTitle: accountName,
          verified: true,
          isMock: tokenResult.isMock,
          providerMode: tokenResult.isMock ? "MOCK / DEMONSTRATION MODE" : "LIVE PRODUCTION",
          connectedAt: new Date().toISOString(),
          ...tokenResult.rawResponseMetadata,
        }),
      },
      update: {
        encryptedAccessToken,
        encryptedRefreshToken,
        tokenExpiresAt,
        status: "ACTIVE",
        metadataJson: JSON.stringify({
          channelTitle: accountName,
          verified: true,
          isMock: tokenResult.isMock,
          providerMode: tokenResult.isMock ? "MOCK / DEMONSTRATION MODE" : "LIVE PRODUCTION",
          connectedAt: new Date().toISOString(),
          ...tokenResult.rawResponseMetadata,
        }),
        updatedAt: new Date(),
      },
    });

    await AuditService.log({
      workspaceId,
      userId,
      action: "OAUTH_ACCOUNT_CONNECTED",
      entityType: "ConnectedAccount",
      entityId: account.id,
      details: {
        platform: account.platform,
        accountId: account.accountId,
        accountName: account.accountName,
        tokenExpiresAt: tokenExpiresAt.toISOString(),
      },
    });

    return sanitizeAccountDTO(account);
  }
}
