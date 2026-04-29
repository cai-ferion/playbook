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
import { registerIORoutes } from "../io-routes.js";
import { registerIOBackupRoutes } from "../io-backup.js";
import { registerTardinessRoutes } from "../io-tardiness-routes.js";
import { registerRoleChangeRoutes } from "../io-role-change-routes.js";
import { registerManagersNookRoutes } from "../managers-nook-routes.js";
import { registerGroupTaskRoutes } from "../group-task-routes.js";
import { registerShiftExtensionRoutes } from "../shift-extension-routes.js";
import { registerAutoMailer } from "../auto-mailer.js";
import performanceRouter from "../io-performance-routes.js";
import { initAttendanceSyncCron, runAttendanceSync } from "../gsheets-sync.js";
import { initRosterSyncCron, runRosterSync } from "../roster-sync.js";

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
  // Enable CORS for all routes
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-actor-ohr, x-actor-name",
    );
    res.header("Access-Control-Allow-Credentials", "true");
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // IO Operations API routes
  registerIORoutes(app);
  registerIOBackupRoutes(app);
  registerTardinessRoutes(app);
  registerRoleChangeRoutes(app);
  app.use('/api/io/performance', performanceRouter);
  registerManagersNookRoutes(app);
  registerGroupTaskRoutes(app);
  registerShiftExtensionRoutes(app);

  // Auto-mailer for UPL/LATE notifications
  registerAutoMailer(app);

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
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
  app.use("/api/site", express.static(publicDir, {
    maxAge: '1d',        // 86400s — versioned via ?v= query strings for cache-busting
    etag: true,
    lastModified: true,
    index: false,        // Disable auto-index to prevent redirect loops
    redirect: false,     // Disable directory redirect to prevent loops
    setHeaders: (res, filePath) => {
      // Never cache index.html so ?v= busting on JS/CSS always works
      if (filePath.endsWith('index.html')) {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    },
  }));
  // Serve index.html for /api/site and /api/site/ with no-cache
  app.get("/api/site", (_req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(publicDir, 'index.html'));
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
