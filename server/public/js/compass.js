/**
 * Compass — Coaching Log Tracker (3 Sub-pages)
 * Sub-page 1: Input Portal — create & browse coaching logs
 * Sub-page 2: Disputes Area — Kanban board for QA Feedback dispute workflow
 * Sub-page 3: Analytics — coaching metrics and trends
 */

const COMPASS = {
  logs: [],
  filtered: [],
  employees: [],
  currentTab: 'all',
  currentSubpage: 'input',
  page: 1,
  pageSize: 25,
  editingId: null,
  selectedParentLog: null,
  givenTab: 'all',  // 'all', 'acknowledged', 'unacknowledged'
  receivedTab: 'all',  // 'all', 'acknowledged', 'unacknowledged'
  pageGiven: 1,
  pageReceived: 1,

  COACHING_TYPES: ['CAP 0 Coaching', 'Follow-Up Session', 'Group Coaching', 'Triad Coaching', 'QA Feedback', 'ZTP Coaching'],

  QA_STATUSES: [
    'Pending SME Review',
    'Markdown Accepted',
    'Markdown Disputed',
    'Markdown Reversed - QA',
    'Markdown Retained - QA',
    'QA Decision Accepted',
    'QA Decision Rejected',
    'Markdown Reversed - Trainer',
    'Markdown Retained - Trainer',
    'Trainer Decision Accepted',
    'Trainer Decision Rejected',
    'Markdown Reversed - QTP Manager',
    'Markdown Retained - QTP Manager',
    'Pending Acknowledgement',
    'Acknowledged'
  ],

  SIMPLE_STATUSES: ['Pending Acknowledgement', 'Acknowledged'],

  STATUS_COLORS: {
    'Pending Acknowledgement': '#F59E0B',
    'Acknowledged': '#22C55E',
    'Pending SME Review': '#3B82F6',
    'Markdown Accepted': '#22C55E',
    'Markdown Disputed': '#EF4444',
    'Markdown Reversed - QA': '#8B5CF6',
    'Markdown Retained - QA': '#F97316',
    'QA Decision Accepted': '#22C55E',
    'QA Decision Rejected': '#EF4444',
    'Markdown Reversed - Trainer': '#8B5CF6',
    'Markdown Retained - Trainer': '#F97316',
    'Trainer Decision Accepted': '#22C55E',
    'Trainer Decision Rejected': '#EF4444',
    'Markdown Reversed - QTP Manager': '#8B5CF6',
    'Markdown Retained - QTP Manager': '#F97316'
  },

  // Kanban columns for QA Feedback dispute flow
  KANBAN_COLUMNS: [
    { id: 'pending-sme', title: 'LV1 - PENDING SME REVIEW', statuses: ['Pending SME Review', ''] },
    { id: 'sme-disputed', title: 'LV2 - PENDING QA DECISION', statuses: ['Markdown Disputed'] },
    { id: 'qa-decision', title: 'LV3 - PENDING SME-QA DECISION', statuses: ['Markdown Retained - QA'] },
    { id: 'trainer-review', title: 'LV4 - PENDING TRAINER DECISION', statuses: ['QA Decision Rejected'] },
    { id: 'sme-trainer', title: 'LV5 - PENDING SME-TRAINER DECISION', statuses: ['Markdown Retained - Trainer'] },
    { id: 'qtp-review', title: 'LV6 - PENDING QTP MANAGER DECISION', statuses: ['Trainer Decision Rejected'] }
  ]
};

// ===== Sub-page Switching =====

function compassSwitchSubpage(subpage) {
  COMPASS.currentSubpage = subpage;
  document.querySelectorAll('#compass-subpage-tabs .subpage-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.subpage === subpage);
  });
  document.querySelectorAll('.compass-subpage').forEach(el => el.style.display = 'none');
  const target = document.getElementById('compass-sub-' + subpage);
  if (target) target.style.display = '';

  if (subpage === 'input') {
    compassApplyFilters();
  } else if (subpage === 'disputes') {
    compassRenderKanban();
  } else if (subpage === 'analytics') {
    compassRenderAnalytics();
  }
}

// ===== Data Fetching =====

async function compassFetchLogs() {
  const loading = document.getElementById('compass-loading');
  const content = document.getElementById('compass-content');
  if (loading) loading.style.display = 'flex';
  if (content) content.style.display = 'none';

  try {
    const url = `${IO_API_BASE}/coaching?limit=5000&lean=1`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Failed to fetch coaching logs');
    COMPASS.logs = await resp.json();
    // Parse coachee_list from JSON string to array
    COMPASS.logs.forEach(l => {
      if (l.coachee_list && typeof l.coachee_list === 'string') {
        try { l.coachee_list = JSON.parse(l.coachee_list); } catch (e) { l.coachee_list = []; }
      }
      if (!Array.isArray(l.coachee_list)) l.coachee_list = [];
    });
  } catch (e) {
    console.error('Compass fetch error:', e);
    COMPASS.logs = [];
  }

  if (loading) loading.style.display = 'none';
  if (content) content.style.display = 'block';
  compassPopulateStatusFilter();
  compassApplyFilters();
}

async function compassFetchEmployees() {
  if (COMPASS.employees.length > 0) return;
  try {
    const url = `${IO_API_BASE}/employees?employement_status=Active&order=full_name&limit=2000`;
    const resp = await fetch(url);
    if (resp.ok) COMPASS.employees = await resp.json();
  } catch (e) {
    console.error('Failed to fetch employees for Compass:', e);
  }
}

// ===== Input Portal: Filters & Tabs =====

function compassPopulateStatusFilter() {
  const sel = document.getElementById('compass-filter-status');
  if (!sel) return;
  const statuses = [...new Set(COMPASS.logs.map(l => l.status).filter(Boolean))].sort();
  sel.innerHTML = '<option value="All">All Statuses</option>' +
    statuses.map(s => `<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join('');
}

function compassSwitchTab(tab) {
  // Legacy — no longer used but kept for safety
  COMPASS.currentTab = tab;
  COMPASS.page = 1;
  compassApplyFilters();
}

function compassApplyFilters() {
  let allData = [...COMPASS.logs];

  const typeFilter = document.getElementById('compass-filter-type')?.value || 'All';
  const statusFilter = document.getElementById('compass-filter-status')?.value || 'All';
  const startDate = document.getElementById('compass-filter-start')?.value || '';
  const endDate = document.getElementById('compass-filter-end')?.value || '';
  const search = (document.getElementById('compass-search')?.value || '').toLowerCase().trim();

  if (typeFilter !== 'All') allData = allData.filter(l => l.coaching_type === typeFilter);
  if (statusFilter !== 'All') allData = allData.filter(l => l.status === statusFilter);

  // Hide QA Feedback logs with active dispute statuses from Coaching Profile
  // (these remain visible in the Disputes Area kanban)
  const QA_DISPUTE_HIDDEN_STATUSES = [
    'Markdown Disputed - SME',
    'Markdown Retained - QA',
    'QA Decision Rejected - SME',
    'Markdown Retained - Trainer',
    'Trainer Decision Rejected - SME',
  ];
  allData = allData.filter(l => {
    if (l.coaching_type !== 'QA Feedback') return true;
    return !QA_DISPUTE_HIDDEN_STATUSES.includes(l.status);
  });
  if (startDate) allData = allData.filter(l => l.coaching_date && l.coaching_date.slice(0, 10) >= startDate);
  if (endDate) allData = allData.filter(l => l.coaching_date && l.coaching_date.slice(0, 10) <= endDate);
  if (search) {
    allData = allData.filter(l =>
      (l.coachee || '').toLowerCase().includes(search) ||
      (l.coach || '').toLowerCase().includes(search) ||
      (l.coachee_ohr || '').includes(search) ||
      String(l.coaching_id || l.id || '').toLowerCase().includes(search)
    );
  }

  const isAdmin740 = currentUser && currentUser.ohr_id === '740045023';
  const isAgent = currentUser && currentUser.actual_role === 'Agent' && !isAdmin740;

  if (isAdmin740) {
    // Admin override — sees ALL coaching logs
    COMPASS.filteredGiven = allData;
    COMPASS.filteredReceived = [];
  } else if (isAgent) {
    // Agents only see received
    COMPASS.filteredGiven = [];
    COMPASS.filteredReceived = allData.filter(l => l.coachee_ohr === currentUser.ohr_id);
  } else if (currentUser) {
    COMPASS.filteredGiven = allData.filter(l => l.coach_ohr === currentUser.ohr_id);
    COMPASS.filteredReceived = allData.filter(l => l.coachee_ohr === currentUser.ohr_id);
  } else {
    COMPASS.filteredGiven = allData;
    COMPASS.filteredReceived = [];
  }

  // Sort by coaching_date descending (most recent first)
  const sortByDateDesc = (a, b) => {
    const da = a.coaching_date ? new Date(a.coaching_date).getTime() : 0;
    const db = b.coaching_date ? new Date(b.coaching_date).getTime() : 0;
    return db - da;
  };
  COMPASS.filteredGiven.sort(sortByDateDesc);
  COMPASS.filteredReceived.sort(sortByDateDesc);

  // Keep legacy COMPASS.filtered as combined for backward compat
  COMPASS.filtered = [...COMPASS.filteredGiven, ...COMPASS.filteredReceived];

  // Update total filtered records counter
  const countEl = document.getElementById('compass-filtered-count');
  if (countEl) countEl.textContent = COMPASS.filteredGiven.length + COMPASS.filteredReceived.length;

  // Update per-panel counts (reflects active tab)
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

  // Compute acknowledged/unacknowledged counts for Given tab badges
  const ackGiven = COMPASS.filteredGiven.filter(l => compassIsAcknowledged(l));
  const unackGiven = COMPASS.filteredGiven.filter(l => !compassIsAcknowledged(l));
  const ackCountEl = document.getElementById('compass-ack-count');
  const unackCountEl = document.getElementById('compass-unack-count');
  if (ackCountEl) ackCountEl.textContent = ackGiven.length;
  if (unackCountEl) unackCountEl.textContent = unackGiven.length;

  // Compute acknowledged/unacknowledged counts for Received tab badges
  const ackRecv = COMPASS.filteredReceived.filter(l => compassIsAcknowledged(l));
  const unackRecv = COMPASS.filteredReceived.filter(l => !compassIsAcknowledged(l));
  const recvAckCountEl = document.getElementById('compass-recv-ack-count');
  const recvUnackCountEl = document.getElementById('compass-recv-unack-count');
  if (recvAckCountEl) recvAckCountEl.textContent = ackRecv.length;
  if (recvUnackCountEl) recvUnackCountEl.textContent = unackRecv.length;

  compassRenderTable('given');
  compassRenderTable('received');
}

/**
 * Check if a coaching log is considered "acknowledged".
 * Acknowledged = coachee_ack, coachee_commitments, coaching_rating, coachee_sentiments all filled.
 */
function compassIsAcknowledged(log) {
  return !!(log.coachee_ack && log.coachee_ack.trim() &&
            log.coachee_commitments && log.coachee_commitments.trim() &&
            log.coaching_rating && String(log.coaching_rating).trim() &&
            log.coachee_sentiments && log.coachee_sentiments.trim());
}

/**
 * Switch between All / Acknowledged / Unacknowledged tabs on Coaching Given.
 */
function compassSwitchGivenTab(tab) {
  COMPASS.givenTab = tab;
  COMPASS.pageGiven = 1;
  document.querySelectorAll('#compass-given-tabs .compass-given-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  compassRenderTable('given');
}

function compassSwitchReceivedTab(tab) {
  COMPASS.receivedTab = tab;
  COMPASS.pageReceived = 1;
  document.querySelectorAll('#compass-received-tabs .compass-given-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  compassRenderTable('received');
}

// Session goal color map for badges
const SESSION_GOAL_COLORS = {
  // New canonical goals
  'AES/Scorecard Discussion': { bg: '#7C3AED20', color: '#7C3AED', border: '#7C3AED40' },
  'Attendance & Tardiness': { bg: '#F59E0B20', color: '#F59E0B', border: '#F59E0B40' },
  'Compliance & Behavior': { bg: '#DC262620', color: '#DC2626', border: '#DC262640' },
  'Escalation': { bg: '#F9731620', color: '#F97316', border: '#F9731640' },
  'Internal Discussion': { bg: '#6366F120', color: '#6366F1', border: '#6366F140' },
  'Performance & Metrics': { bg: '#2563EB20', color: '#2563EB', border: '#2563EB40' },
  'Performance Improvement Plan': { bg: '#E1195620', color: '#E11956', border: '#E1195640' },
  'Professional & Personal Development': { bg: '#10B98120', color: '#10B981', border: '#10B98140' },
  // Legacy goals (still rendered for historical logs)
  'AHT Performance Findings': { bg: '#8B5CF620', color: '#8B5CF6', border: '#8B5CF640' },
  'Attendance & Productivity': { bg: '#F59E0B20', color: '#F59E0B', border: '#F59E0B40' },
  'Behavior': { bg: '#EF444420', color: '#EF4444', border: '#EF444440' },
  'Compliance': { bg: '#DC262620', color: '#DC2626', border: '#DC262640' },
  'Leave & Work Offset': { bg: '#14B8A620', color: '#14B8A6', border: '#14B8A640' },
  'PKT Result': { bg: '#0EA5E920', color: '#0EA5E9', border: '#0EA5E940' },
  'Professional & Personal Development Plan': { bg: '#10B98120', color: '#10B981', border: '#10B98140' },
  'Quality Error Findings': { bg: '#BE185D20', color: '#BE185D', border: '#BE185D40' },
  'Scorecard Discussion': { bg: '#7C3AED20', color: '#7C3AED', border: '#7C3AED40' },
  'Specific Metric Performance': { bg: '#2563EB20', color: '#2563EB', border: '#2563EB40' },
  'Coaching Observation': { bg: '#059669', color: '#FFFFFF', border: '#05966940' },
  'tardiness': { bg: '#D9770620', color: '#D97706', border: '#D9770640' },
};

function compassGoalBadge(goalText) {
  const g = goalText.trim();
  const c = SESSION_GOAL_COLORS[g] || { bg: 'var(--bg-inset)', color: 'var(--fg-muted)', border: 'var(--border-default)' };
  return `<span style="display:block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500;line-height:1.4;margin:2px 0;background:${c.bg};color:${c.color};border:1px solid ${c.border};white-space:nowrap;width:fit-content;">${escapeHtml(g)}</span>`;
}

// ===== Input Portal: Stats =====

function compassRenderStats() {
  const el = document.getElementById('compass-stats');
  if (!el) return;
  const total = COMPASS.filtered.length;
  const pending = COMPASS.filtered.filter(l => l.status === 'Pending Acknowledgement').length;
  const acked = COMPASS.filtered.filter(l => l.status === 'Acknowledged').length;
  const qaActive = COMPASS.filtered.filter(l => l.coaching_type === 'QA Feedback' && !['Acknowledged', 'Pending Acknowledgement'].includes(l.status)).length;

  el.innerHTML = `
    <div class="module-stat-card">
      <div class="module-stat-value">${total}</div>
      <div class="module-stat-label">Total Logs</div>
    </div>
    <div class="module-stat-card stat-warning">
      <div class="module-stat-value">${pending}</div>
      <div class="module-stat-label">Pending Ack</div>
    </div>
    <div class="module-stat-card stat-success">
      <div class="module-stat-value">${acked}</div>
      <div class="module-stat-label">Acknowledged</div>
    </div>
    <div class="module-stat-card stat-info">
      <div class="module-stat-value">${qaActive}</div>
      <div class="module-stat-label">QA In Dispute</div>
    </div>
  `;
}

// ===== Input Portal: Table Rendering =====

function compassRenderTable(which) {
  const isGiven = which === 'given';
  const thead = document.getElementById(`compass-table-${which}-head`);
  const tbody = document.getElementById(`compass-table-${which}-body`);
  if (!thead || !tbody) return;

  let data = isGiven ? (COMPASS.filteredGiven || []) : (COMPASS.filteredReceived || []);

  // Apply Acknowledged/Unacknowledged tab filter
  const tabKey = isGiven ? 'givenTab' : 'receivedTab';
  if (COMPASS[tabKey] === 'acknowledged') {
    data = data.filter(l => compassIsAcknowledged(l));
  } else if (COMPASS[tabKey] === 'unacknowledged') {
    data = data.filter(l => !compassIsAcknowledged(l));
  }

  const pageKey = isGiven ? 'pageGiven' : 'pageReceived';
  if (!COMPASS[pageKey]) COMPASS[pageKey] = 1;

  // Given table: no Coach column. Received table: no Coachee column.
  const showCoachCol = !isGiven;
  const showCoacheeCol = isGiven;
  const totalCols = 5; // ID, Type, Stamp, Person, Session Goal

  if (isGiven) {
    thead.innerHTML = `<tr><th>ID</th><th>Type</th><th>Coaching Stamp</th><th>Coachee</th><th>Session Goal</th></tr>`;
  } else {
    thead.innerHTML = `<tr><th>ID</th><th>Type</th><th>Coaching Stamp</th><th>Coach</th><th>Session Goal</th></tr>`;
  }

  const start = (COMPASS[pageKey] - 1) * COMPASS.pageSize;
  const pageData = data.slice(start, start + COMPASS.pageSize);

  if (pageData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${totalCols}" style="text-align:center;color:var(--text-secondary);padding:32px;">No coaching logs found</td></tr>`;
    compassRenderPagination(which);
    return;
  }

  tbody.innerHTML = pageData.map(log => {
    const statusColor = COMPASS.STATUS_COLORS[log.status] || 'var(--text-secondary)';
    const dateObj = log.coaching_date ? new Date(log.coaching_date) : null;
    const date = dateObj ? dateObj.toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '\u2014';
    const coacheeDisplay = log.coaching_type === 'Group Coaching'
      ? (log.coachee_list && log.coachee_list.length > 0 ? `${log.coachee_list.length} coachees` : log.coachee || '\u2014')
      : (log.coachee || '\u2014');
    const personCol = isGiven ? escapeHtml(coacheeDisplay) : escapeHtml(log.coach || '\u2014');

    // Session goal: split by comma and display each as a color-coded badge
    const sessionGoalHtml = log.session_goal
      ? log.session_goal.split(',').map(g => compassGoalBadge(g)).join('')
      : '\u2014';

    return `<tr class="module-row" onclick="compassOpenDetail('${log.coaching_id || log.id}')">
      <td><span class="module-id">${log.coaching_id || log.id}</span></td>
      <td><span class="module-type-badge type-${(log.coaching_type || '').replace(/\s+/g, '-').toLowerCase()}">${escapeHtml(log.coaching_type || '')}</span></td>
      <td>${date}</td>
      <td>${personCol}</td>
      <td style="font-size:12px;"><div style="display:flex;flex-direction:column;gap:2px;">${sessionGoalHtml}</div></td>
    </tr>`;
  }).join('');

  compassRenderPagination(which);
}

function compassRenderPagination(which) {
  const el = document.getElementById(`compass-pagination-${which}`);
  if (!el) return;
  const isGiven = which === 'given';
  let data = isGiven ? (COMPASS.filteredGiven || []) : (COMPASS.filteredReceived || []);

  // Apply tab filter for pagination count
  const tabKeyPag = isGiven ? 'givenTab' : 'receivedTab';
  if (COMPASS[tabKeyPag] === 'acknowledged') {
    data = data.filter(l => compassIsAcknowledged(l));
  } else if (COMPASS[tabKeyPag] === 'unacknowledged') {
    data = data.filter(l => !compassIsAcknowledged(l));
  }
  const pageKey = isGiven ? 'pageGiven' : 'pageReceived';
  if (!COMPASS[pageKey]) COMPASS[pageKey] = 1;
  const total = data.length;
  const totalPages = Math.ceil(total / COMPASS.pageSize) || 1;
  const start = (COMPASS[pageKey] - 1) * COMPASS.pageSize + 1;
  const end = Math.min(COMPASS[pageKey] * COMPASS.pageSize, total);

  el.innerHTML = `
    <span class="module-page-info">${total > 0 ? `${start}-${end} of ${total}` : '0 records'}</span>
    <button class="btn btn-ghost btn-xs" ${COMPASS[pageKey] <= 1 ? 'disabled' : ''} onclick="COMPASS.${pageKey}--;compassRenderTable('${which}');">&laquo; Prev</button>
    <span class="module-page-num">Page ${COMPASS[pageKey]} of ${totalPages}</span>
    <button class="btn btn-ghost btn-xs" ${COMPASS[pageKey] >= totalPages ? 'disabled' : ''} onclick="COMPASS.${pageKey}++;compassRenderTable('${which}');">Next &raquo;</button>
  `;
}

// ===== Disputes Area: Kanban Board =====

// Per-column pagination state for kanban
if (!COMPASS._kanbanPages) COMPASS._kanbanPages = {};
const KANBAN_PAGE_SIZE = 8;

