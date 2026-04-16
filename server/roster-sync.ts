/**
 * Google Sheets ROSTER Sync — DB → ROSTER sheet
 *
 * Full-replace strategy: reads all io_employees from DB, writes the entire
 * ROSTER sheet (header + data rows) in one batchUpdate call.
 * Runs daily at 2:00 AM PHT via cron, or on-demand via manual trigger.
 *
 * Sheet-only columns: Access Level (Col C) — preserved by reading existing
 * values first and merging them back in.
 *
 * Logs each sync run to io_sync_log for the Sync History page.
 */
import cron from "node-cron";
import fs from "fs";
import { getDb } from "./db.js";
import { ioSyncLog, ioEmployees } from "../drizzle/schema.js";
import { asc } from "drizzle-orm";

// Lazy-loaded googleapis — only loaded when sync actually runs
let _sheetsModule: typeof import("googleapis") | null = null;
async function getGoogleapis() {
  if (!_sheetsModule) {
    _sheetsModule = await import("googleapis");
  }
  return _sheetsModule;
}

// ── Configuration ────────────────────────────────────────────────────────────
const SPREADSHEET_ID = "1ah5GY1zoGBy6T2IUCSPWPsUzYRyPUb3WCkEfVgskfRQ";
const SHEET_NAME = "ROSTER";

// ROSTER sheet header (44 columns A-AR) — InChat/InDistro removed
const SHEET_HEADERS = [
  "OHR", "Full Name", "Access Level", "Last Name", "Given Name", "Middle Name", "Suffix",
  "Billing Name", "SRT Name", "Employment Status", "Actual Role", "Actual Supervisor",
  "Actual Supervisor Email", "Shift Time", "Work Off", "Actual PG", "Playbook PG",
  "SRT Status", "SRT ID", "Workday ID", "Meta Email", "Macbook Asset ID", "Chromebook Asset ID",
  "Hire Date", "Regularization Date", "DOB", "Personal Email", "Contact No.", "Primary Address",
  "Barangay", "City", "Province", "Locker Floor", "Locker No.", "Meta Onboarding Date",
  "Live Date", "Badge ID No.", "Badge Serial No.", "Platform",
  "Offboarding Date", "Resignation Date", "Relieving Date", "Exit Date", "Exit Reason",
];

// Indices of sheet-only columns (0-based) that we must preserve from existing sheet
// Col C (2) = Access Level
const SHEET_ONLY_INDICES = [2];

// ── Auth — Multi-source token resolution ────────────────────────────────────
import { execSync } from "child_process";
const RCLONE_CONFIG_ROSTER = "/home/ubuntu/.gdrive-rclone.ini";
const TOKEN_FILE_ROSTER = "/home/ubuntu/.gws_token";

function getRosterGwsToken(): string | null {
  // Source 1: process.env (set at server start)
  const envToken = process.env.GOOGLE_WORKSPACE_CLI_TOKEN;
  if (envToken && envToken.length > 20) {
    return envToken;
  }

  // Source 2: Shell env (captures tokens refreshed after server start)
  try {
    const shellToken = execSync(
      'bash -lc "echo \\$GOOGLE_WORKSPACE_CLI_TOKEN"',
      { encoding: "utf-8", timeout: 5000 }
    ).trim();
    if (shellToken && shellToken.length > 20 && shellToken.startsWith("ya29.")) {
      process.env.GOOGLE_WORKSPACE_CLI_TOKEN = shellToken;
      try { fs.writeFileSync(TOKEN_FILE_ROSTER, shellToken); } catch { /* ignore */ }
      return shellToken;
    }
  } catch { /* ignore — shell may not be available in deployed env */ }

  // Source 3: Rclone config (Google Drive integration)
  try {
    if (fs.existsSync(RCLONE_CONFIG_ROSTER)) {
      const ini = fs.readFileSync(RCLONE_CONFIG_ROSTER, "utf-8");
      const tokenLine = ini.split("\n").find(l => l.trim().startsWith("token ="));
      if (tokenLine) {
        const tokenJson = JSON.parse(tokenLine.split("=").slice(1).join("=").trim());
        if (tokenJson.access_token && tokenJson.access_token.length > 20) {
          if (tokenJson.expiry) {
            const expiry = new Date(tokenJson.expiry);
            if (expiry.getTime() < Date.now()) {
              console.log(`[ROSTER-SYNC] Rclone token expired at ${tokenJson.expiry}, skipping`);
            } else {
              try { fs.writeFileSync(TOKEN_FILE_ROSTER, tokenJson.access_token); } catch { /* ignore */ }
              return tokenJson.access_token;
            }
          } else {
            try { fs.writeFileSync(TOKEN_FILE_ROSTER, tokenJson.access_token); } catch { /* ignore */ }
            return tokenJson.access_token;
          }
        }
      }
    }
  } catch { /* ignore */ }

  // Source 4: Token file (persisted from previous successful resolution)
  try {
    if (fs.existsSync(TOKEN_FILE_ROSTER)) {
      const fileToken = fs.readFileSync(TOKEN_FILE_ROSTER, "utf-8").trim();
      if (fileToken && fileToken.length > 20) return fileToken;
    }
  } catch { /* ignore */ }

  // Source 5: Webdev secret
  const secretToken = process.env.GWS_ACCESS_TOKEN;
  if (secretToken && secretToken.length > 20) return secretToken;

  return null;
}

