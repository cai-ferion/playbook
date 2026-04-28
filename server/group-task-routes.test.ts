import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Group Task Routes — Vitest
 *
 * Tests route definitions, SQL query patterns, validation logic,
 * and the deadline reminder cron in auto-mailer.ts.
 * Pure-function / static-analysis tests — no live DB required.
 */

const routesSource = fs.readFileSync(
  path.resolve(__dirname, "group-task-routes.ts"),
  "utf-8"
);
const autoMailerSource = fs.readFileSync(
  path.resolve(__dirname, "auto-mailer.ts"),
  "utf-8"
);

// ── Route Registration ──
describe("group-task-routes: route registration", () => {
  it("registers POST / for creating a group task", () => {
    expect(routesSource).toContain('router.post("/",');
  });

  it("registers GET / for listing group tasks", () => {
    expect(routesSource).toContain('router.get("/",');
  });

  it("registers GET /my-tasks for unified task list", () => {
    expect(routesSource).toContain('router.get("/my-tasks"');
  });

  it("registers GET /:id for single task detail", () => {
    expect(routesSource).toContain('router.get("/:id"');
  });

  it("registers POST /:id/complete for marking assignment done", () => {
    expect(routesSource).toContain('router.post("/:id/complete"');
  });

  it("registers POST /:id/exclude for excluding people", () => {
    expect(routesSource).toContain('router.post("/:id/exclude"');
  });

  it("registers POST /preview for previewing assignment count", () => {
    expect(routesSource).toContain('router.post("/preview"');
  });

  it("registers POST /:id/close for closing a group task", () => {
    expect(routesSource).toContain('router.post("/:id/close"');
  });
});

// ── SQL Query Patterns ──
describe("group-task-routes: SQL patterns", () => {
  it("filters only Active employees in resolveTargetEmployees", () => {
    expect(routesSource).toContain("employement_status = 'Active'");
  });

  it("supports planning_group filter", () => {
    expect(routesSource).toContain("e.planning_group IN");
  });

  it("supports department filter", () => {
    expect(routesSource).toContain("e.department IN");
  });

  it("supports actual_role filter", () => {
    expect(routesSource).toContain("e.actual_role IN");
  });

  it("supports excluded_ohrs filter", () => {
    expect(routesSource).toContain("e.ohr_id NOT IN");
  });

  it("inserts into io_group_tasks table", () => {
    expect(routesSource).toContain("INSERT INTO io_group_tasks");
  });

  it("inserts into io_task_assignments table", () => {
    expect(routesSource).toContain("INSERT INTO io_task_assignments");
  });

  it("tracks Completed, Pending, and Not Applicable statuses", () => {
    expect(routesSource).toContain("'Completed'");
    expect(routesSource).toContain("'Pending'");
    expect(routesSource).toContain("'Not Applicable'");
  });

  it("counts progress with SUM CASE for completed and pending", () => {
    expect(routesSource).toContain("SUM(CASE WHEN ta.status = 'Completed'");
    expect(routesSource).toContain("SUM(CASE WHEN ta.status = 'Pending'");
  });
});

// ── Task ID Generation ──
describe("group-task-routes: task ID generation", () => {
  it("generates GT- prefixed task IDs", () => {
    expect(routesSource).toContain("GT-");
  });

  it("uses base36 encoding for unique IDs", () => {
    // The route uses Date.now().toString(36).toUpperCase()
    expect(routesSource).toContain("toString(36)");
    expect(routesSource).toContain("toUpperCase()");
  });
});

// ── Validation & Error Handling ──
describe("group-task-routes: validation", () => {
  it("requires title field for task creation", () => {
    expect(routesSource).toContain("title");
    // The route destructures title from req.body
    expect(routesSource).toMatch(/const\s*\{[^}]*title[^}]*\}\s*=\s*req\.body/);
  });

  it("returns 404 when task not found", () => {
    expect(routesSource).toContain("404");
    expect(routesSource).toMatch(/not found|Not found/i);
  });

  it("returns 400 for missing required fields", () => {
    expect(routesSource).toContain("400");
  });

  it("handles DB unavailable gracefully", () => {
    expect(routesSource).toContain("DB unavailable");
  });

  it("catches and returns 500 on internal errors", () => {
    expect(routesSource).toContain("500");
  });
});

