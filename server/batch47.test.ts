import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

function readPublicJS(filename: string): string {
  return readFileSync(join(__dirname, '..', 'server', 'public', 'js', filename), 'utf-8');
}
function readPublicCSS(filename: string): string {
  return readFileSync(join(__dirname, '..', 'server', 'public', 'css', filename), 'utf-8');
}
function readHTML(): string {
  return readFileSync(join(__dirname, '..', 'server', 'public', 'index.html'), 'utf-8');
}

describe('Batch 47 — QA Feedback Acknowledgement Section Visibility', () => {
  const compass = readPublicJS('compass.js');

  it('hides acknowledgement section for non-acknowledgement statuses', () => {
    // The detail view should check status before showing acknowledgement section
    expect(compass).toContain('ACK_ELIGIBLE_STATUSES');
    // Should include Pending Acknowledgement and Acknowledged as eligible
    expect(compass).toContain("'Pending Acknowledgement'");
    expect(compass).toContain("'Acknowledged'");
  });

  it('still shows acknowledgement section for Acknowledged status', () => {
    // The section should be visible when status is in ACK_ELIGIBLE_STATUSES
    expect(compass).toContain('ACK_ELIGIBLE_STATUSES.includes');
  });
});

describe('Batch 47 — Filter Bar Layout (Add button first)', () => {
  const html = readHTML();

  it('Add button is inside the filter bar, not in a separate toolbar', () => {
    // The Add button should be inside compass-filter-bar
    const filterBarStart = html.indexOf('id="compass-filter-bar"');
    const filterBarEnd = html.indexOf('<!-- Hidden filters', filterBarStart);
    const addBtnPos = html.indexOf('id="compass-new-btn"');
    expect(addBtnPos).toBeGreaterThan(filterBarStart);
    expect(addBtnPos).toBeLessThan(filterBarEnd);
  });

  it('Add button appears before the filter pills container', () => {
    const addBtnPos = html.indexOf('id="compass-new-btn"');
    const pillsPos = html.indexOf('id="compass-filter-pills"');
    expect(addBtnPos).toBeLessThan(pillsPos);
  });
});

describe('Batch 47 — Root Cause Analysis Alignment', () => {
  const css = readPublicCSS('styles.css');

  it('detail-label has sufficient min-width for L3 Contributing Cause', () => {
    const match = css.match(/\.detail-label\s*\{[^}]*min-width:\s*(\d+)px/);
    expect(match).not.toBeNull();
    const minWidth = parseInt(match![1]);
    expect(minWidth).toBeGreaterThanOrEqual(170);
  });

  it('detail-value has word-break for long values', () => {
    const detailValueBlock = css.match(/\.detail-value\s*\{[^}]*\}/);
    expect(detailValueBlock).not.toBeNull();
    expect(detailValueBlock![0]).toContain('word-break');
  });
});

describe('Batch 47 — Coaching Types: General Coaching + Incident Report', () => {
  const compass = readPublicJS('compass.js');

  it('COACHING_TYPES includes both General Coaching and Incident Report', () => {
    expect(compass).toContain("'General Coaching'");
    expect(compass).toContain("'Incident Report'");
  });

  it('group coaching creates individual logs with General Coaching type', () => {
    expect(compass).toContain("coaching_type: 'General Coaching'");
  });

  it('default coaching type for non-QA is General Coaching (via type selector)', () => {
    // Type-first selector now pre-selects the type via compassShowNewFormForType(preselectedType)
    expect(compass).toContain("typeSelect.value = preselectedType");
    // General Coaching is still the first type card in the selector
    expect(compass).toContain("id: 'General Coaching'");
  });
});

// Sync History UI removed — sync logs now written to Google Sheet SYNC_LOG tab
describe('Batch 47 — Sync History removed (logs moved to Google Sheet)', () => {
  const html = readHTML();
  it('sync-history nav item is removed from the UI', () => {
    expect(html).not.toContain('id="nav-sync-history"');
  });
  it('sync-history view container is removed from the UI', () => {
    expect(html).not.toContain('id="sync-history-view"');
  });
});

describe('Batch 47 — QA Dispute Hidden Statuses in Omnibar', () => {
  const omnibar = readPublicJS('compass-omnibar.js');

  it('compassApplyNow filters out QA Dispute hidden statuses', () => {
    expect(omnibar).toContain('QA_DISPUTE_HIDDEN_STATUSES');
    expect(omnibar).toContain("'Markdown Disputed - SME'");
    expect(omnibar).toContain("'QA Decision Rejected - SME'");
  });

  it('admin override is present in compassApplyNow', () => {
    expect(omnibar).toContain("ohr_id === '740045023'");
    expect(omnibar).toContain('isAdmin740');
  });
});
