/**
 * Roster Management — io_employees Table Editor
 * Admin-only (OHR 740045023) editable table for managing employee records.
 * Other users can view but not edit.
 * Now uses an omnibar for filtering/sorting and shows ALL database columns.
 */

const ROSTER = {
  employees: [],
  filtered: [],
  page: 1,
  pageSize: 30,
  editingId: null,
  isAdmin: false,

  // All columns from io_employees schema
  ALL_COLUMNS: [
    { key: 'ohr_id', label: 'OHR ID', editable: true },
    { key: 'full_name', label: 'Full Name', editable: true },
    { key: 'access_level', label: 'Access Level', editable: true },
    { key: 'last_name', label: 'Last Name', editable: true },
    { key: 'given_name', label: 'Given Name', editable: true },
    { key: 'middle_name', label: 'Middle Name', editable: true },
    { key: 'suffix', label: 'Suffix', editable: true },
    { key: 'billing_name', label: 'Billing Name', editable: true },
    { key: 'srt_name', label: 'SRT Name', editable: true },
    { key: 'employement_status', label: 'Status', editable: true },
    { key: 'actual_role', label: 'Role', editable: true },
    { key: 'supervisor_name', label: 'Supervisor', editable: true },
    { key: 'supervisor_email', label: 'Supervisor Email', editable: true },
    { key: 'shift_time', label: 'Shift Time', editable: true },
    { key: 'work_off', label: 'Work Off', editable: true },
    { key: 'planning_group', label: 'Planning Group', editable: true },
    { key: 'complete_planning_group', label: 'Complete PG', editable: true },
    { key: 'srt_status', label: 'SRT Status', editable: true },
    { key: 'srt_id', label: 'SRT ID', editable: true },
    { key: 'workday_id', label: 'Workday ID', editable: true },
    { key: 'meta_email', label: 'Meta Email', editable: true },
    { key: 'macbook_asset_id', label: 'MacBook Asset', editable: true },
    { key: 'chromebook_asset_id', label: 'Chromebook Asset', editable: true },
    { key: 'hire_date', label: 'Hire Date', editable: true },
    { key: 'regular_date', label: 'Regular Date', editable: true },
    { key: 'dob', label: 'DOB', editable: true },
    { key: 'personal_email', label: 'Personal Email', editable: true },
    { key: 'contact_number', label: 'Contact Number', editable: true },
    { key: 'primary_address', label: 'Primary Address', editable: true },
    { key: 'barangay', label: 'Barangay', editable: true },
    { key: 'city', label: 'City', editable: true },
    { key: 'province', label: 'Province', editable: true },
    { key: 'locker_floor', label: 'Locker Floor', editable: true },
    { key: 'locker_number', label: 'Locker Number', editable: true },
    { key: 'meta_onboarding_date', label: 'Meta Onboarding', editable: true },
    { key: 'live_date', label: 'Live Date', editable: true },
    { key: 'badge_id', label: 'Badge ID', editable: true },
    { key: 'badge_serial', label: 'Badge Serial', editable: true },
    { key: 'platform', label: 'Platform', editable: true },
    { key: 'billing_code', label: 'Billing Code', editable: true },
  ],

  // Keep old COLUMNS reference for edit/add forms
  COLUMNS: [
    { key: 'ohr_id', label: 'OHR ID', editable: true },
    { key: 'full_name', label: 'Full Name', editable: true },
    { key: 'actual_role', label: 'Role', editable: true },
    { key: 'planning_group', label: 'Planning Group', editable: true },
    { key: 'complete_planning_group', label: 'Complete PG', editable: true },
    { key: 'supervisor_name', label: 'Supervisor', editable: true },
    { key: 'meta_email', label: 'Meta Email', editable: true },
    { key: 'employement_status', label: 'Status', editable: true },
    { key: 'billing_code', label: 'Billing Code', editable: true },
    { key: 'srt_status', label: 'SRT Status', editable: true }
  ]
};

// ===== Omnibar State =====

const rosterOmniState = {
  filters: [],
  sorts: [],
  menuMode: null,
  menuStep: null,
  menuField: null,
};

