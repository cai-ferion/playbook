/**
 * IO Operations API Routes
 * Express API routes for IO Operations data via TiDB/Drizzle.
 */
import { Router, Request, Response } from "express";
import { getDb } from "./db.js";
import {
  ioEmployees,
  ioAttendance,
  ioCoaching,
  ioCoachingRca,
  ioCoachingZtp,
  ioNotifications,
  ioInsights,
  ioLeaves,
  ioAuditLog,
  ioTasks,
  ioTaskComments,
  ioGchatQueue,
  ioOtRequests,
  ioOtConfig,
} from "../drizzle/schema.js";
import { eq, and, gte, lte, like, ne, sql, desc, asc, inArray, or } from "drizzle-orm";
import crypto from "crypto";
const router = Router();



// ============================================================
// Task Assignment Notification Helper (In-App)
// ============================================================

async function sendTaskAssignmentNotifications(record: any) {
  const ohrs = (record.assigned_to_ohr || '').split(',').map((s: string) => s.trim()).filter(Boolean);
  if (ohrs.length === 0) return;

  try {
    const db = await getDb();
    if (!db) return;
    const employees = await db.select().from(ioEmployees).where(inArray(ioEmployees.ohr_id, ohrs));

    const dueStr = record.due_date ? new Date(record.due_date + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) : 'No due date';

    for (const emp of employees) {
      await db.insert(ioNotifications).values({
        type: 'task_assigned',
        title: 'New Task Assigned',
        message: `${record.task_id}: ${record.title} — Due: ${dueStr}. Assigned by ${record.assigned_by_name || 'System'}.`,
        actor_ohr: record.assigned_by_ohr || null,
        actor_name: record.assigned_by_name || 'System',
        target_ohr: emp.ohr_id,
        target_role: 'agent',
        metadata: JSON.stringify({ task_id: record.task_id, title: record.title, due_date: record.due_date }),
        is_read: false,
        created_at: new Date().toISOString(),
      });
      console.log(`[IO API] Task notification created for ${emp.full_name} (${emp.ohr_id}) — task ${record.task_id}`);
    }
  } catch (err: any) {
    console.error('[IO API] Error creating task assignment notifications:', err.message);
  }
}

/** Generate a unique alphanumeric coaching ID: CL-xxxxxxxx */
function generateCoachingId(): string {
  return `CL-${crypto.randomBytes(4).toString('hex')}`;
}

// ============================================================
// io_employees
// ============================================================

