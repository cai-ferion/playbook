/**
 * Sandbox — Insights Tracker (2 Sub-pages)
 * Sub-page 1: Input Portal — submit & browse insights (My Submissions only)
 * Sub-page 2: Review Area — Kanban board for SME/Trainer review workflow
 */

const SANDBOX_MOD = {
  insights: [],
  filtered: [],
  employees: [],
  currentSubpage: 'input',
  page: 1,
  pageSize: 25,
  editingId: null,
  _context: 'input', // 'input' or 'review' — where detail was opened from

  STATUSES: [
    'Pending - Initial Review',
    'Approved - Initial Review',
    'Rejected - Initial Review [Duplicate]',
    'Rejected - Initial Review [Insufficient Context/Details]',
    'Rejected - Initial Review [Out of Scope]',
    'Rejected - Initial Review [Pitched Already]',
    'Pending - Final Review',
    'Approved - Final Review',
    'Rejected - Final Review [Duplicate]',
    'Rejected - Final Review [Insufficient Context/Details]',
    'Rejected - Final Review [Out of Scope]',
    'Rejected - Final Review [Pitched Already]',
    'Elevated - Pending POC Discussion',
    'Implemented'
  ],

  STATUS_COLORS: {
    'Pending - Initial Review': '#3B82F6',
    'Approved - Initial Review': '#22C55E',
    'Pending - Final Review': '#F59E0B',
    'Approved - Final Review': '#059669',
    'Implemented': '#7C3AED',
    'Elevated - Pending POC Discussion': '#EC4899'
  },

  KANBAN_COLUMNS: [
    { id: 'pending-initial', title: 'Pending Initial Review', statuses: ['Pending - Initial Review'] },
    { id: 'approved-initial', title: 'Approved Initial', statuses: ['Approved - Initial Review'] },
    { id: 'pending-final', title: 'Pending Final Review', statuses: ['Pending - Final Review'] },
    { id: 'elevated', title: 'Elevated (POC)', statuses: ['Elevated - Pending POC Discussion'] },
    { id: 'approved-final', title: 'Approved (Trainer)', statuses: ['Approved - Final Review'] },
    { id: 'rejected-final', title: 'Rejected (Trainer)', statuses: ['Rejected - Final Review [Duplicate]', 'Rejected - Final Review [Insufficient Context/Details]', 'Rejected - Final Review [Out of Scope]', 'Rejected - Final Review [Pitched Already]'] },
    { id: 'implemented', title: 'Implemented', statuses: ['Implemented'] }
  ]
};

