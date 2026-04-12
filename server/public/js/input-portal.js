/**
 * Input Portal — Persistent Filter Bar, Virtualized Table, Bulk Editing, Audit Timeline
 *
 * Dependencies: data.js (appState, TABLE_COLUMNS, TAG_OPTIONS, etc.), app.js (escapeHtml, showToast, etc.)
 */

// ============================================================
// 1. PERSISTENT FILTER BAR
// ============================================================

const OMNIBAR_FILTER_FIELDS = [
  { key: 'date_range', label: 'Date', type: 'date_range' },
  { key: 'tag', label: 'Tag', type: 'multi', recordKey: 'tag', searchable: false, sortable: true },
  { key: 'agent', label: 'Agent', type: 'multi', recordKey: 'agent', searchable: true, sortable: true },
  { key: 'flm', label: 'FLM', type: 'multi', recordKey: 'flm', searchable: true, sortable: true },
  { key: 'actualPlanningGroup', label: 'Planning Group', type: 'multi', recordKey: 'actualPlanningGroup', searchable: true, sortable: true },
  { key: 'role', label: 'Role', type: 'multi', recordKey: 'role', searchable: false, sortable: false },
  { key: 'shiftTime', label: 'Shift Time', type: 'multi', recordKey: 'shiftTime', searchable: false, sortable: false },
  { key: 'status', label: 'Status', type: 'multi', recordKey: 'status', searchable: false, sortable: false },
  { key: 'blanks', label: 'Blank Tags', type: 'toggle' },
];

const OMNIBAR_SORT_FIELDS = [
  { key: 'date', label: 'Date', recordKey: 'date' },
  { key: 'agent', label: 'Agent', recordKey: 'agent' },
  { key: 'flm', label: 'FLM', recordKey: 'flm' },
  { key: 'tag', label: 'Tag', recordKey: 'tag' },
  { key: 'actualPlanningGroup', label: 'Planning Group', recordKey: 'actualPlanningGroup' },
  { key: 'shiftTime', label: 'Shift Time', recordKey: 'shiftTime' },

];

// Active view state
const omnibarState = {
  // Each filter stored by key. Missing key = "All" (no restriction)
  filters: {},
  // Sort: { key, direction, recordKey } or null
  sort: { key: 'date', direction: 'desc', recordKey: 'date' },
  // Which pill dropdown is open
  openPill: null,
};

let _omnibarOutsideListener = null;
let _inputApplyDebounce = null;

// ===== Helpers =====

function inputGetAllValues(field) {
  var empFieldMap = {
    agent: 'full_name', flm: 'supervisor_name',
    actualPlanningGroup: 'planning_group', role: 'actual_role',
    shiftTime: 'shift_time', status: 'srt_status',
  };

  var values;
  if (field.recordKey === 'tag' && typeof TAG_OPTIONS !== 'undefined') {
    var recordTags = appState.records.length > 0
      ? appState.records.map(function(r) { return r[field.recordKey]; }).filter(Boolean)
      : [];
    values = [...new Set([...TAG_OPTIONS, ...recordTags])].sort();
  } else if (appState.records.length > 0) {
    values = [...new Set(appState.records.map(function(r) { return r[field.recordKey]; }).filter(Boolean))].sort();
  } else if (typeof employeeLookup === 'object' && empFieldMap[field.recordKey]) {
    var empField = empFieldMap[field.recordKey];
    values = [...new Set(Object.values(employeeLookup).map(function(e) { return (e[empField] || '').trim(); }).filter(Boolean))].sort();
  } else if (typeof serverPagState !== 'undefined' && serverPagState.rows && serverPagState.rows.length > 0) {
    values = [...new Set(serverPagState.rows.map(function(r) { return r[field.recordKey]; }).filter(Boolean))].sort();
  } else {
    values = [];
  }
  return values;
}

function inputGetFilterSummary(field) {
  var f = omnibarState.filters[field.key];
  if (!f) {
    if (field.type === 'date_range') {
      var today = typeof getTodayStr === 'function' ? getTodayStr() : new Date().toISOString().slice(0, 10);
      return today;
    }
    return field.type === 'toggle' ? 'Off' : 'All';
  }
  if (field.type === 'date_range') {
    var fmt = typeof formatDateDisplay === 'function' ? formatDateDisplay : function(d) { return d; };
    return fmt(f.startDate) + ' \u2013 ' + fmt(f.endDate);
  }
  if (field.type === 'toggle') return 'On';
  var allValues = inputGetAllValues(field);
  if (!f.values || f.values.length === 0) return 'None';
  if (f.values.length === allValues.length) return 'All';
  if (f.values.length === 1) return f.values[0];
  return f.values.length + ' selected';
}

function inputIsFiltered(field) {
  var f = omnibarState.filters[field.key];
  if (!f) return false;
  if (field.type === 'date_range') return true;
  if (field.type === 'toggle') return true;
  var allValues = inputGetAllValues(field);
  return f.values && f.values.length > 0 && f.values.length < allValues.length;
}

// ===== Render pills =====

function inputRenderFilterBar() {
  var container = document.getElementById('input-filter-pills');
  if (!container) return;

  var html = '';

  for (var fi = 0; fi < OMNIBAR_FILTER_FIELDS.length; fi++) {
    var field = OMNIBAR_FILTER_FIELDS[fi];
    var summary = inputGetFilterSummary(field);
    var isActive = inputIsFiltered(field);
    var hasSort = omnibarState.sort && omnibarState.sort.key === field.key;
    var isOpen = omnibarState.openPill === field.key;

    if (field.type === 'toggle') {
      // Toggle pill — special rendering
      var toggleActive = !!omnibarState.filters[field.key];
      var toggleClass = 'filter-pill filter-pill-toggle' + (toggleActive ? ' active' : '');
      html += '<div class="' + toggleClass + '" id="input-pill-' + field.key + '" onclick="event.stopPropagation(); inputToggleBlanks()">'
        + '<span class="filter-pill-label">' + escapeHtml(field.label) + '</span>'
        + '<span class="filter-pill-value">' + (toggleActive ? 'On' : 'Off') + '</span>'
        + '</div>';
      continue;
    }

    var pillClass = 'filter-pill';
    if (isActive) pillClass += ' active';
    if (hasSort) pillClass += ' has-sort';
    if (isOpen) pillClass += ' open';

    var sortIcon = hasSort ? (omnibarState.sort.direction === 'asc' ? ' \u25B2' : ' \u25BC') : '';

    html += '<div class="' + pillClass + '" id="input-pill-' + field.key + '" onclick="event.stopPropagation(); inputTogglePill(\'' + field.key + '\')">'
      + '<span class="filter-pill-label">' + escapeHtml(field.label) + '</span>'
      + '<span class="filter-pill-value">' + escapeHtml(summary) + sortIcon + '</span>'
      + '<span class="filter-pill-icon">\u25BE</span>'
      + '<div class="filter-dropdown' + (isOpen ? ' open' : '') + '" id="input-dd-' + field.key + '" onclick="event.stopPropagation();"></div>'
      + '</div>';
  }

  // Clear Filters button
  html += '<button class="filter-bar-clear" onclick="inputClearAllFilters()" title="Reset all filters to defaults">'
    + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
    + ' Clear Filters'
    + '</button>';

  // Record count — preserve current value across re-renders
  var curCount = serverPagState.total || 0;
  html += '<span class="filter-bar-meta" id="input-filter-count">Filtered Records: ' + formatNumber(curCount) + '</span>';

  container.innerHTML = html;
}

