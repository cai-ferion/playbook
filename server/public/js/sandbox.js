/**
 * Sandbox — Insights Tracker (2 Sub-pages)
 * Sub-page 1: Input Portal — submit & browse insights (My Submissions / Team view)
 * Sub-page 2: Review Area — Kanban board for Support/Trainer review workflow
 *
 * Overhaul: inline New Insight panel, inline row expansion detail,
 *           refreshed Kanban, agent-only status+comments review history,
 *           compact 2x5 Job IDs grid, stats strip, polished omnibar
 */

var _sandboxAttachedFiles = [];

const SANDBOX_MOD = {
  insights: [],
  filtered: [],
  employees: [],
  currentSubpage: 'input',
  page: 1,
  pageSize: 25,
  editingId: null,
  expandedId: null,       // inline row expansion tracking
  _context: 'input',
  _inlineFormOpen: false,  // inline new insight form state
  _reviewExpandedId: null, // inline card expansion in Review Area
  _reviewSearch: '',       // Review Area search query
  _reviewPgFilter: '',     // Review Area Planning Group filter
  _reviewTeamToggle: 'all', // Review Area All|My Team toggle (admin only)
  _inputTeamToggle: 'all', // Input Portal All|My Team toggle (admin only)

  STATUSES: [
    'Pending - Initial Review',
    'Pending - Final Review',
    'Elevated - Task in Progress',
    'Elevated - POC Rejected',
    'Elevated - Pending POC Discussion',
    'Elevated - No POC',
    'Implemented',
    'Rejected - Initial Review [Duplicate]',
    'Rejected - Initial Review [Insufficient Context/Details]',
    'Rejected - Initial Review [Out of Scope]',
    'Rejected - Initial Review [Pitched Already]',
    'Rejected - Final Review [Duplicate]',
    'Rejected - Final Review [Insufficient Context/Details]',
    'Rejected - Final Review [Out of Scope]',
    'Rejected - Final Review [Pitched Already]'
  ],

  STATUS_COLORS: {
    'Pending - Initial Review': '#3B82F6',
    'Pending - Final Review': '#F59E0B',
    'Approved - Final Review': '#10B981',
    'Implemented': '#7C3AED',
    'Elevated - Task in Progress': '#8B5CF6',
    'Elevated - POC Rejected': '#EF4444',
    'Elevated - Pending POC Discussion': '#EC4899',
    'Elevated - No POC': '#6B7280'
  },

  KANBAN_COLUMNS: [
    { id: 'pending-initial', title: 'Pending Initial Review', statuses: ['Pending - Initial Review'] },
    { id: 'rejected-initial', title: 'Rejected (Initial)', statuses: ['Rejected - Initial Review [Insufficient Context/Details]', 'Rejected - Initial Review [Duplicate]', 'Rejected - Initial Review [Out of Scope]', 'Rejected - Initial Review [Pitched Already]'] },
    { id: 'pending-final', title: 'Pending Final Review', statuses: ['Pending - Final Review'] },
    { id: 'rejected-final', title: 'Rejected (Final)', statuses: ['Rejected - Final Review [Insufficient Context/Details]', 'Rejected - Final Review [Pitched Already]', 'Rejected - Final Review [Out of Scope]', 'Rejected - Final Review [Duplicate]'] },
    { id: 'trainers-area', title: "Trainer's Area", statuses: ['Approved - Final Review', 'Elevated - Task in Progress', 'Elevated - POC Rejected', 'Elevated - Pending POC Discussion', 'Elevated - No POC'] },
    { id: 'implemented', title: 'Implemented', statuses: ['Implemented'] }
  ]
};

function sandboxGetStatusColor(status) {
  if (!status) return 'var(--fg-subtle)';
  if (SANDBOX_MOD.STATUS_COLORS[status]) return SANDBOX_MOD.STATUS_COLORS[status];
  if (status.startsWith('Rejected')) return '#EF4444';
  return 'var(--fg-subtle)';
}

// ===== Omnibar for Input Portal =====

const sandboxOmniState = {
  filters: [],
  sorts: [],
  menuOpen: false,
  menuType: null,
  menuStep: null,
  pendingField: null,
  pendingOp: null
};

const SANDBOX_OMNI_FIELDS = [
  { key: 'insight_id', label: 'Insight ID', type: 'text' },
  { key: 'title', label: 'Title', type: 'text' },
  { key: 'category', label: 'Category', type: 'multi', optionsFn: () => [...new Set(SANDBOX_MOD.insights.map(i => i.category || i.insight_category).filter(Boolean))].sort() },
  { key: 'proposal_type', label: 'Proposal Type', type: 'multi', optionsFn: () => [...new Set(SANDBOX_MOD.insights.map(i => i.proposal_type).filter(Boolean))].sort() },
  { key: 'status', label: 'Status', type: 'multi', optionsFn: () => [...new Set(SANDBOX_MOD.insights.map(i => i.status).filter(Boolean))].sort() },
  { key: 'created_at', label: 'Created Date', type: 'date' }
];

const SANDBOX_DEFAULT_SORT = { field: 'created_at', dir: 'desc' };
const SANDBOX_SORT_FIELDS = [
  { key: 'insight_id', label: 'Insight ID' },
  { key: 'title', label: 'Title' },
  { key: 'category', label: 'Category' },
  { key: 'status', label: 'Status' },
  { key: 'created_at', label: 'Created Date' }
];

function sandboxOmnibarOpenMenu(type) {
  sandboxOmniState.menuOpen = true;
  sandboxOmniState.menuType = type;
  sandboxOmniState.menuStep = 'field';
  sandboxOmniState.pendingField = null;
  sandboxOmniState.pendingOp = null;
  sandboxRenderOmniMenu();
}

function sandboxRenderOmniMenu() {
  const menu = document.getElementById('sandbox-omnibar-menu');
  if (!menu) return;
  if (!sandboxOmniState.menuOpen) { menu.style.display = 'none'; return; }
  menu.style.display = 'block';

  if (sandboxOmniState.menuType === 'sort') {
    menu.innerHTML = `<div class="omnibar-menu-title">Sort by</div>` +
      SANDBOX_SORT_FIELDS.map(f => `<button class="omnibar-menu-item" onclick="sandboxOmniAddSort('${f.key}','asc')">${f.label} (A-Z)</button><button class="omnibar-menu-item" onclick="sandboxOmniAddSort('${f.key}','desc')">${f.label} (Z-A)</button>`).join('');
    return;
  }

  if (sandboxOmniState.menuStep === 'field') {
    menu.innerHTML = `<div class="omnibar-menu-title">Filter by</div>` +
      SANDBOX_OMNI_FIELDS.map(f => `<button class="omnibar-menu-item" onclick="sandboxOmniSelectField('${f.key}')">${f.label}</button>`).join('');
    return;
  }

  const field = SANDBOX_OMNI_FIELDS.find(f => f.key === sandboxOmniState.pendingField);
  if (!field) { menu.style.display = 'none'; return; }

  if (field.type === 'text') {
    menu.innerHTML = `<div class="omnibar-menu-title">Filter: ${field.label}</div>
      <div style="padding:8px;"><input type="text" class="form-input form-input-sm" id="sandbox-omni-text-val" placeholder="Type to filter..." autofocus>
      <div style="margin-top:8px;display:flex;gap:6px;"><button class="btn btn-primary btn-xs" onclick="sandboxOmniAddTextFilter()">Apply</button><button class="btn btn-ghost btn-xs" onclick="sandboxOmniCloseMenu()">Cancel</button></div></div>`;
    setTimeout(() => document.getElementById('sandbox-omni-text-val')?.focus(), 50);
    return;
  }

  if (field.type === 'date') {
    menu.innerHTML = `<div class="omnibar-menu-title">Filter: ${field.label}</div>
      <div style="padding:8px;"><label style="font-size:12px;">From</label><input type="date" class="form-input form-input-sm" id="sandbox-omni-date-from">
      <label style="font-size:12px;margin-top:6px;display:block;">To</label><input type="date" class="form-input form-input-sm" id="sandbox-omni-date-to">
      <div style="margin-top:8px;display:flex;gap:6px;"><button class="btn btn-primary btn-xs" onclick="sandboxOmniAddDateFilter()">Apply</button><button class="btn btn-ghost btn-xs" onclick="sandboxOmniCloseMenu()">Cancel</button></div></div>`;
    return;
  }

  if (field.type === 'multi') {
    const options = field.optionsFn ? field.optionsFn() : [];
    menu.innerHTML = `<div class="omnibar-menu-title">Filter: ${field.label}</div>
      <div style="padding:8px;max-height:250px;overflow-y:auto;">
      ${options.map(o => `<label style="display:flex;align-items:center;gap:6px;padding:4px 0;font-size:13px;cursor:pointer;"><input type="checkbox" value="${escapeAttr(o)}" class="sandbox-omni-multi-cb"> ${escapeHtml(o)}</label>`).join('')}
      <div style="margin-top:8px;display:flex;gap:6px;"><button class="btn btn-primary btn-xs" onclick="sandboxOmniAddMultiFilter()">Apply</button><button class="btn btn-ghost btn-xs" onclick="sandboxOmniCloseMenu()">Cancel</button></div></div>`;
    return;
  }
}

function sandboxOmniSelectField(key) {
  sandboxOmniState.pendingField = key;
  sandboxOmniState.menuStep = 'value';
  sandboxRenderOmniMenu();
}

function sandboxOmniAddTextFilter() {
  const val = document.getElementById('sandbox-omni-text-val')?.value?.trim();
  if (!val) return;
  sandboxOmniState.filters.push({ field: sandboxOmniState.pendingField, op: 'contains', value: val });
  sandboxOmniCloseMenu();
  sandboxOmniRenderChips();
  sandboxOmniApply();
}

function sandboxOmniAddDateFilter() {
  const from = document.getElementById('sandbox-omni-date-from')?.value;
  const to = document.getElementById('sandbox-omni-date-to')?.value;
  if (!from && !to) return;
  sandboxOmniState.filters.push({ field: sandboxOmniState.pendingField, op: 'dateRange', value: { from, to } });
  sandboxOmniCloseMenu();
  sandboxOmniRenderChips();
  sandboxOmniApply();
}

function sandboxOmniAddMultiFilter() {
  const checked = [...document.querySelectorAll('.sandbox-omni-multi-cb:checked')].map(cb => cb.value);
  if (checked.length === 0) return;
  sandboxOmniState.filters.push({ field: sandboxOmniState.pendingField, op: 'in', value: checked });
  sandboxOmniCloseMenu();
  sandboxOmniRenderChips();
  sandboxOmniApply();
}

function sandboxOmniAddSort(key, dir) {
  sandboxOmniState.sorts = sandboxOmniState.sorts.filter(s => s.key !== key);
  sandboxOmniState.sorts.push({ key, dir });
  sandboxOmniCloseMenu();
  sandboxOmniRenderChips();
  sandboxOmniApply();
}

function sandboxOmniCloseMenu() {
  sandboxOmniState.menuOpen = false;
  const menu = document.getElementById('sandbox-omnibar-menu');
  if (menu) menu.style.display = 'none';
}

function sandboxOmniEditFilter(idx) {
  const f = sandboxOmniState.filters[idx];
  if (!f) return;
  sandboxOmniState.pendingField = f.field;
  sandboxOmniState.menuOpen = true;
  sandboxOmniState.menuType = 'filter';
  sandboxOmniState.menuStep = 'value';
  sandboxOmniState._editingIdx = idx;
  sandboxRenderOmniMenu();
  setTimeout(() => {
    if (f.op === 'contains') {
      const inp = document.getElementById('sandbox-omni-text-val');
      if (inp) inp.value = f.value || '';
    } else if (f.op === 'dateRange' && f.value) {
      const fromEl = document.getElementById('sandbox-omni-date-from');
      const toEl = document.getElementById('sandbox-omni-date-to');
      if (fromEl) fromEl.value = f.value.from || '';
      if (toEl) toEl.value = f.value.to || '';
    } else if (f.op === 'in' && Array.isArray(f.value)) {
      const checkboxes = document.querySelectorAll('.sandbox-omni-multi-cb');
      checkboxes.forEach(cb => { if (f.value.includes(cb.value)) cb.checked = true; });
    }
  }, 60);
}

function sandboxOmniRenderChips() {
  const container = document.getElementById('sandbox-omnibar-chips');
  if (!container) return;
  let html = '';
  sandboxOmniState.filters.forEach((f, i) => {
    const field = SANDBOX_OMNI_FIELDS.find(fd => fd.key === f.field);
    const label = field ? field.label : f.field;
    let valStr = '';
    if (f.op === 'contains') valStr = `contains "${f.value}"`;
    else if (f.op === 'in') valStr = `is ${f.value.join(', ')}`;
    else if (f.op === 'dateRange') valStr = `${f.value.from || '...'} to ${f.value.to || '...'}`;
    html += `<span class="omnibar-chip filter-chip"><span class="chip-text-editable" onclick="sandboxOmniEditFilter(${i})" title="Click to edit">${escapeHtml(label)}: ${escapeHtml(valStr)}</span> <button class="chip-remove" onclick="sandboxOmniRemoveFilter(${i})">&times;</button></span>`;
  });
  sandboxOmniState.sorts.forEach((s, i) => {
    const field = SANDBOX_SORT_FIELDS.find(fd => fd.key === s.key);
    const label = field ? field.label : s.key;
    html += `<span class="omnibar-chip sort-chip"><span class="chip-text-editable" onclick="sandboxOmniEditSort(${i})" title="Click to toggle direction">${escapeHtml(label)} ${s.dir === 'asc' ? '↑' : '↓'}</span> <button class="chip-remove" onclick="sandboxOmniRemoveSort(${i})">&times;</button></span>`;
  });
  container.innerHTML = html;
}

function sandboxOmniRemoveFilter(idx) {
  sandboxOmniState.filters.splice(idx, 1);
  sandboxOmniRenderChips();
  sandboxOmniApply();
}

function sandboxOmniRemoveSort(idx) {
  sandboxOmniState.sorts.splice(idx, 1);
  sandboxOmniRenderChips();
  sandboxOmniApply();
}

function sandboxOmniEditSort(idx) {
  const s = sandboxOmniState.sorts[idx];
  if (s) s.dir = s.dir === 'asc' ? 'desc' : 'asc';
  sandboxOmniRenderChips();
  sandboxOmniApply();
}

function sandboxOmnibarClearAll() {
  sandboxOmniState.filters = [];
  sandboxOmniState.sorts = [];
  sandboxOmniRenderChips();
  sandboxOmniApply();
}

// ===== Omnibar Apply (filter + sort) =====

