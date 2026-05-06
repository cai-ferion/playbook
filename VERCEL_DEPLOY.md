# Playbook — Vercel Hobby Deployment Guide

## Architecture Overview

The Vercel deployment adapts the existing Express + React application into a serverless-compatible architecture using a single Vercel Function with CDN-served static assets.

```
┌─────────────────────────────────────────────────────────┐
│                    Vercel Edge Network                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  CDN (public/)                Serverless Function (api/) │
│  ├── index.html (React SPA)  └── index.ts (Express)     │
│  ├── assets/ (Vite chunks)       ├── /api/trpc/*        │
│  └── api/site/ (static site)     ├── /api/io/*          │
│      ├── index.html              ├── /api/oauth/*       │
│      ├── js/                     ├── /api/cron/*        │
│      ├── css/                    └── /api/health        │
│      └── cache-manifest.json                            │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Routing Priority:**
1. Filesystem match → CDN serves static file (public/)
2. Rewrites → Serverless function or SPA fallback

## Prerequisites

- Vercel account (Hobby plan or higher)
- GitHub repo `cai-ferion/playbook` connected to Vercel
- TiDB/PlanetScale database (existing `DATABASE_URL`)

## Deployment Steps

### 1. Connect Repository

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import `cai-ferion/playbook` from GitHub
3. Set **Framework Preset** to `Other` (auto-detected from vercel.json)
4. Set **Root Directory** to `.` (default)
5. Vercel will auto-detect `vercel.json` and use `pnpm run build:vercel`

### 2. Configure Environment Variables

Set these in **Vercel → Project → Settings → Environment Variables**:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | **Yes** | TiDB/MySQL connection string (same as current) |
| `JWT_SECRET` | **Yes** | Session cookie signing secret (same as current) |
| `VITE_APP_ID` | **Yes** | Manus OAuth application ID |
| `OAUTH_SERVER_URL` | **Yes** | Manus OAuth backend base URL |
| `VITE_OAUTH_PORTAL_URL` | **Yes** | Manus login portal URL (frontend) |
| `OWNER_OPEN_ID` | **Yes** | Owner's Manus Open ID |
| `BUILT_IN_FORGE_API_URL` | **Yes** | Manus built-in APIs URL |
| `BUILT_IN_FORGE_API_KEY` | **Yes** | Bearer token for Manus APIs (server-side) |
| `VITE_FRONTEND_FORGE_API_KEY` | **Yes** | Bearer token for frontend Manus APIs |
| `VITE_FRONTEND_FORGE_API_URL` | **Yes** | Manus APIs URL for frontend |
| `CRON_SECRET` | **Yes** | Any random string (secures cron endpoints) |
| `CORS_ALLOWED_ORIGINS` | Recommended | Your Vercel domain, e.g. `https://playbook.vercel.app` |
| `GWS_ACCESS_TOKEN` | Optional | Google Workspace OAuth token for Sheets sync |
| `SUPABASE_URL` | Optional | Supabase project URL (if using Supabase features) |
| `SUPABASE_SERVICE_KEY` | Optional | Supabase service role key |
| `NODE_ENV` | Auto | Vercel sets this to `production` automatically |

> **Note:** `VITE_*` variables are embedded at build time into the React SPA. If you change them, you must redeploy.

### 3. Deploy

Click **Deploy** in Vercel. The build process:
1. `pnpm install` — installs dependencies
2. `pnpm run build:vercel` — runs `scripts/build-vercel.mjs`:
   - Builds React SPA with Vite → `public/`
   - Copies static site → `public/api/site/`
   - Generates cache manifest with content hashes
3. Vercel bundles `api/index.ts` as a serverless function

### 4. Verify Deployment

After deployment, verify these URLs:

| URL | Expected |
|-----|----------|
| `https://your-domain.vercel.app/` | React SPA login page |
| `https://your-domain.vercel.app/api/site/` | Static site (Playbook desktop) |
| `https://your-domain.vercel.app/api/health` | `{"status":"ok","platform":"vercel"}` |

## Compromises vs. Manus Deployment

| Feature | Manus (Current) | Vercel Hobby |
|---------|-----------------|--------------|
| Real-time sync (SSE) | ✅ Live push updates | ❌ Data refreshes on navigation |
| Cron frequency | Multiple times/day | 2 jobs, once/day each |
| Rate limiting | Per-user sliding window | Per-invocation only (resets on cold start) |
| Observability metrics | Persistent counters | Resets on cold start |
| Function timeout | Unlimited | 60 seconds max |
| Google Sheets sync | 2× daily (1:30 AM + 4:30 PM) | 1× daily (6:00 PM PHT) |
| Roster sync | Daily 2:00 AM PHT | Daily 2:00 AM PHT (unchanged) |

## Cron Schedule (UTC)

Configured in `vercel.json`:

| Job | Schedule (UTC) | PHT Equivalent |
|-----|---------------|----------------|
| Roster Sync | `0 18 * * *` | 2:00 AM PHT |
| Attendance Sync | `0 10 * * *` | 6:00 PM PHT |

## Troubleshooting

### Build fails with "module not found"
- Ensure all server-side imports use `.js` extension (ESM resolution)
- Check that `@googleapis/sheets` is in `dependencies` (not `devDependencies`)

### Cron jobs not firing
- Verify `CRON_SECRET` is set in Vercel env vars
- Check Vercel dashboard → Cron Jobs tab for execution logs
- Hobby plan: crons may have ~1 minute scheduling variance

### API returns 500
- Check Vercel → Functions → Logs for the specific error
- Most common: `DATABASE_URL` not set or TiDB connection timeout
- Increase `maxDuration` in `vercel.json` if queries are slow

### Static site shows stale content
- The static site is built at deploy time. To update it, push changes to `server/public/` and redeploy
- Cache-manifest hashes ensure browsers fetch fresh JS/CSS after deploy

## File Structure (Vercel-specific)

```
api/
  index.ts              ← Serverless function entry point
vercel.json             ← Routing, crons, function config
scripts/
  build-vercel.mjs      ← Build script (Vite + static site + cache manifest)
```

## Upgrading to Vercel Pro

If you upgrade to Pro ($20/month), you gain:
- 40 cron jobs (can restore 2× daily attendance sync)
- 300s function timeout
- 10 concurrent builds
- Advanced analytics

To add the second attendance sync, add to `vercel.json` → `crons`:
```json
{ "path": "/api/cron/attendance-sync", "schedule": "30 17 * * *" }
```
(17:30 UTC = 1:30 AM PHT)
