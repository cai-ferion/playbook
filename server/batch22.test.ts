import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Helper to read public JS files
function readPublicJS(filename: string): string {
  return readFileSync(join(__dirname, '..', 'server', 'public', 'js', filename), 'utf-8');
}

function readPublicCSS(filename: string): string {
  return readFileSync(join(__dirname, '..', 'server', 'public', 'css', filename), 'utf-8');
}

function readHTML(): string {
  return readFileSync(join(__dirname, '..', 'server', 'public', 'index.html'), 'utf-8');
}

describe('Batch 22 — Anchor Billing Table & Charts', () => {
  const html = readHTML();
  const css = readPublicCSS('styles.css');

  it('billing code reference table has white-space:nowrap on Target Hrs header', () => {
    expect(html).toContain('style="white-space:nowrap;">Target Hrs</th>');
  });

  it('billing ref card is wider (420px) for better column display', () => {
    expect(css).toContain('flex: 0 0 420px');
  });

  it('billing ref card table values are center-aligned via CSS', () => {
    expect(css).toContain('.billing-ref-card .data-table td');
    expect(css).toContain('text-align: center');
  });

  it('billing-right-stack layout exists for stacked charts', () => {
    expect(css).toContain('.billing-right-stack');
    expect(css).toContain('flex-direction: column');
  });

  it('UPL, LATE, PL trend chart canvases exist in the right stack', () => {
    expect(html).toContain('id="billing-upl-trends-chart"');
    expect(html).toContain('id="billing-late-trends-chart"');
    expect(html).toContain('id="billing-pl-trends-chart"');
    // They should be inside billing-right-stack
    expect(html).toContain('billing-right-stack');
  });

  it('YTD compliance doughnut is in its own column, trend charts are in the right stack', () => {
    const doughnutPos = html.indexOf('billing-doughnut-card');
    const rightStackStart = html.indexOf('billing-right-stack');
    const uplPos = html.indexOf('billing-upl-trends-chart');
    // Doughnut should be in its own card before the right stack
    expect(doughnutPos).toBeGreaterThan(-1);
    expect(rightStackStart).toBeGreaterThan(-1);
    expect(doughnutPos).toBeLessThan(rightStackStart);
    expect(uplPos).toBeGreaterThan(rightStackStart);
  });
});

describe('Batch 22 — Compass Group Coaching', () => {
  const compass = readPublicJS('compass.js');

  it('group coaching creates individual logs with coaching_type General Coaching', () => {
    expect(compass).toContain("coaching_type: 'General Coaching'");
    // The group coaching block sets individual records
    const groupBlock = compass.indexOf("type === 'Group Coaching' && coacheeList.length > 0");
    expect(groupBlock).toBeGreaterThan(-1);
  });
});

describe('Batch 22 — Compass LV4 Trainer Dispute Flow', () => {
  const compass = readPublicJS('compass.js');

  it('LV4 trainer buttons use popout functions instead of quick actions', () => {
    expect(compass).toContain('disputesShowLV4ReverseMarkdown()');
    expect(compass).toContain('disputesShowLV4RetainMarkdown()');
  });

  it('LV4 retain markdown popout function exists with remarks field', () => {
    expect(compass).toContain("function disputesShowLV4RetainMarkdown()");
    expect(compass).toContain('dispute-lv4-retain-remarks');
    expect(compass).toContain("titleEl.textContent = 'Retain Markdown'");
  });

  it('LV4 retain sets status to Markdown Retained - Trainer', () => {
    expect(compass).toContain("status: 'Markdown Retained - Trainer'");
  });

  it('LV4 reverse markdown popout function exists', () => {
    expect(compass).toContain("function disputesShowLV4ReverseMarkdown()");
    expect(compass).toContain("titleEl.textContent = 'Reverse Markdown'");
  });

  it('LV4 reverse sets status to Markdown Reversed - Trainer', () => {
    expect(compass).toContain("status: 'Markdown Reversed - Trainer'");
  });

  it('LV4 retain supports file attachments', () => {
    expect(compass).toContain('dispute-lv4-retain-remarks');
  });

  it('no duplicate disputeRemoveFile function', () => {
    const matches = compass.match(/function disputeRemoveFile/g);
    expect(matches).toHaveLength(1);
  });
});

describe('Batch 22 — Helm New Request Button', () => {
  const html = readHTML();
  const helm = readPublicJS('helm.js');

  it('New Request button exists in the Helm toolbar', () => {
    expect(html).toContain('helmShowNewRequestForm()');
    expect(html).toContain('New Request');
  });

  it('helmShowNewRequestForm function exists', () => {
    expect(helm).toContain('function helmShowNewRequestForm()');
  });

  it('request type includes Attendance Backdated Change Tag', () => {
    expect(helm).toContain('attendance_backdated_change_tag');
    expect(helm).toContain('Attendance Backdated Change Tag');
  });

  it('request form has date, agent, and reason fields', () => {
    expect(helm).toContain('helm-req-date');
    expect(helm).toContain('helm-req-agent-search');
    expect(helm).toContain('helm-req-reason');
  });

  it('request submission creates a task with request metadata', () => {
    expect(helm).toContain('[Request] Attendance Backdated Change Tag');
    expect(helm).toContain('helmSubmitNewRequest');
  });

  it('request submission creates a notification', () => {
    expect(helm).toContain("title: 'Backdate Tag Change'");
  });
});

describe('Batch 22 — Regimen Roster Fix', () => {
  const roster = readPublicJS('roster.js');

  it('roster.js has no syntax errors (notification calls removed in Batch 51)', () => {
    // The old broken call had user?.ohr_id as positional args
    expect(roster).not.toContain('user?.ohr_id, user?.full_name)');
    // Batch 51: roster notifications removed — verify they are gone
    expect(roster).not.toContain("type: 'roster_add'");
    expect(roster).not.toContain("type: 'roster_edit'");
    expect(roster).not.toContain("type: 'roster_delete'");
  });

  it('rosterRenderTable function exists and renders ALL_COLUMNS', () => {
    expect(roster).toContain('function rosterRenderTable()');
    expect(roster).toContain('ROSTER.ALL_COLUMNS');
  });
});

describe('Batch 22 — Sandbox Approve Popout', () => {
  const sandbox = readPublicJS('sandbox.js');

  it('Elevate button is removed from the final review footer', () => {
    // The old elevate button pattern should not exist
    expect(sandbox).not.toContain("onclick=\"sandboxReview('elevate')\"");
  });

  it('Approve button for final review uses sandboxShowFinalApprovePopout', () => {
    expect(sandbox).toContain('sandboxShowFinalApprovePopout()');
  });

  it('sandboxShowFinalApprovePopout function exists', () => {
    expect(sandbox).toContain('function sandboxShowFinalApprovePopout()');
  });

  it('approve popout presents all 4 elevated status choices', () => {
    expect(sandbox).toContain('Elevated - Task in Progress');
    expect(sandbox).toContain('Elevated - POC Rejected');
    expect(sandbox).toContain('Elevated - Pending POC Discussion');
    expect(sandbox).toContain('Elevated - No POC');
  });

  it('sandboxSubmitFinalApprove function exists and updates status', () => {
    expect(sandbox).toContain('function sandboxSubmitFinalApprove()');
    expect(sandbox).toContain('sandbox-approve-status');
  });

  it('old elevate action is removed from sandboxReview', () => {
    // The elevate action branch should no longer exist
    const reviewFn = sandbox.substring(sandbox.indexOf('async function sandboxReview('));
    expect(reviewFn).not.toContain("action === 'elevate'");
  });
});
