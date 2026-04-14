import "dotenv/config";
import express from "express";
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
import { registerAutoMailer } from "../auto-mailer.js";
import performanceRouter from "../io-performance-routes.js";
import { initAttendanceSyncCron, runAttendanceSync } from "../gsheets-sync.js";

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
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // ============================================================
  // PUBLIC API — /api/public/data
  // Registered BEFORE any auth middleware so it's reachable by
  // external callers with a valid X-API-Key header.
  // ============================================================
  app.options("/api/public/data", (_req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.header("Access-Control-Allow-Headers", "X-API-Key, Content-Type");
    res.sendStatus(204);
  });

  app.get("/api/public/data", async (req, res) => {
    // Explicit CORS for this route
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.header("Access-Control-Allow-Headers", "X-API-Key, Content-Type");

    // API key validation
    const apiKey = req.headers["x-api-key"] as string;
    const expectedKey = process.env.PUBLIC_API_KEY || "";
    if (!expectedKey || apiKey !== expectedKey) {
      return res.status(401).json({ error: "Invalid or missing API key" });
    }

    try {
      const { getDb } = await import("../db.js");
      const { ioEmployees, ioAttendance } = await import("../../drizzle/schema.js");
      const db = await getDb();
      if (!db) return res.status(500).json({ error: "Database not available" });

      const siteBase = "https://play-book.manus.space";
      const category = req.query.category as string | undefined;
      const limit = Math.min(parseInt(req.query.limit as string) || 1000, 5000);
      const offset = parseInt(req.query.offset as string) || 0;

      const items: any[] = [];

      // --- Employees ---
      if (!category || category === "employee") {
        const empRows = await db.select().from(ioEmployees).limit(limit).offset(offset);
        for (const emp of empRows) {
          items.push({
            id: `emp_${emp.ohr_id}`,
            title: emp.full_name || `${emp.given_name || ""} ${emp.last_name || ""}`.trim(),
            category: "employee",
            description: [
              emp.actual_role, emp.planning_group, emp.shift_time,
              emp.supervisor_name ? `FLM: ${emp.supervisor_name}` : null,
            ].filter(Boolean).join(" · "),
            url: `${siteBase}/api/site/#input`,
            updatedAt: new Date().toISOString(),
            meta: {
              ohr_id: emp.ohr_id, full_name: emp.full_name, role: emp.actual_role,
              planning_group: emp.planning_group, shift_time: emp.shift_time,
              supervisor_name: emp.supervisor_name, employment_status: emp.employement_status,
              hire_date: emp.hire_date, work_off: emp.work_off,
            },
          });
        }
      }

      // --- Attendance ---
      if (!category || category === "attendance") {
        const attRows = await db.select().from(ioAttendance)
          .orderBy(ioAttendance.log_date)
          .limit(limit).offset(offset);
        for (const att of attRows) {
          items.push({
            id: `att_${att.id}`,
            title: `${att.snap_full_name || att.ohr_id} — ${att.log_date}`,
            category: "attendance",
            description: [
              att.tag ? `Tag: ${att.tag}` : null, att.role, att.planning_group,
              att.snap_shift_time,
              att.ot_hours && att.ot_hours !== "0" ? `OT: ${att.ot_hours}h` : null,
            ].filter(Boolean).join(" · "),
            url: `${siteBase}/api/site/#input`,
            updatedAt: att.created_at || new Date().toISOString(),
            meta: {
              record_id: att.id, ohr_id: att.ohr_id, log_date: att.log_date,
              tag: att.tag, upl_reason: att.upl_reason, remarks: att.remarks,
              ot_hours: att.ot_hours, role: att.role, planning_group: att.planning_group,
              snap_full_name: att.snap_full_name, snap_supervisor: att.snap_supervisor,
              snap_shift_time: att.snap_shift_time,
            },
          });
        }
      }

      res.json({ items, total: items.length, limit, offset, categories: ["employee", "attendance"] });
    } catch (err: any) {
      console.error("[PUBLIC API] /data error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Enable CORS for all routes
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-actor-ohr, x-actor-name, X-API-Key",
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
  app.use('/api/io/performance', performanceRouter);

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
  app.use("/api/site", express.static(publicDir));
  app.get("/api/site", (_req, res) => {
    res.redirect("/api/site/");
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

  // Admin-only manual sync trigger
  app.post("/api/io/sync-attendance", async (req, res) => {
    const actorOhr = req.headers["x-actor-ohr"] as string;
    if (actorOhr !== "740045023") {
      return res.status(403).json({ error: "Admin only" });
    }
    try {
      const result = await runAttendanceSync("manual");
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
  });
}

startServer().catch(console.error);
