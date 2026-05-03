/**
 * server/io/notifications.ts
 * Domain module: Notification CRUD + maintenance flag + mark-all-read.
 * Extracted from io-routes.ts during Sub-Phase 2.3.
 */
import { Router, Request, Response } from "express";
import { getDb } from "../db.js";
import { ioNotifications } from "../../drizzle/schema.js";
import { eq, and, ne, desc, sql } from "drizzle-orm";
import { emitChange } from "./emit-change.js";

const router = Router();

// GET /api/io/notifications
router.get("/notifications", async (req: Request, res: Response) => {
  try {
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
    emitChange(req, "notifications", "record_updated", { id: Number(req.params.id) });
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] notifications PATCH error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
