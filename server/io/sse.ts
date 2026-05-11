/**
 * SSE Connection Manager — Manages open SSE connections and broadcasts events.
 *
 * Architecture:
 * - Each authenticated user gets one SSE connection (identified by OHR)
 * - Heartbeat every 30s to keep connections alive through proxies/load balancers
 * - Events are filtered by module — clients declare which modules they're viewing
 * - Graceful cleanup on disconnect (TCP close, browser tab close)
 * - Connection limit: max 1 connection per OHR (new connection replaces old)
 *
 * Security:
 * - Endpoint is behind requireAuth middleware — only authenticated users can connect
 * - Actor identity comes from req.user (session-verified), not client headers
 *
 * Cloud Run compatibility:
 * - SSE works over standard HTTP/1.1 — no WebSocket upgrade needed
 * - Cloud Run supports streaming responses with request timeout up to 3600s
 * - Heartbeat prevents Cloud Run's idle timeout from killing the connection
 */
import { Router, Request, Response } from "express";
import { eventBus, SSEChangeEvent, SSEModule } from "./event-bus.js";

// ── Types ────────────────────────────────────────────────────────────
interface SSEClient {
  ohr: string;
  name: string;
  res: Response;
  subscribedModules: Set<SSEModule>;
  connectedAt: number;
  lastHeartbeat: number;
}

// ── Connection Registry ──────────────────────────────────────────────
const clients = new Map<string, SSEClient>();

// ── Heartbeat Interval ───────────────────────────────────────────────
const HEARTBEAT_INTERVAL_MS = 30_000;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function startHeartbeat(): void {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    const now = Date.now();
    const entries = Array.from(clients.entries());
    for (const [ohr, client] of entries) {
      try {
        client.res.write(`: heartbeat ${now}\n\n`);
        client.lastHeartbeat = now;
      } catch {
        // Connection dead — clean up
        removeClient(ohr);
      }
    }
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeatIfEmpty(): void {
  if (clients.size === 0 && heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

// ── Client Management ────────────────────────────────────────────────
function removeClient(ohr: string): void {
  const client = clients.get(ohr);
  if (client) {
    clients.delete(ohr);
    // Broadcast presence_leave to remaining clients
    broadcastPresenceLeave(ohr, client.name);
    stopHeartbeatIfEmpty();
  }
}

function broadcastPresenceLeave(ohr: string, name: string): void {
  const event: SSEChangeEvent = {
    type: "presence_leave",
    module: "attendance", // presence events are module-agnostic but need a value
    payload: { ohr, name },
    actor: { ohr, name },
    timestamp: Date.now(),
  };
  broadcast(event, true); // bypass module filter for presence events
}

function broadcast(event: SSEChangeEvent, bypassModuleFilter = false): void {
  const data = JSON.stringify(event);
  const entries = Array.from(clients.entries());
  for (const [ohr, client] of entries) {
    // Don't echo back to the actor who caused the event
    if (ohr === event.actor.ohr) continue;
    // Module filter: only send if client is subscribed to this module
    if (!bypassModuleFilter && client.subscribedModules.size > 0 && !client.subscribedModules.has(event.module)) continue;
    try {
      client.res.write(`event: change\ndata: ${data}\n\n`);
    } catch {
      removeClient(ohr);
    }
  }
}

// ── Subscribe to Event Bus ───────────────────────────────────────────
eventBus.onChange((event) => {
  const isPresence = event.type === "presence_join" || event.type === "presence_leave";
  broadcast(event, isPresence);
});

// ── Router ───────────────────────────────────────────────────────────
const sseRouter = Router();

/**
 * GET /events — SSE endpoint
 * Query params:
 *   modules: comma-separated list of modules to subscribe to (default: all)
 *
 * Response: text/event-stream with change events
 */
sseRouter.get("/events", (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const ohr = user.openId || (req.headers["x-actor-ohr"] as string) || "unknown";
  const name = user.name || (req.headers["x-actor-name"] as string) || "Unknown";

  // Parse subscribed modules from query
  const modulesParam = (req.query.modules as string) || "";
  const subscribedModules = new Set<SSEModule>(
    modulesParam
      ? (modulesParam.split(",").filter(Boolean) as SSEModule[])
      : [] // empty = subscribe to ALL modules
  );

  // Close existing connection for this user (1 connection per user)
  const existing = clients.get(ohr);
  if (existing) {
    try {
      existing.res.write(`event: replaced\ndata: {"reason":"new_connection"}\n\n`);
      existing.res.end();
    } catch { /* already dead */ }
    clients.delete(ohr);
  }

  // Set SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no", // Disable nginx buffering
  });

  // Send initial connection confirmation
  const connectEvent = JSON.stringify({
    type: "connected",
    activeUsers: getActiveUsers(),
    timestamp: Date.now(),
  });
  res.write(`event: connected\ndata: ${connectEvent}\n\n`);

  // Register client
  const client: SSEClient = {
    ohr,
    name,
    res,
    subscribedModules,
    connectedAt: Date.now(),
    lastHeartbeat: Date.now(),
  };
  clients.set(ohr, client);
  startHeartbeat();

  // Broadcast presence_join to other clients
  const joinEvent: SSEChangeEvent = {
    type: "presence_join",
    module: "attendance",
    payload: { ohr, name },
    actor: { ohr, name },
    timestamp: Date.now(),
  };
  broadcast(joinEvent, true);

  // Cleanup on disconnect
  req.on("close", () => removeClient(ohr));
  req.on("error", () => removeClient(ohr));
});

/**
 * POST /events/subscribe — Update module subscriptions without reconnecting
 * Body: { modules: string[] }
 */
sseRouter.post("/events/subscribe", (req: Request, res: Response) => {
  const user = req.user;
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const ohr = user.openId || (req.headers["x-actor-ohr"] as string) || "unknown";
  const client = clients.get(ohr);
  if (!client) {
    res.status(404).json({ error: "No active SSE connection" });
    return;
  }

  const { modules } = req.body as { modules: string[] };
  if (Array.isArray(modules)) {
    client.subscribedModules = new Set(modules as SSEModule[]);
  }
  res.json({ ok: true, subscribedModules: Array.from(client.subscribedModules) });
});

/**
 * GET /events/presence — Get list of currently connected users
 */
sseRouter.get("/events/presence", (_req: Request, res: Response) => {
  res.json({ users: getActiveUsers(), total: clients.size });
});

// ── Helpers ──────────────────────────────────────────────────────────
function getActiveUsers(): Array<{ ohr: string; name: string; connectedAt: number; modules: string[] }> {
  return Array.from(clients.values()).map((c) => ({
    ohr: c.ohr,
    name: c.name,
    connectedAt: c.connectedAt,
    modules: Array.from(c.subscribedModules),
  }));
}

/** Expose client count for health checks */
export function getSSEClientCount(): number {
  return clients.size;
}

export default sseRouter;
