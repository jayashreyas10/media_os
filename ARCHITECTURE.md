# MediaOS Architecture

## System Overview

MediaOS is structured as a vertical-slice application ensuring clean separation of concerns:

```text
User Interface (Next.js App Router + Tailwind + Lucide)
   ↓
API Routes & Server Endpoints (/src/app/api/*)
   ↓
Domain Services (/src/server/services/*)
   ↓
AI Agent Subsystem (/src/server/ai/*)
   ↓
Data Repositories / Prisma Client (/src/server/db/*)
   ↓
Database Engine (SQLite locally / PostgreSQL in Production)
```

---

## 1. Campaign Finite State Machine & Multi-Campaign Kanban

The central production entity in MediaOS is the `Campaign`. It tracks the progression of an idea through 11 explicit stages:

```text
DISCOVERY
   ↓
RESEARCH
   ↓
STRATEGY
   ↓
CREATION
   ↓
DISTRIBUTION
   ↓
REVIEW (Editorial Gate)
   ↓  ⤷ [Revision loop back to CREATION]
APPROVAL (Human Gate)
   ↓  ⤷ [Revision loop back to REVIEW or CREATION]
SCHEDULED
   ↓
PUBLISHED
   ↓
ANALYTICS
   ↓
LEARNING (Playbook update proposals)
```

Transitions are strictly validated server-side by `src/server/domain/campaign-state-machine.ts`. The **Multi-Campaign Kanban Board** (`/campaigns/kanban`) provides a visual multi-column stage pipeline where cards can only be moved along verified valid transition paths.

---

## 2. Asynchronous Task Engine & DAG Dependency Chaining

All AI operations execute through the asynchronous `TaskEngine`:

1. **Idempotency**: Tasks support deterministic `idempotencyKey` values. Duplicate triggers return the existing queued or completed job rather than firing duplicate operations.
2. **Bounded Retries**: Transient failures are automatically retried up to `maxAttempts` (default 3) with recorded `TaskAttempt` telemetry.
3. **DAG Dependency Chaining**: Tasks can declare dependencies on other tasks via `TaskDependency`.
   - Dependent tasks are held in `WAITING` status.
   - When an upstream task completes, `triggerDownstreamTasks()` automatically evaluates prerequisites, transitions dependent tasks to `QUEUED`, and fires execution.
   - Enables automated workflows like `Signal Scout → Evidence Researcher → Content Strategist`.

---

## 3. Knowledge Base & Evidence Graph

### Knowledge Base
A unified repository for technical research, meeting transcripts, prompt playbooks, and campaign examples (`/knowledge`). Features keyword full-text search, multi-type filtering, and tag indexing.

### Source → Claim → Evidence Graph
An empirical verification graph (`/evidence`) connecting statements to primary source documentation:
- **Sources**: Peer-reviewed publications, technical documentation, benchmarks.
- **Claims**: Atomized statements with confidence scores and verification status (`VERIFIED`, `UNVERIFIED`, `CONTRADICTED`).
- **Evidence**: Verbatim quote snippets linked to specific sections, tables, or timestamps.

---

## 4. Content Studio & Evidence-Grounded Writing (Phase 4)

- **Multi-Format Generation**: Specialized writers for `YOUTUBE_LONG_FORM`, `YOUTUBE_SHORT`, `NEWSLETTER`, `X_THREAD`, and `LINKEDIN_POST`.
- **Claim Grounding Engine**: Content blocks link directly to verified claims in the Evidence Graph (`ClaimReference`), ensuring claims without empirical citations are surfaced to editors.
- **Immutable Content Versioning**: Edits create immutable version snapshots (`v1` $\rightarrow$ `v2` $\rightarrow$ `v3`) with structured visual block diffs and word/character change tracking.

---

## 5. Editorial Review & Mandatory Human Approval Gate (Phase 5)

- **AI Editorial Review**: Automated multi-point evaluation across evidence integrity, Brand Brain adherence, forbidden buzzwords, and structure.
- **Mandatory Human Approval Gate**: AI may review, recommend, and request revisions. **AI must never approve**. Only human operators (`REVIEWER_TYPES.HUMAN`) can sign off on publication readiness.
- **Bounded Revision Loops**: Automated revision cycles are capped at 3 attempts; unresolvable assets transition to `REQUIRES_HUMAN_INTERVENTION`.
- **Approval Invalidation**: Any content edit immediately revokes approval, resetting status to `EDITING`.

---

## 6. Analytics & Closed-Loop Learning Engine (Phase 6)

- **Raw Metric Immutability**: Historical raw counts are stored un-mutated; derived metrics (CTR, engagement, conversion) are calculated separately.
- **Metric Ingestion Idempotency**: Deterministic SHA-256 keys prevent double-counting on repeated syncs.
- **Statistical Rigor Thresholds**: $N < 3 \rightarrow$ `ANECDOTAL`, $3 \le N < 10 \rightarrow$ `DIRECTIONAL`, $N \ge 10 \rightarrow$ `ELIGIBLE_FOR_TESTING`. Statistical significance requires formal testing.
- **Strategy Feedback Loop**: Human-accepted recommendations are injected into future campaign strategy prompts (`StrategistService.developStrategy`), completing the closed loop.

---

## 7. External Publishing & OAuth Integrations (Phase 7)

- **OAuth CSRF & State Nonce**: Cryptographically secure 32-byte single-use state tokens with 10-minute TTL.
- **AES-256-GCM Token Encryption**: Secrets encrypted at rest with random 12-byte IVs and 16-byte auth tags. Zero token exposure in UI, DTOs, or logs.
- **Exact Version Lock**: Publishing is strictly locked to the approved version (`currentVersionId`).
- **SHA-256 Delivery Idempotency**: Hash prevents duplicate post or video dispatch across all supported platform adapters (YouTube, X, LinkedIn, Newsletter).

