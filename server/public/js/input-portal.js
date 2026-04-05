/**
 * Input Portal — Omnibar View Builder, Virtualized Table, Bulk Editing, Audit Timeline
 *
 * Dependencies: data.js (appState, TABLE_COLUMNS, TAG_OPTIONS, etc.), app.js (escapeHtml, showToast, etc.)
 */

// ============================================================
// 1. OMNIBAR — Unified View Builder
// ============================================================

const OMNIBAR_FILTER_FIELDS = [
  { key: 'date_range', label: 'Date Range', type: 'date_range' },
  { key: 'tag', label: 'Tag', type: 'multi', recordKey: 'tag' },
  { key: 'agent', label: 'Agent', type: 'multi', recordKey: 'agent', searchable: true },
  { key: 'flm', label: 'FLM', type: 'multi', recordKey: 'flm', searchable: true },
  { key: 'actualPlanningGroup', label: 'Planning Group', type: 'multi', recordKey: 'actualPlanningGroup' },
  { key: 'role', label: 'Role', type: 'multi', recordKey: 'role' },
  { key: 'shiftTime', label: 'Shift Time', type: 'multi', recordKey: 'shiftTime' },
  { key: 'status', label: 'Status', type: 'multi', recordKey: 'status' },
  { key: 'billingCode', label: 'Billing Code', type: 'multi', recordKey: 'billingCode' },
  { key: 'blanks', label: 'Blank Tags Only', type: 'toggle' },
];

const OMNIBAR_SORT_FIELDS = [
  { key: 'date', label: 'Date', recordKey: 'date' },
  { key: 'agent', label: 'Agent', recordKey: 'agent' },
  { key: 'flm', label: 'FLM', recordKey: 'flm' },
  { key: 'tag', label: 'Tag', recordKey: 'tag' },
  { key: 'actualPlanningGroup', label: 'Planning Group', recordKey: 'actualPlanningGroup' },
  { key: 'shiftTime', label: 'Shift Time', recordKey: 'shiftTime' },
  { key: 'billingCode', label: 'Billing Code', recordKey: 'billingCode' },
];

// Active view state
const omnibarState = {
  filters: [],   // { key, label, type, values, startDate, endDate }
  sorts: [],     // { key, label, direction: 'asc'|'desc' }
  menuMode: null, // 'filter' | 'sort' | null
  menuStep: null, // null | 'pick_field' | 'pick_values'
  menuField: null,
};

function omnibarOpenMenu(mode) {
  omnibarState.menuMode = mode;
  omnibarState.menuStep = 'pick_field';
  omnibarState.menuField = null;
  renderOmnibarMenu();
  _attachOmnibarOutsideClick();
}

function omnibarCloseMenu() {
  omnibarState.menuMode = null;
  omnibarState.menuStep = null;
  omnibarState.menuField = null;
  const menu = document.getElementById('omnibar-menu');
  if (menu) menu.style.display = 'none';
  _detachOmnibarOutsideClick();
}

function renderOmnibarMenu() {
  const menu = document.getElementById('omnibar-menu');
  if (!menu) return;
  menu.style.display = 'block';

  if (omnibarState.menuMode === 'filter' && omnibarState.menuStep === 'pick_field') {
    // Show available filter fields (exclude already-active ones)
    const activeKeys = new Set(omnibarState.filters.map(f => f.key));
    const available = OMNIBAR_FILTER_FIELDS.filter(f => !activeKeys.has(f.key));

    if (available.length === 0) {
      menu.innerHTML = '<div class="omnibar-menu-empty">All filters are active</div>';
      return;
    }

    menu.innerHTML = '<div class="omnibar-menu-title">Select a filter</div>' +
      available.map(f =>
        `<button class="omnibar-menu-item" onclick="event.stopPropagation(); omnibarSelectFilterField('${f.key}')">${escapeHtml(f.label)}</button>`
      ).join('');

  } else if (omnibarState.menuMode === 'filter' && omnibarState.menuStep === 'pick_values') {
    renderOmnibarFilterValuePicker();

  } else if (omnibarState.menuMode === 'sort' && omnibarState.menuStep === 'pick_field') {
    const activeKeys = new Set(omnibarState.sorts.map(s => s.key));
    const available = OMNIBAR_SORT_FIELDS.filter(f => !activeKeys.has(f.key));

    if (available.length === 0) {
      menu.innerHTML = '<div class="omnibar-menu-empty">All sort fields are active</div>';
      return;
    }

    menu.innerHTML = '<div class="omnibar-menu-title">Sort by</div>' +
      available.map(f =>
        `<button class="omnibar-menu-item" onclick="event.stopPropagation(); omnibarAddSort('${f.key}', 'asc')">${escapeHtml(f.label)} &#9650; Ascending</button>` +
        `<button class="omnibar-menu-item" onclick="event.stopPropagation(); omnibarAddSort('${f.key}', 'desc')">${escapeHtml(f.label)} &#9660; Descending</button>`
      ).join('');
  }
}

