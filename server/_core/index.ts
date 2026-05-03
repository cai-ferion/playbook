import "dotenv/config";
import express from "express";
import compression from "compression";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerModularIORoutes } from "../io/index.js";
import { registerIOBackupRoutes } from "../io-backup.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { registerAutoMailer } from "../auto-mailer.js";
import { initAttendanceSyncCron, runAttendanceSync } from "../gsheets-sync.js";
import { initRosterSyncCron, runRosterSync } from "../roster-sync.js";
import { corsMiddleware } from "../middleware/cors.js";
import { rateLimitMiddleware } from "../middleware/rate-limit.js";
import { initCacheManifest, injectCacheHashes, getCacheManifest, getFileHash } from "../cache-manifest.js";
import { observabilityMiddleware, getObservabilityMetrics, recordClientError, getClientErrors, type ClientErrorReport } from "../middleware/observability.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Enable gzip/deflate compression for all responses (70-80% size reduction)
  app.use(compression({ level: 6, threshold: 1024 }));
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // CORS — strict origin allowlist (Phase 6.1 Security Hardening)
  app.use(corsMiddleware);
  // Rate limiting — per-endpoint tiered sliding window (Phase 6.2 Security Hardening)
  app.use(rateLimitMiddleware);
  // Observability — request duration logging, slow query detection, error rate alerting (Phase 7.2)
  app.use(observabilityMiddleware);

  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // IO Operations API routes — all protected by session auth
  app.use('/api/io', requireAuth);
  // All 20 domain modules served via single barrel router
  registerModularIORoutes(app);
  registerIOBackupRoutes(app);

  // Auto-mailer for UPL/LATE notifications
  registerAutoMailer(app);

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  // Observability metrics endpoint (protected by auth via /api/io prefix)
  app.get("/api/io/observability", (_req, res) => {
    const metrics = getObservabilityMetrics();
    res.json(metrics);
  });

  // Client error reporting endpoint (public — must work before auth)
  app.post("/api/client-errors", (req, res) => {
    const report = req.body as ClientErrorReport;
    if (!report || !report.message) {
      res.status(400).json({ error: 'Missing error message' });
      return;
    }
    // Add actor from session header if available
    report.actor = report.actor || (req.headers["x-actor-ohr"] as string) || "anonymous";
    report.timestamp = report.timestamp || Date.now();
    recordClientError(report);
    res.status(204).end();
  });

  // Client errors list (protected)
  app.get("/api/io/client-errors", (_req, res) => {
    res.json(getClientErrors());
  });

  // Serve the Playbook desktop site from server/public under /api/site/
  const publicCandidates = [
    path.join(__dirname, "..", "public"),
    path.join(process.cwd(), "server", "public"),
    path.join(__dirname, "..", "server", "public"),
  ];
  let publicDir = publicCandidates[0];
  for (const candidate of publicCandidates) {
    if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, "index.html"))) {
      publicDir = candidate;
      console.log(`[static] Serving Playbook desktop from: ${candidate}`);
      break;
    }
  }
  // Initialize cache manifest for content-hash-based cache busting (Phase 7.1)
  const cacheManifest = initCacheManifest(publicDir);

  // Cache manifest endpoint — must be registered BEFORE static middleware
  app.get("/api/site/cache-manifest.json", (_req, res) => {
    const manifest = getCacheManifest();
    if (!manifest) {
      res.status(503).json({ error: 'Manifest not ready' });
      return;
    }
    res.set('Cache-Control', 'no-cache');
    res.json(manifest.entries);
  });

  app.use("/api/site", express.static(publicDir, {
    maxAge: '7d',        // 7 days — safe because content-hash query strings guarantee freshness
    etag: true,
    lastModified: true,
    immutable: true,     // Tell browsers hashed URLs never change
    index: false,        // Disable auto-index to prevent redirect loops
    redirect: false,     // Disable directory redirect to prevent loops
    setHeaders: (res, filePath) => {
      // Never cache index.html — it contains the hash references
      if (filePath.endsWith('index.html')) {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    },
  }));

  // Serve index.html with injected content hashes (no-cache so hash changes propagate immediately)
  app.get("/api/site", (_req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    const htmlPath = path.join(publicDir, 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf-8');
    html = injectCacheHashes(html, cacheManifest);
    res.type('html').send(html);
  });



  // Debug endpoint for path diagnostics
  app.get("/api/debug-paths", (_req, res) => {
    const results = publicCandidates.map(c => ({
      path: c,
      exists: fs.existsSync(c),
      hasIndex: fs.existsSync(path.join(c, "index.html")),
    }));
    res.json({ __dirname, cwd: process.cwd(), publicDir, candidates: results });
  });

  // Permission-driven manual roster sync trigger
  app.post("/api/io/sync-roster", async (req, res) => {
    const actorOhr = req.headers["x-actor-ohr"] as string;
    if (!actorOhr) return res.status(403).json({ error: "Forbidden" });
    // Check DB permission: anchor.sync_roster
    try {
      const { getDb } = await import("../db.js");
      const { ioPermissions } = await import("../../drizzle/schema.js");
      const { eq, and } = await import("drizzle-orm");
      const db = await getDb();
      if (db) {
        const [perm] = await db.select().from(ioPermissions).where(and(eq(ioPermissions.ohr_id, actorOhr), eq(ioPermissions.permission_key, 'anchor.sync_roster')));
        if (!perm || !perm.granted) return res.status(403).json({ error: "Permission denied" });
      }
    } catch (permErr: any) {
      console.error('[SYNC] Permission check error:', permErr.message);
      return res.status(403).json({ error: "Permission check failed" });
    }
    try {
      const result = await runRosterSync("manual");
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Manual attendance sync trigger (sandbox-only, triggered via Manus chat)
  app.post("/api/io/sync-attendance", async (req, res) => {
    const actorOhr = req.headers["x-actor-ohr"] as string;
    if (!actorOhr) return res.status(403).json({ error: "Forbidden" });
    try {
      const result = await runAttendanceSync(`manual (${actorOhr})`);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Initialize cron jobs after server is listening
    initAttendanceSyncCron();
    initRosterSyncCron();
  });
}

startServer().catch(console.error);
