/**
 * server/io/index.ts
 * Barrel router for IO domain modules.
 * 
 * Architecture:
 * - This file imports and mounts all domain-specific routers under /api/io.
 * - The monolithic io-routes.ts is being decomposed into domain modules here.
 * - During migration, the legacy registerIORoutes still handles routes not yet extracted.
 * - Once all routes are extracted, registerIORoutes will be removed.
 * 
 * Domain Module Roadmap:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ Module              │ Status      │ File                        │
 * ├─────────────────────┼─────────────┼─────────────────────────────┤
 * │ Employees           │ Planned     │ ./employees.ts              │
 * │ Attendance          │ Planned     │ ./attendance.ts             │
 * │ Coaching            │ Planned     │ ./coaching.ts               │
 * │ Leaves              │ Planned     │ ./leaves.ts                 │
 * │ Notifications       │ Planned     │ ./notifications.ts          │
 * │ Tasks               │ Planned     │ ./tasks.ts                  │
 * │ Billing             │ Planned     │ ./billing.ts                │
 * │ Permissions         │ Planned     │ ./permissions.ts            │
 * │ Corrective Actions  │ Planned     │ ./corrective-actions.ts     │
 * │ WFM                 │ Planned     │ ./wfm.ts                    │
 * │ NTE Build Assist    │ Planned     │ ./nte-build-assist.ts       │
 * │ Insights            │ Planned     │ ./insights.ts               │
 * │ Audit Log           │ Planned     │ ./audit-log.ts              │
 * └─────────────────────┴─────────────┴─────────────────────────────┘
 * 
 * Migration Strategy:
 * 1. Extract one domain at a time from io-routes.ts into its own file.
 * 2. Import and mount the new router here.
 * 3. Remove the corresponding routes from io-routes.ts.
 * 4. Run integration tests after each extraction.
 * 5. Once io-routes.ts is empty, delete it and remove registerIORoutes from _core/index.ts.
 */
import { Router } from "express";

const ioRouter = Router();

// ── Domain Routers (mount as they are extracted) ────────────────
// Example (uncomment when module is ready):
// import employeesRouter from "./employees.js";
// ioRouter.use(employeesRouter);

// import attendanceRouter from "./attendance.js";
// ioRouter.use(attendanceRouter);

// import coachingRouter from "./coaching.js";
// ioRouter.use(coachingRouter);

// import leavesRouter from "./leaves.js";
// ioRouter.use(leavesRouter);

// import notificationsRouter from "./notifications.js";
// ioRouter.use(notificationsRouter);

// import tasksRouter from "./tasks.js";
// ioRouter.use(tasksRouter);

// import billingRouter from "./billing.js";
// ioRouter.use(billingRouter);

// import permissionsRouter from "./permissions.js";
// ioRouter.use(permissionsRouter);

// import correctiveActionsRouter from "./corrective-actions.js";
// ioRouter.use(correctiveActionsRouter);

// import wfmRouter from "./wfm.js";
// ioRouter.use(wfmRouter);

// import nteBuildAssistRouter from "./nte-build-assist.js";
// ioRouter.use(nteBuildAssistRouter);

// import insightsRouter from "./insights.js";
// ioRouter.use(insightsRouter);

// import auditLogRouter from "./audit-log.js";
// ioRouter.use(auditLogRouter);

/**
 * Register the modular IO router.
 * Call this from _core/index.ts AFTER registerIORoutes during migration,
 * or INSTEAD OF registerIORoutes once migration is complete.
 */
export function registerModularIORoutes(app: import("express").Express) {
  app.use("/api/io", ioRouter);
  console.log("[IO Modular] Routes registered under /api/io/*");
}

export default ioRouter;
