/**
 * Leaves Domain Module
 * Extracted from io-routes.ts — handles GET, POST, PATCH, bulk-action, cancel, DELETE, shrinkage-forecast
 */
import { Router, Request, Response } from "express";
import { getDb } from "../db.js";
import { ioLeaves, ioNotifications, ioEmployees } from "../../drizzle/schema.js";
import { eq, and, gte, lte, sql, desc, or, count } from "drizzle-orm";
import { validate, leaveCreateSchema, leavesBulkActionSchema, leaveCancelSchema } from "./validation.js";
import { emitChange } from "./emit-change.js";
import { optimisticUpdate, sendConflict, getClientVersion } from "./optimistic-lock.js";

const router = Router();

// GET /api/io/leaves - list leaves with filters
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

// POST /api/io/leaves - file a new leave request
router.post("/leaves", validate(leaveCreateSchema), async (req: Request, res: Response) => {
  try {
    // Filing window check: 1st-7th of month, PHT
    const nowMNL = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    const dayOfMonth = nowMNL.getDate();
    if (dayOfMonth < 1 || dayOfMonth > 7) {
      return res.status(400).json({ error: "Filing window is closed. Leave requests can only be filed from the 1st to the 7th of each month." });
    }
    // Date restriction: next month onwards
    const leaveDate = req.body.start_date;
    if (leaveDate) {
      const nextMonth = new Date(nowMNL.getFullYear(), nowMNL.getMonth() + 1, 1);
      const minDate = nextMonth.toISOString().slice(0, 10);
      if (leaveDate < minDate) {
        return res.status(400).json({ error: "Leave dates must be next month onwards." });
      }
    }
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

    // 4. Count approved leaves for same combo in that week
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

export default router;
