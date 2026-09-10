# MediaOS Deployment Guide

MediaOS is container-ready and portable to any platform supporting Docker, Node.js, or PostgreSQL.

---

## 1. Local Container Deployment (Docker Compose)

```bash
docker compose up --build
```
Access the application at `http://localhost:3000`. Database data persists in the `mediaos_data` volume.

---

## 2. Railway Deployment (Turnkey Production)

MediaOS is pre-configured for automated one-click deployment on Railway using Nixpacks:
1. See the dedicated **[Railway Deployment Guide](file:///c:/Users/ensen/Desktop/MT/agent/RAILWAY_DEPLOYMENT.md)** for detailed instructions.
2. Railway detects [`railway.json`](file:///c:/Users/ensen/Desktop/MT/agent/railway.json).
3. Connect Railway PostgreSQL (`${{Postgres.DATABASE_URL}}`) or use persistent volume.
4. The automated [`scripts/prepare-db.js`](file:///c:/Users/ensen/Desktop/MT/agent/scripts/prepare-db.js) script dynamically adapts Prisma for PostgreSQL or SQLite.
5. Set environment variables: `SESSION_SECRET`, `ENCRYPTION_SECRET_KEY`, `APP_URL`, `NODE_ENV=production`.
6. Health checks are verified at `GET /api/health`.

---

## 3. VPS / Bare Metal Deployment

1. Install Node.js 20+ and npm.
2. Clone repository and run:
   ```bash
   npm ci
   npm run build
   npm run start
   ```
3. Use systemd or PM2 to supervise the process:
   ```bash
   pm2 start "npm start" --name mediaos
   ```
