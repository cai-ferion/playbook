/**
 * Google Sheets Attendance Sync — Native Node.js implementation
 *
 * Pushes io_attendance data → ATTEND_26 sheet twice daily (1:30 AM, 4:30 PM PHT).
 * Uses googleapis directly with a multi-source token resolution strategy that
 * reads the freshest available OAuth token at each sync invocation.
 *
 * Token resolution priority (checked at every sync call, not cached):
 *   1. process.env.GOOGLE_WORKSPACE_CLI_TOKEN (set by sandbox runtime)
 *   2. Shell env via child_process (captures tokens refreshed after server start)
 *   3. Rclone config file (Google Drive integration token)
 *   4. /home/ubuntu/.gws_token file (persisted from previous successful resolution)
 *   5. Webdev secret GWS_ACCESS_TOKEN (for deployed server, if set)
 *
 * Rate-limit strategy: batchUpdate groups up to 500 cell-ranges per call,
 * with 2-second pauses between batches to stay under Google's 60 writes/min quota.
 */

import cron from "node-cron";
import fs from "fs";
import { execSync } from "child_process";

// Lazy-loaded @googleapis/sheets — lightweight replacement for full googleapis (746KB vs 196MB).
let _sheetsModule: typeof import("@googleapis/sheets") | null = null;
async function getGoogleapis() {
  if (!_sheetsModule) {
    _sheetsModule = await import("@googleapis/sheets");
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function dateToSerial(d: Date): number {
  const msPerDay = 86400000;
  const utcD = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const utcEpoch = new Date(Date.UTC(1899, 11, 30));
  return Math.round((utcD.getTime() - utcEpoch.getTime()) / msPerDay);
}

function formatDateDisplay(d: Date): string {
  const jsDay = d.getDay();
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

// ── Auth — Multi-source token resolution ────────────────────────────────────
// Reads the freshest available token at each invocation. Never caches.

const TOKEN_FILE = "/home/ubuntu/.gws_token";
const RCLONE_CONFIG = "/home/ubuntu/.gdrive-rclone.ini";

function resolveGwsToken(): { token: string; source: string } | null {
  // Source 1: Process env (set at server start, may be stale)
  const envToken = process.env.GOOGLE_WORKSPACE_CLI_TOKEN;
  if (envToken && envToken.length > 20) {
    return { token: envToken, source: "process.env" };
  }

  // Source 2: Shell env (captures tokens refreshed after server start)
  try {
    const shellToken = execSync(
      'bash -lc "echo \\$GOOGLE_WORKSPACE_CLI_TOKEN"',
      { encoding: "utf-8", timeout: 5000 }
    ).trim();
    if (shellToken && shellToken.length > 20 && shellToken.startsWith("ya29.")) {
      // Persist for future use and update process.env
      process.env.GOOGLE_WORKSPACE_CLI_TOKEN = shellToken;
      try { fs.writeFileSync(TOKEN_FILE, shellToken); } catch { /* ignore */ }
      return { token: shellToken, source: "shell env" };
    }
  } catch { /* ignore — shell may not be available in deployed env */ }

  // Source 3: Rclone config (Google Drive integration)
  try {
    if (fs.existsSync(RCLONE_CONFIG)) {
      const ini = fs.readFileSync(RCLONE_CONFIG, "utf-8");
      const tokenLine = ini.split("\n").find(l => l.trim().startsWith("token ="));
      if (tokenLine) {
        const tokenJson = JSON.parse(tokenLine.split("=").slice(1).join("=").trim());
        if (tokenJson.access_token && tokenJson.access_token.length > 20) {
          // Check if expired
          if (tokenJson.expiry) {
            const expiry = new Date(tokenJson.expiry);
            if (expiry.getTime() < Date.now()) {
              console.log(`[SYNC] Rclone token expired at ${tokenJson.expiry}, skipping`);
            } else {
              try { fs.writeFileSync(TOKEN_FILE, tokenJson.access_token); } catch { /* ignore */ }
              return { token: tokenJson.access_token, source: "rclone config" };
            }
          } else {
            try { fs.writeFileSync(TOKEN_FILE, tokenJson.access_token); } catch { /* ignore */ }
            return { token: tokenJson.access_token, source: "rclone config" };
          }
        }
      }
    }
  } catch { /* ignore */ }

  // Source 4: Token file (persisted from previous successful resolution)
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const fileToken = fs.readFileSync(TOKEN_FILE, "utf-8").trim();
      if (fileToken && fileToken.length > 20) {
        return { token: fileToken, source: "token file" };
      }
    }
  } catch { /* ignore */ }

  // Source 5: Webdev secret (for deployed server)
  const secretToken = process.env.GWS_ACCESS_TOKEN;
  if (secretToken && secretToken.length > 20) {
    return { token: secretToken, source: "webdev secret" };
  }

  return null;
}

async function getSheetsClient() {
  const resolved = resolveGwsToken();
  if (!resolved) {
    console.warn("[SYNC] No GWS token available from any source — sync disabled");
    return null;
  }
  console.log(`[SYNC] Using token from ${resolved.source} (${resolved.token.length} chars)`);
  const { auth, sheets } = await getGoogleapis();
  const oauth2Client = new auth.OAuth2();
  oauth2Client.setCredentials({ access_token: resolved.token });
  return sheets({ version: "v4", auth: oauth2Client });
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

// ── Sync stats ──────────────────────────────────────────────────────────────

interface SyncStats {
  rows_updated: number;
  rows_appended: number;
  total_db_rows: number;
  total_sheet_rows: number;
}

// ── Write sync log entry to Google Sheet tab ────────────────────────────────
const SYNC_LOG_SHEET = "SYNC_LOG";

async function ensureSyncLogSheet(sheets: any) {
  try {
    // Check if SYNC_LOG tab exists
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
      fields: "sheets.properties.title",
    });
    const titles = (meta.data.sheets || []).map((s: any) => s.properties.title);
    if (!titles.includes(SYNC_LOG_SHEET)) {
      // Create the tab with headers
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [{ addSheet: { properties: { title: SYNC_LOG_SHEET } } }],
        },
      });
      // Write header row
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SYNC_LOG_SHEET}!A1:L1`,
        valueInputOption: "RAW",
        requestBody: {
          values: [[
            "#", "Sync Type", "Triggered By", "Status",
            "Started At (PHT)", "Completed At (PHT)", "Duration",
            "Rows Updated", "Rows Appended", "DB Rows", "Sheet Rows", "Error",
          ]],
        },
      });
      console.log("[SYNC-LOG] Created SYNC_LOG sheet tab with headers");
    }
  } catch (e: any) {
    console.error(`[SYNC-LOG] Failed to ensure SYNC_LOG sheet: ${e.message}`);
  }
}

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
    const sheets = await getSheetsClient();
    if (!sheets) {
      console.warn("[SYNC-LOG] Cannot write log — no Sheets client available");
      // Fallback: write to DB if available
      try {
        const db = await getDb();
        if (db) await db.insert(ioSyncLog).values(entry);
      } catch { /* ignore */ }
      return;
    }
    await ensureSyncLogSheet(sheets);

    // Get current row count to determine next row number
    let nextRow = 2;
    try {
      const existing = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SYNC_LOG_SHEET}!A:A`,
      });
      nextRow = (existing.data.values?.length || 1) + 1;
    } catch { /* default to row 2 */ }

    // Format timestamps to PHT (UTC+8)
    const fmtPHT = (iso: string) => {
      try {
        const d = new Date(iso);
        return d.toLocaleString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
      } catch { return iso; }
    };
    const durationStr = entry.duration_ms >= 1000
      ? `${(entry.duration_ms / 1000).toFixed(1)}s`
      : `${entry.duration_ms}ms`;

    const row = [
      nextRow - 1, // Row number (#)
      entry.sync_type,
      entry.trigger,
      entry.status,
      fmtPHT(entry.started_at),
      fmtPHT(entry.completed_at),
      durationStr,
      entry.rows_updated,
      entry.rows_appended,
      entry.total_db_rows,
      entry.total_sheet_rows,
      entry.error_message || "",
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SYNC_LOG_SHEET}!A:L`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    });

    console.log(
      `[SYNC-LOG] Logged to Google Sheet: ${entry.trigger} → ${entry.status} (${durationStr}, ${entry.rows_updated} updated, ${entry.rows_appended} appended)`
    );
  } catch (e: any) {
    console.error(`[SYNC-LOG] Failed to write log to Google Sheet: ${e.message}`);
    // Fallback: write to DB
    try {
      const db = await getDb();
      if (db) await db.insert(ioSyncLog).values(entry);
    } catch { /* ignore */ }
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
  const resolved = resolveGwsToken();
  if (!resolved) {
    console.warn("[SYNC] No GWS token available — cron sync will attempt on each trigger");
  } else {
    console.log(`[SYNC] GWS token available from ${resolved.source} (${resolved.token.length} chars) — cron enabled`);
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