function omnibarSelectFilterField(key) {
  const field = OMNIBAR_FILTER_FIELDS.find(f => f.key === key);
  if (!field) return;

  // Toggle-type filter: add immediately
  if (field.type === 'toggle') {
    omnibarState.filters.push({ key: field.key, label: field.label, type: 'toggle', values: [true] });
    omnibarCloseMenu();
    renderOmnibarChips();
    return;
  }

  // Date range: show date pickers
  if (field.type === 'date_range') {
    omnibarState.menuField = field;
    omnibarState.menuStep = 'pick_values';
    renderOmnibarMenu();
    return;
  }

  // Multi-select: show value picker
  omnibarState.menuField = field;
  omnibarState.menuStep = 'pick_values';
  renderOmnibarMenu();
}

function renderOmnibarFilterValuePicker() {
  const menu = document.getElementById('omnibar-menu');
  const field = omnibarState.menuField;
  if (!field || !menu) return;

  if (field.type === 'date_range') {
    const today = getTodayStr();
    menu.innerHTML = `
      <div class="omnibar-menu-title">Date Range</div>
      <div class="omnibar-date-picker" style="display:flex;align-items:center;gap:8px;flex-wrap:nowrap;padding:8px 12px;">
        <label class="filter-label" style="margin:0;white-space:nowrap;font-size:12px;">Start:</label>
        <input type="date" class="form-input form-input-sm" id="omni-date-start" value="${today}" style="min-width:140px;flex:1;">
        <label class="filter-label" style="margin:0;white-space:nowrap;font-size:12px;">End:</label>
        <input type="date" class="form-input form-input-sm" id="omni-date-end" value="${today}" style="min-width:140px;flex:1;">
        <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); omnibarAddDateFilter()" style="white-space:nowrap;">Add</button>
      </div>`;
    return;
  }

  // Multi-select: gather unique values
  // For name-based fields, use employeeLookup when records are empty (server-side pagination)
  let values;
  const empFieldMap = {
    agent: 'full_name', flm: 'supervisor_name',
    actualPlanningGroup: 'planning_group', role: 'actual_role',
    shiftTime: 'shift_time', status: 'srt_status',
  };
  if (appState.records.length === 0 && empFieldMap[field.recordKey] && typeof employeeLookup === 'object') {
    const empField = empFieldMap[field.recordKey];
    values = [...new Set(Object.values(employeeLookup).map(e => (e[empField] || '').trim()).filter(Boolean))].sort();
  } else if (appState.records.length > 0) {
    values = [...new Set(appState.records.map(r => r[field.recordKey]).filter(Boolean))].sort();
  } else {
    values = [];
  }
  // For tag and billingCode, also try to get from current server page
  if (values.length === 0 && typeof serverPagState !== 'undefined' && serverPagState.rows && serverPagState.rows.length > 0) {
    values = [...new Set(serverPagState.rows.map(r => r[field.recordKey]).filter(Boolean))].sort();
  }
  // For tag field, always include TAG_OPTIONS as base
  if (field.recordKey === 'tag' && typeof TAG_OPTIONS !== 'undefined') {
    values = [...new Set([...TAG_OPTIONS, ...values])].sort();
  }
  const searchable = field.searchable || values.length > 15;

  let html = `<div class="omnibar-menu-title">${escapeHtml(field.label)}</div>`;
  if (searchable) {
    html += `<div class="omnibar-search-wrap"><input type="text" class="form-input form-input-sm omnibar-search" id="omni-value-search" placeholder="Search..." oninput="omnibarFilterValueList()"></div>`;
  }
  html += '<div class="omnibar-value-list" id="omni-value-list">';
  for (const v of values) {
    html += `<label class="omnibar-value-item"><input type="checkbox" value="${escapeAttr(v)}"><span>${escapeHtml(v)}</span></label>`;
  }
  html += '</div>';
  html += `<div class="omnibar-menu-footer"><button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); omnibarAddMultiFilter()">Add Filter</button></div>`;
  menu.innerHTML = html;

  if (searchable) {
    setTimeout(() => { const si = document.getElementById('omni-value-search'); if (si) si.focus(); }, 50);
  }
}

function omnibarFilterValueList() {
  const search = (document.getElementById('omni-value-search')?.value || '').toLowerCase();
  const items = document.querySelectorAll('#omni-value-list .omnibar-value-item');
  items.forEach(item => {
    const text = item.textContent.toLowerCase();
    item.style.display = text.includes(search) ? '' : 'none';
  });
}

function omnibarAddDateFilter() {
  const start = document.getElementById('omni-date-start')?.value || '';
  const end = document.getElementById('omni-date-end')?.value || '';
  if (!start || !end) { showToast('Please select both start and end dates', 'info'); return; }
  if (start > end) { showToast('Start date cannot be after end date', 'info'); return; }

  // Remove existing date_range filter
  omnibarState.filters = omnibarState.filters.filter(f => f.key !== 'date_range');
  omnibarState.filters.unshift({ key: 'date_range', label: 'Date Range', type: 'date_range', startDate: start, endDate: end });
  omnibarCloseMenu();
  renderOmnibarChips();
}

