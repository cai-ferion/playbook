import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Batch 17 — Revisions", () => {
  // 1. Billing Compliance: 100% threshold
  describe("Billing Compliance", () => {
    const billingJs = fs.readFileSync(path.join(__dirname, "../server/public/js/billing.js"), "utf-8");
    const indexHtml = fs.readFileSync(path.join(__dirname, "../server/public/index.html"), "utf-8");

    it("[V3] compliance is now server-driven with 98/100/102 goal columns", () => {
      // The old client-side threshold selector was replaced by server-driven
      // goal_to_98, goal_to_100, goal_to_102 columns in the V3 rewrite.
      expect(billingJs).toContain('goal_to_98');
      expect(billingJs).toContain('goal_to_100');
      expect(billingJs).toContain('goal_to_102');
    });

    it("[V3] has Goal 98%, 100%, 102% column headers", () => {
      expect(indexHtml).toContain('Goal 98%');
      expect(indexHtml).toContain('Goal 100%');
      expect(indexHtml).toContain('Goal 102%');
    });
  });

  // 2. Coaching Disputes: remove border lines, fix LV3→LV4 routing
  describe("Coaching Disputes", () => {
    const compassJs = fs.readFileSync(path.join(__dirname, "../server/public/js/compass.js"), "utf-8");
    const stylesCss = fs.readFileSync(path.join(__dirname, "../server/public/css/styles.css"), "utf-8");

    it("should not have border-bottom on kanban-column-header", () => {
      const headerBlock = stylesCss.match(/\.kanban-column-header\s*\{[^}]+\}/)?.[0] || "";
      expect(headerBlock).not.toContain("border-bottom");
    });

    it("should set status to 'QA Decision Rejected' for LV3→LV4 routing", () => {
      expect(compassJs).toContain("status: 'QA Decision Rejected'");
    });
  });

  // 3. Sandbox Review History: trail style
  describe("Sandbox Review History", () => {
    const sandboxJs = fs.readFileSync(path.join(__dirname, "../server/public/js/sandbox.js"), "utf-8");

    it("should render trail with timeline dots", () => {
      expect(sandboxJs).toContain("border-radius:50%");
      expect(sandboxJs).toContain("border-top:3px solid var(--sandbox-accent)");
    });

    it("should show 'No review activity' text when trail is empty", () => {
      expect(sandboxJs).toContain("No review activity yet");
    });
  });

  // 4. Regimen Detail Card
  describe("Regimen Detail Card", () => {
    const rosterJs = fs.readFileSync(path.join(__dirname, "../server/public/js/roster.js"), "utf-8");

    it("should set detail card title with employee name", () => {
      expect(rosterJs).toContain("title.textContent");
    });

    it("should have 'Related PG' instead of 'Complete PG'", () => {
      expect(rosterJs).toContain("'Related PG'");
      // Also renamed in table columns
      expect(rosterJs).not.toContain("'Complete PG'");
    });

    it("should have 'Go Live Date' instead of 'Live Date'", () => {
      expect(rosterJs).toContain("'Go Live Date'");
    });

    it("should have 'Assets & Logistics' section", () => {
      expect(rosterJs).toContain("'Assets & Logistics'");
    });

    it("should have 'Meta Onboarding Date' in Dates section", () => {
      expect(rosterJs).toContain("'Meta Onboarding Date'");
    });

    it("should have formatSrtId function for scientific notation", () => {
      expect(rosterJs).toContain("function formatSrtId");
    });

    it("should have editable fields (permission-driven via RBAC)", () => {
      expect(rosterJs).toContain("data-field");
      expect(rosterJs).toContain("regimen.edit_employee");
    });

    it("should have rosterSaveDetail function", () => {
      expect(rosterJs).toContain("rosterSaveDetail");
    });
  });

  // 5. Regimen Filter Bar
  describe("Regimen Filter Bar", () => {
    const stylesCss = fs.readFileSync(path.join(__dirname, "../server/public/css/styles.css"), "utf-8");

    it("should have omnibar-menu-footer with flex-start alignment", () => {
      const footerBlock = stylesCss.match(/\.omnibar-menu-footer\s*\{[^}]+\}/)?.[0] || "";
      expect(footerBlock).toContain("flex-start");
    });

    it("should have omnibar-menu with fixed width", () => {
      const menuBlock = stylesCss.match(/\.omnibar-menu\s*\{[^}]+\}/)?.[0] || "";
      expect(menuBlock).toContain("width: 520px");
    });
  });
});
