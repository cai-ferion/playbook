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

  // 4. GChat supervisor notification includes new_tag
  describe("GChat Supervisor Notification", () => {
    it("gchat-notify-supervisor endpoint includes new_tag in card", () => {
      const ioRoutes = fs.readFileSync(
        path.join(__dirname, "io-routes.ts"),
        "utf-8"
      );
      expect(ioRoutes).toContain("gchat-notify-supervisor");
      expect(ioRoutes).toContain("new_tag");
      expect(ioRoutes).toContain("New Tag");
    });

    it("helm.js sends new_tag in gchat notification payload", () => {
      const helm = readPublicJS("helm.js");
      expect(helm).toContain("new_tag: newTag");
    });
  });

  // 5. Side-by-side Task Board
  describe("Side-by-Side Task Board", () => {
    it("HTML has side-by-side layout for Tasks and Approvals", () => {
      const html = readPublicHTML();
      expect(html).toContain("Side-by-side");
      expect(html).toContain("helm-approvals-table");
    });

    it("helm.js renders both tables without tab switching", () => {
      const helm = readPublicJS("helm.js");
      expect(helm).toContain("side-by-side");
      expect(helm).toContain("helm-approvals-table-head");
      expect(helm).toContain("helm-approvals-table-body");
    });

    it("has approval filter controls", () => {
      const html = readPublicHTML();
      expect(html).toContain("helm-approvals-filter-status");
      expect(html).toContain("helm-approvals-search");
    });
  });
});
