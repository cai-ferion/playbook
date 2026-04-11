/**
 * Dashboard Filter Bar — persistent pill-based filter/sort for Command Dashboard
 * Replaces the old omnibar pattern with always-visible pills and instant-apply.
 */

(function () {
  'use strict';

  // ===== Field definitions =====

  const DASH_FILTER_FIELDS = [
    { key: 'date_range', label: 'Date', type: 'date_range' },
    { key: 'tag', label: 'Tag', type: 'multi', recordKey: 'tag', searchable: true, sortable: true },
    { key: 'agent', label: 'Agent', type: 'multi', recordKey: 'agent', searchable: true, sortable: true },
    { key: 'flm', label: 'FLM', type: 'multi', recordKey: 'flm', searchable: true, sortable: true },
    { key: 'actualPlanningGroup', label: 'Planning Group', type: 'multi', recordKey: 'actualPlanningGroup', searchable: true, sortable: true },
    { key: 'day', label: 'Day', type: 'multi', recordKey: '_day', searchable: false, sortable: false },
    { key: 'status', label: 'Status', type: 'multi', recordKey: 'status', searchable: false, sortable: false },
    { key: 'shiftTime', label: 'Shift Time', type: 'multi', recordKey: 'shiftTime', searchable: false, sortable: false },
  ];

  // ===== State =====

  const dashFilterState = {
    // Each filter stored by key. Missing key = "All" (no restriction)
    filters: {},
    // Sort: { key, direction } or null
    sort: null,
    // Which pill dropdown is open
    openPill: null,
  };

  let _dashOutsideListener = null;
  let _dashApplyDebounce = null;

  // ===== Helpers =====

  function dashGetAllValues(field) {
    if (field.key === 'day') {
      return typeof DAY_NAMES !== 'undefined' ? DAY_NAMES.slice() : ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    }
    return [...new Set(appState.records.map(r => r[field.recordKey]).filter(Boolean))].sort();
  }

  function dashGetFilterSummary(field) {
    const f = dashFilterState.filters[field.key];
    if (!f) return 'All';
    if (field.type === 'date_range') {
      const fmt = typeof formatDateDisplay === 'function' ? formatDateDisplay : (d) => d;
      return fmt(f.startDate) + ' \u2013 ' + fmt(f.endDate);
    }
    const allValues = dashGetAllValues(field);
    if (!f.values || f.values.length === 0) return 'None';
    if (f.values.length === allValues.length) return 'All';
    if (f.values.length === 1) return f.values[0];
    return f.values.length + ' selected';
  }

  function dashIsFiltered(field) {
    const f = dashFilterState.filters[field.key];
    if (!f) return false;
    if (field.type === 'date_range') return true;
    const allValues = dashGetAllValues(field);
    return f.values && f.values.length > 0 && f.values.length < allValues.length;
  }

  // ===== Render pills =====

  function dashRenderFilterBar() {
    const container = document.getElementById('dash-filter-pills');
    if (!container) return;

    let html = '';

    for (const field of DASH_FILTER_FIELDS) {
      const summary = dashGetFilterSummary(field);
      const isActive = dashIsFiltered(field);
      const hasSort = dashFilterState.sort && dashFilterState.sort.key === field.key;
      const isOpen = dashFilterState.openPill === field.key;

      let pillClass = 'filter-pill';
      if (isActive) pillClass += ' active';
      if (hasSort) pillClass += ' has-sort';
      if (isOpen) pillClass += ' open';

      const sortIcon = hasSort ? (dashFilterState.sort.direction === 'asc' ? ' \u25B2' : ' \u25BC') : '';

      html += '<div class="' + pillClass + '" id="dash-pill-' + field.key + '" onclick="event.stopPropagation(); dashTogglePill(\'' + field.key + '\')">'
        + '<span class="filter-pill-label">' + escapeHtml(field.label) + '</span>'
        + '<span class="filter-pill-value">' + escapeHtml(summary) + sortIcon + '</span>'
        + '<span class="filter-pill-icon">\u25BE</span>'
        + '<div class="filter-dropdown' + (isOpen ? ' open' : '') + '" id="dash-dd-' + field.key + '" onclick="event.stopPropagation();"></div>'
        + '</div>';
    }

    // Clear Filters button
    html += '<button class="filter-bar-clear" onclick="dashClearAllFilters()" title="Reset all filters to defaults">'
      + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
      + ' Clear Filters'
      + '</button>';

    // Record count — preserve current value across re-renders
    var curEl = document.getElementById('dash-record-count');
    var curText = curEl ? curEl.textContent : 'Filtered Records: 0';
    html += '<span class="filter-bar-meta" id="dash-record-count">' + curText + '</span>';

    container.innerHTML = html;
  }

  // ===== Toggle pill dropdown =====

  window.dashTogglePill = function (key) {
    if (dashFilterState.openPill === key) {
      dashClosePill();
      return;
    }
    dashFilterState.openPill = key;
    dashRenderFilterBar();
    dashRenderDropdown(key);
    _attachDashOutsideClick();
  };

  function dashClosePill() {
    dashFilterState.openPill = null;
    dashRenderFilterBar();
    _detachDashOutsideClick();
  }

  // ===== Render dropdown content =====

  function dashRenderDropdown(key) {
    const field = DASH_FILTER_FIELDS.find(function(f) { return f.key === key; });
    if (!field) return;
    const dd = document.getElementById('dash-dd-' + key);
    if (!dd) return;
    dd.classList.add('open');

    if (field.type === 'date_range') {
      dashRenderDateDropdown(dd, field);
      return;
    }

    dashRenderMultiDropdown(dd, field);
  }

  function dashRenderDateDropdown(dd, field) {
    var f = dashFilterState.filters[field.key];
    var today = typeof getTodayStr === 'function' ? getTodayStr() : new Date().toISOString().slice(0, 10);
    var startVal = f ? f.startDate : today;
    var endVal = f ? f.endDate : today;

    dd.innerHTML = '<div class="filter-dropdown-header">'
      + '<span class="filter-dropdown-title">' + escapeHtml(field.label) + '</span>'
      + '</div>'
      + '<div class="filter-date-row">'
      + '<div class="filter-group"><label>Start</label>'
      + '<input type="date" class="form-input form-input-sm" id="dash-date-start" value="' + startVal + '">'
      + '</div>'
      + '<div class="filter-group"><label>End</label>'
      + '<input type="date" class="form-input form-input-sm" id="dash-date-end" value="' + endVal + '">'
      + '</div>'
      + '</div>';

    setTimeout(function() {
      var startEl = document.getElementById('dash-date-start');
      var endEl = document.getElementById('dash-date-end');
      if (startEl) startEl.addEventListener('change', dashOnDateChange);
      if (endEl) endEl.addEventListener('change', dashOnDateChange);
    }, 30);
  }

  function dashOnDateChange() {
    var start = (document.getElementById('dash-date-start') || {}).value || '';
    var end = (document.getElementById('dash-date-end') || {}).value || '';
    if (!start || !end) return;
    if (start > end) { showToast('Start date cannot be after end date', 'info'); return; }
    dashFilterState.filters['date_range'] = {
      key: 'date_range', label: 'Date', type: 'date_range', startDate: start, endDate: end
    };
    // Update pill text
    var field = DASH_FILTER_FIELDS[0];
    var pill = document.getElementById('dash-pill-' + field.key);
    if (pill) {
      var valSpan = pill.querySelector('.filter-pill-value');
      if (valSpan) valSpan.textContent = dashGetFilterSummary(field);
    }
    dashDebouncedApply();
  }

  function dashRenderMultiDropdown(dd, field) {
    var values = dashGetAllValues(field);
    var f = dashFilterState.filters[field.key];
    var selectedSet = new Set(f ? f.values : values); // default: all selected
    var searchable = field.searchable || values.length > 15;

    var html = '<div class="filter-dropdown-header">';
    html += '<span class="filter-dropdown-title">' + escapeHtml(field.label) + '</span>';

    // Sort buttons (if sortable)
    if (field.sortable) {
      var curSort = dashFilterState.sort;
      var isAsc = curSort && curSort.key === field.key && curSort.direction === 'asc';
      var isDesc = curSort && curSort.key === field.key && curSort.direction === 'desc';
      html += '<div class="filter-dropdown-sort">'
        + '<button class="filter-sort-btn ' + (isAsc ? 'active-sort' : '') + '" onclick="event.stopPropagation(); dashSetSort(\'' + field.key + '\', \'asc\')" title="Sort A\u2192Z">A\u2191</button>'
        + '<button class="filter-sort-btn ' + (isDesc ? 'active-sort' : '') + '" onclick="event.stopPropagation(); dashSetSort(\'' + field.key + '\', \'desc\')" title="Sort Z\u2192A">Z\u2193</button>'
        + '</div>';
    }
    html += '</div>';

    if (searchable) {
      html += '<div class="filter-dropdown-search"><input type="text" class="form-input form-input-sm" id="dash-dd-search-' + field.key + '" placeholder="Search..." oninput="dashFilterDropdownSearch(\'' + field.key + '\')"></div>';
    }

    // Select All / Deselect All
    html += '<div class="filter-dropdown-actions">'
      + '<button class="filter-action-link" onclick="event.stopPropagation(); dashSelectAll(\'' + field.key + '\')">Select All</button>'
      + '<button class="filter-action-link" onclick="event.stopPropagation(); dashDeselectAll(\'' + field.key + '\')" style="color:#DC2626;">Deselect All</button>'
      + '</div>';

    html += '<div class="filter-dropdown-list" id="dash-dd-list-' + field.key + '">';
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      var checked = selectedSet.has(v) ? 'checked' : '';
      html += '<label class="filter-dropdown-item"><input type="checkbox" value="' + escapeAttr(v) + '" ' + checked + ' onchange="dashOnCheckboxChange(\'' + field.key + '\')"><span>' + escapeHtml(v) + '</span></label>';
    }
    html += '</div>';

    dd.innerHTML = html;

    if (searchable) {
      setTimeout(function() {
        var si = document.getElementById('dash-dd-search-' + field.key);
        if (si) si.focus();
      }, 50);
    }
  }

  // ===== Checkbox / sort handlers =====

  window.dashOnCheckboxChange = function (key) {
    var field = DASH_FILTER_FIELDS.find(function(f) { return f.key === key; });
    if (!field) return;
    var listEl = document.getElementById('dash-dd-list-' + key);
    if (!listEl) return;
    var checked = [];
    listEl.querySelectorAll('input[type="checkbox"]:checked').forEach(function(cb) { checked.push(cb.value); });
    var allValues = dashGetAllValues(field);

    if (checked.length === allValues.length) {
      delete dashFilterState.filters[key];
    } else {
      dashFilterState.filters[key] = { key: key, label: field.label, type: 'multi', values: checked, recordKey: field.recordKey };
    }

    // Update pill summary without closing dropdown
    var pill = document.getElementById('dash-pill-' + key);
    if (pill) {
      var valSpan = pill.querySelector('.filter-pill-value');
      if (valSpan) {
        var sortIcon = (dashFilterState.sort && dashFilterState.sort.key === key)
          ? (dashFilterState.sort.direction === 'asc' ? ' \u25B2' : ' \u25BC') : '';
        valSpan.textContent = dashGetFilterSummary(field) + sortIcon;
      }
      if (dashIsFiltered(field)) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    }

    dashDebouncedApply();
  };

  window.dashSetSort = function (key, direction) {
    var curSort = dashFilterState.sort;
    if (curSort && curSort.key === key && curSort.direction === direction) {
      dashFilterState.sort = null;
    } else {
      dashFilterState.sort = { key: key, direction: direction };
    }
    // Re-render bar and re-open dropdown
    var wasOpen = dashFilterState.openPill;
    dashRenderFilterBar();
    if (wasOpen) {
      dashFilterState.openPill = wasOpen;
      dashRenderFilterBar();
      dashRenderDropdown(wasOpen);
    }
    dashDebouncedApply();
  };

  window.dashSelectAll = function (key) {
    var listEl = document.getElementById('dash-dd-list-' + key);
    if (!listEl) return;
    listEl.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
      if (cb.closest('.filter-dropdown-item').style.display !== 'none') cb.checked = true;
    });
    delete dashFilterState.filters[key];
    var field = DASH_FILTER_FIELDS.find(function(f) { return f.key === key; });
    if (field) {
      var pill = document.getElementById('dash-pill-' + key);
      if (pill) {
        var valSpan = pill.querySelector('.filter-pill-value');
        if (valSpan) valSpan.textContent = 'All';
        pill.classList.remove('active');
      }
    }
    dashDebouncedApply();
  };

  window.dashDeselectAll = function (key) {
    var listEl = document.getElementById('dash-dd-list-' + key);
    if (!listEl) return;
    listEl.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
      if (cb.closest('.filter-dropdown-item').style.display !== 'none') cb.checked = false;
    });
    var stillChecked = [];
    listEl.querySelectorAll('input[type="checkbox"]:checked').forEach(function(cb) { stillChecked.push(cb.value); });
    var field = DASH_FILTER_FIELDS.find(function(f) { return f.key === key; });
    dashFilterState.filters[key] = { key: key, label: field.label, type: 'multi', values: stillChecked, recordKey: field.recordKey };
    var pill = document.getElementById('dash-pill-' + key);
    if (pill) {
      var valSpan = pill.querySelector('.filter-pill-value');
      if (valSpan) valSpan.textContent = stillChecked.length === 0 ? 'None' : stillChecked.length + ' selected';
      pill.classList.add('active');
    }
    dashDebouncedApply();
  };

  window.dashFilterDropdownSearch = function (key) {
    var searchEl = document.getElementById('dash-dd-search-' + key);
    var listEl = document.getElementById('dash-dd-list-' + key);
    if (!searchEl || !listEl) return;
    var q = searchEl.value.toLowerCase();
    listEl.querySelectorAll('.filter-dropdown-item').forEach(function(item) {
      var text = item.textContent.toLowerCase();
      item.style.display = text.includes(q) ? '' : 'none';
    });
  };

  // ===== Clear all =====

  window.dashClearAllFilters = function () {
    dashClosePill();
    var today = typeof getTodayStr === 'function' ? getTodayStr() : new Date().toISOString().slice(0, 10);
    dashFilterState.filters = {
      date_range: { key: 'date_range', label: 'Date', type: 'date_range', startDate: today, endDate: today }
    };
    dashFilterState.sort = null;
    dashRenderFilterBar();
    dashApplyNow();
  };

  // ===== Apply (instant, debounced) =====

  function dashDebouncedApply() {
    clearTimeout(_dashApplyDebounce);
    _dashApplyDebounce = setTimeout(dashApplyNow, 200);
  }

  async function dashApplyNow() {
    var dateFilter = dashFilterState.filters['date_range'];
    if (dateFilter && typeof ensureDataForRange === 'function') {
      await ensureDataForRange(dateFilter.startDate, dateFilter.endDate);
    }
    if (typeof renderDashboard === 'function') renderDashboard();
  }

  // ===== Outside click =====

  function _attachDashOutsideClick() {
    if (_dashOutsideListener) return;
    setTimeout(function() {
      _dashOutsideListener = function(e) {
        var bar = document.getElementById('dash-filter-bar');
        if (bar && bar.contains(e.target)) return;
        dashClosePill();
      };
      document.addEventListener('mousedown', _dashOutsideListener);
    }, 10);
  }

  function _detachDashOutsideClick() {
    if (_dashOutsideListener) {
      document.removeEventListener('mousedown', _dashOutsideListener);
      _dashOutsideListener = null;
    }
  }

  // ===== Override dashboard filter functions =====

  window.getFilteredDashboardRecords = function () {
    var records = appState.records;

    var dateFilter = dashFilterState.filters['date_range'];
    if (dateFilter) {
      if (dateFilter.startDate) records = records.filter(function(r) { return r.date && r.date >= dateFilter.startDate; });
      if (dateFilter.endDate) records = records.filter(function(r) { return r.date && r.date <= dateFilter.endDate; });
    }

    // Multi-select filters
    var keys = Object.keys(dashFilterState.filters);
    for (var ki = 0; ki < keys.length; ki++) {
      var f = dashFilterState.filters[keys[ki]];
      if (f.type !== 'multi') continue;
      if (!f.values || f.values.length === 0) {
        records = [];
        break;
      }
      if (f.key === 'day') {
        records = records.filter(function(r) {
          if (!r.date) return false;
          var dayName = typeof getDayOfWeek === 'function' ? getDayOfWeek(r.date) : '';
          return f.values.includes(dayName);
        });
      } else {
        var rk = f.recordKey;
        var vs = f.values;
        records = records.filter(function(r) { return vs.includes(r[rk]); });
      }
    }

    // Apply sort
    if (dashFilterState.sort) {
      var s = dashFilterState.sort;
      var sortField = DASH_FILTER_FIELDS.find(function(ff) { return ff.key === s.key; });
      if (sortField) {
        var sortRk = sortField.recordKey;
        var dir = s.direction;
        records = records.slice().sort(function(a, b) {
          var aVal = a[sortRk] || '';
          var bVal = b[sortRk] || '';
          var cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
          return dir === 'asc' ? cmp : -cmp;
        });
      }
    }

    return records;
  };

  window.populateDashboardFilterDropdowns = function () {};

  window.applyDashboardFilters = async function () {
    await dashApplyNow();
  };

  window.clearDashboardFilters = function () {
    dashClearAllFilters();
  };

  // ===== Set default filters on load =====

  function setDefaultDashFilterBar() {
    var today = typeof getTodayStr === 'function' ? getTodayStr() : new Date().toISOString().slice(0, 10);
    dashFilterState.filters = {
      date_range: { key: 'date_range', label: 'Date', type: 'date_range', startDate: today, endDate: today }
    };
    dashFilterState.sort = null;
    dashFilterState.openPill = null;
    // All multi-select filters default to "All" (no entry in filters = all selected)
    dashRenderFilterBar();
  }

  // Hook into the load flow
  var _origSetDefaultFiltersDash = window.setDefaultFilters;
  window.setDefaultFilters = function () {
    if (_origSetDefaultFiltersDash) _origSetDefaultFiltersDash();
    setDefaultDashFilterBar();
  };

  // ===== Backward compat =====
  window.dashOmnibarApply = dashApplyNow;
  window.dashOmnibarClearAll = dashClearAllFilters;
  window.dashOmniState = dashFilterState;
  window.dashOmnibarOpenMenu = function () {};
  window.dashOmnibarCloseMenu = function () {};
  window.dashFilterState = dashFilterState;
  window.dashRenderFilterBar = dashRenderFilterBar;

})();
