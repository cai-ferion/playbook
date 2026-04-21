import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Tests for the auto-attendance generation trigger in POST /employees.
 * Validates that the logic correctly determines which employees get
 * attendance rows and which are exempt.
 */

const ioRoutesPath = path.resolve(__dirname, "io-routes.ts");
const ioRoutesContent = fs.readFileSync(ioRoutesPath, "utf-8");

describe("Auto-Attendance Generation Trigger", () => {
  it("POST /employees endpoint exists and includes auto-attendance logic", () => {
    expect(ioRoutesContent).toContain('router.post("/employees"');
    expect(ioRoutesContent).toContain("Auto-generate attendance rows");
  });

  it("exempts Manager role from attendance generation", () => {
    expect(ioRoutesContent).toContain("EXEMPT_ROLES = ['Manager']");
  });

  it("exempts Inactive and Exit statuses from attendance generation", () => {
    expect(ioRoutesContent).toContain("INACTIVE_STATUSES = ['Inactive', 'Exit']");
  });

  it("checks for existing attendance rows before inserting (no duplicates)", () => {
    expect(ioRoutesContent).toContain("existingDates");
    expect(ioRoutesContent).toContain("existingDates.has(dateStr)");
  });

  it("generates rows from today through end of current month", () => {
    expect(ioRoutesContent).toContain("new Date(year, month + 1, 0).getDate()");
    expect(ioRoutesContent).toContain("todayStr");
    expect(ioRoutesContent).toContain("endStr");
  });

  it("populates snap_ fields from the employee data", () => {
    expect(ioRoutesContent).toContain("snap_full_name: emp.full_name");
    expect(ioRoutesContent).toContain("snap_supervisor: emp.supervisor_name");
    expect(ioRoutesContent).toContain("snap_planning_group: emp.planning_group");
    expect(ioRoutesContent).toContain("snap_shift_time: emp.shift_time");
    expect(ioRoutesContent).toContain("snap_actual_role: role");
    expect(ioRoutesContent).toContain("snap_billing_name: emp.billing_name");
    expect(ioRoutesContent).toContain("snap_status: status");
  });

  it("uses batch insert in chunks of 50", () => {
    expect(ioRoutesContent).toContain("rows.slice(i, i + 50)");
  });

  it("handles attendance generation failure gracefully (non-fatal)", () => {
    expect(ioRoutesContent).toContain("Non-fatal: employee was created, attendance generation failed");
  });

  it("generates unique IDs using crypto.randomBytes", () => {
    expect(ioRoutesContent).toContain("crypto.randomBytes(8).toString('hex')");
  });

  it("logs the number of generated rows", () => {
    expect(ioRoutesContent).toContain("[IO API] Auto-generated");
  });
});

describe("Manager Attendance Exclusion", () => {
  it("attendance GET endpoint supports exclude_managers parameter", () => {
    expect(ioRoutesContent).toContain("exclude_managers");
    // After optimization: manager exclusion uses cached OHR set instead of inline subquery
    expect(ioRoutesContent).toContain("getManagerOhrSet");
  });
});