function omnibarAddMultiFilter() {
  const field = omnibarState.menuField;
  if (!field) return;
  const checked = [...document.querySelectorAll('#omni-value-list input[type="checkbox"]:checked')].map(cb => cb.value);
  if (checked.length === 0) { showToast('Select at least one value', 'info'); return; }

  // Remove existing filter for same key
  omnibarState.filters = omnibarState.filters.filter(f => f.key !== field.key);
  omnibarState.filters.push({ key: field.key, label: field.label, type: 'multi', values: checked, recordKey: field.recordKey });
  omnibarCloseMenu();
  renderOmnibarChips();
}

function omnibarAddSort(key, direction) {
  const field = OMNIBAR_SORT_FIELDS.find(f => f.key === key);
  if (!field) return;
  omnibarState.sorts = omnibarState.sorts.filter(s => s.key !== key);
  omnibarState.sorts.push({ key, label: field.label, direction, recordKey: field.recordKey });
  omnibarCloseMenu();
  renderOmnibarChips();
}

function omnibarRemoveFilter(key) {
  omnibarState.filters = omnibarState.filters.filter(f => f.key !== key);
  renderOmnibarChips();
}

function omnibarEditSort(key) {
  const sort = omnibarState.sorts.find(s => s.key === key);
  if (!sort) return;
  sort.direction = sort.direction === 'asc' ? 'desc' : 'asc';
  sort.label = sort.label.replace(/ [\u25B2\u25BC]$/, '') + (sort.direction === 'asc' ? ' \u25B2' : ' \u25BC');
  renderOmnibarChips();
}

function omnibarRemoveSort(key) {
  omnibarState.sorts = omnibarState.sorts.filter(s => s.key !== key);
  renderOmnibarChips();
}

function omnibarClearAll() {
  omnibarState.filters = [];
  omnibarState.sorts = [];
  omnibarCloseMenu();
  renderOmnibarChips();
  // Auto-apply on clear
  omnibarApplyView();
}

function omnibarEditFilter(key) {
  const field = OMNIBAR_FILTER_FIELDS.find(f => f.key === key);
  if (!field || field.type === 'toggle') return;
  omnibarState.menuMode = 'filter';
  omnibarState.menuStep = 'pick_values';
  omnibarState.menuField = field;
  omnibarState._editingFilterKey = key;
  renderOmnibarMenu();
  _attachOmnibarOutsideClick();

  // Pre-populate existing values after menu renders
  setTimeout(() => {
    const existing = omnibarState.filters.find(f => f.key === key);
    if (!existing) return;
    if (field.type === 'date_range') {
      const startEl = document.getElementById('omni-date-start');
      const endEl = document.getElementById('omni-date-end');
      if (startEl) startEl.value = existing.startDate || '';
      if (endEl) endEl.value = existing.endDate || '';
    } else if (field.type === 'multi') {
      const checkboxes = document.querySelectorAll('#omni-value-list input[type="checkbox"]');
      checkboxes.forEach(cb => {
        if (existing.values && existing.values.includes(cb.value)) cb.checked = true;
      });
    }
  }, 60);
}

function renderOmnibarChips() {
  const container = document.getElementById('omnibar-chips');
  if (!container) return;

  let html = '';

  for (const f of omnibarState.filters) {
    let chipLabel = '';
    if (f.type === 'date_range') {
      chipLabel = `${f.label}: ${formatDateDisplay(f.startDate)} \u2013 ${formatDateDisplay(f.endDate)}`;
    } else if (f.type === 'toggle') {
      chipLabel = f.label;
    } else {
      chipLabel = f.values.length <= 2 ? `${f.label}: ${f.values.join(', ')}` : `${f.label}: ${f.values.length} selected`;
    }
    const editClick = f.type !== 'toggle' ? `onclick="omnibarEditFilter('${f.key}')"` : '';
    const editClass = f.type !== 'toggle' ? 'chip-text-editable' : '';
    html += `<span class="omnibar-chip omnibar-chip-filter">
      <span class="chip-icon">&#9881;</span>
      <span class="chip-text ${editClass}" ${editClick} title="Click to edit">${escapeHtml(chipLabel)}</span>
      <button class="chip-remove" onclick="omnibarRemoveFilter('${f.key}')" title="Remove">&times;</button>
    </span>`;
  }

  for (const s of omnibarState.sorts) {
    const arrow = s.direction === 'asc' ? '\u25B2' : '\u25BC';
    html += `<span class="omnibar-chip omnibar-chip-sort">
      <span class="chip-icon">${arrow}</span>
      <span class="chip-text chip-text-editable" onclick="omnibarEditSort('${s.key}')" title="Click to toggle direction">${escapeHtml(s.label)}</span>
      <button class="chip-remove" onclick="omnibarRemoveSort('${s.key}')" title="Remove">&times;</button>
    </span>`;
  }

  container.innerHTML = html;
}

// Close omnibar menu on outside click — use mousedown to fire before onclick
let _omnibarOutsideListener = null;

