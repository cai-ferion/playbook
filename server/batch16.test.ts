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
  const ioRoutes = fs.readFileSync(path.resolve(__dirname, "io-routes.ts"), "utf-8");

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
    expect(rosterJs).toContain("function rosterOpenDetail");
  });

  it("rows have onclick to open detail card", () => {
    expect(rosterJs).toContain("rosterOpenDetail(");
  });
});

describe("Batch 16 — Billing Code Reference Target Hours", () => {
  const billingJs = fs.readFileSync(path.resolve(__dirname, "public/js/billing.js"), "utf-8");
  const indexHtml = fs.readFileSync(path.resolve(__dirname, "public/index.html"), "utf-8");
  const ioRoutes = fs.readFileSync(path.resolve(__dirname, "io-routes.ts"), "utf-8");

  it("has Target Hrs header in billing code reference table", () => {
    expect(indexHtml).toContain("Target Hrs");
  });

  it("has billing-code-ref-body tbody for dynamic rendering", () => {
    expect(indexHtml).toContain("billing-code-ref-body");
  });

  it("has renderBillingCodeReference function", () => {
    expect(billingJs).toContain("function renderBillingCodeReference");
  });

  it("has billingUpdateTargetHours function for admin editing", () => {
    expect(billingJs).toContain("function billingUpdateTargetHours");
  });

  it("has loadBillingTargetHours to load from server", () => {
    expect(billingJs).toContain("function loadBillingTargetHours");
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
