/**
 * Vercel Serverless Entry Point
 *
 * Wraps the Express application for Vercel's serverless runtime.
 * Excludes platform-specific features that don't work in serverless:
 * - node-cron (no persistent process)
 * - SSE (no long-lived connections)
 * - express.static (Vercel ignores it; static files served from public/ CDN)
 * - Vite dev server (not needed in production)
 *
 * Cron jobs are triggered by Vercel Cron (vercel.json) hitting HTTP endpoints.
 * Static site is served by Vercel CDN from public/api/site/ directory.
 * The React SPA is served from public/ (Vite build output).
 */
import express from "express";
import compression from "compression";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./server/_core/oauth.js";
import { appRouter } from "./server/routers.js";
import { createContext } from "./server/_core/context.js";
import { registerModularIORoutes } from "./server/io/index.js";
import { registerIOBackupRoutes } from "./server/io-backup.js";
import { requireAuth } from "./server/middleware/requireAuth.js";
import { refreshAdminOhrs } from "./server/config.js";
import { corsMiddleware } from "./server/middleware/cors.js";
import { rateLimitMiddleware } from "./server/middleware/rate-limit.js";
import {
  observabilityMiddleware,
  getObservabilityMetrics,
  recordClientError,
  getClientErrors,
} from "./server/middleware/observability.js";
import type { ClientErrorReport } from "./server/middleware/observability.js";

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(compression({ level: 6, threshold: 1024 }));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(corsMiddleware);
app.use(rateLimitMiddleware);
app.use(observabilityMiddleware);

// ── OAuth routes (public) ────────────────────────────────────────────────────
// OAuth callback will fail gracefully if Manus OAuth server is unreachable.
// The static site uses OHR-based login (independent of OAuth).
registerOAuthRoutes(app);

// ── Client error reporting (public) ──────────────────────────────────────────
app.post("/api/client-errors", (req, res) => {
  const report = req.body as ClientErrorReport;
  if (!report || !report.message) {
    res.status(400).json({ error: "Missing error message" });
    return;
  }
  report.actor =
    report.actor || (req.headers["x-actor-ohr"] as string) || "anonymous";
  report.timestamp = report.timestamp || Date.now();
  recordClientError(report);
  res.status(204).end();
});

// ── Protected IO routes ──────────────────────────────────────────────────────
app.use("/api/io", requireAuth);

// SSE endpoint (not supported in serverless) — must be registered BEFORE
// registerModularIORoutes which also registers an /events handler.
app.get("/api/io/events", (_req, res) => {
  res.status(501).json({
    error: "SSE not available",
    message:
      "Real-time sync is not supported on this deployment. Data refreshes on navigation.",
  });
});

// Observability metrics (behind auth)
app.get("/api/io/observability", (_req, res) => {
  res.json(getObservabilityMetrics());
});
app.get("/api/io/client-errors", (_req, res) => {
  res.json(getClientErrors());
});

// All 20 domain modules + backup routes
registerModularIORoutes(app);
registerIOBackupRoutes(app);

// ── Auto-mailer HTTP endpoints ───────────────────────────────────────────────
// Lazy-import to avoid pulling node-cron at module level.
// The cron.schedule() calls inside registerAutoMailer are harmless no-ops in
// serverless (they schedule but never fire since the process exits).
// The HTTP POST endpoints it registers ARE useful for Vercel Cron triggers.
import("./server/auto-mailer.js")
  .then(({ registerAutoMailer }) => {
    registerAutoMailer(app);
  })
  .catch((err) => {
    console.warn("[Vercel] auto-mailer load skipped:", err.message);
  });

// ── Manual sync triggers ─────────────────────────────────────────────────────
app.post("/api/io/sync-roster", async (req, res) => {
  const actorOhr = req.headers["x-actor-ohr"] as string;
  if (!actorOhr) return res.status(403).json({ error: "Forbidden" });
  try {
    const { getDb } = await import("./server/db.js");
    const { ioPermissions } = await import("./drizzle/schema.js");
    const { eq, and } = await import("drizzle-orm");
    const db = await getDb();
    if (db) {
      const [perm] = await db
        .select()
        .from(ioPermissions)
        .where(
          and(
            eq(ioPermissions.ohr_id, actorOhr),
            eq(ioPermissions.permission_key, "anchor.sync_roster")
          )
        );
      if (!perm || !perm.granted)
        return res.status(403).json({ error: "Permission denied" });
    }
    const { runRosterSync } = await import("./server/roster-sync.js");
    const result = await runRosterSync("manual");
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/io/sync-attendance", async (req, res) => {
  const actorOhr = req.headers["x-actor-ohr"] as string;
  if (!actorOhr) return res.status(403).json({ error: "Forbidden" });
  try {
    const { runAttendanceSync } = await import("./server/gsheets-sync.js");
    const result = await runAttendanceSync(`manual (${actorOhr})`);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Vercel Cron endpoints ────────────────────────────────────────────────────
// Called by Vercel Cron (configured in vercel.json).
// Protected by CRON_SECRET env var (Vercel sends Authorization: Bearer <secret>).
app.get("/api/cron/roster-sync", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const { runRosterSync } = await import("./server/roster-sync.js");
    const result = await runRosterSync("cron");
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/cron/attendance-sync", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const { runAttendanceSync } = await import("./server/gsheets-sync.js");
    const result = await runAttendanceSync("vercel-cron");
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/cron/notifications", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    // Trigger notification checks that would normally run via node-cron.
    // Each auto-mailer endpoint can be called individually for granular control.
    res.json({
      success: true,
      message: "Use individual /api/io/* notification endpoints for granular triggers",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: Date.now(), platform: "vercel" });
});

// ── tRPC ─────────────────────────────────────────────────────────────────────
app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

// ── Initialize admin OHRs on cold start ──────────────────────────────────────
refreshAdminOhrs().catch(console.error);

// ── Export for Vercel ────────────────────────────────────────────────────────
export default app;