// ===== Toggle pill dropdown =====

window.inputTogglePill = function (key) {
  if (omnibarState.openPill === key) {
    inputClosePill();
    return;
  }
  omnibarState.openPill = key;
  inputRenderFilterBar();
  inputRenderDropdown(key);
  _attachInputOutsideClick();
};

function inputClosePill() {
  omnibarState.openPill = null;
  inputRenderFilterBar();
  _detachInputOutsideClick();
}

// ===== Toggle blanks =====

window.inputToggleBlanks = function () {
  if (omnibarState.filters['blanks']) {
    delete omnibarState.filters['blanks'];
  } else {
    omnibarState.filters['blanks'] = { key: 'blanks', label: 'Blank Tags', type: 'toggle', values: [true] };
  }
  inputRenderFilterBar();
  inputDebouncedApply();
};

// ===== Render dropdown content =====

function inputRenderDropdown(key) {
  var field = OMNIBAR_FILTER_FIELDS.find(function(f) { return f.key === key; });
  if (!field) return;
  var dd = document.getElementById('input-dd-' + key);
  if (!dd) return;
  dd.classList.add('open');

  if (field.type === 'date_range') {
    inputRenderDateDropdown(dd, field);
    return;
  }

  inputRenderMultiDropdown(dd, field);
}

function inputRenderDateDropdown(dd, field) {
  var f = omnibarState.filters[field.key];
  var today = typeof getTodayStr === 'function' ? getTodayStr() : new Date().toISOString().slice(0, 10);
  var startVal = f ? f.startDate : today;
  var endVal = f ? f.endDate : today;

  // Sort buttons for date
  var curSort = omnibarState.sort;
  var isAsc = curSort && curSort.key === 'date' && curSort.direction === 'asc';
  var isDesc = curSort && curSort.key === 'date' && curSort.direction === 'desc';

  dd.innerHTML = '<div class="filter-dropdown-header">'
    + '<span class="filter-dropdown-title">' + escapeHtml(field.label) + '</span>'
    + '<div class="filter-dropdown-sort">'
    + '<button class="filter-sort-btn ' + (isAsc ? 'active-sort' : '') + '" onclick="event.stopPropagation(); inputSetSort(\'date\', \'asc\')" title="Oldest first">Old\u2191</button>'
    + '<button class="filter-sort-btn ' + (isDesc ? 'active-sort' : '') + '" onclick="event.stopPropagation(); inputSetSort(\'date\', \'desc\')" title="Newest first">New\u2193</button>'
    + '</div>'
    + '</div>'
    + '<div class="filter-date-row">'
    + '<div class="filter-group"><label>Start</label>'
    + '<input type="date" class="form-input form-input-sm" id="input-date-start" value="' + startVal + '">'
    + '</div>'
    + '<div class="filter-group"><label>End</label>'
    + '<input type="date" class="form-input form-input-sm" id="input-date-end" value="' + endVal + '">'
    + '</div>'
    + '</div>';

  setTimeout(function() {
    var startEl = document.getElementById('input-date-start');
    var endEl = document.getElementById('input-date-end');
    if (startEl) startEl.addEventListener('change', inputOnDateChange);
    if (endEl) endEl.addEventListener('change', inputOnDateChange);
  }, 30);
}

function inputOnDateChange() {
  var start = (document.getElementById('input-date-start') || {}).value || '';
  var end = (document.getElementById('input-date-end') || {}).value || '';
  if (!start || !end) return;
  if (start > end) { showToast('Start date cannot be after end date', 'info'); return; }
  omnibarState.filters['date_range'] = {
    key: 'date_range', label: 'Date', type: 'date_range', startDate: start, endDate: end
  };
  // Update pill text
  var field = OMNIBAR_FILTER_FIELDS[0];
  var pill = document.getElementById('input-pill-' + field.key);
  if (pill) {
    var valSpan = pill.querySelector('.filter-pill-value');
    if (valSpan) valSpan.textContent = inputGetFilterSummary(field);
  }
  inputDebouncedApply();
}

function inputRenderMultiDropdown(dd, field) {
  var values = inputGetAllValues(field);
  var f = omnibarState.filters[field.key];
  var selectedSet = new Set(f ? f.values : values); // default: all selected
  var searchable = field.searchable || values.length > 15;

  var html = '<div class="filter-dropdown-header">';
  html += '<span class="filter-dropdown-title">' + escapeHtml(field.label) + '</span>';

  // Sort buttons (if sortable)
  if (field.sortable) {
    var sortField = OMNIBAR_SORT_FIELDS.find(function(sf) { return sf.key === field.key; });
    if (sortField) {
      var curSort = omnibarState.sort;
      var isAsc = curSort && curSort.key === field.key && curSort.direction === 'asc';
      var isDesc = curSort && curSort.key === field.key && curSort.direction === 'desc';
      html += '<div class="filter-dropdown-sort">'
        + '<button class="filter-sort-btn ' + (isAsc ? 'active-sort' : '') + '" onclick="event.stopPropagation(); inputSetSort(\'' + field.key + '\', \'asc\')" title="Sort A\u2192Z">A\u2191</button>'
        + '<button class="filter-sort-btn ' + (isDesc ? 'active-sort' : '') + '" onclick="event.stopPropagation(); inputSetSort(\'' + field.key + '\', \'desc\')" title="Sort Z\u2192A">Z\u2193</button>'
        + '</div>';
    }
  }
  html += '</div>';

  if (searchable) {
    html += '<div class="filter-dropdown-search"><input type="text" class="form-input form-input-sm" id="input-dd-search-' + field.key + '" placeholder="Search..." oninput="inputFilterDropdownSearch(\'' + field.key + '\')"></div>';
  }

  // Select All / Deselect All
  html += '<div class="filter-dropdown-actions">'
    + '<button class="filter-action-link" onclick="event.stopPropagation(); inputSelectAll(\'' + field.key + '\')">Select All</button>'
    + '<button class="filter-action-link" onclick="event.stopPropagation(); inputDeselectAll(\'' + field.key + '\')" style="color:#DC2626;">Deselect All</button>'
    + '</div>';

  html += '<div class="filter-dropdown-list" id="input-dd-list-' + field.key + '">';
  for (var i = 0; i < values.length; i++) {
    var v = values[i];
    var checked = selectedSet.has(v) ? 'checked' : '';
    html += '<label class="filter-dropdown-item"><input type="checkbox" value="' + escapeAttr(v) + '" ' + checked + ' onchange="inputOnCheckboxChange(\'' + field.key + '\')"><span>' + escapeHtml(v) + '</span></label>';
  }
  html += '</div>';

  dd.innerHTML = html;

  if (searchable) {
    setTimeout(function() {
      var si = document.getElementById('input-dd-search-' + field.key);
      if (si) si.focus();
    }, 50);
  }
}

