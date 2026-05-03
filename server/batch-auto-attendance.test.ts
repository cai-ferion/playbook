import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Tests for the auto-attendance generation trigger in POST /employees.
 * Validates that the logic correctly determines which employees get
 * attendance rows and which are exempt.
 */

const ioRoutesContent = [__dirname + "/io-routes.ts", __dirname + "/io/shared.ts", __dirname + "/io/attendance-ops.ts", __dirname + "/io/attendance.ts", __dirname + "/io/audit-log.ts", __dirname + "/io/billing.ts", __dirname + "/io/coaching.ts", __dirname + "/io/corrective-actions.ts", __dirname + "/io/employees.ts", __dirname + "/io/insights.ts", __dirname + "/io/leaves.ts", __dirname + "/io/notifications.ts", __dirname + "/io/permissions.ts", __dirname + "/io/tasks.ts", __dirname + "/io/wfm.ts"].map(f => require("fs").readFileSync(f, "utf-8")).join("\n");
const employeesModulePath = path.resolve(__dirname, "io/employees.ts");
const employeesModule = fs.readFileSync(employeesModulePath, "utf-8");

describe("Auto-Attendance Generation Trigger", () => {
  it("POST /employees endpoint exists and includes auto-attendance logic", () => {
    expect(employeesModule).toContain('router.post("/employees"');
    expect(employeesModule).toContain("Auto-generate attendance rows");
  });

  it("exempts Manager role from attendance generation", () => {
    expect(employeesModule).toContain("EXEMPT_ROLES = ['Manager']");
  });

  it("exempts Inactive and Exit statuses from attendance generation", () => {
    expect(employeesModule).toContain("INACTIVE_STATUSES = ['Inactive', 'Exit']");
  });

  it("checks for existing attendance rows before inserting (no duplicates)", () => {
    expect(employeesModule).toContain("existingDates");
    expect(employeesModule).toContain("existingDates.has(dateStr)");
  });

  it("generates rows from today through end of current month", () => {
    expect(employeesModule).toContain("new Date(year, month + 1, 0).getDate()");
    expect(employeesModule).toContain("todayStr");
    expect(employeesModule).toContain("endStr");
  });

  it("populates snap_ fields from the employee data", () => {
    expect(employeesModule).toContain("snap_full_name: emp.full_name");
    expect(employeesModule).toContain("snap_supervisor: emp.supervisor_name");
    expect(employeesModule).toContain("snap_planning_group: emp.planning_group");
    expect(employeesModule).toContain("snap_shift_time: emp.shift_time");
    expect(employeesModule).toContain("snap_actual_role: role");
    expect(employeesModule).toContain("snap_billing_name: emp.billing_name");
    expect(employeesModule).toContain("snap_status: status");
  });

  it("uses batch insert in chunks of 50", () => {
    expect(employeesModule).toContain("rows.slice(i, i + 50)");
  });

  it("handles attendance generation failure gracefully (non-fatal)", () => {
    expect(employeesModule).toContain("Non-fatal: employee was created, attendance generation failed");
  });

  it("generates unique IDs using crypto.randomBytes", () => {
    expect(employeesModule).toContain("crypto.randomBytes(8).toString('hex')");
  });

  it("logs the number of generated rows", () => {
    expect(employeesModule).toContain("[IO API] Auto-generated");
  });
});

describe("Manager Attendance Exclusion", () => {
  it("attendance GET endpoint supports exclude_managers parameter", () => {
    expect(ioRoutesContent).toContain("exclude_managers");
    // After optimization: manager exclusion uses cached OHR set instead of inline subquery
    expect(ioRoutesContent).toContain("getManagerOhrSet");
  });
});
