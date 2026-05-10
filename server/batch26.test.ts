import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Batch 26 — Revisions", () => {
  // 1. Default sidebar to Alerts tab
  describe("Default Sidebar to Alerts Tab", () => {
    it("should set sidebar mode to notifications on init", () => {
      const notifJs = fs.readFileSync(
        path.join(__dirname, "public/js/notifications.js"),
        "utf-8"
      );
      // initNotifications should call setSidebarMode('notifications')
      expect(notifJs).toContain("setSidebarMode('notifications')");
    });
  });

  // 2. Audit trail actor tracking
  describe("Audit Trail Actor Tracking", () => {
    it("should send x-actor-ohr and x-actor-name headers from saveRecords", () => {
      const dataJs = fs.readFileSync(
        path.join(__dirname, "public/js/data.js"),
        "utf-8"
      );
      expect(dataJs).toContain("x-actor-ohr");
      expect(dataJs).toContain("x-actor-name");
    });

    it("should include is_locked in the audit field map", () => {
      const ioRoutes = [__dirname + "/io/shared.ts", __dirname + "/io/attendance-ops.ts", __dirname + "/io/attendance.ts", __dirname + "/io/audit-log.ts", __dirname + "/io/billing.ts", __dirname + "/io/coaching.ts", __dirname + "/io/corrective-actions.ts", __dirname + "/io/employees.ts", __dirname + "/io/insights.ts", __dirname + "/io/leaves.ts", __dirname + "/io/notifications.ts", __dirname + "/io/permissions.ts", __dirname + "/io/tasks.ts", __dirname + "/io/wfm.ts", __dirname + "/io/tardiness.ts", __dirname + "/io/role-change.ts", __dirname + "/io/managers-nook.ts", __dirname + "/io/group-tasks.ts", __dirname + "/io/shift-extensions.ts", __dirname + "/io/performance.ts"].map(f => require("fs").readFileSync(f, "utf-8")).join("\n");
      expect(ioRoutes).toContain("is_locked");
    });
  });

  // 3. Helm Task Board cleanup
  describe("Helm Task Board Cleanup", () => {
    it("should have full-width Assign To field in New Task form", () => {
      const helmJs = fs.readFileSync(
        path.join(__dirname, "public/js/helm.js"),
        "utf-8"
      );
      // The searchable-select wrapper should be full width
      expect(helmJs).toContain('style="width:100%;"');
    });

    it("should not have stats bars in HTML", () => {
      const html = fs.readFileSync(
        path.join(__dirname, "public/index.html"),
        "utf-8"
      );
      // Stats bars should be removed
      expect(html).not.toContain('id="helm-stats"');
      expect(html).not.toContain('id="helm-approvals-stats"');
    });
  });

  // 4. Billing Compliance V3 — server-driven dashboard
  describe("Billing Compliance V3 Dashboard", () => {
    it("[V3] should fetch from server-side billing-compliance API", () => {
      const billingJs = fs.readFileSync(
        path.join(__dirname, "public/js/billing.js"),
        "utf-8"
      );
      expect(billingJs).toContain("/billing-compliance?week_ending=");
      expect(billingJs).toContain("/billing-compliance/weeks");
    });

    it("[V3] should have KPI cards in HTML", () => {
      const html = fs.readFileSync(
        path.join(__dirname, "public/index.html"),
        "utf-8"
      );
      expect(html).toContain('id="billing-kpi-cards"');
      expect(html).toContain('id="kpi-compliance"');
    });

    it("[V3] should render traffic-light compliance table", () => {
      const billingJs = fs.readFileSync(
        path.join(__dirname, "public/js/billing.js"),
        "utf-8"
      );
      expect(billingJs).toContain("renderBillingComplianceTable");
      expect(billingJs).toContain("bc-badge");
      expect(billingJs).toContain("bc-progress-fill");
    });
  });

  // 5. Asset Inventory widget on Dashboard
  describe("Dashboard Asset Inventory Widget", () => {
    it("should have asset-inventory-widget element in HTML", () => {
      const html = fs.readFileSync(
        path.join(__dirname, "public/index.html"),
        "utf-8"
      );
      expect(html).toContain("asset-inventory-widget");
    });

    it("should have renderAssetInventory function in app.js", () => {
      const appJs = fs.readFileSync(
        path.join(__dirname, "public/js/app.js"),
        "utf-8"
      );
      expect(appJs).toContain("renderAssetInventory");
    });
  });

  // 6. Anchor nav reorder
  describe("Anchor Nav Reorder", () => {
    it("should have Risk Intelligence before Dashboard in nav", () => {
      const html = fs.readFileSync(
        path.join(__dirname, "public/index.html"),
        "utf-8"
      );
      const riskIdx = html.indexOf('id="nav-alerts"');
      const dashIdx = html.indexOf('id="nav-dashboard"');
      const billingIdx = html.indexOf('id="nav-billing"');
      const inputIdx = html.indexOf('data-view="input"');
      expect(riskIdx).toBeLessThan(dashIdx);
      expect(dashIdx).toBeLessThan(billingIdx);
      expect(billingIdx).toBeLessThan(inputIdx);
    });
  });

  // 7. GChat UPL/LATE card redesign — GChat removed in Batch 139, in-app notifications remain
  describe("UPL/LATE Notification Content (GChat removed)", () => {
    it("should NOT have buildUplLateGchatCard function in auto-mailer (removed Batch 139)", () => {
      const autoMailer = fs.readFileSync(
        path.join(__dirname, "auto-mailer.ts"),
        "utf-8"
      );
      expect(autoMailer).not.toContain("buildUplLateGchatCard");
    });

    it("should include the correct Action Required text in in-app notifications", () => {
      const autoMailer = fs.readFileSync(
        path.join(__dirname, "auto-mailer.ts"),
        "utf-8"
      );
      expect(autoMailer).toContain("Please coordinate with your supervisor");
      expect(autoMailer).toContain("you may request for your supervisor to change this");
    });

    it("should not have sendDailySummaryNotification", () => {
      const autoMailer = fs.readFileSync(
        path.join(__dirname, "auto-mailer.ts"),
        "utf-8"
      );
      expect(autoMailer).not.toContain("sendDailySummaryNotification");
    });

    it("should NOT have GChat queue references (removed Batch 139)", () => {
      const autoMailer = fs.readFileSync(
        path.join(__dirname, "auto-mailer.ts"),
        "utf-8"
      );
      expect(autoMailer).not.toContain("ioGchatQueue");
      expect(autoMailer).not.toContain("gchatQueued");
    });
  });

  // 8. New Tag dropdown uses Input Portal tags only
  describe("New Tag Dropdown Limited to Input Portal Tags", () => {
    it("should use PORTAL_TAGS (from TAG_OPTIONS) instead of ALL_TAGS", () => {
      const helmJs = fs.readFileSync(
        path.join(__dirname, "public/js/helm.js"),
        "utf-8"
      );
      expect(helmJs).toContain("PORTAL_TAGS");
      expect(helmJs).toContain("TAG_OPTIONS");
      expect(helmJs).not.toContain("ALL_TAGS");
    });
  });

  // 9. Default page is Risk Intelligence
  describe("Default Page is Risk Intelligence", () => {
    it("should switch to alerts view on login for non-agents", () => {
      const appJs = fs.readFileSync(
        path.join(__dirname, "public/js/app.js"),
        "utf-8"
      );
      // Should have switchView('alerts', ...) as default for non-agents (suppressExpand added)
      expect(appJs).toContain("switchView('alerts'");
    });
  });
});
