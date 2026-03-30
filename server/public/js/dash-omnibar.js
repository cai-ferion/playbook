/**
 * Dashboard Omnibar — chip-based filter/sort builder for Command Dashboard
 * Mirrors the Input Portal omnibar pattern but operates on appState.records for dashboard KPIs.
 */

(function () {
  'use strict';

  const DASH_FILTER_FIELDS = [
    { key: 'date_range', label: 'Date Range', type: 'date_range' },
    { key: 'flm', label: 'FLM', type: 'multi', recordKey: 'flm', searchable: true },
    { key: 'actualPlanningGroup', label: 'Planning Group', type: 'multi', recordKey: 'actualPlanningGroup', searchable: true },
    { key: 'day', label: 'Day', type: 'multi', recordKey: '_day', searchable: false },
    { key: 'agent', label: 'Agent', type: 'multi', recordKey: 'agent', searchable: true },
    { key: 'tag', label: 'Tag', type: 'multi', recordKey: 'tag', searchable: true },
    { key: 'billingCode', label: 'Billing Code', type: 'multi', recordKey: 'billingCode', searchable: true },
    { key: 'status', label: 'Status', type: 'multi', recordKey: 'status', searchable: false },
  ];

  const DASH_SORT_FIELDS = [
    { key: 'date', label: 'Date', recordKey: 'date' },
    { key: 'agent', label: 'Agent', recordKey: 'agent' },
    { key: 'flm', label: 'FLM', recordKey: 'flm' },
    { key: 'actualPlanningGroup', label: 'Planning Group', recordKey: 'actualPlanningGroup' },
  ];

  const dashOmniState = {
    filters: [],
    sorts: [],
    menuMode: null,
    menuStep: null,
    menuField: null,
  };

  let _dashOutsideListener = null;

  // ===== Menu open/close =====

  function dashOmnibarOpenMenu(mode) {
    dashOmniState.menuMode = mode;
    dashOmniState.menuStep = 'pick_field';
    dashOmniState.menuField = null;
    renderDashMenu();
    if (!_dashOutsideListener) {
      setTimeout(() => {
        _dashOutsideListener = (e) => {
          const omnibar = document.getElementById('dash-omnibar');
          const menu = document.getElementById('dash-omnibar-menu');
          if (!omnibar || !menu) return;
          if (omnibar.contains(e.target)) return;
          dashOmnibarCloseMenu();
        };
        document.addEventListener('mousedown', _dashOutsideListener);
      }, 10);
    }
  }

  function dashOmnibarCloseMenu() {
    dashOmniState.menuMode = null;
    dashOmniState.menuStep = null;
    dashOmniState.menuField = null;
    const menu = document.getElementById('dash-omnibar-menu');
    if (menu) menu.style.display = 'none';
    if (_dashOutsideListener) {
      document.removeEventListener('mousedown', _dashOutsideListener);
      _dashOutsideListener = null;
    }
  }

  // ===== Menu rendering =====

  function renderDashMenu() {
    const menu = document.getElementById('dash-omnibar-menu');
    if (!menu) return;
    menu.style.display = 'block';

    if (dashOmniState.menuMode === 'filter' && dashOmniState.menuStep === 'pick_field') {
      const activeKeys = new Set(dashOmniState.filters.map(f => f.key));
      const available = DASH_FILTER_FIELDS.filter(f => !activeKeys.has(f.key));
      if (available.length === 0) {
        menu.innerHTML = '<div class="omnibar-menu-empty">All filters are active</div>';
        return;
      }
      menu.innerHTML = '<div class="omnibar-menu-title">Select a filter</div>' +
        available.map(f =>
          `<button class="omnibar-menu-item" onclick="event.stopPropagation(); dashOmnibarSelectField('${f.key}')">${escapeHtml(f.label)}</button>`
        ).join('');

    } else if (dashOmniState.menuMode === 'filter' && dashOmniState.menuStep === 'pick_values') {
      renderDashValuePicker();

    } else if (dashOmniState.menuMode === 'sort' && dashOmniState.menuStep === 'pick_field') {
      const activeKeys = new Set(dashOmniState.sorts.map(s => s.key));
      const available = DASH_SORT_FIELDS.filter(f => !activeKeys.has(f.key));
      if (available.length === 0) {
        menu.innerHTML = '<div class="omnibar-menu-empty">All sort fields are active</div>';
        return;
      }
      menu.innerHTML = '<div class="omnibar-menu-title">Sort by</div>' +
        available.map(f =>
          `<button class="omnibar-menu-item" onclick="event.stopPropagation(); dashOmnibarAddSort('${f.key}', 'asc')">${escapeHtml(f.label)} &#9650; Ascending</button>` +
          `<button class="omnibar-menu-item" onclick="event.stopPropagation(); dashOmnibarAddSort('${f.key}', 'desc')">${escapeHtml(f.label)} &#9660; Descending</button>`
        ).join('');
    }
  }

  function renderDashValuePicker() {
    const menu = document.getElementById('dash-omnibar-menu');
    const field = dashOmniState.menuField;
    if (!field || !menu) return;

    if (field.type === 'date_range') {
      const today = typeof getTodayStr === 'function' ? getTodayStr() : new Date().toISOString().slice(0, 10);
      menu.innerHTML = `
        <div class="omnibar-menu-title">Date Range</div>
        <div class="omnibar-date-picker">
          <div class="filter-group">
            <label class="filter-label">Start:</label>
            <input type="date" class="form-input form-input-sm" id="dash-omni-date-start" value="${today}">
          </div>
          <div class="filter-group">
            <label class="filter-label">End:</label>
            <input type="date" class="form-input form-input-sm" id="dash-omni-date-end" value="${today}">
          </div>
          <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); dashOmnibarAddDateFilter()">Add</button>
        </div>`;
      return;
    }

    // Multi-select: gather unique values from records
    let values;
    if (field.key === 'day') {
      values = typeof DAY_NAMES !== 'undefined' ? DAY_NAMES.slice() : ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    } else {
      values = [...new Set(appState.records.map(r => r[field.recordKey]).filter(Boolean))].sort();
    }
    const searchable = field.searchable || values.length > 15;

    let html = `<div class="omnibar-menu-title">${escapeHtml(field.label)}</div>`;
    if (searchable) {
      html += `<div class="omnibar-search-wrap"><input type="text" class="form-input form-input-sm omnibar-search" id="dash-omni-value-search" placeholder="Search..." oninput="dashOmnibarFilterValueList()"></div>`;
    }
    html += '<div class="omnibar-value-list" id="dash-omni-value-list">';
    for (const v of values) {
      html += `<label class="omnibar-value-item"><input type="checkbox" value="${escapeAttr(v)}"><span>${escapeHtml(v)}</span></label>`;
    }
    html += '</div>';
    html += `<div class="omnibar-menu-footer"><button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); dashOmnibarAddMultiFilter()">Add Filter</button></div>`;
    menu.innerHTML = html;

    if (searchable) {
      setTimeout(() => { const si = document.getElementById('dash-omni-value-search'); if (si) si.focus(); }, 50);
    }
  }

  // ===== Filter/Sort handlers =====

  window.dashOmnibarSelectField = function (key) {
    const field = DASH_FILTER_FIELDS.find(f => f.key === key);
    if (!field) return;
    if (field.type === 'date_range') {
      dashOmniState.menuField = field;
      dashOmniState.menuStep = 'pick_values';
      renderDashMenu();
      return;
    }
    dashOmniState.menuField = field;
    dashOmniState.menuStep = 'pick_values';
    renderDashMenu();
  };

  window.dashOmnibarAddDateFilter = function () {
    const start = document.getElementById('dash-omni-date-start')?.value || '';
    const end = document.getElementById('dash-omni-date-end')?.value || '';
    if (!start || !end) { showToast('Please select both dates', 'info'); return; }
    if (start > end) { showToast('Start date cannot be after end date', 'info'); return; }
    dashOmniState.filters = dashOmniState.filters.filter(f => f.key !== 'date_range');
    dashOmniState.filters.unshift({ key: 'date_range', label: 'Date Range', type: 'date_range', startDate: start, endDate: end });
    dashOmnibarCloseMenu();
    renderDashChips();
  };

  window.dashOmnibarAddMultiFilter = function () {
    const field = dashOmniState.menuField;
    if (!field) return;
    const checked = [...document.querySelectorAll('#dash-omni-value-list input[type="checkbox"]:checked')].map(cb => cb.value);
    if (checked.length === 0) { showToast('Select at least one value', 'info'); return; }
    dashOmniState.filters = dashOmniState.filters.filter(f => f.key !== field.key);
    dashOmniState.filters.push({ key: field.key, label: field.label, type: 'multi', values: checked, recordKey: field.recordKey });
    dashOmnibarCloseMenu();
    renderDashChips();
  };

  window.dashOmnibarAddSort = function (key, direction) {
    const field = DASH_SORT_FIELDS.find(f => f.key === key);
    if (!field) return;
    dashOmniState.sorts = dashOmniState.sorts.filter(s => s.key !== key);
    dashOmniState.sorts.push({ key, label: field.label, direction, recordKey: field.recordKey });
    dashOmnibarCloseMenu();
    renderDashChips();
  };

  window.dashOmnibarFilterValueList = function () {
    const search = (document.getElementById('dash-omni-value-search')?.value || '').toLowerCase();
    const items = document.querySelectorAll('#dash-omni-value-list .omnibar-value-item');
    items.forEach(item => {
      const text = item.textContent.toLowerCase();
      item.style.display = text.includes(search) ? '' : 'none';
    });
  };

  window.dashOmnibarRemoveFilter = function (key) {
    dashOmniState.filters = dashOmniState.filters.filter(f => f.key !== key);
    renderDashChips();
  };

  window.dashOmnibarRemoveSort = function (key) {
    dashOmniState.sorts = dashOmniState.sorts.filter(s => s.key !== key);
    renderDashChips();
  };

  // ===== Chips =====

  function renderDashChips() {
    const container = document.getElementById('dash-omnibar-chips');
    if (!container) return;
    let html = '';
    for (const f of dashOmniState.filters) {
      let chipLabel = '';
      if (f.type === 'date_range') {
        chipLabel = `${f.label}: ${typeof formatDateDisplay === 'function' ? formatDateDisplay(f.startDate) : f.startDate} – ${typeof formatDateDisplay === 'function' ? formatDateDisplay(f.endDate) : f.endDate}`;
      } else {
        chipLabel = f.values.length <= 2 ? `${f.label}: ${f.values.join(', ')}` : `${f.label}: ${f.values.length} selected`;
      }
      html += `<span class="omnibar-chip omnibar-chip-filter">
        <span class="chip-icon">&#9881;</span>
        <span class="chip-text">${escapeHtml(chipLabel)}</span>
        <button class="chip-remove" onclick="dashOmnibarRemoveFilter('${f.key}')" title="Remove">&times;</button>
      </span>`;
    }
    for (const s of dashOmniState.sorts) {
      const arrow = s.direction === 'asc' ? '\u25B2' : '\u25BC';
      html += `<span class="omnibar-chip omnibar-chip-sort">
        <span class="chip-icon">${arrow}</span>
        <span class="chip-text">${escapeHtml(s.label)}</span>
        <button class="chip-remove" onclick="dashOmnibarRemoveSort('${s.key}')" title="Remove">&times;</button>
      </span>`;
    }
    container.innerHTML = html;
  }

  // ===== Apply / Clear =====

  async function dashOmnibarApply() {
    // Ensure data is loaded for the date range
    const dateFilter = dashOmniState.filters.find(f => f.key === 'date_range');
    if (dateFilter && typeof ensureDataForRange === 'function') {
      await ensureDataForRange(dateFilter.startDate, dateFilter.endDate);
    }
    renderDashboard();
  }

  function dashOmnibarClearAll() {
    dashOmniState.filters = [];
    dashOmniState.sorts = [];
    dashOmnibarCloseMenu();
    renderDashChips();
    // Set default date to today
    const today = typeof getTodayStr === 'function' ? getTodayStr() : new Date().toISOString().slice(0, 10);
    dashOmniState.filters.push({ key: 'date_range', label: 'Date Range', type: 'date_range', startDate: today, endDate: today });
    renderDashChips();
    renderDashboard();
  }

  // ===== Override dashboard filter functions =====

  // Override getFilteredDashboardRecords to use omnibar state
  window.getFilteredDashboardRecords = function () {
    let records = appState.records;

    const dateFilter = dashOmniState.filters.find(f => f.key === 'date_range');
    if (dateFilter) {
      if (dateFilter.startDate) records = records.filter(r => r.date && r.date >= dateFilter.startDate);
      if (dateFilter.endDate) records = records.filter(r => r.date && r.date <= dateFilter.endDate);
    }

    // Multi-select filters
    for (const f of dashOmniState.filters) {
      if (f.type !== 'multi') continue;
      if (f.key === 'day') {
        records = records.filter(r => {
          if (!r.date) return false;
          const dayName = typeof getDayOfWeek === 'function' ? getDayOfWeek(r.date) : '';
          return f.values.includes(dayName);
        });
      } else {
        records = records.filter(r => f.values.includes(r[f.recordKey]));
      }
    }

    return records;
  };

  // Override populateDashboardFilterDropdowns — no longer needed
  window.populateDashboardFilterDropdowns = function () {
    // No-op: replaced by dashboard omnibar
  };

  // Override applyDashboardFilters
  window.applyDashboardFilters = async function () {
    await dashOmnibarApply();
  };

  // Override clearDashboardFilters
  window.clearDashboardFilters = function () {
    dashOmnibarClearAll();
  };

  // Set default dashboard omnibar filters
  function setDefaultDashOmnibarFilters() {
    const today = typeof getTodayStr === 'function' ? getTodayStr() : new Date().toISOString().slice(0, 10);
    dashOmniState.filters = [
      { key: 'date_range', label: 'Date Range', type: 'date_range', startDate: today, endDate: today }
    ];
    dashOmniState.sorts = [];
    renderDashChips();
  }

  // Hook into the load flow — override the old setDefaultFilters to also set dashboard omnibar
  const _origSetDefaultFiltersDash = window.setDefaultFilters;
  window.setDefaultFilters = function () {
    if (_origSetDefaultFiltersDash) _origSetDefaultFiltersDash();
    setDefaultDashOmnibarFilters();
  };

  // Expose globals
  window.dashOmnibarOpenMenu = dashOmnibarOpenMenu;
  window.dashOmnibarCloseMenu = dashOmnibarCloseMenu;
  window.dashOmnibarApply = dashOmnibarApply;
  window.dashOmnibarClearAll = dashOmnibarClearAll;
  window.dashOmniState = dashOmniState;

})();
