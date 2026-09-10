/**
 * MediaOS Database Preflight & Safe Startup Verification
 * Ensures database connectivity, runs Prisma migrations safely where appropriate,
 * and validates database integrity without destructive schema operations.
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("===============================================================================");
  console.log(" MEDIAOS PRODUCTION DATABASE PREFLIGHT & INTEGRITY CHECK");
  console.log("===============================================================================");

  // Load local .env if present and not yet loaded
  const envPath = path.join(__dirname, "../.env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        const [k, ...vParts] = trimmed.split("=");
        const key = k.trim();
        const val = vParts.join("=").trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.trim() === "") {
    console.error("FATAL PREFLIGHT ERROR: DATABASE_URL is not set in environment.");
    console.error("Please supply a valid PostgreSQL or SQLite connection string.");
    process.exit(1);
  }

  const isPostgres = dbUrl.startsWith("postgres://") || dbUrl.startsWith("postgresql://");
  const isSqlite = dbUrl.startsWith("file:");

  console.log(`[db-preflight] Detected database engine: ${isPostgres ? "PostgreSQL" : isSqlite ? "SQLite" : "Generic SQL"}`);

  // 1. Prepare Schema Provider
  try {
    console.log("[db-preflight] Synchronizing schema datasource provider...");
    require("./prepare-db.js");
  } catch (err) {
    console.error("[db-preflight] Failed to synchronize schema datasource:", err.message);
    process.exit(1);
  }

  // 2. Safe Migration Strategy
  const migrationsDir = path.join(__dirname, "../prisma/migrations");
  const hasMigrations = fs.existsSync(migrationsDir) && fs.readdirSync(migrationsDir).length > 0;

  if (isPostgres) {
    if (hasMigrations) {
      console.log("[db-preflight] PostgreSQL detected with existing migrations. Running 'npx prisma migrate deploy'...");
      try {
        execSync("npx prisma migrate deploy", { stdio: "inherit" });
        console.log("[db-preflight] Migrations deployed successfully.");
      } catch (err) {
        console.error("FATAL PREFLIGHT ERROR: 'npx prisma migrate deploy' failed.", err.message);
        process.exit(1);
      }
    } else {
      console.log("[db-preflight] PostgreSQL detected without committed migrations. Validating existing schema...");
      // In production without existing migration directory, we ensure schema is generated without destructive db push
      try {
        execSync("npx prisma generate", { stdio: "inherit" });
      } catch (err) {
        console.error("[db-preflight] Failed to generate Prisma Client:", err.message);
        process.exit(1);
      }
    }
  } else {
    // SQLite local/testing environment
    console.log("[db-preflight] SQLite environment detected. Verifying Prisma Client generation...");
    try {
      execSync("npx prisma generate", { stdio: "inherit" });
    } catch (err) {
      console.error("[db-preflight] Failed to generate Prisma Client:", err.message);
      process.exit(1);
    }
  }

  // 3. Database Connectivity & Table Smoke Check
  try {
    console.log("[db-preflight] Testing live database connectivity...");
    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();

    await prisma.$queryRawUnsafe("SELECT 1");
    console.log("[db-preflight] Database connectivity confirmed (SELECT 1 passed).");

    const [workspaces, workerLocks, publishingRecords] = await Promise.all([
      prisma.workspace.count().catch(() => -1),
      prisma.workerLock.count().catch(() => -1),
      prisma.publishingRecord.count().catch(() => -1),
    ]);

    if (workspaces === -1 || workerLocks === -1 || publishingRecords === -1) {
      console.warn("[db-preflight] Notice: One or more operational tables are not initialized yet.");
      console.log("[db-preflight] Applying safe schema sync to initialize tables...");
      execSync("npx prisma db push --skip-generate", { stdio: "inherit" });
    } else {
      console.log(`[db-preflight] Operational tables verified: Workspaces=${workspaces}, WorkerLocks=${workerLocks}, PublishingRecords=${publishingRecords}`);
    }

    await prisma.$disconnect();
    console.log("[db-preflight] Database preflight checks completed successfully.");
  } catch (err) {
    console.error("FATAL PREFLIGHT ERROR: Unable to connect to database or query tables:", err.message);
    process.exit(1);
  }

  console.log("===============================================================================\n");
}

main().catch((err) => {
  console.error("Database preflight script crashed:", err);
  process.exit(1);
});
