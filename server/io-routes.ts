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
      const tags = String(tag_in).split(",");
      conditions.push(inArray(ioAttendance.tag, tags));
    }
    // Server-side multi-value filters
    if (agent_in) conditions.push(inArray(ioAttendance.snap_full_name, String(agent_in).split(",")));
    if (flm_in) conditions.push(inArray(ioAttendance.snap_supervisor, String(flm_in).split(",")));
    if (planning_group_in) conditions.push(inArray(ioAttendance.snap_planning_group, String(planning_group_in).split(",")));
    if (billing_code_in) conditions.push(inArray(ioAttendance.billing_code, String(billing_code_in).split(",")));
    if (status_in) conditions.push(inArray(ioAttendance.snap_status, String(status_in).split(",")));
    if (shift_time_in) conditions.push(inArray(ioAttendance.snap_shift_time, String(shift_time_in).split(",")));
    if (role_in) conditions.push(inArray(ioAttendance.snap_actual_role, String(role_in).split(",")));
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

    // Date-based lock enforcement: past dates are always locked (except admin)
    if (actorOhr !== "740045023") {
      const now = new Date();
      const phtTime = new Date(now.getTime() + 8 * 60 * 60000);
      const todayPHT = phtTime.toISOString().slice(0, 10);
      const recordDate = current.log_date || '';
      if (recordDate < todayPHT) {
        return res.status(403).json({ error: "Past dates are locked and cannot be edited" });
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

    await db.insert(ioNotifications).values(req.body);
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

      // Date-based lock: past dates locked (except admin)
      if (actor_ohr !== "740045023") {
        const nowD = new Date();
        const phtD = new Date(nowD.getTime() + 8 * 60 * 60000);
        const todayStr = phtD.toISOString().slice(0, 10);
        if ((record.log_date || '') < todayStr) {
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

export function registerIORoutes(app: import("express").Express) {
  app.use("/api/io", router);
  console.log("[IO API] Routes registered under /api/io/*");
}
