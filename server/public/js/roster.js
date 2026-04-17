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
  { key: 'dob', label: 'DOB', group: 'identity' },
  { key: 'personal_email', label: 'Personal Email', group: 'identity' },
  { key: 'contact_number', label: 'Contact Number', group: 'identity' },
  { key: 'primary_address', label: 'Primary Address', group: 'identity' },
  { key: 'barangay', label: 'Barangay', group: 'identity' },
  { key: 'city', label: 'City', group: 'identity' },
  { key: 'province', label: 'Province', group: 'identity' },
  { key: 'employement_status', label: 'Status', group: 'role' },
  { key: 'actual_role', label: 'Role', group: 'role' },
  { key: 'supervisor', label: 'Supervisor', group: 'role' },
  { key: 'supervisor_email', label: 'Supervisor Email', group: 'role' },
  { key: 'shift_time', label: 'Shift Time', group: 'role' },
  { key: 'work_off', label: 'Work Off', group: 'role' },
  { key: 'planning_group', label: 'Planning Group', group: 'role' },
  { key: 'related_planning_group', label: 'Related PG', group: 'role' },
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
  { key: 'exit_reason', label: 'Exit Reason', group: 'attrition' }
];

// Limited columns for non-admin tiers
const LIMITED_COLUMNS = [
  'ohr_id','full_name','last_name','given_name','middle_name','suffix',
  'employement_status','actual_role','supervisor','shift_time','work_off',
  'planning_group','related_planning_group','srt_status','platform',
  'srt_id','workday_id','meta_email','hire_date','regular_date',
  'meta_onboarding_date','go_live_date'
];

// Date columns for date-range filter type
const DATE_COLUMNS = ALL_COLUMNS.filter(c => c.isDate).map(c => c.key);

// ===== State =====
const ROSTER = {
  employees: [],
  filtered: [],
  page: 1,
  pageSize: 25,
  tier: 'limited', // 'full' or 'limited'
  canEdit: false,
  sortKey: null,
  sortDir: 'asc',
  filters: {},       // key -> { values: [...] } for multi, { startDate, endDate } for date_range
  searchQuery: '',
  ALL_COLUMNS: ALL_COLUMNS,
  getVisibleColumns() {
    if (this.tier === 'full') return ALL_COLUMNS;
    return ALL_COLUMNS.filter(c => LIMITED_COLUMNS.includes(c.key));
  }
};

