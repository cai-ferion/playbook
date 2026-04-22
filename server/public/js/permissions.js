/**
 * Permissions Tab — Admin-only RBAC management panel in Regimen.
 * Visible only to OHR 740045023.
 *
 * Features:
 * - Table of all employees with permission summary (granted count / total)
 * - Click row to open detail panel with grouped toggles
 * - Permission groups for quick toggling
 * - Search by name/OHR, filter by role
 * - Save changes with audit trail
 * - Reset to role-based defaults
 */

/* global currentUser, showToast */

// ── Permission Key Metadata ──────────────────────────────────────────────

const PERM_GROUPS = [
  {
    label: 'Anchor — Navigation & Sub-sections',
    keys: [
      { key: 'nav.anchor', label: 'Anchor (entire module)' },
      { key: 'anchor.input_portal', label: 'Input Portal' },
      { key: 'anchor.dashboard', label: 'Dashboard' },
      { key: 'anchor.billing_compliance', label: 'Billing Compliance' },
      { key: 'anchor.risk_intelligence', label: 'Risk Intelligence' },
    ],
  },
  {
    label: 'Anchor — Actions',
    keys: [
      { key: 'anchor.edit_attendance', label: 'Edit Attendance Records' },
      { key: 'anchor.download_csv', label: 'Download CSV (Input Portal)' },
      { key: 'anchor.sync_roster', label: 'Trigger Sync Roster' },
    ],
  },
  {
    label: 'Compass',
    keys: [
      { key: 'nav.compass', label: 'Compass (entire module)' },
    ],
  },
  {
    label: 'Helm',
    keys: [
      { key: 'nav.helm', label: 'Helm (entire module)' },
      { key: 'helm.analytics', label: 'Helm Analytics' },
    ],
  },
  {
    label: 'Regimen',
    keys: [
      { key: 'nav.regimen', label: 'Regimen (Roster view)' },
      { key: 'regimen.onboarding_tab', label: 'Onboarding Tab' },
      { key: 'regimen.permissions_tab', label: 'Permissions Tab' },
      { key: 'regimen.add_employee', label: 'Add Employee' },
      { key: 'regimen.edit_employee', label: 'Edit Employee Records' },
      { key: 'regimen.export_csv', label: 'Export CSV' },
      { key: 'regimen.full_columns', label: 'Full Column Access' },
    ],
  },
  {
    label: 'Other Modules',
    keys: [
      { key: 'nav.haven', label: 'Haven' },
      { key: 'nav.sandbox', label: 'Sandbox' },
      { key: 'nav.horizon', label: 'Horizon' },
      { key: 'nav.admin', label: 'Admin Tools' },
    ],
  },
];

const ALL_PERM_KEYS = PERM_GROUPS.flatMap(g => g.keys.map(k => k.key));

// ── State ────────────────────────────────────────────────────────────────

const permState = {
  employees: [],       // [{ohr_id, full_name, actual_role, ...}]
  allPerms: {},        // { ohr_id: { key: bool } }
  filtered: [],        // filtered employee list
  page: 1,
  pageSize: 20,
  detailOhr: null,     // currently editing OHR
  detailPerms: {},     // working copy of permissions being edited
  loaded: false,
};

// ── Init ─────────────────────────────────────────────────────────────────

async function initPermissions() {
  if (permState.loaded) { permRenderTable(); return; }
  try {
    // Fetch all employees
    const empRes = await fetch('/api/io/employees?limit=3000');
    const empData = await empRes.json();
    permState.employees = empData.filter(e => e.employement_status === 'Active')
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));

    // Fetch all permissions
    const permRes = await fetch('/api/io/permissions');
    const permData = await permRes.json();
    permState.allPerms = permData.permissions || {};

    permState.loaded = true;
    permFilterTable();
  } catch (err) {
    console.error('[PERMISSIONS] Init error:', err);
  }
}

// ── Filter & Render Table ────────────────────────────────────────────────

