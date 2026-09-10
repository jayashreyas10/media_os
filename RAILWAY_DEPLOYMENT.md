# MediaOS — Railway Production Deployment Guide

This guide provides step-by-step instructions for deploying MediaOS to [Railway](https://railway.app). The codebase includes native Railway configuration via [`railway.json`](file:///c:/Users/ensen/Desktop/MT/agent/railway.json) and automated database provider detection.

---

## 1. Architecture on Railway

- **Build Engine**: Nixpacks (Node.js 20+ runtime, automated caching).
- **Build Pipeline**: [`scripts/prepare-db.js`](file:///c:/Users/ensen/Desktop/MT/agent/scripts/prepare-db.js) $\rightarrow$ `npx prisma generate` $\rightarrow$ `npm run build`.
- **Deploy Pipeline**: [`scripts/prepare-db.js`](file:///c:/Users/ensen/Desktop/MT/agent/scripts/prepare-db.js) $\rightarrow$ [`scripts/db-preflight.js`](file:///c:/Users/ensen/Desktop/MT/agent/scripts/db-preflight.js) $\rightarrow$ `npm start`.
- **Production Safety Rule**: `npx prisma db push` is strictly forbidden in production. Preflight uses `npx prisma migrate deploy` for committed migrations and validates table schemas without destructive operations.
- **Automated Database Switching**: If Railway PostgreSQL is attached, `prepare-db.js` automatically configures Prisma for PostgreSQL.
- **Healthcheck**: Configured in `railway.json` pointing to `GET /api/health` with a 120s timeout.

---

## 2. Step-by-Step Deployment (GitHub Method — Recommended)

### Step 1: Push Code to GitHub
Push your local repository to GitHub:
```bash
git add .
git commit -m "chore: prepare for production deployment on Railway"
git push origin main
```

### Step 2: Create a Railway Project
1. Log in to [Railway](https://railway.app).
2. Click **New Project** $\rightarrow$ **Deploy from GitHub repo**.
3. Select your `mediaos` repository.

### Step 3: Add PostgreSQL Database (Mandatory for Production)
1. Inside your Railway project canvas, click **+ New** $\rightarrow$ **Database** $\rightarrow$ **Add PostgreSQL**.
2. Railway will provision a managed PostgreSQL instance and automatically make the `DATABASE_URL` variable available to your project.

### Step 4: Configure Environment Variables
In your web service on Railway, navigate to the **Variables** tab and set:

| Variable | Recommended Value | Description |
|---|---|---|
| `NODE_ENV` | `production` | Enables production optimizations and strict security checks. |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Auto-populated by Railway when Postgres is connected. |
| `SESSION_SECRET` | *(64-hex string)* | Cryptographic key used to sign operator authentication sessions. |
| `ENCRYPTION_SECRET_KEY` | *(64-hex string)* | Exactly 32 bytes (64 hex characters) for AES-256-GCM token storage. |
| `APP_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` | Canonical production domain. Enforces production OAuth redirects. |
| `NEXT_PUBLIC_APP_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` | Client-accessible canonical URL. |
| `AI_DISABLED` | `false` *(or `true` for 100% manual)* | Master switch. When `true`, all workflows run manually with zero AI calls. |
| `AI_PROVIDER_DEFAULT` | `mock` *(or `openai`, `anthropic`, `gemini`)* | Active AI provider mode. |
| `PORT` | `3000` | Assigned automatically by Railway. |

> **Quick Key Generator**: Run this command in your terminal to generate your secrets:
> ```bash
> node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('hex')); console.log('ENCRYPTION_SECRET_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
> ```

### Step 5: Configure Live OAuth Callbacks (Optional)
If connecting real social channels, register the following exact callback URLs in the developer consoles:

| Platform | Developer Console Setting | Callback URL Format |
|---|---|---|
| **YouTube** | Google Cloud Console $\rightarrow$ Credentials $\rightarrow$ Authorized redirect URIs | `https://<your-railway-domain>/api/oauth/youtube/callback` |
| **X / Twitter** | X Developer Portal $\rightarrow$ User Authentication $\rightarrow$ Callback URL | `https://<your-railway-domain>/api/oauth/x/callback` |
| **LinkedIn** | LinkedIn Developer Portal $\rightarrow$ Auth $\rightarrow$ Redirect URLs | `https://<your-railway-domain>/api/oauth/linkedin/callback` |

*Note: If credentials are not provided, MediaOS operates in safe `[MOCK / DEMONSTRATION MODE]` with zero risk of accidental external posting.*

### Step 6: Generate a Public Domain
1. In the service dashboard, go to **Settings** $\rightarrow$ **Networking**.
2. Click **Generate Domain** (or attach a custom domain like `mediaos.yourdomain.com`).
3. Set `APP_URL=https://<your-generated-domain>`.

### Step 6: Verify Deployment
Once the build and deploy pipeline finishes:
1. Open `https://<your-railway-domain>/api/health` in your browser.
   - Expected response:
     ```json
     {
       "status": "ok",
       "ready": true,
       "check": "readiness",
       "database": {
         "status": "connected",
         "workspaces": 0,
         "activeLocks": 0
       }
     }
     ```
2. Navigate to `https://<your-railway-domain>/login` to create the initial operator account and start using MediaOS.

---

## 3. Alternative: Railway CLI Deployment

If deploying directly from the command line:

1. Install Railway CLI:
   ```bash
   npm i -g @railway/cli
   ```
2. Authenticate:
   ```bash
   railway login
   ```
3. Initialize and link project:
   ```bash
   railway init
   railway add --database postgresql
   ```
4. Set production secrets:
   ```bash
   railway variables set NODE_ENV=production
   railway variables set SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
   railway variables set ENCRYPTION_SECRET_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
   ```
5. Deploy:
   ```bash
   railway up
   ```

---

## 4. Post-Deployment Verification Checklist

- [ ] `GET /api/health?check=liveness` returns `HTTP 200`.
- [ ] `GET /api/health?check=readiness` returns `HTTP 200` with `database: { status: "connected" }`.
- [ ] Initial operator registration completes on `/login`.
- [ ] Brand Brain items can be created on `/brand-brain`.
- [ ] Campaigns progress through the 11-stage pipeline.
- [ ] OAuth accounts can be connected on `/publishing`.
- [ ] Metric synchronization works idempotently on `/analytics`.
