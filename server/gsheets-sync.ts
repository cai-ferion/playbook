/**
 * Google Sheets Attendance Sync — Server-side cron module
 *
 * Pushes io_attendance data → ATTEND_26 sheet twice daily (1:30 AM, 4:30 PM PHT).
 * Delegates to the Python sync script which has full sandbox env (gws CLI auth).
 */

import cron from "node-cron";
import { exec, execSync } from "child_process";
import fs from "fs";

const SYNC_SCRIPT = "/home/ubuntu/sync-attendance-to-gsheets.py";
const TOKEN_FILE = "/home/ubuntu/.gws_token";

/**
 * Refresh the GWS token file before each sync.
 * The token is available in the sandbox shell env but not in the dev server process.
 * We write it to a file that the Python script reads.
 */
function refreshGwsToken() {
  // Strategy: The GOOGLE_WORKSPACE_CLI_TOKEN env var is only available in the
  // sandbox shell, not in the dev server process. We rely on a token file at
  // /home/ubuntu/.gws_token that is written by the sandbox environment.
  // The Python sync script reads this file if the env var is missing.
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const token = fs.readFileSync(TOKEN_FILE, "utf-8").trim();
      if (token) {
        console.log(`[SYNC] GWS token file present (${token.length} chars)`);
      } else {
        console.warn("[SYNC] WARNING: Token file is empty");
      }
    } else {
      // Try to create it from the process env (may work in some contexts)
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

// ── Core sync logic ─────────────────────────────────────────────────────────

export function runAttendanceSync(): Promise<{
  ok: boolean;
  output: string;
  error: string;
}> {
  return new Promise((resolve) => {
    // Use /usr/bin/env to get the full user environment including GOOGLE_WORKSPACE_CLI_TOKEN
    // Run as the ubuntu user's login shell to inherit all env vars
    // Explicitly unset any uv-injected PYTHONPATH and use system python3.11
    const cmd = `/usr/bin/python3.11 ${SYNC_SCRIPT}`;

    console.log(`[SYNC] Executing: ${cmd}`);

    // Build a clean env: inherit current process env, add GWS token from sandbox,
    // and strip any uv-injected paths that cause Python version mismatch
    const cleanEnv = { ...process.env };
    // Remove any uv python paths from PATH to prevent 3.13 interference
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
    }, (error, stdout, stderr) => {
      if (error) {
        console.error(`[SYNC] Script error: ${error.message?.substring(0, 500)}`);
        console.error(`[SYNC] stderr: ${stderr?.substring(0, 500)}`);
        resolve({ ok: false, output: stdout, error: error.message });
      } else {
        console.log(`[SYNC] Script output:\n${stdout}`);
        if (stderr) console.warn(`[SYNC] stderr: ${stderr.substring(0, 200)}`);
        resolve({ ok: true, output: stdout, error: "" });
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
      await runAttendanceSync();
    } catch (e: any) {
      console.error(`[SYNC] 1:30 AM sync failed: ${e.message}`);
    }
  }, { timezone: "Asia/Manila" });

  // 4:30 PM PHT daily
  cron.schedule("30 16 * * *", async () => {
    console.log("[SYNC] Triggered: 4:30 PM PHT sync");
    try {
      refreshGwsToken();
      await runAttendanceSync();
    } catch (e: any) {
      console.error(`[SYNC] 4:30 PM sync failed: ${e.message}`);
    }
  }, { timezone: "Asia/Manila" });

  console.log("[SYNC] Cron jobs scheduled: 1:30 AM & 4:30 PM PHT daily");
}
