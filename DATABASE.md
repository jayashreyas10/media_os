# MediaOS Database Architecture & Portability

MediaOS is built with database portability as a core engineering tenet. It is designed to run locally on SQLite without external dependencies and in production on PostgreSQL (Supabase / Railway).

---

## 1. Portability Guarantees

To ensure 100% portability between SQLite and PostgreSQL:
1. **No PostgreSQL-Only Enums**: Stage, type, and role columns use typed string constants validated by Zod and TypeScript at the application layer.
2. **UUID Primary Keys**: All relational models use `@default(uuid())` or `@default(cuid())` strings compatible with both database engines.
3. **Normalized Relational Modeling**: Avoids un-queryable JSON blobs for core business relationships (Brand Brain pillars, editorial rules, campaign stages, knowledge items, evidence graph, task dependencies).
4. **Stringified JSON Fields**: `inputJson`, `outputJson`, `detailsJson` use String columns rather than Postgres-specific JSONB, guaranteeing deterministic query behavior across both SQLite and Postgres.

---

## 2. Core Relational Entities

### Tenancy & Identity
- `User`: Operator credentials, roles, sessions.
- `Workspace`: Tenancy boundary. Owns brands, tasks, knowledge items, sources, and audit logs.
- `Brand`: Editorial identity umbrella within a workspace.

### Brand Brain (Editorial Memory)
- `BrandIdentity` (1:1)
- `AudienceProfile` (1:1)
- `BrandVoice` (1:1)
- `ContentPillar` (1:N)
- `Goal` (1:N)
- `Offer` (1:N)
- `Proof` (1:N)
- `EditorialRule` (1:N)

### Knowledge Base (Phase 2)
- `KnowledgeItem`: Searchable repository entries across `NOTE`, `DOCUMENT`, `URL`, `TRANSCRIPT`, `EXAMPLE`, `CAMPAIGN`, `RESEARCH`, `PLAYBOOK`.
- `KnowledgeTag`: Workspace-scoped tags for categorizing knowledge.

### Source → Claim → Evidence Graph (Phase 2)
- `Source`: Primary sources, benchmark papers, and publications with `trustScore` (1-100).
- `Claim`: Granular empirical statements with `confidence` (1-100), `isFact`, and `verificationStatus` (`VERIFIED`, `UNVERIFIED`, `CONTRADICTED`).
- `Evidence`: Verbatim quote snippets linking claims directly to primary sources with context and timestamp/page references.

### Campaign Pipeline & Kanban
- `Campaign`: Core production item with `stage`, `priority`, and target dates.
- `CampaignStageHistory`: Append-only history of transitions.

### Task Engine & DAG Dependency (Phase 2)
- `Task`: Queued, running, waiting, or completed operations.
- `TaskDependency`: Directional graph edges defining prerequisite tasks. Enables automated execution chaining (e.g. Scout → Researcher → Strategist).
- `TaskAttempt`: Telemetry and retry records.
- `AgentRun`: Token counts, costs, and durations.
- `AuditLog`: Immutable audit trail.

### Content Studio & Assets (Phase 4)
- `Strategy`: Structured thesis, central tension, narrative outline, and target reader profile.
- `ContentAsset`: Canonical multi-format content entity (`YOUTUBE_LONG_FORM`, `YOUTUBE_SHORT`, `NEWSLETTER`, `X_THREAD`, `LINKEDIN_POST`).
- `ContentVersion`: Immutable version history snapshots (`versionNumber`, `changeSummary`, `metricsJson`).
- `ContentBlock`: Ordered modular content blocks (`HOOK`, `CHAPTER`, `QUOTE`, `CTA`, etc.).
- `ClaimReference`: Grounding link between content blocks and verified claims.

### Editorial Review & Human Approval (Phase 5)
- `EditorialReview`: AI and human review records with category/severity findings and scores.
- `RevisionRequest`: Structured directives for automated or manual fixes (`PENDING`, `RESOLVED`).
- `ApprovalRecord`: Immutable human sign-off bound strictly to a specific `ContentVersion`.

### Analytics & Learning Engine (Phase 6)
- `MetricSnapshot`: Raw platform metrics with immutable observation counts, derived rates, and deterministic `idempotencyKey`.
- `LearningRecord`: Synthesized cross-campaign pattern observations, sample sizes, and significance tiers (`ANECDOTAL`, `DIRECTIONAL`, `ELIGIBLE_FOR_TESTING`).
- `StrategyRecommendation`: Actionable strategic advice requiring explicit human operator review (`PENDING`, `ACCEPTED`, `REJECTED`).

### External Publishing & OAuth (Phase 7)
- `OAuthState`: Ephemeral CSRF state token with 32-byte crypto token, 10m TTL, and single-use lock.
- `ConnectedAccount`: Multi-platform channel credentials (`YOUTUBE`, `X`, `LINKEDIN`, `NEWSLETTER`) with AES-256-GCM encrypted tokens.
- `PublishingRecord`: Distribution tracking with deterministic SHA-256 `idempotencyKey`, `externalPostId`, and `externalPostUrl`.

### Telemetry, Sync & Worker Operations (Phase 8)
- `MetricSyncJob`: Recurring and on-demand synchronization execution tracking (`status`, `periodStart`, `periodEnd`, `syncedSnapshotsCount`, `attemptCount`).
- `WorkerLock`: Distributed lease-based mutual exclusion lock with auto-expiring TTL (`expiresAt`) and crash recovery.

---

## 3. Production Migration & Deployment Workflow

### Safe Migration Procedure:
1. **Never use `db push --force-reset` in staging or production.**
2. In production environments, run:
   ```bash
   npx prisma migrate deploy
   ```
3. Generate the latest client:
   ```bash
   npx prisma generate
   ```

---

## 4. Backup and Disaster Recovery Procedure

### A. SQLite Deployments (Self-Hosted / Single-Instance)
1. **Backup**:
   Use SQLite's atomic online backup command to avoid locking write transactions:
   ```bash
   sqlite3 dev.db ".backup 'backups/mediaos_backup_$(date +%Y%m%d_%H%M%S).db'"
   ```
2. **Restore**:
   Stop the MediaOS application service:
   ```bash
   pm2 stop mediaos # or docker compose stop app
   cp backups/mediaos_backup_TARGET.db dev.db
   npx prisma generate
   pm2 start mediaos # or docker compose start app
   ```

### B. PostgreSQL Deployments (Production Supabase / Railway)
1. **Automated Scheduled Backup**:
   Run daily logical backups via `pg_dump`:
   ```bash
   pg_dump -Fc --no-acl --no-owner -d "$DATABASE_URL" -f "mediaos_pg_$(date +%Y%m%d_%H%M%S).dump"
   ```
2. **Point-In-Time Restoration**:
   To restore from a dump into a clean database instance:
   ```bash
   pg_restore --clean --if-exists --no-acl --no-owner -d "$DATABASE_URL" "mediaos_pg_TARGET.dump"
   npx prisma migrate deploy
   ```
3. **Data Integrity Verification**:
   Verify core tables after restoration:
   ```sql
   SELECT COUNT(*) FROM "Workspace";
   SELECT COUNT(*) FROM "AuditLog";
   SELECT COUNT(*) FROM "PublishingRecord";
   ```

