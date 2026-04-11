import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const readPublicFile = (name: string) =>
  readFileSync(join(__dirname, 'public', name), 'utf-8');

describe('Billing Compliance Dashboard V3', () => {
  describe('HTML structure', () => {
    const html = readPublicFile('index.html');

    it('has KPI cards container with 4 cards', () => {
      expect(html).toContain('id="billing-kpi-cards"');
      expect(html).toContain('id="kpi-compliance"');
      expect(html).toContain('id="kpi-hours-gap"');
      expect(html).toContain('id="kpi-ot-needed"');
      expect(html).toContain('id="kpi-hc-needed"');
    });

    it('has compliance table with correct column headers', () => {
      expect(html).toContain('id="billing-v3-table"');
      expect(html).toContain('PG × Role');
      expect(html).toContain('Delivered Hrs');
      expect(html).toContain('Target Hrs');
      expect(html).toContain('Compliance %');
      expect(html).toContain('Goal 98%');
      expect(html).toContain('Goal 100%');
      expect(html).toContain('Goal 102%');
      expect(html).toContain('Pred. UPL');
      expect(html).toContain('Pred. OT');
      expect(html).toContain('OTs Needed');
      expect(html).toContain('HC Needed');
    });

    it('has drill-down panel', () => {
      expect(html).toContain('id="billing-drilldown"');
      expect(html).toContain('id="billing-drilldown-title"');
      expect(html).toContain('id="billing-drilldown-body"');
    });

    it('has week selector', () => {
      expect(html).toContain('id="billing-week-select"');
    });

    it('has week info bar', () => {
      expect(html).toContain('id="billing-week-info"');
      expect(html).toContain('id="billing-week-range"');
      expect(html).toContain('id="billing-days-badge"');
    });

    it('has tab bar with Billing Dashboard and OT Dashboard tabs', () => {
      expect(html).toContain('Billing Dashboard');
      expect(html).toContain('OT Dashboard');
      expect(html).toContain('id="billing-tab-billing-dashboard"');
      expect(html).toContain('id="billing-tab-ot-dashboard"');
    });

    it('does NOT have Billing Compliance V2 tab in the billing page tabs', () => {
      // The V2 tab was removed from the billing page tab bar
      // (V2 admin tools in Admin section are separate and still exist)
      expect(html).not.toContain('billing-tab-v2');
    });
  });

  describe('billing.js functions', () => {
    const js = readPublicFile('js/billing.js');

    it('defines initBillingCompliance function', () => {
      expect(js).toContain('async function initBillingCompliance()');
    });

    it('defines loadBillingCompliance function', () => {
      expect(js).toContain('async function loadBillingCompliance()');
    });

    it('defines renderBillingKPIs function', () => {
      expect(js).toContain('function renderBillingKPIs(data)');
    });

    it('defines renderBillingComplianceTable function', () => {
      expect(js).toContain('function renderBillingComplianceTable(data)');
    });

    it('defines showBillingDrilldown function', () => {
      expect(js).toContain('function showBillingDrilldown(row)');
    });

    it('fetches from /billing-compliance API (not client-side calculation)', () => {
      expect(js).toContain('/billing-compliance?week_ending=');
      expect(js).toContain('/billing-compliance/weeks');
    });

    it('does NOT use old billing code constants', () => {
      expect(js).not.toContain('BILLING_CODE_LABELS');
      expect(js).not.toContain('BILLING_CODE_ORDER');
      expect(js).not.toContain('BILLING_TARGET_HISTORY');
    });

    it('renders traffic-light badges', () => {
      expect(js).toContain('bc-badge');
      expect(js).toContain('bc-green');
      expect(js).toContain('bc-amber');
      expect(js).toContain('bc-red');
    });

    it('renders progress bars', () => {
      expect(js).toContain('bc-progress-wrap');
      expect(js).toContain('bc-progress-fill');
      expect(js).toContain('bc-marker');
    });

    it('sorts by compliance % ascending (worst first)', () => {
      expect(js).toContain('.sort((a, b) => a.compliance_pct - b.compliance_pct)');
    });

    it('preserves OT Dashboard functions', () => {
      expect(js).toContain('async function otDashInit()');
      expect(js).toContain('async function otDashFetchRequests()');
      expect(js).toContain('function otDashApplyFilter()');
      expect(js).toContain('function otDashRender()');
      expect(js).toContain('async function otDashApply()');
      expect(js).toContain('async function otDashOpenForm()');
    });

    it('renders drill-down with daily breakdown table', () => {
      expect(js).toContain('day_breakdown');
      expect(js).toContain('DAILY BREAKDOWN');
    });
  });

  describe('CSS styles', () => {
    const css = readPublicFile('css/styles.css');

    it('defines billing KPI grid styles', () => {
      expect(css).toContain('.billing-kpi-grid');
      expect(css).toContain('.billing-kpi-card');
    });

    it('defines traffic-light color variables', () => {
      expect(css).toContain('--bc-green');
      expect(css).toContain('--bc-amber');
      expect(css).toContain('--bc-red');
    });

    it('defines badge styles', () => {
      expect(css).toContain('.bc-badge');
      expect(css).toContain('.bc-badge.bc-green');
      expect(css).toContain('.bc-badge.bc-amber');
      expect(css).toContain('.bc-badge.bc-red');
    });

    it('defines progress bar styles', () => {
      expect(css).toContain('.bc-progress-wrap');
      expect(css).toContain('.bc-progress-track');
      expect(css).toContain('.bc-progress-fill');
      expect(css).toContain('.bc-marker');
    });

    it('defines drill-down summary styles', () => {
      expect(css).toContain('.bc-drill-summary');
      expect(css).toContain('.bc-drill-stat');
    });

    it('defines KPI state classes', () => {
      expect(css).toContain('.billing-kpi-card.kpi-good');
      expect(css).toContain('.billing-kpi-card.kpi-warn');
      expect(css).toContain('.billing-kpi-card.kpi-bad');
    });
  });
});