function sandboxGetStatusColor(status) {
  if (!status) return 'var(--text-secondary)';
  if (SANDBOX_MOD.STATUS_COLORS[status]) return SANDBOX_MOD.STATUS_COLORS[status];
  if (status.startsWith('Rejected')) return '#EF4444';
  return 'var(--text-secondary)';
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
  const fieldDef = SANDBOX_OMNI_FIELDS.find(fd => fd.key === f.field);
  if (!fieldDef) return;
  sandboxOmniState.pendingField = f.field;
  sandboxOmniState.menuOpen = true;
  sandboxOmniState.menuType = 'filter';
  sandboxOmniState.menuStep = 'values';
  sandboxOmniState._editingIdx = idx;
  sandboxRenderOmniMenu();
  setTimeout(() => {
    if (f.op === 'contains') {
      const inp = document.getElementById('sandbox-omni-text-input');
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
    html += `<span class="omnibar-chip sort-chip"><span class="chip-text-editable" onclick="sandboxOmniEditSort(${i})" title="Click to toggle direction">${escapeHtml(label)} ${s.dir === 'asc' ? '(A-Z)' : '(Z-A)'}</span> <button class="chip-remove" onclick="sandboxOmniRemoveSort(${i})">&times;</button></span>`;
  });
  container.innerHTML = html;
}

function sandboxOmniRemoveFilter(idx) {
  sandboxOmniState.filters.splice(idx, 1);
  sandboxOmniRenderChips();
  sandboxOmniApply();
}

function sandboxOmniEditSort(idx) {
  const sort = sandboxOmniState.sorts[idx];
  if (!sort) return;
  sort.dir = sort.dir === 'asc' ? 'desc' : 'asc';
  sandboxOmniRenderChips();
  sandboxOmniApply();
}

function sandboxOmniRemoveSort(idx) {
  sandboxOmniState.sorts.splice(idx, 1);
  sandboxOmniRenderChips();
  sandboxOmniApply();
}

function sandboxOmnibarClearAll() {
  sandboxOmniState.filters = [];
  sandboxOmniState.sorts = [];
  sandboxOmniRenderChips();
  sandboxOmniApply();
}

function sandboxOmniApply() {
  let data = [...SANDBOX_MOD.insights];

  // Always filter to current user's submissions in Input Portal
  if (typeof currentUser !== 'undefined' && currentUser) {
    data = data.filter(i => i.ohr_id === currentUser.ohr_id);
  }

  // Apply omnibar filters
  sandboxOmniState.filters.forEach(f => {
    data = data.filter(row => {
      let val = row[f.field];
      // Handle category field mapping
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
  sandboxOmniState.sorts.forEach(s => {
    data.sort((a, b) => {
      let va = a[s.key] || '', vb = b[s.key] || '';
      if (s.key === 'category') { va = a.category || a.insight_category || ''; vb = b.category || b.insight_category || ''; }
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
  if (countEl) countEl.textContent = `Filtered Records: ${data.length}`;

  sandboxRenderTable();
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

// ===== Input Portal: Table (My Submissions only) =====

function sandboxRenderTable() {
  const thead = document.getElementById('sandbox-table-head');
  const tbody = document.getElementById('sandbox-table-body');
  if (!thead || !tbody) return;

  thead.innerHTML = `<tr>
    <th>Insight ID</th><th>Title</th><th>Category</th><th>Proposal Type</th><th>Status</th><th>Created Date</th>
  </tr>`;

  const start = (SANDBOX_MOD.page - 1) * SANDBOX_MOD.pageSize;
  const pageData = SANDBOX_MOD.filtered.slice(start, start + SANDBOX_MOD.pageSize);

  if (pageData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);padding:32px;">No insights found</td></tr>';
    sandboxRenderPagination();
    return;
  }

  tbody.innerHTML = pageData.map(ins => {
    const statusColor = sandboxGetStatusColor(ins.status);
    const date = ins.created_at ? new Date(ins.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
    const shortStatus = (ins.status || '').replace('Rejected - Initial Review ', 'Rej-IR ').replace('Rejected - Final Review ', 'Rej-FR ').replace('Pending - ', 'Pend. ').replace('Approved - ', 'Appr. ');
    const cat = ins.category || ins.insight_category || '—';

    return `<tr class="module-row" onclick="sandboxOpenDetail('${escapeAttr(ins.insight_id)}','input')">
      <td><span class="module-id">${escapeHtml(ins.insight_id || '')}</span></td>
      <td class="module-title-cell">${escapeHtml(ins.title || ins.insight_title || '—')}</td>
      <td>${escapeHtml(cat)}</td>
      <td>${escapeHtml(ins.proposal_type || '—')}</td>
      <td><span class="module-status-badge" style="background:${statusColor}20;color:${statusColor};border:1px solid ${statusColor}40;">${escapeHtml(shortStatus)}</span></td>
      <td>${date}</td>
    </tr>`;
  }).join('');

  sandboxRenderPagination();
}

function sandboxRenderPagination() {
  const el = document.getElementById('sandbox-pagination');
  if (!el) return;
  const total = SANDBOX_MOD.filtered.length;
  const totalPages = Math.ceil(total / SANDBOX_MOD.pageSize) || 1;
  const start = (SANDBOX_MOD.page - 1) * SANDBOX_MOD.pageSize + 1;
  const end = Math.min(SANDBOX_MOD.page * SANDBOX_MOD.pageSize, total);

  el.innerHTML = `
    <span class="module-page-info">${total > 0 ? `${start}-${end} of ${total}` : '0 records'}</span>
    <button class="btn btn-ghost btn-xs" ${SANDBOX_MOD.page <= 1 ? 'disabled' : ''} onclick="SANDBOX_MOD.page--;sandboxRenderTable();">&laquo; Prev</button>
    <span class="module-page-num">Page ${SANDBOX_MOD.page} of ${totalPages}</span>
    <button class="btn btn-ghost btn-xs" ${SANDBOX_MOD.page >= totalPages ? 'disabled' : ''} onclick="SANDBOX_MOD.page++;sandboxRenderTable();">Next &raquo;</button>
  `;
}

// ===== Review Area: Kanban Board =====

function sandboxRenderKanban() {
  const board = document.getElementById('sandbox-kanban-board');
  if (!board) return;

  let filteredInsights = [...SANDBOX_MOD.insights];

  if (typeof currentUser !== 'undefined' && currentUser) {
    const role = currentUser.actual_role;
    const cpg = currentUser.complete_planning_group || currentUser.planning_group || '';
    const pgList = cpg.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (role === 'SME') {
      filteredInsights = filteredInsights.filter(i => {
        const iPg = (i.planning_group || '').toLowerCase();
        return pgList.some(pg => iPg.includes(pg) || pg.includes(iPg));
      });
    } else if (role === 'Trainer') {
      filteredInsights = filteredInsights.filter(i => {
        const iPg = (i.planning_group || '').toLowerCase();
        return pgList.some(pg => iPg.includes(pg) || pg.includes(iPg));
      });
    }
  }

  let html = '';
  SANDBOX_MOD.KANBAN_COLUMNS.forEach(col => {
    const cards = filteredInsights.filter(i => col.statuses.includes(i.status));
    html += `
      <div class="kanban-column">
        <div class="kanban-column-header">
          <span class="kanban-column-title">${escapeHtml(col.title)}</span>
          <span class="kanban-column-count">${cards.length}</span>
        </div>
        <div class="kanban-column-body">`;

    if (cards.length === 0) {
      html += '<div class="kanban-empty">No items</div>';
    } else {
      cards.slice(0, 20).forEach(ins => {
        const statusColor = sandboxGetStatusColor(ins.status);
        const date = ins.created_at ? new Date(ins.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
        html += `
          <div class="kanban-card" onclick="sandboxOpenDetail('${escapeAttr(ins.insight_id)}','review')">
            <div class="kanban-card-header">
              <span class="kanban-card-id">${escapeHtml(ins.insight_id || '')}</span>
              <span class="kanban-card-date">${date}</span>
            </div>
            <div class="kanban-card-body">
              <div class="kanban-card-coachee">${escapeHtml(ins.title || ins.insight_title || '—')}</div>
              <div class="kanban-card-coach">${escapeHtml(ins.full_name || ins.submitter || '—')}</div>
            </div>
            <div class="kanban-card-footer">
              <span class="kanban-card-status" style="background:${statusColor}20;color:${statusColor};border:1px solid ${statusColor}40;">${escapeHtml((ins.status || '').replace(/\s*\[.*\]/, ''))}</span>
            </div>
          </div>`;
      });
      if (cards.length > 20) {
        html += `<div class="kanban-more">+${cards.length - 20} more</div>`;
      }
    }

    html += '</div></div>';
  });

  board.innerHTML = html;
}

// ===== Detail View (shared between Input Portal and Review Area) =====

function sandboxOpenDetail(insightId, context) {
  const ins = SANDBOX_MOD.insights.find(i => i.insight_id === insightId);
  if (!ins) return;
  SANDBOX_MOD.editingId = insightId;
  SANDBOX_MOD._context = context || 'input';

  // Always use the Input Portal form overlay (shared)
  const formTitle = document.getElementById('sandbox-form-title');
  const formBody = document.getElementById('sandbox-form-body');
  const formFooter = document.getElementById('sandbox-form-footer');
  const overlay = document.getElementById('sandbox-form-overlay');

  // Title is just the Insight ID
  formTitle.textContent = ins.insight_id;

  const statusColor = sandboxGetStatusColor(ins.status);
  const date = ins.created_at ? new Date(ins.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';
  const cat = ins.category || ins.insight_category || '—';

  let html = `
    <div class="detail-section">
      <h4 class="detail-section-title">INSIGHT DETAILS</h4>
      <div class="detail-row">
        <span class="detail-label">Status</span>
        <span class="module-status-badge" style="background:${statusColor}20;color:${statusColor};border:1px solid ${statusColor}40;">${escapeHtml(ins.status || '')}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Submission Date</span>
        <span class="detail-value">${date}</span>
      </div>`;

  // Show Submitter field only in Review Area context
  if (context === 'review') {
    html += `<div class="detail-row"><span class="detail-label">Submitter</span><span class="detail-value">${escapeHtml(ins.full_name || ins.submitter || '—')}</span></div>`;
  }

  html += `
      <div class="detail-row"><span class="detail-label">Title</span><span class="detail-value">${escapeHtml(ins.title || ins.insight_title || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">Category</span><span class="detail-value">${escapeHtml(cat)}</span></div>
      <div class="detail-row"><span class="detail-label">Proposal Type</span><span class="detail-value">${escapeHtml(ins.proposal_type || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">Problem Statement</span><span class="detail-value detail-multiline">${escapeHtml(ins.description || ins.problem_statement || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">Proposed Changes</span><span class="detail-value detail-multiline">${escapeHtml(ins.proposed_change || ins.impact || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">Impact</span><span class="detail-value">${escapeHtml(ins.impact_level || ins.impact || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">Reach</span><span class="detail-value">${escapeHtml(ins.reach || '—')}</span></div>
    </div>`;

  // Review History as a trail (like Dispute Trail)
  html += `<div class="detail-section"><h4 class="detail-section-title">REVIEW HISTORY</h4>`;
  html += sandboxRenderReviewTrail(ins);
  html += `</div>`;

  formBody.innerHTML = html;

  // Footer: no Close button (X exists), show review actions only in Review Area context
  let footerHtml = '';

  if (context === 'review' && typeof currentUser !== 'undefined' && currentUser) {
    const role = currentUser.actual_role;
    const userPg = currentUser.complete_planning_group || currentUser.planning_group || '';
    const userPgs = userPg.split(',').map(p => p.trim().toLowerCase()).filter(Boolean);
    const iPg = (ins.planning_group || '').toLowerCase();
    const pgMatch = userPgs.some(pg => iPg.includes(pg) || pg.includes(iPg));
    const isAdmin = currentUser.ohr_id === '740045023';

    if ((role === 'SME' && pgMatch || role === 'Manager' || isAdmin) && ins.status === 'Pending - Initial Review') {
      footerHtml += '<button class="btn btn-success btn-sm" onclick="sandboxShowAcceptPopout(\'initial\')">Approve</button>';
      footerHtml += ' <button class="btn btn-danger btn-sm" onclick="sandboxShowRejectModal(\'initial\')">Reject</button>';
    }

    if ((role === 'Trainer' && pgMatch || role === 'Manager' || isAdmin) && ['Pending - Final Review', 'Elevated - Pending POC Discussion'].includes(ins.status)) {
      footerHtml += '<button class="btn btn-success btn-sm" onclick="sandboxShowAcceptPopout(\'final\')">Approve</button>';
      footerHtml += ' <button class="btn btn-danger btn-sm" onclick="sandboxShowRejectModal(\'final\')">Reject</button>';
      if (ins.status !== 'Elevated - Pending POC Discussion') {
        footerHtml += ' <button class="btn btn-sm" style="background:#EC4899;color:#fff;" onclick="sandboxReview(\'elevate\')">Elevate</button>';
      }
    }

    if ((role === 'Trainer' && pgMatch || role === 'Manager' || isAdmin) && ins.status === 'Approved - Final Review') {
      footerHtml += '<button class="btn btn-sm" style="background:#7C3AED;color:#fff;" onclick="sandboxReview(\'implement\')">Mark Implemented</button>';
    }
  }

  formFooter.innerHTML = footerHtml;
  formFooter.style.display = footerHtml ? '' : 'none';
  overlay.style.display = 'flex';
}

function sandboxRenderReviewTrail(ins) {
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
    if (ins.status === 'Approved - Final Review') action = 'Approved (Final Review)';
    else if (ins.status === 'Elevated - Pending POC Discussion') action = 'Elevated to POC Discussion';
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
    return '<div style="color:var(--text-secondary);font-size:13px;padding:8px 0;">No review activity yet.</div>';
  }

  return entries.map(e => {
    const d = e.date ? new Date(e.date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    return `<div style="border-left:3px solid var(--accent-primary);padding:8px 0 8px 12px;margin-bottom:8px;">
      <div style="font-size:12px;color:var(--text-secondary);">${escapeHtml(d)}</div>
      <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-top:2px;">${escapeHtml(e.actor)} — ${escapeHtml(e.action)}</div>
      ${e.comments ? `<div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">${escapeHtml(e.comments)}</div>` : ''}
    </div>`;
  }).join('');
}

// ===== Accept Popout (confirmation) =====

function sandboxShowAcceptPopout(tier) {
  const formBody = document.getElementById('sandbox-form-body');
  formBody._prevHtml = formBody.innerHTML;

  const tierLabel = tier === 'initial' ? 'Initial Review' : 'Final Review';
  formBody.innerHTML = `
    <div style="padding:24px;text-align:center;">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#22C55E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:16px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      <h3 style="margin-bottom:8px;">Approve Insight</h3>
      <p style="color:var(--text-secondary);font-size:14px;">Are you sure you want to approve this insight for ${tierLabel}?</p>
      <div style="margin-top:20px;display:flex;gap:8px;justify-content:center;">
        <button class="btn btn-outline btn-sm" onclick="sandboxCloseAcceptPopout()">Cancel</button>
        <button class="btn btn-success btn-sm" onclick="sandboxCloseAcceptPopout();sandboxReview('approve-${tier}')">Save</button>
      </div>
    </div>`;
  document.getElementById('sandbox-form-footer').style.display = 'none';
}

function sandboxCloseAcceptPopout() {
  const formBody = document.getElementById('sandbox-form-body');
  if (formBody._prevHtml) {
    formBody.innerHTML = formBody._prevHtml;
    delete formBody._prevHtml;
  }
  document.getElementById('sandbox-form-footer').style.display = '';
}

// ===== Reject Modal (with aligned reasons) =====

function sandboxShowRejectModal(tier) {
  const reasons = ['Duplicate', 'Insufficient Context/Details', 'Out of Scope', 'Pitched Already'];
  const prefix = tier === 'initial' ? 'Rejected - Initial Review' : 'Rejected - Final Review';

  const formBody = document.getElementById('sandbox-form-body');
  formBody._prevHtml = formBody.innerHTML;

  formBody.innerHTML = `
    <div style="padding:24px;">
      <h4 style="margin-bottom:16px;font-size:16px;">Select Rejection Reason</h4>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${reasons.map(r => `<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--border-primary);border-radius:8px;cursor:pointer;font-size:14px;transition:background 0.15s;" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
          <input type="radio" name="sandbox-reject-reason" value="${escapeAttr(prefix)} [${escapeAttr(r)}]" style="accent-color:var(--accent-primary);">
          <span>${escapeHtml(r)}</span>
        </label>`).join('')}
      </div>
      <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn btn-outline btn-sm" onclick="sandboxCloseRejectModal()">Cancel</button>
        <button class="btn btn-danger btn-sm" onclick="sandboxSubmitReject()">Save</button>
      </div>
    </div>`;
  document.getElementById('sandbox-form-footer').style.display = 'none';
}

function sandboxSubmitReject() {
  const selected = document.querySelector('input[name="sandbox-reject-reason"]:checked');
  if (!selected) { showToast('Please select a rejection reason', 'error'); return; }
  sandboxCloseRejectModal();
  sandboxRejectWith(selected.value);
}

function sandboxCloseRejectModal() {
  const formBody = document.getElementById('sandbox-form-body');
  if (formBody._prevHtml) {
    formBody.innerHTML = formBody._prevHtml;
    delete formBody._prevHtml;
  }
  document.getElementById('sandbox-form-footer').style.display = '';
}

// ===== Review Actions =====

async function sandboxReview(action) {
  const ins = SANDBOX_MOD.insights.find(i => i.insight_id === SANDBOX_MOD.editingId);
  if (!ins) return;

  const user = typeof currentUser !== 'undefined' ? currentUser : null;
  const updates = { updated_at: new Date().toISOString() };

  if (action === 'approve-initial') {
    updates.status = 'Pending - Final Review';
    updates.initial_reviewer = user ? user.full_name : '';
    updates.initial_review_date = new Date().toISOString();
  } else if (action === 'approve-final') {
    updates.status = 'Approved - Final Review';
    updates.final_reviewer = user ? user.full_name : '';
    updates.final_review_date = new Date().toISOString();
  } else if (action === 'elevate') {
    updates.status = 'Elevated - Pending POC Discussion';
    updates.final_reviewer = user ? user.full_name : '';
    updates.final_review_date = new Date().toISOString();
  } else if (action === 'implement') {
    updates.status = 'Implemented';
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

    showToast('Insight updated successfully', 'success');
    if (typeof createNotification === 'function') {
      createNotification('insight_review', 'Insight Reviewed', `${ins.insight_id} — ${ins.title || ins.insight_title} → ${updates.status}`, user?.ohr_id, user?.full_name);
    }
    sandboxCloseForm();
    await sandboxFetchInsights();
    sandboxRenderKanban();
  } catch (e) {
    console.error('Failed to update insight:', e);
    showToast('Failed to update: ' + e.message, 'error');
  }
}

async function sandboxRejectWith(statusValue) {
  const ins = SANDBOX_MOD.insights.find(i => i.insight_id === SANDBOX_MOD.editingId);
  if (!ins) return;

  const user = typeof currentUser !== 'undefined' ? currentUser : null;
  const isFinal = statusValue.startsWith('Rejected - Final');
  const updates = {
    status: statusValue,
    updated_at: new Date().toISOString()
  };

  if (isFinal) {
    updates.final_reviewer = user ? user.full_name : '';
    updates.final_review_date = new Date().toISOString();
  } else {
    updates.initial_reviewer = user ? user.full_name : '';
    updates.initial_review_date = new Date().toISOString();
  }

  try {
    const url = `${IO_API_BASE}/insights/${encodeURIComponent(ins.insight_id)}`;
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!resp.ok) throw new Error('Failed to reject insight');

    showToast('Insight rejected', 'success');
    if (typeof createNotification === 'function') {
      createNotification('insight_review', 'Insight Rejected', `${ins.insight_id} — ${ins.title || ins.insight_title} → ${statusValue}`, user?.ohr_id, user?.full_name);
    }
    sandboxCloseForm();
    await sandboxFetchInsights();
    sandboxRenderKanban();
  } catch (e) {
    console.error('Failed to reject insight:', e);
    showToast('Failed to reject: ' + e.message, 'error');
  }
}

// ===== New Insight Form =====

async function sandboxShowNewForm() {
  await sandboxFetchEmployees();
  SANDBOX_MOD.editingId = null;

  const formTitle = document.getElementById('sandbox-form-title');
  const formBody = document.getElementById('sandbox-form-body');
  const formFooter = document.getElementById('sandbox-form-footer');
  const overlay = document.getElementById('sandbox-form-overlay');

  const insightId = 'INS-' + Date.now().toString(36).toUpperCase();
  SANDBOX_MOD._pendingInsightId = insightId;
  formTitle.textContent = insightId;

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

  formBody.innerHTML = `
    <div class="form-section">
      <div class="form-field">
        <label class="form-label">Title <span class="required">*</span></label>
        <input type="text" class="form-input" id="sandbox-new-title" placeholder="Enter a brief, descriptive title for your insight">
      </div>
      <div class="form-field">
        <label class="form-label">Insight Category <span class="required">*</span></label>
        <select class="form-select" id="sandbox-new-insight-category">
          <option value="">— Select Insight Category —</option>
          <option value="Efficiency">Efficiency</option>
          <option value="Effectiveness">Effectiveness</option>
        </select>
      </div>
      <div class="form-field">
        <label class="form-label">Proposal Type <span class="required">*</span></label>
        <select class="form-select" id="sandbox-new-proposal-type" onchange="sandboxOnProposalTypeChange()">
          <option value="">— Select Proposal Type —</option>
          <option value="IS Impacting">IS Impacting</option>
          <option value="Process/Workflow Related">Process/Workflow Related</option>
          <option value="Tooling">Tooling</option>
        </select>
      </div>
      <div class="form-field">
        <label class="form-label">Implementation Standards <span class="required">*</span></label>
        <select class="form-select" id="sandbox-new-impl-standards">
          <option value="">— Select Implementation Standard —</option>
          ${implOptions}
        </select>
      </div>
      <div class="form-field">
        <label class="form-label">Problem Statement <span class="required">*</span></label>
        <textarea class="form-textarea" id="sandbox-new-desc" rows="5" placeholder="Describe the problem or opportunity in detail..."></textarea>
      </div>
      <div class="form-field">
        <label class="form-label">Proposed Changes <span class="required">*</span></label>
        <textarea class="form-textarea" id="sandbox-new-proposed" rows="5" placeholder="Describe your proposed changes..."></textarea>
      </div>
      <div class="form-field">
        <label class="form-label">Impact <span class="required">*</span></label>
        <select class="form-select" id="sandbox-new-impact">
          <option value="">— Select Impact Level —</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
      </div>
      <div class="form-field">
        <label class="form-label">Reach <span class="required">*</span></label>
        <select class="form-select" id="sandbox-new-reach">
          <option value="">— Select Reach Level —</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
      </div>
      <div id="sandbox-job-ids-section" style="display:none;">
        <label class="form-label" style="margin-bottom:8px;">Job IDs <span class="required">*</span> <span style="font-weight:normal;color:var(--fg-muted);font-size:0.8em;">(10 required, must be unique)</span></label>
        ${Array.from({length:10}, (_,i) => `
          <div class="form-field" style="margin-bottom:6px;">
            <input type="text" class="form-input" id="sandbox-new-jobid-${i+1}" placeholder="Job ID ${i+1}">
          </div>
        `).join('')}
      </div>
    </div>
  `;

  formFooter.innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="sandboxCloseForm()">Cancel</button>
    <button class="btn btn-primary btn-sm" onclick="sandboxSubmitNew()">Submit Insight</button>
  `;
  formFooter.style.display = '';

  overlay.style.display = 'flex';
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

    showToast('Insight submitted successfully', 'success');
    if (typeof createNotification === 'function') {
      createNotification('insight_submit', 'New Insight Submitted', `${insightId} — ${title}`, user?.ohr_id, user?.full_name);
    }
    sandboxCloseForm();
    await sandboxFetchInsights();
  } catch (e) {
    console.error('Failed to submit insight:', e);
    showToast('Failed to submit: ' + e.message, 'error');
  }
}

function sandboxCloseForm() {
  const overlay = document.getElementById('sandbox-form-overlay');
  if (overlay) overlay.style.display = 'none';
  SANDBOX_MOD.editingId = null;
}

// ===== Init =====

async function initSandbox(view) {
  await sandboxFetchEmployees();
  await sandboxFetchInsights();
  if (view === 'sandbox-review') sandboxRenderKanban();
}
