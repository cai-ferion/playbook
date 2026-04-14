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

describe('Batch 47 — Coaching Types: General Coaching + CAP 0 Coaching', () => {
  const compass = readPublicJS('compass.js');

  it('COACHING_TYPES includes both General Coaching and CAP 0 Coaching', () => {
    expect(compass).toContain("'General Coaching'");
    expect(compass).toContain("'CAP 0 Coaching'");
  });

  it('group coaching creates individual logs with General Coaching type', () => {
    expect(compass).toContain("coaching_type: 'General Coaching'");
  });

  it('default coaching type for non-QA is General Coaching', () => {
    expect(compass).toContain("typeSelect.value = 'General Coaching'");
  });
});

describe('Batch 47 — Sync History Text Wrapping', () => {
  const css = readPublicCSS('sync-history.css');

  it('sh-detail-error has word-break and overflow-wrap for long error messages', () => {
    const errorBlock = css.match(/\.sh-detail-error\s*\{[^}]*\}/);
    expect(errorBlock).not.toBeNull();
    expect(errorBlock![0]).toContain('word-break');
    expect(errorBlock![0]).toContain('overflow-wrap');
  });

  it('sh-detail-content has overflow-x hidden to prevent horizontal scroll', () => {
    const contentBlock = css.match(/\.sh-detail-content\s*\{[^}]*\}/);
    expect(contentBlock).not.toBeNull();
    expect(contentBlock![0]).toContain('overflow-x');
  });

  it('sh-table uses table-layout fixed', () => {
    const tableBlock = css.match(/\.sh-table\s*\{[^}]*\}/);
    expect(tableBlock).not.toBeNull();
    expect(tableBlock![0]).toContain('table-layout: fixed');
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
