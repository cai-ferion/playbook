import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Batch 16 — Compass Disputes Pagination", () => {
  const compassJs = fs.readFileSync(path.resolve(__dirname, "public/js/compass.js"), "utf-8");

  it("pagination controls appear in kanban columns", () => {
    expect(compassJs).toContain("kanban-col-pagination");
  });

  it("coaching fetch limit is 5000 to cover all records", () => {
    expect(compassJs).toContain("limit=5000");
  });
});

describe("Batch 16 — Helm Task Board cleanup", () => {
  const helmJs = fs.readFileSync(path.resolve(__dirname, "public/js/helm.js"), "utf-8");
  const indexHtml = fs.readFileSync(path.resolve(__dirname, "public/index.html"), "utf-8");
  const ioRoutes = [__dirname + "/io/shared.ts", __dirname + "/io/attendance-ops.ts", __dirname + "/io/attendance.ts", __dirname + "/io/audit-log.ts", __dirname + "/io/billing.ts", __dirname + "/io/coaching.ts", __dirname + "/io/corrective-actions.ts", __dirname + "/io/employees.ts", __dirname + "/io/insights.ts", __dirname + "/io/leaves.ts", __dirname + "/io/notifications.ts", __dirname + "/io/permissions.ts", __dirname + "/io/tasks.ts", __dirname + "/io/wfm.ts", __dirname + "/io/tardiness.ts", __dirname + "/io/role-change.ts", __dirname + "/io/managers-nook.ts", __dirname + "/io/group-tasks.ts", __dirname + "/io/shift-extensions.ts", __dirname + "/io/performance.ts"].map(f => require("fs").readFileSync(f, "utf-8")).join("\n");

  it("does not have Priority as a table header", () => {
    expect(helmJs).not.toMatch(/<th>Priority<\/th>/);
  });

  it("does not have Linked Entity as a table header", () => {
    expect(helmJs).not.toMatch(/<th>Linked Entity<\/th>/);
  });

  it("does not have My Tasks tab in HTML", () => {
    expect(indexHtml).not.toContain("helm-tab-mine");
  });

  it("task email does not mention Priority", () => {
    expect(ioRoutes).not.toContain("record.priority");
  });
});

describe("Batch 16 — Regimen changes", () => {
  const rosterJs = fs.readFileSync(path.resolve(__dirname, "public/js/roster.js"), "utf-8");
  const schema = fs.readFileSync(path.resolve(__dirname, "../drizzle/schema.ts"), "utf-8");

  it("does not have access_level in roster columns", () => {
    expect(rosterJs).not.toContain("access_level");
  });

  it("does not have access_level in drizzle schema", () => {
    expect(schema).not.toContain("access_level");
  });

  it("has rosterOpenDetail function for employee card view", () => {
    expect(rosterJs).toContain("rosterOpenDetail");
  });

  it("rows have onclick to open detail card", () => {
    expect(rosterJs).toContain("rosterOpenDetail(");
  });
});

describe("Batch 16 — Billing Code Reference Target Hours", () => {
  const billingJs = fs.readFileSync(path.resolve(__dirname, "public/js/billing.js"), "utf-8");
  const indexHtml = fs.readFileSync(path.resolve(__dirname, "public/index.html"), "utf-8");
  const ioRoutes = [__dirname + "/io/shared.ts", __dirname + "/io/attendance-ops.ts", __dirname + "/io/attendance.ts", __dirname + "/io/audit-log.ts", __dirname + "/io/billing.ts", __dirname + "/io/coaching.ts", __dirname + "/io/corrective-actions.ts", __dirname + "/io/employees.ts", __dirname + "/io/insights.ts", __dirname + "/io/leaves.ts", __dirname + "/io/notifications.ts", __dirname + "/io/permissions.ts", __dirname + "/io/tasks.ts", __dirname + "/io/wfm.ts", __dirname + "/io/tardiness.ts", __dirname + "/io/role-change.ts", __dirname + "/io/managers-nook.ts", __dirname + "/io/group-tasks.ts", __dirname + "/io/shift-extensions.ts", __dirname + "/io/performance.ts"].map(f => require("fs").readFileSync(f, "utf-8")).join("\n");

  it("has Target Hrs header in billing code reference table", () => {
    expect(indexHtml).toContain("Target Hrs");
  });

  it("[V3] billing code ref removed — targets now managed via admin panel", () => {
    // The old billing-code-ref-body, renderBillingCodeReference, billingUpdateTargetHours,
    // and loadBillingTargetHours were removed in the V3 rewrite.
    // Targets are now managed via the Billing Targets V2 admin panel.
    expect(billingJs).toContain('function renderBillingComplianceTable');
  });

  it("has billing-target-hours GET endpoint on server", () => {
    expect(ioRoutes).toContain('"/billing-target-hours"');
  });

  it("has billing-target-hours POST endpoint on server", () => {
    expect(ioRoutes).toContain("io_billing_target_hours");
  });

  it("admin check uses OHR 740045023", () => {
    expect(billingJs).toContain("740045023");
  });
});
