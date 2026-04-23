/**
 * Compass Filter Bar — persistent pill-based filter/sort for Coaching Profile
 * Mirrors the Input Portal filter-bar pattern (filter-bar.css) but operates on COMPASS.logs
 */

(function () {
  'use strict';

  // ===== Filter field definitions =====
  const COMPASS_PILL_FIELDS = [
    { key: 'date_range', label: 'Date', type: 'date_range', sortable: true },
    { key: 'type', label: 'Type', type: 'multi', recordKey: 'coaching_type', searchable: false, sortable: true },
    // Status filter removed — status is only relevant for QA Feedback disputes, not general coaching
    { key: 'coach', label: 'Coach', type: 'multi', recordKey: 'coach', searchable: true, sortable: true },
    { key: 'coachee', label: 'Coachee', type: 'multi', recordKey: 'coachee', searchable: true, sortable: true },
    { key: 'sessionGoal', label: 'Session Goal', type: 'multi', recordKey: 'session_goal', searchable: true, sortable: false, isMultiValue: true },
  ];

  const COMPASS_PILL_SORT_FIELDS = [
    { key: 'date_range', label: 'Date', recordKey: 'coaching_date' },
    { key: 'type', label: 'Type', recordKey: 'coaching_type' },
    { key: 'coach', label: 'Coach', recordKey: 'coach' },
    { key: 'coachee', label: 'Coachee', recordKey: 'coachee' },
  ];

  // ===== State =====
  const compassPillState = {
    filters: {},
    sort: { key: 'date_range', direction: 'desc', recordKey: 'coaching_date' },
    openPill: null,
  };

  let _compassOutsideListener = null;
  let _compassApplyDebounce = null;

  // ===== Helpers =====

  // Predefined option sets — always show these regardless of data presence
  const COMPASS_DEFINED_OPTIONS = {
    coaching_type: ['General Coaching', 'Incident Report', 'Follow-Up Session', 'Group Coaching', 'Triad Coaching', 'QA Feedback', 'ZTP Coaching'],
    session_goal: ['AES/Scorecard Discussion', 'Attendance & Tardiness', 'Compliance & Behavior', 'Escalation', 'Internal Discussion', 'Performance & Metrics', 'Performance Improvement Plan', 'Professional & Personal Development'],
  };

  function compassGetAllValues(field) {
    // If we have predefined options for this field, use them
    const predefined = COMPASS_DEFINED_OPTIONS[field.recordKey];
    if (predefined) return [...predefined].sort();

    // Otherwise, derive from data
    if (typeof COMPASS === 'undefined' || !COMPASS.logs) return [];
    const vals = new Set();
    COMPASS.logs.forEach(l => {
      if (field.isMultiValue) {
        const raw = l[field.recordKey];
        if (raw) raw.split(',').forEach(g => { const t = g.trim(); if (t) vals.add(t); });
      } else {
        const v = l[field.recordKey];
        if (v) vals.add(v);
      }
    });
    return [...vals].sort();
  }

  function compassGetFilterSummary(field) {
    const f = compassPillState.filters[field.key];
    if (!f) {
      if (field.type === 'date_range') return 'All';
      return 'All';
    }
    if (field.type === 'date_range') {
      return (f.startDate || '?') + ' — ' + (f.endDate || '?');
    }
    const allValues = compassGetAllValues(field);
    if (!f.values || f.values.length === 0) return 'None';
    if (f.values.length === allValues.length) return 'All';
    if (f.values.length === 1) return f.values[0];
    return f.values.length + ' selected';
  }

  function compassIsFiltered(field) {
    const f = compassPillState.filters[field.key];
    if (!f) return false;
    if (field.type === 'date_range') return true;
    const allValues = compassGetAllValues(field);
    return f.values && f.values.length > 0 && f.values.length < allValues.length;
  }

  // ===== Render pills =====

  function compassRenderFilterBar() {
    const container = document.getElementById('compass-filter-pills');
    if (!container) return;

    let html = '';

    for (let fi = 0; fi < COMPASS_PILL_FIELDS.length; fi++) {
      const field = COMPASS_PILL_FIELDS[fi];
      const summary = compassGetFilterSummary(field);
      const isActive = compassIsFiltered(field);
      const hasSort = compassPillState.sort && compassPillState.sort.key === field.key;
      const isOpen = compassPillState.openPill === field.key;

      let pillClass = 'filter-pill';
      if (isActive) pillClass += ' active';
      if (hasSort) pillClass += ' has-sort';
      if (isOpen) pillClass += ' open';

      const sortIcon = hasSort ? (compassPillState.sort.direction === 'asc' ? ' \u25B2' : ' \u25BC') : '';

      html += '<div class="' + pillClass + '" id="compass-pill-' + field.key + '" onclick="event.stopPropagation(); compassTogglePill(\'' + field.key + '\')">'
        + '<span class="filter-pill-label">' + escapeHtml(field.label) + '</span>'
        + '<span class="filter-pill-value">' + escapeHtml(summary + sortIcon) + '</span>'
        + '<span class="filter-pill-icon">\u25BE</span>'
        + '<div class="filter-dropdown' + (isOpen ? ' open' : '') + '" id="compass-dd-' + field.key + '" onclick="event.stopPropagation();"></div>'
        + '</div>';
    }

    // Clear Filters button
    html += '<button class="filter-bar-clear" onclick="compassClearAllFilters()" title="Reset all filters">'
      + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
      + ' Clear Filters'
      + '</button>';

    // Record count
    const totalFiltered = (COMPASS.filteredGiven ? COMPASS.filteredGiven.length : 0) + (COMPASS.filteredReceived ? COMPASS.filteredReceived.length : 0);
    html += '<span class="filter-bar-meta" id="compass-filtered-count-bar">Filtered: ' + totalFiltered + '</span>';

    container.innerHTML = html;
  }

  // ===== Toggle pill dropdown =====

  window.compassTogglePill = function (key) {
    if (compassPillState.openPill === key) {
      compassClosePill();
      return;
    }
    compassPillState.openPill = key;
    compassRenderFilterBar();
    compassRenderDropdown(key);
    _attachCompassOutsideClick();
  };

  function compassClosePill() {
    compassPillState.openPill = null;
    compassRenderFilterBar();
    _detachCompassOutsideClick();
  }

  // ===== Render dropdown content =====

  function compassRenderDropdown(key) {
    const field = COMPASS_PILL_FIELDS.find(f => f.key === key);
    if (!field) return;
    const dd = document.getElementById('compass-dd-' + key);
    if (!dd) return;
    dd.classList.add('open');

    if (field.type === 'date_range') {
      compassRenderDateDropdown(dd, field);
      return;
    }

    compassRenderMultiDropdown(dd, field);
  }

  function compassRenderDateDropdown(dd, field) {
    const f = compassPillState.filters[field.key];
    const startVal = f ? f.startDate : '';
    const endVal = f ? f.endDate : '';

    const curSort = compassPillState.sort;
    const isAsc = curSort && curSort.key === 'date_range' && curSort.direction === 'asc';
    const isDesc = curSort && curSort.key === 'date_range' && curSort.direction === 'desc';

    dd.innerHTML = '<div class="filter-dropdown-header">'
      + '<span class="filter-dropdown-title">' + escapeHtml(field.label) + '</span>'
      + '<div class="filter-dropdown-sort">'
      + '<button class="filter-sort-btn ' + (isAsc ? 'active-sort' : '') + '" onclick="event.stopPropagation(); compassSetSort(\'date_range\', \'asc\')" title="Oldest first">Old\u2191</button>'
      + '<button class="filter-sort-btn ' + (isDesc ? 'active-sort' : '') + '" onclick="event.stopPropagation(); compassSetSort(\'date_range\', \'desc\')" title="Newest first">New\u2193</button>'
      + '</div>'
      + '</div>'
      + '<div class="filter-date-row">'
      + '<div class="filter-group"><label>Start</label>'
      + '<input type="date" class="form-input form-input-sm" id="compass-date-start" value="' + startVal + '">'
      + '</div>'
      + '<div class="filter-group"><label>End</label>'
      + '<input type="date" class="form-input form-input-sm" id="compass-date-end" value="' + endVal + '">'
      + '</div>'
      + '</div>';

    setTimeout(() => {
      const startEl = document.getElementById('compass-date-start');
      const endEl = document.getElementById('compass-date-end');
      if (startEl) startEl.addEventListener('change', compassOnDateChange);
      if (endEl) endEl.addEventListener('change', compassOnDateChange);
    }, 30);
  }

  function compassOnDateChange() {
    const start = (document.getElementById('compass-date-start') || {}).value || '';
    const end = (document.getElementById('compass-date-end') || {}).value || '';
    if (!start && !end) {
      delete compassPillState.filters['date_range'];
    } else {
      if (start && end && start > end) { showToast('Start date cannot be after end date', 'info'); return; }
      compassPillState.filters['date_range'] = {
        key: 'date_range', label: 'Date', type: 'date_range', startDate: start, endDate: end
      };
    }
    // Update pill text
    const field = COMPASS_PILL_FIELDS[0];
    const pill = document.getElementById('compass-pill-' + field.key);
    if (pill) {
      const valSpan = pill.querySelector('.filter-pill-value');
      if (valSpan) valSpan.textContent = compassGetFilterSummary(field);
    }
    compassDebouncedApply();
  }

  function compassRenderMultiDropdown(dd, field) {
    const values = compassGetAllValues(field);
    const f = compassPillState.filters[field.key];
    const selectedSet = new Set(f ? f.values : values); // default: all selected
    const searchable = field.searchable || values.length > 15;

    let html = '<div class="filter-dropdown-header">';
    html += '<span class="filter-dropdown-title">' + escapeHtml(field.label) + '</span>';

    // Sort buttons (if sortable)
    if (field.sortable) {
      const sortField = COMPASS_PILL_SORT_FIELDS.find(sf => sf.key === field.key);
      if (sortField) {
        const curSort = compassPillState.sort;
        const isAsc = curSort && curSort.key === field.key && curSort.direction === 'asc';
        const isDesc = curSort && curSort.key === field.key && curSort.direction === 'desc';
        html += '<div class="filter-dropdown-sort">'
          + '<button class="filter-sort-btn ' + (isAsc ? 'active-sort' : '') + '" onclick="event.stopPropagation(); compassSetSort(\'' + field.key + '\', \'asc\')" title="Sort A\u2192Z">A\u2191</button>'
          + '<button class="filter-sort-btn ' + (isDesc ? 'active-sort' : '') + '" onclick="event.stopPropagation(); compassSetSort(\'' + field.key + '\', \'desc\')" title="Sort Z\u2192A">Z\u2193</button>'
          + '</div>';
      }
    }
    html += '</div>';

    if (searchable) {
      html += '<div class="filter-dropdown-search"><input type="text" class="form-input form-input-sm" id="compass-dd-search-' + field.key + '" placeholder="Search..." oninput="compassFilterDropdownSearch(\'' + field.key + '\')"></div>';
    }

    // Select All / Deselect All
    html += '<div class="filter-dropdown-actions">'
      + '<button class="filter-action-link" onclick="event.stopPropagation(); compassSelectAll(\'' + field.key + '\')">Select All</button>'
      + '<button class="filter-action-link" onclick="event.stopPropagation(); compassDeselectAll(\'' + field.key + '\')" style="color:#DC2626;">Deselect All</button>'
      + '</div>';

    html += '<div class="filter-dropdown-list" id="compass-dd-list-' + field.key + '">';
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      const checked = selectedSet.has(v) ? 'checked' : '';
      html += '<label class="filter-dropdown-item"><input type="checkbox" value="' + escapeAttr(v) + '" ' + checked + ' onchange="compassOnCheckboxChange(\'' + field.key + '\')"><span>' + escapeHtml(v) + '</span></label>';
    }
    html += '</div>';

    dd.innerHTML = html;

    if (searchable) {
      setTimeout(() => {
        const si = document.getElementById('compass-dd-search-' + field.key);
        if (si) si.focus();
      }, 50);
    }
  }

  // ===== Checkbox / sort handlers =====

  window.compassOnCheckboxChange = function (key) {
    const field = COMPASS_PILL_FIELDS.find(f => f.key === key);
    if (!field) return;
    const listEl = document.getElementById('compass-dd-list-' + key);
    if (!listEl) return;
    const checked = [];
    listEl.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => { checked.push(cb.value); });
    const allValues = compassGetAllValues(field);

    if (checked.length === allValues.length) {
      delete compassPillState.filters[key];
    } else {
      compassPillState.filters[key] = { key, label: field.label, type: 'multi', values: checked, recordKey: field.recordKey };
    }

    // Update pill summary without closing dropdown
    const pill = document.getElementById('compass-pill-' + key);
    if (pill) {
      const valSpan = pill.querySelector('.filter-pill-value');
      if (valSpan) {
        const sortIcon = (compassPillState.sort && compassPillState.sort.key === key)
          ? (compassPillState.sort.direction === 'asc' ? ' \u25B2' : ' \u25BC') : '';
        valSpan.textContent = compassGetFilterSummary(field) + sortIcon;
      }
      if (compassIsFiltered(field)) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    }

    compassDebouncedApply();
  };

  window.compassSetSort = function (key, direction) {
    const curSort = compassPillState.sort;
    if (curSort && curSort.key === key && curSort.direction === direction) {
      compassPillState.sort = null;
    } else {
      const sortField = COMPASS_PILL_SORT_FIELDS.find(sf => sf.key === key);
      compassPillState.sort = { key, direction, recordKey: sortField ? sortField.recordKey : key };
    }
    const wasOpen = compassPillState.openPill;
    compassRenderFilterBar();
    if (wasOpen) {
      compassPillState.openPill = wasOpen;
      compassRenderFilterBar();
      compassRenderDropdown(wasOpen);
    }
    compassDebouncedApply();
  };

  window.compassSelectAll = function (key) {
    const listEl = document.getElementById('compass-dd-list-' + key);
    if (!listEl) return;
    listEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      if (cb.closest('.filter-dropdown-item').style.display !== 'none') cb.checked = true;
    });
    delete compassPillState.filters[key];
    const field = COMPASS_PILL_FIELDS.find(f => f.key === key);
    if (field) {
      const pill = document.getElementById('compass-pill-' + key);
      if (pill) {
        const valSpan = pill.querySelector('.filter-pill-value');
        if (valSpan) valSpan.textContent = 'All';
        pill.classList.remove('active');
      }
    }
    compassDebouncedApply();
  };

  window.compassDeselectAll = function (key) {
    const listEl = document.getElementById('compass-dd-list-' + key);
    if (!listEl) return;
    listEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      if (cb.closest('.filter-dropdown-item').style.display !== 'none') cb.checked = false;
    });
    const stillChecked = [];
    listEl.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => { stillChecked.push(cb.value); });
    const field = COMPASS_PILL_FIELDS.find(f => f.key === key);
    compassPillState.filters[key] = { key, label: field.label, type: 'multi', values: stillChecked, recordKey: field.recordKey };
    const pill = document.getElementById('compass-pill-' + key);
    if (pill) {
      const valSpan = pill.querySelector('.filter-pill-value');
      if (valSpan) valSpan.textContent = stillChecked.length === 0 ? 'None' : stillChecked.length + ' selected';
      pill.classList.add('active');
    }
    compassDebouncedApply();
  };

  window.compassFilterDropdownSearch = function (key) {
    const searchEl = document.getElementById('compass-dd-search-' + key);
    const listEl = document.getElementById('compass-dd-list-' + key);
    if (!searchEl || !listEl) return;
    const q = searchEl.value.toLowerCase();
    listEl.querySelectorAll('.filter-dropdown-item').forEach(item => {
      const text = item.textContent.toLowerCase();
      item.style.display = text.includes(q) ? '' : 'none';
    });
  };

  // ===== Clear all =====

  window.compassClearAllFilters = function () {
    compassClosePill();
    compassPillState.filters = {};
    compassPillState.sort = { key: 'date_range', direction: 'desc', recordKey: 'coaching_date' };
    compassRenderFilterBar();
    compassApplyNow();
  };

  // ===== Apply (instant, debounced) =====

  function compassDebouncedApply() {
    clearTimeout(_compassApplyDebounce);
    _compassApplyDebounce = setTimeout(compassApplyNow, 250);
  }

  function compassApplyNow() {
    compassRenderFilterBar();

    let data = [...COMPASS.logs];

    // Hide QA Feedback logs with active dispute statuses from Coaching Profile
    const QA_DISPUTE_HIDDEN_STATUSES = [
      'Markdown Disputed - SME',
      'Markdown Retained - QA',
      'QA Decision Rejected - SME',
      'Markdown Retained - Trainer',
      'Trainer Decision Rejected - SME',
    ];
    data = data.filter(l => {
      if (l.coaching_type !== 'QA Feedback') return true;
      return !QA_DISPUTE_HIDDEN_STATUSES.includes(l.status);
    });

    // Apply each filter
    Object.values(compassPillState.filters).forEach(f => {
      switch (f.key) {
        case 'date_range': {
          const { startDate, endDate } = f;
          if (startDate) data = data.filter(l => l.coaching_date && l.coaching_date.slice(0, 10) >= startDate);
          if (endDate) data = data.filter(l => l.coaching_date && l.coaching_date.slice(0, 10) <= endDate);
          break;
        }
        default: {
          if (f.type === 'multi' && f.values) {
            const field = COMPASS_PILL_FIELDS.find(fd => fd.key === f.key);
            if (field && field.isMultiValue) {
              // Multi-value field (e.g., session_goal is comma-separated)
              data = data.filter(l => {
                const raw = l[f.recordKey];
                if (!raw) return false;
                const logVals = raw.split(',').map(g => g.trim());
                return f.values.some(v => logVals.includes(v));
              });
            } else {
              data = data.filter(l => f.values.includes(l[f.recordKey]));
            }
          }
          break;
        }
      }
    });

    // Apply sort
    const sort = compassPillState.sort;
    if (sort) {
      data.sort((a, b) => {
        let va = a[sort.recordKey] || '';
        let vb = b[sort.recordKey] || '';
        if (sort.recordKey === 'coaching_date') {
          va = va ? new Date(va).getTime() : 0;
          vb = vb ? new Date(vb).getTime() : 0;
        } else {
          va = String(va).toLowerCase();
          vb = String(vb).toLowerCase();
        }
        if (va < vb) return sort.direction === 'asc' ? -1 : 1;
        if (va > vb) return sort.direction === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      // Default sort: coaching_date desc
      data.sort((a, b) => {
        const da = a.coaching_date ? new Date(a.coaching_date).getTime() : 0;
        const db = b.coaching_date ? new Date(b.coaching_date).getTime() : 0;
        return db - da;
      });
    }

    // Split into given/received based on current user role
    const isAdmin740 = typeof isEffectiveAdmin === 'function' ? isEffectiveAdmin() : (currentUser && currentUser.ohr_id === '740045023');
    const role = typeof getEffectiveRole === 'function' ? getEffectiveRole() : (currentUser ? currentUser.actual_role : '');

    if (isAdmin740 && COMPASS.viewMode === 'tl') {
      // Admin in TL mode — scope to their team like a Team Lead
      const myName = currentUser.full_name;
      const teamOhrs = new Set();
      if (COMPASS.employees && COMPASS.employees.length) {
        COMPASS.employees.forEach(e => {
          if (e.supervisor_name === myName) teamOhrs.add(e.ohr_id);
        });
      }
      teamOhrs.add(currentUser.ohr_id); // include self
      COMPASS.filteredGiven = data.filter(l => teamOhrs.has(l.coachee_ohr));
      COMPASS.filteredReceived = data.filter(l => l.coachee_ohr === currentUser.ohr_id);
    } else if (isAdmin740 || role === 'Manager') {
      // Admin (all mode) + Managers — see ALL coaching logs
      COMPASS.filteredGiven = data;
      COMPASS.filteredReceived = [];
    } else if (role === 'Agent') {
      // Agents — only see logs filed TO them
      COMPASS.filteredGiven = [];
      COMPASS.filteredReceived = data.filter(l => l.coachee_ohr === currentUser.ohr_id);
    } else if (role === 'Team Lead') {
      // Team Leaders — see logs filed to their team (anyone whose supervisor_name matches
      // the TL's full_name) regardless of who the coach is, plus logs filed to them personally.
      const myName = currentUser.full_name;
      const teamOhrs = new Set();
      if (COMPASS.employees && COMPASS.employees.length) {
        COMPASS.employees.forEach(e => {
          if (e.supervisor_name === myName) teamOhrs.add(e.ohr_id);
        });
      }
      teamOhrs.add(currentUser.ohr_id); // include self
      COMPASS.filteredGiven = data.filter(l => teamOhrs.has(l.coachee_ohr));
      COMPASS.filteredReceived = data.filter(l => l.coachee_ohr === currentUser.ohr_id);
    } else if (role === 'Operational SME') {
      // SMEs — see logs filed to their TL's team (supervisor_name of the SME is a TL;
      // the TL's team = all employees whose supervisor_name matches that TL name),
      // plus logs filed to them personally.
      const myTlName = currentUser.supervisor_name || '';
      const teamOhrs = new Set();
      if (COMPASS.employees && COMPASS.employees.length && myTlName) {
        COMPASS.employees.forEach(e => {
          if (e.supervisor_name === myTlName) teamOhrs.add(e.ohr_id);
        });
      }
      teamOhrs.add(currentUser.ohr_id); // include self
      COMPASS.filteredGiven = data.filter(l => teamOhrs.has(l.coachee_ohr));
      COMPASS.filteredReceived = data.filter(l => l.coachee_ohr === currentUser.ohr_id);
    } else if (role === 'Quality & Policy Expert' || role === 'Trainer') {
      // QAs & Trainers — see logs they filed + logs filed to them
      COMPASS.filteredGiven = data.filter(l => l.coach_ohr === currentUser.ohr_id);
      COMPASS.filteredReceived = data.filter(l => l.coachee_ohr === currentUser.ohr_id);
    } else if (currentUser) {
      // Fallback for any other role
      COMPASS.filteredGiven = data.filter(l => l.coach_ohr === currentUser.ohr_id);
      COMPASS.filteredReceived = data.filter(l => l.coachee_ohr === currentUser.ohr_id);
    } else {
      COMPASS.filteredGiven = data;
      COMPASS.filteredReceived = [];
    }

    COMPASS.filtered = [...COMPASS.filteredGiven, ...COMPASS.filteredReceived];

    // Update per-panel counts
    const givenCountEl = document.getElementById('compass-given-count');
    if (givenCountEl) {
      if (COMPASS.givenTab === 'acknowledged') {
        givenCountEl.textContent = COMPASS.filteredGiven.filter(l => compassIsAcknowledged(l)).length;
      } else if (COMPASS.givenTab === 'unacknowledged') {
        givenCountEl.textContent = COMPASS.filteredGiven.filter(l => !compassIsAcknowledged(l)).length;
      } else {
        givenCountEl.textContent = COMPASS.filteredGiven.length;
      }
    }
    const receivedCountEl = document.getElementById('compass-received-count');
    if (receivedCountEl) {
      if (COMPASS.receivedTab === 'acknowledged') {
        receivedCountEl.textContent = COMPASS.filteredReceived.filter(l => compassIsAcknowledged(l)).length;
      } else if (COMPASS.receivedTab === 'unacknowledged') {
        receivedCountEl.textContent = COMPASS.filteredReceived.filter(l => !compassIsAcknowledged(l)).length;
      } else {
        receivedCountEl.textContent = COMPASS.filteredReceived.length;
      }
    }

    // Ack/Unack badge counts
    const ackGiven = COMPASS.filteredGiven.filter(l => compassIsAcknowledged(l));
    const unackGiven = COMPASS.filteredGiven.filter(l => !compassIsAcknowledged(l));
    const ackCountEl = document.getElementById('compass-ack-count');
    const unackCountEl = document.getElementById('compass-unack-count');
    if (ackCountEl) ackCountEl.textContent = ackGiven.length;
    if (unackCountEl) unackCountEl.textContent = unackGiven.length;

    const ackRecv = COMPASS.filteredReceived.filter(l => compassIsAcknowledged(l));
    const unackRecv = COMPASS.filteredReceived.filter(l => !compassIsAcknowledged(l));
    const recvAckCountEl = document.getElementById('compass-recv-ack-count');
    const recvUnackCountEl = document.getElementById('compass-recv-unack-count');
    if (recvAckCountEl) recvAckCountEl.textContent = ackRecv.length;
    if (recvUnackCountEl) recvUnackCountEl.textContent = unackRecv.length;

    // Hide Given panel for agents
    const isAgent = role === 'Agent' && !isAdmin740 && !(typeof isEffectiveAdmin === 'function' && isEffectiveAdmin());
    const dualTables = document.getElementById('compass-dual-tables');
    if (dualTables) {
      const panels = dualTables.querySelectorAll('.compass-table-panel');
      if (isAgent && panels[0]) {
        panels[0].style.display = 'none';
        dualTables.style.gridTemplateColumns = '1fr';
      } else if (panels[0]) {
        panels[0].style.display = '';
        dualTables.style.gridTemplateColumns = '';
      }
    }

    // Reset pages and render
    COMPASS.pageGiven = 1;
    COMPASS.pageReceived = 1;
    compassRenderTable('given');
    compassRenderTable('received');
    if (typeof compassRenderStats === 'function') compassRenderStats();
  }

  // ===== Outside click =====

  function _attachCompassOutsideClick() {
    if (_compassOutsideListener) return;
    setTimeout(() => {
      _compassOutsideListener = function (e) {
        const bar = document.getElementById('compass-filter-bar');
        if (bar && bar.contains(e.target)) return;
        compassClosePill();
      };
      document.addEventListener('mousedown', _compassOutsideListener);
    }, 10);
  }

  function _detachCompassOutsideClick() {
    if (_compassOutsideListener) {
      document.removeEventListener('mousedown', _compassOutsideListener);
      _compassOutsideListener = null;
    }
  }

  // ===== Override compassApplyFilters to use pill bar =====
  const _origCompassApplyFilters = window.compassApplyFilters;
  window.compassApplyFilters = function () {
    const filterBar = document.getElementById('compass-filter-bar');
    if (filterBar) {
      compassApplyNow();
    } else if (_origCompassApplyFilters) {
      _origCompassApplyFilters();
    }
  };

  // ===== Expose for HTML onclick handlers =====
  window.compassTogglePill = window.compassTogglePill;
  window.compassClearAllFilters = window.compassClearAllFilters;

  // ===== escapeAttr helper (if not already global) =====
  if (typeof window.escapeAttr !== 'function') {
    window.escapeAttr = function (s) {
      return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };
  }

})();
