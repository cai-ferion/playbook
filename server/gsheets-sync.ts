/**
 * Google Sheets Attendance Sync — Native Node.js implementation
 *
 * Pushes io_attendance data → ATTEND_26 sheet twice daily (1:30 AM, 4:30 PM PHT).
 * Uses googleapis directly — no Python subprocess, no gws CLI dependency.
 * Logs each sync run to io_sync_log for the Sync History page.
 *
 * Rate-limit strategy: batchUpdate groups up to 500 cell-ranges per call,
 * with 2-second pauses between batches to stay under Google's 60 writes/min quota.
 */

import cron from "node-cron";
import fs from "fs";

// Lazy-loaded googleapis — 200MB package, ~1.4s import time.
// Only loaded when sync actually runs, not on server cold start.
let _sheetsModule: typeof import("googleapis") | null = null;
async function getGoogleapis() {
  if (!_sheetsModule) {
    _sheetsModule = await import("googleapis");
  }
  return _sheetsModule;
}
import { getDb } from "./db.js";
import { ioSyncLog, ioAttendance } from "../drizzle/schema.js";
import { gte } from "drizzle-orm";

// ── Configuration ────────────────────────────────────────────────────────────
const SPREADSHEET_ID = "1UZxiqTsskXwKJ9VMgetK1DvmjwkPfHmMNqE7u4JkSqc";
const SHEET_NAME = "ATTEND_26";
const LOOKBACK_DAYS = 7;

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
// Google Sheets epoch: Dec 30, 1899
const SHEETS_EPOCH = new Date(1899, 11, 30);

// ── Helpers ──────────────────────────────────────────────────────────────────

function dateToSerial(d: Date): number {
  const msPerDay = 86400000;
  const utcD = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const utcEpoch = new Date(Date.UTC(1899, 11, 30));
  return Math.round((utcD.getTime() - utcEpoch.getTime()) / msPerDay);
}

