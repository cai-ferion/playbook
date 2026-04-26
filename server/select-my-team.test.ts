import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const compassJsPath = path.join(__dirname, "public/js/compass.js");
const compassJs = fs.readFileSync(compassJsPath, "utf-8");

const indexHtmlPath = path.join(__dirname, "public/index.html");
const indexHtml = fs.readFileSync(indexHtmlPath, "utf-8");

// ============================================================
// Select My Team — Group Coaching Multi-Coachee Picker
// ============================================================

describe("Select My Team Feature", () => {

  // ---- UI Button ----
  describe("UI Button", () => {
    it("has a 'My Team' button in the multi-coachee dropdown header", () => {
      expect(compassJs).toContain('id="compass-select-my-team-btn"');
    });

    it("button calls compassSelectMyTeam() on click", () => {
      expect(compassJs).toContain('onclick="compassSelectMyTeam()"');
    });

    it("button is hidden by default (display:none)", () => {
      // The button starts hidden and is shown by _compassUpdateSelectMyTeamBtn
      const btnIdx = compassJs.indexOf('id="compass-select-my-team-btn"');
      const btnSection = compassJs.slice(btnIdx, btnIdx + 300);
      expect(btnSection).toContain("display:none");
    });

    it("button has team icon emoji", () => {
      const btnIdx = compassJs.indexOf('id="compass-select-my-team-btn"');
      const btnSection = compassJs.slice(btnIdx, btnIdx + 500);
      expect(btnSection).toContain("👥");
    });
  });

  // ---- compassSelectMyTeam Function ----
  describe("compassSelectMyTeam Function", () => {
    it("function exists", () => {
      expect(compassJs).toContain("function compassSelectMyTeam()");
    });

    const funcIdx = compassJs.indexOf("function compassSelectMyTeam()");
    const funcSection = compassJs.slice(funcIdx, funcIdx + 2500);

    it("guards against missing currentUser", () => {
      expect(funcSection).toContain("if (!currentUser || !COMPASS.employees) return");
    });

    it("builds team OHRs by matching supervisor_name to currentUser.full_name", () => {
      expect(funcSection).toContain("e.supervisor_name === myName");
    });

    it("excludes self from team selection", () => {
      expect(funcSection).toContain("e.ohr_id !== currentUser.ohr_id");
    });

    it("shows warning toast when no direct reports found", () => {
      expect(funcSection).toContain("No direct reports found under your name");
      expect(funcSection).toContain("showToast(");
    });

    it("preserves existing checked state before re-rendering", () => {
      expect(funcSection).toContain("existingChecked");
      expect(funcSection).toContain('input[type="checkbox"]:checked');
    });

    it("merges existing selections with team selections", () => {
      expect(funcSection).toContain("allChecked");
      expect(funcSection).toContain("...existingChecked");
      expect(funcSection).toContain("...teamOhrs");
    });

    it("prioritizes team members in the rendered list to bypass 50-item cap", () => {
      expect(funcSection).toContain("teamEmps");
      expect(funcSection).toContain("nonTeamEmps");
    });

    it("re-renders the options container with checked team members", () => {
      expect(funcSection).toContain("container.innerHTML");
      expect(funcSection).toContain("allChecked.has(e.ohr_id)");
    });

    it("calls compassUpdateMultiCoacheeDisplay after selection", () => {
      expect(funcSection).toContain("compassUpdateMultiCoacheeDisplay()");
    });

    it("shows success toast with team count", () => {
      expect(funcSection).toContain("team member");
      expect(funcSection).toContain("'success'");
    });
  });

  // ---- Visibility Logic ----
  describe("_compassUpdateSelectMyTeamBtn Visibility", () => {
    it("function exists", () => {
      expect(compassJs).toContain("function _compassUpdateSelectMyTeamBtn()");
    });

    const visIdx = compassJs.indexOf("function _compassUpdateSelectMyTeamBtn()");
    const visSection = compassJs.slice(visIdx, visIdx + 600);

    it("finds the button by ID", () => {
      expect(visSection).toContain("compass-select-my-team-btn");
    });

    it("hides button when no currentUser or employees", () => {
      expect(visSection).toContain("btn.style.display = 'none'");
    });

    it("checks for direct reports using supervisor_name match", () => {
      expect(visSection).toContain("e.supervisor_name === myName");
    });

    it("shows button when user has direct reports", () => {
      expect(visSection).toContain("hasReports ? '' : 'none'");
    });
  });

  // ---- Integration with Dropdown Toggle ----
  describe("Integration", () => {
    it("calls _compassUpdateSelectMyTeamBtn when dropdown opens", () => {
      const toggleIdx = compassJs.indexOf("function compassToggleCoacheeMulti()");
      const toggleSection = compassJs.slice(toggleIdx, toggleIdx + 500);
      expect(toggleSection).toContain("_compassUpdateSelectMyTeamBtn()");
    });
  });

  // ---- Cache Version ----
  describe("Cache Version", () => {
    it("compass.js bumped to v123", () => {
      expect(indexHtml).toContain("compass.js?v=123");
    });
  });
});
