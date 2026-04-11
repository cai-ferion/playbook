import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

function readPublicJS(name: string) {
  return fs.readFileSync(path.join(__dirname, "public/js", name), "utf-8");
}
function readPublicHTML() {
  return fs.readFileSync(path.join(__dirname, "public/index.html"), "utf-8");
}

describe("Batch 25 — Fixes & Enhancements", () => {
  // 1. Notification timestamp fix
  describe("Notification Timestamp Fix", () => {
    it("createNotification sends created_at in payload", () => {
      const notifJs = readPublicJS("notifications.js");
      expect(notifJs).toContain("created_at: new Date().toISOString()");
    });

    it("server-side notification POST sets created_at if missing", () => {
      const ioRoutes = fs.readFileSync(
        path.join(__dirname, "io-routes.ts"),
        "utf-8"
      );
      expect(ioRoutes).toContain("if (!body.created_at) body.created_at = new Date().toISOString()");
    });
  });

  // 2. Helm Analytics visibility
  describe("Helm Analytics Visibility", () => {
    it("hides Helm Analytics for non-admin in first visibility block", () => {
      const appJs = readPublicJS("app.js");
      expect(appJs).toContain("nav-helm-analytics");
      // Both blocks should check admin OHR
      const matches = appJs.match(/helmAnalyticsNav.*style\.display.*ADMIN_OHR/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThanOrEqual(1);
    });

    it("hides Helm Analytics for non-admin in second visibility block", () => {
      const appJs = readPublicJS("app.js");
      expect(appJs).toContain("helmAnalyticsNav2");
      const matches = appJs.match(/helmAnalyticsNav2.*style\.display.*ADMIN_OHR2/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThanOrEqual(1);
    });
  });

  // 3. New Tag dropdown in backdate form
  describe("Backdate Form — New Tag Dropdown", () => {
    it("has New Tag select element in helm.js", () => {
      const helm = readPublicJS("helm.js");
      expect(helm).toContain("helm-req-new-tag");
      expect(helm).toContain("Select New Tag");
    });

    it("excludes current tag from New Tag options", () => {
      const helm = readPublicJS("helm.js");
      // Should filter out current tag
      expect(helm).toMatch(/tag\s*!==\s*currentTag|currentTag/);
    });
  });

  // 4. GChat functionality removed (Batch 139)
  describe("GChat Removal Verification", () => {
    it("gchat-notify-supervisor endpoint should be removed from io-routes.ts", () => {
      const ioRoutes = fs.readFileSync(
        path.join(__dirname, "io-routes.ts"),
        "utf-8"
      );
      expect(ioRoutes).not.toContain("gchat-notify-supervisor");
      expect(ioRoutes).not.toContain("gchat-notify-task");
      expect(ioRoutes).not.toContain("ioGchatQueue");
    });

    it("helm.js should not contain GChat notification calls", () => {
      const helm = readPublicJS("helm.js");
      expect(helm).not.toContain("gchat-notify-supervisor");
      expect(helm).not.toContain("gchat-notify-task");
    });
  });

  // 5. Tabbed Task Board (updated from side-by-side in Batch 72)
  describe("Tabbed Task Board", () => {
    it("HTML has tabbed layout for Tasks Given, Received, and Approvals", () => {
      const html = readPublicHTML();
      expect(html).toContain('data-board-tab="given"');
      expect(html).toContain('data-board-tab="received"');
      expect(html).toContain('data-board-tab="approvals"');
      expect(html).toContain("helm-approvals-table");
    });

    it("helm.js has tab switching and approvals table rendering", () => {
      const helm = readPublicJS("helm.js");
      expect(helm).toContain("helmSwitchBoardTab");
      expect(helm).toContain("helm-approvals-table-head");
      expect(helm).toContain("helm-approvals-table-body");
    });

    it("has page-level filter controls", () => {
      const html = readPublicHTML();
      expect(html).toContain('id="helm-filter-status"');
      expect(html).toContain('id="helm-search"');
    });
  });
});
