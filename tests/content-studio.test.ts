import { describe, it, expect, beforeAll } from "vitest";
import prisma from "../src/server/db/prisma";
import { ContentStudioService } from "../src/server/services/content-studio-service";
import { WriterService } from "../src/server/services/writer-service";
import { DiffService } from "../src/server/services/diff-service";
import { QualityChecker } from "../src/server/services/quality-checker";
import { BrandBrainService } from "../src/server/services/brand-brain-service";
import { StrategistService } from "../src/server/services/strategist-service";
import { ResearcherService } from "../src/server/services/researcher-service";

describe("Phase 4 Content Studio & Downstream Generation Subsystem", () => {
  let workspaceId: string;
  let otherWorkspaceId: string;
  let brandId: string;
  let campaignId: string;
  let strategyId: string;
  let verifiedClaimId: string;

  beforeAll(async () => {
    // 1. Setup Workspace & Brand
    const user = await prisma.user.create({
      data: {
        email: `studio_tester_${Date.now()}@mediaos.local`,
        name: "Studio Test Engineer",
        passwordHash: "dummyHash",
      },
    });

    const workspace = await prisma.workspace.create({
      data: {
        name: "Studio Production Workspace",
        slug: `studio-ws-${Date.now()}`,
        ownerId: user.id,
      },
    });
    workspaceId = workspace.id;

    // Another workspace for multi-tenant isolation tests
    const otherWs = await prisma.workspace.create({
      data: {
        name: "Unauthorized Workspace",
        slug: `unauth-ws-${Date.now()}`,
        ownerId: user.id,
      },
    });
    otherWorkspaceId = otherWs.id;

    const brand = await prisma.brand.create({
      data: {
        workspaceId,
        name: "Apex AI Studio Brand",
        slug: `apex-ai-studio-${Date.now()}`,
        tagline: "Engineering deterministic multi-agent operating systems",
      },
    });
    brandId = brand.id;

    // 2. Setup Brand Brain Rules (including forbidden buzzwords)
    await BrandBrainService.createContentPillar({
      workspaceId,
      name: "Deterministic Workflows",
      description: "State machines, typed schemas, and human review gates.",
      targetRatio: 50,
    });

    await BrandBrainService.createEditorialRule({
      workspaceId,
      rule: "Never use superficial tech buzzwords without concrete code demonstrations.",
      category: "STYLE",
    });

    await BrandBrainService.createEditorialRule({
      workspaceId,
      rule: "Avoid synergy, game-changing, and unprecedented in technical copy.",
      category: "TONE",
    });

    // 3. Create Campaign
    const campaign = await prisma.campaign.create({
      data: {
        brandId,
        title: "Autonomous Media Company Blueprint",
        slug: `blueprint-${Date.now()}`,
        stage: "STRATEGY",
        priority: "HIGH",
        brief: "Architecture guide for multi-agent media generation with verified evidence grounding.",
      },
    });
    campaignId = campaign.id;

    // 4. Run Evidence Researcher & Ground Claim
    await ResearcherService.runResearch(workspaceId, campaignId, {
      topic: "Deterministic Multi-Agent Systems in Production",
    });

    const claims = await prisma.claim.findMany({
      where: { campaignId },
      include: { evidence: true },
    });

    expect(claims.length).toBeGreaterThan(0);
    const targetClaim = claims[0];
    verifiedClaimId = targetClaim.id;

    // Ensure claim is formally verified
    await prisma.claim.update({
      where: { id: verifiedClaimId },
      data: { verificationStatus: "VERIFIED" },
    });

    // 5. Run Content Strategist to create Strategy record
    const stratResult = await StrategistService.developStrategy(workspaceId, campaignId);
    expect(stratResult.thesis).toBeDefined();

    const stratRecord = await prisma.strategy.findUnique({
      where: { campaignId },
    });
    expect(stratRecord).toBeDefined();
    strategyId = stratRecord!.id;
  });

  describe("1. Workspace Isolation & Asset Creation", () => {
    it("creates a content asset within authorized workspace and links to campaign/strategy", async () => {
      const asset = await ContentStudioService.createAsset({
        workspaceId,
        brandId,
        campaignId,
        type: "YOUTUBE_LONG_FORM",
        title: "Stop Using AI as a Chatbot (Long-Form)",
      });

      expect(asset).toBeDefined();
      expect(asset.workspaceId).toBe(workspaceId);
      expect(asset.campaignId).toBe(campaignId);
      expect(asset.strategyId).toBe(strategyId);
      expect(asset.status).toBe("DRAFT");
      expect(asset.currentVersionId).toBeNull();
    });

    it("rejects asset creation if workspace does not match campaign workspace", async () => {
      await expect(
        ContentStudioService.createAsset({
          workspaceId: otherWorkspaceId,
          brandId,
          campaignId,
          type: "YOUTUBE_LONG_FORM",
          title: "Intruder Asset",
        })
      ).rejects.toThrow(/Campaign .* not found in workspace/);
    });
  });

  describe("2. Multi-Format Writer Generations & Claim Tracing", () => {
    it("generates YouTube Long-Form script with chapters, transitions, evidence moments and claim linking", async () => {
      const asset = await ContentStudioService.createAsset({
        workspaceId,
        brandId,
        campaignId,
        type: "YOUTUBE_LONG_FORM",
        title: "YouTube Long-Form Masterclass",
      });

      const generated = await WriterService.generateContent({
        assetId: asset.id,
        workspaceId,
      });
      expect(generated).toBeDefined();
      expect(generated!.versionNumber).toBe(1);
      expect(["GENERATED", "AI_GENERATED"]).toContain(generated!.sourceType);
      expect(generated!.blocks.length).toBeGreaterThan(3);

      // Verify block roles exist: HOOK, PROMISE, CHAPTER, CONCLUSION, CTA
      const blockTypes = generated!.blocks.map((b) => b.blockType);
      expect(blockTypes).toContain("HOOK");
      expect(blockTypes).toContain("PROMISE");
      expect(blockTypes).toContain("CHAPTER");
      expect(blockTypes).toContain("CONCLUSION");
      expect(blockTypes).toContain("CTA");

      // Verify chapter content contains title, narration, examples, and transition
      const chapters = generated!.blocks.filter((b) => b.blockType === "CHAPTER");
      expect(chapters.length).toBeGreaterThanOrEqual(3);
      for (const ch of chapters) {
        expect(ch.title).toBeTruthy();
        expect(ch.content).toBeTruthy();
        expect(ch.example).toBeDefined();
        expect(ch.transition).toBeDefined();
      }

      // Verify claim references exist and link to verified claims
      const claimRefs = await prisma.claimReference.findMany({
        where: {
          block: {
            versionId: generated!.id,
          },
        },
      });
      expect(claimRefs.length).toBeGreaterThan(0);
      expect(claimRefs[0].claimId).toBe(verifiedClaimId);

      // Check asset status transitioned to GENERATED
      const updatedAsset = await ContentStudioService.getAsset(asset.id, workspaceId);
      expect(updatedAsset.status).toBe("GENERATED");
    });

    it("generates YouTube Short (~45s, hook, body, payoff, CTA)", async () => {
      const asset = await ContentStudioService.createAsset({
        workspaceId,
        brandId,
        campaignId,
        type: "YOUTUBE_SHORT",
        title: "Shorts Blueprint",
      });

      const generated = await WriterService.generateContent({
        assetId: asset.id,
        workspaceId,
      });

      expect(generated).toBeDefined();
      expect(generated!.blocks.length).toBeGreaterThanOrEqual(4);
      const types = generated!.blocks.map((b) => b.blockType);
      expect(types).toContain("HOOK");
      expect(types).toContain("BODY");
      expect(types).toContain("PAYOFF");
      expect(types).toContain("CTA");

      const hookBlock = generated!.blocks.find((b) => b.blockType === "HOOK");
      expect(hookBlock?.content.length).toBeGreaterThan(10);
    });

    it("generates Newsletter (subject, preview, opening, sections, closing, CTA)", async () => {
      const asset = await ContentStudioService.createAsset({
        workspaceId,
        brandId,
        campaignId,
        type: "NEWSLETTER",
        title: "Weekly Engineering Dispatch",
      });

      const generated = await WriterService.generateContent({
        assetId: asset.id,
        workspaceId,
      });

      expect(generated).toBeDefined();
      const types = generated!.blocks.map((b) => b.blockType);
      expect(types).toContain("SUBJECT");
      expect(types).toContain("PREVIEW");
      expect(types).toContain("OPENING");
      expect(types).toContain("SECTION");
      expect(types).toContain("CLOSING");
      expect(types).toContain("CTA");

      // Verify sections have title and content
      const sections = generated!.blocks.filter((b) => b.blockType === "SECTION");
      expect(sections.length).toBeGreaterThanOrEqual(2);
      expect(sections[0].title).toBeTruthy();
    });

    it("generates X Thread where all tweets are <= 280 characters", async () => {
      const asset = await ContentStudioService.createAsset({
        workspaceId,
        brandId,
        campaignId,
        type: "X_THREAD",
        title: "Autonomous Media Stack X Thread",
      });

      const generated = await WriterService.generateContent({
        assetId: asset.id,
        workspaceId,
      });

      expect(generated).toBeDefined();
      const tweets = generated!.blocks.filter((b) => b.blockType === "TWEET");
      expect(tweets.length).toBeGreaterThanOrEqual(3);

      for (const tweet of tweets) {
        expect(tweet.content.length).toBeLessThanOrEqual(280);
        expect(tweet.content.length).toBeGreaterThan(10);
      }
    });

    it("generates LinkedIn Post (hook, body paragraphs, evidence callout, takeaway, CTA)", async () => {
      const asset = await ContentStudioService.createAsset({
        workspaceId,
        brandId,
        campaignId,
        type: "LINKEDIN_POST",
        title: "Leadership Architecture Post",
      });

      const generated = await WriterService.generateContent({
        assetId: asset.id,
        workspaceId,
      });

      expect(generated).toBeDefined();
      const types = generated!.blocks.map((b) => b.blockType);
      expect(types).toContain("HOOK");
      expect(types).toContain("PARAGRAPH");
      expect(types).toContain("EVIDENCE_CALLOUT");
      expect(types).toContain("TAKEAWAY");
      expect(types).toContain("CTA");
    });
  });

  describe("3. Immutable Versioning & Non-Destructive Restore", () => {
    it("creates an immutable v2 when editing blocks and leaves v1 completely intact", async () => {
      const asset = await ContentStudioService.createAsset({
        workspaceId,
        brandId,
        campaignId,
        type: "YOUTUBE_LONG_FORM",
        title: "Versioning Test Asset",
      });

      // Generate v1
      const v1Result = await WriterService.generateContent({
        assetId: asset.id,
        workspaceId,
      });
      const v1Id = v1Result!.id;
      const v1OriginalBlocks = v1Result!.blocks;

      // Edit chapter 1 in v2
      const modifiedBlocks = v1OriginalBlocks.map((b) => {
        if (b.blockType === "CHAPTER" && b.orderIndex === 2) {
          return {
            blockType: b.blockType,
            orderIndex: b.orderIndex,
            title: b.title,
            content: "Completely revised narration for chapter 1 with deeper technical analysis.",
            example: b.example,
            transition: b.transition,
            statementType: b.statementType,
          };
        }
        return {
          blockType: b.blockType,
          orderIndex: b.orderIndex,
          title: b.title,
          content: b.content,
          example: b.example,
          transition: b.transition,
          statementType: b.statementType,
        };
      });

      const v2Result = await WriterService.saveManualEdit({
        assetId: asset.id,
        workspaceId,
        blocks: modifiedBlocks,
        changeSummary: "Revised Chapter 1 narration with technical detail",
      });

      expect(v2Result!.versionNumber).toBe(2);
      expect(v2Result!.sourceType).toBe("MANUAL_EDIT");
      expect(v2Result!.id).not.toBe(v1Id);

      // Verify v1 in database was NOT modified
      const v1FromDb = await prisma.contentVersion.findUnique({
        where: { id: v1Id },
        include: { blocks: { orderBy: { orderIndex: "asc" } } },
      });
      expect(v1FromDb).toBeDefined();
      expect(v1FromDb!.blocks[2].content).toBe(v1OriginalBlocks[2].content);
      expect(v1FromDb!.blocks[2].content).not.toBe(
        "Completely revised narration for chapter 1 with deeper technical analysis."
      );
    });

    it("restoring an older version creates v3 with v1 content, preserving history", async () => {
      const asset = await ContentStudioService.createAsset({
        workspaceId,
        brandId,
        campaignId,
        type: "YOUTUBE_SHORT",
        title: "Restore Test Short",
      });

      // Generate v1
      const v1Result = await WriterService.generateContent({
        assetId: asset.id,
        workspaceId,
      });
      const v1Id = v1Result!.id;
      const v1HookText = v1Result!.blocks.find((b) => b.blockType === "HOOK")!.content;

      // Save manual edit v2
      const modifiedBlocks = v1Result!.blocks.map((b) => ({
        blockType: b.blockType,
        orderIndex: b.orderIndex,
        title: b.title,
        content: b.blockType === "HOOK" ? "Different hook for v2" : b.content,
        statementType: b.statementType,
      }));

      await WriterService.saveManualEdit({
        assetId: asset.id,
        workspaceId,
        blocks: modifiedBlocks,
        changeSummary: "Tested alternative hook",
      });

      // Now restore v1
      const restored = await WriterService.restoreVersion({
        assetId: asset.id,
        versionId: v1Id,
        workspaceId,
      });

      // Verify v3 was created
      expect(restored!.versionNumber).toBe(3);
      expect(restored!.sourceType).toBe("RESTORED");

      // Verify v3 content matches v1
      const v3HookText = restored!.blocks.find((b) => b.blockType === "HOOK")!.content;
      expect(v3HookText).toBe(v1HookText);

      // Verify all 3 versions exist in history
      const allVersions = await ContentStudioService.listVersions(asset.id, workspaceId);
      expect(allVersions.length).toBe(3);
      expect(allVersions.map((v) => v.versionNumber).sort()).toEqual([1, 2, 3]);
    });
  });

  describe("4. Visual Diff Computation (Structured & Text LCS)", () => {
    it("computes structured diff and line-by-line text diff accurately", async () => {
      const asset = await ContentStudioService.createAsset({
        workspaceId,
        brandId,
        campaignId,
        type: "YOUTUBE_SHORT",
        title: "Diff Test Asset",
      });

      const v1Result = await WriterService.generateContent({
        assetId: asset.id,
        workspaceId,
      });

      // Edit body in v2
      const modifiedBlocks = v1Result!.blocks.map((b) => ({
        blockType: b.blockType,
        orderIndex: b.orderIndex,
        title: b.title,
        content:
          b.blockType === "BODY"
            ? "This is the newly rewritten body content explaining deterministic systems."
            : b.content,
        statementType: b.statementType,
      }));

      const v2Result = await WriterService.saveManualEdit({
        assetId: asset.id,
        workspaceId,
        blocks: modifiedBlocks,
        changeSummary: "Rewrote body",
      });

      const diff = DiffService.compare(
        {
          versionNumber: v1Result!.versionNumber,
          author: v1Result!.author,
          createdAt: v1Result!.createdAt,
          blocks: v1Result!.blocks,
        },
        {
          versionNumber: v2Result!.versionNumber,
          author: v2Result!.author,
          createdAt: v2Result!.createdAt,
          changeSummary: v2Result!.changeSummary || "Rewrote body",
          blocks: v2Result!.blocks,
        }
      );

      expect(diff.v1VersionNumber).toBe(1);
      expect(diff.v2VersionNumber).toBe(2);

      // Structured Diff checks
      expect(diff.summary.blocksModified).toBe(1);
      const modifiedBlock = diff.structuredDiff.find((b) => b.changeType === "MODIFIED");
      expect(modifiedBlock).toBeDefined();
      expect(modifiedBlock!.blockType).toBe("BODY");
      expect(modifiedBlock!.contentDiff.length).toBeGreaterThan(0);

      // Text Diff (LCS) checks
      expect(diff.textDiff.length).toBeGreaterThan(0);
      const hasAddedLine = diff.textDiff.some((l) => l.type === "added");
      const hasRemovedLine = diff.textDiff.some((l) => l.type === "removed");
      expect(hasAddedLine).toBe(true);
      expect(hasRemovedLine).toBe(true);
      expect(diff.summary.linesAdded).toBeGreaterThan(0);
      expect(diff.summary.linesRemoved).toBeGreaterThan(0);
    });
  });

  describe("5. Quality Diagnostics, Unsupported Claims & Brand Rules", () => {
    it("calculates quality metrics: word count, reading ease, duration, and flags unsupported claims", async () => {
      const blocks = [
        {
          title: "Hook",
          content: "Welcome to our comprehensive guide on deterministic multi-agent architectures.",
          statementType: "FACT",
          unsupportedFlag: false,
          claimId: verifiedClaimId,
        },
        {
          title: "Body",
          content: "Our benchmark proves that unconstrained loops diverge 100% of the time in production.",
          statementType: "FACT",
          unsupportedFlag: true, // Unsupported claim
          claimId: null,
        },
      ];

      const report = QualityChecker.analyze(blocks);

      expect(report.wordCount).toBeGreaterThan(15);
      expect(report.estimatedReadingDurationMinutes).toBeGreaterThan(0);
      expect(report.estimatedSpeakingDurationMinutes).toBeGreaterThan(0);
      expect(report.readabilityScore).toBeGreaterThan(0);
      expect(report.readabilityGrade).toBeTruthy();

      // Evidence grounding checks
      expect(report.evidenceCoveragePercent).toBe(50); // 1 of 2 blocks has claim
      expect(report.unsupportedClaimCount).toBe(1);
    });

    it("flags forbidden buzzwords per Brand Brain editorial rules", async () => {
      const blocks = [
        {
          title: "Intro",
          content: "We provide synergy and game-changing solutions for unprecedented growth in every production run.",
          statementType: "OPINION",
          unsupportedFlag: false,
          claimId: null,
        },
      ];

      const report = QualityChecker.analyze(
        blocks,
        [{ rule: "Avoid synergy, game-changing, and unprecedented in technical copy", category: "TONE" }],
        "synergy,game-changing,unprecedented"
      );

      expect(report.brandRuleWarnings.length).toBeGreaterThan(0);
      const warningsText = report.brandRuleWarnings.join(" ");
      expect(warningsText.toLowerCase()).toMatch(/synergy|game-changing|unprecedented/);
    });
  });

  describe("6. Lifecycle State Machine & Safety Guards", () => {
    it("allows valid transitions: DRAFT -> GENERATED -> EDITING -> READY_FOR_REVIEW", async () => {
      const asset = await ContentStudioService.createAsset({
        workspaceId,
        brandId,
        campaignId,
        type: "NEWSLETTER",
        title: "Lifecycle Test Newsletter",
      });
      expect(asset.status).toBe("DRAFT");

      const generated = await WriterService.generateContent({
        assetId: asset.id,
        workspaceId,
      });
      expect(generated!.id).toBeDefined();

      const afterGen = await ContentStudioService.getAsset(asset.id, workspaceId);
      expect(afterGen.status).toBe("GENERATED");

      const editing = await ContentStudioService.updateAssetStatus(asset.id, "EDITING", workspaceId);
      expect(editing.status).toBe("EDITING");

      const ready = await ContentStudioService.updateAssetStatus(
        asset.id,
        "READY_FOR_REVIEW",
        workspaceId
      );
      expect(ready.status).toBe("READY_FOR_REVIEW");
    });

    it("rejects direct transition to APPROVED or PUBLISHED (Phase 4 safeguards)", async () => {
      const asset = await ContentStudioService.createAsset({
        workspaceId,
        brandId,
        campaignId,
        type: "NEWSLETTER",
        title: "Approval Guard Asset",
      });

      // Cannot jump from DRAFT directly to APPROVED
      await expect(
        ContentStudioService.updateAssetStatus(asset.id, "APPROVED", workspaceId)
      ).rejects.toThrow(/Invalid status transition/);

      // Cannot transition to PUBLISHED (external publishing forbidden in Phase 4)
      await expect(
        ContentStudioService.updateAssetStatus(asset.id, "PUBLISHED" as any, workspaceId)
      ).rejects.toThrow();
    });

    it("requires human editorial approval: only READY_FOR_REVIEW can transition to APPROVED", async () => {
      const asset = await ContentStudioService.createAsset({
        workspaceId,
        brandId,
        campaignId,
        type: "NEWSLETTER",
        title: "Human Approval Test",
      });

      await WriterService.generateContent({ assetId: asset.id, workspaceId });
      await ContentStudioService.updateAssetStatus(asset.id, "READY_FOR_REVIEW", workspaceId);

      // Explicit human approval succeeds from READY_FOR_REVIEW
      const approved = await ContentStudioService.updateAssetStatus(
        asset.id,
        "APPROVED",
        workspaceId
      );
      expect(approved.status).toBe("APPROVED");
    });
  });

  describe("7. Asset Duplication", () => {
    it("duplicates an asset into a fresh DRAFT asset copying latest blocks into a new v1", async () => {
      const original = await ContentStudioService.createAsset({
        workspaceId,
        brandId,
        campaignId,
        type: "YOUTUBE_SHORT",
        title: "Original Short To Duplicate",
      });

      await WriterService.generateContent({
        assetId: original.id,
        workspaceId,
      });

      const duplicated = await ContentStudioService.duplicateAsset(original.id, workspaceId);

      expect(duplicated.id).not.toBe(original.id);
      expect(duplicated.title).toBe("Original Short To Duplicate (Copy)");
      expect(duplicated.status).toBe("DRAFT");
      expect(duplicated.currentVersionId).toBeTruthy();

      // Check duplicated blocks
      const duplicatedWithVersions = await ContentStudioService.getAsset(duplicated.id, workspaceId);
      expect(duplicatedWithVersions.versions.length).toBe(1);
      expect(duplicatedWithVersions.versions[0].versionNumber).toBe(1);
      expect(duplicatedWithVersions.versions[0].sourceType).toBe("DUPLICATED");
      expect(duplicatedWithVersions.versions[0].blocks.length).toBeGreaterThan(0);
    });
  });
});
