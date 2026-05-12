import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Anchor - CSV Export Column Layout", () => {
  const billingTs = fs.readFileSync(
    path.join(__dirname, "io/billing.ts"),
    "utf-8"
  );

  it("has exactly 14 CSV columns in the correct order", () => {
    // Extract the csvColumns array definition
    const match = billingTs.match(/const csvColumns = \[([\s\S]*?)\];/);
    expect(match).not.toBeNull();
    const block = match![1];
    // Extract all label values
    const labels = [...block.matchAll(/label:\s*"([^"]+)"/g)].map(m => m[1]);
    expect(labels).toEqual([
      "Date",
      "OHR",
      "Agent",
      "Tag",
      "UPL Reason",
      "Remarks",
      "OT Hours",
      "FLM",
      "Shift",
      "Status",
      "Billing Role",
      "Billing Planning Group",
      "Internal Role",
      "Internal Planning Group",
    ]);
  });

  it("maps Billing Role to snap_actual_role", () => {
    expect(billingTs).toContain('{ key: "snap_actual_role", label: "Billing Role" }');
  });

  it("maps Billing Planning Group to snap_planning_group", () => {
    expect(billingTs).toContain('{ key: "snap_planning_group", label: "Billing Planning Group" }');
  });

  it("maps Internal Role to internal_role", () => {
    expect(billingTs).toContain('{ key: "internal_role", label: "Internal Role" }');
  });

  it("maps Internal Planning Group to internal_planning_group", () => {
    expect(billingTs).toContain('{ key: "internal_planning_group", label: "Internal Planning Group" }');
  });

  it("does NOT include old Billing (snap_billing_name) column", () => {
    expect(billingTs).not.toMatch(/label:\s*"Billing"\s*}/);
  });

  it("does NOT include old Locked (is_locked) column", () => {
    const match = billingTs.match(/const csvColumns = \[([\s\S]*?)\];/);
    expect(match![1]).not.toContain("is_locked");
  });

  it("does NOT include standalone Role or Planning Group columns", () => {
    const match = billingTs.match(/const csvColumns = \[([\s\S]*?)\];/);
    const block = match![1];
    const labels = [...block.matchAll(/label:\s*"([^"]+)"/g)].map(m => m[1]);
    // Should NOT have plain "Role" or "Planning Group" (only "Billing Role" etc.)
    expect(labels).not.toContain("Role");
    expect(labels).not.toContain("Planning Group");
  });
});