function sandboxOmniApply() {
  let data = [...SANDBOX_MOD.insights];

  // Role-based filtering: agents see own, TLs see team, managers see all
  if (typeof currentUser !== 'undefined' && currentUser) {
    const role = currentUser.actual_role;
    const isAdmin = (window.ADMIN_OHRS || []).includes(currentUser.ohr_id);

    // Admin "My Team" toggle: filter to admin's direct reports using insight's supervisor_email
    if (isAdmin && SANDBOX_MOD._inputTeamToggle === 'team') {
      data = data.filter(i => i.supervisor_email === currentUser.meta_email || i.ohr_id === currentUser.ohr_id);
    } else if (!isAdmin && (role === 'Team Lead' || role === 'Operational SME' || role === 'Content Reviewer')) {
      // TLs/SMEs/CRs: filter to their direct reports using insight's supervisor_email
      data = data.filter(i => i.supervisor_email === currentUser.meta_email || i.ohr_id === currentUser.ohr_id);
    } else if (role !== 'Manager' && !isAdmin && !(window.ADMIN_OHRS || []).includes(currentUser.ohr_id)) {
      // Agents, QAs, Trainers: own submissions only
      data = data.filter(i => i.ohr_id === currentUser.ohr_id);
    }
    // Managers and admin (All mode) see all — no filter
  }

  // Apply search bar text filter
  const searchEl = document.getElementById('sandbox-input-search');
  const searchTerm = searchEl ? searchEl.value.trim().toLowerCase() : '';
  if (searchTerm) {
    data = data.filter(i => {
      const fields = [
        i.insight_id, i.title, i.insight_title, i.full_name, i.submitter,
        i.planning_group, i.category, i.insight_category, i.proposal_type,
        i.status, i.description, i.problem_statement
      ];
      return fields.some(f => f && String(f).toLowerCase().includes(searchTerm));
    });
  }

  // Apply omnibar filters
  sandboxOmniState.filters.forEach(f => {
    data = data.filter(row => {
      let val = row[f.field];
      if (f.field === 'category') val = row.category || row.insight_category;
      if (f.op === 'contains') return val && String(val).toLowerCase().includes(f.value.toLowerCase());
      if (f.op === 'in') return f.value.includes(val);
      if (f.op === 'dateRange') {
        if (!val) return false;
        const d = val.slice(0, 10);
        if (f.value.from && d < f.value.from) return false;
        if (f.value.to && d > f.value.to) return false;
        return true;
      }
      return true;
    });
  });

  // Apply sorts
  const activeSorts = sandboxOmniState.sorts.length > 0 ? sandboxOmniState.sorts : [SANDBOX_DEFAULT_SORT];
  activeSorts.forEach(s => {
    data.sort((a, b) => {
      let va = a[s.key || s.field] || '', vb = b[s.key || s.field] || '';
      if ((s.key || s.field) === 'category') { va = a.category || a.insight_category || ''; vb = b.category || b.insight_category || ''; }
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return s.dir === 'asc' ? -1 : 1;
      if (va > vb) return s.dir === 'asc' ? 1 : -1;
      return 0;
    });
  });

  SANDBOX_MOD.filtered = data;
  SANDBOX_MOD.page = 1;

  // Update record count
  const countEl = document.getElementById('sandbox-record-count');
  if (countEl) countEl.textContent = `Filtered: ${data.length}`;

  // Update stats strip
  sandboxRenderStats();
  sandboxRenderTable();
}

// ===== All | My Team Toggle (admin only) =====

function sandboxInputSearchApply() {
  sandboxOmniApply();
}

function sandboxToggleTeamFilter(mode) {
  SANDBOX_MOD._inputTeamToggle = mode;
  sandboxRenderTeamToggle();
  sandboxOmniApply();
}

function sandboxRenderTeamToggle() {
  const container = document.getElementById('sandbox-team-toggle');
  if (!container) return;
  const isAdmin = typeof currentUser !== 'undefined' && currentUser && (window.ADMIN_OHRS || ['740045023', '740044909']).includes(currentUser.ohr_id);
  if (!isAdmin) { container.style.display = 'none'; return; }
  container.style.display = 'inline-flex';
  const mode = SANDBOX_MOD._inputTeamToggle;
  container.innerHTML = `
    <button class="sandbox-toggle-btn ${mode === 'all' ? 'active' : ''}" onclick="sandboxToggleTeamFilter('all')">All</button>
    <button class="sandbox-toggle-btn ${mode === 'team' ? 'active' : ''}" onclick="sandboxToggleTeamFilter('team')">My Team</button>`;
}

// ===== Stats Strip =====

function sandboxRenderStats() {
  const strip = document.getElementById('sandbox-stats-strip');
  if (!strip) return;

  const all = SANDBOX_MOD.filtered;
  const total = all.length;
  const pending = all.filter(i => i.status && i.status.startsWith('Pending')).length;
  const elevated = all.filter(i => i.status && i.status.startsWith('Elevated')).length;
  const implemented = all.filter(i => i.status === 'Implemented').length;

  strip.innerHTML = `
    <div class="sandbox-stat-card stat-total">
      <div class="sandbox-stat-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg></div>
      <div class="sandbox-stat-value">${total}</div>
      <div class="sandbox-stat-label">Total Insights</div>
    </div>
    <div class="sandbox-stat-card stat-pending">
      <div class="sandbox-stat-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
      <div class="sandbox-stat-value">${pending}</div>
      <div class="sandbox-stat-label">Pending Review</div>
    </div>
    <div class="sandbox-stat-card stat-elevated">
      <div class="sandbox-stat-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg></div>
      <div class="sandbox-stat-value">${elevated}</div>
      <div class="sandbox-stat-label">Elevated</div>
    </div>
    <div class="sandbox-stat-card stat-implemented">
      <div class="sandbox-stat-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>
      <div class="sandbox-stat-value">${implemented}</div>
      <div class="sandbox-stat-label">Implemented</div>
    </div>`;
}

// ===== Data Fetching =====

async function sandboxFetchInsights() {
  const loading = document.getElementById('sandbox-loading');
  if (loading) loading.style.display = 'flex';

  try {
    const url = `${IO_API_BASE}/insights?limit=2000`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Failed to fetch insights');
    SANDBOX_MOD.insights = await resp.json();
  } catch (e) {
    console.error('Sandbox fetch error:', e);
    SANDBOX_MOD.insights = [];
  }

  if (loading) loading.style.display = 'none';
  sandboxOmniApply();
}

async function sandboxFetchEmployees() {
  if (SANDBOX_MOD.employees.length > 0) return;
  try {
    const url = `${IO_API_BASE}/employees?employement_status=Active&order=full_name&limit=2000`;
    const resp = await fetch(url);
    if (resp.ok) SANDBOX_MOD.employees = await resp.json();
  } catch (e) {
    console.error('Failed to fetch employees for Sandbox:', e);
  }
}

// ===== Input Portal: Table with Inline Row Expansion =====

function sandboxRenderTable() {
  const thead = document.getElementById('sandbox-table-head');
  const tbody = document.getElementById('sandbox-table-body');
  if (!thead || !tbody) return;

  // Show Submitter column for TLs/SMEs/Managers who see team insights
  const showSubmitter = typeof currentUser !== 'undefined' && currentUser && (
    (window.ADMIN_OHRS || []).includes(currentUser.ohr_id) ||
    currentUser.actual_role === 'Manager' ||
    currentUser.actual_role === 'Team Lead' ||
    currentUser.actual_role === 'Operational SME' ||
    currentUser.actual_role === 'Content Reviewer'
  );
  const colSpan = showSubmitter ? 8 : 7; // +1 for expand arrow column
  thead.innerHTML = `<tr>
    <th style="width:30px;"></th>
    <th>Insight ID</th>${showSubmitter ? '<th>Submitter</th>' : ''}<th>Title</th><th>Category</th><th>Proposal Type</th><th>Status</th><th>Created Date</th>
  </tr>`;

  const start = (SANDBOX_MOD.page - 1) * SANDBOX_MOD.pageSize;
  const pageData = SANDBOX_MOD.filtered.slice(start, start + SANDBOX_MOD.pageSize);

  if (pageData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${colSpan}"><div class="sandbox-empty-state"><div class="sprite-mascot" role="img" aria-label="No data"></div><div class="sandbox-empty-title">No insights found</div><div class="sandbox-empty-subtitle">Submit a new insight or adjust filters</div></div></td></tr>`;
    sandboxRenderPagination();
    return;
  }

  let html = '';
  pageData.forEach(ins => {
    const statusColor = sandboxGetStatusColor(ins.status);
    const date = ins.created_at ? new Date(ins.created_at).toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '\u2014';
    const shortStatus = (ins.status || '').replace('Rejected - Initial Review ', 'Rej-IR ').replace('Rejected - Final Review ', 'Rej-FR ').replace('Pending - ', 'Pend. ').replace('Approved - ', 'Appr. ');
    const cat = ins.category || ins.insight_category || '\u2014';
    const isExpanded = SANDBOX_MOD.expandedId === ins.insight_id;

    html += `<tr class="sandbox-row${isExpanded ? ' expanded' : ''}" onclick="sandboxToggleDetail('${escapeAttr(ins.insight_id)}')">
      <td><span class="sandbox-expand-icon">\u25B6</span></td>
      <td><span class="sandbox-id-pill">${escapeHtml(ins.insight_id || '')}</span></td>
      ${showSubmitter ? `<td>${escapeHtml(ins.submitter || ins.ohr_id || '\u2014')}</td>` : ''}
      <td class="sandbox-title-cell">${escapeHtml(ins.title || ins.insight_title || '\u2014')}</td>
      <td>${escapeHtml(cat)}</td>
      <td>${escapeHtml(ins.proposal_type || '\u2014')}</td>
      <td><span class="sandbox-status-badge" style="background:${statusColor}20;color:${statusColor};border:1px solid ${statusColor}40;">${escapeHtml(shortStatus)}</span></td>
      <td>${date}</td>
    </tr>`;

    // Inline detail expansion row
    if (isExpanded) {
      html += `<tr class="sandbox-detail-row"><td colspan="${colSpan}" class="sandbox-detail-cell">${sandboxBuildDetailPanel(ins)}</td></tr>`;
    }
  });

  tbody.innerHTML = html;
  sandboxRenderPagination();
}

function sandboxToggleDetail(insightId) {
  if (SANDBOX_MOD.expandedId === insightId) {
    SANDBOX_MOD.expandedId = null;
  } else {
    SANDBOX_MOD.expandedId = insightId;
  }
  sandboxRenderTable();
}

function sandboxBuildDetailPanel(ins) {
  const statusColor = sandboxGetStatusColor(ins.status);
  const date = ins.created_at ? new Date(ins.created_at).toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'long', day: 'numeric', year: 'numeric' }) : '\u2014';
  const cat = ins.category || ins.insight_category || '\u2014';

  // Determine if current user is an agent (show limited review history)
  const isAgent = typeof currentUser !== 'undefined' && currentUser &&
    currentUser.actual_role !== 'Manager' &&
    currentUser.actual_role !== 'Team Lead' &&
    currentUser.actual_role !== 'Operational SME' &&
    currentUser.actual_role !== 'Trainer' &&
    currentUser.actual_role !== 'Content Reviewer' &&
    !(window.ADMIN_OHRS || []).includes(currentUser.ohr_id) &&
    !(window.ADMIN_OHRS || []).includes(currentUser.ohr_id);

  let html = `<div class="sandbox-detail-panel">`;

  // Section: Insight Details
  html += `<div class="sandbox-detail-section">
    <div class="sandbox-detail-section-title">INSIGHT DETAILS</div>
    <div class="sandbox-detail-grid">
      <div class="sandbox-detail-field">
        <div class="sandbox-detail-field-label">Status</div>
        <div class="sandbox-detail-field-value"><span class="sandbox-status-badge" style="background:${statusColor}20;color:${statusColor};border:1px solid ${statusColor}40;">${escapeHtml(ins.status || '')}</span></div>
      </div>
      <div class="sandbox-detail-field">
        <div class="sandbox-detail-field-label">Submission Date</div>
        <div class="sandbox-detail-field-value">${date}</div>
      </div>
      <div class="sandbox-detail-field">
        <div class="sandbox-detail-field-label">Category</div>
        <div class="sandbox-detail-field-value">${escapeHtml(cat)}</div>
      </div>
      <div class="sandbox-detail-field">
        <div class="sandbox-detail-field-label">Proposal Type</div>
        <div class="sandbox-detail-field-value">${escapeHtml(ins.proposal_type || '\u2014')}</div>
      </div>
      <div class="sandbox-detail-field">
        <div class="sandbox-detail-field-label">Impact</div>
        <div class="sandbox-detail-field-value">${escapeHtml(ins.impact_level || ins.impact || '\u2014')}</div>
      </div>
      <div class="sandbox-detail-field">
        <div class="sandbox-detail-field-label">Reach</div>
        <div class="sandbox-detail-field-value">${escapeHtml(ins.reach || '\u2014')}</div>
      </div>
    </div>
  </div>`;

  // Section: Title & Content
  html += `<div class="sandbox-detail-section">
    <div class="sandbox-detail-section-title">CONTENT</div>
    <div class="sandbox-detail-grid two-col">
      <div class="sandbox-detail-field full-width">
        <div class="sandbox-detail-field-label">Title</div>
        <div class="sandbox-detail-field-value">${escapeHtml(ins.title || ins.insight_title || '\u2014')}</div>
      </div>
      <div class="sandbox-detail-field full-width">
        <div class="sandbox-detail-field-label">Problem Statement</div>
        <div class="sandbox-detail-field-value multiline">${escapeHtml(ins.description || ins.problem_statement || '\u2014')}</div>
      </div>
      <div class="sandbox-detail-field full-width">
        <div class="sandbox-detail-field-label">Proposed Changes</div>
        <div class="sandbox-detail-field-value multiline">${escapeHtml(ins.proposed_change || ins.impact || '\u2014')}</div>
      </div>
    </div>
  </div>`;

  // Section: Implementation Standards
  if (ins.implementation_standards) {
    html += `<div class="sandbox-detail-section">
      <div class="sandbox-detail-section-title">IMPLEMENTATION</div>
      <div class="sandbox-detail-grid two-col">
        <div class="sandbox-detail-field full-width">
          <div class="sandbox-detail-field-label">Implementation Standards</div>
          <div class="sandbox-detail-field-value">${escapeHtml(ins.implementation_standards)}</div>
        </div>
      </div>
    </div>`;
  }

  // Section: Job IDs (if any)
  const jobIdEntries = [];
  for (let i = 1; i <= 10; i++) {
    if (ins[`job_id_${i}`]) jobIdEntries.push({ num: i, val: ins[`job_id_${i}`] });
  }
  if (jobIdEntries.length > 0) {
    html += `<div class="sandbox-detail-section">
      <div class="sandbox-detail-section-title">JOB IDS</div>
      <div class="sandbox-detail-grid">
        ${jobIdEntries.map(j => `<div class="sandbox-detail-field"><div class="sandbox-detail-field-label">Job ID ${j.num}</div><div class="sandbox-detail-field-value" style="font-family:'SF Mono','Fira Code',monospace;font-size:12px;">${escapeHtml(j.val)}</div></div>`).join('')}
      </div>
    </div>`;
  }

  // Section: Attachments
  html += sandboxRenderAttachments(ins.attachments);

  // Section: Review History
  html += `<div class="sandbox-detail-section">
    <div class="sandbox-detail-section-title">REVIEW HISTORY</div>
    ${sandboxRenderReviewTrail(ins, isAgent)}
  </div>`;

  // Admin delete button in Input Portal detail panel
  const _isAdminDel = typeof currentUser !== 'undefined' && currentUser && (window.ADMIN_OHRS || ['740045023', '740044909']).includes(currentUser.ohr_id);
  if (_isAdminDel) {
    html += `<div class="sandbox-detail-section" style="border-top:1px solid var(--border);padding-top:12px;">
      <button class="btn btn-danger btn-sm" onclick="sandboxDeleteInsight('${escapeAttr(ins.insight_id)}')">Delete Insight</button>
    </div>`;
  }

  html += `</div>`;
  return html;
}

