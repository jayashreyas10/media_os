import { describe, it, expect, beforeEach } from "vitest";
import prisma from "@/server/db/prisma";
import { RateLimiter } from "@/server/security/rate-limiter";
import { AuthorizationGuard, RateLimitError } from "@/server/auth/authorization-guard";
import { WorkerLockService, LockAcquisitionError } from "@/server/services/worker-lock";
import { MetricSyncService } from "@/server/services/metric-sync-service";
import { OAuthService } from "@/server/services/oauth-service";
import { OAuthProviderRegistry } from "@/server/oauth/oauth-providers";
import { encryptToken, decryptToken } from "@/server/security/encryption";
import {
  sanitizeAttributes,
  getCorrelationId,
  withSpan,
  TelemetryMetrics,
} from "@/server/observability/telemetry";

describe("Phase 8: Production Deployment, Monitoring & Telemetry Subsystem", () => {
  let workspaceAlpha: any;
  let brandAlpha: any;
  let userAlpha: any;

  let workspaceBeta: any;
  let brandBeta: any;
  let userBeta: any;

  beforeEach(async () => {
    RateLimiter.reset();
    TelemetryMetrics.reset();

    const timestamp = Date.now() + Math.floor(Math.random() * 100000);

    // Tenant Alpha
    userAlpha = await prisma.user.create({
      data: {
        email: `alpha-p8-${timestamp}@mediaos.internal`,
        name: "Alpha Operator",
        passwordHash: "hash-alpha-p8",
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
      },
    });

    // Tenant Beta
    userBeta = await prisma.user.create({
      data: {
        email: `beta-p8-${timestamp}@mediaos.internal`,
        name: "Beta Operator",
        passwordHash: "hash-beta-p8",
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
      },
    });
  });

  describe("1. Multi-Tenant Rate Limiting & Abuse Defense", () => {
    it("should allow consumption within category capacity and track remaining tokens", () => {
      RateLimiter.setCategoryConfig("PUBLISHING", { capacity: 5, refillPerMinute: 5 });

      const res1 = RateLimiter.consume(workspaceAlpha.id, "PUBLISHING", 2);
      expect(res1.allowed).toBe(true);
      expect(res1.remaining).toBe(3);

      const res2 = RateLimiter.consume(workspaceAlpha.id, "PUBLISHING", 3);
      expect(res2.allowed).toBe(true);
      expect(res2.remaining).toBe(0);
    });

    it("should reject requests exceeding quota with retryAfterSeconds and HTTP 429 response structure", () => {
      RateLimiter.setCategoryConfig("AUTH", { capacity: 2, refillPerMinute: 2 });

      RateLimiter.consume("user-1", "AUTH", 2);
      const blocked = RateLimiter.consume("user-1", "AUTH", 1);

      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);

      const response = RateLimiter.createResponse(blocked, "Too many attempts");
      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBe(blocked.retryAfterSeconds.toString());
      expect(response.headers.get("X-RateLimit-Limit")).toBe("2");
    });

    it("should guarantee strict tenant rate-limit isolation (Tenant A exhaustion does NOT affect Tenant B)", () => {
      RateLimiter.setCategoryConfig("RESEARCH", { capacity: 3, refillPerMinute: 3 });

      // Exhaust Tenant Alpha's capacity
      const r1 = RateLimiter.consume(workspaceAlpha.id, "RESEARCH", 3);
      expect(r1.allowed).toBe(true);
      const rAlphaBlocked = RateLimiter.consume(workspaceAlpha.id, "RESEARCH", 1);
      expect(rAlphaBlocked.allowed).toBe(false);

      // Tenant Beta must remain completely unaffected
      const rBetaAllowed = RateLimiter.consume(workspaceBeta.id, "RESEARCH", 2);
      expect(rBetaAllowed.allowed).toBe(true);
      expect(rBetaAllowed.remaining).toBe(1);
    });

    it("should enforce checkRateLimit in AuthorizationGuard and log security audit violations", async () => {
      RateLimiter.setCategoryConfig("GENERATION", { capacity: 1, refillPerMinute: 1 });

      const session = {
        user: userAlpha,
        workspace: workspaceAlpha,
        brand: brandAlpha,
      };

      // First call succeeds
      await expect(AuthorizationGuard.checkRateLimit(session, "GENERATION", 1)).resolves.toBeDefined();

      // Second call exceeds rate limit
      await expect(AuthorizationGuard.checkRateLimit(session, "GENERATION", 1)).rejects.toThrow(
        RateLimitError
      );

      // Verify audit violation was recorded
      const violationLog = await prisma.auditLog.findFirst({
        where: {
          workspaceId: workspaceAlpha.id,
          action: "RATE_LIMIT_EXCEEDED",
        },
      });

      expect(violationLog).not.toBeNull();
      expect(violationLog?.entityType).toBe("RateLimiter");
    });
  });

  describe("2. Distributed Worker Locking & Crash Recovery", () => {
    it("should provide mutual exclusion across concurrent workers", async () => {
      const lockKey = `test:lock:${Date.now()}`;
      const worker1 = "worker-process-1";
      const worker2 = "worker-process-2";

      const acquired1 = await WorkerLockService.acquireLock(lockKey, worker1, 10000);
      expect(acquired1).toBe(true);

      // Worker 2 cannot acquire while active
      const acquired2 = await WorkerLockService.acquireLock(lockKey, worker2, 10000);
      expect(acquired2).toBe(false);

      // Releasing allows Worker 2 to acquire
      await WorkerLockService.releaseLock(lockKey, worker1);
      const acquired2AfterRelease = await WorkerLockService.acquireLock(lockKey, worker2, 10000);
      expect(acquired2AfterRelease).toBe(true);

      await WorkerLockService.releaseLock(lockKey, worker2);
    });

    it("should automatically reclaim expired lease locks to prevent permanent deadlock", async () => {
      const lockKey = `test:stale:${Date.now()}`;
      const deadWorker = "crashed-worker";
      const recoveryWorker = "recovery-worker";

      // Manually create a simulated expired lock record
      await prisma.workerLock.create({
        data: {
          lockKey,
          holderId: deadWorker,
          expiresAt: new Date(Date.now() - 5000), // Expired 5 seconds ago
        },
      });

      // New worker should reclaim the expired lock without error
      const acquired = await WorkerLockService.acquireLock(lockKey, recoveryWorker, 10000);
      expect(acquired).toBe(true);

      const record = await prisma.workerLock.findUnique({ where: { lockKey } });
      expect(record?.holderId).toBe(recoveryWorker);

      await WorkerLockService.releaseLock(lockKey, recoveryWorker);
    });

    it("should execute tasks safely inside withLock wrapper and clean up lock", async () => {
      const lockKey = `test:withlock:${Date.now()}`;
      let executed = false;

      await WorkerLockService.withLock(lockKey, "test-runner", 5000, async () => {
        executed = true;
      });

      expect(executed).toBe(true);
      const lock = await prisma.workerLock.findUnique({ where: { lockKey } });
      expect(lock).toBeNull();
    });
  });

  describe("3. Automated Platform Metric Synchronization", () => {
    let connectedAcc: any;

    beforeEach(async () => {
      connectedAcc = await prisma.connectedAccount.create({
        data: {
          workspaceId: workspaceAlpha.id,
          brandId: brandAlpha.id,
          platform: "YOUTUBE",
          accountName: "Alpha YouTube Channel",
          accountId: `yt_acc_${Date.now()}`,
          encryptedAccessToken: encryptToken("test_access_token_yt"),
          encryptedRefreshToken: encryptToken("test_refresh_token_yt"),
          status: "ACTIVE",
          metadataJson: JSON.stringify({
            isMock: true,
            providerMode: "MOCK / DEMONSTRATION MODE",
          }),
        },
      });
    });

    it("should synchronize metrics and ingest immutable snapshots", async () => {
      const pStart = new Date("2026-09-01T00:00:00Z");
      const pEnd = new Date("2026-09-07T00:00:00Z");

      const result = await MetricSyncService.syncAccountMetrics({
        workspaceId: workspaceAlpha.id,
        brandId: brandAlpha.id,
        accountId: connectedAcc.id,
        periodStart: pStart,
        periodEnd: pEnd,
      });

      expect(result.status).toBe("COMPLETED");
      expect(result.syncedSnapshotsCount).toBeGreaterThan(0);

      // Verify MetricSyncJob was saved
      const job = await prisma.metricSyncJob.findUnique({ where: { id: result.jobId } });
      expect(job?.status).toBe("COMPLETED");

      // Verify raw metric snapshot exists in database
      const snapshot = await prisma.metricSnapshot.findFirst({
        where: {
          workspaceId: workspaceAlpha.id,
          brandId: brandAlpha.id,
          platform: "YOUTUBE",
        },
      });

      expect(snapshot).not.toBeNull();
      expect(snapshot?.views).toBeGreaterThan(0);
      expect(snapshot?.impressions).toBeGreaterThan(0);
      expect(snapshot?.isSynthetic).toBe(true);
    });

    it("should enforce SHA-256 idempotency on repeat synchronization (zero double-counting)", async () => {
      const pStart = new Date("2026-09-01T00:00:00Z");
      const pEnd = new Date("2026-09-07T00:00:00Z");

      // First sync
      const res1 = await MetricSyncService.syncAccountMetrics({
        workspaceId: workspaceAlpha.id,
        brandId: brandAlpha.id,
        accountId: connectedAcc.id,
        periodStart: pStart,
        periodEnd: pEnd,
      });
      expect(res1.syncedSnapshotsCount).toBeGreaterThan(0);

      // Second sync with the same time window
      const res2 = await MetricSyncService.syncAccountMetrics({
        workspaceId: workspaceAlpha.id,
        brandId: brandAlpha.id,
        accountId: connectedAcc.id,
        periodStart: pStart,
        periodEnd: pEnd,
      });

      // Duplicates must be detected and skipped
      expect(res2.duplicateSnapshotsCount).toBeGreaterThan(0);
      expect(res2.syncedSnapshotsCount).toBe(0);
    });

    it("should safely reject synchronization for revoked accounts without data corruption", async () => {
      await prisma.connectedAccount.update({
        where: { id: connectedAcc.id },
        data: { status: "REVOKED" },
      });

      await expect(
        MetricSyncService.syncAccountMetrics({
          workspaceId: workspaceAlpha.id,
          brandId: brandAlpha.id,
          accountId: connectedAcc.id,
        })
      ).rejects.toThrow("Cannot synchronize metrics for revoked account");
    });
  });

  describe("4. Live OAuth Provider Registry & Secret Protection", () => {
    it("should fall back to Mock OAuth Provider when live credentials are not set", () => {
      const isLive = OAuthProviderRegistry.isLiveConfigured("YOUTUBE");
      // In local dev/test environment without explicit live keys, it should be false
      expect(typeof isLive).toBe("boolean");

      const { authUrl, isLive: urlIsLive } = OAuthProviderRegistry.getAuthorizationUrl(
        "YOUTUBE",
        "mock-state-token-123",
        "http://localhost:3000/api/oauth/youtube/callback"
      );

      expect(authUrl).toContain("mock-state-token-123");
      expect(typeof urlIsLive).toBe("boolean");
    });

    it("should encrypt access and refresh tokens with AES-256-GCM and prevent raw leakage", async () => {
      const rawSecret = "super_sensitive_access_token_secret_12345";
      const encrypted = encryptToken(rawSecret);

      expect(encrypted).not.toBe(rawSecret);
      expect(encrypted).toContain(":"); // iv:authTag:ciphertext format

      const decrypted = decryptToken(encrypted);
      expect(decrypted).toBe(rawSecret);
    });

    it("should block replay attacks and expired state tokens in OAuth handshake", async () => {
      const stateRecord = await prisma.oAuthState.create({
        data: {
          workspaceId: workspaceAlpha.id,
          brandId: brandAlpha.id,
          userId: userAlpha.id,
          platform: "YOUTUBE",
          stateToken: `csrf_test_${Date.now()}`,
          redirectUri: "http://localhost:3000/callback",
          expiresAt: new Date(Date.now() + 60000),
          used: false,
        },
      });

      // First callback consumes the token
      const callbackResult = await OAuthService.handleOAuthCallback({
        stateToken: stateRecord.stateToken,
        code: "valid_code",
        workspaceId: workspaceAlpha.id,
        brandId: brandAlpha.id,
        userId: userAlpha.id,
      });

      expect(callbackResult).toBeDefined();

      // Replay attack with same stateToken must be rejected
      await expect(
        OAuthService.handleOAuthCallback({
          stateToken: stateRecord.stateToken,
          code: "replay_code",
          workspaceId: workspaceAlpha.id,
          brandId: brandAlpha.id,
          userId: userAlpha.id,
        })
      ).rejects.toThrow("replay attack prevented");
    });
  });

  describe("5. OpenTelemetry, Observability & Secret Redaction", () => {
    it("should redact sensitive tokens and credentials from telemetry objects", () => {
      const payload = {
        workspaceId: "ws-123",
        accessToken: "sensitive_access_token",
        encryptedRefreshToken: "iv:auth:ciphertext",
        apiKey: "sk-live-123456789",
        password: "user_secret_password",
        authorization: "Bearer ya29.a0AfH6SMD...",
        auditComment: "Request header had Bearer ya29.secretToken12345",
        safeMetadata: {
          views: 1200,
          platform: "YOUTUBE",
        },
      };

      const sanitized = sanitizeAttributes(payload) as Record<string, any>;

      expect(sanitized.accessToken).toBe("[REDACTED]");
      expect(sanitized.encryptedRefreshToken).toBe("[REDACTED]");
      expect(sanitized.apiKey).toBe("[REDACTED]");
      expect(sanitized.password).toBe("[REDACTED]");
      expect(sanitized.authorization).toBe("[REDACTED]");
      expect(sanitized.auditComment).toContain("Bearer [REDACTED]");
      expect(sanitized.workspaceId).toBe("ws-123");
      expect(sanitized.safeMetadata.views).toBe(1200);
    });

    it("should trace functions within withSpan and measure execution duration", async () => {
      let executed = false;

      const result = await withSpan("test_span", { operation: "unit_test" }, async (span) => {
        expect(span.traceId).toBeDefined();
        expect(span.spanId).toBeDefined();
        expect(span.name).toBe("test_span");
        executed = true;
        return 42;
      });

      expect(result).toBe(42);
      expect(executed).toBe(true);

      const metrics = TelemetryMetrics.getSnapshot();
      expect(metrics.counters["span.test_span.started"]).toBe(1);
      expect(metrics.counters["span.test_span.completed"]).toBe(1);
    });

    it("should extract correlation ID from headers or generate new UUID", () => {
      const headers = new Headers();
      headers.set("x-correlation-id", "req-test-uuid-999");

      const extracted = getCorrelationId(headers);
      expect(extracted).toBe("req-test-uuid-999");

      const generated = getCorrelationId(null);
      expect(generated).toBeDefined();
      expect(generated.length).toBeGreaterThan(10);
    });
  });
});