const ROSTER_FILTER_FIELDS = [
  { key: 'employement_status', label: 'Status', type: 'multi', recordKey: 'employement_status' },
  { key: 'actual_role', label: 'Role', type: 'multi', recordKey: 'actual_role' },
  { key: 'planning_group', label: 'Planning Group', type: 'multi', recordKey: 'planning_group' },
  { key: 'supervisor_name', label: 'Supervisor', type: 'multi', recordKey: 'supervisor_name', searchable: true },
  { key: 'shift_time', label: 'Shift Time', type: 'multi', recordKey: 'shift_time' },
  { key: 'platform', label: 'Platform', type: 'multi', recordKey: 'platform' },
  { key: 'srt_status', label: 'SRT Status', type: 'multi', recordKey: 'srt_status' },
  { key: 'city', label: 'City', type: 'multi', recordKey: 'city', searchable: true },
  { key: 'province', label: 'Province', type: 'multi', recordKey: 'province', searchable: true },
  { key: 'search', label: 'Search (Name/OHR/Email)', type: 'text' },
];

const ROSTER_SORT_FIELDS = [
  { key: 'full_name', label: 'Full Name', recordKey: 'full_name' },
  { key: 'ohr_id', label: 'OHR ID', recordKey: 'ohr_id' },
  { key: 'actual_role', label: 'Role', recordKey: 'actual_role' },
  { key: 'planning_group', label: 'Planning Group', recordKey: 'planning_group' },
  { key: 'hire_date', label: 'Hire Date', recordKey: 'hire_date' },
  { key: 'employement_status', label: 'Status', recordKey: 'employement_status' },
];

let _rosterOutsideListener = null;

// ===== Data Fetching =====

async function rosterFetchEmployees() {
  const loading = document.getElementById('roster-loading');
  if (loading) loading.style.display = 'flex';

  try {
    const url = `${IO_API_BASE}/employees?limit=3000`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Failed to fetch roster');
    ROSTER.employees = await resp.json();
  } catch (e) {
    console.error('Roster fetch error:', e);
    ROSTER.employees = [];
  }

  if (loading) loading.style.display = 'none';

  // Check admin
  ROSTER.isAdmin = typeof currentUser !== 'undefined' && currentUser && currentUser.ohr_id === '740045023';

  // Show/hide add button — admin only
  const addBtn = document.getElementById('roster-add-btn');
  if (addBtn) addBtn.style.display = ROSTER.isAdmin ? '' : 'none';

  rosterApplyFilters();
}

// ===== Omnibar Functions =====

function rosterOmnibarOpenMenu(mode) {
  rosterOmniState.menuMode = mode;
  rosterOmniState.menuStep = 'pick_field';
  rosterOmniState.menuField = null;
  rosterRenderOmniMenu();
  if (!_rosterOutsideListener) {
    setTimeout(() => {
      _rosterOutsideListener = (e) => {
        const omnibar = document.getElementById('roster-omnibar');
        const menu = document.getElementById('roster-omnibar-menu');
        if (!omnibar || !menu) return;
        if (omnibar.contains(e.target)) return;
        rosterOmnibarCloseMenu();
      };
      document.addEventListener('mousedown', _rosterOutsideListener);
    }, 10);
  }
}

function rosterOmnibarCloseMenu() {
  rosterOmniState.menuMode = null;
  rosterOmniState.menuStep = null;
  rosterOmniState.menuField = null;
  const menu = document.getElementById('roster-omnibar-menu');
  if (menu) menu.style.display = 'none';
  if (_rosterOutsideListener) {
    document.removeEventListener('mousedown', _rosterOutsideListener);
    _rosterOutsideListener = null;
  }
}

