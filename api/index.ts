/**
 * Vercel Serverless Entry Point
 *
 * Uses dynamic imports for all local modules so that any ERR_MODULE_NOT_FOUND
 * error is caught, logged with the full message, and returned from /api/health
 * instead of crashing the entire function silently.
 *
 * Once the broken import is identified and fixed, these can be reverted to
 * static imports.
 */
import express from "express";
import compression from "compression";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import type { ClientErrorReport } from "../server/middleware/observability.js";

const app = express();

// ── Diagnostic import loader ──────────────────────────────────────────────────
const _importErrors: { module: string; error: string }[] = [];

async function safeImport<T>(name: string, specifier: string): Promise<T | null> {
  try {
    return (await import(specifier)) as T;
  } catch (e: any) {
    const msg = String(e?.stack || e?.message || e).slice(0, 2000);
    _importErrors.push({ module: name, error: msg });
    console.error(`[IMPORT_FAIL] ${name}: ${msg}`);
    return null;
  }
}

// Load all local modules dynamically
const [
  oauthMod,
  routersMod,
  contextMod,
  ioMod,
  ioBackupMod,
  configMod,
  corsMod,
  rateLimitMod,
  observabilityMod,
] = await Promise.all([
  safeImport<typeof import("../server/_core/oauth.js")>("oauth", "../server/_core/oauth.js"),
  safeImport<typeof import("../server/routers.js")>("routers", "../server/routers.js"),
  safeImport<typeof import("../server/_core/context.js")>("context", "../server/_core/context.js"),
  safeImport<typeof import("../server/io/index.js")>("io/index", "../server/io/index.js"),
  safeImport<typeof import("../server/io-backup.js")>("io-backup", "../server/io-backup.js"),
  safeImport<typeof import("../server/config.js")>("config", "../server/config.js"),
  safeImport<typeof import("../server/middleware/cors.js")>("cors", "../server/middleware/cors.js"),
  safeImport<typeof import("../server/middleware/rate-limit.js")>("rate-limit", "../server/middleware/rate-limit.js"),
  safeImport<typeof import("../server/middleware/observability.js")>("observability", "../server/middleware/observability.js"),
]);

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(compression({ level: 6, threshold: 1024 }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ limit: "2mb", extended: true }));

if (corsMod?.corsMiddleware) app.use(corsMod.corsMiddleware);
if (rateLimitMod?.rateLimitMiddleware) app.use(rateLimitMod.rateLimitMiddleware);
if (observabilityMod?.observabilityMiddleware) app.use(observabilityMod.observabilityMiddleware);

// ── OAuth routes (public) ────────────────────────────────────────────────────
if (oauthMod?.registerOAuthRoutes) oauthMod.registerOAuthRoutes(app);

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
  if (observabilityMod?.recordClientError) observabilityMod.recordClientError(report);
  res.status(204).end();
});

// ── IO routes ───────────────────────────────────────────────────────────────
app.get("/api/io/events", (_req, res) => {
  res.status(501).json({
    error: "SSE not available",
    message:
      "Real-time sync is not supported on this deployment. Data refreshes on navigation.",
  });
});

app.get("/api/io/observability", (_req, res) => {
  if (observabilityMod?.getObservabilityMetrics) {
    res.json(observabilityMod.getObservabilityMetrics());
  } else {
    res.status(503).json({ error: "Observability module not loaded" });
  }
});
app.get("/api/io/client-errors", (_req, res) => {
  if (observabilityMod?.getClientErrors) {
    res.json(observabilityMod.getClientErrors());
  } else {
    res.status(503).json({ error: "Observability module not loaded" });
  }
});

if (ioMod?.registerModularIORoutes) ioMod.registerModularIORoutes(app);
if (ioBackupMod?.registerIOBackupRoutes) ioBackupMod.registerIOBackupRoutes(app);

// ── Auto-mailer HTTP endpoints ───────────────────────────────────────────────
import("../server/auto-mailer.js")
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
    const { getDb } = await import("../server/db.js");
    const { ioPermissions } = await import("../drizzle/schema.js");
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
    const { runRosterSync } = await import("../server/roster-sync.js");
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
    const { runAttendanceSync } = await import("../server/gsheets-sync.js");
    const result = await runAttendanceSync(`manual (${actorOhr})`);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Vercel Cron endpoints ────────────────────────────────────────────────────
app.get("/api/cron/roster-sync", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const { runRosterSync } = await import("../server/roster-sync.js");
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
    const { runAttendanceSync } = await import("../server/gsheets-sync.js");
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
  res.json({
    success: true,
    message: "Use individual /api/io/* notification endpoints for granular triggers",
  });
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({
    status: _importErrors.length === 0 ? "ok" : "degraded",
    timestamp: Date.now(),
    platform: "vercel",
    importErrors: _importErrors,
  });
});

// ── tRPC ─────────────────────────────────────────────────────────────────────
if (routersMod?.appRouter && contextMod?.createContext) {
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: routersMod.appRouter,
      createContext: contextMod.createContext,
    })
  );
}

// ── Initialize admin OHRs on cold start ──────────────────────────────────────
if (configMod?.refreshAdminOhrs) {
  configMod.refreshAdminOhrs().catch(console.error);
}

// ── Global JSON error handler ────────────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[Express] Unhandled error:", err?.message || err);
  if (res.headersSent) return;
  res.status(err?.status || 500).json({
    error: err?.message || "Internal server error",
  });
});

// ── 404 handler — JSON, not HTML ────────────────────────────────────────────
app.use((_req: express.Request, res: express.Response) => {
  res.status(404).json({ error: "Route not found" });
});

// ── Export for Vercel ────────────────────────────────────────────────────────
export default app;