function compassRenderKanban() {
  const board = document.getElementById('compass-kanban-board');
  if (!board) return;

  const qaLogs = COMPASS.logs.filter(l => l.coaching_type === 'QA Feedback');

  let html = '';
  COMPASS.KANBAN_COLUMNS.forEach(col => {
    const cards = qaLogs.filter(l => col.statuses.includes(l.status) || (col.statuses.includes('') && !l.status));
    const page = COMPASS._kanbanPages[col.id] || 1;
    const totalPages = Math.ceil(cards.length / KANBAN_PAGE_SIZE) || 1;
    const start = (page - 1) * KANBAN_PAGE_SIZE;
    const pageCards = cards.slice(start, start + KANBAN_PAGE_SIZE);

    // Build pagination HTML
    let paginationHtml = '';
    if (totalPages > 1) {
      paginationHtml = `<div class="kanban-col-pagination" style="margin-bottom:8px;">
        <button class="btn btn-ghost btn-xs" ${page <= 1 ? 'disabled' : ''} onclick="compassKanbanPage('${col.id}',${page - 1})">&laquo;</button>
        <span style="font-size:11px;color:var(--fg-muted);">${page}/${totalPages}</span>
        <button class="btn btn-ghost btn-xs" ${page >= totalPages ? 'disabled' : ''} onclick="compassKanbanPage('${col.id}',${page + 1})">&raquo;</button>
      </div>`;
    }

    html += `
      <div class="kanban-column">
        <div class="kanban-column-header">
          <span class="kanban-column-title">${escapeHtml(col.title)}</span>
          <span class="kanban-column-count">${cards.length}</span>
        </div>
        <div class="kanban-column-body">
        ${paginationHtml}`;

    if (cards.length === 0) {
      html += '<div class="kanban-empty">No items</div>';
    } else {
      pageCards.forEach(log => {
        const date = log.coaching_date ? new Date(log.coaching_date).toLocaleDateString('en-US', { timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '\u2014';
        html += `
          <div class="kanban-card kanban-card-styled" onclick="disputesOpenDetail('${log.coaching_id || log.id}')">
            <div class="kanban-card-id-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span class="kanban-card-id">${escapeHtml(log.coaching_id || log.id)}</span>
            </div>
            <div class="kanban-card-coachee-row">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--fg-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <span>${escapeHtml(log.coachee || '\u2014')}</span>
            </div>
            <div class="kanban-card-date-row">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--fg-subtle)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <span>${date}</span>
            </div>
          </div>`;
      });
    }

    html += '</div></div>';
  });
  board.innerHTML = html;
}

function compassKanbanPage(colId, page) {
  COMPASS._kanbanPages[colId] = page;
  compassRenderKanban();
}

// ===== Analytics Sub-page =====

function compassRenderAnalytics() {
  const container = document.getElementById('compass-analytics-content');
  if (!container) return;

  const logs = COMPASS.logs;
  const total = logs.length;

  // Type breakdown
  const byType = {};
  COMPASS.COACHING_TYPES.forEach(t => byType[t] = 0);
  logs.forEach(l => { if (byType[l.coaching_type] !== undefined) byType[l.coaching_type]++; });

  // Status breakdown
  const byStatus = {};
  logs.forEach(l => { byStatus[l.status] = (byStatus[l.status] || 0) + 1; });

  // Monthly trend
  const byMonth = {};
  logs.forEach(l => {
    if (l.coaching_date) {
      const m = l.coaching_date.slice(0, 7);
      byMonth[m] = (byMonth[m] || 0) + 1;
    }
  });
  const months = Object.keys(byMonth).sort();

  // Top coaches
  const byCoach = {};
  logs.forEach(l => { if (l.coach) byCoach[l.coach] = (byCoach[l.coach] || 0) + 1; });
  const topCoaches = Object.entries(byCoach).sort((a, b) => b[1] - a[1]).slice(0, 10);

  // QA dispute resolution stats
  const qaLogs = logs.filter(l => l.coaching_type === 'QA Feedback');
  const qaResolved = qaLogs.filter(l => ['Markdown Accepted', 'Acknowledged', 'Pending Acknowledgement',
    'Markdown Reversed - QA', 'QA Decision Accepted', 'Markdown Reversed - Trainer', 'Trainer Decision Accepted',
    'Markdown Reversed - QTP Manager', 'Markdown Retained - QTP Manager'].includes(l.status));
  const qaActive = qaLogs.filter(l => !['Markdown Accepted', 'Acknowledged', 'Pending Acknowledgement',
    'Markdown Reversed - QA', 'QA Decision Accepted', 'Markdown Reversed - Trainer', 'Trainer Decision Accepted',
    'Markdown Reversed - QTP Manager', 'Markdown Retained - QTP Manager'].includes(l.status));

  let html = `
    <div class="analytics-grid">
      <div class="analytics-card">
        <div class="analytics-card-title">Total Coaching Logs</div>
        <div class="analytics-card-value">${total}</div>
      </div>
      <div class="analytics-card">
        <div class="analytics-card-title">QA Feedback Logs</div>
        <div class="analytics-card-value">${qaLogs.length}</div>
      </div>
      <div class="analytics-card">
        <div class="analytics-card-title">Active QA Disputes</div>
        <div class="analytics-card-value" style="color:var(--status-error);">${qaActive.length}</div>
      </div>
      <div class="analytics-card">
        <div class="analytics-card-title">QA Resolved</div>
        <div class="analytics-card-value" style="color:var(--status-success);">${qaResolved.length}</div>
      </div>
    </div>

    <div class="analytics-section">
      <h4 class="analytics-section-title">Coaching by Type</h4>
      <div class="analytics-bar-chart">
        ${Object.entries(byType).map(([type, count]) => {
          const pct = total > 0 ? (count / total * 100) : 0;
          return `<div class="analytics-bar-row">
            <span class="analytics-bar-label">${escapeHtml(type)}</span>
            <div class="analytics-bar-track"><div class="analytics-bar-fill" style="width:${pct}%;background:var(--accent-primary);"></div></div>
            <span class="analytics-bar-value">${count}</span>
          </div>`;
        }).join('')}
      </div>
    </div>

    <div class="analytics-section">
      <h4 class="analytics-section-title">Monthly Trend</h4>
      <div class="analytics-table-wrapper">
        <table class="data-table">
          <thead><tr><th>Month</th><th>Count</th><th>Trend</th></tr></thead>
          <tbody>
            ${months.slice(-12).map(m => {
              const count = byMonth[m];
              const maxCount = Math.max(...months.map(mm => byMonth[mm]));
              const pct = maxCount > 0 ? (count / maxCount * 100) : 0;
              return `<tr>
                <td>${m}</td>
                <td>${count}</td>
                <td><div class="analytics-bar-track" style="width:200px;"><div class="analytics-bar-fill" style="width:${pct}%;background:var(--accent-primary);"></div></div></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="analytics-section">
      <h4 class="analytics-section-title">Top 10 Coaches</h4>
      <div class="analytics-table-wrapper">
        <table class="data-table">
          <thead><tr><th>#</th><th>Coach</th><th>Sessions</th></tr></thead>
          <tbody>
            ${topCoaches.map(([name, count], i) => `<tr><td>${i + 1}</td><td>${escapeHtml(name)}</td><td>${count}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

// ===== Detail / Edit View =====

async function compassOpenDetail(coachingId) {
  let log = COMPASS.logs.find(l => String(l.coaching_id || l.id) === String(coachingId));
  if (!log) return;
  COMPASS.editingId = log.coaching_id || log.id;

  // Fetch full record on demand if coaching_details is missing (lean mode)
  if (log.coaching_details === undefined) {
    try {
      const fullResp = await fetch(`${IO_API_BASE}/coaching?coaching_id=${encodeURIComponent(log.coaching_id || log.id)}`);
      if (fullResp.ok) {
        const fullRows = await fullResp.json();
        if (fullRows.length > 0) {
          // Merge full data into cached log
          Object.assign(log, fullRows[0]);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch full coaching details:', e);
    }
  }

  // Ensure employees are loaded for supervisor visibility check
  if (!COMPASS.employees || COMPASS.employees.length === 0) {
    await compassFetchEmployees();
  }

  const formTitle = document.getElementById('compass-form-title');
  const formBody = document.getElementById('compass-form-body');
  const formFooter = document.getElementById('compass-form-footer');
  const overlay = document.getElementById('compass-form-overlay');

  const statusColor = COMPASS.STATUS_COLORS[log.status] || 'var(--fg-muted)';
  formTitle.innerHTML = `<span>${escapeHtml(log.coaching_id || '#' + log.id)}</span>`;

  const date = log.coaching_date ? new Date(log.coaching_date).toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '—';

  // Determine current user context
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  const isCoachee = cu && cu.ohr_id === log.coachee_ohr;
  // Check if user is the supervisor of the Coach (from io_employees)
  // Look up the coach in the employees list and check if the current user is their supervisor
  const coachEmployee = (COMPASS.employees && COMPASS.employees.length > 0) ? COMPASS.employees.find(e => e.ohr_id === log.coach_ohr) : null;
  let isCoachSup = false;
  if (cu && coachEmployee && coachEmployee.supervisor_name) {
    // Match by full_name (exact match)
    isCoachSup = cu.full_name === coachEmployee.supervisor_name;
    // Also try matching by OHR if the supervisor is in the employees list
    if (!isCoachSup) {
      const supEmployee = COMPASS.employees.find(e => e.full_name === coachEmployee.supervisor_name);
      if (supEmployee) isCoachSup = cu.ohr_id === supEmployee.ohr_id;
    }
  }
  const isAdmin = cu && cu.ohr_id === '740045023';
  const canSeeAckDetails = isCoachee || isCoachSup || isAdmin; // Rating & Sentiments visible to Coachee, Coach's Supervisor, and admin only
  const isAcknowledged = compassIsAcknowledged(log);

  // ===== SECTION 1: SESSION DETAILS =====
  let html = '<div class="detail-section"><h4 class="detail-section-title" style="font-size:13px;text-transform:uppercase;letter-spacing:1px;color:var(--fg-muted);border-bottom:2px solid var(--primary);padding-bottom:6px;margin-bottom:12px;">Session Details</h4>';

  html += `<div class="detail-row"><span class="detail-label">Coaching Type</span><span class="detail-value">${escapeHtml(log.coaching_type || '')}</span></div>`;
  html += `<div class="detail-row"><span class="detail-label">Coaching Date</span><span class="detail-value">${date}</span></div>`;

  // Coachee(s)
  if (log.coaching_type === 'Group Coaching') {
    const coachees = log.coachee_list || [];
    html += `<div class="detail-row"><span class="detail-label">Coachees (${coachees.length})</span><span class="detail-value">${coachees.length > 0 ? coachees.map(c => escapeHtml(c.name || c)).join(', ') : escapeHtml(log.coachee || '—')}</span></div>`;
  } else if (log.coaching_type === 'Triad Coaching') {
    const leader = log.coachee_list && log.coachee_list.length > 0 ? log.coachee_list[0] : null;
    html += `<div class="detail-row"><span class="detail-label">Leader</span><span class="detail-value">${leader ? escapeHtml(leader.name || '') : '—'}</span></div>`;
    html += `<div class="detail-row"><span class="detail-label">Coachee</span><span class="detail-value">${escapeHtml(log.coachee || '—')} (${escapeHtml(log.coachee_ohr || '')})</span></div>`;
  } else {
    html += `<div class="detail-row"><span class="detail-label">Coachee</span><span class="detail-value">${escapeHtml(log.coachee || '—')} (${escapeHtml(log.coachee_ohr || '')})</span></div>`;
  }

  // Job ID for QA Feedback
  if (log.coaching_type === 'QA Feedback' && log.job_id) {
    html += `<div class="detail-row"><span class="detail-label">Job ID</span><span class="detail-value">${escapeHtml(log.job_id)}</span></div>`;
  }

  // Coachee Supervisor — only show if Coach != Coachee Supervisor
  if (log.coachee_sup && log.coach !== log.coachee_sup) {
    html += `<div class="detail-row"><span class="detail-label">Coachee Supervisor</span><span class="detail-value">${escapeHtml(log.coachee_sup)}</span></div>`;
  }

  // Coach info
  html += `<div class="detail-row"><span class="detail-label">Coach</span><span class="detail-value">${escapeHtml(log.coach || '—')} (${escapeHtml(log.coach_ohr || '')})</span></div>`;

  // Session Goal
  html += `<div class="detail-row"><span class="detail-label">Session Goal</span><span class="detail-value">${escapeHtml(log.session_goal || '—')}</span></div>`;

  // CAP Level (if set)
  if (log.cap_level) {
    const capBg = log.cap_level === 'CAP 3' ? '#EF444420' : log.cap_level === 'CAP 2' ? '#F59E0B20' : '#3B82F620';
    const capFg = log.cap_level === 'CAP 3' ? '#EF4444' : log.cap_level === 'CAP 2' ? '#F59E0B' : '#3B82F6';
    html += `<div class="detail-row"><span class="detail-label">CAP Level</span><span class="detail-value"><span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;background:${capBg};color:${capFg};">${escapeHtml(log.cap_level)}</span>`;
    html += ` <button class="btn btn-outline btn-xs" onclick="compassViewNte('${escapeAttr(log.coaching_id || log.id)}')" style="margin-left:8px;font-size:10px;padding:2px 8px;">View NTE</button>`;
    html += `</span></div>`;
  }

  // Coaching Details
  html += `<div class="detail-row"><span class="detail-label">Coaching Details</span><span class="detail-value detail-multiline">${log.coaching_details || '—'}</span></div>`;

  // Close Session Details section, open Root Cause Analysis section for QA Feedback
  if (log.coaching_type === 'QA Feedback') {
    html += '</div>'; // close Session Details
    html += '<div class="detail-section" style="margin-top:16px;"><h4 class="detail-section-title" style="font-size:13px;text-transform:uppercase;letter-spacing:1px;color:var(--fg-muted);border-bottom:2px solid var(--primary);padding-bottom:6px;margin-bottom:12px;">Root Cause Analysis</h4>';
    html += `<div class="detail-row"><span class="detail-label">L1 Category</span><span class="detail-value">${escapeHtml(log.level_1_category || '—')}</span></div>`;
    html += `<div class="detail-row"><span class="detail-label">L2 Direct Cause</span><span class="detail-value">${escapeHtml(log.level_2_direct_cause || '—')}</span></div>`;
    html += `<div class="detail-row"><span class="detail-label">L3 Contributing Cause</span><span class="detail-value">${escapeHtml(log.level_3_contributing_cause || '—')}</span></div>`;
    html += `<div class="detail-row"><span class="detail-label">L4 Deficiency</span><span class="detail-value">${escapeHtml(log.level_4_deficiency || '—')}</span></div>`;
    html += `<div class="detail-row"><span class="detail-label">L5 Root Cause</span><span class="detail-value">${escapeHtml(log.level_5_root_cause || '—')}</span></div>`;
    html += `<div class="detail-row"><span class="detail-label">RCA Description</span><span class="detail-value">${escapeHtml(log.guidelines || '—')}</span></div>`;
    // Markdown Status
    const mdStatusColor = COMPASS.STATUS_COLORS[log.status] || 'var(--fg-muted)';
    html += `<div class="detail-row" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);"><span class="detail-label">Markdown Status</span><span class="detail-value" style="font-weight:600;color:${mdStatusColor};">${escapeHtml(log.status || '—')}</span></div>`;
    html += '</div>'; // close Root Cause Analysis
    // Re-open a wrapper div so the rest of the code can close it
    html += '<div class="detail-section" style="margin-top:0;">';
  }

  // ZTP section
  if (log.coaching_type === 'ZTP Coaching') {
    html += `<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);">
      <div class="detail-row"><span class="detail-label">Infraction Category</span><span class="detail-value">${escapeHtml(log.infraction_category || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">Infraction</span><span class="detail-value">${escapeHtml(log.infraction || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">Description</span><span class="detail-value detail-multiline">${escapeHtml(log.infraction_description || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">Severity</span><span class="detail-value">${escapeHtml(log.severity || '—')}</span></div>
    </div>`;
  }

  // Dispute Trail for QA Feedback
  if (log.coaching_type === 'QA Feedback') {
    const hasDispute = log.dispute_comments || log.qa_comments || log.sme_qa_dispute_comments || log.trainer_comments || log.sme_trainer_comments || log.qtp_manager_comments;
    if (hasDispute) {
      html += '</div>'; // close current wrapper
      html += '<div class="detail-section" style="margin-top:16px;"><h4 class="detail-section-title" style="font-size:13px;text-transform:uppercase;letter-spacing:1px;color:var(--fg-muted);border-bottom:2px solid var(--primary);padding-bottom:6px;margin-bottom:12px;">Dispute Trail</h4>';
      if (log.dispute_comments) html += `<div class="detail-row"><span class="detail-label">Dispute Comments</span><span class="detail-value detail-multiline">${escapeHtml(log.dispute_comments)}</span></div>`;
      if (log.qa_comments) html += `<div class="detail-row"><span class="detail-label">QA Comments</span><span class="detail-value detail-multiline">${escapeHtml(log.qa_comments)}</span></div>`;
      if (log.sme_qa_dispute_comments) html += `<div class="detail-row"><span class="detail-label">SME QA Dispute</span><span class="detail-value detail-multiline">${escapeHtml(log.sme_qa_dispute_comments)}</span></div>`;
      if (log.trainer_comments) html += `<div class="detail-row"><span class="detail-label">Trainer Comments</span><span class="detail-value detail-multiline">${escapeHtml(log.trainer_comments)}</span></div>`;
      if (log.sme_trainer_comments) html += `<div class="detail-row"><span class="detail-label">SME Trainer Dispute</span><span class="detail-value detail-multiline">${escapeHtml(log.sme_trainer_comments)}</span></div>`;
      if (log.qtp_manager_comments) html += `<div class="detail-row"><span class="detail-label">QTP Manager</span><span class="detail-value detail-multiline">${escapeHtml(log.qtp_manager_comments)}</span></div>`;
      html += '</div>'; // close Dispute Trail section
      // Re-open wrapper for attachments/related
      html += '<div class="detail-section" style="margin-top:0;">';
    }
  }

  // Attachments with preview/download buttons
  html += compassRenderAttachmentsDetail(log);

  // Related Coaching Logs — logs with the same session_goal as this log
  html += compassRenderRelatedLogs(log);

  html += '</div>'; // close current section

  // ===== SECTION 2: ACKNOWLEDGEMENT =====
  // For QA Feedback logs, only show Acknowledgement section when status is acknowledgement-related
  const ACK_ELIGIBLE_STATUSES = ['Pending Acknowledgement', 'Acknowledged'];
  const showAckSection = log.coaching_type !== 'QA Feedback' || ACK_ELIGIBLE_STATUSES.includes(log.status);

  if (showAckSection) {
  html += '<div class="detail-section" style="margin-top:16px;"><h4 class="detail-section-title" style="font-size:13px;text-transform:uppercase;letter-spacing:1px;color:var(--fg-muted);border-bottom:2px solid var(--primary);padding-bottom:6px;margin-bottom:12px;">Acknowledgement</h4>';

  // Wrap ack details in a div that can be hidden when Acknowledge form is shown
  html += '<div id="compass-ack-details">';

  // Acknowledgement status line
  if (isAcknowledged) {
    html += `<div class="detail-row"><span class="detail-label">Status</span><span style="display:inline-flex;align-items:center;gap:4px;color:var(--success);font-weight:600;font-size:13px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Coachee Acknowledged</span></div>`;
  } else {
    html += `<div class="detail-row"><span class="detail-label">Status</span><span style="display:inline-flex;align-items:center;gap:4px;color:var(--warning);font-weight:600;font-size:13px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Needs Acknowledgement</span></div>`;
  }

  // Commitments — always visible
  html += `<div class="detail-row"><span class="detail-label">Commitments</span><span class="detail-value detail-multiline">${escapeHtml(log.coachee_commitments || '—')}</span></div>`;

  // Rating and Sentiments — only visible to Coachee and Coach Supervisor
  if (canSeeAckDetails) {
    html += `<div class="detail-row"><span class="detail-label">Coaching Rating</span><span class="detail-value">${compassRenderStars(log.coaching_rating)}</span></div>`;
    html += `<div class="detail-row"><span class="detail-label">Sentiments</span><span class="detail-value detail-multiline">${escapeHtml(log.coachee_sentiments || '—')}</span></div>`;
  }

  html += '</div>'; // close compass-ack-details

  // Inline acknowledgement form (hidden by default, shown when Acknowledge button is clicked)
  html += `<div id="compass-ack-form" style="display:none;margin-top:12px;padding:14px;background:var(--bg-inset);border-radius:var(--radius);border:1px solid var(--border);">
    <div style="font-size:12px;color:var(--fg-subtle);padding:8px 12px;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:12px;">Saving will record your acknowledgement automatically.</div>
    <div style="margin-bottom:10px;">
      <label style="font-size:12px;font-weight:500;color:var(--fg-muted);display:block;margin-bottom:4px;">Commitments <span style="color:var(--error);">*</span></label>
      <textarea id="compass-ack-commitments" class="form-input" style="width:100%;min-height:60px;resize:vertical;font-size:13px;" placeholder="Enter your commitments..." required></textarea>
    </div>
    <div style="margin-bottom:10px;">
      <label style="font-size:12px;font-weight:500;color:var(--fg-muted);display:block;margin-bottom:4px;">Rating (1-5) <span style="color:var(--error);">*</span></label>
      <div id="compass-ack-rating" style="display:flex;gap:4px;">
        ${[1,2,3,4,5].map(n => `<button type="button" class="compass-star-btn" data-val="${n}" onclick="compassSetAckRating(${n})" style="background:none;border:1px solid var(--border);border-radius:4px;width:36px;height:36px;cursor:pointer;font-size:18px;color:var(--fg-subtle);transition:all 0.15s;">★</button>`).join('')}
      </div>
    </div>
    <div style="margin-bottom:10px;">
      <label style="font-size:12px;font-weight:500;color:var(--fg-muted);display:block;margin-bottom:4px;">Sentiments <span style="color:var(--error);">*</span></label>
      <textarea id="compass-ack-sentiments" class="form-input" style="width:100%;min-height:60px;resize:vertical;font-size:13px;" placeholder="Share your sentiments..." required></textarea>
    </div>
  </div>`;

  html += '</div>'; // close Section 2
  } // end showAckSection

  formBody.innerHTML = html;

  // Footer actions based on role and status
  let footerHtml = '';
  // Show Back button if navigated from a related log
  if (_compassDetailStack.length > 0) {
    footerHtml += '<button class="btn btn-outline btn-sm" onclick="compassGoBack()" style="margin-right:auto;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;"><polyline points="15 18 9 12 15 6"/></svg> Back</button>';
  }
  footerHtml += '<button class="btn btn-outline btn-sm" onclick="compassCloseForm()">Close</button>';

  if (cu) {
    const role = cu.actual_role;
    const ohr = cu.ohr_id;

    // Acknowledge button — show if user is the coachee AND log is unacknowledged
    if (isCoachee && !isAcknowledged) {
      footerHtml += ' <button class="btn btn-primary btn-sm" id="compass-ack-trigger-btn" onclick="compassShowAckForm()">Acknowledge</button>';
    }

    // Dispute action buttons removed from Coaching Profile.
    // QA Feedback dispute workflow is handled exclusively in the Disputes Area (disputesOpenDetail).
  }

  formFooter.innerHTML = footerHtml;
  overlay.style.display = 'flex';
}

// ===== Dispute Actions =====

async function compassDisputeAction(newStatus) {
  const log = COMPASS.logs.find(l => String(l.coaching_id || l.id) === String(COMPASS.editingId));
  if (!log) return;

  const comment = prompt('Add a comment (optional):');
  const update = { status: newStatus };

  // Map comment to the right field based on who is acting
  if (comment) {
    if (newStatus.includes('- SME') && !newStatus.includes('QA Retention') && !newStatus.includes('Trainer Decision')) {
      update.dispute_comments = (log.dispute_comments || '') + '\n[' + new Date().toLocaleString() + '] ' + comment;
    } else if (newStatus.includes('- QA')) {
      update.qa_comments = (log.qa_comments || '') + '\n[' + new Date().toLocaleString() + '] ' + comment;
    } else if (newStatus.includes('QA Retention')) {
      update.sme_qa_dispute_comments = (log.sme_qa_dispute_comments || '') + '\n[' + new Date().toLocaleString() + '] ' + comment;
    } else if (newStatus.includes('- Trainer')) {
      update.trainer_comments = (log.trainer_comments || '') + '\n[' + new Date().toLocaleString() + '] ' + comment;
    } else if (newStatus.includes('Trainer Decision')) {
      update.sme_trainer_comments = (log.sme_trainer_comments || '') + '\n[' + new Date().toLocaleString() + '] ' + comment;
    } else if (newStatus.includes('- QTP')) {
      update.qtp_manager_comments = (log.qtp_manager_comments || '') + '\n[' + new Date().toLocaleString() + '] ' + comment;
    }
  }

  // Status is set directly — no override to Pending Acknowledgement
  // Each level sets its own terminal status

  try {
    const url = `${IO_API_BASE}/coaching/${log.coaching_id || log.id}`;
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update)
    });
    if (!resp.ok) throw new Error('Failed to update');

    showToast('Dispute action applied', 'success');
    compassCloseForm();
    await compassFetchLogs();
    if (COMPASS.currentSubpage === 'disputes') compassRenderKanban();
  } catch (e) {
    showToast('Failed to update: ' + e.message, 'error');
  }
}