// ===== Checkbox / sort handlers =====

window.inputOnCheckboxChange = function (key) {
  var field = OMNIBAR_FILTER_FIELDS.find(function(f) { return f.key === key; });
  if (!field) return;
  var listEl = document.getElementById('input-dd-list-' + key);
  if (!listEl) return;
  var checked = [];
  listEl.querySelectorAll('input[type="checkbox"]:checked').forEach(function(cb) { checked.push(cb.value); });
  var allValues = inputGetAllValues(field);

  if (checked.length === allValues.length) {
    delete omnibarState.filters[key];
  } else {
    omnibarState.filters[key] = { key: key, label: field.label, type: 'multi', values: checked, recordKey: field.recordKey };
  }

  // Update pill summary without closing dropdown
  var pill = document.getElementById('input-pill-' + key);
  if (pill) {
    var valSpan = pill.querySelector('.filter-pill-value');
    if (valSpan) {
      var sortIcon = (omnibarState.sort && omnibarState.sort.key === key)
        ? (omnibarState.sort.direction === 'asc' ? ' \u25B2' : ' \u25BC') : '';
      valSpan.textContent = inputGetFilterSummary(field) + sortIcon;
    }
    if (inputIsFiltered(field)) {
      pill.classList.add('active');
    } else {
      pill.classList.remove('active');
    }
  }

  inputDebouncedApply();
};

window.inputSetSort = function (key, direction) {
  var curSort = omnibarState.sort;
  if (curSort && curSort.key === key && curSort.direction === direction) {
    omnibarState.sort = null;
  } else {
    var sortField = OMNIBAR_SORT_FIELDS.find(function(sf) { return sf.key === key; });
    omnibarState.sort = { key: key, direction: direction, recordKey: sortField ? sortField.recordKey : key };
  }
  var wasOpen = omnibarState.openPill;
  inputRenderFilterBar();
  if (wasOpen) {
    omnibarState.openPill = wasOpen;
    inputRenderFilterBar();
    inputRenderDropdown(wasOpen);
  }
  inputDebouncedApply();
};

window.inputSelectAll = function (key) {
  var listEl = document.getElementById('input-dd-list-' + key);
  if (!listEl) return;
  listEl.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
    if (cb.closest('.filter-dropdown-item').style.display !== 'none') cb.checked = true;
  });
  delete omnibarState.filters[key];
  var field = OMNIBAR_FILTER_FIELDS.find(function(f) { return f.key === key; });
  if (field) {
    var pill = document.getElementById('input-pill-' + key);
    if (pill) {
      var valSpan = pill.querySelector('.filter-pill-value');
      if (valSpan) valSpan.textContent = 'All';
      pill.classList.remove('active');
    }
  }
  inputDebouncedApply();
};

window.inputDeselectAll = function (key) {
  var listEl = document.getElementById('input-dd-list-' + key);
  if (!listEl) return;
  listEl.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
    if (cb.closest('.filter-dropdown-item').style.display !== 'none') cb.checked = false;
  });
  var stillChecked = [];
  listEl.querySelectorAll('input[type="checkbox"]:checked').forEach(function(cb) { stillChecked.push(cb.value); });
  var field = OMNIBAR_FILTER_FIELDS.find(function(f) { return f.key === key; });
  omnibarState.filters[key] = { key: key, label: field.label, type: 'multi', values: stillChecked, recordKey: field.recordKey };
  var pill = document.getElementById('input-pill-' + key);
  if (pill) {
    var valSpan = pill.querySelector('.filter-pill-value');
    if (valSpan) valSpan.textContent = stillChecked.length === 0 ? 'None' : stillChecked.length + ' selected';
    pill.classList.add('active');
  }
  inputDebouncedApply();
};

window.inputFilterDropdownSearch = function (key) {
  var searchEl = document.getElementById('input-dd-search-' + key);
  var listEl = document.getElementById('input-dd-list-' + key);
  if (!searchEl || !listEl) return;
  var q = searchEl.value.toLowerCase();
  listEl.querySelectorAll('.filter-dropdown-item').forEach(function(item) {
    var text = item.textContent.toLowerCase();
    item.style.display = text.includes(q) ? '' : 'none';
  });
};

// ===== Clear all =====

window.inputClearAllFilters = function () {
  inputClosePill();
  var today = typeof getTodayStr === 'function' ? getTodayStr() : new Date().toISOString().slice(0, 10);
  omnibarState.filters = {
    date_range: { key: 'date_range', label: 'Date', type: 'date_range', startDate: today, endDate: today }
  };
  omnibarState.sort = { key: 'date', direction: 'desc', recordKey: 'date' };
  inputRenderFilterBar();
  inputApplyNow();
};

// ===== Apply (instant, debounced) =====

function inputDebouncedApply() {
  clearTimeout(_inputApplyDebounce);
  _inputApplyDebounce = setTimeout(inputApplyNow, 250);
}

async function inputApplyNow() {
  await omnibarApplyView();
}

// ===== Outside click =====

function _attachInputOutsideClick() {
  if (_omnibarOutsideListener) return;
  setTimeout(function() {
    _omnibarOutsideListener = function(e) {
      var bar = document.getElementById('input-filter-bar');
      if (bar && bar.contains(e.target)) return;
      inputClosePill();
    };
    document.addEventListener('mousedown', _omnibarOutsideListener);
  }, 10);
}