function permFilterTable() {
  // Try admin-perm- IDs first (Admin Tools), fall back to perm- IDs (legacy)
  const search = (document.getElementById('admin-perm-search')?.value || document.getElementById('perm-search')?.value || '').toLowerCase().trim();
  const roleFilter = document.getElementById('admin-perm-role-filter')?.value || document.getElementById('perm-role-filter')?.value || '';

  permState.filtered = permState.employees.filter(emp => {
    if (roleFilter && emp.actual_role !== roleFilter) return false;
    if (search) {
      const haystack = `${emp.full_name || ''} ${emp.ohr_id || ''}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  permState.page = 1;
  permRenderTable();
}

function permRenderTable() {
  const thead = document.getElementById('admin-perm-table-head') || document.getElementById('perm-table-head');
  const tbody = document.getElementById('admin-perm-table-body') || document.getElementById('perm-table-body');
  if (!thead || !tbody) return;

  thead.innerHTML = `<tr>
    <th style="min-width:100px;">OHR</th>
    <th style="min-width:180px;">Name</th>
    <th style="min-width:100px;">Role</th>
    <th style="min-width:80px;text-align:center;">Granted</th>
    <th style="min-width:80px;text-align:center;">Denied</th>
    <th style="min-width:60px;text-align:center;">Action</th>
  </tr>`;

  const { filtered, page, pageSize } = permState;
  const start = (page - 1) * pageSize;
  const pageData = filtered.slice(start, start + pageSize);

  if (pageData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--fg-muted);">No employees found</td></tr>';
    permRenderPagination();
    return;
  }

  tbody.innerHTML = pageData.map(emp => {
    const perms = permState.allPerms[emp.ohr_id] || {};
    const granted = ALL_PERM_KEYS.filter(k => perms[k] === true || perms[k] === 1).length;
    const denied = ALL_PERM_KEYS.length - granted;

    return `<tr style="cursor:pointer;" onclick="permOpenDetail('${emp.ohr_id}')">
      <td style="font-family:var(--font-mono);font-size:12px;">${emp.ohr_id}</td>
      <td>${emp.full_name || '—'}</td>
      <td><span class="role-badge role-${(emp.actual_role || '').toLowerCase().replace(/\s+/g, '-')}">${emp.actual_role || '—'}</span></td>
      <td style="text-align:center;"><span style="color:var(--success);font-weight:600;">${granted}</span></td>
      <td style="text-align:center;"><span style="color:var(--danger);font-weight:600;">${denied}</span></td>
      <td style="text-align:center;">
        <button class="btn btn-outline btn-sm" onclick="event.stopPropagation();permOpenDetail('${emp.ohr_id}')" style="font-size:11px;padding:2px 10px;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Edit
        </button>
      </td>
    </tr>`;
  }).join('');

  permRenderPagination();
}

function permRenderPagination() {
  const container = document.getElementById('admin-perm-pagination') || document.getElementById('perm-pagination');
  if (!container) return;
  const { filtered, page, pageSize } = permState;
  const totalPages = Math.ceil(filtered.length / pageSize) || 1;

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;font-size:12px;color:var(--fg-muted);">
      <span>Showing ${Math.min((page - 1) * pageSize + 1, filtered.length)}–${Math.min(page * pageSize, filtered.length)} of ${filtered.length}</span>
      <div style="display:flex;gap:4px;">
        <button class="btn btn-outline btn-sm" ${page <= 1 ? 'disabled' : ''} onclick="permState.page--;permRenderTable()" style="font-size:11px;padding:2px 8px;">Prev</button>
        <span style="padding:4px 8px;">Page ${page} of ${totalPages}</span>
        <button class="btn btn-outline btn-sm" ${page >= totalPages ? 'disabled' : ''} onclick="permState.page++;permRenderTable()" style="font-size:11px;padding:2px 8px;">Next</button>
      </div>
    </div>`;
}

// ── Detail Panel ─────────────────────────────────────────────────────────

function permOpenDetail(ohrId) {
  const emp = permState.employees.find(e => e.ohr_id === ohrId);
  if (!emp) return;

  permState.detailOhr = ohrId;
  // Deep copy current permissions or start with empty
  const current = permState.allPerms[ohrId] || {};
  permState.detailPerms = {};
  for (const key of ALL_PERM_KEYS) {
    permState.detailPerms[key] = current[key] === true || current[key] === 1 ? true : false;
  }

  // Render header
  const titleEl = document.getElementById('admin-perm-detail-title') || document.getElementById('perm-detail-title');
  if (titleEl) titleEl.textContent = `${emp.full_name || ohrId} — Permissions`;

  // Render body
  const body = document.getElementById('admin-perm-detail-body') || document.getElementById('perm-detail-body');
  body.innerHTML = `
    <div style="padding:0 16px 8px;font-size:12px;color:var(--fg-muted);border-bottom:1px solid var(--border);margin-bottom:12px;">
      <strong>OHR:</strong> ${ohrId} &nbsp;|&nbsp; <strong>Role:</strong> ${emp.actual_role || '—'} &nbsp;|&nbsp; <strong>Status:</strong> ${emp.employement_status || '—'}
    </div>
    ${PERM_GROUPS.map(group => `
      <div style="margin-bottom:16px;padding:0 16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <h4 style="font-size:13px;font-weight:700;color:var(--fg-primary);margin:0;">${group.label}</h4>
          <div style="display:flex;gap:4px;">
            <button class="btn btn-outline btn-sm" onclick="permGroupToggle('${group.label}', true)" style="font-size:10px;padding:1px 6px;">All On</button>
            <button class="btn btn-outline btn-sm" onclick="permGroupToggle('${group.label}', false)" style="font-size:10px;padding:1px 6px;">All Off</button>
          </div>
        </div>
        ${group.keys.map(k => `
          <label style="display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;font-size:13px;" class="perm-toggle-row">
            <input type="checkbox" class="perm-checkbox" data-key="${k.key}" ${permState.detailPerms[k.key] ? 'checked' : ''} onchange="permState.detailPerms['${k.key}']=this.checked;permUpdateSaveBtn()">
            <span>${k.label}</span>
            <span style="margin-left:auto;font-size:10px;font-family:var(--font-mono);color:var(--fg-muted);">${k.key}</span>
          </label>
        `).join('')}
      </div>
    `).join('')}
  `;

  // Show panel (module-form-overlay pattern)
  const overlay = document.getElementById('admin-perm-detail-overlay') || document.getElementById('perm-detail-overlay');
  if (overlay) overlay.style.display = 'flex';
  permUpdateSaveBtn();
}

function permCloseDetail() {
  const overlay = document.getElementById('admin-perm-detail-overlay') || document.getElementById('perm-detail-overlay');
  if (overlay) overlay.style.display = 'none';
  permState.detailOhr = null;
}

function permGroupToggle(groupLabel, value) {
  const group = PERM_GROUPS.find(g => g.label === groupLabel);
  if (!group) return;
  for (const k of group.keys) {
    permState.detailPerms[k.key] = value;
  }
  // Update checkboxes
  document.querySelectorAll('.perm-checkbox').forEach(cb => {
    if (group.keys.some(k => k.key === cb.dataset.key)) {
      cb.checked = value;
    }
  });
  permUpdateSaveBtn();
}

function permUpdateSaveBtn() {
  const btn = document.getElementById('admin-perm-save-btn') || document.getElementById('perm-save-btn');
  if (!btn) return;
  // Check if anything changed
  const ohrId = permState.detailOhr;
  const current = permState.allPerms[ohrId] || {};
  let changed = false;
  for (const key of ALL_PERM_KEYS) {
    const curVal = current[key] === true || current[key] === 1;
    if (permState.detailPerms[key] !== curVal) { changed = true; break; }
  }
  btn.disabled = !changed;
  btn.textContent = changed ? 'Save Changes' : 'No Changes';
}

async function permSaveChanges() {
  const ohrId = permState.detailOhr;
  if (!ohrId) return;

  const btn = document.getElementById('admin-perm-save-btn') || document.getElementById('perm-save-btn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const res = await fetch(`/api/io/permissions/${ohrId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        permissions: permState.detailPerms,
        actor_ohr: currentUser.ohr_id,
        actor_name: currentUser.full_name,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      // Update local state
      permState.allPerms[ohrId] = { ...permState.detailPerms };
      permRenderTable();
      if (typeof showToast === 'function') showToast(`Permissions updated for ${ohrId} (${data.changes_count} changes)`, 'success');
      btn.textContent = 'Saved!';
      setTimeout(() => permCloseDetail(), 800);
    } else {
      throw new Error(data.error || 'Unknown error');
    }
  } catch (err) {
    console.error('[PERMISSIONS] Save error:', err);
    if (typeof showToast === 'function') showToast('Error saving permissions: ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Save Changes';
  }
}

async function permResetToDefaults() {
  const ohrId = permState.detailOhr;
  if (!ohrId) return;
  const emp = permState.employees.find(e => e.ohr_id === ohrId);
  if (!emp) return;

  if (!confirm(`Reset permissions for ${emp.full_name || ohrId} to role-based defaults (${emp.actual_role})?`)) return;

  // Fetch defaults from server
  try {
    const res = await fetch(`/api/io/my-permissions?ohr_id=${ohrId}&role=${encodeURIComponent(emp.actual_role)}`);
    const data = await res.json();
    // The defaults are what the server returns when no DB override exists
    // But we need the pure defaults — we'll compute them client-side
    const defaults = computeRoleDefaults(emp.actual_role, ohrId);
    permState.detailPerms = { ...defaults };

    // Update checkboxes
    document.querySelectorAll('.perm-checkbox').forEach(cb => {
      cb.checked = defaults[cb.dataset.key] || false;
    });
    permUpdateSaveBtn();
    if (typeof showToast === 'function') showToast('Reset to role defaults. Click Save to apply.', 'info');
  } catch (err) {
    console.error('[PERMISSIONS] Reset error:', err);
  }
}

// Client-side role defaults (mirrors server logic)
function computeRoleDefaults(role, ohrId) {
  if (ohrId === '740045023') return Object.fromEntries(ALL_PERM_KEYS.map(k => [k, true]));
  const b = Object.fromEntries(ALL_PERM_KEYS.map(k => [k, false]));
  if (role === 'Agent') { b['nav.helm'] = true; b['nav.sandbox'] = true; return b; }
  b['nav.anchor'] = true;
  b['anchor.input_portal'] = true;
  b['anchor.dashboard'] = true;
  b['anchor.billing_compliance'] = true;
  b['anchor.risk_intelligence'] = true;
  b['anchor.download_csv'] = true;
  b['nav.helm'] = true;
  b['nav.regimen'] = true;
  b['nav.sandbox'] = true;
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
    b['regimen.full_columns'] = true;
    b['regimen.onboarding_tab'] = true;
    b['regimen.permissions_tab'] = true;
  }
  // 703212987 no longer gets edit_employee by default — only owner + assistant
  return b;
}
