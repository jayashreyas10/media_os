# MediaOS

> **Version 2.0 — Production-Grade One-Person Media Company Operating System**

MediaOS operates a one-person media company from a single, unified workspace. It manages the end-to-end editorial lifecycle:

**IDEA → DISCOVERY → RESEARCH → STRATEGY → CREATION → DISTRIBUTION → EDITORIAL REVIEW → HUMAN APPROVAL → PUBLISHING → ANALYTICS → LEARNING → PLAYBOOK UPDATE**

---

## ⚡ Quick Start (Free-First & Local Zero-Dependency)

MediaOS runs 100% locally with zero external API dependencies using deterministic Mock AI:

```bash
# 1. Install dependencies
npm install

# 2. Push database schema to local SQLite
npm run db:push

# 3. Seed demonstration media company & Brand Brain
npm run db:seed

# 4. Start local development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Reviewer / Demo Access
- Click **"One-Click Login as Seeded Operator"** on `/login`
- Email: `operator@mediaos.local`
- Password: `Password123!`

---

## 🏗️ Core Architecture & Principles

1. **Human-in-the-Loop Governance**: AI prepares, researches, drafts, and flags issues. The human operator holds absolute authority over irreversible publishing and playbook decisions.
2. **Database State Over Chat History**: Important state is modeled relationally in SQLite/PostgreSQL—not buried inside conversational chat logs.
3. **Database Portability**: Built with Prisma ORM strictly maintained to work seamlessly on SQLite (`file:./dev.db`) locally and PostgreSQL (Supabase / Railway) in production.
4. **Deterministic Mock Mode**: Out-of-the-box operation requires zero paid API keys. All 6 AI roles provide domain-specific, realistic, Zod-validated payloads.
5. **Finite State Machine**: 11 explicit production stages with strict server-side validation and revision rollback loops.
6. **Persistent Task Queue**: Idempotent AI jobs with bounded retries, attempt logs, and duration/token telemetry.

---

## 🧭 System Overview

| Area | Route | Description |
|---|---|---|
| **Dashboard** | `/` | Pipeline summary, quick agent runners, active campaign spotlight |
| **Campaigns** | `/campaigns` | Visual stage progression, transition controls, and campaign tasks |
| **Brand Brain** | `/brand-brain` | Persistent editorial memory: Identity, Audience, Voice, Pillars, Rules |
| **Task Queue** | `/tasks` | Real-time task execution monitor, Zod output inspector, and retry console |
| **Audit Log** | `/audit` | Append-only immutable log of state transitions and system modifications |
| **Health Check** | `/api/health` | HTTP 200 health probe for container and uptime monitoring |

---

## 🧪 Testing & Verification

```bash
# Run unit & domain integration tests (Vitest)
npm run test

# Run strict production build
npm run build
```

---

## 📚 Technical Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — System layers, state machine, and task runner
- [DATABASE.md](./DATABASE.md) — Schema design, relational models, and SQLite/PostgreSQL portability
- [AI_AGENTS.md](./AI_AGENTS.md) — 6 specialized AI roles, context selection, and Zod schemas
- [DEPLOYMENT.md](./DEPLOYMENT.md) — Docker, Railway, and VPS production deployment
- [ENVIRONMENT.md](./ENVIRONMENT.md) — Configuration parameters and environment variables
- [SECURITY.md](./SECURITY.md) — Session management, prompt injection defense, and audit logging
- [ROADMAP.md](./ROADMAP.md) — Phase 1 to Phase 7 engineering milestones
- [DEVELOPMENT_LOG.md](./DEVELOPMENT_LOG.md) — Chronological Phase 1 milestone record
