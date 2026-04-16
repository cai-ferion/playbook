/**
 * Regimen — Employee Roster Viewer/Editor
 * Role-based visibility and editability:
 *   - Agents: Cannot see Regimen at all (nav hidden)
 *   - SMEs, QAs, Team Leads (except 740045023), Trainers: Limited columns (read-only)
 *   - Managers & OHR 740045023: ALL columns visible
 *   - Editable by OHR 740045023, 740044909, 703212987 only
 * Audit trail: all edits logged to io_audit_log
 * Filter system: pill-based (same as Anchor/Compass)
 */

const ROSTER = {
  employees: [],
  filtered: [],
  page: 1,
  pageSize: 30,
  editingId: null,
  canEdit: false,
  visibilityTier: 'full', // 'limited' or 'full'

  // OHRs with edit permission
  EDITOR_OHRS: ['740045023', '740044909', '703212987'],
  ADMIN_OHR: '740045023',

  // --- Column Definitions (grouped: Identity → Role & Assignment → System IDs → Dates → Attrition) ---

  // Columns visible to SMEs, QAs, Team Leads (non-admin), Trainers
  LIMITED_COLUMNS: [
    // Identity
    { key: 'ohr_id', label: 'OHR ID', group: 'Identity' },
    { key: 'full_name', label: 'Full Name', group: 'Identity' },
    { key: 'last_name', label: 'Last Name', group: 'Identity' },
    { key: 'given_name', label: 'Given Name', group: 'Identity' },
    { key: 'middle_name', label: 'Middle Name', group: 'Identity' },
    { key: 'suffix', label: 'Suffix', group: 'Identity' },
    { key: 'billing_name', label: 'Billing Name', group: 'Identity' },
    { key: 'srt_name', label: 'SRT Name', group: 'Identity' },
    // Role & Assignment
    { key: 'employement_status', label: 'Status', group: 'Role & Assignment' },
    { key: 'actual_role', label: 'Role', group: 'Role & Assignment' },
    { key: 'supervisor_name', label: 'Supervisor', group: 'Role & Assignment' },
    { key: 'supervisor_email', label: 'Supervisor Email', group: 'Role & Assignment' },
    { key: 'shift_time', label: 'Shift Time', group: 'Role & Assignment' },
    { key: 'work_off', label: 'Work Off', group: 'Role & Assignment' },
    { key: 'planning_group', label: 'Planning Group', group: 'Role & Assignment' },
    { key: 'complete_planning_group', label: 'Related PG', group: 'Role & Assignment' },
    { key: 'srt_status', label: 'SRT Status', group: 'Role & Assignment' },
    // System IDs
    { key: 'srt_id', label: 'SRT ID', group: 'System IDs' },
    { key: 'workday_id', label: 'Workday ID', group: 'System IDs' },
    { key: 'meta_email', label: 'Meta Email', group: 'System IDs' },
    // Assets
    { key: 'macbook_asset_id', label: 'MacBook Asset', group: 'Asset & Logistics' },
    { key: 'chromebook_asset_id', label: 'Chromebook Asset', group: 'Asset & Logistics' },
  ],

  // ALL columns for Managers & admin
  ALL_COLUMNS: [
    // Identity
    { key: 'ohr_id', label: 'OHR ID', group: 'Identity' },
    { key: 'full_name', label: 'Full Name', group: 'Identity' },
    { key: 'last_name', label: 'Last Name', group: 'Identity' },
    { key: 'given_name', label: 'Given Name', group: 'Identity' },
    { key: 'middle_name', label: 'Middle Name', group: 'Identity' },
    { key: 'suffix', label: 'Suffix', group: 'Identity' },
    { key: 'billing_name', label: 'Billing Name', group: 'Identity' },
    { key: 'srt_name', label: 'SRT Name', group: 'Identity' },
    { key: 'dob', label: 'DOB', group: 'Identity' },
    { key: 'personal_email', label: 'Personal Email', group: 'Identity' },
    { key: 'contact_number', label: 'Contact Number', group: 'Identity' },
    { key: 'primary_address', label: 'Primary Address', group: 'Identity' },
    { key: 'barangay', label: 'Barangay', group: 'Identity' },
    { key: 'city', label: 'City', group: 'Identity' },
    { key: 'province', label: 'Province', group: 'Identity' },
    // Role & Assignment
    { key: 'employement_status', label: 'Status', group: 'Role & Assignment' },
    { key: 'actual_role', label: 'Role', group: 'Role & Assignment' },
    { key: 'supervisor_name', label: 'Supervisor', group: 'Role & Assignment' },
    { key: 'supervisor_email', label: 'Supervisor Email', group: 'Role & Assignment' },
    { key: 'shift_time', label: 'Shift Time', group: 'Role & Assignment' },
    { key: 'work_off', label: 'Work Off', group: 'Role & Assignment' },
    { key: 'planning_group', label: 'Planning Group', group: 'Role & Assignment' },
    { key: 'complete_planning_group', label: 'Related PG', group: 'Role & Assignment' },
    { key: 'srt_status', label: 'SRT Status', group: 'Role & Assignment' },
    { key: 'platform', label: 'Platform', group: 'Role & Assignment' },
    // System IDs
    { key: 'srt_id', label: 'SRT ID', group: 'System IDs' },
    { key: 'workday_id', label: 'Workday ID', group: 'System IDs' },
    { key: 'meta_email', label: 'Meta Email', group: 'System IDs' },
    { key: 'macbook_asset_id', label: 'MacBook Asset', group: 'System IDs' },
    { key: 'chromebook_asset_id', label: 'Chromebook Asset', group: 'System IDs' },
    { key: 'badge_id', label: 'Badge ID', group: 'System IDs' },
    { key: 'badge_serial', label: 'Badge Serial', group: 'System IDs' },
    // Asset & Logistics
    { key: 'locker_floor', label: 'Locker Floor', group: 'Asset & Logistics' },
    { key: 'locker_number', label: 'Locker Number', group: 'Asset & Logistics' },
    // Dates
    { key: 'hire_date', label: 'Hire Date', group: 'Dates' },
    { key: 'regular_date', label: 'Regular Date', group: 'Dates' },
    { key: 'meta_onboarding_date', label: 'Meta Onboarding Date', group: 'Dates' },
    { key: 'live_date', label: 'Go Live Date', group: 'Dates' },
    // Attrition
    { key: 'offboarding_date', label: 'Offboarding Date', group: 'Attrition' },
    { key: 'resignation_date', label: 'Resignation Date', group: 'Attrition' },
    { key: 'relieving_date', label: 'Relieving Date', group: 'Attrition' },
    { key: 'exit_date', label: 'Exit Date', group: 'Attrition' },
    { key: 'exit_reason', label: 'Exit Reason', group: 'Attrition' },
  ],

  /** Returns the active column set based on user's visibility tier */
  getVisibleColumns() {
    return this.visibilityTier === 'full' ? this.ALL_COLUMNS : this.LIMITED_COLUMNS;
  },

  /** Columns for the edit/add forms (always full set — only editors see forms) */
  FORM_COLUMNS: [
    { key: 'ohr_id', label: 'OHR ID' },
    { key: 'full_name', label: 'Full Name' },
    { key: 'actual_role', label: 'Role' },
    { key: 'planning_group', label: 'Planning Group' },
    { key: 'complete_planning_group', label: 'Related PG' },
    { key: 'supervisor_name', label: 'Supervisor' },
    { key: 'meta_email', label: 'Meta Email' },
    { key: 'employement_status', label: 'Status' },
    { key: 'srt_status', label: 'SRT Status' },
  ]
};

