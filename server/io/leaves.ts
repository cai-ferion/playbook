/**
 * Leaves Domain Module
 * Extracted from io-routes.ts — handles GET, POST, PATCH, bulk-action, cancel, DELETE, shrinkage-forecast
 */
import { Router, Request, Response } from "express";
import { getDb } from "../db.js";
import { ioLeaves, ioNotifications, ioEmployees, ioLeavePeriods } from "../../drizzle/schema.js";
import { isAdminOhr } from "./shared.js";
import { eq, and, gte, lte, sql, desc, or, count, not, inArray } from "drizzle-orm";
import { ADMIN_OHRS } from "../config.js";
import { validate, leaveCreateSchema, leavesBulkActionSchema, leaveCancelSchema } from "./validation.js";
import { emitChange } from "./emit-change.js";
import { optimisticUpdate, sendConflict, getClientVersion } from "./optimistic-lock.js";

const router = Router();

/**
 * Compute the earliest date an agent can file a leave for.
 * Rule: Saturday of the last Sat–Fri week whose week still overlaps the current month.
 *
 * Algorithm:
 * 1. Find the last day of the current month.
 * 2. Find the Saturday on or before that last day (this is the start of the last
 *    Sat–Fri week that overlaps the current month).
 * 3. Return that Saturday as YYYY-MM-DD.
 */
