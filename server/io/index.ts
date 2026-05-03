/**
 * server/io/index.ts
 * Barrel router for IO domain modules.
 * 
 * Architecture:
 * - All domain routes are now extracted from the monolith into individual modules.
 * - The legacy io-routes.ts is now a stub (registerIORoutes is a no-op).
 * - Separately-owned feature routers (group-tasks, managers-nook, shift-extensions,
 *   io-performance, io-role-change, io-tardiness, io-backup) remain mounted in _core/index.ts.
 * 
 * Domain Module Map:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ Module              │ Status      │ File                        │
 * ├─────────────────────┼─────────────┼─────────────────────────────┤
 * │ Employees           │ ✅ Extracted │ ./employees.ts              │
 * │ Attendance          │ ✅ Extracted │ ./attendance.ts             │
 * │ Coaching            │ ✅ Extracted │ ./coaching.ts               │
 * │ Leaves              │ ✅ Extracted │ ./leaves.ts                 │
 * │ Notifications       │ ✅ Extracted │ ./notifications.ts          │
 * │ Insights            │ ✅ Extracted │ ./insights.ts               │
 * │ Audit Log           │ ✅ Extracted │ ./audit-log.ts              │
 * │ Tasks/Helm          │ ✅ Extracted │ ./tasks.ts                  │
 * │ Billing             │ ✅ Extracted │ ./billing.ts                │
 * │ Permissions/RBAC    │ ✅ Extracted │ ./permissions.ts            │
 * │ Corrective Actions  │ ✅ Extracted │ ./corrective-actions.ts     │
 * │ WFM                 │ ✅ Extracted │ ./wfm.ts                    │
 * │ Attendance Ops      │ ✅ Extracted │ ./attendance-ops.ts         │
 * └─────────────────────┴─────────────┴─────────────────────────────┘
 */
import { Router } from "express";

const ioRouter = Router();

// ── Domain Routers (mounted in extraction order) ────────────────

// Sub-Phase 2.3 — simple modules
import employeesRouter from "./employees.js";
ioRouter.use(employeesRouter);

import notificationsRouter from "./notifications.js";
ioRouter.use(notificationsRouter);

import insightsRouter from "./insights.js";
ioRouter.use(insightsRouter);

import auditLogRouter from "./audit-log.js";
ioRouter.use(auditLogRouter);

// Sub-Phase 2.4 — core modules
import attendanceRouter from "./attendance.js";
ioRouter.use(attendanceRouter);

import coachingRouter from "./coaching.js";
ioRouter.use(coachingRouter);

import leavesRouter from "./leaves.js";
ioRouter.use(leavesRouter);

// Sub-Phase 2.5 — remaining modules (full monolith decomposition)
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

/**
 * Register the modular IO router.
 * This is now the sole route registrar for /api/io domain routes.
 * The legacy registerIORoutes in io-routes.ts is a no-op stub.
 */
export function registerModularIORoutes(app: import("express").Express) {
  app.use("/api/io", ioRouter);
  console.log("[IO Modular] Routes registered under /api/io/*");
}

export default ioRouter;
