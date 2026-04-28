import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Batch 18 — Sandbox Overhaul: Inline Expansion, Role-Based Actions, Search/Filter, Admin Toggle, Agent Nav", () => {
  const sandboxJs = fs.readFileSync(
    path.join(__dirname, "public/js/sandbox.js"),
    "utf-8"
  );
  const appJs = fs.readFileSync(
    path.join(__dirname, "public/js/app.js"),
    "utf-8"
  );
  const indexHtml = fs.readFileSync(
    path.join(__dirname, "public/index.html"),
    "utf-8"
  );
  const sandboxCss = fs.readFileSync(
    path.join(__dirname, "public/css/sandbox-redesign.css"),
    "utf-8"
  );

  // 1. Inline Card Expansion in Review Area (replaces modal)
  describe("Review Area — Inline Card Expansion", () => {
    it("should track expanded card state with _reviewExpandedId", () => {
      expect(sandboxJs).toContain("_reviewExpandedId");
    });

    it("should have sandboxToggleKanbanCard function", () => {
      expect(sandboxJs).toContain("function sandboxToggleKanbanCard(");
    });

    it("should use side panel for review detail (refactored from inline expansion)", () => {
      expect(sandboxCss).toContain(".sandbox-side-panel");
      expect(sandboxCss).toContain(".sandbox-side-panel-inner");
      expect(sandboxCss).toContain(".sandbox-side-panel-body");
    });

    it("should redirect sandboxOpenDetail to inline expansion for review context", () => {
      expect(sandboxJs).toContain("sandboxToggleKanbanCard(insightId)");
    });
  });

  // 2. Role-Based Editability in Review Area
  describe("Review Area — Role-Based Action Buttons", () => {
    it("should gate initial review actions to Operational SME or admin", () => {
      expect(sandboxJs).toContain("Pending Initial Review");
      expect(sandboxJs).toContain("role === 'Operational SME'");
    });

    it("should gate final review actions to Trainer or admin", () => {
      expect(sandboxJs).toContain("Pending Final Review");
      expect(sandboxJs).toContain("role === 'Trainer'");
    });

    it("should check planning group match for action eligibility", () => {
      expect(sandboxJs).toContain("pgMatch");
    });
  });

  // 3. Inline Action Overlay (replaces modal for review actions)
  describe("Review Area — Inline Action Overlay", () => {
    it("should have sandboxShowInlineActionOverlay function", () => {
      expect(sandboxJs).toContain("function sandboxShowInlineActionOverlay(");
    });

    it("should have sandboxCloseInlineActionOverlay function", () => {
      expect(sandboxJs).toContain("function sandboxCloseInlineActionOverlay(");
    });

    it("should support accept, reject, final-approve, and trainer-status actions", () => {
      expect(sandboxJs).toContain("action === 'accept'");
      expect(sandboxJs).toContain("action === 'reject'");
      expect(sandboxJs).toContain("action === 'final-approve'");
      expect(sandboxJs).toContain("action === 'trainer-status'");
    });

    it("should have CSS for action overlay", () => {
      expect(sandboxCss).toContain(".sandbox-action-overlay");
      expect(sandboxCss).toContain(".sandbox-action-overlay-inner");
    });
  });

  // 4. Review Area Search & Planning Group Filter
  describe("Review Area — Search & PG Filter", () => {
    it("should track search state with _reviewSearch", () => {
      expect(sandboxJs).toContain("_reviewSearch");
    });

    it("should track PG filter state with _reviewPgFilter", () => {
      expect(sandboxJs).toContain("_reviewPgFilter");
    });

    it("should have sandboxReviewSearch function", () => {
      expect(sandboxJs).toContain("function sandboxReviewSearch(");
    });

    it("should have sandboxReviewPgFilter function", () => {
      expect(sandboxJs).toContain("function sandboxReviewPgFilter(");
    });

    it("should have sandboxRenderReviewToolbar function", () => {
      expect(sandboxJs).toContain("function sandboxRenderReviewToolbar(");
    });

    it("should have toolbar container in HTML", () => {
      expect(indexHtml).toContain('id="sandbox-review-toolbar"');
    });

    it("should have CSS for search bar and PG select", () => {
      expect(sandboxCss).toContain(".sandbox-review-search-bar");
      expect(sandboxCss).toContain(".sandbox-review-search-input");
      expect(sandboxCss).toContain(".sandbox-review-pg-select");
    });

    it("should filter by title, submitter, and insight ID", () => {
      expect(sandboxJs).toContain("title.includes(searchQ)");
      expect(sandboxJs).toContain("submitter.includes(searchQ)");
      expect(sandboxJs).toContain("insId.includes(searchQ)");
    });
  });

  // 5. All | My Team Toggle (admin only, Input Portal)
  describe("Input Portal — All | My Team Toggle", () => {
    it("should track toggle state with _inputTeamToggle", () => {
      expect(sandboxJs).toContain("_inputTeamToggle");
    });

    it("should have sandboxToggleTeamFilter function", () => {
      expect(sandboxJs).toContain("function sandboxToggleTeamFilter(");
    });

    it("should have sandboxRenderTeamToggle function", () => {
      expect(sandboxJs).toContain("function sandboxRenderTeamToggle(");
    });

    it("should have toggle container in HTML", () => {
      expect(indexHtml).toContain('id="sandbox-team-toggle"');
    });

    it("should have CSS for toggle buttons", () => {
      expect(sandboxCss).toContain(".sandbox-team-toggle");
      expect(sandboxCss).toContain(".sandbox-toggle-btn");
      expect(sandboxCss).toContain(".sandbox-toggle-btn.active");
    });

    it("should filter to admin's team when 'team' mode is active", () => {
      expect(sandboxJs).toContain("_inputTeamToggle === 'team'");
    });
  });

  // 6. Agent Nav Simplification for Sandbox
  describe("Agent Nav — Sandbox Flattening", () => {
    it("should flatten Sandbox nav for agents in app.js", () => {
      expect(appJs).toContain("nav-group-items-sandbox");
      expect(appJs).toContain("switchView('sandbox-input')");
    });

    it("should have Sandbox nav group elements in HTML", () => {
      expect(indexHtml).toContain('id="nav-group-sandbox"');
      expect(indexHtml).toContain('id="nav-group-items-sandbox"');
    });
  });

  // 7. Cache Version Bumps
  describe("Cache Version Bumps", () => {
    it("should have bumped sandbox.js version", () => {
      expect(indexHtml).toContain("sandbox.js?v=121");
    });

    it("should have bumped sandbox-redesign.css version", () => {
      expect(indexHtml).toContain("sandbox-redesign.css?v=107");
    });

    it("should have bumped app.js version", () => {
      expect(indexHtml).toContain("app.js?v=126");
    });
  });

  // 8. Input Portal read-only detail for agents
  describe("Input Portal — Read-Only Detail for Agents", () => {
    it("should render review trail in detail panel", () => {
      expect(sandboxJs).toContain("sandboxRenderReviewTrail");
    });

    it("should check isAgent for limited review history", () => {
      expect(sandboxJs).toContain("isAgent");
    });
  });

  // 9. Kanban page size = 10
  describe("Review Area — Page Size", () => {
    it("should have SANDBOX_KANBAN_PAGE_SIZE set to 10", () => {
      expect(sandboxJs).toContain("SANDBOX_KANBAN_PAGE_SIZE");
      const match = sandboxJs.match(/SANDBOX_KANBAN_PAGE_SIZE\s*=\s*(\d+)/);
      expect(match).not.toBeNull();
      expect(match![1]).toBe("10");
    });
  });

  // 10. Input Portal page size = 25
  describe("Input Portal — Page Size", () => {
    it("should have default pageSize of 25", () => {
      expect(sandboxJs).toContain("pageSize: 25");
    });
  });
});
