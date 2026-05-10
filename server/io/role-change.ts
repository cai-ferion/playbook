/**
 * IO Role Change Email Automation Routes
 * Provides deficit analysis, available staff lookup, email generation,
 * attendance auto-update, and role change history.
 */
import { Router, Request, Response } from "express";
import { getDb } from "../db.js";
import {
  ioEmployees,
  ioAttendance,
  ioRoleChanges,
  ioWfmSchedules,
  ioBillingTargetsV2,
} from "../../drizzle/schema.js";
import { eq, and, gte, lte, sql, desc, inArray, or } from "drizzle-orm";
import { ADMIN_OHRS } from "../config.js";
import { validate, roleChangeGenerateSchema } from "./validation.js";
import { emitChange } from "./emit-change.js";

const router = Router();

// Allowed roles for this feature: Manager, Team Lead, Admin
const ALLOWED_ROLES = ["Manager", "Team Lead"];

function isAllowed(role: string | undefined, ohrId: string | undefined): boolean {
  if (!ohrId) return false;
  if (ADMIN_OHRS.includes(ohrId)) return true;
  return ALLOWED_ROLES.includes(role || "");
}

// PG×Role combos used in billing compliance
const PG_ROLE_COMBOS = [
  { pg: "S-ABF", role: "Agent", label: "S-ABF × Agent" },
  { pg: "S-ABF", role: "Operational SME", label: "S-ABF × SME" },
  { pg: "S-ABF", role: "Quality & Policy Expert", label: "S-ABF × QA" },
  { pg: "CS-ABF", role: "Agent", label: "CS-ABF × Agent" },
  { pg: "CS-ABF", role: "Operational SME", label: "CS-ABF × SME" },
  { pg: "CS-ABF", role: "Quality & Policy Expert", label: "CS-ABF × QA" },
  { pg: "RECALL_MEASUREMENT_CTR", role: "Agent", label: "RECALL_MEASUREMENT_CTR" },
  { pg: "CSO_CTR", role: "Agent", label: "CSO_CTR" },
  { pg: "FAD_CTR", role: "Agent", label: "FAD_CTR" },
  { pg: "SME_CTR", role: "*", label: "SME_CTR" },
  { pg: "QPE_CTR", role: "*", label: "QPE_CTR" },
];

const HOURS_PER_SHIFT = 7.5;