// ===== Review Trail (agent-aware: agents see status+comments only, no reviewer names) =====

function sandboxRenderReviewTrail(ins, isAgent) {
  const entries = [];

  if (ins.initial_reviewer) {
    entries.push({
      date: ins.initial_review_date,
      actor: ins.initial_reviewer,
      action: ins.status && ins.status.startsWith('Rejected - Initial') ? 'Rejected (Initial Review)' : 'Approved (Initial Review)',
      comments: ins.initial_review_comments || null
    });
  }

  if (ins.final_reviewer) {
    let action = 'Reviewed (Final)';
    if (ins.status && ins.status.startsWith('Elevated')) action = 'Approved (Final Review) \u2192 ' + ins.status;
    else if (ins.status && ins.status.startsWith('Rejected - Final')) action = 'Rejected (Final Review)';
    else if (ins.status === 'Implemented') action = 'Marked as Implemented';

    entries.push({
      date: ins.final_review_date || ins.implementation_date,
      actor: ins.final_reviewer,
      action: action,
      comments: ins.final_review_comments || null
    });
  }

  if (entries.length === 0) {
    return '<div class="sandbox-trail-empty">No review activity yet.</div>';
  }

  let trailHtml = '<div style="border-top:3px solid var(--sandbox-accent);margin-bottom:12px;"></div>';
  trailHtml += '<div class="sandbox-trail"><div class="sandbox-trail-line"></div>';
  trailHtml += entries.map(e => {
    const d = e.date ? new Date(e.date).toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }) : '';
    // Agents: show status change + comments only, hide reviewer name
    const actorDisplay = isAgent ? '' : ` \u2014 <strong style="color:var(--sandbox-text);">${escapeHtml(e.actor)}</strong>`;
    return `<div class="sandbox-trail-entry">
      <div class="sandbox-trail-dot"></div>
      <div class="sandbox-trail-date">${escapeHtml(d)}${actorDisplay}</div>
      <div class="sandbox-trail-action">${escapeHtml(e.action)}</div>
      ${e.comments ? `<div class="sandbox-trail-comment">"${escapeHtml(e.comments)}"</div>` : ''}
    </div>`;
  }).join('');
  trailHtml += '</div>';
  return trailHtml;
}

// ===== Pagination =====

function sandboxRenderPagination() {
  const el = document.getElementById('sandbox-pagination');
  if (!el) return;
  const total = SANDBOX_MOD.filtered.length;
  const totalPages = Math.ceil(total / SANDBOX_MOD.pageSize) || 1;
  const start = (SANDBOX_MOD.page - 1) * SANDBOX_MOD.pageSize + 1;
  const end = Math.min(SANDBOX_MOD.page * SANDBOX_MOD.pageSize, total);

  el.innerHTML = `
    <span class="sandbox-page-info">${total > 0 ? `${start}\u2013${end} of ${total}` : '0 records'}</span>
    <div class="sandbox-page-controls">
      <select class="sandbox-page-size-select" onchange="SANDBOX_MOD.pageSize=+this.value;SANDBOX_MOD.page=1;sandboxRenderTable();">
        <option value="25" ${SANDBOX_MOD.pageSize===25?'selected':''}>25/page</option>
        <option value="50" ${SANDBOX_MOD.pageSize===50?'selected':''}>50/page</option>
        <option value="100" ${SANDBOX_MOD.pageSize===100?'selected':''}>100/page</option>
      </select>
      <button class="btn btn-ghost btn-xs" ${SANDBOX_MOD.page <= 1 ? 'disabled' : ''} onclick="SANDBOX_MOD.page--;sandboxRenderTable();">&laquo; Prev</button>
      <span class="sandbox-page-num">Page ${SANDBOX_MOD.page} / ${totalPages}</span>
      <button class="btn btn-ghost btn-xs" ${SANDBOX_MOD.page >= totalPages ? 'disabled' : ''} onclick="SANDBOX_MOD.page++;sandboxRenderTable();">Next &raquo;</button>
    </div>`;
}

// ===== Review Area: Kanban Board (Refreshed) =====

if (!SANDBOX_MOD._kanbanPages) SANDBOX_MOD._kanbanPages = {};
const SANDBOX_KANBAN_PAGE_SIZE = 10;

function sandboxKanbanPage(colId, dir) {
  if (!SANDBOX_MOD._kanbanPages) SANDBOX_MOD._kanbanPages = {};
  const cur = SANDBOX_MOD._kanbanPages[colId] || 1;
  SANDBOX_MOD._kanbanPages[colId] = Math.max(1, cur + dir);
  sandboxRenderKanban();
}

// ===== Review Area: Search & Planning Group Filter =====

// Debounce timer for search input
let _sandboxSearchTimer = null;

function sandboxReviewSearch(val) {
  SANDBOX_MOD._reviewSearch = (val || '').trim().toLowerCase();
  // Reset pagination when search changes
  SANDBOX_MOD._kanbanPages = {};
  // Debounce: only re-render cards, skip toolbar rebuild to preserve focus
  clearTimeout(_sandboxSearchTimer);
  _sandboxSearchTimer = setTimeout(() => {
    sandboxRenderKanban(true); // true = skip toolbar re-render
  }, 150);
}

function sandboxReviewPgFilter(val) {
  SANDBOX_MOD._reviewPgFilter = val || '';
  SANDBOX_MOD._kanbanPages = {};
  sandboxRenderKanban();
}

