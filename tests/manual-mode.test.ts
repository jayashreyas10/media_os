import { describe, it, expect, beforeAll, afterAll } from "vitest";
import prisma from "@/server/db/prisma";
import { SignalScoutService } from "@/server/services/signal-scout-service";
import { EvidenceGraphService, validateAndNormalizeUrl } from "@/server/services/evidence-graph-service";
import { StrategistService } from "@/server/services/strategist-service";
import { ContentStudioService } from "@/server/services/content-studio-service";
import { EditorialReviewerService } from "@/server/services/editorial-reviewer-service";
import { ApprovalService } from "@/server/services/approval-service";
import { AnalyticsService } from "@/server/services/analytics-service";
import { LearningEngineService } from "@/server/services/learning-engine-service";
import { StrategyRecommendationService } from "@/server/services/strategy-recommendation-service";
import { PublishingService } from "@/server/services/publishing-service";
import { ProviderFactory, AIDisabledError } from "@/server/ai/provider-factory";
import { encryptToken } from "@/server/security/encryption";
import { BrandBrainService } from "@/server/services/brand-brain-service";
import { AuthorizationError } from "@/server/auth/authorization-guard";

describe("MediaOS — AI-Optional / Fully Manual Operating Mode", () => {
  let wsAId: string;
  let wsBId: string;
  let brandAId: string;
  let brandBId: string;
  let userAId: string;
  let userBId: string;
  let campaignAId: string;
  let connectedAccountId: string;
  const originalAiMode = process.env.AI_MODE;

  beforeAll(async () => {
    const timestamp = Date.now();

    // 1. Setup Tenant Alpha
    const wsA = await prisma.workspace.create({
      data: {
        name: `Manual Mode WS Alpha ${timestamp}`,
        slug: `manual-ws-alpha-${timestamp}`,
        ownerId: `owner-alpha-${timestamp}`,
      },
    });
    wsAId = wsA.id;

    const userA = await prisma.user.create({
      data: {
        email: `operator-alpha-${timestamp}@manual.test`,
        name: "Alpha Human Operator",
        passwordHash: "hash-alpha",
        role: "OPERATOR",
      },
    });
    userAId = userA.id;

    await prisma.workspaceMember.create({
      data: {
        workspaceId: wsAId,
        userId: userAId,
        role: "OWNER",
      },
    });

    const brandA = await prisma.brand.create({
      data: {
        workspaceId: wsAId,
        name: "Alpha Brand Media",
        slug: `alpha-brand-${timestamp}`,
        isDefault: true,
      },
    });
    brandAId = brandA.id;

    // Seed Brand Brain
    await BrandBrainService.createContentPillar({
      workspaceId: wsAId,
      name: "Deterministic Engineering",
      description: "Focus on explicit state machines and reproducible software.",
      targetRatio: 60,
    });

    // Setup Campaign for Tenant Alpha
    const campaignA = await prisma.campaign.create({
      data: {
        brandId: brandAId,
        title: "Deterministic AI Infrastructure",
        slug: `deterministic-ai-infra-${timestamp}`,
        stage: "RESEARCH",
        priority: "HIGH",
      },
    });
    campaignAId = campaignA.id;

    // Connected Account for Tenant Alpha
    const encryptedToken = encryptToken("mock-access-token-alpha-12345");
    const account = await prisma.connectedAccount.create({
      data: {
        workspaceId: wsAId,
        brandId: brandAId,
        platform: "X",
        accountName: "TechOperatorX",
        accountId: "x-operator-100",
        encryptedAccessToken: encryptedToken,
        status: "ACTIVE",
      },
    });
    connectedAccountId = account.id;

    // 2. Setup Tenant Beta (for cross-tenant isolation checks)
    const wsB = await prisma.workspace.create({
      data: {
        name: `Manual Mode WS Beta ${timestamp}`,
        slug: `manual-ws-beta-${timestamp}`,
        ownerId: `owner-beta-${timestamp}`,
      },
    });
    wsBId = wsB.id;

    const userB = await prisma.user.create({
      data: {
        email: `operator-beta-${timestamp}@manual.test`,
        name: "Beta Human Operator",
        passwordHash: "hash-beta",
        role: "OPERATOR",
      },
    });
    userBId = userB.id;

    const brandB = await prisma.brand.create({
      data: {
        workspaceId: wsBId,
        name: "Beta Brand Media",
        slug: `beta-brand-${timestamp}`,
        isDefault: true,
      },
    });
    brandBId = brandB.id;
  });

  afterAll(async () => {
    process.env.AI_MODE = originalAiMode;
  });

  // =========================================================================
  // 1. SIGNAL SCOUT — MANUAL MODE
  // =========================================================================
  describe("1. Signal Scout — Manual Mode", () => {
    it("creates manual signal with valid data and persists with isManual: true", async () => {
      const signal = await SignalScoutService.addManualSignal(
        wsAId,
        brandAId,
        {
          title: "Anthropic Releases Claude 3.5 Sonnet Artifacts Architecture",
          description: "Detailed postmortem on deterministic sandboxed rendering for generative UI.",
          sourceUrl: "https://anthropic.com/news/claude-artifacts",
          notes: "How sandboxed runtimes redefine security in agentic assistants.",
        },
        userAId
      );

      expect(signal).toBeDefined();
      expect(signal.id).toBeDefined();
      expect(signal.isManual).toBe(true);
      expect(signal.workspaceId).toBe(wsAId);
      expect(signal.brandId).toBe(brandAId);

      // Verify audit log
      const audit = await prisma.auditLog.findFirst({
        where: {
          workspaceId: wsAId,
          action: "MANUAL_SIGNAL_CREATED",
          entityId: signal.id,
        },
      });
      expect(audit).toBeDefined();
    });

    it("strictly isolates manual signals between workspaces", async () => {
      const signalA = await SignalScoutService.addManualSignal(
        wsAId,
        brandAId,
        {
          title: "Confidential Internal Alpha Signal",
          description: "Proprietary benchmark findings.",
        },
        userAId
      );

      // Tenant Beta queries its signals
      const signalsBeta = await prisma.knowledgeItem.findMany({
        where: { workspaceId: wsBId, tags: { contains: "signal" } },
      });

      expect(signalsBeta.find((s) => s.id === signalA.id)).toBeUndefined();
    });

    it("validates and normalizes URLs, rejecting javascript: schemes", async () => {
      expect(() => {
        validateAndNormalizeUrl("javascript:alert(document.cookie)");
      }).toThrow(/unsafe URL scheme/i);

      expect(() => {
        validateAndNormalizeUrl("file:///etc/passwd");
      }).toThrow(/unsafe URL scheme/i);

      const normalized = validateAndNormalizeUrl("https://EXAMPLE.com:443/test/path/");
      expect(normalized).toBe("https://example.com/test/path/");
    });

    it("rejects manual signal creation with empty title or content", async () => {
      await expect(
        SignalScoutService.addManualSignal(
          wsAId,
          brandAId,
          {
            title: "",
            description: "Content with empty title",
          },
          userAId
        )
      ).rejects.toThrow("Signal title is required");
    });
  });

  // =========================================================================
  // 2. RESEARCH & EVIDENCE GRAPH — MANUAL MODE
  // =========================================================================
  describe("2. Research & Evidence Graph — Manual Mode", () => {
    it("creates manual source + claim + evidence bundle with UNVERIFIED default", async () => {
      const bundle = await EvidenceGraphService.addManualResearchBundle(
        wsAId,
        {
          campaignId: campaignAId,
          source: {
            title: "Formal Verification of Distributed Consensus Protocols",
            url: "https://arxiv.org/abs/2401.00001",
            author: "Dr. Leslie Lamport",
            publisher: "ACM Transactions",
            trustScore: 95,
          },
          claim: {
            claimText: "TLA+ specifications reduce concurrent race-condition defects by over 70% in production.",
            confidence: 90,
            isFact: true,
          },
          evidence: {
            quoteSnippet: "Across 4 enterprise distributed systems, formal verification eliminated 72% of concurrency faults.",
            context: "Section 4 Empirical Evaluation",
            pageOrTimestamp: "p. 14",
            supportStance: "SUPPORTS",
          },
        },
        userAId
      );

      expect(bundle.source).toBeDefined();
      expect(bundle.claim).toBeDefined();
      expect(bundle.evidence).toBeDefined();

      // INVARIANT: Human claims default UNCONDITIONALLY to UNVERIFIED
      expect(bundle.claim.verificationStatus).toBe("UNVERIFIED");

      // Verify in database
      const dbClaim = await prisma.claim.findUnique({
        where: { id: bundle.claim.id },
      });
      expect(dbClaim?.verificationStatus).toBe("UNVERIFIED");

      // Evidence grounding check (unverified because source had no rawContent)
      expect(bundle.evidence?.isQuoteVerified).toBe(false);
      expect(bundle.evidence?.supportStance).toBe("SUPPORTS");
    });

    it("rejects manual source with invalid URL scheme", async () => {
      await expect(
        EvidenceGraphService.addManualResearchBundle(
          wsAId,
          {
            campaignId: campaignAId,
            source: {
              title: "Malicious Exploit Paper",
              url: "data:text/html,<script>alert(1)</script>",
            },
            claim: {
              claimText: "Some claim text.",
            },
          },
          userAId
        )
      ).rejects.toThrow(/unsafe URL scheme/i);
    });
  });

  // =========================================================================
  // 3. STRATEGY — MANUAL MODE
  // =========================================================================
  describe("3. Content Strategy — Manual Mode", () => {
    it("creates manual strategy with custom thesis, pillars, and audience", async () => {
      const strategy = await StrategistService.createManualStrategy(
        wsAId,
        campaignAId,
        {
          primaryHeadline: "Why Explicit State Machines Will Replace LLM Orchestration Chains",
          thesis: "Autonomous agents require mathematical transition guarantees, not probabilistic loop retries.",
          targetReader: "Principal AI Engineers and Infrastructure Leads",
          desiredOutcome: "Architectural shift towards deterministic state machine orchestration.",
          centralTension: "Probabilistic flexibility vs production reliability.",
          whyNow: "Agent workflows are failing in production due to lack of transition boundaries.",
          flagshipFormat: "YOUTUBE_LONG_FORM",
          distributionEntryPoints: ["X Thread", "Newsletter Deep-Dive"],
          keySections: [
            {
              title: "The Production Fragility Crisis",
              keyPoints: ["Chains fail silently", "Exponential retry explosions"],
            },
            {
              title: "Deterministic State Machines",
              keyPoints: ["Explicit transition DAGs", "Formal boundary audits"],
            },
          ],
        },
        userAId
      );

      expect(strategy).toBeDefined();
      expect(strategy.primaryHeadline).toBe("Why Explicit State Machines Will Replace LLM Orchestration Chains");
      expect(strategy.metadata?.isManual).toBe(true);

      // Verify campaign state updated to STRATEGY
      const updatedCampaign = await prisma.campaign.findUnique({
        where: { id: campaignAId },
      });
      expect(updatedCampaign?.stage).toBe("STRATEGY");
    });

    it("preserves Brand Brain without silent mutations during manual strategy creation", async () => {
      const brainBefore = await BrandBrainService.getBrandBrain(wsAId, brandAId);
      const pillarCountBefore = brainBefore.pillars.length;

      await StrategistService.createManualStrategy(
        wsAId,
        campaignAId,
        {
          primaryHeadline: "Another Manual Strategy Test",
          thesis: "Advisory-only guidance check.",
          targetReader: "Developers",
          desiredOutcome: "Clarity",
          centralTension: "Speed vs Safety",
          flagshipFormat: "X_THREAD",
        },
        userAId
      );

      const brainAfter = await BrandBrainService.getBrandBrain(wsAId, brandAId);
      expect(brainAfter.pillars.length).toBe(pillarCountBefore);
    });
  });

  // =========================================================================
  // 4. CONTENT STUDIO & WRITER — MANUAL MODE
  // =========================================================================
  describe("4. Content Studio & Writer — Manual Mode", () => {
    let createdAssetId: string;

    it("creates blank draft with standard blocks and bumps version to v1", async () => {
      const asset = await ContentStudioService.createManualDraft({
        workspaceId: wsAId,
        brandId: brandAId,
        campaignId: campaignAId,
        title: "The Architectural Blueprint for Deterministic Agents",
        type: "YOUTUBE_LONG_FORM",
        createdBy: userAId,
        initialBlocks: [
          {
            blockType: "HOOK",
            orderIndex: 0,
            title: "Opening Thesis Hook",
            content: "Every production LLM chain is a ticking latency timebomb.",
            statementType: "OPINION",
          },
          {
            blockType: "CORE_ARGUMENT",
            orderIndex: 1,
            title: "State Machine Invariant",
            content: "State machines guarantee transition correctness by making illegal states unrepresentable.",
            statementType: "CLAIM",
          },
          {
            blockType: "CALL_TO_ACTION",
            orderIndex: 2,
            title: "Conclusion & Framework",
            content: "Download the open-source deterministic state machine runtime on GitHub.",
            statementType: "GENERAL",
          },
        ],
      });

      expect(asset).toBeDefined();
      expect(asset.status).toBe("DRAFT");
      expect(asset.versions.length).toBe(1);
      expect(asset.versions[0].versionNumber).toBe(1);
      expect(asset.versions[0].blocks.length).toBe(3);

      createdAssetId = asset.id;
    });

    it("edits blocks manually, bumping version from v1 to v2", async () => {
      const v2 = await ContentStudioService.editContentBlocks({
        workspaceId: wsAId,
        assetId: createdAssetId,
        userId: userAId,
        changeSummary: "Refined hook and added empirical metrics to argument block.",
        blocks: [
          {
            blockType: "HOOK",
            orderIndex: 0,
            title: "Revised Opening Hook",
            content: "In 2026, probabilistic agent loops are the single largest source of cloud waste.",
            statementType: "OPINION",
          },
          {
            blockType: "CORE_ARGUMENT",
            orderIndex: 1,
            title: "Empirical Proof",
            content: "State machines reduce unhandled edge cases by 94% across 10,000 runs.",
            statementType: "CLAIM",
          },
          {
            blockType: "CALL_TO_ACTION",
            orderIndex: 2,
            title: "Conclusion",
            content: "Inspect the repository and deploy the deterministic operator.",
            statementType: "GENERAL",
          },
        ],
      });

      expect(v2.versionNumber).toBe(2);
      expect(v2.blocks[0].content).toContain("probabilistic agent loops");

      const asset = await prisma.contentAsset.findUnique({
        where: { id: createdAssetId },
      });
      expect(asset?.currentVersionId).toBe(v2.id);
    });

    it("subsequent edit strictly invalidates prior approval", async () => {
      // 1. Advance asset to READY_FOR_REVIEW
      await ContentStudioService.updateAssetStatus(createdAssetId, "READY_FOR_REVIEW", wsAId, userAId);

      // 2. Perform Editorial Review PASS
      const assetBefore = await prisma.contentAsset.findUnique({ where: { id: createdAssetId } });
      await EditorialReviewerService.performHumanReview({
        workspaceId: wsAId,
        assetId: createdAssetId,
        versionId: assetBefore!.currentVersionId!,
        userId: userAId,
        verdict: "PASS",
        summary: "Manual editorial review pass.",
      });

      // 3. Human Approval Gate
      await ApprovalService.approveVersion({
        workspaceId: wsAId,
        brandId: brandAId,
        assetId: createdAssetId,
        versionId: assetBefore!.currentVersionId!,
        userId: userAId,
        comment: "Signed off for publication.",
        reviewerType: "HUMAN_OPERATOR",
      });

      const approvedAsset = await prisma.contentAsset.findUnique({ where: { id: createdAssetId } });
      expect(approvedAsset?.status).toBe("APPROVED");

      // 4. Human makes subsequent edit -> MUST invalidate approval and bump to v3
      const v3 = await ContentStudioService.editContentBlocks({
        workspaceId: wsAId,
        assetId: createdAssetId,
        userId: userAId,
        changeSummary: "Post-approval emergency edit: updated URL.",
        blocks: [
          {
            blockType: "HOOK",
            orderIndex: 0,
            title: "Post-approval edited hook",
            content: "Updated content after approval.",
            statementType: "OPINION",
          },
        ],
      });

      expect(v3.versionNumber).toBe(3);

      const editedAsset = await prisma.contentAsset.findUnique({ where: { id: createdAssetId } });
      // Invariant: Status reverts to EDITING, NOT APPROVED
      expect(editedAsset?.status).toBe("EDITING");
    });
  });

  // =========================================================================
  // 5. EDITORIAL REVIEW & REVISION REQUESTS — MANUAL MODE
  // =========================================================================
  describe("5. Editorial Review — Manual Mode", () => {
    let reviewAssetId: string;
    let reviewVersionId: string;

    beforeAll(async () => {
      const asset = await ContentStudioService.createManualDraft({
        workspaceId: wsAId,
        brandId: brandAId,
        campaignId: campaignAId,
        title: "Editorial Review Manual Workflow Asset",
        type: "NEWSLETTER",
        createdBy: userAId,
        initialBlocks: [
          {
            blockType: "BODY",
            orderIndex: 0,
            content: "Draft content awaiting human editorial review.",
            statementType: "GENERAL",
          },
        ],
      });
      reviewAssetId = asset.id;
      reviewVersionId = asset.versions[0].id;
    });

    it("human review with PASS verdict sets REVIEW_PASSED, NOT APPROVED (mandatory invariant)", async () => {
      const review = await EditorialReviewerService.performHumanReview({
        workspaceId: wsAId,
        assetId: reviewAssetId,
        versionId: reviewVersionId,
        userId: userAId,
        verdict: "PASS",
        summary: "Human editor verified all claims and structure.",
        scores: { overallScore: 92 },
      });

      expect(review.verdict).toBe("PASS");
      expect(review.status).toBe("PASSED");
      expect(review.reviewerType).toBe("HUMAN");

      const asset = await prisma.contentAsset.findUnique({ where: { id: reviewAssetId } });
      // INVARIANT: Review PASS sets REVIEW_PASSED, NEVER APPROVED
      expect(asset?.status).toBe("REVIEW_PASSED");
      expect(asset?.status).not.toBe("APPROVED");
    });

    it("human review with REQUEST_REVISION creates open RevisionRequests and sets REVISION_REQUIRED", async () => {
      const review = await EditorialReviewerService.performHumanReview({
        workspaceId: wsAId,
        assetId: reviewAssetId,
        versionId: reviewVersionId,
        userId: userAId,
        verdict: "REQUEST_REVISION",
        summary: "Needs stronger hook and primary source citations.",
        findings: [
          {
            category: "HOOK_STRENGTH",
            severity: "MAJOR",
            description: "First paragraph lacks urgency",
            recommendation: "Rewrite first paragraph to highlight real-world downtime costs.",
          },
          {
            category: "EVIDENCE_GROUNDING",
            severity: "CRITICAL",
            description: "Ungrounded benchmark data",
            recommendation: "Ground benchmark numbers in empirical study.",
          },
        ],
      });

      expect(review.verdict).toBe("REQUEST_REVISION");
      expect(review.status).toBe("REVISION_REQUIRED");
      expect(review.revisionRequests.length).toBe(2);
      expect(review.revisionRequests[0].status).toBe("OPEN");

      const asset = await prisma.contentAsset.findUnique({ where: { id: reviewAssetId } });
      expect(asset?.status).toBe("REVISION_REQUIRED");
    });

    it("human approval gate is strictly required before publishing", async () => {
      // Trying to publish an asset in REVISION_REQUIRED or REVIEW_PASSED without human approval fails
      await expect(
        PublishingService.publishAsset({
          workspaceId: wsAId,
          brandId: brandAId,
          assetId: reviewAssetId,
          versionId: reviewVersionId,
          connectedAccountId,
          platform: "X",
          userId: userAId,
        })
      ).rejects.toThrow(/It must be in "APPROVED" status/);
    });
  });

  // =========================================================================
  // 6. ANALYTICS — MANUAL MODE
  // =========================================================================
  describe("6. Analytics Engine — Manual Mode", () => {
    it("manual metrics ingestion creates immutable MetricSnapshot", async () => {
      const snapshotResult = await AnalyticsService.ingestMetricSnapshot(
        wsAId,
        {
          platform: "X",
          brandId: brandAId,
          isSynthetic: false,
          rawMetrics: {
            impressions: 25000,
            views: 12000,
            engagements: 980,
            clicks: 450,
            shares: 65,
            likes: 520,
            comments: 42,
            watchTimeSeconds: 0,
          },
        },
        userAId
      );

      expect(snapshotResult.snapshot).toBeDefined();
      expect(snapshotResult.snapshot.impressions).toBe(25000);
      expect(snapshotResult.snapshot.views).toBe(12000);
      expect(snapshotResult.snapshot.isSynthetic).toBe(false);

      // Verify idempotency: re-ingesting duplicate with same day returns existing record
      const dup = await AnalyticsService.ingestMetricSnapshot(
        wsAId,
        {
          platform: "X",
          brandId: brandAId,
          isSynthetic: false,
          rawMetrics: {
            impressions: 25000,
            views: 12000,
            engagements: 980,
            clicks: 450,
            shares: 65,
            likes: 520,
            comments: 42,
            watchTimeSeconds: 0,
          },
        },
        userAId
      );

      expect(dup.snapshot.id).toBe(snapshotResult.snapshot.id);
      expect(dup.isDuplicate).toBe(true);
    });
  });

  // =========================================================================
  // 7. LEARNING ENGINE & RECOMMENDATIONS — MANUAL MODE
  // =========================================================================
  describe("7. Learning Engine — Manual Mode", () => {
    it("evaluates sampleSize < 3 as ANECDOTAL", async () => {
      const learning = await LearningEngineService.createManualLearning(
        wsAId,
        brandAId,
        {
          category: "FORMAT_PREFERENCE",
          sentiment: "WINNING",
          observation: "Short form technical diagrams get 3x shares.",
          hypothesis: "Engineers share architectural schematics over text.",
          sampleSize: 2,
          confidenceScore: 60,
        },
        userAId
      );

      expect(learning.statisticalSignificance).toBe("ANECDOTAL");
    });

    it("evaluates 3 <= sampleSize < 10 as DIRECTIONAL", async () => {
      const learning = await LearningEngineService.createManualLearning(
        wsAId,
        brandAId,
        {
          category: "RETENTION_HOOK",
          sentiment: "WINNING",
          observation: "Question-based hooks retain audience for 45s longer.",
          hypothesis: "Provocative questions hook reader curiosity.",
          sampleSize: 7,
          confidenceScore: 78,
        },
        userAId
      );

      expect(learning.statisticalSignificance).toBe("DIRECTIONAL");
    });

    it("evaluates sampleSize >= 10 as STATISTICALLY_SIGNIFICANT", async () => {
      const learning = await LearningEngineService.createManualLearning(
        wsAId,
        brandAId,
        {
          category: "AUDIENCE_RESONANCE",
          sentiment: "WINNING",
          observation: "Deep dive code walkthroughs convert at 8.2% vs 2.1% benchmark.",
          hypothesis: "Practical code implementation establishes decisive trust.",
          sampleSize: 18,
          confidenceScore: 95,
          hasStatisticalProof: true,
        },
        userAId
      );

      expect(learning.statisticalSignificance).toBe("STATISTICALLY_SIGNIFICANT");
    });

    it("manual recommendation starts in PENDING status and requires human accept", async () => {
      const rec = await StrategyRecommendationService.createManualRecommendation(
        wsAId,
        {
          brandId: brandAId,
          title: "Increase Technical Breakdown Frequency",
          recommendation: "Shift 40% of newsletter slots to deep architecture teardowns.",
          targetPillar: "Deterministic Engineering",
          actionType: "PILLAR_EMPHASIS",
        },
        userAId
      );

      expect(rec.status).toBe("PENDING");

      // Rejecting recommendation
      const rejected = await StrategyRecommendationService.reviewRecommendation({
        workspaceId: wsAId,
        recommendationId: rec.id,
        userId: userAId,
        action: "REJECT",
        reviewNotes: "Not aligned with Q4 focus.",
      });
      expect(rejected.status).toBe("REJECTED");

      // New recommendation for acceptance
      const rec2 = await StrategyRecommendationService.createManualRecommendation(
        wsAId,
        {
          brandId: brandAId,
          title: "Emphasize Rust State Machines",
          recommendation: "Focus on zero-overhead safety.",
          actionType: "MESSAGING_SHIFT",
        },
        userAId
      );

      const accepted = await StrategyRecommendationService.reviewRecommendation({
        workspaceId: wsAId,
        recommendationId: rec2.id,
        userId: userAId,
        action: "ACCEPT",
        reviewNotes: "Approved by leadership.",
      });
      expect(accepted.status).toBe("ACCEPTED");
    });
  });

  // =========================================================================
  // 8. PUBLISHING — MANUAL MODE & PREVIEW
  // =========================================================================
  describe("8. Publishing — Manual Mode & Preview", () => {
    let publishAssetId: string;
    let publishVersionId: string;

    beforeAll(async () => {
      const asset = await ContentStudioService.createManualDraft({
        workspaceId: wsAId,
        brandId: brandAId,
        campaignId: campaignAId,
        title: "Publication Preview and Delivery Asset",
        type: "X_THREAD",
        createdBy: userAId,
        initialBlocks: [
          {
            blockType: "HOOK",
            orderIndex: 0,
            content: "Deterministic state machines guarantee zero unhandled states.",
            statementType: "CLAIM",
          },
          {
            blockType: "BODY",
            orderIndex: 1,
            content: "Here is the exact state transition table for autonomous workers.",
            statementType: "GENERAL",
          },
        ],
      });
      publishAssetId = asset.id;
      publishVersionId = asset.versions[0].id;
    });

    it("generates payload preview with formatted text, character count, and idempotency key", async () => {
      const preview = await PublishingService.previewPublishPayload({
        workspaceId: wsAId,
        brandId: brandAId,
        assetId: publishAssetId,
        versionId: publishVersionId,
        connectedAccountId,
        platform: "X",
        userId: userAId,
      });

      expect(preview).toBeDefined();
      expect(preview.assetId).toBe(publishAssetId);
      expect(preview.characterCount).toBeGreaterThan(0);
      expect(preview.formattedText).toContain("Deterministic state machines");
      expect(preview.idempotencyKey).toBeDefined();
      expect(preview.isApproved).toBe(false); // Not approved yet
    });

    it("strictly blocks AI agents from publishing (Hard Human Gate)", async () => {
      await expect(
        PublishingService.publishAsset({
          workspaceId: wsAId,
          brandId: brandAId,
          assetId: publishAssetId,
          versionId: publishVersionId,
          connectedAccountId,
          platform: "X",
          userId: "AI_EDITOR",
          isAI: true,
        })
      ).rejects.toThrow(AuthorizationError);
    });

    it("publishes successfully once human review and human approval are complete", async () => {
      // 1. Advance asset from DRAFT -> EDITING -> READY_FOR_REVIEW
      await ContentStudioService.updateAssetStatus(publishAssetId, "EDITING", wsAId, userAId);
      await ContentStudioService.updateAssetStatus(publishAssetId, "READY_FOR_REVIEW", wsAId, userAId);

      // 2. Human review
      await EditorialReviewerService.performHumanReview({
        workspaceId: wsAId,
        assetId: publishAssetId,
        versionId: publishVersionId,
        userId: userAId,
        verdict: "PASS",
        summary: "Verified and ready for deployment.",
      });

      // 3. Human approval gate
      const approval = await ApprovalService.approveVersion({
        workspaceId: wsAId,
        brandId: brandAId,
        assetId: publishAssetId,
        versionId: publishVersionId,
        userId: userAId,
        comment: "Final human authorization.",
        reviewerType: "HUMAN_OPERATOR",
      });
      expect(approval.approvalRecord.action).toBe("HUMAN_APPROVED");
      expect(approval.asset.status).toBe("APPROVED");

      // 4. Confirm preview shows isApproved = true
      const preview = await PublishingService.previewPublishPayload({
        workspaceId: wsAId,
        brandId: brandAId,
        assetId: publishAssetId,
        versionId: publishVersionId,
        connectedAccountId,
        platform: "X",
        userId: userAId,
      });
      expect(preview.isApproved).toBe(true);

      // 5. Execute Human Publication
      const pubResult = await PublishingService.publishAsset({
        workspaceId: wsAId,
        brandId: brandAId,
        assetId: publishAssetId,
        versionId: publishVersionId,
        connectedAccountId,
        platform: "X",
        userId: userAId,
        isAI: false,
      });

      expect(pubResult.publishingRecord).toBeDefined();
      expect(pubResult.publishingRecord.status).toBe("PUBLISHED");
      expect(pubResult.isDuplicate).toBe(false);

      // 6. Repeat publication returns duplicate idempotent response
      const repeat = await PublishingService.publishAsset({
        workspaceId: wsAId,
        brandId: brandAId,
        assetId: publishAssetId,
        versionId: publishVersionId,
        connectedAccountId,
        platform: "X",
        userId: userAId,
        isAI: false,
      });
      expect(repeat.isDuplicate).toBe(true);
    });
  });

  // =========================================================================
  // 9. AI DISABLED MODE & END-TO-END MANUAL LIFECYCLE
  // =========================================================================
  describe("9. AI Disabled Mode & End-to-End Manual Lifecycle", () => {
    beforeAll(() => {
      process.env.AI_MODE = "DISABLED";
    });

    afterAll(() => {
      process.env.AI_MODE = originalAiMode;
    });

    it("ProviderFactory throws AIDisabledError when AI is disabled", async () => {
      await expect(ProviderFactory.getProvider()).rejects.toThrow(AIDisabledError);

      const status = await ProviderFactory.getAIStatus();
      expect(status.mode).toBe("DISABLED");
      expect(status.manualAvailable).toBe(true);
    });

    it("executes a complete end-to-end publishing lifecycle manually with zero AI calls", async () => {
      const runTimestamp = Date.now();

      // Step 1: Create Manual Signal
      const signal = await SignalScoutService.addManualSignal(
        wsAId,
        brandAId,
        {
          title: `Manual Lifecycle Signal ${runTimestamp}`,
          description: "Manual end-to-end verification signal.",
        },
        userAId
      );
      expect(signal.isManual).toBe(true);

      // Dedicated campaign for clean E2E lifecycle
      const e2eCampaign = await prisma.campaign.create({
        data: {
          brandId: brandAId,
          title: `E2E Zero-AI Campaign ${runTimestamp}`,
          slug: `e2e-zero-ai-${runTimestamp}`,
          stage: "RESEARCH",
          priority: "HIGH",
        },
      });

      // Step 2: Add Manual Research Bundle
      const bundle = await EvidenceGraphService.addManualResearchBundle(
        wsAId,
        {
          campaignId: e2eCampaign.id,
          source: {
            title: `Research Source ${runTimestamp}`,
            url: `https://example.com/source-${runTimestamp}`,
            trustScore: 88,
          },
          claim: {
            claimText: "Deterministic execution guarantees zero unhandled states.",
            confidence: 90,
            isFact: true,
          },
          evidence: {
            quoteSnippet: "State machines ensure zero unhandled edge states.",
            supportStance: "SUPPORTS",
          },
        },
        userAId
      );
      expect(bundle.claim.verificationStatus).toBe("UNVERIFIED");

      // Step 3: Create Manual Strategy
      const strategy = await StrategistService.createManualStrategy(
        wsAId,
        e2eCampaign.id,
        {
          primaryHeadline: `Zero-AI Strategy ${runTimestamp}`,
          thesis: "Full execution succeeds even when all AI APIs are unreachable.",
          targetReader: "Staff Engineers",
          desiredOutcome: "Reliability",
          centralTension: "Probabilistic vs Deterministic",
          flagshipFormat: "X_THREAD",
        },
        userAId
      );
      expect(strategy.primaryHeadline).toContain("Zero-AI Strategy");

      // Step 4: Create Manual Draft
      const asset = await ContentStudioService.createManualDraft({
        workspaceId: wsAId,
        brandId: brandAId,
        campaignId: e2eCampaign.id,
        title: `Zero-AI Post ${runTimestamp}`,
        type: "X_THREAD",
        createdBy: userAId,
        initialBlocks: [
          {
            blockType: "HOOK",
            orderIndex: 0,
            content: "MediaOS functions 100% manually when AI is disabled.",
            statementType: "CLAIM",
          },
        ],
      });
      expect(asset.versions[0].versionNumber).toBe(1);

      // Advance asset DRAFT -> EDITING -> READY_FOR_REVIEW
      await ContentStudioService.updateAssetStatus(asset.id, "EDITING", wsAId, userAId);
      await ContentStudioService.updateAssetStatus(asset.id, "READY_FOR_REVIEW", wsAId, userAId);

      // Step 5: Perform Human Editorial Review
      const review = await EditorialReviewerService.performHumanReview({
        workspaceId: wsAId,
        assetId: asset.id,
        versionId: asset.versions[0].id,
        userId: userAId,
        verdict: "PASS",
        summary: "Human review executed without any AI dependency.",
      });
      expect(review.status).toBe("PASSED");

      // Step 6: Mandatory Human Approval Gate
      const approval = await ApprovalService.approveVersion({
        workspaceId: wsAId,
        brandId: brandAId,
        assetId: asset.id,
        versionId: asset.versions[0].id,
        userId: userAId,
        comment: "Manual sign-off granted.",
        reviewerType: "HUMAN_OPERATOR",
      });
      expect(approval.approvalRecord.action).toBe("HUMAN_APPROVED");
      expect(approval.asset.status).toBe("APPROVED");

      // Step 7: Preview Publishing Payload
      const preview = await PublishingService.previewPublishPayload({
        workspaceId: wsAId,
        brandId: brandAId,
        assetId: asset.id,
        versionId: asset.versions[0].id,
        connectedAccountId,
        platform: "X",
        userId: userAId,
      });
      expect(preview.isApproved).toBe(true);
      expect(preview.characterCount).toBeGreaterThan(0);

      // Step 8: Execute Human Publication
      const pubResult = await PublishingService.publishAsset({
        workspaceId: wsAId,
        brandId: brandAId,
        assetId: asset.id,
        versionId: asset.versions[0].id,
        connectedAccountId,
        platform: "X",
        userId: userAId,
        isAI: false,
      });

      expect(pubResult.publishingRecord.status).toBe("PUBLISHED");
    });
  });
});
