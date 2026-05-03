/**
 * WFM Domain Module
 * Extracted from io-routes.ts — handles WFM session logging and schedule upload
 */
import { Router, Request, Response } from "express";
import { getDb } from "../db.js";
import { wfmSessionLog } from "../../drizzle/schema.js";
import { sql, desc } from "drizzle-orm";
import { emitChange } from "./emit-change.js";

const router = Router();

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
    emitChange(req, "wfm", "record_created", {});
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

export default router;