function _detachInputOutsideClick() {
  if (_omnibarOutsideListener) {
    document.removeEventListener('mousedown', _omnibarOutsideListener);
    _omnibarOutsideListener = null;
  }
}

// ============================================================
// 2. SERVER-SIDE PAGINATION
// ============================================================

// Server-side pagination state
const serverPagState = {
  enabled: false,
  total: 0,
  rows: [],      // normalized rows for current page
  pageSize: 50,
};

// Track whether initial data load has happened
var _initialLoadDone = false;

function _showTableOverlay() {
  var tableWrap = document.getElementById('input-table-wrapper') || document.querySelector('.input-table-container');
  if (!tableWrap) return;
  var existing = document.getElementById('table-loading-overlay');
  if (existing) { existing.style.display = 'flex'; return; }
  var overlay = document.createElement('div');
  overlay.id = 'table-loading-overlay';
  overlay.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(255,255,255,0.6);display:flex;align-items:center;justify-content:center;z-index:10;pointer-events:none;border-radius:8px;';
  overlay.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:8px 16px;background:#fff;border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,0.12);font-size:13px;color:#555;"><div class="spinner" style="width:16px;height:16px;border-width:2px;"></div>Updating...</div>';
  tableWrap.style.position = 'relative';
  tableWrap.appendChild(overlay);
}

function _hideTableOverlay() {
  var overlay = document.getElementById('table-loading-overlay');
  if (overlay) overlay.style.display = 'none';
}

async function omnibarApplyView() {
  var dateFilter = omnibarState.filters['date_range'];
  var today = typeof getTodayStr === 'function' ? getTodayStr() : new Date().toISOString().slice(0, 10);
  var startDate = dateFilter ? dateFilter.startDate : today;
  var endDate = dateFilter ? dateFilter.endDate : today;

  // Build server-side filter params
  var filters = {};
  var keys = Object.keys(omnibarState.filters);
  for (var ki = 0; ki < keys.length; ki++) {
    var f = omnibarState.filters[keys[ki]];
    if (f.type === 'multi' && f.values && f.values.length > 0) {
      var keyMap = {
        tag: 'tag_in', agent: 'agent_in', flm: 'flm_in',
        actualPlanningGroup: 'planning_group_in',
        status: 'status_in', shiftTime: 'shift_time_in', role: 'role_in',
      };
      var paramKey = keyMap[f.key];
      if (paramKey) filters[paramKey] = f.values.join('|');
    }
    if (f.type === 'toggle' && f.key === 'blanks') {
      filters.blanks_only = true;
    }
  }

  // Build sort params
  var sortBy = null, sortDir = null;
  if (omnibarState.sort) {
    sortBy = omnibarState.sort.recordKey;
    sortDir = omnibarState.sort.direction;
  }

  // Use server-side pagination
  serverPagState.enabled = true;
  bulkDeselectAll();
  appState.inputPage = 0;

  // Use full progress bar only for initial load; subtle overlay for filter changes
  var useFullLoader = !_initialLoadDone;

  try {
    if (useFullLoader) {
      showProgressBar('Loading Data...');
    } else {
      _showTableOverlay();
    }
    var result = await fetchPaginatedAttendance({
      startDate: startDate, endDate: endDate,
      limit: serverPagState.pageSize,
      offset: 0,
      sortBy: sortBy, sortDir: sortDir,
      filters: filters,
    });
    serverPagState.total = result.total;
    serverPagState.rows = result.rows;
    if (useFullLoader) {
      hideProgressBar();
      _initialLoadDone = true;
    } else {
      _hideTableOverlay();
    }
    window.renderInputTableServerSide();
  } catch (err) {
    if (useFullLoader) {
      hideProgressBar();
    } else {
      _hideTableOverlay();
    }
    showToast('Failed to load data: ' + err.message, 'error');
  }
}

async function serverPageChange(newPage) {
  var dateFilter = omnibarState.filters['date_range'];
  var today = typeof getTodayStr === 'function' ? getTodayStr() : new Date().toISOString().slice(0, 10);
  var startDate = dateFilter ? dateFilter.startDate : today;
  var endDate = dateFilter ? dateFilter.endDate : today;

  var filters = {};
  var keys = Object.keys(omnibarState.filters);
  for (var ki = 0; ki < keys.length; ki++) {
    var f = omnibarState.filters[keys[ki]];
    if (f.type === 'multi' && f.values && f.values.length > 0) {
      var keyMap = {
        tag: 'tag_in', agent: 'agent_in', flm: 'flm_in',
        actualPlanningGroup: 'planning_group_in',
        status: 'status_in', shiftTime: 'shift_time_in', role: 'role_in',
      };
      var paramKey = keyMap[f.key];
      if (paramKey) filters[paramKey] = f.values.join('|');
    }
    if (f.type === 'toggle' && f.key === 'blanks') {
      filters.blanks_only = true;
    }
  }

  var sortBy = null, sortDir = null;
  if (omnibarState.sort) {
    sortBy = omnibarState.sort.recordKey;
    sortDir = omnibarState.sort.direction;
  }

  appState.inputPage = newPage;
  try {
    _showTableOverlay();
    var result = await fetchPaginatedAttendance({
      startDate: startDate, endDate: endDate,
      limit: serverPagState.pageSize,
      offset: newPage * serverPagState.pageSize,
      sortBy: sortBy, sortDir: sortDir,
      filters: filters,
    });
    serverPagState.rows = result.rows;
    serverPagState.total = result.total;
    _hideTableOverlay();
    window.renderInputTableServerSide();
  } catch (err) {
    _hideTableOverlay();
    showToast('Failed to load page: ' + err.message, 'error');
  }
}

