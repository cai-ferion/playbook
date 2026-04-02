import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

describe("Batch 28 — Input Portal & Helm Fixes", () => {
  // 1. Date range chip width
  describe("Date range filter chip width", () => {
    it("chip-text max-width should be wider than 220px", () => {
      const css = readFileSync(join(ROOT, "server/public/css/styles.css"), "utf-8");
      const match = css.match(/\.chip-text\s*\{[^}]*max-width:\s*(\d+)px/);
      expect(match).toBeTruthy();
      const width = parseInt(match![1], 10);
      expect(width).toBeGreaterThanOrEqual(300);
    });
  });

  // 2. Billing code descriptions
  describe("Billing code descriptions in Edit dropdown", () => {
    it("getBillingCodeDesc function should exist in app.js", () => {
      const js = readFileSync(join(ROOT, "server/public/js/app.js"), "utf-8");
      expect(js).toContain("function getBillingCodeDesc");
      expect(js).toContain("BILLING_CODE_DESC_MAP");
    });

    it("should have descriptions for all standard billing codes", () => {
      const js = readFileSync(join(ROOT, "server/public/js/app.js"), "utf-8");
      const codes = ["MA", "MS", "MQ", "CA", "CS", "CQ", "SO", "FA", "RM", "SM", "QP", "SV"];
      for (const code of codes) {
        expect(js).toContain(`'${code}':`);
      }
    });

    it("dropdown options should use getBillingCodeDesc", () => {
      const js = readFileSync(join(ROOT, "server/public/js/app.js"), "utf-8");
      const matches = js.match(/getBillingCodeDesc\(code\)/g);
      expect(matches).toBeTruthy();
      expect(matches!.length).toBeGreaterThanOrEqual(3); // init + reset + agent change
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
      const ts = readFileSync(join(ROOT, "server/io-routes.ts"), "utf-8");
      // All multi-value filters should use pipe
      expect(ts).toContain('String(agent_in).split("|")');
      expect(ts).toContain('String(flm_in).split("|")');
      expect(ts).toContain('String(planning_group_in).split("|")');
      expect(ts).toContain('String(billing_code_in).split("|")');
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
