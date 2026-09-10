import prisma from "../db/prisma";
import { ContextBuilder } from "../ai/context-builder";
import { ProviderFactory } from "../ai/provider-factory";
import {
  YouTubeLongFormOutputSchema,
  YouTubeShortOutputSchema,
  NewsletterOutputSchema,
  XThreadOutputSchema,
  LinkedInOutputSchema,
} from "../ai/schemas/agent-outputs";
import { QualityChecker } from "./quality-checker";

export interface GenerateContentInput {
  workspaceId: string;
  assetId: string;
  mode?: "GENERATE" | "REGENERATE" | "REWRITE_SELECTION" | "EXPAND" | "SHORTEN" | "CHANGE_TONE" | "CREATE_ALTERNATIVE";
  targetSection?: string;
  instructions?: string;
  userId?: string;
}

export interface ManualEditInput {
  workspaceId: string;
  assetId: string;
  changeSummary?: string;
  userId?: string;
  blocks: Array<{
    id?: string;
    blockType: string;
    orderIndex: number;
    title?: string | null;
    content: string;
    example?: string | null;
    transition?: string | null;
    statementType?: string;
    claimId?: string | null;
    citationText?: string | null;
  }>;
}

export interface RestoreVersionInput {
  workspaceId: string;
  assetId: string;
  versionId: string;
  userId?: string;
}

