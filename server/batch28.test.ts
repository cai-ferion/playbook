import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

describe("Batch 28 — Input Portal & Helm Fixes", () => {
  // 1. Date range chip width
  describe("Date range filter chip width", () => {
    it("chip-text should use white-space:nowrap (no truncation)", () => {
      const css = readFileSync(join(ROOT, "server/public/css/styles.css"), "utf-8");
      const chipTextBlock = css.match(/\.chip-text\s*\{[^}]*\}/)?.[0] || '';
      expect(chipTextBlock).toContain("white-space");
      expect(chipTextBlock).toContain("nowrap");
      expect(chipTextBlock).not.toContain("max-width");
    });
  });

  // 2. Billing code system removed (Batch 141)
  describe("Billing code system fully removed", () => {
    it("app.js should NOT contain billing code functions or maps", () => {
      const js = readFileSync(join(ROOT, "server/public/js/app.js"), "utf-8");
      expect(js).not.toContain("function getBillingCodeDesc");
      expect(js).not.toContain("BILLING_CODE_DESC_MAP");
      expect(js).not.toContain("billingCode");
    });
  });

  // 3. New Request Name field single-select
  describe("New Request Name field single-select", () => {
    it("should hide search input after agent selection", () => {
      const js = readFileSync(join(ROOT, "server/public/js/helm.js"), "utf-8");
      expect(js).toContain("searchInput.style.display = 'none'");
    });

    it("should show search input when agent is cleared", () => {
      const js = readFileSync(join(ROOT, "server/public/js/helm.js"), "utf-8");
      expect(js).toContain("searchInput.style.display = ''");
    });
  });

  // 4. Omnibar filter delimiter fix
  describe("Omnibar filter delimiter fix (pipe instead of comma)", () => {
    it("frontend should join filter values with pipe delimiter", () => {
      const js = readFileSync(join(ROOT, "server/public/js/input-portal.js"), "utf-8");
      // Should use pipe delimiter
      expect(js).toContain("f.values.join('|')");
      // Should NOT use comma delimiter for filter values
      expect(js).not.toContain("f.values.join(',')");
    });

    it("server should split filter values by pipe delimiter", () => {
      const ts = [__dirname + "/io/shared.ts", __dirname + "/io/attendance-ops.ts", __dirname + "/io/attendance.ts", __dirname + "/io/audit-log.ts", __dirname + "/io/billing.ts", __dirname + "/io/coaching.ts", __dirname + "/io/corrective-actions.ts", __dirname + "/io/employees.ts", __dirname + "/io/insights.ts", __dirname + "/io/leaves.ts", __dirname + "/io/notifications.ts", __dirname + "/io/permissions.ts", __dirname + "/io/tasks.ts", __dirname + "/io/wfm.ts"].map(f => require("fs").readFileSync(f, "utf-8")).join("\n");
      // All multi-value filters should use pipe
      expect(ts).toContain('String(agent_in).split("|")');
      expect(ts).toContain('String(flm_in).split("|")');
      expect(ts).toContain('String(planning_group_in).split("|")');
      // billing_code_in removed in Batch 141
      expect(ts).not.toContain('billing_code_in');
      expect(ts).toContain('String(tag_in).split("|")');
    });
  });

  // 5. Filter value picker uses employeeLookup fallback
  describe("Filter value picker uses employeeLookup fallback", () => {
    it("should have empFieldMap for employee-based filter fields", () => {
      const js = readFileSync(join(ROOT, "server/public/js/input-portal.js"), "utf-8");
      expect(js).toContain("empFieldMap");
      expect(js).toContain("agent: 'full_name'");
      expect(js).toContain("flm: 'supervisor_name'");
    });

    it("should fallback to employeeLookup when appState.records is empty", () => {
      const js = readFileSync(join(ROOT, "server/public/js/input-portal.js"), "utf-8");
      expect(js).toContain("Object.values(employeeLookup)");
    });
  });
});
