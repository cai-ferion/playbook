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
  ioCoachingNte,
  ioNotifications,
  ioInsights,
  ioLeaves,
  ioAuditLog,
  ioTasks,
  ioTaskComments,
  ioOtRequests,
  ioOtConfig,
  ioSrtBill,
  ioBillingTargetsV2,
  ioSyncLog,
  compassCoachingLogs,
  compassDisputeEvents,
  compassCaCases,
  compassCaTimeline,
  compassViolationCatalog,
} from "../drizzle/schema.js";
import { eq, and, gte, lte, like, ne, sql, desc, asc, inArray, or, count } from "drizzle-orm";
import crypto from "crypto";
import { syncEmployeesToSupabase, deleteEmployeesFromSupabase } from "./supabase-sync.js";
const router = Router();

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
            status_in, shift_time_in, role_in, blanks_only,
            // Server-side sort & pagination
            sort_by, sort_dir, paginated, exclude_managers } = req.query;

    const conditions: any[] = [];
    // Exclude Managers from attendance results (Batch 124)
    if (exclude_managers === 'true') {
      conditions.push(sql`${ioAttendance.ohr_id} NOT IN (SELECT ohr_id FROM io_employees WHERE actual_role = 'Manager')`);
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

// POST /api/io/attendance/bulk-import - bulk create/update attendance records (admin only)
router.post("/attendance/bulk-import", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const actorOhr = req.headers["x-actor-ohr"] as string || "";
    if (actorOhr !== "740045023") {
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
    if (actorOhr !== "740045023") {
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

    // OT field lock enforcement for S-ABF & CS-ABF Agents from 2026-04-11 onward
    // Only self-service OT edits by S-ABF/CS-ABF Agents are blocked.
    // Managers/TLs editing on behalf of agents are exempt.
    const OT_MECHANISM_PGS = ['S-ABF', 'CS-ABF'];
    if (actorOhr !== "740045023" && (updates.ot_hours !== undefined)) {
      const otLockDate = '2026-04-11';
      const recordDate = current.log_date || '';
      if (recordDate >= otLockDate) {
        const recordOwnerOhr = (current as any).ohr_id || '';
        if (actorOhr === recordOwnerOhr) {
          const [actorEmp] = await db.select().from(ioEmployees).where(eq(ioEmployees.ohr_id, actorOhr)).limit(1);
          // Block only if actor is an Agent in S-ABF or CS-ABF
          if (actorEmp && actorEmp.actual_role === 'Agent'
            && OT_MECHANISM_PGS.includes(actorEmp.planning_group || '')) {
            return res.status(403).json({ error: "OT editing is locked for this date. OT is managed via the OT Dashboard." });
          }
        }
      }
    }

    // Build audit entries for each changed field
    const now = new Date().toISOString();
    const fieldMap: Record<string, string> = {
      tag: "tag", upl_reason: "upl_reason", remarks: "remarks",
      ot_hours: "ot_hours",
      role: "role", planning_group: "planning_group"
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
      "id", "ohr_id", "log_date", "tag", "upl_reason",
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
    // OT hours are fixed at 2.5 — override any client-sent value
    const fixedHours = "2.5";

    // Server-side validation: reject submission if OT form is not open for this planning group
    if (planning_group) {
      const configRows = await db.select().from(ioOtConfig)
        .where(eq(ioOtConfig.planning_group, planning_group));
      if (configRows.length === 0 || !configRows[0].ot_form_open) {
        return res.status(403).json({ error: "The OT form is currently closed for your planning group. Please wait for it to be opened." });
      }
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
      requested_hours: fixedHours,
      status: "pending",
      submitted_at: now,
    });
    // Notif #1: Notify the requester that their OT request was submitted
    try {
      await db.insert(ioNotifications).values({
        type: "ot_request_submitted",
        title: "OT Commitment Submitted",
        message: `Your OT commitment (${requestId}) for 2.5 hour(s) has been submitted and is waitlisted.`,
        actor_ohr: ohr_id,
        actor_name: agent_name || "",
        target_ohr: ohr_id,
        metadata: JSON.stringify({ request_id: requestId, hours: fixedHours, planning_group }),
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

// Helper: check if a date has a PL tag in attendance records
function isOnPL(dateStr: string, attendanceRecords: any[]): boolean {
  const rec = attendanceRecords.find((r: any) => r.log_date === dateStr);
  if (!rec) return false;
  const tag = (rec.tag || '').toUpperCase().trim();
  return tag === 'PL' || tag === 'ML'; // PL and ML count as planned leave
}

// Helper: find a valid OT day in the CURRENT week (Sat–Fri) for an agent
// Skips past days (before today in PHT), work-off days, and PL days
// Returns YYYY-MM-DD or null if no valid day found
function findOtDay(weekSaturday: Date, workOffDays: number[], agentLeaves: any[], attendanceRecords?: any[]): string | null {
  // Get today's date in PHT (UTC+8)
  const nowUtc = new Date();
  const phtNow = new Date(nowUtc.getTime() + 8 * 60 * 60 * 1000);
  const todayStr = phtNow.toISOString().split('T')[0];

  const weekDates: { date: Date; dateStr: string; dow: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekSaturday);
    d.setUTCDate(d.getUTCDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    weekDates.push({ date: d, dateStr, dow: d.getUTCDay() });
  }
  // Forward pass: Sat to Fri — skip past days, work-off, leaves, and PL
  for (const wd of weekDates) {
    if (wd.dateStr < todayStr) continue; // Skip past days
    if (workOffDays.includes(wd.dow)) continue;
    if (isOnLeave(wd.dateStr, agentLeaves)) continue;
    if (attendanceRecords && isOnPL(wd.dateStr, attendanceRecords)) continue;
    return wd.dateStr;
  }
  return null; // No valid day found — request stays on waitlist
}

// POST /ot-requests/approve — OM approves OT requests for a planning group (FIFO)
// OT is applied to the CURRENT WEEK (Sat–Fri), skipping past days
// Hours ÷ 2.5 = agent count (always round up)
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
    // Calculate how many agents to approve: hours ÷ 2.5, always round up
    const OT_HOURS_PER_AGENT = 2.5;
    const agentsToApprove = Math.ceil(hoursNeeded / OT_HOURS_PER_AGENT);

    // Get pending requests for this PG, sorted by submitted_at ASC (FIFO)
    const pending = await db.select().from(ioOtRequests)
      .where(and(eq(ioOtRequests.planning_group, planning_group), eq(ioOtRequests.status, "pending")))
      .orderBy(asc(ioOtRequests.submitted_at));
    if (pending.length === 0) {
      return res.status(404).json({ error: "No pending OT requests for this planning group" });
    }
    const now = new Date().toISOString();

    // Calculate CURRENT week's Saturday (start of Sat–Fri operational week) in PHT
    const phtNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const phtDay = phtNow.getUTCDay(); // 0=Sun, 6=Sat
    // Go back to this week's Saturday
    const daysSinceSat = phtDay === 6 ? 0 : (phtDay + 1); // Sat=0 back, Sun=1 back, Mon=2 back, ...
    const currentSaturday = new Date(phtNow);
    currentSaturday.setUTCDate(currentSaturday.getUTCDate() - daysSinceSat);
    currentSaturday.setUTCHours(0, 0, 0, 0);
    // Current Friday (end of the Sat–Fri week)
    const currentFriday = new Date(currentSaturday);
    currentFriday.setUTCDate(currentFriday.getUTCDate() + 6);
    const currentSaturdayStr = currentSaturday.toISOString().split('T')[0];
    const currentFridayStr = currentFriday.toISOString().split('T')[0];

    // Pre-fetch all employees in this PG for work_off data
    const allEmployees = await db.select().from(ioEmployees)
      .where(eq(ioEmployees.planning_group, planning_group));
    const empMap = new Map(allEmployees.map((e: any) => [e.ohr_id, e]));

    // Pre-fetch all approved leaves for current week for agents in this PG
    const allLeaves = await db.select().from(ioLeaves)
      .where(eq(ioLeaves.planning_group, planning_group));
    const currentWeekLeaves = allLeaves.filter((lv: any) => {
      if (lv.status !== 'approved' && lv.status !== 'Approved') return false;
      const start = lv.start_date || '';
      const end = lv.end_date || start;
      return start <= currentFridayStr && end >= currentSaturdayStr;
    });

    // Pre-fetch attendance records for current week for all agents in this PG
    const currentWeekAttendance = await db.select().from(ioAttendance)
      .where(and(
        gte(ioAttendance.log_date, currentSaturdayStr),
        lte(ioAttendance.log_date, currentFridayStr),
        inArray(ioAttendance.ohr_id, pending.map(r => r.ohr_id))
      ));

    let agentsApproved = 0;
    const approved: any[] = [];
    const waitlisted: any[] = [];

    for (const otReq of pending) {
      if (agentsApproved >= agentsToApprove) break;

      const emp = empMap.get(otReq.ohr_id);
      const workOffDays = parseWorkOffDays(emp?.work_off || '');
      const agentLeaves = currentWeekLeaves.filter((lv: any) => lv.ohr_id === otReq.ohr_id);
      const agentAttendance = currentWeekAttendance.filter((a: any) => a.ohr_id === otReq.ohr_id);

      const appliedDate = findOtDay(currentSaturday, workOffDays, agentLeaves, agentAttendance);

      if (!appliedDate) {
        // No valid day — keep waitlisted
        waitlisted.push({ request_id: otReq.request_id, ohr_id: otReq.ohr_id, agent_name: otReq.agent_name, hours: OT_HOURS_PER_AGENT, reason: 'No available day (all remaining days are work off, PL, or past)' });
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
          .set({ ot_hours: String(OT_HOURS_PER_AGENT) })
          .where(eq(ioAttendance.id, attRows[0].id));
      } else {
        const e = emp;
        const attId = crypto.randomBytes(8).toString("hex");
        await db.insert(ioAttendance).values({
          id: attId,
          ohr_id: otReq.ohr_id,
          log_date: appliedDate,
          ot_hours: String(OT_HOURS_PER_AGENT),
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
        metadata: JSON.stringify({ ot_hours: OT_HOURS_PER_AGENT, applied_date: appliedDate, planning_group }),
      });
      agentsApproved++;
      approved.push({ request_id: otReq.request_id, ohr_id: otReq.ohr_id, agent_name: otReq.agent_name, hours: OT_HOURS_PER_AGENT, applied_date: appliedDate });
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
          title: "OT Applied",
          message: `Your OT commitment (${a.request_id}) for ${a.hours} hour(s) has been applied on ${appliedDateFormatted}.`,
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
        title: "OT Commitment Waitlisted",
        message: `Your OT commitment (${w.request_id}) for ${w.hours} hour(s) remains waitlisted. Reason: ${w.reason}`,
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
      agents_target: agentsToApprove,
      total_hours_approved: approved.length * OT_HOURS_PER_AGENT,
      waitlisted_count: waitlisted.length,
      approved,
      waitlisted,
    });
  } catch (err: any) {
    console.error("[IO API] ot-requests/approve error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /ot-requests/:requestId/cancel — agent cancels their approved OT, redistributes to next waitlisted
router.post("/ot-requests/:requestId/cancel", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const { requestId } = req.params;
    const actorOhr = req.headers["x-actor-ohr"] as string || req.body.actor_ohr || "";
    const actorName = req.headers["x-actor-name"] as string || req.body.actor_name || "";

    // Fetch the OT request
    const [otReq] = await db.select().from(ioOtRequests)
      .where(eq(ioOtRequests.request_id, requestId));
    if (!otReq) return res.status(404).json({ error: "OT request not found" });
    if (otReq.status !== "approved") {
      return res.status(400).json({ error: `Cannot cancel — OT request status is '${otReq.status}', not 'approved'` });
    }
    // Only the requesting agent (or admin 740045023) can cancel
    if (actorOhr !== otReq.ohr_id && actorOhr !== "740045023") {
      return res.status(403).json({ error: "Only the requesting agent can cancel their own OT" });
    }

    const now = new Date().toISOString();
    const OT_HOURS = 2.5;
    const appliedDate = otReq.applied_date || "";
    const pg = otReq.planning_group || "";

    // 1. Mark OT request as cancelled
    await db.update(ioOtRequests)
      .set({ status: "cancelled", approved_at: null, applied_date: null })
      .where(eq(ioOtRequests.id, otReq.id));

    // 2. Clear OT hours from attendance for the applied date
    if (appliedDate) {
      const attRows = await db.select().from(ioAttendance)
        .where(and(eq(ioAttendance.ohr_id, otReq.ohr_id), eq(ioAttendance.log_date, appliedDate)));
      if (attRows.length > 0) {
        await db.update(ioAttendance)
          .set({ ot_hours: "0" })
          .where(eq(ioAttendance.id, attRows[0].id));
      }
    }

    // 3. Audit log for cancellation
    await db.insert(ioAuditLog).values({
      record_type: "ot_request",
      record_id: otReq.request_id,
      action: "cancelled",
      field_name: "status",
      old_value: "approved",
      new_value: "cancelled",
      actor_ohr: actorOhr,
      actor_name: actorName || otReq.agent_name,
      timestamp: now,
      metadata: JSON.stringify({ applied_date: appliedDate, planning_group: pg }),
    });

    // 4. Notify the cancelling agent
    const appliedDateFormatted = appliedDate
      ? new Date(appliedDate + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
      : "N/A";
    await db.insert(ioNotifications).values({
      type: "ot_cancelled",
      title: "OT Cancelled",
      message: `Your OT commitment (${otReq.request_id}) for ${appliedDateFormatted} has been cancelled.`,
      actor_ohr: actorOhr,
      actor_name: actorName || otReq.agent_name,
      target_ohr: otReq.ohr_id,
      metadata: JSON.stringify({ request_id: otReq.request_id, applied_date: appliedDate, planning_group: pg }),
      is_read: false,
      created_at: now,
    });

    // 5. Redistribute: find next pending (waitlisted) agent in the same PG via FIFO
    let redistributed: any = null;
    if (pg) {
      const waitlisted = await db.select().from(ioOtRequests)
        .where(and(eq(ioOtRequests.planning_group, pg), eq(ioOtRequests.status, "pending")))
        .orderBy(asc(ioOtRequests.submitted_at));

      if (waitlisted.length > 0) {
        // Compute the Sat-Fri week boundaries from the cancelled OT's applied date (or today)
        const refDateStr = appliedDate || new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().split("T")[0];
        const refDate = new Date(refDateStr + "T00:00:00Z");
        const refDow = refDate.getUTCDay();
        const daysSinceSat = refDow === 6 ? 0 : (refDow + 1);
        const weekSaturday = new Date(refDate);
        weekSaturday.setUTCDate(weekSaturday.getUTCDate() - daysSinceSat);
        weekSaturday.setUTCHours(0, 0, 0, 0);
        const weekFriday = new Date(weekSaturday);
        weekFriday.setUTCDate(weekFriday.getUTCDate() + 6);
        const weekSatStr = weekSaturday.toISOString().split("T")[0];
        const weekFriStr = weekFriday.toISOString().split("T")[0];

        // Pre-fetch employees and leaves for cascade
        const allEmployees = await db.select().from(ioEmployees)
          .where(eq(ioEmployees.planning_group, pg));
        const empMap = new Map(allEmployees.map((e: any) => [e.ohr_id, e]));

        const allLeaves = await db.select().from(ioLeaves)
          .where(eq(ioLeaves.planning_group, pg));
        const weekLeaves = allLeaves.filter((lv: any) => {
          if (lv.status !== "approved" && lv.status !== "Approved") return false;
          const start = lv.start_date || "";
          const end = lv.end_date || start;
          return start <= weekFriStr && end >= weekSatStr;
        });

        for (const nextReq of waitlisted) {
          const emp = empMap.get(nextReq.ohr_id);
          const workOffDays = parseWorkOffDays(emp?.work_off || "");
          const agentLeaves = weekLeaves.filter((lv: any) => lv.ohr_id === nextReq.ohr_id);
          const agentAtt = await db.select().from(ioAttendance)
            .where(and(
              gte(ioAttendance.log_date, weekSatStr),
              lte(ioAttendance.log_date, weekFriStr),
              eq(ioAttendance.ohr_id, nextReq.ohr_id)
            ));

          const cascadeDate = findOtDay(weekSaturday, workOffDays, agentLeaves, agentAtt);
          if (!cascadeDate) continue; // No valid day — try next waitlisted agent

          // Approve this waitlisted request
          await db.update(ioOtRequests)
            .set({ status: "approved", approved_at: now, applied_date: cascadeDate, approved_by: "SYSTEM (Cancel Cascade)", approved_by_ohr: "SYSTEM" })
            .where(eq(ioOtRequests.id, nextReq.id));

          // Write OT to attendance
          const attRows = await db.select().from(ioAttendance)
            .where(and(eq(ioAttendance.ohr_id, nextReq.ohr_id), eq(ioAttendance.log_date, cascadeDate)));
          if (attRows.length > 0) {
            await db.update(ioAttendance)
              .set({ ot_hours: String(OT_HOURS) })
              .where(eq(ioAttendance.id, attRows[0].id));
          } else {
            const attId = crypto.randomBytes(8).toString("hex");
            await db.insert(ioAttendance).values({
              id: attId,
              ohr_id: nextReq.ohr_id,
              log_date: cascadeDate,
              ot_hours: String(OT_HOURS),
              created_at: now,
              snap_full_name: emp?.full_name || nextReq.agent_name,
              snap_supervisor: emp?.supervisor_name || "",
              snap_planning_group: emp?.planning_group || "",
              snap_shift_time: emp?.shift_time || "",
              snap_actual_role: emp?.actual_role || "",
              snap_billing_name: emp?.billing_name || "",
              snap_status: emp?.srt_status || "",
            });
          }

          // Audit log for cascade
          await db.insert(ioAuditLog).values({
            record_type: "ot_request",
            record_id: nextReq.request_id,
            action: "cancel_cascade_approved",
            field_name: "status",
            old_value: "pending",
            new_value: "approved",
            actor_ohr: "SYSTEM",
            actor_name: "OT Cancel Cascade",
            timestamp: now,
            metadata: JSON.stringify({ cascaded_from: otReq.request_id, original_agent: otReq.ohr_id, applied_date: cascadeDate }),
          });

          // Notify the newly approved agent
          const cascadeDateFormatted = new Date(cascadeDate + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
          const cascadeNotifs: any[] = [{
            type: "ot_applied",
            title: "OT Applied (Redistribution)",
            message: `Your OT commitment (${nextReq.request_id}) for 2.5 hour(s) has been applied on ${cascadeDateFormatted}.`,
            actor_ohr: "SYSTEM",
            actor_name: "OT Cancel Redistribution",
            target_ohr: nextReq.ohr_id,
            metadata: JSON.stringify({ request_id: nextReq.request_id, hours: OT_HOURS, applied_date: cascadeDate, redistributed_from: otReq.request_id }),
            is_read: false,
            created_at: now,
          }];
          // Notify the newly approved agent's supervisor
          if (emp?.supervisor_ohr) {
            cascadeNotifs.push({
              type: "ot_applied",
              title: "OT Applied (Redistribution) — Agent Update",
              message: `OT for ${nextReq.agent_name} (2.5 hr) has been applied on ${cascadeDateFormatted}.`,
              actor_ohr: "SYSTEM",
              actor_name: "OT Cancel Redistribution",
              target_ohr: emp.supervisor_ohr,
              metadata: JSON.stringify({ request_id: nextReq.request_id, agent_ohr: nextReq.ohr_id, agent_name: nextReq.agent_name, hours: OT_HOURS, applied_date: cascadeDate }),
              is_read: false,
              created_at: now,
            });
          }
          await db.insert(ioNotifications).values(cascadeNotifs);

          redistributed = {
            request_id: nextReq.request_id,
            ohr_id: nextReq.ohr_id,
            agent_name: nextReq.agent_name,
            applied_date: cascadeDate,
          };
          console.log(`[OT-Cancel] Redistributed ${otReq.request_id} → ${nextReq.request_id} (${nextReq.agent_name}) on ${cascadeDate}`);
          break; // Only redistribute to one agent
        }
      }
    }

    console.log(`[OT-Cancel] Cancelled ${otReq.request_id} (${otReq.agent_name}). Redistributed: ${redistributed ? redistributed.request_id : 'none'}`);
    res.json({
      ok: true,
      cancelled_request_id: otReq.request_id,
      cancelled_agent: otReq.agent_name,
      redistributed,
    });
  } catch (err: any) {
    console.error("[IO API] ot-requests/cancel error:", err);
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
    // Get all agents in this planning group (S-ABF & CS-ABF only)
    const OT_MECHANISM_PGS = ['S-ABF', 'CS-ABF'];
    const agents = await db.select().from(ioEmployees)
      .where(eq(ioEmployees.planning_group, planning_group));
    const eligibleAgents = agents.filter((a: any) =>
      a.actual_role === "Agent" &&
      OT_MECHANISM_PGS.includes(a.planning_group || '')
    );
    // Batch create in-app notifications for all eligible agents
    const notifTitle = isReopen ? "OT Form Reopened" : "OT Request Form Open";
    const notifMsg = isReopen
      ? `The OT form has been reopened for ${planning_group}. You may submit an additional OT commitment (2.5 hours).`
      : `OT commitments are now open for ${planning_group}. You may submit your 2.5-hour OT commitment.`;
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
 * Accepts JSON body: { rows: Array<{date, ohr, srt_id, billing_name, srt_status, actual_vs_projection, role, planning_group}> }
 * Upserts into io_srt_bill by (date, ohr_id).
 * Syncs latest Actuals planning_group + role back to io_employees.
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
          String(r.actual_vs_projection || '').trim(),
          String(r.role || '').trim(),
          normalizedPg,
          now
        ]);
      }
      if (validRows.length === 0) continue;

      // Build bulk INSERT using drizzle sql tagged template with sql.join
      const valueSets = validRows.map(r =>
        sql`(${r[0]}, ${r[1]}, ${r[2]}, ${r[3]}, ${r[4]}, ${r[5]}, ${r[6]}, ${r[7]}, ${r[8]})`
      );
      const bulkQuery = sql`INSERT INTO io_srt_bill (date, ohr_id, srt_id, billing_name, srt_status, actual_vs_projection, role, planning_group, created_at)
        VALUES ${sql.join(valueSets, sql`, `)}
        ON DUPLICATE KEY UPDATE
          srt_id = VALUES(srt_id),
          billing_name = VALUES(billing_name),
          srt_status = VALUES(srt_status),
          actual_vs_projection = VALUES(actual_vs_projection),
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
                WHERE actual_vs_projection = 'Actuals'
                  AND date = (
                    SELECT MAX(s2.date) FROM io_srt_bill s2
                    WHERE s2.ohr_id = io_srt_bill.ohr_id AND s2.actual_vs_projection = 'Actuals'
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
            COUNT(*) as total_rows,
            SUM(CASE WHEN actual_vs_projection = 'Actuals' THEN 1 ELSE 0 END) as actuals_count,
            SUM(CASE WHEN actual_vs_projection = 'Projection' THEN 1 ELSE 0 END) as projection_count
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
    const BILLING_EDIT_OHRS = ['740045023', '740044909'];
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
    const attResult: any = await db.execute(
      sql`SELECT ohr_id, log_date, tag, ot_hours, planning_group, role
          FROM io_attendance
          WHERE log_date >= ${weekStart} AND log_date <= ${weekEnd}
            AND planning_group IS NOT NULL AND role IS NOT NULL`
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
      totals
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
    if (actorOhr !== "740045023") {
      return res.status(403).json({ error: "Admin only" });
    }
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const limit = Number(req.query.limit) || 50;
    const offset = Number(req.query.offset) || 0;

    const [rows, countResult] = await Promise.all([
      db.select().from(ioSyncLog).orderBy(desc(ioSyncLog.id)).limit(limit).offset(offset),
      db.select({ count: sql<number>`COUNT(*)` }).from(ioSyncLog),
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
    if (actorOhr !== "740045023") {
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

/**
 * POST /api/io/billing-sheet-sync
 * Reads the BILLING Google Sheet and updates matching io_attendance rows
 * with role, planning_group, snap_billing_name, snap_status, actual_vs_projection.
 * Also syncs latest Actuals data back to io_employees.
 * Admin-only (740045023).
 */
router.post("/billing-sheet-sync", async (req: Request, res: Response) => {
  console.log("[BILLING SYNC] Endpoint hit");
  const ADMIN_OHR = "740045023";
  const actorOhr = String(req.headers["x-actor-ohr"] || req.headers["x-user-ohr"] || "").trim();
  if (actorOhr !== ADMIN_OHR) {
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

    // 2. Parse sheet rows: columns are date(A), ohr(B), srt_id(C), billing_name(D), srt_status(E), actual_vs_projection(F), role(G), planning_group(H)
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
      actual_vs_projection: string;
      role: string;
      planning_group: string;
    }

    const parsed: BillingRow[] = [];
    let parseErrors = 0;
    for (const row of rows) {
      if (row.length < 8) { parseErrors++; continue; }
      const logDate = parseSheetDate(row[0]?.trim() || "");
      const ohrId = row[1]?.trim() || "";
      if (!logDate || !ohrId) { parseErrors++; continue; }
      parsed.push({
        log_date: logDate,
        ohr_id: ohrId,
        srt_id: row[2]?.trim() || "",
        billing_name: row[3]?.trim() || "",
        srt_status: row[4]?.trim() || "",
        actual_vs_projection: row[5]?.trim() || "",
        role: row[6]?.trim() || "",
        planning_group: normalizePg(row[7]?.trim() || ""),
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
        actual_vs_projection VARCHAR(20),
        PRIMARY KEY (ohr_id, log_date)
      )`);

      // Bulk insert into staging in batches of 500
      const STAGE_BATCH = 500;
      for (let i = 0; i < parsed.length; i += STAGE_BATCH) {
        const chunk = parsed.slice(i, i + STAGE_BATCH);
        const valueSets = chunk.map(r =>
          sql`(${r.ohr_id}, ${r.log_date}, ${r.role}, ${r.planning_group}, ${r.billing_name}, ${r.srt_status}, ${r.actual_vs_projection})`
        );
        await db.execute(
          sql`INSERT INTO _billing_staging (ohr_id, log_date, role, planning_group, billing_name, srt_status, actual_vs_projection)
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
                a.snap_status = s.srt_status,
                a.actual_vs_projection = s.actual_vs_projection`
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
      const latestActuals = new Map<string, BillingRow>();
      for (const r of parsed) {
        if (r.actual_vs_projection !== "Actuals") continue;
        const existing = latestActuals.get(r.ohr_id);
        if (!existing || r.log_date > existing.log_date) {
          latestActuals.set(r.ohr_id, r);
        }
      }
      // Update io_employees with latest Actuals planning_group and role
      for (const [ohrId, latest] of Array.from(latestActuals.entries())) {
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
          sql`(${r.log_date}, ${r.ohr_id}, ${r.srt_id}, ${r.billing_name}, ${r.srt_status}, ${r.actual_vs_projection}, ${r.role}, ${r.planning_group}, ${now})`
        );
        const bulkQuery = sql`INSERT INTO io_srt_bill (date, ohr_id, srt_id, billing_name, srt_status, actual_vs_projection, role, planning_group, created_at)
          VALUES ${sql.join(valueSets, sql`, `)}
          ON DUPLICATE KEY UPDATE
            srt_id = VALUES(srt_id),
            billing_name = VALUES(billing_name),
            srt_status = VALUES(srt_status),
            actual_vs_projection = VALUES(actual_vs_projection),
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

export function registerIORoutes(app: import("express").Express) {
  app.use("/api/io", router);
  console.log("[IO API] Routes registered under /api/io/*");
}