// CSV export for Review Area — respects current PG filter
function sandboxExportReviewCSV() {
  let data = [...SANDBOX_MOD.insights];

  // Apply role-based PG filtering (same as kanban)
  if (typeof currentUser !== 'undefined' && currentUser) {
    const role = currentUser.actual_role;
    const cpg = currentUser.complete_planning_group || currentUser.planning_group || '';
    const pgList = cpg.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (role === 'Operational SME' || role === 'Content Reviewer' || role === 'Trainer') {
      data = data.filter(i => {
        const iPg = (i.planning_group || '').toLowerCase();
        return pgList.some(pg => iPg.includes(pg) || pg.includes(iPg));
      });
    }
  }

  // Apply PG filter
  if (SANDBOX_MOD._reviewPgFilter) {
    data = data.filter(i => i.planning_group === SANDBOX_MOD._reviewPgFilter);
  }

  // Apply search filter
  const searchQ = SANDBOX_MOD._reviewSearch;
  if (searchQ) {
    data = data.filter(i => {
      const title = (i.title || i.insight_title || '').toLowerCase();
      const submitter = (i.full_name || i.submitter || '').toLowerCase();
      const insId = (i.insight_id || '').toLowerCase();
      return title.includes(searchQ) || submitter.includes(searchQ) || insId.includes(searchQ);
    });
  }

  if (data.length === 0) {
    showToast('No data to export', 'info');
    return;
  }

  // Define CSV columns
  const cols = [
    { key: 'insight_id', label: 'Insight ID' },
    { key: 'title', label: 'Title', fallback: 'insight_title' },
    { key: 'full_name', label: 'Submitter', fallback: 'submitter' },
    { key: 'ohr_id', label: 'OHR' },
    { key: 'planning_group', label: 'Planning Group' },
    { key: 'category', label: 'Insight Category', fallback: 'insight_category' },
    { key: 'proposal_type', label: 'Proposal Type' },
    { key: 'status', label: 'Status' },
    { key: 'description', label: 'Description' },
    { key: 'week_ending', label: 'Week Ending' },
    { key: 'created_at', label: 'Created At' },
    { key: 'updated_at', label: 'Updated At' },
  ];

  // Build CSV string
  const csvEscape = (val) => {
    if (val == null) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  let csv = cols.map(c => csvEscape(c.label)).join(',') + '\n';
  data.forEach(row => {
    csv += cols.map(c => {
      let val = row[c.key];
      if ((val === undefined || val === null || val === '') && c.fallback) val = row[c.fallback];
      // Format dates
      if ((c.key === 'created_at' || c.key === 'updated_at' || c.key === 'week_ending') && val) {
        try { val = new Date(val).toLocaleString('en-US', { timeZone: 'Asia/Manila' }); } catch(e) {}
      }
      return csvEscape(val);
    }).join(',') + '\n';
  });

  // Download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const pgSuffix = SANDBOX_MOD._reviewPgFilter ? '_' + SANDBOX_MOD._reviewPgFilter.replace(/[^a-zA-Z0-9]/g, '_') : '';
  a.download = 'sandbox_review' + pgSuffix + '_' + new Date().toISOString().slice(0,10) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Exported ${data.length} records to CSV`, 'success');
}

function sandboxRenderReviewToolbar() {
  const toolbar = document.getElementById('sandbox-review-toolbar');
  if (!toolbar) return;

  // Collect unique planning groups from all insights
  const pgSet = new Set();
  SANDBOX_MOD.insights.forEach(i => {
    if (i.planning_group) pgSet.add(i.planning_group);
  });
  const pgOptions = [...pgSet].sort();

  // Build admin toggle HTML
  const isAdmin = typeof currentUser !== 'undefined' && currentUser && (window.ADMIN_OHRS || ['740045023', '740044909']).includes(currentUser.ohr_id);
  const reviewMode = SANDBOX_MOD._reviewTeamToggle;
  const toggleHtml = isAdmin ? `
    <div class="sandbox-team-toggle" style="display:inline-flex;flex-shrink:0;">
      <button class="sandbox-toggle-btn ${reviewMode === 'all' ? 'active' : ''}" onclick="sandboxToggleReviewTeamFilter('all')">All</button>
      <button class="sandbox-toggle-btn ${reviewMode === 'team' ? 'active' : ''}" onclick="sandboxToggleReviewTeamFilter('team')">My Team</button>
    </div>` : '';

  toolbar.innerHTML = `
    <div class="sandbox-review-search-bar">
      ${toggleHtml}
      <div class="sandbox-review-search-input-wrap">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" class="sandbox-review-search-input" id="sandbox-review-search"
          placeholder="Search by title, submitter, or insight ID..."
          value="${escapeAttr(SANDBOX_MOD._reviewSearch)}"
          oninput="sandboxReviewSearch(this.value)">
      </div>
      <select class="sandbox-review-pg-select" id="sandbox-review-pg-filter"
        onchange="sandboxReviewPgFilter(this.value)">
        <option value="">All Planning Groups</option>
        ${pgOptions.map(pg => `<option value="${escapeAttr(pg)}" ${SANDBOX_MOD._reviewPgFilter === pg ? 'selected' : ''}>${escapeHtml(pg)}</option>`).join('')}
      </select>
      <button class="btn btn-outline btn-sm" onclick="sandboxExportReviewCSV()" title="Export filtered insights to CSV" style="margin-left:auto;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Export CSV
      </button>
    </div>`;
}

// ===== Review Area All | My Team Toggle (admin only) =====

function sandboxToggleReviewTeamFilter(mode) {
  SANDBOX_MOD._reviewTeamToggle = mode;
  sandboxRenderKanban();
}

function sandboxRenderKanban(skipToolbar) {
  const board = document.getElementById('sandbox-kanban-board');
  if (!board) return;

  // Render the search/filter toolbar (skip when called from search to preserve input focus)
  if (!skipToolbar) sandboxRenderReviewToolbar();

  let filteredInsights = [...SANDBOX_MOD.insights];

  // Role-based PG filtering for SME only (Trainers see all insights in Review Area)
  if (typeof currentUser !== 'undefined' && currentUser) {
    const role = currentUser.actual_role;
    const cpg = currentUser.complete_planning_group || currentUser.planning_group || '';
    const pgList = cpg.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (role === 'Operational SME' || role === 'Content Reviewer') {
      filteredInsights = filteredInsights.filter(i => {
        const iPg = (i.planning_group || '').toLowerCase();
        return pgList.some(pg => iPg.includes(pg) || pg.includes(iPg));
      });
    }
  }

  console.log('[Review Area] Total insights:', SANDBOX_MOD.insights.length, '| After role filter:', filteredInsights.length, '| Toggle:', SANDBOX_MOD._reviewTeamToggle);

  // Admin "My Team" toggle for Review Area — use insight's supervisor_email directly
  const isAdminReview = typeof currentUser !== 'undefined' && currentUser && (window.ADMIN_OHRS || []).includes(currentUser.ohr_id);
  if (isAdminReview && SANDBOX_MOD._reviewTeamToggle === 'team') {
    filteredInsights = filteredInsights.filter(i => i.supervisor_email === currentUser.meta_email || i.ohr_id === currentUser.ohr_id);
  }

  // Apply search filter
  const searchQ = SANDBOX_MOD._reviewSearch;
  if (searchQ) {
    filteredInsights = filteredInsights.filter(i => {
      const title = (i.title || i.insight_title || '').toLowerCase();
      const submitter = (i.full_name || i.submitter || '').toLowerCase();
      const insId = (i.insight_id || '').toLowerCase();
      return title.includes(searchQ) || submitter.includes(searchQ) || insId.includes(searchQ);
    });
  }

  // Apply PG filter
  if (SANDBOX_MOD._reviewPgFilter) {
    filteredInsights = filteredInsights.filter(i => i.planning_group === SANDBOX_MOD._reviewPgFilter);
  }

  // Determine role-based action permissions
  let canActionInitial = false;
  let canActionFinal = false;
  let canActionElevated = false;
  let pgMatch = false;
  const isAdmin = typeof currentUser !== 'undefined' && currentUser && (window.ADMIN_OHRS || ['740045023', '740044909']).includes(currentUser.ohr_id);

  if (typeof currentUser !== 'undefined' && currentUser) {
    const role = currentUser.actual_role;
    const userPg = currentUser.complete_planning_group || currentUser.planning_group || '';
    const userPgs = userPg.split(',').map(p => p.trim().toLowerCase()).filter(Boolean);
    // pgMatch is computed per-card below
    if (role === 'Operational SME' || role === 'Content Reviewer' || isAdmin) canActionInitial = true;
    if (role === 'Trainer' || isAdmin) { canActionFinal = true; canActionElevated = true; }
  }

  let html = '';
  SANDBOX_MOD.KANBAN_COLUMNS.forEach(col => {
    const cards = filteredInsights.filter(i => col.statuses.includes(i.status));
    const page = SANDBOX_MOD._kanbanPages[col.id] || 1;
    const totalPages = Math.ceil(cards.length / SANDBOX_KANBAN_PAGE_SIZE) || 1;
    const start = (page - 1) * SANDBOX_KANBAN_PAGE_SIZE;
    const pageCards = cards.slice(start, start + SANDBOX_KANBAN_PAGE_SIZE);

    const colClass = `col-${col.id}`;

    // Build pagination HTML (top of column, Disputes-style)
    let paginationHtml = '';
    if (totalPages > 1) {
      paginationHtml = `<div class="kanban-col-pagination" style="margin-bottom:8px;">
        <button class="btn btn-ghost btn-xs" ${page <= 1 ? 'disabled' : ''} onclick="event.stopPropagation();sandboxKanbanPage('${col.id}',-1)">&laquo;</button>
        <span style="font-size:11px;color:var(--fg-muted);">${page}/${totalPages}</span>
        <button class="btn btn-ghost btn-xs" ${page >= totalPages ? 'disabled' : ''} onclick="event.stopPropagation();sandboxKanbanPage('${col.id}',1)">&raquo;</button>
      </div>`;
    }

    html += `<div class="sandbox-kanban-col ${colClass}">
      <div class="sandbox-kanban-col-header">
        <span class="sandbox-kanban-col-title">${escapeHtml(col.title)}</span>
        <span class="sandbox-kanban-col-count">${cards.length}</span>
      </div>
      <div class="sandbox-kanban-col-body">
      ${paginationHtml}`;

    if (cards.length === 0) {
      html += '<div class="sandbox-kanban-empty">No items</div>';
    } else {
      pageCards.forEach(ins => {
        const date = ins.created_at ? new Date(ins.created_at).toLocaleDateString('en-US', { timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '\u2014';
        const statusColor = sandboxGetStatusColor(ins.status);
        const showSubStatus = (col.id === 'trainers-area' || col.id === 'rejected-initial' || col.id === 'rejected-final') && ins.status;
        const isExpanded = SANDBOX_MOD._reviewExpandedId === ins.insight_id;

        html += `<div class="sandbox-kanban-card${isExpanded ? ' expanded' : ''}" onclick="sandboxToggleKanbanCard('${escapeAttr(ins.insight_id)}')">
          <div class="sandbox-kanban-card-id">${escapeHtml(ins.insight_id || '')}</div>
          <div class="sandbox-kanban-card-title">${escapeHtml(ins.title || ins.insight_title || '\u2014')}</div>
          <div class="sandbox-kanban-card-meta">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span>${escapeHtml(ins.full_name || ins.submitter || '\u2014')}</span>
          </div>
          <div class="sandbox-kanban-card-meta">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span>${date}</span>
          </div>
          ${showSubStatus ? `<div class="sandbox-kanban-card-status" style="background:${statusColor}20;color:${statusColor};border:1px solid ${statusColor}40;">${escapeHtml(ins.status.replace('Elevated - ', '').replace(/^Rejected - (Initial|Final) Review /, ''))}</div>` : ''}
        </div>`;

        // Side panel is used instead of inline expansion (opened via sandboxToggleKanbanCard)
      });
    }

    // Pagination already rendered at top of column body

    html += '</div></div>';
  });

  board.innerHTML = html;
}

// ===== Side Panel: Open =====

function sandboxToggleKanbanCard(insightId) {
  const ins = SANDBOX_MOD.insights.find(i => i.insight_id === insightId);
  if (!ins) return;
  SANDBOX_MOD.editingId = insightId;
  SANDBOX_MOD._context = 'review';
  SANDBOX_MOD._reviewExpandedId = insightId;
  sandboxOpenReviewPanel(ins);
}

// ===== Side Panel: Build & Show =====

function sandboxOpenReviewPanel(ins) {
  const panel = document.getElementById('sandbox-review-panel');
  const titleEl = document.getElementById('sandbox-review-panel-title');
  const bodyEl = document.getElementById('sandbox-review-panel-body');
  const footerEl = document.getElementById('sandbox-review-panel-footer');
  if (!panel || !titleEl || !bodyEl || !footerEl) return;

  titleEl.innerHTML = `<span style="font-family:'SF Mono','Fira Code',monospace;font-size:14px;">${escapeHtml(ins.insight_id || '')}</span>`;

  const statusColor = sandboxGetStatusColor(ins.status);
  const date = ins.created_at ? new Date(ins.created_at).toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'long', day: 'numeric', year: 'numeric' }) : '\u2014';
  const cat = ins.category || ins.insight_category || '\u2014';

  // ===== HEADER CARD =====
  let html = `<div class="cdp-header">`;
  html += `<div class="cdp-header-icon" style="background:rgba(234,179,8,0.08);">\uD83D\uDCA1</div>`;
  html += `<div class="cdp-header-info">`;
  html += `<div class="cdp-header-title">${escapeHtml(ins.title || ins.insight_title || 'Insight')}</div>`;
  html += `<div class="cdp-header-sub">${escapeHtml(ins.full_name || ins.submitter || '')} &middot; ${date}</div>`;
  html += `</div>`;
  html += `<div class="cdp-header-actions">`;
  html += `<span style="display:inline-block;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:600;color:${statusColor};background:${statusColor}14;">${escapeHtml(ins.status || '\u2014')}</span>`;
  html += `</div></div>`;

  // ===== SECTION 1: INSIGHT DETAILS =====
  html += `<div class="cdp-section"><div class="cdp-section-title">Insight Details</div>`;
  html += `<div class="cdp-grid">`;
  html += `<div class="cdp-field"><div class="cdp-field-label">Submitter</div><div class="cdp-field-value">${escapeHtml(ins.full_name || ins.submitter || '\u2014')}</div></div>`;
  html += `<div class="cdp-field"><div class="cdp-field-label">Planning Group</div><div class="cdp-field-value">${escapeHtml(ins.planning_group || '\u2014')}</div></div>`;
  html += `<div class="cdp-field"><div class="cdp-field-label">Category</div><div class="cdp-field-value">${escapeHtml(cat)}</div></div>`;
  html += `<div class="cdp-field"><div class="cdp-field-label">Proposal Type</div><div class="cdp-field-value">${escapeHtml(ins.proposal_type || '\u2014')}</div></div>`;
  html += `<div class="cdp-field"><div class="cdp-field-label">Impact</div><div class="cdp-field-value">${escapeHtml(ins.impact_level || ins.impact || '\u2014')}</div></div>`;
  html += `<div class="cdp-field"><div class="cdp-field-label">Reach</div><div class="cdp-field-value">${escapeHtml(ins.reach || '\u2014')}</div></div>`;
  html += `</div>`;
  html += `<div class="cdp-field cdp-grid-full" style="margin-top:6px;border-top:1px solid rgba(0,0,0,0.06);padding-top:8px;"><div class="cdp-field-label">Problem Statement</div><div class="cdp-field-value multiline">${escapeHtml(ins.description || ins.problem_statement || '\u2014')}</div></div>`;
  html += `<div class="cdp-field cdp-grid-full" style="margin-top:6px;border-top:1px solid rgba(0,0,0,0.06);padding-top:8px;"><div class="cdp-field-label">Proposed Changes</div><div class="cdp-field-value multiline">${escapeHtml(ins.proposed_change || ins.impact || '\u2014')}</div></div>`;
  html += '</div>';

  // ===== SECTION: ATTACHMENTS =====
  html += sandboxRenderAttachmentsCompact(ins.attachments);

  // ===== SECTION 2: REVIEW HISTORY =====
  html += `<div class="cdp-section"><div class="cdp-section-title">Review History</div>`;
  html += sandboxRenderReviewTrail(ins, false);
  html += '</div>';

  bodyEl.innerHTML = html;

  // ===== FOOTER: Role-based action buttons =====
  footerEl.innerHTML = sandboxBuildPanelActions(ins);

  panel.classList.add('active');
}

function sandboxCloseReviewPanel() {
  const panel = document.getElementById('sandbox-review-panel');
  if (panel) panel.classList.remove('active');
  SANDBOX_MOD._reviewExpandedId = null;
  // Also remove any inline action overlays
  sandboxCloseInlineActionOverlay();
}

// ===== Side Panel: Role-Based Action Buttons =====

function sandboxBuildPanelActions(ins) {
  let footerHtml = '';
  const isAdmin = typeof currentUser !== 'undefined' && currentUser && (window.ADMIN_OHRS || ['740045023', '740044909']).includes(currentUser.ohr_id);

  if (typeof currentUser !== 'undefined' && currentUser) {
    const role = currentUser.actual_role;
    const userPg = currentUser.complete_planning_group || currentUser.planning_group || '';
    const userPgs = userPg.split(',').map(p => p.trim().toLowerCase()).filter(Boolean);
    const iPg = (ins.planning_group || '').toLowerCase();
    const pgMatch = userPgs.some(pg => iPg.includes(pg) || pg.includes(iPg));

    const iid = escapeAttr(ins.insight_id);

    // Pending Initial Review: Operational SME or Content Reviewer (with PG match) OR admin
    if (ins.status === 'Pending - Initial Review' && (isAdmin || ((role === 'Operational SME' || role === 'Content Reviewer') && pgMatch))) {
      footerHtml += `<div class="sandbox-inline-actions" id="sandbox-inline-actions-${iid}">`;
      // Default button row
      footerHtml += `<div class="sandbox-ia-buttons" id="sandbox-ia-btns-${iid}">`;
      footerHtml += `<button class="btn btn-success btn-sm" onclick="event.stopPropagation();sandboxExpandInlineComment('${iid}','approve','initial')">Approve</button>`;
      footerHtml += `<button class="btn btn-danger btn-sm" onclick="event.stopPropagation();sandboxExpandInlineComment('${iid}','reject','initial')">Reject</button>`;
      footerHtml += `</div>`;
      // Expandable comment section (hidden by default)
      footerHtml += `<div class="sandbox-ia-expand" id="sandbox-ia-expand-${iid}" style="display:none;"></div>`;
      footerHtml += `</div>`;
    }

    // Pending Final Review: ONLY Trainer (with PG match) OR admin
    if (ins.status === 'Pending - Final Review' && (isAdmin || (role === 'Trainer' && pgMatch))) {
      footerHtml += `<div class="sandbox-inline-actions" id="sandbox-inline-actions-${iid}">`;
      footerHtml += `<div class="sandbox-ia-buttons" id="sandbox-ia-btns-${iid}">`;
      footerHtml += `<button class="btn btn-success btn-sm" onclick="event.stopPropagation();sandboxExpandInlineComment('${iid}','approve','final')">Approve</button>`;
      footerHtml += `<button class="btn btn-danger btn-sm" onclick="event.stopPropagation();sandboxExpandInlineComment('${iid}','reject','final')">Reject</button>`;
      footerHtml += `</div>`;
      footerHtml += `<div class="sandbox-ia-expand" id="sandbox-ia-expand-${iid}" style="display:none;"></div>`;
      footerHtml += `</div>`;
    }

    // Trainer's Area statuses (Approved + Elevated): ONLY Trainer (with PG match) OR admin
    const trainerAreaStatuses = ['Approved - Final Review', 'Elevated - Task in Progress', 'Elevated - POC Rejected', 'Elevated - Pending POC Discussion', 'Elevated - No POC'];
    if (trainerAreaStatuses.includes(ins.status) && (isAdmin || (role === 'Trainer' && pgMatch))) {
      footerHtml += `<button class="btn btn-sm" style="background:#8B5CF6;color:#fff;" onclick="SANDBOX_MOD.editingId='${iid}';SANDBOX_MOD._context='review';sandboxShowTrainerStatusPopout()">Change Status</button>`;
    }

    // Admin delete button — only for 740045023 and 740044909
    if (isAdmin) {
      footerHtml += ` <button class="btn btn-danger btn-sm" onclick="sandboxDeleteInsight('${iid}')" style="margin-left:auto;">Delete</button>`;
    }
  }

  return footerHtml;
}

// ===== Inline Comment Expansion (replaces overlay approach) =====

function sandboxExpandInlineComment(insightId, action, tier) {
  SANDBOX_MOD.editingId = insightId;
  SANDBOX_MOD._context = 'review';

  const expandEl = document.getElementById('sandbox-ia-expand-' + insightId);
  const btnsEl = document.getElementById('sandbox-ia-btns-' + insightId);
  if (!expandEl) return;

  // Hide the original buttons
  if (btnsEl) btnsEl.style.display = 'none';

  let html = '';

  if (action === 'approve' && tier === 'final') {
    // Final approve needs elevated status selection + comments
    const choices = [
      { value: 'Elevated - Task in Progress', label: 'Task in Progress', color: '#8B5CF6' },
      { value: 'Elevated - POC Rejected', label: 'POC Rejected', color: '#EF4444' },
      { value: 'Elevated - Pending POC Discussion', label: 'Pending POC Discussion', color: '#EC4899' },
      { value: 'Elevated - No POC', label: 'No POC', color: '#6B7280' }
    ];
    html += `<div class="sandbox-ia-comment-box">`;
    html += `<div class="sandbox-ia-header" style="color:#22C55E;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Approve (Final Review)</div>`;
    html += `<div class="sandbox-ia-status-choices">`;
    html += choices.map((c, i) => `<label class="sandbox-ia-choice"><input type="radio" name="sandbox-approve-status" value="${c.value}" ${i===0?'checked':''} style="accent-color:${c.color};"><span class="sandbox-ia-dot" style="background:${c.color};"></span>${c.label}</label>`).join('');
    html += `</div>`;
    html += `<textarea class="form-textarea sandbox-ia-textarea" id="sandbox-ia-comments-${insightId}" rows="2" placeholder="Add review comments (optional)..."></textarea>`;
    html += `<div class="sandbox-ia-confirm-row">`;
    html += `<button class="btn btn-outline btn-sm" onclick="sandboxCollapseInlineComment('${insightId}')">Cancel</button>`;
    html += `<button class="btn btn-success btn-sm" onclick="sandboxSubmitFinalApprove()">Confirm Approval</button>`;
    html += `</div></div>`;
  } else if (action === 'approve') {
    // Initial approve — just comments
    html += `<div class="sandbox-ia-comment-box">`;
    html += `<div class="sandbox-ia-header" style="color:#22C55E;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Approve (Initial Review)</div>`;
    html += `<textarea class="form-textarea sandbox-ia-textarea" id="sandbox-ia-comments-${insightId}" rows="2" placeholder="Add review comments (optional)..."></textarea>`;
    html += `<div class="sandbox-ia-confirm-row">`;
    html += `<button class="btn btn-outline btn-sm" onclick="sandboxCollapseInlineComment('${insightId}')">Cancel</button>`;
    html += `<button class="btn btn-success btn-sm" onclick="sandboxSubmitAcceptInline('initial')">Confirm Approval</button>`;
    html += `</div></div>`;
  } else if (action === 'reject') {
    // Reject — reason selection + comments
    const tierLabel = tier === 'initial' ? 'Initial Review' : 'Final Review';
    const reasons = ['Duplicate', 'Insufficient Context/Details', 'Out of Scope', 'Pitched Already'];
    html += `<div class="sandbox-ia-comment-box">`;
    html += `<div class="sandbox-ia-header" style="color:#EF4444;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> Reject (${tierLabel})</div>`;
    html += `<div class="sandbox-ia-status-choices">`;
    html += reasons.map(r => `<label class="sandbox-ia-choice"><input type="radio" name="sandbox-reject-reason" value="${r}" style="accent-color:#EF4444;">${r}</label>`).join('');
    html += `</div>`;
    html += `<textarea class="form-textarea sandbox-ia-textarea" id="sandbox-ia-comments-${insightId}" rows="2" placeholder="Add rejection comments (optional)..."></textarea>`;
    html += `<div class="sandbox-ia-confirm-row">`;
    html += `<button class="btn btn-outline btn-sm" onclick="sandboxCollapseInlineComment('${insightId}')">Cancel</button>`;
    html += `<button class="btn btn-danger btn-sm" onclick="sandboxSubmitRejectInline('${tier}')">Confirm Rejection</button>`;
    html += `</div></div>`;
  }

  expandEl.innerHTML = html;
  expandEl.style.display = 'block';
  // Focus the textarea
  const ta = document.getElementById('sandbox-ia-comments-' + insightId);
  if (ta) setTimeout(() => ta.focus(), 50);
}

