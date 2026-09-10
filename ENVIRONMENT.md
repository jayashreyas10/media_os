# MediaOS Production Environment Configuration Matrix

This document defines every environment variable verified and actively referenced across the MediaOS codebase.

---

## 1. Definitive Environment Matrix

| Variable | Required? | Secret? | Purpose | Example Format | Safe Default? | Failure Behavior |
| :--- | :---: | :---: | :--- | :--- | :--- | :--- |
| **`NODE_ENV`** | **Yes** | No | Controls runtime behavior, logging verbosity, and cookie security flags. | `production` | `"development"` | Insecure cookies permitted; development debug logging enabled. |
| **`DATABASE_URL`** | **Yes** | **Yes** | Connection string for PostgreSQL in production or SQLite in development/testing. | `postgresql://user:pass@host:5432/db` | `file:./dev.db` | Application startup halts immediately during preflight check with exit code 1. |
| **`APP_URL`** | **Yes** | No | Canonical public origin used to construct deterministic OAuth redirect URIs and absolute resource links. | `https://mediaos.up.railway.app` | `http://localhost:3000` | OAuth callbacks default to localhost origin, breaking external provider redirects. |
| **`NEXT_PUBLIC_APP_URL`** | Optional | No | Client-side accessible fallback origin for frontend navigation and OAuth initiation. | `https://mediaos.up.railway.app` | Fallback to `window.location.origin` or `APP_URL` | Defaults to window location in browser. |
| **`SESSION_SECRET`** | **Yes** | **Yes** | Cryptographic key used to sign session cookies and authenticate user sessions. | 64 hex chars or 32+ char string | Fallback to dev secret in development | In production, if missing, falls back to `ENCRYPTION_SECRET_KEY`; if both missing, halts startup. |
| **`ENCRYPTION_SECRET_KEY`** | **Yes** | **Yes** | 256-bit key for AES-256-GCM encryption of OAuth access & refresh tokens at rest. | `a1b2c3d4...` (64 hex characters) | Dev key (dev only) | In production, missing key throws fatal `CRITICAL SECURITY ERROR` on server boot. |
| **`AI_DISABLED`** | Optional | No | Master killswitch for all external AI provider calls and mock generation. | `true` or `false` | `false` | When `true`, automated AI calls throw HTTP 503 `AIDisabledError`. Manual workflows remain 100% operational. |
| **`AI_PROVIDER_DEFAULT`** | Optional | No | Selects default AI provider engine when AI is enabled. | `mock`, `openai`, `anthropic`, `gemini` | `"mock"` | Uses mock provider if credentials are not configured or if explicitly set to `mock`. |
| **`AI_MODE`** | Optional | No | Explicit operational override: `LIVE`, `MOCK`, or `DISABLED`. | `DISABLED` | Resolved dynamically | If omitted, resolves automatically based on `AI_DISABLED` and available API keys. |
| **`OPENAI_API_KEY`** | Optional | **Yes** | API key for OpenAI GPT-4o provider. | `sk-proj-...` | None | OpenAI provider marked unavailable; falls back to mock or throws if OpenAI specifically requested. |
| **`ANTHROPIC_API_KEY`** | Optional | **Yes** | API key for Anthropic Claude 3.5 Sonnet provider. | `sk-ant-api03-...` | None | Anthropic provider marked unavailable; falls back to mock or throws if Claude specifically requested. |
| **`GEMINI_API_KEY`** | Optional | **Yes** | API key for Google Gemini 1.5 Pro provider. | `AIzaSy...` | None | Gemini provider marked unavailable; falls back to mock or throws if Gemini specifically requested. |
| **`GOOGLE_CLIENT_ID`** / `YOUTUBE_CLIENT_ID` | Optional | No | Google OAuth 2.0 Client ID for YouTube Data API publishing and metric sync. | `123456789.apps.googleusercontent.com` | None | YouTube integration operates in `[MOCK / DEMONSTRATION MODE]`. |
| **`GOOGLE_CLIENT_SECRET`** / `YOUTUBE_CLIENT_SECRET` | Optional | **Yes** | Google OAuth 2.0 Client Secret for YouTube token exchange. | `GOCSPX-...` | None | YouTube integration operates in `[MOCK / DEMONSTRATION MODE]`. |
| **`TWITTER_CLIENT_ID`** / `X_CLIENT_ID` | Optional | No | Twitter/X OAuth 2.0 Client ID (supports PKCE S256). | `T1Zz...` | None | X integration operates in `[MOCK / DEMONSTRATION MODE]`. |
| **`TWITTER_CLIENT_SECRET`** / `X_CLIENT_SECRET` | Optional | **Yes** | Twitter/X OAuth 2.0 Client Secret for confidential token exchange. | `xyz...` | None | X integration operates in `[MOCK / DEMONSTRATION MODE]`. |
| **`LINKEDIN_CLIENT_ID`** | Optional | No | LinkedIn OAuth 2.0 Client ID for page and profile posting. | `86abc...` | None | LinkedIn integration operates in `[MOCK / DEMONSTRATION MODE]`. |
| **`LINKEDIN_CLIENT_SECRET`** | Optional | **Yes** | LinkedIn OAuth 2.0 Client Secret for token exchange. | `secret...` | None | LinkedIn integration operates in `[MOCK / DEMONSTRATION MODE]`. |
| **`PORT`** | Optional | No | Port on which the HTTP server listens. | `3000` | `3000` | Automatically assigned by Railway/cloud platform. Defaults to `3000`. |

---

## 2. Minimal Required Variables for Production Deployment

For a secure production deployment with full manual mode operational and mock social channels:

```bash
NODE_ENV=production
DATABASE_URL=postgresql://user:password@host:5432/railway
APP_URL=https://your-service.up.railway.app
SESSION_SECRET=a_secure_random_64_character_hex_string
ENCRYPTION_SECRET_KEY=a_secure_random_64_character_hex_string
AI_DISABLED=true   # Set to true for 100% manual operations; false when adding live keys
```

---

## 3. Variable Validation & Diagnostic Preflight

MediaOS includes automated verification on server initialization via `scripts/db-preflight.js` and `validateEncryptionConfig()`:

1. **`DATABASE_URL` check**: Confirms presence and validates PostgreSQL / SQLite format.
2. **`ENCRYPTION_SECRET_KEY` check**: Confirms key is exactly 32 bytes (64 hex or 32 raw bytes). In `NODE_ENV=production`, server boot crashes with a diagnostic error if invalid.
3. **Telemetry Redaction**: All logged environment variables, headers, and traces automatically mask secret keys (`SESSION_SECRET`, `ENCRYPTION_SECRET_KEY`, `DATABASE_URL` credentials, `API_KEY`, `CLIENT_SECRET`).
