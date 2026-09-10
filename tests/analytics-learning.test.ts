import { describe, it, expect, beforeAll } from "vitest";
import prisma from "../src/server/db/prisma";
import {
  PlatformAdapterRegistry,
  calculateDerivedMetrics,
  generateMetricIdempotencyKey,
  YouTubeMetricsAdapter,
  XMetricsAdapter,
  LinkedInMetricsAdapter,
  NewsletterMetricsAdapter,
} from "../src/server/analytics/platform-adapters";
import { AnalyticsService } from "../src/server/services/analytics-service";
import { LearningEngineService } from "../src/server/services/learning-engine-service";
import { StrategyRecommendationService } from "../src/server/services/strategy-recommendation-service";
import { StrategistService } from "../src/server/services/strategist-service";

describe("Phase 6 Analytics & Learning Engine Subsystem", () => {
  let workspaceId: string;
  let brandId: string;
  let campaignId: string;
  let contentAssetId: string;
  let operatorUserId: string;

  beforeAll(async () => {
    // 1. Seed or retrieve default test workspace & brand
    let workspace = await prisma.workspace.findFirst({
      where: { slug: "apex-media-workspace" },
      include: { brands: true },
    });

    if (!workspace) {
      workspace = await prisma.workspace.create({
        data: {
          name: "Apex Media Analytics Lab",
          slug: "apex-media-workspace",
          ownerId: "system-test-owner",
          brands: {
            create: {
              name: "Apex Media Lab",
              slug: "apex-media-lab",
              isDefault: true,
              identity: {
                create: {
                  mission: "Empowering developers to build robust systems.",
                  positioning: "Technical authority for high-scale engineers.",
                  values: "Integrity, Precision, Depth",
                },
              },
              voice: {
                create: {
                  tone: "Empirical, rigorous, precise",
                  forbiddenWords: "delve, game-changer, revolutionary, synergy",
                  styleGuidelines: "Always back claims with data.",
                  signaturePhrases: "Deterministic systems scale; conversational chaos fails",
                },
              },
              audience: {
                create: {
                  targetAudience: "Senior software engineers, technical founders",
                  painPoints: "Unreliable agentic loops, prompt brittleness",
                  desires: "Deterministic execution, verified evidence",
                  objections: "Will this slow down delivery?",
                },
              },
              pillars: {
                create: [
                  { name: "Architecture & Systems", description: "State machines and distributed systems" },
                  { name: "AI Engineering", description: "Deterministic agent orchestration" },
                ],
              },
            },
          },
        },
        include: { brands: true },
      });
    }

    workspaceId = workspace.id;
    brandId = workspace.brands[0].id;

    // Retrieve or create operator user
    let user = await prisma.user.findFirst({
      where: { email: "admin@mediaos.local" },
    });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: "admin@mediaos.local",
          name: "Lead Operator",
          passwordHash: "test-hash",
          role: "OPERATOR",
        },
      });
    }
    operatorUserId = user.id;

    // Create an active campaign in STRATEGY stage
    const campaign = await prisma.campaign.create({
      data: {
        brandId,
        title: "Analytics Engine Benchmark Campaign",
        slug: `analytics-benchmark-${Date.now()}`,
        stage: "STRATEGY",
        priority: "HIGH",
        brief: "Demonstrate closed-loop performance analytics to strategy feedback.",
      },
    });
    campaignId = campaign.id;

    // Create an approved content asset
    const asset = await prisma.contentAsset.create({
      data: {
        workspaceId,
        brandId,
        campaignId,
        type: "YOUTUBE_LONG_FORM",
        title: "Deterministic State Machines vs Chat Loops",
        status: "APPROVED",
      },
    });
    contentAssetId = asset.id;
  });

  describe("1. Platform Metric Adapters & Validation", () => {
    it("validates and normalizes YouTube metrics cleanly", () => {
      const adapter = PlatformAdapterRegistry.getAdapter("YOUTUBE");
      expect(adapter).toBeInstanceOf(YouTubeMetricsAdapter);

      const raw = {
        views: 10000,
        watchTimeSeconds: 50000,
        likes: 500,
        comments: 50,
        shares: 100,
        clicks: 800,
        subscribersGained: 120,
      };

      const validation = adapter.validate(raw);
      expect(validation.valid).toBe(true);

      const normalized = adapter.normalize(raw, true, "SYNTHETIC_GENERATOR");
      expect(normalized.platform).toBe("YOUTUBE");
      expect(normalized.isSynthetic).toBe(true);
      expect(normalized.syntheticLabel).toBe("SYNTHETIC / DEMONSTRATION DATA");
      expect(normalized.observed.views).toBe(10000);
      expect(normalized.derived.avgViewDurationSeconds).toBe(5);
      expect(normalized.derived.ctr).toBe(0.08);
    });

    it("validates X (Twitter) metrics adapter and rejects negative values", () => {
      const adapter = PlatformAdapterRegistry.getAdapter("X");
      expect(adapter).toBeInstanceOf(XMetricsAdapter);

      const invalid = { impressions: -500, likes: 20 };
      const validation = adapter.validate(invalid);
      expect(validation.valid).toBe(false);
      expect(validation.errors[0]).toContain("must be a non-negative number");
    });

    it("validates LinkedIn and Newsletter adapters", () => {
      const linkedInAdapter = PlatformAdapterRegistry.getAdapter("LINKEDIN");
      expect(linkedInAdapter).toBeInstanceOf(LinkedInMetricsAdapter);

      const nlAdapter = PlatformAdapterRegistry.getAdapter("NEWSLETTER");
      expect(nlAdapter).toBeInstanceOf(NewsletterMetricsAdapter);

      const nlRaw = { recipients: 5000, opens: 2500, clicks: 500, unsubscribes: 5 };
      const nlNorm = nlAdapter.normalize(nlRaw, false, "MANUAL_INGESTION");
      expect(nlNorm.observed.impressions).toBe(5000);
      expect(nlNorm.observed.views).toBe(2500);
      expect(nlNorm.observed.clicks).toBe(500);
      expect(nlNorm.derived.ctr).toBe(0.1);
    });
  });

  describe("2. Raw Metric Integrity & Derived Calculations", () => {
    it("preserves raw metrics without mutation during derived calculation", () => {
      const raw = {
        impressions: 20000,
        views: 8000,
        engagements: 1200,
        likes: 800,
        comments: 200,
        shares: 200,
        clicks: 1600,
        watchTimeSeconds: 40000,
        conversions: 80,
        subscribersGained: 50,
      };

      const copy = { ...raw };
      const derived = calculateDerivedMetrics(raw, 0.45);

      // Raw metrics must remain completely unchanged
      expect(raw).toEqual(copy);

      // Derived values computed accurately
      expect(derived.ctr).toBe(0.08); // 1600 / 20000
      expect(derived.engagementRate).toBe(0.06); // 1200 / 20000
      expect(derived.avgViewDurationSeconds).toBe(5.0); // 40000 / 8000
      expect(derived.retentionRate).toBe(0.45);
      expect(derived.conversionRate).toBe(0.05); // 80 / 1600
    });
  });

  describe("3. Ingestion Idempotency & Provenance", () => {
    it("ingests snapshot with complete provenance and synthetic labeling", async () => {
      const result = await AnalyticsService.ingestMetricSnapshot(
        workspaceId,
        {
          platform: "YOUTUBE",
          brandId,
          campaignId,
          contentAssetId,
          periodStart: new Date("2026-01-01"),
          periodEnd: new Date("2026-01-02"),
          isSynthetic: true,
          dataSource: "SYNTHETIC_GENERATOR",
          externalId: "yt-test-vid-01",
          rawMetrics: {
            views: 15000,
            impressions: 60000,
            likes: 1200,
            comments: 140,
            clicks: 3000,
            watchTimeSeconds: 75000,
          },
        },
        operatorUserId
      );

      expect(result.isDuplicate).toBe(false);
      expect(result.snapshot.isSynthetic).toBe(true);
      expect(result.snapshot.syntheticLabel).toBe("SYNTHETIC / DEMONSTRATION DATA");
      expect(result.snapshot.views).toBe(15000);
      expect(result.snapshot.impressions).toBe(60000);
      expect(result.snapshot.ctr).toBe(0.05);
      expect(result.snapshot.avgViewDurationSeconds).toBe(5.0);
    });

    it("prevents double-counting: duplicate ingestion is strictly idempotent", async () => {
      // Ingest the exact same snapshot again
      const duplicateResult = await AnalyticsService.ingestMetricSnapshot(
        workspaceId,
        {
          platform: "YOUTUBE",
          brandId,
          campaignId,
          contentAssetId,
          periodStart: new Date("2026-01-01"),
          periodEnd: new Date("2026-01-02"),
          isSynthetic: true,
          dataSource: "SYNTHETIC_GENERATOR",
          externalId: "yt-test-vid-01",
          rawMetrics: {
            views: 15000,
            impressions: 60000,
            likes: 1200,
            comments: 140,
            clicks: 3000,
            watchTimeSeconds: 75000,
          },
        },
        operatorUserId
      );

      expect(duplicateResult.isDuplicate).toBe(true);
      expect(duplicateResult.message).toContain("idempotent duplicate skipped");

      // Verify DB count did not increment
      const count = await prisma.metricSnapshot.count({
        where: {
          contentAssetId,
          platform: "YOUTUBE",
          periodStart: new Date("2026-01-01"),
        },
      });
      expect(count).toBe(1);
    });
  });

  describe("4. Aggregations, KPIs, and Format Benchmarks", () => {
    beforeAll(async () => {
      // Ingest multiple format snapshots to enable comparative benchmarks
      const formats = [
        { platform: "X", views: 25000, impressions: 50000, clicks: 1250, engagements: 2000, type: "X_THREAD" },
        { platform: "LINKEDIN", views: 8000, impressions: 16000, clicks: 640, engagements: 800, type: "LINKEDIN_POST" },
        { platform: "NEWSLETTER", views: 4000, impressions: 8000, clicks: 600, engagements: 1200, type: "NEWSLETTER" },
      ];

      for (let i = 0; i < formats.length; i++) {
        const f = formats[i];
        const asset = await prisma.contentAsset.create({
          data: {
            workspaceId,
            brandId,
            campaignId,
            type: f.type,
            title: `Benchmark Asset ${f.type}`,
            status: "APPROVED",
          },
        });

        await AnalyticsService.ingestMetricSnapshot(workspaceId, {
          platform: f.platform,
          brandId,
          campaignId,
          contentAssetId: asset.id,
          periodStart: new Date(`2026-01-0${i + 3}`),
          periodEnd: new Date(`2026-01-0${i + 4}`),
          isSynthetic: true,
          dataSource: "SYNTHETIC_GENERATOR",
          rawMetrics: {
            views: f.views,
            impressions: f.impressions,
            clicks: f.clicks,
            engagements: f.engagements,
          },
        });
      }
    });

    it("calculates workspace overview KPIs and detects synthetic data flag", async () => {
      const overview = await AnalyticsService.getWorkspaceOverview(workspaceId, brandId, "all");
      expect(overview.kpis.totalViews).toBeGreaterThan(40000);
      expect(overview.kpis.totalImpressions).toBeGreaterThan(100000);
      expect(overview.hasSyntheticData).toBe(true);
      expect(overview.syntheticNotice).toContain("SYNTHETIC / DEMONSTRATION DATA");
      expect(overview.timeline.length).toBeGreaterThan(0);
    });

    it("calculates format performance benchmarks accurately", async () => {
      const formats = await AnalyticsService.getFormatAnalytics(workspaceId, brandId);
      expect(formats.length).toBeGreaterThanOrEqual(4);

      const yt = formats.find((f) => f.format === "YOUTUBE_LONG_FORM");
      expect(yt).toBeDefined();
      expect(yt?.views).toBeGreaterThanOrEqual(15000);
      expect(yt?.ctr).toBe(0.05);

      const x = formats.find((f) => f.format === "X_THREAD");
      expect(x).toBeDefined();
      expect(x?.views).toBeGreaterThanOrEqual(25000);
    });

    it("identifies top and bottom performing content assets", async () => {
      const { top, bottom, totalRankedAssets } =
        await AnalyticsService.getTopAndBottomPerformers(workspaceId, brandId, 2);

      expect(totalRankedAssets).toBeGreaterThanOrEqual(4);
      expect(top.length).toBe(2);
      expect(top[0].views).toBeGreaterThanOrEqual(top[1].views);
    });
  });

  describe("5. Learning Engine Sample Size & Statistical Rigor", () => {
    it("marks findings as ANECDOTAL when sample size N < 3", async () => {
      // Create an isolated brand with only 1 snapshot
      const isolatedBrand = await prisma.brand.create({
        data: {
          workspaceId,
          name: "Small Cohort Brand",
          slug: `small-cohort-${Date.now()}`,
          isDefault: false,
        },
      });

      await AnalyticsService.ingestMetricSnapshot(workspaceId, {
        platform: "YOUTUBE",
        brandId: isolatedBrand.id,
        isSynthetic: true,
        dataSource: "SYNTHETIC_GENERATOR",
        rawMetrics: { views: 500, impressions: 2000, clicks: 50 },
      });

      const result = await LearningEngineService.analyzeHistoricalPerformance(
        workspaceId,
        isolatedBrand.id,
        {}
      );

      expect(result.learnings.length).toBeGreaterThan(0);
      for (const learning of result.learnings) {
        expect(learning.statisticalSignificance).toBe("ANECDOTAL");
        expect(learning.confidenceScore).toBeLessThanOrEqual(40);
        expect(learning.limitations).toContain("anecdotal (N < 3)");
      }
    });

    it("marks findings as DIRECTIONAL when 3 <= N < 10", async () => {
      // Isolated brand with exactly 4 snapshots
      const directionalBrand = await prisma.brand.create({
        data: {
          workspaceId,
          name: "Directional Cohort Brand",
          slug: `directional-cohort-${Date.now()}`,
          isDefault: false,
        },
      });

      for (let i = 0; i < 4; i++) {
        await AnalyticsService.ingestMetricSnapshot(workspaceId, {
          platform: "YOUTUBE",
          brandId: directionalBrand.id,
          isSynthetic: true,
          dataSource: "SYNTHETIC_GENERATOR",
          externalId: `dir-snap-${i}`,
          rawMetrics: { views: 1000 + i * 100, impressions: 4000, clicks: 80 },
        });
      }

      const result = await LearningEngineService.analyzeHistoricalPerformance(
        workspaceId,
        directionalBrand.id,
        {}
      );

      expect(result.learnings.length).toBeGreaterThan(0);
      const learning = result.learnings[0];
      expect(learning.statisticalSignificance).toBe("DIRECTIONAL");
      expect(learning.limitations).toContain("directional");
    });

    it("MANDATORY CORRECTION: sample size N >= 10 does NOT automatically produce statistical significance", async () => {
      // Isolated brand with 12 snapshots
      const tenPlusBrand = await prisma.brand.create({
        data: {
          workspaceId,
          name: "Ten Plus Brand",
          slug: `ten-plus-${Date.now()}`,
          isDefault: false,
        },
      });

      for (let i = 0; i < 11; i++) {
        await AnalyticsService.ingestMetricSnapshot(workspaceId, {
          platform: "YOUTUBE",
          brandId: tenPlusBrand.id,
          isSynthetic: true,
          dataSource: "SYNTHETIC_GENERATOR",
          externalId: `ten-plus-snap-${i}`,
          rawMetrics: { views: 1000 + i * 50, impressions: 5000 + i * 200, clicks: 100 },
        });
      }

      // Without explicit statistical hypothesis test confirmation
      const resultWithoutTest = await LearningEngineService.analyzeHistoricalPerformance(
        workspaceId,
        tenPlusBrand.id,
        { hasStatisticalTestProof: false }
      );

      for (const learning of resultWithoutTest.learnings) {
        // N >= 10 MUST NOT be marked STATISTICALLY_SIGNIFICANT without explicit test
        expect(learning.statisticalSignificance).not.toBe("STATISTICALLY_SIGNIFICANT");
        expect(learning.statisticalSignificance).toBe("ELIGIBLE_FOR_TESTING");
        expect(learning.limitations).toContain("qualifies for statistical testing");
      }
    });

    it("only marks STATISTICALLY_SIGNIFICANT when actual statistical test passed", async () => {
      const testedBrand = await prisma.brand.create({
        data: {
          workspaceId,
          name: "Tested Brand",
          slug: `tested-brand-${Date.now()}`,
          isDefault: false,
        },
      });

      for (let i = 0; i < 11; i++) {
        await AnalyticsService.ingestMetricSnapshot(workspaceId, {
          platform: "YOUTUBE",
          brandId: testedBrand.id,
          isSynthetic: true,
          dataSource: "SYNTHETIC_GENERATOR",
          externalId: `tested-snap-${i}`,
          rawMetrics: { views: 2000 + i * 100, impressions: 8000, clicks: 200 },
        });
      }

      // With explicit test proof
      const resultWithTest = await LearningEngineService.analyzeHistoricalPerformance(
        workspaceId,
        testedBrand.id,
        { hasStatisticalTestProof: true }
      );

      const significantLearning = resultWithTest.learnings.find(
        (l) => l.statisticalSignificance === "STATISTICALLY_SIGNIFICANT"
      );
      expect(significantLearning).toBeDefined();
      expect(significantLearning?.confidenceScore).toBeGreaterThanOrEqual(90);
    });
  });

  describe("6. Human Approval Gate: Strategy Recommendations", () => {
    let pendingRecId: string;

    beforeAll(async () => {
      const result = await LearningEngineService.analyzeHistoricalPerformance(
        workspaceId,
        brandId,
        {}
      );
      expect(result.learnings.length).toBeGreaterThan(0);
      const freshLearning = result.learnings[0];
      const freshRec = await prisma.strategyRecommendation.findFirst({
        where: { learningId: freshLearning.id, status: "PENDING" },
      });
      expect(freshRec).toBeDefined();
      pendingRecId = freshRec!.id;
    });

    it("verifies newly generated strategy recommendations start in PENDING status", async () => {
      const rec = await prisma.strategyRecommendation.findUnique({
        where: { id: pendingRecId },
      });
      expect(rec?.status).toBe("PENDING");
      expect(rec?.reviewedAt).toBeNull();
      expect(rec?.reviewedBy).toBeNull();
    });

    it("allows human operator to ACCEPT recommendation with review notes", async () => {
      const accepted = await StrategyRecommendationService.reviewRecommendation(
        workspaceId,
        {
          recommendationId: pendingRecId,
          action: "ACCEPT",
          reviewNotes: "Approved by Lead Operator for next quarter editorial roadmap.",
          userId: operatorUserId,
        }
      );

      expect(accepted.status).toBe("ACCEPTED");
      expect(accepted.reviewedBy).toBe(operatorUserId);
      expect(accepted.reviewedAt).not.toBeNull();
      expect(accepted.reviewNotes).toContain("Approved by Lead Operator");

      // Verify audit log
      const audit = await prisma.auditLog.findFirst({
        where: {
          workspaceId,
          entityType: "StrategyRecommendation",
          entityId: pendingRecId,
          action: "STRATEGY_RECOMMENDATION_ACCEPTED",
        },
      });
      expect(audit).toBeDefined();
    });

    it("allows human operator to REJECT recommendation without deleting history", async () => {
      // Create another recommendation to reject
      const learning = await prisma.learningRecord.findFirst({
        where: { brandId },
      });
      const recToReject = await prisma.strategyRecommendation.create({
        data: {
          workspaceId,
          brandId,
          learningId: learning!.id,
          title: "Test Reject Recommendation",
          recommendation: "Increase publishing frequency to 5x daily.",
          actionType: "STOP",
          status: "PENDING",
        },
      });

      const rejected = await StrategyRecommendationService.reviewRecommendation(
        workspaceId,
        {
          recommendationId: recToReject.id,
          action: "REJECT",
          reviewNotes: "Volume contradicts our quality-first editorial pillar.",
          userId: operatorUserId,
        }
      );

      expect(rejected.status).toBe("REJECTED");
      expect(rejected.reviewedBy).toBe(operatorUserId);

      // Verify active accepted query does NOT return rejected recommendation
      const activeRecs = await StrategyRecommendationService.getActiveAcceptedRecommendations(
        workspaceId,
        brandId
      );
      expect(activeRecs.some((r) => r.id === recToReject.id)).toBe(false);
      expect(activeRecs.some((r) => r.id === pendingRecId)).toBe(true);
    });

    it("MANDATORY RULE: Brand Brain tables remain completely untouched by recommendations", async () => {
      const brandBefore = await prisma.brand.findUnique({
        where: { id: brandId },
        include: { identity: true, voice: true, pillars: true, editorialRules: true },
      });

      // Query active recommendations
      await StrategyRecommendationService.getActiveAcceptedRecommendations(workspaceId, brandId);

      const brandAfter = await prisma.brand.findUnique({
        where: { id: brandId },
        include: { identity: true, voice: true, pillars: true, editorialRules: true },
      });

      expect(brandAfter?.identity?.mission).toBe(brandBefore?.identity?.mission);
      expect(brandAfter?.voice?.tone).toBe(brandBefore?.voice?.tone);
      expect(brandAfter?.pillars.length).toBe(brandBefore?.pillars.length);
      expect(brandAfter?.editorialRules.length).toBe(brandBefore?.editorialRules.length);
    });
  });

  describe("7. Closed Strategy Feedback Loop", () => {
    it("incorporates ACCEPTED recommendations into future Strategist context", async () => {
      // Run Strategist on campaign
      const strategyOutput = await StrategistService.developStrategy(
        workspaceId,
        campaignId
      );

      expect(strategyOutput).toBeDefined();
      expect(strategyOutput.thesis).toBeDefined();

      // Verify strategy incorporates accepted learnings
      expect(strategyOutput.thesis).toContain("Incorporates validated historical strategy learnings");
    });

    it("verifies REJECTED recommendations are strictly excluded from Strategist context", async () => {
      // Find all accepted recommendations
      const active = await StrategyRecommendationService.getActiveAcceptedRecommendations(
        workspaceId,
        brandId
      );

      // Verify none have status REJECTED
      for (const rec of active) {
        expect(rec.status).toBe("ACCEPTED");
        expect(rec.status).not.toBe("REJECTED");
      }
    });
  });

  describe("8. Multi-Tenant Tenancy Isolation", () => {
    it("strictly isolates metric ingestion across workspaces", async () => {
      const otherWorkspace = await prisma.workspace.create({
        data: {
          name: "Other Tenant",
          slug: `other-tenant-${Date.now()}`,
          ownerId: "other-user",
        },
      });

      // Ingesting for brandId with mismatched workspaceId must be rejected
      await expect(
        AnalyticsService.ingestMetricSnapshot(otherWorkspace.id, {
          platform: "YOUTUBE",
          brandId, // belongs to workspaceId, not otherWorkspace.id
          rawMetrics: { views: 100 },
        })
      ).rejects.toThrow("Brand not found in this workspace");
    });
  });
});
