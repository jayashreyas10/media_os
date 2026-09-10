import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import prisma from "@/server/db/prisma";
import { ProviderFactory, AIDisabledError, assertAIEnabled, isAIDisabled } from "@/server/ai/provider-factory";
import { OpenAIProvider } from "@/server/ai/providers/openai-provider";
import { AnthropicProvider } from "@/server/ai/providers/anthropic-provider";
import { GeminiProvider } from "@/server/ai/providers/gemini-provider";
import { MockAIProvider } from "@/server/ai/providers/mock-provider";
import { SignalScoutService } from "@/server/services/signal-scout-service";
import { EvidenceGraphService } from "@/server/services/evidence-graph-service";
import { StrategistService } from "@/server/services/strategist-service";
import { ContentStudioService } from "@/server/services/content-studio-service";
import { EditorialReviewerService } from "@/server/services/editorial-reviewer-service";
import { ApprovalService } from "@/server/services/approval-service";
import { AnalyticsService } from "@/server/services/analytics-service";
import { LearningEngineService } from "@/server/services/learning-engine-service";
import { StrategyRecommendationService } from "@/server/services/strategy-recommendation-service";
import { PublishingService } from "@/server/services/publishing-service";
import { TaskEngine } from "@/server/services/task-engine";
import { encryptToken } from "@/server/security/encryption";