function _attachOmnibarOutsideClick() {
  if (_omnibarOutsideListener) return;
  _omnibarOutsideListener = (e) => {
    const omnibar = document.getElementById('omnibar');
    const menu = document.getElementById('omnibar-menu');
    if (!omnibar || !menu) return;
    // If click is inside the omnibar (including the menu), do nothing
    if (omnibar.contains(e.target)) return;
    omnibarCloseMenu();
  };
  // Defer attachment so the current click event doesn't immediately close
  setTimeout(() => {
    document.addEventListener('mousedown', _omnibarOutsideListener);
  }, 10);
}

function _detachOmnibarOutsideClick() {
  if (_omnibarOutsideListener) {
    document.removeEventListener('mousedown', _omnibarOutsideListener);
    _omnibarOutsideListener = null;
  }
}

// ============================================================
// 2. VIEW APPLICATION — Filter + Sort + Data Loading
// ============================================================

// Server-side pagination state
const serverPagState = {
  enabled: false,
  total: 0,
  rows: [],      // normalized rows for current page
  pageSize: 50,
};

async function omnibarApplyView() {
  const dateFilter = omnibarState.filters.find(f => f.key === 'date_range');
  const startDate = dateFilter ? dateFilter.startDate : getTodayStr();
  const endDate = dateFilter ? dateFilter.endDate : getTodayStr();

  // Build server-side filter params from omnibar state
  const filters = {};
  for (const f of omnibarState.filters) {
    if (f.type === 'multi' && f.values && f.values.length > 0) {
      const keyMap = {
        tag: 'tag_in', agent: 'agent_in', flm: 'flm_in',
        actualPlanningGroup: 'planning_group_in', billingCode: 'billing_code_in',
        status: 'status_in', shiftTime: 'shift_time_in', role: 'role_in',
      };
      const paramKey = keyMap[f.key];
      if (paramKey) filters[paramKey] = f.values.join('|');
    }
    if (f.type === 'toggle' && f.key === 'blanks') {
      filters.blanks_only = true;
    }
  }

  // Build sort params
  let sortBy = null, sortDir = null;
  if (omnibarState.sorts.length > 0) {
    sortBy = omnibarState.sorts[0].recordKey;
    sortDir = omnibarState.sorts[0].direction;
  }

  // Use server-side pagination
  serverPagState.enabled = true;
  bulkDeselectAll();
  appState.inputPage = 0;

  try {
    showProgressBar('Loading Data...');
    const result = await fetchPaginatedAttendance({
      startDate, endDate,
      limit: serverPagState.pageSize,
      offset: 0,
      sortBy, sortDir,
      filters,
    });
    serverPagState.total = result.total;
    serverPagState.rows = result.rows;
    hideProgressBar();
    renderInputTableServerSide();
  } catch (err) {
    hideProgressBar();
    showToast('Failed to load data: ' + err.message, 'error');
  }
}

async function serverPageChange(newPage) {
  const dateFilter = omnibarState.filters.find(f => f.key === 'date_range');
  const startDate = dateFilter ? dateFilter.startDate : getTodayStr();
  const endDate = dateFilter ? dateFilter.endDate : getTodayStr();

  const filters = {};
  for (const f of omnibarState.filters) {
    if (f.type === 'multi' && f.values && f.values.length > 0) {
      const keyMap = {
        tag: 'tag_in', agent: 'agent_in', flm: 'flm_in',
        actualPlanningGroup: 'planning_group_in', billingCode: 'billing_code_in',
        status: 'status_in', shiftTime: 'shift_time_in', role: 'role_in',
      };
      const paramKey = keyMap[f.key];
      if (paramKey) filters[paramKey] = f.values.join('|');
    }
    if (f.type === 'toggle' && f.key === 'blanks') {
      filters.blanks_only = true;
    }
  }

  let sortBy = null, sortDir = null;
  if (omnibarState.sorts.length > 0) {
    sortBy = omnibarState.sorts[0].recordKey;
    sortDir = omnibarState.sorts[0].direction;
  }

  appState.inputPage = newPage;
  try {
    const result = await fetchPaginatedAttendance({
      startDate, endDate,
      limit: serverPagState.pageSize,
      offset: newPage * serverPagState.pageSize,
      sortBy, sortDir,
      filters,
    });
    serverPagState.rows = result.rows;
    serverPagState.total = result.total;
    renderInputTableServerSide();
  } catch (err) {
    showToast('Failed to load page: ' + err.message, 'error');
  }
}

