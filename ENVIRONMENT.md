# MediaOS Environment Variables & Secrets Reference

All supported environment configuration options and security specifications:

---

## 1. Core Production Variables

| Variable | Description | Default | Required in Production |
|---|---|---|---|
| `DATABASE_URL` | Database connection string. SQLite path (`file:./dev.db`) or PostgreSQL URL (`postgresql://user:pass@host:5432/dbname`). | `file:./dev.db` | **Yes** |
| `SESSION_SECRET` | 32+ character random secret used for HMAC session signing and JWT creation. | Development fallback | **Yes** |
| `ENCRYPTION_SECRET_KEY` | Exactly 32 bytes (64 hexadecimal characters) for AES-256-GCM token encryption at rest. Never logged. | Development fallback | **Yes** |
| `NODE_ENV` | Runtime environment mode (`development`, `production`, `test`). | `development` | **Yes** (`production`) |
| `APP_URL` | Canonical production domain URL (e.g. `https://mediaos.yourdomain.com`). Prevents localhost OAuth redirects. | Request origin fallback | **Yes** |
| `NEXT_PUBLIC_APP_URL` | Client-accessible canonical URL (e.g. `https://mediaos.yourdomain.com`). | Empty | Optional |
| `PORT` | Web server listening port. | `3000` | No |

---

## 2. Platform OAuth & External Publishing Credentials

*Leave empty to run in safe `[MOCK / DEMONSTRATION MODE]`. When set, real OAuth handshakes and publishing are active.*

| Variable | Platform | Description |
|---|---|---|
| `GOOGLE_CLIENT_ID` / `YOUTUBE_CLIENT_ID` | YouTube Data API v3 | Google OAuth 2.0 Client ID |
| `GOOGLE_CLIENT_SECRET` / `YOUTUBE_CLIENT_SECRET` | YouTube Data API v3 | Google OAuth 2.0 Client Secret |
| `TWITTER_CLIENT_ID` / `X_CLIENT_ID` | Twitter / X API v2 | Twitter OAuth 2.0 Client ID (User Context / PKCE) |
| `TWITTER_CLIENT_SECRET` / `X_CLIENT_SECRET` | Twitter / X API v2 | Twitter OAuth 2.0 Client Secret |
| `LINKEDIN_CLIENT_ID` | LinkedIn | LinkedIn OAuth 2.0 Client ID |
| `LINKEDIN_CLIENT_SECRET` | LinkedIn | LinkedIn OAuth 2.0 Client Secret |

---

## 3. AI Provider Configuration

| Variable | Description | Default | Required |
|---|---|---|---|
| `AI_PROVIDER_DEFAULT` | Active AI provider (`mock`, `gemini`, `openai`, `anthropic`). Set to `mock` for deterministic local development and tests. | `mock` | No |
| `GEMINI_API_KEY` | Google Gemini API key. | `""` | When using Gemini |
| `OPENAI_API_KEY` | OpenAI API key. | `""` | When using OpenAI |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key. | `""` | When using Anthropic |

---

## 4. Rate Limiting & Deployment Topologies

- **Single-Instance Deployment (Default / VPS / Docker)**:
  - Token-bucket rate limiting operates in Node.js process memory via `RateLimiter`.
  - Quotas (`AUTH: 10/min`, `RESEARCH: 20/min`, `GENERATION: 15/min`, `PUBLISHING: 10/min`, `METRICS_INGESTION: 30/min`, `ANALYTICS_SYNC: 10/min`, `GENERAL: 60/min`) are strictly enforced per tenant (`workspaceId`).
- **Multi-Instance / Horizontally Scaled Deployment (Kubernetes / Multi-Pod Railway)**:
  - When running multiple stateless web replicas behind a load balancer, each pod tracks its local in-memory token bucket.
  - To enforce unified global cluster limits across replicas, attach a shared Redis instance or distributed rate limiter adapter.
  - Distributed worker lease locking via database `WorkerLock` remains 100% globally consistent across any number of replicas.