// ===== Attachment Detail Renderer =====
function compassRenderAttachmentsDetail(log) {
  // Attachments may be stored as JSON array of {name, url} or as a comma-separated string
  let attachments = [];
  if (log.attachments) {
    try {
      attachments = JSON.parse(log.attachments);
    } catch (e) {
      // Fallback: treat as comma-separated URLs
      attachments = String(log.attachments).split(',').filter(Boolean).map(url => ({ name: url.split('/').pop() || 'file', url: url.trim() }));
    }
  }
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return '<div class="detail-row" style="margin-top:8px;"><span class="detail-label">Attachments</span><span class="detail-value" style="color:var(--fg-subtle);">No attachments</span></div>';
  }
  let html = '<div style="margin-top:10px;"><span class="detail-label" style="display:block;margin-bottom:6px;">Attachments</span>';
  attachments.forEach((att, i) => {
    const name = escapeHtml(att.name || att.filename || 'Attachment ' + (i + 1));
    const url = att.url || att.src || '#';
    const isImage = /\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i.test(name);
    html += `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-muted)" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <span style="color:var(--fg);">${name}</span>
      ${isImage ? `<button class="btn-icon-sm" onclick="compassPreviewAttachment('${escapeAttr(url)}','${escapeAttr(name)}')" title="Preview" style="background:none;border:none;cursor:pointer;padding:2px;color:var(--primary);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>` : ''}
      <a href="${escapeAttr(url)}" download="${escapeAttr(att.name || '')}" style="color:var(--primary);text-decoration:none;display:flex;align-items:center;" title="Download"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></a>
    </div>`;
  });
  html += '</div>';
  return html;
}

function compassPreviewAttachment(url, name) {
  // Open a simple preview modal/overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;cursor:pointer;';
  overlay.onclick = () => overlay.remove();
  const img = document.createElement('img');
  img.src = url;
  img.alt = name;
  img.style.cssText = 'max-width:90vw;max-height:90vh;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.4);';
  overlay.appendChild(img);
  document.body.appendChild(overlay);
}

// ===== Related Coaching Logs =====
var _relatedLogsPage = 0;
var _relatedLogsData = [];
var _relatedLogsPerPage = 5;

function compassRenderRelatedLogs(log) {
  // Determine matching criteria based on coaching type
  const coacheeOhr = log.coachee_ohr || '';
  const type = (log.coaching_type || '').trim();

  let matchField = 'session_goal'; // default
  let matchValue = '';
  if (type === 'QA Feedback') {
    matchField = 'level_5_root_cause';
    matchValue = (log.level_5_root_cause || '').trim().toLowerCase();
  } else if (type === 'ZTP Coaching') {
    matchField = 'infraction';
    matchValue = (log.infraction || '').trim().toLowerCase();
  } else {
    matchValue = (log.session_goal || '').trim().toLowerCase();
  }

  if (!matchValue && !coacheeOhr) return '';

  const related = COMPASS.logs.filter(l => {
    if (String(l.coaching_id || l.id) === String(log.coaching_id || log.id)) return false;
    // Must share the same coachee
    if (!coacheeOhr || l.coachee_ohr !== coacheeOhr) return false;
    // Match by the appropriate field
    if (!matchValue) return false;
    const otherVal = (l[matchField] || '').trim().toLowerCase();
    if (matchField === 'session_goal') {
      // session_goal can be comma-separated
      const goals = matchValue.split(',').map(g => g.trim()).filter(Boolean);
      const otherGoals = otherVal.split(',').map(g => g.trim()).filter(Boolean);
      return goals.some(g => otherGoals.includes(g));
    }
    return otherVal === matchValue;
  });

  if (related.length === 0) return '';

  // Store for pagination
  _relatedLogsData = related;
  _relatedLogsPage = 0;

  // Determine match label
  let matchLabel = 'Session Goal';
  if (type === 'QA Feedback') matchLabel = 'L5 Root Cause';
  else if (type === 'ZTP Coaching') matchLabel = 'Infraction';

  let html = '<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);">';
  html += `<div style="display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;" onclick="compassToggleRelatedLogs()">`;
  html += `<svg id="related-logs-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transition:transform 0.2s;transform:rotate(0deg);"><polyline points="9 18 15 12 9 6"/></svg>`;
  html += `<span class="detail-label" style="margin-bottom:0;">Related Coaching Logs</span>`;
  html += `<span style="font-size:11px;color:var(--fg-subtle);">(${related.length} logs matching ${matchLabel} &amp; Coachee)</span>`;
  html += '</div>';
  html += '<div id="related-logs-body" style="display:none;margin-top:6px;"></div>';
  html += '</div>';
  return html;
}

function compassToggleRelatedLogs() {
  const body = document.getElementById('related-logs-body');
  const chevron = document.getElementById('related-logs-chevron');
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(90deg)';
  if (!isOpen) compassRenderRelatedLogsPage();
}

function compassRenderRelatedLogsPage() {
  const body = document.getElementById('related-logs-body');
  if (!body) return;
  const total = _relatedLogsData.length;
  const totalPages = Math.ceil(total / _relatedLogsPerPage);
  const start = _relatedLogsPage * _relatedLogsPerPage;
  const page = _relatedLogsData.slice(start, start + _relatedLogsPerPage);

  let html = '';
  page.forEach(r => {
    const rDate = r.coaching_date ? new Date(r.coaching_date).toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' }) : '';
    const rGoal = r.session_goal || '—';
    html += `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12px;cursor:pointer;border-bottom:1px solid var(--border-subtle,var(--border));" onclick="compassOpenRelatedDetail('${escapeAttr(String(r.coaching_id || r.id))}')">
      <span style="color:var(--primary);font-weight:500;white-space:nowrap;">${escapeHtml(r.coaching_id || '#' + r.id)}</span>
      <span style="color:var(--fg-subtle);white-space:nowrap;">${rDate}</span>
      <span style="color:var(--fg);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(rGoal)}</span>
    </div>`;
  });

  if (totalPages > 1) {
    html += '<div style="display:flex;align-items:center;gap:8px;margin-top:6px;font-size:11px;">';
    html += `<button class="btn btn-ghost btn-xs" ${_relatedLogsPage <= 0 ? 'disabled' : ''} onclick="_relatedLogsPage--;compassRenderRelatedLogsPage()">&laquo; Prev</button>`;
    html += `<span style="color:var(--fg-muted);">Page ${_relatedLogsPage + 1} of ${totalPages}</span>`;
    html += `<button class="btn btn-ghost btn-xs" ${_relatedLogsPage >= totalPages - 1 ? 'disabled' : ''} onclick="_relatedLogsPage++;compassRenderRelatedLogsPage()">Next &raquo;</button>`;
    html += '</div>';
  }

  body.innerHTML = html;
}

// ===== Star Rating Renderer =====
function compassRenderStars(rating) {
  const r = parseInt(rating) || 0;
  if (r === 0) return '<span style="color:var(--fg-subtle);">—</span>';
  let stars = '';
  for (let i = 1; i <= 5; i++) {
    stars += `<span style="color:${i <= r ? 'var(--warning)' : 'var(--fg-subtle)'};font-size:16px;">★</span>`;
  }
  return stars;
}

// ===== Acknowledgement Form Helpers =====
var compassAckRating = 0;

function compassShowAckForm() {
  // Hide the existing ack details (status, commitments, rating, sentiments display)
  const details = document.getElementById('compass-ack-details');
  if (details) details.style.display = 'none';

  const form = document.getElementById('compass-ack-form');
  if (form) {
    form.style.display = 'block';
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  compassAckRating = 0;

  // Replace the Acknowledge button with a Save button
  const ackBtn = document.getElementById('compass-ack-trigger-btn');
  if (ackBtn) {
    ackBtn.textContent = 'Save';
    ackBtn.onclick = function() { compassSubmitAcknowledge(); };
  }
}

function compassSetAckRating(val) {
  compassAckRating = val;
  const btns = document.querySelectorAll('#compass-ack-rating .compass-star-btn');
  btns.forEach(btn => {
    const v = parseInt(btn.dataset.val);
    if (v <= val) {
      btn.style.color = 'var(--warning)';
      btn.style.borderColor = 'var(--warning)';
      btn.style.background = 'var(--warning)10';
    } else {
      btn.style.color = 'var(--fg-subtle)';
      btn.style.borderColor = 'var(--border)';
      btn.style.background = 'none';
    }
  });
}

async function compassSubmitAcknowledge() {
  const log = COMPASS.logs.find(l => String(l.coaching_id || l.id) === String(COMPASS.editingId));
  if (!log) return;

  const commitments = (document.getElementById('compass-ack-commitments')?.value || '').trim();
  const sentiments = (document.getElementById('compass-ack-sentiments')?.value || '').trim();

  if (!commitments) { showToast('Please enter your commitments', 'error'); return; }
  if (compassAckRating === 0) { showToast('Please select a rating (1-5)', 'error'); return; }
  if (!sentiments) { showToast('Please enter your sentiments', 'error'); return; }

  const update = {
    status: 'Acknowledged',
    coachee_ack: 'Yes',
    coachee_commitments: commitments,
    coaching_rating: String(compassAckRating),
    coachee_sentiments: sentiments,
    ack_date: new Date().toISOString().slice(0, 10)
  };

  try {
    const url = `${IO_API_BASE}/coaching/${log.coaching_id || log.id}`;
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update)
    });
    if (!resp.ok) throw new Error('Failed to acknowledge');

    showToast('Coaching log acknowledged', 'success');
    compassCloseForm();
    await compassFetchLogs();
  } catch (e) {
    showToast('Failed to acknowledge: ' + e.message, 'error');
  }
}

// Legacy alias for backward compatibility
async function compassAcknowledge() {
  compassShowAckForm();
}

// ===== Related Log Navigation Stack =====
var _compassDetailStack = [];

function compassOpenRelatedDetail(coachingId) {
  // Push current log to stack so user can go back
  if (COMPASS.editingId) {
    _compassDetailStack.push(COMPASS.editingId);
  }
  compassOpenDetail(coachingId);
}

function compassGoBack() {
  if (_compassDetailStack.length > 0) {
    const prevId = _compassDetailStack.pop();
    compassOpenDetail(prevId);
  }
}

// ===== New Coaching Log Form =====

async function compassShowNewForm() {
  await compassFetchEmployees();
  COMPASS.editingId = null;

  const formTitle = document.getElementById('compass-form-title');
  const formBody = document.getElementById('compass-form-body');
  const formFooter = document.getElementById('compass-form-footer');
  const overlay = document.getElementById('compass-form-overlay');

  formTitle.textContent = 'New Coaching Log';

  const employeeOptions = COMPASS.employees.map(e => `<option value="${escapeAttr(e.ohr_id)}">${escapeHtml(e.full_name)} (${e.ohr_id})</option>`).join('');

  formBody.innerHTML = `
    <div class="form-section">
      <div class="form-field">
        <label class="form-label">Type <span class="required">*</span></label>
        <select class="form-select" id="compass-new-type" onchange="compassOnTypeChange()">
          <option value="">— Select Type —</option>
          ${COMPASS.COACHING_TYPES.map(t => `<option value="${escapeAttr(t)}">${escapeHtml(t)}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="form-section">
      <div class="form-field" id="compass-coachee-field">
        <label class="form-label">Coachee <span class="required">*</span></label>
        <div class="searchable-select" id="compass-coachee-wrapper">
          <input type="hidden" id="compass-new-coachee" value="">
          <input type="text" class="form-input" id="compass-coachee-search" placeholder="Search coachee..." autocomplete="off" onclick="compassToggleCoacheeDropdown(true)" oninput="compassFilterCoachees()">
          <div class="searchable-select-dropdown" id="compass-coachee-dropdown" style="display:none;">
            ${COMPASS.employees.map(e => `<div class="searchable-select-option" data-value="${escapeAttr(e.ohr_id)}" onclick="compassSelectCoachee('${escapeAttr(e.ohr_id)}','${escapeAttr(e.full_name)}')">${escapeHtml(e.full_name)}</div>`).join('')}
          </div>
        </div>
      </div>
      <div class="form-field" id="compass-coachee-list-field" style="display:none;">
        <label class="form-label">Coachees <span class="required">*</span></label>
        <div class="multi-coachee-select" id="compass-multi-coachee">
          <div class="multi-coachee-trigger" onclick="compassToggleCoacheeMulti()">
            <span id="compass-multi-coachee-display" style="color:var(--fg-muted);">Select coachees...</span>
            <span class="multi-select-arrow">▾</span>
          </div>
          <div class="multi-coachee-dropdown" id="compass-multi-coachee-dropdown" style="display:none;">
            <div style="padding:6px 8px; border-bottom:1px solid var(--border); position:sticky; top:0; background:var(--bg-card); z-index:1; display:flex; gap:6px; align-items:center;">
              <input type="text" class="form-input" id="compass-multi-coachee-search" placeholder="Search employees..." autocomplete="off" oninput="compassFilterMultiCoachees()" style="font-size:12px; padding:6px 8px; flex:1;">
              <button type="button" onclick="compassClearMultiCoachees()" style="white-space:nowrap; font-size:11px; padding:4px 8px; background:var(--bg-surface); border:1px solid var(--border); border-radius:var(--radius); color:var(--fg-muted); cursor:pointer; transition:all 0.15s;">Clear All</button>
            </div>
            <div id="compass-multi-coachee-options" style="max-height:220px; overflow-y:auto;">
              ${COMPASS.employees.map(e => `<label class="multi-coachee-option" data-name="${escapeAttr(e.full_name.toLowerCase())}" data-ohr="${escapeAttr(e.ohr_id)}">
                <input type="checkbox" value="${escapeAttr(e.ohr_id)}" onchange="compassUpdateMultiCoacheeDisplay()">
                <span>${escapeHtml(e.full_name)}</span>
              </label>`).join('')}
            </div>
          </div>
        </div>
        <div id="compass-multi-coachee-tags" style="display:flex; flex-wrap:wrap; gap:4px; margin-top:6px;"></div>
      </div>
      <div class="form-field" id="compass-triad-coachee-field" style="display:none;">
        <label class="form-label">Coachee <span class="required">*</span></label>
        <div class="searchable-select" id="compass-triad-coachee-wrapper">
          <input type="hidden" id="compass-triad-coachee" value="">
          <input type="text" class="form-input" id="compass-triad-coachee-search" placeholder="Search coachee..." autocomplete="off" onclick="compassToggleTriadCoacheeDropdown(true)" oninput="compassFilterTriadCoachees()">
          <div class="searchable-select-dropdown" id="compass-triad-coachee-dropdown" style="display:none;">
            ${COMPASS.employees.map(e => `<div class="searchable-select-option" data-value="${escapeAttr(e.ohr_id)}" onclick="compassSelectTriadCoachee('${escapeAttr(e.ohr_id)}','${escapeAttr(e.full_name)}')">${escapeHtml(e.full_name)}</div>`).join('')}
          </div>
        </div>
      </div>
      <div class="form-field" id="compass-followup-field" style="display:none;">
        <label class="form-label">Follow-Up From <span class="required">*</span></label>
        <div class="searchable-select" id="compass-followup-wrapper">
          <input type="text" class="form-input" id="compass-followup-search" placeholder="Search by coachee name, OHR, ID, or session goal..." autocomplete="off" oninput="compassSearchParentLogs()">
          <div class="searchable-select-dropdown" id="compass-followup-dropdown" style="display:none;"></div>
        </div>
        <div id="compass-followup-selected" style="display:none; margin-top:8px; padding:10px 12px; background:var(--bg-inset); border:1px solid var(--border); border-radius:var(--radius); font-size:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <strong style="color:var(--fg);">Selected Parent Log</strong>
            <button type="button" class="btn btn-outline btn-xs" onclick="compassClearParentLog()" style="font-size:10px; padding:2px 6px;">Clear</button>
          </div>
          <div id="compass-followup-info" style="color:var(--fg-muted); line-height:1.5;"></div>
        </div>
      </div>
    </div>

    <div class="form-section" id="compass-session-goal-section">
      <div class="form-field">
        <label class="form-label">What is this session all about? <span class="required">*</span></label>
        <div class="multi-select-container" id="compass-goal-container">
          <div class="multi-select-trigger" onclick="document.getElementById('compass-goal-dropdown').classList.toggle('open')">
            <span id="compass-goal-display">— Select —</span>
            <span class="multi-select-arrow">▾</span>
          </div>
          <div class="multi-select-dropdown" id="compass-goal-dropdown">
            <label class="multi-select-option" data-goal="AES/Scorecard Discussion"><input type="checkbox" value="AES/Scorecard Discussion" onchange="compassUpdateGoalSelection()"> AES/Scorecard Discussion</label>
            <label class="multi-select-option" data-goal="Attendance & Tardiness"><input type="checkbox" value="Attendance & Tardiness" onchange="compassUpdateGoalSelection()"> Attendance &amp; Tardiness</label>
            <label class="multi-select-option" data-goal="Compliance & Behavior"><input type="checkbox" value="Compliance & Behavior" onchange="compassUpdateGoalSelection()"> Compliance &amp; Behavior</label>
            <label class="multi-select-option" data-goal="Escalation"><input type="checkbox" value="Escalation" onchange="compassUpdateGoalSelection()"> Escalation</label>
            <label class="multi-select-option" data-goal="Internal Discussion"><input type="checkbox" value="Internal Discussion" onchange="compassUpdateGoalSelection()"> Internal Discussion</label>
            <label class="multi-select-option" data-goal="Performance & Metrics"><input type="checkbox" value="Performance & Metrics" onchange="compassUpdateGoalSelection()"> Performance &amp; Metrics</label>
            <label class="multi-select-option" data-goal="Performance Improvement Plan"><input type="checkbox" value="Performance Improvement Plan" onchange="compassUpdateGoalSelection()"> Performance Improvement Plan</label>
            <label class="multi-select-option" data-goal="Professional & Personal Development"><input type="checkbox" value="Professional & Personal Development" onchange="compassUpdateGoalSelection()"> Professional &amp; Personal Development</label>
          </div>
        </div>
      </div>
    </div>

    <!-- CAP Level (visible for CAP 0 Coaching & Follow Up Session) -->
    <div class="form-section" id="compass-cap-level-section" style="display:none;">
      <div class="form-field">
        <label class="form-label">Is this for a Corrective Action Plan (CAP)?</label>
        <div class="cap-radio-group" id="compass-cap-radios" style="display:flex; gap:16px; flex-wrap:wrap; margin-top:6px;">
          <label class="cap-radio-label" style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:13px; color:var(--fg);">
            <input type="radio" name="compass-cap-level" value="" checked onchange="compassOnCapLevelChange()"> <span>No CAP</span>
          </label>
          <label class="cap-radio-label" style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:13px; color:var(--fg);">
            <input type="radio" name="compass-cap-level" value="CAP 1" onchange="compassOnCapLevelChange()"> <span>CAP 1</span>
          </label>
          <label class="cap-radio-label" style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:13px; color:var(--fg);">
            <input type="radio" name="compass-cap-level" value="CAP 2" onchange="compassOnCapLevelChange()"> <span>CAP 2</span>
          </label>
          <label class="cap-radio-label" style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:13px; color:var(--fg);">
            <input type="radio" name="compass-cap-level" value="CAP 3" onchange="compassOnCapLevelChange()"> <span>CAP 3</span>
          </label>
        </div>
        <div id="compass-cap-notice" style="display:none; margin-top:8px; padding:8px 12px; background:#FEF3C720; border:1px solid #F59E0B40; border-radius:var(--radius); font-size:12px; color:#D97706;">
          <strong>Note:</strong> After creating this coaching log, you will be redirected to fill out the Notice to Explain (NTE) form.
        </div>
      </div>
    </div>

    <!-- Job ID for QA Feedback (hidden by default) -->
    <div class="form-section" id="compass-job-id-section" style="display:none;">
      <div class="form-field">
        <label class="form-label">Job ID <span style="color:#ef4444;">*</span></label>
        <input type="text" class="form-input" id="compass-new-job-id" placeholder="Enter Job ID (alphanumeric)...">
      </div>
    </div>

    <!-- Coaching Details & Attachments (always visible) -->
    <div class="form-section" id="compass-details-section">
      <div class="form-field">
        <label class="form-label">Please give a summary of your coaching session. <span class="required">*</span></label>
        <div class="rte-container">
          <div class="rte-toolbar">
            <button type="button" class="rte-btn" data-command="bold" onclick="compassRteExec('bold')" title="Bold"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg></button>
            <button type="button" class="rte-btn" data-command="italic" onclick="compassRteExec('italic')" title="Italic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg></button>
            <span class="rte-sep"></span>
            <button type="button" class="rte-btn" data-command="insertUnorderedList" onclick="compassRteExec('insertUnorderedList')" title="Bullet List"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none"/></svg></button>
            <button type="button" class="rte-btn" data-command="insertOrderedList" onclick="compassRteExec('insertOrderedList')" title="Numbered List"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="6" x2="20" y2="6"/><line x1="10" y1="12" x2="20" y2="12"/><line x1="10" y1="18" x2="20" y2="18"/><text x="2" y="8" font-size="7" fill="currentColor" stroke="none" font-family="sans-serif">1</text><text x="2" y="14" font-size="7" fill="currentColor" stroke="none" font-family="sans-serif">2</text><text x="2" y="20" font-size="7" fill="currentColor" stroke="none" font-family="sans-serif">3</text></svg></button>
            <span class="rte-sep"></span>
            <button type="button" class="rte-btn" onclick="compassRteExec('indent')" title="Increase Indent"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="4" x2="21" y2="4"/><line x1="11" y1="10" x2="21" y2="10"/><line x1="11" y1="16" x2="21" y2="16"/><line x1="3" y1="22" x2="21" y2="22"/><polyline points="3 16 7 13 3 10"/></svg></button>
            <button type="button" class="rte-btn" onclick="compassRteExec('outdent')" title="Decrease Indent"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="4" x2="21" y2="4"/><line x1="11" y1="10" x2="21" y2="10"/><line x1="11" y1="16" x2="21" y2="16"/><line x1="3" y1="22" x2="21" y2="22"/><polyline points="7 10 3 13 7 16"/></svg></button>
          </div>
          <div class="rte-editor" id="compass-new-details" contenteditable="true" data-placeholder="Describe the coaching session..."></div>
        </div>
      </div>
    </div>

    <!-- ZTP Fields (hidden by default) -->
    <div class="form-section" id="compass-ztp-section" style="display:none;">
      <h4 class="form-section-title">ZTP Infraction</h4>
      <div class="form-field">
        <label class="form-label">Infraction Category <span class="required">*</span></label>
        <select class="form-select" id="compass-new-infraction-cat" onchange="compassLoadInfractions()">
          <option value="">— Select Category —</option>
        </select>
      </div>
      <div class="form-field">
        <label class="form-label">Infraction <span class="required">*</span></label>
        <select class="form-select" id="compass-new-infraction" onchange="compassAutoPopulateZtpDesc()">
          <option value="">— Select Infraction —</option>
        </select>
      </div>
      <div class="form-field">
        <label class="form-label">Infraction Description</label>
        <div class="form-input" id="compass-new-infraction-desc" style="min-height:48px;background:var(--bg-inset);color:var(--fg-muted);font-size:13px;line-height:1.5;white-space:pre-wrap;cursor:default;">Select an infraction to see description...</div>
      </div>
    </div>

    <!-- RCA Fields for QA Feedback (hidden by default) -->
    <div class="form-section" id="compass-rca-section" style="display:none;">
      <h4 class="form-section-title">Root Cause Analysis</h4>
      <div class="form-field">
        <label class="form-label">L1 Category <span class="required">*</span></label>
        <select class="form-select" id="compass-new-rca-l1" onchange="compassCascadeRCA('l1')">
          <option value="">— Select L1 Category —</option>
        </select>
      </div>
      <div class="form-field">
        <label class="form-label">L2 Direct Cause <span class="required">*</span></label>
        <select class="form-select" id="compass-new-rca-l2" onchange="compassCascadeRCA('l2')" disabled>
          <option value="">— Select L2 Direct Cause —</option>
        </select>
      </div>
      <div class="form-field">
        <label class="form-label">L3 Contributing Cause <span class="required">*</span></label>
        <select class="form-select" id="compass-new-rca-l3" onchange="compassCascadeRCA('l3')" disabled>
          <option value="">— Select L3 Contributing Cause —</option>
        </select>
      </div>
      <div class="form-field">
        <label class="form-label">L4 Deficiency <span class="required">*</span></label>
        <select class="form-select" id="compass-new-rca-l4" onchange="compassCascadeRCA('l4')" disabled>
          <option value="">— Select L4 Deficiency —</option>
        </select>
      </div>
      <div class="form-field">
        <label class="form-label">L5 Root Cause <span class="required">*</span></label>
        <select class="form-select" id="compass-new-rca-l5" onchange="compassCascadeRCA('l5')" disabled>
          <option value="">— Select L5 Root Cause —</option>
        </select>
      </div>
      <div class="form-field">
        <label class="form-label">RCA Description</label>
        <div class="form-input" id="compass-new-guidelines" style="min-height:48px;background:var(--bg-inset);color:var(--fg-muted);font-size:13px;line-height:1.5;white-space:pre-wrap;cursor:default;">Select L5 Root Cause to see description...</div>
      </div>
    </div>

    <!-- Attachments (always at the bottom) -->
    <div class="form-section">
      <div class="form-field">
        <label class="form-label">Attachments</label>
        <div class="attachment-upload-area" id="compass-attachment-area">
          <input type="file" id="compass-attachments" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.gif,.bmp,.webp" style="display:none" onchange="compassUpdateAttachmentList()">
          <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('compass-attachments').click()" style="display:flex;align-items:center;gap:6px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
            Attach Files
          </button>
          <div id="compass-attachment-list" style="margin-top:6px;"></div>
          <p style="font-size:11px;color:var(--fg-subtle);margin-top:4px;">Accepts documents (.pdf, .doc, .docx), spreadsheets (.xls, .xlsx, .csv), and images (.png, .jpg, .gif, .webp)</p>
        </div>
      </div>
    </div>
  `;

  formFooter.innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="compassCloseForm()">Cancel</button>
    <button class="btn btn-primary btn-sm" id="compass-submit-btn" onclick="compassSubmitNew()">Create</button>
  `;

  overlay.style.display = 'flex';

  // Default to 'New Session' for non-QA roles
  const isQA = currentUser && (currentUser.actual_role || '').toLowerCase().includes('qa');
  if (!isQA) {
    const typeSelect = document.getElementById('compass-new-type');
    if (typeSelect) {
      typeSelect.value = 'CAP 0 Coaching';
      compassOnTypeChange();
    }
  }
}

function compassOnTypeChange() {
  const type = document.getElementById('compass-new-type')?.value || '';
  const coacheeField = document.getElementById('compass-coachee-field');
  const coacheeListField = document.getElementById('compass-coachee-list-field');
  const followupField = document.getElementById('compass-followup-field');
  const sessionGoalSection = document.getElementById('compass-session-goal-section');
  const ztpSection = document.getElementById('compass-ztp-section');
  const rcaSection = document.getElementById('compass-rca-section');

  // Reset all coachee-related fields
  coacheeField.style.display = 'none';
  coacheeListField.style.display = 'none';
  if (followupField) followupField.style.display = 'none';
  // Reset Triad-specific coachee field
  const triadCoacheeField = document.getElementById('compass-triad-coachee-field');
  if (triadCoacheeField) triadCoacheeField.style.display = 'none';
  // Reset Coachee label back to default
  const coacheeLabel = coacheeField.querySelector('.form-label');
  if (coacheeLabel) coacheeLabel.innerHTML = 'Coachee <span class="required">*</span>';
  const coacheeSearch = document.getElementById('compass-coachee-search');
  if (coacheeSearch) coacheeSearch.placeholder = 'Search coachee...';

  // Show session goal by default
  if (sessionGoalSection) sessionGoalSection.style.display = '';

  // Filter session goal options based on coaching type
  compassFilterGoalOptions(type);

  // Always clear role filter first, Triad will re-apply it
  compassFilterCoacheesByRole(null);

  if (type === 'Follow-Up Session') {
    // Show follow-up search; hide session goal (copied from parent log)
    if (followupField) followupField.style.display = '';
    if (sessionGoalSection) sessionGoalSection.style.display = 'none';
    COMPASS.selectedParentLog = null;
    const searchInput = document.getElementById('compass-followup-search');
    if (searchInput) searchInput.value = '';
    const dropdown = document.getElementById('compass-followup-dropdown');
    if (dropdown) dropdown.style.display = 'none';
    const selected = document.getElementById('compass-followup-selected');
    if (selected) selected.style.display = 'none';
  } else if (type === 'Group Coaching') {
    coacheeListField.style.display = '';
  } else if (type === 'Triad Coaching') {
    // Triad Coaching: "Coachee" becomes "Leader" (the person being observed coaching)
    coacheeField.style.display = '';
    // Rename the label to "Leader"
    const coacheeLabel = coacheeField.querySelector('.form-label');
    if (coacheeLabel) coacheeLabel.innerHTML = 'Leader <span class="required">*</span>';
    const coacheeSearch = document.getElementById('compass-coachee-search');
    if (coacheeSearch) coacheeSearch.placeholder = 'Search leader...';
    if (sessionGoalSection) sessionGoalSection.style.display = 'none';
    // Filter leader dropdown to Triad-eligible roles
    compassFilterCoacheesByRole(['Quality & Policy Expert', 'Operational SME', 'Team Lead', 'Trainer']);
    // Show the Triad Coachee field (the person being coached by the leader)
    const triadCoacheeField = document.getElementById('compass-triad-coachee-field');
    if (triadCoacheeField) triadCoacheeField.style.display = '';
  } else {
    coacheeField.style.display = '';
  }

  // Show CAP level section for CAP 0 Coaching and Follow Up Session
  const capSection = document.getElementById('compass-cap-level-section');
  if (capSection) {
    capSection.style.display = (type === 'CAP 0 Coaching' || type === 'Follow-Up Session') ? '' : 'none';
    // Reset CAP radios when type changes
    const radios = document.querySelectorAll('input[name="compass-cap-level"]');
    radios.forEach(r => r.checked = r.value === '');
    const notice = document.getElementById('compass-cap-notice');
    if (notice) notice.style.display = 'none';
  }

  ztpSection.style.display = type === 'ZTP Coaching' ? '' : 'none';
  if (type === 'ZTP Coaching') {
    compassLoadZtpCategories();
    // Default session goal to "Compliance" and hide the section
    if (sessionGoalSection) sessionGoalSection.style.display = 'none';
  }

  rcaSection.style.display = type === 'QA Feedback' ? '' : 'none';

  // Show Job ID field for QA Feedback
  const jobIdSection = document.getElementById('compass-job-id-section');
  if (jobIdSection) jobIdSection.style.display = type === 'QA Feedback' ? '' : 'none';

  if (type === 'QA Feedback') {
    // Default session goal to "Quality Error Findings" and hide the section
    if (sessionGoalSection) sessionGoalSection.style.display = 'none';
    // Initialize cascading RCA dropdowns
    compassInitRCACascade();
  }
}

// ===== Follow-Up Session: Parent Log Search =====

function compassSearchParentLogs() {
  const query = (document.getElementById('compass-followup-search')?.value || '').trim().toLowerCase();
  const dropdown = document.getElementById('compass-followup-dropdown');
  const searchInput = document.getElementById('compass-followup-search');
  if (!dropdown || !searchInput) return;

  if (query.length < 2) {
    dropdown.style.display = 'none';
    return;
  }

  // Position dropdown below the search input using fixed positioning
  const rect = searchInput.getBoundingClientRect();
  dropdown.style.top = rect.bottom + 'px';
  dropdown.style.left = rect.left + 'px';
  dropdown.style.width = rect.width + 'px';

  // Search through logs where current user is the coach (admin sees all)
  const coach = typeof currentUser !== 'undefined' ? currentUser : null;
  const isAdmin740 = coach && coach.ohr_id === '740045023';
  const myLogs = COMPASS.logs.filter(l => {
    if (!coach) return false;
    if (isAdmin740) return true;
    return l.coach_ohr === coach.ohr_id;
  });

  const matches = myLogs.filter(l => {
    const idStr = String(l.id || '');
    const coachee = (l.coachee || '').toLowerCase();
    const coacheeOhr = (l.coachee_ohr || '').toLowerCase();
    const goal = (l.session_goal || '').toLowerCase();
    const type = (l.coaching_type || '').toLowerCase();
    return idStr.includes(query) || coachee.includes(query) || coacheeOhr.includes(query) || goal.includes(query) || type.includes(query);
  }).slice(0, 15);

  if (matches.length === 0) {
    dropdown.innerHTML = '<div style="padding:8px 10px; font-size:12px; color:var(--fg-muted);">No matching coaching logs found</div>';
    dropdown.style.display = '';
    return;
  }

  dropdown.innerHTML = matches.map(l => {
    const dateStr = l.coaching_date ? new Date(l.coaching_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }) : 'N/A';
    return `<div class="searchable-select-option" onclick="compassSelectParentLog('${l.coaching_id || l.id}')" style="padding:8px 10px; border-bottom:1px solid var(--border);">
      <div style="font-size:12px; font-weight:600; color:var(--fg);">${l.coaching_id || l.id} — ${escapeHtml(l.coachee || 'Unknown')} (${escapeHtml(l.coachee_ohr || '')})</div>
      <div style="font-size:11px; color:var(--fg-muted); margin-top:2px;">${escapeHtml(l.coaching_type || '')} · ${dateStr} · ${escapeHtml(l.session_goal || 'No goal')}</div>
    </div>`;
  }).join('');
  dropdown.style.display = '';
}

function compassSelectParentLog(logId) {
  const log = COMPASS.logs.find(l => (l.coaching_id || l.id) === logId || String(l.id) === String(logId));
  if (!log) return;

  COMPASS.selectedParentLog = log;

  // Hide dropdown, update search input
  const dropdown = document.getElementById('compass-followup-dropdown');
  if (dropdown) dropdown.style.display = 'none';
  const searchInput = document.getElementById('compass-followup-search');
  if (searchInput) searchInput.value = `${log.coaching_id || log.id} — ${log.coachee || 'Unknown'}`;

  // Show selected info card
  const selectedDiv = document.getElementById('compass-followup-selected');
  const infoDiv = document.getElementById('compass-followup-info');
  if (selectedDiv && infoDiv) {
    const dateStr = log.coaching_date ? new Date(log.coaching_date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }) : 'N/A';
    infoDiv.innerHTML = `
      <div><strong>ID:</strong> ${log.coaching_id || log.id}</div>
      <div><strong>Type:</strong> ${escapeHtml(log.coaching_type || '')}</div>
      <div><strong>Coachee:</strong> ${escapeHtml(log.coachee || '')} (${escapeHtml(log.coachee_ohr || '')})</div>
      <div><strong>Date:</strong> ${dateStr}</div>
      <div><strong>Session Goal:</strong> ${escapeHtml(log.session_goal || 'N/A')}</div>
    `;
    selectedDiv.style.display = '';
  }

  // Pre-check session goal checkboxes from parent log
  compassPreFillSessionGoal(log.session_goal || '');
}

function compassPreFillSessionGoal(goalStr) {
  const container = document.getElementById('compass-goal-dropdown');
  if (!container) return;
  const goals = goalStr.split(',').map(g => g.trim()).filter(Boolean);
  const checkboxes = container.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach(cb => {
    cb.checked = goals.includes(cb.value);
  });
  compassUpdateGoalSelection();
}

function compassClearParentLog() {
  COMPASS.selectedParentLog = null;
  const searchInput = document.getElementById('compass-followup-search');
  if (searchInput) searchInput.value = '';
  const selectedDiv = document.getElementById('compass-followup-selected');
  if (selectedDiv) selectedDiv.style.display = 'none';
  const dropdown = document.getElementById('compass-followup-dropdown');
  if (dropdown) dropdown.style.display = 'none';

  // Clear session goal checkboxes
  const goalContainer = document.getElementById('compass-goal-dropdown');
  if (goalContainer) {
    goalContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    compassUpdateGoalSelection();
  }
}

async function compassLoadZtpCategories() {
  try {
    const url = `${IO_API_BASE}/coaching-ztp?select=infraction_category`;
    const resp = await fetch(url);
    const data = resp.ok ? await resp.json() : [];
    const cats = [...new Set(data.map(d => d.infraction_category).filter(Boolean))];
    const sel = document.getElementById('compass-new-infraction-cat');
    if (sel) {
      sel.innerHTML = '<option value="">— Select Category —</option>' +
        cats.map(c => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('');
    }
  } catch (e) {
    console.error('Failed to load ZTP categories:', e);
  }
}

async function compassLoadInfractions() {
  const cat = document.getElementById('compass-new-infraction-cat')?.value || '';
  if (!cat) return;
  try {
    const url = `${IO_API_BASE}/coaching-ztp?infraction_category=${encodeURIComponent(cat)}`;
    const resp = await fetch(url);
    const data = resp.ok ? await resp.json() : [];
    COMPASS._ztpInfractions = data; // Store for description lookup
    const sel = document.getElementById('compass-new-infraction');
    if (sel) {
      sel.innerHTML = '<option value="">\u2014 Select Infraction \u2014</option>' +
        data.map(d => `<option value="${escapeAttr(d.infraction)}">${escapeHtml(d.infraction)}</option>`).join('');
    }
    // Reset description
    const descDiv = document.getElementById('compass-new-infraction-desc');
    if (descDiv) descDiv.textContent = 'Select an infraction to see description...';
  } catch (e) {
    console.error('Failed to load infractions:', e);
  }
}

function compassAutoPopulateZtpDesc() {
  const infraction = document.getElementById('compass-new-infraction')?.value || '';
  const descDiv = document.getElementById('compass-new-infraction-desc');
  if (!descDiv) return;
  if (!infraction) {
    descDiv.textContent = 'Select an infraction to see description...';
    return;
  }
  const match = (COMPASS._ztpInfractions || []).find(d => d.infraction === infraction);
  descDiv.textContent = match?.description || 'No description available.';
}

async function compassSubmitNew() {
  const type = document.getElementById('compass-new-type')?.value;
  if (!type) { showToast('Please select a coaching type', 'error'); return; }

  const date = new Date().toISOString();

  let coacheeOhr, coacheeList = [], sessionGoal = '';

  if (type === 'Follow-Up Session') {
    // Get data from selected parent log
    const parent = COMPASS.selectedParentLog;
    if (!parent) { showToast('Please select a parent coaching log to follow up on', 'error'); return; }
    coacheeOhr = parent.coachee_ohr;
    sessionGoal = parent.session_goal || '';
  } else if (type === 'Group Coaching') {
    const checkboxes = document.querySelectorAll('#compass-multi-coachee-options input[type="checkbox"]:checked');
    const selected = Array.from(checkboxes).map(cb => cb.value);
    if (selected.length === 0) { showToast('Please select at least one coachee', 'error'); return; }
    // Group Coaching creates individual logs per coachee
    coacheeList = selected.map(ohr => {
      const emp = COMPASS.employees.find(e => e.ohr_id === ohr);
      return { ohr, name: emp ? emp.full_name : ohr, emp };
    });
    coacheeOhr = selected[0];
  } else if (type === 'Triad Coaching') {
    // Triad Coaching: Leader is selected in the main coachee dropdown (role-filtered)
    const leaderOhr = document.getElementById('compass-new-coachee')?.value;
    if (!leaderOhr) { showToast('Please select a leader', 'error'); return; }
    // Coachee is the person being coached by the leader
    const triadCoacheeOhr = document.getElementById('compass-triad-coachee')?.value;
    if (!triadCoacheeOhr) { showToast('Please select a coachee', 'error'); return; }
    // Store the actual coachee as the record's coachee; leader info stored in coachee_list
    coacheeOhr = triadCoacheeOhr;
    const leaderEmp = COMPASS.employees.find(e => e.ohr_id === leaderOhr);
    coacheeList = [{ ohr: leaderOhr, name: leaderEmp ? leaderEmp.full_name : leaderOhr, emp: leaderEmp, role: 'leader' }];
  } else {
    coacheeOhr = document.getElementById('compass-new-coachee')?.value;
    if (!coacheeOhr) { showToast('Please select a coachee', 'error'); return; }
  }

  if (type === 'Triad Coaching') {
    // Triad Coaching always uses "Coaching Observation" as session goal
    sessionGoal = 'Coaching Observation';
  } else if (type === 'QA Feedback') {
    // QA Feedback always uses "Quality Error Findings" as session goal
    sessionGoal = 'Quality Error Findings';
  } else if (type === 'ZTP Coaching') {
    // ZTP Coaching always uses "Compliance" as session goal
    sessionGoal = 'Compliance';
  } else if (type !== 'Follow-Up Session') {
    sessionGoal = compassGetSelectedGoals();
    if (!sessionGoal) { showToast('Please select at least one session topic', 'error'); return; }
  }

  const detailsContent = document.getElementById('compass-new-details')?.innerText?.trim() || '';
  if (!detailsContent) { showToast('Please provide a coaching session summary', 'error'); return; }

  const coachee = COMPASS.employees.find(e => e.ohr_id === coacheeOhr);
  const coach = typeof currentUser !== 'undefined' ? currentUser : null;

  // For follow-ups, also pull coachee info from the parent log if employee not found
  const parentLog = (type === 'Follow-Up Session') ? COMPASS.selectedParentLog : null;

  // Get CAP level if applicable
  const capLevel = (type === 'CAP 0 Coaching' || type === 'Follow-Up Session') ? compassGetSelectedCapLevel() : '';

  const record = {
    coaching_type: type,
    coach: coach ? coach.full_name : '',
    coach_ohr: coach ? coach.ohr_id : '',
    coach_meta_email: coach ? (coach.meta_email || '') : '',
    coach_sup: coach ? (coach.supervisor_name || '') : '',
    coach_sup_email: coach ? (coach.supervisor_email || '') : '',
    coach_pg: coach ? coach.planning_group : '',
    coaching_date: date,
    coachee: coachee ? coachee.full_name : (parentLog ? parentLog.coachee : ''),
    coachee_ohr: coacheeOhr,
    coachee_meta_email: coachee ? coachee.meta_email : (parentLog ? (parentLog.coachee_meta_email || '') : ''),
    coachee_sup: coachee ? coachee.supervisor_name : (parentLog ? (parentLog.coachee_sup || '') : ''),
    coachee_sup_email: coachee ? (coachee.supervisor_email || coachee.meta_email || '') : (parentLog ? (parentLog.coachee_sup_email || '') : ''),
    coachee_pg: coachee ? coachee.planning_group : (parentLog ? (parentLog.coachee_pg || '') : ''),
    session_goal: sessionGoal,
    coaching_details: document.getElementById('compass-new-details')?.innerHTML || '',
    status: type === 'QA Feedback' ? 'Pending SME Review' : 'Pending Acknowledgement',
    cap_level: capLevel || null,
    coachee_list: coacheeList.length > 0 ? coacheeList : []
  };

  // Add parent log reference for follow-ups
  if (type === 'Follow-Up Session' && parentLog) {
    record.parent_log_id = parentLog.coaching_id || parentLog.id;
  }

  if (type === 'QA Feedback') {
    record.job_id = document.getElementById('compass-new-job-id')?.value?.trim() || '';
    if (!record.job_id) { showToast('Please enter a Job ID', 'error'); return; }
  }

  if (type === 'ZTP Coaching') {
    record.infraction_category = document.getElementById('compass-new-infraction-cat')?.value || '';
    record.infraction = document.getElementById('compass-new-infraction')?.value || '';
    record.infraction_description = document.getElementById('compass-new-infraction-desc')?.textContent || '';
  }

  if (type === 'QA Feedback') {
    record.level_1_category = document.getElementById('compass-new-rca-l1')?.value || '';
    record.level_2_direct_cause = document.getElementById('compass-new-rca-l2')?.value || '';
    record.level_3_contributing_cause = document.getElementById('compass-new-rca-l3')?.value || '';
    record.level_4_deficiency = document.getElementById('compass-new-rca-l4')?.value || '';
    record.level_5_root_cause = document.getElementById('compass-new-rca-l5')?.value || '';
    record.guidelines = document.getElementById('compass-new-guidelines')?.textContent || '';
  }

  // Group Coaching: create one log per coachee
  if (type === 'Group Coaching' && coacheeList.length > 0) {
    let successCount = 0;
    let failCount = 0;
    const createdIds = [];

    for (const item of coacheeList) {
      const emp = item.emp || COMPASS.employees.find(e => e.ohr_id === item.ohr);
      const individualRecord = {
        coaching_type: 'CAP 0 Coaching',
        coach: coach ? coach.full_name : '',
        coach_ohr: coach ? coach.ohr_id : '',
        coach_meta_email: coach ? (coach.meta_email || '') : '',
        coach_sup: coach ? (coach.supervisor_name || '') : '',
        coach_sup_email: coach ? (coach.supervisor_email || '') : '',
        coach_pg: coach ? coach.planning_group : '',
        coaching_date: date,
        coachee: emp ? emp.full_name : item.name,
        coachee_ohr: item.ohr,
        coachee_meta_email: emp ? emp.meta_email : '',
        coachee_sup: emp ? emp.supervisor_name : '',
        coachee_sup_email: emp ? (emp.supervisor_email || '') : '',
        coachee_pg: emp ? emp.planning_group : '',
        session_goal: sessionGoal,
        coaching_details: document.getElementById('compass-new-details')?.innerHTML || '',
        status: 'Pending Acknowledgement',
        coachee_list: []
      };

      try {
        const resp = await fetch(`${IO_API_BASE}/coaching`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(individualRecord)
        });
        if (!resp.ok) throw new Error('Failed');
        const created = await resp.json();
        createdIds.push(created?.coaching_id || created?.id);
        successCount++;
      } catch (e) {
        failCount++;
        console.error(`Failed to create log for ${item.name}:`, e);
      }
    }

    if (successCount > 0) {
      showToast(`${successCount} coaching log${successCount > 1 ? 's' : ''} created successfully${failCount > 0 ? ` (${failCount} failed)` : ''}`, failCount > 0 ? 'warning' : 'success');

    } else {
      showToast('Failed to create coaching logs', 'error');
    }
    compassCloseForm();
    await compassFetchLogs();
    return;
  }

  // CAP 1-3: defer coaching log creation — open NTE form first, create both on NTE submit
  const shouldOpenNte = capLevel && ['CAP 1', 'CAP 2', 'CAP 3'].includes(capLevel);
  if (shouldOpenNte) {
    await compassOpenNteForm({
      coaching_id: null, // will be created on NTE submit
      employee_name: coachee ? coachee.full_name : (parentLog ? parentLog.coachee : ''),
      ohr_id: coacheeOhr,
      cap_level: capLevel,
      coach_name: coach ? coach.full_name : '',
      coach_ohr: coach ? coach.ohr_id : '',
      pendingCoachingRecord: record // pass the full record to create later
    });
    return;
  }

  try {
    const url = `${IO_API_BASE}/coaching`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    });
    if (!resp.ok) throw new Error('Failed to create coaching log');

    const created = await resp.json();
    const newId = created?.coaching_id || (Array.isArray(created) ? created[0]?.coaching_id : null) || created?.id;

    showToast('Coaching log created successfully', 'success');

    compassCloseForm();
    await compassFetchLogs();
  } catch (e) {
    console.error('Failed to create coaching log:', e);
    showToast('Failed to create coaching log: ' + e.message, 'error');
  }
}

// ===== CAP Level Handling =====

function compassOnCapLevelChange() {
  const selected = document.querySelector('input[name="compass-cap-level"]:checked')?.value || '';
  const notice = document.getElementById('compass-cap-notice');
  if (notice) notice.style.display = selected ? '' : 'none';

  // Change button text: "Next" for CAP 1-3 (will open NTE form), "Create" otherwise
  const submitBtn = document.getElementById('compass-submit-btn');
  if (submitBtn) {
    submitBtn.textContent = ['CAP 1', 'CAP 2', 'CAP 3'].includes(selected) ? 'Next' : 'Create';
  }
}

function compassGetSelectedCapLevel() {
  return document.querySelector('input[name="compass-cap-level"]:checked')?.value || '';
}

function compassCloseForm() {
  const overlay = document.getElementById('compass-form-overlay');
  if (overlay) overlay.style.display = 'none';
  COMPASS.editingId = null;
  COMPASS.selectedParentLog = null;
  _compassDetailStack = []; // Clear navigation stack on close
}

// ===== Multi-Coachee Select (Group/Triad Coaching) =====

function compassToggleCoacheeMulti() {
  const dropdown = document.getElementById('compass-multi-coachee-dropdown');
  if (!dropdown) return;
  const isOpen = dropdown.style.display !== 'none';
  dropdown.style.display = isOpen ? 'none' : '';
  if (!isOpen) {
    const search = document.getElementById('compass-multi-coachee-search');
    if (search) { search.value = ''; search.focus(); }
    compassFilterMultiCoachees();
  }
}

function compassFilterMultiCoachees() {
  const query = (document.getElementById('compass-multi-coachee-search')?.value || '').toLowerCase().trim();
  const options = document.querySelectorAll('#compass-multi-coachee-options .multi-coachee-option');
  options.forEach(opt => {
    const name = opt.dataset.name || '';
    const ohr = opt.dataset.ohr || '';
    opt.style.display = (!query || name.includes(query) || ohr.includes(query)) ? '' : 'none';
  });
}

function compassUpdateMultiCoacheeDisplay() {
  const checkboxes = document.querySelectorAll('#compass-multi-coachee-options input[type="checkbox"]:checked');
  const selected = Array.from(checkboxes);
  const display = document.getElementById('compass-multi-coachee-display');
  const tagsDiv = document.getElementById('compass-multi-coachee-tags');

  if (selected.length === 0) {
    if (display) { display.textContent = 'Select coachees...'; display.style.color = 'var(--fg-muted)'; }
    if (tagsDiv) tagsDiv.innerHTML = '';
  } else {
    if (display) { display.textContent = `${selected.length} coachee${selected.length > 1 ? 's' : ''} selected`; display.style.color = 'var(--fg)'; }
    if (tagsDiv) {
      tagsDiv.innerHTML = selected.map(cb => {
        const emp = COMPASS.employees.find(e => e.ohr_id === cb.value);
        const name = emp ? emp.full_name : cb.value;
        return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;background:var(--accent-primary);color:#fff;border-radius:12px;font-size:11px;">
          ${escapeHtml(name)}
          <span onclick="compassRemoveMultiCoachee('${escapeAttr(cb.value)}')" style="cursor:pointer;font-size:13px;line-height:1;opacity:0.8;">&times;</span>
        </span>`;
      }).join('');
    }
  }
}

