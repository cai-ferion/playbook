/**
 * Sandbox Input Portal Filter Bar — persistent pill-based filter/sort
 * Mirrors the Compass filter-bar pattern (filter-bar.css) but operates on SANDBOX_MOD.insights
 */

(function () {
  'use strict';

  // ===== Filter field definitions =====
  const SANDBOX_PILL_FIELDS = [
    { key: 'date_range', label: 'Created Date', type: 'date_range', sortable: true },
    { key: 'submitter', label: 'Submitter', type: 'multi', recordKey: 'submitter_name', searchable: true, sortable: true },
    { key: 'planning_group', label: 'Planning Group', type: 'multi', recordKey: 'planning_group', searchable: false, sortable: true },
    { key: 'category', label: 'Insight Category', type: 'multi', recordKey: '_category', searchable: true, sortable: true },
    { key: 'proposal_type', label: 'Proposal Type', type: 'multi', recordKey: 'proposal_type', searchable: false, sortable: true },
    { key: 'status', label: 'Status', type: 'multi', recordKey: 'status', searchable: false, sortable: true },
  ];

  const SANDBOX_PILL_SORT_FIELDS = [
    { key: 'date_range', label: 'Created Date', recordKey: 'created_at' },
    { key: 'submitter', label: 'Submitter', recordKey: 'submitter_name' },
    { key: 'planning_group', label: 'Planning Group', recordKey: 'planning_group' },
    { key: 'category', label: 'Insight Category', recordKey: '_category' },
    { key: 'proposal_type', label: 'Proposal Type', recordKey: 'proposal_type' },
    { key: 'status', label: 'Status', recordKey: 'status' },
  ];

  // Predefined option sets
  const SANDBOX_DEFINED_OPTIONS = {
    planning_group: ['Hateful Conduct', 'Bullying & Harassment', 'Violence & Incitement', 'Suicide & Self-Injury', 'Dangerous Organizations', 'Regulated Goods', 'Fraud & Deception', 'Adult Sexual Exploitation', 'CSAM', 'Human Exploitation'],
    proposal_type: ['New Policy', 'Policy Update', 'Process Improvement', 'Tool Enhancement', 'Training Material', 'Other'],
    status: ['Pending - Initial Review', 'Pending - Final Review', 'Approved', 'Rejected - Initial Review', 'Rejected - Final Review', 'Implemented', 'Archived'],
  };

  // ===== State =====
  const sandboxPillState = {
    filters: {},
    sort: { key: 'date_range', direction: 'desc', recordKey: 'created_at' },
    openPill: null,
  };

  let _sandboxOutsideListener = null;
  let _sandboxApplyDebounce = null;

  // ===== Helpers =====

  function sandboxGetAllValues(field) {
    // Use predefined options if available
    const predefined = SANDBOX_DEFINED_OPTIONS[field.recordKey] || SANDBOX_DEFINED_OPTIONS[field.key];
    if (predefined) return [...predefined].sort();

    // Derive from data
    if (typeof SANDBOX_MOD === 'undefined' || !SANDBOX_MOD.insights) return [];
    const vals = new Set();
    SANDBOX_MOD.insights.forEach(i => {
      let v;
      if (field.recordKey === '_category') {
        v = i.category || i.insight_category;
      } else {
        v = i[field.recordKey];
      }
      if (v) vals.add(v);
    });
    return [...vals].sort();
  }

  function sandboxGetFilterSummary(field) {
    const f = sandboxPillState.filters[field.key];
    if (!f) return 'All';
    if (field.type === 'date_range') {
      return (f.startDate || '?') + ' — ' + (f.endDate || '?');
    }
    const allValues = sandboxGetAllValues(field);
    if (!f.values || f.values.length === 0) return 'None';
    if (f.values.length === allValues.length) return 'All';
    if (f.values.length === 1) return f.values[0];
    return f.values.length + ' selected';
  }

  function sandboxIsFiltered(field) {
    const f = sandboxPillState.filters[field.key];
    if (!f) return false;
    if (field.type === 'date_range') return true;
    const allValues = sandboxGetAllValues(field);
    return f.values && f.values.length > 0 && f.values.length < allValues.length;
  }

  // ===== Render pills =====

  function sandboxRenderFilterBar() {
    const container = document.getElementById('sandbox-filter-pills');
    if (!container) return;

    let html = '';

    for (let fi = 0; fi < SANDBOX_PILL_FIELDS.length; fi++) {
      const field = SANDBOX_PILL_FIELDS[fi];
      const summary = sandboxGetFilterSummary(field);
      const isActive = sandboxIsFiltered(field);
      const hasSort = sandboxPillState.sort && sandboxPillState.sort.key === field.key;
      const isOpen = sandboxPillState.openPill === field.key;

      let pillClass = 'filter-pill';
      if (isActive) pillClass += ' active';
      if (hasSort) pillClass += ' has-sort';
      if (isOpen) pillClass += ' open';

      const sortIcon = hasSort ? (sandboxPillState.sort.direction === 'asc' ? ' \u25B2' : ' \u25BC') : '';

      html += '<div class="' + pillClass + '" id="sandbox-pill-' + field.key + '" onclick="event.stopPropagation(); sandboxTogglePill(\'' + field.key + '\')">'
        + '<span class="filter-pill-label">' + escapeHtml(field.label) + '</span>'
        + '<span class="filter-pill-value">' + escapeHtml(summary + sortIcon) + '</span>'
        + '<span class="filter-pill-icon">\u25BE</span>'
        + '<div class="filter-dropdown' + (isOpen ? ' open' : '') + '" id="sandbox-dd-' + field.key + '" onclick="event.stopPropagation();"></div>'
        + '</div>';
    }

    // Clear Filters button
    html += '<button class="filter-bar-clear" onclick="sandboxClearAllPillFilters()" title="Reset all filters">'
      + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
      + ' Clear Filters'
      + '</button>';

    // Record count
    const totalFiltered = SANDBOX_MOD.filtered ? SANDBOX_MOD.filtered.length : 0;
    html += '<span class="filter-bar-meta" id="sandbox-filtered-count-bar">Filtered: ' + totalFiltered + '</span>';

    container.innerHTML = html;
  }

  // ===== Toggle pill dropdown =====

  window.sandboxTogglePill = function (key) {
    if (sandboxPillState.openPill === key) {
      sandboxClosePill();
      return;
    }
    sandboxPillState.openPill = key;
    sandboxRenderFilterBar();
    sandboxRenderDropdown(key);
    _attachSandboxOutsideClick();
  };

  function sandboxClosePill() {
    sandboxPillState.openPill = null;
    sandboxRenderFilterBar();
    _detachSandboxOutsideClick();
  }

  // ===== Render dropdown content =====

  function sandboxRenderDropdown(key) {
    const field = SANDBOX_PILL_FIELDS.find(f => f.key === key);
    if (!field) return;
    const dd = document.getElementById('sandbox-dd-' + key);
    if (!dd) return;
    dd.classList.add('open');

    if (field.type === 'date_range') {
      sandboxRenderDateDropdown(dd, field);
      return;
    }

    sandboxRenderMultiDropdown(dd, field);
  }

  function sandboxRenderDateDropdown(dd, field) {
    const f = sandboxPillState.filters[field.key];
    const startVal = f ? f.startDate : '';
    const endVal = f ? f.endDate : '';

    const curSort = sandboxPillState.sort;
    const isAsc = curSort && curSort.key === 'date_range' && curSort.direction === 'asc';
    const isDesc = curSort && curSort.key === 'date_range' && curSort.direction === 'desc';

    dd.innerHTML = '<div class="filter-dropdown-header">'
      + '<span class="filter-dropdown-title">' + escapeHtml(field.label) + '</span>'
      + '<div class="filter-dropdown-sort">'
      + '<button class="filter-sort-btn ' + (isAsc ? 'active-sort' : '') + '" onclick="event.stopPropagation(); sandboxSetSort(\'date_range\', \'asc\')" title="Oldest first">Old\u2191</button>'
      + '<button class="filter-sort-btn ' + (isDesc ? 'active-sort' : '') + '" onclick="event.stopPropagation(); sandboxSetSort(\'date_range\', \'desc\')" title="Newest first">New\u2193</button>'
      + '</div>'
      + '</div>'
      + '<div class="filter-date-row">'
      + '<div class="filter-group"><label>Start</label>'
      + '<input type="date" class="form-input form-input-sm" id="sandbox-date-start" value="' + startVal + '">'
      + '</div>'
      + '<div class="filter-group"><label>End</label>'
      + '<input type="date" class="form-input form-input-sm" id="sandbox-date-end" value="' + endVal + '">'
      + '</div>'
      + '</div>';

    setTimeout(() => {
      const startEl = document.getElementById('sandbox-date-start');
      const endEl = document.getElementById('sandbox-date-end');
      if (startEl) startEl.addEventListener('change', sandboxOnDateChange);
      if (endEl) endEl.addEventListener('change', sandboxOnDateChange);
    }, 30);
  }

  function sandboxOnDateChange() {
    const start = (document.getElementById('sandbox-date-start') || {}).value || '';
    const end = (document.getElementById('sandbox-date-end') || {}).value || '';
    if (!start && !end) {
      delete sandboxPillState.filters['date_range'];
    } else {
      if (start && end && start > end) { showToast('Start date cannot be after end date', 'info'); return; }
      sandboxPillState.filters['date_range'] = {
        key: 'date_range', label: 'Created Date', type: 'date_range', startDate: start, endDate: end
      };
    }
    const field = SANDBOX_PILL_FIELDS[0];
    const pill = document.getElementById('sandbox-pill-' + field.key);
    if (pill) {
      const valSpan = pill.querySelector('.filter-pill-value');
      if (valSpan) valSpan.textContent = sandboxGetFilterSummary(field);
    }
    sandboxDebouncedApply();
  }

  function sandboxRenderMultiDropdown(dd, field) {
    const values = sandboxGetAllValues(field);
    const f = sandboxPillState.filters[field.key];
    const selectedSet = new Set(f ? f.values : values); // default: all selected
    const searchable = field.searchable || values.length > 15;

    let html = '<div class="filter-dropdown-header">';
    html += '<span class="filter-dropdown-title">' + escapeHtml(field.label) + '</span>';

    // Sort buttons (if sortable)
    if (field.sortable) {
      const sortField = SANDBOX_PILL_SORT_FIELDS.find(sf => sf.key === field.key);
      if (sortField) {
        const curSort = sandboxPillState.sort;
        const isAsc = curSort && curSort.key === field.key && curSort.direction === 'asc';
        const isDesc = curSort && curSort.key === field.key && curSort.direction === 'desc';
        html += '<div class="filter-dropdown-sort">'
          + '<button class="filter-sort-btn ' + (isAsc ? 'active-sort' : '') + '" onclick="event.stopPropagation(); sandboxSetSort(\'' + field.key + '\', \'asc\')" title="Sort A\u2192Z">A\u2191</button>'
          + '<button class="filter-sort-btn ' + (isDesc ? 'active-sort' : '') + '" onclick="event.stopPropagation(); sandboxSetSort(\'' + field.key + '\', \'desc\')" title="Sort Z\u2192A">Z\u2193</button>'
          + '</div>';
      }
    }
    html += '</div>';

    if (searchable) {
      html += '<div class="filter-dropdown-search"><input type="text" class="form-input form-input-sm" id="sandbox-dd-search-' + field.key + '" placeholder="Search..." oninput="sandboxFilterDropdownSearch(\'' + field.key + '\')"></div>';
    }

    // Select All / Deselect All
    html += '<div class="filter-dropdown-actions">'
      + '<button class="filter-action-link" onclick="event.stopPropagation(); sandboxPillSelectAll(\'' + field.key + '\')">Select All</button>'
      + '<button class="filter-action-link" onclick="event.stopPropagation(); sandboxPillDeselectAll(\'' + field.key + '\')" style="color:#DC2626;">Deselect All</button>'
      + '</div>';

    html += '<div class="filter-dropdown-list" id="sandbox-dd-list-' + field.key + '">';
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      const checked = selectedSet.has(v) ? 'checked' : '';
      html += '<label class="filter-dropdown-item"><input type="checkbox" value="' + escapeAttr(v) + '" ' + checked + ' onchange="sandboxOnPillCheckboxChange(\'' + field.key + '\')"><span>' + escapeHtml(v) + '</span></label>';
    }
    html += '</div>';

    dd.innerHTML = html;

    if (searchable) {
      setTimeout(() => {
        const si = document.getElementById('sandbox-dd-search-' + field.key);
        if (si) si.focus();
      }, 50);
    }
  }

  // ===== Checkbox / sort handlers =====

  window.sandboxOnPillCheckboxChange = function (key) {
    const field = SANDBOX_PILL_FIELDS.find(f => f.key === key);
    if (!field) return;
    const listEl = document.getElementById('sandbox-dd-list-' + key);
    if (!listEl) return;
    const checked = [];
    listEl.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => { checked.push(cb.value); });
    const allValues = sandboxGetAllValues(field);

    if (checked.length === allValues.length) {
      delete sandboxPillState.filters[key];
    } else {
      sandboxPillState.filters[key] = { key, label: field.label, type: 'multi', values: checked, recordKey: field.recordKey };
    }

    // Update pill summary without closing dropdown
    const pill = document.getElementById('sandbox-pill-' + key);
    if (pill) {
      const valSpan = pill.querySelector('.filter-pill-value');
      if (valSpan) {
        const sortIcon = (sandboxPillState.sort && sandboxPillState.sort.key === key)
          ? (sandboxPillState.sort.direction === 'asc' ? ' \u25B2' : ' \u25BC') : '';
        valSpan.textContent = sandboxGetFilterSummary(field) + sortIcon;
      }
      if (sandboxIsFiltered(field)) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    }

    sandboxDebouncedApply();
  };

  window.sandboxSetSort = function (key, direction) {
    const curSort = sandboxPillState.sort;
    if (curSort && curSort.key === key && curSort.direction === direction) {
      sandboxPillState.sort = null;
    } else {
      const sortField = SANDBOX_PILL_SORT_FIELDS.find(sf => sf.key === key);
      sandboxPillState.sort = { key, direction, recordKey: sortField ? sortField.recordKey : key };
    }
    const wasOpen = sandboxPillState.openPill;
    sandboxRenderFilterBar();
    if (wasOpen) {
      sandboxPillState.openPill = wasOpen;
      sandboxRenderFilterBar();
      sandboxRenderDropdown(wasOpen);
    }
    sandboxDebouncedApply();
  };

  window.sandboxPillSelectAll = function (key) {
    const listEl = document.getElementById('sandbox-dd-list-' + key);
    if (!listEl) return;
    listEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      if (cb.closest('.filter-dropdown-item').style.display !== 'none') cb.checked = true;
    });
    delete sandboxPillState.filters[key];
    const field = SANDBOX_PILL_FIELDS.find(f => f.key === key);
    if (field) {
      const pill = document.getElementById('sandbox-pill-' + key);
      if (pill) {
        const valSpan = pill.querySelector('.filter-pill-value');
        if (valSpan) valSpan.textContent = 'All';
        pill.classList.remove('active');
      }
    }
    sandboxDebouncedApply();
  };

  window.sandboxPillDeselectAll = function (key) {
    const listEl = document.getElementById('sandbox-dd-list-' + key);
    if (!listEl) return;
    listEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      if (cb.closest('.filter-dropdown-item').style.display !== 'none') cb.checked = false;
    });
    const stillChecked = [];
    listEl.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => { stillChecked.push(cb.value); });
    const field = SANDBOX_PILL_FIELDS.find(f => f.key === key);
    sandboxPillState.filters[key] = { key, label: field.label, type: 'multi', values: stillChecked, recordKey: field.recordKey };
    const pill = document.getElementById('sandbox-pill-' + key);
    if (pill) {
      const valSpan = pill.querySelector('.filter-pill-value');
      if (valSpan) valSpan.textContent = stillChecked.length === 0 ? 'None' : stillChecked.length + ' selected';
      pill.classList.add('active');
    }
    sandboxDebouncedApply();
  };

  window.sandboxFilterDropdownSearch = function (key) {
    const searchEl = document.getElementById('sandbox-dd-search-' + key);
    const listEl = document.getElementById('sandbox-dd-list-' + key);
    if (!searchEl || !listEl) return;
    const q = searchEl.value.toLowerCase();
    listEl.querySelectorAll('.filter-dropdown-item').forEach(item => {
      const text = item.textContent.toLowerCase();
      item.style.display = text.includes(q) ? '' : 'none';
    });
  };

  // ===== Clear all =====

  window.sandboxClearAllPillFilters = function () {
    sandboxClosePill();
    sandboxPillState.filters = {};
    sandboxPillState.sort = { key: 'date_range', direction: 'desc', recordKey: 'created_at' };
    sandboxRenderFilterBar();
    sandboxApplyPillFilters();
  };

  // ===== Apply (instant, debounced) =====

  function sandboxDebouncedApply() {
    clearTimeout(_sandboxApplyDebounce);
    _sandboxApplyDebounce = setTimeout(sandboxApplyPillFilters, 250);
  }

  function sandboxApplyPillFilters() {
    // Start from role-filtered data (let sandboxOmniApply handle role-based filtering)
    // We inject our pill filters into the existing sandboxOmniState so sandboxOmniApply picks them up
    // Actually, we replace the old omnibar filters entirely — clear old state and set new
    sandboxOmniState.filters = [];
    sandboxOmniState.sorts = [];

    // Convert pill filters to omnibar format
    Object.values(sandboxPillState.filters).forEach(f => {
      switch (f.key) {
        case 'date_range': {
          sandboxOmniState.filters.push({
            field: 'created_at',
            op: 'dateRange',
            value: { from: f.startDate || '', to: f.endDate || '' }
          });
          break;
        }
        default: {
          if (f.type === 'multi' && f.values) {
            const recordKey = f.recordKey === '_category' ? 'category' : f.recordKey;
            sandboxOmniState.filters.push({
              field: recordKey,
              op: 'in',
              value: f.values
            });
          }
          break;
        }
      }
    });

    // Convert pill sort to omnibar format
    if (sandboxPillState.sort) {
      const rk = sandboxPillState.sort.recordKey === '_category' ? 'category' : sandboxPillState.sort.recordKey;
      sandboxOmniState.sorts = [{ key: rk, field: rk, dir: sandboxPillState.sort.direction }];
    }

    // Call the existing apply function which handles role-based filtering + rendering
    sandboxOmniApply();

    // Update our own count display
    sandboxRenderFilterBar();
  }

  // ===== Outside click =====

  function _attachSandboxOutsideClick() {
    _detachSandboxOutsideClick();
    _sandboxOutsideListener = function (e) {
      const container = document.getElementById('sandbox-filter-pills');
      if (container && !container.contains(e.target)) {
        sandboxClosePill();
      }
    };
    setTimeout(() => document.addEventListener('click', _sandboxOutsideListener), 50);
  }

  function _detachSandboxOutsideClick() {
    if (_sandboxOutsideListener) {
      document.removeEventListener('click', _sandboxOutsideListener);
      _sandboxOutsideListener = null;
    }
  }

  // ===== Public init =====

  window.sandboxInitPillFilterBar = function () {
    sandboxRenderFilterBar();
  };

  // Expose state for external access (e.g., CSV export)
  window.sandboxPillState = sandboxPillState;
  window.SANDBOX_PILL_FIELDS = SANDBOX_PILL_FIELDS;

})();
