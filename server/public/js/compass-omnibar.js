/**
 * Compass Omnibar — chip-based filter/sort builder for Coaching Profile
 * Mirrors the Input Portal omnibar pattern but operates on COMPASS.logs
 */

(function () {
  'use strict';

  // ===== State =====
  const COMPASS_OMNI = {
    filters: [],   // { field, operator, value, label }
    sorts: [],     // { field, direction, label }
    menuType: null, // 'filter' | 'sort' | null
    menuStep: null, // 'field' | 'value'
    pendingField: null,
    outsideHandler: null,
  };

  // ===== Filter definitions =====
  const COMPASS_FILTER_FIELDS = [
    { key: 'dateRange',  label: 'Date Range',   type: 'dateRange' },
    { key: 'type',       label: 'Type',         type: 'select', options: () => [...new Set(COMPASS.logs.map(l => l.coaching_type).filter(Boolean))].sort() },
    { key: 'status',     label: 'Status',       type: 'select', options: () => [...new Set(COMPASS.logs.map(l => l.status).filter(Boolean))].sort() },
    { key: 'coach',      label: 'Coach',        type: 'select', options: () => [...new Set(COMPASS.logs.map(l => l.coach).filter(Boolean))].sort() },
    { key: 'coachee',    label: 'Coachee',      type: 'select', options: () => [...new Set(COMPASS.logs.map(l => l.coachee).filter(Boolean))].sort() },
    { key: 'sessionGoal',label: 'Session Goal',  type: 'multi',  options: () => {
      const goals = new Set();
      COMPASS.logs.forEach(l => { if (l.session_goal) l.session_goal.split(',').forEach(g => { const t = g.trim(); if (t) goals.add(t); }); });
      return [...goals].sort();
    }},
    { key: 'search',     label: 'Search',       type: 'text' },
  ];

  const COMPASS_SORT_FIELDS = [
    { key: 'coaching_date', label: 'Date' },
    { key: 'coaching_type', label: 'Type' },
    { key: 'coach',         label: 'Coach' },
    { key: 'coachee',       label: 'Coachee' },
    { key: 'status',        label: 'Status' },
  ];

  // ===== Menu open/close =====

  function compassOmnibarOpenMenu(type) {
    COMPASS_OMNI.menuType = type;
    COMPASS_OMNI.menuStep = 'field';
    COMPASS_OMNI.pendingField = null;
    renderMenu();

    // Deferred outside-click listener
    if (COMPASS_OMNI.outsideHandler) {
      document.removeEventListener('mousedown', COMPASS_OMNI.outsideHandler, true);
    }
    setTimeout(() => {
      COMPASS_OMNI.outsideHandler = function (e) {
        const menu = document.getElementById('compass-omnibar-menu');
        if (menu && !menu.contains(e.target)) {
          compassOmnibarCloseMenu();
        }
      };
      document.addEventListener('mousedown', COMPASS_OMNI.outsideHandler, true);
    }, 10);
  }

  function compassOmnibarCloseMenu() {
    const menu = document.getElementById('compass-omnibar-menu');
    if (menu) menu.style.display = 'none';
    COMPASS_OMNI.menuType = null;
    COMPASS_OMNI.menuStep = null;
    COMPASS_OMNI.pendingField = null;
    if (COMPASS_OMNI.outsideHandler) {
      document.removeEventListener('mousedown', COMPASS_OMNI.outsideHandler, true);
      COMPASS_OMNI.outsideHandler = null;
    }
  }

  // ===== Menu rendering =====

  function renderMenu() {
    const menu = document.getElementById('compass-omnibar-menu');
    if (!menu) return;

    if (COMPASS_OMNI.menuType === 'filter' && COMPASS_OMNI.menuStep === 'field') {
      // Show available filter fields (exclude already-active ones, except multi/text which can repeat)
      const activeKeys = new Set(COMPASS_OMNI.filters.map(f => f.field));
      const available = COMPASS_FILTER_FIELDS.filter(f => !activeKeys.has(f.key) || f.type === 'multi' || f.type === 'text');
      menu.innerHTML = '<div class="omnibar-menu-title">Add Filter</div>' +
        available.map(f => `<button class="omnibar-menu-item" onmousedown="event.stopPropagation()" onclick="event.stopPropagation();compassOmnibarSelectFilterField('${f.key}')">${escapeHtml(f.label)}</button>`).join('');
      menu.style.display = 'block';
    } else if (COMPASS_OMNI.menuType === 'filter' && COMPASS_OMNI.menuStep === 'value') {
      renderFilterValueMenu();
    } else if (COMPASS_OMNI.menuType === 'sort') {
      const activeKeys = new Set(COMPASS_OMNI.sorts.map(s => s.field));
      const available = COMPASS_SORT_FIELDS.filter(s => !activeKeys.has(s.key));
      menu.innerHTML = '<div class="omnibar-menu-title">Add Sort</div>' +
        available.map(s => `
          <button class="omnibar-menu-item" onmousedown="event.stopPropagation()" onclick="event.stopPropagation();compassOmnibarAddSort('${s.key}','asc')">
            ${escapeHtml(s.label)} ↑ Ascending
          </button>
          <button class="omnibar-menu-item" onmousedown="event.stopPropagation()" onclick="event.stopPropagation();compassOmnibarAddSort('${s.key}','desc')">
            ${escapeHtml(s.label)} ↓ Descending
          </button>
        `).join('');
      menu.style.display = 'block';
    }
  }

  function renderFilterValueMenu() {
    const menu = document.getElementById('compass-omnibar-menu');
    if (!menu) return;
    const fieldDef = COMPASS_FILTER_FIELDS.find(f => f.key === COMPASS_OMNI.pendingField);
    if (!fieldDef) { compassOmnibarCloseMenu(); return; }

    if (fieldDef.type === 'dateRange') {
      menu.innerHTML = `
        <div class="omnibar-menu-title">Date Range</div>
        <div class="omnibar-date-picker">
          <div class="filter-group">
            <label class="filter-label">Start:</label>
            <input type="date" class="form-input form-input-sm" id="compass-omni-date-start">
          </div>
          <div class="filter-group">
            <label class="filter-label">End:</label>
            <input type="date" class="form-input form-input-sm" id="compass-omni-date-end">
          </div>
          <button class="btn btn-primary btn-sm" onmousedown="event.stopPropagation()" onclick="event.stopPropagation();compassOmnibarAddDateRange()">Add</button>
        </div>`;
      menu.style.display = 'block';
    } else if (fieldDef.type === 'select') {
      const options = fieldDef.options();
      menu.innerHTML = `
        <div class="omnibar-menu-title">${escapeHtml(fieldDef.label)}</div>
        <div style="padding:4px 8px;"><input type="text" class="form-input form-input-sm" placeholder="Search..." oninput="compassOmnibarFilterMenuItems(this)" style="width:100%;"></div>
        <div class="omnibar-menu-scroll" style="max-height:220px;overflow-y:auto;">
          ${options.map(o => `<button class="omnibar-menu-item" data-search="${escapeAttr(o.toLowerCase())}" onmousedown="event.stopPropagation()" onclick="event.stopPropagation();compassOmnibarAddSelectFilter('${escapeAttr(COMPASS_OMNI.pendingField)}','${escapeAttr(o)}')">${escapeHtml(o)}</button>`).join('')}
        </div>`;
      menu.style.display = 'block';
    } else if (fieldDef.type === 'multi') {
      const options = fieldDef.options();
      menu.innerHTML = `
        <div class="omnibar-menu-title">${escapeHtml(fieldDef.label)}</div>
        <div style="padding:4px 8px;"><input type="text" class="form-input form-input-sm" placeholder="Search..." oninput="compassOmnibarFilterMenuItems(this)" style="width:100%;"></div>
        <div class="omnibar-menu-scroll" style="max-height:220px;overflow-y:auto;">
          ${options.map(o => `<label class="omnibar-menu-check" data-search="${escapeAttr(o.toLowerCase())}" style="display:flex;align-items:center;gap:6px;padding:6px 12px;font-size:12px;cursor:pointer;">
            <input type="checkbox" value="${escapeAttr(o)}"> ${escapeHtml(o)}
          </label>`).join('')}
        </div>
        <div style="padding:6px 8px;border-top:1px solid var(--border-default);">
          <button class="btn btn-primary btn-xs" onmousedown="event.stopPropagation()" onclick="event.stopPropagation();compassOmnibarAddMultiFilter()">Add Selected</button>
        </div>`;
      menu.style.display = 'block';
    } else if (fieldDef.type === 'text') {
      menu.innerHTML = `
        <div class="omnibar-menu-title">Search</div>
        <div style="padding:8px 12px;display:flex;gap:6px;">
          <input type="text" id="compass-omni-search-input" class="form-input form-input-sm" placeholder="Type keyword..." style="flex:1;">
          <button class="btn btn-primary btn-xs" onmousedown="event.stopPropagation()" onclick="event.stopPropagation();compassOmnibarAddTextFilter()">Add</button>
        </div>`;
      menu.style.display = 'block';
    }
  }

  // ===== Filter/Sort add handlers =====

  window.compassOmnibarSelectFilterField = function (key) {
    COMPASS_OMNI.pendingField = key;
    COMPASS_OMNI.menuStep = 'value';
    renderMenu();
  };

  window.compassOmnibarAddDateRange = function () {
    const start = document.getElementById('compass-omni-date-start')?.value || '';
    const end = document.getElementById('compass-omni-date-end')?.value || '';
    if (!start && !end) return;
    // Remove existing dateRange filter
    COMPASS_OMNI.filters = COMPASS_OMNI.filters.filter(f => f.field !== 'dateRange');
    const label = start && end ? `${start} → ${end}` : start ? `From ${start}` : `Until ${end}`;
    COMPASS_OMNI.filters.push({ field: 'dateRange', value: { start, end }, label: `Date: ${label}` });
    compassOmnibarCloseMenu();
    compassOmnibarApply();
  };

  window.compassOmnibarAddSelectFilter = function (field, value) {
    // Remove existing filter for this field
    COMPASS_OMNI.filters = COMPASS_OMNI.filters.filter(f => f.field !== field);
    const fieldDef = COMPASS_FILTER_FIELDS.find(f => f.key === field);
    COMPASS_OMNI.filters.push({ field, value, label: `${fieldDef?.label || field}: ${value}` });
    compassOmnibarCloseMenu();
    compassOmnibarApply();
  };

  window.compassOmnibarAddMultiFilter = function () {
    const menu = document.getElementById('compass-omnibar-menu');
    if (!menu) return;
    const checked = menu.querySelectorAll('.omnibar-menu-check input:checked');
    const values = Array.from(checked).map(cb => cb.value);
    if (values.length === 0) return;
    const field = COMPASS_OMNI.pendingField;
    // Remove existing filter for this field
    COMPASS_OMNI.filters = COMPASS_OMNI.filters.filter(f => f.field !== field);
    const fieldDef = COMPASS_FILTER_FIELDS.find(f => f.key === field);
    const label = values.length <= 2 ? values.join(', ') : `${values.length} selected`;
    COMPASS_OMNI.filters.push({ field, value: values, label: `${fieldDef?.label || field}: ${label}` });
    compassOmnibarCloseMenu();
    compassOmnibarApply();
  };

  window.compassOmnibarAddTextFilter = function () {
    const input = document.getElementById('compass-omni-search-input');
    const val = (input?.value || '').trim();
    if (!val) return;
    // Remove existing search filter
    COMPASS_OMNI.filters = COMPASS_OMNI.filters.filter(f => f.field !== 'search');
    COMPASS_OMNI.filters.push({ field: 'search', value: val, label: `Search: "${val}"` });
    compassOmnibarCloseMenu();
    compassOmnibarApply();
  };

  window.compassOmnibarAddSort = function (field, direction) {
    COMPASS_OMNI.sorts = COMPASS_OMNI.sorts.filter(s => s.field !== field);
    const fieldDef = COMPASS_SORT_FIELDS.find(f => f.key === field);
    COMPASS_OMNI.sorts.push({ field, direction, label: `${fieldDef?.label || field} ${direction === 'asc' ? '↑' : '↓'}` });
    compassOmnibarCloseMenu();
    compassOmnibarApply();
  };

  // ===== Remove chip =====

  window.compassOmnibarRemoveFilter = function (idx) {
    COMPASS_OMNI.filters.splice(idx, 1);
    compassOmnibarApply();
  };

  window.compassOmnibarEditSort = function (idx) {
    const sort = COMPASS_OMNI.sorts[idx];
    if (!sort) return;
    sort.direction = sort.direction === 'asc' ? 'desc' : 'asc';
    const fieldDef = COMPASS_SORT_FIELDS.find(f => f.key === sort.field);
    sort.label = `${fieldDef?.label || sort.field} ${sort.direction === 'asc' ? '\u2191' : '\u2193'}`;
    compassOmnibarApply();
  };

  window.compassOmnibarRemoveSort = function (idx) {
    COMPASS_OMNI.sorts.splice(idx, 1);
    compassOmnibarApply();
  };

  window.compassOmnibarClearAll = function () {
    COMPASS_OMNI.filters = [];
    COMPASS_OMNI.sorts = [];
    compassOmnibarCloseMenu();
    compassOmnibarApply();
  };

  // ===== Search helper for menu items =====

  window.compassOmnibarFilterMenuItems = function (input) {
    const query = (input.value || '').toLowerCase().trim();
    const container = input.closest('.omnibar-menu');
    if (!container) return;
    const items = container.querySelectorAll('.omnibar-menu-item[data-search], .omnibar-menu-check[data-search]');
    items.forEach(el => {
      el.style.display = (el.dataset.search || '').includes(query) ? '' : 'none';
    });
  };

  // ===== Render chips =====

  window.compassOmnibarEditFilter = function (idx) {
    const f = COMPASS_OMNI.filters[idx];
    if (!f) return;
    const fieldDef = COMPASS_FILTER_FIELDS.find(fd => fd.key === f.field);
    if (!fieldDef) return;
    COMPASS_OMNI.pendingField = f.field;
    COMPASS_OMNI.menuType = 'filter';
    COMPASS_OMNI.menuStep = 'value';
    COMPASS_OMNI._editingIdx = idx;
    renderMenu();
    if (COMPASS_OMNI.outsideHandler) {
      document.removeEventListener('mousedown', COMPASS_OMNI.outsideHandler, true);
    }
    setTimeout(() => {
      COMPASS_OMNI.outsideHandler = function (e) {
        const menu = document.getElementById('compass-omnibar-menu');
        if (menu && !menu.contains(e.target)) compassOmnibarCloseMenu();
      };
      document.addEventListener('mousedown', COMPASS_OMNI.outsideHandler, true);
    }, 10);
    setTimeout(() => {
      if (fieldDef.type === 'dateRange' && f.value) {
        const startEl = document.getElementById('compass-omni-date-start');
        const endEl = document.getElementById('compass-omni-date-end');
        if (startEl) startEl.value = f.value.start || '';
        if (endEl) endEl.value = f.value.end || '';
      } else if (fieldDef.type === 'multi' && Array.isArray(f.value)) {
        const checkboxes = document.querySelectorAll('.omnibar-menu-check input[type="checkbox"]');
        checkboxes.forEach(cb => { if (f.value.includes(cb.value)) cb.checked = true; });
      }
    }, 60);
  };

  function renderChips() {
    const container = document.getElementById('compass-omnibar-chips');
    if (!container) return;
    let html = '';

    COMPASS_OMNI.filters.forEach((f, i) => {
      html += `<span class="omnibar-chip omnibar-chip-filter">
        <span class="omnibar-chip-label chip-text-editable" onclick="compassOmnibarEditFilter(${i})" title="Click to edit">${escapeHtml(f.label)}</span>
        <button class="omnibar-chip-remove" onclick="compassOmnibarRemoveFilter(${i})">&times;</button>
      </span>`;
    });

    COMPASS_OMNI.sorts.forEach((s, i) => {
      html += `<span class="omnibar-chip omnibar-chip-sort">
        <span class="omnibar-chip-label chip-text-editable" onclick="compassOmnibarEditSort(${i})" title="Click to toggle direction">${escapeHtml(s.label)}</span>
        <button class="omnibar-chip-remove" onclick="compassOmnibarRemoveSort(${i})">&times;</button>
      </span>`;
    });

    container.innerHTML = html;
  }

  // ===== Apply filters & sorts to COMPASS data =====

  function compassOmnibarApply() {
    renderChips();

    let data = [...COMPASS.logs];

    // Apply each filter
    COMPASS_OMNI.filters.forEach(f => {
      switch (f.field) {
        case 'dateRange': {
          const { start, end } = f.value;
          if (start) data = data.filter(l => l.coaching_date && l.coaching_date.slice(0, 10) >= start);
          if (end) data = data.filter(l => l.coaching_date && l.coaching_date.slice(0, 10) <= end);
          break;
        }
        case 'type':
          data = data.filter(l => l.coaching_type === f.value);
          break;
        case 'status':
          data = data.filter(l => l.status === f.value);
          break;
        case 'coach':
          data = data.filter(l => l.coach === f.value);
          break;
        case 'coachee':
          data = data.filter(l => l.coachee === f.value);
          break;
        case 'sessionGoal': {
          const goals = Array.isArray(f.value) ? f.value : [f.value];
          data = data.filter(l => {
            if (!l.session_goal) return false;
            const logGoals = l.session_goal.split(',').map(g => g.trim());
            return goals.some(g => logGoals.includes(g));
          });
          break;
        }
        case 'search': {
          const q = f.value.toLowerCase();
          data = data.filter(l =>
            (l.coachee || '').toLowerCase().includes(q) ||
            (l.coach || '').toLowerCase().includes(q) ||
            (l.coachee_ohr || '').includes(q) ||
            String(l.coaching_id || l.id || '').toLowerCase().includes(q)
          );
          break;
        }
      }
    });

    // Apply sorts
    if (COMPASS_OMNI.sorts.length > 0) {
      data.sort((a, b) => {
        for (const s of COMPASS_OMNI.sorts) {
          let va = a[s.field] || '';
          let vb = b[s.field] || '';
          if (s.field === 'coaching_date') {
            va = va ? new Date(va).getTime() : 0;
            vb = vb ? new Date(vb).getTime() : 0;
          } else {
            va = String(va).toLowerCase();
            vb = String(vb).toLowerCase();
          }
          if (va < vb) return s.direction === 'asc' ? -1 : 1;
          if (va > vb) return s.direction === 'asc' ? 1 : -1;
        }
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

    // Split into given/received based on current user
    const isAgent = currentUser && currentUser.actual_role === 'Agent' && currentUser.ohr_id !== '740045032';

    if (isAgent) {
      COMPASS.filteredGiven = [];
      COMPASS.filteredReceived = data.filter(l => l.coachee_ohr === currentUser.ohr_id);
    } else if (currentUser) {
      COMPASS.filteredGiven = data.filter(l => l.coach_ohr === currentUser.ohr_id);
      COMPASS.filteredReceived = data.filter(l => l.coachee_ohr === currentUser.ohr_id);
    } else {
      COMPASS.filteredGiven = data;
      COMPASS.filteredReceived = [];
    }

    COMPASS.filtered = [...COMPASS.filteredGiven, ...COMPASS.filteredReceived];

    // Update count
    const countEl = document.getElementById('compass-filtered-count');
    if (countEl) countEl.textContent = COMPASS.filteredGiven.length + COMPASS.filteredReceived.length;

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
  }

  // ===== Override compassApplyFilters to use omnibar =====
  // The original compassApplyFilters reads from DOM inputs.
  // We override it to delegate to the omnibar apply if omnibar is present.
  const _origCompassApplyFilters = window.compassApplyFilters;
  window.compassApplyFilters = function () {
    const omnibar = document.getElementById('compass-omnibar');
    if (omnibar) {
      // If no filters set yet (initial load), just apply with empty filters
      compassOmnibarApply();
    } else if (_origCompassApplyFilters) {
      _origCompassApplyFilters();
    }
  };

  // Expose for HTML onclick handlers
  window.compassOmnibarOpenMenu = compassOmnibarOpenMenu;
  window.compassOmnibarCloseMenu = compassOmnibarCloseMenu;

})();
