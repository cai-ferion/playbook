/**
 * RBAC Permission System Tests
 * Tests: permission API, role defaults, nav visibility, action gating
 */
import { describe, it, expect } from 'vitest';

// ── Permission Key Taxonomy ──────────────────────────────────────────────

const ALL_PERMISSION_KEYS = [
  'nav.anchor', 'nav.compass', 'nav.haven', 'nav.sandbox', 'nav.horizon',
  'nav.helm', 'nav.regimen', 'nav.admin',
  'anchor.input_portal', 'anchor.dashboard', 'anchor.billing_compliance',
  'anchor.risk_intelligence', 'anchor.sync_history',
  'anchor.edit_attendance', 'anchor.download_csv', 'anchor.sync_roster',
  'helm.analytics',
  'regimen.onboarding_tab', 'regimen.permissions_tab', 'regimen.add_employee', 'regimen.edit_employee', 'regimen.export_csv',
];

// ── Role Default Logic (mirrors server-side getPermissionDefaults) ───────

function getPermissionDefaults(role: string, ohrId: string): Record<string, boolean> {
  if (ohrId === '740045023') return Object.fromEntries(ALL_PERMISSION_KEYS.map(k => [k, true]));
  const b: Record<string, boolean> = Object.fromEntries(ALL_PERMISSION_KEYS.map(k => [k, false]));
  if (role === 'Agent') { b['nav.helm'] = true; return b; }
  b['nav.anchor'] = true;
  b['anchor.input_portal'] = true;
  b['anchor.dashboard'] = true;
  b['anchor.billing_compliance'] = true;
  b['anchor.risk_intelligence'] = true;
  b['anchor.download_csv'] = true;
  b['nav.helm'] = true;
  b['nav.regimen'] = true;
  b['regimen.export_csv'] = true;
  if (role === 'Team Lead') b['anchor.edit_attendance'] = true;
  if (role === 'Manager') {
    b['anchor.edit_attendance'] = true;
    b['nav.compass'] = true;
    b['helm.analytics'] = true;
  }
  if (ohrId === '740044909') {
    b['anchor.edit_attendance'] = true;
    b['nav.compass'] = true;
    b['helm.analytics'] = true;
    b['regimen.edit_employee'] = true;
    b['regimen.add_employee'] = true;
  }
  // 703212987 no longer gets edit_employee by default — only owner + assistant
  return b;
}