// ===== Filter Definitions =====
// Build filter fields from ALL_COLUMNS: multi-select for text, date_range for dates, search for text search
function buildFilterFields() {
  const fields = [];
  const visibleCols = ROSTER.getVisibleColumns();
  visibleCols.forEach(col => {
    if (col.key === 'ohr_id' || col.key === 'full_name') return; // handled by search
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
  const container = document.getElementById('roster-filter-pills');
  if (!container) return;

  // Separate fields into groups: search, non-date (multi), date
  const searchField = _rosterFilterFields.find(f => f.type === 'search');
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

  let html = '';

  // Search pill first
  if (searchField) {
    html += '<div class="filter-pill" style="padding:0;border:1px solid var(--border);border-radius:6px;overflow:hidden;min-width:180px;">'
      + '<input type="text" class="form-input form-input-sm" id="roster-search-input" placeholder="Search OHR / Name..." '
      + 'value="' + escapeAttr(ROSTER.searchQuery) + '" '
      + 'oninput="ROSTER.searchQuery=this.value;rosterDebouncedApply();" '
      + 'style="border:none;font-size:12px;padding:5px 10px;background:transparent;width:100%;min-width:160px;">'
      + '</div>';
  }

  // Non-date filters group
  if (multiFields.length > 0) {
    html += '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">';
    html += '<span style="font-size:10px;font-weight:700;color:var(--fg-muted);text-transform:uppercase;letter-spacing:0.5px;padding:0 4px;">Filters</span>';
    multiFields.forEach(f => { html += renderPill(f); });
    html += '</div>';
  }

  // Date filters group
  if (dateFields.length > 0) {
    html += '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;border-left:2px solid var(--border);padding-left:10px;margin-left:4px;">';
    html += '<span style="font-size:10px;font-weight:700;color:var(--fg-muted);text-transform:uppercase;letter-spacing:0.5px;padding:0 4px;">Dates</span>';
    dateFields.forEach(f => { html += renderPill(f); });
    html += '</div>';
  }

  // Clear filters button
  html += '<button class="filter-bar-clear" onclick="rosterClearAllFilters()" title="Clear all filters">✕ Clear</button>';

  // Record count
  html += '<span class="filter-bar-meta" id="roster-filter-count"></span>';

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

  const cols = ROSTER.getVisibleColumns();
  const data = ROSTER.filtered;

  // Header
  thead.innerHTML = '<tr>' + cols.map(c =>
    '<th style="white-space:nowrap;cursor:pointer;" onclick="rosterSetSort(\'' + c.key + '\', ROSTER.sortKey===\'' + c.key + '\'&&ROSTER.sortDir===\'asc\'?\'desc\':\'asc\')">'
    + escapeHtml(c.label)
    + (ROSTER.sortKey === c.key ? (ROSTER.sortDir === 'asc' ? ' ↑' : ' ↓') : '')
    + '</th>'
  ).join('') + '</tr>';

  // Paginate
  const start = (ROSTER.page - 1) * ROSTER.pageSize;
  const pageData = data.slice(start, start + ROSTER.pageSize);

  if (pageData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="' + cols.length + '" style="text-align:center;padding:32px;color:var(--fg-muted);">No employees match the current filters.</td></tr>';
    rosterRenderPagination();
    return;
  }

  tbody.innerHTML = pageData.map(emp => {
    const statusColor = emp.employement_status === 'Active' ? '#22C55E' : '#EF4444';
    return '<tr class="module-row" onclick="rosterOpenDetail(\'' + escapeAttr(emp.ohr_id) + '\')" style="cursor:pointer;">'
      + cols.map(c => {
        let val = emp[c.key];
        if (c.key === 'srt_id') val = formatSrtId(val);
        if (c.key === 'employement_status') {
          return '<td><span class="module-status-badge" style="background:' + statusColor + '20;color:' + statusColor + ';border:1px solid ' + statusColor + '40;">' + escapeHtml(val || '') + '</span></td>';
        }
        return '<td style="white-space:nowrap;">' + escapeHtml(val != null ? val : '') + '</td>';
      }).join('')
      + '</tr>';
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

  el.innerHTML = '<span class="module-page-info">' + (total > 0 ? start + '-' + end + ' of ' + total : '0 records') + '</span>'
    + '<button class="btn btn-ghost btn-xs" ' + (ROSTER.page <= 1 ? 'disabled' : '') + ' onclick="ROSTER.page--;rosterRenderTable();">« Prev</button>'
    + '<span class="module-page-num">Page ' + ROSTER.page + ' of ' + totalPages + '</span>'
    + '<button class="btn btn-ghost btn-xs" ' + (ROSTER.page >= totalPages ? 'disabled' : '') + ' onclick="ROSTER.page++;rosterRenderTable();">Next »</button>';
}

// ===== Detail Panel with Inline Audit Trail =====
window.rosterOpenDetail = function(ohrId) {
  var emp = ROSTER.employees.find(function(e) { return e.ohr_id === ohrId; });
  if (!emp) return;
  var overlay = document.getElementById('roster-form-overlay');
  var formTitle = document.getElementById('roster-form-title');
  var formBody = document.getElementById('roster-form-body');
  var formFooter = document.getElementById('roster-form-footer');
  if (!overlay || !formBody) return;

  formTitle.innerHTML = '';
  var statusColor = emp.employement_status === 'Active' ? '#22C55E' : '#EF4444';
  var canEditDetail = ROSTER.canEdit;
  var visibleCols = ROSTER.getVisibleColumns();

  // Group columns by their group property (preserving insertion order)
  var groups = {};
  var GROUP_LABELS = {
    'identity': 'Identity', 'role': 'Role & Assignment', 'system': 'System IDs',
    'asset': 'Assets & Logistics', 'dates': 'Dates', 'attrition': 'Attrition'
  };
  visibleCols.forEach(function(c) {
    var gLabel = GROUP_LABELS[c.group] || c.group;
    if (!groups[gLabel]) groups[gLabel] = [];
    groups[gLabel].push(c);
  });

  var roleOptions = ['Agent', 'QA', 'SME', 'Operational SME', 'Quality Analyst', 'Team Lead', 'Trainer', 'Manager'];
  var statusOptions = ['Active', 'Inactive', 'Resigned', 'Terminated', 'Nesting'];
  var srtStatusOptions = ['Production', 'Inactive', 'Exit', 'Nesting', 'Training'];

  function renderField(col) {
    var val = col.key === 'srt_id' ? formatSrtId(emp[col.key]) : emp[col.key];
    var displayVal = (val !== null && val !== undefined && val !== '') ? String(val) : '\u2014';

    // Status field with dropdown or badge
    if (col.key === 'employement_status') {
      if (canEditDetail) {
        return '<div class="detail-row"><span class="detail-label">' + escapeHtml(col.label) + '</span><span class="detail-value">'
          + '<select class="form-select form-select-sm roster-edit-field" data-key="' + col.key + '" style="font-size:13px;padding:2px 6px;max-width:280px;">'
          + statusOptions.map(function(s) { return '<option value="' + s + '"' + (emp[col.key] === s ? ' selected' : '') + '>' + s + '</option>'; }).join('')
          + '</select></span></div>';
      }
      return '<div class="detail-row"><span class="detail-label">' + escapeHtml(col.label) + '</span><span class="detail-value">'
        + '<span class="module-status-badge" style="background:' + statusColor + '20;color:' + statusColor + ';border:1px solid ' + statusColor + '40;">' + escapeHtml(displayVal) + '</span></span></div>';
    }
    // Role field with dropdown
    if (col.key === 'actual_role' && canEditDetail) {
      return '<div class="detail-row"><span class="detail-label">' + escapeHtml(col.label) + '</span><span class="detail-value">'
        + '<select class="form-select form-select-sm roster-edit-field" data-key="' + col.key + '" style="font-size:13px;padding:2px 6px;max-width:280px;">'
        + roleOptions.map(function(r) { return '<option value="' + r + '"' + (emp[col.key] === r ? ' selected' : '') + '>' + r + '</option>'; }).join('')
        + '</select></span></div>';
    }
    // SRT Status field with dropdown
    if (col.key === 'srt_status' && canEditDetail) {
      return '<div class="detail-row"><span class="detail-label">' + escapeHtml(col.label) + '</span><span class="detail-value">'
        + '<select class="form-select form-select-sm roster-edit-field" data-key="' + col.key + '" style="font-size:13px;padding:2px 6px;max-width:280px;">'
        + srtStatusOptions.map(function(s) { return '<option value="' + s + '"' + (emp[col.key] === s ? ' selected' : '') + '>' + s + '</option>'; }).join('')
        + '</select></span></div>';
    }
    // Editable text input
    if (canEditDetail) {
      return '<div class="detail-row"><span class="detail-label">' + escapeHtml(col.label) + '</span><span class="detail-value">'
        + '<input type="text" class="form-input form-input-sm roster-edit-field" data-key="' + escapeAttr(col.key) + '" value="' + escapeAttr(displayVal === '\u2014' ? '' : displayVal) + '" style="font-size:13px;padding:2px 6px;width:100%;max-width:280px;">'
        + '</span></div>';
    }
    // Read-only
    return '<div class="detail-row"><span class="detail-label">' + escapeHtml(col.label) + '</span><span class="detail-value">' + escapeHtml(displayVal) + '</span></div>';
  }

  var html = '<div class="detail-section">';
  for (var groupName in groups) {
    html += '<h4 class="detail-section-title" style="font-size:13px;text-transform:uppercase;letter-spacing:1px;color:var(--fg-muted);border-bottom:2px solid var(--primary);padding-bottom:6px;margin-bottom:12px;margin-top:20px;">' + escapeHtml(groupName) + '</h4>';
    groups[groupName].forEach(function(c) { html += renderField(c); });
  }
  html += '</div>';

  // ===== Inline Audit Trail Section =====
  html += '<div class="detail-section" style="margin-top:16px;border-top:2px solid var(--border);padding-top:16px;">';
  html += '<h4 class="detail-section-title" style="font-size:13px;text-transform:uppercase;letter-spacing:1px;color:var(--fg-muted);border-bottom:2px solid var(--primary);padding-bottom:6px;margin-bottom:12px;">Audit Trail</h4>';
  html += '<div id="roster-detail-audit-body" style="font-size:12px;color:var(--fg-muted);">Loading audit trail...</div>';
  html += '</div>';

  formBody.innerHTML = html;

  // Footer
  var footerHtml = '<button class="btn btn-outline btn-sm" onclick="rosterCloseForm()">Close</button>';
  if (canEditDetail) {
    footerHtml += ' <button class="btn btn-primary btn-sm" onclick="rosterSaveDetail(\'' + escapeAttr(emp.ohr_id) + '\')">' + 'Save Changes</button>';
  }
  formFooter.innerHTML = footerHtml;

  overlay.style.display = 'flex';

  // Load audit trail inline
  rosterLoadInlineAuditTrail(ohrId);
};

async function rosterLoadInlineAuditTrail(ohrId) {
  const body = document.getElementById('roster-detail-audit-body');
  if (!body) return;

  try {
    const token = sessionStorage.getItem('playbook_token');
    const resp = await fetch('/api/io/audit-log?record_type=employee&record_id=' + encodeURIComponent(ohrId), {
      headers: { 'Authorization': 'Bearer ' + token }
    });
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
                + ' → <span style="color:#22C55E;">' + escapeHtml(v.to || '(empty)') + '</span>';
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
    body.innerHTML = '<div style="color:var(--danger);padding:8px 0;">Failed to load audit trail: ' + escapeHtml(e.message) + '</div>';
  }
}

window.rosterCloseForm = function() {
  const overlay = document.getElementById('roster-form-overlay');
  if (overlay) overlay.style.display = 'none';
};

window.rosterSaveDetail = async function(ohrId) {
  var body = document.getElementById('roster-form-body');
  if (!body) return;
  // Collect from all editable fields (inputs + selects with .roster-edit-field or data-field)
  var editFields = body.querySelectorAll('.roster-edit-field, input[data-field]');
  var updates = {};
  var emp = ROSTER.employees.find(function(e) { return e.ohr_id === ohrId; });
  editFields.forEach(function(el) {
    var field = el.getAttribute('data-key') || el.getAttribute('data-field');
    if (!field || field === 'ohr_id' || field === 'full_name') return;
    var newVal = el.value.trim();
    var oldVal = emp[field] != null ? String(emp[field]).trim() : '';
    if (newVal !== oldVal) updates[field] = newVal;
  });

  if (Object.keys(updates).length === 0) {
    showToast('No changes to save', 'info');
    return;
  }

  try {
    const token = sessionStorage.getItem('playbook_token');
    // Include actor info for audit trail
    updates._actor_ohr = sessionStorage.getItem('playbook_ohr') || '';
    updates._actor_name = sessionStorage.getItem('playbook_name') || '';
    const resp = await fetch('/api/io/employees/' + encodeURIComponent(ohrId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
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
    const token = sessionStorage.getItem('playbook_token');
    const resp = await fetch('/api/io/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
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
  const panels = ['roster', 'onboarding', 'permissions'];

  panels.forEach(p => {
    const panel = document.getElementById('regimen-panel-' + p);
    if (panel) panel.style.display = 'none';
    const tabBtn = document.getElementById('regimen-tab-' + p);
    if (tabBtn) {
      tabBtn.style.borderBottomColor = 'transparent';
      tabBtn.style.color = 'var(--fg-muted)';
      tabBtn.classList.remove('active');
    }
  });

  const activePanel = document.getElementById('regimen-panel-' + tab);
  if (activePanel) activePanel.style.display = '';
  const activeTab = document.getElementById('regimen-tab-' + tab);
  if (activeTab) {
    activeTab.style.borderBottomColor = 'var(--primary)';
    activeTab.style.color = 'var(--primary)';
    activeTab.classList.add('active');
  }

  if (tab === 'onboarding') incompleteRosteringRenderDashboard();
  if (tab === 'permissions' && typeof initPermissions === 'function') initPermissions();
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
  { key: 'planning_group', label: 'Planning Group', type: 'multi' },
  { key: 'supervisor', label: 'Supervisor', type: 'multi' },
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
  const container = document.getElementById('ir-filter-pills');
  if (!container) return;

  let html = '';
  IR_FILTER_FIELDS.forEach(field => {
    if (field.type === 'search') {
      html += '<div class="filter-pill" style="padding:0;border:1px solid var(--border);border-radius:6px;overflow:hidden;min-width:180px;">'
        + '<input type="text" class="form-input form-input-sm" id="ir-search-input" placeholder="Search OHR / Name..." '
        + 'value="' + escapeAttr(IR_STATE.searchQuery) + '" '
        + 'oninput="IR_STATE.searchQuery=this.value;irDebouncedApply();" '
        + 'style="border:none;font-size:12px;padding:5px 10px;background:transparent;width:100%;min-width:160px;">'
        + '</div>';
      return;
    }

    const summary = irGetFilterSummary(field);
    const isActive = irIsFiltered(field);
    html += '<div class="filter-pill' + (isActive ? ' active' : '') + '" id="ir-pill-' + field.key + '" onclick="irToggleDropdown(\'' + field.key + '\')">'
      + '<span class="filter-pill-label">' + escapeHtml(field.label) + '</span> '
      + '<span class="filter-pill-value">' + escapeHtml(summary) + '</span>'
      + '<span class="filter-pill-icon">▾</span>'
      + '<div class="filter-dropdown" id="ir-dd-' + field.key + '"></div>'
      + '</div>';
  });

  html += '<button class="filter-bar-clear" onclick="irClearAllFilters()" title="Clear all filters">✕ Clear</button>';
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
  dd.onclick = function(e) { e.stopPropagation(); };
};

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

  thead.innerHTML = '<tr>'
    + '<th style="white-space:nowrap;">OHR ID</th>'
    + '<th style="white-space:nowrap;">Full Name</th>'
    + '<th style="white-space:nowrap;">Status</th>'
    + '<th style="white-space:nowrap;">Role</th>'
    + '<th style="white-space:nowrap;">Completion Rate</th>'
    + '<th style="white-space:nowrap;">Missing Count</th>'
    + '<th style="white-space:nowrap;">Missing Fields</th>'
    + '</tr>';

  const start = (_irPage - 1) * _irPageSize;
  const pageData = allData.slice(start, start + _irPageSize);

  if (pageData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--fg-muted);">All employees are fully rostered!</td></tr>';
    irRenderPagination(allData.length);
    return;
  }

  tbody.innerHTML = pageData.map(emp => {
    const statusColor = emp.employement_status === 'Active' ? '#22C55E' : '#EF4444';
    const rate = parseFloat(emp.completionRate);
    const rateColor = rate >= 90 ? '#22C55E' : rate >= 70 ? '#F59E0B' : '#EF4444';
    const missingHtml = emp.missingFields.map(f =>
      '<span style="background:#EF444415;color:#EF4444;padding:1px 6px;border-radius:4px;font-size:11px;margin:1px 2px;display:inline-block;">' + escapeHtml(IR_LABELS[f] || f) + '</span>'
    ).join('');

    return '<tr class="module-row" onclick="rosterOpenDetail(\'' + escapeAttr(emp.ohr_id) + '\')" style="cursor:pointer;">'
      + '<td style="white-space:nowrap;font-weight:600;">' + escapeHtml(emp.ohr_id || '') + '</td>'
      + '<td style="white-space:nowrap;">' + escapeHtml(emp.full_name || '') + '</td>'
      + '<td><span class="module-status-badge" style="background:' + statusColor + '20;color:' + statusColor + ';border:1px solid ' + statusColor + '40;">' + escapeHtml(emp.employement_status || '') + '</span></td>'
      + '<td style="white-space:nowrap;">' + escapeHtml(emp.actual_role || '') + '</td>'
      + '<td style="text-align:center;font-weight:600;color:' + rateColor + ';">' + emp.completionRate + '%</td>'
      + '<td style="text-align:center;font-weight:600;color:#EF4444;">' + emp.missingFields.length + '</td>'
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

  el.innerHTML = '<span class="module-page-info">' + (total > 0 ? start + '-' + end + ' of ' + total : '0 records') + '</span>'
    + '<button class="btn btn-ghost btn-xs" ' + (_irPage <= 1 ? 'disabled' : '') + ' onclick="_irPage--;incompleteRosteringRenderTable();">« Prev</button>'
    + '<span class="module-page-num">Page ' + _irPage + ' of ' + totalPages + '</span>'
    + '<button class="btn btn-ghost btn-xs" ' + (_irPage >= totalPages ? 'disabled' : '') + ' onclick="_irPage++;incompleteRosteringRenderTable();">Next »</button>';
}

// Backward compat
function onboardingRenderDashboard() { incompleteRosteringRenderDashboard(); }
window.onboardingRenderTable = function() { incompleteRosteringRenderTable(); };

// ===== Fetch & Init =====
async function rosterFetchEmployees() {
  const loading = document.getElementById('roster-loading');
  if (loading) loading.style.display = '';

  try {
    const token = sessionStorage.getItem('playbook_token');
    const resp = await fetch('/api/io/employees', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!resp.ok) throw new Error('Failed to fetch employees');
    ROSTER.employees = await resp.json();
  } catch (e) {
    showToast('Error loading roster: ' + e.message, 'error');
    ROSTER.employees = [];
  }

  if (loading) loading.style.display = 'none';

  // Determine permissions from cached permissions
  const permsRaw = sessionStorage.getItem('playbook_permissions');
  let perms = {};
  try { perms = permsRaw ? JSON.parse(permsRaw) : {}; } catch(e) {}

  // Tier: full if regimen.full_columns is granted
  ROSTER.tier = perms['regimen.full_columns'] ? 'full' : 'limited';

  // Can edit: regimen.edit_employee
  ROSTER.canEdit = !!perms['regimen.edit_employee'];

  // Show/hide add button
  const addBtn = document.getElementById('roster-add-btn');
  if (addBtn) addBtn.style.display = ROSTER.canEdit ? '' : 'none';

  // Show/hide tabs
  const onboardingTab = document.getElementById('regimen-tab-onboarding');
  if (onboardingTab) onboardingTab.style.display = perms['regimen.onboarding_tab'] ? '' : 'none';
  const permTab = document.getElementById('regimen-tab-permissions');
  if (permTab) permTab.style.display = perms['regimen.permissions_tab'] ? '' : 'none';

  // Render
  rosterRenderFilterBar();
  rosterApplyFilters();
  rosterRenderTable();
}

async function initRoster() {
  await rosterFetchEmployees();
}
