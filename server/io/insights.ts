/**
 * server/io/insights.ts
 * Domain module: Insights CRUD + bulk delete.
 * Extracted from io-routes.ts during Sub-Phase 2.3.
 */
import { Router, Request, Response } from "express";
import { getDb } from "../db.js";
import { ioInsights } from "../../drizzle/schema.js";
import { eq, desc, sql, inArray } from "drizzle-orm";
import { ADMIN_OHRS } from "./shared.js";

const router = Router();

// GET /api/io/insights
router.get("/insights", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { insight_id, limit } = req.query;

    if (insight_id) {
      const rows = await db.select().from(ioInsights).where(eq(ioInsights.insight_id, String(insight_id)));
      return res.json(rows);
    }

    const lim = limit ? Number(limit) : 2000;
    const rows = await db.select().from(ioInsights).orderBy(desc(sql`created_at`)).limit(lim);
    res.json(rows);
  } catch (err: any) {
    console.error("[IO API] insights GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/insights
router.post("/insights", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    await db.insert(ioInsights).values(req.body);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] insights POST error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/io/insights/:insight_id
router.patch("/insights/:insight_id", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    await db.update(ioInsights).set(req.body).where(eq(ioInsights.insight_id, req.params.insight_id));
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] insights PATCH error:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/io/insights/:insight_id — admin-gated
router.delete("/insights/:insight_id", async (req: Request, res: Response) => {
  try {
    const actorOhr = req.body?.actor_ohr || req.query?.actor_ohr;
    if (!actorOhr || !ADMIN_OHRS.includes(String(actorOhr))) {
      return res.status(403).json({ error: "Admin-only operation" });
    }
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });
    await db.delete(ioInsights).where(eq(ioInsights.insight_id, req.params.insight_id));
    console.log(`[IO API] Insight ${req.params.insight_id} deleted by ${actorOhr}`);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] insights DELETE error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/insights-bulk-delete — admin-gated bulk delete
router.post("/insights-bulk-delete", async (req: Request, res: Response) => {
  try {
    const actorOhr = req.headers['x-actor-ohr'] as string;
    if (!actorOhr || !ADMIN_OHRS.includes(String(actorOhr))) {
      return res.status(403).json({ error: "Only admin users can delete insights" });
    }
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids array required" });
    // Delete in batches of 100 to avoid query size limits
    let deleted = 0;
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      await db.delete(ioInsights).where(inArray(ioInsights.insight_id, batch));
      deleted += batch.length;
    }
    console.log(`[IO API] ${deleted} insights bulk-deleted by ${actorOhr}`);
    res.json({ ok: true, deleted });
  } catch (err: any) {
    console.error("[IO API] insights bulk-delete error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
