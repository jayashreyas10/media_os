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
}
