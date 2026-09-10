const fs = require("fs");
const path = require("path");

const schemaPath = path.join(__dirname, "../prisma/schema.prisma");
if (!fs.existsSync(schemaPath)) {
  console.error("[prepare-db] schema.prisma not found at", schemaPath);
  process.exit(0);
}

let schema = fs.readFileSync(schemaPath, "utf8");
const dbUrl = process.env.DATABASE_URL || "";

if (dbUrl.startsWith("postgres://") || dbUrl.startsWith("postgresql://")) {
  console.log("[prepare-db] Detected PostgreSQL DATABASE_URL. Configuring Prisma schema provider = \"postgresql\"...");
  schema = schema.replace(/provider\s*=\s*"sqlite"/g, 'provider = "postgresql"');
  fs.writeFileSync(schemaPath, schema, "utf8");
  console.log("[prepare-db] schema.prisma updated for PostgreSQL.");
} else {
  console.log("[prepare-db] Using SQLite datasource provider.");
  if (schema.includes('provider = "postgresql"')) {
    schema = schema.replace(/provider\s*=\s*"postgresql"/g, 'provider = "sqlite"');
    fs.writeFileSync(schemaPath, schema, "utf8");
    console.log("[prepare-db] schema.prisma updated for SQLite.");
  }
  // Ensure DATABASE_URL exists in .env and prisma/.env if not set in environment
  const envPath = path.join(__dirname, "../.env");
  const prismaEnvPath = path.join(__dirname, "../prisma/.env");
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "file:./dev.db";
    console.log("[prepare-db] DATABASE_URL missing from environment. Defaulted to file:./dev.db");
    if (!fs.existsSync(envPath)) {
      fs.writeFileSync(envPath, 'DATABASE_URL="file:./dev.db"\n', "utf8");
    } else {
      let envContent = fs.readFileSync(envPath, "utf8");
      if (!envContent.includes("DATABASE_URL=")) {
        fs.appendFileSync(envPath, '\nDATABASE_URL="file:./dev.db"\n', "utf8");
      }
    }
    if (!fs.existsSync(prismaEnvPath)) {
      fs.writeFileSync(prismaEnvPath, 'DATABASE_URL="file:./dev.db"\n', "utf8");
    } else {
      let prismaEnvContent = fs.readFileSync(prismaEnvPath, "utf8");
      if (!prismaEnvContent.includes("DATABASE_URL=")) {
        fs.appendFileSync(prismaEnvPath, '\nDATABASE_URL="file:./dev.db"\n', "utf8");
      }
    }
  }
}
