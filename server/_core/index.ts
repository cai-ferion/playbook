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
  });
}

startServer().catch(console.error);