// ===== Pill-based Filter State (same pattern as Anchor/Compass) =====

const ROSTER_FILTER_FIELDS = [
  { key: 'employement_status', label: 'Status', type: 'multi', recordKey: 'employement_status' },
  { key: 'actual_role', label: 'Role', type: 'multi', recordKey: 'actual_role' },
  { key: 'planning_group', label: 'Planning Group', type: 'multi', recordKey: 'planning_group', searchable: true, sortable: true },
  { key: 'supervisor_name', label: 'Supervisor', type: 'multi', recordKey: 'supervisor_name', searchable: true, sortable: true },
  { key: 'shift_time', label: 'Shift Time', type: 'multi', recordKey: 'shift_time' },
  { key: 'srt_status', label: 'SRT Status', type: 'multi', recordKey: 'srt_status' },
  { key: 'platform', label: 'Platform', type: 'multi', recordKey: 'platform' },
  { key: 'city', label: 'City', type: 'multi', recordKey: 'city', searchable: true },
  { key: 'search', label: 'Search', type: 'text' },
];

const rosterFilterState = {
  filters: {},  // key → { key, label, type, values/value, recordKey }
  sort: null,   // { key, direction } or null
  openPill: null,
};

let _rosterOutsideListener = null;
let _rosterApplyDebounce = null;

// ===== Permissions =====

function rosterDeterminePermissions() {
  if (!currentUser) {
    ROSTER.canEdit = false;
    ROSTER.visibilityTier = 'limited';
    return;
  }

  const ohr = currentUser.ohr_id;
  const role = currentUser.actual_role;

  // Editability: only these 3 OHRs
  ROSTER.canEdit = ROSTER.EDITOR_OHRS.includes(ohr);

  // Visibility tier:
  //   - Managers & OHR 740045023: full
  //   - Everyone else who can see Regimen: limited
  if (role === 'Manager' || ohr === ROSTER.ADMIN_OHR) {
    ROSTER.visibilityTier = 'full';
  } else {
    ROSTER.visibilityTier = 'limited';
  }
}

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

  // Determine permissions based on current user
  rosterDeterminePermissions();

  // Show/hide add button — editors only
  const addBtn = document.getElementById('roster-add-btn');
  if (addBtn) addBtn.style.display = ROSTER.canEdit ? '' : 'none';

  // Show/hide onboarding tab — admin only
  const onboardingTab = document.getElementById('regimen-tab-onboarding');
  if (onboardingTab) {
    onboardingTab.style.display = (currentUser && currentUser.ohr_id === ROSTER.ADMIN_OHR) ? '' : 'none';
  }

  rosterRenderFilterBar();
  rosterApplyFilters();
}

// ===== Pill-based Filter Bar (ported from Anchor/Compass) =====

function rosterGetAllValues(field) {
  return [...new Set(ROSTER.employees.map(r => r[field.recordKey]).filter(Boolean))].sort();
}

function rosterGetFilterSummary(field) {
  const f = rosterFilterState.filters[field.key];
  if (!f) return 'All';
  if (field.type === 'text') return f.value || 'All';
  const allValues = rosterGetAllValues(field);
  if (!f.values || f.values.length === 0) return 'None';
  if (f.values.length === allValues.length) return 'All';
  if (f.values.length === 1) return f.values[0];
  return f.values.length + ' selected';
}

function rosterIsFiltered(field) {
  const f = rosterFilterState.filters[field.key];
  if (!f) return false;
  if (field.type === 'text') return !!f.value;
  const allValues = rosterGetAllValues(field);
  return f.values && f.values.length > 0 && f.values.length < allValues.length;
}

function rosterRenderFilterBar() {
  const container = document.getElementById('roster-filter-pills');
  if (!container) return;
  let html = '';
  for (const field of ROSTER_FILTER_FIELDS) {
    // Hide platform/city for limited tier users
    if (ROSTER.visibilityTier === 'limited' && ['platform', 'city'].includes(field.key)) continue;
    const summary = rosterGetFilterSummary(field);
    const isActive = rosterIsFiltered(field);
    const hasSort = rosterFilterState.sort && rosterFilterState.sort.key === field.key;
    const isOpen = rosterFilterState.openPill === field.key;

    let pillClass = 'filter-pill';
    if (isActive) pillClass += ' active';
    if (hasSort) pillClass += ' has-sort';
    if (isOpen) pillClass += ' open';
    const sortIcon = hasSort ? (rosterFilterState.sort.direction === 'asc' ? ' ▲' : ' ▼') : '';
    html += '<div class="' + pillClass + '" id="roster-pill-' + field.key + '" onclick="event.stopPropagation(); rosterTogglePill(\'' + field.key + '\')">'
      + '<span class="filter-pill-label">' + escapeHtml(field.label) + '</span>'
      + '<span class="filter-pill-value">' + escapeHtml(summary) + sortIcon + '</span>'
      + '<span class="filter-pill-icon">▾</span>'
      + '<div class="filter-dropdown' + (isOpen ? ' open' : '') + '" id="roster-dd-' + field.key + '" onclick="event.stopPropagation();"></div>'
      + '</div>';
  }
  // Clear Filters button
  html += '<button class="filter-bar-clear" onclick="rosterClearAllFilters()" title="Reset all filters">'
    + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
    + ' Clear Filters'
    + '</button>';
  // Record count
  var curEl = document.getElementById('roster-record-count');
  var curText = curEl ? curEl.textContent : 'Records: 0';
  html += '<span class="filter-bar-meta" id="roster-record-count">' + curText + '</span>';
  container.innerHTML = html;
}

