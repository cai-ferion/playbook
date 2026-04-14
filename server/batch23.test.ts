import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const readPublicJS = (name: string) =>
  readFileSync(join(__dirname, 'public', 'js', name), 'utf-8');
const readHTML = () =>
  readFileSync(join(__dirname, 'public', 'index.html'), 'utf-8');

// ===== Anchor: YTD Doughnut in own column, trend charts to the right =====

describe('Batch 23 — Anchor YTD Chart Layout [V3 Replaced]', () => {
  const html = readHTML();

  it('[V3] billing compliance table and KPI cards exist', () => {
    // The old YTD doughnut and trend charts were replaced by the
    // server-driven compliance dashboard with KPI cards and traffic-light table.
    expect(html).toContain('id="billing-v3-table"');
    expect(html).toContain('id="billing-kpi-cards"');
  });

  it('[V3] compliance table has 11-column header', () => {
    expect(html).toContain('PG × Role');
    expect(html).toContain('Compliance %');
    expect(html).toContain('OTs Needed');
    expect(html).toContain('HC Needed');
  });
});

// ===== Compass: Complete 6-level dispute flow =====

describe('Batch 23 — Compass 6-Level Dispute Flow', () => {
  const compass = readPublicJS('compass.js');

  // Kanban columns use correct statuses
  it('LV1 kanban filters Pending SME Review', () => {
    expect(compass).toContain("statuses: ['Pending SME Review', '']");
  });

  it('LV2 kanban filters Markdown Disputed (both variants)', () => {
    expect(compass).toContain("'Markdown Disputed'");
    expect(compass).toContain("'Markdown Disputed - SME'");
  });

  it('LV3 kanban filters Markdown Retained - QA', () => {
    expect(compass).toContain("statuses: ['Markdown Retained - QA']");
  });

  it('LV4 kanban filters QA Decision Rejected (both variants)', () => {
    expect(compass).toContain("'QA Decision Rejected'");
    expect(compass).toContain("'QA Decision Rejected - SME'");
  });

  it('LV5 kanban filters Markdown Retained - Trainer', () => {
    expect(compass).toContain("statuses: ['Markdown Retained - Trainer']");
  });

  it('LV6 kanban filters Trainer Decision Rejected (both variants)', () => {
    expect(compass).toContain("'Trainer Decision Rejected'");
    expect(compass).toContain("'Trainer Decision Rejected - SME'");
  });

  // LV1 actions
  it('LV1 Accept Markdown sets status to Markdown Accepted', () => {
    expect(compass).toContain("status: 'Markdown Accepted'");
  });

  it('LV1 Dispute Markdown sets status to Markdown Disputed', () => {
    expect(compass).toContain("status: 'Markdown Disputed'");
  });

  // LV2 actions
  it('LV2 Reverse Markdown sets status to Markdown Reversed - QA', () => {
    expect(compass).toContain("status: 'Markdown Reversed - QA'");
  });

  it('LV2 Retain Markdown sets status to Markdown Retained - QA', () => {
    expect(compass).toContain("status: 'Markdown Retained - QA'");
  });

  // LV3 actions
  it('LV3 Accept Decision sets status to QA Decision Accepted', () => {
    expect(compass).toContain("status: 'QA Decision Accepted'");
  });

  it('LV3 Reject Decision sets status to QA Decision Rejected', () => {
    expect(compass).toContain("status: 'QA Decision Rejected'");
  });

  // LV4 actions
  it('LV4 Reverse Markdown sets status to Markdown Reversed - Trainer', () => {
    expect(compass).toContain("status: 'Markdown Reversed - Trainer'");
  });

  it('LV4 Retain Markdown sets status to Markdown Retained - Trainer', () => {
    expect(compass).toContain("status: 'Markdown Retained - Trainer'");
  });

  // LV5 actions
  it('LV5 Accept Decision sets status to Trainer Decision Accepted', () => {
    expect(compass).toContain("status: 'Trainer Decision Accepted'");
  });

  it('LV5 Reject Decision sets status to Trainer Decision Rejected', () => {
    expect(compass).toContain("status: 'Trainer Decision Rejected'");
  });

  it('LV5 has dedicated popout functions', () => {
    expect(compass).toContain('function disputesShowLV5AcceptDecision()');
    expect(compass).toContain('function disputesShowLV5RejectDecision()');
  });

  // LV6 actions
  it('LV6 Reverse Markdown sets status to Pending Acknowledgement (goes back to agent)', () => {
    expect(compass).toContain('function disputesSubmitLV6ReverseMarkdown()');
    // LV6 decisions now go to Pending Acknowledgement for agent acknowledgement
    expect(compass).toContain("Markdown reversed by QTP Manager");
  });

  it('LV6 Retain Markdown sets status to Pending Acknowledgement (goes back to agent)', () => {
    expect(compass).toContain('function disputesSubmitLV6RetainMarkdown()');
    // LV6 decisions now go to Pending Acknowledgement for agent acknowledgement
    expect(compass).toContain("Markdown retained by QTP Manager");
  });

  it('LV6 has dedicated popout functions', () => {
    expect(compass).toContain('function disputesShowLV6ReverseMarkdown()');
    expect(compass).toContain('function disputesShowLV6RetainMarkdown()');
  });

  // No old status names used as action targets (the QA_DISPUTE_HIDDEN_STATUSES
  // backward-compat filter array may still reference legacy names for filtering)
  it('no old status names used as action targets', () => {
    // These should not appear as status: 'X' action targets
    expect(compass).not.toContain("status: 'Markdown Disputed - SME'");
    expect(compass).not.toContain("status: 'Markdown Accepted - SME'");
    expect(compass).not.toContain("status: 'QA Retention Accepted - SME'");
    expect(compass).not.toContain("status: 'QA Retention Rejected - SME'");
    expect(compass).not.toContain("status: 'Trainer Decision Accepted - SME'");
    expect(compass).not.toContain("status: 'Trainer Decision Rejected - SME'");
  });
});