function compassRemoveMultiCoachee(ohr) {
  const cb = document.querySelector(`#compass-multi-coachee-options input[type="checkbox"][value="${ohr}"]`);
  if (cb) { cb.checked = false; compassUpdateMultiCoacheeDisplay(); }
}

function compassClearMultiCoachees() {
  const checkboxes = document.querySelectorAll('#compass-multi-coachee-options input[type="checkbox"]:checked');
  checkboxes.forEach(cb => cb.checked = false);
  compassUpdateMultiCoacheeDisplay();
}

// Close multi-coachee dropdown when clicking outside
document.addEventListener('click', function(e) {
  const container = document.getElementById('compass-multi-coachee');
  const dropdown = document.getElementById('compass-multi-coachee-dropdown');
  if (container && dropdown && !container.contains(e.target)) {
    dropdown.style.display = 'none';
  }
});

// ===== Init =====

async function initCompass() {
  await compassFetchEmployees();
  await compassFetchLogs();

  const isAgent = currentUser && currentUser.actual_role === 'Agent' && currentUser.ohr_id !== '740045023';

  // Initialize dual-table pagination
  COMPASS.pageGiven = 1;
  COMPASS.pageReceived = 1;

  // Hide "Add" button for Agents
  const newBtn = document.getElementById('compass-new-btn');
  if (newBtn && isAgent) {
    newBtn.style.display = 'none';
  } else if (newBtn) {
    newBtn.style.display = '';
  }

  compassApplyFilters();
}