// ── Exclude Endpoint ──
describe("group-task-routes: exclude endpoint", () => {
  it("marks excluded assignments as Not Applicable", () => {
    expect(routesSource).toContain("SET status = 'Not Applicable'");
  });

  it("updates the excluded_ohrs JSON on the group task", () => {
    expect(routesSource).toContain("excluded_ohrs");
    expect(routesSource).toContain("JSON.stringify");
    expect(routesSource).toContain("JSON.parse");
  });
});

// ── Complete Endpoint ──
describe("group-task-routes: complete endpoint", () => {
  it("sets status to Completed and records completed_at", () => {
    expect(routesSource).toContain("SET status = 'Completed'");
    expect(routesSource).toContain("completed_at");
  });

  it("requires ohr in request body", () => {
    expect(routesSource).toContain("ohr");
  });
});

// ── Close Endpoint ──
describe("group-task-routes: close endpoint", () => {
  it("sets group task status to Closed", () => {
    expect(routesSource).toContain("'Closed'");
  });
});

// ── My Tasks Endpoint ──
describe("group-task-routes: my-tasks endpoint", () => {
  it("queries by employee_ohr for the current user", () => {
    expect(routesSource).toContain("employee_ohr");
  });

  it("joins io_group_tasks for task metadata", () => {
    expect(routesSource).toContain("io_group_tasks");
    expect(routesSource).toContain("io_task_assignments");
  });

  it("excludes Not Applicable from my-tasks", () => {
    // The route filters out N/A assignments
    expect(routesSource).toContain("!= 'Not Applicable'");
  });
});

// ── Deadline Reminder (Auto-Mailer) ──
describe("auto-mailer: group task deadline reminders", () => {
  it("defines checkGroupTaskDeadlines function", () => {
    expect(autoMailerSource).toContain("checkGroupTaskDeadlines");
  });

  it("queries open group tasks with due dates", () => {
    expect(autoMailerSource).toContain("gt.status = 'Open'");
    expect(autoMailerSource).toContain("gt.due_date IS NOT NULL");
  });

  it("checks due dates within 3-day window", () => {
    expect(autoMailerSource).toContain("gt.due_date >=");
    expect(autoMailerSource).toContain("gt.due_date <=");
    expect(autoMailerSource).toContain("setDate(d.getDate() + 3)");
  });

  it("creates notifications of type group_task_deadline", () => {
    expect(autoMailerSource).toContain("group_task_deadline");
  });

  it("notifies both task creator and pending assignees", () => {
    expect(autoMailerSource).toContain("target_ohr: task.created_by_ohr");
    expect(autoMailerSource).toContain("target_ohr: assignee.employee_ohr");
  });

  it("schedules at 9:00 AM PHT (01:00 UTC)", () => {
    // Cron: "0 1 * * *"
    expect(autoMailerSource).toContain('"0 1 * * *"');
  });

  it("registers manual trigger endpoint", () => {
    expect(autoMailerSource).toContain("/api/io/group-task-deadline-check");
  });
});

// ── Schema Alignment ──
describe("group-task-routes: schema alignment", () => {
  const schemaSource = fs.readFileSync(
    path.resolve(__dirname, "../drizzle/schema.ts"),
    "utf-8"
  );

  it("schema defines io_group_tasks table", () => {
    expect(schemaSource).toContain("io_group_tasks");
  });

  it("schema defines io_task_assignments table", () => {
    expect(schemaSource).toContain("io_task_assignments");
  });

  it("io_group_tasks has required columns", () => {
    // Check key columns exist in schema
    expect(schemaSource).toMatch(/task_id.*io_group_tasks|io_group_tasks[\s\S]*task_id/);
  });

  it("io_task_assignments has group_task_id foreign key", () => {
    expect(schemaSource).toContain("group_task_id");
  });
});
