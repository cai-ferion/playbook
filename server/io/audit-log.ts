/**
 * server/io/audit-log.ts
 * Domain module: Audit Log read/write.
 * Extracted from io-routes.ts during Sub-Phase 2.3.
 */
import { Router, Request, Response } from "express";
import { getDb } from "../db.js";
import { ioAuditLog } from "../../drizzle/schema.js";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

// GET /api/io/audit-log — get audit trail for a record
router.get("/audit-log", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { record_id, record_type, limit: lim } = req.query;
    const conditions: any[] = [];
    if (record_id) conditions.push(eq(ioAuditLog.record_id, String(record_id)));
    if (record_type) conditions.push(eq(ioAuditLog.record_type, String(record_type)));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    let q = db.select().from(ioAuditLog);
    if (where) q = q.where(where) as any;
    const rows = await (q as any).orderBy(desc(ioAuditLog.timestamp)).limit(Number(lim) || 100);
    res.json(rows);
  } catch (err: any) {
    console.error("[IO API] audit-log GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/audit-log — create an audit entry (for lock events etc.)
router.post("/audit-log", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    await db.insert(ioAuditLog).values(req.body);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] audit-log POST error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