function renderInputTableServerSide() {
  const totalRecords = serverPagState.total;
  const pageItems = serverPagState.rows;

  // Update record count
  document.getElementById('input-record-count').textContent = `Filtered Records: ${formatNumber(totalRecords)}`;

  // Update edit count
  const editCount = Object.keys(appState.pendingEdits).length;
  const editCountEl = document.getElementById('input-edit-count');
  if (editCount > 0) {
    editCountEl.textContent = `${editCount} record(s) edited`;
    editCountEl.style.display = 'inline';
    document.getElementById('save-btn').disabled = false;
    document.getElementById('undo-btn').disabled = false;
  } else {
    editCountEl.style.display = 'none';
    document.getElementById('save-btn').disabled = true;
    document.getElementById('undo-btn').disabled = true;
  }

  // Pagination
  const pageSize = serverPagState.pageSize;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const page = Math.min(appState.inputPage, totalPages - 1);
  appState.inputPage = page;
  const start = page * pageSize;

  if (totalRecords > 0) {
    document.getElementById('input-record-info').textContent =
      `Showing ${start + 1}\u2013${Math.min(start + pageSize, totalRecords)} of ${formatNumber(totalRecords)}`;
  } else {
    document.getElementById('input-record-info').textContent = 'No records';
  }

  // Render table header
  const thead = document.getElementById('input-table-head');
  const checkboxHeader = '<th class="col-checkbox"><input type="checkbox" id="page-select-all" onchange="pageToggleAll(this.checked)"></th>';
  const auditHeader = '<th class="col-audit"></th>';
  thead.innerHTML = '<tr>' + checkboxHeader + TABLE_COLUMNS.map(col => {
    const isEditable = col.editable;
    const widthClass = getColumnWidthClass(col.key);
    return `<th class="${isEditable ? 'th-editable' : ''} ${widthClass}">${col.label}${isEditable ? ' <span class="edit-indicator">&#9998;</span>' : ''}</th>`;
  }).join('') + auditHeader + '</tr>';

  // Render table body — use server-side rows
  const tbody = document.getElementById('input-table-body');
  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${TABLE_COLUMNS.length + 2}" style="text-align:center;padding:40px;color:var(--fg-muted);">No records found. Use the Omnibar to add filters and apply a view.</td></tr>`;
  } else {
    // For server-side rows, we need to find the originalIndex in appState.records
    // If the record is in appState.records, use that index; otherwise use -1
    tbody.innerHTML = pageItems.map((record, pageIdx) => {
      // Try to find this record in appState.records by _id
      let originalIndex = -1;
      for (let i = 0; i < appState.records.length; i++) {
        if (appState.records[i]._id === record._id) { originalIndex = i; break; }
      }
      // If not found in local state, add it temporarily
      if (originalIndex === -1) {
        originalIndex = appState.records.length;
        appState.records.push(record);
      }
      return renderTableRow({ record, originalIndex });
    }).join('');
  }

  // Server-side pagination controls
  renderServerPagination(page, totalPages);
  initBillingCodeEdit();
  updateBulkToolbar();
}