function renderInputTableServerSide() {
  var totalRecords = serverPagState.total;
  var pageItems = serverPagState.rows;

  // Update record count in both places
  var rcEl = document.getElementById('input-record-count');
  if (rcEl) rcEl.textContent = 'Filtered Records: ' + formatNumber(totalRecords);
  var fcEl = document.getElementById('input-filter-count');
  if (fcEl) fcEl.textContent = 'Filtered Records: ' + formatNumber(totalRecords);

  // Update edit count
  var editCount = Object.keys(appState.pendingEdits).length;
  var editCountEl = document.getElementById('input-edit-count');
  var saveBtn = document.getElementById('save-btn');
  var undoBtn = document.getElementById('undo-btn');
  if (editCount > 0) {
    if (editCountEl) { editCountEl.textContent = editCount + ' record(s) edited'; editCountEl.style.display = 'inline'; }
    if (saveBtn) saveBtn.disabled = false;
    if (undoBtn) undoBtn.disabled = false;
  } else {
    if (editCountEl) editCountEl.style.display = 'none';
    if (saveBtn) saveBtn.disabled = true;
    if (undoBtn) undoBtn.disabled = true;
  }

  // Pagination
  var pageSize = serverPagState.pageSize;
  var totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  var page = Math.min(appState.inputPage, totalPages - 1);
  appState.inputPage = page;
  var start = page * pageSize;

  var infoEl = document.getElementById('input-record-info');
  if (totalRecords > 0) {
    if (infoEl) infoEl.textContent =
      'Showing ' + (start + 1) + '\u2013' + Math.min(start + pageSize, totalRecords) + ' of ' + formatNumber(totalRecords);
  } else {
    if (infoEl) infoEl.textContent = 'No records';
  }

  // Render table header
  var thead = document.getElementById('input-table-head');
  if (!thead) return; // Guard: Input Portal DOM not ready
  var checkboxHeader = '<th class="col-checkbox"><input type="checkbox" id="page-select-all" onchange="pageToggleAll(this.checked)"></th>';
  var auditHeader = '<th class="col-audit"></th>';
  thead.innerHTML = '<tr>' + checkboxHeader + TABLE_COLUMNS.map(function(col) {
    var isEditable = col.editable;
    var widthClass = getColumnWidthClass(col.key);
    return '<th class="' + (isEditable ? 'th-editable' : '') + ' ' + widthClass + '">' + col.label + (isEditable ? ' <span class="edit-indicator">&#9998;</span>' : '') + '</th>';
  }).join('') + auditHeader + '</tr>';

  // Render table body — use server-side rows
  var tbody = document.getElementById('input-table-body');
  if (!tbody) return;
  if (pageItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="' + (TABLE_COLUMNS.length + 2) + '" style="text-align:center;padding:40px;color:var(--fg-muted);">No records found. Adjust the filters above to load data.</td></tr>';
  } else {
    tbody.innerHTML = pageItems.map(function(record, pageIdx) {
      var originalIndex = -1;
      for (var i = 0; i < appState.records.length; i++) {
        if (appState.records[i]._id === record._id) { originalIndex = i; break; }
      }
      if (originalIndex === -1) {
        originalIndex = appState.records.length;
        appState.records.push(record);
      }
      return renderTableRow({ record: record, originalIndex: originalIndex });
    }).join('');
  }

  // Server-side pagination controls
  renderServerPagination(page, totalPages);
  updateBulkToolbar();
}

function renderServerPagination(currentPage, totalPages) {
  var container = document.getElementById('input-pagination');
  if (!container) return;
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  var html = '<div class="pagination">';
  html += '<button class="pagination-btn" ' + (currentPage === 0 ? 'disabled' : '') + ' onclick="serverPageChange(' + (currentPage - 1) + ')">&laquo; Prev</button>';

  var maxButtons = 7;
  var startPage = Math.max(0, currentPage - Math.floor(maxButtons / 2));
  var endPage = Math.min(totalPages - 1, startPage + maxButtons - 1);
  if (endPage - startPage < maxButtons - 1) startPage = Math.max(0, endPage - maxButtons + 1);

  if (startPage > 0) {
    html += '<button class="pagination-btn" onclick="serverPageChange(0)">1</button>';
    if (startPage > 1) html += '<span class="pagination-ellipsis">&hellip;</span>';
  }
  for (var i = startPage; i <= endPage; i++) {
    html += '<button class="pagination-btn ' + (i === currentPage ? 'active' : '') + '" onclick="serverPageChange(' + i + ')">' + (i + 1) + '</button>';
  }
  if (endPage < totalPages - 1) {
    if (endPage < totalPages - 2) html += '<span class="pagination-ellipsis">&hellip;</span>';
    html += '<button class="pagination-btn" onclick="serverPageChange(' + (totalPages - 1) + ')">' + totalPages + '</button>';
  }

  html += '<button class="pagination-btn" ' + (currentPage >= totalPages - 1 ? 'disabled' : '') + ' onclick="serverPageChange(' + (currentPage + 1) + ')">Next &raquo;</button>';
  html += '</div>';
  container.innerHTML = html;
}

/**
 * Apply filters and sorts to appState.records.
 * Returns array of { record, originalIndex }.
 */
function getFilteredInputRecords() {
  var result = [];
  var records = appState.records;

  var dateFilter = omnibarState.filters['date_range'];
  var blanksFilter = omnibarState.filters['blanks'];

  // Collect multi filters
  var multiFilters = [];
  var keys = Object.keys(omnibarState.filters);
  for (var ki = 0; ki < keys.length; ki++) {
    var f = omnibarState.filters[keys[ki]];
    if (f.type === 'multi') multiFilters.push(f);
  }

  for (var i = 0; i < records.length; i++) {
    var r = records[i];

    // Date range filter
    if (dateFilter) {
      if (r.date && r.date < dateFilter.startDate) continue;
      if (r.date && r.date > dateFilter.endDate) continue;
    }

    // Blanks filter
    if (blanksFilter && (r.tag || '').trim() !== '') continue;

    // Multi-select filters
    var skip = false;
    for (var mfi = 0; mfi < multiFilters.length; mfi++) {
      var mf = multiFilters[mfi];
      var val = r[mf.recordKey] || '';
      if (mf.values.length > 0 && !mf.values.includes(val)) { skip = true; break; }
    }
    if (skip) continue;

    result.push({ record: r, originalIndex: i });
  }

  // Apply sort
  if (omnibarState.sort) {
    var s = omnibarState.sort;
    result.sort(function(a, b) {
      var aVal = a.record[s.recordKey] || '';
      var bVal = b.record[s.recordKey] || '';
      var cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
      return s.direction === 'asc' ? cmp : -cmp;
    });
  }

  return result;
}

// ============================================================
// 3. VIRTUALIZED TABLE RENDERER
// ============================================================

const VTABLE_ROW_HEIGHT = 38; // px per row
const VTABLE_BUFFER = 10;     // extra rows above/below viewport

