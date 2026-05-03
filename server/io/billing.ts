/**
 * Billing Domain Module
 * Extracted from io-routes.ts — handles billing target hours, SRT bill upload,
 * billing targets V2, compliance calculation engine, billing CSV upload,
 * billing sheet sync, sync log, attendance export, productivity hours, backfill
 */
import { Router, Request, Response } from "express";
import { getDb } from "../db.js";
import {
  ioAttendance,
  ioEmployees,
  ioSyncLog,
} from "../../drizzle/schema.js";
import { eq, and, gte, lte, ne, sql, desc, asc, inArray, or, count } from "drizzle-orm";
import { ADMIN_OHRS, normalizePg, getManagerOhrSet } from "./shared.js";
import { syncEmployeesToSupabase } from "../supabase-sync.js";

const router = Router();

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


export default router;
