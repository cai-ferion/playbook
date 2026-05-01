/**
 * IO Operations API Routes
 * Express API routes for IO Operations data via TiDB/Drizzle.
 */
import { Router, Request, Response } from "express";
import { getDb } from "./db.js";
import { invokeLLM } from "./_core/llm.js";
import { notifyOwner } from "./_core/notification.js";
import {
  ioEmployees,
  ioAttendance,
  ioCoaching,
  ioCoachingRca,
  ioCoachingZtp,
  ioCoachingNte,
  ioNotifications,
  ioInsights,
  ioLeaves,
  ioAuditLog,
  ioTasks,
  ioTaskComments,

  ioSrtBill,
  ioBillingTargetsV2,
  ioSyncLog,
  compassCoachingLogs,
  compassDisputeEvents,
  compassCaCases,
  compassCaTimeline,
  compassViolationCatalog,
  ioPermissions,
  wfmSessionLog,
  ioCorrectiveActions,
} from "../drizzle/schema.js";
import { eq, and, gte, lte, like, ne, sql, desc, asc, inArray, or, count } from "drizzle-orm";
import crypto from "crypto";
import { syncEmployeesToSupabase, deleteEmployeesFromSupabase } from "./supabase-sync.js";
import { ADMIN_OHRS, OWNER_OHR, isAdminOhr } from "./config.js";
const router = Router();

// ── Manager OHR Cache (5-min TTL) ──────────────────────────────
// Replaces the correlated NOT IN (SELECT ...) subquery on every attendance request.
let _managerOhrSet: Set<string> = new Set();
let _managerCacheTs = 0;
const MANAGER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getManagerOhrSet(): Promise<Set<string>> {
  if (Date.now() - _managerCacheTs < MANAGER_CACHE_TTL && _managerOhrSet.size > 0) {
    return _managerOhrSet;
  }
  try {
    const db = await getDb();
    if (!db) return _managerOhrSet;
    const rows = await db.select({ ohr_id: ioEmployees.ohr_id })
      .from(ioEmployees)
      .where(eq(ioEmployees.actual_role, 'Manager'));
    _managerOhrSet = new Set(rows.map(r => r.ohr_id));
    _managerCacheTs = Date.now();
  } catch (err) {
    console.warn('[ManagerCache] Failed to refresh:', err);
  }
  return _managerOhrSet;
}

// Normalize long PG codes from Google Sheet / SRT to short codes used in DB
const PG_NORMALIZE: Record<string, string> = {
  'MASA_MAFSA_CTR_SCALED_REVIEW': 'S-ABF',
  'CEI_TASKFORCE_CTR': 'CS-ABF',
};
function normalizePg(raw: string): string {
  return PG_NORMALIZE[raw] || raw;
}



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
// Slim employee lookup — returns only fields needed for attendance normalization
router.get("/employees/slim", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });
    const rows = await db.select({
      ohr_id: ioEmployees.ohr_id,
      full_name: ioEmployees.full_name,
      supervisor_name: ioEmployees.supervisor_name,
      actual_role: ioEmployees.actual_role,
      planning_group: ioEmployees.planning_group,
      complete_planning_group: ioEmployees.complete_planning_group,
      shift_time: ioEmployees.shift_time,
      srt_status: ioEmployees.srt_status,
      department: ioEmployees.department,
      sex: ioEmployees.sex,
    }).from(ioEmployees).orderBy(asc(ioEmployees.ohr_id)).limit(3000);
    res.json(rows);
  } catch (err: any) {
    console.error("[IO API] employees/slim GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/employees", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { select: selectCols, limit, offset, order, ohr_id, employement_status, srt_id_not_null } = req.query;

    let query = db.select().from(ioEmployees);
    const conditions: any[] = [];

    if (ohr_id) conditions.push(eq(ioEmployees.ohr_id, String(ohr_id)));
    if (employement_status) conditions.push(eq(ioEmployees.employement_status, String(employement_status)));
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
    const rawBody = { ...req.body };

    // Extract audit metadata (not persisted to io_employees)
    const actorOhr = rawBody._actor_ohr || null;
    const actorName = rawBody._actor_name || null;
    delete rawBody._actor_ohr;
    delete rawBody._actor_name;

    const updates = rawBody;
    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    // Fetch current state for audit diff
    const [before] = await db.select().from(ioEmployees).where(eq(ioEmployees.ohr_id, ohr_id));

    await db.update(ioEmployees).set(updates).where(eq(ioEmployees.ohr_id, ohr_id));

    // Audit logging: log each changed field
    if (before && actorOhr) {
      const now = new Date().toISOString();
      const auditEntries: any[] = [];
      for (const [key, newVal] of Object.entries(updates)) {
        const oldVal = (before as any)[key];
        const oldStr = oldVal != null ? String(oldVal) : '';
        const newStr = newVal != null ? String(newVal) : '';
        if (oldStr !== newStr) {
          auditEntries.push({
            record_type: 'io_employees',
            record_id: ohr_id,
            action: 'UPDATE',
            field_name: key,
            old_value: oldStr || null,
            new_value: newStr || null,
            actor_ohr: actorOhr,
            actor_name: actorName,
            timestamp: now,
          });
        }
      }
      if (auditEntries.length > 0) {
        db.insert(ioAuditLog).values(auditEntries).catch((e: any) =>
          console.error('[IO API] audit log insert error:', e)
        );
      }
    }

    // Fire-and-forget: mirror change to Supabase
    const [updated] = await db.select().from(ioEmployees).where(eq(ioEmployees.ohr_id, ohr_id));
    if (updated) syncEmployeesToSupabase([updated]).catch(() => {});
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] employees PATCH error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/employees - create a new employee
// Auto-generates attendance rows for the remainder of the current month
// through end of month when the employee is non-Manager and non-Inactive.
router.post("/employees", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    await db.insert(ioEmployees).values(req.body);
    // Fire-and-forget: mirror new employee to Supabase
    syncEmployeesToSupabase([req.body]).catch(() => {});

    // --- Auto-generate attendance rows for new non-Manager, non-Inactive employees ---
    const emp = req.body;
    const role = emp.actual_role || '';
    const status = emp.srt_status || '';
    const EXEMPT_ROLES = ['Manager'];
    const INACTIVE_STATUSES = ['Inactive', 'Exit'];

    if (!EXEMPT_ROLES.includes(role) && !INACTIVE_STATUSES.includes(status) && emp.ohr_id) {
      try {
        // Determine date range: today through end of current month
        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        const year = now.getFullYear();
        const month = now.getMonth(); // 0-indexed
        const lastDay = new Date(year, month + 1, 0).getDate();
        const endStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        // Check which dates already exist for this employee
        const existing = await db.select({ log_date: ioAttendance.log_date })
          .from(ioAttendance)
          .where(and(
            eq(ioAttendance.ohr_id, emp.ohr_id),
            gte(ioAttendance.log_date, todayStr),
            lte(ioAttendance.log_date, endStr)
          ));
        const existingDates = new Set(existing.map(r => r.log_date));

        // Build rows for missing dates
        const rows: any[] = [];
        for (let d = new Date(todayStr + 'T00:00:00Z'); d.toISOString().slice(0, 10) <= endStr; d.setUTCDate(d.getUTCDate() + 1)) {
          const dateStr = d.toISOString().slice(0, 10);
          if (existingDates.has(dateStr)) continue;
          rows.push({
            id: crypto.randomBytes(8).toString('hex'),
            ohr_id: emp.ohr_id,
            log_date: dateStr,
            created_at: now.toISOString(),
            snap_full_name: emp.full_name || '',
            snap_supervisor: emp.supervisor_name || emp.sup_name || '',
            snap_planning_group: emp.planning_group || '',
            snap_shift_time: emp.shift_time || '',
            snap_actual_role: role,
            snap_billing_name: emp.billing_name || '',
            snap_status: status,
          });
        }

        if (rows.length > 0) {
          // Batch insert in chunks of 50 to avoid query size limits
          for (let i = 0; i < rows.length; i += 50) {
            await db.insert(ioAttendance).values(rows.slice(i, i + 50));
          }
          console.log(`[IO API] Auto-generated ${rows.length} attendance rows for new employee ${emp.ohr_id} (${todayStr} → ${endStr})`);
        }
      } catch (attErr: any) {
        // Non-fatal: employee was created, attendance generation failed
        console.error(`[IO API] Auto-attendance generation failed for ${emp.ohr_id}:`, attErr.message);
      }
    }

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
    // Fire-and-forget: mirror deletion to Supabase
    deleteEmployeesFromSupabase([req.params.ohr_id]).catch(() => {});
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
            agent_in, flm_in, planning_group_in,
            status_in, shift_time_in, role_in, wfm_tag_in, blanks_only,
            // Server-side sort & pagination
            sort_by, sort_dir, paginated, exclude_managers, slim } = req.query;

    const conditions: any[] = [];
    // Exclude Managers from attendance results (Batch 124) — uses cached set instead of correlated subquery
    if (exclude_managers === 'true') {
      const mgrSet = await getManagerOhrSet();
      if (mgrSet.size > 0) {
        const mgrArr = Array.from(mgrSet);
        conditions.push(sql`${ioAttendance.ohr_id} NOT IN (${sql.join(mgrArr.map(o => sql`${o}`), sql`, `)})`);
      }
    }
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
    if (status_in) conditions.push(inArray(ioAttendance.snap_status, String(status_in).split("|")));
    if (shift_time_in) conditions.push(inArray(ioAttendance.snap_shift_time, String(shift_time_in).split("|")));
    if (role_in) conditions.push(inArray(ioAttendance.snap_actual_role, String(role_in).split("|")));
    if (wfm_tag_in) conditions.push(inArray(ioAttendance.wfm_tag, String(wfm_tag_in).split("|")));
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
        tag: ioAttendance.tag,
        actualPlanningGroup: ioAttendance.snap_planning_group,
        shiftTime: ioAttendance.snap_shift_time, role: ioAttendance.snap_actual_role,
        status: ioAttendance.snap_status,
      };
      const col = sortColMap[String(sort_by || 'log_date')] || ioAttendance.log_date;
      const dir = String(sort_dir || 'asc').toLowerCase() === 'desc' ? desc : asc;

      // Slim projection: return only columns needed by Input Portal normalizeRecord
      const slimSelect = slim === "true" ? {
        id: ioAttendance.id,
        ohr_id: ioAttendance.ohr_id,
        log_date: ioAttendance.log_date,
        tag: ioAttendance.tag,
        upl_reason: ioAttendance.upl_reason,
        remarks: ioAttendance.remarks,
        ot_hours: ioAttendance.ot_hours,
        snap_full_name: ioAttendance.snap_full_name,
        snap_supervisor: ioAttendance.snap_supervisor,
        snap_planning_group: ioAttendance.snap_planning_group,
        snap_shift_time: ioAttendance.snap_shift_time,
        snap_actual_role: ioAttendance.snap_actual_role,
        snap_status: ioAttendance.snap_status,
        is_locked: ioAttendance.is_locked,
        role: ioAttendance.role,
        planning_group: ioAttendance.planning_group,
        internal_role: ioAttendance.internal_role,
        internal_planning_group: ioAttendance.internal_planning_group,
        wfm_tag: ioAttendance.wfm_tag,
      } : undefined;

      let q = slimSelect
        ? db.select(slimSelect).from(ioAttendance)
        : db.select().from(ioAttendance);
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

