import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

describe("Sidebar Notification System", () => {
  describe("HTML Structure", () => {
    const html = fs.readFileSync(
      path.join(__dirname, "public/index.html"),
      "utf-8"
    );

    it("should have sidebar mode toggle buttons", () => {
      expect(html).toContain("sidebar-mode-toggle");
      expect(html).toContain("sidebar-toggle-nav");
      expect(html).toContain("sidebar-toggle-notif");
    });

    it("should have Menu and Alerts toggle labels", () => {
      expect(html).toContain("Menu");
      expect(html).toContain("Alerts");
    });

    it("should have sidebar notification panel", () => {
      expect(html).toContain("sidebar-notif-panel");
      expect(html).toContain("sidebar-notif-list");
    });

    it("should have sidebar notification badge", () => {
      expect(html).toContain("sidebar-notif-badge");
    });

    it("should have mark all read and clear all buttons in sidebar panel", () => {
      expect(html).toContain("markAllNotificationsRead()");
      expect(html).toContain("clearAllNotifications()");
    });

    it("should NOT have old notification bell dropdown", () => {
      expect(html).not.toContain('id="notif-bell"');
      expect(html).not.toContain('id="notif-panel"');
      expect(html).not.toContain('id="notif-badge"');
      expect(html).not.toContain("toggleNotifPanel()");
    });
  });

  describe("CSS Styles", () => {
    const css = fs.readFileSync(
      path.join(__dirname, "public/css/styles.css"),
      "utf-8"
    );

    it("should have sidebar toggle styles", () => {
      expect(css).toContain(".sidebar-mode-toggle");
      expect(css).toContain(".sidebar-toggle-btn");
      expect(css).toContain(".sidebar-toggle-btn.active");
    });

    it("should have sidebar notification panel styles", () => {
      expect(css).toContain(".sidebar-notif-panel");
      expect(css).toContain(".sidebar-notif-list");
      expect(css).toContain(".sidebar-notif-header");
    });

    it("should have sidebar notification badge styles", () => {
      expect(css).toContain(".sidebar-notif-badge");
    });
  });

  describe("Notifications JS", () => {
    const notifJs = fs.readFileSync(
      path.join(__dirname, "public/js/notifications.js"),
      "utf-8"
    );

    it("should have setSidebarMode function", () => {
      expect(notifJs).toContain("function setSidebarMode(mode)");
    });

    it("should toggle between nav and notifications modes", () => {
      expect(notifJs).toContain("sidebar-notif-panel");
      expect(notifJs).toContain(".sidebar-nav");
    });

    it("should have renderSidebarNotifBadge function", () => {
      expect(notifJs).toContain("function renderSidebarNotifBadge()");
    });

    it("should have renderSidebarNotifList function", () => {
      expect(notifJs).toContain("function renderSidebarNotifList()");
    });

    it("should filter out maintenance flag notifications", () => {
      expect(notifJs).toContain("system_maintenance");
      expect(notifJs).toContain("MAINTENANCE_FLAG");
    });

    it("should filter notifications by target_ohr for current user", () => {
      expect(notifJs).toContain("target_ohr");
      expect(notifJs).toContain("userOhr");
    });

    it("should have notification type icons for UPL/LATE/task/daily", () => {
      expect(notifJs).toContain("upl_notice");
      expect(notifJs).toContain("late_notice");
      expect(notifJs).toContain("task_assigned");
      expect(notifJs).toContain("daily_summary");
    });

    it("should NOT have old dropdown panel references", () => {
      expect(notifJs).not.toContain("toggleNotifPanel");
      expect(notifJs).not.toContain("closeNotifOnOutsideClick");
      expect(notifJs).not.toContain("notif-panel-open");
    });

    it("should use object-based createNotification signature", () => {
      expect(notifJs).toContain("async function createNotification({ type, title, message");
    });

    it("should have initNotifications function", () => {
      expect(notifJs).toContain("function initNotifications()");
    });
  });

  describe("No Email Code Remaining", () => {
    it("should not have Resend or Brevo in io-routes.ts", () => {
      const ioRoutes = [__dirname + "/io/shared.ts", __dirname + "/io/attendance-ops.ts", __dirname + "/io/attendance.ts", __dirname + "/io/audit-log.ts", __dirname + "/io/billing.ts", __dirname + "/io/coaching.ts", __dirname + "/io/corrective-actions.ts", __dirname + "/io/employees.ts", __dirname + "/io/insights.ts", __dirname + "/io/leaves.ts", __dirname + "/io/notifications.ts", __dirname + "/io/permissions.ts", __dirname + "/io/tasks.ts", __dirname + "/io/wfm.ts", __dirname + "/io/tardiness.ts", __dirname + "/io/role-change.ts", __dirname + "/io/managers-nook.ts", __dirname + "/io/group-tasks.ts", __dirname + "/io/shift-extensions.ts", __dirname + "/io/performance.ts"].map(f => require("fs").readFileSync(f, "utf-8")).join("\n");
      expect(ioRoutes).not.toContain("Resend");
      expect(ioRoutes).not.toContain("brevo");
      expect(ioRoutes).not.toContain("webhook");
    });

    it("should not have Resend or Brevo in auto-mailer.ts", () => {
      const autoMailer = fs.readFileSync(
        path.join(__dirname, "auto-mailer.ts"),
        "utf-8"
      );
      expect(autoMailer).not.toContain("Resend");
      expect(autoMailer).not.toContain("brevo");
      expect(autoMailer).not.toContain("resend");
    });

    it("should not have email packages in package.json", () => {
      const pkg = fs.readFileSync(
        path.join(__dirname, "../package.json"),
        "utf-8"
      );
      expect(pkg).not.toContain("resend");
      expect(pkg).not.toContain("@getbrevo");
    });
  });

  describe("createNotification calls use object syntax", () => {
    const files = ["compass.js", "haven.js", "roster.js", "sandbox.js", "helm.js", "app.js"];

    for (const file of files) {
      it(`${file} should not have old positional-arg createNotification calls`, () => {
        const content = fs.readFileSync(
          path.join(__dirname, `public/js/${file}`),
          "utf-8"
        );
        // Old pattern: createNotification('type', 'title', ...)
        const oldPattern = /createNotification\('[^{]/;
        expect(content).not.toMatch(oldPattern);
      });
    }
  });
});
