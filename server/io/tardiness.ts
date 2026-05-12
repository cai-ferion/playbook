/**
 * Tardiness Validator API Routes
 * Handles CSV upload, validation, and export for weekly tardiness tracking.
 * Weekly cadence: Saturday to Friday.
 */
import { Router, Request, Response } from "express";
import { getDb } from "../db.js";
import { ioTardiness, ioEmployees, ioNotifications } from "../../drizzle/schema.js";
import { eq, and, gte, lte, sql, desc, inArray, count } from "drizzle-orm";
import { ADMIN_OHRS } from "../config.js";
import { validate, tardinessUploadSchema, tardinessUpdateSchema, tardinessBulkValidateSchema } from "./validation.js";
import { emitChange } from "./emit-change.js";
import { optimisticUpdate, sendConflict, getClientVersion } from "./optimistic-lock.js";

const router = Router();

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
  if (hour >= 13 && hour < 21) return "Mid-Shift";
  return "GY Shift"; // 21-5 covers overnight/graveyard
}

/** Calculate tardiness minutes from roster_login vs actual_login. */
function calcTardinessMinutes(rosterLogin: string, actualLogin: string): number {
  if (!rosterLogin || !actualLogin) return 0;
  const rDate = parseFlexibleDatetime(rosterLogin);
  if (!rDate) return 0;

  // For Excel serial actual_login, extract only the time-of-day and apply to roster date
  // This prevents cross-day comparison bugs (e.g., serial date != roster date)
  const actualTrimmed = actualLogin.trim();
  if (/^\d{4,5}(\.\d+)?$/.test(actualTrimmed)) {
    const serial = parseFloat(actualTrimmed);
    if (serial > 40000 && serial < 60000) {
      const frac = serial - Math.floor(serial);
      const totalMinutes = Math.round(frac * 1440);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      // Apply time-of-day to the ROSTER LOGIN date (same day comparison)
      const aDate = new Date(rDate.getFullYear(), rDate.getMonth(), rDate.getDate(), hours, minutes);
      const diffMs = aDate.getTime() - rDate.getTime();
      const diffMin = Math.round(diffMs / 60000);
      // Cap at reasonable max (480 min = 8 hours) to catch any remaining edge cases
      return diffMin > 0 ? Math.min(diffMin, 480) : 0;
    }
  }

  const aDate = parseFlexibleDatetime(actualLogin);
  if (!aDate) return 0;
  const diffMs = aDate.getTime() - rDate.getTime();
  const diffMin = Math.round(diffMs / 60000);
  // Cap at reasonable max (480 min = 8 hours)
  return diffMin > 0 ? Math.min(diffMin, 480) : 0;
}