// POST /api/io/attendance/bulk-import - bulk create/update attendance records (admin only)
router.post("/attendance/bulk-import", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const actorOhr = req.headers["x-actor-ohr"] as string || "";
    if (!ADMIN_OHRS.includes(actorOhr)) {
      return res.status(403).json({ error: "Admin only" });
    }

    const { updates, creates } = req.body;
    // updates: [{id, tag?, is_locked?, locked_at?}, ...]
    // creates: [{id, ohr_id, log_date, tag, created_at, snap_*, is_locked, locked_at}, ...]

    let updatedCount = 0;
    let createdCount = 0;
    const errors: string[] = [];
    const now = new Date().toISOString();

    // Process updates in batches
    if (updates && Array.isArray(updates)) {
      for (const u of updates) {
        try {
          const setObj: any = {};
          if (u.tag !== undefined) setObj.tag = u.tag;
          if (u.is_locked !== undefined) setObj.is_locked = u.is_locked;
          if (u.locked_at !== undefined) setObj.locked_at = u.locked_at;
          await db.update(ioAttendance).set(setObj).where(eq(ioAttendance.id, u.id));
          updatedCount++;
        } catch (e: any) {
          errors.push(`update ${u.id}: ${e.message}`);
        }
      }
    }

    // Process creates
    if (creates && Array.isArray(creates)) {
      for (const c of creates) {
        try {
          await db.insert(ioAttendance).values(c);
          createdCount++;
        } catch (e: any) {
          errors.push(`create ${c.ohr_id}_${c.log_date}: ${e.message}`);
        }
      }
    }

    res.json({ ok: true, updatedCount, createdCount, errors: errors.slice(0, 20), totalErrors: errors.length });
  } catch (err: any) {
    console.error("[IO API] attendance bulk-import error:", err);
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

    // Date-based lock enforcement: yesterday and earlier locked after 11 AM PHT (except admin)
    // Note: is_locked field enforcement removed (Batch 124). Only date-based + OT mechanism locks remain.
    // Exception: OT-only edits are allowed on past dates within the current operational week (Sat-Fri)
    if (!ADMIN_OHRS.includes(actorOhr)) {
      const now = new Date();
      const phtTime = new Date(now.getTime() + 8 * 60 * 60000);
      const phtHour = phtTime.getUTCHours();
      const todayPHT = phtTime.toISOString().slice(0, 10);
      const yesterdayD = new Date(phtTime);
      yesterdayD.setUTCDate(yesterdayD.getUTCDate() - 1);
      const yesterdayPHT = yesterdayD.toISOString().slice(0, 10);
      const recordDate = current.log_date || '';

      // Check if this is an OT-only edit within the current operational week
      const isOtOnlyEdit = Object.keys(updates).length === 1 && updates.ot_hours !== undefined;
      const phtDay = phtTime.getUTCDay(); // 0=Sun
      const daysToFri = (5 - phtDay + 7) % 7;
      const weFri = new Date(phtTime);
      weFri.setUTCDate(weFri.getUTCDate() + daysToFri);
      const weStart = new Date(weFri);
      weStart.setUTCDate(weStart.getUTCDate() - 6); // Saturday
      const weStartStr = weStart.toISOString().slice(0, 10);
      const weEndStr = weFri.toISOString().slice(0, 10);
      const inCurrentWeek = recordDate >= weStartStr && recordDate <= weEndStr;

      // Allow OT-only edits on past dates within current week (bypass date lock)
      const bypassDateLock = isOtOnlyEdit && inCurrentWeek;

      if (!bypassDateLock) {
        // Dates before yesterday are always locked
        if (recordDate < yesterdayPHT) {
          return res.status(403).json({ error: "Date-based lock: past dates locked for editing" });
        }
        // Yesterday is locked after 11 AM PHT
        if (recordDate === yesterdayPHT && phtHour >= 11) {
          return res.status(403).json({ error: "Date-based lock: previous day locked after 11 AM PHT" });
        }
      }
    }

    // OT mechanism lock removed — OT is now managed via Input Portal for all PGs

    // Build audit entries for each changed field
    const now = new Date().toISOString();
    const fieldMap: Record<string, string> = {
      tag: "tag", upl_reason: "upl_reason", remarks: "remarks",
      ot_hours: "ot_hours",
      role: "role", planning_group: "planning_group",
      snap_status: "snap_status"
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

    // Notify owner when status is changed (fire-and-forget)
    const statusAudit = auditEntries.find(e => e.field_name === "snap_status");
    if (statusAudit) {
      const empName = current.snap_full_name || current.ohr_id || recordId;
      const logDate = current.log_date || "unknown date";
      notifyOwner({
        title: `Status Change: ${empName}`,
        content: `${actorName || actorOhr} changed status of ${empName} (${logDate}) from "${statusAudit.old_value || '—'}" to "${statusAudit.new_value}".`,
      }).catch(err => console.warn("[StatusNotify] Failed:", err.message));
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

    // Server-side dedup: reject if an identical log was created in the last 30 seconds
    // (same coach, coachee, type, and date — prevents double-click duplicates)
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
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    // Route by ID type: pure numeric → match by auto-increment id; otherwise → match by coaching_id
    const isNumericId = /^\d+$/.test(paramId);
    if (isNumericId) {
      await db.update(ioCoaching).set(updates).where(eq(ioCoaching.id, Number(paramId)));
    } else {
      await db.update(ioCoaching).set(updates).where(eq(ioCoaching.coaching_id, paramId));
    }
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] coaching PATCH error:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/io/coaching/:id - delete a coaching log (admin-gated: 740045023, 740044909)
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
    await db.update(ioCoachingNte).set(updates).where(eq(ioCoachingNte.id, nteId));
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] coaching-nte PATCH error:", err);
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

router.delete("/insights/:insight_id", async (req: Request, res: Response) => {
  try {
    // Admin-gated: only admins can delete insights
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

router.post("/insights-bulk-delete", async (req: Request, res: Response) => {
  try {
    // Admin-gated: only admins can bulk-delete insights
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

// ============================================================
// io_leaves
// ============================================================

router.get("/leaves", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { leave_id, status, ohr_id, supervisor, month, limit } = req.query;

    if (leave_id) {
      const rows = await db.select().from(ioLeaves).where(eq(ioLeaves.leave_id, String(leave_id)));
      return res.json(rows);
    }

    const conditions: any[] = [];
    if (status) conditions.push(eq(ioLeaves.status, String(status)));
    if (ohr_id) conditions.push(eq(ioLeaves.ohr_id, String(ohr_id)));
    if (supervisor) conditions.push(eq(ioLeaves.supervisor, String(supervisor)));
    // month filter: YYYY-MM format, matches start_date
    if (month) conditions.push(sql`${ioLeaves.start_date} LIKE ${String(month) + '%'}`);

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const lim = limit ? Number(limit) : 2000;
    const rows = await db.select().from(ioLeaves).where(where).orderBy(desc(sql`created_at`)).limit(lim);
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

    // Notify the FLM (supervisor) about the new leave request
    const leaveData = req.body;
    if (leaveData.supervisor) {
      let supervisorOhr = '';
      const supRows = await db.select({ ohr_id: ioEmployees.ohr_id })
        .from(ioEmployees)
        .where(eq(ioEmployees.full_name, leaveData.supervisor))
        .limit(1);
      if (supRows.length > 0) supervisorOhr = supRows[0].ohr_id;

      if (supervisorOhr) {
        const now = new Date().toISOString();
        await db.insert(ioNotifications).values({
          type: 'haven',
          title: 'New Leave Request',
          message: `${leaveData.full_name || 'An agent'} filed a ${leaveData.leave_type || 'PTO'} leave for ${leaveData.start_date}. Pending your approval.`,
          actor_ohr: leaveData.ohr_id || '',
          actor_name: leaveData.full_name || '',
          target_ohr: supervisorOhr,
          target_role: 'supervisor',
          metadata: JSON.stringify({ leave_id: leaveData.leave_id, employee_ohr: leaveData.ohr_id }),
          is_read: false,
          created_at: now,
        });
      }
    }

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

// Bulk approve/reject leaves
router.post("/leaves/bulk-action", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { leave_ids, action, tier, reviewer_name, rejection_reason } = req.body;
    if (!leave_ids || !Array.isArray(leave_ids) || leave_ids.length === 0) {
      return res.status(400).json({ error: "leave_ids array required" });
    }
    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: "action must be 'approve' or 'reject'" });
    }
    if (!tier || !['tl', 'om'].includes(tier)) {
      return res.status(400).json({ error: "tier must be 'tl' or 'om'" });
    }

    const now = new Date().toISOString();
    let updated = 0;

    for (const lid of leave_ids) {
      const updates: any = { updated_at: now };
      if (action === 'approve') {
        if (tier === 'tl') {
          updates.status = 'Pending OM';
          updates.tl_reviewer = reviewer_name || '';
          updates.tl_review_date = now;
        } else {
          updates.status = 'Approved';
          updates.om_reviewer = reviewer_name || '';
          updates.om_review_date = now;
        }
      } else {
        updates.status = 'Rejected';
        updates.rejection_reason = rejection_reason || '';
        if (tier === 'tl') {
          updates.tl_reviewer = reviewer_name || '';
          updates.tl_review_date = now;
        } else {
          updates.om_reviewer = reviewer_name || '';
          updates.om_review_date = now;
        }
      }

      await db.update(ioLeaves).set(updates).where(eq(ioLeaves.leave_id, String(lid)));
      updated++;
    }

    // Send targeted notifications for leave actions
    const rows = await db.select().from(ioLeaves).where(
      sql`${ioLeaves.leave_id} IN (${sql.join(leave_ids.map((id: string) => sql`${id}`), sql`, `)})`
    );
    for (const lv of rows) {
      // Look up supervisor OHR from io_employees by supervisor name
      let supervisorOhr = '';
      if (lv.supervisor) {
        const supRows = await db.select({ ohr_id: ioEmployees.ohr_id })
          .from(ioEmployees)
          .where(eq(ioEmployees.full_name, lv.supervisor))
          .limit(1);
        if (supRows.length > 0) supervisorOhr = supRows[0].ohr_id;
      }

      if (tier === 'tl') {
        // FLM approval/rejection: notify agent + FLM only
        const statusLabel = action === 'approve' ? 'forwarded to OM for final approval' : 'rejected';
        // Notify the agent
        await db.insert(ioNotifications).values({
          type: 'haven',
          title: action === 'approve' ? 'Leave Forwarded to OM' : 'Leave Rejected',
          message: action === 'approve'
            ? `Your leave on ${lv.start_date} has been approved by your supervisor and forwarded to the Operations Manager.`
            : `Your leave on ${lv.start_date} has been rejected by ${reviewer_name}.${rejection_reason ? ' Reason: ' + rejection_reason : ''}`,
          actor_ohr: supervisorOhr,
          actor_name: reviewer_name || '',
          target_ohr: lv.ohr_id || '',
          target_role: 'agent',
          metadata: JSON.stringify({ leave_id: lv.leave_id }),
          is_read: false,
          created_at: now,
        });
        // Notify the FLM (supervisor) — confirmation of their own action
        if (supervisorOhr && supervisorOhr !== lv.ohr_id) {
          await db.insert(ioNotifications).values({
            type: 'haven',
            title: action === 'approve' ? 'Leave Forwarded to OM' : 'Leave Rejected (FLM)',
            message: `${lv.full_name}'s leave on ${lv.start_date} has been ${statusLabel}.`,
            actor_ohr: supervisorOhr,
            actor_name: reviewer_name || '',
            target_ohr: supervisorOhr,
            target_role: 'supervisor',
            metadata: JSON.stringify({ leave_id: lv.leave_id, employee_ohr: lv.ohr_id }),
            is_read: false,
            created_at: now,
          });
        }
      } else {
        // OM approval/rejection: notify agent + FLM only
        // Notify the agent
        await db.insert(ioNotifications).values({
          type: 'haven',
          title: action === 'approve' ? 'Leave Approved' : 'Leave Rejected',
          message: action === 'approve'
            ? `Your leave on ${lv.start_date} has been approved by ${reviewer_name}.`
            : `Your leave on ${lv.start_date} has been rejected by ${reviewer_name}.${rejection_reason ? ' Reason: ' + rejection_reason : ''}`,
          actor_ohr: '',
          actor_name: reviewer_name || '',
          target_ohr: lv.ohr_id || '',
          target_role: 'agent',
          metadata: JSON.stringify({ leave_id: lv.leave_id }),
          is_read: false,
          created_at: now,
        });
        // Notify the FLM (supervisor) using their OHR
        if (supervisorOhr) {
          await db.insert(ioNotifications).values({
            type: 'haven',
            title: action === 'approve' ? 'Leave Approved (OM)' : 'Leave Rejected (OM)',
            message: `${lv.full_name}'s leave on ${lv.start_date} was ${action === 'approve' ? 'approved' : 'rejected'} by ${reviewer_name}.`,
            actor_ohr: '',
            actor_name: reviewer_name || '',
            target_ohr: supervisorOhr,
            target_role: 'supervisor',
            metadata: JSON.stringify({ leave_id: lv.leave_id, employee_ohr: lv.ohr_id }),
            is_read: false,
            created_at: now,
          });
        }
      }
    }

    res.json({ ok: true, updated });
  } catch (err: any) {
    console.error("[IO API] leaves bulk-action error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Cancel a leave (agent self-cancel)
router.post("/leaves/:leave_id/cancel", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { leave_id } = req.params;
    const rows = await db.select().from(ioLeaves).where(eq(ioLeaves.leave_id, leave_id));
    if (rows.length === 0) return res.status(404).json({ error: "Leave not found" });

    const lv = rows[0];
    // Allow cancelling Pending TL (agents) or Pending OM (Team Leads who skip TL tier)
    if (lv.status !== 'Pending TL' && lv.status !== 'Pending OM') {
      return res.status(400).json({ error: "Can only cancel leaves with Pending TL or Pending OM status" });
    }

    const now = new Date().toISOString();
    await db.update(ioLeaves).set({
      status: 'Cancelled',
      cancelled_at: now,
      updated_at: now,
    }).where(eq(ioLeaves.leave_id, leave_id));

    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] leaves cancel error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Admin delete leave (any status)
router.delete("/leaves/:leave_id", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });
    const { leave_id } = req.params;
    await db.delete(ioLeaves).where(eq(ioLeaves.leave_id, leave_id));
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] leaves DELETE error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/io/leaves/shrinkage-forecast - compute PL% for a leave's planning group + role combo
router.get("/leaves/shrinkage-forecast", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });
    const { ohr_id, start_date } = req.query;
    if (!ohr_id || !start_date) return res.status(400).json({ error: "ohr_id and start_date required" });

    // 1. Get the employee's CURRENT role and planning_group
    const empRows = await db.select({
      actual_role: ioEmployees.actual_role,
      planning_group: ioEmployees.planning_group,
    }).from(ioEmployees).where(eq(ioEmployees.ohr_id, ohr_id as string)).limit(1);
    if (empRows.length === 0) return res.status(404).json({ error: "Employee not found" });
    const { actual_role, planning_group } = empRows[0];
    if (!actual_role || !planning_group) return res.json({ error: "Employee missing role or planning_group", headcount: 0, leaves: 0, pl_pct: 0 });
    // Trainers and Team Leads are excluded from shrinkage forecast
    if (actual_role === 'Trainer' || actual_role === 'Team Lead') return res.json({ skip: true, reason: `${actual_role}s are excluded from shrinkage forecast`, actual_role, planning_group, headcount: 0, leave_count: 0, pl_pct: 0 });

    // 2. Count all Active employees with same role + planning_group combo (headcount)
    const hcRows = await db.select({ cnt: count() })
      .from(ioEmployees)
      .where(and(
        eq(ioEmployees.actual_role, actual_role),
        eq(ioEmployees.planning_group, planning_group),
        eq(ioEmployees.employement_status, 'Active')
      ));
    const headcount = hcRows[0]?.cnt || 0;

    // 3. Compute the Sat-Fri week containing start_date
    const d = new Date(start_date as string + 'T00:00:00Z');
    const dayOfWeek = d.getUTCDay(); // 0=Sun, 6=Sat
    // Saturday = start of week. Days since Saturday: Sun=1, Mon=2, ..., Fri=6, Sat=0
    const daysSinceSat = dayOfWeek === 6 ? 0 : dayOfWeek + 1;
    const weekStart = new Date(d);
    weekStart.setUTCDate(d.getUTCDate() - daysSinceSat);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
    const weekStartStr = weekStart.toISOString().slice(0, 10);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);

    // 4. Count approved leaves (status='Approved' or 'Pending OM') for same combo in that week
    //    Join with io_employees to get CURRENT role+planning_group for each leave's employee
    const leaveRows = await db.select({
      leave_id: ioLeaves.leave_id,
      ohr_id: ioLeaves.ohr_id,
      full_name: ioLeaves.full_name,
      start_date: ioLeaves.start_date,
      status: ioLeaves.status,
    }).from(ioLeaves)
      .innerJoin(ioEmployees, eq(ioLeaves.ohr_id, ioEmployees.ohr_id))
      .where(and(
        or(eq(ioLeaves.status, 'Approved'), eq(ioLeaves.status, 'Pending OM')),
        gte(ioLeaves.start_date, weekStartStr),
        lte(ioLeaves.start_date, weekEndStr),
        eq(ioEmployees.actual_role, actual_role),
        eq(ioEmployees.planning_group, planning_group)
      ));

    const leaveCount = leaveRows.length;
    const plPct = headcount > 0 ? ((leaveCount / headcount) * 100) : 0;

    // 5. Return the forecast data
    res.json({
      planning_group,
      actual_role,
      headcount,
      leave_count: leaveCount,
      pl_pct: Math.round(plPct * 100) / 100,
      week_start: weekStartStr,
      week_end: weekEndStr,
      threshold: 5,
      leaves_detail: leaveRows.map(l => ({ leave_id: l.leave_id, ohr_id: l.ohr_id, full_name: l.full_name, start_date: l.start_date, status: l.status })),
    });
  } catch (err: any) {
    console.error("[IO API] shrinkage-forecast error:", err);
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
    if (tag === undefined || tag === null) return res.status(400).json({ error: "tag is required" });
    // tag === '' is valid (clearing the tag)

    const now = new Date().toISOString();
    let updated = 0;
    let locked = 0;

    for (const id of ids) {
      const [record] = await db.select().from(ioAttendance).where(eq(ioAttendance.id, id)).limit(1);
      if (!record) continue;

      // Date-based lock: yesterday and earlier locked after 11 AM PHT (except admin)
      // Note: is_locked enforcement removed (Batch 124)
      if (!ADMIN_OHRS.includes(actor_ohr)) {
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

// POST /api/io/attendance/bulk-tag-filtered - bulk tag ALL records matching current filters
router.post("/attendance/bulk-tag-filtered", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { tag, actor_ohr, actor_name, filters } = req.body;
    if (tag === undefined || tag === null) return res.status(400).json({ error: "tag is required" });
    if (!filters) return res.status(400).json({ error: "filters object is required" });

    const { log_date_gte, log_date_lte, tag_in, agent_in, flm_in,
            planning_group_in, status_in, shift_time_in, role_in, wfm_tag_in, blanks_only } = filters;

    const conditions: any[] = [];
    // Exclude Managers — uses cached set
    const mgrSet2 = await getManagerOhrSet();
    if (mgrSet2.size > 0) {
      const mgrArr2 = Array.from(mgrSet2);
      conditions.push(sql`${ioAttendance.ohr_id} NOT IN (${sql.join(mgrArr2.map(o => sql`${o}`), sql`, `)})`);
    }
    if (log_date_gte) conditions.push(gte(ioAttendance.log_date, String(log_date_gte)));
    if (log_date_lte) conditions.push(lte(ioAttendance.log_date, String(log_date_lte)));
    if (tag_in) conditions.push(inArray(ioAttendance.tag, String(tag_in).split("|")));
    if (agent_in) conditions.push(inArray(ioAttendance.snap_full_name, String(agent_in).split("|")));
    if (flm_in) conditions.push(inArray(ioAttendance.snap_supervisor, String(flm_in).split("|")));
    if (planning_group_in) conditions.push(inArray(ioAttendance.snap_planning_group, String(planning_group_in).split("|")));
    if (status_in) conditions.push(inArray(ioAttendance.snap_status, String(status_in).split("|")));
    if (shift_time_in) conditions.push(inArray(ioAttendance.snap_shift_time, String(shift_time_in).split("|")));
    if (role_in) conditions.push(inArray(ioAttendance.snap_actual_role, String(role_in).split("|")));
    if (wfm_tag_in) conditions.push(inArray(ioAttendance.wfm_tag, String(wfm_tag_in).split("|")));
    if (blanks_only) {
      conditions.push(or(
        sql`${ioAttendance.tag} IS NULL`,
        eq(ioAttendance.tag, ""),
        eq(ioAttendance.tag, "\u2014")
      ));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Fetch all matching record IDs and their current tags + dates
    let q = db.select({
      id: ioAttendance.id,
      tag: ioAttendance.tag,
      log_date: ioAttendance.log_date,
    }).from(ioAttendance);
    if (where) q = q.where(where) as any;
    const allRecords = await q;

    const now = new Date().toISOString();
    let updated = 0;
    let locked = 0;
    let skipped = 0;

    for (const record of allRecords) {
      // Date-based lock (except admin)
      if (!ADMIN_OHRS.includes(actor_ohr)) {
        const nowD = new Date();
        const phtD = new Date(nowD.getTime() + 8 * 60 * 60000);
        const phtHourD = phtD.getUTCHours();
        const yesterdayBulk = new Date(phtD);
        yesterdayBulk.setUTCDate(yesterdayBulk.getUTCDate() - 1);
        const yesterdayStr = yesterdayBulk.toISOString().slice(0, 10);
        const recDate = record.log_date || '';
        if (recDate < yesterdayStr) { locked++; continue; }
        if (recDate === yesterdayStr && phtHourD >= 11) { locked++; continue; }
      }

      const oldTag = record.tag || "";
      if (oldTag === tag) { skipped++; continue; }

      await db.update(ioAttendance).set({ tag }).where(eq(ioAttendance.id, record.id));

      // Audit log
      await db.insert(ioAuditLog).values({
        record_type: "attendance",
        record_id: record.id,
        action: "bulk_tag_filtered",
        field_name: "tag",
        old_value: oldTag,
        new_value: tag,
        actor_ohr: actor_ohr || "",
        actor_name: actor_name || "",
        timestamp: now,
      });
      updated++;
    }

    res.json({ ok: true, updated, locked, skipped, total: allRecords.length });
  } catch (err: any) {
    console.error("[IO API] attendance bulk-tag-filtered error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/attendance/bulk-status - bulk update status for selected record IDs (Managers/Admins only)
router.post("/attendance/bulk-status", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { ids, status, actor_ohr, actor_name } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids array is required" });
    }
    if (!status) return res.status(400).json({ error: "status is required" });

    // Role gate: Managers and Admins only
    if (!ADMIN_OHRS.includes(actor_ohr)) {
      // Check if actor is a Manager via employee record
      const [actor] = await db.select({ role: ioEmployees.actual_role })
        .from(ioEmployees).where(eq(ioEmployees.ohr_id, actor_ohr)).limit(1);
      if (!actor || actor.role !== "Manager") {
        return res.status(403).json({ error: "Only Managers and Admins can bulk-update status" });
      }
    }

    const now = new Date().toISOString();
    let updated = 0;
    let locked = 0;
    let skipped = 0;
    const changedNames: string[] = [];

    for (const id of ids) {
      const [record] = await db.select().from(ioAttendance).where(eq(ioAttendance.id, id)).limit(1);
      if (!record) continue;

      // Date-based lock (except admin)
      if (!ADMIN_OHRS.includes(actor_ohr)) {
        const nowD = new Date();
        const phtD = new Date(nowD.getTime() + 8 * 60 * 60000);
        const phtHourD = phtD.getUTCHours();
        const yesterdayBulk = new Date(phtD);
        yesterdayBulk.setUTCDate(yesterdayBulk.getUTCDate() - 1);
        const yesterdayStr = yesterdayBulk.toISOString().slice(0, 10);
        const recDate = record.log_date || '';
        if (recDate < yesterdayStr) { locked++; continue; }
        if (recDate === yesterdayStr && phtHourD >= 11) { locked++; continue; }
      }

      const oldStatus = record.snap_status || "";
      if (oldStatus === status) { skipped++; continue; }

      await db.update(ioAttendance).set({ snap_status: status }).where(eq(ioAttendance.id, id));

      await db.insert(ioAuditLog).values({
        record_type: "attendance",
        record_id: id,
        action: "bulk_status",
        field_name: "snap_status",
        old_value: oldStatus,
        new_value: status,
        actor_ohr: actor_ohr || "",
        actor_name: actor_name || "",
        timestamp: now,
      });
      if (changedNames.length < 5) changedNames.push(record.snap_full_name || record.ohr_id || id);
      updated++;
    }

    // Notify owner of bulk status change
    if (updated > 0) {
      const preview = changedNames.join(", ") + (updated > 5 ? ` and ${updated - 5} more` : "");
      notifyOwner({
        title: `Bulk Status Change: ${updated} record(s) → ${status}`,
        content: `${actor_name || actor_ohr} changed ${updated} record(s) to "${status}". Affected: ${preview}.${locked > 0 ? ` ${locked} locked rows skipped.` : ""}`,
      }).catch(err => console.warn("[BulkStatusNotify] Failed:", err.message));
    }

    res.json({ ok: true, updated, locked, skipped, total: ids.length });
  } catch (err: any) {
    console.error("[IO API] attendance bulk-status error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/attendance/bulk-status-filtered - bulk update status for ALL records matching filters (Managers/Admins only)
router.post("/attendance/bulk-status-filtered", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { status, actor_ohr, actor_name, filters } = req.body;
    if (!status) return res.status(400).json({ error: "status is required" });
    if (!filters) return res.status(400).json({ error: "filters object is required" });

    // Role gate: Managers and Admins only
    if (!ADMIN_OHRS.includes(actor_ohr)) {
      const [actor] = await db.select({ role: ioEmployees.actual_role })
        .from(ioEmployees).where(eq(ioEmployees.ohr_id, actor_ohr)).limit(1);
      if (!actor || actor.role !== "Manager") {
        return res.status(403).json({ error: "Only Managers and Admins can bulk-update status" });
      }
    }

    const { log_date_gte, log_date_lte, tag_in, agent_in, flm_in,
            planning_group_in, status_in, shift_time_in, role_in, wfm_tag_in, blanks_only } = filters;

    const conditions: any[] = [];
    const mgrSet3 = await getManagerOhrSet();
    if (mgrSet3.size > 0) {
      const mgrArr3 = Array.from(mgrSet3);
      conditions.push(sql`${ioAttendance.ohr_id} NOT IN (${sql.join(mgrArr3.map(o => sql`${o}`), sql`, `)})`);
    }
    if (log_date_gte) conditions.push(gte(ioAttendance.log_date, String(log_date_gte)));
    if (log_date_lte) conditions.push(lte(ioAttendance.log_date, String(log_date_lte)));
    if (tag_in) conditions.push(inArray(ioAttendance.tag, String(tag_in).split("|")));
    if (agent_in) conditions.push(inArray(ioAttendance.snap_full_name, String(agent_in).split("|")));
    if (flm_in) conditions.push(inArray(ioAttendance.snap_supervisor, String(flm_in).split("|")));
    if (planning_group_in) conditions.push(inArray(ioAttendance.snap_planning_group, String(planning_group_in).split("|")));
    if (status_in) conditions.push(inArray(ioAttendance.snap_status, String(status_in).split("|")));
    if (shift_time_in) conditions.push(inArray(ioAttendance.snap_shift_time, String(shift_time_in).split("|")));
    if (role_in) conditions.push(inArray(ioAttendance.snap_actual_role, String(role_in).split("|")));
    if (wfm_tag_in) conditions.push(inArray(ioAttendance.wfm_tag, String(wfm_tag_in).split("|")));
    if (blanks_only) {
      conditions.push(or(
        sql`${ioAttendance.tag} IS NULL`,
        eq(ioAttendance.tag, ""),
        eq(ioAttendance.tag, "\u2014")
      ));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    let q = db.select({
      id: ioAttendance.id,
      snap_status: ioAttendance.snap_status,
      snap_full_name: ioAttendance.snap_full_name,
      ohr_id: ioAttendance.ohr_id,
      log_date: ioAttendance.log_date,
    }).from(ioAttendance);
    if (where) q = q.where(where) as any;
    const allRecords = await q;

    const now = new Date().toISOString();
    let updated = 0;
    let locked = 0;
    let skipped = 0;
    const changedNames: string[] = [];

    for (const record of allRecords) {
      if (!ADMIN_OHRS.includes(actor_ohr)) {
        const nowD = new Date();
        const phtD = new Date(nowD.getTime() + 8 * 60 * 60000);
        const phtHourD = phtD.getUTCHours();
        const yesterdayBulk = new Date(phtD);
        yesterdayBulk.setUTCDate(yesterdayBulk.getUTCDate() - 1);
        const yesterdayStr = yesterdayBulk.toISOString().slice(0, 10);
        const recDate = record.log_date || '';
        if (recDate < yesterdayStr) { locked++; continue; }
        if (recDate === yesterdayStr && phtHourD >= 11) { locked++; continue; }
      }

      const oldStatus = record.snap_status || "";
      if (oldStatus === status) { skipped++; continue; }

      await db.update(ioAttendance).set({ snap_status: status }).where(eq(ioAttendance.id, record.id));

      await db.insert(ioAuditLog).values({
        record_type: "attendance",
        record_id: record.id,
        action: "bulk_status_filtered",
        field_name: "snap_status",
        old_value: oldStatus,
        new_value: status,
        actor_ohr: actor_ohr || "",
        actor_name: actor_name || "",
        timestamp: now,
      });
      if (changedNames.length < 5) changedNames.push(record.snap_full_name || record.ohr_id || record.id);
      updated++;
    }

    if (updated > 0) {
      const preview = changedNames.join(", ") + (updated > 5 ? ` and ${updated - 5} more` : "");
      notifyOwner({
        title: `Bulk Status Change: ${updated} record(s) → ${status}`,
        content: `${actor_name || actor_ohr} changed ${updated} record(s) to "${status}" (filtered). Affected: ${preview}.${locked > 0 ? ` ${locked} locked rows skipped.` : ""}`,
      }).catch(err => console.warn("[BulkStatusFilteredNotify] Failed:", err.message));
    }

    res.json({ ok: true, updated, locked, skipped, total: allRecords.length });
  } catch (err: any) {
    console.error("[IO API] attendance bulk-status-filtered error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Helm — Tasks CRUD
// =============================================================

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
    const folder = req.body.folder || 'coaching-disputes';
    const key = `${folder}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const result = await storagePut(key, buffer, contentType || "application/octet-stream");
    res.json({ ok: true, url: result.url, key: result.key });
  } catch (err: any) {
    console.error("[IO API] upload error:", err);
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
    const {
      startDate, endDate, format,
      log_date_gte, log_date_lte,
      tag_in, agent_in, flm_in, planning_group_in,
      status_in, shift_time_in, role_in, wfm_tag_in, blanks_only,
      sort_by, sort_dir, exclude_managers,
    } = req.query;
    const conditions: any[] = [];
    // Exclude managers if requested — uses cached set
    if (exclude_managers === 'true') {
      const mgrSet3 = await getManagerOhrSet();
      if (mgrSet3.size > 0) {
        const mgrArr3 = Array.from(mgrSet3);
        conditions.push(sql`${ioAttendance.ohr_id} NOT IN (${sql.join(mgrArr3.map(o => sql`${o}`), sql`, `)})`);
      }
    }
    // Date range (support both legacy and new param names)
    const gteDate = startDate || log_date_gte;
    const lteDate = endDate || log_date_lte;
    if (gteDate) conditions.push(gte(ioAttendance.log_date, String(gteDate)));
    if (lteDate) conditions.push(lte(ioAttendance.log_date, String(lteDate)));
    // Multi-value filters (pipe-delimited)
    if (tag_in) conditions.push(inArray(ioAttendance.tag, String(tag_in).split("|")));
    if (agent_in) conditions.push(inArray(ioAttendance.snap_full_name, String(agent_in).split("|")));
    if (flm_in) conditions.push(inArray(ioAttendance.snap_supervisor, String(flm_in).split("|")));
    if (planning_group_in) conditions.push(inArray(ioAttendance.snap_planning_group, String(planning_group_in).split("|")));
    if (status_in) conditions.push(inArray(ioAttendance.snap_status, String(status_in).split("|")));
    if (shift_time_in) conditions.push(inArray(ioAttendance.snap_shift_time, String(shift_time_in).split("|")));
    if (role_in) conditions.push(inArray(ioAttendance.snap_actual_role, String(role_in).split("|")));
    if (wfm_tag_in) conditions.push(inArray(ioAttendance.wfm_tag, String(wfm_tag_in).split("|")));
    if (blanks_only === "true") {
      conditions.push(or(
        sql`${ioAttendance.tag} IS NULL`,
        eq(ioAttendance.tag, ""),
        eq(ioAttendance.tag, "\u2014")
      ));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    // Dynamic sort
    const sortColMap: Record<string, any> = {
      date: ioAttendance.log_date, log_date: ioAttendance.log_date,
      agent: ioAttendance.snap_full_name, flm: ioAttendance.snap_supervisor,
      tag: ioAttendance.tag,
      actualPlanningGroup: ioAttendance.snap_planning_group,
      shiftTime: ioAttendance.snap_shift_time, role: ioAttendance.snap_actual_role,
      status: ioAttendance.snap_status,
    };
    const col = sortColMap[String(sort_by || 'log_date')] || ioAttendance.log_date;
    const dirFn = String(sort_dir || 'asc').toLowerCase() === 'desc' ? desc : asc;
    // Fetch ALL matching rows (no limit)
    let query = db.select().from(ioAttendance);
    if (where) query = query.where(where) as any;
    const rows = await (query as any).orderBy(dirFn(col), asc(ioAttendance.ohr_id));
    if (format === "json") {
      return res.json({ rows, total: rows.length });
    }
    // CSV with user-friendly column headers
    const csvColumns = [
      { key: "log_date", label: "Date" },
      { key: "ohr_id", label: "OHR" },
      { key: "snap_full_name", label: "Agent" },
      { key: "snap_supervisor", label: "FLM" },
      { key: "snap_actual_role", label: "Role" },
      { key: "snap_planning_group", label: "Planning Group" },
      { key: "snap_shift_time", label: "Shift" },
      { key: "snap_status", label: "Status" },
      { key: "tag", label: "Tag" },
      { key: "upl_reason", label: "UPL Reason" },
      { key: "remarks", label: "Remarks" },
      { key: "ot_hours", label: "OT Hours" },
      { key: "snap_billing_name", label: "Billing" },
      { key: "is_locked", label: "Locked" },
    ];
    const escapeCsv = (val: any): string => {
      if (val === null || val === undefined) return "";
      const str = String(val);
      if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };
    let csv = csvColumns.map(c => escapeCsv(c.label)).join(",") + "\n";
    for (const row of rows) {
      csv += csvColumns.map(c => escapeCsv((row as any)[c.key])).join(",") + "\n";
    }
    const today = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="playbook_export_${today}.csv"`);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(csv);
  } catch (err: any) {
    console.error("[IO API] attendance export error:", err);
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

// OT Request & Approval System — REMOVED (OT now managed via Input Portal)

// [OT routes removed - block 1/7]

// ===================== PRODUCTIVITY HOURS =====================

// GET /productivity-hours — get productivity data for a date range
router.get("/productivity-hours", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: "start and end query params required" });
    const rows: any = await db.execute(
      sql`SELECT ph.*, e.full_name, e.planning_group FROM io_productivity_hours ph LEFT JOIN io_employees e ON ph.ohr = e.ohr_id WHERE ph.date >= ${String(start)} AND ph.date <= ${String(end)} ORDER BY e.full_name, ph.date`
    );
    const data = Array.isArray(rows[0]) ? rows[0] : rows;
    res.json(data);
  } catch (err: any) {
    console.error("[IO API] productivity-hours GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /productivity-hours/upload — bulk upsert productivity data
router.post("/productivity-hours/upload", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const { records } = req.body;
    if (!Array.isArray(records) || records.length === 0) return res.status(400).json({ error: "No records provided" });
    let inserted = 0;
    let updated = 0;
    for (const r of records) {
      const result: any = await db.execute(
        sql`INSERT INTO io_productivity_hours (date, ohr, actual_projection, available, non_srt_production, fb_training, onboarding, coaching, wellness_support, team_meeting, total_billable, delivered_hours)
            VALUES (${r.date}, ${String(r.ohr)}, ${r.actual_projection || 'Actuals'}, ${r.available || 0}, ${r.non_srt_production || 0}, ${r.fb_training || 0}, ${r.onboarding || 0}, ${r.coaching || 0}, ${r.wellness_support || 0}, ${r.team_meeting || 0}, ${r.total_billable || 0}, ${r.delivered_hours || 0})
            ON DUPLICATE KEY UPDATE
              actual_projection = VALUES(actual_projection),
              available = VALUES(available),
              non_srt_production = VALUES(non_srt_production),
              fb_training = VALUES(fb_training),
              onboarding = VALUES(onboarding),
              coaching = VALUES(coaching),
              wellness_support = VALUES(wellness_support),
              team_meeting = VALUES(team_meeting),
              total_billable = VALUES(total_billable),
              delivered_hours = VALUES(delivered_hours),
              uploaded_at = CURRENT_TIMESTAMP`
      );
      const info = Array.isArray(result[0]) ? result[0] : result;
      if (info.affectedRows === 1) inserted++;
      else if (info.affectedRows === 2) updated++;
    }
    res.json({ success: true, inserted, updated, total: records.length });
  } catch (err: any) {
    console.error("[IO API] productivity-hours upload error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Billing Compliance V2 — SRT Bill Upload
// ============================================================

/**
 * POST /api/io/srt-bill-upload
 * Accepts JSON body: { rows: Array<{date, ohr, srt_id, billing_name, srt_status, role, planning_group}> }
 * Upserts into io_srt_bill by (date, ohr_id).
 * Syncs latest planning_group + role back to io_employees.
 */
router.post("/srt-bill-upload", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const { rows, skipSync } = req.body;
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "rows array is required" });
    }
    const now = new Date().toISOString();
    let totalAffected = 0;

    // Bulk upsert using multi-row INSERT with raw SQL for performance
    // Process in chunks of 500 rows per SQL statement
    const BULK_SIZE = 500;
    for (let i = 0; i < rows.length; i += BULK_SIZE) {
      const chunk = rows.slice(i, i + BULK_SIZE);
      const validRows: string[][] = [];
      for (const r of chunk) {
        const dateStr = String(r.date || '').trim();
        const ohrStr = String(r.ohr || '').trim();
        if (!dateStr || !ohrStr) continue;
        const normalizedPg = normalizePg(String(r.planning_group || '').trim());
        validRows.push([
          dateStr, ohrStr,
          String(r.srt_id || '').trim(),
          String(r.billing_name || '').trim(),
          String(r.srt_status || '').trim(),
          String(r.role || '').trim(),
          normalizedPg,
          now
        ]);
      }
      if (validRows.length === 0) continue;

      // Build bulk INSERT using drizzle sql tagged template with sql.join
      const valueSets = validRows.map(r =>
        sql`(${r[0]}, ${r[1]}, ${r[2]}, ${r[3]}, ${r[4]}, ${r[5]}, ${r[6]}, ${r[7]})`
      );
      const bulkQuery = sql`INSERT INTO io_srt_bill (date, ohr_id, srt_id, billing_name, srt_status, role, planning_group, created_at)
        VALUES ${sql.join(valueSets, sql`, `)}
        ON DUPLICATE KEY UPDATE
          srt_id = VALUES(srt_id),
          billing_name = VALUES(billing_name),
          srt_status = VALUES(srt_status),
          role = VALUES(role),
          planning_group = VALUES(planning_group),
          created_at = VALUES(created_at)`;

      const result: any = await db.execute(bulkQuery);
      const info = Array.isArray(result[0]) ? result[0] : result;
      totalAffected += info.affectedRows || 0;
    }

    // Sync latest Actuals data back to io_employees (only on last batch)
    let synced = 0;
    if (!skipSync) {
      try {
        const syncResult: any = await db.execute(
          sql`UPDATE io_employees e
              INNER JOIN (
                SELECT ohr_id, role, planning_group
                FROM io_srt_bill
                WHERE date = (
                    SELECT MAX(s2.date) FROM io_srt_bill s2
                    WHERE s2.ohr_id = io_srt_bill.ohr_id
                  )
              ) latest ON e.ohr_id = latest.ohr_id
              SET e.planning_group = latest.planning_group,
                  e.actual_role = latest.role
              WHERE e.planning_group != latest.planning_group
                 OR e.actual_role != latest.role`
        );
        const syncInfo = Array.isArray(syncResult[0]) ? syncResult[0] : syncResult;
        synced = syncInfo.affectedRows || 0;
        // Mirror updated employees to Supabase if any were changed
        if (synced > 0) {
          const allEmps = await db.select().from(ioEmployees);
          syncEmployeesToSupabase(allEmps).catch(() => {});
        }
      } catch (syncErr: any) {
        console.error("[IO API] srt-bill-upload employee sync error:", syncErr.message);
      }
    }
    res.json({ success: true, totalAffected, total: rows.length, employeesSynced: synced });;
  } catch (err: any) {
    console.error("[IO API] srt-bill-upload error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/io/srt-bill/summary — get summary of uploaded SRT bill data
router.get("/srt-bill/summary", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const result: any = await db.execute(
      sql`SELECT
            MIN(date) as min_date,
            MAX(date) as max_date,
            COUNT(DISTINCT ohr_id) as unique_employees,
            COUNT(*) as total_rows
          FROM io_srt_bill`
    );
    const rows = Array.isArray(result[0]) ? result[0] : result;
    res.json(rows[0] || {});
  } catch (err: any) {
    console.error("[IO API] srt-bill/summary error:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/io/srt-bill — clear all SRT bill data (for re-upload)
router.delete("/srt-bill", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    await db.execute(sql`DELETE FROM io_srt_bill`);
    res.json({ success: true });
  } catch (err: any) {
    console.error("[IO API] srt-bill DELETE error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Billing Compliance V2 — Targets CRUD
// ============================================================

// GET /api/io/billing-targets-v2?week_ending=YYYY-MM-DD
router.get("/billing-targets-v2", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const we = req.query.week_ending ? String(req.query.week_ending) : null;
    let result: any;
    if (we) {
      result = await db.execute(
        sql`SELECT * FROM io_billing_targets_v2 WHERE week_ending = ${we} ORDER BY planning_group, role`
      );
    } else {
      result = await db.execute(
        sql`SELECT * FROM io_billing_targets_v2 ORDER BY week_ending DESC, planning_group, role`
      );
    }
    const rows = Array.isArray(result[0]) ? result[0] : result;
    res.json(rows);
  } catch (err: any) {
    console.error("[IO API] billing-targets-v2 GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/billing-targets-v2 — upsert targets (admin-only: OHR 740045023)
// Body: { targets: Array<{week_ending, planning_group, role, target_hc, target_hours}> }
router.post("/billing-targets-v2", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    // Permission gate: owner (740045023), assistant (740044909), and Managers
    const userOhr = (req as any).userOhr || req.headers['x-user-ohr'];
    const userRole = (req as any).userRole || req.headers['x-user-role'] || '';
    const BILLING_EDIT_OHRS = ADMIN_OHRS;
    const canEdit = BILLING_EDIT_OHRS.includes(String(userOhr)) || String(userRole) === 'Manager';
    if (!canEdit) {
      return res.status(403).json({ error: "Only Managers and designated admins can edit billing targets." });
    }
    const { targets } = req.body;
    if (!targets || !Array.isArray(targets)) {
      return res.status(400).json({ error: "targets array is required" });
    }
    const now = new Date().toISOString();
    let upserted = 0;
    for (const t of targets) {
      await db.execute(
        sql`INSERT INTO io_billing_targets_v2 (week_ending, planning_group, role, target_hc, target_hours, created_at, updated_at)
            VALUES (${String(t.week_ending)}, ${String(t.planning_group)}, ${String(t.role)}, ${Number(t.target_hc) || 0}, ${Number(t.target_hours) || 0}, ${now}, ${now})
            ON DUPLICATE KEY UPDATE
              target_hc = VALUES(target_hc),
              target_hours = VALUES(target_hours),
              updated_at = VALUES(updated_at)`
      );
      upserted++;
    }
    res.json({ success: true, upserted });
  } catch (err: any) {
    console.error("[IO API] billing-targets-v2 POST error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/io/billing-targets-v2/weeks — get distinct week_ending values
router.get("/billing-targets-v2/weeks", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const result: any = await db.execute(
      sql`SELECT DISTINCT week_ending FROM io_billing_targets_v2 ORDER BY week_ending DESC`
    );
    const rows = Array.isArray(result[0]) ? result[0] : result;
    res.json(rows.map((r: any) => r.week_ending));
  } catch (err: any) {
    console.error("[IO API] billing-targets-v2/weeks error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Billing Compliance V2 — Compliance Calculation Engine
// ============================================================

/**
 * GET /api/io/billing-compliance?week_ending=YYYY-MM-DD
 *
 * Billing Compliance Dashboard Engine.
 * Work week = Saturday to Friday. week_ending = the Friday.
 *
 * For each of the 11 PG×Role combos, computes:
 *  - Delivered hours (P/LATE/OT attendance days × 7.5)
 *  - OT hours (sum of ot_hours field)
 *  - Total billed = delivered + OT
 *  - Compliance % = total_billed / target_hours × 100
 *  - Goal to 98%, 100%, 102% (signed hour deltas)
 *  - Predictive UPL (YTD weekly avg UPL rate, projected for remaining days)
 *  - Predictive OT (YTD weekly avg OT hours, projected for remaining days)
 *  - OTs needed to close gap to target
 *  - HC needed (additional full-week headcount to close gap)
 */
router.get("/billing-compliance", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const weekEnding = String(req.query.week_ending || '');
    if (!weekEnding) return res.status(400).json({ error: "week_ending is required" });

    const HOURS_PER_SHIFT = 7.5;

    // Work week: Saturday to Friday. week_ending = Friday.
    const weDate = new Date(weekEnding + 'T00:00:00Z');
    if (isNaN(weDate.getTime())) return res.status(400).json({ error: 'Invalid week_ending date' });
    const wsDate = new Date(weDate);
    wsDate.setUTCDate(wsDate.getUTCDate() - 6); // Saturday
    const weekStart = wsDate.toISOString().slice(0, 10);
    const weekEnd = weekEnding;

    // Determine how many days have passed and remain
    // Today in PHT (UTC+8)
    const nowPHT = new Date(Date.now() + 8 * 3600000);
    const todayStr = nowPHT.toISOString().slice(0, 10);
    // Count working days in the week (Sat-Fri = 7 days)
    const totalDaysInWeek = 7;
    // Days elapsed = days from weekStart up to min(today, weekEnd)
    const effectiveEnd = todayStr < weekEnd ? todayStr : weekEnd;
    const daysElapsed = Math.max(0, Math.min(totalDaysInWeek,
      Math.floor((new Date(effectiveEnd + 'T00:00:00Z').getTime() - new Date(weekStart + 'T00:00:00Z').getTime()) / 86400000) + 1
    ));
    const daysRemaining = Math.max(0, totalDaysInWeek - daysElapsed);
    const isCurrentWeek = todayStr >= weekStart && todayStr <= weekEnd;
    const isCompletedWeek = todayStr > weekEnd;

    // The 11 PG×Role combos (using billing PG short codes stored in attendance)
    const PG_ROLE_COMBOS = [
      { pg: 'S-ABF', role: 'Agent', label: 'S-ABF × Agent' },
      { pg: 'S-ABF', role: 'Operational SME', label: 'S-ABF × SME' },
      { pg: 'S-ABF', role: 'Quality & Policy Expert', label: 'S-ABF × QA' },
      { pg: 'CS-ABF', role: 'Agent', label: 'CS-ABF × Agent' },
      { pg: 'CS-ABF', role: 'Operational SME', label: 'CS-ABF × SME' },
      { pg: 'CS-ABF', role: 'Quality & Policy Expert', label: 'CS-ABF × QA' },
      { pg: 'RECALL_MEASUREMENT_CTR', role: 'Agent', label: 'RECALL_MEASUREMENT_CTR' },
      { pg: 'CSO_CTR', role: 'Agent', label: 'CSO_CTR' },
      { pg: 'FAD_CTR', role: 'Agent', label: 'FAD_CTR' },
      { pg: 'SME_CTR', role: '*', label: 'SME_CTR' },
      { pg: 'QPE_CTR', role: '*', label: 'QPE_CTR' },
    ];

    // 1. Attendance data for this week
    // Status filter: accept optional exclude_statuses param (comma-separated), default to Nesting,Training,Exit,Inactive
    const excludeParam = String(req.query.exclude_statuses || 'Nesting,Training,Exit,Inactive');
    const EXCLUDED_STATUSES = excludeParam === 'none' ? [] : excludeParam.split(',').map(s => s.trim()).filter(Boolean);

    let statusFilter = sql``;
    if (EXCLUDED_STATUSES.length > 0) {
      statusFilter = sql` AND (snap_status IS NULL OR snap_status NOT IN (${sql.join(EXCLUDED_STATUSES.map(s => sql`${s}`), sql`, `)}))`;
    }
    const attResult: any = await db.execute(
      sql`SELECT ohr_id, log_date, tag, ot_hours, planning_group, role, snap_status
          FROM io_attendance
          WHERE log_date >= ${weekStart} AND log_date <= ${weekEnd}
            AND planning_group IS NOT NULL AND role IS NOT NULL${statusFilter}`
    );
    const attRows = Array.isArray(attResult[0]) ? attResult[0] : attResult;

    // 2. Targets for this week (carry forward from most recent known week if none set)
    let tgtResult: any = await db.execute(
      sql`SELECT planning_group, role, target_hc, target_hours
          FROM io_billing_targets_v2
          WHERE week_ending = ${weekEnding}`
    );
    let tgtRows = Array.isArray(tgtResult[0]) ? tgtResult[0] : tgtResult;

    // Build target map — if no targets for this week, carry forward from the most recent prior week
    const targetMap = new Map<string, { target_hc: number; target_hours: number }>();
    for (const t of tgtRows) {
      targetMap.set(`${t.planning_group}|${t.role}`, { target_hc: Number(t.target_hc) || 0, target_hours: Number(t.target_hours) || 0 });
    }

    // Check if any of the known PG_ROLE_COMBOS have targets; if not, carry forward
    const hasRealTargets = PG_ROLE_COMBOS.some(c => {
      if (c.role === '*') {
        return Array.from(targetMap.keys()).some(k => k.startsWith(c.pg + '|'));
      }
      return targetMap.has(`${c.pg}|${c.role}`);
    });

    if (!hasRealTargets) {
      const fallbackResult: any = await db.execute(
        sql`SELECT planning_group, role, target_hc, target_hours
            FROM io_billing_targets_v2
            WHERE week_ending = (
              SELECT MAX(week_ending) FROM io_billing_targets_v2 WHERE week_ending < ${weekEnding}
            )`
      );
      const fallbackRows = Array.isArray(fallbackResult[0]) ? fallbackResult[0] : fallbackResult;
      for (const t of fallbackRows) {
        targetMap.set(`${t.planning_group}|${t.role}`, { target_hc: Number(t.target_hc) || 0, target_hours: Number(t.target_hours) || 0 });
      }
    }

    // 3. YTD data for predictive UPL and OT rates
    // YTD = from Jan 1 to the Saturday before this week (exclude current week)
    const ytdEnd = new Date(wsDate);
    ytdEnd.setUTCDate(ytdEnd.getUTCDate() - 1); // Friday before this week
    const ytdEndStr = ytdEnd.toISOString().slice(0, 10);
    const ytdStartStr = weDate.getUTCFullYear() + '-01-01';

    const ytdResult: any = await db.execute(
      sql`SELECT planning_group, role,
            COUNT(DISTINCT CONCAT(YEAR(log_date), '-', WEEK(log_date, 6))) as weeks_count,
            SUM(CASE WHEN tag = 'UPL' THEN 1 ELSE 0 END) as total_upl,
            SUM(CASE WHEN tag IN ('P','LATE') THEN 1 ELSE 0 END) as total_present,
            SUM(CASE WHEN tag IN ('P','LATE') AND ot_hours IS NOT NULL AND ot_hours != '' AND CAST(ot_hours AS DECIMAL(10,2)) > 0 THEN CAST(ot_hours AS DECIMAL(10,2)) ELSE 0 END) as total_ot_hours
          FROM io_attendance
          WHERE log_date >= ${ytdStartStr} AND log_date <= ${ytdEndStr}
            AND planning_group IS NOT NULL AND role IS NOT NULL
          GROUP BY planning_group, role`
    );
    const ytdRows = Array.isArray(ytdResult[0]) ? ytdResult[0] : ytdResult;
    // Build YTD lookup: pg|role -> { weeks, upl_per_week, ot_per_week }
    const ytdMap = new Map<string, { weeks: number; upl_per_week: number; ot_per_week: number }>();
    for (const y of ytdRows) {
      const weeks = Number(y.weeks_count) || 1;
      ytdMap.set(`${y.planning_group}|${y.role}`, {
        weeks,
        upl_per_week: Number(y.total_upl) / weeks,
        ot_per_week: Number(y.total_ot_hours) / weeks
      });
    }

    // Build per-combo attendance aggregation
    // For each combo, aggregate: billable days, UPL days, OT hours, per-day breakdown
    type DayBucket = { billable: number; upl: number; pl: number; ot_hours: number; total: number; employees: Set<string> };
    type ComboData = {
      days: Map<string, DayBucket>;
      totalBillable: number;
      totalUPL: number;
      totalPL: number;
      totalOtHours: number;
      totalScheduled: number;
      uniqueEmployees: Set<string>;
    };

    const comboDataMap = new Map<string, ComboData>();
    const getComboKey = (pg: string, role: string): string | null => {
      // Match against the 11 combos
      for (const c of PG_ROLE_COMBOS) {
        if (c.pg === pg && (c.role === '*' || c.role === role)) return `${c.pg}|${c.role}`;
      }
      return null;
    }

    for (const a of attRows) {
      const key = getComboKey(a.planning_group, a.role);
      if (!key) continue;
      if (!comboDataMap.has(key)) {
        comboDataMap.set(key, {
          days: new Map(),
          totalBillable: 0, totalUPL: 0, totalPL: 0, totalOtHours: 0, totalScheduled: 0,
          uniqueEmployees: new Set()
        });
      }
      const cd = comboDataMap.get(key)!;
      cd.uniqueEmployees.add(a.ohr_id);
      if (!cd.days.has(a.log_date)) {
        cd.days.set(a.log_date, { billable: 0, upl: 0, pl: 0, ot_hours: 0, total: 0, employees: new Set() });
      }
      const day = cd.days.get(a.log_date)!;
      day.total++;
      day.employees.add(a.ohr_id);
      const tag = (a.tag || '').toUpperCase();
      // Blank/null tags treated as 'P' (billable) for compliance
      if (tag === 'P' || tag === 'LATE' || tag === 'OT' || tag === '') {
        day.billable++;
        cd.totalBillable++;
        const otHrs = parseFloat(a.ot_hours) || 0;
        day.ot_hours += otHrs;
        cd.totalOtHours += otHrs;
      }
      if (tag === 'UPL') {
        day.upl++;
        cd.totalUPL++;
      }
      if (tag === 'PL') {
        day.pl++;
        cd.totalPL++;
      }
      // Blank tags also count as scheduled (treated as P)
      if (['P','LATE','OT','UPL','PL',''].includes(tag)) {
        cd.totalScheduled++;
      }
    }

    // Build compliance rows
    const complianceRows: any[] = [];

    for (const combo of PG_ROLE_COMBOS) {
      const key = `${combo.pg}|${combo.role}`;
      const cd = comboDataMap.get(key);

      // Target: for wildcard roles (*), sum all targets matching the PG
      let targetHours = 0;
      if (combo.role === '*') {
        for (const [k, v] of Array.from(targetMap.entries())) {
          if (k.startsWith(combo.pg + '|')) targetHours += v.target_hours;
        }
      } else {
        targetHours = (targetMap.get(key) || { target_hours: 0 }).target_hours;
      }

      // YTD predictive rates: for wildcard roles, sum across all roles for the PG
      let ytdUplPerWeek = 0;
      let ytdOtPerWeek = 0;
      if (combo.role === '*') {
        for (const [k, v] of Array.from(ytdMap.entries())) {
          if (k.startsWith(combo.pg + '|')) {
            ytdUplPerWeek += v.upl_per_week;
            ytdOtPerWeek += v.ot_per_week;
          }
        }
      } else {
        const ytd = ytdMap.get(key);
        if (ytd) {
          ytdUplPerWeek = ytd.upl_per_week;
          ytdOtPerWeek = ytd.ot_per_week;
        }
      }

      const billableDays = cd ? cd.totalBillable : 0;
      const uplDays = cd ? cd.totalUPL : 0;
      const plDays = cd ? cd.totalPL : 0;
      const otHoursActual = cd ? cd.totalOtHours : 0;
      const deliveredHours = billableDays * HOURS_PER_SHIFT;
      const totalBilled = deliveredHours + otHoursActual;

      // Compliance %
      const compliancePct = targetHours > 0 ? (totalBilled / targetHours) * 100 : 0;

      // Goal deltas (positive = surplus, negative = deficit)
      const goalTo98 = totalBilled - (targetHours * 0.98);
      const goalTo100 = totalBilled - targetHours;
      const goalTo102 = totalBilled - (targetHours * 1.02);

      // Predictive UPL: YTD avg UPL per week, scaled to remaining days
      // UPL per day = ytdUplPerWeek / 7, then × daysRemaining
      const predictiveUplDays = isCompletedWeek ? 0 : (ytdUplPerWeek / 7) * daysRemaining;
      const predictiveUplHours = predictiveUplDays * HOURS_PER_SHIFT;

      // Predictive OT: YTD avg OT hours per week, scaled to remaining days
      const predictiveOtHours = isCompletedWeek ? 0 : (ytdOtPerWeek / 7) * daysRemaining;

      // Projected end-of-week billed (current + predicted OT for remaining days + remaining billable days)
      // Remaining billable = (current daily billable rate) × daysRemaining - predictive UPL
      const dailyBillableRate = daysElapsed > 0 ? billableDays / daysElapsed : 0;
      const projectedRemainingBillable = Math.max(0, (dailyBillableRate * daysRemaining) - predictiveUplDays);
      const projectedTotalBilled = totalBilled + (projectedRemainingBillable * HOURS_PER_SHIFT) + predictiveOtHours;

      // OTs needed: hours gap to 100% target minus projected OT
      const gapToTarget = targetHours - projectedTotalBilled;
      const otsNeeded = Math.max(0, gapToTarget);

      // HC needed: additional full-week headcount (person × 7 days × 7.5 hrs)
      const hcNeeded = daysRemaining > 0 ? Math.max(0, Math.ceil(gapToTarget / (daysRemaining * HOURS_PER_SHIFT))) : 0;

      // Day-by-day breakdown
      const dayBreakdown: any[] = [];
      if (cd) {
        const sortedDates = Array.from(cd.days.keys()).sort();
        for (const date of sortedDates) {
          const d = cd.days.get(date)!;
          dayBreakdown.push({
            date,
            billable_days: d.billable,
            upl_days: d.upl,
            pl_days: d.pl,
            delivered_hours: d.billable * HOURS_PER_SHIFT,
            ot_hours: Math.round(d.ot_hours * 100) / 100,
            total_billed: (d.billable * HOURS_PER_SHIFT) + d.ot_hours,
            headcount: d.employees.size
          });
        }
      }

      complianceRows.push({
        planning_group: combo.pg,
        role: combo.role,
        label: combo.label,
        target_hours: targetHours,
        delivered_hours: Math.round(deliveredHours * 100) / 100,
        ot_hours: Math.round(otHoursActual * 100) / 100,
        total_billed: Math.round(totalBilled * 100) / 100,
        compliance_pct: Math.round(compliancePct * 100) / 100,
        goal_to_98: Math.round(goalTo98 * 100) / 100,
        goal_to_100: Math.round(goalTo100 * 100) / 100,
        goal_to_102: Math.round(goalTo102 * 100) / 100,
        predictive_upl_hours: Math.round(predictiveUplHours * 100) / 100,
        predictive_ot_hours: Math.round(predictiveOtHours * 100) / 100,
        projected_total_billed: Math.round(projectedTotalBilled * 100) / 100,
        ots_needed: Math.round(otsNeeded * 100) / 100,
        hc_needed: hcNeeded,
        days_elapsed: daysElapsed,
        days_remaining: daysRemaining,
        billable_days: billableDays,
        upl_days: uplDays,
        pl_days: plDays,
        unique_hc: cd ? cd.uniqueEmployees.size : 0,
        day_breakdown: dayBreakdown
      });
    }

    // Totals
    const totals = {
      target_hours: complianceRows.reduce((s: number, r: any) => s + r.target_hours, 0),
      delivered_hours: Math.round(complianceRows.reduce((s: number, r: any) => s + r.delivered_hours, 0) * 100) / 100,
      ot_hours: Math.round(complianceRows.reduce((s: number, r: any) => s + r.ot_hours, 0) * 100) / 100,
      total_billed: Math.round(complianceRows.reduce((s: number, r: any) => s + r.total_billed, 0) * 100) / 100,
      compliance_pct: 0 as number,
      goal_to_98: Math.round(complianceRows.reduce((s: number, r: any) => s + r.goal_to_98, 0) * 100) / 100,
      goal_to_100: Math.round(complianceRows.reduce((s: number, r: any) => s + r.goal_to_100, 0) * 100) / 100,
      goal_to_102: Math.round(complianceRows.reduce((s: number, r: any) => s + r.goal_to_102, 0) * 100) / 100,
      ots_needed: Math.round(complianceRows.reduce((s: number, r: any) => s + r.ots_needed, 0) * 100) / 100,
      hc_needed: complianceRows.reduce((s: number, r: any) => s + r.hc_needed, 0),
      upl_days: complianceRows.reduce((s: number, r: any) => s + r.upl_days, 0),
      pl_days: complianceRows.reduce((s: number, r: any) => s + r.pl_days, 0),
    };
    const totalTarget = totals.target_hours;
    totals.compliance_pct = totalTarget > 0 ? Math.round((totals.total_billed / totalTarget) * 10000) / 100 : 0;

    res.json({
      week_ending: weekEnding,
      week_start: weekStart,
      days_elapsed: daysElapsed,
      days_remaining: daysRemaining,
      is_current_week: isCurrentWeek,
      is_completed_week: isCompletedWeek,
      compliance: complianceRows,
      totals,
      excluded_statuses: EXCLUDED_STATUSES
    });
  } catch (err: any) {
    console.error("[IO API] billing-compliance error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/io/billing-compliance/weeks — available weeks (Sat-Fri, ending on Friday)
router.get("/billing-compliance/weeks", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    // Get min and max dates from attendance data
    const result: any = await db.execute(
      sql`SELECT MIN(log_date) as min_date, MAX(log_date) as max_date FROM io_attendance WHERE planning_group IS NOT NULL`
    );
    const rows = Array.isArray(result[0]) ? result[0] : result;
    const { min_date, max_date } = rows[0] || {};
    if (!min_date || !max_date) return res.json([]);

    // Generate Friday week-endings (Sat-Fri work week)
    const weeks: string[] = [];
    const start = new Date(min_date + 'T00:00:00Z');
    const end = new Date(max_date + 'T00:00:00Z');
    // Find first Friday >= min_date
    const cursor = new Date(start);
    const dayOfWeek = cursor.getUTCDay(); // 0=Sun
    const daysToFriday = (5 - dayOfWeek + 7) % 7;
    cursor.setUTCDate(cursor.getUTCDate() + daysToFriday);
    while (cursor <= end || cursor.getTime() - end.getTime() < 7 * 86400000) {
      weeks.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 7);
      if (weeks.length > 52) break;
    }
    res.json(weeks);
  } catch (err: any) {
    console.error("[IO API] billing-compliance/weeks error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Sync Log (admin-only: OHR 740045023)
// ============================================================

// GET /api/io/sync-log — list sync log entries (newest first)
router.get("/sync-log", async (req: Request, res: Response) => {
  try {
    const actorOhr = req.headers["x-user-ohr"] as string || req.headers["x-actor-ohr"] as string;
    if (!ADMIN_OHRS.includes(actorOhr)) {
      return res.status(403).json({ error: "Admin only" });
    }
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const limit = Number(req.query.limit) || 50;
    const offset = Number(req.query.offset) || 0;
    const syncType = req.query.sync_type as string | undefined;
    const baseWhere = syncType ? eq(ioSyncLog.sync_type, syncType) : undefined;

    const [rows, countResult] = await Promise.all([
      baseWhere
        ? db.select().from(ioSyncLog).where(baseWhere).orderBy(desc(ioSyncLog.id)).limit(limit).offset(offset)
        : db.select().from(ioSyncLog).orderBy(desc(ioSyncLog.id)).limit(limit).offset(offset),
      baseWhere
        ? db.select({ count: sql<number>`COUNT(*)` }).from(ioSyncLog).where(baseWhere)
        : db.select({ count: sql<number>`COUNT(*)` }).from(ioSyncLog),
    ]);

    res.json({
      rows,
      total: Number(countResult[0]?.count || 0),
    });
  } catch (err: any) {
    console.error("[IO API] sync-log GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/io/sync-log/latest — get the most recent sync entry
router.get("/sync-log/latest", async (req: Request, res: Response) => {
  try {
    const actorOhr = req.headers["x-user-ohr"] as string || req.headers["x-actor-ohr"] as string;
    if (!ADMIN_OHRS.includes(actorOhr)) {
      return res.status(403).json({ error: "Admin only" });
    }
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const rows = await db.select().from(ioSyncLog).orderBy(desc(ioSyncLog.id)).limit(1);
    res.json(rows[0] || null);
  } catch (err: any) {
    console.error("[IO API] sync-log/latest GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Billing CSV Upload (replaces G Sheet sync)
// ============================================================

/**
 * POST /api/io/billing-csv-upload
 * Accepts JSON body: { rows: string[][] } — raw CSV rows including header.
 * Columns: date, ohr, srt_id, billing_name, srt_status, role, planning_group
 * Date format from CSV: YYYY-DD-MM → converted to YYYY-MM-DD.
 * Updates io_attendance, io_srt_bill, and io_employees.
 * Admin-only.
 */
router.post("/billing-csv-upload", async (req: Request, res: Response) => {
  const actorOhr = String(req.headers["x-actor-ohr"] || req.headers["x-user-ohr"] || "").trim();
  if (!ADMIN_OHRS.includes(actorOhr)) {
    return res.status(403).json({ error: "Admin only" });
  }
  const startTime = Date.now();
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const { rows: csvRows } = req.body;
    if (!csvRows || !Array.isArray(csvRows) || csvRows.length < 2) {
      return res.status(400).json({ error: "CSV must have at least a header row and one data row." });
    }

    // Skip header row
    const dataRows = csvRows.slice(1);

    // Parse date: YYYY-DD-MM → YYYY-MM-DD
    const parseBillingDate = (raw: string): string | null => {
      const parts = raw.split("-");
      if (parts.length !== 3) return null;
      const [yyyy, dd, mm] = parts;
      const m = parseInt(mm, 10);
      const d = parseInt(dd, 10);
      if (isNaN(m) || isNaN(d) || m < 1 || m > 12 || d < 1 || d > 31) return null;
      return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    };

    interface BillingRow {
      log_date: string;
      ohr_id: string;
      srt_id: string;
      billing_name: string;
      srt_status: string;
      role: string;
      planning_group: string;
    }

    const parsed: BillingRow[] = [];
    let parseErrors = 0;
    for (const row of dataRows) {
      if (!Array.isArray(row) || row.length < 7) { parseErrors++; continue; }
      const logDate = parseBillingDate(String(row[0] || "").trim());
      const ohrId = String(row[1] || "").trim();
      if (!logDate || !ohrId) { parseErrors++; continue; }
      parsed.push({
        log_date: logDate,
        ohr_id: ohrId,
        srt_id: String(row[2] || "").trim(),
        billing_name: String(row[3] || "").trim(),
        srt_status: String(row[4] || "").trim(),
        role: String(row[5] || "").trim(),
        planning_group: normalizePg(String(row[6] || "").trim()),
      });
    }

    if (parsed.length === 0) {
      return res.status(400).json({ error: `No valid rows parsed. ${parseErrors} rows had errors.` });
    }

    console.log(`[BILLING CSV] Parsed ${parsed.length} rows (${parseErrors} errors)`);

    // 1. Batch update io_attendance via staging table + UPDATE JOIN
    let updated = 0;
    let skipped = 0;
    try {
      await db.execute(sql`DROP TEMPORARY TABLE IF EXISTS _billing_staging`);
      await db.execute(sql`CREATE TEMPORARY TABLE _billing_staging (
        ohr_id VARCHAR(20) NOT NULL,
        log_date VARCHAR(30) NOT NULL,
        role VARCHAR(100),
        planning_group VARCHAR(100),
        billing_name VARCHAR(255),
        srt_status VARCHAR(50),
        PRIMARY KEY (ohr_id, log_date)
      )`);

      const STAGE_BATCH = 2000;
      for (let i = 0; i < parsed.length; i += STAGE_BATCH) {
        const chunk = parsed.slice(i, i + STAGE_BATCH);
        const valueSets = chunk.map(r =>
          sql`(${r.ohr_id}, ${r.log_date}, ${r.role}, ${r.planning_group}, ${r.billing_name}, ${r.srt_status})`
        );
        await db.execute(
          sql`INSERT INTO _billing_staging (ohr_id, log_date, role, planning_group, billing_name, srt_status)
              VALUES ${sql.join(valueSets, sql`, `)}
              ON DUPLICATE KEY UPDATE role = VALUES(role)`
        );
        console.log(`[BILLING CSV] Staged ${Math.min(i + STAGE_BATCH, parsed.length)}/${parsed.length} rows`);
      }

      const updateResult: any = await db.execute(
        sql`UPDATE io_attendance a
            INNER JOIN _billing_staging s ON a.ohr_id = s.ohr_id AND a.log_date = s.log_date
            SET a.role = s.role,
                a.planning_group = s.planning_group,
                a.snap_billing_name = s.billing_name,
                a.snap_status = s.srt_status`
      );
      updated = updateResult[0]?.affectedRows ?? 0;
      skipped = parsed.length - updated;
      await db.execute(sql`DROP TEMPORARY TABLE IF EXISTS _billing_staging`);
      console.log(`[BILLING CSV] Attendance updated: ${updated}, skipped: ${skipped}`);
    } catch (batchErr: any) {
      console.error(`[BILLING CSV] Batch update error:`, batchErr.message);
      skipped = parsed.length;
    }

    // 2. Sync latest data back to io_employees (batch via staging table)
    let employeesSynced = 0;
    try {
      const latestByEmployee = new Map<string, BillingRow>();
      for (const r of parsed) {
        const existing = latestByEmployee.get(r.ohr_id);
        if (!existing || r.log_date > existing.log_date) {
          latestByEmployee.set(r.ohr_id, r);
        }
      }
      const empEntries = Array.from(latestByEmployee.values());
      if (empEntries.length > 0) {
        await db.execute(sql`DROP TEMPORARY TABLE IF EXISTS _emp_staging`);
        await db.execute(sql`CREATE TEMPORARY TABLE _emp_staging (
          ohr_id VARCHAR(20) NOT NULL PRIMARY KEY,
          planning_group VARCHAR(100),
          actual_role VARCHAR(100)
        )`);
        const EMP_BATCH = 2000;
        for (let i = 0; i < empEntries.length; i += EMP_BATCH) {
          const chunk = empEntries.slice(i, i + EMP_BATCH);
          const valueSets = chunk.map(r => sql`(${r.ohr_id}, ${r.planning_group}, ${r.role})`);
          await db.execute(
            sql`INSERT INTO _emp_staging (ohr_id, planning_group, actual_role)
                VALUES ${sql.join(valueSets, sql`, `)}
                ON DUPLICATE KEY UPDATE planning_group = VALUES(planning_group)`
          );
        }
        const empResult: any = await db.execute(
          sql`UPDATE io_employees e
              INNER JOIN _emp_staging s ON e.ohr_id = s.ohr_id
              SET e.planning_group = s.planning_group,
                  e.actual_role = s.actual_role
              WHERE e.planning_group != s.planning_group OR e.actual_role != s.actual_role`
        );
        employeesSynced = empResult[0]?.affectedRows ?? 0;
        await db.execute(sql`DROP TEMPORARY TABLE IF EXISTS _emp_staging`);
        console.log(`[BILLING CSV] Employees synced: ${employeesSynced}`);
        if (employeesSynced > 0) {
          const allEmps = await db.select().from(ioEmployees);
          syncEmployeesToSupabase(allEmps).catch(() => {});
        }
      }
    } catch (syncErr: any) {
      console.error("[BILLING CSV] Employee sync error:", syncErr.message);
    }

    // 3. Upsert into io_srt_bill for historical tracking
    let srtBillUpserted = 0;
    try {
      const SRT_BATCH = 2000;
      for (let i = 0; i < parsed.length; i += SRT_BATCH) {
        const chunk = parsed.slice(i, i + SRT_BATCH);
        const now = new Date().toISOString();
        const valueSets = chunk.map(r =>
          sql`(${r.log_date}, ${r.ohr_id}, ${r.srt_id}, ${r.billing_name}, ${r.srt_status}, ${r.role}, ${r.planning_group}, ${now})`
        );
        const bulkQuery = sql`INSERT INTO io_srt_bill (date, ohr_id, srt_id, billing_name, srt_status, role, planning_group, created_at)
          VALUES ${sql.join(valueSets, sql`, `)}
          ON DUPLICATE KEY UPDATE
            srt_id = VALUES(srt_id),
            billing_name = VALUES(billing_name),
            srt_status = VALUES(srt_status),
            role = VALUES(role),
            planning_group = VALUES(planning_group),
            created_at = VALUES(created_at)`;
        const result: any = await db.execute(bulkQuery);
        srtBillUpserted += result[0]?.affectedRows ?? 0;
      }
    } catch (srtErr: any) {
      console.error("[BILLING CSV] SRT bill upsert error:", srtErr.message);
    }

    // 4. Log to io_sync_log
    const durationMs = Date.now() - startTime;
    try {
      await db.insert(ioSyncLog).values({
        sync_type: "billing_csv",
        trigger: "manual",
        status: "success",
        started_at: new Date(startTime).toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
        rows_updated: updated,
        rows_appended: 0,
        total_db_rows: updated + skipped,
        total_sheet_rows: parsed.length,
        error_message: parseErrors > 0 ? `${parseErrors} rows skipped due to parse errors` : null,
        output_log: `CSV rows: ${dataRows.length}, Parsed: ${parsed.length}, Updated: ${updated}, Skipped: ${skipped}, Employees synced: ${employeesSynced}, SRT bill upserted: ${srtBillUpserted}`,
      });
    } catch (logErr: any) {
      console.error("[BILLING CSV] Log write error:", logErr.message);
    }

    console.log(`[BILLING CSV] Done in ${durationMs}ms — Updated: ${updated}, Skipped: ${skipped}, Employees: ${employeesSynced}`);
    res.json({
      success: true,
      totalCsvRows: dataRows.length,
      parsed: parsed.length,
      updated,
      skipped,
      parseErrors,
      employeesSynced,
      srtBillUpserted,
      durationMs,
    });
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    try {
      const db = await getDb();
      if (db) {
        await db.insert(ioSyncLog).values({
          sync_type: "billing_csv",
          trigger: "manual",
          status: "error",
          started_at: new Date(startTime).toISOString(),
          completed_at: new Date().toISOString(),
          duration_ms: durationMs,
          rows_updated: 0,
          rows_appended: 0,
          error_message: err.message,
          output_log: err.stack?.substring(0, 500),
        });
      }
    } catch (_) {}
    console.error("[BILLING CSV] Error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/io/billing-sheet-sync (LEGACY — kept for backward compatibility)
 * Reads the BILLING Google Sheet and updates matching io_attendance rows
 * with role, planning_group, snap_billing_name, snap_status.
 * Also syncs latest data back to io_employees.
 * Admin-only (740045023).
 */
router.post("/billing-sheet-sync", async (req: Request, res: Response) => {
  console.log("[BILLING SYNC] Endpoint hit");
  const actorOhr = String(req.headers["x-actor-ohr"] || req.headers["x-user-ohr"] || "").trim();
  if (!ADMIN_OHRS.includes(actorOhr)) {
    return res.status(403).json({ error: "Admin only" });
  }

  const SHEET_ID = "12H0ZBV1SleJ1N4-HQpdC7TIyOKdxxT40JmZvO6L__PY";
  const SHEET_RANGE = "BILLING!A2:H";
  const startTime = Date.now();

  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    // 1. Read the Google Sheet via gws CLI (async exec with large maxBuffer)
    const { exec: execCb } = await import("child_process");
    const fs = await import("fs");
    const gwsCmd = `gws sheets spreadsheets values get --params '{"spreadsheetId":"${SHEET_ID}","range":"${SHEET_RANGE}"}'`;
    let sheetData: any;
    try {
      // Build clean env with gws token for auth
      const cleanEnv: Record<string, string> = { ...process.env } as any;
      const tokenFile = "/home/ubuntu/.gws_token";
      try {
        const token = fs.readFileSync(tokenFile, "utf-8").trim();
        if (token) cleanEnv.GOOGLE_WORKSPACE_CLI_TOKEN = token;
      } catch { /* ignore */ }
      // Strip uv-injected paths that break gws
      if (cleanEnv.PATH) {
        cleanEnv.PATH = cleanEnv.PATH.split(":").filter((p: string) => !p.includes(".cache/uv")).join(":");
      }
      console.log(`[BILLING SYNC] Token present: ${!!cleanEnv.GOOGLE_WORKSPACE_CLI_TOKEN}, len: ${(cleanEnv.GOOGLE_WORKSPACE_CLI_TOKEN || '').length}`);
      console.log(`[BILLING SYNC] Running gws CLI (async)...`);

      // Use async exec with 10MB maxBuffer to handle ~2MB sheet output
      const gwsOutput = await new Promise<string>((resolve, reject) => {
        execCb(gwsCmd, {
          timeout: 120000,
          maxBuffer: 10 * 1024 * 1024,
          cwd: "/home/ubuntu",
          env: cleanEnv,
          shell: "/bin/bash",
        }, (error, stdout, stderr) => {
          if (error) {
            console.error("[BILLING SYNC] gws stderr:", stderr?.substring(0, 500));
            reject(new Error(stderr?.trim() || error.message));
          } else {
            resolve(stdout);
          }
        });
      });

      sheetData = JSON.parse(gwsOutput);
      console.log(`[BILLING SYNC] Sheet read OK — ${(sheetData.values || []).length} rows`);
    } catch (gwsErr: any) {
      console.error("[BILLING SYNC] gws CLI error:", gwsErr.message);
      return res.status(500).json({ error: "Failed to read Google Sheet. Check gws auth." });
    }
    const rows: string[][] = sheetData.values || [];
    if (rows.length === 0) {
      return res.json({ success: true, message: "Sheet is empty", totalRows: 0, updated: 0, skipped: 0 });
    }

    // 2. Parse sheet rows: columns are date(A), ohr(B), srt_id(C), billing_name(D), srt_status(E), role(F), planning_group(G)
    // Date format from sheet: YYYY-DD-MM → need to convert to YYYY-MM-DD
    const parseSheetDate = (raw: string): string | null => {
      const parts = raw.split("-");
      if (parts.length !== 3) return null;
      const [yyyy, dd, mm] = parts;
      const m = parseInt(mm, 10);
      const d = parseInt(dd, 10);
      if (isNaN(m) || isNaN(d) || m < 1 || m > 12 || d < 1 || d > 31) return null;
      return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    };

    interface BillingRow {
      log_date: string;
      ohr_id: string;
      srt_id: string;
      billing_name: string;
      srt_status: string;
      role: string;
      planning_group: string;
    }

    const parsed: BillingRow[] = [];
    let parseErrors = 0;
    for (const row of rows) {
      if (row.length < 7) { parseErrors++; continue; }
      const logDate = parseSheetDate(row[0]?.trim() || "");
      const ohrId = row[1]?.trim() || "";
      if (!logDate || !ohrId) { parseErrors++; continue; }
      parsed.push({
        log_date: logDate,
        ohr_id: ohrId,
        srt_id: row[2]?.trim() || "",
        billing_name: row[3]?.trim() || "",
        srt_status: row[4]?.trim() || "",
        role: row[5]?.trim() || "",
        planning_group: normalizePg(row[6]?.trim() || ""),
      });
    }

    // 3. Batch update io_attendance rows using temp table + UPDATE JOIN for performance
    //    (10K individual UPDATEs over remote DB is too slow; this approach does it in ~20 bulk INSERTs + 1 JOIN UPDATE)
    let updated = 0;
    let skipped = 0;
    try {
      // Create temp table
      await db.execute(sql`DROP TEMPORARY TABLE IF EXISTS _billing_staging`);
      await db.execute(sql`CREATE TEMPORARY TABLE _billing_staging (
        ohr_id VARCHAR(20) NOT NULL,
        log_date VARCHAR(30) NOT NULL,
        role VARCHAR(100),
        planning_group VARCHAR(100),
        billing_name VARCHAR(255),
        srt_status VARCHAR(50),
        PRIMARY KEY (ohr_id, log_date)
      )`);

      // Bulk insert into staging in batches of 500
      const STAGE_BATCH = 500;
      for (let i = 0; i < parsed.length; i += STAGE_BATCH) {
        const chunk = parsed.slice(i, i + STAGE_BATCH);
        const valueSets = chunk.map(r =>
          sql`(${r.ohr_id}, ${r.log_date}, ${r.role}, ${r.planning_group}, ${r.billing_name}, ${r.srt_status})`
        );
        await db.execute(
          sql`INSERT INTO _billing_staging (ohr_id, log_date, role, planning_group, billing_name, srt_status)
              VALUES ${sql.join(valueSets, sql`, `)}
              ON DUPLICATE KEY UPDATE role = VALUES(role)`
        );
      }
      console.log(`[BILLING SYNC] Staging table loaded with ${parsed.length} rows`);

      // Single UPDATE JOIN — orders of magnitude faster than row-by-row
      const updateResult: any = await db.execute(
        sql`UPDATE io_attendance a
            INNER JOIN _billing_staging s ON a.ohr_id = s.ohr_id AND a.log_date = s.log_date
            SET a.role = s.role,
                a.planning_group = s.planning_group,
                a.snap_billing_name = s.billing_name,
                a.snap_status = s.srt_status`
      );
      updated = updateResult[0]?.affectedRows ?? 0;
      skipped = parsed.length - updated;
      console.log(`[BILLING SYNC] JOIN UPDATE complete — ${updated} rows updated, ${skipped} unmatched`);

      // Clean up
      await db.execute(sql`DROP TEMPORARY TABLE IF EXISTS _billing_staging`);
    } catch (batchErr: any) {
      console.error(`[BILLING SYNC] Batch update error:`, batchErr.message);
      // Fallback: mark all as skipped
      skipped = parsed.length;
    }

    // 4. Sync latest Actuals data back to io_employees
    let employeesSynced = 0;
    try {
      // Build a temp map of latest Actuals per employee from the sheet
      const latestByEmployee = new Map<string, BillingRow>();
      for (const r of parsed) {
        const existing = latestByEmployee.get(r.ohr_id);
        if (!existing || r.log_date > existing.log_date) {
          latestByEmployee.set(r.ohr_id, r);
        }
      }
      // Update io_employees with latest Actuals planning_group and role
      for (const [ohrId, latest] of Array.from(latestByEmployee.entries())) {
        const syncResult: any = await db.execute(
          sql`UPDATE io_employees
              SET planning_group = ${latest.planning_group},
                  actual_role = ${latest.role}
              WHERE ohr_id = ${ohrId}
                AND (planning_group != ${latest.planning_group} OR actual_role != ${latest.role})`
        );
         if ((syncResult[0]?.affectedRows ?? 0) > 0) employeesSynced++;
      }
      // Mirror updated employees to Supabase
      if (employeesSynced > 0) {
        const allEmps = await db.select().from(ioEmployees);
        syncEmployeesToSupabase(allEmps).catch(() => {});
      }
    } catch (syncErr: any) {
      console.error("[BILLING SYNC] Employee sync error:", syncErr.message);
    }
    // 5. Also upsert into io_srt_bill for historical tracking
    let srtBillUpserted = 0;
    try {
      const SRT_BATCH = 500;
      for (let i = 0; i < parsed.length; i += SRT_BATCH) {
        const chunk = parsed.slice(i, i + SRT_BATCH);
        const now = new Date().toISOString();
        const valueSets = chunk.map(r =>
          sql`(${r.log_date}, ${r.ohr_id}, ${r.srt_id}, ${r.billing_name}, ${r.srt_status}, ${r.role}, ${r.planning_group}, ${now})`
        );
        const bulkQuery = sql`INSERT INTO io_srt_bill (date, ohr_id, srt_id, billing_name, srt_status, role, planning_group, created_at)
          VALUES ${sql.join(valueSets, sql`, `)}
          ON DUPLICATE KEY UPDATE
            srt_id = VALUES(srt_id),
            billing_name = VALUES(billing_name),
            srt_status = VALUES(srt_status),
            role = VALUES(role),
            planning_group = VALUES(planning_group),
            created_at = VALUES(created_at)`;
        const result: any = await db.execute(bulkQuery);
        srtBillUpserted += result[0]?.affectedRows ?? 0;
      }
    } catch (srtErr: any) {
      console.error("[BILLING SYNC] SRT bill upsert error:", srtErr.message);
    }

    // 6. Log to io_sync_log
    const durationMs = Date.now() - startTime;
    try {
      await db.insert(ioSyncLog).values({
        sync_type: "billing_sheet",
        trigger: "manual",
        status: "success",
        started_at: new Date(startTime).toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
        rows_updated: updated,
        rows_appended: 0,
        total_db_rows: updated + skipped,
        total_sheet_rows: parsed.length,
        error_message: parseErrors > 0 ? `${parseErrors} rows skipped due to parse errors` : null,
        output_log: `Sheet rows: ${rows.length}, Parsed: ${parsed.length}, Updated: ${updated}, Skipped: ${skipped}, Employees synced: ${employeesSynced}, SRT bill upserted: ${srtBillUpserted}`,
      });
    } catch (logErr: any) {
      console.error("[BILLING SYNC] Log write error:", logErr.message);
    }

    console.log(`[BILLING SYNC] Done in ${durationMs}ms — Updated: ${updated}, Skipped: ${skipped}, Employees: ${employeesSynced}`);
    res.json({
      success: true,
      totalSheetRows: rows.length,
      parsed: parsed.length,
      updated,
      skipped,
      parseErrors,
      employeesSynced,
      srtBillUpserted,
      durationMs,
    });
  } catch (err: any) {
    // Log failure
    const durationMs = Date.now() - startTime;
    try {
      const db = await getDb();
      if (db) {
        await db.insert(ioSyncLog).values({
          sync_type: "billing_sheet",
          trigger: "manual",
          status: "error",
          started_at: new Date(startTime).toISOString(),
          completed_at: new Date().toISOString(),
          duration_ms: durationMs,
          rows_updated: 0,
          rows_appended: 0,
          error_message: err.message,
          output_log: err.stack?.substring(0, 500),
        });
      }
    } catch (_) {}
    console.error("[BILLING SYNC] Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// RBAC Permission System
// ============================================================

// All permission keys in the system
const ALL_PERMISSION_KEYS = [
  'nav.anchor', 'nav.compass', 'nav.haven', 'nav.sandbox', 'nav.horizon',
  'nav.helm', 'nav.regimen', 'nav.admin',
  'anchor.input_portal', 'anchor.dashboard', 'anchor.billing_compliance',
  'anchor.risk_intelligence',
  'anchor.edit_attendance', 'anchor.download_csv', 'anchor.sync_roster',
  'regimen.onboarding_tab', 'regimen.permissions_tab', 'regimen.add_employee', 'regimen.edit_employee', 'regimen.export_csv', 'regimen.full_columns',
  'compass.disputes',
  'compass.corrective_actions',
];

// Role-based defaults — used as fallback when no DB row exists
function getPermissionDefaults(role: string, ohrId: string): Record<string, boolean> {
  if (ohrId === '740045023') return Object.fromEntries(ALL_PERMISSION_KEYS.map(k => [k, true]));
  const b: Record<string, boolean> = Object.fromEntries(ALL_PERMISSION_KEYS.map(k => [k, false]));
  if (role === 'Agent') { b['nav.compass'] = true; b['nav.sandbox'] = true; b['nav.helm'] = true; b['nav.haven'] = true; return b; }
  b['nav.anchor'] = true;
  b['anchor.input_portal'] = true;
  b['anchor.dashboard'] = true;
  b['anchor.billing_compliance'] = true;
  b['anchor.risk_intelligence'] = true;
  b['anchor.download_csv'] = true;
  b['nav.helm'] = true;
  b['nav.regimen'] = true;
  b['nav.sandbox'] = true;
  b['regimen.export_csv'] = true;
  b['nav.haven'] = true;
  b['nav.compass'] = true;
  b['compass.disputes'] = true;
  // Horizon: TL, Manager, Admin only
  if (role === 'Team Lead' || role === 'Manager') {
    b['nav.horizon'] = true;
  }
  // Corrective Actions: TLs and Managers only (not SMEs, QAs, Trainers, etc.)
  if (role === 'Team Lead' || role === 'Manager') {
    b['compass.corrective_actions'] = true;
  }
  if (role === 'Team Lead') b['anchor.edit_attendance'] = true;
  if (role === 'Manager') {
    b['anchor.edit_attendance'] = true;
  }
  if (ohrId === '740044909') {
    b['anchor.edit_attendance'] = true;
    b['nav.compass'] = true;
    b['compass.corrective_actions'] = true;
    b['regimen.edit_employee'] = true;
    b['regimen.add_employee'] = true;
    b['regimen.full_columns'] = true;
    b['regimen.onboarding_tab'] = true;
    b['regimen.permissions_tab'] = true;
  }
  // 703212987 no longer gets edit_employee by default — only owner + assistant
  return b;
}

// GET /api/io/config/admin-ohrs — single source of truth for admin OHR list
router.get("/config/admin-ohrs", (_req: Request, res: Response) => {
  res.json({ admin_ohrs: ADMIN_OHRS, owner_ohr: OWNER_OHR });
});

// GET /api/io/my-permissions — current user's permissions (merged DB + defaults)
router.get("/my-permissions", async (req: Request, res: Response) => {
  try {
    const ohrId = req.query.ohr_id as string;
    const role = req.query.role as string;
    if (!ohrId || !role) return res.status(400).json({ error: "ohr_id and role required" });

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    // Get defaults for this role
    const defaults = getPermissionDefaults(role, ohrId);

    // Get DB overrides
    const dbRows = await db.select().from(ioPermissions).where(eq(ioPermissions.ohr_id, ohrId));
    const dbMap: Record<string, boolean> = {};
    for (const row of dbRows) {
      dbMap[row.permission_key] = row.granted;
    }

    // Merge: DB overrides defaults
    const merged: Record<string, boolean> = { ...defaults };
    for (const key of ALL_PERMISSION_KEYS) {
      if (key in dbMap) merged[key] = dbMap[key];
    }

    res.json({ ohr_id: ohrId, permissions: merged });
  } catch (err: any) {
    console.error("[PERMISSIONS] Error fetching my-permissions:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/io/permissions — all permissions (admin only, returns per-employee summary)
router.get("/permissions", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const allPerms = await db.select().from(ioPermissions);

    // Group by ohr_id
    const byOhr: Record<string, Record<string, boolean>> = {};
    for (const row of allPerms) {
      if (!byOhr[row.ohr_id]) byOhr[row.ohr_id] = {};
      byOhr[row.ohr_id][row.permission_key] = row.granted;
    }

    res.json({ permissions: byOhr, keys: ALL_PERMISSION_KEYS });
  } catch (err: any) {
    console.error("[PERMISSIONS] Error fetching all permissions:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/io/permissions/:ohr_id — single employee's permissions
router.get("/permissions/:ohr_id", async (req: Request, res: Response) => {
  try {
    const { ohr_id } = req.params;
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const rows = await db.select().from(ioPermissions).where(eq(ioPermissions.ohr_id, ohr_id));
    const perms: Record<string, boolean> = {};
    for (const row of rows) perms[row.permission_key] = row.granted;

    // Also fetch employee info for context
    const [emp] = await db.select().from(ioEmployees).where(eq(ioEmployees.ohr_id, ohr_id));

    res.json({
      ohr_id,
      employee: emp ? { full_name: emp.full_name, actual_role: emp.actual_role, employement_status: emp.employement_status } : null,
      permissions: perms,
      all_keys: ALL_PERMISSION_KEYS,
    });
  } catch (err: any) {
    console.error("[PERMISSIONS] Error fetching permissions for", req.params.ohr_id, err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/io/permissions/:ohr_id — update permissions (admin only)
router.put("/permissions/:ohr_id", async (req: Request, res: Response) => {
  try {
    const { ohr_id } = req.params;
    const { permissions, actor_ohr, actor_name } = req.body;
    // permissions: { "nav.anchor": true, "anchor.edit_attendance": false, ... }

    if (!permissions || typeof permissions !== 'object') {
      return res.status(400).json({ error: "permissions object required" });
    }

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    // Get current permissions for diff/audit
    const currentRows = await db.select().from(ioPermissions).where(eq(ioPermissions.ohr_id, ohr_id));
    const currentMap: Record<string, boolean> = {};
    for (const row of currentRows) currentMap[row.permission_key] = row.granted;

    const changes: Array<{ key: string; old_value: boolean; new_value: boolean }> = [];

    for (const [key, granted] of Object.entries(permissions)) {
      if (!ALL_PERMISSION_KEYS.includes(key)) continue;
      const grantedBool = Boolean(granted);
      const oldVal = currentMap[key];

      // Track changes for audit
      if (oldVal !== undefined && oldVal !== grantedBool) {
        changes.push({ key, old_value: oldVal, new_value: grantedBool });
      } else if (oldVal === undefined) {
        changes.push({ key, old_value: false, new_value: grantedBool });
      }

      // Upsert
      if (key in currentMap) {
        await db.update(ioPermissions)
          .set({ granted: grantedBool, updated_by: actor_ohr || 'SYSTEM' })
          .where(and(eq(ioPermissions.ohr_id, ohr_id), eq(ioPermissions.permission_key, key)));
      } else {
        await db.insert(ioPermissions).values({
          ohr_id,
          permission_key: key,
          granted: grantedBool,
          updated_by: actor_ohr || 'SYSTEM',
        });
      }
    }

    // Audit log each change
    if (changes.length > 0) {
      for (const change of changes) {
        await db.insert(ioAuditLog).values({
          record_type: 'permission',
          record_id: ohr_id,
          action: change.new_value ? 'grant' : 'revoke',
          field_name: change.key,
          old_value: String(change.old_value),
          new_value: String(change.new_value),
          actor_ohr: actor_ohr || 'SYSTEM',
          actor_name: actor_name || 'System',
          timestamp: new Date().toISOString(),
        });
      }
      console.log(`[PERMISSIONS] ${changes.length} permission changes for ${ohr_id} by ${actor_ohr}`);
    }

    res.json({ ok: true, changes_count: changes.length });
  } catch (err: any) {
    console.error("[PERMISSIONS] Error updating permissions for", req.params.ohr_id, err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/permissions/seed/:ohr_id — seed defaults for a single employee (used when new employee added)
router.post("/permissions/seed/:ohr_id", async (req: Request, res: Response) => {
  try {
    const { ohr_id } = req.params;
    const { role } = req.body;
    if (!role) return res.status(400).json({ error: "role required" });

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const defaults = getPermissionDefaults(role, ohr_id);
    const rows = Object.entries(defaults).map(([key, granted]) => ({
      ohr_id,
      permission_key: key,
      granted,
      updated_by: 'SYSTEM',
    }));

    // Check if already seeded
    const existing = await db.select().from(ioPermissions).where(eq(ioPermissions.ohr_id, ohr_id));
    if (existing.length > 0) {
      return res.json({ ok: true, message: 'Already seeded', count: existing.length });
    }

    for (const row of rows) {
      await db.insert(ioPermissions).values(row);
    }

    res.json({ ok: true, count: rows.length });
  } catch (err: any) {
    console.error("[PERMISSIONS] Error seeding permissions for", req.params.ohr_id, err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/permissions/bulk-key-update — update a single permission key for all employees (admin only)
router.post("/permissions/bulk-key-update", async (req: Request, res: Response) => {
  try {
    const { permission_key, granted, actor_ohr } = req.body;
    if (!permission_key || typeof granted !== 'boolean') {
      return res.status(400).json({ error: "permission_key (string) and granted (boolean) required" });
    }
    if (!ALL_PERMISSION_KEYS.includes(permission_key)) {
      return res.status(400).json({ error: `Invalid permission key: ${permission_key}` });
    }
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    // Single UPDATE statement for all rows with this key
    const result = await db.update(ioPermissions)
      .set({ granted, updated_by: actor_ohr || 'SYSTEM' })
      .where(eq(ioPermissions.permission_key, permission_key));

    console.log(`[PERMISSIONS] Bulk update: ${permission_key} = ${granted} by ${actor_ohr}`);
    res.json({ ok: true, permission_key, granted });
  } catch (err: any) {
    console.error("[PERMISSIONS] Bulk key update error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// WFM Temporary User — Session Logging
// ============================================================

// Log WFM login/action for traceability (shared-credential audit trail)
router.post("/wfm-session-log", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const { action: act, details } = req.body;
    const ip = req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "unknown";
    const ua = req.headers["user-agent"] || "unknown";
    await db.insert(wfmSessionLog).values({
      login_at: new Date().toISOString(),
      ip_address: typeof ip === "string" ? ip.split(",")[0].trim() : "unknown",
      user_agent: ua,
      action: act || "login",
      details: details || null,
    });
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[WFM-LOG] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get WFM session log history (admin-only, for audit)
router.get("/wfm-session-log", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const rows = await db.select().from(wfmSessionLog).orderBy(desc(wfmSessionLog.id)).limit(200);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// NTE BUILD ASSIST — AI Narrative Generation
// ============================================================

router.post("/nte-build-assist/generate", async (req: Request, res: Response) => {
  try {
    const { employee, violation, violations, cap_level, date_range, attendance, previous_ntes } = req.body;
    const allViolations = (violations && violations.length > 0) ? violations : (violation ? [violation] : []);

    if (!employee || allViolations.length === 0) {
      return res.status(400).json({ error: "Employee and at least one violation are required" });
    }

    // Build attendance summary for the AI
    const attSummary = (attendance || []).map((a: any) => {
      const tag = (a.tag || '—').toUpperCase();
      return `${a.log_date}: ${tag}${a.upl_reason ? ' (' + a.upl_reason + ')' : ''}`;
    }).join('\n');

    // Build previous NTE context
    const prevNteSummary = (previous_ntes || []).length > 0
      ? (previous_ntes || []).map((n: any) => `- ${n.cap_level} on ${n.date_of_incident || 'unknown date'}: ${n.incident_description || 'No description'}`).join('\n')
      : 'None on record.';

    // Identify violation dates (UPL, NCNS, LATE)
    const violationTags = ['UPL', 'NCNS', 'LATE', 'AWOL'];
    const violationDates = (attendance || []).filter((a: any) => violationTags.includes((a.tag || '').toUpperCase())).map((a: any) => {
      const d = new Date(a.log_date + 'T00:00:00');
      return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    });

    const systemPrompt = `You are a professional HR document writer for Genpact Philippines. You write Notice to Explain (NTE) letters that are formal, precise, and legally compliant with Philippine labor law (Article 282 of the Labor Code). Your tone is firm but fair, using third-person formal language.

IMPORTANT RULES:
- Use formal business English
- Reference specific dates and facts from the attendance data
- Cite the exact policy section and subsection from GP HR Procedures & Policy 3.0
- Do NOT fabricate dates or facts not in the provided data
- Keep the narrative concise (2-3 paragraphs)
- Use the employee's last name with appropriate honorific (Mr./Ms.)`;

    const userPrompt = `Generate two sections for an NTE letter:

**EMPLOYEE:**
- Name: ${employee.full_name}
- OHR ID: ${employee.ohr_id}
- Role: ${employee.actual_role || 'Process Associate'}
- Planning Group: ${employee.planning_group || 'N/A'}
- Supervisor: ${employee.supervisor_name || 'N/A'}

**VIOLATION(S):**
${allViolations.map((v: any, i: number) => `Violation ${i + 1}:\n- Code: ${v.code}\n- Description: ${v.type || v.text || 'N/A'}\n- Section: ${v.category || 'N/A'}\n- Subsection: ${v.subsection || (v.subsectionCode ? (v.subsectionCode + ' ' + (v.subsectionTitle || '')) : 'N/A')}\n- Standard Penalty: ${v.penalty}`).join('\n\n')}
- Recommended CAP Level: ${cap_level}

**DATE RANGE:** ${date_range?.start || 'N/A'} to ${date_range?.end || 'N/A'}

**ATTENDANCE DATA:**
${attSummary || 'No attendance data provided.'}

**VIOLATION DATES:** ${violationDates.length > 0 ? violationDates.join(', ') : 'See attendance data above'}

**PREVIOUS NTEs:**
${prevNteSummary}

Please generate:

1. **INCIDENT NARRATIVE** (2-3 paragraphs): A formal description of the incident(s) referencing specific dates from the attendance data. Start with "This serves to formally notify..." or similar formal opening. Reference the specific dates of violation. If this is a repeat offense, mention the previous NTEs.

2. **POLICY VIOLATED**: For each violation, cite the specific sections of GP HR Procedures & Policy 3.0 that were violated. Format as a hierarchical list with each level on its own line:
   - For each violation, output: section title, subsection code+title, sub-subsection code+description
   - If multiple violations share the same section, do NOT repeat the section header
   - If multiple violations share the same section AND subsection, do NOT repeat either
   - Use the EXACT section, subsection, and sub-subsection from the violation data provided above
   - Do NOT include any intro text, Article 282 references, or outro text
   - ONLY output the hierarchical lines, nothing else

Format your response as JSON with two keys: "narrative" (HTML string) and "policy_text" (HTML string with each line separated by <br> tags, NO bullet points or list markers).`;

    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "nte_narrative",
          strict: true,
          schema: {
            type: "object",
            properties: {
              narrative: { type: "string", description: "HTML-formatted incident narrative (2-3 paragraphs)" },
              policy_text: { type: "string", description: "HTML-formatted policy citations with bullet points" }
            },
            required: ["narrative", "policy_text"],
            additionalProperties: false
          }
        }
      }
    });

    const rawContent = response?.choices?.[0]?.message?.content || '{}';
    const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      // If JSON parsing fails, use the raw content
      parsed = { narrative: content, policy_text: '' };
    }

    res.json({
      narrative: parsed.narrative || '',
      policy_text: parsed.policy_text || ''
    });
  } catch (err: any) {
    console.error("[IO API] NTE Build Assist generate error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// NTE BUILD ASSIST — DOCX Document Generation
// ============================================================

router.post("/nte-build-assist/docx", async (req: Request, res: Response) => {
  try {
    const { generateNTEDocx } = await import("./nte-docx-generator.js");
    const {
      date, employee, narrative, policy_sections, cap_level,
      violation, violations, flm_name, hr_name,
      include_cwd_page
    } = req.body;

    if (!employee || !narrative) {
      return res.status(400).json({ error: "Employee and narrative are required" });
    }

    // Extract last name from full_name ("Last, First Middle" format)
    const nameParts = (employee.full_name || "").split(",");
    const lastName = nameParts[0]?.trim() || employee.full_name;

    const buffer = await generateNTEDocx({
      date: date || new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
      employee: {
        full_name: employee.full_name,
        last_name: lastName,
        ohr_id: employee.ohr_id || "",
        actual_role: employee.actual_role || "Process Associate",
        department: employee.department || "Operations",
        supervisor_name: employee.supervisor_name || "",
        gender: employee.gender || "Male",
        sex: employee.sex || "",
      },
      narrative: narrative || "",
      policy_sections: Array.isArray(policy_sections) ? policy_sections : (policy_sections ? [policy_sections] : []),
      cap_level: cap_level || "CAP 0",
      violation: violation || (violations && violations[0]) || { code: "", type: "", category: "", penalty: "" },
      violations: violations || (violation ? [violation] : []),
      flm_name: flm_name || employee.supervisor_name || "",
      hr_name: hr_name || "Jocelyn Ramos",
      include_cwd_page: include_cwd_page || false,
    });

    // Sanitize filename
    const safeName = (employee.full_name || "Employee").replace(/[^a-zA-Z0-9 ,]/g, "").replace(/\s+/g, "_");
    const filename = `NTE_${safeName}_${new Date().toISOString().slice(0, 10)}.docx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err: any) {
    console.error("[IO API] NTE DOCX generation error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Corrective Actions (NTE → CAP Lifecycle)
// ============================================================

// CAP level → active period in days (from GPHR Policy v3.0)
const CAP_ACTIVE_DAYS: Record<string, number> = {
  'CAP 0': 0,
  'CAP 1': 60,
  'CAP 2': 90,
  'CAP 3': 180,
  'Corrective Suspension': 0,
  'Review for Termination': 0,
};

// GET /api/io/corrective-actions — list with filters
router.get("/corrective-actions", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { ohr_id, status, nte_type, planning_group, supervisor_ohr, start_date, end_date, limit: lim, offset: off } = req.query;
    const conditions: any[] = [];

    if (ohr_id) conditions.push(eq(ioCorrectiveActions.ohr_id, String(ohr_id)));
    if (status) conditions.push(eq(ioCorrectiveActions.status, String(status)));
    if (nte_type) conditions.push(eq(ioCorrectiveActions.nte_type, String(nte_type)));
    if (planning_group) conditions.push(eq(ioCorrectiveActions.planning_group, String(planning_group)));
    if (supervisor_ohr) conditions.push(eq(ioCorrectiveActions.supervisor_ohr, String(supervisor_ohr)));
    if (start_date) conditions.push(gte(ioCorrectiveActions.date_of_incident, String(start_date)));
    if (end_date) conditions.push(lte(ioCorrectiveActions.date_of_incident, String(end_date)));

    let q = db.select().from(ioCorrectiveActions);
    if (conditions.length > 0) q = q.where(and(...conditions)) as any;
    q = q.orderBy(desc(ioCorrectiveActions.created_at)) as any;
    if (lim) q = q.limit(Number(lim)) as any;
    if (off) q = q.offset(Number(off)) as any;

    const rows = await q;
    res.json(rows);
  } catch (err: any) {
    console.error("[IO API] corrective-actions GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/io/corrective-actions/stats — summary card counts
router.get("/corrective-actions/stats", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const all = await db.select().from(ioCorrectiveActions);
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);

    // Auto-expire CAPs past their expiry date
    const toExpire = all.filter(r => r.status === 'CAP Issued' && r.cap_expiry_date && r.cap_expiry_date < today);
    for (const r of toExpire) {
      await db.update(ioCorrectiveActions)
        .set({ status: 'Expired', updated_at: now.toISOString() })
        .where(eq(ioCorrectiveActions.id, r.id));
      r.status = 'Expired'; // update in-memory too
    }

    const pending = all.filter(r => r.status === 'Served').length;
    const activeCaps = all.filter(r => r.status === 'CAP Issued').length;
    const expiringSoon = all.filter(r => r.status === 'CAP Issued' && r.cap_expiry_date && r.cap_expiry_date >= today && r.cap_expiry_date <= thirtyDaysFromNow).length;
    // Dismissed this quarter
    const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).toISOString().slice(0, 10);
    const dismissed = all.filter(r => r.status === 'Dismissed' && r.cap_decision_date && r.cap_decision_date >= qStart).length;

    res.json({ pending, activeCaps, expiringSoon, dismissed });
  } catch (err: any) {
    console.error("[IO API] corrective-actions/stats GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/io/corrective-actions/employee/:ohr_id/history — CAP history for an employee
router.get("/corrective-actions/employee/:ohr_id/history", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const rows = await db.select().from(ioCorrectiveActions)
      .where(eq(ioCorrectiveActions.ohr_id, req.params.ohr_id))
      .orderBy(desc(ioCorrectiveActions.created_at));
    res.json(rows);
  } catch (err: any) {
    console.error("[IO API] corrective-actions/history GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/io/corrective-actions/:id — single record
router.get("/corrective-actions/:id", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const [row] = await db.select().from(ioCorrectiveActions)
      .where(eq(ioCorrectiveActions.id, req.params.id));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err: any) {
    console.error("[IO API] corrective-actions/:id GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Server-side role enforcement: only TLs and Managers can create/modify CAs
async function caEnforceRole(req: Request, res: Response): Promise<boolean> {
  const actorOhr = req.body?.created_by_ohr || req.body?.decision_by_ohr || '';
  if (!actorOhr) { res.status(403).json({ error: 'Actor OHR required' }); return false; }
  // Admin bypass
  if (actorOhr === '740045023') return true;
  const db = await getDb();
  if (!db) { res.status(500).json({ error: 'DB unavailable' }); return false; }
  const [emp] = await db.select({ role: ioEmployees.actual_role }).from(ioEmployees).where(eq(ioEmployees.ohr_id, actorOhr)).limit(1);
  const role = emp?.role || '';
  if (role !== 'Team Lead' && role !== 'Manager') {
    console.warn(`[CA RBAC] Blocked ${actorOhr} (role=${role}) from CA write operation`);
    res.status(403).json({ error: 'Only Team Leads and Managers can perform this action' });
    return false;
  }
  return true;
}
// POST /api/io/corrective-actions — create new NTE
router.post("/corrective-actions", async (req: Request, res: Response) => {
  try {
    if (!(await caEnforceRole(req, res))) return;
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const body = req.body;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // Calculate response deadline: 48hrs for CAP ≤ 2, 5 days for CAP 3+
    let deadlineHours = 48;
    const indicatedCap = body.indicated_cap_level || '';
    if (['CAP 3', 'Corrective Suspension', 'Review for Termination'].includes(indicatedCap)) {
      deadlineHours = 120; // 5 days
    }
    const deadlineDate = new Date(Date.now() + deadlineHours * 3600000).toISOString();

    const record = {
      id,
      employee_name: body.employee_name,
      ohr_id: body.ohr_id,
      employee_email: body.employee_email || null,
      supervisor_name: body.supervisor_name || null,
      supervisor_ohr: body.supervisor_ohr || null,
      supervisor_email: body.supervisor_email || null,
      planning_group: body.planning_group || null,
      actual_role: body.actual_role || null,
      nte_type: body.nte_type || null,
      date_of_incident: body.date_of_incident || null,
      incident_description: body.incident_description || null,
      policy_violated: body.policy_violated || null,
      violations: body.violations ? JSON.stringify(body.violations) : null,
      response_deadline: deadlineDate,
      status: 'Served',
      served_date: now,
      linked_coaching_id: body.linked_coaching_id || null,
      attachments: body.attachments ? JSON.stringify(body.attachments) : null,
      created_by: body.created_by || null,
      created_by_ohr: body.created_by_ohr || null,
      created_at: now,
      updated_at: now,
    };

    await db.insert(ioCorrectiveActions).values(record);

    // Create notification for the agent
    try {
      await db.insert(ioNotifications).values({
        type: 'nte_issued',
        title: 'Notice to Explain Issued',
        message: `An NTE has been issued to you regarding: ${body.nte_type || 'Policy Violation'}. Please respond within ${deadlineHours} hours.`,
        actor_ohr: body.created_by_ohr || null,
        actor_name: body.created_by || 'System',
        target_ohr: body.ohr_id,
        target_role: 'agent',
        metadata: JSON.stringify({ ca_id: id, nte_type: body.nte_type }),
        is_read: false,
        created_at: now,
      });
    } catch (notifErr: any) {
      console.error('[IO API] NTE notification error:', notifErr.message);
    }

    // Notification: NTE Served — notify the issuing TL/creator
    try {
      if (body.created_by_ohr && body.created_by_ohr !== body.ohr_id) {
        await db.insert(ioNotifications).values({
          type: 'nte_served',
          title: `NTE Served — ${body.employee_name || body.ohr_id}`,
          message: `NTE for ${body.employee_name || body.ohr_id} regarding ${body.nte_type || 'Policy Violation'} has been served. Deadline: ${deadlineHours} hours.`,
          actor_ohr: body.ohr_id,
          actor_name: body.employee_name || 'Employee',
          target_ohr: body.created_by_ohr,
          metadata: JSON.stringify({ ca_id: id, nte_type: body.nte_type, employee_name: body.employee_name }),
          is_read: false,
          created_at: now,
        });
      }
    } catch (notifErr: any) {
      console.error('[IO API] NTE served notification error:', notifErr.message);
    }

    // Notification: Repeat Offender — if agent has 2+ NTEs in last 90 days
    try {
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const recentNtes = await db.select({ id: ioCorrectiveActions.id })
        .from(ioCorrectiveActions)
        .where(and(
          eq(ioCorrectiveActions.ohr_id, body.ohr_id),
          gte(ioCorrectiveActions.created_at, ninetyDaysAgo)
        ));
      if (recentNtes.length >= 2 && body.created_by_ohr) {
        await db.insert(ioNotifications).values({
          type: 'repeat_offender',
          title: `Repeat Offender — ${body.employee_name || body.ohr_id}`,
          message: `${body.employee_name || body.ohr_id} has received ${recentNtes.length} NTEs in the last 90 days. Consider escalation.`,
          actor_ohr: 'SYSTEM',
          actor_name: 'Playbook System',
          target_ohr: body.created_by_ohr,
          metadata: JSON.stringify({ ca_id: id, total_ntes_90d: recentNtes.length, employee_name: body.employee_name, ohr_id: body.ohr_id }),
          is_read: false,
          created_at: now,
        });
        // Also notify the supervisor if different from creator
        if (body.supervisor_ohr && body.supervisor_ohr !== body.created_by_ohr) {
          await db.insert(ioNotifications).values({
            type: 'repeat_offender',
            title: `Repeat Offender — ${body.employee_name || body.ohr_id}`,
            message: `${body.employee_name || body.ohr_id} has received ${recentNtes.length} NTEs in the last 90 days. Consider escalation.`,
            actor_ohr: 'SYSTEM',
            actor_name: 'Playbook System',
            target_ohr: body.supervisor_ohr,
            metadata: JSON.stringify({ ca_id: id, total_ntes_90d: recentNtes.length, employee_name: body.employee_name, ohr_id: body.ohr_id }),
            is_read: false,
            created_at: now,
          });
        }
      }
    } catch (notifErr: any) {
      console.error('[IO API] Repeat offender notification error:', notifErr.message);
    }

    res.status(201).json({ ...record, id });
  } catch (err: any) {
    console.error("[IO API] corrective-actions POST error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/io/corrective-actions/:id — update (assign CAP, dismiss)
router.patch("/corrective-actions/:id", async (req: Request, res: Response) => {
  try {
    if (!(await caEnforceRole(req, res))) return;
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { id } = req.params;
    const body = req.body;
    const now = new Date().toISOString();

    const [existing] = await db.select().from(ioCorrectiveActions)
      .where(eq(ioCorrectiveActions.id, id));
    if (!existing) return res.status(404).json({ error: "Not found" });

    const updates: any = { updated_at: now };

    // Assign CAP
    if (body.action === 'assign_cap') {
      if (existing.status !== 'Served') {
        return res.status(400).json({ error: "Can only assign CAP to NTEs with 'Served' status" });
      }
      updates.status = 'CAP Issued';
      updates.cap_level = body.cap_level;
      updates.cap_active_days = CAP_ACTIVE_DAYS[body.cap_level] ?? 0;
      updates.cap_decision_date = now;
      updates.cap_decision_by = body.decision_by || null;
      updates.cap_decision_by_ohr = body.decision_by_ohr || null;
      updates.cap_remarks = body.remarks || null;
      updates.cap_start_date = body.cap_start_date || now.slice(0, 10);
      const activeDays = updates.cap_active_days;
      if (activeDays > 0) {
        const start = new Date(updates.cap_start_date + 'T00:00:00Z');
        start.setUTCDate(start.getUTCDate() + activeDays);
        updates.cap_expiry_date = start.toISOString().slice(0, 10);
      }
      updates.suspension_days = body.suspension_days || null;
      if (body.nod_issued) {
        updates.nod_issued = true;
        updates.nod_date = now;
        updates.nod_summary = body.nod_summary || null;
      }

      // Notification: CAP Issued
      try {
        await db.insert(ioNotifications).values({
          type: 'cap_issued',
          title: `Corrective Action Issued — ${body.cap_level}`,
          message: `A ${body.cap_level} corrective action has been issued to you. ${activeDays > 0 ? `Active period: ${activeDays} days.` : ''}`,
          actor_ohr: body.decision_by_ohr || null,
          actor_name: body.decision_by || 'System',
          target_ohr: existing.ohr_id,
          target_role: 'agent',
          metadata: JSON.stringify({ ca_id: id, cap_level: body.cap_level }),
          is_read: false,
          created_at: now,
        });
      } catch (notifErr: any) {
        console.error('[IO API] CAP notification error:', notifErr.message);
      }

      // Notification: CAP Issued — Supervisor Copy
      try {
        if (existing.supervisor_ohr && existing.supervisor_ohr !== body.decision_by_ohr) {
          await db.insert(ioNotifications).values({
            type: 'cap_issued',
            title: `CAP Issued to ${existing.employee_name || existing.ohr_id} — ${body.cap_level}`,
            message: `A ${body.cap_level} corrective action has been issued to ${existing.employee_name || existing.ohr_id}. ${activeDays > 0 ? `Active period: ${activeDays} days.` : ''}`,
            actor_ohr: body.decision_by_ohr || null,
            actor_name: body.decision_by || 'System',
            target_ohr: existing.supervisor_ohr,
            metadata: JSON.stringify({ ca_id: id, cap_level: body.cap_level, employee_name: existing.employee_name, ohr_id: existing.ohr_id }),
            is_read: false,
            created_at: now,
          });
        }
      } catch (notifErr: any) {
        console.error('[IO API] CAP supervisor notification error:', notifErr.message);
      }

      // Notification: CAP Escalation Path — if agent moves from CAP 1→2 or CAP 2→3
      try {
        const capNum = parseInt((body.cap_level || '').replace(/\D/g, ''), 10);
        if (capNum >= 2) {
          const prevCapLevel = `CAP ${capNum - 1}`;
          const prevCaps = await db.select({ id: ioCorrectiveActions.id })
            .from(ioCorrectiveActions)
            .where(and(
              eq(ioCorrectiveActions.ohr_id, existing.ohr_id),
              eq(ioCorrectiveActions.cap_level, prevCapLevel)
            ));
          if (prevCaps.length > 0) {
            // Notify the decision-maker (TL)
            if (body.decision_by_ohr) {
              await db.insert(ioNotifications).values({
                type: 'cap_escalated',
                title: `CAP Escalation — ${existing.employee_name || existing.ohr_id}`,
                message: `${existing.employee_name || existing.ohr_id} has been escalated from ${prevCapLevel} to ${body.cap_level}. Review corrective action history.`,
                actor_ohr: 'SYSTEM',
                actor_name: 'Playbook System',
                target_ohr: body.decision_by_ohr,
                metadata: JSON.stringify({ ca_id: id, from_level: prevCapLevel, to_level: body.cap_level, employee_name: existing.employee_name }),
                is_read: false,
                created_at: now,
              });
            }
            // Notify the supervisor if different
            if (existing.supervisor_ohr && existing.supervisor_ohr !== body.decision_by_ohr) {
              await db.insert(ioNotifications).values({
                type: 'cap_escalated',
                title: `CAP Escalation — ${existing.employee_name || existing.ohr_id}`,
                message: `${existing.employee_name || existing.ohr_id} has been escalated from ${prevCapLevel} to ${body.cap_level}. Review corrective action history.`,
                actor_ohr: 'SYSTEM',
                actor_name: 'Playbook System',
                target_ohr: existing.supervisor_ohr,
                metadata: JSON.stringify({ ca_id: id, from_level: prevCapLevel, to_level: body.cap_level, employee_name: existing.employee_name }),
                is_read: false,
                created_at: now,
              });
            }
          }
        }
      } catch (notifErr: any) {
        console.error('[IO API] CAP escalation notification error:', notifErr.message);
      }
    }

    // Dismiss
    if (body.action === 'dismiss') {
      if (existing.status !== 'Served') {
        return res.status(400).json({ error: "Can only dismiss NTEs with 'Served' status" });
      }
      updates.status = 'Dismissed';
      updates.cap_decision_date = now;
      updates.cap_decision_by = body.decision_by || null;
      updates.cap_decision_by_ohr = body.decision_by_ohr || null;
      updates.cap_remarks = body.remarks || null;
      if (body.nod_issued) {
        updates.nod_issued = true;
        updates.nod_date = now;
        updates.nod_summary = body.nod_summary || null;
      }

      // Notification: NTE Dismissed
      try {
        await db.insert(ioNotifications).values({
          type: 'nte_dismissed',
          title: 'NTE Dismissed — No Further Action',
          message: 'Your Notice to Explain has been reviewed and dismissed. No further action is required.',
          actor_ohr: body.decision_by_ohr || null,
          actor_name: body.decision_by || 'System',
          target_ohr: existing.ohr_id,
          target_role: 'agent',
          metadata: JSON.stringify({ ca_id: id }),
          is_read: false,
          created_at: now,
        });
      } catch (notifErr: any) {
        console.error('[IO API] Dismiss notification error:', notifErr.message);
      }
    }

    // Generic field updates (for editing NTE details before CAP decision)
    if (!body.action) {
      const allowedFields = ['nte_type', 'date_of_incident', 'incident_description', 'policy_violated', 'violations', 'attachments'];
      for (const f of allowedFields) {
        if (body[f] !== undefined) {
          updates[f] = f === 'violations' || f === 'attachments' ? JSON.stringify(body[f]) : body[f];
        }
      }
    }

    await db.update(ioCorrectiveActions).set(updates).where(eq(ioCorrectiveActions.id, id));

    const [updated] = await db.select().from(ioCorrectiveActions)
      .where(eq(ioCorrectiveActions.id, id));
    res.json(updated);
  } catch (err: any) {
    console.error("[IO API] corrective-actions PATCH error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/cap-build-assist/docx — Generate CAP 1/2/3 DOCX from CDN template
router.post("/cap-build-assist/docx", async (req: Request, res: Response) => {
  try {
    const {
      cap_level, employee, explanation_date, explanation_summary,
      violation_section, violation_subsection, violations,
      flm_name, issuance_date, nte_response_text
    } = req.body;

    if (!employee || !cap_level) {
      return res.status(400).json({ error: "Employee and CAP level are required" });
    }

    const TEMPLATE_URLS: Record<string, string> = {
      'CAP 1': 'https://d2xsxph8kpxj0f.cloudfront.net/310519663445219651/5AVfpygNb7cNbPRpHCcCdp/Template-CAP1_bfdc8261.docx',
      'CAP 2': 'https://d2xsxph8kpxj0f.cloudfront.net/310519663445219651/5AVfpygNb7cNbPRpHCcCdp/Template-CAP2_fbec4ea4.docx',
      'CAP 3': 'https://d2xsxph8kpxj0f.cloudfront.net/310519663445219651/5AVfpygNb7cNbPRpHCcCdp/Template-CAP3_bbb57f1f.docx',
    };

    const templateUrl = TEMPLATE_URLS[cap_level];
    if (!templateUrl) {
      return res.status(400).json({ error: `No template available for ${cap_level}` });
    }

    const templateResp = await fetch(templateUrl);
    if (!templateResp.ok) throw new Error(`Failed to fetch template: ${templateResp.status}`);
    const templateBuffer = Buffer.from(await templateResp.arrayBuffer());

    const PizZip = (await import("pizzip")).default;
    const zip = new PizZip(templateBuffer);

    const activeDays = CAP_ACTIVE_DAYS[cap_level] || 60;
    const startDate = issuance_date ? new Date(issuance_date) : new Date();
    const endDate = new Date(startDate.getTime() + activeDays * 24 * 60 * 60 * 1000);
    const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const issuanceDateStr = fmtDate(startDate);
    const activeEndDateStr = fmtDate(endDate);

    const employeeName = employee.full_name || 'Employee';
    const lastName = employeeName.split(',')[0]?.trim() || employeeName.split(' ').pop() || 'Employee';
    const supervisorName = flm_name || employee.supervisor_name || 'Supervisor';
    const violSection = violation_section || 'Section';
    const violSubsection = violation_subsection || 'Sub Section';
    const deliberationText = nte_response_text || explanation_summary || 'the administrative charge leveled against you has been reviewed.';

    const capNum = cap_level.replace('CAP ', '');
    const replacements: Record<string, string> = {
      'December 22, 2023': issuanceDateStr,
      'Name of Employee': employeeName,
      'Dear Mr./Ms. Last Name,': `Dear Mr./Ms. ${lastName},`,
      'This is to inform you that after due deliberation on the administrative charge leveled against you, you have stated in your explanation letter dated 12th Dec 2023 that you waited in the zoom session for your M and G , but , did not receive any explanation for the M and G with and the declined post for.': `This is to inform you that after due deliberation on the administrative charge leveled against you, ${deliberationText}`,
      'Section 3 Misconduct and Acts of Negligence': violSection,
      'Sub Section D Insubordination or serious misconduct or willful disobedience by the employee of the lawful orders of his employer or representative in connection with his work.': violSubsection,
      'Name of FLM': supervisorName,
    };

    if (capNum === '1') {
      replacements['This violation merits First Formal Corrective Action (CAP 1) which will remain active for one (1) month  = 30 days and shall become effective until 19th Feb 2024.'] =
        `This violation merits First Formal Corrective Action (CAP 1) which will remain active for ${activeDays} days and shall become effective until ${activeEndDateStr}.`;
    } else if (capNum === '2') {
      replacements['This violation merits Second Formal Corrective Action (CAP 2) which will remain active for two (2) month2  = 60 days and shall become effective until <60 days from issuance date>'] =
        `This violation merits Second Formal Corrective Action (CAP 2) which will remain active for ${activeDays} days and shall become effective until ${activeEndDateStr}.`;
    } else if (capNum === '3') {
      replacements['This violation merits Third Formal Corrective Action (CAP 3) which will remain active for three (3) months = 90 days and shall become effective until <90 days from issuance date>'] =
        `This violation merits Third Formal Corrective Action (CAP 3) which will remain active for ${activeDays} days and shall become effective until ${activeEndDateStr}.`;
    }

    const xmlFiles = Object.keys(zip.files).filter(f => f.endsWith('.xml') && !f.startsWith('_rels/'));
    for (const xmlFile of xmlFiles) {
      let content = zip.file(xmlFile)?.asText();
      if (!content) continue;
      for (const [search, replace] of Object.entries(replacements)) {
        content = content.split(search).join(replace);
      }
      zip.file(xmlFile, content);
    }

    const docxBuffer = Buffer.from(zip.generate({ type: 'nodebuffer' }));
    const safeName = employeeName.replace(/[^a-zA-Z0-9 ,]/g, '').replace(/\s+/g, '_');
    const filename = `${cap_level.replace(' ', '')}_${safeName}_${new Date().toISOString().slice(0, 10)}.docx`;

    // Notification: Document Generated
    try {
      const db = await getDb();
      if (db) {
        const creatorOhr = req.body.created_by_ohr || null;
        if (creatorOhr) {
          await db.insert(ioNotifications).values({
            type: 'docx_generated',
            title: `${cap_level} Document Generated`,
            message: `${cap_level} document for ${employeeName} has been generated and downloaded successfully.`,
            actor_ohr: creatorOhr,
            actor_name: req.body.created_by || 'System',
            target_ohr: creatorOhr,
            metadata: JSON.stringify({ cap_level, employee_name: employeeName, filename }),
            is_read: false,
            created_at: new Date().toISOString(),
          });
        }
      }
    } catch (notifErr: any) {
      console.error('[IO API] DOCX generated notification error:', notifErr.message);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(docxBuffer);
  } catch (err: any) {
    console.error('[IO API] CAP DOCX generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/cap-build-assist/generate — AI-generate CAP deliberation narrative
router.post("/cap-build-assist/generate", async (req: Request, res: Response) => {
  try {
    const { invokeLLM } = await import("./_core/llm.js");
    const { employee, violation, violations, cap_level, explanation_date, explanation_summary, nte_narrative, previous_caps } = req.body;

    if (!employee || !cap_level) {
      return res.status(400).json({ error: 'Employee and CAP level are required' });
    }

    const violationsList = (violations || (violation ? [violation] : [])).map((v: any) =>
      `${v.code || ''}: ${v.text || ''} (${v.category || ''} — ${v.subsection || ''})`
    ).join('\n');

    const previousCapsText = (previous_caps || []).map((ca: any) =>
      `- ${ca.cap_level}: ${ca.date_of_incident || 'N/A'} — ${(ca.incident_description || '').replace(/<[^>]*>/g, '').substring(0, 150)}`
    ).join('\n');

    const capNum = cap_level.replace('CAP ', '');
    const capLabels: Record<string, string> = { '1': 'First', '2': 'Second', '3': 'Third' };

    const systemPrompt = `You are an HR document specialist for Genpact Philippines. Generate a formal Corrective Action deliberation paragraph for a ${cap_level} (${capLabels[capNum] || capNum} Formal Corrective Action).

The paragraph should:
1. Reference the employee's explanation (date: ${explanation_date || 'N/A'}, summary: ${explanation_summary || 'N/A'})
2. State that after due deliberation, the explanation does not excuse the charge
3. Be written in formal HR language, third person
4. Be 2-3 sentences maximum
5. NOT include the violation section or CAP level — those are in separate template sections

Return JSON with:
- "deliberation": the deliberation paragraph text
- "violation_section": the primary policy section violated
- "violation_subsection": the specific sub-section`;

    const userPrompt = `Employee: ${employee.full_name} (${employee.ohr_id})
Role: ${employee.actual_role || 'Process Associate'}
CAP Level: ${cap_level}

Violation(s):
${violationsList}

Explanation Letter Date: ${explanation_date || 'Not provided'}
Explanation Summary: ${explanation_summary || 'Not provided'}

Original NTE Narrative:
${(nte_narrative || '').replace(/<[^>]*>/g, '').substring(0, 500)}

Previous Corrective Actions:
${previousCapsText || 'None'}`;

    const llmResp = await invokeLLM({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'cap_deliberation',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              deliberation: { type: 'string', description: 'The deliberation paragraph for the CAP letter' },
              violation_section: { type: 'string', description: 'Primary policy section violated' },
              violation_subsection: { type: 'string', description: 'Specific sub-section violated' },
            },
            required: ['deliberation', 'violation_section', 'violation_subsection'],
            additionalProperties: false,
          },
        },
      },
    });

    const content = llmResp?.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(String(content));

    res.json({
      deliberation: parsed.deliberation || '',
      violation_section: parsed.violation_section || '',
      violation_subsection: parsed.violation_subsection || '',
    });
  } catch (err: any) {
    console.error('[IO API] CAP AI generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// WFM Schedule Upload — parse OHR x Date CSV matrix, store in
// io_wfm_schedules, and backfill io_attendance.wfm_tag
// ============================================================

/**
 * POST /api/io/wfm-schedule-upload
 * Body: { rows: string[][] } — first row is header [OHR, Employee Name, date1, date2, ...]
 * Subsequent rows: [ohrId, name, value1, value2, ...]
 * Values are shift times ("22:30-07:30"), tags (PL, WO, LOA, ML, BOJ, Exit, NH Training), or empty.
 */
router.post("/wfm-schedule-upload", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const { rows, uploadedBy } = req.body;
    if (!rows || !Array.isArray(rows) || rows.length < 2) {
      return res.status(400).json({ error: "rows array with header + data is required" });
    }

    const now = new Date().toISOString();
    const uploaderName = uploadedBy || 'System';

    // Parse header row to extract date columns
    const headerRow = rows[0];
    // First 2 columns are OHR and Employee Name, rest are dates
    const dateColumns: string[] = [];
    for (let c = 2; c < headerRow.length; c++) {
      const raw = String(headerRow[c] || '').trim();
      if (!raw) continue;
      // Accept ISO dates, DD-Mon (28-Mar), Excel serial numbers, or other parseable formats
      let dateStr = '';
      if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
        // ISO: 2026-03-28
        dateStr = raw.substring(0, 10);
      } else if (/^\d+$/.test(raw)) {
        // Excel serial number → JS date
        const excelEpoch = new Date(1899, 11, 30);
        const d = new Date(excelEpoch.getTime() + parseInt(raw) * 86400000);
        dateStr = d.toISOString().substring(0, 10);
      } else if (/^\d{1,2}-[A-Za-z]{3}$/.test(raw)) {
        // DD-Mon format (28-Mar, 1-Apr) — infer current year
        const currentYear = new Date().getFullYear();
        const d = new Date(`${raw}-${currentYear}`);
        if (!isNaN(d.getTime())) {
          dateStr = d.toISOString().substring(0, 10);
        }
      } else {
        // Try parsing as date string; if no year, append current year
        let d = new Date(raw);
        if (!isNaN(d.getTime())) {
          // Check if year defaulted to 2001 (no year in input)
          if (d.getFullYear() === 2001 && !/\d{4}/.test(raw)) {
            d = new Date(`${raw} ${new Date().getFullYear()}`);
          }
          if (!isNaN(d.getTime())) {
            dateStr = d.toISOString().substring(0, 10);
          }
        }
      }
      dateColumns.push(dateStr || '');
    }

    if (dateColumns.filter(d => d).length === 0) {
      return res.status(400).json({ error: "No valid date columns found in header" });
    }

    // Collect all unique dates
    const uniqueDates = Array.from(new Set(dateColumns.filter(d => d)));

    // Load existing OHR+date pairs to skip duplicates (append-only)
    const existingPairs = new Set<string>();
    for (const d of uniqueDates) {
      const [existing]: any = await db.execute(
        sql`SELECT ohr_id FROM io_wfm_schedules WHERE schedule_date = ${d}`
      );
      for (const row of existing) {
        existingPairs.add(`${row.ohr_id}|${d}`);
      }
    }
    let skippedDuplicates = 0;

    // WFM Tag mapping: time patterns (HH:MM-HH:MM) and BOJ → "Scheduled"
    // Keep as-is: WO, PL, ML, LOA, Exit, NH Training
    const TIME_PATTERN = /^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/;
    const SCHEDULED_ALIASES = new Set(['BOJ']);
    const mapWfmTag = (rawValue: string): string => {
      if (TIME_PATTERN.test(rawValue)) return 'Scheduled';
      if (SCHEDULED_ALIASES.has(rawValue.toUpperCase())) return 'Scheduled';
      return rawValue; // WO, PL, ML, LOA, Exit, NH Training pass through
    };

    // Parse data rows and build insert records
    const BULK_SIZE = 500;
    let totalInserted = 0;
    let scheduleRecords: string[][] = [];

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const ohr = String(row[0] || '').trim();
      if (!ohr || ohr === 'OHR') continue; // skip empty or duplicate headers

      for (let c = 2; c < row.length && (c - 2) < dateColumns.length; c++) {
        const dateStr = dateColumns[c - 2];
        if (!dateStr) continue;
        const rawValue = String(row[c] || '').trim();
        if (!rawValue) continue;
        const mappedTag = mapWfmTag(rawValue);
        const pairKey = `${ohr}|${dateStr}`;
        if (existingPairs.has(pairKey)) {
          skippedDuplicates++;
          continue; // Skip duplicate — already exists in DB
        }
        existingPairs.add(pairKey); // Prevent intra-batch duplicates
        scheduleRecords.push([ohr, dateStr, mappedTag, now, uploaderName]);

        // Flush in chunks
        if (scheduleRecords.length >= BULK_SIZE) {
          totalInserted += await flushWfmRecords(db, scheduleRecords);
          scheduleRecords = [];
        }
      }
    }
    // Flush remaining
    if (scheduleRecords.length > 0) {
      totalInserted += await flushWfmRecords(db, scheduleRecords);
    }

    // Backfill io_attendance.wfm_tag from io_wfm_schedules
    let backfilled = 0;
    try {
      const backfillResult: any = await db.execute(
        sql`UPDATE io_attendance a
            INNER JOIN io_wfm_schedules w
              ON a.ohr_id = w.ohr_id AND a.log_date = w.schedule_date
            SET a.wfm_tag = w.wfm_value`
      );
      const info = Array.isArray(backfillResult[0]) ? backfillResult[0] : backfillResult;
      backfilled = info.affectedRows || 0;
    } catch (bfErr: any) {
      console.error('[IO API] WFM backfill error:', bfErr.message);
    }

    console.log(`[IO API] WFM schedule uploaded: ${totalInserted} records, ${backfilled} attendance rows backfilled`);
    res.json({
      success: true,
      totalInserted,
      skippedDuplicates,
      datesProcessed: uniqueDates.length,
      attendanceBackfilled: backfilled,
    });
  } catch (err: any) {
    console.error('[IO API] wfm-schedule-upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

async function flushWfmRecords(db: any, records: string[][]): Promise<number> {
  if (records.length === 0) return 0;
  const valueSets = records.map(r =>
    sql`(${r[0]}, ${r[1]}, ${r[2]}, ${r[3]}, ${r[4]})`
  );
  const bulkQuery = sql`INSERT INTO io_wfm_schedules (ohr_id, schedule_date, wfm_value, uploaded_at, uploaded_by)
    VALUES ${sql.join(valueSets, sql`, `)}`;
  const result: any = await db.execute(bulkQuery);
  return result[0]?.affectedRows ?? 0;
}

// GET /api/io/wfm-schedule/dates — list all unique dates with WFM data
router.get("/wfm-schedule/dates", async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const result: any = await db.execute(
      sql`SELECT DISTINCT schedule_date, COUNT(*) as count, MAX(uploaded_at) as last_upload, MAX(uploaded_by) as uploaded_by
          FROM io_wfm_schedules
          GROUP BY schedule_date
          ORDER BY schedule_date DESC`
    );
    const rows = Array.isArray(result[0]) ? result[0] : result;
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/io/wfm-schedule — REMOVED (WFM data is now append-only with skip-duplicates)

// ============================================================
// Attendance Purge — owner-only (740045023)
// ============================================================

// OWNER_OHR imported from ./config.js

// GET /api/io/attendance-purge-preview?ohr_id=X&from_date=YYYY-MM-DD
// Returns a summary of rows that would be deleted + first 20 rows for preview
router.get("/attendance-purge-preview", async (req: Request, res: Response) => {
  try {
    const actor = String(req.query.actor_ohr || '');
    if (actor !== OWNER_OHR) return res.status(403).json({ error: "Owner-only operation" });

    const ohrId = String(req.query.ohr_id || '').trim();
    const fromDate = String(req.query.from_date || '').trim();
    const toDate = String(req.query.to_date || '').trim();
    if (!ohrId) return res.status(400).json({ error: "ohr_id is required" });
    if (!fromDate || !/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) return res.status(400).json({ error: "from_date is required (YYYY-MM-DD)" });
    if (toDate && !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) return res.status(400).json({ error: "to_date must be YYYY-MM-DD format" });
    const hasToDate = !!toDate;

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    // Check if employee exists in employees table
    const empRows: any = await db.execute(
      sql`SELECT ohr_id, full_name, actual_role, planning_group FROM io_employees WHERE ohr_id = ${ohrId} LIMIT 1`
    );
    const empArr = Array.isArray(empRows[0]) ? empRows[0] : empRows;
    if (!empArr || empArr.length === 0) {
      return res.json({ found: false, error: "employee_not_found", message: `Employee with OHR ${ohrId} not found in the employee database.` });
    }
    const employee = empArr[0];

    // Count matching attendance rows (within date range or open-ended)
    const countResult: any = await db.execute(
      hasToDate
        ? sql`SELECT COUNT(*) as cnt FROM io_attendance WHERE ohr_id = ${ohrId} AND log_date >= ${fromDate} AND log_date <= ${toDate}`
        : sql`SELECT COUNT(*) as cnt FROM io_attendance WHERE ohr_id = ${ohrId} AND log_date >= ${fromDate}`
    );
    const countArr = Array.isArray(countResult[0]) ? countResult[0] : countResult;
    const totalRows = Number(countArr[0]?.cnt || 0);

    if (totalRows === 0) {
      return res.json({
        found: true,
        employee: { ohr_id: employee.ohr_id, full_name: employee.full_name, actual_role: employee.actual_role, planning_group: employee.planning_group },
        total_rows: 0,
        error: "no_attendance_rows",
        message: `No attendance records found for ${employee.full_name} (${ohrId}) from ${fromDate}${hasToDate ? ` to ${toDate}` : ' onwards'}.`
      });
    }

    // Get date range
    const rangeResult: any = await db.execute(
      hasToDate
        ? sql`SELECT MIN(log_date) as min_date, MAX(log_date) as max_date FROM io_attendance WHERE ohr_id = ${ohrId} AND log_date >= ${fromDate} AND log_date <= ${toDate}`
        : sql`SELECT MIN(log_date) as min_date, MAX(log_date) as max_date FROM io_attendance WHERE ohr_id = ${ohrId} AND log_date >= ${fromDate}`
    );
    const rangeArr = Array.isArray(rangeResult[0]) ? rangeResult[0] : rangeResult;
    const { min_date, max_date } = rangeArr[0] || {};

    // Get first 20 rows for preview
    const previewRows: any = await db.execute(
      hasToDate
        ? sql`SELECT id, log_date, tag, ot_hours, remarks, snap_planning_group, snap_shift_time, wfm_tag
            FROM io_attendance WHERE ohr_id = ${ohrId} AND log_date >= ${fromDate} AND log_date <= ${toDate}
            ORDER BY log_date ASC LIMIT 20`
        : sql`SELECT id, log_date, tag, ot_hours, remarks, snap_planning_group, snap_shift_time, wfm_tag
            FROM io_attendance WHERE ohr_id = ${ohrId} AND log_date >= ${fromDate}
            ORDER BY log_date ASC LIMIT 20`
    );
    const preview = Array.isArray(previewRows[0]) ? previewRows[0] : previewRows;

    // Tag distribution
    const tagResult: any = await db.execute(
      hasToDate
        ? sql`SELECT COALESCE(tag, '(empty)') as tag_name, COUNT(*) as cnt
            FROM io_attendance WHERE ohr_id = ${ohrId} AND log_date >= ${fromDate} AND log_date <= ${toDate}
            GROUP BY tag ORDER BY cnt DESC`
        : sql`SELECT COALESCE(tag, '(empty)') as tag_name, COUNT(*) as cnt
            FROM io_attendance WHERE ohr_id = ${ohrId} AND log_date >= ${fromDate}
            GROUP BY tag ORDER BY cnt DESC`
    );
    const tagDist = Array.isArray(tagResult[0]) ? tagResult[0] : tagResult;

    res.json({
      found: true,
      employee: { ohr_id: employee.ohr_id, full_name: employee.full_name, actual_role: employee.actual_role, planning_group: employee.planning_group },
      total_rows: totalRows,
      date_range: { from: min_date, to: max_date },
      tag_distribution: tagDist,
      preview: preview,
    });
  } catch (err: any) {
    console.error("[IO API] attendance-purge-preview error:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/io/attendance-purge - hard delete attendance rows (owner-only)
router.delete("/attendance-purge", async (req: Request, res: Response) => {
  try {
    const { actor_ohr, ohr_id, from_date, to_date } = req.body;
    if (String(actor_ohr) !== OWNER_OHR) return res.status(403).json({ error: "Owner-only operation" });
    if (!ohr_id) return res.status(400).json({ error: "ohr_id is required" });
    if (!from_date || !/^\d{4}-\d{2}-\d{2}$/.test(from_date)) return res.status(400).json({ error: "from_date is required (YYYY-MM-DD)" });
    if (to_date && !/^\d{4}-\d{2}-\d{2}$/.test(to_date)) return res.status(400).json({ error: "to_date must be YYYY-MM-DD format" });
    const hasToDate = !!to_date;

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    // Count before delete for confirmation
    const countResult: any = await db.execute(
      hasToDate
        ? sql`SELECT COUNT(*) as cnt FROM io_attendance WHERE ohr_id = ${ohr_id} AND log_date >= ${from_date} AND log_date <= ${to_date}`
        : sql`SELECT COUNT(*) as cnt FROM io_attendance WHERE ohr_id = ${ohr_id} AND log_date >= ${from_date}`
    );
    const countArr = Array.isArray(countResult[0]) ? countResult[0] : countResult;
    const totalRows = Number(countArr[0]?.cnt || 0);

    if (totalRows === 0) {
      return res.json({ success: true, deleted: 0, message: "No rows matched the criteria." });
    }

    // Log the purge action to audit log
    await db.insert(ioAuditLog).values({
      record_type: "attendance_purge",
      record_id: `${ohr_id}_${from_date}_to_${hasToDate ? to_date : 'onwards'}`,
      action: "purge",
      field_name: "bulk_delete",
      old_value: `${totalRows} rows`,
      new_value: null,
      actor_ohr: String(actor_ohr),
      actor_name: "Owner",
    });

    // Execute the delete
    await db.execute(
      hasToDate
        ? sql`DELETE FROM io_attendance WHERE ohr_id = ${ohr_id} AND log_date >= ${from_date} AND log_date <= ${to_date}`
        : sql`DELETE FROM io_attendance WHERE ohr_id = ${ohr_id} AND log_date >= ${from_date}`
    );

    console.log(`[IO API] PURGE: Deleted ${totalRows} attendance rows for ${ohr_id} from ${from_date}${hasToDate ? ` to ${to_date}` : ' onwards'} (actor: ${actor_ohr})`);
    res.json({ success: true, deleted: totalRows });
  } catch (err: any) {
    console.error("[IO API] attendance-purge error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Bulk Insert Attendance Rows into Input Portal (Admin-only)
// ============================================================

// POST /api/io/attendance-bulk-insert-preview
// Body: { actor_ohr, dates: string[], employee_filters: { status?, planning_group?, role?, supervisor? } }
// Returns: { total_new, total_duplicate, total_employees, total_dates, employees: [{ohr_id, full_name, is_duplicate}...] }
router.post("/attendance-bulk-insert-preview", async (req: Request, res: Response) => {
  try {
    const { actor_ohr, dates, employee_filters } = req.body;
    if (!actor_ohr || !ADMIN_OHRS.includes(String(actor_ohr))) {
      return res.status(403).json({ error: "Admin-only operation" });
    }
    if (!Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({ error: "At least one date is required" });
    }

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    // Fetch employees with optional filters
    const conditions: any[] = [];
    if (employee_filters?.status) {
      conditions.push(eq(ioEmployees.employement_status, employee_filters.status));
    }
    if (employee_filters?.planning_group) {
      conditions.push(eq(ioEmployees.planning_group, employee_filters.planning_group));
    }
    if (employee_filters?.role) {
      conditions.push(eq(ioEmployees.actual_role, employee_filters.role));
    }
    if (employee_filters?.supervisor) {
      conditions.push(eq(ioEmployees.supervisor_name, employee_filters.supervisor));
    }
    // Always exclude Managers from attendance tracking
    conditions.push(sql`${ioEmployees.actual_role} != 'Manager'`);

    const employees = await db.select({
      ohr_id: ioEmployees.ohr_id,
      full_name: ioEmployees.full_name,
      actual_role: ioEmployees.actual_role,
      planning_group: ioEmployees.planning_group,
      supervisor_name: ioEmployees.supervisor_name,
    }).from(ioEmployees).where(and(...conditions));

    // Check for existing attendance rows (duplicates) — match on ohr_id + log_date
    // Only fetch attendance for the requested dates to avoid scanning entire table
    const existingRows = await db.select({
      ohr_id: ioAttendance.ohr_id,
      log_date: ioAttendance.log_date,
    }).from(ioAttendance)
      .where(inArray(ioAttendance.log_date, dates.map(d => d.slice(0, 10))));

    const existingSet = new Set(
      existingRows.map(r => `${r.ohr_id}||${String(r.log_date || '').slice(0, 10)}`)
    );

    // Build employee list with duplicate status per date
    let totalNew = 0;
    let totalDuplicate = 0;
    const employeeList: { ohr_id: string; full_name: string; supervisor: string; is_duplicate: boolean }[] = [];

    for (const emp of employees) {
      // For multi-date ranges, an employee is a "duplicate" if they have attendance for ALL requested dates
      let dupCount = 0;
      for (const date of dates) {
        const key = `${emp.ohr_id}||${date.slice(0, 10)}`;
        if (existingSet.has(key)) dupCount++;
      }
      const isDuplicate = dupCount === dates.length; // duplicate only if ALL dates already have rows
      if (isDuplicate) {
        totalDuplicate++;
      } else {
        totalNew++;
      }
      employeeList.push({
        ohr_id: emp.ohr_id,
        full_name: emp.full_name || '',
        supervisor: emp.supervisor_name || '',
        is_duplicate: isDuplicate,
      });
    }

    // Sort: non-duplicates first, then alphabetically by name
    employeeList.sort((a, b) => {
      if (a.is_duplicate !== b.is_duplicate) return a.is_duplicate ? 1 : -1;
      return (a.full_name || '').localeCompare(b.full_name || '');
    });

    res.json({
      total_new: totalNew,
      total_duplicate: totalDuplicate,
      total_employees: employees.length,
      total_dates: dates.length,
      employees: employeeList,
    });
  } catch (err: any) {
    console.error("[IO API] attendance-bulk-insert-preview error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/attendance-bulk-insert
// Body: { actor_ohr, dates: string[], selected_ohrs: string[] }
// Inserts blank attendance rows into io_attendance for selected employees on selected dates
router.post("/attendance-bulk-insert", async (req: Request, res: Response) => {
  try {
    const { actor_ohr, dates, selected_ohrs } = req.body;
    if (!actor_ohr || !ADMIN_OHRS.includes(String(actor_ohr))) {
      return res.status(403).json({ error: "Admin-only operation" });
    }
    if (!Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({ error: "At least one date is required" });
    }
    if (!Array.isArray(selected_ohrs) || selected_ohrs.length === 0) {
      return res.status(400).json({ error: "At least one employee must be selected" });
    }

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    // Fetch employee details for selected OHRs
    const employees = await db.select({
      ohr_id: ioEmployees.ohr_id,
      full_name: ioEmployees.full_name,
      actual_role: ioEmployees.actual_role,
      planning_group: ioEmployees.planning_group,
      supervisor_name: ioEmployees.supervisor_name,
      shift_time: ioEmployees.shift_time,
      employement_status: ioEmployees.employement_status,
      billing_name: ioEmployees.billing_name,
    }).from(ioEmployees)
      .where(inArray(ioEmployees.ohr_id, selected_ohrs));

    // Check for existing attendance rows to skip true duplicates
    const existingRows = await db.select({
      ohr_id: ioAttendance.ohr_id,
      log_date: ioAttendance.log_date,
    }).from(ioAttendance)
      .where(inArray(ioAttendance.log_date, dates.map(d => d.slice(0, 10))));

    const existingSet = new Set(
      existingRows.map(r => `${r.ohr_id}||${String(r.log_date || '').slice(0, 10)}`)
    );

    // Generate batch_id for tracking/undo
    const batchId = `BULK-${Date.now().toString(36).toUpperCase()}`;
    const now = new Date().toISOString();
    const rows: any[] = [];
    let skipped = 0;

    for (const emp of employees) {
      for (const date of dates) {
        const dateStr = date.slice(0, 10);
        const key = `${emp.ohr_id}||${dateStr}`;
        if (existingSet.has(key)) {
          skipped++;
          continue;
        }
        // ID format: YYYYMMDD + ohr_id (matches existing pattern)
        const id = dateStr.replace(/-/g, '') + emp.ohr_id;
        rows.push({
          id,
          ohr_id: emp.ohr_id,
          log_date: dateStr,
          tag: null,
          created_at: now,
          snap_full_name: emp.full_name || '',
          snap_supervisor: emp.supervisor_name || '',
          snap_planning_group: emp.planning_group || '',
          snap_shift_time: emp.shift_time || '',
          snap_actual_role: emp.actual_role || '',
          snap_billing_name: emp.billing_name || '',
          snap_status: emp.employement_status || '',
          internal_role: emp.actual_role || '',
          internal_planning_group: emp.planning_group || '',
          batch_id: batchId,
        });
      }
    }

    // Insert in batches of 100
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      await db.insert(ioAttendance).values(batch);
      inserted += batch.length;
    }

    // Audit log
    await db.insert(ioAuditLog).values({
      record_type: "attendance_bulk_insert",
      record_id: batchId,
      action: "bulk_insert",
      field_name: "attendance_rows",
      old_value: null,
      new_value: `${inserted} rows inserted, ${skipped} duplicates skipped`,
      actor_ohr: String(actor_ohr),
      actor_name: "Admin",
    });

    console.log(`[IO API] BULK INSERT: ${inserted} attendance rows inserted, ${skipped} duplicates skipped, batch: ${batchId} (actor: ${actor_ohr})`);
    res.json({ success: true, inserted, skipped, batch_id: batchId });
  } catch (err: any) {
    console.error("[IO API] attendance-bulk-insert error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Undo last bulk insert batch (deletes from io_attendance)
router.post("/attendance-bulk-undo", async (req: Request, res: Response) => {
  try {
    const { actor_ohr, batch_id } = req.body;
    if (!actor_ohr || !ADMIN_OHRS.includes(String(actor_ohr))) {
      return res.status(403).json({ error: "Admin-only operation" });
    }
    if (!batch_id) {
      return res.status(400).json({ error: "batch_id is required" });
    }

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    // Count rows in this batch
    const [countResult] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(ioAttendance)
      .where(eq(ioAttendance.batch_id, batch_id));
    const rowCount = Number(countResult?.count || 0);

    if (rowCount === 0) {
      return res.status(404).json({ error: "No rows found for this batch" });
    }

    // Delete all rows with this batch_id
    await db.delete(ioAttendance).where(eq(ioAttendance.batch_id, batch_id));

    // Audit log
    await db.insert(ioAuditLog).values({
      record_type: "attendance_bulk_undo",
      record_id: batch_id,
      action: "bulk_undo",
      field_name: "attendance_rows",
      old_value: `${rowCount} rows`,
      new_value: "deleted",
      actor_ohr: String(actor_ohr),
      actor_name: "Admin",
    });

    console.log(`[IO API] BULK UNDO: ${rowCount} attendance rows deleted for batch ${batch_id} (actor: ${actor_ohr})`);
    res.json({ success: true, deleted: rowCount, batch_id });
  } catch (err: any) {
    console.error("[IO API] attendance-bulk-undo error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get last attendance bulk insert batch info (for undo button)
router.get("/attendance-last-batch", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    // Find the most recent batch_id in io_attendance
    const [lastBatch] = await db.select({
      batch_id: ioAttendance.batch_id,
      count: sql<number>`COUNT(*)`,
      min_date: sql<string>`MIN(${ioAttendance.log_date})`,
      max_date: sql<string>`MAX(${ioAttendance.log_date})`,
    })
      .from(ioAttendance)
      .where(sql`${ioAttendance.batch_id} IS NOT NULL AND ${ioAttendance.batch_id} != ''`)
      .groupBy(ioAttendance.batch_id)
      .orderBy(sql`MAX(${ioAttendance.created_at}) DESC`)
      .limit(1);

    if (!lastBatch || !lastBatch.batch_id) {
      return res.json({ has_batch: false });
    }

    res.json({
      has_batch: true,
      batch_id: lastBatch.batch_id,
      row_count: Number(lastBatch.count),
      date_range: `${lastBatch.min_date?.slice(0, 10) || ''} to ${lastBatch.max_date?.slice(0, 10) || ''}`,
    });
  } catch (err: any) {
    console.error("[IO API] attendance-last-batch error:", err);
    res.status(500).json({ error: err.message });
  }
});

export function registerIORoutes(app: import("express").Express) {
  app.use("/api/io", router);
  console.log("[IO API] Routes registered under /api/io/*");
}
