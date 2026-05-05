/**
 * server/io/index.ts
 * Barrel router for ALL IO domain modules.
 * 
 * Architecture:
 * - Every IO route is served exclusively through this barrel router.
 * - The barrel is mounted at /api/io in _core/index.ts behind requireAuth.
 * - No satellite route files remain — all 20 domain modules live in server/io/.
 * 
 * Domain Module Map (20 modules):
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ Module              │ Mount                │ File               │
 * ├─────────────────────┼──────────────────────┼────────────────────┤
 * │ Employees           │ /employees/*         │ ./employees.ts     │
 * │ Attendance          │ /attendance/*        │ ./attendance.ts    │
 * │ Coaching            │ /coaching-*          │ ./coaching.ts      │
 * │ Leaves              │ /leaves/*            │ ./leaves.ts        │
 * │ Notifications       │ /notifications/*     │ ./notifications.ts │
 * │ Insights            │ /insights/*          │ ./insights.ts      │
 * │ Audit Log           │ /audit-log/*         │ ./audit-log.ts     │
 * │ Tasks/Helm          │ /tasks/*             │ ./tasks.ts         │
 * │ Billing             │ /billing-*           │ ./billing.ts       │
 * │ Permissions/RBAC    │ /permissions/*       │ ./permissions.ts   │
 * │ Corrective Actions  │ /corrective-actions/*│ ./corrective-actions.ts │
 * │ WFM                 │ /wfm-*              │ ./wfm.ts           │
 * │ Attendance Ops      │ /attendance-*        │ ./attendance-ops.ts│
 * │ Tardiness           │ /tardiness/*         │ ./tardiness.ts     │
 * │ Role Change         │ /role-change/*       │ ./role-change.ts   │
 * │ Managers Nook       │ /managers-nook/*     │ ./managers-nook.ts │
 * │ Group Tasks         │ /group-tasks/*       │ ./group-tasks.ts   │
 * │ Shift Extensions    │ /shift-extensions/*  │ ./shift-extensions.ts │
 * │ Performance         │ /performance/*       │ ./performance.ts   │
 * │ Shared (helpers)    │ (internal)           │ ./shared.ts        │
 * └─────────────────────┴──────────────────────┴────────────────────┘
 */
import { Router } from "express";
import { setValidationLogger } from "./validation.js";
import type { ValidationRejection } from "./validation.js";

const ioRouter = Router();

// ── Wire observability logger (fire-and-forget to io_audit_log) ──
// Logs rejected payloads: endpoint, method, actor OHR, failed fields.
// NEVER logs field values (PII). Silently drops on DB error.
setValidationLogger((entry: ValidationRejection) => {
  import("../db.js").then(({ getDb }) => {
    getDb().then((db: any) => {
      if (!db) return;
      import("../../drizzle/schema.js").then(({ ioAuditLog }) => {
        db.insert(ioAuditLog).values({
          record_type: "validation_rejection",
          record_id: entry.endpoint,
          action: `${entry.method} rejected`,
          field_name: entry.failed_fields.slice(0, 5).join(", "),
          old_value: null,
          new_value: null,
          actor_ohr: entry.actor_ohr.slice(0, 20),
          actor_name: null,
          timestamp: entry.timestamp,
          metadata: JSON.stringify({
            error_summary: entry.error_summary.slice(0, 200),
            failed_fields: entry.failed_fields.slice(0, 10),
          }),
        }).execute().catch(() => { /* swallow — observability must never break requests */ });
      }).catch(() => {});
    }).catch(() => {});
  }).catch(() => {});
});

// ── Sub-Phase 2.3 — simple modules ────────────────────────────────
import employeesRouter from "./employees.js";
ioRouter.use(employeesRouter);

import notificationsRouter from "./notifications.js";
ioRouter.use(notificationsRouter);

import insightsRouter from "./insights.js";
ioRouter.use(insightsRouter);

import auditLogRouter from "./audit-log.js";
ioRouter.use(auditLogRouter);

// ── Sub-Phase 2.4 — core modules ─────────────────────────────────
import attendanceRouter from "./attendance.js";
ioRouter.use(attendanceRouter);

import coachingRouter from "./coaching.js";
ioRouter.use(coachingRouter);

import leavesRouter from "./leaves.js";
ioRouter.use(leavesRouter);

// ── Sub-Phase 2.5 — remaining monolith modules ───────────────────
import tasksRouter from "./tasks.js";
ioRouter.use(tasksRouter);

import billingRouter from "./billing.js";
ioRouter.use(billingRouter);

import permissionsRouter from "./permissions.js";
ioRouter.use(permissionsRouter);

import correctiveActionsRouter from "./corrective-actions.js";
ioRouter.use(correctiveActionsRouter);

import wfmRouter from "./wfm.js";
ioRouter.use(wfmRouter);

import attendanceOpsRouter from "./attendance-ops.js";
ioRouter.use(attendanceOpsRouter);

// ── Satellite consolidation — formerly standalone route files ─────
// Tardiness: routes define /tardiness/* internally, mounted at barrel root
import tardinessRouter from "./tardiness.js";
ioRouter.use(tardinessRouter);

// Role Change: routes define /deficit-analysis, /generate, etc.
import roleChangeRouter from "./role-change.js";
ioRouter.use("/role-change", roleChangeRouter);

// Managers Nook: routes define /scorecard, /available-months
import managersNookRouter from "./managers-nook.js";
ioRouter.use("/managers-nook", managersNookRouter);

// Group Tasks: routes define /, /preview, /my-tasks, /:id/*
import groupTasksRouter from "./group-tasks.js";
ioRouter.use("/group-tasks", groupTasksRouter);

// Shift Extensions: refactored from app-level to Router()
import shiftExtensionsRouter from "./shift-extensions.js";
ioRouter.use("/shift-extensions", shiftExtensionsRouter);

// Performance: routes define /data, /kpi, /upload, /resync, etc.
import performanceRouter from "./performance.js";
ioRouter.use("/performance", performanceRouter);

// ── Lookup: static dropdown data for Regimen inline editing ──────────
import lookupRouter from "./lookup.js";
ioRouter.use(lookupRouter);

// ── SSE Real-Time Sync — event stream + presence ─────────────────────
import sseRouter from "./sse.js";
ioRouter.use(sseRouter);

/**
 * Register the modular IO router.
 * This is the sole route registrar for /api/io domain routes.
 */
export function registerModularIORoutes(app: import("express").Express) {
  app.use("/api/io", ioRouter);
  console.log("[IO Modular] All 20 domain modules registered under /api/io/*");
}

export default ioRouter;