function sandboxCollapseInlineComment(insightId) {
  const expandEl = document.getElementById('sandbox-ia-expand-' + insightId);
  const btnsEl = document.getElementById('sandbox-ia-btns-' + insightId);
  if (expandEl) { expandEl.innerHTML = ''; expandEl.style.display = 'none'; }
  if (btnsEl) btnsEl.style.display = '';
}

// Inline accept handler (reads comments from inline textarea)
async function sandboxSubmitAcceptInline(tier) {
  const ins = SANDBOX_MOD.insights.find(i => i.insight_id === SANDBOX_MOD.editingId);
  if (!ins) return;
  const user = typeof currentUser !== 'undefined' ? currentUser : null;
  const comments = document.getElementById('sandbox-ia-comments-' + ins.insight_id)?.value?.trim() || '';

  const updates = { updated_at: new Date().toISOString() };
  if (tier === 'initial') {
    updates.status = 'Pending - Final Review';
    updates.initial_reviewer = user ? user.full_name : '';
    updates.initial_review_date = new Date().toISOString();
    updates.initial_review_comments = comments;
  } else {
    updates.status = 'Elevated - Task in Progress';
    updates.final_reviewer = user ? user.full_name : '';
    updates.final_review_date = new Date().toISOString();
    updates.final_review_comments = comments;
  }

  try {
    const url = `${IO_API_BASE}/insights/${encodeURIComponent(ins.insight_id)}`;
    const resp = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
    if (!resp.ok) throw new Error('Failed to approve insight');

    // Notification
    try {
      if (tier === 'initial') {
        createNotification({ type: 'insight_initial_accepted', title: 'Insight Accepted \u2014 Initial Review', message: "Your insight '" + (ins.insight_title || ins.title || '') + "' has been accepted and is now pending final review.", target_ohr: ins.ohr_id, metadata: { insight_id: ins.insight_id, reviewer: user ? user.full_name : '', comments: comments || '' } });
      }
    } catch (_ne) { /* non-blocking */ }

    showToast('Insight approved', 'success');
    sandboxCloseReviewPanel();
    await sandboxFetchInsights();
    sandboxRenderKanban();
  } catch (e) {
    console.error('Failed to approve insight:', e);
    showToast('Failed to approve: ' + e.message, 'error');
  }
}

// Inline reject handler (reads reason + comments from inline section)
async function sandboxSubmitRejectInline(tier) {
  const selected = document.querySelector('input[name="sandbox-reject-reason"]:checked');
  if (!selected) { showToast('Please select a rejection reason', 'error'); return; }

  const ins = SANDBOX_MOD.insights.find(i => i.insight_id === SANDBOX_MOD.editingId);
  if (!ins) return;
  const user = typeof currentUser !== 'undefined' ? currentUser : null;
  const reason = selected.value;
  const comments = document.getElementById('sandbox-ia-comments-' + ins.insight_id)?.value?.trim() || '';
  const prefix = tier === 'initial' ? 'Rejected - Initial Review' : 'Rejected - Final Review';

  const updates = { status: `${prefix} [${reason}]`, updated_at: new Date().toISOString() };
  if (tier === 'initial') {
    updates.initial_reviewer = user ? user.full_name : '';
    updates.initial_review_date = new Date().toISOString();
    updates.initial_review_comments = comments;
  } else {
    updates.final_reviewer = user ? user.full_name : '';
    updates.final_review_date = new Date().toISOString();
    updates.final_review_comments = comments;
  }

  try {
    const url = `${IO_API_BASE}/insights/${encodeURIComponent(ins.insight_id)}`;
    const resp = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
    if (!resp.ok) throw new Error('Failed to reject insight');

    // Notification
    try {
      const tierLabel = tier === 'initial' ? 'Initial Review' : 'Final Review';
      if (tier === 'initial') {
        createNotification({ type: 'insight_initial_rejected', title: 'Insight Rejected \u2014 ' + tierLabel, message: "Your insight '" + (ins.insight_title || ins.title || '') + "' was rejected: " + reason + ".", target_ohr: ins.ohr_id, metadata: { insight_id: ins.insight_id, reviewer: user ? user.full_name : '', reason, comments: comments || '' } });
      } else {
        createNotification({ type: 'insight_final_rejected', title: 'Insight Rejected \u2014 ' + tierLabel, message: "Your insight '" + (ins.insight_title || ins.title || '') + "' was rejected: " + reason + ".", target_ohr: ins.ohr_id, metadata: { insight_id: ins.insight_id, reviewer: user ? user.full_name : '', reason, comments: comments || '' } });
        if (ins.initial_reviewer) {
          const initRev = SANDBOX_MOD.employees.find(e => e.full_name === ins.initial_reviewer);
          if (initRev && initRev.ohr_id !== ins.ohr_id) {
            createNotification({ type: 'insight_final_rejected', title: 'Insight Rejected \u2014 ' + tierLabel, message: "Insight '" + (ins.insight_title || ins.title || '') + "' was rejected at final review: " + reason + ".", target_ohr: initRev.ohr_id, metadata: { insight_id: ins.insight_id, reviewer: user ? user.full_name : '', reason, comments: comments || '' } });
          }
        }
      }
    } catch (_ne) { /* non-blocking */ }

    showToast('Insight rejected', 'success');
    sandboxCloseReviewPanel();
    await sandboxFetchInsights();
    sandboxRenderKanban();
  } catch (e) {
    console.error('Failed to reject insight:', e);
    showToast('Failed to reject: ' + e.message, 'error');
  }
}

// ===== Detail View (dispatches to inline expansion for both contexts) =====

function sandboxOpenDetail(insightId, context) {
  const ins = SANDBOX_MOD.insights.find(i => i.insight_id === insightId);
  if (!ins) return;
  SANDBOX_MOD.editingId = insightId;
  SANDBOX_MOD._context = context || 'input';

  // For Input Portal, use inline row expansion
  if (context !== 'review') {
    sandboxToggleDetail(insightId);
    return;
  }

  // Review Area: use inline card expansion (replaces old modal)
  sandboxToggleKanbanCard(insightId);
}

// ===== Accept Popout (confirmation) =====

function sandboxShowAcceptPopout(tier) {
  const isReview = (SANDBOX_MOD._context === 'review');
  // For review context with inline expansion, use a temporary overlay
  if (isReview) {
    sandboxShowInlineActionOverlay('accept', tier);
    return;
  }
  const formBody = document.getElementById('sandbox-form-body');
  formBody._prevHtml = formBody.innerHTML;

  const tierLabel = tier === 'initial' ? 'Initial Review' : 'Final Review';
  formBody.innerHTML = `
    <div style="padding:24px;text-align:center;">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#22C55E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:16px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      <h3 style="margin-bottom:4px;font-size:16px;">Approve Insight (${tierLabel})</h3>
      <p style="color:var(--fg-muted);font-size:13px;margin-bottom:16px;">This will move the insight to the next stage.</p>
      <div style="margin-bottom:12px;text-align:left;">
        <label style="font-size:12px;font-weight:600;color:var(--fg-muted);">Comments (optional)</label>
        <textarea class="form-textarea" id="sandbox-accept-comments" rows="3" placeholder="Add review comments..." style="width:100%;margin-top:4px;"></textarea>
      </div>
      <div style="display:flex;gap:8px;justify-content:center;">
        <button class="btn btn-outline btn-sm" onclick="sandboxCloseAcceptPopout()">Cancel</button>
        <button class="btn btn-success btn-sm" onclick="sandboxSubmitAccept('${tier}')">Confirm Approval</button>
      </div>
    </div>`;
  const footerId = isReview ? 'sandbox-review-form-footer' : 'sandbox-form-footer';
  document.getElementById(footerId).style.display = 'none';
}

function sandboxCloseAcceptPopout() {
  const isReview = (SANDBOX_MOD._context === 'review');
  if (isReview) { sandboxCloseInlineActionOverlay(); return; }
  const formBody = document.getElementById('sandbox-form-body');
  if (formBody._prevHtml) {
    formBody.innerHTML = formBody._prevHtml;
    formBody._prevHtml = null;
  }
  const footerId = 'sandbox-form-footer';
  document.getElementById(footerId).style.display = '';
}

async function sandboxSubmitAccept(tier) {
  const ins = SANDBOX_MOD.insights.find(i => i.insight_id === SANDBOX_MOD.editingId);
  if (!ins) return;

  const user = typeof currentUser !== 'undefined' ? currentUser : null;
  const comments = document.getElementById('sandbox-accept-comments')?.value?.trim() || '';

  const updates = { updated_at: new Date().toISOString() };

  if (tier === 'initial') {
    updates.status = 'Pending - Final Review';
    updates.initial_reviewer = user ? user.full_name : '';
    updates.initial_review_date = new Date().toISOString();
    if (comments) updates.initial_review_comments = comments;
  } else {
    updates.status = 'Elevated - Task in Progress';
    updates.final_reviewer = user ? user.full_name : '';
    updates.final_review_date = new Date().toISOString();
    if (comments) updates.final_review_comments = comments;
  }

  try {
    const url = `${IO_API_BASE}/insights/${encodeURIComponent(ins.insight_id)}`;
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!resp.ok) throw new Error('Failed to approve insight');

    // --- Notification: insight_initial_accepted or insight_final_accepted ---
    try {
      if (tier === 'initial') {
        createNotification({
          type: 'insight_initial_accepted',
          title: 'Insight Accepted \u2014 Initial Review',
          message: "Your insight '" + (ins.insight_title || ins.title || '') + "' has been accepted and is now pending final review.",
          target_ohr: ins.ohr_id,
          metadata: { insight_id: ins.insight_id, reviewer: user ? user.full_name : '', comments: comments || '' }
        });
      } else {
        // Final accept via generic accept path (fallback)
        const targets = [ins.ohr_id, ins.initial_reviewer ? null : null].filter(Boolean);
        createNotification({
          type: 'insight_final_accepted',
          title: 'Insight Elevated \u2014 Elevated - Task in Progress',
          message: "Insight '" + (ins.insight_title || ins.title || '') + "' has been elevated to 'Elevated - Task in Progress' after final review.",
          target_ohr: ins.ohr_id,
          metadata: { insight_id: ins.insight_id, reviewer: user ? user.full_name : '', elevated_status: 'Elevated - Task in Progress', comments: comments || '' }
        });
        // Also notify initial reviewer if different from submitter
        if (ins.initial_reviewer) {
          const initRev = SANDBOX_MOD.employees.find(e => e.full_name === ins.initial_reviewer);
          if (initRev && initRev.ohr_id !== ins.ohr_id) {
            createNotification({
              type: 'insight_final_accepted',
              title: 'Insight Elevated \u2014 Elevated - Task in Progress',
              message: "Insight '" + (ins.insight_title || ins.title || '') + "' has been elevated to 'Elevated - Task in Progress' after final review.",
              target_ohr: initRev.ohr_id,
              metadata: { insight_id: ins.insight_id, reviewer: user ? user.full_name : '', elevated_status: 'Elevated - Task in Progress', comments: comments || '' }
            });
          }
        }
      }
    } catch (_ne) { /* non-blocking */ }

    showToast('Insight approved', 'success');
    sandboxCloseForm();
    await sandboxFetchInsights();
    sandboxRenderKanban();
  } catch (e) {
    console.error('Failed to approve insight:', e);
    showToast('Failed to approve: ' + e.message, 'error');
  }
}

// ===== Final Approve Popout (with elevated status selection) =====