export function getEarliestFilingDate(now: Date): string {
  // Last day of current month
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // Find the Saturday on or before lastDayOfMonth
  // getDay(): 0=Sun, 1=Mon, ..., 6=Sat
  const dow = lastDayOfMonth.getDay();
  // Days to subtract to reach the previous (or current) Saturday
  // If dow=6 (Sat), subtract 0. If dow=0 (Sun), subtract 1. If dow=5 (Fri), subtract 6.
  const daysBack = (dow + 1) % 7; // Sat=0, Sun=1, Mon=2, ..., Fri=6
  const saturday = new Date(lastDayOfMonth);
  saturday.setDate(lastDayOfMonth.getDate() - daysBack);

  const y = saturday.getFullYear();
  const m = String(saturday.getMonth() + 1).padStart(2, '0');
  const d = String(saturday.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// GET /api/io/leaves - list leaves with filters (server-side role scoping)
router.get("/leaves", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { leave_id, status, ohr_id, supervisor, month, limit } = req.query;
    const actorOhr = String(req.headers["x-actor-ohr"] || "");
    const actorRole = String(req.headers["x-actor-role"] || "");

    if (leave_id) {
      const rows = await db.select().from(ioLeaves).where(eq(ioLeaves.leave_id, String(leave_id)));
      return res.json(rows);
    }

    const conditions: any[] = [];
    if (status) conditions.push(eq(ioLeaves.status, String(status)));
    if (ohr_id) conditions.push(eq(ioLeaves.ohr_id, String(ohr_id)));
    if (supervisor) conditions.push(eq(ioLeaves.supervisor, String(supervisor)));
    if (month) conditions.push(sql`${ioLeaves.start_date} LIKE ${String(month) + '%'}`);

    // Server-side role scoping: restrict data based on actor's role
    // Admins and Managers see all; TLs see own + direct reports; Agents see own only
    const isAdmin = ADMIN_OHRS.includes(actorOhr);
    const isManager = actorRole === 'Manager';
    if (!isAdmin && !isManager && actorOhr) {
      if (actorRole === 'Team Lead') {
        // TL: own leaves + leaves of their direct reports
        const empRows = await db.select({ ohr_id: ioEmployees.ohr_id })
          .from(ioEmployees)
          .where(sql`${ioEmployees.supervisor_name} = (SELECT full_name FROM io_employees WHERE ohr_id = ${actorOhr} LIMIT 1)`);
        const teamOhrs = empRows.map(e => e.ohr_id).filter(Boolean);
        teamOhrs.push(actorOhr); // Include TL's own leaves
        conditions.push(inArray(ioLeaves.ohr_id, teamOhrs));
      } else {
        // Agent / QPE / SME / Trainer without manager role: own leaves only
        conditions.push(eq(ioLeaves.ohr_id, actorOhr));
      }
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const lim = limit ? Number(limit) : 2000;
    const rows = await db.select().from(ioLeaves).where(where).orderBy(desc(sql`created_at`)).limit(lim);
    res.json(rows);
  } catch (err: any) {
    console.error("[IO API] leaves GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/leaves - file a new leave request
router.post("/leaves", validate(leaveCreateSchema), async (req: Request, res: Response) => {
  try {
    // Filing window check: 1st-7th of month, PHT (bypassed if global extension is active)
    const nowMNL = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    const dayOfMonth = nowMNL.getDate();
    if (dayOfMonth < 1 || dayOfMonth > 7) {
      // Check if global filing extension is active before rejecting
      const dbCheck = await getDb();
      let extensionActive = false;
      if (dbCheck) {
        const extRows = await dbCheck.execute(sql`SELECT value FROM io_settings WHERE key = 'filing_extension_active' LIMIT 1`);
        extensionActive = extRows.length > 0 && extRows[0].value === '1';
      }
      if (!extensionActive) {
        return res.status(400).json({ error: "Filing window is closed. Leave requests can only be filed from the 1st to the 7th of each month." });
      }
    }
    const leaveDate = req.body.start_date;
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    // Leave Period Validation: current month requires admin-configured period
    if (leaveDate) {
      const leaveDateObj = new Date(leaveDate + 'T00:00:00');
      const leaveMonth = leaveDateObj.getMonth() + 1;
      const leaveYear = leaveDateObj.getFullYear();
      const currentMonth = nowMNL.getMonth() + 1;
      const currentYear = nowMNL.getFullYear();
      // Only enforce for current month (future months always open)
      if (leaveMonth === currentMonth && leaveYear === currentYear) {
        const periodRows = await db.select().from(ioLeavePeriods)
          .where(and(eq(ioLeavePeriods.month, currentMonth), eq(ioLeavePeriods.year, currentYear)))
          .limit(1);
        if (periodRows.length === 0) {
          const monthName = nowMNL.toLocaleString('en-US', { month: 'long' });
          return res.status(400).json({ error: `Leave filing for ${monthName} has not been opened yet by your admin.` });
        }
        // Period configured: enforce start_week_ending constraint
        // Leaves must be on or after the Saturday of the configured week
        const weDate = new Date(periodRows[0].start_week_ending + 'T00:00:00');
        // Saturday = weDate - 6 days (week ending is Friday, so Saturday is 6 days before)
        const satDate = new Date(weDate);
        satDate.setDate(weDate.getDate() - 6);
        const satStr = `${satDate.getFullYear()}-${String(satDate.getMonth() + 1).padStart(2, '0')}-${String(satDate.getDate()).padStart(2, '0')}`;
        if (leaveDate < satStr) {
          const weMM = periodRows[0].start_week_ending.slice(5, 7);
          const weDD = periodRows[0].start_week_ending.slice(8, 10);
          return res.status(400).json({ error: `Leave dates for this month must be on or after the configured start date (WE ${weMM}/${weDD}).` });
        }
      }
    }

    // Duplicate check: prevent filing on a date the employee already has a leave for
    const existingLeave = await db.select({ id: ioLeaves.id, status: ioLeaves.status })
      .from(ioLeaves)
      .where(and(
        eq(ioLeaves.ohr_id, req.body.ohr_id),
        eq(ioLeaves.start_date, req.body.start_date),
        not(eq(ioLeaves.status, 'Cancelled'))
      ))
      .limit(1);
    if (existingLeave.length > 0) {
      return res.status(400).json({ error: `You already have a leave filed for ${req.body.start_date}. Please cancel the existing one first if you need to refile.` });
    }

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

    emitChange(req, "leaves", "record_created", {});
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] leaves POST error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/io/leaves/:leave_id - update a leave record
router.patch("/leaves/:leave_id", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const clientVersion = getClientVersion(req.body);
    if (clientVersion !== null) {
      const { version: _v, ...updateFields } = req.body;
      const lockResult = await optimisticUpdate(db, ioLeaves, ioLeaves.leave_id, req.params.leave_id, clientVersion, updateFields);
      if (!lockResult.ok) {
        if (lockResult.reason === "not_found") return res.status(404).json({ error: "Leave not found" });
        return sendConflict(res, clientVersion, lockResult.serverState);
      }
    } else {
      await db.update(ioLeaves).set(req.body).where(eq(ioLeaves.leave_id, req.params.leave_id));
    }
    emitChange(req, "leaves", "record_updated", { leave_id: req.params.leave_id });
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] leaves PATCH error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/leaves/bulk-action - bulk approve/reject leaves
router.post("/leaves/bulk-action", validate(leavesBulkActionSchema), async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    // Zod schema (leavesBulkActionSchema) validates leave_ids, action, tier
    const { leave_ids, action, tier, reviewer_name, rejection_reason } = req.body;

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
      let supervisorOhr = '';
      if (lv.supervisor) {
        const supRows = await db.select({ ohr_id: ioEmployees.ohr_id })
          .from(ioEmployees)
          .where(eq(ioEmployees.full_name, lv.supervisor))
          .limit(1);
        if (supRows.length > 0) supervisorOhr = supRows[0].ohr_id;
      }

      if (tier === 'tl') {
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

    emitChange(req, "leaves", "bulk_update", { count: updated });
    res.json({ ok: true, updated });
  } catch (err: any) {
    console.error("[IO API] leaves bulk-action error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/leaves/:leave_id/cancel - agent self-cancel
router.post("/leaves/:leave_id/cancel", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { leave_id } = req.params;
    const rows = await db.select().from(ioLeaves).where(eq(ioLeaves.leave_id, leave_id));
    if (rows.length === 0) return res.status(404).json({ error: "Leave not found" });

    const lv = rows[0];
    if (lv.status !== 'Pending TL' && lv.status !== 'Pending OM') {
      return res.status(400).json({ error: "Can only cancel leaves with Pending TL or Pending OM status" });
    }

    const now = new Date().toISOString();
    await db.update(ioLeaves).set({
      status: 'Cancelled',
      cancelled_at: now,
      updated_at: now,
    }).where(eq(ioLeaves.leave_id, leave_id));

    emitChange(req, "leaves", "record_updated", { leave_id, status: "Cancelled" });
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] leaves cancel error:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/io/leaves/:leave_id - admin delete
router.delete("/leaves/:leave_id", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });
    const { leave_id } = req.params;
    await db.delete(ioLeaves).where(eq(ioLeaves.leave_id, leave_id));
    emitChange(req, "leaves", "record_deleted", { leave_id });
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
    const dayOfWeek = d.getUTCDay();
    const daysSinceSat = dayOfWeek === 6 ? 0 : dayOfWeek + 1;
    const weekStart = new Date(d);
    weekStart.setUTCDate(d.getUTCDate() - daysSinceSat);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
    const weekStartStr = weekStart.toISOString().slice(0, 10);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);

    // 4. Count ONLY Approved leaves for same combo in that week
    // Pending leaves are excluded to avoid inflating the forecast
    const leaveRows = await db.select({
      leave_id: ioLeaves.leave_id,
      ohr_id: ioLeaves.ohr_id,
      full_name: ioLeaves.full_name,
      start_date: ioLeaves.start_date,
      status: ioLeaves.status,
    }).from(ioLeaves)
      .innerJoin(ioEmployees, eq(ioLeaves.ohr_id, ioEmployees.ohr_id))
      .where(and(
        eq(ioLeaves.status, 'Approved'),
        gte(ioLeaves.start_date, weekStartStr),
        lte(ioLeaves.start_date, weekEndStr),
        eq(ioEmployees.actual_role, actual_role),
        eq(ioEmployees.planning_group, planning_group)
      ));

    const leaveCount = leaveRows.length;
    const plPct = headcount > 0 ? ((leaveCount / Number(headcount)) * 100) : 0;

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

// ─── Leave Period Configuration (Admin-only) ───

// GET /api/io/leave-periods - list all configured periods
router.get("/leave-periods", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });
    const rows = await db.select().from(ioLeavePeriods).orderBy(desc(ioLeavePeriods.year), desc(ioLeavePeriods.month));
    res.json(rows);
  } catch (err: any) {
    console.error("[IO API] leave-periods GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/io/leave-periods/current - get the period config for the current month
router.get("/leave-periods/current", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });
    const nowMNL = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    const month = nowMNL.getMonth() + 1;
    const year = nowMNL.getFullYear();
    const rows = await db.select().from(ioLeavePeriods)
      .where(and(eq(ioLeavePeriods.month, month), eq(ioLeavePeriods.year, year)))
      .limit(1);
    if (rows.length === 0) {
      return res.json({ configured: false, month, year });
    }
    res.json({ configured: true, ...rows[0] });
  } catch (err: any) {
    console.error("[IO API] leave-periods/current GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/leave-periods - create/update a period config (admin-only)
router.post("/leave-periods", async (req: Request, res: Response) => {
  try {
    const actorOhr = req.headers["x-actor-ohr"] as string || '';
    if (!isAdminOhr(actorOhr)) {
      return res.status(403).json({ error: "Only admins can configure leave periods" });
    }
    const { month, year, start_week_ending } = req.body;
    if (!month || !year || !start_week_ending) {
      return res.status(400).json({ error: "month, year, and start_week_ending are required" });
    }
    // Validate start_week_ending is a Friday
    const weDate = new Date(start_week_ending + 'T00:00:00');
    if (weDate.getDay() !== 5) {
      return res.status(400).json({ error: "start_week_ending must be a Friday" });
    }
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });
    const now = new Date().toISOString();
    // Upsert: if month+year exists, update; otherwise insert
    const existing = await db.select().from(ioLeavePeriods)
      .where(and(eq(ioLeavePeriods.month, Number(month)), eq(ioLeavePeriods.year, Number(year))))
      .limit(1);
    if (existing.length > 0) {
      await db.update(ioLeavePeriods)
        .set({ start_week_ending, created_by: actorOhr, updated_at: now })
        .where(eq(ioLeavePeriods.id, existing[0].id));
    } else {
      await db.insert(ioLeavePeriods).values({
        month: Number(month),
        year: Number(year),
        start_week_ending,
        created_by: req.headers["x-actor-name"] as string || actorOhr,
        created_by_ohr: actorOhr,
        created_at: now,
        updated_at: now,
      });
    }
    emitChange(req, "leave-periods", "record_updated", {});
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] leave-periods POST error:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/io/leave-periods/:id - remove a period config (admin-only)
router.delete("/leave-periods/:id", async (req: Request, res: Response) => {
  try {
    const actorOhr = req.headers["x-actor-ohr"] as string || '';
    if (!isAdminOhr(actorOhr)) {
      return res.status(403).json({ error: "Only admins can delete leave periods" });
    }
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });
    await db.delete(ioLeavePeriods).where(eq(ioLeavePeriods.id, Number(req.params.id)));
    emitChange(req, "leave-periods", "record_deleted", {});
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] leave-periods DELETE error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Global Filing Extension (Admin) ──────────────────────────────────────────
// When active, ALL employees can file leaves outside the normal 1st-7th window.

// GET /api/io/filing-extension/status - check if global filing extension is active
router.get("/filing-extension/status", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });
    const rows = await db.execute(sql`SELECT value FROM io_settings WHERE key = 'filing_extension_active' LIMIT 1`);
    const isActive = rows.length > 0 && rows[0].value === '1';
    res.json({ active: isActive });
  } catch (err: any) {
    console.error("[IO API] filing-extension status error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/filing-extension/toggle - toggle global filing extension (admin-only)
router.post("/filing-extension/toggle", async (req: Request, res: Response) => {
  try {
    // Use x-actor-ohr header first, fall back to req.user from session auth
    const actorOhr = (req.headers["x-actor-ohr"] as string) || (req.user as any)?.ohrId || (req.user as any)?.ohr_id || '';
    console.log("[IO API] filing-extension toggle: actorOhr=", actorOhr, "isAdmin=", isAdminOhr(actorOhr));
    if (!isAdminOhr(actorOhr)) {
      return res.status(403).json({ error: "Only admins can toggle the filing extension" });
    }
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: "enabled (boolean) is required" });
    }
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });
    const now = new Date().toISOString();
    await db.execute(sql`UPDATE io_settings SET value = ${enabled ? '1' : '0'}, updated_at = ${now}, updated_by = ${actorOhr} WHERE key = 'filing_extension_active'`);
    console.log("[IO API] filing-extension toggled to:", enabled, "by:", actorOhr);
    res.json({ ok: true, active: enabled });
  } catch (err: any) {
    console.error("[IO API] filing-extension toggle error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
