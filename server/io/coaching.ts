/**
 * Coaching Domain Module
 * Extracted from io-routes.ts — handles coaching logs, RCA, ZTP, NTE
 */
import { Router, Request, Response } from "express";
import { getDb } from "../db.js";
import { ioCoaching, ioCoachingRca, ioCoachingZtp, ioCoachingNte } from "../../drizzle/schema.js";
import { eq, and, sql, desc, asc } from "drizzle-orm";
import { ADMIN_OHRS } from "./shared.js";
import { validate, coachingCreateSchema, coachingUpdateSchema, coachingRcaCreateSchema } from "./validation.js";
import { emitChange } from "./emit-change.js";
import { optimisticUpdate, sendConflict, getClientVersion } from "./optimistic-lock.js";
import crypto from "crypto";

const router = Router();

function generateCoachingId(): string {
  return 'CL-' + crypto.randomBytes(6).toString('hex');
}

// ============================================================
// io_coaching
// ============================================================

// GET /api/io/coaching - list coaching logs
router.get("/coaching", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { limit, id, coaching_id } = req.query;

    // Lookup by alphanumeric coaching_id
    if (coaching_id) {
      const rows = await db.select().from(ioCoaching).where(eq(ioCoaching.coaching_id, String(coaching_id)));
      return res.json(rows);
    }
    // Fallback: lookup by numeric id
    if (id) {
      const rows = await db.select().from(ioCoaching).where(eq(ioCoaching.id, Number(id)));
      return res.json(rows);
    }

    const lim = limit ? Number(limit) : 2000;
    const { lean } = req.query;

    if (lean === '1') {
      // Lightweight list view: exclude coaching_details (heavy HTML) to reduce payload ~80%
      const rows = await db.select({
        id: ioCoaching.id,
        coaching_id: ioCoaching.coaching_id,
        coaching_type: ioCoaching.coaching_type,
        coach: ioCoaching.coach,
        coach_ohr: ioCoaching.coach_ohr,
        coach_meta_email: ioCoaching.coach_meta_email,
        coach_sup: ioCoaching.coach_sup,
        coach_sup_email: ioCoaching.coach_sup_email,
        coach_pg: ioCoaching.coach_pg,
        coaching_date: ioCoaching.coaching_date,
        coachee: ioCoaching.coachee,
        coachee_ohr: ioCoaching.coachee_ohr,
        coachee_meta_email: ioCoaching.coachee_meta_email,
        coachee_sup: ioCoaching.coachee_sup,
        coachee_sup_email: ioCoaching.coachee_sup_email,
        coachee_pg: ioCoaching.coachee_pg,
        session_goal: ioCoaching.session_goal,
        status: ioCoaching.status,
        cap_level: ioCoaching.cap_level,
        coachee_list: ioCoaching.coachee_list,
        job_id: ioCoaching.job_id,
        sme_joiner: ioCoaching.sme_joiner,
        sme_meta_email: ioCoaching.sme_meta_email,
        sme_joiner_2: ioCoaching.sme_joiner_2,
        sme_joiner_2_email: ioCoaching.sme_joiner_2_email,
        // Ack fields required for compassIsAcknowledged() tab filtering
        coachee_ack: ioCoaching.coachee_ack,
        coachee_commitments: ioCoaching.coachee_commitments,
        coaching_rating: ioCoaching.coaching_rating,
        coachee_sentiments: ioCoaching.coachee_sentiments,
        ack_date: ioCoaching.ack_date,
        created_at: ioCoaching.created_at,
        updated_at: ioCoaching.updated_at,
      }).from(ioCoaching).orderBy(desc(ioCoaching.id)).limit(lim);
      return res.json(rows);
    }

    const rows = await db.select().from(ioCoaching).orderBy(desc(ioCoaching.id)).limit(lim);
    res.json(rows);
  } catch (err: any) {
    console.error("[IO API] coaching GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/coaching - create a coaching log
router.post("/coaching", validate(coachingCreateSchema), async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    // Generate a unique alphanumeric coaching_id
    const coaching_id = generateCoachingId();
    const body = { ...req.body };

    // Serialize coachee_list to JSON string (text column)
    if (body.coachee_list !== undefined) {
      body.coachee_list = Array.isArray(body.coachee_list)
        ? (body.coachee_list.length > 0 ? JSON.stringify(body.coachee_list) : null)
        : (body.coachee_list || null);
    }

    const values = { ...body, coaching_id };

    // Server-side dedup: reject if an identical log exists with the EXACT same timestamp
    // (same coach, coachee, type, and full datetime — prevents double-click duplicates
    //  while allowing multiple logs on the same date at different times)
    if (body.coach_ohr && body.coachee_ohr && body.coaching_type && body.coaching_date) {
      const recentDupes = await db.select({ id: ioCoaching.id, coaching_id: ioCoaching.coaching_id })
        .from(ioCoaching)
        .where(and(
          eq(ioCoaching.coach_ohr, String(body.coach_ohr)),
          eq(ioCoaching.coachee_ohr, String(body.coachee_ohr)),
          eq(ioCoaching.coaching_type, String(body.coaching_type)),
          eq(ioCoaching.coaching_date, String(body.coaching_date))
        ))
        .limit(1);
      if (recentDupes.length > 0) {
        console.warn(`[IO API] Duplicate coaching log blocked: coach=${body.coach_ohr} coachee=${body.coachee_ohr} type=${body.coaching_type} date=${body.coaching_date} (existing: ${recentDupes[0].coaching_id})`);
        return res.status(409).json({ error: 'Duplicate coaching log detected', existing_id: recentDupes[0].coaching_id });
      }
    }

    const result = await db.insert(ioCoaching).values(values);
    const insertId = (result as any)[0]?.insertId;
    emitChange(req, "coaching", "record_created", { id: insertId, coaching_id });
    res.json({ ok: true, id: insertId, coaching_id });
  } catch (err: any) {
    console.error("[IO API] coaching POST error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/io/coaching/:id - update a coaching log (supports numeric id or alphanumeric coaching_id)
router.patch("/coaching/:id", validate(coachingUpdateSchema), async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const paramId = req.params.id;
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    const clientVersion = getClientVersion(req.body);
    // Route by ID type: pure numeric → match by auto-increment id; otherwise → match by coaching_id
    const isNumericId = /^\d+$/.test(paramId);
    if (clientVersion !== null) {
      const { version: _v, ...updateFields } = updates;
      const idCol = isNumericId ? ioCoaching.id : ioCoaching.coaching_id;
      const idVal = isNumericId ? Number(paramId) : paramId;
      const lockResult = await optimisticUpdate(db, ioCoaching, idCol, idVal, clientVersion, updateFields);
      if (!lockResult.ok) {
        if (lockResult.reason === "not_found") return res.status(404).json({ error: "Record not found" });
        return sendConflict(res, clientVersion, lockResult.serverState);
      }
    } else {
      if (isNumericId) {
        await db.update(ioCoaching).set(updates).where(eq(ioCoaching.id, Number(paramId)));
      } else {
        await db.update(ioCoaching).set(updates).where(eq(ioCoaching.coaching_id, paramId));
      }
    }
    emitChange(req, "coaching", "record_updated", { id: paramId });
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] coaching PATCH error:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/io/coaching/:id - delete a coaching log (admin-gated, cascade)
router.delete("/coaching/:id", async (req: Request, res: Response) => {
  try {
    // Admin-gated: only admins can delete coaching logs
    const actorOhr = (req.headers['x-actor-ohr'] as string) || req.body?.actor_ohr;
    if (!actorOhr || !ADMIN_OHRS.includes(String(actorOhr))) {
      return res.status(403).json({ error: "Only admin users can delete coaching logs" });
    }
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const paramId = req.params.id;
    const isNumericId = /^\d+$/.test(paramId);

    // Also delete related RCA and ZTP records
    if (isNumericId) {
      // Get coaching_id first for cascade cleanup
      const rows = await db.select({ coaching_id: ioCoaching.coaching_id }).from(ioCoaching).where(eq(ioCoaching.id, Number(paramId)));
      const coachingId = rows[0]?.coaching_id;
      if (coachingId) {
        await db.delete(ioCoachingRca).where(eq(ioCoachingRca.coaching_id, coachingId));
        await db.delete(ioCoachingZtp).where(eq(ioCoachingZtp.ztp_id, coachingId));
      }
      await db.delete(ioCoaching).where(eq(ioCoaching.id, Number(paramId)));
    } else {
      await db.delete(ioCoachingRca).where(eq(ioCoachingRca.coaching_id, paramId));
      await db.delete(ioCoachingZtp).where(eq(ioCoachingZtp.ztp_id, paramId));
      await db.delete(ioCoaching).where(eq(ioCoaching.coaching_id, paramId));
    }
    console.log(`[IO API] Coaching log ${paramId} deleted by ${actorOhr} (cascade: RCA + ZTP)`);
    emitChange(req, "coaching", "record_deleted", { id: paramId });
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] coaching DELETE error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// io_coaching_rca
// ============================================================

router.get("/coaching-rca", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { coaching_id } = req.query;
    if (coaching_id) {
      const rows = await db.select().from(ioCoachingRca).where(eq(ioCoachingRca.coaching_id, String(coaching_id)));
      return res.json(rows);
    }
    const rows = await db.select().from(ioCoachingRca).limit(2000);
    res.json(rows);
  } catch (err: any) {
    console.error("[IO API] coaching-rca GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/coaching-rca", validate(coachingRcaCreateSchema), async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    await db.insert(ioCoachingRca).values(req.body);
    emitChange(req, "coaching", "record_created", { sub: "rca", coaching_id: req.body.coaching_id });
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] coaching-rca POST error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// io_coaching_ztp
// ============================================================

router.get("/coaching-ztp", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { infraction_category, select: selectField } = req.query;

    if (infraction_category) {
      const rows = await db.select().from(ioCoachingZtp)
        .where(eq(ioCoachingZtp.infraction_category, String(infraction_category)))
        .orderBy(asc(ioCoachingZtp.infraction));
      return res.json(rows);
    }

    // If select=infraction_category, return distinct categories
    if (selectField === "infraction_category") {
      const rows = await db.selectDistinct({ infraction_category: ioCoachingZtp.infraction_category })
        .from(ioCoachingZtp)
        .orderBy(asc(ioCoachingZtp.infraction_category));
      return res.json(rows);
    }

    const rows = await db.select().from(ioCoachingZtp).limit(2000);
    res.json(rows);
  } catch (err: any) {
    console.error("[IO API] coaching-ztp GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// io_coaching_nte
// ============================================================

router.get("/coaching-nte", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { coaching_id, ohr_id } = req.query;

    if (coaching_id) {
      const rows = await db.select().from(ioCoachingNte)
        .where(eq(ioCoachingNte.coaching_id, String(coaching_id)));
      return res.json(rows);
    }

    if (ohr_id) {
      const rows = await db.select().from(ioCoachingNte)
        .where(eq(ioCoachingNte.ohr_id, String(ohr_id)))
        .orderBy(desc(ioCoachingNte.created_at));
      return res.json(rows);
    }

    const rows = await db.select().from(ioCoachingNte).orderBy(desc(ioCoachingNte.created_at)).limit(500);
    res.json(rows);
  } catch (err: any) {
    console.error("[IO API] coaching-nte GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/coaching-nte", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const id = 'NTE-' + Math.random().toString(36).substring(2, 10);
    const now = new Date().toISOString();
    const values = {
      id,
      coaching_id: req.body.coaching_id,
      employee_name: req.body.employee_name,
      ohr_id: req.body.ohr_id,
      cap_level: req.body.cap_level,
      date_of_incident: req.body.date_of_incident || null,
      incident_description: req.body.incident_description || null,
      policy_violated: req.body.policy_violated || null,
      previous_warnings: req.body.previous_warnings || null,
      expected_behavior: req.body.expected_behavior || null,
      deadline_for_improvement: req.body.deadline_for_improvement || null,
      issued_by: req.body.issued_by || null,
      issued_by_ohr: req.body.issued_by_ohr || null,
      created_at: now,
      updated_at: now,
    };

    await db.insert(ioCoachingNte).values(values);
    emitChange(req, "coaching", "record_created", { sub: "nte", id, coaching_id: req.body.coaching_id });
    res.json({ ok: true, id });
  } catch (err: any) {
    console.error("[IO API] coaching-nte POST error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.patch("/coaching-nte/:id", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const nteId = req.params.id;
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    const clientVersion = getClientVersion(req.body);
    if (clientVersion !== null) {
      const { version: _v, ...updateFields } = updates;
      const lockResult = await optimisticUpdate(db, ioCoachingNte, ioCoachingNte.id, nteId, clientVersion, updateFields);
      if (!lockResult.ok) {
        if (lockResult.reason === "not_found") return res.status(404).json({ error: "NTE not found" });
        return sendConflict(res, clientVersion, lockResult.serverState);
      }
    } else {
      await db.update(ioCoachingNte).set(updates).where(eq(ioCoachingNte.id, nteId));
    }
    emitChange(req, "coaching", "record_updated", { sub: "nte", id: nteId });
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] coaching-nte PATCH error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