function renderServerPagination(currentPage, totalPages) {
  const container = document.getElementById('input-pagination');
  if (!container) return;
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  let html = '<div class="pagination">';
  html += `<button class="pagination-btn" ${currentPage === 0 ? 'disabled' : ''} onclick="serverPageChange(${currentPage - 1})">&laquo; Prev</button>`;

  const maxButtons = 7;
  let startPage = Math.max(0, currentPage - Math.floor(maxButtons / 2));
  let endPage = Math.min(totalPages - 1, startPage + maxButtons - 1);
  if (endPage - startPage < maxButtons - 1) startPage = Math.max(0, endPage - maxButtons + 1);

  if (startPage > 0) {
    html += `<button class="pagination-btn" onclick="serverPageChange(0)">1</button>`;
    if (startPage > 1) html += '<span class="pagination-ellipsis">&hellip;</span>';
  }
  for (let i = startPage; i <= endPage; i++) {
    html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="serverPageChange(${i})">${i + 1}</button>`;
  }
  if (endPage < totalPages - 1) {
    if (endPage < totalPages - 2) html += '<span class="pagination-ellipsis">&hellip;</span>';
    html += `<button class="pagination-btn" onclick="serverPageChange(${totalPages - 1})">${totalPages}</button>`;
  }

  html += `<button class="pagination-btn" ${currentPage >= totalPages - 1 ? 'disabled' : ''} onclick="serverPageChange(${currentPage + 1})">Next &raquo;</button>`;
  html += '</div>';
  container.innerHTML = html;
}

/**
 * Apply omnibar filters and sorts to appState.records.
 * Returns array of { record, originalIndex }.
 */
function getFilteredInputRecords() {
  let result = [];
  const records = appState.records;

  // Build filter predicates from omnibar state
  const dateFilter = omnibarState.filters.find(f => f.key === 'date_range');
  const blanksFilter = omnibarState.filters.find(f => f.key === 'blanks');
  const multiFilters = omnibarState.filters.filter(f => f.type === 'multi');

  for (let i = 0; i < records.length; i++) {
    const r = records[i];

    // Date range filter
    if (dateFilter) {
      if (r.date && r.date < dateFilter.startDate) continue;
      if (r.date && r.date > dateFilter.endDate) continue;
    }

    // Blanks filter
    if (blanksFilter && (r.tag || '').trim() !== '') continue;

    // Multi-select filters
    let skip = false;
    for (const mf of multiFilters) {
      const val = r[mf.recordKey] || '';
      if (mf.values.length > 0 && !mf.values.includes(val)) { skip = true; break; }
    }
    if (skip) continue;

    result.push({ record: r, originalIndex: i });
  }

  // Apply sorts
  if (omnibarState.sorts.length > 0) {
    result.sort((a, b) => {
      for (const s of omnibarState.sorts) {
        const aVal = a.record[s.recordKey] || '';
        const bVal = b.record[s.recordKey] || '';
        const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
        if (cmp !== 0) return s.direction === 'asc' ? cmp : -cmp;
      }
      return 0;
    });
  }

  return result;
}

// ============================================================
// 3. VIRTUALIZED TABLE RENDERER
// ============================================================

const VTABLE_ROW_HEIGHT = 38; // px per row
const VTABLE_BUFFER = 10;     // extra rows above/below viewport

function renderInputTable() {
  const allFiltered = getFilteredInputRecords();
  const totalRecords = allFiltered.length;

  // Store filtered data for virtualization
  appState._filteredData = allFiltered;

  // Update record count
  document.getElementById('input-record-count').textContent = `Filtered Records: ${formatNumber(totalRecords)}`;

  // Update edit count
  const editCount = Object.keys(appState.pendingEdits).length;
  const editCountEl = document.getElementById('input-edit-count');
  if (editCount > 0) {
    editCountEl.textContent = `${editCount} record(s) edited`;
    editCountEl.style.display = 'inline';
    document.getElementById('save-btn').disabled = false;
    document.getElementById('undo-btn').disabled = false;
  } else {
    editCountEl.style.display = 'none';
    document.getElementById('save-btn').disabled = true;
    document.getElementById('undo-btn').disabled = true;
  }

  // Pagination
  const pageSize = appState.inputPageSize;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const page = Math.min(appState.inputPage, totalPages - 1);
  appState.inputPage = page;
  const start = page * pageSize;
  const pageItems = allFiltered.slice(start, start + pageSize);

  if (totalRecords > 0) {
    document.getElementById('input-record-info').textContent =
      `Showing ${start + 1}\u2013${Math.min(start + pageSize, totalRecords)} of ${formatNumber(totalRecords)}`;
  } else {
    document.getElementById('input-record-info').textContent = 'No records';
  }

  // Render table header
  const thead = document.getElementById('input-table-head');
  const checkboxHeader = '<th class="col-checkbox"><input type="checkbox" id="page-select-all" onchange="pageToggleAll(this.checked)"></th>';
  const auditHeader = '<th class="col-audit"></th>';
  thead.innerHTML = '<tr>' + checkboxHeader + TABLE_COLUMNS.map(col => {
    const isEditable = col.editable;
    const widthClass = getColumnWidthClass(col.key);
    return `<th class="${isEditable ? 'th-editable' : ''} ${widthClass}">${col.label}${isEditable ? ' <span class="edit-indicator">&#9998;</span>' : ''}</th>`;
  }).join('') + auditHeader + '</tr>';

  // Render table body
  const tbody = document.getElementById('input-table-body');
  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${TABLE_COLUMNS.length + 2}" style="text-align:center;padding:40px;color:var(--fg-muted);">No records found. Use the Omnibar to add filters and apply a view.</td></tr>`;
  } else {
    tbody.innerHTML = pageItems.map(item => renderTableRow(item)).join('');
  }

  renderInputPagination(page, totalPages);
  initBillingCodeEdit();
  updateBulkToolbar();
}

function renderTableRow(item) {
  const record = item.record;
  const globalIdx = item.originalIndex;
  const isEdited = appState.pendingEdits[globalIdx] !== undefined;
  const locked = isRowLocked(record);
  const isSelected = bulkState.selected.has(globalIdx);
  const rowClass = (isEdited ? 'row-edited ' : '') + (locked ? 'row-locked ' : '') + (isSelected ? 'row-selected ' : '');

  // Checkbox cell
  const checkboxCell = locked
    ? `<td class="col-checkbox cell-readonly"><span class="lock-icon" title="Locked (previous day, after 11 AM PHT)">&#128274;</span></td>`
    : `<td class="col-checkbox"><input type="checkbox" class="row-checkbox" data-idx="${globalIdx}" ${isSelected ? 'checked' : ''} onchange="bulkToggleRow(${globalIdx}, this.checked)"></td>`;

  // Audit icon cell
  const auditCell = `<td class="col-audit"><button class="audit-icon-btn" onclick="openAuditModal('${record._id}')" title="View audit trail"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></button></td>`;

  const cells = TABLE_COLUMNS.map(col => {
    const val = record[col.key] || '';
    const widthClass = getColumnWidthClass(col.key);

    if (!col.editable || locked) {
      if (col.key === 'date') {
        return `<td class="cell-readonly col-date ${widthClass}">${formatDateDisplay(val)}</td>`;
      }
      if (locked && col.editable) {
        return `<td class="cell-readonly cell-locked ${widthClass}">${escapeHtml(val)}</td>`;
      }
      return `<td class="cell-readonly ${widthClass}">${escapeHtml(val)}</td>`;
    }

    if (col.key === 'tag') {
      return `<td class="cell-editable ${widthClass}"><select class="cell-select" data-idx="${globalIdx}" data-key="tag" onchange="handleCellEdit(this)">
        ${TAG_OPTIONS.map(t => `<option value="${t}" ${val === t ? 'selected' : ''}>${t}</option>`).join('')}
        ${!val ? '<option value="" selected>&mdash;</option>' : ''}
      </select></td>`;
    }
    if (col.key === 'uplReason') {
      const canEdit = record.tag === 'UPL' || record.tag === 'LATE';
      if (!canEdit) return `<td class="cell-readonly cell-na ${widthClass}">&mdash;</td>`;
      return `<td class="cell-editable ${widthClass}"><select class="cell-select" data-idx="${globalIdx}" data-key="uplReason" onchange="handleCellEdit(this)">
        <option value="">&mdash;</option>
        ${UPL_REASONS.map(r => `<option value="${r}" ${val === r ? 'selected' : ''}>${r}</option>`).join('')}
      </select></td>`;
    }
    if (col.key === 'ot') {
      // OT column is locked for all employees EXCEPT RECALL_MEASUREMENT_CTR
      const isRecall = (record.completePlanningGroup || '').includes('RECALL_MEASUREMENT_CTR');
      if (!isRecall) {
        return `<td class="cell-readonly cell-locked ${widthClass}">${escapeHtml(val)}</td>`;
      }
      return `<td class="cell-editable ${widthClass}"><input type="number" step="0.5" min="0" class="cell-input cell-input-ot" value="${escapeAttr(val)}" data-idx="${globalIdx}" data-key="ot" onchange="handleCellEdit(this)" placeholder="\u2014"></td>`;
    }
    if (col.key === 'remarks') {
      return `<td class="cell-editable ${widthClass}"><textarea class="cell-input cell-textarea-remarks" data-idx="${globalIdx}" data-key="remarks" onchange="handleCellEdit(this)" placeholder="\u2014">${escapeHtml(val)}</textarea></td>`;
    }

    return `<td class="cell-readonly ${widthClass}">${escapeHtml(val)}</td>`;
  }).join('');

  return `<tr class="${rowClass}">${checkboxCell}${cells}${auditCell}</tr>`;
}