function sandboxShowFinalApprovePopout() {
  const isReview = (SANDBOX_MOD._context === 'review');
  if (isReview) { sandboxShowInlineActionOverlay('final-approve', null); return; }
  const formBody = document.getElementById('sandbox-form-body');
  formBody._prevHtml = formBody.innerHTML;

  const choices = [
    { value: 'Elevated - Task in Progress', label: 'Task in Progress', color: '#8B5CF6' },
    { value: 'Elevated - POC Rejected', label: 'POC Rejected', color: '#EF4444' },
    { value: 'Elevated - Pending POC Discussion', label: 'Pending POC Discussion', color: '#EC4899' },
    { value: 'Elevated - No POC', label: 'No POC', color: '#6B7280' }
  ];

  formBody.innerHTML = `
    <div style="padding:16px 20px;">
      <div style="text-align:center;margin-bottom:16px;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#22C55E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:8px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        <h3 style="margin-bottom:4px;font-size:16px;">Approve Insight (Final Review)</h3>
        <p style="color:var(--fg-muted);font-size:13px;">Select the elevated status for this insight.</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:12px;">
        ${choices.map((c, i) => `<label style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:13px;transition:background 0.15s;" onmouseover="this.style.background='var(--bg-surface-hover)'" onmouseout="this.style.background=''">
          <input type="radio" name="sandbox-approve-status" value="${c.value}" ${i===0?'checked':''} style="accent-color:${c.color};">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c.color};"></span>
          ${c.label}
        </label>`).join('')}
      </div>
      <div style="margin-bottom:12px;">
        <label style="font-size:12px;font-weight:600;color:var(--fg-muted);">Comments (optional)</label>
        <textarea class="form-textarea" id="sandbox-final-approve-comments" rows="3" placeholder="Add review comments..." style="width:100%;margin-top:4px;"></textarea>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn btn-outline btn-sm" onclick="sandboxCloseFinalApprovePopout()">Cancel</button>
        <button class="btn btn-success btn-sm" onclick="sandboxSubmitFinalApprove()">Confirm Approval</button>
      </div>
    </div>`;
  const footerId = isReview ? 'sandbox-review-form-footer' : 'sandbox-form-footer';
  document.getElementById(footerId).style.display = 'none';
}

function sandboxCloseFinalApprovePopout() {
  const isReview = (SANDBOX_MOD._context === 'review');
  if (isReview) { sandboxCloseInlineActionOverlay(); return; }
  const isReview2 = (SANDBOX_MOD._context === 'review');
  const formBody = document.getElementById(isReview ? 'sandbox-review-form-body' : 'sandbox-form-body');
  if (formBody._prevHtml) {
    formBody.innerHTML = formBody._prevHtml;
    formBody._prevHtml = null;
  }
  const footerId = isReview ? 'sandbox-review-form-footer' : 'sandbox-form-footer';
  document.getElementById(footerId).style.display = '';
}

async function sandboxSubmitFinalApprove() {
  const selected = document.querySelector('input[name="sandbox-approve-status"]:checked');
  if (!selected) { showToast('Please select a status', 'error'); return; }

  const ins = SANDBOX_MOD.insights.find(i => i.insight_id === SANDBOX_MOD.editingId);
  if (!ins) return;

  const user = typeof currentUser !== 'undefined' ? currentUser : null;
  // Check both the old overlay textarea and the new inline textarea
  const comments = document.getElementById('sandbox-final-approve-comments')?.value?.trim()
    || document.getElementById('sandbox-ia-comments-' + ins.insight_id)?.value?.trim()
    || '';

  const updates = {
    status: selected.value,
    final_reviewer: user ? user.full_name : '',
    final_review_date: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  updates.final_review_comments = comments;

  try {
    const url = `${IO_API_BASE}/insights/${encodeURIComponent(ins.insight_id)}`;
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!resp.ok) throw new Error('Failed to approve insight');

    // --- Notification: insight_final_accepted → submitter + initial reviewer ---
    try {
      const elevatedStatus = selected.value;
      createNotification({
        type: 'insight_final_accepted',
        title: 'Insight Elevated \u2014 ' + elevatedStatus,
        message: "Insight '" + (ins.insight_title || ins.title || '') + "' has been elevated to '" + elevatedStatus + "' after final review.",
        target_ohr: ins.ohr_id,
        metadata: { insight_id: ins.insight_id, reviewer: user ? user.full_name : '', elevated_status: elevatedStatus, comments: comments || '' }
      });
      if (ins.initial_reviewer) {
        const initRev = SANDBOX_MOD.employees.find(e => e.full_name === ins.initial_reviewer);
        if (initRev && initRev.ohr_id !== ins.ohr_id) {
          createNotification({
            type: 'insight_final_accepted',
            title: 'Insight Elevated \u2014 ' + elevatedStatus,
            message: "Insight '" + (ins.insight_title || ins.title || '') + "' has been elevated to '" + elevatedStatus + "' after final review.",
            target_ohr: initRev.ohr_id,
            metadata: { insight_id: ins.insight_id, reviewer: user ? user.full_name : '', elevated_status: elevatedStatus, comments: comments || '' }
          });
        }
      }
    } catch (_ne) { /* non-blocking */ }

    showToast('Insight approved (Final)', 'success');
    sandboxCloseReviewPanel();
    sandboxCloseForm();
    await sandboxFetchInsights();
    sandboxRenderKanban();
  } catch (e) {
    console.error('Failed to approve insight:', e);
    showToast('Failed to approve: ' + e.message, 'error');
  }
}

// ===== Reject Modal =====

function sandboxShowRejectModal(tier) {
  const isReview = (SANDBOX_MOD._context === 'review');
  if (isReview) { sandboxShowInlineActionOverlay('reject', tier); return; }
  const formBody = document.getElementById('sandbox-form-body');
  formBody._prevHtml = formBody.innerHTML;

  const tierLabel = tier === 'initial' ? 'Initial Review' : 'Final Review';
  const reasons = tier === 'initial'
    ? ['Duplicate', 'Insufficient Context/Details', 'Out of Scope', 'Pitched Already']
    : ['Duplicate', 'Insufficient Context/Details', 'Out of Scope', 'Pitched Already'];

  formBody.innerHTML = `
    <div style="padding:16px 20px;">
      <div style="text-align:center;margin-bottom:16px;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:8px;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        <h3 style="margin-bottom:4px;font-size:16px;">Reject Insight (${tierLabel})</h3>
        <p style="color:var(--fg-muted);font-size:13px;">Select a reason for rejection.</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:12px;">
        ${reasons.map(r => `<label style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:13px;transition:background 0.15s;" onmouseover="this.style.background='var(--bg-surface-hover)'" onmouseout="this.style.background=''">
          <input type="radio" name="sandbox-reject-reason" value="${r}" style="accent-color:#EF4444;">
          ${r}
        </label>`).join('')}
      </div>
      <div style="margin-bottom:12px;">
        <label style="font-size:12px;font-weight:600;color:var(--fg-muted);">Comments (optional)</label>
        <textarea class="form-textarea" id="sandbox-reject-comments" rows="3" placeholder="Add rejection comments..." style="width:100%;margin-top:4px;"></textarea>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn btn-outline btn-sm" onclick="sandboxCloseRejectModal()">Cancel</button>
        <button class="btn btn-danger btn-sm" onclick="sandboxSubmitReject('${tier}')">Confirm Rejection</button>
      </div>
    </div>`;
  const footerId = isReview ? 'sandbox-review-form-footer' : 'sandbox-form-footer';
  document.getElementById(footerId).style.display = 'none';
}

function sandboxCloseRejectModal() {
  const isReview = (SANDBOX_MOD._context === 'review');
  if (isReview) { sandboxCloseInlineActionOverlay(); return; }
  const formBody = document.getElementById('sandbox-form-body');
  if (formBody._prevHtml) {
    formBody.innerHTML = formBody._prevHtml;
    formBody._prevHtml = null;
  }
  const footerId = 'sandbox-form-footer';
  document.getElementById(footerId).style.display = '';
}

async function sandboxSubmitReject(tier) {
  const selected = document.querySelector('input[name="sandbox-reject-reason"]:checked');
  if (!selected) { showToast('Please select a rejection reason', 'error'); return; }

  const ins = SANDBOX_MOD.insights.find(i => i.insight_id === SANDBOX_MOD.editingId);
  if (!ins) return;

  const user = typeof currentUser !== 'undefined' ? currentUser : null;
  const reason = selected.value;
  const comments = document.getElementById('sandbox-reject-comments')?.value?.trim() || '';
  const prefix = tier === 'initial' ? 'Rejected - Initial Review' : 'Rejected - Final Review';

  const updates = {
    status: `${prefix} [${reason}]`,
    updated_at: new Date().toISOString()
  };

  if (tier === 'initial') {
    updates.initial_reviewer = user ? user.full_name : '';
    updates.initial_review_date = new Date().toISOString();
    if (comments) updates.initial_review_comments = comments;
  } else {
    updates.final_reviewer = user ? user.full_name : '';
    updates.final_review_date = new Date().toISOString();
    if (comments) updates.final_review_comments = comments;
  }

  try {
    const url = `${IO_API_BASE}/insights/${encodeURIComponent(ins.insight_id)}`;
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!resp.ok) throw new Error('Failed to reject insight');

    // --- Notification: insight_initial_rejected or insight_final_rejected ---
    try {
      const tierLabel = tier === 'initial' ? 'Initial Review' : 'Final Review';
      if (tier === 'initial') {
        createNotification({
          type: 'insight_initial_rejected',
          title: 'Insight Rejected \u2014 ' + tierLabel,
          message: "Your insight '" + (ins.insight_title || ins.title || '') + "' was rejected: " + reason + ".",
          target_ohr: ins.ohr_id,
          metadata: { insight_id: ins.insight_id, reviewer: user ? user.full_name : '', reason, comments: comments || '' }
        });
      } else {
        createNotification({
          type: 'insight_final_rejected',
          title: 'Insight Rejected \u2014 ' + tierLabel,
          message: "Your insight '" + (ins.insight_title || ins.title || '') + "' was rejected: " + reason + ".",
          target_ohr: ins.ohr_id,
          metadata: { insight_id: ins.insight_id, reviewer: user ? user.full_name : '', reason, comments: comments || '' }
        });
        // For final rejection, also notify initial reviewer
        if (ins.initial_reviewer) {
          const initRev = SANDBOX_MOD.employees.find(e => e.full_name === ins.initial_reviewer);
          if (initRev && initRev.ohr_id !== ins.ohr_id) {
            createNotification({
              type: 'insight_final_rejected',
              title: 'Insight Rejected \u2014 ' + tierLabel,
              message: "Insight '" + (ins.insight_title || ins.title || '') + "' was rejected at final review: " + reason + ".",
              target_ohr: initRev.ohr_id,
              metadata: { insight_id: ins.insight_id, reviewer: user ? user.full_name : '', reason, comments: comments || '' }
            });
          }
        }
      }
    } catch (_ne) { /* non-blocking */ }

    showToast('Insight rejected', 'success');
    sandboxCloseForm();
    await sandboxFetchInsights();
    sandboxRenderKanban();
  } catch (e) {
    console.error('Failed to reject insight:', e);
    showToast('Failed to reject: ' + e.message, 'error');
  }
}

// ===== Trainer's Area: Status Interchange Popout =====

function sandboxShowTrainerStatusPopout() {
  const ins = SANDBOX_MOD.insights.find(i => i.insight_id === SANDBOX_MOD.editingId);
  if (!ins) return;

  const isReview = (SANDBOX_MOD._context === 'review');
  if (isReview) { sandboxShowInlineActionOverlay('trainer-status', null); return; }
  const formBody = document.getElementById('sandbox-form-body');
  formBody._prevHtml = formBody.innerHTML;

  const allChoices = [
    { value: 'Elevated - Task in Progress', label: 'Elevated - Task in Progress', color: '#8B5CF6' },
    { value: 'Elevated - POC Rejected', label: 'Elevated - POC Rejected', color: '#EF4444' },
    { value: 'Elevated - Pending POC Discussion', label: 'Elevated - Pending POC Discussion', color: '#EC4899' },
    { value: 'Elevated - No POC', label: 'Elevated - No POC', color: '#6B7280' },
    { value: 'Implemented', label: 'Implemented', color: '#7C3AED' }
  ];

  // Filter out current status; Approved - Final Review is never a choice (one-way transition)
  const choices = allChoices.filter(c => c.value !== ins.status && c.value !== 'Approved - Final Review');

  formBody.innerHTML = `
    <div style="padding:16px 20px;">
      <div style="text-align:center;margin-bottom:16px;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:8px;"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/></svg>
        <h3 style="margin-bottom:4px;font-size:16px;">Change Status</h3>
        <p style="color:var(--fg-muted);font-size:13px;">Current: <strong>${ins.status}</strong></p>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;">
        ${choices.map(c => `<label style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:13px;transition:background 0.15s;" onmouseover="this.style.background='var(--bg-surface-hover)'" onmouseout="this.style.background=''">
          <input type="radio" name="sandbox-trainer-status" value="${c.value}" style="accent-color:${c.color};">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c.color};"></span>
          ${c.label}
        </label>`).join('')}
      </div>
      <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn btn-outline btn-sm" onclick="sandboxCloseTrainerStatusPopout()">Cancel</button>
        <button class="btn btn-sm" style="background:#8B5CF6;color:#fff;" onclick="sandboxSubmitTrainerStatus()">Save</button>
      </div>
    </div>`;
  const footerId = isReview ? 'sandbox-review-form-footer' : 'sandbox-form-footer';
  document.getElementById(footerId).style.display = 'none';
}

function sandboxCloseTrainerStatusPopout() {
  const isReview = (SANDBOX_MOD._context === 'review');
  if (isReview) { sandboxCloseInlineActionOverlay(); return; }
  const formBody = document.getElementById('sandbox-form-body');
  if (formBody._prevHtml) {
    formBody.innerHTML = formBody._prevHtml;
    formBody._prevHtml = null;
  }
  const footerId = 'sandbox-form-footer';
  document.getElementById(footerId).style.display = '';
}