export class WriterService {
  /**
   * Generates or rewrites structured content for an asset according to its type and Brand context.
   */
  static async generateContent(input: GenerateContentInput) {
    const {
      workspaceId,
      assetId,
      mode = "GENERATE",
      targetSection,
      instructions,
      userId = "Operator",
    } = input;

    const asset = await prisma.contentAsset.findFirst({
      where: { id: assetId, workspaceId },
      include: {
        campaign: {
          include: {
            brand: {
              include: { voice: true, editorialRules: true },
            },
          },
        },
      },
    });

    if (!asset) {
      throw new Error(`ContentAsset ${assetId} not found in workspace`);
    }

    // Build scoped context with Brand Brain + Strategy + Claims
    const writerContext = await ContextBuilder.buildWriterContext({
      workspaceId,
      campaignId: asset.campaignId,
      format: asset.type,
      assetTitle: asset.title,
      mode,
      targetSection,
      instructions,
    });

    // Invoke Provider
    const provider = await ProviderFactory.getProvider({ workspaceId });
    const runResult = await provider.generate({
      agentType: "WRITER",
      promptVersion: "v2.0",
      context: {
        ...writerContext,
        inputPayload: {
          format: asset.type,
          mode,
          targetSection,
          instructions,
        },
      },
    });

    if (!runResult.success || !runResult.data) {
      throw new Error(runResult.errorMessage || "Writer generation failed");
    }

    await ProviderFactory.recordUsage(workspaceId, runResult.provider, runResult.estimatedCostUsd);

    // Parse blocks & evidence moments per format schema
    const rawData = runResult.data;
    const blocksToCreate: Array<{
      blockType: string;
      orderIndex: number;
      title?: string | null;
      content: string;
      example?: string | null;
      transition?: string | null;
      statementType: string;
      unsupportedFlag: boolean;
      claimId?: string | null;
      citationText?: string | null;
    }> = [];

    // Map verified campaign claims for deterministic matching
    const campaignClaims = await prisma.claim.findMany({
      where: { campaignId: asset.campaignId },
      include: { primarySource: true, evidence: true },
    });
    const claimMap = new Map(campaignClaims.map((c) => [c.id, c]));

    if (asset.type === "YOUTUBE_LONG_FORM") {
      const parsed = YouTubeLongFormOutputSchema.parse(rawData);

      blocksToCreate.push({
        blockType: "HOOK",
        orderIndex: 0,
        title: "Hook (0:00 - 0:30)",
        content: parsed.hook,
        statementType: "INFERENCE",
        unsupportedFlag: false,
      });

      blocksToCreate.push({
        blockType: "PROMISE",
        orderIndex: 1,
        title: "Promise",
        content: parsed.promise,
        statementType: "OPINION",
        unsupportedFlag: false,
      });

      blocksToCreate.push({
        blockType: "CONTEXT",
        orderIndex: 2,
        title: "Context & Stakes",
        content: parsed.context,
        statementType: "INFERENCE",
        unsupportedFlag: false,
      });

      let blockIdx = 3;
      for (const ch of parsed.chapters) {
        // Evaluate chapter evidence moments
        const evidenceMoment = ch.evidenceMoments?.[0];
        let matchedClaimId = evidenceMoment?.claimId;
        let unsupportedFlag = false;

        if (evidenceMoment) {
          if (matchedClaimId && !claimMap.has(matchedClaimId)) {
            // Check if claim ID exists or match by text snippet
            const foundByText = campaignClaims.find((c) =>
              evidenceMoment.statement.toLowerCase().includes(c.claimText.slice(0, 20).toLowerCase())
            );
            if (foundByText) {
              matchedClaimId = foundByText.id;
            } else {
              unsupportedFlag = true;
            }
          } else if (!matchedClaimId && evidenceMoment.statementType === "FACT") {
            unsupportedFlag = true;
          }
        }

        blocksToCreate.push({
          blockType: "CHAPTER",
          orderIndex: blockIdx++,
          title: `Chapter ${ch.chapterNumber}: ${ch.title}`,
          content: ch.narration,
          example: ch.examples || null,
          transition: ch.transition || null,
          statementType: evidenceMoment?.statementType || "FACT",
          unsupportedFlag,
          claimId: matchedClaimId || null,
          citationText: evidenceMoment?.citation || null,
        });
      }

      blocksToCreate.push({
        blockType: "CONCLUSION",
        orderIndex: blockIdx++,
        title: "Conclusion",
        content: parsed.conclusion,
        statementType: "RECOMMENDATION",
        unsupportedFlag: false,
      });

      blocksToCreate.push({
        blockType: "CTA",
        orderIndex: blockIdx++,
        title: "Call to Action",
        content: parsed.cta,
        statementType: "RECOMMENDATION",
        unsupportedFlag: false,
      });
    } else if (asset.type === "YOUTUBE_SHORT") {
      const parsed = YouTubeShortOutputSchema.parse(rawData);
      const ev = parsed.evidenceMoments?.[0];
      const matchedClaimId = ev?.claimId && claimMap.has(ev.claimId) ? ev.claimId : null;

      blocksToCreate.push({
        blockType: "HOOK",
        orderIndex: 0,
        title: "Short Hook",
        content: parsed.hook,
        statementType: "INFERENCE",
        unsupportedFlag: false,
      });

      blocksToCreate.push({
        blockType: "BODY",
        orderIndex: 1,
        title: "Body & Evidence",
        content: parsed.body,
        statementType: ev?.statementType || "FACT",
        unsupportedFlag: ev?.statementType === "FACT" && !matchedClaimId,
        claimId: matchedClaimId,
      });

      blocksToCreate.push({
        blockType: "PAYOFF",
        orderIndex: 2,
        title: "Core Payoff",
        content: parsed.payoff,
        statementType: "RECOMMENDATION",
        unsupportedFlag: false,
      });

      blocksToCreate.push({
        blockType: "CTA",
        orderIndex: 3,
        title: "CTA",
        content: parsed.cta,
        statementType: "RECOMMENDATION",
        unsupportedFlag: false,
      });
    } else if (asset.type === "NEWSLETTER") {
      const parsed = NewsletterOutputSchema.parse(rawData);

      blocksToCreate.push({
        blockType: "SUBJECT",
        orderIndex: 0,
        title: "Subject Line",
        content: parsed.subject,
        statementType: "OPINION",
        unsupportedFlag: false,
      });

      blocksToCreate.push({
        blockType: "PREVIEW",
        orderIndex: 1,
        title: "Preview Text",
        content: parsed.previewText,
        statementType: "INFERENCE",
        unsupportedFlag: false,
      });

      blocksToCreate.push({
        blockType: "OPENING",
        orderIndex: 2,
        title: "Opening Hook",
        content: parsed.opening,
        statementType: "INFERENCE",
        unsupportedFlag: false,
      });

      let blockIdx = 3;
      for (const sec of parsed.sections) {
        const ev = sec.evidenceMoments?.[0];
        const matchedClaimId = ev?.claimId && claimMap.has(ev.claimId) ? ev.claimId : null;

        blocksToCreate.push({
          blockType: "SECTION",
          orderIndex: blockIdx++,
          title: sec.title,
          content: sec.content,
          statementType: ev?.statementType || "FACT",
          unsupportedFlag: ev?.statementType === "FACT" && !matchedClaimId,
          claimId: matchedClaimId,
        });
      }

      blocksToCreate.push({
        blockType: "CLOSING",
        orderIndex: blockIdx++,
        title: "Closing",
        content: parsed.closing,
        statementType: "RECOMMENDATION",
        unsupportedFlag: false,
      });

      blocksToCreate.push({
        blockType: "CTA",
        orderIndex: blockIdx++,
        title: "Call to Action",
        content: parsed.cta,
        statementType: "RECOMMENDATION",
        unsupportedFlag: false,
      });
    } else if (asset.type === "X_THREAD") {
      const parsed = XThreadOutputSchema.parse(rawData);

      blocksToCreate.push({
        blockType: "THREAD_HOOK",
        orderIndex: 0,
        title: "Thread Hook",
        content: parsed.threadHook,
        statementType: "INFERENCE",
        unsupportedFlag: false,
      });

      let blockIdx = 1;
      for (const p of parsed.posts) {
        const claimId = p.claimIds?.[0];
        const matchedClaimId = claimId && claimMap.has(claimId) ? claimId : null;

        blocksToCreate.push({
          blockType: "TWEET",
          orderIndex: blockIdx++,
          title: `Tweet ${p.postNumber}`,
          content: p.text,
          statementType: matchedClaimId ? "FACT" : "INFERENCE",
          unsupportedFlag: false,
          claimId: matchedClaimId,
        });
      }

      blocksToCreate.push({
        blockType: "CTA",
        orderIndex: blockIdx++,
        title: "Thread CTA",
        content: parsed.cta,
        statementType: "RECOMMENDATION",
        unsupportedFlag: false,
      });
    } else if (asset.type === "LINKEDIN_POST") {
      const parsed = LinkedInOutputSchema.parse(rawData);

      blocksToCreate.push({
        blockType: "HOOK",
        orderIndex: 0,
        title: "LinkedIn Hook",
        content: parsed.hook,
        statementType: "INFERENCE",
        unsupportedFlag: false,
      });

      let blockIdx = 1;
      for (const para of parsed.body) {
        // Check if paragraph mentions any verified claim text
        const matchedClaim = campaignClaims.find((c) =>
          para.toLowerCase().includes(c.claimText.slice(0, 25).toLowerCase())
        );

        blocksToCreate.push({
          blockType: "PARAGRAPH",
          orderIndex: blockIdx++,
          title: `Paragraph ${blockIdx - 1}`,
          content: para,
          statementType: matchedClaim ? "FACT" : "INFERENCE",
          unsupportedFlag: false,
          claimId: matchedClaim?.id || null,
        });
      }

      if (parsed.evidenceCallout) {
        blocksToCreate.push({
          blockType: "EVIDENCE_CALLOUT",
          orderIndex: blockIdx++,
          title: "Evidence Note",
          content: parsed.evidenceCallout,
          statementType: "FACT",
          unsupportedFlag: false,
        });
      }

      blocksToCreate.push({
        blockType: "TAKEAWAY",
        orderIndex: blockIdx++,
        title: "Takeaway",
        content: parsed.takeaway,
        statementType: "RECOMMENDATION",
        unsupportedFlag: false,
      });

      blocksToCreate.push({
        blockType: "CTA",
        orderIndex: blockIdx++,
        title: "Discussion CTA",
        content: parsed.cta,
        statementType: "RECOMMENDATION",
        unsupportedFlag: false,
      });
    }

    // Quality Metadata Calculation
    const editorialRules = asset.campaign.brand.editorialRules || [];
    const forbiddenWords = asset.campaign.brand.voice?.forbiddenWords || "";
    const qualityMeta = QualityChecker.analyze(blocksToCreate, editorialRules, forbiddenWords);

    // Compute next version number
    const latestVersion = await prisma.contentVersion.findFirst({
      where: { assetId },
      orderBy: { versionNumber: "desc" },
    });
    const nextVersionNumber = (latestVersion?.versionNumber || 0) + 1;

    // Persist new ContentVersion
    const version = await prisma.contentVersion.create({
      data: {
        assetId,
        versionNumber: nextVersionNumber,
        changeSummary:
          mode === "GENERATE"
            ? `Initial AI generation (${asset.type})`
            : `AI ${mode}: ${instructions || targetSection || "Selected sections"}`,
        sourceType: mode === "GENERATE" ? "AI_GENERATED" : "REWRITE_SELECTION",
        author: `AI:${runResult.provider}/${runResult.model}`,
        contentSnapshot: JSON.stringify({
          type: asset.type,
          rawData,
          qualityMeta,
        }),
      },
    });

    // Persist ContentBlocks and ClaimReferences
    for (const b of blocksToCreate) {
      const block = await prisma.contentBlock.create({
        data: {
          versionId: version.id,
          blockType: b.blockType,
          orderIndex: b.orderIndex,
          title: b.title,
          content: b.content,
          example: b.example,
          transition: b.transition,
          statementType: b.statementType,
          unsupportedFlag: b.unsupportedFlag,
        },
      });

      if (b.claimId) {
        await prisma.claimReference.create({
          data: {
            versionId: version.id,
            blockId: block.id,
            claimId: b.claimId,
            citationText: b.citationText,
            isGrounded: !b.unsupportedFlag,
          },
        });
      }
    }

    // Update ContentAsset
    await prisma.contentAsset.update({
      where: { id: assetId },
      data: {
        currentVersionId: version.id,
        status: "GENERATED",
        qualityMetadataJson: JSON.stringify(qualityMeta),
      },
    });

    return await prisma.contentVersion.findUnique({
      where: { id: version.id },
      include: {
        blocks: {
          orderBy: { orderIndex: "asc" },
          include: {
            claimReferences: {
              include: { claim: true },
            },
          },
        },
        claimReferences: {
          include: { claim: true },
        },
      },
    });
  }

