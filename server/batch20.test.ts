import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const compassJs = readFileSync(resolve(__dirname, 'public/js/compass.js'), 'utf-8');
const sandboxJs = readFileSync(resolve(__dirname, 'public/js/sandbox.js'), 'utf-8');
const sandboxCss = readFileSync(resolve(__dirname, 'public/css/sandbox-redesign.css'), 'utf-8');
const indexHtml = readFileSync(resolve(__dirname, 'public/index.html'), 'utf-8');

describe('Coaching Profile — Date Field', () => {
  it('renders a date input with id compass-new-date in the form', () => {
    expect(compassJs).toContain('id="compass-new-date"');
    expect(compassJs).toContain("type=\"date\"");
  });

  it('defaults the date to today in Asia/Manila timezone', () => {
    expect(compassJs).toContain("toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })");
  });

  it('caches the date field in _compassCacheFormEls', () => {
    expect(compassJs).toContain("'compass-new-date'");
  });

  it('resets the date field to today in _compassResetFormFields', () => {
    expect(compassJs).toMatch(/el\['compass-new-date'\].*toLocaleDateString/);
  });

  it('uses the date field value in compassSubmitNew instead of hardcoded Date', () => {
    expect(compassJs).toContain("getElementById('compass-new-date')");
    expect(compassJs).toContain("dateFieldVal");
  });

  it('places the date field in the coaching form builder', () => {
    // The date section is rendered inside the form builder function
    const formFnStart = compassJs.indexOf('function compassShowNewFormInline');
    expect(formFnStart).toBeGreaterThan(-1);
    const dateIdx = compassJs.indexOf('compass-date-section', formFnStart);
    expect(dateIdx).toBeGreaterThan(formFnStart);
  });
});

describe('Sandbox Review Area — Right-Side Panel', () => {
  it('has the sandbox-review-panel HTML in index.html', () => {
    expect(indexHtml).toContain('id="sandbox-review-panel"');
    expect(indexHtml).toContain('id="sandbox-review-panel-body"');
    expect(indexHtml).toContain('id="sandbox-review-panel-footer"');
  });

  it('has sandboxOpenReviewPanel function', () => {
    expect(sandboxJs).toContain('function sandboxOpenReviewPanel(ins)');
  });

  it('has sandboxCloseReviewPanel function', () => {
    expect(sandboxJs).toContain('function sandboxCloseReviewPanel()');
  });

  it('sandboxToggleKanbanCard opens the side panel instead of inline expansion', () => {
    expect(sandboxJs).toContain('sandboxOpenReviewPanel(ins)');
    // Should NOT contain the old inline expansion builder
    expect(sandboxJs).not.toContain('function sandboxBuildKanbanExpansion');
  });

  it('sandboxCloseForm calls sandboxCloseReviewPanel', () => {
    expect(sandboxJs).toContain('sandboxCloseReviewPanel()');
  });

  it('renders insight details in the side panel body using cdp classes', () => {
    expect(sandboxJs).toContain('cdp-header');
    expect(sandboxJs).toContain('cdp-section');
    expect(sandboxJs).toContain('cdp-grid');
    expect(sandboxJs).toContain('cdp-field-label');
    expect(sandboxJs).toContain('cdp-field-value');
  });

  it('renders role-based action buttons in the side panel footer', () => {
    expect(sandboxJs).toContain('function sandboxBuildPanelActions(ins)');
    expect(sandboxJs).toContain("footerEl.innerHTML = sandboxBuildPanelActions(ins)");
  });

  it('inline action overlay targets the side panel body', () => {
    expect(sandboxJs).toContain("getElementById('sandbox-review-panel-body')");
  });
});

describe('Sandbox Review Side Panel — CSS', () => {
  it('has .sandbox-side-panel styles', () => {
    expect(sandboxCss).toContain('.sandbox-side-panel');
    expect(sandboxCss).toContain('.sandbox-side-panel.active');
    expect(sandboxCss).toContain('.sandbox-side-panel-inner');
    expect(sandboxCss).toContain('.sandbox-side-panel-header');
    expect(sandboxCss).toContain('.sandbox-side-panel-body');
    expect(sandboxCss).toContain('.sandbox-side-panel-footer');
  });

  it('has cdp detail classes scoped to side panel body', () => {
    expect(sandboxCss).toContain('.sandbox-side-panel-body .cdp-header');
    expect(sandboxCss).toContain('.sandbox-side-panel-body .cdp-section-title');
    expect(sandboxCss).toContain('.sandbox-side-panel-body .cdp-grid');
    expect(sandboxCss).toContain('.sandbox-side-panel-body .cdp-field-label');
  });

  it('has slide animation for the panel', () => {
    expect(sandboxCss).toContain('sandbox-panel-slide');
    expect(sandboxCss).toContain('translateX(100%)');
  });

  it('has inline action overlay scoped to side panel', () => {
    expect(sandboxCss).toContain('.sandbox-side-panel-body .sandbox-action-overlay');
  });
});

describe('Cache Versions', () => {
  it('sandbox-redesign.css bumped to v102', () => {
    expect(indexHtml).toContain('sandbox-redesign.css?v=107');
  });
  it('compass.js bumped to v120', () => {
    expect(indexHtml).toContain('compass.js?v=124');
  });
  it('sandbox.js bumped to v106', () => {
    expect(indexHtml).toContain('sandbox.js?v=123');
  });
});

describe('Bonus Fix — Duplicate Function Name', () => {
  it('disputesSubmitLV5RejectDecision exists as a named function', () => {
    expect(compassJs).toContain('function disputesSubmitLV5RejectDecision()');
  });

  it('disputesSubmitQADecisionRejected is NOT duplicated', () => {
    const matches = compassJs.match(/function disputesSubmitQADecisionRejected/g);
    expect(matches).toHaveLength(1);
  });
});