function initBulkTagDropdown() {
  var sel = document.getElementById('bulk-tag-select');
  if (!sel) return;
  var cu = typeof currentUser !== 'undefined' ? currentUser : null;
  var canSeePL = cu && (cu.ohr_id === '740045023' || cu.actual_role === 'Manager');
  var tagOpts = TAG_OPTIONS.filter(function(t) { return t !== 'PL' || canSeePL; });
  // Keep the first two static options (Select Tag, blank), remove old dynamic ones
  while (sel.options.length > 2) sel.remove(2);
  tagOpts.forEach(function(t) {
    var opt = document.createElement('option');
    opt.value = t; opt.textContent = t;
    sel.appendChild(opt);
  });
}

function renderInputTable() {
  initBulkTagDropdown();
  var allFiltered = getFilteredInputRecords();
  var totalRecords = allFiltered.length;

  // Store filtered data for virtualization
  appState._filteredData = allFiltered;

  // Update record count
  var rcEl = document.getElementById('input-record-count');
  if (rcEl) rcEl.textContent = 'Filtered Records: ' + formatNumber(totalRecords);
  var fcEl = document.getElementById('input-filter-count');
  if (fcEl) fcEl.textContent = 'Filtered Records: ' + formatNumber(totalRecords);

  // Update edit count
  var editCount = Object.keys(appState.pendingEdits).length;
  var editCountEl = document.getElementById('input-edit-count');
  var saveBtn = document.getElementById('save-btn');
  var undoBtn = document.getElementById('undo-btn');
  if (editCount > 0) {
    if (editCountEl) { editCountEl.textContent = editCount + ' record(s) edited'; editCountEl.style.display = 'inline'; }
    if (saveBtn) saveBtn.disabled = false;
    if (undoBtn) undoBtn.disabled = false;
  } else {
    if (editCountEl) editCountEl.style.display = 'none';
    if (saveBtn) saveBtn.disabled = true;
    if (undoBtn) undoBtn.disabled = true;
  }

  // Pagination
  var pageSize = appState.inputPageSize;
  var totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  var page = Math.min(appState.inputPage, totalPages - 1);
  appState.inputPage = page;
  var start = page * pageSize;
  var pageItems = allFiltered.slice(start, start + pageSize);

  var infoEl2 = document.getElementById('input-record-info');
  if (totalRecords > 0) {
    if (infoEl2) infoEl2.textContent =
      'Showing ' + (start + 1) + '\u2013' + Math.min(start + pageSize, totalRecords) + ' of ' + formatNumber(totalRecords);
  } else {
    if (infoEl2) infoEl2.textContent = 'No records';
  }

  // Render table header
  var thead = document.getElementById('input-table-head');
  if (!thead) return; // Guard: Input Portal DOM not ready
  var checkboxHeader = '<th class="col-checkbox"><input type="checkbox" id="page-select-all" onchange="pageToggleAll(this.checked)"></th>';
  var auditHeader = '<th class="col-audit"></th>';
  thead.innerHTML = '<tr>' + checkboxHeader + TABLE_COLUMNS.map(function(col) {
    var isEditable = col.editable;
    var widthClass = getColumnWidthClass(col.key);
    return '<th class="' + (isEditable ? 'th-editable' : '') + ' ' + widthClass + '">' + col.label + (isEditable ? ' <span class="edit-indicator">&#9998;</span>' : '') + '</th>';
  }).join('') + auditHeader + '</tr>';

  // Render table body
  var tbody = document.getElementById('input-table-body');
  if (!tbody) return;
  if (pageItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="' + (TABLE_COLUMNS.length + 2) + '" style="text-align:center;padding:40px;color:var(--fg-muted);">No records found. Adjust the filters above to load data.</td></tr>';
  } else {
    tbody.innerHTML = pageItems.map(function(item) { return renderTableRow(item); }).join('');
  }

  renderInputPagination(page, totalPages);
  updateBulkToolbar();
}

function renderTableRow(item) {
  var record = item.record;
  var globalIdx = item.originalIndex;
  var isEdited = appState.pendingEdits[globalIdx] !== undefined;
  var locked = isRowLocked(record);
  var isSelected = bulkState.selected.has(globalIdx);
  var rowClass = (isEdited ? 'row-edited ' : '') + (locked ? 'row-locked ' : '') + (isSelected ? 'row-selected ' : '');

  // Checkbox cell
  var lockTitle = 'Locked (after 11 AM PHT cutoff)';
  var checkboxCell = locked
    ? '<td class="col-checkbox cell-readonly"><span class="lock-icon" title="' + lockTitle + '">&#128274;</span></td>'
    : '<td class="col-checkbox"><input type="checkbox" class="row-checkbox" data-idx="' + globalIdx + '" ' + (isSelected ? 'checked' : '') + ' onchange="bulkToggleRow(' + globalIdx + ', this.checked)"></td>';

  // Audit icon cell
  var auditCell = '<td class="col-audit"><button class="audit-icon-btn" onclick="openAuditModal(\'' + record._id + '\')" title="View audit trail"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></button></td>';

  var cells = TABLE_COLUMNS.map(function(col) {
    var val = record[col.key] || '';
    var widthClass = getColumnWidthClass(col.key);

    if (!col.editable || locked) {
      if (col.key === 'date') {
        return '<td class="cell-readonly col-date ' + widthClass + '">' + formatDateDisplay(val) + '</td>';
      }
      if (locked && col.editable) {
        return '<td class="cell-readonly cell-locked ' + widthClass + '">' + escapeHtml(val) + '</td>';
      }
      return '<td class="cell-readonly ' + widthClass + '">' + escapeHtml(val) + '</td>';
    }

    if (col.key === 'tag') {
      // PL restricted to Managers and OHR 740045023 only
      var cu = typeof currentUser !== 'undefined' ? currentUser : null;
      var canSeePL = cu && (cu.ohr_id === '740045023' || cu.actual_role === 'Manager');
      var tagOpts = TAG_OPTIONS.filter(function(t) { return t !== 'PL' || canSeePL; });
      return '<td class="cell-editable ' + widthClass + '"><select class="cell-select" data-idx="' + globalIdx + '" data-key="tag" onchange="handleCellEdit(this)">' 
        + '<option value="" ' + (!val ? 'selected' : '') + '>\u2014</option>'
        + tagOpts.map(function(t) { return '<option value="' + t + '" ' + (val === t ? 'selected' : '') + '>' + t + '</option>'; }).join('')
        + '</select></td>';
    }
    if (col.key === 'uplReason') {
      var canEdit = record.tag === 'UPL' || record.tag === 'LATE';
      if (!canEdit) return '<td class="cell-readonly cell-na ' + widthClass + '">&mdash;</td>';
      return '<td class="cell-editable ' + widthClass + '"><select class="cell-select" data-idx="' + globalIdx + '" data-key="uplReason" onchange="handleCellEdit(this)">'
        + '<option value="">&mdash;</option>'
        + UPL_REASONS.map(function(r) { return '<option value="' + r + '" ' + (val === r ? 'selected' : '') + '>' + r + '</option>'; }).join('')
        + '</select></td>';
    }
    if (col.key === 'ot') {
      // OT mechanism lock: only S-ABF & CS-ABF Agents have OT locked (managed via OT Dashboard)
      // But only for dates AFTER 2026-04-10 — before that, OT is freely editable
      var OT_MECH_CUTOFF = '2026-04-10';
      var OT_MECH_PGS = ['S-ABF', 'CS-ABF'];
      var isOtMechAgent = (record.role === 'Agent') && OT_MECH_PGS.indexOf(record.actualPlanningGroup) !== -1;
      var isAfterCutoff = record.date && record.date > OT_MECH_CUTOFF;
      if (isOtMechAgent && isAfterCutoff) {
        return '<td class="cell-readonly cell-locked ' + widthClass + '">' + escapeHtml(val) + '</td>';
      }
      return '<td class="cell-editable ' + widthClass + '"><input type="number" step="0.5" min="0" class="cell-input cell-input-ot" value="' + escapeAttr(val) + '" data-idx="' + globalIdx + '" data-key="ot" onchange="handleCellEdit(this)" placeholder="\u2014"></td>';
    }
    if (col.key === 'remarks') {
      return '<td class="cell-editable ' + widthClass + '"><textarea class="cell-input cell-textarea-remarks" data-idx="' + globalIdx + '" data-key="remarks" onchange="handleCellEdit(this)" placeholder="\u2014">' + escapeHtml(val) + '</textarea></td>';
    }

    return '<td class="cell-readonly ' + widthClass + '">' + escapeHtml(val) + '</td>';
  }).join('');

  return '<tr class="' + rowClass + '">' + checkboxCell + cells + auditCell + '</tr>';
}