async function sandboxSubmitTrainerStatus() {
  const selected = document.querySelector('input[name="sandbox-trainer-status"]:checked');
  if (!selected) { showToast('Please select a status', 'error'); return; }

  const newStatus = selected.value;
  const ins = SANDBOX_MOD.insights.find(i => i.insight_id === SANDBOX_MOD.editingId);
  if (!ins) return;

  const user = typeof currentUser !== 'undefined' ? currentUser : null;
  const updates = {
    status: newStatus,
    updated_at: new Date().toISOString()
  };

  if (newStatus === 'Implemented') {
    updates.implementation_date = new Date().toISOString();
    updates.final_reviewer = user ? user.full_name : '';
  }

  try {
    const url = `${IO_API_BASE}/insights/${encodeURIComponent(ins.insight_id)}`;
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!resp.ok) throw new Error('Failed to update insight');

    // --- Notification: insight_implemented or insight_status_changed ---
    try {
      const oldStatus = ins.status || '';
      if (newStatus === 'Implemented') {
        // insight_implemented → submitter + initial reviewer + supervisor
        createNotification({
          type: 'insight_implemented',
          title: 'Insight Implemented \u2014 ' + (ins.insight_title || ins.title || ''),
          message: "Congratulations! Your insight '" + (ins.insight_title || ins.title || '') + "' has been implemented.",
          target_ohr: ins.ohr_id,
          metadata: { insight_id: ins.insight_id, implementation_date: new Date().toISOString(), implemented_by: user ? user.full_name : '' }
        });
        // Notify initial reviewer
        if (ins.initial_reviewer) {
          const initRev = SANDBOX_MOD.employees.find(e => e.full_name === ins.initial_reviewer);
          if (initRev && initRev.ohr_id !== ins.ohr_id) {
            createNotification({
              type: 'insight_implemented',
              title: 'Insight Implemented \u2014 ' + (ins.insight_title || ins.title || ''),
              message: "Insight '" + (ins.insight_title || ins.title || '') + "' has been implemented.",
              target_ohr: initRev.ohr_id,
              metadata: { insight_id: ins.insight_id, implementation_date: new Date().toISOString(), implemented_by: user ? user.full_name : '' }
            });
          }
        }
        // Notify supervisor
        if (ins.supervisor_email) {
          const sup = SANDBOX_MOD.employees.find(e => e.meta_email === ins.supervisor_email || e.supervisor_email === ins.supervisor_email);
          if (sup && sup.ohr_id !== ins.ohr_id) {
            createNotification({
              type: 'insight_implemented',
              title: 'Insight Implemented \u2014 ' + (ins.insight_title || ins.title || ''),
              message: "An insight by " + (ins.submitter || 'an agent') + " has been implemented: '" + (ins.insight_title || ins.title || '') + "'.",
              target_ohr: sup.ohr_id,
              metadata: { insight_id: ins.insight_id, implementation_date: new Date().toISOString(), implemented_by: user ? user.full_name : '' }
            });
          }
        }
      } else {
        // insight_status_changed → submitter + initial reviewer
        createNotification({
          type: 'insight_status_changed',
          title: 'Insight Status Updated \u2014 ' + newStatus,
          message: "Insight '" + (ins.insight_title || ins.title || '') + "' status changed from '" + oldStatus + "' to '" + newStatus + "'.",
          target_ohr: ins.ohr_id,
          metadata: { insight_id: ins.insight_id, old_status: oldStatus, new_status: newStatus, changed_by: user ? user.full_name : '' }
        });
        if (ins.initial_reviewer) {
          const initRev = SANDBOX_MOD.employees.find(e => e.full_name === ins.initial_reviewer);
          if (initRev && initRev.ohr_id !== ins.ohr_id) {
            createNotification({
              type: 'insight_status_changed',
              title: 'Insight Status Updated \u2014 ' + newStatus,
              message: "Insight '" + (ins.insight_title || ins.title || '') + "' status changed from '" + oldStatus + "' to '" + newStatus + "'.",
              target_ohr: initRev.ohr_id,
              metadata: { insight_id: ins.insight_id, old_status: oldStatus, new_status: newStatus, changed_by: user ? user.full_name : '' }
            });
          }
        }
      }
    } catch (_ne) { /* non-blocking */ }

    showToast(`Status changed \u2192 ${newStatus}`, 'success');
    sandboxCloseForm();
    await sandboxFetchInsights();
    sandboxRenderKanban();
  } catch (e) {
    console.error('Failed to update insight:', e);
    showToast('Failed to update: ' + e.message, 'error');
  }
}

// ===== Inline Action Overlay (for Review Area actions within inline expansion) =====

function sandboxShowInlineActionOverlay(action, tier) {
  // Remove any existing overlay
  sandboxCloseInlineActionOverlay();

  const ins = SANDBOX_MOD.insights.find(i => i.insight_id === SANDBOX_MOD.editingId);
  if (!ins) return;

  let overlayHtml = '';

  if (action === 'accept') {
    const tierLabel = tier === 'initial' ? 'Initial Review' : 'Final Review';
    overlayHtml = `
      <div class="sandbox-action-overlay" id="sandbox-inline-action-overlay">
        <div class="sandbox-action-overlay-inner">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#22C55E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:12px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <h3 style="margin-bottom:4px;font-size:15px;">Approve Insight (${tierLabel})</h3>
          <p style="color:var(--fg-muted);font-size:12px;margin-bottom:12px;">This will move the insight to the next stage.</p>
          <div style="margin-bottom:10px;text-align:left;">
            <label style="font-size:11px;font-weight:600;color:var(--fg-muted);">Comments (optional)</label>
            <textarea class="form-textarea" id="sandbox-accept-comments" rows="2" placeholder="Add review comments..." style="width:100%;margin-top:4px;font-size:12px;"></textarea>
          </div>
          <div style="display:flex;gap:8px;justify-content:center;">
            <button class="btn btn-outline btn-sm" onclick="sandboxCloseInlineActionOverlay()">Cancel</button>
            <button class="btn btn-success btn-sm" onclick="sandboxSubmitAccept('${tier}')">Confirm Approval</button>
          </div>
        </div>
      </div>`;
  } else if (action === 'final-approve') {
    const choices = [
      { value: 'Elevated - Task in Progress', label: 'Task in Progress', color: '#8B5CF6' },
      { value: 'Elevated - POC Rejected', label: 'POC Rejected', color: '#EF4444' },
      { value: 'Elevated - Pending POC Discussion', label: 'Pending POC Discussion', color: '#EC4899' },
      { value: 'Elevated - No POC', label: 'No POC', color: '#6B7280' }
    ];
    overlayHtml = `
      <div class="sandbox-action-overlay" id="sandbox-inline-action-overlay">
        <div class="sandbox-action-overlay-inner">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#22C55E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:12px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <h3 style="margin-bottom:4px;font-size:15px;">Approve Insight (Final Review)</h3>
          <p style="color:var(--fg-muted);font-size:12px;margin-bottom:10px;">Select the elevated status.</p>
          <div style="display:flex;flex-direction:column;gap:3px;margin-bottom:10px;">
            ${choices.map((c, i) => `<label style="display:flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid var(--border);border-radius:5px;cursor:pointer;font-size:12px;">
              <input type="radio" name="sandbox-approve-status" value="${c.value}" ${i===0?'checked':''} style="accent-color:${c.color};">
              <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${c.color};"></span>
              ${c.label}
            </label>`).join('')}
          </div>
          <div style="margin-bottom:10px;text-align:left;">
            <label style="font-size:11px;font-weight:600;color:var(--fg-muted);">Comments (optional)</label>
            <textarea class="form-textarea" id="sandbox-final-approve-comments" rows="2" placeholder="Add review comments..." style="width:100%;margin-top:4px;font-size:12px;"></textarea>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end;">
            <button class="btn btn-outline btn-sm" onclick="sandboxCloseInlineActionOverlay()">Cancel</button>
            <button class="btn btn-success btn-sm" onclick="sandboxSubmitFinalApprove()">Confirm Approval</button>
          </div>
        </div>
      </div>`;
  } else if (action === 'reject') {
    const tierLabel = tier === 'initial' ? 'Initial Review' : 'Final Review';
    const reasons = ['Duplicate', 'Insufficient Context/Details', 'Out of Scope', 'Pitched Already'];
    overlayHtml = `
      <div class="sandbox-action-overlay" id="sandbox-inline-action-overlay">
        <div class="sandbox-action-overlay-inner">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:12px;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          <h3 style="margin-bottom:4px;font-size:15px;">Reject Insight (${tierLabel})</h3>
          <p style="color:var(--fg-muted);font-size:12px;margin-bottom:10px;">Select a reason for rejection.</p>
          <div style="display:flex;flex-direction:column;gap:3px;margin-bottom:10px;">
            ${reasons.map(r => `<label style="display:flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid var(--border);border-radius:5px;cursor:pointer;font-size:12px;">
              <input type="radio" name="sandbox-reject-reason" value="${r}" style="accent-color:#EF4444;">
              ${r}
            </label>`).join('')}
          </div>
          <div style="margin-bottom:10px;text-align:left;">
            <label style="font-size:11px;font-weight:600;color:var(--fg-muted);">Comments (optional)</label>
            <textarea class="form-textarea" id="sandbox-reject-comments" rows="2" placeholder="Add rejection comments..." style="width:100%;margin-top:4px;font-size:12px;"></textarea>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end;">
            <button class="btn btn-outline btn-sm" onclick="sandboxCloseInlineActionOverlay()">Cancel</button>
            <button class="btn btn-danger btn-sm" onclick="sandboxSubmitReject('${tier}')">Confirm Rejection</button>
          </div>
        </div>
      </div>`;
  } else if (action === 'trainer-status') {
    const allChoices = [
      { value: 'Elevated - Task in Progress', label: 'Elevated - Task in Progress', color: '#8B5CF6' },
      { value: 'Elevated - POC Rejected', label: 'Elevated - POC Rejected', color: '#EF4444' },
      { value: 'Elevated - Pending POC Discussion', label: 'Elevated - Pending POC Discussion', color: '#EC4899' },
      { value: 'Elevated - No POC', label: 'Elevated - No POC', color: '#6B7280' },
      { value: 'Implemented', label: 'Implemented', color: '#7C3AED' }
    ];
    // Filter out current status; Approved - Final Review is never a choice (one-way transition)
    const choices = allChoices.filter(c => c.value !== ins.status && c.value !== 'Approved - Final Review');
    overlayHtml = `
      <div class="sandbox-action-overlay" id="sandbox-inline-action-overlay">
        <div class="sandbox-action-overlay-inner">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:12px;"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/></svg>
          <h3 style="margin-bottom:4px;font-size:15px;">Change Status</h3>
          <p style="color:var(--fg-muted);font-size:12px;margin-bottom:10px;">Current: <strong>${escapeHtml(ins.status)}</strong></p>
          <div style="display:flex;flex-direction:column;gap:3px;margin-bottom:10px;">
            ${choices.map(c => `<label style="display:flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid var(--border);border-radius:5px;cursor:pointer;font-size:12px;">
              <input type="radio" name="sandbox-trainer-status" value="${c.value}" style="accent-color:${c.color};">
              <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${c.color};"></span>
              ${c.label}
            </label>`).join('')}
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end;">
            <button class="btn btn-outline btn-sm" onclick="sandboxCloseInlineActionOverlay()">Cancel</button>
            <button class="btn btn-sm" style="background:#8B5CF6;color:#fff;" onclick="sandboxSubmitTrainerStatus()">Save</button>
          </div>
        </div>
      </div>`;
  }

  // Insert the overlay into the side panel body (replaces detail content temporarily)
  const panelBody = document.getElementById('sandbox-review-panel-body');
  if (panelBody) {
    panelBody.insertAdjacentHTML('beforeend', overlayHtml);
  }
}

function sandboxCloseInlineActionOverlay() {
  const overlay = document.getElementById('sandbox-inline-action-overlay');
  if (overlay) overlay.remove();
}

// ===== New Insight Form (Inline Expansion Panel) =====

async function sandboxShowNewForm() {
  await sandboxFetchEmployees();
  SANDBOX_MOD.editingId = null;
  SANDBOX_MOD._inlineFormOpen = true;

  const container = document.getElementById('sandbox-inline-form-container');
  if (!container) return;

  const insightId = 'INS-' + Date.now().toString(36).toUpperCase();
  SANDBOX_MOD._pendingInsightId = insightId;

  const IMPL_STANDARDS = [
    'Adult Sexual Solicitation & Sexually Explicit Language',
    'Adult Sexual Exploitation',
    'Adult Nudity & Sexual Activity',
    'Bullying & Harassment',
    'Child Sexual Exploitation, Abuse, & Nudity',
    'Coordinating Harm & Promoting Crime',
    'Cybersecurity',
    'Dangerous Individuals & Organizations',
    'Fraud, Scam, & Deceptive Practices',
    'Hateful Conduct',
    'Hate Speech Descriptive Labelling',
    'Human Exploitation',
    'Manipulated Media',
    'Misinformation',
    'Personal Fundraiser Policies & Guidelines',
    'Privacy Violations',
    'Recalled Products',
    'RGS - Health & Wellness',
    'RGS - Tobacco & Alcohol',
    'RGS - Weapons, Ammunition, & Explosives',
    'RGS - Online Gambling & Games',
    'RGS - Drugs & Pharmaceuticals',
    'Spam',
    'SSI Banking Guidelines',
    'Suicide, Self-Injury, & Eating Disorders',
    'Violence & Incitement',
    'Violent & Graphic Content'
  ];

  const implOptions = IMPL_STANDARDS.map(s => `<option value="${s}">${s}</option>`).join('');

  container.innerHTML = `
    <div class="sandbox-inline-form">
      <div class="sandbox-inline-form-header">
        <div class="sandbox-inline-form-title">New Insight &mdash; ${insightId}</div>
        <button class="sandbox-inline-form-close" onclick="sandboxCloseInlineForm()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="sandbox-form-grid">
        <div class="form-field full-width">
          <label class="form-label">Title <span class="required">*</span></label>
          <input type="text" class="form-input" id="sandbox-new-title" placeholder="Enter a brief, descriptive title for your insight">
        </div>
        <div class="form-field">
          <label class="form-label">Insight Category <span class="required">*</span></label>
          <select class="form-select" id="sandbox-new-insight-category">
            <option value="">\u2014 Select Category \u2014</option>
            <option value="Efficiency">Efficiency</option>
            <option value="Effectiveness">Effectiveness</option>
          </select>
        </div>
        <div class="form-field">
          <label class="form-label">Proposal Type <span class="required">*</span></label>
          <select class="form-select" id="sandbox-new-proposal-type" onchange="sandboxOnProposalTypeChange()">
            <option value="">\u2014 Select Proposal Type \u2014</option>
            <option value="IS Impacting">IS Impacting</option>
            <option value="Process/Workflow Related">Process/Workflow Related</option>
            <option value="Tooling">Tooling</option>
          </select>
        </div>
        <div class="form-field">
          <label class="form-label">Implementation Standards <span class="required">*</span></label>
          <select class="form-select" id="sandbox-new-impl-standards">
            <option value="">\u2014 Select Standard \u2014</option>
            ${implOptions}
          </select>
        </div>
        <div class="form-field">
          <label class="form-label">Impact <span class="required">*</span></label>
          <select class="form-select" id="sandbox-new-impact">
            <option value="">\u2014 Select Impact \u2014</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>
        <div class="form-field">
          <label class="form-label">Reach <span class="required">*</span></label>
          <select class="form-select" id="sandbox-new-reach">
            <option value="">\u2014 Select Reach \u2014</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>
        <div class="form-field full-width">
          <label class="form-label">Problem Statement <span class="required">*</span></label>
          <textarea class="form-textarea" id="sandbox-new-desc" rows="3" placeholder="Describe the problem or opportunity in detail..."></textarea>
        </div>
        <div class="form-field full-width">
          <label class="form-label">Proposed Changes <span class="required">*</span></label>
          <textarea class="form-textarea" id="sandbox-new-proposed" rows="3" placeholder="Describe your proposed changes..."></textarea>
        </div>
        <div class="form-field full-width" id="sandbox-job-ids-section" style="display:none;">
          <label class="form-label">Job IDs <span class="required">*</span> <span style="font-weight:normal;color:var(--fg-muted);font-size:0.85em;">(10 required, must be unique)</span></label>
          <div class="sandbox-jobids-grid">
            ${Array.from({length:10}, (_,i) => `<input type="text" class="form-input" id="sandbox-new-jobid-${i+1}" placeholder="Job ID ${i+1}">`).join('')}
          </div>
        </div>
        <div class="form-field full-width">
          <label class="form-label">Attachments <span style="font-weight:normal;color:var(--fg-muted);font-size:0.85em;">(optional — images, PDFs, documents)</span></label>
          <input type="file" id="sandbox-file-input" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.gif,.bmp,.webp,.txt" style="display:none" onchange="sandboxUpdateFiles()">
          <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('sandbox-file-input').click()" style="display:flex;align-items:center;gap:6px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
            Attach Files
          </button>
          <div id="sandbox-file-list" style="margin-top:6px;"></div>
        </div>
      </div>
      <div class="sandbox-inline-form-footer">
        <button class="btn btn-outline btn-sm" onclick="sandboxCloseInlineForm()">Cancel</button>
        <button class="btn btn-primary btn-sm" onclick="sandboxSubmitNew()">Submit Insight</button>
      </div>
    </div>`;

  container.style.display = 'block';
  // Focus the title field
  setTimeout(() => document.getElementById('sandbox-new-title')?.focus(), 100);
}