// ===== Toggle pill dropdown =====

window.rosterTogglePill = function (key) {
  if (rosterFilterState.openPill === key) {
    rosterClosePill();
    return;
  }
  rosterFilterState.openPill = key;
  rosterRenderFilterBar();
  rosterRenderDropdown(key);
  _attachRosterOutsideClick();
};

function rosterClosePill() {
  rosterFilterState.openPill = null;
  rosterRenderFilterBar();
  _detachRosterOutsideClick();
}

// ===== Render dropdown content =====

function rosterRenderDropdown(key) {
  const field = ROSTER_FILTER_FIELDS.find(function(f) { return f.key === key; });
  if (!field) return;
  const dd = document.getElementById('roster-dd-' + key);
  if (!dd) return;
  dd.classList.add('open');

  if (field.type === 'text') {
    rosterRenderTextDropdown(dd, field);
    return;
  }
  rosterRenderMultiDropdown(dd, field);
}

function rosterRenderTextDropdown(dd, field) {
  var f = rosterFilterState.filters[field.key];
  var curVal = f ? f.value : '';
  dd.innerHTML = '<div class="filter-dropdown-header">'
    + '<span class="filter-dropdown-title">' + escapeHtml(field.label) + '</span>'
    + '</div>'
    + '<div style="padding:8px 12px;">'
    + '<input type="text" class="form-input form-input-sm" id="roster-search-input" placeholder="Type to search name/OHR/email..." value="' + escapeAttr(curVal) + '" style="width:100%;">'
    + '</div>';
  setTimeout(function() {
    var inp = document.getElementById('roster-search-input');
    if (inp) {
      inp.focus();
      inp.addEventListener('input', function() {
        var val = inp.value.trim();
        if (val) {
          rosterFilterState.filters[field.key] = { key: field.key, label: field.label, type: 'text', value: val };
        } else {
          delete rosterFilterState.filters[field.key];
        }
        // Update pill text
        var pill = document.getElementById('roster-pill-' + field.key);
        if (pill) {
          var valSpan = pill.querySelector('.filter-pill-value');
          if (valSpan) valSpan.textContent = val || 'All';
          if (val) pill.classList.add('active'); else pill.classList.remove('active');
        }
        rosterDebouncedApply();
      });
    }
  }, 30);
}

function rosterRenderMultiDropdown(dd, field) {
  var values = rosterGetAllValues(field);
  var f = rosterFilterState.filters[field.key];
  var selectedSet = new Set(f ? f.values : values); // default: all selected
  var searchable = field.searchable || values.length > 15;

  var html = '<div class="filter-dropdown-header">';
  html += '<span class="filter-dropdown-title">' + escapeHtml(field.label) + '</span>';
  // Sort buttons (if sortable)
  if (field.sortable) {
    var isAsc = rosterFilterState.sort && rosterFilterState.sort.key === field.key && rosterFilterState.sort.direction === 'asc';
    var isDesc = rosterFilterState.sort && rosterFilterState.sort.key === field.key && rosterFilterState.sort.direction === 'desc';
    html += '<div class="filter-dropdown-sort">'
      + '<button class="filter-sort-btn ' + (isAsc ? 'active-sort' : '') + '" onclick="event.stopPropagation(); rosterSetSort(\'' + field.key + '\', \'asc\')" title="Sort A→Z">A↑</button>'
      + '<button class="filter-sort-btn ' + (isDesc ? 'active-sort' : '') + '" onclick="event.stopPropagation(); rosterSetSort(\'' + field.key + '\', \'desc\')" title="Sort Z→A">Z↓</button>'
      + '</div>';
  }
  html += '</div>';
  if (searchable) {
    html += '<div class="filter-dropdown-search"><input type="text" class="form-input form-input-sm" id="roster-dd-search-' + field.key + '" placeholder="Search..." oninput="rosterFilterDropdownSearch(\'' + field.key + '\')"></div>';
  }
  // Select All / Deselect All
  html += '<div class="filter-dropdown-actions">'
    + '<button class="filter-action-link" onclick="event.stopPropagation(); rosterSelectAll(\'' + field.key + '\')">Select All</button>'
    + '<button class="filter-action-link" onclick="event.stopPropagation(); rosterDeselectAll(\'' + field.key + '\')" style="color:#DC2626;">Deselect All</button>'
    + '</div>';
  html += '<div class="filter-dropdown-list" id="roster-dd-list-' + field.key + '">';
  for (var i = 0; i < values.length; i++) {
    var v = values[i];
    var checked = selectedSet.has(v) ? 'checked' : '';
    html += '<label class="filter-dropdown-item"><input type="checkbox" value="' + escapeAttr(v) + '" ' + checked + ' onchange="rosterOnCheckboxChange(\'' + field.key + '\')"><span>' + escapeHtml(v) + '</span></label>';
  }
  html += '</div>';
  dd.innerHTML = html;
  if (searchable) {
    setTimeout(function() {
      var si = document.getElementById('roster-dd-search-' + field.key);
      if (si) si.focus();
    }, 50);
  }
}

// ===== Checkbox / sort handlers =====