async function initCompassDisputes() {
  await compassFetchEmployees();
  await compassFetchLogs();
  compassRenderKanban();
}


// ===== Searchable Coachee Dropdown =====

function compassToggleCoacheeDropdown(show) {
  const dropdown = document.getElementById('compass-coachee-dropdown');
  if (!dropdown) return;
  dropdown.style.display = show ? 'block' : 'none';
  if (show) compassFilterCoachees();
}

function compassFilterCoachees() {
  const search = (document.getElementById('compass-coachee-search')?.value || '').toLowerCase().trim();
  const dropdown = document.getElementById('compass-coachee-dropdown');
  if (!dropdown) return;
  const options = dropdown.querySelectorAll('.searchable-select-option');
  const allowedRoles = COMPASS._triadRoleFilter || null;
  options.forEach(opt => {
    const text = opt.textContent.toLowerCase();
    const ohr = opt.dataset.value || '';
    let visible = text.includes(search);
    // Apply role filter if active (Triad Coaching)
    if (visible && allowedRoles) {
      const emp = COMPASS.employees.find(e => e.ohr_id === ohr);
      if (!emp || !allowedRoles.includes(emp.actual_role)) visible = false;
    }
    opt.style.display = visible ? '' : 'none';
  });
  dropdown.style.display = 'block';
}

/**
 * Filter the single-coachee dropdown to only show employees with specified roles.
 * Pass null to clear the filter and show all employees.
 */
function compassFilterCoacheesByRole(roles) {
  COMPASS._triadRoleFilter = roles;
  // Clear current selection when switching filter
  const hiddenInput = document.getElementById('compass-new-coachee');
  const searchInput = document.getElementById('compass-coachee-search');
  if (hiddenInput) hiddenInput.value = '';
  if (searchInput) searchInput.value = '';
}

function compassSelectCoachee(ohrId, displayText) {
  document.getElementById('compass-new-coachee').value = ohrId;
  document.getElementById('compass-coachee-search').value = displayText;
  compassToggleCoacheeDropdown(false);
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
  const wrapper = document.getElementById('compass-coachee-wrapper');
  if (wrapper && !wrapper.contains(e.target)) {
    compassToggleCoacheeDropdown(false);
  }
  // Also close Triad Coachee dropdown
  const triadWrapper = document.getElementById('compass-triad-coachee-wrapper');
  if (triadWrapper && !triadWrapper.contains(e.target)) {
    compassToggleTriadCoacheeDropdown(false);
  }
});

// ===== Triad Coachee Dropdown Helpers =====

function compassToggleTriadCoacheeDropdown(show) {
  const dropdown = document.getElementById('compass-triad-coachee-dropdown');
  if (!dropdown) return;
  dropdown.style.display = show ? 'block' : 'none';
  if (show) compassFilterTriadCoachees();
}

function compassFilterTriadCoachees() {
  const search = (document.getElementById('compass-triad-coachee-search')?.value || '').toLowerCase().trim();
  const dropdown = document.getElementById('compass-triad-coachee-dropdown');
  if (!dropdown) return;
  const options = dropdown.querySelectorAll('.searchable-select-option');
  options.forEach(opt => {
    const text = opt.textContent.toLowerCase();
    opt.style.display = text.includes(search) ? '' : 'none';
  });
  dropdown.style.display = 'block';
}

function compassSelectTriadCoachee(ohrId, displayText) {
  const hidden = document.getElementById('compass-triad-coachee');
  const search = document.getElementById('compass-triad-coachee-search');
  if (hidden) hidden.value = ohrId;
  if (search) search.value = displayText;
  compassToggleTriadCoacheeDropdown(false);
}


// ===== Cascading RCA Dropdowns (QA Feedback) =====

/**
 * Initialize cascading RCA dropdowns by fetching all RCA data
 * and populating the L1 dropdown.
 */
async function compassInitRCACascade() {
  try {
    const resp = await fetch(`${IO_API_BASE}/coaching-rca`);
    if (!resp.ok) throw new Error('Failed to load RCA data');
    COMPASS._rcaData = await resp.json();
  } catch (e) {
    console.error('Failed to load RCA data:', e);
    COMPASS._rcaData = [];
  }

  // Populate L1
  const l1Select = document.getElementById('compass-new-rca-l1');
  if (!l1Select) return;
  const l1Values = [...new Set(COMPASS._rcaData.map(r => r.level_1_category).filter(Boolean))].sort();
  l1Select.innerHTML = '<option value="">\u2014 Select L1 Category \u2014</option>' +
    l1Values.map(v => `<option value="${escapeAttr(v)}">${escapeHtml(v)}</option>`).join('');

  // Reset downstream
  compassResetRCAFrom('l2');
}

/**
 * Handle cascading RCA dropdown changes.
 * When a level changes, filter and populate the next level, reset all below.
 */
function compassCascadeRCA(changedLevel) {
  const data = COMPASS._rcaData || [];
  const l1 = document.getElementById('compass-new-rca-l1')?.value || '';
  const l2 = document.getElementById('compass-new-rca-l2')?.value || '';
  const l3 = document.getElementById('compass-new-rca-l3')?.value || '';
  const l4 = document.getElementById('compass-new-rca-l4')?.value || '';
  const l5 = document.getElementById('compass-new-rca-l5')?.value || '';

  if (changedLevel === 'l1') {
    compassResetRCAFrom('l2');
    if (!l1) return;
    const filtered = data.filter(r => r.level_1_category === l1);
    const l2Values = [...new Set(filtered.map(r => r.level_2_direct_cause).filter(Boolean))].sort();
    compassPopulateRCASelect('compass-new-rca-l2', l2Values, '\u2014 Select L2 Direct Cause \u2014');
  }

  if (changedLevel === 'l2') {
    compassResetRCAFrom('l3');
    if (!l2) return;
    const filtered = data.filter(r => r.level_1_category === l1 && r.level_2_direct_cause === l2);
    const l3Values = [...new Set(filtered.map(r => r.level_3_contributing_cause).filter(Boolean))].sort();
    compassPopulateRCASelect('compass-new-rca-l3', l3Values, '\u2014 Select L3 Contributing Cause \u2014');
  }

  if (changedLevel === 'l3') {
    compassResetRCAFrom('l4');
    if (!l3) return;
    const filtered = data.filter(r => r.level_1_category === l1 && r.level_2_direct_cause === l2 && r.level_3_contributing_cause === l3);
    const l4Values = [...new Set(filtered.map(r => r.level_4_deficiency).filter(Boolean))].sort();
    compassPopulateRCASelect('compass-new-rca-l4', l4Values, '\u2014 Select L4 Deficiency \u2014');
  }

  if (changedLevel === 'l4') {
    compassResetRCAFrom('l5');
    if (!l4) return;
    const filtered = data.filter(r => r.level_1_category === l1 && r.level_2_direct_cause === l2 && r.level_3_contributing_cause === l3 && r.level_4_deficiency === l4);
    const l5Values = [...new Set(filtered.map(r => r.level_5_root_cause).filter(Boolean))].sort();
    compassPopulateRCASelect('compass-new-rca-l5', l5Values, '\u2014 Select L5 Root Cause \u2014');
  }

  if (changedLevel === 'l5') {
    // Auto-populate RCA Description from the matching row's guidelines
    const guidelinesDiv = document.getElementById('compass-new-guidelines');
    if (!guidelinesDiv) return;
    if (!l5) {
      guidelinesDiv.textContent = 'Select L5 Root Cause to see description...';
      return;
    }
    const match = data.find(r =>
      r.level_1_category === l1 &&
      r.level_2_direct_cause === l2 &&
      r.level_3_contributing_cause === l3 &&
      r.level_4_deficiency === l4 &&
      r.level_5_root_cause === l5
    );
    guidelinesDiv.textContent = match?.guidelines || 'No description available.';
  }
}

/**
 * Populate a RCA select dropdown with values.
 */
function compassPopulateRCASelect(selectId, values, placeholder) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.disabled = false;
  sel.innerHTML = `<option value="">${placeholder}</option>` +
    values.map(v => `<option value="${escapeAttr(v)}">${escapeHtml(v)}</option>`).join('');
}

/**
 * Reset RCA dropdowns from a given level onwards.
 */
function compassResetRCAFrom(fromLevel) {
  const levels = ['l2', 'l3', 'l4', 'l5'];
  const placeholders = {
    l2: '\u2014 Select L2 Direct Cause \u2014',
    l3: '\u2014 Select L3 Contributing Cause \u2014',
    l4: '\u2014 Select L4 Deficiency \u2014',
    l5: '\u2014 Select L5 Root Cause \u2014'
  };
  const startIdx = levels.indexOf(fromLevel);
  if (startIdx < 0) return;
  for (let i = startIdx; i < levels.length; i++) {
    const sel = document.getElementById(`compass-new-rca-${levels[i]}`);
    if (sel) {
      sel.innerHTML = `<option value="">${placeholders[levels[i]]}</option>`;
      sel.disabled = true;
    }
  }
  // Reset guidelines
  const guidelinesDiv = document.getElementById('compass-new-guidelines');
  if (guidelinesDiv) guidelinesDiv.textContent = 'Select L5 Root Cause to see description...';
}

// ===== Rich Text Editor Helper =====
function compassRteExec(command, value) {
  document.execCommand(command, false, value || null);
  document.getElementById('compass-new-details')?.focus();
  compassRteUpdateToolbar();
}

function compassRteUpdateToolbar() {
  const toolbar = document.querySelector('.rte-toolbar');
  if (!toolbar) return;
  const buttons = toolbar.querySelectorAll('.rte-btn[data-command]');
  buttons.forEach(btn => {
    const cmd = btn.getAttribute('data-command');
    if (cmd && document.queryCommandState(cmd)) {
      btn.classList.add('rte-active');
    } else {
      btn.classList.remove('rte-active');
    }
  });
}

// Listen for cursor/selection changes to update toolbar active states
document.addEventListener('selectionchange', function() {
  const editor = document.getElementById('compass-new-details');
  if (!editor) return;
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
    compassRteUpdateToolbar();
  }
});


// ===== Multi-Select Goal Helpers =====

// Goals to hide for "CAP 0 Coaching" type
const NEW_SESSION_HIDDEN_GOALS = ['Coaching Observation', 'Quality Error Findings'];

function compassFilterGoalOptions(type) {
  const dropdown = document.getElementById('compass-goal-dropdown');
  if (!dropdown) return;
  const labels = dropdown.querySelectorAll('label.multi-select-option');
  labels.forEach(label => {
    const goalName = label.getAttribute('data-goal');
    if (type === 'CAP 0 Coaching' && NEW_SESSION_HIDDEN_GOALS.includes(goalName)) {
      label.style.display = 'none';
      // Also uncheck if hidden
      const cb = label.querySelector('input[type="checkbox"]');
      if (cb) cb.checked = false;
    } else {
      label.style.display = '';
    }
  });
  compassUpdateGoalSelection();
}

function compassUpdateGoalSelection() {
  const container = document.getElementById('compass-goal-dropdown');
  if (!container) return;
  const checked = container.querySelectorAll('input[type="checkbox"]:checked');
  const display = document.getElementById('compass-goal-display');
  if (!display) return;
  if (checked.length === 0) {
    display.textContent = '— Select —';
  } else {
    display.textContent = Array.from(checked).map(cb => cb.value).join(', ');
  }
}

function compassGetSelectedGoals() {
  const container = document.getElementById('compass-goal-dropdown');
  if (!container) return '';
  const checked = container.querySelectorAll('input[type="checkbox"]:checked');
  return Array.from(checked).map(cb => cb.value).join(', ');
}

// Close multi-select dropdown when clicking outside
document.addEventListener('click', function(e) {
  const dropdown = document.getElementById('compass-goal-dropdown');
  const container = document.getElementById('compass-goal-container');
  if (dropdown && container && !container.contains(e.target)) {
    dropdown.classList.remove('open');
  }
});


// ===== Attachment Helpers =====
var compassAttachedFiles = [];

function compassUpdateAttachmentList() {
  const input = document.getElementById('compass-attachments');
  if (!input || !input.files) return;
  for (let i = 0; i < input.files.length; i++) {
    compassAttachedFiles.push(input.files[i]);
  }
  input.value = '';
  compassRenderAttachmentList();
}

function compassRemoveAttachment(index) {
  compassAttachedFiles.splice(index, 1);
  compassRenderAttachmentList();
}

function compassRenderAttachmentList() {
  const listEl = document.getElementById('compass-attachment-list');
  if (!listEl) return;
  if (compassAttachedFiles.length === 0) {
    listEl.innerHTML = '';
    return;
  }
  let html = '';
  for (let i = 0; i < compassAttachedFiles.length; i++) {
    const f = compassAttachedFiles[i];
    const sizeKB = (f.size / 1024).toFixed(1);
    html += `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px;color:var(--fg);">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <span>${f.name}</span>
      <span style="color:var(--fg-subtle);">(${sizeKB} KB)</span>
      <button type="button" onclick="compassRemoveAttachment(${i})" style="background:none;border:none;cursor:pointer;padding:2px;display:flex;align-items:center;color:var(--error, #EF4444);" title="Remove">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`;
  }
  listEl.innerHTML = html;
}