  /**
   * Saves human manual edits to an asset as an immutable new ContentVersion.
   * Preserves version history and re-computes quality diagnostics.
   */
  static async saveManualEdit(input: ManualEditInput) {
    const { workspaceId, assetId, blocks, changeSummary = "Manual human edit", userId = "Operator" } = input;

    const asset = await prisma.contentAsset.findFirst({
      where: { id: assetId, workspaceId },
      include: {
        campaign: {
          include: {
            brand: {
              include: { voice: true, editorialRules: true },
            },
          },
        },
      },
    });

    if (!asset) {
      throw new Error(`ContentAsset ${assetId} not found in workspace`);
    }

    // Verify claim references exist in the campaign
    const campaignClaims = await prisma.claim.findMany({
      where: { campaignId: asset.campaignId },
      select: { id: true },
    });
    const validClaimIds = new Set(campaignClaims.map((c) => c.id));

    // Quality check
    const editorialRules = asset.campaign.brand.editorialRules || [];
    const forbiddenWords = asset.campaign.brand.voice?.forbiddenWords || "";
    const qualityMeta = QualityChecker.analyze(
      blocks.map((b) => ({
        title: b.title,
        content: b.content,
        statementType: b.statementType,
        unsupportedFlag: b.statementType === "FACT" && (!b.claimId || !validClaimIds.has(b.claimId)),
        claimId: b.claimId,
      })),
      editorialRules,
      forbiddenWords
    );

    // Determine next version number
    const latestVersion = await prisma.contentVersion.findFirst({
      where: { assetId },
      orderBy: { versionNumber: "desc" },
    });
    const nextVersionNumber = (latestVersion?.versionNumber || 0) + 1;

    // Execute version creation, blocks, and asset update atomically
    const version = await prisma.$transaction(async (tx) => {
      // Create new Version
      const createdVersion = await tx.contentVersion.create({
        data: {
          assetId,
          versionNumber: nextVersionNumber,
          changeSummary,
          sourceType: "MANUAL_EDIT",
          author: userId,
          contentSnapshot: JSON.stringify({
            blocksCount: blocks.length,
            qualityMeta,
          }),
        },
      });

      // Create ContentBlocks & ClaimReferences
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        const hasValidClaim = b.claimId && validClaimIds.has(b.claimId);
        const unsupportedFlag = b.statementType === "FACT" && !hasValidClaim;

        const createdBlock = await tx.contentBlock.create({
          data: {
            versionId: createdVersion.id,
            blockType: b.blockType,
            orderIndex: b.orderIndex ?? i,
            title: b.title || null,
            content: b.content,
            example: b.example || null,
            transition: b.transition || null,
            statementType: b.statementType || "FACT",
            unsupportedFlag,
          },
        });

        if (hasValidClaim && b.claimId) {
          await tx.claimReference.create({
            data: {
              versionId: createdVersion.id,
              blockId: createdBlock.id,
              claimId: b.claimId,
              citationText: b.citationText || null,
              isGrounded: true,
            },
          });
        }
      }

      // Update ContentAsset
      await tx.contentAsset.update({
        where: { id: assetId },
        data: {
          currentVersionId: createdVersion.id,
          status: "EDITING",
          qualityMetadataJson: JSON.stringify(qualityMeta),
        },
      });

      return createdVersion;
    });

