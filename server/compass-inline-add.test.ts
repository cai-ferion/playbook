/**
 * Compass Inline Add Panel — Test Suite
 * Verifies the inline panel HTML structure, JS functions, and CSS exist correctly.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const indexHtml = fs.readFileSync(
  path.resolve(__dirname, "public/index.html"),
  "utf-8"
);
const compassJs = fs.readFileSync(
  path.resolve(__dirname, "public/js/compass.js"),
  "utf-8"
);
const compassCss = fs.readFileSync(
  path.resolve(__dirname, "public/css/compass-redesign.css"),
  "utf-8"
);

// ═══════════════════════════════════════════════════════════════════════
// 1. HTML Structure — Inline Panel Container
// ═══════════════════════════════════════════════════════════════════════
describe("Inline Add Panel HTML Structure", () => {
  it("should have the inline add panel container", () => {
    expect(indexHtml).toContain('id="compass-inline-add"');
  });

  it("should have the type chips container", () => {
    expect(indexHtml).toContain('id="compass-inline-add-types"');
  });

  it("should have the inline form body container", () => {
    expect(indexHtml).toContain('id="compass-inline-add-form"');
  });

  it("should have the inline footer container", () => {
    expect(indexHtml).toContain('id="compass-inline-add-footer"');
  });

  it("should have the collapse button rendered by JS in the type chips row", () => {
    // Collapse button is now injected by compassShowInlineAdd() into the types container
    expect(compassJs).toContain("compassCollapseInlineAdd()");
  });

  it("should be positioned between filter bar and dual tables", () => {
    const filterBarIdx = indexHtml.indexOf('id="compass-filter-bar"');
    const inlinePanelIdx = indexHtml.indexOf('id="compass-inline-add"');
    const dualTablesIdx = indexHtml.indexOf('id="compass-dual-tables"');
    expect(filterBarIdx).toBeLessThan(inlinePanelIdx);
    expect(inlinePanelIdx).toBeLessThan(dualTablesIdx);
  });

  it("should be hidden by default", () => {
    // The inline panel should have display:none initially
    const panelLine = indexHtml.slice(
      indexHtml.indexOf('id="compass-inline-add"') - 100,
      indexHtml.indexOf('id="compass-inline-add"') + 50
    );
    expect(panelLine).toContain("display:none");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. JavaScript Functions — Inline Panel Logic
// ═══════════════════════════════════════════════════════════════════════
describe("Inline Add Panel JavaScript Functions", () => {
  it("should define compassToggleAddMenu that targets inline panel", () => {
    expect(compassJs).toContain("function compassToggleAddMenu()");
    // Should reference the inline panel, not the old dropdown menu
    expect(compassJs).toContain("compass-inline-add");
  });

  it("should define _compassGetAllowedTypes for role-based filtering", () => {
    expect(compassJs).toContain("function _compassGetAllowedTypes()");
  });

  it("should define compassInlineSelectType for chip selection", () => {
    expect(compassJs).toContain("function compassInlineSelectType(type)");
  });

  it("should define compassCollapseInlineAdd for manual collapse", () => {
    expect(compassJs).toContain("function compassCollapseInlineAdd()");
  });

  it("should define compassShowNewFormInline targeting inline containers", () => {
    expect(compassJs).toContain("function compassShowNewFormInline(preselectedType)");
    expect(compassJs).toContain("compass-inline-add-form");
    expect(compassJs).toContain("compass-inline-add-footer");
  });

  it("should define _compassResetFormFieldsForNext for consecutive entries", () => {
    expect(compassJs).toContain("function _compassResetFormFieldsForNext()");
  });

  it("should define _compassShowInlineSuccessMsg for success feedback", () => {
    expect(compassJs).toContain("function _compassShowInlineSuccessMsg(msg)");
  });

  it("should render type chips with correct CSS class", () => {
    expect(compassJs).toContain("compass-type-chip");
    expect(compassJs).toContain("compass-type-chip-icon");
    expect(compassJs).toContain("compass-type-chip-label");
  });

  it("should render compact chips without description text", () => {
    // The chip template should NOT contain the desc div (compact mode)
    const chipTemplate = compassJs.slice(
      compassJs.indexOf('typesContainer.innerHTML'),
      compassJs.indexOf('.join(\'\')') + 20
    );
    expect(chipTemplate).not.toContain('compass-type-chip-desc');
  });

  it("should have all 7 coaching types in _compassGetAllowedTypes", () => {
    const fnStart = compassJs.indexOf("function _compassGetAllowedTypes()");
    const fnBlock = compassJs.slice(fnStart, fnStart + 1000);
    expect(fnBlock).toContain("General Coaching");
    expect(fnBlock).toContain("Follow-Up Session");
    expect(fnBlock).toContain("Group Coaching");
    expect(fnBlock).toContain("Triad Coaching");
    expect(fnBlock).toContain("QA Feedback");
    expect(fnBlock).toContain("Incident Report");
    expect(fnBlock).toContain("ZTP Coaching");
  });

  it("should keep form open after submit (no compassCloseForm in submit success path)", () => {
    // After successful single-log submit, should call _compassResetFormFieldsForNext, not compassCloseForm
    const submitFn = compassJs.slice(
      compassJs.indexOf("async function compassSubmitNew()"),
      compassJs.indexOf("function compassCloseForm()")
    );
    // Should contain the reset-for-next call
    expect(submitFn).toContain("_compassResetFormFieldsForNext()");
    // Should contain the success message
    expect(submitFn).toContain("_compassShowInlineSuccessMsg");
  });

  it("should apply role-based restrictions for QA", () => {
    const fnStart = compassJs.indexOf("function _compassGetAllowedTypes()");
    const fnBlock = compassJs.slice(fnStart, fnStart + 1500);
    expect(fnBlock).toContain("Quality & Policy Expert");
    expect(fnBlock).toContain("qaAllowed");
  });

  it("should apply role-based restrictions for SME", () => {
    const fnStart = compassJs.indexOf("function _compassGetAllowedTypes()");
    const fnBlock = compassJs.slice(fnStart, fnStart + 1500);
    expect(fnBlock).toContain("Operational SME");
    expect(fnBlock).toContain("smeExcluded");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. CSS — Inline Panel Styles
// ═══════════════════════════════════════════════════════════════════════
describe("Inline Add Panel CSS", () => {
  it("should have .compass-inline-add base styles", () => {
    expect(compassCss).toContain(".compass-inline-add {");
  });

  it("should have slide-down animation", () => {
    expect(compassCss).toContain("compassInlineSlideDown");
  });

  it("should have slide-up (collapsing) animation", () => {
    expect(compassCss).toContain("compassInlineSlideUp");
    expect(compassCss).toContain(".compass-inline-add.collapsing");
  });

  it("should have type chip styles", () => {
    expect(compassCss).toContain(".compass-type-chip {");
    expect(compassCss).toContain(".compass-type-chip:hover");
    expect(compassCss).toContain(".compass-type-chip.selected");
  });

  it("should have inline form body styles", () => {
    expect(compassCss).toContain(".compass-inline-add-form {");
  });

  it("should have inline footer styles", () => {
    expect(compassCss).toContain(".compass-inline-add-footer {");
  });

  it("should have success message styles", () => {
    expect(compassCss).toContain(".submit-success-msg");
  });

  it("should have collapse button styles", () => {
    expect(compassCss).toContain(".compass-inline-add-collapse {");
  });

  it("should replicate form input styles for inline panel", () => {
    expect(compassCss).toContain(".compass-inline-add .form-input");
    expect(compassCss).toContain(".compass-inline-add .form-select");
    expect(compassCss).toContain(".compass-inline-add .form-label");
  });

  it("should replicate RTE styles for inline panel", () => {
    expect(compassCss).toContain(".compass-inline-add .rte-container");
    expect(compassCss).toContain(".compass-inline-add .rte-toolbar");
    expect(compassCss).toContain(".compass-inline-add .rte-editor");
  });

  it("should replicate button styles for inline panel", () => {
    expect(compassCss).toContain(".compass-inline-add .btn-primary");
    expect(compassCss).toContain(".compass-inline-add .btn-outline");
  });

  it("should have responsive styles for narrow screens", () => {
    expect(compassCss).toContain("@media (max-width: 768px)");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. Cache Version Bumps
// ═══════════════════════════════════════════════════════════════════════
describe("Inline Panel Cache Versions", () => {
  it("should have compass.js at v=112", () => {
    expect(indexHtml).toContain("compass.js?v=112");
  });

  it("should have compass-redesign.css at v=110", () => {
    expect(indexHtml).toContain("compass-redesign.css?v=110");
  });
});