// ===== Sandbox: Review Flow =====

describe('Batch 23 — Sandbox Review Flow', () => {
  const sandbox = readPublicJS('sandbox.js');

  it('Kanban has 4 columns: Pending Initial, Pending Final, Trainers Area, Implemented', () => {
    expect(sandbox).toContain("title: 'Pending Initial Review'");
    expect(sandbox).toContain("title: 'Pending Final Review'");
    expect(sandbox).toContain("title: \"Trainer's Area\"");
    expect(sandbox).toContain("title: 'Implemented'");
  });

  it('Trainers Area does not include Approved - Final Review', () => {
    expect(sandbox).not.toContain("'Approved - Final Review'");
  });

  it('Trainers Area includes all 4 elevated statuses', () => {
    const trainersArea = sandbox.match(/Trainer's Area.*?statuses:\s*\[(.*?)\]/s);
    expect(trainersArea).not.toBeNull();
    const statuses = trainersArea![1];
    expect(statuses).toContain('Elevated - Task in Progress');
    expect(statuses).toContain('Elevated - POC Rejected');
    expect(statuses).toContain('Elevated - Pending POC Discussion');
    expect(statuses).toContain('Elevated - No POC');
  });

  it('Initial Review has Approve and Reject buttons', () => {
    expect(sandbox).toContain('sandboxShowAcceptPopout');
    expect(sandbox).toContain('sandboxShowRejectModal');
  });

  it('Final Review Approve uses sandboxShowFinalApprovePopout', () => {
    expect(sandbox).toContain('sandboxShowFinalApprovePopout()');
  });

  it('Final Approve popout presents 4 elevated status choices', () => {
    expect(sandbox).toContain('function sandboxShowFinalApprovePopout()');
    // Check all 4 choices exist in the popout
    const fnStart = sandbox.indexOf('function sandboxShowFinalApprovePopout()');
    const fnBlock = sandbox.substring(fnStart, fnStart + 1500);
    expect(fnBlock).toContain('Elevated - Task in Progress');
    expect(fnBlock).toContain('Elevated - POC Rejected');
    expect(fnBlock).toContain('Elevated - Pending POC Discussion');
    expect(fnBlock).toContain('Elevated - No POC');
  });

  it('Trainers Area has Change Status button for elevated statuses', () => {
    expect(sandbox).toContain('sandboxShowTrainerStatusPopout()');
  });

  it('Trainer Status Popout function exists with 4 elevated + Implemented choices', () => {
    expect(sandbox).toContain('function sandboxShowTrainerStatusPopout()');
    const fnStart = sandbox.indexOf('function sandboxShowTrainerStatusPopout()');
    const fnBlock = sandbox.substring(fnStart, fnStart + 2000);
    expect(fnBlock).toContain('Elevated - Task in Progress');
    expect(fnBlock).toContain('Elevated - POC Rejected');
    expect(fnBlock).toContain('Elevated - Pending POC Discussion');
    expect(fnBlock).toContain('Elevated - No POC');
    expect(fnBlock).toContain('Implemented');
  });

  it('Trainer Status Popout filters out current status', () => {
    expect(sandbox).toContain('allChoices.filter(c => c.value !== ins.status)');
  });

  it('Implemented column shows in kanban but has no action buttons in footer', () => {
    // The Implemented column exists in kanban
    expect(sandbox).toContain("title: 'Implemented'");
    // No footer button triggers for Implemented status
    expect(sandbox).not.toContain("sandboxReview('implement')");
  });

  it('sandboxReview only handles approve-initial (no approve-final or implement)', () => {
    const fnStart = sandbox.indexOf('async function sandboxReview(');
    const fnBlock = sandbox.substring(fnStart, fnStart + 500);
    expect(fnBlock).toContain("action === 'approve-initial'");
    expect(fnBlock).not.toContain("action === 'approve-final'");
    expect(fnBlock).not.toContain("action === 'implement'");
  });
});
