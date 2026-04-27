/**
 * Tardiness Validator & Analytics API Routes
 * Handles CSV upload, validation, analytics, and export for weekly tardiness tracking.
 * Weekly cadence: Saturday to Friday.
 */
import { Router, Request, Response } from "express";
import { getDb } from "./db.js";
import { ioTardiness, ioEmployees, ioNotifications } from "../drizzle/schema.js";
import { eq, and, gte, lte, sql, desc, inArray, count } from "drizzle-orm";

const router = Router();

// Admin OHRs — can see all teams, unlock validated items
const ADMIN_OHRS = ["740045023", "740044909"];

// ── Helpers ──────────────────────────────────────────────────────

/** Compute the next Friday (week-ending) for a Sat-Fri week from a given date string. */
function computeWeekEnding(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay(); // 0=Sun,1=Mon,...,5=Fri,6=Sat
  // Sat-Fri week: if Sat(6), week ends next Fri (+6). If Sun(0), +5. Mon(1), +4. ... Fri(5), +0.
  const daysToFri = day === 6 ? 6 : (5 - day + 7) % 7 || 0;
  // Special: if day is 5 (Friday), daysToFri = 0 (same day)
  d.setUTCDate(d.getUTCDate() + (day === 5 ? 0 : day === 6 ? 6 : 5 - day));
  return d.toISOString().slice(0, 10);
}

/** Derive shift type from roster_login hour. */
function deriveShiftType(rosterLogin: string): string {
  if (!rosterLogin) return "Unknown";
  // Parse hour from datetime like "4/21/2026 22:30" or "2026-04-21 22:30"
  const timePart = rosterLogin.includes("T") ? rosterLogin.split("T")[1] : rosterLogin.split(" ").pop() || "";
  const hour = parseInt(timePart.split(":")[0], 10);
  if (isNaN(hour)) return "Unknown";
  if (hour >= 5 && hour < 13) return "Morning";
  if (hour >= 13 && hour < 21) return "Afternoon";
  return "GY Shift"; // 21-5 covers overnight/graveyard
}

/** Calculate tardiness minutes from roster_login vs actual_login. */
function calcTardinessMinutes(rosterLogin: string, actualLogin: string): number {
  if (!rosterLogin || !actualLogin) return 0;
  const rDate = parseFlexibleDatetime(rosterLogin);
  const aDate = parseFlexibleDatetime(actualLogin);
  if (!rDate || !aDate) return 0;
  const diffMs = aDate.getTime() - rDate.getTime();
  const diffMin = Math.round(diffMs / 60000);
  return diffMin > 0 ? diffMin : 0; // Only positive = late
}