// ===== Disputes Area — Detail View (opens within Disputes page, not Coaching Profile) =====

var _disputesEditingId = null;

async function disputesOpenDetail(coachingId) {
  let log = COMPASS.logs.find(l => String(l.coaching_id || l.id) === String(coachingId));
  if (!log) return;
  _disputesEditingId = log.coaching_id || log.id;

  // Fetch full record on demand if coaching_details is missing (lean mode)
  if (log.coaching_details === undefined) {
    try {
      const fullResp = await fetch(`${IO_API_BASE}/coaching?coaching_id=${encodeURIComponent(log.coaching_id || log.id)}`);
      if (fullResp.ok) {
        const fullRows = await fullResp.json();
        if (fullRows.length > 0) Object.assign(log, fullRows[0]);
      }
    } catch (e) { console.warn('Failed to fetch full coaching details:', e); }
  }

  const titleEl = document.getElementById('disputes-detail-title');
  const bodyEl = document.getElementById('disputes-detail-body');
  const footerEl = document.getElementById('disputes-detail-footer');
  const overlay = document.getElementById('disputes-detail-overlay');

  titleEl.innerHTML = `<span>${escapeHtml(log.coaching_id || '#' + log.id)}</span>`;

  const date = log.coaching_date ? new Date(log.coaching_date).toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '—';
  const statusColor = COMPASS.STATUS_COLORS[log.status] || 'var(--fg-muted)';

  // ===== SECTION 1: SESSION DETAILS =====
  let html = '<div class="detail-section"><h4 class="detail-section-title" style="font-size:13px;text-transform:uppercase;letter-spacing:1px;color:var(--fg-muted);border-bottom:2px solid var(--primary);padding-bottom:6px;margin-bottom:12px;">Session Details</h4>';

  html += `<div class="detail-row"><span class="detail-label">Status</span><span class="detail-value" style="font-weight:600;color:${statusColor};">${escapeHtml(log.status || '—')}</span></div>`;
  html += `<div class="detail-row"><span class="detail-label">Coaching Date</span><span class="detail-value">${date}</span></div>`;
  html += `<div class="detail-row"><span class="detail-label">Coachee</span><span class="detail-value">${escapeHtml(log.coachee || '—')}</span></div>`;
  if (log.coaching_type === 'QA Feedback' && log.job_id) {
    html += `<div class="detail-row"><span class="detail-label">Job ID</span><span class="detail-value">${escapeHtml(log.job_id)}</span></div>`;
  }

  if (log.coachee_sup && log.coach !== log.coachee_sup) {
    html += `<div class="detail-row"><span class="detail-label">Coachee Supervisor</span><span class="detail-value">${escapeHtml(log.coachee_sup)}</span></div>`;
  }

  html += `<div class="detail-row"><span class="detail-label">Coach</span><span class="detail-value">${escapeHtml(log.coach || '—')}</span></div>`;
  html += `<div class="detail-row"><span class="detail-label">Coaching Details</span><span class="detail-value detail-multiline">${log.coaching_details || '—'}</span></div>`;

  // Attachments
  html += compassRenderAttachmentsDetail(log);

  html += '</div>'; // close Session Details

  // ===== SECTION 2: ROOT CAUSE ANALYSIS (QA Feedback only) =====
  if (log.coaching_type === 'QA Feedback') {
    html += '<div class="detail-section" style="margin-top:16px;"><h4 class="detail-section-title" style="font-size:13px;text-transform:uppercase;letter-spacing:1px;color:var(--fg-muted);border-bottom:2px solid var(--primary);padding-bottom:6px;margin-bottom:12px;">Root Cause Analysis</h4>';
    html += `<div class="detail-row"><span class="detail-label">L1 Category</span><span class="detail-value">${escapeHtml(log.level_1_category || '—')}</span></div>`;
    html += `<div class="detail-row"><span class="detail-label">L2 Direct Cause</span><span class="detail-value">${escapeHtml(log.level_2_direct_cause || '—')}</span></div>`;
    html += `<div class="detail-row"><span class="detail-label">L3 Contributing Cause</span><span class="detail-value">${escapeHtml(log.level_3_contributing_cause || '—')}</span></div>`;
    html += `<div class="detail-row"><span class="detail-label">L4 Deficiency</span><span class="detail-value">${escapeHtml(log.level_4_deficiency || '—')}</span></div>`;
    html += `<div class="detail-row"><span class="detail-label">L5 Root Cause</span><span class="detail-value">${escapeHtml(log.level_5_root_cause || '—')}</span></div>`;
    html += `<div class="detail-row"><span class="detail-label">RCA Description</span><span class="detail-value">${escapeHtml(log.guidelines || '—')}</span></div>`;
    html += '</div>';
  }

  // ===== SECTION 3: DISPUTE TRAIL =====
  if (log.coaching_type === 'QA Feedback') {
    const commentFields = [
      log.dispute_comments, log.qa_comments, log.sme_qa_dispute_comments,
      log.trainer_comments, log.sme_trainer_comments, log.qtp_manager_comments
    ];
    const hasDispute = commentFields.some(c => c && c.trim());
    if (hasDispute) {
      html += '<div class="detail-section" style="margin-top:16px;"><h4 class="detail-section-title" style="font-size:13px;text-transform:uppercase;letter-spacing:1px;color:var(--fg-muted);border-bottom:2px solid var(--primary);padding-bottom:6px;margin-bottom:12px;">Dispute Trail</h4>';
      html += disputesRenderTrailEntries(log);
      html += '</div>';
    }
  }

  // NO ACKNOWLEDGEMENT SECTION for Disputes Area

  bodyEl.innerHTML = html;

  // Footer actions based on role and status
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  let footerHtml = '';

  if (cu) {
    const role = cu.actual_role;
    const isAdmin = cu.ohr_id === '740045023';

    // LV1 - SME actions: Accept Markdown / Dispute Markdown
    if (role === 'SME' || isAdmin) {
      if (log.status === 'Pending SME Review') {
        footerHtml += ' <button class="btn btn-success btn-sm" onclick="disputesShowAcceptMarkdown()">Accept Markdown</button>';
        footerHtml += ' <button class="btn btn-danger btn-sm" onclick="disputesShowDisputeMarkdown()">Dispute Markdown</button>';
      }
    }

    // LV2 - QA actions: Reverse Markdown / Retain Markdown
    if (role === 'QA' || isAdmin) {
      if (log.status === 'Markdown Disputed') {
        footerHtml += ' <button class="btn btn-success btn-sm" onclick="disputesShowReverseMarkdown()">Reverse Markdown</button>';
        footerHtml += ' <button class="btn btn-warning btn-sm" onclick="disputesShowRetainMarkdown()">Retain Markdown</button>';
      }
    }

    // LV3 - SME actions: Accept Decision / Reject Decision
    if (role === 'SME' || isAdmin) {
      if (log.status === 'Markdown Retained - QA') {
        footerHtml += ' <button class="btn btn-success btn-sm" onclick="disputesShowQADecisionAccepted()">Accept Decision</button>';
        footerHtml += ' <button class="btn btn-danger btn-sm" onclick="disputesShowQADecisionRejected()">Reject Decision</button>';
      }
    }

    // LV4 - Trainer actions: Reverse Markdown / Retain Markdown
    if (role === 'Trainer' || isAdmin) {
      if (log.status === 'QA Decision Rejected') {
        footerHtml += ' <button class="btn btn-success btn-sm" onclick="disputesShowLV4ReverseMarkdown()">Reverse Markdown</button>';
        footerHtml += ' <button class="btn btn-warning btn-sm" onclick="disputesShowLV4RetainMarkdown()">Retain Markdown</button>';
      }
    }

    // LV5 - SME actions: Accept Decision / Reject Decision
    if (role === 'SME' || isAdmin) {
      if (log.status === 'Markdown Retained - Trainer') {
        footerHtml += ' <button class="btn btn-success btn-sm" onclick="disputesShowLV5AcceptDecision()">Accept Decision</button>';
        footerHtml += ' <button class="btn btn-danger btn-sm" onclick="disputesShowLV5RejectDecision()">Reject Decision</button>';
      }
    }

    // LV6 - QTP Manager actions: Reverse Markdown / Retain Markdown
    if (role === 'Manager' || isAdmin) {
      if (log.status === 'Trainer Decision Rejected') {
        footerHtml += ' <button class="btn btn-success btn-sm" onclick="disputesShowLV6ReverseMarkdown()">Reverse Markdown</button>';
        footerHtml += ' <button class="btn btn-warning btn-sm" onclick="disputesShowLV6RetainMarkdown()">Retain Markdown</button>';
      }
    }
  }

  footerEl.innerHTML = footerHtml;
  overlay.style.display = 'flex';
}

function disputesCloseDetail() {
  const overlay = document.getElementById('disputes-detail-overlay');
  if (overlay) overlay.style.display = 'none';
  _disputesEditingId = null;
}

function disputesCloseAction() {
  const overlay = document.getElementById('disputes-action-overlay');
  if (overlay) overlay.style.display = 'none';
}

// ===== LV1: Dispute Markdown Popout =====

var _disputeAttachedFiles = [];

function disputesShowDisputeMarkdown() {
  const titleEl = document.getElementById('disputes-action-title');
  const bodyEl = document.getElementById('disputes-action-body');
  const footerEl = document.getElementById('disputes-action-footer');
  const overlay = document.getElementById('disputes-action-overlay');

  _disputeAttachedFiles = [];

  titleEl.textContent = 'Dispute Markdown';
  bodyEl.innerHTML = `
    <div style="margin-bottom:14px;">
      <label style="font-size:12px;font-weight:500;color:var(--fg-muted);display:block;margin-bottom:4px;">Remarks <span style="color:var(--error);">*</span></label>
      <textarea id="dispute-remarks-input" class="form-input" style="width:100%;min-height:80px;resize:vertical;font-size:13px;" placeholder="Enter your remarks for disputing this markdown..."></textarea>
    </div>
    <div style="margin-bottom:14px;">
      <label style="font-size:12px;font-weight:500;color:var(--fg-muted);display:block;margin-bottom:4px;">Attachments</label>
      <input type="file" id="dispute-file-input" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.gif,.bmp,.webp" style="display:none" onchange="disputeUpdateFiles()">
      <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('dispute-file-input').click()" style="display:flex;align-items:center;gap:6px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
        Attach Files
      </button>
      <div id="dispute-file-list" style="margin-top:6px;"></div>
      <p style="font-size:11px;color:var(--fg-subtle);margin-top:4px;">Optional. Accepts documents, spreadsheets, and images.</p>
    </div>
  `;

  footerEl.innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="disputesCloseAction()">Cancel</button>
    <button class="btn btn-danger btn-sm" onclick="disputesSubmitDisputeMarkdown()">Save</button>
  `;

  overlay.style.display = 'flex';
}

function disputeUpdateFiles() {
  const input = document.getElementById('dispute-file-input');
  if (!input || !input.files) return;
  for (let i = 0; i < input.files.length; i++) {
    _disputeAttachedFiles.push(input.files[i]);
  }
  input.value = '';
  disputeRenderFileList();
}

function disputeRemoveFile(index) {
  _disputeAttachedFiles.splice(index, 1);
  disputeRenderFileList();
}

function disputeRenderFileList() {
  const listEl = document.getElementById('dispute-file-list');
  if (!listEl) return;
  if (_disputeAttachedFiles.length === 0) { listEl.innerHTML = ''; return; }
  let html = '';
  for (let i = 0; i < _disputeAttachedFiles.length; i++) {
    const f = _disputeAttachedFiles[i];
    const sizeKB = (f.size / 1024).toFixed(1);
    html += `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px;color:var(--fg);">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <span>${escapeHtml(f.name)}</span>
      <span style="color:var(--fg-subtle);">(${sizeKB} KB)</span>
      <button type="button" onclick="disputeRemoveFile(${i})" style="background:none;border:none;cursor:pointer;padding:2px;display:flex;align-items:center;color:var(--error, #EF4444);" title="Remove">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`;
  }
  listEl.innerHTML = html;
}

async function disputesSubmitDisputeMarkdown() {
  const remarks = (document.getElementById('dispute-remarks-input')?.value || '').trim();
  if (!remarks) {
    showToast('Remarks are required', 'error');
    return;
  }

  const log = COMPASS.logs.find(l => String(l.coaching_id || l.id) === String(_disputesEditingId));
  if (!log) return;

  // Upload attachments if any
  let attachmentUrls = [];
  for (const file of _disputeAttachedFiles) {
    try {
      const base64 = await fileToBase64(file);
      const resp = await fetch(`${IO_API_BASE}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, data: base64 })
      });
      if (resp.ok) {
        const result = await resp.json();
        attachmentUrls.push({ name: file.name, url: result.url });
      }
    } catch (e) {
      console.error('Failed to upload attachment:', e);
    }
  }

  const timestamp = new Date().toLocaleString();
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  const actorName = cu ? cu.full_name : 'Unknown';

  const update = {
    status: 'Markdown Disputed',
    dispute_comments: (log.dispute_comments || '') + '\n[' + timestamp + ' — ' + actorName + '] ' + remarks
  };

  // Append attachment info to dispute_comments if any
  if (attachmentUrls.length > 0) {
    update.dispute_comments += '\n[Attachments: ' + attachmentUrls.map(a => a.name).join(', ') + ']';
    // Also store attachment URLs in a parseable format
    const existingAttachments = log.dispute_attachments ? JSON.parse(log.dispute_attachments || '[]') : [];
    update.dispute_attachments = JSON.stringify([...existingAttachments, ...attachmentUrls]);
  }

  try {
    const url = `${IO_API_BASE}/coaching/${log.coaching_id || log.id}`;
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update)
    });
    if (!resp.ok) throw new Error('Failed to update');

    showToast('Markdown disputed successfully. Card moved to LV2.', 'success');
    disputesCloseAction();
    disputesCloseDetail();
    await compassFetchLogs();
    compassRenderKanban();
  } catch (e) {
    showToast('Failed to dispute markdown: ' + e.message, 'error');
  }
}

// ===== LV1: Accept Markdown Popout =====

function disputesShowAcceptMarkdown() {
  const titleEl = document.getElementById('disputes-action-title');
  const bodyEl = document.getElementById('disputes-action-body');
  const footerEl = document.getElementById('disputes-action-footer');
  const overlay = document.getElementById('disputes-action-overlay');

  titleEl.textContent = 'Accept Markdown';
  bodyEl.innerHTML = `
    <div style="text-align:center;padding:16px 0;">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:12px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      <p style="font-size:14px;color:var(--fg);margin-bottom:4px;font-weight:600;">Are you sure you want to accept this markdown?</p>
      <p style="font-size:12px;color:var(--fg-muted);">This log will now be sent to the coachee for acknowledgement.</p>
    </div>
  `;

  footerEl.innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="disputesCloseAction()">Cancel</button>
    <button class="btn btn-success btn-sm" onclick="disputesSubmitAcceptMarkdown()">Save</button>
  `;

  overlay.style.display = 'flex';
}

async function disputesSubmitAcceptMarkdown() {
  const log = COMPASS.logs.find(l => String(l.coaching_id || l.id) === String(_disputesEditingId));
  if (!log) return;

  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  const actorName = cu ? cu.full_name : 'Unknown';
  const timestamp = new Date().toLocaleString();

  const update = {
    status: 'Markdown Accepted',
    dispute_comments: (log.dispute_comments || '') + '\n[' + timestamp + ' — ' + actorName + '] Markdown accepted by SME.'
  };

  try {
    const url = `${IO_API_BASE}/coaching/${log.coaching_id || log.id}`;
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update)
    });
    if (!resp.ok) throw new Error('Failed to update');

    showToast('Markdown accepted.', 'success');
    disputesCloseAction();
    disputesCloseDetail();
    await compassFetchLogs();
    compassRenderKanban();
  } catch (e) {
    showToast('Failed to accept markdown: ' + e.message, 'error');
  }
}

// ===== Quick Action for non-LV1 dispute actions (with comment prompt) =====

async function disputesQuickAction(newStatus) {
  const log = COMPASS.logs.find(l => String(l.coaching_id || l.id) === String(_disputesEditingId));
  if (!log) return;

  const comment = prompt('Add a comment (optional):');
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  const actorName = cu ? cu.full_name : 'Unknown';
  const timestamp = new Date().toLocaleString();
  const update = { status: newStatus };

  // Map comment to the right field based on who is acting
  if (comment) {
    const commentEntry = '\n[' + timestamp + ' — ' + actorName + '] ' + comment;
    if (newStatus.includes('- SME') && !newStatus.includes('QA Retention') && !newStatus.includes('Trainer Decision')) {
      update.dispute_comments = (log.dispute_comments || '') + commentEntry;
    } else if (newStatus.includes('- QA')) {
      update.qa_comments = (log.qa_comments || '') + commentEntry;
    } else if (newStatus.includes('QA Retention')) {
      update.sme_qa_dispute_comments = (log.sme_qa_dispute_comments || '') + commentEntry;
    } else if (newStatus.includes('- Trainer')) {
      update.trainer_comments = (log.trainer_comments || '') + commentEntry;
    } else if (newStatus.includes('Trainer Decision')) {
      update.sme_trainer_comments = (log.sme_trainer_comments || '') + commentEntry;
    } else if (newStatus.includes('- QTP')) {
      update.qtp_manager_comments = (log.qtp_manager_comments || '') + commentEntry;
    }
  }

  // Status is set directly — no override to Pending Acknowledgement
  // Each level sets its own terminal status

  try {
    const url = `${IO_API_BASE}/coaching/${log.coaching_id || log.id}`;
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update)
    });
    if (!resp.ok) throw new Error('Failed to update');

    showToast('Dispute action applied', 'success');
    disputesCloseDetail();
    await compassFetchLogs();
    compassRenderKanban();
  } catch (e) {
    showToast('Failed to update: ' + e.message, 'error');
  }
}

// ===== File to Base64 helper =====

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1]; // Remove data:...;base64, prefix
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ===== Dispute Trail: Formatted timeline entries =====

function disputesRenderTrailEntries(log) {
  // Collect all comment fields in order of the dispute flow
  const allComments = [
    log.dispute_comments,
    log.qa_comments,
    log.sme_qa_dispute_comments,
    log.trainer_comments,
    log.sme_trainer_comments,
    log.qtp_manager_comments
  ].filter(Boolean);

  // Parse all entries from all comment fields
  // Format: \n[timestamp — actor] message\n[Attachments: file1, file2]
  const entries = [];
  const entryRegex = /\[([^\]]+?)\s*[—–-]\s*([^\]]+?)\]\s*([\s\S]*?)(?=\n\[|$)/g;

  for (const commentBlock of allComments) {
    let match;
    const text = commentBlock.trim();
    entryRegex.lastIndex = 0;
    while ((match = entryRegex.exec(text)) !== null) {
      const timestamp = match[1].trim();
      const actor = match[2].trim();
      let message = match[3].trim();

      // Check if there's an attachment line embedded in the message
      let attachmentLine = '';
      const attMatch = message.match(/\[Attachments:\s*([^\]]+)\]/);
      if (attMatch) {
        attachmentLine = attMatch[1].trim();
        message = message.replace(/\n?\[Attachments:\s*[^\]]+\]/, '').trim();
      }

      entries.push({ timestamp, actor, message, attachmentLine });
    }
  }

  // Parse dispute_attachments JSON for downloadable links
  let disputeAttachments = [];
  try {
    if (log.dispute_attachments) {
      disputeAttachments = JSON.parse(log.dispute_attachments);
    }
  } catch (e) {}

  if (entries.length === 0) {
    return '<p style="font-size:12px;color:var(--fg-subtle);padding:8px 0;">No dispute entries recorded.</p>';
  }

  let html = '';
  entries.forEach((entry, idx) => {
    const isLast = idx === entries.length - 1;
    html += `<div style="position:relative;padding-left:20px;padding-bottom:${isLast ? '4' : '16'}px;border-left:2px solid var(--border);margin-left:6px;">`;
    // Timeline dot
    html += `<div style="position:absolute;left:-5px;top:2px;width:8px;height:8px;border-radius:50%;background:var(--primary);"></div>`;
    // Timestamp and actor
    html += `<div style="font-size:11px;color:var(--fg-muted);margin-bottom:2px;">${escapeHtml(entry.timestamp)} — <strong style="color:var(--fg);">${escapeHtml(entry.actor)}</strong></div>`;
    // Message
    html += `<div style="font-size:13px;color:var(--fg);line-height:1.5;">${escapeHtml(entry.message)}</div>`;
    // Attachments
    if (entry.attachmentLine) {
      // Try to match with disputeAttachments for download links
      const fileNames = entry.attachmentLine.split(',').map(f => f.trim());
      html += '<div style="margin-top:4px;">';
      fileNames.forEach(fn => {
        const att = disputeAttachments.find(a => a.name === fn);
        if (att && att.url) {
          html += `<a href="${escapeAttr(att.url)}" target="_blank" download="${escapeAttr(fn)}" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--primary);text-decoration:none;margin-right:8px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            ${escapeHtml(fn)}
          </a>`;
        } else {
          html += `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--fg-muted);margin-right:8px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            ${escapeHtml(fn)}
          </span>`;
        }
      });
      html += '</div>';
    } else {
      html += '<div style="font-size:11px;color:var(--fg-subtle);margin-top:2px;">No Attachment</div>';
    }
    html += '</div>';
  });

  return html;
}

// ===== LV2: Retain Markdown Popout =====

function disputesShowRetainMarkdown() {
  const titleEl = document.getElementById('disputes-action-title');
  const bodyEl = document.getElementById('disputes-action-body');
  const footerEl = document.getElementById('disputes-action-footer');
  const overlay = document.getElementById('disputes-action-overlay');

  _disputeAttachedFiles = [];

  titleEl.textContent = 'Retain Markdown';
  bodyEl.innerHTML = `
    <div style="padding:8px 0;">
      <label style="font-size:13px;font-weight:600;color:var(--primary);display:block;margin-bottom:6px;">Remarks <span style="color:var(--error);">*</span></label>
      <textarea id="dispute-remarks-input" rows="5" style="width:100%;background:var(--surface);color:var(--fg);border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:13px;resize:vertical;font-family:inherit;" placeholder="Enter your remarks for retaining this markdown..."></textarea>
    </div>
    <div style="margin-top:12px;">
      <label style="font-size:13px;font-weight:600;color:var(--primary);display:block;margin-bottom:6px;">Attachments</label>
      <input type="file" id="dispute-file-input" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.gif,.bmp,.webp" style="display:none" onchange="disputeHandleFileSelect(this)">
      <div style="display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:13px;color:var(--primary);" onclick="document.getElementById('dispute-file-input').click()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
        Attach Files
      </div>
      <div id="dispute-file-list" style="margin-top:8px;"></div>
      <p style="font-size:11px;color:var(--fg-muted);margin-top:6px;">Optional. Accepts documents, spreadsheets, and images.</p>
    </div>
  `;

  footerEl.innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="disputesCloseAction()">Cancel</button>
    <button class="btn btn-primary btn-sm" onclick="disputesSubmitRetainMarkdown()">Save</button>
  `;

  overlay.style.display = 'flex';
}