window.rosterOnCheckboxChange = function (key) {
  var field = ROSTER_FILTER_FIELDS.find(function(f) { return f.key === key; });
  if (!field) return;
  var listEl = document.getElementById('roster-dd-list-' + key);
  if (!listEl) return;
  var checked = [];
  listEl.querySelectorAll('input[type="checkbox"]:checked').forEach(function(cb) { checked.push(cb.value); });
  var allValues = rosterGetAllValues(field);
  if (checked.length === allValues.length) {
    delete rosterFilterState.filters[key];
  } else {
    rosterFilterState.filters[key] = { key: key, label: field.label, type: 'multi', values: checked, recordKey: field.recordKey };
  }
  // Update pill summary without closing dropdown
  var pill = document.getElementById('roster-pill-' + key);
  if (pill) {
    var valSpan = pill.querySelector('.filter-pill-value');
    if (valSpan) {
      var sortIcon = (rosterFilterState.sort && rosterFilterState.sort.key === key)
        ? (rosterFilterState.sort.direction === 'asc' ? ' ▲' : ' ▼') : '';
      valSpan.textContent = rosterGetFilterSummary(field) + sortIcon;
    }
    if (rosterIsFiltered(field)) pill.classList.add('active'); else pill.classList.remove('active');
  }
  rosterDebouncedApply();
};

window.rosterSetSort = function (key, direction) {
  var curSort = rosterFilterState.sort;
  if (curSort && curSort.key === key && curSort.direction === direction) {
    rosterFilterState.sort = null;
  } else {
    rosterFilterState.sort = { key: key, direction: direction };
  }
  var wasOpen = rosterFilterState.openPill;
  rosterRenderFilterBar();
  if (wasOpen) {
    rosterFilterState.openPill = wasOpen;
    rosterRenderFilterBar();
    rosterRenderDropdown(wasOpen);
  }
  rosterDebouncedApply();
};

window.rosterSelectAll = function (key) {
  var listEl = document.getElementById('roster-dd-list-' + key);
  if (!listEl) return;
  listEl.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
    if (cb.closest('.filter-dropdown-item').style.display !== 'none') cb.checked = true;
  });
  delete rosterFilterState.filters[key];
  var field = ROSTER_FILTER_FIELDS.find(function(f) { return f.key === key; });
  if (field) {
    var pill = document.getElementById('roster-pill-' + key);
    if (pill) {
      var valSpan = pill.querySelector('.filter-pill-value');
      if (valSpan) valSpan.textContent = 'All';
      pill.classList.remove('active');
    }
  }
  rosterDebouncedApply();
};

window.rosterDeselectAll = function (key) {
  var listEl = document.getElementById('roster-dd-list-' + key);
  if (!listEl) return;
  listEl.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
    if (cb.closest('.filter-dropdown-item').style.display !== 'none') cb.checked = false;
  });
  var stillChecked = [];
  listEl.querySelectorAll('input[type="checkbox"]:checked').forEach(function(cb) { stillChecked.push(cb.value); });
  var field = ROSTER_FILTER_FIELDS.find(function(f) { return f.key === key; });
  rosterFilterState.filters[key] = { key: key, label: field.label, type: 'multi', values: stillChecked, recordKey: field.recordKey };
  var pill = document.getElementById('roster-pill-' + key);
  if (pill) {
    var valSpan = pill.querySelector('.filter-pill-value');
    if (valSpan) valSpan.textContent = stillChecked.length === 0 ? 'None' : stillChecked.length + ' selected';
    pill.classList.add('active');
  }
  rosterDebouncedApply();
};

window.rosterFilterDropdownSearch = function (key) {
  var searchEl = document.getElementById('roster-dd-search-' + key);
  var listEl = document.getElementById('roster-dd-list-' + key);
  if (!searchEl || !listEl) return;
  var q = searchEl.value.toLowerCase();
  listEl.querySelectorAll('.filter-dropdown-item').forEach(function(item) {
    var text = item.textContent.toLowerCase();
    item.style.display = text.includes(q) ? '' : 'none';
  });
};

// ===== Clear all =====

window.rosterClearAllFilters = function () {
  rosterClosePill();
  rosterFilterState.filters = {};
  rosterFilterState.sort = null;
  rosterRenderFilterBar();
  rosterApplyNow();
};

// ===== Apply (instant, debounced) =====

function rosterDebouncedApply() {
  clearTimeout(_rosterApplyDebounce);
  _rosterApplyDebounce = setTimeout(rosterApplyNow, 200);
}

function rosterApplyNow() {
  rosterApplyFilters();
}

// ===== Outside click =====

function _attachRosterOutsideClick() {
  if (_rosterOutsideListener) return;
  setTimeout(function() {
    _rosterOutsideListener = function(e) {
      var bar = document.getElementById('roster-filter-bar');
      if (bar && bar.contains(e.target)) return;
      rosterClosePill();
    };
    document.addEventListener('mousedown', _rosterOutsideListener);
  }, 10);
}

function _detachRosterOutsideClick() {
  if (_rosterOutsideListener) {
    document.removeEventListener('mousedown', _rosterOutsideListener);
    _rosterOutsideListener = null;
  }
}

// ===== Apply Filters (pill-based) =====

