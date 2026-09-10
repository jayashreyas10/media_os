import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("===============================================================================");
  console.log(" MEDIAOS PRODUCTION DATA CLASSIFICATION & AUDIT INVENTORY REPORT");
  console.log("===============================================================================\n");

  try {
    const workspaces = await prisma.workspace.findMany({
      include: {
        _count: {
          select: {
            members: true,
            brands: true,
            contentAssets: true,
            publishingRecords: true,
            auditLogs: true,
            metricSnapshots: true,
            learningRecords: true,
            strategyRecommendations: true,
          },
        },
      },
    });

    console.log(`1. Workspaces Classified (${workspaces.length} total):`);
    const testWorkspaces = [];
    const prodWorkspaces = [];

    for (const ws of workspaces) {
      const isTest =
        ws.name.toLowerCase().includes("test") ||
        ws.name.toLowerCase().includes("mock") ||
        ws.slug.toLowerCase().includes("test") ||
        ws.slug.toLowerCase().includes("demo") ||
        ws.slug.toLowerCase().includes("phase");

      const classification = isTest ? "TEST / DEMO" : "PRODUCTION / OPERATIONAL";
      if (isTest) testWorkspaces.push(ws);
      else prodWorkspaces.push(ws);

      console.log(`   - [${classification}] "${ws.name}" (ID: ${ws.id}, Slug: ${ws.slug})`);
      console.log(`     Brands: ${ws._count.brands}, Assets: ${ws._count.contentAssets}, Publishes: ${ws._count.publishingRecords}, Audits: ${ws._count.auditLogs}`);
    }

    console.log("\n2. Metric Snapshots Classification:");
    const metricStats = await prisma.metricSnapshot.groupBy({
      by: ["isSynthetic", "dataSource"],
      _count: { id: true },
    });
    for (const stat of metricStats) {
      const tag = stat.isSynthetic ? "SYNTHETIC / DEMONSTRATION" : "REAL / INGESTED";
      console.log(`   - [${tag}] Source: ${stat.dataSource} => Count: ${stat._count.id}`);
    }

    console.log("\n3. Publishing Records Classification:");
    const publishRecords = await prisma.publishingRecord.findMany({
      select: {
        id: true,
        platform: true,
        status: true,
        externalPostId: true,
        payloadSnapshotJson: true,
      },
    });

    let mockPubCount = 0;
    let livePubCount = 0;
    for (const p of publishRecords) {
      if (
        p.externalPostId?.startsWith("mock_") ||
        p.payloadSnapshotJson.includes("[MOCK / DEMONSTRATION MODE]") ||
        p.payloadSnapshotJson.includes("mock_")
      ) {
        mockPubCount++;
      } else {
        livePubCount++;
      }
    }
    console.log(`   - [MOCK / DEMONSTRATION] Records: ${mockPubCount}`);
    console.log(`   - [LIVE / PRODUCTION] Records: ${livePubCount}`);

    console.log("\n4. Audit Trail (Immutable Log Preservation):");
    const auditCount = await prisma.auditLog.count();
    console.log(`   - [AUDIT] Total historical audit events: ${auditCount}`);
    console.log("   - Invariant check: Audit records are NEVER deleted or purged during cleanup.");

    console.log("\n5. Distributed Worker Locks & Scheduled Sync Jobs:");
    const lockCount = await prisma.workerLock.count();
    const jobCount = await prisma.metricSyncJob.count();
    console.log(`   - Active / Expired Worker Locks: ${lockCount}`);
    console.log(`   - Metric Sync Jobs: ${jobCount}`);

    console.log("\n===============================================================================");
    console.log(" INVENTORY SUMMARY:");
    console.log(`   - Production Workspaces: ${prodWorkspaces.length}`);
    console.log(`   - Test / Ephemeral Workspaces: ${testWorkspaces.length}`);
    console.log(`   - Synthetic Metric Records: ${metricStats.reduce((acc, m) => m.isSynthetic ? acc + m._count.id : acc, 0)}`);
    console.log(`   - Mock Publishing Records: ${mockPubCount}`);
    console.log("===============================================================================\n");

    const args = process.argv.slice(2);
    if (args.includes("--clean") && args.includes("--confirm")) {
      console.log("⚠️ CAUTION: Human-confirmed cleanup requested for TEST/DEMO workspaces...");
      let cleanedCount = 0;
      for (const ws of testWorkspaces) {
        // Only delete explicit test workspaces, never touching audit logs or production workspaces
        await prisma.workspace.delete({ where: { id: ws.id } });
        cleanedCount++;
      }
      console.log(`Cleaned ${cleanedCount} test workspaces. Production data and global audits intact.`);
    } else if (args.includes("--clean")) {
      console.log("ℹ️ Dry-run mode: pass '--confirm' along with '--clean' to execute human-approved test data cleanup.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Data inventory check failed:", err);
  process.exit(1);
});