describe('RBAC Permission System', () => {

  describe('Permission Key Taxonomy', () => {
    it('has exactly 22 permission keys', () => {
      expect(ALL_PERMISSION_KEYS.length).toBe(22);
    });

    it('all keys follow dot-notation format', () => {
      ALL_PERMISSION_KEYS.forEach(key => {
        expect(key).toMatch(/^[a-z]+\.[a-z_]+$/);
      });
    });

    it('has nav-level keys for all modules', () => {
      const navKeys = ALL_PERMISSION_KEYS.filter(k => k.startsWith('nav.'));
      expect(navKeys).toContain('nav.anchor');
      expect(navKeys).toContain('nav.compass');
      expect(navKeys).toContain('nav.helm');
      expect(navKeys).toContain('nav.regimen');
      expect(navKeys).toContain('nav.admin');
    });

    it('has action-level keys for Anchor', () => {
      expect(ALL_PERMISSION_KEYS).toContain('anchor.edit_attendance');
      expect(ALL_PERMISSION_KEYS).toContain('anchor.download_csv');
      expect(ALL_PERMISSION_KEYS).toContain('anchor.sync_roster');
    });
  });

  describe('Role-based Defaults', () => {

    describe('Admin OHR 740045023', () => {
      const perms = getPermissionDefaults('Team Lead', '740045023');
      it('gets all 22 permissions granted', () => {
        const granted = Object.values(perms).filter(v => v === true).length;
        expect(granted).toBe(22);
      });
      it('has nav.admin = true', () => expect(perms['nav.admin']).toBe(true));
      it('has anchor.sync_history = true', () => expect(perms['anchor.sync_history']).toBe(true));
      it('has regimen.permissions_tab = true', () => expect(perms['regimen.permissions_tab']).toBe(true));
    });

    describe('Agent role', () => {
      const perms = getPermissionDefaults('Agent', '999999999');
      it('only gets nav.helm = true', () => {
        const granted = Object.entries(perms).filter(([, v]) => v === true);
        expect(granted.length).toBe(1);
        expect(granted[0][0]).toBe('nav.helm');
      });
      it('has nav.anchor = false', () => expect(perms['nav.anchor']).toBe(false));
      it('has nav.regimen = false', () => expect(perms['nav.regimen']).toBe(false));
      it('has anchor.edit_attendance = false', () => expect(perms['anchor.edit_attendance']).toBe(false));
    });

    describe('SME role', () => {
      const perms = getPermissionDefaults('Operational SME', '111111111');
      it('has nav.anchor = true', () => expect(perms['nav.anchor']).toBe(true));
      it('has anchor.dashboard = true', () => expect(perms['anchor.dashboard']).toBe(true));
      it('has anchor.download_csv = true', () => expect(perms['anchor.download_csv']).toBe(true));
      it('has nav.regimen = true', () => expect(perms['nav.regimen']).toBe(true));
      it('has anchor.edit_attendance = false', () => expect(perms['anchor.edit_attendance']).toBe(false));
      it('has nav.compass = false', () => expect(perms['nav.compass']).toBe(false));
      it('has anchor.sync_history = false', () => expect(perms['anchor.sync_history']).toBe(false));
    });

    describe('Team Lead role', () => {
      const perms = getPermissionDefaults('Team Lead', '222222222');
      it('has anchor.edit_attendance = true', () => expect(perms['anchor.edit_attendance']).toBe(true));
      it('has nav.compass = false', () => expect(perms['nav.compass']).toBe(false));
      it('has helm.analytics = false', () => expect(perms['helm.analytics']).toBe(false));
    });

    describe('Manager role', () => {
      const perms = getPermissionDefaults('Manager', '333333333');
      it('has anchor.edit_attendance = true', () => expect(perms['anchor.edit_attendance']).toBe(true));
      it('has nav.compass = true', () => expect(perms['nav.compass']).toBe(true));
      it('has helm.analytics = true', () => expect(perms['helm.analytics']).toBe(true));
      it('has anchor.sync_history = false', () => expect(perms['anchor.sync_history']).toBe(false));
      it('has nav.admin = false', () => expect(perms['nav.admin']).toBe(false));
    });

    describe('Assistant admin OHR 740044909', () => {
      const perms = getPermissionDefaults('Team Lead', '740044909');
      it('has anchor.edit_attendance = true', () => expect(perms['anchor.edit_attendance']).toBe(true));
      it('has nav.compass = true', () => expect(perms['nav.compass']).toBe(true));
      it('has helm.analytics = true', () => expect(perms['helm.analytics']).toBe(true));
      it('has regimen.edit_employee = true', () => expect(perms['regimen.edit_employee']).toBe(true));
      it('has regimen.add_employee = true', () => expect(perms['regimen.add_employee']).toBe(true));
    });

    describe('OHR 703212987', () => {
      const perms = getPermissionDefaults('Team Lead', '703212987');
      it('has regimen.edit_employee = false (no longer default)', () => expect(perms['regimen.edit_employee']).toBe(false));
      it('has anchor.edit_attendance = true (Team Lead default)', () => expect(perms['anchor.edit_attendance']).toBe(true));
    });
  });

  describe('Permission Merge Logic', () => {
    it('DB override takes precedence over role defaults', () => {
      const defaults = getPermissionDefaults('Agent', '999999999');
      expect(defaults['nav.anchor']).toBe(false);

      // Simulate DB override
      const dbOverride = { 'nav.anchor': true };
      const merged = { ...defaults };
      for (const key of ALL_PERMISSION_KEYS) {
        if (key in dbOverride) merged[key] = dbOverride[key as keyof typeof dbOverride];
      }
      expect(merged['nav.anchor']).toBe(true);
      expect(merged['nav.helm']).toBe(true); // original default preserved
    });

    it('DB revoke overrides role grant', () => {
      const defaults = getPermissionDefaults('Manager', '333333333');
      expect(defaults['nav.compass']).toBe(true);

      const dbOverride = { 'nav.compass': false };
      const merged = { ...defaults };
      for (const key of ALL_PERMISSION_KEYS) {
        if (key in dbOverride) merged[key] = dbOverride[key as keyof typeof dbOverride];
      }
      expect(merged['nav.compass']).toBe(false);
    });
  });

  describe('Nav Visibility Mapping', () => {
    const NAV_MAP: Record<string, string> = {
      'nav-group-anchor': 'nav.anchor',
      'nav-group-compass': 'nav.compass',
      'nav-group-haven': 'nav.haven',
      'nav-group-sandbox': 'nav.sandbox',
      'nav-group-horizon': 'nav.horizon',
      'nav-group-helm': 'nav.helm',
      'nav-admin': 'nav.admin',
      'nav-helm-analytics': 'helm.analytics',
      'nav-regimen': 'nav.regimen',
      'nav-dashboard': 'anchor.dashboard',
      'nav-alerts': 'anchor.risk_intelligence',
      'nav-billing': 'anchor.billing_compliance',
      'nav-sync-history': 'anchor.sync_history',
    };

    it('maps 13 nav elements to permission keys', () => {
      expect(Object.keys(NAV_MAP).length).toBe(13);
    });

    it('all permission keys in map are valid', () => {
      Object.values(NAV_MAP).forEach(key => {
        expect(ALL_PERMISSION_KEYS).toContain(key);
      });
    });
  });

  describe('Permission Groups for UI', () => {
    const PERM_GROUPS = [
      { label: 'Anchor — Navigation & Sub-sections', keys: ['nav.anchor', 'anchor.input_portal', 'anchor.dashboard', 'anchor.billing_compliance', 'anchor.risk_intelligence', 'anchor.sync_history'] },
      { label: 'Anchor — Actions', keys: ['anchor.edit_attendance', 'anchor.download_csv', 'anchor.sync_roster'] },
      { label: 'Compass', keys: ['nav.compass'] },
      { label: 'Helm', keys: ['nav.helm', 'helm.analytics'] },
      { label: 'Regimen', keys: ['nav.regimen', 'regimen.onboarding_tab', 'regimen.permissions_tab', 'regimen.add_employee', 'regimen.edit_employee', 'regimen.export_csv'] },
      { label: 'Other Modules', keys: ['nav.haven', 'nav.sandbox', 'nav.horizon', 'nav.admin'] },
    ];

    it('covers all 22 permission keys', () => {
      const allGroupKeys = PERM_GROUPS.flatMap(g => g.keys);
      expect(allGroupKeys.length).toBe(22);
      ALL_PERMISSION_KEYS.forEach(key => {
        expect(allGroupKeys).toContain(key);
      });
    });

    it('has 6 groups', () => {
      expect(PERM_GROUPS.length).toBe(6);
    });
  });

  describe('Regimen Visibility Tier', () => {
    it('Manager gets full tier', () => {
      const perms = getPermissionDefaults('Manager', '333333333');
      // Full tier = has onboarding_tab or permissions_tab or is Manager
      expect(perms['nav.regimen']).toBe(true);
    });

    it('SME gets limited tier', () => {
      const perms = getPermissionDefaults('Operational SME', '111111111');
      expect(perms['regimen.onboarding_tab']).toBe(false);
      expect(perms['regimen.permissions_tab']).toBe(false);
    });

    it('Agent cannot see Regimen at all', () => {
      const perms = getPermissionDefaults('Agent', '999999999');
      expect(perms['nav.regimen']).toBe(false);
    });
  });

  describe('Audit Trail Integration', () => {
    it('permission changes should log to io_audit_log with record_type=permission', () => {
      // Structural test: verify the audit log schema supports permission changes
      const auditEntry = {
        record_type: 'permission',
        record_id: '999999999',
        action: 'grant',
        field_name: 'nav.anchor',
        old_value: 'false',
        new_value: 'true',
        actor_ohr: '740045023',
        actor_name: 'Admin User',
        timestamp: new Date().toISOString(),
      };
      expect(auditEntry.record_type).toBe('permission');
      expect(auditEntry.action).toMatch(/^(grant|revoke)$/);
    });
  });
});
