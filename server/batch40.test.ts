import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

function readPublicJS(name: string) {
  return fs.readFileSync(path.join(__dirname, "public/js", name), "utf-8");
}
function readPublicHTML() {
  return fs.readFileSync(path.join(__dirname, "public/index.html"), "utf-8");
}

describe("Batch 40 — Helm Task Board: Tasks Given / Tasks Received / Approvals", () => {
  // ===== HTML Structure =====
  describe("HTML Structure", () => {
    it("has three-column grid layout for Tasks Given, Tasks Received, and Approvals", () => {
      const html = readPublicHTML();
      expect(html).toContain("grid-template-columns:1fr 1fr 1fr");
    });

    it("has Tasks Given panel with correct heading", () => {
      const html = readPublicHTML();
      expect(html).toContain("Tasks Given</h3>");
      expect(html).toContain('id="helm-tab-tasks"');
    });

    it("has Tasks Received panel with correct heading", () => {
      const html = readPublicHTML();
      expect(html).toContain("Tasks Received</h3>");
      expect(html).toContain('id="helm-tab-received"');
    });

    it("has Tasks Received filter controls", () => {
      const html = readPublicHTML();
      expect(html).toContain('id="helm-received-filter-status"');
      expect(html).toContain('id="helm-received-search"');
      expect(html).toContain("helmApplyReceivedFilters()");
    });

    it("has Tasks Received table elements", () => {
      const html = readPublicHTML();
      expect(html).toContain('id="helm-received-table"');
      expect(html).toContain('id="helm-received-table-head"');
      expect(html).toContain('id="helm-received-table-body"');
      expect(html).toContain('id="helm-received-pagination"');
    });

    it("Approvals panel still exists", () => {
      const html = readPublicHTML();
      expect(html).toContain("Approvals</h3>");
      expect(html).toContain('id="helm-tab-approvals"');
    });
  });

  // ===== JavaScript Logic =====
  describe("JavaScript Logic", () => {
    it("HELM state has filteredReceived and receivedPage", () => {
      const helmJs = readPublicJS("helm.js");
      expect(helmJs).toContain("filteredReceived: []");
      expect(helmJs).toContain("receivedPage: 1");
    });

    it("helmApplyFilters filters by assigned_by_ohr (Tasks Given)", () => {
      const helmJs = readPublicJS("helm.js");
      expect(helmJs).toContain("assigned_by_ohr");
      // Should filter tasks where current user is the creator
      expect(helmJs).toMatch(/data\s*=\s*data\.filter\(t\s*=>\s*\(t\.assigned_by_ohr/);
    });

    it("helmApplyReceivedFilters function exists and filters by assigned_to_ohr", () => {
      const helmJs = readPublicJS("helm.js");
      expect(helmJs).toContain("function helmApplyReceivedFilters()");
      expect(helmJs).toContain("assigned_to_ohr");
      // Should split comma-separated OHRs and check for current user
      expect(helmJs).toContain("split(',')");
    });

    it("helmRenderReceivedTable function exists with 4 columns (no Assigned By)", () => {
      const helmJs = readPublicJS("helm.js");
      expect(helmJs).toContain("function helmRenderReceivedTable()");
      expect(helmJs).toContain("helm-received-table-head");
      expect(helmJs).toContain("helm-received-table-body");
      // Tasks Received should NOT have Assigned By column
      const receivedSection = helmJs.substring(
        helmJs.indexOf("function helmRenderReceivedTable()"),
        helmJs.indexOf("function helmRenderReceivedPagination()")
      );
      expect(receivedSection).not.toContain("<th>Assigned By</th>");
      expect(receivedSection).toContain("<th>Task ID</th>");
      expect(receivedSection).toContain("<th>Title</th>");
      expect(receivedSection).toContain("<th>Status</th>");
      expect(receivedSection).toContain("<th>Due Date</th>");
      // colspan should be 4 not 5
      expect(receivedSection).toContain('colspan="4"');
    });

    it("helmRenderReceivedPagination function exists", () => {
      const helmJs = readPublicJS("helm.js");
      expect(helmJs).toContain("function helmRenderReceivedPagination()");
      expect(helmJs).toContain("helm-received-pagination");
      expect(helmJs).toContain("HELM.receivedPage");
    });

    it("initHelm calls helmApplyReceivedFilters", () => {
      const helmJs = readPublicJS("helm.js");
      // initHelm should call all three filter functions
      expect(helmJs).toContain("helmApplyReceivedFilters()");
    });

    it("helmFetchTasks calls helmApplyReceivedFilters after fetch", () => {
      const helmJs = readPublicJS("helm.js");
      // After fetching tasks, both filters should be applied
      const fetchSection = helmJs.substring(
        helmJs.indexOf("async function helmFetchTasks()"),
        helmJs.indexOf("async function helmFetchEmployees()")
      );
      expect(fetchSection).toContain("helmApplyFilters()");
      expect(fetchSection).toContain("helmApplyReceivedFilters()");
    });

    it("Tasks Given table still shows Assigned To column", () => {
      const helmJs = readPublicJS("helm.js");
      // helmRenderTable (Tasks Given) should show "Assigned To"
      const renderTableSection = helmJs.substring(
        helmJs.indexOf("function helmRenderTable()"),
        helmJs.indexOf("function helmRenderPagination()")
      );
      expect(renderTableSection).toContain("<th>Assigned To</th>");
    });
  });
});
