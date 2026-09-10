import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function inspect() {
  const tasks = await prisma.task.findMany({
    include: {
      dependencies: true,
      dependentTasks: true,
      attempts: true,
      campaign: { select: { id: true, title: true, stage: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  console.log("Total tasks in database:", tasks.length);

  const byAgent = {};
  for (const t of tasks) {
    const key = `${t.agentName || t.taskType || t.agentType} [${t.status}]`;
    if (!byAgent[key]) byAgent[key] = [];
    byAgent[key].push({
      id: t.id,
      agentType: t.agentType,
      taskType: t.taskType,
      agentName: t.agentName,
      status: t.status,
      campaignId: t.campaignId,
      campaign: t.campaign?.title,
      campaignStage: t.campaign?.stage,
      createdAt: t.createdAt,
      error: t.errorMessage || t.lastError,
      input: t.inputJson,
      deps: t.dependencies.map((d) => d.dependsOnTaskId),
      dependentTasks: t.dependentTasks?.map((p) => p.taskId),
    });
  }

  for (const [k, v] of Object.entries(byAgent)) {
    console.log(`\n=== ${k} (count: ${v.length}) ===`);
    for (const item of v) {
      console.log(` - ID: ${item.id} | Campaign: "${item.campaign || 'None'}" (${item.campaignStage || 'N/A'}) | Created: ${item.createdAt.toISOString()}`);
      if (item.error) console.log(`   Error: ${item.error}`);
      if (item.deps?.length) console.log(`   Depends on: ${item.deps.join(", ")}`);
      if (item.input && item.input !== "{}") console.log(`   Input: ${item.input.slice(0, 100)}`);
    }
  }

  // Also inspect PublishingRecords and AuditLogs
  console.log("\n=======================================================");
  console.log("PUBLISHING RECORDS IN DATABASE:");
  const pubRecords = await prisma.publishingRecord.findMany({
    include: {
      contentAsset: { select: { id: true, title: true, status: true, currentVersionId: true } },
      contentVersion: { select: { id: true, versionNumber: true } },
      connectedAccount: { select: { id: true, platform: true, accountName: true, status: true } },
      campaign: { select: { id: true, title: true } },
      publishedByUser: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(`Total PublishingRecords: ${pubRecords.length}`);
  for (const pr of pubRecords) {
    console.log({
      id: pr.id,
      platform: pr.platform,
      status: pr.status,
      externalPostId: pr.externalPostId,
      externalPostUrl: pr.externalPostUrl,
      idempotencyKey: pr.idempotencyKey,
      assetId: pr.contentAssetId,
      assetTitle: pr.contentAsset.title,
      assetStatus: pr.contentAsset.status,
      assetCurrentVersionId: pr.contentAsset.currentVersionId,
      publishedVersionId: pr.contentVersionId,
      versionMatches: pr.contentAsset.currentVersionId === pr.contentVersionId,
      publishedBy: pr.publishedByUser.name,
      createdAt: pr.createdAt,
    });
  }

  console.log("\n=======================================================");
  console.log("CONTENT_PUBLISHED AUDIT LOGS IN DATABASE:");
  const pubLogs = await prisma.auditLog.findMany({
    where: { action: "CONTENT_PUBLISHED" },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  console.log(`Total CONTENT_PUBLISHED AuditLogs: ${pubLogs.length}`);
  for (const pl of pubLogs) {
    console.log({
      id: pl.id,
      action: pl.action,
      entityType: pl.entityType,
      entityId: pl.entityId,
      user: pl.user?.name,
      details: pl.detailsJson,
      createdAt: pl.createdAt,
    });
  }
}

inspect().finally(() => prisma.$disconnect());
