/**
 * server/io/notifications.ts
 * Domain module: Notification CRUD + maintenance flag + mark-all-read.
 * Extracted from io-routes.ts during Sub-Phase 2.3.
 *
 * Performance: In-memory cache with 30s TTL to avoid ~700ms DB queries on every poll.
 * Cache is keyed by query params and invalidated on any mutation (POST/PATCH/PUT/DELETE).
 */
import { Router, Request, Response } from "express";
import { getDb } from "../db.js";
import { ioNotifications } from "../../drizzle/schema.js";
import { eq, and, ne, desc, sql } from "drizzle-orm";
import { emitChange } from "./emit-change.js";

const router = Router();

// ── In-memory cache for GET /notifications ──
const CACHE_TTL_MS = 30_000; // 30 seconds
interface CacheEntry {
  data: any[];
  timestamp: number;
}
const queryCache = new Map<string, CacheEntry>();

function getCacheKey(query: Record<string, any>): string {
  // Deterministic key from sorted query params
  const parts = Object.entries(query).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b));
  return parts.map(([k, v]) => `${k}=${v}`).join('&') || '__default__';
}

function invalidateCache(): void {
  queryCache.clear();
}

// GET /api/io/notifications — cached with 30s TTL
router.get("/notifications", async (req: Request, res: Response) => {
  try {
    const cacheKey = getCacheKey(req.query as Record<string, any>);
    const cached = queryCache.get(cacheKey);

    // Return cached result if still fresh
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { limit, title, type, type_neq, target_ohr } = req.query;

    const conditions: any[] = [];
    if (title) conditions.push(eq(ioNotifications.title, String(title)));
    if (type) conditions.push(eq(ioNotifications.type, String(type)));
    if (type_neq) conditions.push(ne(ioNotifications.type, String(type_neq)));
    if (target_ohr) conditions.push(eq(ioNotifications.target_ohr, String(target_ohr)));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const lim = limit ? Number(limit) : 100;
    const rows = await db.select().from(ioNotifications).where(where).orderBy(desc(sql`created_at`)).limit(lim);

    // Store in cache
    queryCache.set(cacheKey, { data: rows, timestamp: Date.now() });

    res.json(rows);
  } catch (err: any) {
    console.error("[IO API] notifications GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/notifications
router.post("/notifications", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const body = { ...req.body };
    if (!body.created_at) body.created_at = new Date().toISOString();
    await db.insert(ioNotifications).values(body);
    invalidateCache();
    emitChange(req, "notifications", "record_created", {});
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] notifications POST error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/io/notifications/maintenance — get or set maintenance state
router.put("/notifications/maintenance", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { value } = req.body;
    const existing = await db.select().from(ioNotifications)
      .where(and(eq(ioNotifications.title, "MAINTENANCE_FLAG"), eq(ioNotifications.type, "system_maintenance")));

    if (existing.length > 0) {
      await db.update(ioNotifications).set({ message: value }).where(eq(ioNotifications.id, existing[0].id));
    } else {
      await db.insert(ioNotifications).values({
        type: "system_maintenance",
        title: "MAINTENANCE_FLAG",
        message: value,
        actor_ohr: "SYSTEM",
        is_read: true,
      });
    }
    invalidateCache();
    emitChange(req, "notifications", "record_updated", { sub: "maintenance" });
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] notifications maintenance error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/io/notifications/mark-all-read
// NOTE: Must be defined BEFORE the :id route to avoid matching "mark-all-read" as an id
router.patch("/notifications/mark-all-read", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    await db.update(ioNotifications).set({ is_read: true }).where(eq(ioNotifications.is_read, false));
    invalidateCache();
    emitChange(req, "notifications", "bulk_update", { action: "mark_all_read" });
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] notifications mark-all-read error:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/io/notifications/clear-all — delete all non-maintenance notifications
router.delete("/notifications/clear-all", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    await db.delete(ioNotifications).where(ne(ioNotifications.type, "system_maintenance"));
    invalidateCache();
    emitChange(req, "notifications", "record_deleted", { action: "clear_all" });
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] notifications clear-all error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/io/notifications/:id — update a notification
// NOTE: Must be AFTER named routes (maintenance, mark-all-read, clear-all)
router.patch("/notifications/:id", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    await db.update(ioNotifications).set(req.body).where(eq(ioNotifications.id, Number(req.params.id)));
    invalidateCache();
    emitChange(req, "notifications", "record_updated", { id: Number(req.params.id) });
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] notifications PATCH error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