function rosterApplyFilters() {
  let data = [...ROSTER.employees];

  // Apply each filter
  var keys = Object.keys(rosterFilterState.filters);
  for (var ki = 0; ki < keys.length; ki++) {
    var f = rosterFilterState.filters[keys[ki]];
    if (f.type === 'text') {
      var q = (f.value || '').toLowerCase();
      if (q) {
        data = data.filter(e =>
          (e.full_name || '').toLowerCase().includes(q) ||
          (e.ohr_id || '').toLowerCase().includes(q) ||
          (e.meta_email || '').toLowerCase().includes(q)
        );
      }
    } else if (f.type === 'multi') {
      if (!f.values || f.values.length === 0) {
        data = [];
        break;
      }
      var rk = f.recordKey;
      var vs = f.values;
      data = data.filter(function(e) { return vs.includes(e[rk]); });
    }
  }

  // Apply sort
  if (rosterFilterState.sort) {
    var sk = rosterFilterState.sort.key;
    var dir = rosterFilterState.sort.direction;
    var sortField = ROSTER_FILTER_FIELDS.find(function(f) { return f.key === sk; });
    var sortKey = sortField ? (sortField.recordKey || sk) : sk;
    data.sort(function(a, b) {
      var va = (a[sortKey] || '').toString().toLowerCase();
      var vb = (b[sortKey] || '').toString().toLowerCase();
      var cmp = va.localeCompare(vb);
      return dir === 'asc' ? cmp : -cmp;
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
function rosterOmnibarOpenMenu() {}
function rosterOmnibarCloseMenu() {}
function rosterOmnibarClearAll() { rosterClearAllFilters(); }
function rosterRenderOmniChips() {}
function rosterRenderOmniMenu() {}

// ===== Table Rendering (role-based columns) =====

function rosterRenderTable() {
  const thead = document.getElementById('roster-table-head');
  const tbody = document.getElementById('roster-table-body');
  if (!thead || !tbody) return;

  const cols = ROSTER.getVisibleColumns();

  thead.innerHTML = `<tr>
    ${cols.map(c => `<th style="white-space:nowrap;">${escapeHtml(c.label)}</th>`).join('')}
  </tr>`;

  const start = (ROSTER.page - 1) * ROSTER.pageSize;
  const pageData = ROSTER.filtered.slice(start, start + ROSTER.pageSize);

  if (pageData.length === 0) {
    const colSpan = cols.length;
    tbody.innerHTML = `<tr><td colspan="${colSpan}"><div class="mascot-empty-state"><div class="sprite-mascot" role="img" aria-label="No data"></div><div class="empty-title">No employees found</div><div class="empty-subtitle">Try adjusting the search or filters</div></div></td></tr>`;
    rosterRenderPagination();
    return;
  }

  tbody.innerHTML = pageData.map(emp => {
    const statusColor = emp.employement_status === 'Active' ? '#22C55E' : '#EF4444';

    return `<tr class="module-row" onclick="rosterOpenDetail('${escapeAttr(emp.ohr_id)}')" style="cursor:pointer;">
      ${cols.map(c => {
        if (c.key === 'employement_status') {
          return `<td><span class="module-status-badge" style="background:${statusColor}20;color:${statusColor};border:1px solid ${statusColor}40;">${escapeHtml(emp[c.key] || '')}</span></td>`;
        }
        let val = emp[c.key];
        if (c.key === 'srt_id') val = formatSrtId(val);
        return `<td style="white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis;" title="${escapeAttr(val != null ? String(val) : '')}">${escapeHtml(val != null ? String(val) : '')}</td>`;
      }).join('')}
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
  if (!ROSTER.canEdit) { showToast('You do not have permission to edit employees', 'error'); return; }

  const emp = ROSTER.employees.find(e => e.ohr_id === ohrId);
  if (!emp) return;
  ROSTER.editingId = ohrId;

  const formTitle = document.getElementById('roster-form-title');
  const formBody = document.getElementById('roster-form-body');
  const formFooter = document.getElementById('roster-form-footer');
  const overlay = document.getElementById('roster-form-overlay');

  formTitle.textContent = `Edit: ${emp.full_name || ohrId}`;

  const roleOptions = ['Agent', 'QA', 'SME', 'Team Lead', 'Trainer', 'Manager'];
  const statusOptions = ['Active', 'Inactive', 'Resigned', 'Terminated'];
  const srtStatusOptions = ['Production', 'Inactive', 'Exit', 'Nesting', 'Training', 'Attrition backfill Training'];

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
        if (col.key === 'srt_status') {
          return `<div class="form-field">
            <label class="form-label">${col.label}</label>
            <select class="form-select" id="roster-edit-${col.key}">
              ${srtStatusOptions.map(s => `<option value="${s}" ${emp[col.key] === s ? 'selected' : ''}>${s}</option>`).join('')}
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
    const el = document.getElementById(`roster-edit-${col.key}`);
    if (el) updates[col.key] = el.value;
  });

  try {
    const url = `${IO_API_BASE}/employees/${encodeURIComponent(ROSTER.editingId)}`;
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...updates,
        _actor_ohr: currentUser ? currentUser.ohr_id : null,
        _actor_name: currentUser ? currentUser.full_name : null,
      })
    });
    if (!resp.ok) throw new Error('Failed to update employee');

    showToast('Employee updated successfully', 'success');
    rosterCloseForm();
    await rosterFetchEmployees();
  } catch (e) {
    console.error('Failed to update employee:', e);
    showToast('Failed to update: ' + e.message, 'error');
  }
}

// ===== Add Employee =====

function rosterShowAddForm() {
  if (!ROSTER.canEdit) { showToast('You do not have permission to add employees', 'error'); return; }
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
    <button class="btn btn-primary btn-sm" onclick="rosterSaveNew()">Create Employee</button>
  `;

  overlay.style.display = 'flex';
}

async function rosterSaveNew() {
  const data = {};
  ROSTER.ALL_COLUMNS.forEach(col => {
    const el = document.getElementById(`roster-add-${col.key}`);
    if (el) data[col.key] = el.value || null;
  });

  if (!data.ohr_id) { showToast('OHR ID is required', 'error'); return; }
  if (!data.full_name) { showToast('Full Name is required', 'error'); return; }
  if (!data.actual_role) { showToast('Role is required', 'error'); return; }

  try {
    const resp = await fetch(`${IO_API_BASE}/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({}));
      throw new Error(errBody.error || 'Failed to create employee');
    }

    showToast('Employee created successfully', 'success');
    rosterCloseForm();
    await rosterFetchEmployees();
  } catch (e) {
    console.error('Failed to create employee:', e);
    showToast('Failed to create: ' + e.message, 'error');
  }
}

// ===== Delete Employee =====

async function rosterDeleteEmployee(ohrId) {
  if (!ROSTER.canEdit) { showToast('You do not have permission to delete employees', 'error'); return; }
  const emp = ROSTER.employees.find(e => e.ohr_id === ohrId);
  if (!confirm(`Are you sure you want to delete ${emp ? emp.full_name : ohrId}? This action cannot be undone.`)) return;

  try {
    const url = `${IO_API_BASE}/employees/${encodeURIComponent(ohrId)}`;
    const resp = await fetch(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        _actor_ohr: currentUser ? currentUser.ohr_id : null,
        _actor_name: currentUser ? currentUser.full_name : null,
      })
    });
    if (!resp.ok) throw new Error('Failed to delete employee');

    showToast('Employee deleted', 'success');
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

