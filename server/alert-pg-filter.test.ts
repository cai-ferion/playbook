import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Planning Group filter in Risk Intelligence (Anchor)
 * Tests:
 * 1. HTML: alert-filter-pg dropdown exists in index.html
 * 2. data.js: All 6 detect functions include planningGroup in alert objects
 * 3. app.js: populateAlertFilterDropdowns populates PG dropdown
 * 4. app.js: renderAlerts applies pgFilter
 * 5. app.js: updateAlertNavBadge applies pgFilter
 * 6. app.js: applyAlertFilters reads PG value
 * 7. Cache versions are current
 */

const indexHtml = fs.readFileSync(path.resolve(__dirname, 'public/index.html'), 'utf-8');
const dataJs = fs.readFileSync(path.resolve(__dirname, 'public/js/data.js'), 'utf-8');
const appJs = fs.readFileSync(path.resolve(__dirname, 'public/js/app.js'), 'utf-8');

describe('Risk Intelligence — Planning Group Filter', () => {
  describe('HTML structure', () => {
    it('has alert-filter-pg select element', () => {
      expect(indexHtml).toContain('id="alert-filter-pg"');
    });

    it('has Planning Group label', () => {
      expect(indexHtml).toContain('Planning Group:');
    });

    it('has All Planning Groups default option', () => {
      expect(indexHtml).toContain('All Planning Groups');
    });

    it('filter-pg fires applyAlertFilters on change', () => {
      expect(indexHtml).toContain('id="alert-filter-pg" onchange="void applyAlertFilters()"');
    });
  });

  describe('data.js — planningGroup in alert objects', () => {
    const detectFunctions = [
      'detectUPLViolations',
      'detectNCNSPipeline',
      'detectOffboardingRisk',
      'detectWeeklyLateTrend',
      'detectMonthlyLateEscalation',
      'detectActiveML',
    ];

    for (const fn of detectFunctions) {
      it(`${fn} includes planningGroup in alert objects`, () => {
        const fnStart = dataJs.indexOf(`function ${fn}`);
        expect(fnStart).toBeGreaterThan(-1);
        // Find the next function or end of file
        const nextFnMatch = dataJs.slice(fnStart + 10).search(/\nfunction /);
        const fnEnd = nextFnMatch > -1 ? fnStart + 10 + nextFnMatch : dataJs.length;
        const fnBody = dataJs.slice(fnStart, fnEnd);
        expect(fnBody).toContain('planningGroup');
      });
    }
  });

  describe('app.js — populateAlertFilterDropdowns', () => {
    it('populates alert-filter-pg dropdown', () => {
      const fnStart = appJs.indexOf('function populateAlertFilterDropdowns');
      expect(fnStart).toBeGreaterThan(-1);
      const fnBody = appJs.slice(fnStart, fnStart + 3000);
      expect(fnBody).toContain("alert-filter-pg");
      expect(fnBody).toContain("All Planning Groups");
    });

    it('preserves previous PG selection', () => {
      const fnStart = appJs.indexOf('function populateAlertFilterDropdowns');
      const fnBody = appJs.slice(fnStart, fnStart + 3000);
      expect(fnBody).toContain('prevPG');
      expect(fnBody).toContain('alertFilters.planningGroup');
    });

    it('extracts unique PGs from appState.records', () => {
      const fnStart = appJs.indexOf('function populateAlertFilterDropdowns');
      const fnBody = appJs.slice(fnStart, fnStart + 3000);
      expect(fnBody).toContain('actualPlanningGroup');
      expect(fnBody).toContain('pgSet');
    });
  });

  describe('app.js — renderAlerts applies PG filter', () => {
    it('reads pgFilter from alertFilters', () => {
      const fnStart = appJs.indexOf('function renderAlerts()');
      expect(fnStart).toBeGreaterThan(-1);
      const fnBody = appJs.slice(fnStart, fnStart + 3000);
      expect(fnBody).toContain('alertFilters.planningGroup');
    });

    it('filters tab counts by planningGroup', () => {
      const fnStart = appJs.indexOf('function renderAlerts()');
      const fnBody = appJs.slice(fnStart, fnStart + 3000);
      // Should have pgFilter !== 'All' check in tab count section
      const tabSection = fnBody.slice(0, fnBody.indexOf('const currentCat'));
      expect(tabSection).toContain("pgFilter !== 'All'");
      expect(tabSection).toContain('a.planningGroup');
    });

    it('filters alert list by planningGroup', () => {
      const fnStart = appJs.indexOf('function renderAlerts()');
      const fnBody = appJs.slice(fnStart, fnStart + 4000);
      // The main alert list filtering should also apply pgFilter
      // Count occurrences of pgFilter check — should be at least 2 (tab counts + list)
      const matches = fnBody.match(/pgFilter !== 'All'/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('app.js — updateAlertNavBadge applies PG filter', () => {
    it('reads pgFilter from alertFilters', () => {
      const fnStart = appJs.indexOf('function updateAlertNavBadge()');
      expect(fnStart).toBeGreaterThan(-1);
      const fnBody = appJs.slice(fnStart, fnStart + 2000);
      expect(fnBody).toContain('alertFilters.planningGroup');
    });

    it('filters badge counts by planningGroup', () => {
      const fnStart = appJs.indexOf('function updateAlertNavBadge()');
      const fnBody = appJs.slice(fnStart, fnStart + 2000);
      expect(fnBody).toContain("pgFilter !== 'All'");
      expect(fnBody).toContain('a.planningGroup');
    });
  });

  describe('app.js — applyAlertFilters reads PG value', () => {
    it('reads alert-filter-pg element value', () => {
      const fnStart = appJs.indexOf('async function applyAlertFilters()');
      expect(fnStart).toBeGreaterThan(-1);
      const fnBody = appJs.slice(fnStart, fnStart + 3000);
      expect(fnBody).toContain("alert-filter-pg");
    });

    it('saves PG to appState.alertFilters.planningGroup', () => {
      const fnStart = appJs.indexOf('async function applyAlertFilters()');
      const fnBody = appJs.slice(fnStart, fnStart + 3000);
      expect(fnBody).toContain('alertFilters.planningGroup = selectedPG');
    });
  });

  describe('Cache versions', () => {
    it('data.js version is v107', () => {
      expect(indexHtml).toContain('data.js?v=108');
    });

    it('app.js version is v122', () => {
      expect(indexHtml).toContain('app.js?v=127');
    });
  });
});
