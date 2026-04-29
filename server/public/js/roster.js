/* ============================================================
   ROSTER.JS — Regimen module (Roster tab, Incomplete Rostering tab)
   Pill-based filter bar with ALL 43 columns, date-range for date fields,
   inline audit trail in detail card, CSV export, Incomplete Rostering
   ============================================================ */

'use strict';

// ===== Utility =====
function escapeHtml(s) { if (s == null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escapeAttr(s) { return escapeHtml(s); }
function formatSrtId(v) { if (v == null || v === '') return ''; return String(v).replace(/^0+/, '') || '0'; }

// ===== Column Definitions =====
const ALL_COLUMNS = [
  { key: 'ohr_id', label: 'OHR ID', group: 'identity' },
  { key: 'full_name', label: 'Full Name', group: 'identity' },
  { key: 'last_name', label: 'Last Name', group: 'identity' },
  { key: 'given_name', label: 'Given Name', group: 'identity' },
  { key: 'middle_name', label: 'Middle Name', group: 'identity' },
  { key: 'suffix', label: 'Suffix', group: 'identity' },
  { key: 'billing_name', label: 'Billing Name', group: 'identity' },
  { key: 'srt_name', label: 'SRT Name', group: 'identity' },
  { key: 'dob', label: 'DOB', group: 'dates', isDate: true },
  { key: 'personal_email', label: 'Personal Email', group: 'identity' },
  { key: 'contact_number', label: 'Contact Number', group: 'identity' },
  { key: 'primary_address', label: 'Primary Address', group: 'identity' },
  { key: 'barangay', label: 'Barangay', group: 'identity' },
  { key: 'city', label: 'City', group: 'identity' },
  { key: 'province', label: 'Province', group: 'identity' },
  { key: 'employement_status', label: 'Status', group: 'role' },
  { key: 'actual_role', label: 'Role', group: 'role' },
  { key: 'supervisor_name', label: 'Supervisor', group: 'role' },
  { key: 'supervisor_email', label: 'Supervisor Email', group: 'role' },
  { key: 'shift_time', label: 'Shift Time', group: 'role' },
  { key: 'work_off', label: 'Work Off', group: 'role' },
  { key: 'planning_group', label: 'Planning Group', group: 'role' },
  { key: 'complete_planning_group', label: 'Related PG', group: 'role' },
  { key: 'srt_status', label: 'SRT Status', group: 'role' },
  { key: 'platform', label: 'Platform', group: 'role' },
  { key: 'srt_id', label: 'SRT ID', group: 'system' },
  { key: 'workday_id', label: 'Workday ID', group: 'system' },
  { key: 'meta_email', label: 'Meta Email', group: 'system' },
  { key: 'macbook_asset', label: 'MacBook Asset', group: 'asset' },
  { key: 'chromebook_asset', label: 'Chromebook Asset', group: 'asset' },
  { key: 'badge_id', label: 'Badge ID', group: 'asset' },
  { key: 'badge_serial', label: 'Badge Serial', group: 'asset' },
  { key: 'locker_floor', label: 'Locker Floor', group: 'asset' },
  { key: 'locker_number', label: 'Locker Number', group: 'asset' },
  { key: 'hire_date', label: 'Hire Date', group: 'dates', isDate: true },
  { key: 'regular_date', label: 'Regular Date', group: 'dates', isDate: true },
  { key: 'meta_onboarding_date', label: 'Meta Onboarding Date', group: 'dates', isDate: true },
  { key: 'go_live_date', label: 'Go Live Date', group: 'dates', isDate: true },
  { key: 'offboarding_date', label: 'Offboarding Date', group: 'attrition', isDate: true },
  { key: 'resignation_date', label: 'Resignation Date', group: 'attrition', isDate: true },
  { key: 'relieving_date', label: 'Relieving Date', group: 'attrition', isDate: true },
  { key: 'exit_date', label: 'Exit Date', group: 'attrition', isDate: true },
  { key: 'exit_reason', label: 'Exit Reason', group: 'attrition' },
  { key: 'department', label: 'Department', group: 'role' },
  { key: 'sex', label: 'Sex', group: 'identity', ownerOnly: true }
];

// Limited columns for non-admin tiers
const LIMITED_COLUMNS = [
  'ohr_id','full_name','last_name','given_name','middle_name','suffix',
  'employement_status','actual_role','supervisor_name','shift_time','work_off',
  'planning_group','complete_planning_group','srt_status','platform',
  'srt_id','workday_id','meta_email','hire_date','regular_date',
  'meta_onboarding_date','go_live_date','department','dob'
];

// Date columns for date-range filter type
const DATE_COLUMNS = ALL_COLUMNS.filter(c => c.isDate).map(c => c.key);

// ===== State =====
const ROSTER = {
  employees: [],
  filtered: [],
  page: 1,
  pageSize: 50,
  tier: 'limited', // 'full' or 'limited'
  canEdit: false,
  sortKey: null,
  sortDir: 'asc',
  filters: {},       // key -> { values: [...] } for multi, { startDate, endDate } for date_range
  searchQuery: '',
  ALL_COLUMNS: ALL_COLUMNS,
  isOwner: false,
  // Track pending inline edits: { ohrId: { field: newValue, ... } }
  _pendingEdits: {},
  getVisibleColumns() {
    const base = this.tier === 'full' ? ALL_COLUMNS : ALL_COLUMNS.filter(c => LIMITED_COLUMNS.includes(c.key));
    // Filter out ownerOnly columns for non-owner users
    let cols = base.filter(c => !c.ownerOnly || this.isOwner);
    // OHR visibility: only SMEs, Team Leads, Managers, and admin can see OHR ID
    const ohrAllowedRoles = ['Operational SME', 'Team Lead', 'Manager'];
    const userRole = (typeof currentUser !== 'undefined' && currentUser && currentUser.actual_role) || '';
    const isAdmin = (typeof currentUser !== 'undefined' && currentUser && (window.ADMIN_OHRS || []).includes(currentUser.ohr_id));
    if (!isAdmin && !ohrAllowedRoles.includes(userRole)) {
      cols = cols.filter(c => c.key !== 'ohr_id');
    }
    return cols;
  },
  // Slim table columns — only these show in the main table; details are inline
  getTableColumns() {
    const allowed = ['ohr_id', 'full_name', 'employement_status', 'supervisor_name', 'actual_role', 'planning_group'];
    return this.getVisibleColumns().filter(c => allowed.includes(c.key));
  }
};

// ===== Filter Definitions =====
// Build filter fields from ALL_COLUMNS: multi-select for text, date_range for dates, search for text search
// Name columns replaced by a single Full Name filter pill
const REPLACED_NAME_KEYS = new Set(['last_name', 'given_name', 'middle_name', 'suffix', 'billing_name', 'srt_name']);

// Filters to exclude from the filter bar per user request
const EXCLUDED_FILTER_KEYS = new Set([
  'personal_email', 'primary_address', 'supervisor_email',
  'workday_id', 'meta_email', 'macbook_asset', 'chromebook_asset',
  'badge_id', 'srt_id', 'badge_serial', 'locker_floor', 'locker_number'
]);

function buildFilterFields() {
  const fields = [];
  const visibleCols = ROSTER.getVisibleColumns();
  let fullNameAdded = false;
  visibleCols.forEach(col => {
    if (col.key === 'ohr_id') return; // handled by search
    if (EXCLUDED_FILTER_KEYS.has(col.key)) return; // removed filters
    // Collapse the 6 name columns into a single Full Name filter
    if (REPLACED_NAME_KEYS.has(col.key)) {
      if (!fullNameAdded) {
        fields.push({ key: 'full_name', label: 'Full Name', type: 'multi' });
        fullNameAdded = true;
      }
      return;
    }
    if (col.key === 'full_name') {
      if (!fullNameAdded) {
        fields.push({ key: 'full_name', label: 'Full Name', type: 'multi' });
        fullNameAdded = true;
      }
      return;
    }
    if (col.isDate) {
      fields.push({ key: col.key, label: col.label, type: 'date_range' });
    } else {
      fields.push({ key: col.key, label: col.label, type: 'multi' });
    }
  });
  fields.push({ key: '_search', label: 'Search', type: 'search' });
  return fields;
}

function rosterGetAllValues(field) {
  const vals = new Set();
  ROSTER.employees.forEach(emp => {
    const v = emp[field.key];
    if (v != null && String(v).trim() !== '') vals.add(String(v).trim());
  });
  return Array.from(vals).sort((a, b) => a.localeCompare(b));
}

function rosterGetFilterSummary(field) {
  const f = ROSTER.filters[field.key];
  if (field.type === 'search') {
    return ROSTER.searchQuery || 'All';
  }
  if (field.type === 'date_range') {
    if (!f) return 'All';
    const fmt = typeof formatDateDisplay === 'function' ? formatDateDisplay : function(d) { return d; };
    return fmt(f.startDate) + ' – ' + fmt(f.endDate);
  }
  if (!f || !f.values) return 'All';
  const allValues = rosterGetAllValues(field);
  if (f.values.length === 0) return 'None';
  if (f.values.length === allValues.length) return 'All';
  if (f.values.length === 1) return f.values[0];
  return f.values.length + ' selected';
}

function rosterIsFiltered(field) {
  if (field.type === 'search') return ROSTER.searchQuery.length > 0;
  const f = ROSTER.filters[field.key];
  if (!f) return false;
  if (field.type === 'date_range') return true;
  const allValues = rosterGetAllValues(field);
  return f.values && f.values.length < allValues.length;
}

// ===== Filter Bar Rendering =====
let _rosterFilterFields = [];
let _rosterDebounceTimer = null;

function rosterDebouncedApply() {
  clearTimeout(_rosterDebounceTimer);
  _rosterDebounceTimer = setTimeout(() => {
    rosterApplyFilters();
    rosterRenderTable();
  }, 300);
}

function rosterRenderFilterBar() {
  _rosterFilterFields = buildFilterFields();

  // Separate fields into groups: search, non-date (multi), date
  const multiFields = _rosterFilterFields.filter(f => f.type === 'multi');
  const dateFields = _rosterFilterFields.filter(f => f.type === 'date_range');

  function renderPill(field) {
    const summary = rosterGetFilterSummary(field);
    const isActive = rosterIsFiltered(field);
    return '<div class="filter-pill' + (isActive ? ' active' : '') + '" id="roster-pill-' + field.key + '" onclick="rosterToggleDropdown(\'' + field.key + '\')">'
      + '<span class="filter-pill-label">' + escapeHtml(field.label) + '</span> '
      + '<span class="filter-pill-value">' + escapeHtml(summary) + '</span>'
      + '<span class="filter-pill-icon">▾</span>'
      + '<div class="filter-dropdown" id="roster-dd-' + field.key + '"></div>'
      + '</div>';
  }

  // Classify multi-select fields into identity vs rest
  const identityKeys = ALL_COLUMNS.filter(c => c.group === 'identity').map(c => c.key);
  const identityFields = multiFields.filter(f => identityKeys.includes(f.key));
  const restFields = multiFields.filter(f => !identityKeys.includes(f.key));

  // === Toolbar row: buttons + search + count ===
  const toolbar = document.getElementById('roster-filter-toolbar');
  if (toolbar) {
    let tbHtml = '';
    // Add Employee button (hidden by default, shown via permission)
    tbHtml += '<button class="btn btn-primary btn-sm" id="roster-add-btn" onclick="rosterShowAddForm()" style="display:none;white-space:nowrap;">'
      + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add'
      + '</button>';
    // Export CSV
    tbHtml += '<button class="btn btn-outline btn-sm" id="roster-export-btn" onclick="rosterExportCSV()" style="white-space:nowrap;">'
      + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Export'
      + '</button>';
    // Purge Attendance (admin-only)
    tbHtml += '<button class="btn btn-outline btn-sm" id="roster-purge-btn" onclick="rosterShowPurgeModal()" style="display:none;white-space:nowrap;color:#ef4444;border-color:#ef4444;">' 
      + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Purge'
      + '</button>';
    // Bulk Insert (admin-only)
    tbHtml += '<button class="btn btn-outline btn-sm" id="roster-bulk-insert-btn" onclick="rosterShowBulkInsertModal()" style="display:none;white-space:nowrap;color:#2563eb;border-color:#2563eb;">' 
      + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg> Bulk Insert'
      + '</button>';
    // Undo Last Batch (admin-only)
    tbHtml += '<button class="btn btn-outline btn-sm" id="roster-undo-batch-btn" onclick="rosterShowUndoBatchModal()" style="display:none;white-space:nowrap;color:#f59e0b;border-color:#f59e0b;">' 
      + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg> Undo Batch'
      + '</button>';
    // Clear filters
    tbHtml += '<button class="btn btn-ghost btn-xs" onclick="rosterClearAllFilters()" title="Clear all filters" style="white-space:nowrap;flex-shrink:0;">✕ Clear</button>';
    // Sync to Sheet (hidden by default)
    tbHtml += '<button class="btn btn-outline btn-sm" id="roster-sync-sheet-btn" onclick="rosterSyncToSheet()" style="display:none;white-space:nowrap;">'
      + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Sync'
      + '</button>';
    // Search box
    tbHtml += '<div class="regimen-search-box">'
      + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
      + '<input type="text" id="roster-search-input" placeholder="Search OHR / Name..." '
      + 'value="' + escapeAttr(ROSTER.searchQuery) + '" '
      + 'oninput="ROSTER.searchQuery=this.value;rosterDebouncedApply();">' 
      + '</div>';
    // Filtered count
    tbHtml += '<span class="regimen-filter-count" id="roster-filter-count"></span>';
    toolbar.innerHTML = tbHtml;
  }

  // === Filter pills row ===
  const container = document.getElementById('roster-filter-pills');
  if (!container) return;

  let html = '';

  // Row 1: All date range filters
  html += '<div class="regimen-filter-row">';
  dateFields.forEach(f => { html += renderPill(f); });
  html += '</div>';
  // Row 2: All non-date filters (identity + rest combined)
  const allNonDate = identityFields.concat(restFields);
  html += '<div class="regimen-filter-row">';
  allNonDate.forEach(f => { html += renderPill(f); });
  html += '</div>';

  container.innerHTML = html;
}

function rosterToggleDropdown(key) {
  const dd = document.getElementById('roster-dd-' + key);
  const pill = document.getElementById('roster-pill-' + key);
  if (!dd || !pill) return;

  const wasOpen = dd.classList.contains('open');

  // Close all dropdowns first
  document.querySelectorAll('#roster-filter-pills .filter-dropdown.open').forEach(d => {
    d.classList.remove('open');
    d.parentElement.classList.remove('open');
  });

  if (wasOpen) return;

  dd.classList.add('open');
  pill.classList.add('open');

  const field = _rosterFilterFields.find(f => f.key === key);
  if (!field) return;

  if (field.type === 'date_range') {
    rosterRenderDateDropdown(dd, field);
  } else {
    rosterRenderMultiDropdown(dd, field);
  }

  // Prevent closing when clicking inside dropdown
  dd.onclick = function(e) { e.stopPropagation(); };
}

// Close dropdowns on outside click
document.addEventListener('click', function(e) {
  if (!e.target.closest('.filter-pill')) {
    document.querySelectorAll('#roster-filter-pills .filter-dropdown.open').forEach(d => {
      d.classList.remove('open');
      d.parentElement.classList.remove('open');
    });
    // Also close IR dropdowns
    document.querySelectorAll('#ir-filter-pills .filter-dropdown.open').forEach(d => {
      d.classList.remove('open');
      d.parentElement.classList.remove('open');
    });
  }
});

function rosterRenderDateDropdown(dd, field) {
  const f = ROSTER.filters[field.key];
  const startVal = f ? f.startDate : '';
  const endVal = f ? f.endDate : '';

  const curSort = ROSTER.sortKey === field.key;
  const isAsc = curSort && ROSTER.sortDir === 'asc';
  const isDesc = curSort && ROSTER.sortDir === 'desc';

  dd.innerHTML = '<div class="filter-dropdown-header">'
    + '<span class="filter-dropdown-title">' + escapeHtml(field.label) + '</span>'
    + '<div class="filter-dropdown-sort">'
    + '<button class="filter-sort-btn ' + (isAsc ? 'active-sort' : '') + '" onclick="event.stopPropagation(); rosterSetSort(\'' + field.key + '\', \'asc\')" title="Oldest first">Old↑</button>'
    + '<button class="filter-sort-btn ' + (isDesc ? 'active-sort' : '') + '" onclick="event.stopPropagation(); rosterSetSort(\'' + field.key + '\', \'desc\')" title="Newest first">New↓</button>'
    + '</div>'
    + '</div>'
    + '<div class="filter-date-row">'
    + '<div class="filter-group"><label>Start</label>'
    + '<input type="date" class="form-input form-input-sm" id="roster-date-start-' + field.key + '" value="' + startVal + '">'
    + '</div>'
    + '<div class="filter-group"><label>End</label>'
    + '<input type="date" class="form-input form-input-sm" id="roster-date-end-' + field.key + '" value="' + endVal + '">'
    + '</div>'
    + '</div>'
    + '<div style="padding:4px 12px 8px;"><button class="btn btn-ghost btn-xs" onclick="event.stopPropagation();rosterClearDateFilter(\'' + field.key + '\')">Clear Date</button></div>';

  setTimeout(function() {
    const startEl = document.getElementById('roster-date-start-' + field.key);
    const endEl = document.getElementById('roster-date-end-' + field.key);
    if (startEl) startEl.addEventListener('change', function() { rosterOnDateChange(field.key); });
    if (endEl) endEl.addEventListener('change', function() { rosterOnDateChange(field.key); });
  }, 30);
}

window.rosterClearDateFilter = function(key) {
  delete ROSTER.filters[key];
  const pill = document.getElementById('roster-pill-' + key);
  if (pill) {
    const valSpan = pill.querySelector('.filter-pill-value');
    if (valSpan) valSpan.textContent = 'All';
    pill.classList.remove('active');
  }
  rosterDebouncedApply();
};

function rosterOnDateChange(key) {
  const start = (document.getElementById('roster-date-start-' + key) || {}).value || '';
  const end = (document.getElementById('roster-date-end-' + key) || {}).value || '';
  if (!start && !end) { delete ROSTER.filters[key]; rosterDebouncedApply(); return; }
  if (start && end && start > end) { showToast('Start date cannot be after end date', 'info'); return; }
  ROSTER.filters[key] = { startDate: start || '', endDate: end || '' };
  // Update pill
  const field = _rosterFilterFields.find(f => f.key === key);
  const pill = document.getElementById('roster-pill-' + key);
  if (pill && field) {
    const valSpan = pill.querySelector('.filter-pill-value');
    if (valSpan) valSpan.textContent = rosterGetFilterSummary(field);
    pill.classList.add('active');
  }
  rosterDebouncedApply();
}

function rosterRenderMultiDropdown(dd, field) {
  const values = rosterGetAllValues(field);
  const f = ROSTER.filters[field.key];
  const selected = f ? f.values : values.slice(); // default: all selected

  const curSort = ROSTER.sortKey === field.key;
  const isAsc = curSort && ROSTER.sortDir === 'asc';
  const isDesc = curSort && ROSTER.sortDir === 'desc';

  let html = '<div class="filter-dropdown-header">'
    + '<span class="filter-dropdown-title">' + escapeHtml(field.label) + '</span>'
    + '<div class="filter-dropdown-sort">'
    + '<button class="filter-sort-btn ' + (isAsc ? 'active-sort' : '') + '" onclick="event.stopPropagation(); rosterSetSort(\'' + field.key + '\', \'asc\')" title="A→Z">A↑</button>'
    + '<button class="filter-sort-btn ' + (isDesc ? 'active-sort' : '') + '" onclick="event.stopPropagation(); rosterSetSort(\'' + field.key + '\', \'desc\')" title="Z→A">Z↓</button>'
    + '</div></div>';

  html += '<div class="filter-dropdown-search"><input type="text" class="form-input form-input-sm" placeholder="Search..." oninput="rosterFilterDropdownSearch(this,\'' + field.key + '\')"></div>';

  html += '<div class="filter-dropdown-actions">'
    + '<button class="filter-action-link" onclick="event.stopPropagation();rosterSelectAll(\'' + field.key + '\')">Select All</button>'
    + '<button class="filter-action-link" onclick="event.stopPropagation();rosterDeselectAll(\'' + field.key + '\')">Deselect All</button>'
    + '</div>';

  html += '<div class="filter-dropdown-list" id="roster-dd-list-' + field.key + '">';
  values.forEach(v => {
    const checked = selected.includes(v) ? 'checked' : '';
    html += '<label class="filter-dropdown-item" data-value="' + escapeAttr(v.toLowerCase()) + '">'
      + '<input type="checkbox" ' + checked + ' onchange="rosterOnCheckChange(\'' + field.key + '\')">'
      + '<span>' + escapeHtml(v) + '</span></label>';
  });
  html += '</div>';

  dd.innerHTML = html;
}

window.rosterFilterDropdownSearch = function(input, key) {
  const q = input.value.toLowerCase();
  const list = document.getElementById('roster-dd-list-' + key);
  if (!list) return;
  list.querySelectorAll('.filter-dropdown-item').forEach(item => {
    const val = item.getAttribute('data-value') || '';
    item.style.display = val.includes(q) ? '' : 'none';
  });
};

window.rosterSelectAll = function(key) {
  const list = document.getElementById('roster-dd-list-' + key);
  if (!list) return;
  list.querySelectorAll('input[type="checkbox"]').forEach(cb => { if (cb.closest('.filter-dropdown-item').style.display !== 'none') cb.checked = true; });
  rosterOnCheckChange(key);
};

window.rosterDeselectAll = function(key) {
  const list = document.getElementById('roster-dd-list-' + key);
  if (!list) return;
  list.querySelectorAll('input[type="checkbox"]').forEach(cb => { if (cb.closest('.filter-dropdown-item').style.display !== 'none') cb.checked = false; });
  rosterOnCheckChange(key);
};

window.rosterOnCheckChange = function(key) {
  const list = document.getElementById('roster-dd-list-' + key);
  if (!list) return;
  const selected = [];
  list.querySelectorAll('.filter-dropdown-item').forEach(item => {
    const cb = item.querySelector('input[type="checkbox"]');
    if (cb && cb.checked) {
      selected.push(item.querySelector('span').textContent);
    }
  });
  const allValues = rosterGetAllValues({ key });
  if (selected.length === allValues.length) {
    delete ROSTER.filters[key]; // all = no filter
  } else {
    ROSTER.filters[key] = { values: selected };
  }
  // Update pill
  const field = _rosterFilterFields.find(f => f.key === key);
  const pill = document.getElementById('roster-pill-' + key);
  if (pill && field) {
    const valSpan = pill.querySelector('.filter-pill-value');
    if (valSpan) valSpan.textContent = rosterGetFilterSummary(field);
    pill.classList.toggle('active', rosterIsFiltered(field));
  }
  rosterDebouncedApply();
};

window.rosterSetSort = function(key, dir) {
  if (ROSTER.sortKey === key && ROSTER.sortDir === dir) {
    ROSTER.sortKey = null;
    ROSTER.sortDir = 'asc';
  } else {
    ROSTER.sortKey = key;
    ROSTER.sortDir = dir;
  }
  rosterApplyFilters();
  rosterRenderTable();
  // Re-render the dropdown to update sort button state
  const dd = document.getElementById('roster-dd-' + key);
  const field = _rosterFilterFields.find(f => f.key === key);
  if (dd && field && dd.classList.contains('open')) {
    if (field.type === 'date_range') rosterRenderDateDropdown(dd, field);
    else rosterRenderMultiDropdown(dd, field);
  }
  // Update all pill sort indicators
  _rosterFilterFields.forEach(f => {
    const p = document.getElementById('roster-pill-' + f.key);
    if (p) p.classList.toggle('has-sort', ROSTER.sortKey === f.key);
  });
};

window.rosterClearAllFilters = function() {
  ROSTER.filters = {};
  ROSTER.searchQuery = '';
  ROSTER.sortKey = null;
  ROSTER.sortDir = 'asc';
  const searchInput = document.getElementById('roster-search-input');
  if (searchInput) searchInput.value = '';
  rosterRenderFilterBar();
  rosterApplyFilters();
  rosterRenderTable();
};

// ===== Filter Application =====
function rosterApplyFilters() {
  let data = ROSTER.employees.slice();

  // Text search
  if (ROSTER.searchQuery) {
    const q = ROSTER.searchQuery.toLowerCase();
    data = data.filter(emp =>
      (emp.ohr_id || '').toLowerCase().includes(q) ||
      (emp.full_name || '').toLowerCase().includes(q) ||
      (emp.last_name || '').toLowerCase().includes(q) ||
      (emp.given_name || '').toLowerCase().includes(q)
    );
  }

  // Apply each filter
  Object.keys(ROSTER.filters).forEach(key => {
    const f = ROSTER.filters[key];
    if (!f) return;

    if (f.startDate !== undefined || f.endDate !== undefined) {
      // Date range filter
      data = data.filter(emp => {
        const val = emp[key];
        if (!val) return false;
        const d = String(val).slice(0, 10);
        if (f.startDate && d < f.startDate) return false;
        if (f.endDate && d > f.endDate) return false;
        return true;
      });
    } else if (f.values) {
      // Multi-select filter
      data = data.filter(emp => {
        const val = emp[key];
        if (val == null || String(val).trim() === '') return f.values.includes('');
        return f.values.includes(String(val).trim());
      });
    }
  });

  // Sort
  if (ROSTER.sortKey) {
    const sk = ROSTER.sortKey;
    const dir = ROSTER.sortDir === 'desc' ? -1 : 1;
    data.sort((a, b) => {
      const va = a[sk] || '';
      const vb = b[sk] || '';
      return String(va).localeCompare(String(vb)) * dir;
    });
  }

  ROSTER.filtered = data;
  ROSTER.page = 1;

  // Update count
  const countEl = document.getElementById('roster-filter-count');
  if (countEl) countEl.textContent = data.length + ' of ' + ROSTER.employees.length;
}

// ===== Table Rendering =====
function rosterRenderTable() {
  const thead = document.getElementById('roster-table-head');
  const tbody = document.getElementById('roster-table-body');
  if (!thead || !tbody) return;

  // Use slim table columns for the main table
  const cols = ROSTER.getTableColumns();
  const data = ROSTER.filtered;

  // Header with sort indicators
  thead.innerHTML = '<tr>' + cols.map(c => {
    const isSorted = ROSTER.sortKey === c.key;
    const arrow = isSorted ? (ROSTER.sortDir === 'asc' ? ' <span class="sort-indicator">↑</span>' : ' <span class="sort-indicator">↓</span>') : '';
    return '<th onclick="rosterSetSort(\'' + c.key + '\', ROSTER.sortKey===\'' + c.key + '\'&&ROSTER.sortDir===\'asc\'?\'desc\':\'asc\')">'
      + escapeHtml(c.label) + arrow + '</th>';
  }).join('') + '</tr>';

  // Paginate
  const start = (ROSTER.page - 1) * ROSTER.pageSize;
  const pageData = data.slice(start, start + ROSTER.pageSize);

  if (pageData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="' + cols.length + '" class="regimen-empty">No employees match the current filters.</td></tr>';
    rosterRenderPagination();
    return;
  }

  tbody.innerHTML = pageData.map(emp => {
    const isActive = emp.employement_status === 'Active';
    const statusClass = isActive ? 'regimen-status-active' : 'regimen-status-inactive';
    const rowId = 'roster-row-' + emp.ohr_id;
    const detailId = 'roster-detail-' + emp.ohr_id;
    return '<tr class="regimen-row" id="' + rowId + '" onclick="rosterToggleInlineDetail(\'' + escapeAttr(emp.ohr_id) + '\')">'
      + cols.map(c => {
        let val = emp[c.key];
        if (c.key === 'srt_id') val = formatSrtId(val);
        if (c.key === 'employement_status') {
          return '<td><span class="regimen-status-badge ' + statusClass + '">' + escapeHtml(val || '') + '</span></td>';
        }
        if (c.key === 'full_name') {
          return '<td><span class="regimen-expand-icon roster-expand-indicator" id="roster-expand-' + emp.ohr_id + '">▶</span>' + escapeHtml(val || '') + '</td>';
        }
        return '<td>' + escapeHtml(val != null ? val : '') + '</td>';
      }).join('')
      + '</tr>'
      + '<tr id="' + detailId + '" style="display:none;"><td colspan="' + cols.length + '" class="regimen-detail-cell"></td></tr>';
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

  el.innerHTML = '<span class="regimen-page-info">' + (total > 0 ? start + '-' + end + ' of ' + total : '0 records') + '</span>'
    + '<select class="regimen-page-size-select" onchange="ROSTER.pageSize=parseInt(this.value);ROSTER.page=1;rosterRenderTable();">'
    + [25, 50, 100].map(n => '<option value="' + n + '"' + (ROSTER.pageSize === n ? ' selected' : '') + '>' + n + '/page</option>').join('')
    + '</select>'
    + '<button class="regimen-page-btn" ' + (ROSTER.page <= 1 ? 'disabled' : '') + ' onclick="ROSTER.page--;rosterRenderTable();">« Prev</button>'
    + '<span class="regimen-page-num">Page ' + ROSTER.page + ' / ' + totalPages + '</span>'
    + '<button class="regimen-page-btn" ' + (ROSTER.page >= totalPages ? 'disabled' : '') + ' onclick="ROSTER.page++;rosterRenderTable();">Next »</button>';
}

// ===== Detail Panel with Inline Audit Trail =====
// ===== Inline Detail Expansion =====
window.rosterToggleInlineDetail = function(ohrId) {
  const detailRow = document.getElementById('roster-detail-' + ohrId);
  const mainRow = document.getElementById('roster-row-' + ohrId);
  if (!detailRow) return;

  // If already open, close it
  if (detailRow.style.display !== 'none') {
    detailRow.style.display = 'none';
    if (mainRow) mainRow.classList.remove('expanded');
    // Clear pending edits for this row
    delete ROSTER._pendingEdits[ohrId];
    return;
  }

  // Close any other open detail rows
  document.querySelectorAll('tr[id^="roster-detail-"]').forEach(r => {
    if (r.id !== detailRow.id) r.style.display = 'none';
  });
  document.querySelectorAll('.regimen-row.expanded').forEach(r => r.classList.remove('expanded'));
  // Clear all pending edits
  ROSTER._pendingEdits = {};

  const emp = ROSTER.employees.find(e => e.ohr_id === ohrId);
  if (!emp) return;

  const cols = ROSTER.getVisibleColumns();
  // Show ALL columns in the detail panel (including those in the slim table)
  const detailCols = cols;

  const groups = [
    { label: 'Identity', keys: detailCols.filter(c => c.group === 'identity') },
    { label: 'Role & Assignment', keys: detailCols.filter(c => c.group === 'role') },
    { label: 'System IDs', keys: detailCols.filter(c => c.group === 'system') },
    { label: 'Assets & Logistics', keys: detailCols.filter(c => c.group === 'asset') },
    { label: 'Dates', keys: detailCols.filter(c => c.group === 'dates') },
    { label: 'Attrition', keys: detailCols.filter(c => c.group === 'attrition') }
  ];

  let html = '<div class="regimen-detail-panel">';

  if (ROSTER.canEdit) {
    // Click-to-edit fields
    groups.forEach(g => {
      if (g.keys.length === 0) return;
      html += '<div class="regimen-detail-section">';
      html += '<div class="regimen-detail-section-title">' + g.label + '</div>';
      html += '<div class="regimen-detail-grid">';
      g.keys.forEach(c => {
        const val = emp[c.key] != null ? emp[c.key] : '';
        const privilegedOhrs = window.ADMIN_OHRS || ['740045023', '740044909'];
        const currentOhr = window._currentUser?.ohr_id || '';
        const isReadOnly = (c.key === 'ohr_id' || c.key === 'full_name') && !privilegedOhrs.includes(currentOhr);
        html += '<div class="regimen-field">'
          + '<span class="regimen-field-label">' + escapeHtml(c.label) + '</span>';
        if (isReadOnly) {
          html += '<input type="text" class="regimen-field-input" data-field="' + c.key + '" data-ohr="' + escapeAttr(ohrId) + '" value="' + escapeAttr(val) + '" readonly>';
        } else {
          html += '<div class="regimen-field-value editable" data-field="' + c.key + '" data-ohr="' + escapeAttr(ohrId) + '" onclick="rosterStartFieldEdit(this)" title="Click to edit">'
            + escapeHtml(val || '\u2014')
            + '</div>';
        }
        html += '</div>';
      });
      html += '</div></div>';
    });
    html += '<div class="regimen-detail-actions">'
      + '<button class="regimen-save-btn" onclick="event.stopPropagation();rosterSaveInlineDetail(\'' + escapeAttr(ohrId) + '\');">Save Changes</button>'
      + '<button class="regimen-cancel-btn" onclick="event.stopPropagation();rosterToggleInlineDetail(\'' + escapeAttr(ohrId) + '\');">Cancel</button>'
      + '<span class="regimen-unsaved-indicator" id="roster-unsaved-' + ohrId + '" style="display:none;">Unsaved changes</span>'
      + '</div>';
  } else {
    // Read-only view
    groups.forEach(g => {
      if (g.keys.length === 0) return;
      html += '<div class="regimen-detail-section">';
      html += '<div class="regimen-detail-section-title">' + g.label + '</div>';
      html += '<div class="regimen-detail-grid">';
      g.keys.forEach(c => {
        let val = emp[c.key];
        if (c.key === 'srt_id') val = formatSrtId(val);
        const displayVal = val != null && String(val).trim() !== '' ? escapeHtml(val) : '<span class="regimen-field-readonly empty">\u2014</span>';
        html += '<div class="regimen-field">'
          + '<span class="regimen-field-label">' + escapeHtml(c.label) + '</span>'
          + '<span class="regimen-field-readonly">' + displayVal + '</span>'
          + '</div>';
      });
      html += '</div></div>';
    });
  }

  // Audit trail section
  html += '<div class="regimen-audit-section">'
    + '<div class="regimen-audit-title">Audit Trail</div>'
    + '<div id="roster-inline-audit-' + ohrId + '" style="font-size:11px;color:var(--fg-muted);">Loading audit trail...</div>'
    + '</div>';

  html += '</div>';

  const td = detailRow.querySelector('td');
  if (td) td.innerHTML = html;
  detailRow.style.display = '';
  if (mainRow) mainRow.classList.add('expanded');

  // Load audit trail
  rosterLoadInlineAuditTrailFor(ohrId);
};

// Click-to-edit: convert value display to input
window.rosterStartFieldEdit = function(el) {
  if (!el || el.classList.contains('editing')) return;
  event.stopPropagation();

  const field = el.getAttribute('data-field');
  const ohrId = el.getAttribute('data-ohr');
  const emp = ROSTER.employees.find(e => e.ohr_id === ohrId);
  if (!emp) return;

  // Get current value (from pending edits or original)
  const pending = ROSTER._pendingEdits[ohrId] || {};
  const currentVal = pending[field] !== undefined ? pending[field] : (emp[field] != null ? String(emp[field]) : '');

  // Replace with input
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'regimen-field-input';
  input.value = currentVal;
  input.setAttribute('data-field', field);
  input.setAttribute('data-ohr', ohrId);

  el.replaceWith(input);
  input.focus();
  input.select();

  // On blur or Enter, save value and revert to display
  const finishEdit = function() {
    const newVal = input.value.trim();
    const origVal = emp[field] != null ? String(emp[field]).trim() : '';

    // Track pending edit
    if (!ROSTER._pendingEdits[ohrId]) ROSTER._pendingEdits[ohrId] = {};
    if (newVal !== origVal) {
      ROSTER._pendingEdits[ohrId][field] = newVal;
    } else {
      delete ROSTER._pendingEdits[ohrId][field];
      if (Object.keys(ROSTER._pendingEdits[ohrId]).length === 0) delete ROSTER._pendingEdits[ohrId];
    }

    // Show unsaved indicator
    const indicator = document.getElementById('roster-unsaved-' + ohrId);
    if (indicator) {
      const hasPending = ROSTER._pendingEdits[ohrId] && Object.keys(ROSTER._pendingEdits[ohrId]).length > 0;
      indicator.style.display = hasPending ? '' : 'none';
    }

    // Revert to display div
    const div = document.createElement('div');
    div.className = 'regimen-field-value editable' + (newVal !== origVal ? ' editing' : '');
    div.setAttribute('data-field', field);
    div.setAttribute('data-ohr', ohrId);
    div.setAttribute('onclick', 'rosterStartFieldEdit(this)');
    div.setAttribute('title', 'Click to edit');
    div.textContent = newVal || '\u2014';
    if (newVal !== origVal) {
      div.style.borderColor = 'var(--warning)';
      div.style.background = 'rgba(217, 119, 6, 0.06)';
    }
    input.replaceWith(div);
  };

  input.addEventListener('blur', finishEdit);
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') {
      // Revert without saving
      const origVal = emp[field] != null ? String(emp[field]).trim() : '';
      input.value = origVal;
      input.blur();
    }
  });
};

// Save from inline detail
window.rosterSaveInlineDetail = async function(ohrId) {
  const updates = ROSTER._pendingEdits[ohrId] || {};

  // Also check any active inputs still in the DOM
  const inputs = document.querySelectorAll('input.regimen-field-input[data-ohr="' + ohrId + '"]:not([readonly])');
  const emp = ROSTER.employees.find(e => e.ohr_id === ohrId);
  inputs.forEach(input => {
    const field = input.getAttribute('data-field');
    if (field === 'ohr_id' || field === 'full_name') return;
    const newVal = input.value.trim();
    const oldVal = emp[field] != null ? String(emp[field]).trim() : '';
    if (newVal !== oldVal) updates[field] = newVal;
  });

  if (Object.keys(updates).length === 0) {
    showToast('No changes to save', 'info');
    return;
  }
  try {
    updates._actor_ohr = currentUser ? currentUser.ohr_id : '';
    updates._actor_name = currentUser ? currentUser.full_name : '';
    const resp = await fetch('/api/io/employees/' + encodeURIComponent(ohrId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!resp.ok) throw new Error('Save failed');
    showToast('Employee updated successfully', 'success');
    // Close inline detail and refresh
    delete ROSTER._pendingEdits[ohrId];
    const detailRow = document.getElementById('roster-detail-' + ohrId);
    if (detailRow) detailRow.style.display = 'none';
    const mainRow = document.getElementById('roster-row-' + ohrId);
    if (mainRow) mainRow.classList.remove('expanded');
    await rosterFetchEmployees();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
};

async function rosterLoadInlineAuditTrailFor(ohrId) {
  const body = document.getElementById('roster-inline-audit-' + ohrId);
  if (!body) return;
  try {
    const resp = await fetch('/api/io/audit-log?record_type=employee&record_id=' + encodeURIComponent(ohrId));
    if (!resp.ok) throw new Error('Failed to load');
    const logs = await resp.json();
    if (!logs || logs.length === 0) {
      body.innerHTML = '<div style="color:var(--fg-muted);padding:4px 0;">No changes recorded.</div>';
      return;
    }
    let html = '<div class="regimen-audit-list">';
    logs.forEach(log => {
      const ts = log.timestamp ? new Date(log.timestamp).toLocaleString() : '';
      let changes = '';
      try {
        const diff = typeof log.changes === 'string' ? JSON.parse(log.changes) : log.changes;
        if (diff && typeof diff === 'object') {
          changes = Object.entries(diff).map(([k, v]) => {
            const colDef = ALL_COLUMNS.find(c => c.key === k);
            const label = colDef ? colDef.label : k;
            if (v && typeof v === 'object' && 'from' in v && 'to' in v) {
              return '<span style="font-weight:600;">' + escapeHtml(label) + '</span>: '
                + '<span class="regimen-audit-change-from">' + escapeHtml(v.from || '(empty)') + '</span>'
                + ' &rarr; <span class="regimen-audit-change-to">' + escapeHtml(v.to || '(empty)') + '</span>';
            }
            return '<span style="font-weight:600;">' + escapeHtml(label) + '</span>: ' + escapeHtml(JSON.stringify(v));
          }).join('<br>');
        }
      } catch (e) {
        changes = escapeHtml(String(log.changes || ''));
      }
      html += '<div class="regimen-audit-entry">'
        + '<div class="regimen-audit-header">'
        + '<span class="regimen-audit-actor">' + escapeHtml(log.changed_by || 'System') + '</span>'
        + '<span class="regimen-audit-time">' + escapeHtml(ts) + '</span>'
        + '</div>'
        + '<div>' + changes + '</div>'
        + '</div>';
    });
    html += '</div>';
    body.innerHTML = html;
  } catch (e) {
    body.innerHTML = '<div style="color:var(--error);padding:4px 0;">Failed to load audit trail.</div>';
  }
}

// Legacy modal opener (kept for Add Employee and other uses)
window.rosterOpenDetail = function(ohrId) {
  const emp = ROSTER.employees.find(e => e.ohr_id === ohrId);
  if (!emp) return;
  const overlay = document.getElementById('roster-form-overlay');
  const title = document.getElementById('roster-form-title');
  const body = document.getElementById('roster-form-body');
  const footer = document.getElementById('roster-form-footer');
  if (!overlay || !body) return;
  title.textContent = (emp.full_name || emp.ohr_id) + ' — Details';
  const cols = ROSTER.getVisibleColumns();
  // Group columns
  const groups = [
    { label: 'Identity', keys: cols.filter(c => c.group === 'identity') },
    { label: 'Role & Assignment', keys: cols.filter(c => c.group === 'role') },
    { label: 'System IDs', keys: cols.filter(c => c.group === 'system') },
    { label: 'Assets & Logistics', keys: cols.filter(c => c.group === 'asset') },
    { label: 'Dates', keys: cols.filter(c => c.group === 'dates') },
    { label: 'Attrition', keys: cols.filter(c => c.group === 'attrition') }
  ];
  let html = '';
  if (ROSTER.canEdit) {
    // Editable form — 2-column grid with label on top, input below
    groups.forEach(g => {
      if (g.keys.length === 0) return;
      html += '<div style="margin-bottom:16px;">';
      html += '<div style="font-size:13px;font-weight:700;color:var(--primary);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);padding-bottom:4px;">' + g.label + '</div>';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;">';
      g.keys.forEach(c => {
        const val = emp[c.key] != null ? emp[c.key] : '';
        const privilegedOhrs = window.ADMIN_OHRS || ['740045023', '740044909'];
        const currentOhr = window._currentUser?.ohr_id || '';
        const isReadOnly = (c.key === 'ohr_id' || c.key === 'full_name') && !privilegedOhrs.includes(currentOhr);
        html += '<div>'
          + '<label style="font-size:11px;font-weight:600;color:var(--fg-muted);display:block;margin-bottom:2px;">' + escapeHtml(c.label) + '</label>'
          + '<input type="text" class="form-input form-input-sm" data-field="' + c.key + '" value="' + escapeAttr(val) + '"'
          + (isReadOnly ? ' readonly style="opacity:0.6;"' : '')
          + '></div>';
      });
      html += '</div></div>';
    });
  } else {
    // Read-only view — 2-column grid with label left, value right
    groups.forEach(g => {
      if (g.keys.length === 0) return;
      html += '<div style="margin-bottom:16px;">';
      html += '<div style="font-size:13px;font-weight:700;color:var(--primary);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);padding-bottom:4px;">' + g.label + '</div>';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;">';
      g.keys.forEach(c => {
        let val = emp[c.key];
        if (c.key === 'srt_id') val = formatSrtId(val);
        html += '<div style="display:flex;gap:8px;padding:4px 0;">'
          + '<span style="font-size:11px;font-weight:600;color:var(--fg-muted);min-width:120px;">' + escapeHtml(c.label) + '</span>'
          + '<span style="font-size:12px;color:var(--fg);">' + escapeHtml(val != null ? val : '—') + '</span>'
          + '</div>';
      });
      html += '</div></div>';
    });
  }
  // ===== Inline Audit Trail Section =====
  html += '<div style="margin-top:16px;border-top:2px solid var(--border);padding-top:16px;">';
  html += '<div style="font-size:13px;font-weight:700;color:var(--primary);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Audit Trail</div>';
  html += '<div id="roster-detail-audit-body" style="font-size:12px;color:var(--fg-muted);">Loading audit trail...</div>';
  html += '</div>';
  body.innerHTML = html;
  // Footer
  if (ROSTER.canEdit) {
    footer.innerHTML = '<button class="btn btn-primary btn-sm" onclick="rosterSaveDetail(\'' + escapeAttr(ohrId) + '\')">Save Changes</button>'
      + '<button class="btn btn-ghost btn-sm" onclick="rosterCloseForm()">Cancel</button>';
  } else {
    footer.innerHTML = '<button class="btn btn-ghost btn-sm" onclick="rosterCloseForm()">Close</button>';
  }
  overlay.style.display = 'flex';
  // Load audit trail inline
  rosterLoadInlineAuditTrail(ohrId);
};

async function rosterLoadInlineAuditTrail(ohrId) {
  const body = document.getElementById('roster-detail-audit-body');
  if (!body) return;
  try {
    const resp = await fetch('/api/io/audit-log?record_type=employee&record_id=' + encodeURIComponent(ohrId));
    if (!resp.ok) throw new Error('Failed to load');
    const logs = await resp.json();
    if (!logs || logs.length === 0) {
      body.innerHTML = '<div style="color:var(--fg-muted);padding:8px 0;">No changes recorded for this employee.</div>';
      return;
    }
    let html = '<div style="max-height:300px;overflow-y:auto;">';
    logs.forEach(log => {
      const ts = log.timestamp ? new Date(log.timestamp).toLocaleString() : '';
      let changes = '';
      try {
        const diff = typeof log.changes === 'string' ? JSON.parse(log.changes) : log.changes;
        if (diff && typeof diff === 'object') {
          changes = Object.entries(diff).map(([k, v]) => {
            const colDef = ALL_COLUMNS.find(c => c.key === k);
            const label = colDef ? colDef.label : k;
            if (v && typeof v === 'object' && 'from' in v && 'to' in v) {
              return '<span style="font-weight:600;">' + escapeHtml(label) + '</span>: '
                + '<span style="color:#EF4444;text-decoration:line-through;">' + escapeHtml(v.from || '(empty)') + '</span>'
                + ' &rarr; <span style="color:#22C55E;">' + escapeHtml(v.to || '(empty)') + '</span>';
            }
            return '<span style="font-weight:600;">' + escapeHtml(label) + '</span>: ' + escapeHtml(JSON.stringify(v));
          }).join('<br>');
        }
      } catch (e) {
        changes = escapeHtml(String(log.changes || ''));
      }
      html += '<div style="padding:8px 0;border-bottom:1px solid var(--border-muted);">'
        + '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">'
        + '<span style="font-weight:600;color:var(--fg);">' + escapeHtml(log.changed_by || 'System') + '</span>'
        + '<span style="color:var(--fg-muted);font-size:11px;">' + escapeHtml(ts) + '</span>'
        + '</div>'
        + '<div>' + changes + '</div>'
        + '</div>';
    });
    html += '</div>';
    body.innerHTML = html;
  } catch (e) {
    body.innerHTML = '<div style="color:var(--danger);padding:4px 0;">Failed to load audit trail.</div>';
  }
}

window.rosterCloseForm = function() {
  const overlay = document.getElementById('roster-form-overlay');
  if (overlay) overlay.style.display = 'none';
};

window.rosterSaveDetail = async function(ohrId) {
  const body = document.getElementById('roster-form-body');
  if (!body) return;
  const inputs = body.querySelectorAll('input[data-field]');
  const updates = {};
  const emp = ROSTER.employees.find(e => e.ohr_id === ohrId);
  inputs.forEach(input => {
    const field = input.getAttribute('data-field');
    if (field === 'ohr_id' || field === 'full_name') return;
    const newVal = input.value.trim();
    const oldVal = emp[field] != null ? String(emp[field]).trim() : '';
    if (newVal !== oldVal) updates[field] = newVal;
  });

  if (Object.keys(updates).length === 0) {
    showToast('No changes to save', 'info');
    return;
  }

  try {
    // Include actor info for audit trail using currentUser (global)
    updates._actor_ohr = currentUser ? currentUser.ohr_id : '';
    updates._actor_name = currentUser ? currentUser.full_name : '';
    const resp = await fetch('/api/io/employees/' + encodeURIComponent(ohrId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!resp.ok) throw new Error('Save failed');
    showToast('Employee updated successfully', 'success');
    rosterCloseForm();
    await rosterFetchEmployees();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
};

// ===== Add Employee Form =====
window.rosterShowAddForm = function() {
  const overlay = document.getElementById('roster-form-overlay');
  const title = document.getElementById('roster-form-title');
  const body = document.getElementById('roster-form-body');
  const footer = document.getElementById('roster-form-footer');
  if (!overlay || !body) return;

  title.textContent = 'Add New Employee';

  let html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;">';
  html += '<div><label style="font-size:11px;font-weight:600;color:var(--fg-muted);display:block;margin-bottom:2px;">OHR ID *</label>'
    + '<input type="text" class="form-input form-input-sm" id="add-emp-ohr" placeholder="e.g. 740012345"></div>';
  html += '<div><label style="font-size:11px;font-weight:600;color:var(--fg-muted);display:block;margin-bottom:2px;">Status</label>'
    + '<select class="form-input form-input-sm" id="add-emp-status"><option value="Active">Active</option><option value="Inactive">Inactive</option></select></div>';
  html += '<div><label style="font-size:11px;font-weight:600;color:var(--fg-muted);display:block;margin-bottom:2px;">Role</label>'
    + '<select class="form-input form-input-sm" id="add-emp-role">'
    + '<option value="Agent">Agent</option><option value="Operational SME">Operational SME</option>'
    + '<option value="Quality Analyst">Quality Analyst</option><option value="Trainer">Trainer</option>'
    + '<option value="Team Lead">Team Lead</option><option value="Manager">Manager</option></select></div>';
  html += '<div><label style="font-size:11px;font-weight:600;color:var(--fg-muted);display:block;margin-bottom:2px;">Planning Group</label>'
    + '<input type="text" class="form-input form-input-sm" id="add-emp-pg" placeholder="Planning group"></div>';
  html += '</div>';

  body.innerHTML = html;
  footer.innerHTML = '<button class="btn btn-primary btn-sm" onclick="rosterSaveNewEmployee()">Add Employee</button>'
    + '<button class="btn btn-ghost btn-sm" onclick="rosterCloseForm()">Cancel</button>';

  overlay.style.display = 'flex';
};

window.rosterSaveNewEmployee = async function() {
  const ohr = (document.getElementById('add-emp-ohr') || {}).value || '';
  const status = (document.getElementById('add-emp-status') || {}).value || 'Active';
  const role = (document.getElementById('add-emp-role') || {}).value || 'Agent';
  const pg = (document.getElementById('add-emp-pg') || {}).value || '';

  if (!ohr.trim()) { showToast('OHR ID is required', 'error'); return; }

  try {
    const resp = await fetch('/api/io/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ohr_id: ohr.trim(), employement_status: status, actual_role: role, planning_group: pg })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to add employee');
    }
    showToast('Employee added successfully', 'success');
    rosterCloseForm();
    await rosterFetchEmployees();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
};

// ===== CSV Export =====
window.rosterExportCSV = function() {
  const cols = ROSTER.getVisibleColumns();
  const data = ROSTER.filtered;

  if (data.length === 0) { showToast('No records to export', 'info'); return; }

  const escCSV = (v) => {
    if (v == null) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };

  let csv = cols.map(c => escCSV(c.label)).join(',') + '\n';
  data.forEach(emp => {
    csv += cols.map(c => {
      let val = emp[c.key];
      if (c.key === 'srt_id') val = formatSrtId(val);
      return escCSV(val);
    }).join(',') + '\n';
  });

  const today = new Date().toISOString().slice(0, 10);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'regimen-roster-' + today + '.csv';
  link.click();
  URL.revokeObjectURL(url);
  showToast('Exported ' + data.length + ' records', 'success');
};

// ===== Tab Switching =====
window.rosterSwitchTab = function(tab) {
  const panels = ['roster', 'onboarding'];

  panels.forEach(p => {
    const panel = document.getElementById('regimen-panel-' + p);
    if (panel) panel.style.display = 'none';
    const tabBtn = document.getElementById('regimen-tab-' + p);
    if (tabBtn) {
      tabBtn.classList.remove('active');
    }
  });

  const activePanel = document.getElementById('regimen-panel-' + tab);
  if (activePanel) activePanel.style.display = '';
  const activeTab = document.getElementById('regimen-tab-' + tab);
  if (activeTab) {
    activeTab.classList.add('active');
  }

  if (tab === 'onboarding') incompleteRosteringRenderDashboard();
};

// ===== Incomplete Rostering =====
// Shows ALL employees who have at least one column blank, with completion rate

const IR_DISPLAY_COLUMNS = ALL_COLUMNS.map(c => c.key);
const IR_LABELS = {};
ALL_COLUMNS.forEach(c => { IR_LABELS[c.key] = c.label; });

let _irPage = 1;
const _irPageSize = 25;

// IR filter state
const IR_STATE = {
  filters: {},
  searchQuery: '',
  sortKey: null,
  sortDir: 'asc'
};

function irGetAllValues(field) {
  const vals = new Set();
  ROSTER.employees.forEach(emp => {
    const v = emp[field.key];
    if (v != null && String(v).trim() !== '') vals.add(String(v).trim());
  });
  return Array.from(vals).sort((a, b) => a.localeCompare(b));
}

// Build IR filter fields — same multi-select approach as Roster but simpler set
const IR_FILTER_FIELDS = [
  { key: 'employement_status', label: 'Status', type: 'multi' },
  { key: 'actual_role', label: 'Role', type: 'multi' },
  { key: '_ir_search', label: 'Search', type: 'search' }
];

function irGetFilterSummary(field) {
  if (field.type === 'search') return IR_STATE.searchQuery || 'All';
  const f = IR_STATE.filters[field.key];
  if (!f || !f.values) return 'All';
  const allValues = irGetAllValues(field);
  if (f.values.length === 0) return 'None';
  if (f.values.length === allValues.length) return 'All';
  if (f.values.length === 1) return f.values[0];
  return f.values.length + ' selected';
}

function irIsFiltered(field) {
  if (field.type === 'search') return IR_STATE.searchQuery.length > 0;
  const f = IR_STATE.filters[field.key];
  if (!f) return false;
  const allValues = irGetAllValues(field);
  return f.values && f.values.length < allValues.length;
}

let _irDebounceTimer = null;
function irDebouncedApply() {
  clearTimeout(_irDebounceTimer);
  _irDebounceTimer = setTimeout(() => { incompleteRosteringRenderDashboard(); }, 300);
}

function irRenderFilterBar() {
  // === Toolbar row: search + count + clear (matches Roster layout) ===
  const toolbar = document.getElementById('ir-filter-toolbar');
  if (toolbar) {
    let tbHtml = '';
    // Export CSV for IR
    tbHtml += '<button class="btn btn-outline btn-sm" id="ir-export-btn" onclick="irExportCSV()" style="white-space:nowrap;">'
      + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Export'
      + '</button>';
    // Search box
    tbHtml += '<div class="regimen-search-box">'
      + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
      + '<input type="text" id="ir-search-input" placeholder="Search OHR / Name..." '
      + 'value="' + escapeAttr(IR_STATE.searchQuery) + '" '
      + 'oninput="IR_STATE.searchQuery=this.value;irDebouncedApply();">'
      + '</div>';
    // Count + Clear
    tbHtml += '<span class="regimen-filter-count" id="ir-filter-count"></span>';
    tbHtml += '<button class="btn btn-ghost btn-xs" onclick="irClearAllFilters()" title="Clear all filters" style="white-space:nowrap;flex-shrink:0;">✕ Clear</button>';
    toolbar.innerHTML = tbHtml;
  }

  // === Filter pills row ===
  const container = document.getElementById('ir-filter-pills');
  if (!container) return;

  let html = '';
  IR_FILTER_FIELDS.forEach(field => {
    if (field.type === 'search') return; // search is now in toolbar

    const summary = irGetFilterSummary(field);
    const isActive = irIsFiltered(field);
    html += '<div class="filter-pill' + (isActive ? ' active' : '') + '" id="ir-pill-' + field.key + '" onclick="irToggleDropdown(\'' + field.key + '\')">' 
      + '<span class="filter-pill-label">' + escapeHtml(field.label) + '</span> '
      + '<span class="filter-pill-value">' + escapeHtml(summary) + '</span>'
      + '<span class="filter-pill-icon">▾</span>'
      + '<div class="filter-dropdown" id="ir-dd-' + field.key + '"></div>'
      + '</div>';
  });

  container.innerHTML = html;
}

window.irToggleDropdown = function(key) {
  const dd = document.getElementById('ir-dd-' + key);
  const pill = document.getElementById('ir-pill-' + key);
  if (!dd || !pill) return;

  const wasOpen = dd.classList.contains('open');
  document.querySelectorAll('#ir-filter-pills .filter-dropdown.open').forEach(d => {
    d.classList.remove('open');
    d.parentElement.classList.remove('open');
  });
  if (wasOpen) return;

  dd.classList.add('open');
  pill.classList.add('open');

  const field = IR_FILTER_FIELDS.find(f => f.key === key);
  if (!field) return;

  // Render multi dropdown
  irRenderMultiDropdown(dd, field);
  dd.onclick = function(e) { e.stopPropagation(); };
};

function irRenderMultiDropdown(dd, field) {
  const values = irGetAllValues(field);
  const f = IR_STATE.filters[field.key];
  const selected = f ? f.values : values.slice();

  let ddHtml = '<div class="filter-dropdown-header"><span class="filter-dropdown-title">' + escapeHtml(field.label) + '</span></div>';
  ddHtml += '<div class="filter-dropdown-search"><input type="text" class="form-input form-input-sm" placeholder="Search..." oninput="irFilterDropdownSearch(this,\'' + field.key + '\')"></div>';
  ddHtml += '<div class="filter-dropdown-actions">'
    + '<button class="filter-action-link" onclick="event.stopPropagation();irSelectAll(\'' + field.key + '\')">Select All</button>'
    + '<button class="filter-action-link" onclick="event.stopPropagation();irDeselectAll(\'' + field.key + '\')">Deselect All</button>'
    + '</div>';
  ddHtml += '<div class="filter-dropdown-list" id="ir-dd-list-' + field.key + '">';
  values.forEach(v => {
    const checked = selected.includes(v) ? 'checked' : '';
    ddHtml += '<label class="filter-dropdown-item" data-value="' + escapeAttr(v.toLowerCase()) + '">'
      + '<input type="checkbox" ' + checked + ' onchange="irOnCheckChange(\'' + field.key + '\')">'
      + '<span>' + escapeHtml(v) + '</span></label>';
  });
  ddHtml += '</div>';
  dd.innerHTML = ddHtml;
}

window.irFilterDropdownSearch = function(input, key) {
  const q = input.value.toLowerCase();
  const list = document.getElementById('ir-dd-list-' + key);
  if (!list) return;
  list.querySelectorAll('.filter-dropdown-item').forEach(item => {
    item.style.display = (item.getAttribute('data-value') || '').includes(q) ? '' : 'none';
  });
};

window.irSelectAll = function(key) {
  const list = document.getElementById('ir-dd-list-' + key);
  if (!list) return;
  list.querySelectorAll('input[type="checkbox"]').forEach(cb => { if (cb.closest('.filter-dropdown-item').style.display !== 'none') cb.checked = true; });
  irOnCheckChange(key);
};

window.irDeselectAll = function(key) {
  const list = document.getElementById('ir-dd-list-' + key);
  if (!list) return;
  list.querySelectorAll('input[type="checkbox"]').forEach(cb => { if (cb.closest('.filter-dropdown-item').style.display !== 'none') cb.checked = false; });
  irOnCheckChange(key);
};

window.irOnCheckChange = function(key) {
  const list = document.getElementById('ir-dd-list-' + key);
  if (!list) return;
  const selected = [];
  list.querySelectorAll('.filter-dropdown-item').forEach(item => {
    const cb = item.querySelector('input[type="checkbox"]');
    if (cb && cb.checked) selected.push(item.querySelector('span').textContent);
  });
  const allValues = irGetAllValues({ key });
  if (selected.length === allValues.length) {
    delete IR_STATE.filters[key];
  } else {
    IR_STATE.filters[key] = { values: selected };
  }
  const field = IR_FILTER_FIELDS.find(f => f.key === key);
  const pill = document.getElementById('ir-pill-' + key);
  if (pill && field) {
    const valSpan = pill.querySelector('.filter-pill-value');
    if (valSpan) valSpan.textContent = irGetFilterSummary(field);
    pill.classList.toggle('active', irIsFiltered(field));
  }
  irDebouncedApply();
};

window.irClearAllFilters = function() {
  IR_STATE.filters = {};
  IR_STATE.searchQuery = '';
  const searchInput = document.getElementById('ir-search-input');
  if (searchInput) searchInput.value = '';
  irRenderFilterBar();
  incompleteRosteringRenderDashboard();
};

function incompleteRosteringGetData() {
  let data = ROSTER.employees.map(emp => {
    const missingFields = IR_DISPLAY_COLUMNS.filter(f => {
      const val = emp[f];
      return val === null || val === undefined || String(val).trim() === '';
    });
    const totalFields = IR_DISPLAY_COLUMNS.length;
    const filledFields = totalFields - missingFields.length;
    const completionRate = totalFields > 0 ? ((filledFields / totalFields) * 100).toFixed(1) : '100.0';
    return { ...emp, missingFields, isComplete: missingFields.length === 0, completionRate };
  });

  // Apply IR filters
  if (IR_STATE.searchQuery) {
    const q = IR_STATE.searchQuery.toLowerCase();
    data = data.filter(e =>
      (e.ohr_id || '').toLowerCase().includes(q) ||
      (e.full_name || '').toLowerCase().includes(q)
    );
  }
  Object.keys(IR_STATE.filters).forEach(key => {
    const f = IR_STATE.filters[key];
    if (f && f.values) {
      data = data.filter(emp => {
        const val = emp[key];
        if (val == null || String(val).trim() === '') return f.values.includes('');
        return f.values.includes(String(val).trim());
      });
    }
  });

  return data;
}

function incompleteRosteringRenderDashboard() {
  irRenderFilterBar();
  incompleteRosteringRenderTable();
}

window.incompleteRosteringRenderTable = function() {
  const thead = document.getElementById('onboarding-table-head');
  const tbody = document.getElementById('onboarding-table-body');
  if (!thead || !tbody) return;

  let allData = incompleteRosteringGetData();

  // Only show incomplete employees
  allData = allData.filter(e => !e.isComplete);

  // Sort: most missing fields first, then by name
  allData.sort((a, b) => {
    if (a.missingFields.length !== b.missingFields.length) return b.missingFields.length - a.missingFields.length;
    return (a.full_name || '').localeCompare(b.full_name || '');
  });

  // Update filter count
  const irCountEl = document.getElementById('ir-filter-count');
  if (irCountEl) {
    const totalEmps = ROSTER.employees.length;
    irCountEl.textContent = allData.length + ' of ' + totalEmps + ' incomplete';
  }

  thead.innerHTML = '<tr>'
    + '<th>OHR ID</th>'
    + '<th>Full Name</th>'
    + '<th>Status</th>'
    + '<th>Role</th>'
    + '<th>Completion Rate</th>'
    + '<th>Missing Count</th>'
    + '<th>Missing Fields</th>'
    + '</tr>';

  const start = (_irPage - 1) * _irPageSize;
  const pageData = allData.slice(start, start + _irPageSize);

  if (pageData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="regimen-empty">All employees are fully rostered!</td></tr>';
    irRenderPagination(allData.length);
    return;
  }

  tbody.innerHTML = pageData.map(emp => {
    const isActive = emp.employement_status === 'Active';
    const statusClass = isActive ? 'regimen-status-active' : 'regimen-status-inactive';
    const rate = parseFloat(emp.completionRate);
    const rateColor = rate >= 90 ? '#22C55E' : rate >= 70 ? '#F59E0B' : '#EF4444';
    const missingHtml = emp.missingFields.map(f =>
      '<span class="ir-missing-tag">' + escapeHtml(IR_LABELS[f] || f) + '</span>'
    ).join('');

    return '<tr class="regimen-row" onclick="rosterOpenDetail(\'' + escapeAttr(emp.ohr_id) + '\')">'
      + '<td style="font-weight:600;font-family:\'SF Mono\',\'Fira Code\',monospace;font-size:12px;">' + escapeHtml(emp.ohr_id || '') + '</td>'
      + '<td>' + escapeHtml(emp.full_name || '') + '</td>'
      + '<td><span class="regimen-status-badge ' + statusClass + '">' + escapeHtml(emp.employement_status || '') + '</span></td>'
      + '<td>' + escapeHtml(emp.actual_role || '') + '</td>'
      + '<td><div class="ir-completion-bar">'
      + '<div class="ir-bar-track"><div class="ir-bar-fill" style="width:' + rate + '%;background:' + rateColor + ';"></div></div>'
      + '<span class="ir-bar-label" style="color:' + rateColor + ';">' + emp.completionRate + '%</span>'
      + '</div></td>'
      + '<td style="text-align:center;font-weight:600;color:#B45309;">' + emp.missingFields.length + '</td>'
      + '<td style="max-width:500px;">' + missingHtml + '</td>'
      + '</tr>';
  }).join('');

  irRenderPagination(allData.length);
};

function irRenderPagination(total) {
  const el = document.getElementById('onboarding-pagination');
  if (!el) return;
  const totalPages = Math.ceil(total / _irPageSize) || 1;
  const start = (_irPage - 1) * _irPageSize + 1;
  const end = Math.min(_irPage * _irPageSize, total);

  el.innerHTML = '<span class="regimen-page-info">' + (total > 0 ? start + '-' + end + ' of ' + total : '0 records') + '</span>'
    + '<button class="regimen-page-btn" ' + (_irPage <= 1 ? 'disabled' : '') + ' onclick="_irPage--;incompleteRosteringRenderTable();">« Prev</button>'
    + '<span class="regimen-page-num">Page ' + _irPage + ' / ' + totalPages + '</span>'
    + '<button class="regimen-page-btn" ' + (_irPage >= totalPages ? 'disabled' : '') + ' onclick="_irPage++;incompleteRosteringRenderTable();">Next »</button>';
}

// IR Export CSV
window.irExportCSV = function() {
  let data = incompleteRosteringGetData().filter(e => !e.isComplete);
  data.sort((a, b) => b.missingFields.length - a.missingFields.length || (a.full_name || '').localeCompare(b.full_name || ''));
  if (data.length === 0) { showToast('No incomplete records to export.', 'info'); return; }
  const headers = ['OHR ID','Full Name','Status','Role','Completion Rate','Missing Count','Missing Fields'];
  const rows = data.map(e => [
    e.ohr_id, e.full_name, e.employement_status, e.actual_role,
    e.completionRate + '%', e.missingFields.length,
    e.missingFields.map(f => IR_LABELS[f] || f).join('; ')
  ]);
  let csv = headers.join(',') + '\n';
  rows.forEach(r => { csv += r.map(v => '"' + String(v || '').replace(/"/g, '""') + '"').join(',') + '\n'; });
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'incomplete_rostering_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('Exported ' + data.length + ' records.', 'success');
};

// Backward compat
function onboardingRenderDashboard() { incompleteRosteringRenderDashboard(); }
window.onboardingRenderTable = function() { incompleteRosteringRenderTable(); };

// ===== Fetch & Init =====
async function rosterFetchEmployees() {
  const loading = document.getElementById('roster-loading');
  if (loading) loading.style.display = '';

  try {
    const resp = await fetch('/api/io/employees');
    if (!resp.ok) throw new Error('Failed to fetch employees');
    ROSTER.employees = await resp.json();
  } catch (e) {
    showToast('Error loading roster: ' + e.message, 'error');
    ROSTER.employees = [];
  }

  if (loading) loading.style.display = 'none';

  // Determine permissions from currentUser stored in sessionStorage
  let perms = {};
  try {
    const userRaw = sessionStorage.getItem('playbook_user');
    if (userRaw) {
      const user = JSON.parse(userRaw);
      perms = user.permissions || {};
    }
  } catch(e) {}

  // Tier: full if regimen.full_columns is granted
  ROSTER.tier = perms['regimen.full_columns'] ? 'full' : 'limited';

  // Can edit: regimen.edit_employee
  ROSTER.canEdit = !!perms['regimen.edit_employee'];

  // Owner check for ownerOnly columns (Sex column)
  try {
    const u = JSON.parse(sessionStorage.getItem('playbook_user') || '{}');
    ROSTER.isOwner = (window.ADMIN_OHRS || []).includes(u.open_id) || (window.ADMIN_OHRS || []).includes(u.ohr_id);
  } catch(e) { ROSTER.isOwner = false; }

  // Show/hide tabs
  const onboardingTab = document.getElementById('regimen-tab-onboarding');
  if (onboardingTab) onboardingTab.style.display = perms['regimen.onboarding_tab'] ? '' : 'none';
  // Permissions tab moved to Admin Tools

  // Render (must happen BEFORE button visibility checks since buttons are created here)
  rosterRenderFilterBar();
  rosterApplyFilters();
  rosterRenderTable();

  // Show/hide add button — AFTER render so DOM elements exist
  ROSTER.canAdd = !!perms['regimen.add_employee'];
  const addBtn = document.getElementById('roster-add-btn');
  if (addBtn) addBtn.style.display = ROSTER.canAdd ? '' : 'none';

  // Show/hide Sync to Sheet button (WFM users + admins with sync permission)
  const syncSheetBtn = document.getElementById('roster-sync-sheet-btn');
  if (syncSheetBtn) {
    const user = JSON.parse(sessionStorage.getItem('playbook_user') || '{}');
    const isWfm = user.actual_role === 'WFM';
    const hasSyncPerm = !!perms['regimen.sync_sheet'];
    syncSheetBtn.style.display = (isWfm || hasSyncPerm) ? '' : 'none';
  }

  // Show/hide Purge button — admin-only
  const purgeBtn = document.getElementById('roster-purge-btn');
  if (purgeBtn) {
    purgeBtn.style.display = ROSTER.isOwner ? '' : 'none';
  }
  // Show/hide Bulk Insert button — admin-only
  const bulkInsertBtn = document.getElementById('roster-bulk-insert-btn');
  if (bulkInsertBtn) {
    bulkInsertBtn.style.display = ROSTER.isOwner ? '' : 'none';
  }
  // Show/hide Undo Batch button — admin-only
  const undoBatchBtn = document.getElementById('roster-undo-batch-btn');
  if (undoBatchBtn) {
    undoBatchBtn.style.display = ROSTER.isOwner ? '' : 'none';
  }
}

// ===== Sync to Google Sheet (WFM) =====
window.rosterSyncToSheet = async function() {
  const btn = document.getElementById('roster-sync-sheet-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Syncing...'; }

  try {
    const user = JSON.parse(sessionStorage.getItem('playbook_user') || '{}');
    const resp = await fetch('/api/io/sync-roster', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-actor-ohr': user.ohr_id || 'WFM'
      }
    });
    const result = await resp.json();
    if (resp.ok && result.status === 'success') {
      showToast(`Sync complete: ${result.rows_updated || 0} updated, ${result.rows_appended || 0} appended (${((result.duration_ms || 0) / 1000).toFixed(1)}s)`, 'success');
      // Log WFM action for traceability
      if (user.actual_role === 'WFM') {
        fetch('/api/io/wfm-session-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'sync_trigger', details: `Roster sync: ${result.rows_updated} updated, ${result.rows_appended} appended` })
        }).catch(() => {});
      }
    } else {
      showToast('Sync failed: ' + (result.error || 'Unknown error'), 'error');
    }
  } catch (err) {
    showToast('Sync error: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Sync';
    }
  }
};

async function initRoster() {
  await rosterFetchEmployees();
}

// ===== Purge Attendance (Owner-only) =====

window.rosterShowPurgeModal = function() {
  // Build employee options from ROSTER.employees
  const empOptions = (ROSTER.employees || [])
    .filter(e => e.actual_role !== 'Manager')
    .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
    .map(e => `<option value="${e.ohr_id}">${escapeHtml(e.full_name)} (${e.ohr_id})</option>`)
    .join('');

  const today = new Date().toISOString().split('T')[0];

  const overlay = document.createElement('div');
  overlay.id = 'purge-modal-overlay';
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '9999';
  overlay.innerHTML = `
    <div class="modal-dialog" style="max-width:640px;width:640px;flex-direction:column;">
      <div class="modal-header">
        <h3 style="display:flex;align-items:center;gap:8px;color:var(--error,#E53935);">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          Purge Attendance Records
        </h3>
        <button class="modal-close-btn" onclick="document.getElementById('purge-modal-overlay').remove()">✕</button>
      </div>

      <div class="modal-body">
        <div id="purge-form-section">
          <div style="margin-bottom:16px;">
            <label class="filter-label" style="display:block;margin-bottom:6px;">Employee</label>
            <select id="purge-employee-select" class="form-select" style="width:100%;padding:8px 12px;">
              <option value="">-- Select Employee --</option>
              ${empOptions}
            </select>
          </div>
          <div style="margin-bottom:20px;">
            <label class="filter-label" style="display:block;margin-bottom:6px;">Starting Date (inclusive)</label>
            <input type="date" id="purge-from-date" value="${today}" class="form-input" style="width:100%;padding:8px 12px;">
          </div>
          <button onclick="rosterPurgePreview()" class="btn btn-primary btn-sm" style="width:100%;">Preview Affected Records</button>
        </div>

        <div id="purge-preview-section" style="display:none;margin-top:20px;"></div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
};

window.rosterPurgePreview = async function() {
  const ohrId = document.getElementById('purge-employee-select').value;
  const fromDate = document.getElementById('purge-from-date').value;

  if (!ohrId) { showToast('Please select an employee.', 'error'); return; }
  if (!fromDate) { showToast('Please select a starting date.', 'error'); return; }

  const previewSection = document.getElementById('purge-preview-section');
  previewSection.style.display = 'block';
  previewSection.innerHTML = '<div style="text-align:center;padding:20px;color:var(--fg-muted,#5E6C84);">Loading preview...</div>';

  try {
    const user = JSON.parse(sessionStorage.getItem('playbook_user') || '{}');
    const actorOhr = user.ohr_id || '';
    const resp = await fetch(`/api/io/attendance-purge-preview?ohr_id=${ohrId}&from_date=${fromDate}&actor_ohr=${actorOhr}`);
    const data = await resp.json();

    if (!resp.ok) {
      previewSection.innerHTML = `<div style="padding:16px;background:var(--error-bg,#FFEBEE);border:1px solid var(--error,#E53935);border-radius:var(--radius,6px);color:var(--error,#E53935);">
        <strong>Error:</strong> ${escapeHtml(data.error || 'Unknown error')}
      </div>`;
      return;
    }

    if (data.error === 'employee_not_found') {
      previewSection.innerHTML = `<div style="padding:16px;background:var(--warning-bg,rgba(217,119,6,.1));border:1px solid var(--warning,#D97706);border-radius:var(--radius,6px);color:var(--warning,#D97706);">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        ${escapeHtml(data.message)}
      </div>`;
      return;
    }

    if (data.error === 'no_attendance_rows') {
      previewSection.innerHTML = `<div style="padding:16px;background:var(--warning-bg,rgba(217,119,6,.1));border:1px solid var(--warning,#D97706);border-radius:var(--radius,6px);color:var(--warning,#D97706);">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        ${escapeHtml(data.message)}
      </div>`;
      return;
    }

    // Build preview HTML
    const emp = data.employee;
    const tagRows = (data.tag_distribution || []).map(t =>
      `<tr><td style="padding:6px 10px;border-bottom:1px solid var(--border-muted,#EDF0F4);color:var(--fg,#1A1C1F);">${escapeHtml(t.tag_name)}</td><td style="padding:6px 10px;border-bottom:1px solid var(--border-muted,#EDF0F4);text-align:right;color:var(--fg,#1A1C1F);">${t.cnt}</td></tr>`
    ).join('');

    const previewRows = (data.preview || []).map(r =>
      `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid var(--border-muted,#EDF0F4);font-size:12px;color:var(--fg,#1A1C1F);">${r.log_date}</td>
        <td style="padding:6px 8px;border-bottom:1px solid var(--border-muted,#EDF0F4);font-size:12px;color:var(--fg,#1A1C1F);">${escapeHtml(r.tag || '—')}</td>
        <td style="padding:6px 8px;border-bottom:1px solid var(--border-muted,#EDF0F4);font-size:12px;color:var(--fg,#1A1C1F);">${r.ot_hours || '—'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid var(--border-muted,#EDF0F4);font-size:12px;color:var(--fg,#1A1C1F);">${escapeHtml(r.snap_planning_group || '—')}</td>
        <td style="padding:6px 8px;border-bottom:1px solid var(--border-muted,#EDF0F4);font-size:12px;color:var(--fg,#1A1C1F);">${escapeHtml(r.wfm_tag || '—')}</td>
      </tr>`
    ).join('');

    previewSection.innerHTML = `
      <div style="padding:16px;background:var(--error-bg,#FFEBEE);border:1px solid var(--error,#E53935);border-radius:var(--radius,6px);margin-bottom:16px;">
        <div style="font-size:14px;font-weight:600;color:var(--error,#E53935);margin-bottom:8px;">⚠ Destructive Operation</div>
        <div style="font-size:13px;color:var(--fg,#1A1C1F);line-height:1.6;">
          This will <strong>permanently delete ${data.total_rows} attendance record${data.total_rows !== 1 ? 's' : ''}</strong> for:<br>
          <strong>${escapeHtml(emp.full_name)}</strong> (${emp.ohr_id}) — ${escapeHtml(emp.actual_role || '')} · ${escapeHtml(emp.planning_group || '')}<br>
          Date range: <strong>${data.date_range.from}</strong> → <strong>${data.date_range.to}</strong>
        </div>
      </div>

      <div style="margin-bottom:16px;">
        <div style="font-size:13px;font-weight:600;color:var(--fg,#1A1C1F);margin-bottom:8px;">Tag Distribution</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr><th style="text-align:left;padding:6px 10px;border-bottom:2px solid var(--border,#E0E6ED);color:var(--fg-muted,#5E6C84);font-weight:600;">Tag</th><th style="text-align:right;padding:6px 10px;border-bottom:2px solid var(--border,#E0E6ED);color:var(--fg-muted,#5E6C84);font-weight:600;">Count</th></tr></thead>
          <tbody>${tagRows}</tbody>
        </table>
      </div>

      <div style="margin-bottom:16px;">
        <div style="font-size:13px;font-weight:600;color:var(--fg,#1A1C1F);margin-bottom:8px;">Preview (first 20 rows)</div>
        <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border,#E0E6ED);border-radius:var(--radius,6px);">
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead><tr style="background:var(--bg-inset,#F2F4F7);"><th style="text-align:left;padding:6px 8px;color:var(--fg-muted,#5E6C84);font-weight:600;">Date</th><th style="text-align:left;padding:6px 8px;color:var(--fg-muted,#5E6C84);font-weight:600;">Tag</th><th style="text-align:left;padding:6px 8px;color:var(--fg-muted,#5E6C84);font-weight:600;">OT</th><th style="text-align:left;padding:6px 8px;color:var(--fg-muted,#5E6C84);font-weight:600;">PG</th><th style="text-align:left;padding:6px 8px;color:var(--fg-muted,#5E6C84);font-weight:600;">WFM</th></tr></thead>
            <tbody>${previewRows}</tbody>
          </table>
        </div>
        ${data.total_rows > 20 ? `<div style="font-size:11px;color:var(--fg-muted,#5E6C84);margin-top:4px;">Showing 20 of ${data.total_rows} rows</div>` : ''}
      </div>

      <div style="display:flex;gap:12px;">
        <button onclick="document.getElementById('purge-modal-overlay').remove()" class="btn btn-outline btn-sm" style="flex:1;">Cancel</button>
        <button onclick="rosterExecutePurge('${emp.ohr_id}','${fromDate}',${data.total_rows})" class="btn btn-danger btn-sm" style="flex:1;">
          Delete ${data.total_rows} Record${data.total_rows !== 1 ? 's' : ''}
        </button>
      </div>
    `;

    // Store for confirm
    window._purgeTarget = { ohr_id: ohrId, from_date: fromDate, total: data.total_rows, name: emp.full_name };
  } catch (err) {
    previewSection.innerHTML = `<div style="padding:16px;background:var(--error-bg,#FFEBEE);border:1px solid var(--error,#E53935);border-radius:var(--radius,6px);color:var(--error,#E53935);">
      <strong>Error:</strong> ${escapeHtml(err.message)}
    </div>`;
  }
};

window.rosterExecutePurge = async function(ohrId, fromDate, expectedCount) {
  // Double-confirm
  const confirmed = confirm(`FINAL CONFIRMATION\n\nYou are about to permanently delete ${expectedCount} attendance records for OHR ${ohrId} from ${fromDate} onwards.\n\nThis action CANNOT be undone.\n\nProceed?`);
  if (!confirmed) return;

  const previewSection = document.getElementById('purge-preview-section');
  previewSection.innerHTML = '<div style="text-align:center;padding:20px;color:var(--fg-muted,#5E6C84);">Deleting records...</div>';

  try {
    const user = JSON.parse(sessionStorage.getItem('playbook_user') || '{}');
    const resp = await fetch('/api/io/attendance-purge', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor_ohr: user.ohr_id, ohr_id: ohrId, from_date: fromDate }),
    });
    const data = await resp.json();

    if (!resp.ok || !data.success) {
      previewSection.innerHTML = `<div style="padding:16px;background:var(--error-bg,#FFEBEE);border:1px solid var(--error,#E53935);border-radius:var(--radius,6px);color:var(--error,#E53935);">
        <strong>Error:</strong> ${escapeHtml(data.error || 'Delete failed')}
      </div>`;
      return;
    }

    previewSection.innerHTML = `
      <div style="padding:16px;background:var(--success-bg,rgba(34,197,94,.1));border:1px solid var(--success,#22C55E);border-radius:var(--radius,6px);color:var(--success,#22C55E);">
        <strong>✓ Purge Complete</strong><br>
        <span style="font-size:13px;">Successfully deleted <strong>${data.deleted}</strong> attendance record${data.deleted !== 1 ? 's' : ''} for OHR ${ohrId} from ${fromDate} onwards.</span>
      </div>
      <button onclick="document.getElementById('purge-modal-overlay').remove()" class="btn btn-outline btn-sm" style="width:100%;margin-top:12px;">Close</button>
    `;
    showToast(`Purged ${data.deleted} attendance records`, 'success');
  } catch (err) {
    previewSection.innerHTML = `<div style="padding:16px;background:var(--error-bg,#FFEBEE);border:1px solid var(--error,#E53935);border-radius:var(--radius,6px);color:var(--error,#E53935);">
      <strong>Error:</strong> ${escapeHtml(err.message)}
    </div>`;
  }
};

// ===== Bulk Insert Attendance Rows (Admin-only) =====

window.rosterShowBulkInsertModal = function() {
  // Build filter options from ROSTER.employees
  const employees = ROSTER.employees || [];
  const statuses = [...new Set(employees.map(e => e.employement_status || e.status).filter(Boolean))].sort();
  const planningGroups = [...new Set(employees.map(e => e.planning_group).filter(Boolean))].sort();
  const roles = [...new Set(employees.map(e => e.actual_role).filter(Boolean))].sort();
  const supervisors = [...new Set(employees.map(e => e.supervisor_name || e.supervisor).filter(Boolean))].sort();

  const statusOpts = statuses.map(s => `<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join('');
  const pgOpts = planningGroups.map(s => `<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join('');
  const roleOpts = roles.map(s => `<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join('');
  const supOpts = supervisors.map(s => `<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join('');

  const today = new Date().toISOString().slice(0, 10);

  const overlay = document.createElement('div');
  overlay.id = 'bulk-insert-modal-overlay';
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '9999';
  overlay.innerHTML = `
    <div class="modal-dialog" style="max-width:720px;width:720px;flex-direction:column;max-height:90vh;overflow-y:auto;">
      <div class="modal-header">
        <h3 style="display:flex;align-items:center;gap:8px;margin:0;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          Bulk Insert Attendance Rows
        </h3>
        <button class="modal-close-btn" onclick="document.getElementById('bulk-insert-modal-overlay').remove()">✕</button>
      </div>

      <div class="modal-body">
        <div id="bi-form-section">
          <p style="font-size:13px;color:var(--fg-muted,#5E6C84);margin-bottom:16px;">
            This will create blank attendance rows in the Input Portal for the selected employees on the specified dates. Rows with Internal Role and Planning Group will be auto-populated from the roster.
          </p>

          <div style="margin-bottom:16px;">
            <label class="filter-label" style="display:block;margin-bottom:6px;font-weight:600;">Date Range</label>
            <div style="display:flex;gap:12px;align-items:center;">
              <div style="flex:1;">
                <label style="font-size:11px;color:var(--fg-muted);">From</label>
                <input type="date" id="bi-date-from" value="${today}" class="form-input" style="width:100%;padding:8px 12px;">
              </div>
              <div style="flex:1;">
                <label style="font-size:11px;color:var(--fg-muted);">To</label>
                <input type="date" id="bi-date-to" value="${today}" class="form-input" style="width:100%;padding:8px 12px;">
              </div>
            </div>
          </div>

          <div style="margin-bottom:16px;">
            <label class="filter-label" style="display:block;margin-bottom:6px;font-weight:600;">Employee Filters</label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              <div>
                <label style="font-size:11px;color:var(--fg-muted);">Employee Status</label>
                <select id="bi-filter-status" class="form-select" style="width:100%;padding:8px 12px;">
                  <option value="">All Statuses</option>
                  ${statusOpts}
                </select>
              </div>
              <div>
                <label style="font-size:11px;color:var(--fg-muted);">Planning Group</label>
                <select id="bi-filter-pg" class="form-select" style="width:100%;padding:8px 12px;">
                  <option value="">All Groups</option>
                  ${pgOpts}
                </select>
              </div>
              <div>
                <label style="font-size:11px;color:var(--fg-muted);">Role</label>
                <select id="bi-filter-role" class="form-select" style="width:100%;padding:8px 12px;">
                  <option value="">All Roles</option>
                  ${roleOpts}
                </select>
              </div>
              <div>
                <label style="font-size:11px;color:var(--fg-muted);">Supervisor</label>
                <select id="bi-filter-supervisor" class="form-select" style="width:100%;padding:8px 12px;">
                  <option value="">All Supervisors</option>
                  ${supOpts}
                </select>
              </div>
            </div>
          </div>

          <button onclick="rosterBulkInsertPreview()" class="btn btn-primary btn-sm" style="width:100%;">Preview Insert</button>
        </div>

        <div id="bi-preview-section" style="display:none;margin-top:20px;"></div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
};

window.rosterBulkInsertPreview = async function() {
  const fromDate = document.getElementById('bi-date-from').value;
  const toDate = document.getElementById('bi-date-to').value;

  if (!fromDate || !toDate) { showToast('Please select both From and To dates.', 'error'); return; }
  if (fromDate > toDate) { showToast('From date must be before or equal to To date.', 'error'); return; }

  // Generate date array
  const dates = [];
  let d = new Date(fromDate + 'T00:00:00');
  const end = new Date(toDate + 'T00:00:00');
  while (d <= end) {
    dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }

  if (dates.length > 31) { showToast('Maximum 31 days allowed per bulk insert.', 'error'); return; }

  const filters = {};
  const status = document.getElementById('bi-filter-status').value;
  const pg = document.getElementById('bi-filter-pg').value;
  const role = document.getElementById('bi-filter-role').value;
  const supervisor = document.getElementById('bi-filter-supervisor').value;
  if (status) filters.status = status;
  if (pg) filters.planning_group = pg;
  if (role) filters.role = role;
  if (supervisor) filters.supervisor = supervisor;

  const previewSection = document.getElementById('bi-preview-section');
  previewSection.style.display = 'block';
  previewSection.innerHTML = '<div style="text-align:center;padding:20px;color:var(--fg-muted,#5E6C84);">Calculating preview...</div>';

  try {
    const user = JSON.parse(sessionStorage.getItem('playbook_user') || '{}');
    const resp = await fetch('/api/io/insights-bulk-insert-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor_ohr: user.ohr_id, dates, employee_filters: filters }),
    });
    const data = await resp.json();

    if (!resp.ok) {
      previewSection.innerHTML = `<div style="padding:16px;background:var(--error-bg,#FFEBEE);border:1px solid var(--error,#E53935);border-radius:var(--radius,6px);color:var(--error,#E53935);">
        <strong>Error:</strong> ${escapeHtml(data.error || 'Unknown error')}
      </div>`;
      return;
    }

    let dupHtml = '';
    if (data.total_duplicate > 0) {
      dupHtml = `<div style="margin-top:12px;padding:12px;background:#FFF3E0;border:1px solid #FF9800;border-radius:var(--radius,6px);font-size:12px;">
        <strong style="color:#E65100;">⚠ ${data.total_duplicate} duplicate${data.total_duplicate !== 1 ? 's' : ''} detected</strong> (will be skipped)
        <div style="max-height:120px;overflow-y:auto;margin-top:8px;">
          <table style="width:100%;font-size:11px;border-collapse:collapse;">
            <tr style="border-bottom:1px solid #FFE0B2;"><th style="text-align:left;padding:2px 4px;">OHR</th><th style="text-align:left;padding:2px 4px;">Name</th><th style="text-align:left;padding:2px 4px;">Date</th></tr>
            ${data.duplicates.map(d => `<tr><td style="padding:2px 4px;">${escapeHtml(d.ohr_id)}</td><td style="padding:2px 4px;">${escapeHtml(d.full_name)}</td><td style="padding:2px 4px;">${escapeHtml(d.date)}</td></tr>`).join('')}
            ${data.total_duplicate > 50 ? `<tr><td colspan="3" style="padding:4px;color:#E65100;">... and ${data.total_duplicate - 50} more</td></tr>` : ''}
          </table>
        </div>
      </div>`;
    }

    previewSection.innerHTML = `
      <div style="padding:16px;background:var(--surface,#f8f9fa);border:1px solid var(--border);border-radius:var(--radius,6px);">
        <h4 style="margin:0 0 12px 0;font-size:14px;">Preview Summary</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">
          <div><strong>Employees matched:</strong> ${data.total_employees}</div>
          <div><strong>Dates selected:</strong> ${data.total_dates}</div>
          <div style="color:#22C55E;"><strong>New rows to insert:</strong> ${data.total_new}</div>
          <div style="color:#F59E0B;"><strong>Duplicates (skipped):</strong> ${data.total_duplicate}</div>
        </div>
        ${dupHtml}
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button onclick="document.getElementById('bulk-insert-modal-overlay').remove()" class="btn btn-outline btn-sm" style="flex:1;">Cancel</button>
        <button onclick="rosterExecuteBulkInsert()" class="btn btn-primary btn-sm" style="flex:1;" ${data.total_new === 0 ? 'disabled' : ''}>
          Insert ${data.total_new} Row${data.total_new !== 1 ? 's' : ''}
        </button>
      </div>
    `;

    // Store params for execution
    window._bulkInsertParams = { dates, filters };
  } catch (err) {
    previewSection.innerHTML = `<div style="padding:16px;background:var(--error-bg,#FFEBEE);border:1px solid var(--error,#E53935);border-radius:var(--radius,6px);color:var(--error,#E53935);">
      <strong>Error:</strong> ${escapeHtml(err.message)}
    </div>`;
  }
};

window.rosterExecuteBulkInsert = async function() {
  if (!window._bulkInsertParams) return;
  const { dates, filters } = window._bulkInsertParams;

  const previewSection = document.getElementById('bi-preview-section');
  previewSection.innerHTML = '<div style="text-align:center;padding:20px;color:var(--fg-muted,#5E6C84);">Inserting rows...</div>';

  try {
    const user = JSON.parse(sessionStorage.getItem('playbook_user') || '{}');
    const resp = await fetch('/api/io/insights-bulk-insert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor_ohr: user.ohr_id, dates, employee_filters: filters }),
    });
    const data = await resp.json();

    if (!resp.ok) {
      previewSection.innerHTML = `<div style="padding:16px;background:var(--error-bg,#FFEBEE);border:1px solid var(--error,#E53935);border-radius:var(--radius,6px);color:var(--error,#E53935);">
        <strong>Error:</strong> ${escapeHtml(data.error || 'Unknown error')}
      </div>`;
      return;
    }

    previewSection.innerHTML = `
      <div style="padding:16px;background:var(--success-bg,rgba(34,197,94,.1));border:1px solid var(--success,#22C55E);border-radius:var(--radius,6px);color:var(--success,#22C55E);">
        <strong>✓ Bulk Insert Complete</strong><br>
        <span style="font-size:13px;">Successfully inserted <strong>${data.inserted}</strong> attendance row${data.inserted !== 1 ? 's' : ''}. ${data.skipped > 0 ? `(${data.skipped} duplicates skipped)` : ''}</span>
      </div>
      <button onclick="document.getElementById('bulk-insert-modal-overlay').remove()" class="btn btn-outline btn-sm" style="width:100%;margin-top:12px;">Close</button>
    `;
    showToast(`Inserted ${data.inserted} attendance rows`, 'success');
  } catch (err) {
    previewSection.innerHTML = `<div style="padding:16px;background:var(--error-bg,#FFEBEE);border:1px solid var(--error,#E53935);border-radius:var(--radius,6px);color:var(--error,#E53935);">
      <strong>Error:</strong> ${escapeHtml(err.message)}
    </div>`;
  }
};

// ===== Undo Last Batch (Admin-only) =====

window.rosterShowUndoBatchModal = async function() {
  const user = JSON.parse(sessionStorage.getItem('playbook_user') || '{}');

  // Fetch last batch info
  let batchInfo;
  try {
    const resp = await fetch('/api/io/attendance-last-batch');
    batchInfo = await resp.json();
  } catch (err) {
    showToast('Failed to fetch batch info', 'error');
    return;
  }

  if (!batchInfo.has_batch) {
    showToast('No batch found to undo', 'warning');
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'undo-batch-modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:var(--surface,#fff);border-radius:var(--radius,8px);padding:28px 32px;max-width:480px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.2);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
        <h3 style="margin:0;font-size:18px;display:flex;align-items:center;gap:8px;">
          <span style="color:#f59e0b;">⟲</span> Undo Last Batch
        </h3>
        <button class="modal-close-btn" onclick="document.getElementById('undo-batch-modal-overlay').remove()">✕</button>
      </div>

      <div style="padding:16px;background:var(--warning-bg,rgba(245,158,11,.1));border:1px solid #f59e0b;border-radius:var(--radius,6px);margin-bottom:20px;">
        <p style="margin:0 0 8px;font-weight:600;color:#f59e0b;">⚠ This will delete the following batch:</p>
        <table style="width:100%;font-size:13px;">
          <tr><td style="padding:4px 0;color:var(--muted,#666);">Batch ID:</td><td style="padding:4px 0;font-weight:500;">${escapeHtml(batchInfo.batch_id)}</td></tr>
          <tr><td style="padding:4px 0;color:var(--muted,#666);">Rows:</td><td style="padding:4px 0;font-weight:500;">${batchInfo.row_count}</td></tr>
          <tr><td style="padding:4px 0;color:var(--muted,#666);">Date Range:</td><td style="padding:4px 0;font-weight:500;">${escapeHtml(batchInfo.date_range)}</td></tr>
        </table>
      </div>

      <div style="display:flex;gap:12px;">
        <button onclick="document.getElementById('undo-batch-modal-overlay').remove()" class="btn btn-outline btn-sm" style="flex:1;">Cancel</button>
        <button onclick="rosterExecuteUndoBatch('${escapeAttr(batchInfo.batch_id)}')" class="btn btn-sm" style="flex:1;background:#f59e0b;color:#fff;border:none;">Undo ${batchInfo.row_count} Rows</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
};

window.rosterExecuteUndoBatch = async function(batchId) {
  const user = JSON.parse(sessionStorage.getItem('playbook_user') || '{}');
  const btn = document.querySelector('#undo-batch-modal-overlay button[onclick*="rosterExecuteUndoBatch"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Undoing...'; }

  try {
    const resp = await fetch('/api/io/attendance-bulk-undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor_ohr: user.ohr_id, batch_id: batchId }),
    });
    const data = await resp.json();

    if (!resp.ok) {
      showToast(data.error || 'Undo failed', 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
      return;
    }

    document.getElementById('undo-batch-modal-overlay').remove();
    showToast(`Undo complete: ${data.deleted} rows removed`, 'success');
  } catch (err) {
    showToast('Undo failed: ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
  }
};
