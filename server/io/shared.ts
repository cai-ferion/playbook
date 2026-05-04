/**
 * server/io/shared.ts
 * Shared infrastructure for IO domain modules.
 * Contains common helpers, caches, and constants used across multiple route files.
 */
import { getDb } from "../db.js";
import { ioEmployees, ioNotifications } from "../../drizzle/schema.js";
import { eq, inArray, sql } from "drizzle-orm";
import crypto from "crypto";
import { ADMIN_OHRS, OWNER_OHR, isAdminOhr } from "../config.js";

// Re-export config for convenience
export { ADMIN_OHRS, OWNER_OHR, isAdminOhr };
export { getDb };

// ── Manager OHR Cache (5-min TTL) ──────────────────────────────
// Avoids correlated NOT IN (SELECT ...) subquery on every attendance request.
let _managerOhrSet: Set<string> = new Set();
let _managerCacheTs = 0;
const MANAGER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getManagerOhrSet(): Promise<Set<string>> {
  if (Date.now() - _managerCacheTs < MANAGER_CACHE_TTL && _managerOhrSet.size > 0) {
    return _managerOhrSet;
  }
  try {
    const db = await getDb();
    if (!db) return _managerOhrSet;
    const rows = await db.select({ ohr_id: ioEmployees.ohr_id })
      .from(ioEmployees)
      .where(eq(ioEmployees.actual_role, 'Manager'));
    _managerOhrSet = new Set(rows.map(r => r.ohr_id));
    _managerCacheTs = Date.now();
  } catch (err) {
    console.warn('[ManagerCache] Failed to refresh:', err);
  }
  return _managerOhrSet;
}

// ── Planning Group Normalization ──────────────────────────────
// Normalize long PG codes from Google Sheet / SRT to short codes used in DB.
const PG_NORMALIZE: Record<string, string> = {
  'MASA_MAFSA_CTR_SCALED_REVIEW': 'S-ABF',
  'CEI_TASKFORCE_CTR': 'CS-ABF',
};

export function normalizePg(raw: string): string {
  return PG_NORMALIZE[raw] || raw;
}

// ── ID Generators ──────────────────────────────────────────────
/** Generate a unique alphanumeric coaching ID: CL-xxxxxxxx */
export function generateCoachingId(): string {
  return `CL-${crypto.randomBytes(4).toString('hex')}`;
}

/** Generate a unique alphanumeric task ID: TK-xxxxxxxx */
export function generateTaskId(): string {
  return `TK-${crypto.randomBytes(4).toString('hex')}`;
}

// ── Task Assignment Notification Helper ──────────────────────────
export async function sendTaskAssignmentNotifications(record: any) {
  const ohrs = (record.assigned_to_ohr || '').split(',').map((s: string) => s.trim()).filter(Boolean);
  if (ohrs.length === 0) return;

  try {
    const db = await getDb();
    if (!db) return;
    const employees = await db.select().from(ioEmployees).where(inArray(ioEmployees.ohr_id, ohrs));

    const dueStr = record.due_date ? new Date(record.due_date + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) : 'No due date';

    for (const emp of employees) {
      await db.insert(ioNotifications).values({
        type: 'task_assigned',
        title: 'New Task Assigned',
        message: `${record.task_id}: ${record.title} — Due: ${dueStr}. Assigned by ${record.assigned_by_name || 'System'}.`,
        actor_ohr: record.assigned_by_ohr || null,
        actor_name: record.assigned_by_name || 'System',
        target_ohr: emp.ohr_id,
        target_role: 'agent',
        metadata: JSON.stringify({ task_id: record.task_id, title: record.title, due_date: record.due_date }),
        is_read: false,
        created_at: new Date().toISOString(),
      });
      console.log(`[IO API] Task notification created for ${emp.full_name} (${emp.ohr_id}) — task ${record.task_id}`);
    }
  } catch (err: any) {
    console.error('[IO API] Error creating task assignment notifications:', err.message);
  }
}

// ── Permission Defaults ──────────────────────────────────────────
const ALL_PERMISSION_KEYS = [
  'nav.anchor', 'anchor.input_portal', 'anchor.dashboard', 'anchor.billing_compliance',
  'anchor.risk_intelligence', 'anchor.download_csv', 'anchor.edit_attendance',
  'nav.compass', 'compass.disputes', 'compass.corrective_actions',
  'nav.helm', 'nav.regimen', 'nav.sandbox', 'nav.haven', 'nav.horizon', 'nav.admin',
  'regimen.export_csv', 'regimen.full_columns',
  'regimen.onboarding_tab', 'regimen.permissions_tab', 'regimen.add_employee', 'regimen.edit_employee',
];

export function getPermissionDefaults(role: string, ohrId: string): Record<string, boolean> {
  // Owner gets everything
  if (ohrId === '740045023') return Object.fromEntries(ALL_PERMISSION_KEYS.map(k => [k, true]));
  const b: Record<string, boolean> = Object.fromEntries(ALL_PERMISSION_KEYS.map(k => [k, false]));
  // Admin OHRs get nav.admin
  if (isAdminOhr(ohrId)) b['nav.admin'] = true;
  if (role === 'Agent') { b['nav.compass'] = true; b['nav.sandbox'] = true; b['nav.helm'] = true; b['nav.haven'] = true; return b; }
  b['nav.anchor'] = true;
  b['anchor.input_portal'] = true;
  b['anchor.dashboard'] = true;
  b['anchor.billing_compliance'] = true;
  b['anchor.risk_intelligence'] = true;
  b['anchor.download_csv'] = true;
  b['nav.helm'] = true;
  b['nav.regimen'] = true;
  b['nav.sandbox'] = true;
  b['regimen.export_csv'] = true;
  b['nav.haven'] = true;
  b['nav.compass'] = true;
  b['compass.disputes'] = true;
  // Horizon: TL, Manager, Admin only
  if (role === 'Team Lead' || role === 'Manager') {
    b['nav.horizon'] = true;
  }
  // Corrective Actions: TLs and Managers only
  if (role === 'Team Lead' || role === 'Manager') {
    b['compass.corrective_actions'] = true;
  }
  if (role === 'Team Lead') b['anchor.edit_attendance'] = true;
  if (role === 'Manager') {
    b['anchor.edit_attendance'] = true;
  }
  // Special: 740044909 (assistant) gets elevated perms
  if (ohrId === '740044909') {
    b['anchor.edit_attendance'] = true;
    b['nav.compass'] = true;
    b['compass.corrective_actions'] = true;
    b['regimen.edit_employee'] = true;
    b['regimen.add_employee'] = true;
    b['regimen.full_columns'] = true;
    b['regimen.onboarding_tab'] = true;
    b['regimen.permissions_tab'] = true;
  }
  return b;
}

export { ALL_PERMISSION_KEYS };