// GET /api/io/employees - list employees with optional filters
router.get("/employees", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { select: selectCols, limit, offset, order, ohr_id, employement_status, is_locked, srt_id_not_null } = req.query;

    let query = db.select().from(ioEmployees);
    const conditions: any[] = [];

    if (ohr_id) conditions.push(eq(ioEmployees.ohr_id, String(ohr_id)));
    if (employement_status) conditions.push(eq(ioEmployees.employement_status, String(employement_status)));
    if (is_locked === "true") conditions.push(eq(ioEmployees.is_locked, true));
    if (srt_id_not_null === "true") conditions.push(sql`${ioEmployees.srt_id} IS NOT NULL`);

    const q = conditions.length > 0 ? query.where(and(...conditions)) : query;
    const ordered = String(order || "full_name") === "ohr_id" ? q.orderBy(asc(ioEmployees.ohr_id)) : q.orderBy(asc(ioEmployees.full_name));
    const limited = limit ? ordered.limit(Number(limit)) : ordered.limit(3000);
    const offsetQ = offset ? limited.offset(Number(offset)) : limited;

    const rows = await offsetQ;
    res.json(rows);
  } catch (err: any) {
    console.error("[IO API] employees GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/io/employees/:ohr_id - update an employee
router.patch("/employees/:ohr_id", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { ohr_id } = req.params;
    const updates = req.body;
    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    await db.update(ioEmployees).set(updates).where(eq(ioEmployees.ohr_id, ohr_id));
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] employees PATCH error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/employees - create a new employee
router.post("/employees", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    await db.insert(ioEmployees).values(req.body);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] employees POST error:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/io/employees/:ohr_id - delete an employee
router.delete("/employees/:ohr_id", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    await db.delete(ioEmployees).where(eq(ioEmployees.ohr_id, req.params.ohr_id));
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] employees DELETE error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// io_attendance
// ============================================================

// GET /api/io/attendance - list attendance with filters
router.get("/attendance", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { limit, offset, log_date_gte, log_date_lte, log_date, ohr_id, tag, tag_in, count_only,
            attendance_date_gte, attendance_date_lte, date_gte, date_lte,
            // Server-side filter params
            agent_in, flm_in, planning_group_in, billing_code_in,
            status_in, shift_time_in, role_in, blanks_only,
            // Server-side sort & pagination
            sort_by, sort_dir, paginated } = req.query;

    const conditions: any[] = [];
    if (ohr_id) conditions.push(eq(ioAttendance.ohr_id, String(ohr_id)));
    if (log_date) conditions.push(eq(ioAttendance.log_date, String(log_date)));
    const gteDate = log_date_gte || attendance_date_gte || date_gte;
    const lteDate = log_date_lte || attendance_date_lte || date_lte;
    if (gteDate) conditions.push(gte(ioAttendance.log_date, String(gteDate)));
    if (lteDate) conditions.push(lte(ioAttendance.log_date, String(lteDate)));
    if (tag) {
      const tagList = String(tag).split(",");
      if (tagList.length > 1) conditions.push(inArray(ioAttendance.tag, tagList));
      else conditions.push(eq(ioAttendance.tag, String(tag)));
    }
    if (tag_in) {
      const tags = String(tag_in).split("|");
      conditions.push(inArray(ioAttendance.tag, tags));
    }
    // Server-side multi-value filters (pipe-delimited to support names with commas)
    if (agent_in) conditions.push(inArray(ioAttendance.snap_full_name, String(agent_in).split("|")));
    if (flm_in) conditions.push(inArray(ioAttendance.snap_supervisor, String(flm_in).split("|")));
    if (planning_group_in) conditions.push(inArray(ioAttendance.snap_planning_group, String(planning_group_in).split("|")));
    if (billing_code_in) conditions.push(inArray(ioAttendance.billing_code, String(billing_code_in).split("|")));
    if (status_in) conditions.push(inArray(ioAttendance.snap_status, String(status_in).split("|")));
    if (shift_time_in) conditions.push(inArray(ioAttendance.snap_shift_time, String(shift_time_in).split("|")));
    if (role_in) conditions.push(inArray(ioAttendance.snap_actual_role, String(role_in).split("|")));
    if (blanks_only === "true") {
      conditions.push(or(
        sql`${ioAttendance.tag} IS NULL`,
        eq(ioAttendance.tag, ""),
        eq(ioAttendance.tag, "\u2014")
      ));
    }

    // Count-only mode for progress bar
    if (count_only === "true") {
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const result = await db.select({ count: sql<number>`COUNT(*)` }).from(ioAttendance).where(where);
      return res.json({ count: Number(result[0]?.count || 0) });
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Server-side paginated mode: returns { rows, total }
    if (paginated === "true") {
      const countResult = await db.select({ count: sql<number>`COUNT(*)` }).from(ioAttendance).where(where);
      const total = Number(countResult[0]?.count || 0);

      // Dynamic sort
      const sortColMap: Record<string, any> = {
        date: ioAttendance.log_date, log_date: ioAttendance.log_date,
        agent: ioAttendance.snap_full_name, flm: ioAttendance.snap_supervisor,
        tag: ioAttendance.tag, billingCode: ioAttendance.billing_code,
        actualPlanningGroup: ioAttendance.snap_planning_group,
        shiftTime: ioAttendance.snap_shift_time, role: ioAttendance.snap_actual_role,
        status: ioAttendance.snap_status,
      };
      const col = sortColMap[String(sort_by || 'log_date')] || ioAttendance.log_date;
      const dir = String(sort_dir || 'asc').toLowerCase() === 'desc' ? desc : asc;

      let q = db.select().from(ioAttendance);
      if (where) q = q.where(where) as any;
      const rows = await (q as any)
        .orderBy(dir(col), asc(ioAttendance.ohr_id))
        .limit(Number(limit) || 50)
        .offset(Number(offset) || 0);

      return res.json({ rows, total });
    }

    // Legacy flat-array mode (for initial load / progress-bar fetch)
    let query = db.select().from(ioAttendance);
    const q = where ? query.where(where) : query;
    const ordered = q.orderBy(asc(ioAttendance.log_date), asc(ioAttendance.ohr_id));
    const limited = limit ? ordered.limit(Number(limit)) : ordered.limit(1000);
    const offsetQ = offset ? limited.offset(Number(offset)) : limited;

    const rows = await offsetQ;
    res.json(rows);
  } catch (err: any) {
    console.error("[IO API] attendance GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/io/attendance/bulk-update - update multiple attendance records matching filters
router.patch("/attendance/bulk-update", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { ohr_id, log_date_gte, log_date_lte } = req.query;
    const updates = req.body;

    const conditions: any[] = [];
    if (ohr_id) conditions.push(eq(ioAttendance.ohr_id, String(ohr_id)));
    if (log_date_gte) conditions.push(gte(ioAttendance.log_date, String(log_date_gte)));
    if (log_date_lte) conditions.push(lte(ioAttendance.log_date, String(log_date_lte)));

    if (conditions.length === 0) {
      return res.status(400).json({ error: "At least one filter is required for bulk update" });
    }

    await db.update(ioAttendance).set(updates).where(and(...conditions));
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] attendance bulk-update error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/io/attendance/:id - update an attendance record (with audit logging + lock check)
router.patch("/attendance/:id", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const recordId = req.params.id;
    const updates = req.body;
    const actorOhr = req.headers["x-actor-ohr"] as string || "";
    const actorName = req.headers["x-actor-name"] as string || "";

    // Fetch current record for audit comparison
    const [current] = await db.select().from(ioAttendance).where(eq(ioAttendance.id, recordId)).limit(1);
    if (!current) return res.status(404).json({ error: "Record not found" });

    // Server-side lock enforcement (skip for admin/manager)
    if (current.is_locked && actorOhr !== "740045023") {
      return res.status(403).json({ error: "Record is locked and cannot be edited" });
    }

    // Date-based lock enforcement: yesterday and earlier locked after 11 AM PHT (except admin)
    if (actorOhr !== "740045023") {
      const now = new Date();
      const phtTime = new Date(now.getTime() + 8 * 60 * 60000);
      const phtHour = phtTime.getUTCHours();
      const todayPHT = phtTime.toISOString().slice(0, 10);
      const yesterdayD = new Date(phtTime);
      yesterdayD.setUTCDate(yesterdayD.getUTCDate() - 1);
      const yesterdayPHT = yesterdayD.toISOString().slice(0, 10);
      const recordDate = current.log_date || '';
      // Dates before yesterday are always locked
      if (recordDate < yesterdayPHT) {
        return res.status(403).json({ error: "Date-based lock: past dates locked for editing" });
      }
      // Yesterday is locked after 11 AM PHT
      if (recordDate === yesterdayPHT && phtHour >= 11) {
        return res.status(403).json({ error: "Date-based lock: previous day locked after 11 AM PHT" });
      }
    }

    // Build audit entries for each changed field
    const now = new Date().toISOString();
    const fieldMap: Record<string, string> = {
      tag: "tag", upl_reason: "upl_reason", remarks: "remarks",
      ot_hours: "ot_hours", billing_code: "billing_code"
    };

    const auditEntries: any[] = [];
    for (const [field, dbCol] of Object.entries(fieldMap)) {
      if (updates[field] !== undefined || updates[dbCol] !== undefined) {
        const newVal = updates[field] ?? updates[dbCol] ?? "";
        const oldVal = (current as any)[dbCol] || "";
        if (String(newVal) !== String(oldVal)) {
          auditEntries.push({
            record_type: "attendance",
            record_id: recordId,
            action: "edit",
            field_name: dbCol,
            old_value: String(oldVal),
            new_value: String(newVal),
            actor_ohr: actorOhr,
            actor_name: actorName,
            timestamp: now,
          });
        }
      }
    }
    // Audit lock/unlock events
    if (updates.is_locked !== undefined) {
      const oldLocked = current.is_locked ? "true" : "false";
      const newLocked = updates.is_locked ? "true" : "false";
      if (oldLocked !== newLocked) {
        auditEntries.push({
          record_type: "attendance",
          record_id: recordId,
          action: updates.is_locked ? "lock" : "unlock",
          field_name: "is_locked",
          old_value: oldLocked,
          new_value: newLocked,
          actor_ohr: actorOhr,
          actor_name: actorName,
          timestamp: now,
        });
      }
    }

    // Apply update
    await db.update(ioAttendance).set(updates).where(eq(ioAttendance.id, recordId));

    // Insert audit log entries
    if (auditEntries.length > 0) {
      for (const entry of auditEntries) {
        await db.insert(ioAuditLog).values(entry);
      }
    }

    res.json({ ok: true, audited: auditEntries.length });
  } catch (err: any) {
    console.error("[IO API] attendance PATCH error:", err);
    res.status(500).json({ error: err.message });
  }
});

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
    const rows = await db.select().from(ioCoaching).orderBy(desc(ioCoaching.id)).limit(lim);
    res.json(rows);
  } catch (err: any) {
    console.error("[IO API] coaching GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/coaching - create a coaching log
router.post("/coaching", async (req: Request, res: Response) => {
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

    const result = await db.insert(ioCoaching).values(values);
    const insertId = (result as any)[0]?.insertId;
    res.json({ ok: true, id: insertId, coaching_id });
  } catch (err: any) {
    console.error("[IO API] coaching POST error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/io/coaching/:id - update a coaching log (supports numeric id or alphanumeric coaching_id)
router.patch("/coaching/:id", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const paramId = req.params.id;
    // If param starts with "CL-", match by coaching_id; otherwise by numeric id
    if (paramId.startsWith("CL-")) {
      await db.update(ioCoaching).set(req.body).where(eq(ioCoaching.coaching_id, paramId));
    } else {
      await db.update(ioCoaching).set(req.body).where(eq(ioCoaching.id, Number(paramId)));
    }
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] coaching PATCH error:", err);
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

router.post("/coaching-rca", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    await db.insert(ioCoachingRca).values(req.body);
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
// io_notifications
// ============================================================

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

router.post("/notifications", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const body = { ...req.body };
    if (!body.created_at) body.created_at = new Date().toISOString();
    await db.insert(ioNotifications).values(body);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] notifications POST error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/io/notifications/maintenance - get or set maintenance state
router.put("/notifications/maintenance", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { value } = req.body;
    // Upsert: find existing maintenance flag or create one
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
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] notifications maintenance error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/io/notifications/mark-all-read - mark all as read
// NOTE: This must be defined BEFORE the :id route to avoid matching "mark-all-read" as an id
router.patch("/notifications/mark-all-read", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    await db.update(ioNotifications).set({ is_read: true }).where(eq(ioNotifications.is_read, false));
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] notifications mark-all-read error:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/io/notifications/clear-all - delete all non-maintenance notifications
router.delete("/notifications/clear-all", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    await db.delete(ioNotifications).where(ne(ioNotifications.type, "system_maintenance"));
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] notifications clear-all error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/io/notifications/:id - update a notification
// NOTE: Must be AFTER named routes (maintenance, mark-all-read, clear-all)
router.patch("/notifications/:id", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    await db.update(ioNotifications).set(req.body).where(eq(ioNotifications.id, Number(req.params.id)));
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] notifications PATCH error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// io_insights
// ============================================================

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

// ============================================================
// io_leaves
// ============================================================

router.get("/leaves", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { leave_id, limit } = req.query;

    if (leave_id) {
      const rows = await db.select().from(ioLeaves).where(eq(ioLeaves.leave_id, String(leave_id)));
      return res.json(rows);
    }

    const lim = limit ? Number(limit) : 2000;
    const rows = await db.select().from(ioLeaves).orderBy(desc(sql`created_at`)).limit(lim);
    res.json(rows);
  } catch (err: any) {
    console.error("[IO API] leaves GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/leaves", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    await db.insert(ioLeaves).values(req.body);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] leaves POST error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.patch("/leaves/:leave_id", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    await db.update(ioLeaves).set(req.body).where(eq(ioLeaves.leave_id, req.params.leave_id));
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] leaves PATCH error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// io_audit_log
// ============================================================

// GET /api/io/audit-log - get audit trail for a record
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

// POST /api/io/audit-log - create an audit entry (for lock events etc.)
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

// POST /api/io/attendance/bulk-tag - bulk tag multiple records with audit logging
router.post("/attendance/bulk-tag", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { ids, tag, actor_ohr, actor_name } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids array is required" });
    }
    if (!tag) return res.status(400).json({ error: "tag is required" });

    const now = new Date().toISOString();
    let updated = 0;
    let locked = 0;

    for (const id of ids) {
      const [record] = await db.select().from(ioAttendance).where(eq(ioAttendance.id, id)).limit(1);
      if (!record) continue;

      // Skip locked records (unless admin)
      if (record.is_locked && actor_ohr !== "740045023") {
        locked++;
        continue;
      }

      // Date-based lock: yesterday and earlier locked after 11 AM PHT (except admin)
      if (actor_ohr !== "740045023") {
        const nowD = new Date();
        const phtD = new Date(nowD.getTime() + 8 * 60 * 60000);
        const phtHourD = phtD.getUTCHours();
        const yesterdayBulk = new Date(phtD);
        yesterdayBulk.setUTCDate(yesterdayBulk.getUTCDate() - 1);
        const yesterdayStr = yesterdayBulk.toISOString().slice(0, 10);
        const recDate = record.log_date || '';
        if (recDate < yesterdayStr) {
          locked++;
          continue;
        }
        if (recDate === yesterdayStr && phtHourD >= 11) {
          locked++;
          continue;
        }
      }

      const oldTag = record.tag || "";
      if (oldTag === tag) continue; // No change needed

      await db.update(ioAttendance).set({ tag }).where(eq(ioAttendance.id, id));

      // Audit log
      await db.insert(ioAuditLog).values({
        record_type: "attendance",
        record_id: id,
        action: "bulk_tag",
        field_name: "tag",
        old_value: oldTag,
        new_value: tag,
        actor_ohr: actor_ohr || "",
        actor_name: actor_name || "",
        timestamp: now,
      });
      updated++;
    }

    res.json({ ok: true, updated, locked, total: ids.length });
  } catch (err: any) {
    console.error("[IO API] attendance bulk-tag error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Helm — Tasks CRUD
// ============================================================

/** Generate a unique task ID: TK-xxxxxxxx */
function generateTaskId(): string {
  return `TK-${crypto.randomBytes(4).toString('hex')}`;
}

// GET /api/io/tasks - list tasks
router.get("/tasks", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });
    const { limit } = req.query;
    const rows = await db.select().from(ioTasks).orderBy(desc(ioTasks.id)).limit(Number(limit) || 2000);
    res.json(rows);
  } catch (err: any) {
    console.error("[IO API] tasks list error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/tasks - create a task
router.post("/tasks", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });
    const taskId = generateTaskId();
    const now = new Date().toISOString();
    const record = {
      ...req.body,
      task_id: taskId,
      status: req.body.status || 'Open',
      created_at: now,
      updated_at: now,
    };
    await db.insert(ioTasks).values(record);
    res.json({ ok: true, task_id: taskId, ...record });

    // Create in-app notifications for all assigned users (fire-and-forget)
    sendTaskAssignmentNotifications(record).catch((err: any) => {
      console.error('[IO API] Background task notification error:', err.message);
    });
  } catch (err: any) {
    console.error("[IO API] tasks create error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/io/tasks/:taskId - update a task
router.patch("/tasks/:taskId", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });
    const { taskId } = req.params;
    const now = new Date().toISOString();
    const updates = { ...req.body, updated_at: now };
    await db.update(ioTasks).set(updates).where(eq(ioTasks.task_id, taskId));
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] tasks update error:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/io/tasks/:taskId - delete a task
router.delete("/tasks/:taskId", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });
    const { taskId } = req.params;
    await db.delete(ioTasks).where(eq(ioTasks.task_id, taskId));
    await db.delete(ioTaskComments).where(eq(ioTaskComments.task_id, taskId));
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] tasks delete error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/io/tasks/:taskId/comments - list comments for a task
router.get("/tasks/:taskId/comments", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });
    const { taskId } = req.params;
    const rows = await db.select().from(ioTaskComments).where(eq(ioTaskComments.task_id, taskId)).orderBy(asc(ioTaskComments.id));
    res.json(rows);
  } catch (err: any) {
    console.error("[IO API] task comments list error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/tasks/:taskId/comments - add a comment
router.post("/tasks/:taskId/comments", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });
    const { taskId } = req.params;
    const now = new Date().toISOString();
    const record = {
      ...req.body,
      task_id: taskId,
      created_at: now,
    };
    await db.insert(ioTaskComments).values(record);
    res.json({ ok: true, ...record });
  } catch (err: any) {
    console.error("[IO API] task comment create error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/upload - upload a file to storage (base64 encoded)
router.post("/upload", async (req: Request, res: Response) => {
  try {
    const { fileName, contentType, data } = req.body;
    if (!fileName || !data) {
      return res.status(400).json({ error: "fileName and data (base64) are required" });
    }
    const { storagePut } = await import("./storage.js");
    const buffer = Buffer.from(data, "base64");
    const key = `coaching-disputes/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const result = await storagePut(key, buffer, contentType || "application/octet-stream");
    res.json({ ok: true, url: result.url, key: result.key });
  } catch (err: any) {
    console.error("[IO API] upload error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Billing YTD Aggregation (server-side to avoid huge payloads)
// ============================================================

// GET /api/io/attendance/billing-ytd?year=2026
router.get("/attendance/billing-ytd", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const year = String(req.query.year || new Date().getFullYear());
    const startDate = `${year}-01-01`;
    const today = new Date();
    const endDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Excluded statuses
    const excludedStatuses = ['Nesting', 'Attrition Backfill Training', 'Exit'];

    // 1. Billing code compliance summary (Forecasted P, OT, by billing_code)
    const complianceRows = await db.execute(sql`
      SELECT
        a.billing_code,
        SUM(CASE WHEN a.tag IN ('P', 'LATE', '') OR a.tag IS NULL THEN 1 ELSE 0 END) AS forecasted_p,
        SUM(COALESCE(a.ot_hours, 0)) AS ot_rendered
      FROM io_attendance a
      LEFT JOIN io_employees e ON a.ohr_id = e.ohr_id
      WHERE a.log_date >= ${startDate}
        AND a.log_date <= ${endDate}
        AND (e.employement_status IS NULL OR e.employement_status NOT IN (${sql.raw(excludedStatuses.map(s => `'${s}'`).join(','))}))
      GROUP BY a.billing_code
    `);

    // 2. Monthly tag counts for trend charts (UPL, LATE, PL by month)
    const trendRows = await db.execute(sql`
      SELECT
        a.tag,
        DATE_FORMAT(a.log_date, '%Y-%m') AS month,
        COUNT(*) AS cnt
      FROM io_attendance a
      LEFT JOIN io_employees e ON a.ohr_id = e.ohr_id
      WHERE a.log_date >= ${startDate}
        AND a.log_date <= ${endDate}
        AND a.tag IN ('UPL', 'LATE', 'PL')
        AND (e.employement_status IS NULL OR e.employement_status NOT IN (${sql.raw(excludedStatuses.map(s => `'${s}'`).join(','))}))
      GROUP BY a.tag, DATE_FORMAT(a.log_date, '%Y-%m')
      ORDER BY month
    `);

    // mysql2 returns [rows, fields] — extract the rows array
    const compliance = Array.isArray(complianceRows) ? (Array.isArray(complianceRows[0]) ? complianceRows[0] : complianceRows) : [];
    const trends = Array.isArray(trendRows) ? (Array.isArray(trendRows[0]) ? trendRows[0] : trendRows) : [];

    res.json({ compliance, trends });
  } catch (err: any) {
    console.error("[IO API] billing-ytd error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/io/attendance/billing-ytd-weekly?year=2026
// Returns per-week per-billing-code aggregation for YTD compliance doughnut
router.get("/attendance/billing-ytd-weekly", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const year = String(req.query.year || new Date().getFullYear());
    const startDate = `${year}-01-01`;
    const today = new Date();
    const endDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Excluded statuses (use snap_status from attendance table)
    const excludedStatuses = ['Nesting', 'Attrition Backfill Training', 'Exit'];

    // Get per-week per-billing-code: forecasted_p and ot_rendered
    // Week is defined as Saturday-Friday. We use the Friday week-ending date.
    // DAYOFWEEK: 1=Sun,2=Mon,...,7=Sat. Friday=6. We compute the Friday of each record's week.
    // First get the distinct day count per week for pro-rating partial weeks
    const dayCountRows = await db.execute(sql`
      SELECT
        DATE_FORMAT(
          DATE_ADD(a.log_date, INTERVAL ((6 - DAYOFWEEK(a.log_date) + 7) % 7) DAY),
          '%Y-%m-%d'
        ) AS week_ending,
        COUNT(DISTINCT a.log_date) AS day_count
      FROM io_attendance a
      WHERE a.log_date >= ${startDate}
        AND a.log_date <= ${endDate}
        AND (a.snap_status IS NULL OR a.snap_status NOT IN (${sql.raw(excludedStatuses.map(s => `'${s}'`).join(','))}))
        AND a.billing_code IS NOT NULL
        AND a.billing_code != ''
      GROUP BY week_ending
      ORDER BY week_ending
    `);
    const dayCountData = Array.isArray(dayCountRows) ? (Array.isArray(dayCountRows[0]) ? dayCountRows[0] : dayCountRows) : [];
    const weekDayCounts: Record<string, number> = {};
    for (const r of dayCountData as any[]) {
      weekDayCounts[r.week_ending] = parseInt(r.day_count) || 7;
    }

    const rows = await db.execute(sql`
      SELECT
        DATE_FORMAT(
          DATE_ADD(a.log_date, INTERVAL ((6 - DAYOFWEEK(a.log_date) + 7) % 7) DAY),
          '%Y-%m-%d'
        ) AS week_ending,
        a.billing_code,
        SUM(CASE WHEN a.tag IN ('P', 'LATE', '') OR a.tag IS NULL THEN 1 ELSE 0 END) AS forecasted_p,
        SUM(COALESCE(a.ot_hours, 0)) AS ot_rendered
      FROM io_attendance a
      WHERE a.log_date >= ${startDate}
        AND a.log_date <= ${endDate}
        AND (a.snap_status IS NULL OR a.snap_status NOT IN (${sql.raw(excludedStatuses.map(s => `'${s}'`).join(','))}))
        AND a.billing_code IS NOT NULL
        AND a.billing_code != ''
      GROUP BY week_ending, a.billing_code
      ORDER BY week_ending, a.billing_code
    `);

    const data = Array.isArray(rows) ? (Array.isArray(rows[0]) ? rows[0] : rows) : [];
    res.json({ weeks: data, weekDayCounts });
  } catch (err: any) {
    console.error("[IO API] billing-ytd-weekly error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Billing Target Hours
// ============================================================

// GET /api/io/billing-target-hours
router.get("/billing-target-hours", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });
    const result = await db.execute(sql`SELECT code, target_hours FROM io_billing_target_hours`);
    res.json(result);
  } catch (err: any) {
    console.error("[IO API] billing-target-hours GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/billing-target-hours
router.post("/billing-target-hours", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });
    const { code, target_hours } = req.body;
    if (!code || target_hours === undefined) return res.status(400).json({ error: "code and target_hours required" });
    const now = new Date().toISOString();
    await db.execute(sql`INSERT INTO io_billing_target_hours (code, target_hours, updated_at) VALUES (${code}, ${target_hours}, ${now}) ON DUPLICATE KEY UPDATE target_hours = ${target_hours}, updated_at = ${now}`);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] billing-target-hours POST error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// CSV Export for Google Sheets Sync
// ============================================================

// GET /api/io/attendance/export?format=csv&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get("/attendance/export", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { startDate, endDate, format } = req.query;
    const conditions: any[] = [];

    if (startDate) conditions.push(gte(ioAttendance.log_date, String(startDate)));
    if (endDate) conditions.push(lte(ioAttendance.log_date, String(endDate)));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Fetch all matching rows (no limit for export)
    let query = db.select().from(ioAttendance);
    if (where) query = query.where(where) as any;
    const rows = await (query as any).orderBy(asc(ioAttendance.log_date), asc(ioAttendance.ohr_id));

    if (format === "json") {
      return res.json(rows);
    }

    // Default: CSV format
    const columns = [
      "id", "ohr_id", "log_date", "tag", "billing_code", "upl_reason",
      "remarks", "ot_hours", "created_at", "snap_full_name", "snap_supervisor",
      "snap_planning_group", "snap_shift_time", "snap_actual_role",
      "snap_billing_name", "snap_status", "is_locked", "locked_at"
    ];

    const escapeCsv = (val: any): string => {
      if (val === null || val === undefined) return "";
      const str = String(val);
      if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    let csv = columns.join(",") + "\n";
    for (const row of rows) {
      csv += columns.map(col => escapeCsv((row as any)[col])).join(",") + "\n";
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="attendance_export.csv"');
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(csv);
  } catch (err: any) {
    console.error("[IO API] attendance export error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GChat Notification Queue — Backdate Tag Change Request
// ============================================================

router.post("/gchat-notify-supervisor", async (req: Request, res: Response) => {
  try {
    const { request_id, agent_name, agent_ohr, date, new_tag, reason, requester_name, requester_ohr, supervisor_name } = req.body;
    if (!request_id || !supervisor_name) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    // Find supervisor's gchat_space_id
    const [supervisor] = await db.select().from(ioEmployees)
      .where(eq(ioEmployees.full_name, supervisor_name))
      .limit(1);

    if (!supervisor || !supervisor.gchat_space_id) {
      console.warn(`[GChat] Supervisor "${supervisor_name}" has no gchat_space_id`);
      return res.json({ queued: false, reason: "Supervisor has no GChat space ID" });
    }

    // Build the rich card JSON
    const cardJson = JSON.stringify([{
      cardId: `backdate_${request_id}`,
      card: {
        header: {
          title: "Backdate Tag Change Request",
          subtitle: request_id,
          imageUrl: "https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/assignment_late/default/48px.svg",
          imageType: "CIRCLE"
        },
        sections: [
          {
            header: "Request Details",
            widgets: [
              { decoratedText: { topLabel: "Agent", text: `${agent_name} (${agent_ohr})` } },
              { decoratedText: { topLabel: "Date", text: date } },
              { decoratedText: { topLabel: "New Tag", text: new_tag || "N/A" } },
              { decoratedText: { topLabel: "Requested By", text: requester_name } },
              { decoratedText: { topLabel: "Reason", text: reason || "No reason provided" } },
              { decoratedText: { topLabel: "Submitted", text: new Date().toLocaleString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }) } }
            ]
          },
          {
            widgets: [
              {
                buttonList: {
                  buttons: [
                    {
                      text: "\u2705 Approve",
                      color: { red: 0.13, green: 0.77, blue: 0.37, alpha: 1 },
                      onClick: { openLink: { url: `${process.env.VITE_OAUTH_PORTAL_URL || ''}` } }
                    },
                    {
                      text: "\u274C Reject",
                      color: { red: 0.94, green: 0.27, blue: 0.27, alpha: 1 },
                      onClick: { openLink: { url: `${process.env.VITE_OAUTH_PORTAL_URL || ''}` } }
                    }
                  ]
                }
              }
            ]
          }
        ]
      }
    }]);

    const fallbackText = `[${request_id}] Backdate Tag Change Request\nAgent: ${agent_name}\nDate: ${date}\nNew Tag: ${new_tag || 'N/A'}\nRequested by: ${requester_name}\nReason: ${reason}`;

    // Insert into queue
    await db.insert(ioGchatQueue).values({
      type: "backdate_tag_request",
      target_space_id: supervisor.gchat_space_id,
      target_name: supervisor_name,
      card_json: cardJson,
      fallback_text: fallbackText,
      status: "pending",
      metadata: JSON.stringify({ request_id, agent_name, agent_ohr, date, requester_name, requester_ohr, supervisor_name }),
      created_at: new Date().toISOString(),
    });

    console.log(`[GChat Queue] Notification queued for supervisor ${supervisor_name} (space: ${supervisor.gchat_space_id})`);
    res.json({ queued: true, supervisor: supervisor_name, space_id: supervisor.gchat_space_id });
  } catch (err: any) {
    console.error("[GChat Queue] Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GChat Notification: Task Assignment
// ============================================================
router.post("/gchat-notify-task", async (req: Request, res: Response) => {
  try {
    const { task_id, title, description, assigned_by, due_date, assignees } = req.body;
    if (!task_id || !title || !assignees || !Array.isArray(assignees)) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    let queued = 0;
    let skipped = 0;

    for (const assignee of assignees) {
      // Find assignee's gchat_space_id
      const [emp] = await db.select().from(ioEmployees)
        .where(eq(ioEmployees.ohr_id, assignee.ohr))
        .limit(1);

      if (!emp || !emp.gchat_space_id) {
        console.warn(`[GChat] Assignee "${assignee.name}" (${assignee.ohr}) has no gchat_space_id`);
        skipped++;
        continue;
      }

      const cardJson = JSON.stringify([{
        cardId: `task_${task_id}_${assignee.ohr}`,
        card: {
          header: {
            title: "New Task Assigned",
            subtitle: task_id,
            imageUrl: "https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/task_alt/default/48px.svg",
            imageType: "CIRCLE"
          },
          sections: [
            {
              header: "Task Details",
              widgets: [
                { decoratedText: { topLabel: "Title", text: title } },
                ...(description ? [{ decoratedText: { topLabel: "Description", text: description.substring(0, 200) } }] : []),
                { decoratedText: { topLabel: "Assigned By", text: assigned_by } },
                ...(due_date ? [{ decoratedText: { topLabel: "Due Date", text: due_date } }] : []),
                { decoratedText: { topLabel: "Assigned", text: new Date().toLocaleString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }) } }
              ]
            }
          ]
        }
      }]);

      const fallbackText = `[${task_id}] Task Assigned: ${title}\nAssigned by: ${assigned_by}${due_date ? '\nDue: ' + due_date : ''}`;

      await db.insert(ioGchatQueue).values({
        type: "task_assigned",
        target_space_id: emp.gchat_space_id,
        target_name: assignee.name,
        card_json: cardJson,
        fallback_text: fallbackText,
        status: "pending",
        metadata: JSON.stringify({ task_id, title, assigned_by, due_date, assignee_ohr: assignee.ohr, assignee_name: assignee.name }),
        created_at: new Date().toISOString(),
      });

      queued++;
    }

    console.log(`[GChat Queue] Task ${task_id}: ${queued} queued, ${skipped} skipped`);
    res.json({ queued, skipped });
  } catch (err: any) {
    console.error("[GChat Queue] Task notification error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/backfill-snap-status — one-time backfill snap_status from io_employees.srt_status
router.post("/backfill-snap-status", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });
    const result = await db.execute(sql`
      UPDATE io_attendance a
      JOIN io_employees e ON a.ohr_id = e.ohr_id
      SET a.snap_status = e.srt_status
      WHERE e.srt_status IS NOT NULL AND e.srt_status != ''
    `);
    res.json({ ok: true, message: "snap_status backfilled from io_employees.srt_status", affectedRows: (result as any)[0]?.affectedRows });
  } catch (err: any) {
    console.error("[IO API] backfill-snap-status error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// OT Request & Approval System
// ============================================================

// GET /ot-requests — list OT requests (optionally filter by planning_group, status, ohr_id)
router.get("/ot-requests", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const { planning_group, status, ohr_id } = req.query;
    const conditions: any[] = [];
    if (planning_group) conditions.push(eq(ioOtRequests.planning_group, planning_group as string));
    if (status) conditions.push(eq(ioOtRequests.status, status as string));
    if (ohr_id) conditions.push(eq(ioOtRequests.ohr_id, ohr_id as string));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = await db.select().from(ioOtRequests).where(where).orderBy(asc(ioOtRequests.submitted_at));
    res.json(rows);
  } catch (err: any) {
    console.error("[IO API] ot-requests GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /ot-requests — agent submits an OT request
router.post("/ot-requests", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const { ohr_id, agent_name, planning_group, requested_hours } = req.body;
    if (!ohr_id || !requested_hours) {
      return res.status(400).json({ error: "ohr_id and requested_hours are required" });
    }
    const validHours = ["1", "1.5", "2", "2.5"];
    if (!validHours.includes(String(requested_hours))) {
      return res.status(400).json({ error: "requested_hours must be 1, 1.5, 2, or 2.5" });
    }
    // Check for existing requests by this agent in the current week (Mon-Sun)
    const now = new Date().toISOString();
    const nowDate = new Date(now);
    const dayOfWeek = nowDate.getUTCDay(); // 0=Sun, 1=Mon, ...
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(nowDate);
    weekStart.setUTCDate(weekStart.getUTCDate() - diffToMonday);
    weekStart.setUTCHours(0, 0, 0, 0);
    const weekStartISO = weekStart.toISOString();

    const existingThisWeek = await db.select().from(ioOtRequests)
      .where(and(
        eq(ioOtRequests.ohr_id, ohr_id),
        gte(ioOtRequests.submitted_at, weekStartISO)
      ));
    const submissionCount = existingThisWeek.length;

    if (submissionCount > 0) {
      // Agent already submitted at least once this week.
      // Check how many times OM opened the form this week (open_count).
      // Allowed submissions = 1 (initial) + open_count for this week.
      const config = await db.select().from(ioOtConfig)
        .where(eq(ioOtConfig.planning_group, planning_group || ""));
      let openCount = 0;
      if (config.length > 0) {
        // Only count opens from the current week
        const configWeekStart = config[0].week_start || "";
        if (configWeekStart === weekStartISO) {
          openCount = config[0].open_count || 0;
        }
      }
      const maxAllowed = 1 + openCount; // 1 initial + 1 per OM re-open
      if (submissionCount >= maxAllowed) {
        return res.status(409).json({ error: "You have already submitted an OT request this week. Please wait for your manager to reopen the OT form for additional submissions." });
      }
    }
    const requestId = "OT-" + crypto.randomBytes(4).toString("hex");
    await db.insert(ioOtRequests).values({
      request_id: requestId,
      ohr_id,
      agent_name: agent_name || "",
      planning_group: planning_group || "",
      requested_hours: String(requested_hours),
      status: "pending",
      submitted_at: now,
    });
    // Notif #1: Notify the requester that their OT request was submitted
    try {
      await db.insert(ioNotifications).values({
        type: "ot_request_submitted",
        title: "OT Request Submitted",
        message: `Your OT request (${requestId}) for ${requested_hours} hour(s) has been submitted and is waitlisted for next week.`,
        actor_ohr: ohr_id,
        actor_name: agent_name || "",
        target_ohr: ohr_id,
        metadata: JSON.stringify({ request_id: requestId, hours: requested_hours, planning_group }),
        is_read: false,
        created_at: now,
      });
    } catch (notifErr: any) {
      console.error("[IO API] OT submit notification error:", notifErr.message);
    }
    res.status(201).json({ ok: true, request_id: requestId });
  } catch (err: any) {
    console.error("[IO API] ot-requests POST error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Helper: parse work_off string (e.g. "Mon - Tue") into day-of-week numbers (0=Sun, 1=Mon, ..., 6=Sat)
function parseWorkOffDays(workOff: string): number[] {
  if (!workOff) return [];
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return workOff.split(/\s*-\s*/).map(d => dayMap[d.trim()]).filter(d => d !== undefined);
}

// Helper: check if a date string (YYYY-MM-DD) falls within any approved leave
function isOnLeave(dateStr: string, leaves: any[]): boolean {
  for (const lv of leaves) {
    if (lv.status !== 'approved' && lv.status !== 'Approved') continue;
    const start = lv.start_date || '';
    const end = lv.end_date || '';
    if (start && end && dateStr >= start && dateStr <= end) return true;
    if (start && !end && dateStr === start) return true;
  }
  return false;
}

// Helper: find a valid OT day in next week for an agent
// Returns YYYY-MM-DD or null if no valid day found
function findOtDay(nextMonday: Date, workOffDays: number[], agentLeaves: any[]): string | null {
  const weekDates: { date: Date; dateStr: string; dow: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(nextMonday);
    d.setUTCDate(d.getUTCDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    weekDates.push({ date: d, dateStr, dow: d.getUTCDay() });
  }
  // Forward pass: Mon to Sun
  for (const wd of weekDates) {
    if (workOffDays.includes(wd.dow)) continue;
    if (isOnLeave(wd.dateStr, agentLeaves)) continue;
    return wd.dateStr;
  }
  // Backward pass: Sun to Mon
  for (let i = weekDates.length - 1; i >= 0; i--) {
    const wd = weekDates[i];
    if (workOffDays.includes(wd.dow)) continue;
    if (isOnLeave(wd.dateStr, agentLeaves)) continue;
    return wd.dateStr;
  }
  return null; // No valid day found
}

// POST /ot-requests/approve — OM approves OT requests for a planning group (FIFO)
// OT is applied to NEXT WEEK, on a day the agent is not on work off or leave
router.post("/ot-requests/approve", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const { planning_group, ot_hours_needed, approved_by, approved_by_ohr } = req.body;
    if (!planning_group || !ot_hours_needed) {
      return res.status(400).json({ error: "planning_group and ot_hours_needed are required" });
    }
    const hoursNeeded = parseFloat(ot_hours_needed);
    if (isNaN(hoursNeeded) || hoursNeeded <= 0) {
      return res.status(400).json({ error: "ot_hours_needed must be a positive number" });
    }
    // Get pending requests for this PG, sorted by submitted_at ASC (FIFO)
    const pending = await db.select().from(ioOtRequests)
      .where(and(eq(ioOtRequests.planning_group, planning_group), eq(ioOtRequests.status, "pending")))
      .orderBy(asc(ioOtRequests.submitted_at));
    if (pending.length === 0) {
      return res.status(404).json({ error: "No pending OT requests for this planning group" });
    }
    const now = new Date().toISOString();
    const nowDate = new Date();

    // Calculate next week's Monday
    const dayOfWeek = nowDate.getUTCDay(); // 0=Sun
    const daysToNextMon = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
    const nextMonday = new Date(nowDate);
    nextMonday.setUTCDate(nextMonday.getUTCDate() + daysToNextMon);
    nextMonday.setUTCHours(0, 0, 0, 0);
    // Next Sunday
    const nextSunday = new Date(nextMonday);
    nextSunday.setUTCDate(nextSunday.getUTCDate() + 6);
    const nextMondayStr = nextMonday.toISOString().split('T')[0];
    const nextSundayStr = nextSunday.toISOString().split('T')[0];

    // Pre-fetch all employees in this PG for work_off data
    const allEmployees = await db.select().from(ioEmployees)
      .where(eq(ioEmployees.planning_group, planning_group));
    const empMap = new Map(allEmployees.map((e: any) => [e.ohr_id, e]));

    // Pre-fetch all approved leaves for next week for agents in this PG
    const allLeaves = await db.select().from(ioLeaves)
      .where(eq(ioLeaves.planning_group, planning_group));
    // Filter to leaves that overlap with next week
    const nextWeekLeaves = allLeaves.filter((lv: any) => {
      if (lv.status !== 'approved' && lv.status !== 'Approved') return false;
      const start = lv.start_date || '';
      const end = lv.end_date || start;
      return start <= nextSundayStr && end >= nextMondayStr;
    });

    let hoursRemaining = hoursNeeded;
    const approved: any[] = [];
    const waitlisted: any[] = [];

    for (const otReq of pending) {
      if (hoursRemaining <= 0) break;
      const reqHours = parseFloat(otReq.requested_hours);
      if (reqHours > hoursRemaining) continue;

      const emp = empMap.get(otReq.ohr_id);
      const workOffDays = parseWorkOffDays(emp?.work_off || '');
      const agentLeaves = nextWeekLeaves.filter((lv: any) => lv.ohr_id === otReq.ohr_id);

      const appliedDate = findOtDay(nextMonday, workOffDays, agentLeaves);

      if (!appliedDate) {
        // No valid day — keep waitlisted
        waitlisted.push({ request_id: otReq.request_id, ohr_id: otReq.ohr_id, agent_name: otReq.agent_name, hours: reqHours, reason: 'No available day (all days are work off or on leave)' });
        continue;
      }

      // Approve this request and apply to the found date
      await db.update(ioOtRequests)
        .set({ status: "approved", approved_at: now, applied_date: appliedDate, approved_by: approved_by || "", approved_by_ohr: approved_by_ohr || "" })
        .where(eq(ioOtRequests.id, otReq.id));

      // Write OT to attendance for the applied date
      const attRows = await db.select().from(ioAttendance)
        .where(and(eq(ioAttendance.ohr_id, otReq.ohr_id), eq(ioAttendance.log_date, appliedDate)));
      if (attRows.length > 0) {
        await db.update(ioAttendance)
          .set({ ot_hours: String(reqHours) })
          .where(eq(ioAttendance.id, attRows[0].id));
      } else {
        const e = emp;
        const attId = crypto.randomBytes(8).toString("hex");
        await db.insert(ioAttendance).values({
          id: attId,
          ohr_id: otReq.ohr_id,
          log_date: appliedDate,
          ot_hours: String(reqHours),
          created_at: now,
          snap_full_name: e?.full_name || otReq.agent_name,
          snap_supervisor: e?.supervisor_name || "",
          snap_planning_group: e?.planning_group || "",
          snap_shift_time: e?.shift_time || "",
          snap_actual_role: e?.actual_role || "",
          snap_billing_name: e?.billing_name || "",
          snap_status: e?.srt_status || "",
        });
      }

      // Audit log
      await db.insert(ioAuditLog).values({
        record_type: "ot_request",
        record_id: otReq.request_id,
        action: "approved",
        field_name: "status",
        old_value: "pending",
        new_value: "approved",
        actor_ohr: approved_by_ohr || "",
        actor_name: approved_by || "",
        timestamp: now,
        metadata: JSON.stringify({ ot_hours: reqHours, applied_date: appliedDate, planning_group }),
      });
      hoursRemaining -= reqHours;
      approved.push({ request_id: otReq.request_id, ohr_id: otReq.ohr_id, agent_name: otReq.agent_name, hours: reqHours, applied_date: appliedDate });
    }
    // Close OT form for this planning group after approval
    await db.update(ioOtConfig)
      .set({ ot_form_open: false, updated_at: now, updated_by: approved_by || "" })
      .where(eq(ioOtConfig.planning_group, planning_group));

    // Notif #3: Notify agents whose OT was applied + their supervisors
    try {
      const appliedNotifs: any[] = [];
      for (const a of approved) {
        const appliedDateFormatted = new Date(a.applied_date + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
        // Notify the agent
        appliedNotifs.push({
          type: "ot_applied",
          title: "OT Request Applied",
          message: `Your OT request (${a.request_id}) for ${a.hours} hour(s) has been applied on ${appliedDateFormatted}.`,
          actor_ohr: approved_by_ohr || "",
          actor_name: approved_by || "",
          target_ohr: a.ohr_id,
          metadata: JSON.stringify({ request_id: a.request_id, hours: a.hours, applied_date: a.applied_date, planning_group }),
          is_read: false,
          created_at: now,
        });
        // Notify the agent's supervisor
        const emp = empMap.get(a.ohr_id);
        if (emp?.supervisor_ohr) {
          appliedNotifs.push({
            type: "ot_applied",
            title: "OT Applied — Agent Update",
            message: `OT for ${a.agent_name} (${a.hours} hr) has been applied on ${appliedDateFormatted}.`,
            actor_ohr: approved_by_ohr || "",
            actor_name: approved_by || "",
            target_ohr: emp.supervisor_ohr,
            metadata: JSON.stringify({ request_id: a.request_id, agent_ohr: a.ohr_id, agent_name: a.agent_name, hours: a.hours, applied_date: a.applied_date, planning_group }),
            is_read: false,
            created_at: now,
          });
        }
      }
      if (appliedNotifs.length > 0) {
        await db.insert(ioNotifications).values(appliedNotifs);
      }
    } catch (notifErr: any) {
      console.error("[IO API] OT applied notification error:", notifErr.message);
    }

    // Notif #4: Notify agents whose OT request stayed waitlisted
    try {
      const waitlistNotifs = waitlisted.map((w: any) => ({
        type: "ot_waitlisted",
        title: "OT Request Waitlisted",
        message: `Your OT request (${w.request_id}) for ${w.hours} hour(s) remains waitlisted. Reason: ${w.reason}`,
        actor_ohr: approved_by_ohr || "",
        actor_name: approved_by || "",
        target_ohr: w.ohr_id,
        metadata: JSON.stringify({ request_id: w.request_id, hours: w.hours, reason: w.reason, planning_group }),
        is_read: false,
        created_at: now,
      }));
      if (waitlistNotifs.length > 0) {
        await db.insert(ioNotifications).values(waitlistNotifs);
      }
    } catch (notifErr: any) {
      console.error("[IO API] OT waitlisted notification error:", notifErr.message);
    }

    res.json({
      ok: true,
      approved_count: approved.length,
      total_hours_approved: approved.reduce((sum: number, a: any) => sum + a.hours, 0),
      hours_remaining: Math.max(0, hoursRemaining),
      waitlisted_count: waitlisted.length,
      approved,
      waitlisted,
    });
  } catch (err: any) {
    console.error("[IO API] ot-requests/approve error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /ot-requests/open-form — OM opens OT form for a planning group (sends notifications)
router.post("/ot-requests/open-form", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const { planning_group, opened_by, opened_by_ohr } = req.body;
    if (!planning_group) {
      return res.status(400).json({ error: "planning_group is required" });
    }
    const now = new Date().toISOString();
    // Calculate current week start (Mon-Sun)
    const nowDate = new Date(now);
    const dayOfWeek = nowDate.getUTCDay();
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(nowDate);
    weekStart.setUTCDate(weekStart.getUTCDate() - diffToMonday);
    weekStart.setUTCHours(0, 0, 0, 0);
    const weekStartISO = weekStart.toISOString();

    // Upsert config row with open_count tracking
    const existing = await db.select().from(ioOtConfig).where(eq(ioOtConfig.planning_group, planning_group));
    let isReopen = false;
    if (existing.length > 0) {
      const currentWeekStart = existing[0].week_start || "";
      let newOpenCount = 1;
      if (currentWeekStart === weekStartISO) {
        // Same week — increment open_count
        newOpenCount = (existing[0].open_count || 0) + 1;
        isReopen = true; // This is a re-open within the same week
      }
      // If different week, reset to 1 (first open of new week)
      await db.update(ioOtConfig)
        .set({ ot_form_open: true, open_count: newOpenCount, week_start: weekStartISO, updated_at: now, updated_by: opened_by || "" })
        .where(eq(ioOtConfig.planning_group, planning_group));
    } else {
      await db.insert(ioOtConfig).values({
        planning_group,
        ot_form_open: true,
        open_count: 1,
        week_start: weekStartISO,
        updated_at: now,
        updated_by: opened_by || "",
      });
    }
    // Get all agents in this planning group (exclude RECALL_MEASUREMENT_CTR)
    const agents = await db.select().from(ioEmployees)
      .where(eq(ioEmployees.planning_group, planning_group));
    const eligibleAgents = agents.filter((a: any) =>
      a.actual_role === "Agent" &&
      !(a.complete_planning_group || "").includes("RECALL_MEASUREMENT_CTR")
    );
    // Batch create in-app notifications for all eligible agents
    const notifTitle = isReopen ? "OT Form Reopened" : "OT Request Form Open";
    const notifMsg = isReopen
      ? `The OT form has been reopened for ${planning_group}. You may submit an additional OT request.`
      : `OT requests are now open for ${planning_group}. You may submit a new OT request.`;
    const notifValues = eligibleAgents.map((agent: any) => ({
      type: isReopen ? "ot_form_reopen" : "ot_form_open",
      title: notifTitle,
      message: notifMsg,
      actor_ohr: opened_by_ohr || "",
      actor_name: opened_by || "",
      target_ohr: agent.ohr_id,
      metadata: JSON.stringify({ planning_group, is_reopen: isReopen }),
      is_read: false,
      created_at: now,
    }));
    // Notif #5: On re-open, also notify OM Jenifer Rosales (740030270) and Senior Manager Polimetla (703212987)
    if (isReopen) {
      const omNotifyOhrs = ["740030270", "703212987"];
      for (const omOhr of omNotifyOhrs) {
        notifValues.push({
          type: "ot_form_reopen",
          title: "OT Form Reopened",
          message: `The OT form has been reopened for ${planning_group} by ${opened_by || 'OM'}.`,
          actor_ohr: opened_by_ohr || "",
          actor_name: opened_by || "",
          target_ohr: omOhr,
          metadata: JSON.stringify({ planning_group, is_reopen: true }),
          is_read: false,
          created_at: now,
        });
      }
    }
    if (notifValues.length > 0) {
      await db.insert(ioNotifications).values(notifValues);
    }
    // Batch queue GChat notifications for agents with gchat_space_id
    const gchatValues = eligibleAgents
      .filter((a: any) => a.gchat_space_id)
      .map((agent: any) => {
        const cardJson = JSON.stringify({
          cardsV2: [{
            cardId: `ot-form-open-${agent.ohr_id}`,
            card: {
              header: { title: notifTitle, subtitle: planning_group, imageUrl: "", imageType: "CIRCLE" },
              sections: [{
                widgets: [
                  { textParagraph: { text: isReopen
                    ? `The OT form has been <b>reopened</b> for <b>${planning_group}</b>. You may submit an additional OT request in the Task Board.`
                    : `OT requests are now open for <b>${planning_group}</b>. You may submit a new OT request in the Task Board.` } },
                ]
              }]
            }
          }]
        });
        return {
          type: "ot_form_open",
          target_space_id: agent.gchat_space_id,
          target_name: agent.full_name || "",
          card_json: cardJson,
          fallback_text: isReopen
            ? `The OT form has been reopened for ${planning_group}. You may submit an additional OT request in the Task Board.`
            : `OT requests are now open for ${planning_group}. Submit your OT request in the Task Board.`,
          status: "pending",
          metadata: JSON.stringify({ planning_group, ohr_id: agent.ohr_id }),
          created_at: now,
        };
      });
    if (gchatValues.length > 0) {
      await db.insert(ioGchatQueue).values(gchatValues);
    }
    res.json({ ok: true, notifications_sent: notifValues.length, planning_group, is_reopen: isReopen });
  } catch (err: any) {
    console.error("[IO API] ot-requests/open-form error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /ot-config — get OT form open/closed state for all planning groups
router.get("/ot-config", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const rows = await db.select().from(ioOtConfig);
    res.json(rows);
  } catch (err: any) {
    console.error("[IO API] ot-config GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

export function registerIORoutes(app: import("express").Express) {
  app.use("/api/io", router);
  console.log("[IO API] Routes registered under /api/io/*");
}