/** Parse flexible datetime formats: "M/D/YYYY H:mm", "YYYY-MM-DD HH:mm", "YYYY-MM-DDTHH:mm" */
function parseFlexibleDatetime(s: string): Date | null {
  if (!s || !s.trim()) return null;
  s = s.trim();
  // Try ISO first
  if (s.includes("T") || /^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  // M/D/YYYY H:mm format
  const parts = s.split(" ");
  if (parts.length < 2) return null;
  const dateParts = parts[0].split("/");
  if (dateParts.length !== 3) return null;
  const [m, d, y] = dateParts.map(Number);
  const timeParts = parts[1].split(":");
  const hr = parseInt(timeParts[0], 10);
  const min = parseInt(timeParts[1] || "0", 10);
  const dt = new Date(y, m - 1, d, hr, min);
  return isNaN(dt.getTime()) ? null : dt;
}

/** Normalize date to YYYY-MM-DD from various formats. */
function normalizeDate(dateStr: string): string {
  if (!dateStr) return "";
  dateStr = dateStr.trim();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  // M/D/YYYY
  const parts = dateStr.split("/");
  if (parts.length === 3) {
    const [m, d, y] = parts;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // Try Date parse
  const dt = new Date(dateStr);
  if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return dateStr;
}

/** CSV serializer (same pattern as io-backup.ts) */
function toCSV(rows: Record<string, any>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    const values = headers.map((h) => {
      const val = row[h];
      if (val === null || val === undefined) return "";
      const str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    lines.push(values.join(","));
  }
  return lines.join("\n");
}

// ============================================================
// POST /tardiness/upload — CSV upload with auto-calculation
// ============================================================
router.post("/tardiness/upload", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const { records } = req.body;
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: "No records provided" });
    }

    const batchId = `TARD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    // Pre-fetch employee roster for enrichment (single query)
    const ohrList = Array.from(new Set(records.map((r: any) => String(r.ohr || r.OHR || r.ohr_id || ""))));
    const empRows: any = await db.execute(
      sql`SELECT ohr_id, full_name, supervisor_name, planning_group, actual_role, shift_time
          FROM io_employees WHERE ohr_id IN (${sql.raw(ohrList.map(o => `'${o}'`).join(","))})`
    );
    const empMap = new Map<string, any>();
    const empData = Array.isArray(empRows[0]) ? empRows[0] : empRows;
    for (const e of empData) empMap.set(e.ohr_id, e);

    let inserted = 0;
    let skipped = 0;
    let enriched = 0;

    for (const r of records) {
      const ohr = String(r.ohr || r.OHR || r.ohr_id || "").trim();
      if (!ohr) { skipped++; continue; }

      const rawDate = String(r.date || r.Date || "").trim();
      const dateNorm = normalizeDate(rawDate);
      if (!dateNorm) { skipped++; continue; }

      const rosterLogin = String(r.roster_login || r["Roaster Login"] || r.roster_login || "").trim();
      const rosterLogout = String(r.roster_logout || r["Roaster Logout"] || r.roster_logout || "").trim();
      const actualLogin = String(r.actual_login || r["Actual Login"] || "").trim();
      const actualLogout = String(r.actual_logout || r["Actual Logout"] || "").trim();

      // Auto-calculate tardiness
      const tardMins = calcTardinessMinutes(rosterLogin, actualLogin);

      // Only create validation items for late logins (tardiness > 0)
      if (tardMins <= 0) { skipped++; continue; }

      // Duplicate detection: same OHR + date
      const existing: any = await db.execute(
        sql`SELECT id FROM io_tardiness WHERE ohr_id = ${ohr} AND date = ${dateNorm} LIMIT 1`
      );
      const existingRows = Array.isArray(existing[0]) ? existing[0] : existing;
      if (existingRows.length > 0) { skipped++; continue; }

      // Enrich from io_employees
      const emp = empMap.get(ohr);
      const empName = String(r.name || r.Name || emp?.full_name || "Unknown").trim();
      const supervisor = emp?.supervisor_name || "";
      const pg = emp?.planning_group || "";
      const role = emp?.actual_role || "";
      const shiftTime = emp?.shift_time || "";
      if (emp) enriched++;

      const shiftType = deriveShiftType(rosterLogin);
      const weekEnding = computeWeekEnding(dateNorm);

      await db.execute(
        sql`INSERT INTO io_tardiness (ohr_id, employee_name, supervisor_name, planning_group, actual_role, shift_time, date, roster_login, roster_logout, actual_login, actual_logout, tardiness_minutes, shift_type, week_ending, validation_status, upload_batch, created_at)
            VALUES (${ohr}, ${empName}, ${supervisor}, ${pg}, ${role}, ${shiftTime}, ${dateNorm}, ${rosterLogin}, ${rosterLogout}, ${actualLogin}, ${actualLogout}, ${tardMins}, ${shiftType}, ${weekEnding}, 'Pending', ${batchId}, ${now})`
      );
      inserted++;
    }

    res.json({ success: true, inserted, skipped, enriched, total: records.length, batch_id: batchId });
  } catch (err: any) {
    console.error("[IO API] tardiness upload error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /tardiness — list with filters (team-scoped for TLs)
// ============================================================
router.get("/tardiness", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const actorOhr = String(req.headers["x-actor-ohr"] || "");
    const actorName = String(req.headers["x-actor-name"] || "");
    const isAdmin = ADMIN_OHRS.includes(actorOhr);

    const { week_ending, planning_group, status, search, scope } = req.query;

    let conditions: string[] = [];
    let params: any[] = [];

    // Team scoping: TLs only see their team unless admin
    if (!isAdmin && scope !== "all") {
      // Get the actor's name to match as supervisor
      conditions.push("t.supervisor_name LIKE ?");
      params.push(`%${actorName.split(",")[0]}%`); // Match by last name
    }

    if (week_ending) { conditions.push("t.week_ending = ?"); params.push(String(week_ending)); }
    if (planning_group) { conditions.push("t.planning_group = ?"); params.push(String(planning_group)); }
    if (status) { conditions.push("t.validation_status = ?"); params.push(String(status)); }
    if (search) {
      conditions.push("(t.employee_name LIKE ? OR t.ohr_id LIKE ?)");
      params.push(`%${String(search)}%`, `%${String(search)}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Build the final SQL with params inlined (drizzle sql.raw doesn't support ? bindings)
    let stmt = `SELECT t.* FROM io_tardiness t ${whereClause} ORDER BY t.date DESC, t.employee_name ASC LIMIT 5000`;
    if (params.length) {
      const paramsCopy = [...params];
      stmt = stmt.replace(/\?/g, () => {
        const v = paramsCopy.shift();
        return typeof v === "string" ? `'${v.replace(/'/g, "''")}'` : String(v);
      });
    }
    const result: any = await db.execute(sql.raw(stmt));
    const data = Array.isArray(result[0]) ? result[0] : result;

    res.json({ items: data, is_admin: isAdmin });
  } catch (err: any) {
    console.error("[IO API] tardiness GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// PATCH /tardiness/:id — validate single item (lock-in)
// ============================================================
router.patch("/tardiness/:id", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const id = parseInt(req.params.id, 10);
    const actorOhr = String(req.headers["x-actor-ohr"] || "");
    const actorName = String(req.headers["x-actor-name"] || "");
    const isAdmin = ADMIN_OHRS.includes(actorOhr);
    const { validation_status, remarks, unlock } = req.body;

    // Check current state
    const existing: any = await db.execute(sql`SELECT * FROM io_tardiness WHERE id = ${id}`);
    const rows = Array.isArray(existing[0]) ? existing[0] : existing;
    if (rows.length === 0) return res.status(404).json({ error: "Item not found" });

    const item = rows[0];

    // Lock-in: once validated, cannot be changed unless admin unlocks
    if (item.validation_status !== "Pending" && !unlock) {
      if (!isAdmin) {
        return res.status(403).json({ error: "This item has been locked after validation. Contact admin to unlock." });
      }
    }

    // Admin unlock: reset to Pending
    if (unlock && isAdmin) {
      await db.execute(
        sql`UPDATE io_tardiness SET validation_status = 'Pending', validated_by = NULL, validated_by_ohr = NULL, validated_at = NULL, remarks = NULL WHERE id = ${id}`
      );
      return res.json({ success: true, action: "unlocked" });
    }

    if (!["Valid", "Invalid"].includes(validation_status)) {
      return res.status(400).json({ error: "validation_status must be 'Valid' or 'Invalid'" });
    }

    const now = new Date().toISOString();
    await db.execute(
      sql`UPDATE io_tardiness SET validation_status = ${validation_status}, validated_by = ${actorName}, validated_by_ohr = ${actorOhr}, validated_at = ${now}, remarks = ${remarks || null} WHERE id = ${id}`
    );

    res.json({ success: true, action: "validated", status: validation_status });
  } catch (err: any) {
    console.error("[IO API] tardiness PATCH error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// PATCH /tardiness/bulk-validate — bulk validation
// ============================================================
router.patch("/tardiness/bulk-validate", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const actorOhr = String(req.headers["x-actor-ohr"] || "");
    const actorName = String(req.headers["x-actor-name"] || "");
    const { ids, validation_status, remarks } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "No IDs provided" });
    }
    if (!["Valid", "Invalid"].includes(validation_status)) {
      return res.status(400).json({ error: "validation_status must be 'Valid' or 'Invalid'" });
    }

    const now = new Date().toISOString();
    const idList = ids.map((i: any) => parseInt(i, 10)).filter((i: number) => !isNaN(i));

    // Only update items that are still Pending
    const result: any = await db.execute(
      sql.raw(`UPDATE io_tardiness SET validation_status = '${validation_status}', validated_by = '${actorName.replace(/'/g, "''")}', validated_by_ohr = '${actorOhr}', validated_at = '${now}', remarks = ${remarks ? `'${String(remarks).replace(/'/g, "''")}'` : 'NULL'} WHERE id IN (${idList.join(",")}) AND validation_status = 'Pending'`)
    );

    const info = Array.isArray(result[0]) ? result[0] : result;
    res.json({ success: true, updated: info.affectedRows || idList.length, total: idList.length });
  } catch (err: any) {
    console.error("[IO API] tardiness bulk-validate error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /tardiness/analytics — aggregated analytics
// ============================================================
router.get("/tardiness/analytics", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const actorOhr = String(req.headers["x-actor-ohr"] || "");
    const actorName = String(req.headers["x-actor-name"] || "");
    const isAdmin = ADMIN_OHRS.includes(actorOhr);
    const { start_we, end_we, planning_group, scope } = req.query;

    let teamFilter = "";
    if (!isAdmin && scope !== "all") {
      teamFilter = `AND supervisor_name LIKE '%${(actorName.split(",")[0] || "").replace(/'/g, "''").trim()}%'`;
    }
    const pgFilter = planning_group ? `AND planning_group = '${String(planning_group).replace(/'/g, "''")}'` : "";
    const weStart = start_we ? `AND week_ending >= '${String(start_we)}'` : "";
    const weEnd = end_we ? `AND week_ending <= '${String(end_we)}'` : "";
    const baseWhere = `WHERE validation_status = 'Valid' ${teamFilter} ${pgFilter} ${weStart} ${weEnd}`;

    // KPI: total valid instances, avg tardiness, total unique agents
    const kpiResult: any = await db.execute(sql.raw(
      `SELECT COUNT(*) as total_instances, AVG(tardiness_minutes) as avg_minutes, COUNT(DISTINCT ohr_id) as unique_agents, SUM(tardiness_minutes) as total_minutes FROM io_tardiness ${baseWhere}`
    ));
    const kpi = (Array.isArray(kpiResult[0]) ? kpiResult[0] : kpiResult)[0] || {};

    // Total headcount for on-time rate (all items including Valid + Invalid + Pending)
    const allCountResult: any = await db.execute(sql.raw(
      `SELECT COUNT(*) as total FROM io_tardiness WHERE 1=1 ${teamFilter} ${pgFilter} ${weStart} ${weEnd}`
    ));
    const allCount = (Array.isArray(allCountResult[0]) ? allCountResult[0] : allCountResult)[0]?.total || 0;

    // Weekly trend
    const weeklyResult: any = await db.execute(sql.raw(
      `SELECT week_ending, COUNT(*) as instances, AVG(tardiness_minutes) as avg_minutes, SUM(tardiness_minutes) as total_minutes FROM io_tardiness ${baseWhere} GROUP BY week_ending ORDER BY week_ending ASC`
    ));
    const weekly = Array.isArray(weeklyResult[0]) ? weeklyResult[0] : weeklyResult;

    // Per-PG breakdown
    const pgResult: any = await db.execute(sql.raw(
      `SELECT planning_group, COUNT(*) as instances, AVG(tardiness_minutes) as avg_minutes FROM io_tardiness ${baseWhere} GROUP BY planning_group ORDER BY instances DESC`
    ));
    const byPg = Array.isArray(pgResult[0]) ? pgResult[0] : pgResult;

    // Per-TL team comparison
    const teamResult: any = await db.execute(sql.raw(
      `SELECT supervisor_name, COUNT(*) as instances, AVG(tardiness_minutes) as avg_minutes, COUNT(DISTINCT ohr_id) as unique_agents FROM io_tardiness ${baseWhere} GROUP BY supervisor_name ORDER BY instances DESC`
    ));
    const byTeam = Array.isArray(teamResult[0]) ? teamResult[0] : teamResult;

    // Top 5 repeat offenders (rolling 4-week window)
    const offenderResult: any = await db.execute(sql.raw(
      `SELECT ohr_id, employee_name, supervisor_name, planning_group, COUNT(*) as instances, SUM(tardiness_minutes) as total_minutes FROM io_tardiness ${baseWhere} GROUP BY ohr_id, employee_name, supervisor_name, planning_group ORDER BY instances DESC LIMIT 10`
    ));
    const topOffenders = Array.isArray(offenderResult[0]) ? offenderResult[0] : offenderResult;

    // Distinct week endings for filter dropdown
    const weeksResult: any = await db.execute(sql.raw(
      `SELECT DISTINCT week_ending FROM io_tardiness ORDER BY week_ending DESC`
    ));
    const weeks = (Array.isArray(weeksResult[0]) ? weeksResult[0] : weeksResult).map((r: any) => r.week_ending);

    // Distinct PGs for filter dropdown
    const pgsResult: any = await db.execute(sql.raw(
      `SELECT DISTINCT planning_group FROM io_tardiness WHERE planning_group IS NOT NULL AND planning_group != '' ORDER BY planning_group`
    ));
    const pgs = (Array.isArray(pgsResult[0]) ? pgsResult[0] : pgsResult).map((r: any) => r.planning_group);

    res.json({
      kpi: {
        total_instances: Number(kpi.total_instances) || 0,
        avg_minutes: Math.round(Number(kpi.avg_minutes) || 0),
        total_minutes: Number(kpi.total_minutes) || 0,
        unique_agents: Number(kpi.unique_agents) || 0,
        on_time_rate: allCount > 0 ? Math.round((1 - (Number(kpi.total_instances) || 0) / allCount) * 100) : 100,
      },
      weekly,
      by_pg: byPg,
      by_team: byTeam,
      top_offenders: topOffenders,
      filters: { weeks, planning_groups: pgs },
      is_admin: isAdmin,
    });
  } catch (err: any) {
    console.error("[IO API] tardiness analytics error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /tardiness/export — CSV export
// ============================================================
router.get("/tardiness/export", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const { week_ending, planning_group, status } = req.query;
    let conditions: string[] = [];
    if (week_ending) conditions.push(`week_ending = '${String(week_ending).replace(/'/g, "''")}'`);
    if (planning_group) conditions.push(`planning_group = '${String(planning_group).replace(/'/g, "''")}'`);
    if (status) conditions.push(`validation_status = '${String(status).replace(/'/g, "''")}'`);

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result: any = await db.execute(sql.raw(
      `SELECT ohr_id, employee_name, supervisor_name, planning_group, actual_role, date, roster_login, roster_logout, actual_login, actual_logout, tardiness_minutes, shift_type, week_ending, validation_status, validated_by, validated_at, remarks FROM io_tardiness ${whereClause} ORDER BY week_ending DESC, date DESC, employee_name ASC`
    ));
    const rows = Array.isArray(result[0]) ? result[0] : result;

    const csv = toCSV(rows);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="tardiness_export_${Date.now()}.csv"`);
    res.send(csv);
  } catch (err: any) {
    console.error("[IO API] tardiness export error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /tardiness/escalation-check — check for agents with 3+ valid instances in rolling 4 weeks
// ============================================================
router.get("/tardiness/escalation-check", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    // Rolling 4-week window: last 4 distinct week_endings
    const weeksResult: any = await db.execute(sql.raw(
      `SELECT DISTINCT week_ending FROM io_tardiness WHERE validation_status = 'Valid' ORDER BY week_ending DESC LIMIT 4`
    ));
    const weeks = (Array.isArray(weeksResult[0]) ? weeksResult[0] : weeksResult).map((r: any) => r.week_ending);
    if (weeks.length === 0) return res.json({ escalations: [] });

    const weekList = weeks.map((w: string) => `'${w}'`).join(",");
    const result: any = await db.execute(sql.raw(
      `SELECT ohr_id, employee_name, supervisor_name, planning_group, COUNT(*) as instances, SUM(tardiness_minutes) as total_minutes
       FROM io_tardiness
       WHERE validation_status = 'Valid' AND week_ending IN (${weekList})
       GROUP BY ohr_id, employee_name, supervisor_name, planning_group
       HAVING COUNT(*) >= 3
       ORDER BY instances DESC`
    ));
    const escalations = Array.isArray(result[0]) ? result[0] : result;

    res.json({ escalations, window_weeks: weeks });
  } catch (err: any) {
    console.error("[IO API] tardiness escalation-check error:", err);
    res.status(500).json({ error: err.message });
  }
});

export function registerTardinessRoutes(app: import("express").Express) {
  app.use("/api/io", router);
  console.log("[IO API] Tardiness routes registered under /api/io/tardiness/*");
}