function pageToggleAll(checked) {
  const checkboxes = document.querySelectorAll('.row-checkbox');
  checkboxes.forEach(cb => {
    const idx = parseInt(cb.dataset.idx);
    cb.checked = checked;
    if (checked) bulkState.selected.add(idx);
    else bulkState.selected.delete(idx);
  });
  updateBulkToolbar();
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

function bulkToggleAll(checked) {
  if (checked) {
    // Select all non-locked rows on current page
    const pageItems = getCurrentPageItems();
    for (const item of pageItems) {
      if (!isRowLocked(item.record)) {
        bulkState.selected.add(item.originalIndex);
      }
    }
  } else {
    bulkState.selected.clear();
  }
  renderInputTable();
}

function bulkDeselectAll() {
  bulkState.selected.clear();
  const selectAll = document.getElementById('bulk-select-all');
  if (selectAll) selectAll.checked = false;
  updateBulkToolbar();
}

function updateBulkToolbar() {
  const toolbar = document.getElementById('bulk-toolbar');
  const countEl = document.getElementById('bulk-count');
  const count = bulkState.selected.size;

  if (count > 0) {
    toolbar.style.display = 'flex';
    countEl.textContent = `${count} selected`;
  } else {
    toolbar.style.display = 'none';
  }
}

function getCurrentPageItems() {
  const allFiltered = appState._filteredData || [];
  const pageSize = appState.inputPageSize;
  const page = appState.inputPage;
  const start = page * pageSize;
  return allFiltered.slice(start, start + pageSize);
}

async function bulkApplyTag() {
  const tag = document.getElementById('bulk-tag-select').value;
  if (!tag) { showToast('Please select a tag first', 'info'); return; }

  const selectedIds = [...bulkState.selected];
  if (selectedIds.length === 0) { showToast('No rows selected', 'info'); return; }
  if (selectedIds.length > 50) { showToast('Bulk editing is limited to 50 rows at a time', 'error'); return; }

  // Collect record IDs
  const recordIds = [];
  for (const idx of selectedIds) {
    const record = appState.records[idx];
    if (record && record._id && !isRowLocked(record)) {
      recordIds.push(record._id);
    }
  }

  if (recordIds.length === 0) { showToast('No editable rows in selection', 'info'); return; }

  try {
    const user = typeof currentUser !== 'undefined' ? currentUser : null;
    const resp = await fetch(`${IO_API_BASE}/attendance/bulk-tag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: recordIds,
        tag: tag,
        actor_ohr: user?.ohr_id || '',
        actor_name: user?.full_name || '',
      }),
    });

    const result = await resp.json();
    if (result.ok) {
      // Update local state
      for (const idx of selectedIds) {
        if (appState.records[idx] && !isRowLocked(appState.records[idx])) {
          appState.records[idx].tag = tag;
          // Clear UPL reason if tag is not UPL/LATE
          if (tag !== 'UPL' && tag !== 'LATE') {
            appState.records[idx].uplReason = '';
          }
        }
      }
      appState.originalRecords = JSON.parse(JSON.stringify(appState.records));

      const msg = `Bulk tagged ${result.updated} record(s) as "${tag}"` +
        (result.locked > 0 ? ` (${result.locked} locked rows skipped)` : '');
      showToast(msg, 'success');
      bulkDeselectAll();
      renderInputTable();
    } else {
      showToast('Bulk tag failed: ' + (result.error || 'Unknown error'), 'error');
    }
  } catch (err) {
    showToast('Bulk tag failed: ' + err.message, 'error');
  }
}

// ============================================================
// 5. AUDIT TIMELINE
// ============================================================

async function openAuditModal(recordId) {
  const modal = document.getElementById('audit-modal');
  const body = document.getElementById('audit-modal-body');
  modal.style.display = 'flex';
  body.innerHTML = '<div class="audit-loading"><div class="spinner"></div><p>Loading audit trail...</p></div>';

  try {
    const resp = await fetch(`${IO_API_BASE}/audit-log?record_id=${encodeURIComponent(recordId)}&record_type=attendance&limit=50`);
    const logs = await resp.json();

    if (!Array.isArray(logs) || logs.length === 0) {
      body.innerHTML = '<div class="audit-empty"><p>No changes recorded for this row.</p></div>';
      return;
    }

    let html = '<div class="audit-timeline">';
    for (const entry of logs) {
      const ts = entry.timestamp ? new Date(entry.timestamp) : null;
      const timeStr = ts ? ts.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Unknown';
      const actionLabel = entry.action === 'bulk_tag' ? 'Bulk Tag' : entry.action === 'edit' ? 'Edit' : entry.action || 'Change';
      const fieldLabel = (entry.field_name || '').replace(/_/g, ' ');

      html += `<div class="audit-entry">
        <div class="audit-entry-header">
          <span class="audit-action audit-action-${entry.action || 'edit'}">${escapeHtml(actionLabel)}</span>
          <span class="audit-time">${escapeHtml(timeStr)}</span>
        </div>
        <div class="audit-entry-body">
          <span class="audit-field">${escapeHtml(fieldLabel)}</span>
          <span class="audit-old">${escapeHtml(entry.old_value || '(empty)')}</span>
          <span class="audit-arrow">&rarr;</span>
          <span class="audit-new">${escapeHtml(entry.new_value || '(empty)')}</span>
        </div>
        <div class="audit-entry-footer">
          by ${escapeHtml(entry.actor_name || entry.actor_ohr || 'System')}
        </div>
      </div>`;
    }
    html += '</div>';
    body.innerHTML = html;
  } catch (err) {
    body.innerHTML = `<div class="audit-empty"><p>Failed to load audit trail: ${escapeHtml(err.message)}</p></div>`;
  }
}

function closeAuditModal() {
  document.getElementById('audit-modal').style.display = 'none';
}

// ============================================================
// 6. BACKWARD COMPATIBILITY — Bridge old functions
// ============================================================

// Override the old applyInputFilters to use omnibar
async function applyInputFilters() {
  // If omnibar has no date filter, add default (today)
  if (omnibarState.filters.length === 0) {
    const today = getTodayStr();
    omnibarState.filters.push({ key: 'date_range', label: 'Date Range', type: 'date_range', startDate: today, endDate: today });
    renderOmnibarChips();
  }
  await omnibarApplyView();
}

function clearInputFilters() {
  omnibarClearAll();
}

// Override populateInputFilterDropdowns — no longer needed since omnibar builds from records dynamically
function populateInputFilterDropdowns() {
  // No-op: Omnibar reads from appState.records directly
}

// Override initMultiSelects — no longer needed
function initMultiSelects() {
  // No-op: replaced by Omnibar
  appState.multiSelects = {};
}

// Set default omnibar filter on load
function setDefaultOmnibarFilters() {
  const today = getTodayStr();
  omnibarState.filters = [
    { key: 'date_range', label: 'Date Range', type: 'date_range', startDate: today, endDate: today }
  ];
  omnibarState.sorts = [
    { key: 'date', label: 'Date', direction: 'desc', recordKey: 'date' }
  ];
  renderOmnibarChips();
}

// Hook into the load flow
const _origSetDefaultFilters = typeof setDefaultFilters === 'function' ? setDefaultFilters : null;
function setDefaultFilters() {
  // Set date inputs for dashboard (keep backward compat)
  const today = getTodayStr();
  const dashStart = document.getElementById('dash-start-date');
  const dashEnd = document.getElementById('dash-end-date');
  if (dashStart) dashStart.value = today;
  if (dashEnd) dashEnd.value = today;

  // Set omnibar defaults
  setDefaultOmnibarFilters();
}

// ============================================================
// 7. INITIALIZATION
// ============================================================

// Auto-initialize omnibar when Input Portal loads
(function() {
  // Override the old toggleBlanksFilter
  window.toggleBlanksFilter = function() {
    const hasBlanks = omnibarState.filters.some(f => f.key === 'blanks');
    if (hasBlanks) {
      omnibarState.filters = omnibarState.filters.filter(f => f.key !== 'blanks');
    } else {
      omnibarState.filters.push({ key: 'blanks', label: 'Blank Tags Only', type: 'toggle', values: [true] });
    }
    renderOmnibarChips();
    omnibarApplyView();
  };
})();