function pageToggleAll(checked) {
  // Select/deselect ALL tickable (non-locked) rows in the entire filtered dataset, not just current page
  var allFiltered = appState._filteredData || [];
  if (checked) {
    for (var fi = 0; fi < allFiltered.length; fi++) {
      if (!isRowLocked(allFiltered[fi].record)) {
        bulkState.selected.add(allFiltered[fi].originalIndex);
      }
    }
  } else {
    bulkState.selected.clear();
  }
  window.renderInputTable();
}

// ============================================================
// 4. BULK SELECTION & TAGGING
// ============================================================

const bulkState = {
  selected: new Set(),
};

function bulkToggleRow(idx, checked) {
  if (checked) bulkState.selected.add(idx);
  else bulkState.selected.delete(idx);
  updateBulkToolbar();
}

// bulkToggleAll removed — header checkbox (pageToggleAll) now handles all-select

function bulkDeselectAll() {
  bulkState.selected.clear();
  // Uncheck header checkbox (may not exist in compact mode)
  var pageSelectAll = document.getElementById('page-select-all');
  if (pageSelectAll) pageSelectAll.checked = false;
  updateBulkToolbar();
}

function updateBulkToolbar() {
  var toolbar = document.getElementById('bulk-toolbar');
  var countEl = document.getElementById('bulk-count');
  var count = bulkState.selected.size;

  if (toolbar) {
    if (count > 0) {
      toolbar.style.display = 'flex';
      if (countEl) countEl.textContent = count + ' selected';
    } else {
      toolbar.style.display = 'none';
    }
  }
  // Also update floating command bar if present
  if (typeof updateFloatingCommandBar === 'function') updateFloatingCommandBar();
}

function getCurrentPageItems() {
  var allFiltered = appState._filteredData || [];
  var pageSize = appState.inputPageSize;
  var page = appState.inputPage;
  var start = page * pageSize;
  return allFiltered.slice(start, start + pageSize);
}

async function bulkApplyTag() {
  var tagSelect = document.getElementById('bulk-tag-select');
  var tag = tagSelect.value;
  if (tag === '_select') { showToast('Please select a tag first', 'info'); return; }
  // tag === '' means blank/clear

  var selectedIds = [...bulkState.selected];
  if (selectedIds.length === 0) { showToast('No rows selected', 'info'); return; }
  if (selectedIds.length > 50) { showToast('Bulk editing is limited to 50 rows at a time', 'error'); return; }

  var recordIds = [];
  for (var si = 0; si < selectedIds.length; si++) {
    var record = appState.records[selectedIds[si]];
    if (record && record._id && !isRowLocked(record)) {
      recordIds.push(record._id);
    }
  }

  if (recordIds.length === 0) { showToast('No editable rows in selection', 'info'); return; }

  // Set loading state on button
  var applyBtn = document.getElementById('bulk-apply-tag-btn');
  if (applyBtn) {
    applyBtn.disabled = true;
    applyBtn.innerHTML = '<span class="btn-spinner"></span> Applying...';
  }

  try {
    var user = typeof currentUser !== 'undefined' ? currentUser : null;
    var resp = await fetch(IO_API_BASE + '/attendance/bulk-tag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: recordIds,
        tag: tag,
        actor_ohr: user ? user.ohr_id || '' : '',
        actor_name: user ? user.full_name || '' : '',
      }),
    });

    var result = await resp.json();
    if (result.ok) {
      for (var si2 = 0; si2 < selectedIds.length; si2++) {
        if (appState.records[selectedIds[si2]] && !isRowLocked(appState.records[selectedIds[si2]])) {
          appState.records[selectedIds[si2]].tag = tag;
          if (tag !== 'UPL' && tag !== 'LATE') {
            appState.records[selectedIds[si2]].uplReason = '';
          }
        }
      }
      appState.originalRecords = JSON.parse(JSON.stringify(appState.records));

      // Sync serverPagState.rows with bulk-tagged values
      if (typeof serverPagState !== 'undefined' && serverPagState.enabled && serverPagState.rows) {
        for (var bri = 0; bri < recordIds.length; bri++) {
          var bRow = serverPagState.rows.find(function(r) { return r._id === recordIds[bri]; });
          if (bRow) {
            bRow.tag = tag;
            if (tag !== 'UPL' && tag !== 'LATE') {
              bRow.uplReason = '';
              bRow.upl_reason = '';
            }
          }
        }
      }

      // Invalidate audit cache for all bulk-tagged records
      if (typeof invalidateAuditCache === 'function') {
        for (var ri = 0; ri < recordIds.length; ri++) {
          invalidateAuditCache(recordIds[ri]);
        }
      }

      var tagLabel = tag === '' ? 'blank' : '"' + tag + '"';
      var msg = 'Bulk tagged ' + result.updated + ' record(s) as ' + tagLabel
        + (result.locked > 0 ? ' (' + result.locked + ' locked rows skipped)' : '');
      showToast(msg, 'success');
      bulkDeselectAll();

      // Re-fetch current page from server for data consistency
      if (typeof serverPagState !== 'undefined' && serverPagState.enabled && typeof serverPageChange === 'function') {
        try {
          await serverPageChange(appState.inputPage);
        } catch (refreshErr) {
          console.warn('[BulkTag] Server re-fetch failed, using local state:', refreshErr);
          window.renderInputTable();
        }
      } else {
        window.renderInputTable();
      }
    } else {
      showToast('Bulk tag failed: ' + (result.error || 'Unknown error'), 'error');
    }
  } catch (err) {
    showToast('Bulk tag failed: ' + err.message, 'error');
  } finally {
    // Reset button state
    if (applyBtn) {
      applyBtn.disabled = false;
      applyBtn.innerHTML = 'Apply Tag';
    }
  }
}