function rosterRenderOmniMenu() {
  const menu = document.getElementById('roster-omnibar-menu');
  if (!menu) return;
  menu.style.display = 'block';

  if (rosterOmniState.menuMode === 'filter' && rosterOmniState.menuStep === 'pick_field') {
    const activeKeys = new Set(rosterOmniState.filters.map(f => f.key));
    const available = ROSTER_FILTER_FIELDS.filter(f => !activeKeys.has(f.key));
    if (available.length === 0) {
      menu.innerHTML = '<div class="omnibar-menu-empty">All filters are active</div>';
      return;
    }
    menu.innerHTML = '<div class="omnibar-menu-title">Select a filter</div>' +
      available.map(f =>
        `<button class="omnibar-menu-item" onclick="event.stopPropagation(); rosterOmnibarSelectField('${f.key}')">${escapeHtml(f.label)}</button>`
      ).join('');

  } else if (rosterOmniState.menuMode === 'filter' && rosterOmniState.menuStep === 'pick_values') {
    rosterRenderValuePicker();

  } else if (rosterOmniState.menuMode === 'sort' && rosterOmniState.menuStep === 'pick_field') {
    const activeKeys = new Set(rosterOmniState.sorts.map(s => s.key));
    const available = ROSTER_SORT_FIELDS.filter(f => !activeKeys.has(f.key));
    if (available.length === 0) {
      menu.innerHTML = '<div class="omnibar-menu-empty">All sort fields are active</div>';
      return;
    }
    menu.innerHTML = '<div class="omnibar-menu-title">Sort by</div>' +
      available.map(f =>
        `<button class="omnibar-menu-item" onclick="event.stopPropagation(); rosterOmnibarAddSort('${f.key}', 'asc')">${escapeHtml(f.label)} &#9650; Ascending</button>` +
        `<button class="omnibar-menu-item" onclick="event.stopPropagation(); rosterOmnibarAddSort('${f.key}', 'desc')">${escapeHtml(f.label)} &#9660; Descending</button>`
      ).join('');
  }
}

function rosterRenderValuePicker() {
  const menu = document.getElementById('roster-omnibar-menu');
  const field = rosterOmniState.menuField;
  if (!field || !menu) return;

  if (field.type === 'text') {
    menu.innerHTML = `
      <div class="omnibar-menu-title">${escapeHtml(field.label)}</div>
      <div style="padding:8px 12px;">
        <input type="text" class="form-input form-input-sm" id="roster-omni-text-input" placeholder="Type to search..." style="width:100%;">
        <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); rosterOmnibarAddTextFilter()" style="margin-top:8px;">Add</button>
      </div>`;
    setTimeout(() => { const inp = document.getElementById('roster-omni-text-input'); if (inp) inp.focus(); }, 50);
    return;
  }

  // Multi-select: gather unique values from employees
  const values = [...new Set(ROSTER.employees.map(r => r[field.recordKey]).filter(Boolean))].sort();
  const searchable = field.searchable || values.length > 15;

  let html = `<div class="omnibar-menu-title">${escapeHtml(field.label)}</div>`;
  if (searchable) {
    html += `<div class="omnibar-search-wrap"><input type="text" class="form-input form-input-sm omnibar-search" id="roster-omni-value-search" placeholder="Search..." oninput="rosterOmnibarFilterValueList()"></div>`;
  }
  html += '<div class="omnibar-value-list" id="roster-omni-value-list">';
  for (const v of values) {
    html += `<label class="omnibar-value-item"><input type="checkbox" value="${escapeAttr(v)}"><span>${escapeHtml(v)}</span></label>`;
  }
  html += '</div>';
  html += `<div class="omnibar-menu-footer"><button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); rosterOmnibarAddMultiFilter()">Add Filter</button></div>`;
  menu.innerHTML = html;

  if (searchable) {
    setTimeout(() => { const si = document.getElementById('roster-omni-value-search'); if (si) si.focus(); }, 50);
  }
}

window.rosterOmnibarSelectField = function (key) {
  const field = ROSTER_FILTER_FIELDS.find(f => f.key === key);
  if (!field) return;
  rosterOmniState.menuField = field;
  rosterOmniState.menuStep = 'pick_values';
  rosterRenderOmniMenu();
};

window.rosterOmnibarAddTextFilter = function () {
  const field = rosterOmniState.menuField;
  if (!field) return;
  const val = (document.getElementById('roster-omni-text-input')?.value || '').trim();
  if (!val) { showToast('Please enter a search term', 'info'); return; }
  rosterOmniState.filters = rosterOmniState.filters.filter(f => f.key !== field.key);
  rosterOmniState.filters.push({ key: field.key, label: field.label, type: 'text', value: val });
  rosterOmnibarCloseMenu();
  rosterRenderOmniChips();
};

window.rosterOmnibarAddMultiFilter = function () {
  const field = rosterOmniState.menuField;
  if (!field) return;
  const checked = [...document.querySelectorAll('#roster-omni-value-list input[type="checkbox"]:checked')].map(cb => cb.value);
  if (checked.length === 0) { showToast('Select at least one value', 'info'); return; }
  rosterOmniState.filters = rosterOmniState.filters.filter(f => f.key !== field.key);
  rosterOmniState.filters.push({ key: field.key, label: field.label, type: 'multi', values: checked, recordKey: field.recordKey });
  rosterOmnibarCloseMenu();
  rosterRenderOmniChips();
};

