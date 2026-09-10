# MediaOS Production Deployment Guide

This guide outlines the production deployment lifecycle for MediaOS across containerized environments (Railway, Docker, Kubernetes, AWS ECS).

---

## 1. Architecture Overview

- **Web Layer**: Next.js 14 (App Router) serving React server & client components and JSON API routes.
- **Database Layer**: PostgreSQL (v14+) managed database with Prisma ORM.
- **Storage & State**: Immutable relational snapshots (`MetricSnapshot`, `PublishingRecord`, `AuditLog`, `ContentVersion`).
- **Distributed Coordination**: Lease-based worker locking (`WorkerLock` table with TTL) for single and multi-instance concurrency safety.
- **Security & Secrets**: AES-256-GCM token encryption, HttpOnly SameSite session cookies, and zero-exposure telemetry scrubbing.

---

## 2. Production Deployment Lifecycle

### Step 1: Pre-Build Preparation
```bash
node scripts/prepare-db.js
```
- Inspects `DATABASE_URL`.
- If `postgresql://` or `postgres://` is detected, switches `prisma/schema.prisma` datasource provider from `sqlite` to `postgresql`.

### Step 2: Build & Client Compilation
```bash
npx prisma generate && npm run build
```
- Compiles Next.js routes, bundles client assets, and validates TypeScript types across all subsystems.

### Step 3: Database Preflight & Safe Migration
```bash
node scripts/db-preflight.js
```
- **Crucial Rule**: `prisma db push` is strictly prohibited in production.
- If migrations exist, executes `npx prisma migrate deploy`.
- Tests live database connectivity via `SELECT 1`.
- Confirms presence of operational tables without dropping or altering existing production data.

### Step 4: Web Process Boot
```bash
npm start
```
- Starts Next.js production server listening on `process.env.PORT || 3000`.
- Binds graceful shutdown handlers (`SIGTERM`, `SIGINT`) to disconnect Prisma and release active locks.

---

## 3. Health & Readiness Probes

Configure your load balancer or container platform with the following probes:

| Probe | Endpoint | Expected Status | Purpose |
| :--- | :--- | :---: | :--- |
| **Liveness** | `GET /api/health?check=liveness` | `200 OK` | Verifies HTTP process responsiveness, uptime, and memory usage. Independent of database connectivity. |
| **Readiness** | `GET /api/health?check=readiness` (default) | `200 OK` | Verifies database connectivity (`SELECT 1`), operational table counts, and worker lock status. Returns `503` if degraded. |

---

## 4. Rate Limiting & Scaling Considerations

- **Single-Instance Deployment (Default / Railway Basic)**:
  - MediaOS includes an in-memory token-bucket rate limiter (`RateLimiter`) with category-scoped buckets (`AUTH`, `RESEARCH`, `GENERATION`, `PUBLISHING`, `METRICS_INGESTION`, `ANALYTICS_SYNC`, `GENERAL`).
  - Provides strict tenant isolation and abuse defense on single instances.
- **Multi-Instance Horizontal Scaling**:
  - Because rate limiting is currently in-memory, independent replicas maintain local buckets.
  - **Requirement for Multi-Instance**: When deploying 2+ replicas behind a load balancer, configure a shared Redis-backed rate limiter to enforce cluster-wide quotas.
  - Worker locking (`WorkerLock`) is already database-backed and remains 100% safe across multiple instances without Redis.

---

## 5. Rollback & Disaster Recovery

1. **Database Immutability**:
   - `AuditLog`, `PublishingRecord`, and `MetricSnapshot` records are append-only. No application command truncates or drops historical records.
2. **Version Pinning**:
   - Content editing creates incremented, immutable `ContentVersion` records. Restoring previous versions creates a new version record, preserving full history.
3. **Graceful Degradation**:
   - If an external AI provider experiences an outage, setting `AI_DISABLED=true` instantly restores all workflows via manual mode without redeploying code.