    return await prisma.contentVersion.findUnique({
      where: { id: version.id },
      include: {
        blocks: {
          orderBy: { orderIndex: "asc" },
          include: {
            claimReferences: {
              include: { claim: true },
            },
          },
        },
      },
    });
  }

  /**
   * Restores an older version into a brand-new ContentVersion.
   * Guarantees history immutability (v1 -> v2 -> restore v1 -> v3).
   * Atomically invalidates previous approvals and resets asset status to EDITING.
   */
  static async restoreVersion(input: RestoreVersionInput) {
    const { workspaceId, assetId, versionId, userId = "Operator" } = input;

    const asset = await prisma.contentAsset.findFirst({
      where: { id: assetId, workspaceId },
    });
    if (!asset) throw new Error(`ContentAsset ${assetId} not found in workspace`);

    const targetVersion = await prisma.contentVersion.findUnique({
      where: { id: versionId },
      include: {
        blocks: {
          orderBy: { orderIndex: "asc" },
          include: { claimReferences: true },
        },
      },
    });
    if (!targetVersion || targetVersion.assetId !== assetId) {
      throw new Error(`Target version ${versionId} not found for asset`);
    }

    const latestVersion = await prisma.contentVersion.findFirst({
      where: { assetId },
      orderBy: { versionNumber: "desc" },
    });
    const nextVersionNumber = (latestVersion?.versionNumber || 0) + 1;

    // Atomically create restoration version and reset asset status to EDITING
    const restoredVersion = await prisma.$transaction(async (tx) => {
      const newVersion = await tx.contentVersion.create({
        data: {
          assetId,
          versionNumber: nextVersionNumber,
          changeSummary: `Restored from version ${targetVersion.versionNumber}`,
          sourceType: "RESTORED",
          author: userId,
          contentSnapshot: targetVersion.contentSnapshot,
        },
      });

      // Copy blocks and claim references into the new version
      for (const b of targetVersion.blocks) {
        const newBlock = await tx.contentBlock.create({
          data: {
            versionId: newVersion.id,
            blockType: b.blockType,
            orderIndex: b.orderIndex,
            title: b.title,
            content: b.content,
            example: b.example,
            transition: b.transition,
            statementType: b.statementType,
            unsupportedFlag: b.unsupportedFlag,
          },
        });

        for (const cr of b.claimReferences) {
          await tx.claimReference.create({
            data: {
              versionId: newVersion.id,
              blockId: newBlock.id,
              claimId: cr.claimId,
              citationText: cr.citationText,
              isGrounded: cr.isGrounded,
            },
          });
        }
      }

      // Update asset currentVersionId and reset status to EDITING (invalidating previous approvals)
      await tx.contentAsset.update({
        where: { id: assetId },
        data: {
          currentVersionId: newVersion.id,
          status: "EDITING",
        },
      });

      return newVersion;
    });

    return await prisma.contentVersion.findUnique({
      where: { id: restoredVersion.id },
      include: {
        blocks: {
          orderBy: { orderIndex: "asc" },
          include: {
            claimReferences: {
              include: { claim: true },
            },
          },
        },
      },
    });
  }
}