async function disputesSubmitRetainMarkdown() {
  const remarks = (document.getElementById('dispute-remarks-input')?.value || '').trim();
  if (!remarks) {
    showToast('Remarks are required', 'error');
    return;
  }

  const log = COMPASS.logs.find(l => String(l.coaching_id || l.id) === String(_disputesEditingId));
  if (!log) return;

  // Upload attachments if any
  let attachmentUrls = [];
  for (const file of _disputeAttachedFiles) {
    try {
      const base64 = await fileToBase64(file);
      const resp = await fetch(`${IO_API_BASE}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, data: base64 })
      });
      if (resp.ok) {
        const result = await resp.json();
        attachmentUrls.push({ name: file.name, url: result.url });
      }
    } catch (e) {
      console.error('Failed to upload attachment:', e);
    }
  }

  const timestamp = new Date().toLocaleString();
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  const actorName = cu ? cu.full_name : 'Unknown';

  const update = {
    status: 'Markdown Retained - QA',
    qa_comments: (log.qa_comments || '') + '\n[' + timestamp + ' — ' + actorName + '] ' + remarks
  };

  if (attachmentUrls.length > 0) {
    update.qa_comments += '\n[Attachments: ' + attachmentUrls.map(a => a.name).join(', ') + ']';
    const existingAttachments = log.dispute_attachments ? JSON.parse(log.dispute_attachments || '[]') : [];
    update.dispute_attachments = JSON.stringify([...existingAttachments, ...attachmentUrls]);
  }

  try {
    const url = `${IO_API_BASE}/coaching/${log.coaching_id || log.id}`;
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update)
    });
    if (!resp.ok) throw new Error('Failed to update');

    showToast('Markdown retained. Card moved to LV3.', 'success');
    disputesCloseAction();
    disputesCloseDetail();
    await compassFetchLogs();
    compassRenderKanban();
  } catch (e) {
    showToast('Failed to retain markdown: ' + e.message, 'error');
  }
}

// ===== LV2: Reverse Markdown Popout =====

function disputesShowReverseMarkdown() {
  const titleEl = document.getElementById('disputes-action-title');
  const bodyEl = document.getElementById('disputes-action-body');
  const footerEl = document.getElementById('disputes-action-footer');
  const overlay = document.getElementById('disputes-action-overlay');

  titleEl.textContent = 'Reverse Markdown';
  bodyEl.innerHTML = `
    <div style="text-align:center;padding:24px 0 8px;">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:16px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <p style="font-size:15px;color:var(--fg);margin-bottom:6px;font-weight:600;">Are you sure you want to reverse this markdown?</p>
      <p style="font-size:13px;color:var(--fg-muted);">This log will now be sent to the coachee for acknowledgement.</p>
    </div>
  `;

  footerEl.innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="disputesCloseAction()">Cancel</button>
    <button class="btn btn-success btn-sm" onclick="disputesSubmitReverseMarkdown()">Save</button>
  `;

  overlay.style.display = 'flex';
}

async function disputesSubmitReverseMarkdown() {
  const log = COMPASS.logs.find(l => String(l.coaching_id || l.id) === String(_disputesEditingId));
  if (!log) return;

  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  const actorName = cu ? cu.full_name : 'Unknown';
  const timestamp = new Date().toLocaleString();

  const update = {
    status: 'Markdown Reversed - QA',
    qa_comments: (log.qa_comments || '') + '\n[' + timestamp + ' — ' + actorName + '] Markdown reversed by QA.'
  };

  try {
    const url = `${IO_API_BASE}/coaching/${log.coaching_id || log.id}`;
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update)
    });
    if (!resp.ok) throw new Error('Failed to update');

    showToast('Markdown reversed by QA.', 'success');
    disputesCloseAction();
    disputesCloseDetail();
    await compassFetchLogs();
    compassRenderKanban();
  } catch (e) {
    showToast('Failed to reverse markdown: ' + e.message, 'error');
  }
}

// ===== LV3: QA Decision Accepted Popout =====

function disputesShowQADecisionAccepted() {
  const titleEl = document.getElementById('disputes-action-title');
  const bodyEl = document.getElementById('disputes-action-body');
  const footerEl = document.getElementById('disputes-action-footer');
  const overlay = document.getElementById('disputes-action-overlay');

  titleEl.textContent = 'Accept Decision';
  bodyEl.innerHTML = `
    <div style="text-align:center;padding:24px 0 8px;">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:16px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      <p style="font-size:15px;color:var(--fg);margin-bottom:6px;font-weight:600;">Are you sure you want to accept the decision?</p>
      <p style="font-size:13px;color:var(--fg-muted);">This log will now be sent to the coachee for acknowledgement.</p>
    </div>
  `;

  footerEl.innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="disputesCloseAction()">Cancel</button>
    <button class="btn btn-success btn-sm" onclick="disputesSubmitQADecisionAccepted()">Save</button>
  `;

  overlay.style.display = 'flex';
}

async function disputesSubmitQADecisionAccepted() {
  const log = COMPASS.logs.find(l => String(l.coaching_id || l.id) === String(_disputesEditingId));
  if (!log) return;

  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  const actorName = cu ? cu.full_name : 'Unknown';
  const timestamp = new Date().toLocaleString();

  const update = {
    status: 'QA Decision Accepted',
    sme_qa_dispute_comments: (log.sme_qa_dispute_comments || '') + '\n[' + timestamp + ' — ' + actorName + '] QA decision accepted by SME.'
  };

  try {
    const url = `${IO_API_BASE}/coaching/${log.coaching_id || log.id}`;
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update)
    });
    if (!resp.ok) throw new Error('Failed to update');

    showToast('QA decision accepted.', 'success');
    disputesCloseAction();
    disputesCloseDetail();
    await compassFetchLogs();
    compassRenderKanban();
  } catch (e) {
    showToast('Failed to accept QA decision: ' + e.message, 'error');
  }
}

// ===== LV3: QA Decision Rejected Popout (with Remarks + Attachments) =====

function disputesShowQADecisionRejected() {
  const titleEl = document.getElementById('disputes-action-title');
  const bodyEl = document.getElementById('disputes-action-body');
  const footerEl = document.getElementById('disputes-action-footer');
  const overlay = document.getElementById('disputes-action-overlay');

  _disputeAttachedFiles = [];

  titleEl.textContent = 'Reject Decision';
  bodyEl.innerHTML = `
    <div style="padding:8px 0;">
      <label style="font-size:13px;font-weight:600;color:var(--primary);display:block;margin-bottom:6px;">Remarks <span style="color:var(--error);">*</span></label>
      <textarea id="dispute-remarks-input" rows="5" style="width:100%;background:var(--surface);color:var(--fg);border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:13px;resize:vertical;font-family:inherit;" placeholder="Enter your remarks for rejecting the QA decision..."></textarea>
    </div>
    <div style="margin-top:12px;">
      <label style="font-size:13px;font-weight:600;color:var(--primary);display:block;margin-bottom:6px;">Attachments</label>
      <div style="display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:13px;color:var(--primary);" onclick="document.getElementById('dispute-file-input').click()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
        Attach Files
      </div>
      <input type="file" id="dispute-file-input" multiple style="display:none;" onchange="disputeHandleFileSelect(this)" />
      <div id="dispute-file-list" style="margin-top:8px;"></div>
      <p style="font-size:11px;color:var(--fg-muted);margin-top:6px;">Optional. Accepts documents, spreadsheets, and images.</p>
    </div>
  `;

  footerEl.innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="disputesCloseAction()">Cancel</button>
    <button class="btn btn-danger btn-sm" onclick="disputesSubmitQADecisionRejected()">Save</button>
  `;

  overlay.style.display = 'flex';
}

function disputeHandleFileSelect(input) {
  const files = Array.from(input.files || []);
  _disputeAttachedFiles = [..._disputeAttachedFiles, ...files];
  const listEl = document.getElementById('dispute-file-list');
  if (listEl) {
    listEl.innerHTML = _disputeAttachedFiles.map((f, i) =>
      `<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--fg);margin-bottom:2px;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        ${escapeHtml(f.name)}
        <span style="cursor:pointer;color:var(--error);" onclick="disputeRemoveFile(${i})">&times;</span>
      </div>`
    ).join('');
  }
}

async function disputesSubmitQADecisionRejected() {
  const remarks = (document.getElementById('dispute-remarks-input')?.value || '').trim();
  if (!remarks) {
    showToast('Remarks are required', 'error');
    return;
  }

  const log = COMPASS.logs.find(l => String(l.coaching_id || l.id) === String(_disputesEditingId));
  if (!log) return;

  // Upload attachments if any
  let attachmentUrls = [];
  for (const file of _disputeAttachedFiles) {
    try {
      const base64 = await fileToBase64(file);
      const resp = await fetch(`${IO_API_BASE}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, data: base64 })
      });
      if (resp.ok) {
        const result = await resp.json();
        attachmentUrls.push({ name: file.name, url: result.url });
      }
    } catch (e) {
      console.error('Failed to upload attachment:', e);
    }
  }

  const timestamp = new Date().toLocaleString();
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  const actorName = cu ? cu.full_name : 'Unknown';

  const update = {
    status: 'QA Decision Rejected',
    sme_qa_dispute_comments: (log.sme_qa_dispute_comments || '') + '\n[' + timestamp + ' — ' + actorName + '] ' + remarks
  };

  if (attachmentUrls.length > 0) {
    update.sme_qa_dispute_comments += '\n[Attachments: ' + attachmentUrls.map(a => a.name).join(', ') + ']';
    const existingAttachments = log.dispute_attachments ? JSON.parse(log.dispute_attachments || '[]') : [];
    update.dispute_attachments = JSON.stringify([...existingAttachments, ...attachmentUrls]);
  }

  try {
    const url = `${IO_API_BASE}/coaching/${log.coaching_id || log.id}`;
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update)
    });
    if (!resp.ok) throw new Error('Failed to update');

    showToast('QA decision rejected. Card moved to LV4 — Pending Trainer Decision.', 'success');
    disputesCloseAction();
    disputesCloseDetail();
    await compassFetchLogs();
    compassRenderKanban();
  } catch (e) {
    showToast('Failed to reject QA decision: ' + e.message, 'error');
  }
}


// ===== LV5: SME-Trainer Decision — Accept Decision (confirmation → Trainer Decision Accepted) =====

function disputesShowLV5AcceptDecision() {
  const titleEl = document.getElementById('disputes-action-title');
  const bodyEl = document.getElementById('disputes-action-body');
  const footerEl = document.getElementById('disputes-action-footer');
  const overlay = document.getElementById('disputes-action-overlay');

  titleEl.textContent = 'Accept Decision';
  bodyEl.innerHTML = `
    <div style="text-align:center;padding:24px 0 8px;">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:16px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      <p style="font-size:15px;color:var(--fg);margin-bottom:6px;font-weight:600;">Are you sure you want to accept the decision?</p>
      <p style="font-size:13px;color:var(--fg-muted);">This log will now be sent to the coachee for acknowledgement.</p>
    </div>
  `;

  footerEl.innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="disputesCloseAction()">Cancel</button>
    <button class="btn btn-success btn-sm" onclick="disputesSubmitLV5AcceptDecision()">Save</button>
  `;

  overlay.style.display = 'flex';
}

async function disputesSubmitLV5AcceptDecision() {
  const log = COMPASS.logs.find(l => String(l.coaching_id || l.id) === String(_disputesEditingId));
  if (!log) return;

  const timestamp = new Date().toLocaleString();
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  const actorName = cu ? cu.full_name : 'Unknown';

  const update = {
    status: 'Trainer Decision Accepted',
    sme_qa_dispute_comments: (log.sme_qa_dispute_comments || '') + '\n[' + timestamp + ' — ' + actorName + '] Trainer decision accepted by SME.'
  };

  try {
    const url = `${IO_API_BASE}/coaching/${log.coaching_id || log.id}`;
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update)
    });
    if (!resp.ok) throw new Error('Failed to update');

    showToast('Trainer decision accepted.', 'success');
    disputesCloseAction();
    disputesCloseDetail();
    await compassFetchLogs();
    compassRenderKanban();
  } catch (e) {
    showToast('Failed to retain markdown: ' + e.message, 'error');
  }
}

// ===== LV5: SME-Trainer Decision — Reject Decision (popout with Remarks + Attachments → LV6) =====

function disputesShowLV5RejectDecision() {
  const titleEl = document.getElementById('disputes-action-title');
  const bodyEl = document.getElementById('disputes-action-body');
  const footerEl = document.getElementById('disputes-action-footer');
  const overlay = document.getElementById('disputes-action-overlay');

  _disputeAttachedFiles = [];

  titleEl.textContent = 'Reject Decision';
  bodyEl.innerHTML = `
    <div style="padding:8px 0;">
      <label style="font-size:13px;font-weight:600;color:var(--primary);display:block;margin-bottom:6px;">Remarks <span style="color:var(--error);">*</span></label>
      <textarea id="dispute-remarks-input" rows="5" style="width:100%;background:var(--surface);color:var(--fg);border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:13px;resize:vertical;font-family:inherit;" placeholder="Enter your remarks for rejecting the decision..."></textarea>
    </div>
    <div style="margin-top:12px;">
      <label style="font-size:13px;font-weight:600;color:var(--primary);display:block;margin-bottom:6px;">Attachments</label>
      <div style="display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:13px;color:var(--primary);" onclick="document.getElementById('dispute-file-input').click()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
        Attach Files
      </div>
      <input type="file" id="dispute-file-input" multiple style="display:none;" onchange="disputeHandleFileSelect(this)" />
      <div id="dispute-file-list" style="margin-top:8px;"></div>
      <p style="font-size:11px;color:var(--fg-muted);margin-top:6px;">Optional. Accepts documents, spreadsheets, and images.</p>
    </div>
  `;

  footerEl.innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="disputesCloseAction()">Cancel</button>
    <button class="btn btn-danger btn-sm" onclick="disputesSubmitLV5RejectDecision()">Save</button>
  `;

  overlay.style.display = 'flex';
}

async function disputesSubmitLV5RejectDecision() {
  const remarks = (document.getElementById('dispute-remarks-input')?.value || '').trim();
  if (!remarks) {
    showToast('Remarks are required', 'error');
    return;
  }

  const log = COMPASS.logs.find(l => String(l.coaching_id || l.id) === String(_disputesEditingId));
  if (!log) return;

  // Upload attachments if any
  let attachmentUrls = [];
  for (const file of _disputeAttachedFiles) {
    try {
      const base64 = await fileToBase64(file);
      const resp = await fetch(`${IO_API_BASE}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, data: base64 })
      });
      if (resp.ok) {
        const result = await resp.json();
        attachmentUrls.push({ name: file.name, url: result.url });
      }
    } catch (e) {
      console.error('Failed to upload attachment:', e);
    }
  }

  const timestamp = new Date().toLocaleString();
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  const actorName = cu ? cu.full_name : 'Unknown';

  const update = {
    status: 'Trainer Decision Rejected',
    sme_qa_dispute_comments: (log.sme_qa_dispute_comments || '') + '\n[' + timestamp + ' — ' + actorName + '] ' + remarks
  };

  if (attachmentUrls.length > 0) {
    update.sme_qa_dispute_comments += '\n[Attachments: ' + attachmentUrls.map(a => a.name).join(', ') + ']';
    const existingAttachments = log.dispute_attachments ? JSON.parse(log.dispute_attachments || '[]') : [];
    update.dispute_attachments = JSON.stringify([...existingAttachments, ...attachmentUrls]);
  }

  try {
    const url = `${IO_API_BASE}/coaching/${log.coaching_id || log.id}`;
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update)
    });
    if (!resp.ok) throw new Error('Failed to update');

    showToast('Trainer decision rejected. Card moved to LV6 — Pending QTP Manager Decision.', 'success');
    disputesCloseAction();
    disputesCloseDetail();
    await compassFetchLogs();
    compassRenderKanban();
  } catch (e) {
    showToast('Failed to reverse markdown: ' + e.message, 'error');
  }
}


// ===== LV4: Trainer Decision — Retain Markdown (popout with Remarks + Attachments) =====

function disputesShowLV4RetainMarkdown() {
  const titleEl = document.getElementById('disputes-action-title');
  const bodyEl = document.getElementById('disputes-action-body');
  const footerEl = document.getElementById('disputes-action-footer');
  const overlay = document.getElementById('disputes-action-overlay');

  _disputeAttachedFiles = [];

  titleEl.textContent = 'Retain Markdown';
  bodyEl.innerHTML = `
    <div style="padding:8px 0;">
      <label style="font-size:13px;font-weight:600;color:var(--primary);display:block;margin-bottom:6px;">Remarks <span style="color:var(--error);">*</span></label>
      <textarea id="dispute-lv4-retain-remarks" rows="5" style="width:100%;background:var(--surface);color:var(--fg);border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:13px;resize:vertical;font-family:inherit;" placeholder="Enter your remarks for retaining this markdown..."></textarea>
    </div>
    <div style="margin-top:12px;">
      <label style="font-size:13px;font-weight:600;color:var(--primary);display:block;margin-bottom:6px;">Attachments</label>
      <input type="file" id="dispute-lv4-retain-files" multiple style="display:none;" onchange="disputeLV4RetainFilesChanged(this)">
      <div style="display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:13px;color:var(--primary);" onclick="document.getElementById('dispute-lv4-retain-files').click()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
        Attach Files
      </div>
      <div id="dispute-lv4-retain-file-list" style="margin-top:8px;"></div>
      <p style="font-size:11px;color:var(--fg-muted);margin-top:6px;">Optional. Accepts documents, spreadsheets, and images.</p>
    </div>
  `;

  footerEl.innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="disputesCloseAction()">Cancel</button>
    <button class="btn btn-primary btn-sm" onclick="disputesSubmitLV4RetainMarkdown()">Save</button>
  `;

  overlay.style.display = 'flex';
}

function disputeLV4RetainFilesChanged(input) {
  _disputeAttachedFiles = Array.from(input.files || []);
  const listEl = document.getElementById('dispute-lv4-retain-file-list');
  if (listEl) {
    listEl.textContent = _disputeAttachedFiles.map(f => f.name).join(', ') || '';
  }
}

async function disputesSubmitLV4RetainMarkdown() {
  const remarks = (document.getElementById('dispute-lv4-retain-remarks')?.value || '').trim();
  if (!remarks) {
    showToast('Remarks are required', 'error');
    return;
  }

  const log = COMPASS.logs.find(l => String(l.coaching_id || l.id) === String(_disputesEditingId));
  if (!log) return;

  // Upload attachments if any
  let attachmentUrls = [];
  for (const file of _disputeAttachedFiles) {
    try {
      const base64 = await fileToBase64(file);
      const resp = await fetch(`${IO_API_BASE}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, data: base64 })
      });
      if (resp.ok) {
        const result = await resp.json();
        attachmentUrls.push({ name: file.name, url: result.url });
      }
    } catch (e) {
      console.error('Failed to upload attachment:', e);
    }
  }

  const timestamp = new Date().toLocaleString();
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  const actorName = cu ? cu.full_name : 'Unknown';

  const update = {
    status: 'Markdown Retained - Trainer',
    trainer_comments: (log.trainer_comments || '') + '\n[' + timestamp + ' — ' + actorName + '] ' + remarks
  };

  if (attachmentUrls.length > 0) {
    update.trainer_comments += '\n[Attachments: ' + attachmentUrls.map(a => a.name).join(', ') + ']';
    const existingAttachments = log.dispute_attachments ? JSON.parse(log.dispute_attachments || '[]') : [];
    update.dispute_attachments = JSON.stringify([...existingAttachments, ...attachmentUrls]);
  }

  try {
    const url = `${IO_API_BASE}/coaching/${log.coaching_id || log.id}`;
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update)
    });
    if (!resp.ok) throw new Error('Failed to update');

    showToast('Markdown retained by Trainer. Card moved to LV5.', 'success');
    disputesCloseAction();
    disputesCloseDetail();
    await compassFetchLogs();
    compassRenderKanban();
  } catch (e) {
    showToast('Failed to retain markdown: ' + e.message, 'error');
  }
}

// ===== LV4: Trainer Decision — Reverse Markdown (popout confirmation → Coachee acknowledgement) =====