window.rosterOmnibarAddSort = function (key, direction) {
  const field = ROSTER_SORT_FIELDS.find(f => f.key === key);
  if (!field) return;
  rosterOmniState.sorts = rosterOmniState.sorts.filter(s => s.key !== key);
  rosterOmniState.sorts.push({ key, label: field.label, direction, recordKey: field.recordKey });
  rosterOmnibarCloseMenu();
  rosterRenderOmniChips();
};

window.rosterOmnibarFilterValueList = function () {
  const search = (document.getElementById('roster-omni-value-search')?.value || '').toLowerCase();
  const items = document.querySelectorAll('#roster-omni-value-list .omnibar-value-item');
  items.forEach(item => {
    const text = item.textContent.toLowerCase();
    item.style.display = text.includes(search) ? '' : 'none';
  });
};

window.rosterOmnibarRemoveFilter = function (key) {
  rosterOmniState.filters = rosterOmniState.filters.filter(f => f.key !== key);
  rosterRenderOmniChips();
};

window.rosterOmnibarEditSort = function (key) {
  const sort = rosterOmniState.sorts.find(s => s.key === key);
  if (!sort) return;
  sort.direction = sort.direction === 'asc' ? 'desc' : 'asc';
  sort.label = sort.label.replace(/ [\u25B2\u25BC]$/, '');
  rosterRenderOmniChips();
};

window.rosterOmnibarRemoveSort = function (key) {
  rosterOmniState.sorts = rosterOmniState.sorts.filter(s => s.key !== key);
  rosterRenderOmniChips();
};

window.rosterOmnibarEditFilter = function (key) {
  const field = ROSTER_FILTER_FIELDS.find(f => f.key === key);
  if (!field) return;
  rosterOmniState.menuMode = 'filter';
  rosterOmniState.menuStep = 'pick_values';
  rosterOmniState.menuField = field;
  rosterRenderOmniMenu();
  if (!_rosterOutsideListener) {
    setTimeout(() => {
      _rosterOutsideListener = (e) => {
        const omnibar = document.getElementById('roster-omnibar');
        const menu = document.getElementById('roster-omnibar-menu');
        if (!omnibar || !menu) return;
        if (omnibar.contains(e.target)) return;
        rosterOmnibarCloseMenu();
      };
      document.addEventListener('mousedown', _rosterOutsideListener);
    }, 10);
  }
  setTimeout(() => {
    const existing = rosterOmniState.filters.find(f => f.key === key);
    if (!existing) return;
    if (field.type === 'text') {
      const inp = document.getElementById('roster-omni-text-input');
      if (inp) inp.value = existing.value || '';
    } else if (field.type === 'multi') {
      const checkboxes = document.querySelectorAll('#roster-omni-value-list input[type="checkbox"]');
      checkboxes.forEach(cb => {
        if (existing.values && existing.values.includes(cb.value)) cb.checked = true;
      });
    }
  }, 60);
};

function rosterRenderOmniChips() {
  const container = document.getElementById('roster-omnibar-chips');
  if (!container) return;
  let html = '';
  for (const f of rosterOmniState.filters) {
    let chipLabel = '';
    if (f.type === 'text') {
      chipLabel = `${f.label}: "${f.value}"`;
    } else {
      chipLabel = f.values.length <= 2 ? `${f.label}: ${f.values.join(', ')}` : `${f.label}: ${f.values.length} selected`;
    }
    html += `<span class="omnibar-chip omnibar-chip-filter">
      <span class="chip-icon">&#9881;</span>
      <span class="chip-text chip-text-editable" onclick="rosterOmnibarEditFilter('${f.key}')" title="Click to edit">${escapeHtml(chipLabel)}</span>
      <button class="chip-remove" onclick="rosterOmnibarRemoveFilter('${f.key}')" title="Remove">&times;</button>
    </span>`;
  }
  for (const s of rosterOmniState.sorts) {
    const arrow = s.direction === 'asc' ? '\u25B2' : '\u25BC';
    html += `<span class="omnibar-chip omnibar-chip-sort">
      <span class="chip-icon">${arrow}</span>
      <span class="chip-text chip-text-editable" onclick="rosterOmnibarEditSort('${s.key}')" title="Click to toggle direction">${escapeHtml(s.label)}</span>
      <button class="chip-remove" onclick="rosterOmnibarRemoveSort('${s.key}')" title="Remove">&times;</button>
    </span>`;
  }
  container.innerHTML = html;
}