// ===== Attachment helpers =====

function sandboxUpdateFiles() {
  const input = document.getElementById('sandbox-file-input');
  if (!input || !input.files) return;
  for (let i = 0; i < input.files.length; i++) {
    _sandboxAttachedFiles.push(input.files[i]);
  }
  input.value = '';
  sandboxRenderFileList();
}

function sandboxRemoveFile(index) {
  _sandboxAttachedFiles.splice(index, 1);
  sandboxRenderFileList();
}

function sandboxRenderFileList() {
  const listEl = document.getElementById('sandbox-file-list');
  if (!listEl) return;
  if (_sandboxAttachedFiles.length === 0) { listEl.innerHTML = ''; return; }
  let html = '';
  for (let i = 0; i < _sandboxAttachedFiles.length; i++) {
    const f = _sandboxAttachedFiles[i];
    const sizeKB = (f.size / 1024).toFixed(1);
    html += `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px;color:var(--fg);">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <span>${escapeHtml(f.name)}</span>
      <span style="color:var(--fg-subtle);">(${sizeKB} KB)</span>
      <button type="button" onclick="event.stopPropagation();sandboxRemoveFile(${i})" style="background:none;border:none;color:var(--error);cursor:pointer;font-size:14px;line-height:1;padding:0 4px;" title="Remove">&times;</button>
    </div>`;
  }
  listEl.innerHTML = html;
}

function sandboxRenderAttachments(attachmentsJson) {
  if (!attachmentsJson) return '';
  let atts;
  try { atts = JSON.parse(attachmentsJson); } catch { return ''; }
  if (!Array.isArray(atts) || atts.length === 0) return '';

  let html = '<div class="sandbox-detail-section"><div class="sandbox-detail-section-title">ATTACHMENTS</div>';
  html += '<div style="display:flex;flex-wrap:wrap;gap:8px;">';
  atts.forEach(a => {
    const name = a.name || 'file';
    const url = a.url || '';
    const ext = name.split('.').pop().toLowerCase();
    const isImage = ['png','jpg','jpeg','gif','bmp','webp'].includes(ext);

    if (isImage) {
      html += `<a href="${escapeAttr(url)}" target="_blank" rel="noopener" style="display:inline-block;border:1px solid var(--border);border-radius:6px;overflow:hidden;text-decoration:none;">
        <img src="${escapeAttr(url)}" alt="${escapeAttr(name)}" style="max-width:160px;max-height:120px;display:block;object-fit:cover;" loading="lazy">
        <div style="padding:4px 8px;font-size:11px;color:var(--fg-muted);background:var(--bg-surface);border-top:1px solid var(--border);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px;">${escapeHtml(name)}</div>
      </a>`;
    } else {
      html += `<a href="${escapeAttr(url)}" target="_blank" download="${escapeAttr(name)}" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:12px;color:var(--primary);text-decoration:none;background:var(--bg-surface);">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        ${escapeHtml(name)}
      </a>`;
    }
  });
  html += '</div></div>';
  return html;
}

function sandboxRenderAttachmentsCompact(attachmentsJson) {
  if (!attachmentsJson) return '';
  let atts;
  try { atts = JSON.parse(attachmentsJson); } catch { return ''; }
  if (!Array.isArray(atts) || atts.length === 0) return '';

  let html = '<div class="cdp-section"><div class="cdp-section-title">Attachments</div>';
  html += '<div style="display:flex;flex-wrap:wrap;gap:8px;">';
  atts.forEach(a => {
    const name = a.name || 'file';
    const url = a.url || '';
    const ext = name.split('.').pop().toLowerCase();
    const isImage = ['png','jpg','jpeg','gif','bmp','webp'].includes(ext);

    if (isImage) {
      html += `<a href="${escapeAttr(url)}" target="_blank" rel="noopener" style="display:inline-block;border:1px solid var(--border);border-radius:6px;overflow:hidden;text-decoration:none;">
        <img src="${escapeAttr(url)}" alt="${escapeAttr(name)}" style="max-width:120px;max-height:90px;display:block;object-fit:cover;" loading="lazy">
        <div style="padding:3px 6px;font-size:10px;color:var(--fg-muted);background:var(--bg-surface);border-top:1px solid var(--border);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;">${escapeHtml(name)}</div>
      </a>`;
    } else {
      html += `<a href="${escapeAttr(url)}" target="_blank" download="${escapeAttr(name)}" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:11px;color:var(--primary);text-decoration:none;background:var(--bg-surface);">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        ${escapeHtml(name)}
      </a>`;
    }
  });
  html += '</div></div>';
  return html;
}

function sandboxCloseInlineForm() {
  _sandboxAttachedFiles = [];
  SANDBOX_MOD._inlineFormOpen = false;
  const container = document.getElementById('sandbox-inline-form-container');
  if (container) {
    container.innerHTML = '';
    container.style.display = 'none';
  }
}

function sandboxOnProposalTypeChange() {
  const pt = document.getElementById('sandbox-new-proposal-type')?.value;
  const jobSection = document.getElementById('sandbox-job-ids-section');
  if (jobSection) {
    jobSection.style.display = (pt && pt !== 'Tooling') ? '' : 'none';
  }
}

async function sandboxSubmitNew() {
  const title = document.getElementById('sandbox-new-title')?.value?.trim();
  const insightCategory = document.getElementById('sandbox-new-insight-category')?.value;
  const proposalType = document.getElementById('sandbox-new-proposal-type')?.value;
  const implStandards = document.getElementById('sandbox-new-impl-standards')?.value;
  const desc = document.getElementById('sandbox-new-desc')?.value?.trim();
  const proposed = document.getElementById('sandbox-new-proposed')?.value?.trim();
  const impact = document.getElementById('sandbox-new-impact')?.value;
  const reach = document.getElementById('sandbox-new-reach')?.value;

  if (!title) { showToast('Please enter a title', 'error'); return; }
  if (!insightCategory) { showToast('Please select an Insight Category', 'error'); return; }
  if (!proposalType) { showToast('Please select a Proposal Type', 'error'); return; }
  if (!implStandards) { showToast('Please select Implementation Standards', 'error'); return; }
  if (!desc) { showToast('Please enter a Problem Statement', 'error'); return; }
  if (!proposed) { showToast('Please enter Proposed Changes', 'error'); return; }
  if (!impact) { showToast('Please select an Impact level', 'error'); return; }
  if (!reach) { showToast('Please select a Reach level', 'error'); return; }

  // Validate Job IDs if proposal type is not Tooling
  const jobIds = {};
  if (proposalType && proposalType !== 'Tooling') {
    const seen = new Set();
    for (let i = 1; i <= 10; i++) {
      const val = document.getElementById(`sandbox-new-jobid-${i}`)?.value?.trim();
      if (!val) { showToast(`Please enter Job ID ${i}`, 'error'); return; }
      if (seen.has(val.toLowerCase())) {
        showToast(`Duplicate Job ID detected: "${val}" (Job ID ${i}). All Job IDs must be unique.`, 'error');
        return;
      }
      seen.add(val.toLowerCase());
      jobIds[`job_id_${i}`] = val;
    }
  }

  const user = typeof currentUser !== 'undefined' ? currentUser : null;
  const insightId = SANDBOX_MOD._pendingInsightId || ('INS-' + Date.now().toString(36).toUpperCase());

  const emp = user ? SANDBOX_MOD.employees.find(e => e.ohr_id === user.ohr_id) : null;

  // Upload attachments to S3 before creating the record
  let attachmentUrls = [];
  if (_sandboxAttachedFiles.length > 0) {
    for (const file of _sandboxAttachedFiles) {
      try {
        const base64 = await fileToBase64(file);
        const resp = await fetch(`${IO_API_BASE}/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, contentType: file.type, data: base64, folder: 'sandbox-insights' })
        });
        if (resp.ok) {
          const result = await resp.json();
          attachmentUrls.push({ name: file.name, url: result.url });
        }
      } catch (e) {
        console.error('Failed to upload attachment:', e);
      }
    }
  }

  const record = {
    insight_id: insightId,
    insight_title: title,
    insight_category: insightCategory,
    proposal_type: proposalType,
    implementation_standards: implStandards,
    problem_statement: desc,
    proposed_change: proposed,
    impact: impact,
    reach: reach,
    submitter: user ? user.full_name : '',
    ohr_id: user ? user.ohr_id : '',
    meta_email: user ? user.meta_email : '',
    planning_group: emp ? emp.planning_group : (user ? user.planning_group : ''),
    supervisor: emp ? emp.supervisor : '',
    supervisor_email: emp ? emp.supervisor_email : '',
    queue: emp ? emp.queue : '',
    platform: emp ? emp.platform : '',
    status: 'Pending - Initial Review',
    created_date: new Date().toISOString(),
    created_at: new Date().toISOString(),
    attachments: attachmentUrls.length > 0 ? JSON.stringify(attachmentUrls) : '',
    ...jobIds
  };

  try {
    const url = `${IO_API_BASE}/insights`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    });
    if (!resp.ok) throw new Error('Failed to submit insight');

    // --- Notification: insight_submitted → all SMEs/Content Reviewers in submitter's PG ---
    try {
      const submitterPg = record.planning_group || '';
      const reviewers = SANDBOX_MOD.employees.filter(e =>
        (e.actual_role === 'Operational SME' || e.actual_role === 'Content Reviewer') &&
        e.planning_group === submitterPg &&
        e.ohr_id !== record.ohr_id
      );
      for (const reviewer of reviewers) {
        createNotification({
          type: 'insight_submitted',
          title: 'New Insight Submitted \u2014 ' + title,
          message: (user ? user.full_name : 'Someone') + ' submitted: ' + title + ' (' + insightId + ')',
          target_ohr: reviewer.ohr_id,
          metadata: { insight_id: insightId, submitter: user ? user.full_name : '', planning_group: submitterPg, category: insightCategory, proposal_type: proposalType }
        });
      }
    } catch (_ne) { /* notification failure is non-blocking */ }

    showToast('Insight submitted successfully', 'success');
    sandboxCloseInlineForm();
    await sandboxFetchInsights();
  } catch (e) {
    console.error('Failed to submit insight:', e);
    showToast('Failed to submit: ' + e.message, 'error');
  }
}

function sandboxCloseForm() {
  // Close the review area modal overlay (legacy, kept for safety)
  const reviewOverlay = document.getElementById('sandbox-review-form-overlay');
  if (reviewOverlay) reviewOverlay.style.display = 'none';
  // Close inline action overlay if open
  sandboxCloseInlineActionOverlay();
  // Close the review side panel if open
  sandboxCloseReviewPanel();
  // Close inline form if open
  sandboxCloseInlineForm();
  // Collapse inline kanban expansion
  SANDBOX_MOD._reviewExpandedId = null;
  SANDBOX_MOD.editingId = null;
}

// ===== Admin Delete Insight (740045023 + 740044909 only) =====
async function sandboxDeleteInsight(insightId) {
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  if (!cu || !(window.ADMIN_OHRS || ['740045023', '740044909']).includes(cu.ohr_id)) {
    showToast('Only admin users can delete insights', 'error');
    return;
  }

  const ins = SANDBOX_MOD.insights.find(i => i.insight_id === insightId);
  const label = ins ? `${ins.insight_id} (${ins.insight_title || ins.title || 'Untitled'} by ${ins.submitter || 'Unknown'})` : insightId;

  showConfirmModal({
    title: 'Delete Insight',
    message: 'Are you sure you want to permanently delete this insight?',
    detail: label + ' \u2014 This action cannot be undone.',
    confirmText: 'Delete Insight',
    onConfirm: async () => {
      try {
        const resp = await fetch(`${IO_API_BASE}/insights/${encodeURIComponent(insightId)}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actor_ohr: cu.ohr_id })
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error || 'Delete failed');
        }
        showToast('Insight deleted successfully', 'success');
        sandboxCloseForm();
        SANDBOX_MOD.insights = SANDBOX_MOD.insights.filter(i => i.insight_id !== insightId);
        SANDBOX_MOD.filtered = SANDBOX_MOD.filtered.filter(i => i.insight_id !== insightId);
        sandboxRenderTable();
        sandboxRenderStats();
        sandboxRenderKanban();
      } catch (e) {
        console.error('Failed to delete insight:', e);
        showToast('Failed to delete: ' + e.message, 'error');
      }
    }
  });
}

// ===== Init =====

async function initSandbox(view) {
  await sandboxFetchEmployees();
  await sandboxFetchInsights();
  if (view === 'sandbox-review') {
    sandboxRenderKanban();
  } else {
    sandboxRenderTeamToggle();
    if (typeof sandboxInitPillFilterBar === 'function') sandboxInitPillFilterBar();
    sandboxOmniApply();
  }
}