// ============================================================
// 5. AUDIT TIMELINE
// ============================================================

async function openAuditModal(recordId) {
  var modal = document.getElementById('audit-modal');
  var body = document.getElementById('audit-modal-body');
  modal.style.display = 'flex';
  body.innerHTML = '<div class="audit-loading"><div class="spinner"></div><p>Loading audit trail...</p></div>';

  try {
    var resp = await fetch(IO_API_BASE + '/audit-log?record_id=' + encodeURIComponent(recordId) + '&record_type=attendance&limit=50');
    var logs = await resp.json();

    if (!Array.isArray(logs) || logs.length === 0) {
      body.innerHTML = '<div class="audit-empty"><p>No changes recorded for this row.</p></div>';
      return;
    }

    var html = '<div class="audit-timeline">';
    for (var li = 0; li < logs.length; li++) {
      var entry = logs[li];
      var ts = entry.timestamp ? new Date(entry.timestamp) : null;
      var timeStr = ts ? ts.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Unknown';
      var actionLabel = entry.action === 'bulk_tag' ? 'Bulk Tag' : entry.action === 'edit' ? 'Edit' : entry.action || 'Change';
      var fieldLabel = (entry.field_name || '').replace(/_/g, ' ');

      html += '<div class="audit-entry">'
        + '<div class="audit-entry-header">'
        + '<span class="audit-action audit-action-' + (entry.action || 'edit') + '">' + escapeHtml(actionLabel) + '</span>'
        + '<span class="audit-time">' + escapeHtml(timeStr) + '</span>'
        + '</div>'
        + '<div class="audit-entry-body">'
        + '<span class="audit-field">' + escapeHtml(fieldLabel) + '</span>'
        + '<span class="audit-old">' + escapeHtml(entry.old_value || '(empty)') + '</span>'
        + '<span class="audit-arrow">&rarr;</span>'
        + '<span class="audit-new">' + escapeHtml(entry.new_value || '(empty)') + '</span>'
        + '</div>'
        + '<div class="audit-entry-footer">'
        + 'by ' + escapeHtml(entry.actor_name || entry.actor_ohr || 'System')
        + '</div>'
        + '</div>';
    }
    html += '</div>';
    body.innerHTML = html;
  } catch (err) {
    body.innerHTML = '<div class="audit-empty"><p>Failed to load audit trail: ' + escapeHtml(err.message) + '</p></div>';
  }
}

function closeAuditModal() {
  var auditModalEl = document.getElementById('audit-modal');
  if (auditModalEl) auditModalEl.style.display = 'none';
}

// ============================================================
// 6. BACKWARD COMPATIBILITY — Bridge old functions
// ============================================================

// Override the old applyInputFilters to use filter bar
async function applyInputFilters() {
  if (!omnibarState.filters['date_range']) {
    var today = typeof getTodayStr === 'function' ? getTodayStr() : new Date().toISOString().slice(0, 10);
    omnibarState.filters['date_range'] = { key: 'date_range', label: 'Date', type: 'date_range', startDate: today, endDate: today };
    inputRenderFilterBar();
  }
  await omnibarApplyView();
}

function clearInputFilters() {
  inputClearAllFilters();
}

// Override populateInputFilterDropdowns — no longer needed since filter bar builds from records dynamically
function populateInputFilterDropdowns() {}

// Override initMultiSelects — no longer needed
function initMultiSelects() {
  appState.multiSelects = {};
}

// Set default filter bar on load
function setDefaultOmnibarFilters() {
  var today = typeof getTodayStr === 'function' ? getTodayStr() : new Date().toISOString().slice(0, 10);
  omnibarState.filters = {
    date_range: { key: 'date_range', label: 'Date', type: 'date_range', startDate: today, endDate: today }
  };
  omnibarState.sort = { key: 'date', direction: 'desc', recordKey: 'date' };
  omnibarState.openPill = null;
  // All multi-select filters default to "All" (no entry in filters = all selected)
  inputRenderFilterBar();
}

// Hook into the load flow
var _origSetDefaultFilters = typeof setDefaultFilters === 'function' ? setDefaultFilters : null;
function setDefaultFilters() {
  // Set date inputs for dashboard (keep backward compat)
  var today = typeof getTodayStr === 'function' ? getTodayStr() : new Date().toISOString().slice(0, 10);
  var dashStart = document.getElementById('dash-start-date');
  var dashEnd = document.getElementById('dash-end-date');
  if (dashStart) dashStart.value = today;
  if (dashEnd) dashEnd.value = today;

  // Set filter bar defaults
  setDefaultOmnibarFilters();
}

// ============================================================
// 7. INITIALIZATION
// ============================================================

// Auto-initialize filter bar when Input Portal loads
(function() {
  // Override the old toggleBlanksFilter
  window.toggleBlanksFilter = function() {
    inputToggleBlanks();
  };

  // Backward compat: expose old function names
  window.omnibarApplyView = omnibarApplyView;
  window.omnibarClearAll = inputClearAllFilters;
  window.omnibarState = omnibarState;
  window.renderOmnibarChips = inputRenderFilterBar;
  window.omnibarOpenMenu = function() {};
  window.omnibarCloseMenu = function() {};
  window.inputRenderFilterBar = inputRenderFilterBar;
})();