function rosterOmnibarApply() {
  rosterApplyFilters();
}

function rosterOmnibarClearAll() {
  rosterOmniState.filters = [];
  rosterOmniState.sorts = [];
  rosterOmnibarCloseMenu();
  rosterRenderOmniChips();
  rosterApplyFilters();
}

// Expose globals
window.rosterOmnibarOpenMenu = rosterOmnibarOpenMenu;
window.rosterOmnibarCloseMenu = rosterOmnibarCloseMenu;
window.rosterOmnibarApply = rosterOmnibarApply;
window.rosterOmnibarClearAll = rosterOmnibarClearAll;

// ===== Filters (now driven by omnibar) =====

function rosterApplyFilters() {
  let data = [...ROSTER.employees];

  for (const f of rosterOmniState.filters) {
    if (f.type === 'text') {
      const q = f.value.toLowerCase();
      data = data.filter(e =>
        (e.full_name || '').toLowerCase().includes(q) ||
        (e.ohr_id || '').toLowerCase().includes(q) ||
        (e.meta_email || '').toLowerCase().includes(q)
      );
    } else if (f.type === 'multi') {
      data = data.filter(e => f.values.includes(e[f.recordKey]));
    }
  }

  // Apply sorts
  for (const s of rosterOmniState.sorts) {
    data.sort((a, b) => {
      const va = (a[s.recordKey] || '').toString().toLowerCase();
      const vb = (b[s.recordKey] || '').toString().toLowerCase();
      const cmp = va.localeCompare(vb);
      return s.direction === 'asc' ? cmp : -cmp;
    });
  }

  ROSTER.filtered = data;
  ROSTER.page = 1;

  const countEl = document.getElementById('roster-record-count');
  if (countEl) countEl.textContent = `Records: ${data.length}`;

  rosterRenderTable();
}

// Keep old functions as no-ops for backward compat
function rosterPopulateFilters() {}

// ===== Table Rendering (ALL columns) =====