function formatDateDisplay(d: Date): string {
  const jsDay = d.getDay(); // 0=Sun..6=Sat
  return `${DAY_NAMES[jsDay]}, ${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function getWeekEnding(d: Date): string {
  const jsDay = d.getDay();
  const diff = (6 - jsDay + 7) % 7;
  const sat = new Date(d);
  sat.setDate(sat.getDate() + diff);
  return `${sat.getMonth() + 1}/${sat.getDate()}/${sat.getFullYear()}`;
}

function getMonthName(d: Date): string {
  return MONTH_NAMES[d.getMonth()];
}

function makeConcat(d: Date, ohr: string): string {
  return `${dateToSerial(d)}${ohr}`;
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Auth ─────────────────────────────────────────────────────────────────────

const TOKEN_FILE = "/home/ubuntu/.gws_token";
const RCLONE_CONFIG = "/home/ubuntu/.gdrive-rclone.ini";

function getGwsToken(): string | null {
  // Priority 1: env var (available in shell but not always in dev server process)
  const envToken = process.env.GOOGLE_WORKSPACE_CLI_TOKEN;
  if (envToken) {
    // Also persist to file so cron jobs can use it after env changes
    try { fs.writeFileSync(TOKEN_FILE, envToken); } catch { /* ignore */ }
    return envToken;
  }
  // Priority 2: token file written by shell or previous sync
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const fileToken = fs.readFileSync(TOKEN_FILE, "utf-8").trim();
      if (fileToken) {
        console.log(`[SYNC] Loaded GWS token from ${TOKEN_FILE} (${fileToken.length} chars)`);
        return fileToken;
      }
    }
  } catch { /* ignore */ }
  // Priority 3: Extract from rclone config (Google Drive integration)
  try {
    if (fs.existsSync(RCLONE_CONFIG)) {
      const ini = fs.readFileSync(RCLONE_CONFIG, "utf-8");
      const tokenLine = ini.split("\n").find(l => l.trim().startsWith("token ="));
      if (tokenLine) {
        const tokenJson = JSON.parse(tokenLine.split("=").slice(1).join("=").trim());
        if (tokenJson.access_token) {
          console.log(`[SYNC] Extracted GWS token from rclone config (${tokenJson.access_token.length} chars)`);
          // Persist for future use
          try { fs.writeFileSync(TOKEN_FILE, tokenJson.access_token); } catch { /* ignore */ }
          return tokenJson.access_token;
        }
      }
    }
  } catch { /* ignore */ }
  // Priority 4: Try to get fresh token via shell exec of gws env
  try {
    const { execSync } = require("child_process");
    const shellToken = execSync('echo $GOOGLE_WORKSPACE_CLI_TOKEN', { encoding: 'utf-8', timeout: 5000 }).trim();
    if (shellToken && shellToken.length > 10) {
      console.log(`[SYNC] Got GWS token from shell env (${shellToken.length} chars)`);
      try { fs.writeFileSync(TOKEN_FILE, shellToken); } catch { /* ignore */ }
      return shellToken;
    }
  } catch { /* ignore */ }
  return null;
}

async function getSheetsClient() {
  const token = getGwsToken();
  if (!token) {
    console.warn("[SYNC] No GWS token available (env var or token file) — sync disabled");
    return null;
  }
  const { google } = await getGoogleapis();
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: token });
  return google.sheets({ version: "v4", auth });
}

// ── DB row → sheet row conversion ────────────────────────────────────────────

interface AttRow {
  id: string | number;
  ohr_id: string;
  log_date: string;
  tag: string | null;
  upl_reason: string | null;
  remarks: string | null;
  ot_hours: string | null;
  snap_full_name: string | null;
  snap_supervisor: string | null;
  snap_planning_group: string | null;
  snap_shift_time: string | null;
  snap_actual_role: string | null;
  snap_status: string | null;
  role: string | null;
  planning_group: string | null;
}

function dbRowToSheetRow(row: AttRow): string[] {
  const d = parseDate(String(row.log_date));
  return [
    makeConcat(d, String(row.ohr_id)),
    row.tag || "",
    row.upl_reason || "",
    row.remarks || "",
    row.ot_hours ? String(row.ot_hours) : "",
    formatDateDisplay(d),
    String(row.ohr_id),
    row.snap_full_name || "",
    row.snap_supervisor || "",
    row.role || row.snap_actual_role || "",
    row.planning_group || row.snap_planning_group || "",
    row.snap_shift_time || "",
    row.snap_status || "",
    getWeekEnding(d),
    getMonthName(d),
  ];
}

// ── Parse sync output (for backward compat with sync log) ────────────────────

interface SyncStats {
  rows_updated: number;
  rows_appended: number;
  total_db_rows: number;
  total_sheet_rows: number;
}

// ── Write sync log entry to DB ───────────────────────────────────────────────

async function writeSyncLog(entry: {
  sync_type: string;
  trigger: string;
  status: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  rows_updated: number;
  rows_appended: number;
  total_db_rows: number;
  total_sheet_rows: number;
  error_message: string;
  output_log: string;
}) {
  try {
    const db = await getDb();
    if (!db) {
      console.warn("[SYNC-LOG] Cannot write log — database not available");
      return;
    }
    await db.insert(ioSyncLog).values(entry);
    console.log(
      `[SYNC-LOG] Logged: ${entry.trigger} → ${entry.status} (${entry.duration_ms}ms, ${entry.rows_updated} updated, ${entry.rows_appended} appended)`
    );
  } catch (e: any) {
    console.error(`[SYNC-LOG] Failed to write log: ${e.message}`);
  }
}

// ── Core sync logic ──────────────────────────────────────────────────────────

export async function runAttendanceSync(
  trigger: string = "manual"
): Promise<{ ok: boolean; output: string; error: string; stats: SyncStats }> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const logLines: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logLines.push(msg);
  };

  const stats: SyncStats = { rows_updated: 0, rows_appended: 0, total_db_rows: 0, total_sheet_rows: 0 };

  try {
    // ── Auth check (lazy-loads googleapis on first call) ──
    const sheets = await getSheetsClient();
    if (!sheets) {
      const msg = "Google Sheets API not available (no auth token)";
      log(`[SYNC] ${msg}`);
      await writeSyncLog({
        sync_type: "attendance",
        trigger,
        status: "skipped",
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startMs,
        ...stats,
        error_message: msg,
        output_log: logLines.join("\n"),
      });
      return { ok: false, output: logLines.join("\n"), error: msg, stats };
    }

    log("============================================================");
    log(`ATTEND_26 Sync: DB → Google Sheet`);
    log(`Started: ${startedAt}`);
    log("============================================================");

    // ── Calculate lookback window ──
    const today = new Date();
    let start = new Date(today);
    start.setDate(start.getDate() - LOOKBACK_DAYS);
    // Round down to previous Saturday for clean week boundaries
    const jsDay = start.getDay();
    start.setDate(start.getDate() - jsDay);

    const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;

    // ── Fetch DB rows ──
    log(`\n[DB] Fetching attendance from ${startStr} onward...`);
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const dbRows = (await db
      .select({
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
        role: ioAttendance.role,
        planning_group: ioAttendance.planning_group,
      })
      .from(ioAttendance)
      .where(gte(ioAttendance.log_date, startStr))
      .orderBy(ioAttendance.log_date, ioAttendance.ohr_id)) as AttRow[];

    stats.total_db_rows = dbRows.length;
    log(`[DB] Total: ${dbRows.length} rows`);

    // Convert DB rows to sheet format, keyed by concat
    const dbSheetRows: Map<string, string[]> = new Map();
    for (const row of dbRows) {
      const sheetRow = dbRowToSheetRow(row);
      dbSheetRows.set(sheetRow[0], sheetRow);
    }

    // ── Read existing sheet rows from the lookback start ──
    log(`\n[SHEET] Finding rows from ${startStr} onward...`);
    const daysFromJan1 = Math.floor(
      (start.getTime() - new Date(2026, 0, 1).getTime()) / 86400000
    );
    let approxRow = Math.max(2, Math.floor(daysFromJan1 * 390));

    const sheetRowsByConcat: Map<string, string[]> = new Map();
    const sheetRowNumbers: Map<string, number> = new Map();

    let chunkStart = approxRow;
    log(`[SHEET] Reading from row ${chunkStart} to end...`);

    let totalSheetRows = 0;
    while (true) {
      const chunkEnd = chunkStart + 5000;
      let rows: string[][] = [];
      try {
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!A${chunkStart}:O${chunkEnd}`,
        });
        rows = (res.data.values || []) as string[][];
      } catch (e: any) {
        if (e.message?.includes("exceeds grid limits")) break;
        throw e;
      }
      if (!rows.length) break;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row[0]) continue;
        sheetRowsByConcat.set(row[0], row);
        sheetRowNumbers.set(row[0], chunkStart + i);
        totalSheetRows++;
      }
      if (rows.length < 5000) break;
      chunkStart = chunkEnd + 1;
    }

    stats.total_sheet_rows = totalSheetRows;
    const lastRow = sheetRowNumbers.size > 0 ? Math.max(...Array.from(sheetRowNumbers.values())) : approxRow;
    log(`[SHEET] Found ${totalSheetRows} rows from ${startStr} onward (rows ${approxRow}-${lastRow})`);

    // ── Compare and find updates + new rows ──
    const updates: Array<{ rowNum: number; values: string[] }> = [];
    const newRows: string[][] = [];

    for (const [concat, dbRow] of Array.from(dbSheetRows.entries())) {
      if (sheetRowsByConcat.has(concat)) {
        const sheetRow = sheetRowsByConcat.get(concat)!;
        while (sheetRow.length < 15) sheetRow.push("");
        let changed = false;
        for (let i = 1; i < 15; i++) {
          const dbVal = dbRow[i] || "";
          const sheetVal = (i < sheetRow.length ? sheetRow[i] : "") || "";
          if (dbVal !== sheetVal) {
            changed = true;
            break;
          }
        }
        if (changed) {
          updates.push({ rowNum: sheetRowNumbers.get(concat)!, values: dbRow });
        }
      } else {
        newRows.push(dbRow);
      }
    }

    log(`\n[SYNC] Updates needed: ${updates.length}`);
    log(`[SYNC] New rows to append: ${newRows.length}`);

    // ── Apply updates using batchUpdate (max 500 ranges per call, 2s pause between) ──
    const BATCH_SIZE = 500;
    const PAUSE_MS = 2000;

    if (updates.length > 0) {
      log(`\n[UPDATE] Applying ${updates.length} row updates...`);
      updates.sort((a, b) => a.rowNum - b.rowNum);

      for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const batch = updates.slice(i, i + BATCH_SIZE);
        const data = batch.map((u) => ({
          range: `${SHEET_NAME}!A${u.rowNum}:O${u.rowNum}`,
          values: [u.values],
        }));

        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: { valueInputOption: "RAW", data },
        });

        stats.rows_updated += batch.length;
        log(`  Progress: ${stats.rows_updated}/${updates.length} rows updated`);

        if (i + BATCH_SIZE < updates.length) await sleep(PAUSE_MS);
      }
    }

    // ── Append new rows in batches ──
    if (newRows.length > 0) {
      log(`\n[APPEND] Adding ${newRows.length} new rows...`);
      newRows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

      const APPEND_BATCH = 1000;
      for (let i = 0; i < newRows.length; i += APPEND_BATCH) {
        const batch = newRows.slice(i, i + APPEND_BATCH);
        await sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!A:O`,
          valueInputOption: "RAW",
          insertDataOption: "INSERT_ROWS",
          requestBody: { values: batch },
        });

        stats.rows_appended += batch.length;
        log(`  Progress: ${stats.rows_appended}/${newRows.length} rows appended`);

        if (i + APPEND_BATCH < newRows.length) await sleep(PAUSE_MS);
      }
    }

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startMs;

    log(`\n${"=".repeat(60)}`);
    log(`Sync complete: ${completedAt}`);
    log(`  Updated: ${stats.rows_updated} rows`);
    log(`  Appended: ${stats.rows_appended} rows`);
    log(`  Duration: ${(durationMs / 1000).toFixed(1)}s`);
    log(`${"=".repeat(60)}`);

    await writeSyncLog({
      sync_type: "attendance",
      trigger,
      status: "success",
      started_at: startedAt,
      completed_at: completedAt,
      duration_ms: durationMs,
      ...stats,
      error_message: "",
      output_log: logLines.join("\n").substring(0, 5000),
    });

    return { ok: true, output: logLines.join("\n"), error: "", stats };
  } catch (e: any) {
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startMs;
    const errMsg = e.message || String(e);
    log(`[SYNC] ERROR: ${errMsg}`);

    await writeSyncLog({
      sync_type: "attendance",
      trigger,
      status: "error",
      started_at: startedAt,
      completed_at: completedAt,
      duration_ms: durationMs,
      ...stats,
      error_message: errMsg.substring(0, 2000),
      output_log: logLines.join("\n").substring(0, 5000),
    });

    return { ok: false, output: logLines.join("\n"), error: errMsg, stats };
  }
}

// ── Cron scheduling ──────────────────────────────────────────────────────────

export function initAttendanceSyncCron() {
  console.log("[SYNC] Initializing attendance sync cron jobs (PHT timezone)...");

  // Pre-flight: check if sync is possible in this environment
  const token = getGwsToken();
  if (!token) {
    console.warn("[SYNC] No GWS token available — cron sync will be skipped until token is provided");
  } else {
    console.log(`[SYNC] GWS token available (${token.length} chars) — cron sync enabled`);
  }

  // 1:30 AM PHT daily
  cron.schedule(
    "30 1 * * *",
    async () => {
      console.log("[SYNC] Triggered: 1:30 AM PHT sync");
      try {
        await runAttendanceSync("cron_0130");
      } catch (e: any) {
        console.error(`[SYNC] 1:30 AM sync failed: ${e.message}`);
      }
    },
    { timezone: "Asia/Manila" }
  );

  // 4:30 PM PHT daily
  cron.schedule(
    "30 16 * * *",
    async () => {
      console.log("[SYNC] Triggered: 4:30 PM PHT sync");
      try {
        await runAttendanceSync("cron_1630");
      } catch (e: any) {
        console.error(`[SYNC] 4:30 PM sync failed: ${e.message}`);
      }
    },
    { timezone: "Asia/Manila" }
  );

  console.log("[SYNC] Cron jobs scheduled: 1:30 AM & 4:30 PM PHT daily");
}
