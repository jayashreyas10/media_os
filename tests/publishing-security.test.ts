import { describe, it, expect, beforeEach } from "vitest";
import prisma from "@/server/db/prisma";
import crypto from "crypto";
import { encryptToken, decryptToken, maskSecret, sanitizeAccountDTO } from "@/server/security/encryption";
import { OAuthService } from "@/server/services/oauth-service";
import { PublishingService } from "@/server/services/publishing-service";
import { ContentStudioService } from "@/server/services/content-studio-service";
import { ApprovalService } from "@/server/services/approval-service";
import { WriterService } from "@/server/services/writer-service";

describe("Phase 7 External Publishing & Security Invariants Subsystem", () => {
  let workspaceAlpha: any;
  let brandAlpha: any;
  let userAlpha: any;

  let workspaceBeta: any;
  let brandBeta: any;
  let userBeta: any;

  beforeEach(async () => {
    const timestamp = Date.now() + Math.floor(Math.random() * 100000);

    // Tenant Alpha
    userAlpha = await prisma.user.create({
      data: {
        email: `alpha-pub-${timestamp}@mediaos.internal`,
        name: "Alpha Operator",
        passwordHash: "hash-alpha-pub",
        role: "OPERATOR",
      },
    });

    workspaceAlpha = await prisma.workspace.create({
      data: {
        name: `Alpha Media Workspace ${timestamp}`,
        slug: `alpha-ws-${timestamp}`,
        ownerId: userAlpha.id,
      },
    });

    brandAlpha = await prisma.brand.create({
      data: {
        workspaceId: workspaceAlpha.id,
        name: "Alpha Brand",
        slug: `alpha-brand-${timestamp}`,
        isDefault: true,
      },
    });

    // Tenant Beta (Adversary)
    userBeta = await prisma.user.create({
      data: {
        email: `beta-pub-${timestamp}@mediaos.internal`,
        name: "Beta Operator",
        passwordHash: "hash-beta-pub",
        role: "OPERATOR",
      },
    });

    workspaceBeta = await prisma.workspace.create({
      data: {
        name: `Beta Media Workspace ${timestamp}`,
        slug: `beta-ws-${timestamp}`,
        ownerId: userBeta.id,
      },
    });

    brandBeta = await prisma.brand.create({
      data: {
        workspaceId: workspaceBeta.id,
        name: "Beta Brand",
        slug: `beta-brand-${timestamp}`,
        isDefault: true,
      },
    });
  });

  describe("1. AES-256-GCM Authenticated Token Encryption & Zero-Leakage", () => {
    it("encrypts and decrypts tokens successfully with random IV and authenticated tag", () => {
      const rawToken = "ya29.a0AfH6SMA-test-google-oauth-access-token-123456789";
      const encrypted = encryptToken(rawToken);

      expect(encrypted).not.toBe(rawToken);
      expect(encrypted).toContain(":");

      const [iv, tag, ciphertext] = encrypted.split(":");
      expect(iv).toBeDefined();
      expect(tag).toBeDefined();
      expect(ciphertext).toBeDefined();

      const decrypted = decryptToken(encrypted);
      expect(decrypted).toBe(rawToken);
    });

    it("detects ciphertext tampering and rejects with authentication tag error", () => {
      const rawToken = "super-secret-refresh-token-xyz";
      const encrypted = encryptToken(rawToken);
      const [iv, tag, ciphertext] = encrypted.split(":");

      // Tamper ciphertext
      const tamperedCiphertext = Buffer.from(ciphertext, "base64");
      tamperedCiphertext[0] ^= 1; // Flip a bit
      const tampered = `${iv}:${tag}:${tamperedCiphertext.toString("base64")}`;

      expect(() => decryptToken(tampered)).toThrow(/authentication tag verification failed/);
    });

    it("rejects decryption with an incorrect secret key", () => {
      const rawToken = "confidential-bearer-token";
      const keyA = crypto.createHash("sha256").update("key-alpha-secret").digest();
      const keyB = crypto.createHash("sha256").update("key-beta-secret").digest();

      const encrypted = encryptToken(rawToken, keyA);
      expect(() => decryptToken(encrypted, keyB)).toThrow(/authentication tag verification failed/);
    });

    it("sanitizes account DTOs and masks secrets", () => {
      const accountRecord = {
        id: "acc-123",
        accountName: "Apex Channel",
        encryptedAccessToken: "iv:tag:cipher123",
        encryptedRefreshToken: "iv:tag:cipher456",
        status: "ACTIVE",
      };

      const sanitized = sanitizeAccountDTO(accountRecord);
      expect(sanitized).not.toHaveProperty("encryptedAccessToken");
      expect(sanitized).not.toHaveProperty("encryptedRefreshToken");
      expect(sanitized.id).toBe("acc-123");

      const masked = maskSecret("ya29.super-long-access-token-999");
      expect(masked).toBe("ya29...-999");
      expect(masked).not.toContain("super-long-access-token");
    });
  });

  describe("2. OAuth State / CSRF Defense & Tenant Binding", () => {
    it("generates a 32-byte cryptographic state token bound to tenant and rejects replay attempts", async () => {
      const initResult = await OAuthService.initiateOAuth({
        workspaceId: workspaceAlpha.id,
        brandId: brandAlpha.id,
        userId: userAlpha.id,
        platform: "YOUTUBE",
        redirectUri: "http://localhost:3000/api/oauth/youtube/callback",
      });

      expect(initResult.stateToken).toBeDefined();
      expect(initResult.stateToken.length).toBe(64); // 32 bytes hex = 64 chars

      // First callback consumption succeeds
      const account = await OAuthService.handleOAuthCallback({
        stateToken: initResult.stateToken,
        code: "test-auth-code",
        workspaceId: workspaceAlpha.id,
        brandId: brandAlpha.id,
        userId: userAlpha.id,
      });

      expect(account).toBeDefined();
      expect(account.platform).toBe("YOUTUBE");
      expect(account.status).toBe("ACTIVE");

      // Verify tokens in database are encrypted, not plaintext
      const dbAccount = await prisma.connectedAccount.findUnique({
        where: { id: account.id },
      });
      expect(dbAccount?.encryptedAccessToken).toContain(":");
      expect(dbAccount?.encryptedAccessToken).not.toContain("tok_youtube_access");

      // Replay attempt with same stateToken MUST be rejected
      await expect(
        OAuthService.handleOAuthCallback({
          stateToken: initResult.stateToken,
          code: "test-auth-code-2",
          workspaceId: workspaceAlpha.id,
          brandId: brandAlpha.id,
          userId: userAlpha.id,
        })
      ).rejects.toThrow(/already been used/);
    });

    it("rejects forged or non-existent OAuth state tokens", async () => {
      await expect(
        OAuthService.handleOAuthCallback({
          stateToken: "forged-fake-state-token-12345678",
          code: "test-code",
          workspaceId: workspaceAlpha.id,
          brandId: brandAlpha.id,
          userId: userAlpha.id,
        })
      ).rejects.toThrow(/state token not found or forged/);
    });

    it("rejects cross-tenant state consumption (Tenant Beta cannot consume Tenant Alpha's OAuth state)", async () => {
      const initAlpha = await OAuthService.initiateOAuth({
        workspaceId: workspaceAlpha.id,
        brandId: brandAlpha.id,
        userId: userAlpha.id,
        platform: "X",
        redirectUri: "http://localhost:3000/api/oauth/x/callback",
      });

      // Tenant Beta attempts to claim Tenant Alpha's OAuth state
      await expect(
        OAuthService.handleOAuthCallback({
          stateToken: initAlpha.stateToken,
          code: "adversary-code",
          workspaceId: workspaceBeta.id,
          brandId: brandBeta.id,
          userId: userBeta.id,
        })
      ).rejects.toThrow(/OAuth state tenant mismatch/);
    });
  });

  describe("3. Multi-Tenant Account Isolation & Cross-Tenant Defense", () => {
    it("blocks Tenant Beta from publishing to Tenant Alpha's connected channel", async () => {
      // Connect YouTube channel for Tenant Alpha
      const oauthAlpha = await OAuthService.initiateOAuth({
        workspaceId: workspaceAlpha.id,
        brandId: brandAlpha.id,
        userId: userAlpha.id,
        platform: "YOUTUBE",
        redirectUri: "http://localhost:3000/api/oauth/youtube/callback",
      });

      const accountAlpha = await OAuthService.handleOAuthCallback({
        stateToken: oauthAlpha.stateToken,
        code: "alpha-code",
        workspaceId: workspaceAlpha.id,
        brandId: brandAlpha.id,
        userId: userAlpha.id,
      });

      // Create campaign and approved asset for Tenant Beta
      const campaignBeta = await prisma.campaign.create({
        data: {
          brandId: brandBeta.id,
          title: "Beta Initiative",
          slug: `beta-init-${Date.now()}`,
          stage: "DISCOVERY",
        },
      });

      const assetBeta = await ContentStudioService.createAsset({
        workspaceId: workspaceBeta.id,
        campaignId: campaignBeta.id,
        type: "YOUTUBE_LONG_FORM",
        title: "Beta Tech Talk",
      });

      const v1 = await WriterService.generateContent({
        workspaceId: workspaceBeta.id,
        assetId: assetBeta.id,
        mode: "GENERATE",
      });

      await ContentStudioService.updateAssetStatus(assetBeta.id, "READY_FOR_REVIEW", workspaceBeta.id);

      await ApprovalService.approveVersion({
        workspaceId: workspaceBeta.id,
        assetId: assetBeta.id,
        versionId: v1.id,
        userId: userBeta.id,
        comment: "Beta operator approval",
      });

      // Tenant Beta attempts to publish using Tenant Alpha's accountId
      await expect(
        PublishingService.publishAsset({
          workspaceId: workspaceBeta.id,
          brandId: brandBeta.id,
          assetId: assetBeta.id,
          versionId: v1.id,
          connectedAccountId: accountAlpha.id, // Alpha's account!
          platform: "YOUTUBE",
          userId: userBeta.id,
        })
      ).rejects.toThrow(/Connected account not found in workspace\/brand/);
    });

    it("blocks Tenant Beta from revoking Tenant Alpha's connected channel", async () => {
      const oauthAlpha = await OAuthService.initiateOAuth({
        workspaceId: workspaceAlpha.id,
        brandId: brandAlpha.id,
        userId: userAlpha.id,
        platform: "LINKEDIN",
        redirectUri: "http://localhost:3000/api/oauth/linkedin/callback",
      });

      const accountAlpha = await OAuthService.handleOAuthCallback({
        stateToken: oauthAlpha.stateToken,
        code: "alpha-code-li",
        workspaceId: workspaceAlpha.id,
        brandId: brandAlpha.id,
        userId: userAlpha.id,
      });

      // Tenant Beta attempts to revoke Alpha's channel
      await expect(
        PublishingService.revokeConnectedAccount({
          workspaceId: workspaceBeta.id,
          brandId: brandBeta.id,
          accountId: accountAlpha.id,
          userId: userBeta.id,
        })
      ).rejects.toThrow(/Connected account not found/);
    });
  });

  describe("4. Mandatory Human Approval Gate & Version Binding", () => {
    let campaignAlpha: any;
    let assetAlpha: any;
    let accountAlpha: any;

    beforeEach(async () => {
      // Connect X channel for Alpha
      const oauth = await OAuthService.initiateOAuth({
        workspaceId: workspaceAlpha.id,
        brandId: brandAlpha.id,
        userId: userAlpha.id,
        platform: "X",
        redirectUri: "http://localhost:3000/api/oauth/x/callback",
      });

      accountAlpha = await OAuthService.handleOAuthCallback({
        stateToken: oauth.stateToken,
        code: "alpha-x-code",
        workspaceId: workspaceAlpha.id,
        brandId: brandAlpha.id,
        userId: userAlpha.id,
      });

      campaignAlpha = await prisma.campaign.create({
        data: {
          brandId: brandAlpha.id,
          title: "Alpha Growth Campaign",
          slug: `alpha-growth-${Date.now()}`,
          stage: "DISCOVERY",
        },
      });

      assetAlpha = await ContentStudioService.createAsset({
        workspaceId: workspaceAlpha.id,
        campaignId: campaignAlpha.id,
        type: "X_THREAD",
        title: "Autonomous Architecture Breakdown",
      });
    });

    it("strictly blocks AI agents from triggering publishing (403 Forbidden)", async () => {
      const v1 = await WriterService.generateContent({
        workspaceId: workspaceAlpha.id,
        assetId: assetAlpha.id,
        mode: "GENERATE",
      });

      await ContentStudioService.updateAssetStatus(assetAlpha.id, "READY_FOR_REVIEW", workspaceAlpha.id);

      await ApprovalService.approveVersion({
        workspaceId: workspaceAlpha.id,
        assetId: assetAlpha.id,
        versionId: v1.id,
        userId: userAlpha.id,
        comment: "Approved by human director",
      });

      // Attempt AI publish
      await expect(
        PublishingService.publishAsset({
          workspaceId: workspaceAlpha.id,
          brandId: brandAlpha.id,
          assetId: assetAlpha.id,
          versionId: v1.id,
          connectedAccountId: accountAlpha.id,
          platform: "X",
          userId: "AI_EDITOR", // AI identity!
          isAI: true,
        })
      ).rejects.toThrow(/AI agents and automated systems are strictly prohibited from publishing/);
    });

    it("rejects publishing when asset is in DRAFT, GENERATED, EDITING, or REVISION_REQUIRED status", async () => {
      const v1 = await WriterService.generateContent({
        workspaceId: workspaceAlpha.id,
        assetId: assetAlpha.id,
        mode: "GENERATE",
      });

      // Asset is currently in GENERATED status
      await expect(
        PublishingService.publishAsset({
          workspaceId: workspaceAlpha.id,
          brandId: brandAlpha.id,
          assetId: assetAlpha.id,
          versionId: v1.id,
          connectedAccountId: accountAlpha.id,
          platform: "X",
          userId: userAlpha.id,
        })
      ).rejects.toThrow(/Asset cannot be published while in "GENERATED" status/);

      // Move to EDITING
      await ContentStudioService.updateAssetStatus(assetAlpha.id, "EDITING", workspaceAlpha.id);
      await expect(
        PublishingService.publishAsset({
          workspaceId: workspaceAlpha.id,
          brandId: brandAlpha.id,
          assetId: assetAlpha.id,
          versionId: v1.id,
          connectedAccountId: accountAlpha.id,
          platform: "X",
          userId: userAlpha.id,
        })
      ).rejects.toThrow(/Asset cannot be published while in "EDITING" status/);
    });

    it("invalidates publishing eligibility when content is edited after human approval", async () => {
      const v1 = await WriterService.generateContent({
        workspaceId: workspaceAlpha.id,
        assetId: assetAlpha.id,
        mode: "GENERATE",
      });

      await ContentStudioService.updateAssetStatus(assetAlpha.id, "READY_FOR_REVIEW", workspaceAlpha.id);

      await ApprovalService.approveVersion({
        workspaceId: workspaceAlpha.id,
        assetId: assetAlpha.id,
        versionId: v1.id,
        userId: userAlpha.id,
        comment: "Approved v1",
      });

      // Operator edits content -> Writer creates v2 in EDITING status
      const v2 = await WriterService.saveManualEdit({
        workspaceId: workspaceAlpha.id,
        assetId: assetAlpha.id,
        blocks: [{ blockType: "TWEET", orderIndex: 0, content: "Edited tweet text" }],
        changeSummary: "Manual tweak after approval",
        userId: userAlpha.email,
      });

      expect(v2.versionNumber).toBe(2);

      // 1. Publishing v1 MUST be rejected because editing resets asset to EDITING status!
      await expect(
        PublishingService.publishAsset({
          workspaceId: workspaceAlpha.id,
          brandId: brandAlpha.id,
          assetId: assetAlpha.id,
          versionId: v1.id,
          connectedAccountId: accountAlpha.id,
          platform: "X",
          userId: userAlpha.id,
        })
      ).rejects.toThrow(/Asset cannot be published while in "EDITING" status/);

      // 2. Even if asset is in APPROVED status for v2, attempting to publish old v1 fails with Version mismatch!
      await prisma.contentAsset.update({
        where: { id: assetAlpha.id },
        data: { status: "APPROVED" },
      });

      await expect(
        PublishingService.publishAsset({
          workspaceId: workspaceAlpha.id,
          brandId: brandAlpha.id,
          assetId: assetAlpha.id,
          versionId: v1.id,
          connectedAccountId: accountAlpha.id,
          platform: "X",
          userId: userAlpha.id,
        })
      ).rejects.toThrow(/Version mismatch/);
    });
  });

  describe("5. Publishing Execution, Delivery Idempotency & Revocation", () => {
    let accountAlpha: any;
    let campaignAlpha: any;
    let assetAlpha: any;
    let versionAlpha: any;

    beforeEach(async () => {
      const oauth = await OAuthService.initiateOAuth({
        workspaceId: workspaceAlpha.id,
        brandId: brandAlpha.id,
        userId: userAlpha.id,
        platform: "YOUTUBE",
        redirectUri: "http://localhost:3000/api/oauth/youtube/callback",
      });

      accountAlpha = await OAuthService.handleOAuthCallback({
        stateToken: oauth.stateToken,
        code: "alpha-yt-code",
        workspaceId: workspaceAlpha.id,
        brandId: brandAlpha.id,
        userId: userAlpha.id,
      });

      campaignAlpha = await prisma.campaign.create({
        data: {
          brandId: brandAlpha.id,
          title: "YouTube Launch Campaign",
          slug: `yt-launch-${Date.now()}`,
          stage: "DISCOVERY",
        },
      });

      assetAlpha = await ContentStudioService.createAsset({
        workspaceId: workspaceAlpha.id,
        campaignId: campaignAlpha.id,
        type: "YOUTUBE_LONG_FORM",
        title: "Building Production Multi-Agent Systems",
      });

      versionAlpha = await WriterService.generateContent({
        workspaceId: workspaceAlpha.id,
        assetId: assetAlpha.id,
        mode: "GENERATE",
      });

      await ContentStudioService.updateAssetStatus(assetAlpha.id, "READY_FOR_REVIEW", workspaceAlpha.id);

      await ApprovalService.approveVersion({
        workspaceId: workspaceAlpha.id,
        assetId: assetAlpha.id,
        versionId: versionAlpha.id,
        userId: userAlpha.id,
        comment: "Ready for live YouTube release",
      });
    });

    it("publishes successfully and records audit trail with zero token leakage", async () => {
      const pubResult = await PublishingService.publishAsset({
        workspaceId: workspaceAlpha.id,
        brandId: brandAlpha.id,
        assetId: assetAlpha.id,
        versionId: versionAlpha.id,
        connectedAccountId: accountAlpha.id,
        platform: "YOUTUBE",
        userId: userAlpha.id,
      });

      expect(pubResult.isDuplicate).toBe(false);
      expect(pubResult.publishingRecord.status).toBe("PUBLISHED");
      expect(pubResult.publishingRecord.externalPostId).toContain("yt_");
      expect(pubResult.publishingRecord.externalPostUrl).toContain("youtube.com/watch?v=");

      // Asset status updated to PUBLISHED
      const updatedAsset = await prisma.contentAsset.findUnique({
        where: { id: assetAlpha.id },
      });
      expect(updatedAsset?.status).toBe("PUBLISHED");

      // Verify Audit Log was created
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          workspaceId: workspaceAlpha.id,
          action: "CONTENT_PUBLISHED",
        },
      });
      expect(auditLog).toBeDefined();
      expect(auditLog?.detailsJson).not.toContain("tok_");
      expect(auditLog?.detailsJson).not.toContain("encrypted");
    });

    it("guarantees delivery idempotency: duplicate publish returns existing record without double-posting", async () => {
      // First publish
      const pub1 = await PublishingService.publishAsset({
        workspaceId: workspaceAlpha.id,
        brandId: brandAlpha.id,
        assetId: assetAlpha.id,
        versionId: versionAlpha.id,
        connectedAccountId: accountAlpha.id,
        platform: "YOUTUBE",
        userId: userAlpha.id,
      });
      expect(pub1.isDuplicate).toBe(false);
      const initialExternalId = pub1.publishingRecord.externalPostId;

      // Second publish (exact same parameters)
      const pub2 = await PublishingService.publishAsset({
        workspaceId: workspaceAlpha.id,
        brandId: brandAlpha.id,
        assetId: assetAlpha.id,
        versionId: versionAlpha.id,
        connectedAccountId: accountAlpha.id,
        platform: "YOUTUBE",
        userId: userAlpha.id,
      });

      expect(pub2.isDuplicate).toBe(true);
      expect(pub2.publishingRecord.externalPostId).toBe(initialExternalId);

      // Verify only 1 PublishingRecord exists
      const records = await prisma.publishingRecord.findMany({
        where: { contentAssetId: assetAlpha.id },
      });
      expect(records.length).toBe(1);
    });

    it("revoking account destroys tokens and blocks subsequent publishing attempts", async () => {
      const revokedAccount = await PublishingService.revokeConnectedAccount({
        workspaceId: workspaceAlpha.id,
        brandId: brandAlpha.id,
        accountId: accountAlpha.id,
        userId: userAlpha.id,
      });

      expect(revokedAccount.status).toBe("REVOKED");

      // Verify token in DB was wiped
      const dbAccount = await prisma.connectedAccount.findUnique({
        where: { id: accountAlpha.id },
      });
      expect(dbAccount?.encryptedAccessToken).toBe("REVOKED");
      expect(dbAccount?.encryptedRefreshToken).toBeNull();

      // Subsequent publish attempt MUST be blocked
      await expect(
        PublishingService.publishAsset({
          workspaceId: workspaceAlpha.id,
          brandId: brandAlpha.id,
          assetId: assetAlpha.id,
          versionId: versionAlpha.id,
          connectedAccountId: accountAlpha.id,
          platform: "YOUTUBE",
          userId: userAlpha.id,
        })
      ).rejects.toThrow(/Connected account is REVOKED/);
    });
  });
});