/** Parse flexible datetime formats: "M/D/YYYY H:mm", "YYYY-MM-DD HH:mm", "YYYY-MM-DDTHH:mm", Excel serial numbers */
function parseFlexibleDatetime(s: string): Date | null {
  if (!s || !s.trim()) return null;
  s = s.trim();

  // Excel serial number detection: a pure number like "46112.56"
  // Excel serial = days since Dec 30, 1899; fractional part = time of day (local time)
  if (/^\d{4,5}(\.\d+)?$/.test(s)) {
    const serial = parseFloat(s);
    if (serial > 40000 && serial < 60000) { // Reasonable date range (2009-2063)
      // Excel epoch: serial 0 = Dec 30, 1899 (due to 1900 leap year bug)
      const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899 local
      const days = Math.floor(serial);
      const dateMs = excelEpoch.getTime() + days * 86400000;
      const baseDate = new Date(dateMs);
      // Fractional part = time of day
      const frac = serial - days;
      const totalMinutes = Math.round(frac * 1440);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), hours, minutes);
      return isNaN(d.getTime()) ? null : d;
    }
  }

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
// Batch-optimised: single duplicate-check query + batch INSERT
// to avoid per-record round-trips that timeout on deployed TiDB.
// ============================================================
router.post("/tardiness/upload", validate(tardinessUploadSchema), async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const { records } = req.body;

    const batchId = `TARD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    // Pre-fetch employee roster for enrichment (single query)
    const ohrList = Array.from(new Set(records.map((r: any) => String(r.ohr || r.OHR || r.ohr_id || "")).filter((o: string) => o)));
    let empMap = new Map<string, any>();
    if (ohrList.length > 0) {
      const empRows: any = await db.execute(
        sql`SELECT ohr_id, full_name, supervisor_name, planning_group, actual_role, shift_time, department
            FROM io_employees WHERE ohr_id IN (${sql.raw(ohrList.map(o => `'${o}'`).join(","))})`
      );
      const empData = Array.isArray(empRows) ? empRows : [];
      for (const e of empData) empMap.set(e.ohr_id, e);
    }

    // BU Filter: only process records for employees in our roster (COMMUNITY_OPS / INTEGRITY_OPS)
    // Employees not in io_employees are outside our business unit scope and are rejected.
    const ALLOWED_BUS = new Set(Array.from(empMap.keys()));

    let inserted = 0;
    let skipped = 0;
    let skippedNoBU = 0;
    let enriched = 0;

    // Phase 1: Build candidate rows in-memory (no DB calls)
    type CandidateRow = {
      ohr: string; dateNorm: string; rosterLogin: string; rosterLogout: string;
      actualLogin: string; actualLogout: string; tardMins: number;
      empName: string; supervisor: string; pg: string; role: string;
      shiftTime: string; shiftType: string; weekEnding: string;
      validationStatus: string; autoRemarks: string | null;
      autoValidatedBy: string | null; autoValidatedByOhr: string | null;
      autoValidatedAt: string | null;
    };
    const candidates: CandidateRow[] = [];

    for (const r of records) {
      const ohr = String(r.ohr || r.OHR || r.ohr_id || "").trim();
      if (!ohr) { skipped++; continue; }
      if (!ALLOWED_BUS.has(ohr)) { skippedNoBU++; skipped++; continue; }

      const rawDate = String(r.date || r.Date || "").trim();
      const dateNorm = normalizeDate(rawDate);
      if (!dateNorm) { skipped++; continue; }

      const rosterLogin = String(r.roster_login || r["Roaster Login"] || r.roster_login || "").trim();
      const rosterLogout = String(r.roster_logout || r["Roaster Logout"] || r.roster_logout || "").trim();
      const actualLogin = String(r.actual_login || r["Actual Login"] || "").trim();
      const actualLogout = String(r.actual_logout || r["Actual Logout"] || "").trim();

      const tardMins = calcTardinessMinutes(rosterLogin, actualLogin);
      if (tardMins <= 0) { skipped++; continue; }

      const emp = empMap.get(ohr);
      const empName = String(r.name || r.Name || emp?.full_name || "Unknown").trim();
      if (emp) enriched++;

      const autoInvalid = tardMins < 5;
      candidates.push({
        ohr, dateNorm, rosterLogin, rosterLogout, actualLogin, actualLogout, tardMins,
        empName,
        supervisor: emp?.supervisor_name || "",
        pg: emp?.planning_group || "",
        role: emp?.actual_role || "",
        shiftTime: emp?.shift_time || "",
        shiftType: deriveShiftType(rosterLogin),
        weekEnding: computeWeekEnding(dateNorm),
        validationStatus: autoInvalid ? 'Invalid' : 'Pending',
        autoRemarks: autoInvalid ? 'Auto-invalidated: within 5-minute grace period' : null,
        autoValidatedBy: autoInvalid ? 'System' : null,
        autoValidatedByOhr: autoInvalid ? 'SYSTEM' : null,
        autoValidatedAt: autoInvalid ? now : null,
      });
    }

    if (candidates.length === 0) {
      emitChange(req, "tardiness", "bulk_update", { inserted: 0, skipped });
      return res.json({ success: true, inserted: 0, skipped, skipped_not_in_roster: skippedNoBU, enriched, total: records.length, batch_id: batchId });
    }

    // Phase 2: Batch duplicate detection — single query for all candidate ohr+date pairs
    const pairConditions = candidates.map(c =>
      `(ohr_id = '${c.ohr.replace(/'/g, "''")}' AND date = '${c.dateNorm.replace(/'/g, "''")}')`
    );
    // Query in chunks of 200 pairs to avoid SQL length limits
    const existingPairs = new Set<string>();
    const CHUNK = 200;
    for (let i = 0; i < pairConditions.length; i += CHUNK) {
      const chunk = pairConditions.slice(i, i + CHUNK);
      const existingRows: any = await db.execute(
        sql.raw(`SELECT ohr_id, date FROM io_tardiness WHERE ${chunk.join(" OR ")}`)
      );
      const rows = Array.isArray(existingRows) ? existingRows : [];
      for (const row of rows) existingPairs.add(`${row.ohr_id}|${row.date}`);
    }

    // Phase 3: Filter out duplicates, then batch INSERT remaining rows
    const toInsert = candidates.filter(c => !existingPairs.has(`${c.ohr}|${c.dateNorm}`));
    skipped += candidates.length - toInsert.length; // duplicates

    // Batch INSERT in chunks of 100 rows (TiDB multi-row INSERT)
    const INS_CHUNK = 100;
    const esc = (v: string | null) => v === null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
    for (let i = 0; i < toInsert.length; i += INS_CHUNK) {
      const chunk = toInsert.slice(i, i + INS_CHUNK);
      const valueRows = chunk.map(c =>
        `(${esc(c.ohr)}, ${esc(c.empName)}, ${esc(c.supervisor)}, ${esc(c.pg)}, ${esc(c.role)}, ${esc(c.shiftTime)}, ${esc(c.dateNorm)}, ${esc(c.rosterLogin)}, ${esc(c.rosterLogout)}, ${esc(c.actualLogin)}, ${esc(c.actualLogout)}, ${c.tardMins}, ${esc(c.shiftType)}, ${esc(c.weekEnding)}, ${esc(c.validationStatus)}, ${esc(c.autoRemarks)}, ${esc(c.autoValidatedBy)}, ${esc(c.autoValidatedByOhr)}, ${esc(c.autoValidatedAt)}, ${esc(batchId)}, ${esc(now)})`
      );
      await db.execute(sql.raw(
        `INSERT INTO io_tardiness (ohr_id, employee_name, supervisor_name, planning_group, actual_role, shift_time, date, roster_login, roster_logout, actual_login, actual_logout, tardiness_minutes, shift_type, week_ending, validation_status, remarks, validated_by, validated_by_ohr, validated_at, upload_batch, created_at) VALUES ${valueRows.join(", ")}`
      ));
      inserted += chunk.length;
    }

    emitChange(req, "tardiness", "bulk_update", { inserted, skipped });
    res.json({ success: true, inserted, skipped, skipped_not_in_roster: skippedNoBU, enriched, total: records.length, batch_id: batchId });
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
    const actorRole = String(req.headers["x-actor-role"] || "");
    const isAdmin = ADMIN_OHRS.includes(actorOhr);
    const isManager = actorRole === 'Manager';

    const { week_ending, planning_group, status, search, scope, supervisor, shift_type } = req.query;

    let conditions: string[] = [];
    let params: any[] = [];

    // Server-side role scoping: enforce data visibility regardless of frontend params
    // Admins and Managers see all; TLs see own + direct reports; Agents see own only
    if (!isAdmin && !isManager && actorOhr) {
      if (actorRole === 'Team Lead') {
        // TL: show tardiness for their direct reports (and own if applicable)
        conditions.push("e.supervisor_name = (SELECT full_name FROM io_employees WHERE ohr_id = ? LIMIT 1)");
        params.push(actorOhr);
      } else {
        // Agent / QPE / SME / Trainer: own tardiness only
        conditions.push("t.ohr_id = ?");
        params.push(actorOhr);
      }
    } else if (scope === "team" && actorName) {
      // Legacy team scoping for admins/managers who explicitly request it
      conditions.push("e.supervisor_name LIKE ?");
      params.push(`%${actorName.split(",")[0]}%`);
    }

    if (week_ending) { conditions.push("t.week_ending = ?"); params.push(String(week_ending)); }
    if (planning_group) { conditions.push("t.planning_group = ?"); params.push(String(planning_group)); }
    if (status) { conditions.push("t.validation_status = ?"); params.push(String(status)); }
    if (supervisor) { conditions.push("e.supervisor_name = ?"); params.push(String(supervisor)); }
    if (shift_type) { conditions.push("t.shift_type = ?"); params.push(String(shift_type)); }
    if (search) {
      conditions.push("(t.employee_name LIKE ? OR t.ohr_id LIKE ?)");
      params.push(`%${String(search)}%`, `%${String(search)}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Build the final SQL with params inlined (drizzle sql.raw doesn't support ? bindings)
    // LEFT JOIN io_employees for progressive-cascade supervisor (always reflects current employee data)
    let stmt = `SELECT t.*, e.supervisor_name AS live_supervisor, e.full_name AS live_full_name, e.planning_group AS live_planning_group, e.shift_time AS live_shift_time FROM io_tardiness t LEFT JOIN io_employees e ON t.ohr_id = e.ohr_id ${whereClause} ORDER BY t.date DESC, t.employee_name ASC LIMIT 5000`;
    if (params.length) {
      const paramsCopy = [...params];
      stmt = stmt.replace(/\?/g, () => {
        const v = paramsCopy.shift();
        return typeof v === "string" ? `'${v.replace(/'/g, "''")}'` : String(v);
      });
    }
    const result: any = await db.execute(sql.raw(stmt));
    const data = Array.isArray(result) ? result : [];

    // Provide filter metadata for dropdown population (distinct values from full dataset)
    let filters: any = undefined;
    const weSelect = req.query._populate_filters;
    // Always send filters on first call (client checks if dropdowns are empty)
    const weeksResult: any = await db.execute(sql.raw(
      `SELECT DISTINCT week_ending FROM io_tardiness WHERE week_ending IS NOT NULL AND week_ending != '' ORDER BY week_ending`
    ));
    // Sort by date descending (ISO YYYY-MM-DD format)
    const weeks = (Array.isArray(weeksResult) ? weeksResult : [])
      .map((r: any) => r.week_ending)
      .sort((a: string, b: string) => b.localeCompare(a)); // ISO strings sort lexicographically

    // Planning groups: use live data from io_employees to exclude stale/renamed groups
    const pgsResult: any = await db.execute(sql.raw(
      `SELECT DISTINCT e.planning_group FROM io_tardiness t LEFT JOIN io_employees e ON t.ohr_id = e.ohr_id WHERE e.planning_group IS NOT NULL AND e.planning_group != '' ORDER BY e.planning_group`
    ));
    const pgs = (Array.isArray(pgsResult) ? pgsResult : []).map((r: any) => r.planning_group);

    // Supervisors: use live data from io_employees for progressive cascade
    const supsResult: any = await db.execute(sql.raw(
      `SELECT DISTINCT e.supervisor_name FROM io_tardiness t LEFT JOIN io_employees e ON t.ohr_id = e.ohr_id WHERE e.supervisor_name IS NOT NULL AND e.supervisor_name != '' ORDER BY e.supervisor_name`
    ));
    const sups = (Array.isArray(supsResult) ? supsResult : []).map((r: any) => r.supervisor_name);

    const shiftTypesResult: any = await db.execute(sql.raw(
      `SELECT DISTINCT shift_type FROM io_tardiness WHERE shift_type IS NOT NULL AND shift_type != '' ORDER BY shift_type`
    ));
    const shiftTypes = (Array.isArray(shiftTypesResult) ? shiftTypesResult : []).map((r: any) => r.shift_type);

    filters = { weeks, planning_groups: pgs, supervisors: sups, shift_types: shiftTypes };

    // Compute stats from the full result set
    const stats = {
      total: data.length,
      pending: data.filter((r: any) => r.validation_status === 'Pending').length,
      valid: data.filter((r: any) => r.validation_status === 'Valid').length,
      invalid: data.filter((r: any) => r.validation_status === 'Invalid' && !(r.tardiness_minutes < 5 && (r.remarks || '').toLowerCase().includes('grace period'))).length,
      grace: data.filter((r: any) => r.validation_status === 'Invalid' && r.tardiness_minutes < 5 && (r.remarks || '').toLowerCase().includes('grace period')).length,
    };

    res.json({ items: data, is_admin: isAdmin, filters, stats });
  } catch (err: any) {
    console.error("[IO API] tardiness GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// PATCH /tardiness/bulk-validate — bulk validation
// ============================================================
router.patch("/tardiness/bulk-validate", validate(tardinessBulkValidateSchema), async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const actorOhr = String(req.headers["x-actor-ohr"] || "");
    const actorName = String(req.headers["x-actor-name"] || "");
    const { ids, validation_status, remarks } = req.body;

    const now = new Date().toISOString();
    const idList = ids.map((i: any) => parseInt(i, 10)).filter((i: number) => !isNaN(i));

    if (idList.length === 0) {
      return res.status(400).json({ error: "No valid IDs provided" });
    }

    // Only update items that are still Pending
    const result: any = await db.execute(
      sql.raw(`UPDATE io_tardiness SET validation_status = '${validation_status}', validated_by = '${actorName.replace(/'/g, "''")}', validated_by_ohr = '${actorOhr}', validated_at = '${now}', remarks = ${remarks ? `'${String(remarks).replace(/'/g, "''")}' ` : 'NULL'} WHERE id IN (${idList.join(",")}) AND validation_status = 'Pending'`)
    );

    const rowCount = Array.isArray(result) ? result.length : 0;
    emitChange(req, "tardiness", "bulk_update", { count: idList.length });
    res.json({ success: true, updated: rowCount || idList.length, total: idList.length });
  } catch (err: any) {
    console.error("[IO API] tardiness bulk-validate error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// PATCH /tardiness/:id — validate single item (lock-in)
// ============================================================
router.patch("/tardiness/:id", validate(tardinessUpdateSchema), async (req: Request, res: Response) => {
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
    const rows = Array.isArray(existing) ? existing : [];
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
        sql`UPDATE io_tardiness SET validation_status = 'Pending', validated_by = NULL, validated_by_ohr = NULL, validated_at = NULL, remarks = NULL, version = version + 1 WHERE id = ${id}`
      );
      emitChange(req, "tardiness", "record_updated", { id: Number(req.params.id), action: "unlocked" });
      return res.json({ success: true, action: "unlocked" });
    }

    if (!["Valid", "Invalid"].includes(validation_status)) {
      return res.status(400).json({ error: "validation_status must be 'Valid' or 'Invalid'" });
    }

    const now = new Date().toISOString();
    await db.execute(
      sql`UPDATE io_tardiness SET validation_status = ${validation_status}, validated_by = ${actorName}, validated_by_ohr = ${actorOhr}, validated_at = ${now}, remarks = ${remarks || null}, version = version + 1 WHERE id = ${id}`
    );

    emitChange(req, "tardiness", "record_updated", { id: Number(req.params.id), action: "validated" });
    res.json({ success: true, action: "validated", status: validation_status });
  } catch (err: any) {
    console.error("[IO API] tardiness PATCH error:", err);
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

    const { week_ending, planning_group, status, supervisor, shift_type, date_from, date_to } = req.query;
    let conditions: string[] = [];
    if (week_ending) conditions.push(`week_ending = '${String(week_ending).replace(/'/g, "''")}'`);
    if (planning_group) conditions.push(`planning_group = '${String(planning_group).replace(/'/g, "''")}'`);
    if (status) conditions.push(`validation_status = '${String(status).replace(/'/g, "''")}'`);
    if (supervisor) conditions.push(`supervisor_name = '${String(supervisor).replace(/'/g, "''")}'`);
    if (shift_type) conditions.push(`shift_type = '${String(shift_type).replace(/'/g, "''")}'`);
    if (date_from) conditions.push(`date >= '${String(date_from).replace(/'/g, "''")}'`);
    if (date_to) conditions.push(`date <= '${String(date_to).replace(/'/g, "''")}'`);

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result: any = await db.execute(sql.raw(
      `SELECT ohr_id, employee_name, supervisor_name, planning_group, actual_role, date, roster_login, roster_logout, actual_login, actual_logout, tardiness_minutes, shift_type, week_ending, validation_status, validated_by, validated_at, remarks FROM io_tardiness ${whereClause} ORDER BY week_ending DESC, date DESC, employee_name ASC`
    ));
    const rows = Array.isArray(result) ? result : [];

    const csv = toCSV(rows);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="tardiness_export_${Date.now()}.csv"`);
    res.send(csv);
  } catch (err: any) {
    console.error("[IO API] tardiness export error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
