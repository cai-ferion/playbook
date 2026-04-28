import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

function readPublicJS(name: string) {
  return fs.readFileSync(path.join(__dirname, "public/js", name), "utf-8");
}
function readPublicHTML() {
  return fs.readFileSync(path.join(__dirname, "public/index.html"), "utf-8");
}

describe("Batch 40 — Helm Task Board: Tabbed Layout (Given / Received / Approvals)", () => {
  // ===== HTML Structure =====
  describe("HTML Structure", () => {
    it("has tabbed navigation for Tasks Given, Tasks Received, and Approvals", () => {
      const html = readPublicHTML();
      expect(html).toContain('helm-board-tab');
      expect(html).toContain('data-board-tab="given"');
      expect(html).toContain('data-board-tab="received"');
      expect(html).toContain('data-board-tab="approvals"');
    });

    it("has Tasks Given tab content panel", () => {
      const html = readPublicHTML();
      expect(html).toContain('id="helm-tab-tasks"');
    });

    it("has Tasks Received tab content panel", () => {
      const html = readPublicHTML();
      expect(html).toContain('id="helm-tab-received"');
    });

    it("has Tasks Received table elements", () => {
      const html = readPublicHTML();
      expect(html).toContain('id="helm-received-table"');
      expect(html).toContain('id="helm-received-table-head"');
      expect(html).toContain('id="helm-received-table-body"');
      expect(html).toContain('id="helm-received-pagination"');
    });

    it("Approvals tab content panel still exists", () => {
      const html = readPublicHTML();
      expect(html).toContain('id="helm-tab-approvals"');
    });

    it("has page-level filters outside the tabs", () => {
      const html = readPublicHTML();
      expect(html).toContain('id="helm-filter-status"');
      expect(html).toContain('id="helm-search"');
    });
  });

  // ===== JavaScript Logic =====
  describe("JavaScript Logic", () => {
    it("HELM state has filteredReceived and receivedPage", () => {
      const helmJs = readPublicJS("helm.js");
      expect(helmJs).toContain("filteredReceived: []");
      expect(helmJs).toContain("receivedPage: 1");
    });

    it("helmApplyFilters filters by assigned_by_ohr (Tasks Given) with trim", () => {
      const helmJs = readPublicJS("helm.js");
      expect(helmJs).toContain("assigned_by_ohr");
      const givenSection = helmJs.substring(
        helmJs.indexOf("function helmApplyFilters()"),
        helmJs.indexOf("// ===== Table Rendering")
      );
      expect(givenSection).toContain(".trim()");
      expect(givenSection).toContain("singleTasks = [];");
    });

    it("helmApplyReceivedFilters function exists and filters by assigned_to_ohr with trim and filter(Boolean)", () => {
      const helmJs = readPublicJS("helm.js");
      expect(helmJs).toContain("function helmApplyReceivedFilters()");
      const receivedFilterSection = helmJs.substring(
        helmJs.indexOf("function helmApplyReceivedFilters()"),
        helmJs.indexOf("function helmRenderReceivedTable()")
      );
      expect(receivedFilterSection).toContain("split(',')");
      expect(receivedFilterSection).toContain(".trim()");
      expect(receivedFilterSection).toContain("filter(Boolean)");
      expect(receivedFilterSection).toContain("data = [];");
    });

    it("helmRenderReceivedTable function exists with correct columns", () => {
      const helmJs = readPublicJS("helm.js");
      expect(helmJs).toContain("function helmRenderReceivedTable()");
      expect(helmJs).toContain("helm-received-table-head");
      expect(helmJs).toContain("helm-received-table-body");
    });

    it("helmRenderReceivedPagination function exists", () => {
      const helmJs = readPublicJS("helm.js");
      expect(helmJs).toContain("function helmRenderReceivedPagination()");
      expect(helmJs).toContain("helm-received-pagination");
      expect(helmJs).toContain("HELM.receivedPage");
    });

    it("helmSwitchBoardTab function exists for tab switching", () => {
      const helmJs = readPublicJS("helm.js");
      expect(helmJs).toContain("function helmSwitchBoardTab(");
    });

    it("helmFetchTasks calls filter functions after fetch", () => {
      const helmJs = readPublicJS("helm.js");
      expect(helmJs).toContain("helmApplyReceivedFilters()");
    });

    it("Tasks Given table still shows Assigned To column", () => {
      const helmJs = readPublicJS("helm.js");
      const renderTableSection = helmJs.substring(
        helmJs.indexOf("function helmRenderTable()"),
        helmJs.indexOf("function helmRenderPagination()")
      );
      expect(renderTableSection).toContain("<th>Assigned To</th>");
    });
  });
});