async function getSheetsClient() {
  const { google } = await getGoogleapis();
  const token = getRosterGwsToken();
  if (!token) {
    throw new Error("No GWS token available");
  }
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: token });
  return google.sheets({ version: "v4", auth });
}

// ── Column mapping: DB row → sheet row ───────────────────────────────────────
function dbRowToSheetRow(emp: any): (string | number)[] {
  return [
    emp.ohr_id || "",                     // A: OHR
    emp.full_name || "",                  // B: Full Name
    "",                                   // C: Access Level (sheet-only, will be merged)
    emp.last_name || "",                  // D: Last Name
    emp.given_name || "",                 // E: Given Name
    emp.middle_name || "",                // F: Middle Name
    emp.suffix || "",                     // G: Suffix
    emp.billing_name || "",               // H: Billing Name
    emp.srt_name || "",                   // I: SRT Name
    emp.employement_status || "",         // J: Employment Status
    emp.actual_role || "",                // K: Actual Role
    emp.supervisor_name || "",            // L: Actual Supervisor
    emp.supervisor_email || "",           // M: Actual Supervisor Email
    emp.shift_time || "",                 // N: Shift Time
    emp.work_off || "",                   // O: Work Off
    emp.planning_group || "",             // P: Actual PG
    emp.complete_planning_group || "",    // Q: Playbook PG
    emp.srt_status || "",                 // R: SRT Status
    emp.srt_id || "",                     // S: SRT ID
    emp.workday_id || "",                 // T: Workday ID
    emp.meta_email || "",                 // U: Meta Email
    emp.macbook_asset_id || "",           // V: Macbook Asset ID
    emp.chromebook_asset_id || "",        // W: Chromebook Asset ID
    emp.hire_date || "",                  // X: Hire Date
    emp.regular_date || "",               // Y: Regularization Date
    emp.dob || "",                        // Z: DOB
    emp.personal_email || "",             // AA: Personal Email
    emp.contact_number || "",             // AB: Contact No.
    emp.primary_address || "",            // AC: Primary Address
    emp.barangay || "",                   // AD: Barangay
    emp.city || "",                       // AE: City
    emp.province || "",                   // AF: Province
    emp.locker_floor || "",               // AG: Locker Floor
    emp.locker_number || "",              // AH: Locker No.
    emp.meta_onboarding_date || "",       // AI: Meta Onboarding Date
    emp.live_date || "",                  // AJ: Live Date
    emp.badge_id || "",                   // AK: Badge ID No.
    emp.badge_serial || "",               // AL: Badge Serial No.
    emp.platform || "",                   // AM: Platform
    emp.offboarding_date || "",           // AN: Offboarding Date
    emp.resignation_date || "",           // AO: Resignation Date
    emp.relieving_date || "",             // AP: Relieving Date
    emp.exit_date || "",                  // AQ: Exit Date
    emp.exit_reason || "",                // AR: Exit Reason
  ];
}