// ===== Employee Detail Card =====

function formatSrtId(val) {
  if (!val) return '';
  const s = String(val);
  if (/e\+/i.test(s)) {
    try { return BigInt(Math.round(Number(s))).toString(); } catch(e) { return s; }
  }
  return s;
}

function rosterOpenDetail(ohrId) {
  const emp = ROSTER.employees.find(e => e.ohr_id === ohrId);
  if (!emp) return;

  const formTitle = document.getElementById('roster-form-title');
  const formBody = document.getElementById('roster-form-body');
  const formFooter = document.getElementById('roster-form-footer');
  const overlay = document.getElementById('roster-form-overlay');

  formTitle.innerHTML = '';

  const statusColor = emp.employement_status === 'Active' ? '#22C55E' : '#EF4444';
  const canEditDetail = ROSTER.canEdit;

  // Use the columns appropriate for this user's visibility tier
  const visibleCols = ROSTER.getVisibleColumns();

  // Group columns by their group property
  const groups = {};
  visibleCols.forEach(c => {
    if (!groups[c.group]) groups[c.group] = [];
    groups[c.group].push(c);
  });

  const roleOptions = ['Agent', 'QA', 'SME', 'Team Lead', 'Trainer', 'Manager'];
  const statusOptions = ['Active', 'Inactive', 'Resigned', 'Terminated'];
  const srtStatusOptions = ['Production', 'Inactive', 'Exit', 'Nesting', 'Training', 'Attrition backfill Training'];

  function renderField(col) {
    const val = col.key === 'srt_id' ? formatSrtId(emp[col.key]) : emp[col.key];
    const displayVal = (val !== null && val !== undefined && val !== '') ? String(val) : '\u2014';

    if (col.key === 'employement_status') {
      if (canEditDetail) {
        return `<div class="detail-row"><span class="detail-label">${escapeHtml(col.label)}</span><span class="detail-value">
          <select class="form-select form-select-sm roster-edit-field" data-key="${col.key}" style="font-size:13px;padding:2px 6px;max-width:280px;">
            ${statusOptions.map(s => `<option value="${s}" ${emp[col.key] === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </span></div>`;
      }
      return `<div class="detail-row"><span class="detail-label">${escapeHtml(col.label)}</span><span class="detail-value"><span class="module-status-badge" style="background:${statusColor}20;color:${statusColor};border:1px solid ${statusColor}40;">${escapeHtml(displayVal)}</span></span></div>`;
    }

    if (col.key === 'actual_role' && canEditDetail) {
      return `<div class="detail-row"><span class="detail-label">${escapeHtml(col.label)}</span><span class="detail-value">
        <select class="form-select form-select-sm roster-edit-field" data-key="${col.key}" style="font-size:13px;padding:2px 6px;max-width:280px;">
          ${roleOptions.map(r => `<option value="${r}" ${emp[col.key] === r ? 'selected' : ''}>${r}</option>`).join('')}
        </select>
      </span></div>`;
    }

    if (col.key === 'srt_status' && canEditDetail) {
      return `<div class="detail-row"><span class="detail-label">${escapeHtml(col.label)}</span><span class="detail-value">
        <select class="form-select form-select-sm roster-edit-field" data-key="${col.key}" style="font-size:13px;padding:2px 6px;max-width:280px;">
          ${srtStatusOptions.map(s => `<option value="${s}" ${emp[col.key] === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </span></div>`;
    }

    if (canEditDetail) {
      return `<div class="detail-row"><span class="detail-label">${escapeHtml(col.label)}</span><span class="detail-value"><input type="text" class="form-input form-input-sm roster-edit-field" data-key="${escapeAttr(col.key)}" value="${escapeAttr(displayVal === '\u2014' ? '' : displayVal)}" style="font-size:13px;padding:2px 6px;width:100%;max-width:280px;"></span></div>`;
    }

    return `<div class="detail-row"><span class="detail-label">${escapeHtml(col.label)}</span><span class="detail-value">${escapeHtml(displayVal)}</span></div>`;
  }

  let html = '<div class="detail-section">';
  for (const [groupName, cols] of Object.entries(groups)) {
    html += `<h4 class="detail-section-title" style="font-size:13px;text-transform:uppercase;letter-spacing:1px;color:var(--fg-muted);border-bottom:2px solid var(--primary);padding-bottom:6px;margin-bottom:12px;margin-top:20px;">${escapeHtml(groupName)}</h4>`;
    cols.forEach(c => html += renderField(c));
  }
  html += '</div>';

  formBody.innerHTML = html;

  // Footer
  let footerHtml = '<button class="btn btn-outline btn-sm" onclick="rosterCloseForm()">Close</button>';
  if (canEditDetail) {
    footerHtml += ` <button class="btn btn-primary btn-sm" onclick="rosterSaveDetailEdits('${escapeAttr(emp.ohr_id)}')">Save Changes</button>`;
    footerHtml += ` <button class="btn btn-ghost btn-sm" onclick="rosterViewAuditTrail('${escapeAttr(emp.ohr_id)}')" title="View edit history" style="margin-left:auto;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      Audit Trail
    </button>`;
  }
  formFooter.innerHTML = footerHtml;

  overlay.style.display = 'flex';
}

async function rosterSaveDetailEdits(ohrId) {
  const inputs = document.querySelectorAll('.roster-edit-field');
  const updates = {};
  inputs.forEach(inp => {
    const key = inp.dataset.key;
    const val = (inp.tagName === 'SELECT') ? inp.value : inp.value.trim();
    updates[key] = val || null;
  });

  try {
    const resp = await fetch(`${IO_API_BASE}/employees/${ohrId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...updates,
        _actor_ohr: currentUser ? currentUser.ohr_id : null,
        _actor_name: currentUser ? currentUser.full_name : null,
      })
    });
    if (!resp.ok) throw new Error('Failed to save');
    showToast('Employee details updated successfully', 'success');
    rosterCloseForm();
    await rosterFetchEmployees();
  } catch (e) {
    console.error('Failed to save employee details:', e);
    showToast('Failed to save changes', 'error');
  }
}

// ===== Audit Trail Viewer =====

async function rosterViewAuditTrail(ohrId) {
  const modal = document.getElementById('audit-modal');
  const body = document.getElementById('audit-modal-body');
  if (!modal || !body) return;

  body.innerHTML = '<div class="audit-loading">Loading audit trail...</div>';
  modal.style.display = 'flex';

  try {
    const resp = await fetch(`${IO_API_BASE}/audit-log?record_type=io_employees&record_id=${encodeURIComponent(ohrId)}&limit=100`);
    if (!resp.ok) throw new Error('Failed to fetch audit trail');
    const logs = await resp.json();

    if (!logs || logs.length === 0) {
      body.innerHTML = '<div class="audit-empty" style="text-align:center;padding:32px;color:var(--fg-muted);">No edit history found for this employee.</div>';
      return;
    }

    let html = '<div class="audit-timeline">';
    logs.forEach(log => {
      const ts = log.timestamp ? new Date(log.timestamp).toLocaleString() : 'Unknown time';
      const actor = log.actor_name || log.actor_ohr || 'System';
      html += `<div class="audit-entry" style="padding:10px 0;border-bottom:1px solid var(--border);">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-weight:600;font-size:13px;">${escapeHtml(log.field_name || log.action || 'Update')}</span>
          <span style="font-size:11px;color:var(--fg-muted);">${escapeHtml(ts)}</span>
        </div>
        <div style="font-size:12px;color:var(--fg-muted);margin-top:4px;">
          by ${escapeHtml(actor)}
        </div>
        ${log.old_value || log.new_value ? `<div style="font-size:12px;margin-top:6px;">
          ${log.old_value ? `<span style="background:#EF444420;color:#EF4444;padding:1px 6px;border-radius:4px;text-decoration:line-through;">${escapeHtml(String(log.old_value))}</span>` : ''}
          ${log.old_value && log.new_value ? ' &rarr; ' : ''}
          ${log.new_value ? `<span style="background:#22C55E20;color:#22C55E;padding:1px 6px;border-radius:4px;">${escapeHtml(String(log.new_value))}</span>` : ''}
        </div>` : ''}
      </div>`;
    });
    html += '</div>';
    body.innerHTML = html;
  } catch (e) {
    body.innerHTML = `<div style="color:var(--danger);padding:16px;">Failed to load audit trail: ${escapeHtml(e.message)}</div>`;
  }
}

// ===== CSV Export =====

window.rosterExportCSV = function () {
  const cols = ROSTER.getVisibleColumns();
  const data = ROSTER.filtered;

  if (data.length === 0) {
    showToast('No records to export', 'info');
    return;
  }

  // Build CSV
  const escCSV = (v) => {
    if (v == null) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
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
  const filename = `regimen-roster-${today}.csv`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);

  showToast(`Exported ${data.length} records to ${filename}`, 'success');
};

// ===== Tab Switching =====

window.rosterSwitchTab = function (tab) {
  const rosterPanel = document.getElementById('regimen-panel-roster');
  const onboardingPanel = document.getElementById('regimen-panel-onboarding');
  const rosterTab = document.getElementById('regimen-tab-roster');
  const onboardingTab = document.getElementById('regimen-tab-onboarding');

  if (tab === 'roster') {
    if (rosterPanel) rosterPanel.style.display = '';
    if (onboardingPanel) onboardingPanel.style.display = 'none';
    if (rosterTab) { rosterTab.style.borderBottomColor = 'var(--primary)'; rosterTab.style.color = 'var(--primary)'; rosterTab.classList.add('active'); }
    if (onboardingTab) { onboardingTab.style.borderBottomColor = 'transparent'; onboardingTab.style.color = 'var(--fg-muted)'; onboardingTab.classList.remove('active'); }
  } else if (tab === 'onboarding') {
    if (rosterPanel) rosterPanel.style.display = 'none';
    if (onboardingPanel) onboardingPanel.style.display = '';
    if (onboardingTab) { onboardingTab.style.borderBottomColor = 'var(--primary)'; onboardingTab.style.color = 'var(--primary)'; onboardingTab.classList.add('active'); }
    if (rosterTab) { rosterTab.style.borderBottomColor = 'transparent'; rosterTab.style.color = 'var(--fg-muted)'; rosterTab.classList.remove('active'); }
    onboardingRenderDashboard();
  }
};

// ===== Onboarding Completion Dashboard =====

const ONBOARDING_REQUIRED_FIELDS = [
  'last_name', 'given_name', 'hire_date', 'dob', 'personal_email',
  'contact_number', 'primary_address', 'barangay', 'city', 'province',
  'chromebook_asset_id', 'badge_id', 'badge_serial',
  'locker_floor', 'locker_number'
];

const ONBOARDING_FIELD_LABELS = {
  last_name: 'Last Name', given_name: 'Given Name', hire_date: 'Hire Date',
  dob: 'DOB', personal_email: 'Personal Email', contact_number: 'Contact Number',
  primary_address: 'Primary Address', barangay: 'Barangay', city: 'City',
  province: 'Province', chromebook_asset_id: 'Chromebook Asset',
  badge_id: 'Badge ID', badge_serial: 'Badge Serial',
  locker_floor: 'Locker Floor', locker_number: 'Locker Number'
};

let _onboardingPage = 1;
const _onboardingPageSize = 25;

function onboardingGetData() {
  // All employees that are Active (potential onboarding candidates)
  // "Completed" = has password AND all required fields filled
  // "Pending" = no password OR missing required fields
  return ROSTER.employees.map(emp => {
    const hasPassword = !!emp.password;
    const missingFields = ONBOARDING_REQUIRED_FIELDS.filter(f => !emp[f] || String(emp[f]).trim() === '');
    const isComplete = hasPassword && missingFields.length === 0;
    return { ...emp, hasPassword, missingFields, isComplete };
  });
}

function onboardingRenderDashboard() {
  const allData = onboardingGetData();
  const completed = allData.filter(e => e.isComplete);
  const pending = allData.filter(e => !e.isComplete);
  const noPassword = allData.filter(e => !e.hasPassword);
  const rate = allData.length > 0 ? ((completed.length / allData.length) * 100).toFixed(1) : '0.0';

  // Summary cards
  const summaryEl = document.getElementById('onboarding-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div style="flex:1;min-width:140px;padding:16px;background:var(--surface);border:1px solid var(--border);border-radius:8px;">
        <div style="font-size:24px;font-weight:700;color:var(--primary);">${allData.length}</div>
        <div style="font-size:12px;color:var(--fg-muted);margin-top:4px;">Total Employees</div>
      </div>
      <div style="flex:1;min-width:140px;padding:16px;background:var(--surface);border:1px solid var(--border);border-radius:8px;">
        <div style="font-size:24px;font-weight:700;color:#22C55E;">${completed.length}</div>
        <div style="font-size:12px;color:var(--fg-muted);margin-top:4px;">Completed</div>
      </div>
      <div style="flex:1;min-width:140px;padding:16px;background:var(--surface);border:1px solid var(--border);border-radius:8px;">
        <div style="font-size:24px;font-weight:700;color:#F59E0B;">${pending.length}</div>
        <div style="font-size:12px;color:var(--fg-muted);margin-top:4px;">Pending</div>
      </div>
      <div style="flex:1;min-width:140px;padding:16px;background:var(--surface);border:1px solid var(--border);border-radius:8px;">
        <div style="font-size:24px;font-weight:700;color:#EF4444;">${noPassword.length}</div>
        <div style="font-size:12px;color:var(--fg-muted);margin-top:4px;">No Account</div>
      </div>
      <div style="flex:1;min-width:140px;padding:16px;background:var(--surface);border:1px solid var(--border);border-radius:8px;">
        <div style="font-size:24px;font-weight:700;color:var(--primary);">${rate}%</div>
        <div style="font-size:12px;color:var(--fg-muted);margin-top:4px;">Completion Rate</div>
      </div>
    `;
  }

  onboardingRenderTable();
}

window.onboardingRenderTable = function () {
  const thead = document.getElementById('onboarding-table-head');
  const tbody = document.getElementById('onboarding-table-body');
  if (!thead || !tbody) return;

  let allData = onboardingGetData();

  // Search filter
  const searchEl = document.getElementById('onboarding-search');
  const q = (searchEl ? searchEl.value : '').toLowerCase().trim();
  if (q) {
    allData = allData.filter(e =>
      (e.full_name || '').toLowerCase().includes(q) ||
      (e.ohr_id || '').toLowerCase().includes(q)
    );
  }

  // Sort: pending first, then by name
  allData.sort((a, b) => {
    if (a.isComplete !== b.isComplete) return a.isComplete ? 1 : -1;
    return (a.full_name || '').localeCompare(b.full_name || '');
  });

  thead.innerHTML = `<tr>
    <th style="white-space:nowrap;">OHR ID</th>
    <th style="white-space:nowrap;">Full Name</th>
    <th style="white-space:nowrap;">Status</th>
    <th style="white-space:nowrap;">Account</th>
    <th style="white-space:nowrap;">Onboarding Status</th>
    <th style="white-space:nowrap;">Missing Fields</th>
  </tr>`;

  const start = (_onboardingPage - 1) * _onboardingPageSize;
  const pageData = allData.slice(start, start + _onboardingPageSize);

  if (pageData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--fg-muted);">No employees found</td></tr>';
    onboardingRenderPagination(allData.length);
    return;
  }

  tbody.innerHTML = pageData.map(emp => {
    const statusColor = emp.isComplete ? '#22C55E' : '#F59E0B';
    const statusLabel = emp.isComplete ? 'Complete' : 'Pending';
    const accountColor = emp.hasPassword ? '#22C55E' : '#EF4444';
    const accountLabel = emp.hasPassword ? 'Active' : 'No Account';
    const missingHtml = emp.missingFields.length > 0
      ? emp.missingFields.map(f => `<span style="background:#EF444415;color:#EF4444;padding:1px 6px;border-radius:4px;font-size:11px;margin:1px 2px;display:inline-block;">${escapeHtml(ONBOARDING_FIELD_LABELS[f] || f)}</span>`).join('')
      : '<span style="color:#22C55E;font-size:12px;">All fields complete</span>';

    return `<tr>
      <td style="white-space:nowrap;font-weight:600;">${escapeHtml(emp.ohr_id || '')}</td>
      <td style="white-space:nowrap;">${escapeHtml(emp.full_name || '')}</td>
      <td><span class="module-status-badge" style="background:${emp.employement_status === 'Active' ? '#22C55E' : '#EF4444'}20;color:${emp.employement_status === 'Active' ? '#22C55E' : '#EF4444'};border:1px solid ${emp.employement_status === 'Active' ? '#22C55E' : '#EF4444'}40;">${escapeHtml(emp.employement_status || '')}</span></td>
      <td><span class="module-status-badge" style="background:${accountColor}20;color:${accountColor};border:1px solid ${accountColor}40;">${accountLabel}</span></td>
      <td><span class="module-status-badge" style="background:${statusColor}20;color:${statusColor};border:1px solid ${statusColor}40;">${statusLabel}</span></td>
      <td style="max-width:400px;">${missingHtml}</td>
    </tr>`;
  }).join('');

  onboardingRenderPagination(allData.length);
};

function onboardingRenderPagination(total) {
  const el = document.getElementById('onboarding-pagination');
  if (!el) return;
  const totalPages = Math.ceil(total / _onboardingPageSize) || 1;
  const start = (_onboardingPage - 1) * _onboardingPageSize + 1;
  const end = Math.min(_onboardingPage * _onboardingPageSize, total);

  el.innerHTML = `
    <span class="module-page-info">${total > 0 ? `${start}-${end} of ${total}` : '0 records'}</span>
    <button class="btn btn-ghost btn-xs" ${_onboardingPage <= 1 ? 'disabled' : ''} onclick="_onboardingPage--;onboardingRenderTable();">&laquo; Prev</button>
    <span class="module-page-num">Page ${_onboardingPage} of ${totalPages}</span>
    <button class="btn btn-ghost btn-xs" ${_onboardingPage >= totalPages ? 'disabled' : ''} onclick="_onboardingPage++;onboardingRenderTable();">Next &raquo;</button>
  `;
}

// ===== Init =====

async function initRoster() {
  await rosterFetchEmployees();
}
