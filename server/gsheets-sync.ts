/**
 * Google Sheets Attendance Sync — Server-side cron module
 *
 * Pushes io_attendance data → ATTEND_26 sheet twice daily (1:30 AM, 4:30 PM PHT).
 * Delegates to the Python sync script which has full sandbox env (gws CLI auth).
 * Logs each sync run to io_sync_log for the Sync History page.
 */

import cron from "node-cron";
import { exec } from "child_process";
import fs from "fs";
import { getDb } from "./db.js";
import { ioSyncLog } from "../drizzle/schema.js";

const SYNC_SCRIPT = "/home/ubuntu/sync-attendance-to-gsheets.py";
const TOKEN_FILE = "/home/ubuntu/.gws_token";

/**
 * Refresh the GWS token file before each sync.
 * The token is available in the sandbox shell env but not in the dev server process.
 * We write it to a file that the Python script reads.
 */
function refreshGwsToken() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const token = fs.readFileSync(TOKEN_FILE, "utf-8").trim();
      if (token) {
        console.log(`[SYNC] GWS token file present (${token.length} chars)`);
      } else {
        console.warn("[SYNC] WARNING: Token file is empty");
      }
    } else {
      const envToken = process.env.GOOGLE_WORKSPACE_CLI_TOKEN;
      if (envToken) {
        fs.writeFileSync(TOKEN_FILE, envToken, { mode: 0o600 });
        console.log(`[SYNC] GWS token written from process env (${envToken.length} chars)`);
      } else {
        console.warn(`[SYNC] WARNING: No token file at ${TOKEN_FILE} and no env var available`);
      }
    }
  } catch (e: any) {
    console.error(`[SYNC] Token check failed: ${e.message}`);
  }
}

// ── Parse sync output to extract row counts ────────────────────────────────

interface SyncStats {
  rows_updated: number;
  rows_appended: number;
  total_db_rows: number;
  total_sheet_rows: number;
}

function parseSyncOutput(output: string): SyncStats {
  const stats: SyncStats = { rows_updated: 0, rows_appended: 0, total_db_rows: 0, total_sheet_rows: 0 };

  // Match "Updated: N rows" or "Updates needed: N"
  const updatedMatch = output.match(/Updated:\s*(\d+)\s*rows/i) || output.match(/Updates needed:\s*(\d+)/i);
  if (updatedMatch) stats.rows_updated = parseInt(updatedMatch[1], 10);

  // Match "Appended: N rows" or "New rows to append: N" or "Total appended: N"
  const appendedMatch = output.match(/Appended:\s*(\d+)\s*rows/i) || output.match(/Total appended:\s*(\d+)/i) || output.match(/New rows to append:\s*(\d+)/i);
  if (appendedMatch) stats.rows_appended = parseInt(appendedMatch[1], 10);

  // Match "[DB] Total: N rows"
  const dbRowsMatch = output.match(/\[DB\]\s*Total:\s*(\d+)\s*rows/i) || output.match(/(\d+)\s*DB rows/i);
  if (dbRowsMatch) stats.total_db_rows = parseInt(dbRowsMatch[1], 10);

  // Match "[SHEET] Found N rows from"
  const sheetRowsMatch = output.match(/\[SHEET\]\s*Found\s*(\d+)\s*rows/i) || output.match(/(\d+)\s*sheet rows/i);
  if (sheetRowsMatch) stats.total_sheet_rows = parseInt(sheetRowsMatch[1], 10);

  return stats;
}

// ── Write sync log entry to DB ─────────────────────────────────────────────

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
    console.log(`[SYNC-LOG] Logged: ${entry.trigger} → ${entry.status} (${entry.duration_ms}ms, ${entry.rows_updated} updated, ${entry.rows_appended} appended)`);
  } catch (e: any) {
    console.error(`[SYNC-LOG] Failed to write log: ${e.message}`);
  }
}