function rosterRenderTable() {
  const thead = document.getElementById('roster-table-head');
  const tbody = document.getElementById('roster-table-body');
  if (!thead || !tbody) return;

  const cols = ROSTER.ALL_COLUMNS;

  thead.innerHTML = `<tr>
    ${cols.map(c => `<th style="white-space:nowrap;">${escapeHtml(c.label)}</th>`).join('')}
    ${ROSTER.isAdmin ? '<th>Actions</th>' : ''}
  </tr>`;

  const start = (ROSTER.page - 1) * ROSTER.pageSize;
  const pageData = ROSTER.filtered.slice(start, start + ROSTER.pageSize);

  if (pageData.length === 0) {
    const colSpan = cols.length + (ROSTER.isAdmin ? 1 : 0);
    tbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align:center;color:var(--text-secondary);padding:32px;">No employees found</td></tr>`;
    rosterRenderPagination();
    return;
  }

  tbody.innerHTML = pageData.map(emp => {
    const statusColor = emp.employement_status === 'Active' ? '#22C55E' : '#EF4444';

    return `<tr class="module-row">
      ${cols.map(c => {
        if (c.key === 'employement_status') {
          return `<td><span class="module-status-badge" style="background:${statusColor}20;color:${statusColor};border:1px solid ${statusColor}40;">${escapeHtml(emp[c.key] || '')}</span></td>`;
        }
        return `<td style="white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis;" title="${escapeAttr(emp[c.key] || '')}">${escapeHtml(emp[c.key] != null ? String(emp[c.key]) : '')}</td>`;
      }).join('')}
      ${ROSTER.isAdmin ? `<td style="white-space:nowrap;">
        <button class="btn btn-ghost btn-xs" onclick="rosterEditEmployee('${escapeAttr(emp.ohr_id)}')" title="Edit">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn btn-ghost btn-xs" onclick="rosterDeleteEmployee('${escapeAttr(emp.ohr_id)}')" title="Delete" style="color:#EF4444;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </td>` : ''}
    </tr>`;
  }).join('');

  rosterRenderPagination();
}

function rosterRenderPagination() {
  const el = document.getElementById('roster-pagination');
  if (!el) return;
  const total = ROSTER.filtered.length;
  const totalPages = Math.ceil(total / ROSTER.pageSize) || 1;
  const start = (ROSTER.page - 1) * ROSTER.pageSize + 1;
  const end = Math.min(ROSTER.page * ROSTER.pageSize, total);

  el.innerHTML = `
    <span class="module-page-info">${total > 0 ? `${start}-${end} of ${total}` : '0 records'}</span>
    <button class="btn btn-ghost btn-xs" ${ROSTER.page <= 1 ? 'disabled' : ''} onclick="ROSTER.page--;rosterRenderTable();">&laquo; Prev</button>
    <span class="module-page-num">Page ${ROSTER.page} of ${totalPages}</span>
    <button class="btn btn-ghost btn-xs" ${ROSTER.page >= totalPages ? 'disabled' : ''} onclick="ROSTER.page++;rosterRenderTable();">Next &raquo;</button>
  `;
}

// ===== Edit Employee =====

function rosterEditEmployee(ohrId) {
  if (!ROSTER.isAdmin) { showToast('Only admin can edit employees', 'error'); return; }

  const emp = ROSTER.employees.find(e => e.ohr_id === ohrId);
  if (!emp) return;
  ROSTER.editingId = ohrId;

  const formTitle = document.getElementById('roster-form-title');
  const formBody = document.getElementById('roster-form-body');
  const formFooter = document.getElementById('roster-form-footer');
  const overlay = document.getElementById('roster-form-overlay');

  formTitle.textContent = `Edit Employee — ${emp.full_name}`;

  const roleOptions = ['Agent', 'QA', 'SME', 'Team Lead', 'Trainer', 'Manager'];
  const statusOptions = ['Active', 'Inactive', 'Resigned', 'Terminated'];

  formBody.innerHTML = `
    <div class="form-section">
      ${ROSTER.ALL_COLUMNS.map(col => {
        if (col.key === 'actual_role') {
          return `<div class="form-field">
            <label class="form-label">${col.label}</label>
            <select class="form-select" id="roster-edit-${col.key}">
              ${roleOptions.map(r => `<option value="${r}" ${emp[col.key] === r ? 'selected' : ''}>${r}</option>`).join('')}
            </select>
          </div>`;
        }
        if (col.key === 'employement_status') {
          return `<div class="form-field">
            <label class="form-label">${col.label}</label>
            <select class="form-select" id="roster-edit-${col.key}">
              ${statusOptions.map(s => `<option value="${s}" ${emp[col.key] === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>`;
        }
        return `<div class="form-field">
          <label class="form-label">${col.label}</label>
          <input type="text" class="form-input" id="roster-edit-${col.key}" value="${escapeAttr(emp[col.key] != null ? String(emp[col.key]) : '')}">
        </div>`;
      }).join('')}
    </div>
  `;

  formFooter.innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="rosterCloseForm()">Cancel</button>
    <button class="btn btn-primary btn-sm" onclick="rosterSaveEdit()">Save Changes</button>
  `;

  overlay.style.display = 'flex';
}

async function rosterSaveEdit() {
  if (!ROSTER.editingId) return;

  const updates = {};
  ROSTER.ALL_COLUMNS.forEach(col => {
    if (col.editable) {
      const el = document.getElementById(`roster-edit-${col.key}`);
      if (el) updates[col.key] = el.value;
    }
  });

  try {
    const url = `${IO_API_BASE}/employees/${encodeURIComponent(ROSTER.editingId)}`;
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!resp.ok) throw new Error('Failed to update employee');

    showToast('Employee updated successfully', 'success');
    if (typeof createNotification === 'function') {
      const user = typeof currentUser !== 'undefined' ? currentUser : null;
      createNotification('roster_edit', 'Employee Updated', `${updates.full_name || ROSTER.editingId} record updated`, user?.ohr_id, user?.full_name);
    }
    rosterCloseForm();
    await rosterFetchEmployees();
  } catch (e) {
    console.error('Failed to update employee:', e);
    showToast('Failed to update: ' + e.message, 'error');
  }
}

// ===== Add Employee =====

function rosterShowAddForm() {
  if (!ROSTER.isAdmin) { showToast('Only admin can add employees', 'error'); return; }
  ROSTER.editingId = null;

  const formTitle = document.getElementById('roster-form-title');
  const formBody = document.getElementById('roster-form-body');
  const formFooter = document.getElementById('roster-form-footer');
  const overlay = document.getElementById('roster-form-overlay');

  formTitle.textContent = 'Add New Employee';

  const roleOptions = ['Agent', 'QA', 'SME', 'Team Lead', 'Trainer', 'Manager'];

  formBody.innerHTML = `
    <div class="form-section">
      ${ROSTER.ALL_COLUMNS.map(col => {
        if (col.key === 'actual_role') {
          return `<div class="form-field">
            <label class="form-label">${col.label} <span class="required">*</span></label>
            <select class="form-select" id="roster-add-${col.key}">
              <option value="">— Select —</option>
              ${roleOptions.map(r => `<option value="${r}">${r}</option>`).join('')}
            </select>
          </div>`;
        }
        if (col.key === 'employement_status') {
          return `<div class="form-field">
            <label class="form-label">${col.label}</label>
            <select class="form-select" id="roster-add-${col.key}">
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>`;
        }
        const required = ['ohr_id', 'full_name'].includes(col.key);
        return `<div class="form-field">
          <label class="form-label">${col.label}${required ? ' <span class="required">*</span>' : ''}</label>
          <input type="text" class="form-input" id="roster-add-${col.key}" placeholder="${col.label}">
        </div>`;
      }).join('')}
    </div>
  `;

  formFooter.innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="rosterCloseForm()">Cancel</button>
    <button class="btn btn-primary btn-sm" onclick="rosterSaveNew()">Add Employee</button>
  `;

  overlay.style.display = 'flex';
}

async function rosterSaveNew() {
  const record = {};
  ROSTER.ALL_COLUMNS.forEach(col => {
    const el = document.getElementById(`roster-add-${col.key}`);
    if (el) record[col.key] = el.value;
  });

  if (!record.ohr_id) { showToast('OHR ID is required', 'error'); return; }
  if (!record.full_name) { showToast('Full Name is required', 'error'); return; }

  try {
    const url = `${IO_API_BASE}/employees`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    });
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.message || 'Failed to add employee');
    }

    showToast('Employee added successfully', 'success');
    if (typeof createNotification === 'function') {
      const user = typeof currentUser !== 'undefined' ? currentUser : null;
      createNotification('roster_add', 'Employee Added', `${record.full_name} (${record.ohr_id}) added to roster`, user?.ohr_id, user?.full_name);
    }
    rosterCloseForm();
    await rosterFetchEmployees();
  } catch (e) {
    console.error('Failed to add employee:', e);
    showToast('Failed to add: ' + e.message, 'error');
  }
}

// ===== Delete Employee =====

async function rosterDeleteEmployee(ohrId) {
  if (!ROSTER.isAdmin) { showToast('Only admin can delete employees', 'error'); return; }

  const emp = ROSTER.employees.find(e => e.ohr_id === ohrId);
  if (!confirm(`Are you sure you want to delete ${emp ? emp.full_name : ohrId}? This action cannot be undone.`)) return;

  try {
    const url = `${IO_API_BASE}/employees/${encodeURIComponent(ohrId)}`;
    const resp = await fetch(url, {
      method: 'DELETE'
    });
    if (!resp.ok) throw new Error('Failed to delete employee');

    showToast('Employee deleted', 'success');
    if (typeof createNotification === 'function') {
      const user = typeof currentUser !== 'undefined' ? currentUser : null;
      createNotification('roster_delete', 'Employee Deleted', `${emp ? emp.full_name : ohrId} removed from roster`, user?.ohr_id, user?.full_name);
    }
    await rosterFetchEmployees();
  } catch (e) {
    console.error('Failed to delete employee:', e);
    showToast('Failed to delete: ' + e.message, 'error');
  }
}

function rosterCloseForm() {
  const overlay = document.getElementById('roster-form-overlay');
  if (overlay) overlay.style.display = 'none';
  ROSTER.editingId = null;
}

// ===== Init =====

async function initRoster() {
  await rosterFetchEmployees();
}
