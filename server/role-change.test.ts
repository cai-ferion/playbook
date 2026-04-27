import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const readPublicFile = (name: string) =>
  readFileSync(join(__dirname, 'public', name), 'utf-8');

describe('Role Change Email Automation', () => {

  describe('HTML structure', () => {
    const html = readPublicFile('index.html');

    it('has billing main tab bar with Compliance and Role Changes tabs', () => {
      expect(html).toContain('id="billing-main-tabs"');
      expect(html).toContain('id="billing-main-tab-compliance"');
      expect(html).toContain('id="billing-main-tab-role-changes"');
    });

    it('has compliance tab content wrapper', () => {
      expect(html).toContain('id="billing-tab-compliance"');
    });

    it('has role changes tab content wrapper (hidden by default)', () => {
      expect(html).toContain('id="billing-tab-role-changes"');
    });

    it('has wizard step 1: week selection (no date range picker)', () => {
      expect(html).toContain('id="rc-step-1"');
      expect(html).toContain('id="rc-week-select"');
      expect(html).toContain('id="rc-analyze-btn"');
      // Date range picker removed — dates derived from week ending
      expect(html).not.toContain('id="rc-date-from"');
      expect(html).not.toContain('id="rc-date-to"');
    });

    it('has wizard step 2: deficit analysis table', () => {
      expect(html).toContain('id="rc-step-2"');
      expect(html).toContain('id="rc-deficit-table"');
      expect(html).toContain('id="rc-deficit-body"');
      expect(html).toContain('PG × Role');
      expect(html).toContain('Hours Gap');
      expect(html).toContain('HC Needed');
    });

    it('has wizard step 3: available staff table with checkboxes', () => {
      expect(html).toContain('id="rc-step-3"');
      expect(html).toContain('id="rc-staff-table"');
      expect(html).toContain('id="rc-staff-body"');
      expect(html).toContain('id="rc-select-all"');
      expect(html).toContain('New Role');
      expect(html).toContain('New PG');
    });

    it('has wizard step 4: email preview with copy buttons', () => {
      expect(html).toContain('id="rc-step-4"');
      expect(html).toContain('id="rc-email-preview"');
      expect(html).toContain('id="rc-email-subject"');
      expect(html).toContain('rcCopyEmailHtml()');
      expect(html).toContain('rcCopyEmailPlainText()');
    });

    it('has role change history section', () => {
      expect(html).toContain('id="rc-history-section"');
      expect(html).toContain('id="rc-history-table"');
      expect(html).toContain('id="rc-history-body"');
      expect(html).toContain('Role Change History');
    });

    it('loads role-change.js script', () => {
      expect(html).toContain('role-change.js');
    });

    it('preserves existing billing compliance structure', () => {
      // The existing billing compliance elements must still exist
      expect(html).toContain('id="billing-kpi-cards"');
      expect(html).toContain('id="billing-v3-table"');
      expect(html).toContain('id="billing-drilldown"');
      expect(html).toContain('id="ot-dashboard-section"');
    });
  });

  describe('role-change.js functions', () => {
    const js = readPublicFile('js/role-change.js');

    it('defines switchBillingMainTab function', () => {
      expect(js).toContain('function switchBillingMainTab(tab)');
    });

    it('defines initRoleChangeTab function', () => {
      expect(js).toContain('async function initRoleChangeTab()');
    });

    it('defines rcOnWeekChange function', () => {
      expect(js).toContain('function rcOnWeekChange()');
    });

    it('derives week dates from week ending (no date picker dependency)', () => {
      expect(js).toContain('function rcDeriveWeekDates(weekEnding)');
      expect(js).toContain('_rcDateFrom');
      expect(js).toContain('_rcDateTo');
      // No references to rc-date-from or rc-date-to DOM elements
      expect(js).not.toContain("getElementById('rc-date-from')");
      expect(js).not.toContain("getElementById('rc-date-to')");
    });

    it('defines rcAnalyze function for deficit analysis', () => {
      expect(js).toContain('async function rcAnalyze()');
    });

    it('defines rcRenderDeficits function', () => {
      expect(js).toContain('function rcRenderDeficits(data)');
    });

    it('defines rcRenderStaff function', () => {
      expect(js).toContain('function rcRenderStaff()');
    });

    it('defines rcGenerateEmail function', () => {
      expect(js).toContain('async function rcGenerateEmail()');
    });

    it('defines clipboard copy functions', () => {
      expect(js).toContain('async function rcCopyEmailHtml()');
      expect(js).toContain('async function rcCopyEmailPlainText()');
    });

    it('defines rcLoadHistory function', () => {
      expect(js).toContain('async function rcLoadHistory(weekEnding)');
    });

    it('defines initRoleChangeVisibility function', () => {
      expect(js).toContain('function initRoleChangeVisibility()');
    });

    it('fetches from /role-change/deficit-analysis API', () => {
      expect(js).toContain('/role-change/deficit-analysis');
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

    it('fetches from /role-change/suggest API', () => {
      expect(js).toContain('/role-change/suggest');
    });

    it('parses weeks API response as plain array (not object with .weeks)', () => {
      expect(js).toContain('Array.isArray(weeks)');
      expect(js).not.toContain('data.weeks');
    });

    it('renders deficit badges (success, warning, danger)', () => {
      expect(js).toContain('rc-badge-success');
      expect(js).toContain('rc-badge-warning');
      expect(js).toContain('rc-badge-danger');
    });

    it('has auto-suggest logic for deficit PGs', () => {
      expect(js).toContain('deficitPGs');
      expect(js).toContain('suggestedPG');
      expect(js).toContain('suggestedRole');
    });

    it('restricts access to Managers, TLs, and Admin OHRs', () => {
      expect(js).toContain("'Manager'");
      expect(js).toContain("'Team Lead'");
      expect(js).toContain("'740045023'");
      expect(js).toContain("'740044909'");
    });
  });

  describe('CSS styles', () => {
    const css = readPublicFile('css/styles.css');

    it('defines tab bar styles', () => {
      expect(css).toContain('.rc-tab-bar');
      expect(css).toContain('.rc-tab');
      expect(css).toContain('.rc-tab.active');
    });

    it('defines wizard section styles', () => {
      expect(css).toContain('.rc-wizard-section');
      expect(css).toContain('.rc-step-badge');
      expect(css).toContain('.rc-section-title');
    });

    it('defines table styles', () => {
      expect(css).toContain('.rc-table-wrap');
      expect(css).toContain('.rc-table');
      expect(css).toContain('.rc-table th');
      expect(css).toContain('.rc-table td');
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
      expect(css).toContain('.rc-btn-outline');
    });

    it('defines email preview styles', () => {
      expect(css).toContain('.rc-email-preview');
      expect(css).toContain('.rc-email-subject');
      expect(css).toContain('.rc-email-actions');
    });

    it('defines result card styles', () => {
      expect(css).toContain('.rc-result-card');
    });

    it('defines inline select styles', () => {
      expect(css).toContain('.rc-inline-select');
    });

    it('has responsive breakpoints', () => {
      expect(css).toContain('.rc-controls-row');
    });
  });

  describe('Server routes (io-role-change-routes.ts)', () => {
    const routes = readFileSync(join(__dirname, 'io-role-change-routes.ts'), 'utf-8');

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

    it('registers routes under /api/io/role-change', () => {
      expect(routes).toContain('app.use("/api/io/role-change", router)');
    });

    it('exports registerRoleChangeRoutes function', () => {
      expect(routes).toContain('export function registerRoleChangeRoutes');
    });
  });

  describe('Database schema', () => {
    const schema = readFileSync(join(__dirname, '..', 'drizzle', 'schema.ts'), 'utf-8');

    it('defines ioRoleChanges table', () => {
      expect(schema).toContain('export const ioRoleChanges = mysqlTable("io_role_changes"');
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
