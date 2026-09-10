import { describe, it, expect, beforeAll } from "vitest";
import prisma from "@/server/db/prisma";
import { EditorialReviewerService } from "@/server/services/editorial-reviewer-service";
import { ApprovalService } from "@/server/services/approval-service";
import { RevisionLoopService } from "@/server/services/revision-loop-service";
import { ContentStudioService } from "@/server/services/content-studio-service";
import { WriterService } from "@/server/services/writer-service";
import { EditorialReviewOutputSchema } from "@/server/ai/schemas/agent-outputs";

describe("Phase 5 Editorial Review & Mandatory Human Approval Gate", () => {
  let workspaceId: string;
  let otherWorkspaceId: string;
  let brandId: string;
  let campaignId: string;
  let userId: string;
  let otherUserId: string;

  beforeAll(async () => {
    // 1. Create primary workspace and operator
    const ws = await prisma.workspace.create({
      data: {
        name: "Phase 5 Review Test Workspace",
        slug: `phase5-test-${Date.now()}`,
        ownerId: "seed-user-id",
      },
    });
    workspaceId = ws.id;

    // 2. Create another workspace for tenancy testing
    const otherWs = await prisma.workspace.create({
      data: {
        name: "Other Workspace",
        slug: `other-ws-${Date.now()}`,
        ownerId: "seed-other-user",
      },
    });
    otherWorkspaceId = otherWs.id;

    // 3. Create operator user
    const user = await prisma.user.create({
      data: {
        email: `editor-${Date.now()}@apexmedia.internal`,
        name: "Lead Editorial Director",
        passwordHash: "dummyhash",
        role: "OPERATOR",
      },
    });
    userId = user.id;

    await prisma.workspaceMember.create({
      data: {
        workspaceId,
        userId: user.id,
        role: "EDITOR",
      },
    });

    const otherUser = await prisma.user.create({
      data: {
        email: `stranger-${Date.now()}@outside.internal`,
        name: "External Stranger",
        passwordHash: "dummyhash",
        role: "VIEWER",
      },
    });
    otherUserId = otherUser.id;

    await prisma.workspaceMember.create({
      data: {
        workspaceId: otherWorkspaceId,
        userId: otherUser.id,
        role: "MEMBER",
      },
    });

    // 4. Create Brand with Brand Voice rules and forbidden buzzwords
    const brand = await prisma.brand.create({
      data: {
        workspaceId,
        name: "Apex Engineering Media",
        slug: `apex-eng-${Date.now()}`,
        isDefault: true,
        voice: {
          create: {
            tone: "AUTHORITATIVE_TECHNICAL",
            styleGuidelines: "Evidence-backed, crisp engineering analysis",
            forbiddenWords: "synergy, paradigm shift, silver bullet, game changer",
            signaturePhrases: "Build the database. Verify the citations.",
          },
        },
      },
    });
    brandId = brand.id;

    // 5. Create Campaign
    const campaign = await prisma.campaign.create({
      data: {
        brandId,
        title: "Autonomous Agent State Machines Campaign",
        slug: `state-machines-${Date.now()}`,
        stage: "STRATEGY",
      },
    });
    campaignId = campaign.id;

    // 6. Create verified Source, Claim, and Evidence
    const source = await prisma.source.create({
      data: {
        workspaceId,
        title: "Apex Multi-Agent Reliability Study 2026",
        url: "https://apex.media/research/agents-2026",
        rawContent: "In extensive stress tests across 500 workflows, state machines reduced loop divergence by 74% compared to unconstrained ReAct loops.",
        trustScore: 98,
      },
    });

    const claim = await prisma.claim.create({
      data: {
        workspaceId,
        campaignId,
        primarySourceId: source.id,
        claimText: "Multi-agent systems using state machines reduce loop divergence by 74% compared to unconstrained ReAct loops.",
        confidence: 98,
        isFact: true,
        verificationStatus: "VERIFIED",
      },
    });

    await prisma.evidence.create({
      data: {
        claimId: claim.id,
        sourceId: source.id,
        quoteSnippet: "state machines reduced loop divergence by 74% compared to unconstrained ReAct loops.",
        supportStance: "SUPPORTS",
        isQuoteVerified: true,
      },
    });
  });

  it("1. validates the EditorialReviewOutput schema using Zod", () => {
    const validOutput = {
      verdict: "PASS" as const,
      scores: {
        evidenceScore: 96,
        brandScore: 92,
        qualityScore: 88,
        formatScore: 95,
        overallScore: 93,
      },
      summary: "All claims verified against Evidence Graph.",
      findings: [
        {
          category: "EVIDENCE_INTEGRITY" as const,
          severity: "INFO" as const,
          description: "All factual statements backed by peer-reviewed benchmarks.",
          recommendation: "Maintain citations in derivatives.",
          requiresRevision: false,
        },
      ],
      revisionInstructions: [],
    };

    const parsed = EditorialReviewOutputSchema.safeParse(validOutput);
    expect(parsed.success).toBe(true);
  });

  it("2. creates an asset and generates a YouTube Long-Form script", async () => {
    const asset = await ContentStudioService.createAsset({
      workspaceId,
      campaignId,
      type: "YOUTUBE_LONG_FORM",
      title: "Why Autonomous Agents Require State Machines",
      createdBy: "Test Runner",
    });

    expect(asset.status).toBe("DRAFT");

    const version = await WriterService.generateContent({
      workspaceId,
      assetId: asset.id,
      mode: "GENERATE",
      userId,
    });

    expect(version).toBeDefined();
    expect(version!.versionNumber).toBe(1);
    expect(version!.blocks.length).toBeGreaterThan(3);

    const reloaded = await ContentStudioService.getAsset(asset.id, workspaceId);
    expect(reloaded.status).toBe("GENERATED");
  });

  it("3. flags forbidden buzzwords via deterministic Brand Voice pre-checks", async () => {
    const asset = await ContentStudioService.createAsset({
      workspaceId,
      campaignId,
      type: "NEWSLETTER",
      title: "Newsletter with Buzzwords",
    });

    // Manually create a version with forbidden words: "paradigm shift" and "silver bullet"
    await WriterService.saveManualEdit({
      workspaceId,
      assetId: asset.id,
      changeSummary: "Draft with forbidden buzzwords",
      userId,
      blocks: [
        {
          blockType: "OPENING",
          orderIndex: 0,
          title: "Introduction",
          content: "This new AI framework represents a massive paradigm shift in production systems.",
          statementType: "OPINION",
        },
        {
          blockType: "SECTION",
          orderIndex: 1,
          title: "Core Argument",
          content: "However, multi-agent coordination is not a silver bullet for bad data.",
          statementType: "FACT",
        },
      ],
    });

    const review = await EditorialReviewerService.runReview({
      workspaceId,
      assetId: asset.id,
    });

    expect(review.status).toBe("REVISION_REQUIRED");
    expect(review.verdict).toBe("REQUEST_REVISION");

    const findings = JSON.parse(review.findingsJson || "[]");
    const brandFindings = findings.filter((f: any) => f.category === "BRAND_VOICE");
    expect(brandFindings.length).toBeGreaterThanOrEqual(2);
    expect(brandFindings.some((f: any) => f.description.includes("paradigm shift"))).toBe(true);
    expect(brandFindings.some((f: any) => f.description.includes("silver bullet"))).toBe(true);

    // Verifies RevisionRequests were persisted
    expect(review.revisionRequests.length).toBeGreaterThanOrEqual(2);
    expect(review.revisionRequests[0].status).toBe("OPEN");

    // Asset status should transition to REVISION_REQUIRED
    const reloaded = await ContentStudioService.getAsset(asset.id, workspaceId);
    expect(reloaded.status).toBe("REVISION_REQUIRED");
  });

  it("4. flags unsupported factual assertions (unsupportedFlag: true)", async () => {
    const asset = await ContentStudioService.createAsset({
      workspaceId,
      campaignId,
      type: "YOUTUBE_SHORT",
      title: "Short with Unsupported Claims",
    });

    // Manually insert an unsupported factual block
    const version = await prisma.contentVersion.create({
      data: {
        assetId: asset.id,
        versionNumber: 1,
        changeSummary: "Version with unsupported claim",
        contentSnapshot: "{}",
        blocks: {
          create: [
            {
              blockType: "HOOK",
              orderIndex: 0,
              content: "Watch out for unverified agent statistics.",
              statementType: "FACT",
              unsupportedFlag: true, // Unsupported!
            },
            {
              blockType: "PAYOFF",
              orderIndex: 1,
              content: "Always check the Evidence Graph.",
              statementType: "RECOMMENDATION",
              unsupportedFlag: false,
            },
          ],
        },
      },
    });

    await prisma.contentAsset.update({
      where: { id: asset.id },
      data: { currentVersionId: version.id, status: "READY_FOR_REVIEW" },
    });

    const review = await EditorialReviewerService.runReview({
      workspaceId,
      assetId: asset.id,
      versionId: version.id,
    });

    expect(review.status).toBe("REVISION_REQUIRED");
    const findings = JSON.parse(review.findingsJson || "[]");
    const evidenceFindings = findings.filter(
      (f: any) => f.category === "EVIDENCE_INTEGRITY" && f.severity === "ERROR"
    );
    expect(evidenceFindings.length).toBeGreaterThanOrEqual(1);
    expect(evidenceFindings[0].requiresRevision).toBe(true);
  });

  it("5. flags CONTRADICTED claims as CRITICAL findings", async () => {
    // Create a dedicated campaign to avoid polluting other tests
    const disputedCampaign = await prisma.campaign.create({
      data: {
        brandId,
        title: "Disputed Claims Test Campaign",
        slug: `disputed-campaign-${Date.now()}`,
        stage: "RESEARCH",
      },
    });

    // Create a contradicted claim in the dedicated campaign
    const contradictedClaim = await prisma.claim.create({
      data: {
        workspaceId,
        campaignId: disputedCampaign.id,
        claimText: "Pure prompt chains outperform deterministic state machines in 99% of cases.",
        verificationStatus: "CONTRADICTED",
        contradictionNote: "Conflicted by Apex Benchmark 2026 showing 74% higher error rate.",
      },
    });

    const asset = await ContentStudioService.createAsset({
      workspaceId,
      campaignId: disputedCampaign.id,
      type: "LINKEDIN_POST",
      title: "Post with Disputed Claim",
    });

    const version = await prisma.contentVersion.create({
      data: {
        assetId: asset.id,
        versionNumber: 1,
        changeSummary: "Contains contradicted claim citation",
        contentSnapshot: "{}",
        blocks: {
          create: [
            {
              blockType: "HOOK",
              orderIndex: 0,
              content: "Why prompt chains win every single time.",
              statementType: "FACT",
              unsupportedFlag: false,
            },
          ],
        },
      },
    });

    // Reference the contradicted claim
    await prisma.claimReference.create({
      data: {
        versionId: version.id,
        claimId: contradictedClaim.id,
        citationText: "Debunked benchmark citation",
      },
    });

    await prisma.contentAsset.update({
      where: { id: asset.id },
      data: { currentVersionId: version.id, status: "READY_FOR_REVIEW" },
    });

    const review = await EditorialReviewerService.runReview({
      workspaceId,
      assetId: asset.id,
      versionId: version.id,
    });

    expect(review.status).toBe("REVISION_REQUIRED");
    const findings = JSON.parse(review.findingsJson || "[]");
    const criticalFindings = findings.filter((f: any) => f.severity === "CRITICAL");
    expect(criticalFindings.length).toBeGreaterThanOrEqual(1);
    expect(criticalFindings[0].description).toContain("CONTRADICTED");
  });

  it("6. flags format compliance violations (tweet > 280 chars in X_THREAD)", async () => {
    const asset = await ContentStudioService.createAsset({
      workspaceId,
      campaignId,
      type: "X_THREAD",
      title: "X Thread with Oversized Tweet",
    });

    const longTweet = "This tweet is intentionally crafted to exceed the strict 280 character limit of Twitter/X. ".repeat(4);
    expect(longTweet.length).toBeGreaterThan(280);

    const version = await prisma.contentVersion.create({
      data: {
        assetId: asset.id,
        versionNumber: 1,
        changeSummary: "Oversized tweet",
        contentSnapshot: "{}",
        blocks: {
          create: [
            {
              blockType: "THREAD_HOOK",
              orderIndex: 0,
              content: "1/2 Valid hook tweet under 280 chars.",
              statementType: "OPINION",
            },
            {
              blockType: "TWEET",
              orderIndex: 1,
              content: longTweet,
              statementType: "FACT",
            },
          ],
        },
      },
    });

    await prisma.contentAsset.update({
      where: { id: asset.id },
      data: { currentVersionId: version.id, status: "READY_FOR_REVIEW" },
    });

    const review = await EditorialReviewerService.runReview({
      workspaceId,
      assetId: asset.id,
      versionId: version.id,
    });

    expect(review.status).toBe("REVISION_REQUIRED");
    const findings = JSON.parse(review.findingsJson || "[]");
    const formatFindings = findings.filter((f: any) => f.category === "FORMAT_COMPLIANCE");
    expect(formatFindings.length).toBeGreaterThanOrEqual(1);
    expect(formatFindings[0].description).toContain("280");
  });

  it("7. review passes when all deterministic checks and AI review are clean", async () => {
    const asset = await ContentStudioService.createAsset({
      workspaceId,
      campaignId,
      type: "YOUTUBE_LONG_FORM",
      title: "Clean Clean Flagship Script",
    });

    // Generate compliant content via Writer
    const version = await WriterService.generateContent({
      workspaceId,
      assetId: asset.id,
      mode: "GENERATE",
      userId,
    });

    const review = await EditorialReviewerService.runReview({
      workspaceId,
      assetId: asset.id,
      versionId: version!.id,
    });

    expect(review.status).toBe("PASSED");
    expect(review.verdict).toBe("PASS");
    expect(review.overallScore).toBeGreaterThanOrEqual(85);

    const reloaded = await ContentStudioService.getAsset(asset.id, workspaceId);
    expect(reloaded.status).toBe("REVIEW_PASSED");
  });

  it("8. executes the bounded revision loop and creates a new immutable version", async () => {
    const asset = await ContentStudioService.createAsset({
      workspaceId,
      campaignId,
      type: "YOUTUBE_LONG_FORM",
      title: "Asset for Revision Loop Test",
    });

    // 1. Initial version with a flagged issue
    await WriterService.saveManualEdit({
      workspaceId,
      assetId: asset.id,
      changeSummary: "v1 with forbidden word",
      userId,
      blocks: [
        {
          blockType: "HOOK",
          orderIndex: 0,
          title: "Hook",
          content: "This game changer technology transforms everything.",
          statementType: "OPINION",
        },
      ],
    });

    // Run review on v1
    const reviewV1 = await EditorialReviewerService.runReview({
      workspaceId,
      assetId: asset.id,
    });
    expect(reviewV1.status).toBe("REVISION_REQUIRED");

    // 2. Run revision loop cycle
    const cycleResult = await RevisionLoopService.executeRevisionCycle({
      workspaceId,
      assetId: asset.id,
      userId,
    });

    expect(cycleResult.success).toBe(true);
    expect(cycleResult.cycleCount).toBe(1);
    expect(cycleResult.newVersion).toBeDefined();
    expect(cycleResult.newVersion.versionNumber).toBe(2);

    // Verify v1 was preserved untouched
    const v1 = await prisma.contentVersion.findFirst({
      where: { assetId: asset.id, versionNumber: 1 },
      include: { blocks: true },
    });
    expect(v1).toBeDefined();
    expect(v1!.blocks[0].content).toContain("game changer");

    // Verify revision requests from v1 review were marked RESOLVED
    const resolvedRequests = await prisma.revisionRequest.findMany({
      where: { reviewId: reviewV1.id },
    });
    expect(resolvedRequests.every((r) => r.status === "RESOLVED")).toBe(true);
  });

  it("9. bounded revision loop halts and flags REQUIRES_HUMAN_INTERVENTION after maxCycles", async () => {
    const asset = await ContentStudioService.createAsset({
      workspaceId,
      campaignId,
      type: "YOUTUBE_LONG_FORM",
      title: "Asset Exhausting Revision Limits",
    });

    const version = await WriterService.generateContent({
      workspaceId,
      assetId: asset.id,
      mode: "GENERATE",
      userId,
    });

    // Simulate 3 past rejected reviews
    for (let i = 0; i < 3; i++) {
      await prisma.editorialReview.create({
        data: {
          workspaceId,
          brandId,
          campaignId,
          contentAssetId: asset.id,
          contentVersionId: version!.id,
          reviewerType: "AI_EDITOR",
          status: "REVISION_REQUIRED",
          verdict: "REQUEST_REVISION",
          overallScore: 65,
        },
      });
    }

    // Now execute revision cycle with maxCycles = 3
    const result = await RevisionLoopService.executeRevisionCycle({
      workspaceId,
      assetId: asset.id,
      maxCycles: 3,
    });

    expect(result.success).toBe(false);
    expect(result.requiresHumanIntervention).toBe(true);
    expect(result.status).toBe("REQUIRES_HUMAN_INTERVENTION");

    const reloaded = await ContentStudioService.getAsset(asset.id, workspaceId);
    expect(reloaded.status).toBe("REQUIRES_HUMAN_INTERVENTION");
  });

  it("10. MANDATORY HUMAN GATE: AI agents are strictly blocked from granting approval", async () => {
    const asset = await ContentStudioService.createAsset({
      workspaceId,
      campaignId,
      type: "NEWSLETTER",
      title: "Asset for AI Rejection Test",
    });

    const version = await WriterService.generateContent({
      workspaceId,
      assetId: asset.id,
      mode: "GENERATE",
      userId,
    });

    // Move to REVIEW_PASSED
    await prisma.contentAsset.update({
      where: { id: asset.id },
      data: { status: "REVIEW_PASSED" },
    });

    // Attempt approval with isAI: true
    await expect(
      ApprovalService.approveVersion({
        workspaceId,
        assetId: asset.id,
        versionId: version!.id,
        userId: "AI_EDITOR",
        comment: "AI approves this publication.",
        isAI: true,
      })
    ).rejects.toThrow("AI agents are strictly prohibited from granting approval");

    // Attempt approval with simulated AI userId
    await expect(
      ApprovalService.approveVersion({
        workspaceId,
        assetId: asset.id,
        versionId: version!.id,
        userId: "AI_AGENT_WRITER",
        comment: "Autonomous approval attempt",
      })
    ).rejects.toThrow("AI agents are strictly prohibited from granting approval");
  });

  it("11. MANDATORY HUMAN GATE: requires non-empty comment from human operator", async () => {
    const asset = await ContentStudioService.createAsset({
      workspaceId,
      campaignId,
      type: "NEWSLETTER",
      title: "Asset for Comment Test",
    });

    const version = await WriterService.generateContent({
      workspaceId,
      assetId: asset.id,
      mode: "GENERATE",
      userId,
    });

    await prisma.contentAsset.update({
      where: { id: asset.id },
      data: { status: "REVIEW_PASSED" },
    });

    await expect(
      ApprovalService.approveVersion({
        workspaceId,
        assetId: asset.id,
        versionId: version!.id,
        userId,
        comment: "   ", // Empty comment
      })
    ).rejects.toThrow("A comment is mandatory");
  });

  it("12. MANDATORY HUMAN GATE: rejects approval directly from DRAFT, EDITING, or REVISION_REQUIRED", async () => {
    const asset = await ContentStudioService.createAsset({
      workspaceId,
      campaignId,
      type: "NEWSLETTER",
      title: "Asset in Draft Status",
    });

    const version = await WriterService.generateContent({
      workspaceId,
      assetId: asset.id,
      mode: "GENERATE",
      userId,
    });

    // Asset is in GENERATED status
    await expect(
      ApprovalService.approveVersion({
        workspaceId,
        assetId: asset.id,
        versionId: version!.id,
        userId,
        comment: "Premature approval attempt",
      })
    ).rejects.toThrow('Asset cannot be approved while in "GENERATED" status');

    // Move to REVISION_REQUIRED
    await prisma.contentAsset.update({
      where: { id: asset.id },
      data: { status: "REVISION_REQUIRED" },
    });

    await expect(
      ApprovalService.approveVersion({
        workspaceId,
        assetId: asset.id,
        versionId: version!.id,
        userId,
        comment: "Premature approval attempt during revision",
      })
    ).rejects.toThrow('Asset cannot be approved while in "REVISION_REQUIRED" status');
  });

  it("13. MANDATORY HUMAN GATE: authenticated human can approve version with mandatory comment", async () => {
    const asset = await ContentStudioService.createAsset({
      workspaceId,
      campaignId,
      type: "YOUTUBE_LONG_FORM",
      title: "Legitimate Approved Asset",
    });

    const version = await WriterService.generateContent({
      workspaceId,
      assetId: asset.id,
      mode: "GENERATE",
      userId,
    });

    await prisma.contentAsset.update({
      where: { id: asset.id },
      data: { status: "REVIEW_PASSED" },
    });

    const result = await ApprovalService.approveVersion({
      workspaceId,
      assetId: asset.id,
      versionId: version!.id,
      userId,
      comment: "Verified primary source citations and technical accuracy. Approved for production.",
    });

    expect(result.asset.status).toBe("APPROVED");
    expect(result.approvalRecord.action).toBe("HUMAN_APPROVED");
    expect(result.approvalRecord.comment).toContain("Approved for production.");

    // Check database state
    const reloaded = await ContentStudioService.getAsset(asset.id, workspaceId);
    expect(reloaded.status).toBe("APPROVED");
  });

  it("14. approval is bound to exact version: subsequent version is NOT approved", async () => {
    const asset = await ContentStudioService.createAsset({
      workspaceId,
      campaignId,
      type: "YOUTUBE_LONG_FORM",
      title: "Version Binding Test Asset",
    });

    // Version 1
    const v1 = await WriterService.generateContent({
      workspaceId,
      assetId: asset.id,
      mode: "GENERATE",
      userId,
    });

    await prisma.contentAsset.update({
      where: { id: asset.id },
      data: { status: "REVIEW_PASSED" },
    });

    // Human approves Version 1
    await ApprovalService.approveVersion({
      workspaceId,
      assetId: asset.id,
      versionId: v1!.id,
      userId,
      comment: "Approved v1.",
    });

    let reloaded = await ContentStudioService.getAsset(asset.id, workspaceId);
    expect(reloaded.status).toBe("APPROVED");

    // Operator makes manual edits to create Version 2
    const v2 = await WriterService.saveManualEdit({
      workspaceId,
      assetId: asset.id,
      changeSummary: "v2 edits after approval",
      userId,
      blocks: [
        {
          blockType: "HOOK",
          orderIndex: 0,
          content: "A modified hook created in v2.",
          statementType: "FACT",
        },
      ],
    });

    reloaded = await ContentStudioService.getAsset(asset.id, workspaceId);
    // Asset status was updated to EDITING upon saving new version
    expect(reloaded.status).toBe("EDITING");
    expect(reloaded.currentVersionId).toBe(v2!.id);

    // Transition asset to READY_FOR_REVIEW so status check passes and version binding constraint is tested
    await prisma.contentAsset.update({
      where: { id: asset.id },
      data: { status: "READY_FOR_REVIEW" },
    });

    // Confirm that attempting to approve old v1 now fails because it's no longer the active version
    await expect(
      ApprovalService.approveVersion({
        workspaceId,
        assetId: asset.id,
        versionId: v1!.id,
        userId,
        comment: "Trying to re-approve old v1",
      })
    ).rejects.toThrow(`Cannot approve version ${v1!.id}`);
  });

  it("15. human operator can revoke approval without mutating historical audit records", async () => {
    const asset = await ContentStudioService.createAsset({
      workspaceId,
      campaignId,
      type: "NEWSLETTER",
      title: "Revocation Test Asset",
    });

    const v1 = await WriterService.generateContent({
      workspaceId,
      assetId: asset.id,
      mode: "GENERATE",
      userId,
    });

    await prisma.contentAsset.update({
      where: { id: asset.id },
      data: { status: "REVIEW_PASSED" },
    });

    // 1. Approve
    await ApprovalService.approveVersion({
      workspaceId,
      assetId: asset.id,
      versionId: v1!.id,
      userId,
      comment: "Initial approval sign-off.",
    });

    // 2. Revoke approval
    const revokeResult = await ApprovalService.revokeApproval({
      workspaceId,
      assetId: asset.id,
      versionId: v1!.id,
      userId,
      reason: "New counter-evidence published disputing main claim.",
    });

    expect(revokeResult.asset.status).toBe("READY_FOR_REVIEW");
    expect(revokeResult.approvalRecord.action).toBe("APPROVAL_REVOKED");

    // 3. Inspect audit trail: MUST have both HUMAN_APPROVED and APPROVAL_REVOKED
    const history = await ApprovalService.listApprovalHistory(asset.id, workspaceId);
    const actions = history.map((h) => h.action);
    expect(actions).toContain("HUMAN_APPROVED");
    expect(actions).toContain("APPROVAL_REVOKED");

    // The historical HUMAN_APPROVED record was NOT deleted
    const historicalApproved = history.find((h) => h.action === "HUMAN_APPROVED");
    expect(historicalApproved).toBeDefined();
    expect(historicalApproved!.comment).toBe("Initial approval sign-off.");
  });

  it("16. enforces workspace tenancy isolation for reviews and approvals", async () => {
    const asset = await ContentStudioService.createAsset({
      workspaceId,
      campaignId,
      type: "NEWSLETTER",
      title: "Tenancy Isolation Asset",
    });

    const v1 = await WriterService.generateContent({
      workspaceId,
      assetId: asset.id,
      mode: "GENERATE",
      userId,
    });

    // User from otherWorkspaceId attempts to run review
    await expect(
      EditorialReviewerService.runReview({
        workspaceId: otherWorkspaceId,
        assetId: asset.id,
      })
    ).rejects.toThrow(`ContentAsset ${asset.id} not found in workspace`);

    // User from otherWorkspaceId attempts to approve
    await expect(
      ApprovalService.approveVersion({
        workspaceId: otherWorkspaceId,
        assetId: asset.id,
        versionId: v1!.id,
        userId: otherUserId,
        comment: "Cross-workspace unauthorized approval",
      })
    ).rejects.toThrow();
  });

  it("17. strictly prohibits transition to PUBLISHED (Phase 7 boundary)", async () => {
    const asset = await ContentStudioService.createAsset({
      workspaceId,
      campaignId,
      type: "NEWSLETTER",
      title: "Publish Guard Test",
    });

    await expect(
      ContentStudioService.updateAssetStatus(asset.id, "PUBLISHED", workspaceId, userId)
    ).rejects.toThrow("Publishing is prohibited. External publishing is restricted to Phase 7.");
  });
});
