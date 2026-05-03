import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const readPublicFile = (name: string) =>
  readFileSync(join(__dirname, 'public', name), 'utf-8');

describe("Manager's Nook", () => {

  describe('HTML structure', () => {
    const html = readPublicFile('index.html');

    it('has managers-nook view container', () => {
      expect(html).toContain('id="view-managers-nook"');
    });

    it('has managers-nook nav item under Horizon', () => {
      expect(html).toContain('id="nav-managers-nook"');
      expect(html).toContain("Manager's Nook");
    });

    it('has month selector', () => {
      expect(html).toContain('id="nook-month-select"');
    });

    it('has 3-month trend toggle', () => {
      expect(html).toContain('id="nook-trend-toggle"');
      expect(html).toContain('Show 3-Month Trend');
    });

    it('has scorecard table with correct headers', () => {
      expect(html).toContain('id="nook-table"');
      expect(html).toContain('id="nook-table-head"');
      expect(html).toContain('id="nook-table-body"');
      expect(html).toContain('Supervisor');
      expect(html).toContain('Valid Tardiness');
      expect(html).toContain('Coaching Coverage');
      expect(html).toContain('Insights (Sub/App)');
      expect(html).toContain('Shrinkage %');
    });

    it('has coaching drill-down modal', () => {
      expect(html).toContain('id="nook-coaching-modal"');
      expect(html).toContain('id="nook-coaching-modal-title"');
      expect(html).toContain('id="nook-coaching-modal-body"');
    });

    it('has empty state element', () => {
      expect(html).toContain('id="nook-empty"');
    });

    it('has loading overlay', () => {
      expect(html).toContain('id="managers-nook-loading"');
    });

    it('has supervisor count display', () => {
      expect(html).toContain('id="nook-supervisor-count"');
    });

    it('does NOT have Productivity Hours nav item', () => {
      expect(html).not.toContain('id="nav-productivity-hrs"');
    });

    it('does NOT have Main Metrics (performance) nav item', () => {
      expect(html).not.toContain('id="nav-performance"');
    });

    it('does NOT have productivity-hrs view', () => {
      expect(html).not.toContain('id="view-productivity-hrs"');
    });

    it('retains Tardiness Validator nav item', () => {
      expect(html).toContain('id="nav-tardiness-validator"');
    });

    it('loads managers-nook.js script', () => {
      expect(html).toContain('managers-nook.js');
    });
  });

  describe('JavaScript (managers-nook.js)', () => {
    const js = readPublicFile('js/managers-nook.js');

    it('defines initManagersNook function', () => {
      expect(js).toContain('function initManagersNook');
    });

    it('defines nookLoadScorecard function', () => {
      expect(js).toContain('function nookLoadScorecard');
    });

    it('defines nookToggleTrend function', () => {
      expect(js).toContain('function nookToggleTrend');
    });

    it('defines nookRender function', () => {
      expect(js).toContain('function nookRender');
    });

    it('defines nookShowMissing function for coaching drill-down', () => {
      expect(js).toContain('function nookShowMissing');
    });

    it('defines nookColorCell helper for color coding', () => {
      expect(js).toContain('function nookColorCell');
    });

    it('fetches from /api/io/managers-nook/available-months', () => {
      expect(js).toContain('/api/io/managers-nook/available-months');
    });

    it('fetches from /api/io/managers-nook/scorecard', () => {
      expect(js).toContain('/api/io/managers-nook/scorecard');
    });

    it('handles trend mode with months parameter', () => {
      expect(js).toContain('months=3');
    });

    it('renders coaching coverage with missing agents count', () => {
      expect(js).toContain('missing_agents');
      expect(js).toContain('missing');
    });
  });

  describe('app.js integration', () => {
    const appJs = readPublicFile('js/app.js');

    it('includes managers-nook in allViews array', () => {
      expect(appJs).toContain("'managers-nook'");
    });

    it('includes managers-nook in horizonViews', () => {
      // horizonViews should contain managers-nook
      const horizonMatch = appJs.match(/horizonViews\s*=\s*\[([^\]]+)\]/);
      expect(horizonMatch).not.toBeNull();
      expect(horizonMatch![1]).toContain('managers-nook');
    });

    it('has title mapping for managers-nook', () => {
      expect(appJs).toContain("'managers-nook'");
      expect(appJs).toContain("Manager's Nook");
    });

    it('calls initManagersNook on view switch', () => {
      expect(appJs).toContain('initManagersNook');
    });

    it('does NOT reference productivity-hrs in allViews', () => {
      const allViewsMatch = appJs.match(/allViews\s*=\s*\[([^\]]+)\]/);
      expect(allViewsMatch).not.toBeNull();
      expect(allViewsMatch![1]).not.toContain('productivity-hrs');
    });

    it('does NOT reference performance in allViews', () => {
      const allViewsMatch = appJs.match(/allViews\s*=\s*\[([^\]]+)\]/);
      expect(allViewsMatch).not.toBeNull();
      expect(allViewsMatch![1]).not.toContain("'performance'");
    });

    it('has Manager/Admin role check for nook nav visibility', () => {
      expect(appJs).toContain('nav-managers-nook');
      expect(appJs).toContain('isManagerOrAdmin');
    });
  });

  describe('CSS styles', () => {
    const css = readPublicFile('css/styles.css');

    it('has nook-table styles', () => {
      expect(css).toContain('.nook-table');
    });

    it('has coaching modal styles', () => {
      expect(css).toContain('#nook-coaching-modal');
    });
  });

  describe('Server routes (io/managers-nook.ts)', () => {
    const routeFile = readFileSync(join(__dirname, 'io/managers-nook.ts'), 'utf-8');

    it('defines scorecard endpoint', () => {
      expect(routeFile).toContain('"/scorecard"');
    });

    it('defines available-months endpoint', () => {
      expect(routeFile).toContain('"/available-months"');
    });

    it('queries io_tardiness for valid tardiness', () => {
      expect(routeFile).toContain("validation_status = 'Valid'");
    });

    it('queries io_coaching for coaching coverage', () => {
      expect(routeFile).toContain('io_coaching');
      expect(routeFile).toContain('coachee_sup');
    });

    it('queries io_insights for insights metrics', () => {
      expect(routeFile).toContain('io_insights');
      expect(routeFile).toContain("status = 'Approved'");
    });

    it('calculates shrinkage from attendance tags', () => {
      expect(routeFile).toContain('io_attendance');
      expect(routeFile).toContain("tag IN ('PL','ML')");
      expect(routeFile).toContain("tag = 'UPL'");
    });

    it('computes shrinkage percentage correctly: (PL+UPL)/(P+PL+UPL)*100', () => {
      expect(routeFile).toContain('((pl + upl) / denom) * 100');
    });

    it('returns missing agents for coaching coverage', () => {
      expect(routeFile).toContain('missing_agents');
      expect(routeFile).toContain('GROUP_CONCAT');
    });

    it('exports router as default', () => {
      expect(routeFile).toContain('export default router');
    });

    it('is mounted under /managers-nook prefix via barrel router', () => {
      const barrel = readFileSync(join(__dirname, 'io/index.ts'), 'utf-8');
      expect(barrel).toContain('managersNookRouter');
      expect(barrel).toContain('"/managers-nook"');
    });
  });
});
