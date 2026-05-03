/**
 * IO Operations API Routes — LEGACY STUB
 * 
 * All domain routes have been extracted to server/io/*.ts modules:
 * - employees.ts       — Employee CRUD, sync, Supabase mirror
 * - attendance.ts      — Attendance CRUD, bulk-status, bulk-tag, date-based locking
 * - coaching.ts        — Coaching logs (RCA, ZTP, NTE), lean/full GET, admin cascade delete
 * - leaves.ts          — Leave CRUD, filing window, bulk-action, cancel, shrinkage-forecast
 * - notifications.ts   — Notification CRUD, mark-read, mark-all-read
 * - insights.ts        — Insights CRUD
 * - audit-log.ts       — Audit log read
 * - tasks.ts           — Task CRUD, comments, upload, task assignment notifications
 * - billing.ts         — Billing target hours, SRT bill, targets V2, compliance engine,
 *                        CSV upload, sheet sync, sync log, attendance/export,
 *                        productivity hours, backfill-snap-status
 * - permissions.ts     — RBAC permissions CRUD, my-permissions, config/admin-ohrs
 * - corrective-actions.ts — NTE Build Assist (AI + DOCX), Corrective Actions lifecycle,
 *                           CAP Build Assist (AI + DOCX)
 * - wfm.ts             — WFM session log, WFM schedule upload + backfill
 * - attendance-ops.ts  — Attendance purge (owner-only), bulk insert/undo, last-batch
 * 
 * Separately-owned feature routers (mounted directly in _core/index.ts):
 * - group-task-routes.ts      — Group Tasks/Helm
 * - shift-extension-routes.ts — Shift Extensions
 * - io-performance-routes.ts  — Performance reviews
 * - io-role-change-routes.ts  — Role change automation
 * - io-tardiness-routes.ts    — Tardiness tracking
 * - managers-nook-routes.ts   — Manager Nook scorecard
 * - io-backup.ts              — Backup/restore
 * 
 * This file is kept as a stub so _core/index.ts can still import registerIORoutes
 * without breaking. It will be fully removed once the import is cleaned up.
 */

export function registerIORoutes(_app: import("express").Express) {
  // No-op: all routes now served by registerModularIORoutes via server/io/index.ts
  console.log("[IO API] Legacy registerIORoutes is now a no-op -- all routes served by modular IO router");
}
