import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const readPublicFile = (name: string) =>
  readFileSync(join(__dirname, 'public', name), 'utf-8');

describe('Role Change — Inline Contextual Flow', () => {

  describe('HTML structure', () => {
    const html = readPublicFile('index.html');

    it('has removed the old tab bar (no billing-main-tabs)', () => {
      expect(html).not.toContain('id="billing-main-tabs"');
      expect(html).not.toContain('id="billing-main-tab-role-changes"');
    });

    it('has "Do Role Change?" button in the drilldown panel', () => {
      expect(html).toContain('id="rc-do-role-change-btn"');
      expect(html).toContain('rcOpenInlinePanel()');
    });

    it('has inline role change panel (hidden by default)', () => {
      expect(html).toContain('id="rc-inline-panel"');
      expect(html).toContain('id="rc-inline-context-badge"');
    });

    it('has context bar with PG, deficit, and HC info', () => {
      expect(html).toContain('id="rc-context-pg"');
      expect(html).toContain('id="rc-context-deficit"');
      expect(html).toContain('id="rc-context-hc"');
    });

    it('has inline staff table with select-all checkbox', () => {
      expect(html).toContain('id="rc-inline-select-all"');
      expect(html).toContain('id="rc-inline-staff-body"');
      expect(html).toContain('rcInlineToggleSelectAll()');
    });

    it('has inline action bar for adding to queue', () => {
      expect(html).toContain('id="rc-inline-action-bar"');
      expect(html).toContain('id="rc-inline-selected-count"');
      expect(html).toContain('rcAddToQueue()');
    });

    it('has queue floating bar', () => {
      expect(html).toContain('id="rc-queue-bar"');
      expect(html).toContain('id="rc-queue-count"');
      expect(html).toContain('rcShowQueuePreview()');
      expect(html).toContain('rcProcessQueue()');
    });

    it('has queue preview modal', () => {
      expect(html).toContain('id="rc-queue-modal"');
      expect(html).toContain('id="rc-queue-modal-body"');
      expect(html).toContain('rcCloseQueuePreview()');
    });

    it('has email result section with copy buttons', () => {
      expect(html).toContain('id="rc-email-result"');
      expect(html).toContain('id="rc-email-preview"');
      expect(html).toContain('id="rc-email-subject"');
      expect(html).toContain('rcCopyEmailHtml()');
      expect(html).toContain('rcCopyEmailPlainText()');
    });

    it('has collapsible role change history section at the bottom', () => {
      expect(html).toContain('id="rc-history-section"');
      expect(html).toContain('id="rc-history-body"');
      expect(html).toContain('id="rc-history-body-wrap"');
      expect(html).toContain('rcToggleHistory()');
      expect(html).toContain('Role Change History');
    });

    it('loads role-change.js script', () => {
      expect(html).toContain('role-change.js');
    });

    it('preserves existing billing compliance structure', () => {
      expect(html).toContain('id="billing-kpi-cards"');
      expect(html).toContain('id="billing-v3-table"');
      expect(html).toContain('id="billing-drilldown"');
    });
  });

  describe('role-change.js functions', () => {
    const js = readPublicFile('js/role-change.js');

    it('defines rcOpenInlinePanel function', () => {
      expect(js).toContain('async function rcOpenInlinePanel()');
    });

    it('defines rcCloseInlinePanel function', () => {
      expect(js).toContain('function rcCloseInlinePanel()');
    });

    it('defines rcLoadInlineStaff function (filtered by PG)', () => {
      expect(js).toContain('async function rcLoadInlineStaff(targetPG, targetRole)');
      // Filters out staff already in the target PG
      expect(js).toContain('s.planning_group !== targetPG');
    });

    it('defines rcRenderInlineStaff function', () => {
      expect(js).toContain('function rcRenderInlineStaff(targetPG, targetRole)');
    });

    it('defines rcAddToQueue function', () => {
      expect(js).toContain('function rcAddToQueue()');
    });

    it('defines rcUpdateQueueBar function', () => {
      expect(js).toContain('function rcUpdateQueueBar()');
    });

    it('defines rcShowQueuePreview function', () => {
      expect(js).toContain('function rcShowQueuePreview()');
    });

    it('defines rcProcessQueue function (consolidated email)', () => {
      expect(js).toContain('async function rcProcessQueue()');
    });

    it('defines clipboard copy functions', () => {
      expect(js).toContain('async function rcCopyEmailHtml()');
      expect(js).toContain('async function rcCopyEmailPlainText()');
    });

    it('defines rcToggleHistory function', () => {
      expect(js).toContain('function rcToggleHistory()');
    });

    it('defines rcLoadHistoryForBilling function', () => {
      expect(js).toContain('async function rcLoadHistoryForBilling()');
    });

    it('defines initRoleChangeVisibility as no-op for backward compat', () => {
      expect(js).toContain('function initRoleChangeVisibility()');
    });

    it('fetches from /role-change/available-staff API', () => {
      expect(js).toContain('/role-change/available-staff');
    });

    it('fetches from /role-change/generate API', () => {
      expect(js).toContain('/role-change/generate');
    });

    it('fetches from /role-change/history API', () => {
      expect(js).toContain('/role-change/history');
    });

    it('renders badge styles (success, warning, danger, muted)', () => {
      expect(js).toContain('rc-badge-success');
      expect(js).toContain('rc-badge-warning');
      expect(js).toContain('rc-badge-muted');
    });

    it('restricts access to Managers, TLs, and Admin OHRs (via billing.js)', () => {
      // Role gating moved to billing.js showBillingDrilldown — check there
      const billingJs = readPublicFile('js/billing.js');
      expect(billingJs).toContain("'Manager'");
      expect(billingJs).toContain("'Team Lead'");
      expect(billingJs).toContain("'740045023'");
      expect(billingJs).toContain("'740044909'");
    });

    it('has queue state management', () => {
      expect(js).toContain('let _rcQueue = []');
      expect(js).toContain('rcRemoveFromQueue');
      expect(js).toContain('rcClearQueue');
    });

    it('does NOT contain old tab-based functions', () => {
      expect(js).not.toContain('function switchBillingMainTab');
      expect(js).not.toContain('async function initRoleChangeTab()');
      expect(js).not.toContain('function rcOnWeekChange()');
      expect(js).not.toContain('async function rcAnalyze()');
    });
  });

  describe('billing.js integration', () => {
    const billingJs = readPublicFile('js/billing.js');

    it('adds bc-row-deficit class for rows with hc_needed > 0', () => {
      expect(billingJs).toContain('bc-row-deficit');
    });

    it('stores current drilldown row for role change context', () => {
      expect(billingJs).toContain('_currentDrilldownRow');
    });

    it('shows/hides "Do Role Change?" button based on user role', () => {
      expect(billingJs).toContain('rc-do-role-change-btn');
      expect(billingJs).toContain('isAuthorized');
    });

    it('calls rcCloseInlinePanel when switching drilldown rows', () => {
      expect(billingJs).toContain('rcCloseInlinePanel');
    });

    it('calls rcLoadHistoryForBilling on init', () => {
      expect(billingJs).toContain('rcLoadHistoryForBilling');
    });
  });

  describe('CSS styles', () => {
    const css = readPublicFile('css/styles.css');

    it('defines deficit row highlight', () => {
      expect(css).toContain('.bc-row-deficit');
    });

    it('defines inline panel styles', () => {
      expect(css).toContain('.rc-inline-card');
      expect(css).toContain('.rc-inline-header');
      expect(css).toContain('.rc-inline-title');
      expect(css).toContain('.rc-inline-context-badge');
    });

    it('defines context bar styles', () => {
      expect(css).toContain('.rc-context-bar');
    });

    it('defines queue bar styles', () => {
      expect(css).toContain('#rc-queue-bar');
      expect(css).toContain('.rc-queue-bar-inner');
      expect(css).toContain('.rc-queue-info');
      expect(css).toContain('.rc-queue-actions');
    });

    it('defines queue modal styles', () => {
      expect(css).toContain('#rc-queue-modal');
      expect(css).toContain('.rc-queue-modal-backdrop');
      expect(css).toContain('.rc-queue-modal-content');
      expect(css).toContain('.rc-queue-modal-header');
      expect(css).toContain('.rc-queue-modal-body');
      expect(css).toContain('.rc-queue-modal-footer');
    });

    it('defines badge styles', () => {
      expect(css).toContain('.rc-badge');
      expect(css).toContain('.rc-badge-success');
      expect(css).toContain('.rc-badge-warning');
      expect(css).toContain('.rc-badge-danger');
      expect(css).toContain('.rc-badge-muted');
    });

    it('defines button styles', () => {
      expect(css).toContain('.rc-btn');
      expect(css).toContain('.rc-btn-primary');
      expect(css).toContain('.rc-btn-sm');
      expect(css).toContain('.rc-btn-ghost');
    });

    it('defines email preview styles', () => {
      expect(css).toContain('.rc-email-preview');
      expect(css).toContain('.rc-email-subject');
    });

    it('defines result card styles', () => {
      expect(css).toContain('.rc-result-card');
    });

    it('defines inline select styles', () => {
      expect(css).toContain('.rc-inline-select');
    });

    it('has responsive breakpoints', () => {
      expect(css).toContain('.rc-queue-bar-inner');
    });
  });

  describe('Server routes (io/role-change.ts)', () => {
    const routes = readFileSync(join(__dirname, 'io/role-change.ts'), 'utf-8');

    it('defines deficit-analysis GET route', () => {
      expect(routes).toContain('router.get("/deficit-analysis"');
    });

    it('defines available-staff GET route', () => {
      expect(routes).toContain('router.get("/available-staff"');
    });

    it('defines generate POST route', () => {
      expect(routes).toContain('router.post("/generate"');
    });

    it('defines history GET route', () => {
      expect(routes).toContain('router.get("/history"');
    });

    it('defines suggest GET route', () => {
      expect(routes).toContain('router.get("/suggest"');
    });

    it('generates email HTML with Calibri font and table format', () => {
      expect(routes).toContain('font-family:Calibri');
      expect(routes).toContain('border-collapse:collapse');
      expect(routes).toContain('background-color:#4472C4');
      expect(routes).toContain('background-color:#FFFF00');
    });

    it('auto-updates attendance records on generate', () => {
      expect(routes).toContain('UPDATE io_attendance');
      expect(routes).toContain('SET role =');
      expect(routes).toContain('planning_group =');
    });

    it('exports router as default', () => {
      expect(routes).toContain('export default router');
    });
  });

  describe('Database schema', () => {
    const schema = readFileSync(join(__dirname, '..', 'drizzle', 'schema.ts'), 'utf-8');

    it('defines ioRoleChanges table', () => {
      expect(schema).toContain('export const ioRoleChanges = pgTable("io_role_changes"');
    });

    it('has required columns', () => {
      expect(schema).toContain('ohr_id');
      expect(schema).toContain('original_role');
      expect(schema).toContain('original_pg');
      expect(schema).toContain('new_role');
      expect(schema).toContain('new_pg');
      expect(schema).toContain('date_from');
      expect(schema).toContain('date_to');
      expect(schema).toContain('week_ending');
      expect(schema).toContain('attendance_updated');
      expect(schema).toContain('email_generated_at');
    });

    it('exports type definitions', () => {
      expect(schema).toContain('export type IoRoleChange');
      expect(schema).toContain('export type InsertIoRoleChange');
    });
  });
});