// ── Core sync logic ─────────────────────────────────────────────────────────

export function runAttendanceSync(trigger: string = "manual"): Promise<{
  ok: boolean;
  output: string;
  error: string;
  stats: SyncStats;
}> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  return new Promise((resolve) => {
    const cmd = `/usr/bin/python3.11 ${SYNC_SCRIPT}`;
    console.log(`[SYNC] Executing: ${cmd} (trigger: ${trigger})`);

    // Build a clean env: inherit current process env, strip uv-injected paths
    const cleanEnv = { ...process.env };
    if (cleanEnv.PATH) {
      cleanEnv.PATH = cleanEnv.PATH.split(":").filter(p => !p.includes(".local/share/uv")).join(":");
    }
    delete cleanEnv.PYTHONHOME;
    delete cleanEnv.PYTHONPATH;

    exec(cmd, {
      timeout: 300000, // 5 min max
      maxBuffer: 10 * 1024 * 1024,
      cwd: "/home/ubuntu",
      env: cleanEnv,
    }, async (error, stdout, stderr) => {
      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - startMs;
      const outputLog = (stdout || "").substring(0, 5000); // Cap at 5KB for DB storage

      if (error) {
        console.error(`[SYNC] Script error: ${error.message?.substring(0, 500)}`);
        console.error(`[SYNC] stderr: ${stderr?.substring(0, 500)}`);

        const stats = parseSyncOutput(stdout || "");
        await writeSyncLog({
          sync_type: "attendance",
          trigger,
          status: "error",
          started_at: startedAt,
          completed_at: completedAt,
          duration_ms: durationMs,
          rows_updated: stats.rows_updated,
          rows_appended: stats.rows_appended,
          total_db_rows: stats.total_db_rows,
          total_sheet_rows: stats.total_sheet_rows,
          error_message: (error.message || "").substring(0, 2000),
          output_log: outputLog,
        });

        resolve({ ok: false, output: stdout, error: error.message, stats });
      } else {
        console.log(`[SYNC] Script output:\n${stdout}`);
        if (stderr) console.warn(`[SYNC] stderr: ${stderr.substring(0, 200)}`);

        const stats = parseSyncOutput(stdout || "");
        await writeSyncLog({
          sync_type: "attendance",
          trigger,
          status: "success",
          started_at: startedAt,
          completed_at: completedAt,
          duration_ms: durationMs,
          rows_updated: stats.rows_updated,
          rows_appended: stats.rows_appended,
          total_db_rows: stats.total_db_rows,
          total_sheet_rows: stats.total_sheet_rows,
          error_message: "",
          output_log: outputLog,
        });

        resolve({ ok: true, output: stdout, error: "", stats });
      }
    });
  });
}

// ── Cron scheduling ─────────────────────────────────────────────────────────

export function initAttendanceSyncCron() {
  console.log("[SYNC] Initializing attendance sync cron jobs (PHT timezone)...");

  // Refresh token at startup
  refreshGwsToken();

  // 1:30 AM PHT daily
  cron.schedule("30 1 * * *", async () => {
    console.log("[SYNC] Triggered: 1:30 AM PHT sync");
    try {
      refreshGwsToken();
      await runAttendanceSync("cron_0130");
    } catch (e: any) {
      console.error(`[SYNC] 1:30 AM sync failed: ${e.message}`);
    }
  }, { timezone: "Asia/Manila" });

  // 4:30 PM PHT daily
  cron.schedule("30 16 * * *", async () => {
    console.log("[SYNC] Triggered: 4:30 PM PHT sync");
    try {
      refreshGwsToken();
      await runAttendanceSync("cron_1630");
    } catch (e: any) {
      console.error(`[SYNC] 4:30 PM sync failed: ${e.message}`);
    }
  }, { timezone: "Asia/Manila" });

  console.log("[SYNC] Cron jobs scheduled: 1:30 AM & 4:30 PM PHT daily");
}