describe("MediaOS — AI Cost-Safety & Zero-Spend Invariants", () => {
  const originalEnv = { ...process.env };
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    process.env.AI_DISABLED = "true";
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  describe("1. Global Server-Side AI Guard (assertAIEnabled)", () => {
    it("throws AIDisabledError when AI_DISABLED=true", () => {
      process.env.AI_DISABLED = "true";
      expect(isAIDisabled()).toBe(true);
      expect(() => assertAIEnabled()).toThrow(AIDisabledError);
    });

    it("throws AIDisabledError when AI_MODE=DISABLED", () => {
      delete process.env.AI_DISABLED;
      process.env.AI_MODE = "DISABLED";
      expect(isAIDisabled()).toBe(true);
      expect(() => assertAIEnabled()).toThrow(AIDisabledError);
    });

    it("throws AIDisabledError when AI_PROVIDER=disabled", () => {
      delete process.env.AI_DISABLED;
      process.env.AI_PROVIDER = "disabled";
      expect(isAIDisabled()).toBe(true);
      expect(() => assertAIEnabled()).toThrow(AIDisabledError);
    });

    it("AIDisabledError exposes status 503 and explicit code", () => {
      const err = new AIDisabledError();
      expect(err.statusCode).toBe(503);
      expect(err.code).toBe("AI_ASSISTANCE_DISABLED");
      expect(err.name).toBe("AIDisabledError");
    });
  });

  describe("2. Provider Network Layer Zero-Call Invariants", () => {
    it("strictly prevents OpenAIProvider from dispatching outbound network requests", async () => {
      process.env.AI_DISABLED = "true";
      process.env.OPENAI_API_KEY = "test-sk-should-never-be-used";

      const fetchSpy = vi.fn();
      global.fetch = fetchSpy as unknown as typeof fetch;

      const provider = new OpenAIProvider("test-sk-should-never-be-used");

      await expect(
        provider.generate({
          agentType: "WRITER",
          context: { campaignTitle: "Zero Call Test" },
        })
      ).rejects.toThrow(AIDisabledError);

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("strictly prevents AnthropicProvider from dispatching outbound network requests", async () => {
      process.env.AI_DISABLED = "true";
      process.env.ANTHROPIC_API_KEY = "test-sk-ant-should-never-be-used";

      const fetchSpy = vi.fn();
      global.fetch = fetchSpy as unknown as typeof fetch;

      const provider = new AnthropicProvider("test-sk-ant-should-never-be-used");

      await expect(
        provider.generate({
          agentType: "WRITER",
          context: { campaignTitle: "Zero Call Test" },
        })
      ).rejects.toThrow(AIDisabledError);

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("strictly prevents GeminiProvider from dispatching outbound network requests", async () => {
      process.env.AI_DISABLED = "true";
      process.env.GEMINI_API_KEY = "test-aiza-should-never-be-used";

      const fetchSpy = vi.fn();
      global.fetch = fetchSpy as unknown as typeof fetch;

      const provider = new GeminiProvider("test-aiza-should-never-be-used");

      await expect(
        provider.generate({
          agentType: "WRITER",
          context: { campaignTitle: "Zero Call Test" },
        })
      ).rejects.toThrow(AIDisabledError);

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("strictly prevents MockAIProvider from fabricating mock output in DISABLED mode", async () => {
      process.env.AI_DISABLED = "true";

      const mockProvider = new MockAIProvider();

      await expect(
        mockProvider.generate({
          agentType: "SIGNAL_SCOUT",
          context: { campaignTitle: "Zero Call Test" },
        })
      ).rejects.toThrow(AIDisabledError);
    });

    it("strictly blocks ProviderFactory.getProvider() in DISABLED mode without fallback to MOCK", async () => {
      process.env.AI_DISABLED = "true";

      await expect(ProviderFactory.getProvider()).rejects.toThrow(AIDisabledError);
      await expect(ProviderFactory.getAIMode()).resolves.toBe("DISABLED");

      const status = await ProviderFactory.getAIStatus();
      expect(status.mode).toBe("DISABLED");
      expect(status.label).toBe("Manual Mode — AI Disabled");
      expect(status.provider).toBe("none");
      expect(status.manualAvailable).toBe(true);
    });
  });

  describe("3. Background Task Engine & Zero-Retry Invariants", () => {
    it("fails background AI task execution immediately without queuing retries when AI is disabled", async () => {
      process.env.AI_DISABLED = "true";
      const ts = Date.now() + Math.floor(Math.random() * 10000);

      const user = await prisma.user.create({
        data: {
          email: `cost-safe-${ts}@mediaos.internal`,
          name: "Cost Safe Operator",
          passwordHash: "hash-cost-safe",
          role: "OPERATOR",
        },
      });

      const ws = await prisma.workspace.create({
        data: {
          name: `Cost Safe WS ${ts}`,
          slug: `cost-safe-ws-${ts}`,
          ownerId: user.id,
        },
      });

      const task = await TaskEngine.queueTask({
        workspaceId: ws.id,
        taskType: "SIGNAL_SCOUT",
        agentName: "Signal Scout",
        inputData: { focus: "AI Cost Safety" },
      });

      expect(task.status).toBe("QUEUED");

      // Execute task while AI is disabled
      const executed = await TaskEngine.executeTask(task.id);

      expect(executed.status).toBe("FAILED");
      expect(executed.completedAt).not.toBeNull();
      expect(executed.errorMessage).toContain("AI assistance is currently disabled");

      // Verify task is NOT re-queued for retry
      const refreshedTask = await prisma.task.findUnique({ where: { id: task.id } });
      expect(refreshedTask?.status).toBe("FAILED");
    });
  });

  describe("4. 100% Functional Manual Content Lifecycle (Zero AI Credentials)", () => {
    it("executes an entire 10-stage publishing and learning lifecycle manually with ZERO AI keys", async () => {
      process.env.AI_DISABLED = "true";
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.GEMINI_API_KEY;

      const ts = Date.now() + Math.floor(Math.random() * 10000);

      // Setup Operator and Workspace
      const user = await prisma.user.create({
        data: {
          email: `manual-e2e-${ts}@mediaos.internal`,
          name: "Manual Master",
          passwordHash: "hash-manual",
          role: "OWNER",
        },
      });

      const ws = await prisma.workspace.create({
        data: {
          name: `Manual E2E WS ${ts}`,
          slug: `manual-e2e-ws-${ts}`,
          ownerId: user.id,
          members: { create: { userId: user.id, role: "OWNER" } },
        },
      });

      const brand = await prisma.brand.create({
        data: {
          workspaceId: ws.id,
          name: "Manual Tech Media",
          slug: `manual-tech-${ts}`,
          isDefault: true,
        },
      });

      const campaign = await prisma.campaign.create({
        data: {
          brandId: brand.id,
          title: `Full Manual Lifecycle ${ts}`,
          slug: `manual-lifecycle-${ts}`,
          stage: "PLANNING",
          priority: "HIGH",
        },
      });

      // 1. Manual Signal Scout
      const signal = await SignalScoutService.addManualSignal(
        ws.id,
        brand.id,
        {
          title: `Autonomous Reliability Shift ${ts}`,
          description: "Teams migrating from probabilistic scripts to verified manual control.",
          source: "Engineering Survey 2026",
          sourceUrl: "https://example.com/survey-2026",
          relevance: 95,
        },
        user.id
      );
      expect(signal.title).toContain("Autonomous Reliability Shift");

      // 2. Manual Research & Evidence
      const evidenceBundle = await EvidenceGraphService.addManualResearchBundle(
        ws.id,
        {
          campaignId: campaign.id,
          source: {
            title: "Production System Audit",
            url: "https://example.com/production-audit",
            trustScore: 92,
          },
          claim: {
            claimText: "Zero AI invocation guarantees $0 API spend.",
            confidence: 99,
            isFact: true,
          },
          evidence: {
            quoteSnippet: "Cost is strictly zero when all outbound provider calls are disabled.",
            supportStance: "SUPPORTS",
          },
        },
        user.id
      );
      expect(evidenceBundle.claim.verificationStatus).toBe("UNVERIFIED");

      // 3. Manual Strategy Formulation
      const strategy = await StrategistService.createManualStrategy(
        ws.id,
        campaign.id,
        {
          primaryHeadline: "The $0 AI Architecture",
          thesis: "Deterministic software beats probabilistic tool calling when cost and predictability matter.",
          targetReader: "CTOs and Lead Architects",
          desiredOutcome: "Predictability",
          centralTension: "Probabilistic vs Deterministic",
          flagshipFormat: "X_THREAD",
        },
        user.id
      );
      expect(strategy.primaryHeadline).toBe("The $0 AI Architecture");

      // 4. Manual Content Studio Draft
      const asset = await ContentStudioService.createManualDraft({
        workspaceId: ws.id,
        brandId: brand.id,
        campaignId: campaign.id,
        title: "Deterministic Operations Post",
        type: "X_THREAD",
        createdBy: user.id,
        initialBlocks: [
          {
            blockType: "HOOK",
            orderIndex: 0,
            content: "You don't need a monthly AI API bill to run a media engine.",
            statementType: "CLAIM",
          },
          {
            blockType: "BODY",
            orderIndex: 1,
            content: "MediaOS Phase 1-8 runs 100% manually with zero token consumption.",
            statementType: "FACT",
          },
        ],
      });
      expect(asset.versions.length).toBe(1);

      // Advance to READY_FOR_REVIEW
      await ContentStudioService.updateAssetStatus(asset.id, "EDITING", ws.id, user.id);
      await ContentStudioService.updateAssetStatus(asset.id, "READY_FOR_REVIEW", ws.id, user.id);

      // 5. Human Editorial Review
      const review = await EditorialReviewerService.performHumanReview({
        workspaceId: ws.id,
        assetId: asset.id,
        versionId: asset.versions[0].id,
        userId: user.id,
        verdict: "PASS",
        summary: "Verified 100% human-crafted content.",
      });
      expect(review.status).toBe("PASSED");
      expect(review.reviewerType).toBe("HUMAN");

      // 6. Mandatory Human Approval Gate
      const approval = await ApprovalService.approveVersion({
        workspaceId: ws.id,
        brandId: brand.id,
        assetId: asset.id,
        versionId: asset.versions[0].id,
        userId: user.id,
        comment: "Production manual sign-off approved.",
        reviewerType: "HUMAN_OPERATOR",
      });
      expect(approval.approvalRecord.action).toBe("HUMAN_APPROVED");
      expect(approval.asset.status).toBe("APPROVED");

      // 7. Manual Metric Snapshot
      const snapshotResult = await AnalyticsService.ingestMetricSnapshot(
        ws.id,
        {
          brandId: brand.id,
          campaignId: campaign.id,
          platform: "X",
          rawMetrics: {
            impressions: 25000,
            views: 12000,
            engagements: 1400,
            shares: 250,
            likes: 600,
            comments: 50,
            clicks: 100,
          },
        },
        user.id
      );
      expect(snapshotResult.snapshot).toBeDefined();
      expect(snapshotResult.snapshot.platform).toBe("X");

      // 8. Manual Learning Record
      const learning = await LearningEngineService.createManualLearning(
        ws.id,
        brand.id,
        {
          category: "AUDIENCE_PREFERENCE",
          sentiment: "POSITIVE",
          observation: "Manual deterministic technical posts outperform generic AI summaries by 3.2x.",
          hypothesis: "Technical readers value rigor and primary evidence over synthetic prose.",
          recommendation: "Continue manual evidence citation for all production pieces.",
          sampleSize: 12,
          confidence: 95,
          hasStatisticalProof: true,
        },
        user.id
      );
      expect(learning.sampleSize).toBe(12);
      expect(learning.statisticalSignificance).toBe("STATISTICALLY_SIGNIFICANT");

      // 9. Manual Strategy Recommendation
      const recommendation = await StrategyRecommendationService.createManualRecommendation(
        ws.id,
        {
          brandId: brand.id,
          learningId: learning.id,
          title: "Prioritize Manual Primary Sources",
          recommendation: "Cite direct peer-reviewed papers and primary repos.",
          rationale: "Highest conversion and trust observed in manual testing.",
          targetPillar: "Engineering",
        },
        user.id
      );
      expect(recommendation.status).toBe("PENDING");

      // Review and Accept Recommendation
      const acceptedRec = await StrategyRecommendationService.reviewRecommendation(
        ws.id,
        {
          recommendationId: recommendation.id,
          action: "ACCEPT",
          userId: user.id,
          reviewNotes: "Accepted for immediate editorial implementation",
        }
      );
      expect(acceptedRec.status).toBe("ACCEPTED");

      // 10. Human Publishing
      const connectedAccount = await prisma.connectedAccount.create({
        data: {
          workspaceId: ws.id,
          brandId: brand.id,
          platform: "X",
          accountId: `x-acc-${ts}`,
          accountName: "Manual Tech Operations",
          status: "ACTIVE",
          encryptedAccessToken: encryptToken("fake-token"),
        },
      });

      const pubResult = await PublishingService.publishAsset({
        workspaceId: ws.id,
        brandId: brand.id,
        assetId: asset.id,
        versionId: asset.versions[0].id,
        connectedAccountId: connectedAccount.id,
        platform: "X",
        userId: user.id,
        isAI: false,
      });

      expect(pubResult.publishingRecord.status).toBe("PUBLISHED");
      const publishedAsset = await prisma.contentAsset.findUnique({
        where: { id: asset.id },
      });
      expect(publishedAsset?.status).toBe("PUBLISHED");
    });
  });
});