// ============================================================
// GET /role-change/deficit-analysis?week_ending=YYYY-MM-DD
// Returns PGs in deficit for the selected week
// ============================================================
router.get("/deficit-analysis", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const weekEnding = String(req.query.week_ending || "");
    if (!weekEnding) return res.status(400).json({ error: "week_ending is required" });

    // Work week: Saturday to Friday
    const weDate = new Date(weekEnding + "T00:00:00Z");
    const wsDate = new Date(weDate);
    wsDate.setUTCDate(wsDate.getUTCDate() - 6);
    const weekStart = wsDate.toISOString().slice(0, 10);
    const weekEnd = weekEnding;

    // Days elapsed/remaining
    const nowPHT = new Date(Date.now() + 8 * 3600000);
    const todayStr = nowPHT.toISOString().slice(0, 10);
    const totalDaysInWeek = 7;
    const effectiveEnd = todayStr < weekEnd ? todayStr : weekEnd;
    const daysElapsed = Math.max(
      0,
      Math.min(
        totalDaysInWeek,
        Math.floor(
          (new Date(effectiveEnd + "T00:00:00Z").getTime() -
            new Date(weekStart + "T00:00:00Z").getTime()) /
            86400000
        ) + 1
      )
    );
    const daysRemaining = Math.max(0, totalDaysInWeek - daysElapsed);

    // Attendance data for this week
    const attResult: any = await db.execute(
      sql`SELECT ohr_id, log_date, tag, ot_hours, planning_group, role
          FROM io_attendance
          WHERE log_date >= ${weekStart} AND log_date <= ${weekEnd}
            AND planning_group IS NOT NULL AND role IS NOT NULL`
    );
    const attRows = Array.isArray(attResult) ? attResult : [];

    // Targets — carry forward if none for this week
    let tgtResult: any = await db.execute(
      sql`SELECT planning_group, role, target_hc, target_hours
          FROM io_billing_targets_v2
          WHERE week_ending = ${weekEnding}`
    );
    let tgtRows = Array.isArray(tgtResult) ? tgtResult : [];
    const targetMap = new Map<string, { target_hc: number; target_hours: number }>();
    for (const t of tgtRows) {
      targetMap.set(`${t.planning_group}|${t.role}`, {
        target_hc: Number(t.target_hc) || 0,
        target_hours: Number(t.target_hours) || 0,
      });
    }
    const hasRealTargets = PG_ROLE_COMBOS.some((c) => {
      if (c.role === "*") return Array.from(targetMap.keys()).some((k) => k.startsWith(c.pg + "|"));
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
      const fallbackRows = Array.isArray(fallbackResult) ? fallbackResult : [];
      for (const t of fallbackRows) {
        targetMap.set(`${t.planning_group}|${t.role}`, {
          target_hc: Number(t.target_hc) || 0,
          target_hours: Number(t.target_hours) || 0,
        });
      }
    }

    // Compute per-combo data
    const comboDataMap = new Map<string, { totalBillable: number; totalOtHours: number }>();
    for (const a of attRows as any[]) {
      let key = "";
      for (const c of PG_ROLE_COMBOS) {
        if (c.pg === a.planning_group) {
          if (c.role === "*" || c.role === a.role) {
            key = `${c.pg}|${c.role}`;
            break;
          }
        }
      }
      if (!key) continue;
      if (!comboDataMap.has(key)) comboDataMap.set(key, { totalBillable: 0, totalOtHours: 0 });
      const cd = comboDataMap.get(key)!;
      const tag = (a.tag || "").toUpperCase();
      if (["P", "LATE", "OT", ""].includes(tag)) {
        cd.totalBillable++;
        cd.totalOtHours += parseFloat(a.ot_hours) || 0;
      }
    }

    // Build deficit rows
    const deficits: any[] = [];
    for (const combo of PG_ROLE_COMBOS) {
      const key = `${combo.pg}|${combo.role}`;
      const cd = comboDataMap.get(key);
      let targetHours = 0;
      if (combo.role === "*") {
        for (const [k, v] of Array.from(targetMap.entries())) {
          if (k.startsWith(combo.pg + "|")) targetHours += v.target_hours;
        }
      } else {
        targetHours = (targetMap.get(key) || { target_hours: 0 }).target_hours;
      }

      const billableDays = cd ? cd.totalBillable : 0;
      const otHours = cd ? cd.totalOtHours : 0;
      const deliveredHours = billableDays * HOURS_PER_SHIFT;
      const totalBilled = deliveredHours + otHours;
      const compliancePct = targetHours > 0 ? (totalBilled / targetHours) * 100 : 0;
      const goalTo98 = totalBilled - targetHours * 0.98;
      const goalTo100 = totalBilled - targetHours;
      const hoursGap = targetHours - totalBilled;
      const hcNeeded =
        daysRemaining > 0
          ? Math.max(0, Math.ceil(hoursGap / (daysRemaining * HOURS_PER_SHIFT)))
          : 0;

      // Only include rows that have a target and are in deficit (< 98%)
      deficits.push({
        planning_group: combo.pg,
        role: combo.role,
        label: combo.label,
        target_hours: targetHours,
        delivered_hours: Math.round(deliveredHours * 100) / 100,
        ot_hours: Math.round(otHours * 100) / 100,
        total_billed: Math.round(totalBilled * 100) / 100,
        compliance_pct: Math.round(compliancePct * 100) / 100,
        goal_to_98: Math.round(goalTo98 * 100) / 100,
        goal_to_100: Math.round(goalTo100 * 100) / 100,
        hours_gap: Math.round(hoursGap * 100) / 100,
        hc_needed: hcNeeded,
        in_deficit: goalTo98 < 0,
      });
    }

    res.json({
      week_ending: weekEnding,
      week_start: weekStart,
      days_elapsed: daysElapsed,
      days_remaining: daysRemaining,
      deficits,
    });
  } catch (err: any) {
    console.error("[IO API] role-change/deficit-analysis error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /role-change/available-staff?week_ending=YYYY-MM-DD&date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
// Returns TLs/Trainers with availability status for target dates
// ============================================================
router.get("/available-staff", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const weekEnding = String(req.query.week_ending || "");
    const dateFrom = String(req.query.date_from || "");
    const dateTo = String(req.query.date_to || "");
    if (!weekEnding || !dateFrom || !dateTo) {
      return res.status(400).json({ error: "week_ending, date_from, date_to are required" });
    }

    // Get all active TLs and Trainers
    const staffResult: any = await db.execute(
      sql`SELECT ohr_id, full_name, actual_role, planning_group, srt_id, supervisor_name, shift_time
          FROM io_employees
          WHERE actual_role IN ('Team Lead', 'Trainer')
            AND employement_status = 'Active'
          ORDER BY actual_role, full_name`
    );
    const staffRows = Array.isArray(staffResult) ? staffResult : [];

    if (staffRows.length === 0) {
      return res.json({ staff: [] });
    }

    const staffOhrs = staffRows.map((s: any) => s.ohr_id);

    // Check attendance for these staff in the date range (leave/absence detection)
    const attResult: any = await db.execute(
      sql`SELECT ohr_id, log_date, tag, role AS billing_role, planning_group AS billing_pg
          FROM io_attendance
          WHERE ohr_id IN (${sql.join(staffOhrs.map((o: string) => sql`${o}`), sql`, `)})
            AND log_date >= ${dateFrom} AND log_date <= ${dateTo}`
    );
    const attRows = Array.isArray(attResult) ? attResult : [];

    // Build per-OHR attendance map
    const attMap = new Map<string, any[]>();
    for (const a of attRows as any[]) {
      if (!attMap.has(a.ohr_id)) attMap.set(a.ohr_id, []);
      attMap.get(a.ohr_id)!.push(a);
    }

    // Check WFM schedule for rest days
    const wfmResult: any = await db.execute(
      sql`SELECT ohr_id, schedule_date, wfm_value
          FROM io_wfm_schedules
          WHERE ohr_id IN (${sql.join(staffOhrs.map((o: string) => sql`${o}`), sql`, `)})
            AND schedule_date >= ${dateFrom} AND schedule_date <= ${dateTo}`
    );
    const wfmRows = Array.isArray(wfmResult) ? wfmResult : [];
    const wfmMap = new Map<string, any[]>();
    for (const w of wfmRows as any[]) {
      if (!wfmMap.has(w.ohr_id)) wfmMap.set(w.ohr_id, []);
      wfmMap.get(w.ohr_id)!.push(w);
    }

    // Check existing role changes for this week (conflict detection)
    const existingResult: any = await db.execute(
      sql`SELECT ohr_id, date_from, date_to, new_role, new_pg
          FROM io_role_changes
          WHERE week_ending = ${weekEnding}
            AND ohr_id IN (${sql.join(staffOhrs.map((o: string) => sql`${o}`), sql`, `)})`
    );
    const existingRows = Array.isArray(existingResult) ? existingResult : [];
    const existingMap = new Map<string, any[]>();
    for (const e of existingRows as any[]) {
      if (!existingMap.has(e.ohr_id)) existingMap.set(e.ohr_id, []);
      existingMap.get(e.ohr_id)!.push(e);
    }

    // Build 7-day schedule strip (Sat → Fri) for each staff member
    // Generate the 7 dates in the work week (dateFrom = Saturday, dateTo = Friday)
    const weekDates: string[] = [];
    const startDate = new Date(dateFrom + 'T00:00:00Z');
    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      weekDates.push(d.toISOString().slice(0, 10));
    }

    const leaveTags = ["PL", "UPL", "ML", "EXIT", "LOA"];
    const restDayValues = ["WO", "RD", "REST"];

    const staff = staffRows.map((s: any) => {
      const att = attMap.get(s.ohr_id) || [];
      const wfm = wfmMap.get(s.ohr_id) || [];
      const existing = existingMap.get(s.ohr_id) || [];

      // Build lookup maps by date for this staff member
      const attByDate = new Map<string, any>();
      for (const a of att) {
        const d = String(a.log_date || '').slice(0, 10);
        attByDate.set(d, a);
      }
      const wfmByDate = new Map<string, any>();
      for (const w of wfm) {
        const d = String(w.schedule_date || '').slice(0, 10);
        wfmByDate.set(d, w);
      }

      // Check if role change covers a specific date
      const rcCoversDate = (date: string): any | null => {
        for (const rc of existing) {
          const rcFrom = String(rc.date_from || '').slice(0, 10);
          const rcTo = String(rc.date_to || '').slice(0, 10);
          if (date >= rcFrom && date <= rcTo) return rc;
        }
        return null;
      };

      // Compute per-day status for the 7-day strip
      const schedule: { date: string; code: string; detail?: string }[] = weekDates.map(date => {
        // Priority 1: Existing role change assignment
        const rc = rcCoversDate(date);
        if (rc) {
          return { date, code: 'RC', detail: `${rc.new_role} @ ${rc.new_pg}` };
        }
        // Priority 2: Leave from attendance
        const attRec = attByDate.get(date);
        if (attRec && leaveTags.includes((attRec.tag || '').toUpperCase())) {
          return { date, code: (attRec.tag || '').toUpperCase() };
        }
        // Priority 3: Rest day from WFM schedule
        const wfmRec = wfmByDate.get(date);
        if (wfmRec && restDayValues.includes((wfmRec.wfm_value || '').toUpperCase())) {
          return { date, code: 'WO' };
        }
        // Priority 4: Has WFM schedule entry (scheduled to work)
        if (wfmRec) {
          return { date, code: 'SCH' };
        }
        // Priority 5: Has attendance record (worked that day)
        if (attRec) {
          return { date, code: 'SCH' };
        }
        // Fallback: no data
        return { date, code: '-' };
      });

      // Count non-SCH days (lower = more available)
      const nonSchCount = schedule.filter(d => d.code !== 'SCH').length;

      return {
        ohr_id: s.ohr_id,
        full_name: s.full_name,
        srt_id: s.srt_id,
        actual_role: s.actual_role,
        planning_group: s.planning_group,
        supervisor_name: s.supervisor_name,
        shift_time: s.shift_time,
        schedule,
        non_sch_count: nonSchCount,
      };
    });

    // Sort: least non-SCH days first (most available), then by role (TL first), then by name
    staff.sort((a: any, b: any) => {
      if (a.non_sch_count !== b.non_sch_count) return a.non_sch_count - b.non_sch_count;
      if (a.actual_role !== b.actual_role) return a.actual_role === "Team Lead" ? -1 : 1;
      return (a.full_name || "").localeCompare(b.full_name || "");
    });

    res.json({ staff });
  } catch (err: any) {
    console.error("[IO API] role-change/available-staff error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /role-change/generate
// Creates role change records, generates email HTML,
// and auto-updates attendance records
// ============================================================
router.post("/generate", validate(roleChangeGenerateSchema), async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const actorOhr = String(req.headers["x-actor-ohr"] || req.headers["x-user-ohr"] || "").trim();
    const actorName = String(req.headers["x-actor-name"] || "").trim();

    const { week_ending, assignments } = req.body;
    if (!week_ending || !Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({ error: "week_ending and assignments[] are required" });
    }

    // Validate assignments
    for (const a of assignments) {
      if (!a.ohr_id || !a.new_role || !a.new_pg || !a.date_from || !a.date_to) {
        return res.status(400).json({
          error: `Invalid assignment for OHR ${a.ohr_id}: new_role, new_pg, date_from, date_to required`,
        });
      }
    }

    const now = new Date().toISOString();
    const results: any[] = [];

    // Look up employee details for all OHRs
    const ohrs = assignments.map((a: any) => a.ohr_id);
    const empResult: any = await db.execute(
      sql`SELECT ohr_id, full_name, srt_id, actual_role, planning_group
          FROM io_employees
          WHERE ohr_id IN (${sql.join(ohrs.map((o: string) => sql`${o}`), sql`, `)})`
    );
    const empRows = Array.isArray(empResult) ? empResult : [];
    const empMap = new Map<string, any>();
    for (const e of empRows as any[]) {
      empMap.set(e.ohr_id, e);
    }

    // Insert role change records and update attendance
    for (const a of assignments) {
      const emp = empMap.get(a.ohr_id);
      if (!emp) continue;

      // Insert role change record
      await db.insert(ioRoleChanges).values({
        ohr_id: a.ohr_id,
        srt_id: emp.srt_id || "",
        employee_name: emp.full_name || "",
        original_role: emp.actual_role || "",
        original_pg: emp.planning_group || "",
        new_role: a.new_role,
        new_pg: a.new_pg,
        date_from: a.date_from,
        date_to: a.date_to,
        week_ending,
        created_by: actorName,
        created_by_ohr: actorOhr,
        email_generated_at: now,
        attendance_updated: true,
        created_at: now,
      });

      // Auto-update attendance records for the date range
      // Update billing role and billing planning_group in io_attendance
      const updateResult: any = await db.execute(
        sql`UPDATE io_attendance
            SET role = ${a.new_role},
                planning_group = ${a.new_pg}
            WHERE ohr_id = ${a.ohr_id}
              AND log_date >= ${a.date_from}
              AND log_date <= ${a.date_to}`
      );
      const rowsUpdated = Array.isArray(updateResult) ? updateResult.length : 0;

      results.push({
        ohr_id: a.ohr_id,
        employee_name: emp.full_name,
        srt_id: emp.srt_id,
        original_role: emp.actual_role,
        original_pg: emp.planning_group,
        new_role: a.new_role,
        new_pg: a.new_pg,
        date_from: a.date_from,
        date_to: a.date_to,
        attendance_rows_updated: rowsUpdated,
      });
    }

    // Generate email HTML matching Jennifer's format
    const emailHtml = generateRoleChangeEmailHtml(week_ending, results);

    emitChange(req, "role-change", "record_created", { count: results.length });
    emitChange(req, "role-change", "record_created", { count: results.length });
    res.json({
      success: true,
      total_assignments: results.length,
      results,
      email_html: emailHtml,
      email_subject: `Role Change Request - WE ${formatWeekEndingShort(week_ending)}`,
    });
  } catch (err: any) {
    console.error("[IO API] role-change/generate error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /role-change/history?week_ending=YYYY-MM-DD
// Returns past role change records for the selected week
// ============================================================
router.get("/history", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const weekEnding = req.query.week_ending as string | undefined;

    let rows: any[];
    if (weekEnding) {
      rows = await db
        .select()
        .from(ioRoleChanges)
        .where(eq(ioRoleChanges.week_ending, weekEnding))
        .orderBy(desc(ioRoleChanges.id));
    } else {
      rows = await db
        .select()
        .from(ioRoleChanges)
        .orderBy(desc(ioRoleChanges.id))
        .limit(100);
    }

    res.json({ history: rows });
  } catch (err: any) {
    console.error("[IO API] role-change/history error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /role-change/suggest?week_ending=YYYY-MM-DD
// Auto-suggest role/PG assignments based on deficit analysis
// ============================================================
router.get("/suggest", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const weekEnding = String(req.query.week_ending || "");
    if (!weekEnding) return res.status(400).json({ error: "week_ending is required" });

    // Mapping: deficit PG → suggested new role for support staff
    // When a PG is in deficit, TLs/Trainers from other PGs can be moved there
    // The new role depends on the target PG's billing role structure
    const PG_ROLE_SUGGESTIONS: Record<string, string> = {
      "S-ABF": "Agent",
      "CS-ABF": "Agent",
      "RECALL_MEASUREMENT_CTR": "Agent",
      "CSO_CTR": "Agent",
      "FAD_CTR": "Agent",
      "SME_CTR": "Operational SME",
      "QPE_CTR": "Quality & Policy Expert",
    };

    res.json({ suggestions: PG_ROLE_SUGGESTIONS });
  } catch (err: any) {
    console.error("[IO API] role-change/suggest error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Helper: Generate email HTML matching Jennifer's format
// ============================================================
function generateRoleChangeEmailHtml(weekEnding: string, assignments: any[]): string {
  const weFormatted = formatWeekEndingShort(weekEnding);

  const tableRows = assignments
    .map(
      (a) => `
    <tr>
      <td style="border:1px solid #000;padding:6px 10px;font-family:Calibri,sans-serif;font-size:11pt;text-align:center;">${weFormatted}</td>
      <td style="border:1px solid #000;padding:6px 10px;font-family:Calibri,sans-serif;font-size:11pt;text-align:center;">${a.ohr_id}</td>
      <td style="border:1px solid #000;padding:6px 10px;font-family:Calibri,sans-serif;font-size:11pt;text-align:center;">${a.srt_id || ""}</td>
      <td style="border:1px solid #000;padding:6px 10px;font-family:Calibri,sans-serif;font-size:11pt;">${a.employee_name}</td>
      <td style="border:1px solid #000;padding:6px 10px;font-family:Calibri,sans-serif;font-size:11pt;">${a.original_role}</td>
      <td style="border:1px solid #000;padding:6px 10px;font-family:Calibri,sans-serif;font-size:11pt;">${a.original_pg}</td>
      <td style="border:1px solid #000;padding:6px 10px;font-family:Calibri,sans-serif;font-size:11pt;background-color:#FFFF00;font-weight:bold;">${a.new_role}</td>
      <td style="border:1px solid #000;padding:6px 10px;font-family:Calibri,sans-serif;font-size:11pt;background-color:#FFFF00;font-weight:bold;">${a.new_pg}</td>
      <td style="border:1px solid #000;padding:6px 10px;font-family:Calibri,sans-serif;font-size:11pt;text-align:center;">${formatDateRange(a.date_from, a.date_to)}</td>
    </tr>`
    )
    .join("");

  return `<div style="font-family:Calibri,sans-serif;font-size:11pt;">
<p>Hi Team,</p>
<p>Kindly requesting the following role change/s for <strong>WE ${weFormatted}</strong>:</p>

<table style="border-collapse:collapse;width:100%;margin:16px 0;">
  <thead>
    <tr style="background-color:#4472C4;color:#fff;">
      <th style="border:1px solid #000;padding:8px 10px;font-family:Calibri,sans-serif;font-size:11pt;font-weight:bold;text-align:center;">WE</th>
      <th style="border:1px solid #000;padding:8px 10px;font-family:Calibri,sans-serif;font-size:11pt;font-weight:bold;text-align:center;">OHR</th>
      <th style="border:1px solid #000;padding:8px 10px;font-family:Calibri,sans-serif;font-size:11pt;font-weight:bold;text-align:center;">SRT ID</th>
      <th style="border:1px solid #000;padding:8px 10px;font-family:Calibri,sans-serif;font-size:11pt;font-weight:bold;">NAME</th>
      <th style="border:1px solid #000;padding:8px 10px;font-family:Calibri,sans-serif;font-size:11pt;font-weight:bold;">CURRENT ROLE</th>
      <th style="border:1px solid #000;padding:8px 10px;font-family:Calibri,sans-serif;font-size:11pt;font-weight:bold;">CURRENT PG</th>
      <th style="border:1px solid #000;padding:8px 10px;font-family:Calibri,sans-serif;font-size:11pt;font-weight:bold;background-color:#FFFF00;color:#000;">NEW ROLE</th>
      <th style="border:1px solid #000;padding:8px 10px;font-family:Calibri,sans-serif;font-size:11pt;font-weight:bold;background-color:#FFFF00;color:#000;">NEW PG</th>
      <th style="border:1px solid #000;padding:8px 10px;font-family:Calibri,sans-serif;font-size:11pt;font-weight:bold;text-align:center;">DATES</th>
    </tr>
  </thead>
  <tbody>
    ${tableRows}
  </tbody>
</table>

<p>Thank you.</p>
<p>Best regards,<br>Playbook Reporting</p>
</div>`;
}

function formatWeekEndingShort(we: string): string {
  const d = new Date(we + "T00:00:00");
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateRange(from: string, to: string): string {
  const f = new Date(from + "T00:00:00");
  const t = new Date(to + "T00:00:00");
  const fStr = `${String(f.getMonth() + 1).padStart(2, "0")}/${String(f.getDate()).padStart(2, "0")}`;
  const tStr = `${String(t.getMonth() + 1).padStart(2, "0")}/${String(t.getDate()).padStart(2, "0")}`;
  if (fStr === tStr) return fStr;
  return `${fStr} - ${tStr}`;
}

export default router;