function disputesShowLV4ReverseMarkdown() {
  const titleEl = document.getElementById('disputes-action-title');
  const bodyEl = document.getElementById('disputes-action-body');
  const footerEl = document.getElementById('disputes-action-footer');
  const overlay = document.getElementById('disputes-action-overlay');

  titleEl.textContent = 'Reverse Markdown';
  bodyEl.innerHTML = `
    <div style="text-align:center;padding:24px 0 8px;">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:16px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <p style="font-size:15px;color:var(--fg);margin-bottom:6px;font-weight:600;">Are you sure you want to reverse this markdown?</p>
      <p style="font-size:13px;color:var(--fg-muted);">This log will now be sent to the coachee for acknowledgement.</p>
    </div>
  `;

  footerEl.innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="disputesCloseAction()">Cancel</button>
    <button class="btn btn-success btn-sm" onclick="disputesSubmitLV4ReverseMarkdown()">Save</button>
  `;

  overlay.style.display = 'flex';
}

async function disputesSubmitLV4ReverseMarkdown() {
  const log = COMPASS.logs.find(l => String(l.coaching_id || l.id) === String(_disputesEditingId));
  if (!log) return;

  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  const actorName = cu ? cu.full_name : 'Unknown';
  const timestamp = new Date().toLocaleString();

  const update = {
    status: 'Markdown Reversed - Trainer',
    trainer_comments: (log.trainer_comments || '') + '\n[' + timestamp + ' — ' + actorName + '] Markdown reversed by Trainer.'
  };

  try {
    const url = `${IO_API_BASE}/coaching/${log.coaching_id || log.id}`;
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update)
    });
    if (!resp.ok) throw new Error('Failed to update');

    showToast('Markdown reversed by Trainer.', 'success');
    disputesCloseAction();
    disputesCloseDetail();
    await compassFetchLogs();
    compassRenderKanban();
  } catch (e) {
    showToast('Failed to reverse markdown: ' + e.message, 'error');
  }
}

// ===== LV6: QTP Manager Decision — Reverse Markdown (confirmation → Markdown Reversed - QTP Manager) =====

function disputesShowLV6ReverseMarkdown() {
  const titleEl = document.getElementById('disputes-action-title');
  const bodyEl = document.getElementById('disputes-action-body');
  const footerEl = document.getElementById('disputes-action-footer');
  const overlay = document.getElementById('disputes-action-overlay');

  _disputeAttachedFiles = [];

  titleEl.textContent = 'Reverse Markdown';
  bodyEl.innerHTML = `
    <div style="padding:8px 0;">
      <label style="font-size:13px;font-weight:600;color:var(--primary);display:block;margin-bottom:6px;">Remarks <span style="color:var(--error);">*</span></label>
      <textarea id="dispute-remarks-input" rows="5" style="width:100%;background:var(--surface);color:var(--fg);border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:13px;resize:vertical;font-family:inherit;" placeholder="Enter your remarks for reversing this markdown..."></textarea>
    </div>
    <div style="margin-top:12px;">
      <label style="font-size:13px;font-weight:600;color:var(--primary);display:block;margin-bottom:6px;">Attachments</label>
      <input type="file" id="dispute-file-input" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.gif,.bmp,.webp" style="display:none" onchange="disputeHandleFileSelect(this)">
      <div style="display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:13px;color:var(--primary);" onclick="document.getElementById('dispute-file-input').click()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
        Attach Files
      </div>
      <div id="dispute-file-list" style="margin-top:8px;"></div>
      <p style="font-size:11px;color:var(--fg-muted);margin-top:6px;">Optional. Accepts documents, spreadsheets, and images.</p>
    </div>
    <div style="margin-top:12px;padding:10px 14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:12px;color:#1e40af;">This log will be sent back to the coachee for acknowledgement after this decision.</div>
  `;

  footerEl.innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="disputesCloseAction()">Cancel</button>
    <button class="btn btn-primary btn-sm" onclick="disputesSubmitLV6ReverseMarkdown()">Save</button>
  `;

  overlay.style.display = 'flex';
}

async function disputesSubmitLV6ReverseMarkdown() {
  const remarks = (document.getElementById('dispute-remarks-input')?.value || '').trim();
  if (!remarks) {
    showToast('Remarks are required', 'error');
    return;
  }

  const log = COMPASS.logs.find(l => String(l.coaching_id || l.id) === String(_disputesEditingId));
  if (!log) return;

  let attachmentUrls = [];
  for (const file of _disputeAttachedFiles) {
    try {
      const base64 = await fileToBase64(file);
      const resp = await fetch(`${IO_API_BASE}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, data: base64 })
      });
      if (resp.ok) {
        const result = await resp.json();
        attachmentUrls.push({ name: file.name, url: result.url });
      }
    } catch (e) {
      console.error('Failed to upload attachment:', e);
    }
  }

  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  const actorName = cu ? cu.full_name : 'Unknown';
  const timestamp = new Date().toLocaleString();

  const update = {
    status: 'Pending Acknowledgement',
    qtp_manager_comments: (log.qtp_manager_comments || '') + '\n[' + timestamp + ' — ' + actorName + '] Markdown reversed by QTP Manager. ' + remarks
  };

  if (attachmentUrls.length > 0) {
    update.qtp_manager_comments += '\n[Attachments: ' + attachmentUrls.map(a => a.name).join(', ') + ']';
    const existingAttachments = log.dispute_attachments ? JSON.parse(log.dispute_attachments || '[]') : [];
    update.dispute_attachments = JSON.stringify([...existingAttachments, ...attachmentUrls]);
  }

  try {
    const url = `${IO_API_BASE}/coaching/${log.coaching_id || log.id}`;
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update)
    });
    if (!resp.ok) throw new Error('Failed to update');

    showToast('Markdown reversed by QTP Manager. Sent to coachee for acknowledgement.', 'success');
    disputesCloseAction();
    disputesCloseDetail();
    await compassFetchLogs();
    compassRenderKanban();
  } catch (e) {
    showToast('Failed to reverse markdown: ' + e.message, 'error');
  }
}

// ===== LV6: QTP Manager Decision — Retain Markdown (popout with Remarks + Attachments → Markdown Retained - QTP Manager) =====

function disputesShowLV6RetainMarkdown() {
  const titleEl = document.getElementById('disputes-action-title');
  const bodyEl = document.getElementById('disputes-action-body');
  const footerEl = document.getElementById('disputes-action-footer');
  const overlay = document.getElementById('disputes-action-overlay');

  _disputeAttachedFiles = [];

  titleEl.textContent = 'Retain Markdown';
  bodyEl.innerHTML = `
    <div style="padding:8px 0;">
      <label style="font-size:13px;font-weight:600;color:var(--primary);display:block;margin-bottom:6px;">Remarks <span style="color:var(--error);">*</span></label>
      <textarea id="dispute-remarks-input" rows="5" style="width:100%;background:var(--surface);color:var(--fg);border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:13px;resize:vertical;font-family:inherit;" placeholder="Enter your remarks for retaining this markdown..."></textarea>
    </div>
    <div style="margin-top:12px;">
      <label style="font-size:13px;font-weight:600;color:var(--primary);display:block;margin-bottom:6px;">Attachments</label>
      <input type="file" id="dispute-file-input" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.gif,.bmp,.webp" style="display:none" onchange="disputeHandleFileSelect(this)">
      <div style="display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:13px;color:var(--primary);" onclick="document.getElementById('dispute-file-input').click()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
        Attach Files
      </div>
      <div id="dispute-file-list" style="margin-top:8px;"></div>
      <p style="font-size:11px;color:var(--fg-muted);margin-top:6px;">Optional. Accepts documents, spreadsheets, and images.</p>
    </div>
    <div style="margin-top:12px;padding:10px 14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:12px;color:#1e40af;">This log will be sent back to the coachee for acknowledgement after this decision.</div>
  `;

  footerEl.innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="disputesCloseAction()">Cancel</button>
    <button class="btn btn-primary btn-sm" onclick="disputesSubmitLV6RetainMarkdown()">Save</button>
  `;

  overlay.style.display = 'flex';
}

async function disputesSubmitLV6RetainMarkdown() {
  const remarks = (document.getElementById('dispute-remarks-input')?.value || '').trim();
  if (!remarks) {
    showToast('Remarks are required', 'error');
    return;
  }

  const log = COMPASS.logs.find(l => String(l.coaching_id || l.id) === String(_disputesEditingId));
  if (!log) return;

  let attachmentUrls = [];
  for (const file of _disputeAttachedFiles) {
    try {
      const base64 = await fileToBase64(file);
      const resp = await fetch(`${IO_API_BASE}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, data: base64 })
      });
      if (resp.ok) {
        const result = await resp.json();
        attachmentUrls.push({ name: file.name, url: result.url });
      }
    } catch (e) {
      console.error('Failed to upload attachment:', e);
    }
  }

  const timestamp = new Date().toLocaleString();
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  const actorName = cu ? cu.full_name : 'Unknown';

  const update = {
    status: 'Pending Acknowledgement',
    qtp_manager_comments: (log.qtp_manager_comments || '') + '\n[' + timestamp + ' \u2014 ' + actorName + '] Markdown retained by QTP Manager. ' + remarks
  };

  if (attachmentUrls.length > 0) {
    update.qtp_manager_comments += '\n[Attachments: ' + attachmentUrls.map(a => a.name).join(', ') + ']';
    const existingAttachments = log.dispute_attachments ? JSON.parse(log.dispute_attachments || '[]') : [];
    update.dispute_attachments = JSON.stringify([...existingAttachments, ...attachmentUrls]);
  }

  try {
    const url = `${IO_API_BASE}/coaching/${log.coaching_id || log.id}`;
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update)
    });
    if (!resp.ok) throw new Error('Failed to update');

    showToast('Markdown retained by QTP Manager. Sent to coachee for acknowledgement.', 'success');
    disputesCloseAction();
    disputesCloseDetail();
    await compassFetchLogs();
    compassRenderKanban();
  } catch (e) {
    showToast('Failed to retain markdown: ' + e.message, 'error');
  }
}


// ===== Notice to Explain (NTE) Form =====

// Global variable to hold the deferred coaching record when CAP 1-3 is selected
let COMPASS_PENDING_COACHING_RECORD = null;

async function compassOpenNteForm(params) {
  // params: { coaching_id, employee_name, ohr_id, cap_level, coach_name, coach_ohr, pendingCoachingRecord? }
  COMPASS_PENDING_COACHING_RECORD = params.pendingCoachingRecord || null;
  const overlay = document.getElementById('compass-form-overlay');
  const formTitle = document.getElementById('compass-form-title');
  const formBody = document.getElementById('compass-form-body');
  const formFooter = document.getElementById('compass-form-footer');

  formTitle.textContent = `Notice to Explain — ${params.cap_level}`;

  // Show overlay immediately with loading state
  formBody.innerHTML = '<div style="text-align:center; padding:40px; color:var(--fg-muted);">Loading NTE form...</div>';
  formFooter.innerHTML = '';
  overlay.style.display = 'flex';

  // Fetch previous warnings for this employee
  let existingNtes = [];
  try {
    const r = await fetch(`${IO_API_BASE}/coaching-nte?ohr_id=${encodeURIComponent(params.ohr_id)}`);
    existingNtes = r.ok ? await r.json() : [];
  } catch (e) {
    existingNtes = [];
  }

  const prevWarningsHtml = existingNtes.length > 0
      ? existingNtes.map(n => `<div style="padding:8px 10px; background:var(--bg-inset); border:1px solid var(--border); border-radius:var(--radius); margin-bottom:6px; font-size:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong style="color:var(--fg);">${escapeHtml(n.cap_level)}</strong>
            <span style="color:var(--fg-muted);">${n.created_at ? new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</span>
          </div>
          <div style="color:var(--fg-muted); margin-top:4px;">${escapeHtml(n.incident_description || '').substring(0, 120)}${(n.incident_description || '').length > 120 ? '...' : ''}</div>
        </div>`).join('')
      : '<div style="color:var(--fg-muted); font-size:12px; font-style:italic;">No previous warnings on record.</div>';

    formBody.innerHTML = `
      <div class="form-section">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div class="form-field">
            <label class="form-label">Employee Name</label>
            <input type="text" class="form-input" id="nte-employee-name" value="${escapeAttr(params.employee_name)}" readonly style="background:var(--bg-inset); color:var(--fg-muted);">
          </div>
          <div class="form-field">
            <label class="form-label">OHR ID</label>
            <input type="text" class="form-input" id="nte-ohr-id" value="${escapeAttr(params.ohr_id)}" readonly style="background:var(--bg-inset); color:var(--fg-muted);">
          </div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:12px;">
          <div class="form-field">
            <label class="form-label">CAP Level</label>
            <input type="text" class="form-input" id="nte-cap-level" value="${escapeAttr(params.cap_level)}" readonly style="background:var(--bg-inset); color:var(--fg-muted);">
          </div>
          <div class="form-field">
            <label class="form-label">Date of Incident <span class="required">*</span></label>
            <input type="date" class="form-input" id="nte-date-of-incident" value="${new Date().toISOString().split('T')[0]}">
          </div>
        </div>
      </div>

      <div class="form-section">
        <div class="form-field">
          <label class="form-label">Incident Description <span class="required">*</span></label>
          <div class="rte-container">
            <div class="rte-toolbar">
              <button type="button" class="rte-btn" onclick="compassRteExec('bold', 'nte-incident-desc')" title="Bold"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg></button>
              <button type="button" class="rte-btn" onclick="compassRteExec('italic', 'nte-incident-desc')" title="Italic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg></button>
              <span class="rte-sep"></span>
              <button type="button" class="rte-btn" onclick="compassRteExec('insertUnorderedList', 'nte-incident-desc')" title="Bullet List"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none"/></svg></button>
            </div>
            <div class="rte-editor" id="nte-incident-desc" contenteditable="true" data-placeholder="Describe the incident in detail..."></div>
          </div>
        </div>
      </div>

      <div class="form-section">
        <div class="form-field">
          <label class="form-label">Policy / Standard Violated <span class="required">*</span></label>
          <div class="rte-container">
            <div class="rte-toolbar">
              <button type="button" class="rte-btn" onclick="compassRteExec('bold', 'nte-policy-violated')" title="Bold"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg></button>
              <button type="button" class="rte-btn" onclick="compassRteExec('italic', 'nte-policy-violated')" title="Italic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg></button>
            </div>
            <div class="rte-editor" id="nte-policy-violated" contenteditable="true" data-placeholder="Specify the policy, standard, or rule that was violated..."></div>
          </div>
        </div>
      </div>

      <div class="form-section">
        <div class="form-field">
          <label class="form-label">Previous Warnings</label>
          <div id="nte-previous-warnings" style="max-height:200px; overflow-y:auto;">
            ${prevWarningsHtml}
          </div>
        </div>
      </div>

      <div class="form-section">
        <div class="form-field">
          <label class="form-label">Expected Behavior / Corrective Action <span class="required">*</span></label>
          <div class="rte-container">
            <div class="rte-toolbar">
              <button type="button" class="rte-btn" onclick="compassRteExec('bold', 'nte-expected-behavior')" title="Bold"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg></button>
              <button type="button" class="rte-btn" onclick="compassRteExec('italic', 'nte-expected-behavior')" title="Italic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg></button>
              <span class="rte-sep"></span>
              <button type="button" class="rte-btn" onclick="compassRteExec('insertUnorderedList', 'nte-expected-behavior')" title="Bullet List"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none"/></svg></button>
            </div>
            <div class="rte-editor" id="nte-expected-behavior" contenteditable="true" data-placeholder="Describe the expected behavior and corrective actions..."></div>
          </div>
        </div>
      </div>

      <div class="form-section">
        <div class="form-field">
          <label class="form-label">Deadline for Improvement</label>
          <input type="date" class="form-input" id="nte-deadline" value="">
        </div>
      </div>

      <input type="hidden" id="nte-coaching-id" value="${escapeAttr(params.coaching_id)}">
      <input type="hidden" id="nte-issued-by" value="${escapeAttr(params.coach_name)}">
      <input type="hidden" id="nte-issued-by-ohr" value="${escapeAttr(params.coach_ohr)}">
    `;

    formFooter.innerHTML = `
      <button class="btn btn-outline btn-sm" onclick="COMPASS_PENDING_COACHING_RECORD = null; compassCloseForm();">Cancel</button>
      <button class="btn btn-primary btn-sm" onclick="compassSubmitNte()">Save NTE</button>
    `;

    overlay.style.display = 'flex';
}

async function compassSubmitNte() {
  const employeeName = document.getElementById('nte-employee-name')?.value;
  const ohrId = document.getElementById('nte-ohr-id')?.value;
  const capLevel = document.getElementById('nte-cap-level')?.value;
  const dateOfIncident = document.getElementById('nte-date-of-incident')?.value;
  const incidentDesc = document.getElementById('nte-incident-desc')?.innerHTML?.trim() || '';
  const policyViolated = document.getElementById('nte-policy-violated')?.innerHTML?.trim() || '';
  const expectedBehavior = document.getElementById('nte-expected-behavior')?.innerHTML?.trim() || '';
  const deadline = document.getElementById('nte-deadline')?.value || '';
  const issuedBy = document.getElementById('nte-issued-by')?.value || '';
  const issuedByOhr = document.getElementById('nte-issued-by-ohr')?.value || '';

  // Validation
  if (!dateOfIncident) { showToast('Please enter the date of incident', 'error'); return; }
  if (!incidentDesc || incidentDesc === '<br>') { showToast('Please describe the incident', 'error'); return; }
  if (!policyViolated || policyViolated === '<br>') { showToast('Please specify the policy violated', 'error'); return; }
  if (!expectedBehavior || expectedBehavior === '<br>') { showToast('Please describe the expected behavior', 'error'); return; }

  let coachingId = document.getElementById('nte-coaching-id')?.value;

  try {
    // If there's a pending coaching record (CAP 1-3 flow), create it first
    if (COMPASS_PENDING_COACHING_RECORD) {
      const coachResp = await fetch(`${IO_API_BASE}/coaching`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(COMPASS_PENDING_COACHING_RECORD)
      });
      if (!coachResp.ok) throw new Error('Failed to create coaching log');
      const created = await coachResp.json();
      coachingId = created?.coaching_id || (Array.isArray(created) ? created[0]?.coaching_id : null) || created?.id;
      COMPASS_PENDING_COACHING_RECORD = null;
    }

    const nteRecord = {
      coaching_id: coachingId,
      employee_name: employeeName,
      ohr_id: ohrId,
      cap_level: capLevel,
      date_of_incident: dateOfIncident,
      incident_description: incidentDesc,
      policy_violated: policyViolated,
      expected_behavior: expectedBehavior,
      deadline_for_improvement: deadline,
      issued_by: issuedBy,
      issued_by_ohr: issuedByOhr
    };

    const resp = await fetch(`${IO_API_BASE}/coaching-nte`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nteRecord)
    });
    if (!resp.ok) throw new Error('Failed to save NTE');

    showToast('Coaching log and NTE saved successfully', 'success');
    compassCloseForm();
    await compassFetchLogs();
  } catch (e) {
    console.error('Failed to save NTE:', e);
    showToast('Failed to save: ' + e.message, 'error');
  }
}

// Open NTE form from an existing coaching log detail view
async function compassViewNte(coachingId) {
  try {
    const resp = await fetch(`${IO_API_BASE}/coaching-nte?coaching_id=${encodeURIComponent(coachingId)}`);
    if (!resp.ok) throw new Error('Failed to fetch NTE');
    const ntes = await resp.json();
    if (!ntes || ntes.length === 0) {
      showToast('No NTE found for this coaching log', 'info');
      return;
    }
    const nte = ntes[0];
    compassOpenNteDetail(nte);
  } catch (e) {
    showToast('Failed to load NTE: ' + e.message, 'error');
  }
}

function compassOpenNteDetail(nte) {
  const overlay = document.getElementById('compass-form-overlay');
  const formTitle = document.getElementById('compass-form-title');
  const formBody = document.getElementById('compass-form-body');
  const formFooter = document.getElementById('compass-form-footer');

  formTitle.textContent = `Notice to Explain — ${nte.cap_level}`;

  const formatDate = (d) => {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return d; }
  };

  formBody.innerHTML = `
    <div class="form-section">
      <div class="detail-row"><span class="detail-label">EMPLOYEE</span><span class="detail-value">${escapeHtml(nte.employee_name)} (${escapeHtml(nte.ohr_id)})</span></div>
      <div class="detail-row"><span class="detail-label">CAP LEVEL</span><span class="detail-value"><span style="display:inline-block; padding:2px 10px; border-radius:12px; font-size:11px; font-weight:600; background:${nte.cap_level === 'CAP 3' ? '#EF444420' : nte.cap_level === 'CAP 2' ? '#F59E0B20' : '#3B82F620'}; color:${nte.cap_level === 'CAP 3' ? '#EF4444' : nte.cap_level === 'CAP 2' ? '#F59E0B' : '#3B82F6'};">${escapeHtml(nte.cap_level)}</span></span></div>
      <div class="detail-row"><span class="detail-label">DATE OF INCIDENT</span><span class="detail-value">${formatDate(nte.date_of_incident)}</span></div>
    </div>

    <div class="form-section">
      <h4 class="form-section-title" style="font-size:13px; text-transform:uppercase; letter-spacing:0.05em; color:var(--fg-muted); margin-bottom:8px;">Incident Description</h4>
      <div style="padding:10px 14px; background:var(--bg-inset); border:1px solid var(--border); border-radius:var(--radius); font-size:13px; line-height:1.6; color:var(--fg);">${nte.incident_description || '<em style="color:var(--fg-muted);">Not provided</em>'}</div>
    </div>

    <div class="form-section">
      <h4 class="form-section-title" style="font-size:13px; text-transform:uppercase; letter-spacing:0.05em; color:var(--fg-muted); margin-bottom:8px;">Policy / Standard Violated</h4>
      <div style="padding:10px 14px; background:var(--bg-inset); border:1px solid var(--border); border-radius:var(--radius); font-size:13px; line-height:1.6; color:var(--fg);">${nte.policy_violated || '<em style="color:var(--fg-muted);">Not provided</em>'}</div>
    </div>

    <div class="form-section">
      <h4 class="form-section-title" style="font-size:13px; text-transform:uppercase; letter-spacing:0.05em; color:var(--fg-muted); margin-bottom:8px;">Expected Behavior / Corrective Action</h4>
      <div style="padding:10px 14px; background:var(--bg-inset); border:1px solid var(--border); border-radius:var(--radius); font-size:13px; line-height:1.6; color:var(--fg);">${nte.expected_behavior || '<em style="color:var(--fg-muted);">Not provided</em>'}</div>
    </div>

    <div class="form-section">
      <div class="detail-row"><span class="detail-label">DEADLINE</span><span class="detail-value">${formatDate(nte.deadline_for_improvement)}</span></div>
      <div class="detail-row"><span class="detail-label">ISSUED BY</span><span class="detail-value">${escapeHtml(nte.issued_by || '')} ${nte.issued_by_ohr ? '(' + escapeHtml(nte.issued_by_ohr) + ')' : ''}</span></div>
      <div class="detail-row"><span class="detail-label">CREATED</span><span class="detail-value">${formatDate(nte.created_at)}</span></div>
    </div>
  `;

  formFooter.innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="compassCloseForm()">Close</button>
  `;

  overlay.style.display = 'flex';
}