// ── Core sync logic ──────────────────────────────────────────────────────────
export async function runRosterSync(trigger: "cron" | "manual" = "cron") {
  const startedAt = new Date();
  console.log(`\n${"=".repeat(55)}`);
  console.log(`ROSTER Sync: DB → Google Sheet`);
  console.log(`Started: ${startedAt.toISOString()}`);
  console.log(`${"=".repeat(55)}`);

  let updated = 0;
  let appended = 0;
  let errorMsg: string | null = null;

  try {
    const sheets = await getSheetsClient();
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // 1. Read all employees from DB, ordered by full_name
    const employees = await db.select().from(ioEmployees).orderBy(asc(ioEmployees.full_name));
    console.log(`[ROSTER SYNC] ${employees.length} employees from DB`);

    // 2. Read existing sheet data to preserve sheet-only columns (Access Level)
    const existingResp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1:AR1000`,
    });
    const existingRows = existingResp.data.values || [];
    // Build a map of OHR → existing sheet-only values
    const sheetOnlyMap = new Map<string, string[]>();
    for (let i = 1; i < existingRows.length; i++) {
      const row = existingRows[i];
      const ohr = String(row[0] || "").trim();
      if (ohr) {
        sheetOnlyMap.set(ohr, SHEET_ONLY_INDICES.map(idx => row[idx] || ""));
      }
    }
    const existingOhrs = new Set(sheetOnlyMap.keys());
    console.log(`[ROSTER SYNC] ${existingOhrs.size} existing rows in sheet`);

    // 3. Build new sheet data
    const newRows: (string | number)[][] = [SHEET_HEADERS];
    for (const emp of employees) {
      const row = dbRowToSheetRow(emp);
      // Merge sheet-only columns from existing data
      const existing = sheetOnlyMap.get(emp.ohr_id || "");
      if (existing) {
        SHEET_ONLY_INDICES.forEach((colIdx, i) => {
          row[colIdx] = existing[i] || "";
        });
      }
      newRows.push(row);
    }

    // 4. Count changes
    const newOhrs = new Set(employees.map(e => e.ohr_id));
    appended = Array.from(newOhrs).filter(o => !existingOhrs.has(o || "")).length;
    updated = employees.length - appended;

    // 5. Clear the sheet and write all data in one go
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1:AR`,
    });

    // Write in batches of 200 rows to avoid payload limits
    const BATCH_SIZE = 200;
    for (let i = 0; i < newRows.length; i += BATCH_SIZE) {
      const chunk = newRows.slice(i, i + BATCH_SIZE);
      const startRow = i + 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A${startRow}`,
        valueInputOption: "RAW",
        requestBody: { values: chunk },
      });
      if (i + BATCH_SIZE < newRows.length) {
        await new Promise(r => setTimeout(r, 1000)); // Rate limit pause
      }
    }

    console.log(`[ROSTER SYNC] Written ${newRows.length - 1} rows (${updated} updated, ${appended} new)`);
  } catch (err: any) {
    errorMsg = err.message || String(err);
    console.error(`[ROSTER SYNC] ERROR: ${errorMsg}`);
  }

  const elapsed = Date.now() - startedAt.getTime();

  // Log to io_sync_log
  try {
    const db = await getDb();
    if (db) {
      await db.insert(ioSyncLog).values({
        sync_type: "roster",
        trigger,
        status: errorMsg ? "error" : "success",
        started_at: startedAt.toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: elapsed,
        rows_updated: updated,
        rows_appended: appended,
        error_message: errorMsg,
        output_log: `ROSTER sync: ${updated} updated, ${appended} appended`,
      });
    }
  } catch (logErr: any) {
    console.error(`[ROSTER SYNC-LOG] Failed to log:`, logErr.message);
  }

  console.log(`[ROSTER SYNC] Done in ${(elapsed / 1000).toFixed(1)}s — ${updated} updated, ${appended} appended`);
  return { status: errorMsg ? "error" : "success", updated, appended, elapsed, error: errorMsg };
}

// ── Cron schedule ────────────────────────────────────────────────────────────
export function initRosterSyncCron() {
  const token = getRosterGwsToken();
  if (!token) {
    console.warn("[ROSTER SYNC] No GWS token — roster cron disabled");
    return;
  }
  console.log(`[ROSTER SYNC] GWS token available (${token.length} chars) — cron enabled`);

  // Daily at 2:00 AM PHT (UTC+8) = 18:00 UTC previous day
  cron.schedule("0 18 * * *", async () => {
    console.log("[ROSTER SYNC] Cron triggered (2:00 AM PHT daily)");
    await runRosterSync("cron");
  });

  console.log("[ROSTER SYNC] Cron scheduled: 2:00 AM PHT daily");
}
