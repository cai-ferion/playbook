/**
 * Compass — Coaching Log Tracker (3 Sub-pages)
 * Sub-page 1: Input Portal — create & browse coaching logs
 * Sub-page 2: Disputes Area — Kanban board for QA Feedback dispute workflow
 * Sub-page 3: Analytics — coaching metrics and trends
 */

// ===== Performance: Debounce utility =====
function _compassDebounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ===== Performance: Virtual dropdown rendering =====
// Instead of rendering all 400+ employees as DOM nodes upfront,
// render only visible (filtered) items on demand.
function _compassRenderDropdownItems(containerId, employees, filterText, onClickFn, roleFilter) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const query = (filterText || '').toLowerCase().trim();
  let filtered = employees;
  if (query) {
    filtered = filtered.filter(e => e.full_name.toLowerCase().includes(query) || e.ohr_id.includes(query));
  }
  if (roleFilter) {
    filtered = filtered.filter(e => roleFilter.includes(e.actual_role));
  }
  // Cap at 50 visible items for performance
  const capped = filtered.slice(0, 50);
  const moreCount = filtered.length - capped.length;
  container.innerHTML = capped.map(e =>
    `<div class="searchable-select-option" data-value="${escapeAttr(e.ohr_id)}" onclick="${onClickFn}('${escapeAttr(e.ohr_id)}','${escapeAttr(e.full_name)}')">${escapeHtml(e.full_name)}</div>`
  ).join('') + (moreCount > 0 ? `<div style="padding:6px 10px;font-size:11px;color:var(--fg-subtle);text-align:center;">+${moreCount} more — type to narrow</div>` : '');
}

function _compassRenderMultiDropdownItems(containerId, employees, filterText) {
  const container = document.getElementById(containerId);
  if (!container) return;
  // Preserve existing checked state
  const checkedOhrs = new Set();
  container.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => checkedOhrs.add(cb.value));
  const query = (filterText || '').toLowerCase().trim();
  let filtered = employees;
  if (query) {
    filtered = filtered.filter(e => e.full_name.toLowerCase().includes(query) || e.ohr_id.includes(query));
  }
  const capped = filtered.slice(0, 50);
  const moreCount = filtered.length - capped.length;
  container.innerHTML = capped.map(e => {
    const checked = checkedOhrs.has(e.ohr_id) ? 'checked' : '';
    return `<label class="multi-coachee-option" data-name="${escapeAttr(e.full_name.toLowerCase())}" data-ohr="${escapeAttr(e.ohr_id)}">
      <input type="checkbox" value="${escapeAttr(e.ohr_id)}" ${checked} onchange="compassUpdateMultiCoacheeDisplay()">
      <span>${escapeHtml(e.full_name)}</span>
    </label>`;
  }).join('') + (moreCount > 0 ? `<div style="padding:6px 10px;font-size:11px;color:var(--fg-subtle);text-align:center;">+${moreCount} more — type to narrow</div>` : '');
}

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
  _expandedRowId: null,  // Currently expanded inline detail row
  givenTab: 'all',  // 'all', 'acknowledged', 'unacknowledged'
  receivedTab: 'all',  // 'all', 'acknowledged', 'unacknowledged'
  pageGiven: 1,
  pageReceived: 1,

  COACHING_TYPES: ['General Coaching', 'Incident Report', 'Follow-Up Session', 'Group Coaching', 'Triad Coaching', 'QA Feedback', 'ZTP Coaching'],

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
  // Awareness-only types: no acknowledgement workflow, status goes straight to 'Issued'
  AWARENESS_ONLY_TYPES: ['ZTP Coaching', 'Incident Report'],

  STATUS_COLORS: {
    'Pending Acknowledgement': '#F59E0B',
    'Acknowledged': '#22C55E',
    'Issued': '#6366F1',
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
    { id: 'pending-sme', title: 'LV1 - SME REVIEW', statuses: ['Pending SME Review', ''] },
    { id: 'sme-disputed', title: 'LV2 - QA DECISION', statuses: ['Markdown Disputed', 'Markdown Disputed - SME'] },
    { id: 'qa-decision', title: 'LV3 - SME-QA DECISION', statuses: ['Markdown Retained - QA'] },
    { id: 'trainer-review', title: 'LV4 - TRAINER DECISION', statuses: ['QA Decision Rejected', 'QA Decision Rejected - SME'] },
    { id: 'sme-trainer', title: 'LV5 - SME-TRAINER DECISION', statuses: ['Markdown Retained - Trainer'] },
    { id: 'qtp-review', title: 'LV6 - QTP MANAGER DECISION', statuses: ['Trainer Decision Rejected', 'Trainer Decision Rejected - SME'] }
  ],

  // Performance: cached form state
  _formBuilt: false,       // true after first innerHTML build
  _formEls: {},            // cached DOM references for form elements
  _ztpCatalogReady: false, // true after ZTP catalog prefetched
  _rcaCatalogReady: false, // true after RCA catalog prefetched
  _rcaData: [],            // cached RCA cascade data
  _ztpCategories: [],      // cached ZTP category list
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

  // Exclude NTE Log entries from Coaching Profile — they belong in Corrective Actions
  allData = allData.filter(l => l.coaching_type !== 'NTE Log');

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
  const role = currentUser ? currentUser.actual_role : '';

  if (isAdmin740 || role === 'Manager') {
    // Admin + Managers — see ALL coaching logs
    COMPASS.filteredGiven = allData;
    COMPASS.filteredReceived = [];
  } else if (role === 'Agent') {
    // Agents — only see logs filed TO them
    COMPASS.filteredGiven = [];
    COMPASS.filteredReceived = allData.filter(l => l.coachee_ohr === currentUser.ohr_id);
  } else if (role === 'Team Lead') {
    // Team Leaders — see logs where:
    //   1. Coachee is one of their agents (supervisor_name === TL full_name)
    //   2. They are the coach (logs they sent)
    //   3. They are the coachee (logs sent to them)
    const myName = currentUser.full_name;
    const teamOhrs = new Set();
    if (COMPASS.employees && COMPASS.employees.length) {
      COMPASS.employees.forEach(e => {
        if (e.supervisor_name === myName) teamOhrs.add(e.ohr_id);
      });
    }
    teamOhrs.add(currentUser.ohr_id); // include self
    // Given = logs where coach is me
    COMPASS.filteredGiven = allData.filter(l => l.coach_ohr === currentUser.ohr_id);
    // Received = logs where coachee is any team member (regardless of coach) OR coachee is me
    COMPASS.filteredReceived = allData.filter(l =>
      teamOhrs.has(l.coachee_ohr) || l.coachee_ohr === currentUser.ohr_id
    );
  } else if (role === 'Operational SME') {
    // SMEs — same as TL but "their agents" = agents under their supervisor's team.
    // SME's supervisor_name points to a TL; team = all employees whose supervisor_name matches that TL.
    const myTlName = currentUser.supervisor_name || '';
    const teamOhrs = new Set();
    if (COMPASS.employees && COMPASS.employees.length && myTlName) {
      COMPASS.employees.forEach(e => {
        if (e.supervisor_name === myTlName) teamOhrs.add(e.ohr_id);
      });
    }
    teamOhrs.add(currentUser.ohr_id); // include self
    // Given = logs where coach is me
    COMPASS.filteredGiven = allData.filter(l => l.coach_ohr === currentUser.ohr_id);
    // Received = logs where coachee is any team member (regardless of coach) OR coachee is me
    COMPASS.filteredReceived = allData.filter(l =>
      teamOhrs.has(l.coachee_ohr) || l.coachee_ohr === currentUser.ohr_id
    );
  } else if (role === 'Quality & Policy Expert' || role === 'Trainer') {
    // QAs & Trainers — see logs they filed + logs filed to them
    COMPASS.filteredGiven = allData.filter(l => l.coach_ohr === currentUser.ohr_id);
    COMPASS.filteredReceived = allData.filter(l => l.coachee_ohr === currentUser.ohr_id);
  } else if (currentUser) {
    // Fallback for any other role
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
  // Awareness-only types (ZTP, Incident Report) are always considered "acknowledged"
  // so they don't appear in the Unacknowledged tab
  if (COMPASS.AWARENESS_ONLY_TYPES.includes(log.coaching_type)) return true;
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
  return `<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:600;line-height:1.3;margin:1px 2px 1px 0;background:${c.bg};color:${c.color};border:1px solid ${c.border};white-space:nowrap;letter-spacing:0.1px;max-width:120px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(g)}</span>`;
}

// ===== Input Portal: Stats =====

function compassRenderStats() {
  // Try new stats strip first, fall back to legacy element
  const el = document.getElementById('compass-stats-strip') || document.getElementById('compass-stats');
  if (!el) return;
  const total = COMPASS.filtered.length;
  const pending = COMPASS.filtered.filter(l => l.status === 'Pending Acknowledgement').length;
  const acked = COMPASS.filtered.filter(l => l.status === 'Acknowledged').length;
  const qaActive = COMPASS.filtered.filter(l => l.coaching_type === 'QA Feedback' && !['Acknowledged', 'Pending Acknowledgement'].includes(l.status)).length;

  el.innerHTML = `
    <div class="compass-stat-card stat-total">
      <div class="compass-stat-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></div>
      <div class="compass-stat-value">${total}</div>
      <div class="compass-stat-label">Total Logs</div>
    </div>
    <div class="compass-stat-card stat-pending">
      <div class="compass-stat-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
      <div class="compass-stat-value">${pending}</div>
      <div class="compass-stat-label">Pending Ack</div>
    </div>
    <div class="compass-stat-card stat-acked">
      <div class="compass-stat-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>
      <div class="compass-stat-value">${acked}</div>
      <div class="compass-stat-label">Acknowledged</div>
    </div>
    <div class="compass-stat-card stat-dispute">
      <div class="compass-stat-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
      <div class="compass-stat-value">${qaActive}</div>
      <div class="compass-stat-label">QA In Dispute</div>
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
  const totalCols = 4; // ID, Type, Stamp, Person

  if (isGiven) {
    thead.innerHTML = `<tr><th>ID</th><th>Type</th><th>Coaching Stamp</th><th>Coachee</th></tr>`;
  } else {
    thead.innerHTML = `<tr><th>ID</th><th>Type</th><th>Coaching Stamp</th><th>Coach</th></tr>`;
  }

  const start = (COMPASS[pageKey] - 1) * COMPASS.pageSize;
  const pageData = data.slice(start, start + COMPASS.pageSize);

  if (pageData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${totalCols}"><div class="mascot-empty-state"><div class="sprite-mascot" role="img" aria-label="No data"></div><div class="empty-title">No coaching logs found</div><div class="empty-subtitle">Try adjusting the filters or date range</div></div></td></tr>`;
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

    const cid = log.coaching_id || log.id;
    const isExpanded = COMPASS._expandedRowId === String(cid);
    return `<tr class="module-row${isExpanded ? ' compass-row-expanded' : ''}" data-cid="${escapeAttr(String(cid))}" onclick="compassToggleInlineDetail('${escapeAttr(String(cid))}', '${which}')">
      <td><span class="module-id">${cid}</span></td>
      <td><span class="module-type-badge type-${(log.coaching_type || '').replace(/\s+/g, '-').toLowerCase()}">${escapeHtml(log.coaching_type || '')}</span></td>
      <td>${date}</td>
      <td><div style="display:flex;align-items:center;gap:6px;"><span style="flex:1;">${personCol}</span><span class="compass-expand-indicator"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="6 9 12 15 18 9"/></svg></span></div></td>
    </tr>${isExpanded ? `<tr class="compass-detail-panel-row"><td colspan="4"><div class="compass-detail-panel open" id="compass-inline-detail-${escapeAttr(String(cid))}"><div class="compass-detail-loading" style="text-align:center;padding:20px;color:var(--compass-text-muted);">Loading...</div></div></td></tr>` : ''}`;
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

// ===== Export CSV =====

/**
 * Export coaching logs as CSV.
 * mode = 'filtered' → exports COMPASS.filteredGiven (role-scoped + search/filter applied)
 * mode = 'all'      → fetches ALL logs from server (Manager-only, bypasses role filter)
 */
async function compassExportCSV(mode) {
  const btn = document.getElementById('compass-export-btn');
  const origText = btn ? btn.innerHTML : '';
  try {
    if (btn) btn.innerHTML = '<span style="opacity:0.7">Exporting...</span>';
    if (btn) btn.disabled = true;

    let data;
    if (mode === 'all') {
      // Manager-only: fetch full dataset from server (non-lean)
      const resp = await fetch(`${IO_API_BASE}/coaching?limit=10000&lean=1`);
      if (!resp.ok) throw new Error('Failed to fetch data for export');
      data = await resp.json();
    } else {
      // Filtered: use the already-scoped filteredGiven array
      data = [...(COMPASS.filteredGiven || [])];
    }

    if (!data || data.length === 0) {
      showToast('No data to export', 'warning');
      return;
    }

    // Define CSV columns in a logical order with human-readable headers
    const columns = [
      { key: 'coaching_id', header: 'Coaching ID' },
      { key: 'coaching_type', header: 'Coaching Type' },
      { key: 'status', header: 'Status' },
      { key: 'cap_level', header: 'CAP Level' },
      { key: 'coaching_date', header: 'Coaching Date' },
      { key: 'coach', header: 'Coach' },
      { key: 'coach_ohr', header: 'Coach OHR' },
      { key: 'coach_meta_email', header: 'Coach Meta Email' },
      { key: 'coach_sup', header: 'Coach Supervisor' },
      { key: 'coach_sup_email', header: 'Coach Supervisor Email' },
      { key: 'coach_pg', header: 'Coach Planning Group' },
      { key: 'coachee', header: 'Coachee' },
      { key: 'coachee_ohr', header: 'Coachee OHR' },
      { key: 'coachee_meta_email', header: 'Coachee Meta Email' },
      { key: 'coachee_sup', header: 'Coachee Supervisor' },
      { key: 'coachee_sup_email', header: 'Coachee Supervisor Email' },
      { key: 'coachee_pg', header: 'Coachee Planning Group' },
      { key: 'session_goal', header: 'Session Goal' },
      { key: 'job_id', header: 'Job ID' },
      { key: 'sme_joiner', header: 'Support Joiner 1' },
      { key: 'sme_meta_email', header: 'Support Joiner 1 Email' },
      { key: 'sme_joiner_2', header: 'Support Joiner 2' },
      { key: 'sme_joiner_2_email', header: 'Support Joiner 2 Email' },
      { key: 'coachee_list', header: 'Coachee List (Group)' },
      { key: 'created_at', header: 'Created At' },
      { key: 'updated_at', header: 'Updated At' },
    ];

    // Build CSV string
    const escCSV = (val) => {
      if (val == null) return '';
      let s = String(val);
      // Flatten arrays
      if (Array.isArray(val)) s = val.map(v => typeof v === 'object' ? (v.name || v.coachee || JSON.stringify(v)) : v).join('; ');
      // Escape quotes and wrap if needed
      if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        s = '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };

    const headerRow = columns.map(c => escCSV(c.header)).join(',');
    const rows = data.map(log => columns.map(c => escCSV(log[c.key])).join(','));
    const csv = [headerRow, ...rows].join('\n');

    // Trigger download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `coaching_given_${mode === 'all' ? 'all' : 'filtered'}_${timestamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`Exported ${data.length} records`, 'success');
  } catch (err) {
    console.error('Export CSV error:', err);
    showToast('Export failed: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.innerHTML = origText;
      btn.disabled = false;
    }
    // Close dropdown if open
    const dd = document.getElementById('compass-export-dropdown');
    if (dd) dd.style.display = 'none';
  }
}

// ===== Disputes Area: Kanban Board =====

// Per-column pagination state for kanban
if (!COMPASS._kanbanPages) COMPASS._kanbanPages = {};
const KANBAN_PAGE_SIZE = 8;

// Aging calculation: returns { cls, label, hours } based on 48-hour SLA
function _disputesCalcAging(log) {
  // Use updated_at (last status change) or coaching_date as fallback
  const ref = log.updated_at || log.coaching_date;
  if (!ref) return { cls: 'aging-ok', label: '—', hours: 0 };
  const refDate = new Date(ref);
  if (isNaN(refDate.getTime())) return { cls: 'aging-ok', label: '—', hours: 0 };
  const now = new Date();
  const diffMs = now - refDate;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 24) return { cls: 'aging-ok', label: hours + 'h', hours };
  if (hours < 48) return { cls: 'aging-warn', label: Math.floor(hours / 24) + 'd ' + (hours % 24) + 'h', hours };
  const days = Math.floor(hours / 24);
  return { cls: 'aging-critical', label: days + 'd', hours };
}

// Determine which level index (0-5) a log is currently at
function _disputesGetLevelIndex(log) {
  for (let i = 0; i < COMPASS.KANBAN_COLUMNS.length; i++) {
    const col = COMPASS.KANBAN_COLUMNS[i];
    if (col.statuses.includes(log.status) || (col.statuses.includes('') && !log.status)) return i;
  }
  return 0;
}

function compassRenderKanban() {
  const board = document.getElementById('compass-kanban-board');
  if (!board) return;

  const searchTerm = (document.getElementById('disputes-search-input')?.value || '').toLowerCase().trim();

  let qaLogs = COMPASS.logs.filter(l => l.coaching_type === 'QA Feedback');

  // ---- Role-based data scoping for Disputes Area ----
  const role = currentUser ? currentUser.actual_role : '';
  const isOwner = currentUser && currentUser.ohr_id === '740045023';
  const qaMode = COMPASS._disputesQaMode || 'all';

  if (isOwner || role === 'Manager') {
    // Managers see all disputes — no filter
  } else if (role === 'Quality & Policy Expert') {
    // QAs: toggle between "All" and "Mine" (where they are the coach)
    if (qaMode === 'mine') {
      qaLogs = qaLogs.filter(l => l.coach_ohr === currentUser.ohr_id);
    }
    // 'all' mode = no additional filter
  } else if (role === 'Team Lead') {
    // TLs: coachee is their agent OR they are sme_joiner/sme_joiner_2 (matched by name)
    const myName = currentUser.full_name;
    const teamOhrs = new Set();
    if (COMPASS.employees && COMPASS.employees.length) {
      COMPASS.employees.forEach(e => {
        if (e.supervisor_name === myName) teamOhrs.add(e.ohr_id);
      });
    }
    qaLogs = qaLogs.filter(l =>
      teamOhrs.has(l.coachee_ohr) ||
      (l.sme_joiner || '') === myName ||
      (l.sme_joiner_2 || '') === myName
    );
  } else if (role === 'Operational SME') {
    // SMEs: same as TL but team = supervisor's team
    const myTlName = currentUser.supervisor_name || '';
    const myName = currentUser.full_name;
    const teamOhrs = new Set();
    if (COMPASS.employees && COMPASS.employees.length && myTlName) {
      COMPASS.employees.forEach(e => {
        if (e.supervisor_name === myTlName) teamOhrs.add(e.ohr_id);
      });
    }
    qaLogs = qaLogs.filter(l =>
      teamOhrs.has(l.coachee_ohr) ||
      (l.sme_joiner || '') === myName ||
      (l.sme_joiner_2 || '') === myName
    );
  } else if (currentUser) {
    // Fallback for other non-agent roles: see disputes where they are involved
    qaLogs = qaLogs.filter(l =>
      l.coach_ohr === currentUser.ohr_id ||
      l.coachee_ohr === currentUser.ohr_id ||
      (l.sme_joiner || '') === currentUser.full_name ||
      (l.sme_joiner_2 || '') === currentUser.full_name
    );
  }

  // Apply search filter
  if (searchTerm) {
    qaLogs = qaLogs.filter(l =>
      (l.coachee || '').toLowerCase().includes(searchTerm) ||
      (l.coach || '').toLowerCase().includes(searchTerm) ||
      String(l.coaching_id || l.id || '').toLowerCase().includes(searchTerm) ||
      (l.session_goal || '').toLowerCase().includes(searchTerm)
    );
  }

  // Update filter count
  const countEl = document.getElementById('disputes-filter-count');
  if (countEl) {
    const totalQA = COMPASS.logs.filter(l => l.coaching_type === 'QA Feedback').length;
    countEl.textContent = searchTerm ? `${qaLogs.length} of ${totalQA} logs` : `${totalQA} logs`;
  }

  let html = '';
  COMPASS.KANBAN_COLUMNS.forEach((col, colIdx) => {
    const cards = qaLogs.filter(l => col.statuses.includes(l.status) || (col.statuses.includes('') && !l.status));
    const page = COMPASS._kanbanPages[col.id] || 1;
    const totalPages = Math.ceil(cards.length / KANBAN_PAGE_SIZE) || 1;
    const start = (page - 1) * KANBAN_PAGE_SIZE;
    const pageCards = cards.slice(start, start + KANBAN_PAGE_SIZE);
    const levelNum = colIdx + 1;

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
      <div class="kanban-column" data-level="${levelNum}">
        <div class="kanban-column-header">
          <div style="display:flex;align-items:center;">
            <span class="kanban-level-badge">L${levelNum}</span>
            <span class="kanban-column-title">${escapeHtml(col.title.replace(/^LV\d+\s*-\s*/, ''))}</span>
          </div>
          <span class="kanban-column-count">${cards.length}</span>
        </div>
        <div class="kanban-column-body">
        ${paginationHtml}`;

    if (cards.length === 0) {
      html += `<div class="kanban-empty-state">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
        <p>No disputes at this level</p>
      </div>`;
    } else {
      pageCards.forEach(log => {
        const date = log.coaching_date ? new Date(log.coaching_date).toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' }) : '\u2014';
        const aging = _disputesCalcAging(log);
        const currentLevel = _disputesGetLevelIndex(log);
        const goalText = log.session_goal || '';
        const coachName = log.coach ? log.coach.split(',')[0].trim().split(' ').slice(-1)[0] : '\u2014';

        // Build escalation progress dots (6 levels)
        let dotsHtml = '<div class="kanban-card-progress">';
        for (let d = 0; d < 6; d++) {
          if (d < currentLevel) dotsHtml += '<div class="dot passed"></div>';
          else if (d === currentLevel) dotsHtml += '<div class="dot active"></div>';
          else dotsHtml += '<div class="dot"></div>';
        }
        dotsHtml += '</div>';

        html += `
          <div class="kanban-card kanban-card-styled ${aging.cls}" onclick="disputesOpenDetail('${log.coaching_id || log.id}')">
            <div class="kanban-card-header">
              <span class="kanban-card-id">${escapeHtml(log.coaching_id || String(log.id))}</span>
              <span class="kanban-card-aging ${aging.cls}">${aging.label}</span>
            </div>
            <div class="kanban-card-coachee-row">${escapeHtml(log.coachee || '\u2014')}</div>
            ${goalText ? `<span class="kanban-card-goal-tag">${escapeHtml(goalText)}</span>` : ''}
            ${dotsHtml}
            <div class="kanban-card-footer">
              <span class="coach-name">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                ${escapeHtml(coachName)}
              </span>
              <span class="card-date">${date}</span>
            </div>
          </div>`;
      });
    }

    html += '</div></div>';
  });
  board.innerHTML = html;
}

// Search/filter handler for disputes
var _disputesFilterDebounce = null;
function disputesFilterCards() {
  clearTimeout(_disputesFilterDebounce);
  _disputesFilterDebounce = setTimeout(() => {
    // Reset all column pages to 1 when searching
    COMPASS._kanbanPages = {};
    compassRenderKanban();
  }, 150);
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
  const canSeeAckDetails = isCoachSup || isAdmin; // Rating & Sentiments visible ONLY to Coach's 1-up Supervisor and admin
  const isAcknowledged = compassIsAcknowledged(log);

  // ===== SECTION 1: SESSION DETAILS =====
  let html = '<div class="detail-section"><h4 class="detail-section-title">Session Details</h4>';

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
    html += '<div class="detail-section" style="margin-top:16px;"><h4 class="detail-section-title">Root Cause Analysis</h4>';
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
      html += '<div class="detail-section" style="margin-top:16px;"><h4 class="detail-section-title">Dispute Trail</h4>';
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
  const isAwarenessOnly = COMPASS.AWARENESS_ONLY_TYPES.includes(log.coaching_type);
  const showAckSection = !isAwarenessOnly && (log.coaching_type !== 'QA Feedback' || ACK_ELIGIBLE_STATUSES.includes(log.status));

  if (showAckSection) {
  html += '<div class="detail-section" style="margin-top:16px;"><h4 class="detail-section-title">Acknowledgement</h4>';

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

    // Acknowledge button — show if user is the coachee AND log is unacknowledged AND not awareness-only
    const _isAwarenessOnly = COMPASS.AWARENESS_ONLY_TYPES.includes(log.coaching_type);
    if (isCoachee && !isAcknowledged && !_isAwarenessOnly) {
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

// ===== Inline Detail Expansion =====

/**
 * Toggle inline detail panel for a coaching log row.
 * Clicking an expanded row collapses it; clicking a different row collapses the old and expands the new.
 */
async function compassToggleInlineDetail(coachingId, which) {
  const cid = String(coachingId);

  // If already expanded, collapse it
  if (COMPASS._expandedRowId === cid) {
    COMPASS._expandedRowId = null;
    COMPASS.editingId = null;
    compassRenderTable(which);
    return;
  }

  // Expand the new row
  COMPASS._expandedRowId = cid;
  COMPASS.editingId = cid;
  compassRenderTable(which);

  // Now populate the detail panel asynchronously
  const panel = document.getElementById('compass-inline-detail-' + cid);
  if (!panel) return;

  let log = COMPASS.logs.find(l => String(l.coaching_id || l.id) === cid);
  if (!log) { panel.innerHTML = '<div style="padding:16px;color:var(--error);">Log not found</div>'; return; }

  // Fetch full record on demand if coaching_details is missing (lean mode)
  if (log.coaching_details === undefined) {
    try {
      const fullResp = await fetch(`${IO_API_BASE}/coaching?coaching_id=${encodeURIComponent(cid)}`);
      if (fullResp.ok) {
        const fullRows = await fullResp.json();
        if (fullRows.length > 0) Object.assign(log, fullRows[0]);
      }
    } catch (e) { console.warn('Failed to fetch full coaching details:', e); }
  }

  // Ensure employees are loaded for supervisor visibility check
  if (!COMPASS.employees || COMPASS.employees.length === 0) {
    await compassFetchEmployees();
  }

  panel.innerHTML = _compassBuildInlineDetailHtml(log);
}

/**
 * Build the HTML content for an inline detail panel.
 * Mirrors the old compassOpenDetail() body generation but outputs to inline panel.
 */
function _compassBuildInlineDetailHtml(log) {
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  const isCoachee = cu && cu.ohr_id === log.coachee_ohr;
  const coachEmployee = (COMPASS.employees && COMPASS.employees.length > 0) ? COMPASS.employees.find(e => e.ohr_id === log.coach_ohr) : null;
  let isCoachSup = false;
  if (cu && coachEmployee && coachEmployee.supervisor_name) {
    isCoachSup = cu.full_name === coachEmployee.supervisor_name;
    if (!isCoachSup) {
      const supEmployee = COMPASS.employees.find(e => e.full_name === coachEmployee.supervisor_name);
      if (supEmployee) isCoachSup = cu.ohr_id === supEmployee.ohr_id;
    }
  }
  const isAdmin = cu && cu.ohr_id === '740045023';
  const canSeeAckDetails = isCoachSup || isAdmin;
  const isAcknowledged = compassIsAcknowledged(log);
  const date = log.coaching_date ? new Date(log.coaching_date).toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '\u2014';

  // Type icon map
  const typeIcons = { 'General Coaching': '\uD83D\uDCAC', 'Follow-Up Session': '\uD83D\uDD04', 'Group Coaching': '\uD83D\uDC65', 'Triad Coaching': '\uD83D\uDD35', 'QA Feedback': '\uD83D\uDCCB', 'Incident Report': '\u26A0\uFE0F', 'ZTP Coaching': '\uD83D\uDD12' };
  const typeIcon = typeIcons[log.coaching_type] || '\uD83D\uDCAC';
  const typeBg = log.coaching_type === 'QA Feedback' ? 'rgba(245,158,11,0.1)' : log.coaching_type === 'ZTP Coaching' ? 'rgba(239,68,68,0.1)' : log.coaching_type === 'Incident Report' ? 'rgba(239,68,68,0.1)' : 'rgba(99,102,241,0.08)';

  // ===== HEADER =====
  let html = `<div class="cdp-header">`;
  html += `<div class="cdp-header-icon" style="background:${typeBg};">${typeIcon}</div>`;
  html += `<div class="cdp-header-info">`;
  html += `<div class="cdp-header-title">${escapeHtml(log.coaching_type || 'Coaching Log')}</div>`;
  html += `<div class="cdp-header-sub">${date} &middot; ID: ${escapeHtml(String(log.coaching_id || log.id).slice(0,8))}</div>`;
  html += `</div>`;
  // Ack badge in header
  const ACK_ELIGIBLE_STATUSES = ['Pending Acknowledgement', 'Acknowledged'];
  const isAwarenessOnly = COMPASS.AWARENESS_ONLY_TYPES.includes(log.coaching_type);
  const showAckSection = !isAwarenessOnly && (log.coaching_type !== 'QA Feedback' || ACK_ELIGIBLE_STATUSES.includes(log.status));
  if (showAckSection) {
    if (isAcknowledged) {
      html += `<span class="cdp-ack-badge acknowledged"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Acknowledged</span>`;
    } else {
      html += `<span class="cdp-ack-badge needs-ack"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Pending</span>`;
    }
  }
  html += `</div>`;

  // ===== SESSION DETAILS CARD =====
  html += `<div class="cdp-section"><div class="cdp-section-title">Session Details</div>`;
  html += `<div class="cdp-grid">`;

  // People fields
  if (log.coaching_type === 'Group Coaching') {
    const coachees = log.coachee_list || [];
    html += `<div class="cdp-field cdp-grid-full"><div class="cdp-field-label">Coachees (${coachees.length})</div><div class="cdp-field-value">${coachees.length > 0 ? coachees.map(c => escapeHtml(c.name || c)).join(', ') : escapeHtml(log.coachee || '\u2014')}</div></div>`;
  } else if (log.coaching_type === 'Triad Coaching') {
    const leader = log.coachee_list && log.coachee_list.length > 0 ? log.coachee_list[0] : null;
    html += `<div class="cdp-field"><div class="cdp-field-label">Leader</div><div class="cdp-field-value">${leader ? escapeHtml(leader.name || '') : '\u2014'}</div></div>`;
    html += `<div class="cdp-field"><div class="cdp-field-label">Coachee</div><div class="cdp-field-value">${escapeHtml(log.coachee || '\u2014')}</div></div>`;
  } else {
    html += `<div class="cdp-field"><div class="cdp-field-label">Coachee</div><div class="cdp-field-value">${escapeHtml(log.coachee || '\u2014')} <span style="color:var(--compass-text-muted,#94a3b8);font-size:11px;">(${escapeHtml(log.coachee_ohr || '')})</span></div></div>`;
  }
  html += `<div class="cdp-field"><div class="cdp-field-label">Coach</div><div class="cdp-field-value">${escapeHtml(log.coach || '\u2014')} <span style="color:var(--compass-text-muted,#94a3b8);font-size:11px;">(${escapeHtml(log.coach_ohr || '')})</span></div></div>`;

  if (log.coachee_sup && log.coach !== log.coachee_sup) {
    html += `<div class="cdp-field"><div class="cdp-field-label">Coachee Supervisor</div><div class="cdp-field-value">${escapeHtml(log.coachee_sup)}</div></div>`;
  }
  html += `<div class="cdp-field"><div class="cdp-field-label">Session Goal</div><div class="cdp-field-value">${escapeHtml(log.session_goal || '\u2014')}</div></div>`;

  if (log.coaching_type === 'QA Feedback' && log.job_id) {
    html += `<div class="cdp-field"><div class="cdp-field-label">Job ID</div><div class="cdp-field-value" style="font-family:monospace;">${escapeHtml(log.job_id)}</div></div>`;
  }
  if (log.cap_level) {
    const capBg = log.cap_level === 'CAP 3' ? 'rgba(239,68,68,0.1)' : log.cap_level === 'CAP 2' ? 'rgba(245,158,11,0.1)' : 'rgba(59,130,246,0.1)';
    const capFg = log.cap_level === 'CAP 3' ? '#EF4444' : log.cap_level === 'CAP 2' ? '#F59E0B' : '#3B82F6';
    html += `<div class="cdp-field"><div class="cdp-field-label">CAP Level</div><div class="cdp-field-value"><span class="cdp-cap-badge" style="background:${capBg};color:${capFg};">${escapeHtml(log.cap_level)}</span> <button class="btn btn-outline btn-xs" onclick="event.stopPropagation();compassViewNte('${escapeAttr(log.coaching_id || log.id)}')" style="margin-left:6px;font-size:10px;padding:2px 8px;">View NTE</button></div></div>`;
  }

  html += `</div>`; // close cdp-grid

  // Coaching Details — full width content block
  html += `<div class="cdp-content-block"><div class="cdp-field-label">Coaching Details</div><div class="cdp-field-value multiline">${log.coaching_details || '\u2014'}</div></div>`;
  html += `</div>`; // close cdp-section

  // ===== QA FEEDBACK: RCA CARD =====
  if (log.coaching_type === 'QA Feedback') {
    html += `<div class="cdp-section"><div class="cdp-section-title">Root Cause Analysis</div>`;
    html += `<div class="cdp-grid">`;
    html += `<div class="cdp-field"><div class="cdp-field-label">L1 Category</div><div class="cdp-field-value">${escapeHtml(log.level_1_category || '\u2014')}</div></div>`;
    html += `<div class="cdp-field"><div class="cdp-field-label">L2 Direct Cause</div><div class="cdp-field-value">${escapeHtml(log.level_2_direct_cause || '\u2014')}</div></div>`;
    html += `<div class="cdp-field"><div class="cdp-field-label">L3 Contributing</div><div class="cdp-field-value">${escapeHtml(log.level_3_contributing_cause || '\u2014')}</div></div>`;
    html += `<div class="cdp-field"><div class="cdp-field-label">L4 Deficiency</div><div class="cdp-field-value">${escapeHtml(log.level_4_deficiency || '\u2014')}</div></div>`;
    html += `<div class="cdp-field cdp-grid-full"><div class="cdp-field-label">L5 Root Cause</div><div class="cdp-field-value">${escapeHtml(log.level_5_root_cause || '\u2014')}</div></div>`;
    html += `</div>`;
    html += `<div class="cdp-content-block"><div class="cdp-field-label">RCA Description</div><div class="cdp-field-value multiline">${escapeHtml(log.guidelines || '\u2014')}</div></div>`;
    const mdStatusColor = COMPASS.STATUS_COLORS[log.status] || 'var(--compass-text-muted)';
    html += `<div class="cdp-field" style="margin-top:6px;"><div class="cdp-field-label">Markdown Status</div><div class="cdp-field-value"><span class="cdp-md-status" style="background:${mdStatusColor}18;color:${mdStatusColor};">${escapeHtml(log.status || '\u2014')}</span></div></div>`;
    html += `</div>`;
  }

  // ===== ZTP SECTION =====
  if (log.coaching_type === 'ZTP Coaching') {
    html += `<div class="cdp-section"><div class="cdp-section-title">ZTP Infraction</div>`;
    html += `<div class="cdp-grid">`;
    html += `<div class="cdp-field"><div class="cdp-field-label">Category</div><div class="cdp-field-value">${escapeHtml(log.infraction_category || '\u2014')}</div></div>`;
    html += `<div class="cdp-field"><div class="cdp-field-label">Infraction</div><div class="cdp-field-value">${escapeHtml(log.infraction || '\u2014')}</div></div>`;
    html += `<div class="cdp-field"><div class="cdp-field-label">Severity</div><div class="cdp-field-value">${escapeHtml(log.severity || '\u2014')}</div></div>`;
    html += `</div>`;
    html += `<div class="cdp-content-block"><div class="cdp-field-label">Description</div><div class="cdp-field-value multiline">${escapeHtml(log.infraction_description || '\u2014')}</div></div>`;
    html += `</div>`;
  }

  // ===== DISPUTE TRAIL =====
  if (log.coaching_type === 'QA Feedback') {
    const hasDispute = log.dispute_comments || log.qa_comments || log.sme_qa_dispute_comments || log.trainer_comments || log.sme_trainer_comments || log.qtp_manager_comments;
    if (hasDispute) {
      html += `<div class="cdp-section"><div class="cdp-section-title">Dispute Trail</div>`;
      const disputes = [
        ['Dispute Comments', log.dispute_comments],
        ['QA Comments', log.qa_comments],
        ['SME QA Dispute', log.sme_qa_dispute_comments],
        ['Trainer Comments', log.trainer_comments],
        ['SME Trainer Dispute', log.sme_trainer_comments],
        ['QTP Manager', log.qtp_manager_comments]
      ].filter(d => d[1]);
      disputes.forEach(d => {
        html += `<div class="cdp-field"><div class="cdp-field-label">${d[0]}</div><div class="cdp-field-value multiline">${escapeHtml(d[1])}</div></div>`;
      });
      html += `</div>`;
    }
  }

  // ===== ATTACHMENTS & RELATED LOGS =====
  const attachHtml = compassRenderAttachmentsDetail(log);
  const relatedHtml = compassRenderRelatedLogs(log);
  if (attachHtml || relatedHtml) {
    html += `<div class="cdp-section">`;
    html += attachHtml;
    html += relatedHtml;
    html += `</div>`;
  }

  // ===== ACKNOWLEDGEMENT CARD =====
  if (showAckSection) {
    html += `<div class="cdp-section"><div class="cdp-section-title">Acknowledgement</div>`;
    html += '<div id="compass-ack-details">';
    html += `<div class="cdp-grid">`;
    html += `<div class="cdp-field cdp-grid-full"><div class="cdp-field-label">Commitments</div><div class="cdp-field-value multiline">${escapeHtml(log.coachee_commitments || '\u2014')}</div></div>`;
    if (canSeeAckDetails) {
      html += `<div class="cdp-field"><div class="cdp-field-label">Coaching Rating</div><div class="cdp-field-value">${compassRenderStars(log.coaching_rating)}</div></div>`;
      html += `<div class="cdp-field"><div class="cdp-field-label">Sentiments</div><div class="cdp-field-value multiline">${escapeHtml(log.coachee_sentiments || '\u2014')}</div></div>`;
    }
    html += `</div>`;
    html += '</div>';

    // Inline acknowledgement form
    html += `<div id="compass-ack-form" class="cdp-ack-form" style="display:none;">
      <div style="font-size:12px;color:var(--compass-text-muted,#64748b);padding:8px 12px;background:var(--compass-bg-inset,#f1f5f9);border-radius:6px;margin-bottom:12px;">Saving will record your acknowledgement automatically.</div>
      <div style="margin-bottom:10px;">
        <label>Commitments <span style="color:#EF4444;">*</span></label>
        <textarea id="compass-ack-commitments" placeholder="Enter your commitments..." onclick="event.stopPropagation()" required></textarea>
      </div>
      <div style="margin-bottom:10px;">
        <label>Rating (1-5) <span style="color:#EF4444;">*</span></label>
        <div id="compass-ack-rating" style="display:flex;gap:4px;">
          ${[1,2,3,4,5].map(n => `<button type="button" class="compass-star-btn" data-val="${n}" onclick="event.stopPropagation();compassSetAckRating(${n})" style="background:none;border:1px solid var(--compass-border,#e2e8f0);border-radius:6px;width:36px;height:36px;cursor:pointer;font-size:18px;color:var(--compass-text-muted,#94a3b8);transition:all 0.15s;">\u2605</button>`).join('')}
        </div>
      </div>
      <div style="margin-bottom:10px;">
        <label>Sentiments <span style="color:#EF4444;">*</span></label>
        <textarea id="compass-ack-sentiments" placeholder="Share your sentiments..." onclick="event.stopPropagation()" required></textarea>
      </div>
    </div>`;
    html += '</div>';
  }

  // ===== FOOTER ACTIONS =====
  let footerHtml = '';
  if (_compassDetailStack.length > 0) {
    footerHtml += '<button class="btn btn-outline btn-sm" onclick="event.stopPropagation();compassGoBack()" style="margin-right:auto;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;"><polyline points="15 18 9 12 15 6"/></svg> Back</button>';
  }
  if (cu) {
    const _isAwarenessOnly = COMPASS.AWARENESS_ONLY_TYPES.includes(log.coaching_type);
    if (isCoachee && !isAcknowledged && !_isAwarenessOnly) {
      footerHtml += ' <button class="btn btn-primary btn-sm" id="compass-ack-trigger-btn" onclick="event.stopPropagation();compassShowAckForm()">Acknowledge</button>';
    }
  }
  if (footerHtml) {
    html += `<div class="compass-detail-panel-footer">${footerHtml}</div>`;
  }

  return html;
}

// ===== Star Rating Renderer =====
function compassRenderStars(rating) {
  const r = parseInt(rating) || 0;
  if (r === 0) return '<span style="color:var(--fg-subtle);">—</span>';
  let stars = '<span class="star-rating-display">';
  for (let i = 1; i <= 5; i++) {
    stars += `<span style="color:${i <= r ? '#F59E0B' : '#E2E8F0'};font-size:16px;transition:color 0.15s ease;">★</span>`;
  }
  stars += '</span>';
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

    // #2 Notification: coaching_ack → notify coach
    try {
      const coacheeName = log.coachee || 'Coachee';
      const cid = log.coaching_id || log.id;
      createNotification({
        type: 'coaching_ack',
        title: 'Coaching Acknowledged',
        message: `${coacheeName} acknowledged your coaching log ${cid}`,
        target_ohr: log.coach_ohr,
        metadata: { coaching_id: cid, coachee: coacheeName, coach: log.coach }
      });
    } catch (notifErr) { console.error('[Notif] coaching_ack error:', notifErr); }

    // #3 Notification: coaching_rated → notify coach's 1-up supervisor
    try {
      const coacheeName = log.coachee || 'Coachee';
      const coachName = log.coach || 'Coach';
      const cid = log.coaching_id || log.id;
      // Find coach's supervisor OHR from employees list
      const coachEmp = COMPASS.employees.find(e => e.ohr_id === log.coach_ohr);
      const supName = coachEmp ? coachEmp.supervisor_name : (log.coach_sup || '');
      const supEmp = supName ? COMPASS.employees.find(e => e.full_name === supName) : null;
      if (supEmp) {
        createNotification({
          type: 'coaching_rated',
          title: 'Coaching Rating Submitted',
          message: `${coacheeName} rated a coaching session by ${coachName} — ${compassAckRating}/5 stars`,
          target_ohr: supEmp.ohr_id,
          metadata: { coaching_id: cid, rating: compassAckRating, coachee: coacheeName, coach: coachName }
        });
      }
    } catch (notifErr) { console.error('[Notif] coaching_rated error:', notifErr); }

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
  // Re-render the inline detail panel with the related log
  const cid = String(coachingId);
  COMPASS.editingId = cid;
  const panel = document.getElementById('compass-inline-detail-' + COMPASS._expandedRowId);
  if (panel) {
    let log = COMPASS.logs.find(l => String(l.coaching_id || l.id) === cid);
    if (log) {
      // Fetch full record if needed
      if (log.coaching_details === undefined) {
        fetch(`${IO_API_BASE}/coaching?coaching_id=${encodeURIComponent(cid)}`)
          .then(r => r.json())
          .then(rows => { if (rows.length > 0) Object.assign(log, rows[0]); panel.innerHTML = _compassBuildInlineDetailHtml(log); })
          .catch(() => { panel.innerHTML = _compassBuildInlineDetailHtml(log); });
      } else {
        panel.innerHTML = _compassBuildInlineDetailHtml(log);
      }
    }
  }
}

function compassGoBack() {
  if (_compassDetailStack.length > 0) {
    const prevId = _compassDetailStack.pop();
    compassOpenRelatedDetail(prevId);
  }
}

// ===== New Coaching Log Form =====

// Performance: prefetch ZTP + RCA catalogs in background
async function compassPrefetchCatalogs() {
  // ZTP categories
  if (!COMPASS._ztpCatalogReady) {
    try {
      const resp = await fetch(`${IO_API_BASE}/coaching-ztp?select=infraction_category`);
      const data = resp.ok ? await resp.json() : [];
      COMPASS._ztpCategories = [...new Set(data.map(d => d.infraction_category).filter(Boolean))];
      COMPASS._ztpCatalogReady = true;
    } catch (e) { console.error('ZTP prefetch failed:', e); }
  }
  // RCA data
  if (!COMPASS._rcaCatalogReady) {
    try {
      const resp = await fetch(`${IO_API_BASE}/coaching-rca`);
      if (resp.ok) COMPASS._rcaData = await resp.json();
      COMPASS._rcaCatalogReady = true;
    } catch (e) { console.error('RCA prefetch failed:', e); }
  }
}

// Performance: cache DOM references after first form build
function _compassCacheFormEls() {
  const ids = [
    'compass-new-type', 'compass-coachee-field', 'compass-coachee-list-field',
    'compass-followup-field', 'compass-session-goal-section', 'compass-ztp-section',
    'compass-rca-section', 'compass-triad-coachee-field', 'compass-coachee-search',
    'compass-violation-section', 'compass-support-joiner-section', 'compass-job-id-section',
    'compass-new-coachee', 'compass-triad-coachee', 'compass-triad-coachee-search',
    'compass-followup-search', 'compass-followup-dropdown', 'compass-followup-selected',
    'compass-multi-coachee-display', 'compass-multi-coachee-tags',
    'compass-multi-coachee-options', 'compass-new-details',
    'compass-new-job-id', 'compass-new-incident-ts',
    'compass-new-violation-cat', 'compass-new-violation-type', 'compass-new-violation-subtype',
    'compass-violation-subtype-field', 'compass-violation-penalty',
    'compass-new-infraction-cat', 'compass-new-infraction', 'compass-new-infraction-desc',
    'compass-new-rca-l1', 'compass-new-rca-l2', 'compass-new-rca-l3',
    'compass-new-rca-l4', 'compass-new-rca-l5', 'compass-new-guidelines',
    'compass-goal-display', 'compass-goal-dropdown', 'compass-attachment-list',
    'compass-attachments', 'compass-submit-btn',
    'compass-joiner1-search', 'compass-new-joiner1', 'compass-joiner2-search', 'compass-new-joiner2'
  ];
  const els = {};
  for (const id of ids) els[id] = document.getElementById(id);
  COMPASS._formEls = els;
}

// Performance: reset all form fields without rebuilding innerHTML
function _compassResetFormFields() {
  const el = COMPASS._formEls;
  // Type select
  if (el['compass-new-type']) el['compass-new-type'].value = '';
  // Coachee fields
  if (el['compass-new-coachee']) el['compass-new-coachee'].value = '';
  if (el['compass-coachee-search']) el['compass-coachee-search'].value = '';
  if (el['compass-triad-coachee']) el['compass-triad-coachee'].value = '';
  if (el['compass-triad-coachee-search']) el['compass-triad-coachee-search'].value = '';
  // Follow-up
  if (el['compass-followup-search']) el['compass-followup-search'].value = '';
  if (el['compass-followup-dropdown']) el['compass-followup-dropdown'].style.display = 'none';
  if (el['compass-followup-selected']) el['compass-followup-selected'].style.display = 'none';
  // Multi-coachee
  if (el['compass-multi-coachee-display']) el['compass-multi-coachee-display'].textContent = 'Select coachees...';
  if (el['compass-multi-coachee-tags']) el['compass-multi-coachee-tags'].innerHTML = '';
  if (el['compass-multi-coachee-options']) {
    el['compass-multi-coachee-options'].querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
  }
  // Session goals — uncheck all
  if (el['compass-goal-dropdown']) {
    el['compass-goal-dropdown'].querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    el['compass-goal-dropdown'].classList.remove('open');
  }
  if (el['compass-goal-display']) el['compass-goal-display'].textContent = '\u2014 Select \u2014';
  // Rich text editor
  if (el['compass-new-details']) el['compass-new-details'].innerHTML = '';
  // Job ID
  if (el['compass-new-job-id']) el['compass-new-job-id'].value = '';
  // Violation tracker
  if (el['compass-new-incident-ts']) el['compass-new-incident-ts'].value = '';
  if (el['compass-new-violation-cat']) el['compass-new-violation-cat'].selectedIndex = 0;
  if (el['compass-new-violation-type']) el['compass-new-violation-type'].innerHTML = '<option value="">\u2014 Select Violation \u2014</option>';
  if (el['compass-violation-subtype-field']) el['compass-violation-subtype-field'].style.display = 'none';
  if (el['compass-violation-penalty']) el['compass-violation-penalty'].style.display = 'none';
  // ZTP
  if (el['compass-new-infraction-cat']) el['compass-new-infraction-cat'].selectedIndex = 0;
  if (el['compass-new-infraction']) el['compass-new-infraction'].innerHTML = '<option value="">\u2014 Select Infraction \u2014</option>';
  if (el['compass-new-infraction-desc']) el['compass-new-infraction-desc'].textContent = 'Select an infraction to see description...';
  // RCA — reset L1 manually then downstream
  if (el['compass-new-rca-l1']) {
    el['compass-new-rca-l1'].innerHTML = '<option value="">\u2014 Select L1 Category \u2014</option>';
    el['compass-new-rca-l1'].disabled = false;
  }
  compassResetRCAFrom('l2');
  // Attachments
  if (el['compass-attachment-list']) el['compass-attachment-list'].innerHTML = '';
  if (el['compass-attachments']) el['compass-attachments'].value = '';
  // Support joiners
  if (el['compass-joiner1-search']) el['compass-joiner1-search'].value = '';
  if (el['compass-new-joiner1']) el['compass-new-joiner1'].value = '';
  if (el['compass-joiner2-search']) el['compass-joiner2-search'].value = '';
  if (el['compass-new-joiner2']) el['compass-new-joiner2'].value = '';
  // Reset all section visibility to defaults
  if (el['compass-coachee-field']) el['compass-coachee-field'].style.display = 'none';
  if (el['compass-coachee-list-field']) el['compass-coachee-list-field'].style.display = 'none';
  if (el['compass-triad-coachee-field']) el['compass-triad-coachee-field'].style.display = 'none';
  if (el['compass-followup-field']) el['compass-followup-field'].style.display = 'none';
  if (el['compass-violation-section']) el['compass-violation-section'].style.display = 'none';
  if (el['compass-support-joiner-section']) el['compass-support-joiner-section'].style.display = 'none';
  if (el['compass-ztp-section']) el['compass-ztp-section'].style.display = 'none';
  if (el['compass-rca-section']) el['compass-rca-section'].style.display = 'none';
  if (el['compass-job-id-section']) el['compass-job-id-section'].style.display = 'none';
}

// ===== Add Button Dropdown Menu =====
function compassToggleAddMenu() {
  const panel = document.getElementById('compass-inline-add');
  if (!panel) return;

  // If panel is already visible, collapse it
  if (panel.style.display !== 'none') {
    compassCollapseInlineAdd();
    return;
  }

  // Close old dropdown menu if it was open
  const oldMenu = document.getElementById('compass-add-menu');
  if (oldMenu) oldMenu.style.display = 'none';

  // Build type chips
  const typesContainer = document.getElementById('compass-inline-add-types');
  const formContainer = document.getElementById('compass-inline-add-form');
  const footerContainer = document.getElementById('compass-inline-add-footer');
  if (!typesContainer) return;

  // Reset state
  COMPASS._inlineSelectedType = null;
  COMPASS._formBuilt = false;
  COMPASS._formEls = {};
  if (formContainer) { formContainer.innerHTML = ''; formContainer.style.display = 'none'; }
  if (footerContainer) { footerContainer.innerHTML = ''; footerContainer.style.display = 'none'; }

  const types = _compassGetAllowedTypes();
  typesContainer.innerHTML = types.map(t => `
    <div class="compass-type-chip" data-type="${escapeAttr(t.id)}" onclick="compassInlineSelectType('${escapeAttr(t.id)}')">
      <span class="compass-type-chip-icon">${t.icon}</span>
      <span class="compass-type-chip-label">${escapeHtml(t.label)}</span>
    </div>
  `).join('') + `<button class="compass-inline-add-collapse" onclick="compassCollapseInlineAdd()" title="Collapse" style="margin-left:auto;flex-shrink:0;">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
  </button>`;

  // Show the panel with slide-down animation
  panel.classList.remove('collapsing');
  panel.style.display = '';

  // Scroll to the panel
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Extract the type list + role filtering into a reusable function
function _compassGetAllowedTypes() {
  const allTypes = [
    { id: 'General Coaching', icon: '\u{1F4AC}', label: 'General Coaching', desc: 'One-on-one coaching session', accent: '#3B82F6' },
    { id: 'Follow-Up Session', icon: '\u{1F504}', label: 'Follow-Up Session', desc: 'Continue a previous session', accent: '#8B5CF6' },
    { id: 'Group Coaching', icon: '\u{1F465}', label: 'Group Coaching', desc: 'Session with multiple coachees', accent: '#10B981' },
    { id: 'Triad Coaching', icon: '\u{1F4D0}', label: 'Triad Coaching', desc: 'Coaching observation with leader', accent: '#F59E0B' },
    { id: 'QA Feedback', icon: '\u{1F4CB}', label: 'QA Feedback', desc: 'Quality error findings & RCA', accent: '#EC4899' },
    { id: 'Incident Report', icon: '\u26A0\uFE0F', label: 'Incident Report', desc: 'Violation tracker & incident log', accent: '#EF4444' },
    { id: 'ZTP Coaching', icon: '\u{1F512}', label: 'ZTP Coaching', desc: 'Zero Tolerance Policy infraction', accent: '#DC2626' },
  ];

  const role = currentUser ? currentUser.actual_role : '';
  const isOwner = currentUser && currentUser.ohr_id === '740045023';
  if (isOwner || role === 'Manager') return allTypes;
  if (role === 'Quality & Policy Expert') {
    const qaAllowed = ['QA Feedback', 'ZTP Coaching', 'Follow-Up Session'];
    return allTypes.filter(t => qaAllowed.includes(t.id));
  }
  if (role === 'Operational SME') {
    const smeExcluded = ['QA Feedback', 'Triad Coaching'];
    return allTypes.filter(t => !smeExcluded.includes(t.id));
  }
  if (role === 'Team Lead') return allTypes.filter(t => t.id !== 'QA Feedback');
  return allTypes.filter(t => t.id !== 'QA Feedback');
}

async function compassAddMenuSelect(type) {
  // Legacy path — redirect to inline panel
  COMPASS._selectedType = type;
  await compassInlineSelectType(type);
}

// Inline panel: user clicked a type chip
async function compassInlineSelectType(type) {
  COMPASS._selectedType = type;
  COMPASS._inlineSelectedType = type;

  // Highlight the selected chip
  const chips = document.querySelectorAll('.compass-type-chip');
  chips.forEach(c => c.classList.toggle('selected', c.dataset.type === type));

  // Build the form in the inline container
  await compassShowNewFormInline(type);
}

// Collapse the inline add panel
function compassCollapseInlineAdd() {
  const panel = document.getElementById('compass-inline-add');
  if (!panel) return;
  panel.classList.add('collapsing');
  setTimeout(() => {
    panel.style.display = 'none';
    panel.classList.remove('collapsing');
    COMPASS._inlineSelectedType = null;
    COMPASS._formBuilt = false;
    COMPASS._formEls = {};
    COMPASS.editingId = null;
    COMPASS.selectedParentLog = null;
  }, 250);
}


// Legacy wrapper — still used by detail panel edit flows
async function compassShowNewFormForType(preselectedType) {
  await compassShowNewFormInline(preselectedType);
}

// Build the coaching form inside the inline panel (not the modal)
async function compassShowNewFormInline(preselectedType) {
  if (COMPASS.employees.length === 0) await compassFetchEmployees();
  COMPASS.editingId = null;

  const formBody = document.getElementById('compass-inline-add-form');
  const formFooter = document.getElementById('compass-inline-add-footer');
  if (!formBody || !formFooter) return;

  // Performance: only build form HTML once, then reuse with field reset
  if (COMPASS._formBuilt && COMPASS._lastFormType === preselectedType) {
    _compassResetFormFields();
    formFooter.innerHTML = `
      <span id="compass-inline-success-msg"></span>
      <button class="btn btn-outline btn-sm" onclick="compassCollapseInlineAdd()">Cancel</button>
      <button class="btn btn-primary btn-sm" id="compass-submit-btn" onclick="compassSubmitNew()">Create</button>
    `;
    COMPASS._formEls['compass-submit-btn'] = document.getElementById('compass-submit-btn');
    formBody.style.display = '';
    formFooter.style.display = '';
    const typeSelect = COMPASS._formEls['compass-new-type'];
    if (typeSelect && preselectedType) {
      typeSelect.value = preselectedType;
      compassOnTypeChange();
    }
    return;
  }
  // Different type selected — rebuild form
  COMPASS._formBuilt = false;
  COMPASS._formEls = {};

  formBody.innerHTML = `
    <!-- Type stored as hidden field, pre-selected from Add dropdown -->
    <input type="hidden" id="compass-new-type" value="${escapeAttr(preselectedType || COMPASS._selectedType || '')}">
    <div style="padding:6px 12px;margin-bottom:8px;background:var(--bg-inset);border-radius:var(--radius);display:flex;align-items:center;gap:8px;">
      <span style="font-size:11px;color:var(--fg-muted);text-transform:uppercase;font-weight:600;letter-spacing:0.5px;">Type:</span>
      <span style="font-size:13px;font-weight:600;color:var(--fg);">${escapeHtml(preselectedType || COMPASS._selectedType || '')}</span>
    </div>

    <div class="form-section">
      <div class="form-field" id="compass-coachee-field">
        <label class="form-label">Coachee <span class="required">*</span></label>
        <div class="searchable-select" id="compass-coachee-wrapper">
          <input type="hidden" id="compass-new-coachee" value="">
          <input type="text" class="form-input" id="compass-coachee-search" placeholder="Search coachee..." autocomplete="off" onclick="compassToggleCoacheeDropdown(true)" oninput="_compassFilterCoacheesDebounced()">
          <div class="searchable-select-dropdown" id="compass-coachee-dropdown" style="display:none;"></div>
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
              <input type="text" class="form-input" id="compass-multi-coachee-search" placeholder="Search employees..." autocomplete="off" oninput="_compassFilterMultiCoacheesDebounced()" style="font-size:12px; padding:6px 8px; flex:1;">
              <button type="button" onclick="compassClearMultiCoachees()" style="white-space:nowrap; font-size:11px; padding:4px 8px; background:var(--bg-surface); border:1px solid var(--border); border-radius:var(--radius); color:var(--fg-muted); cursor:pointer; transition:all 0.15s;">Clear All</button>
            </div>
            <div id="compass-multi-coachee-options" style="max-height:220px; overflow-y:auto;"></div>
          </div>
        </div>
        <div id="compass-multi-coachee-tags" style="display:flex; flex-wrap:wrap; gap:4px; margin-top:6px;"></div>
      </div>
      <div class="form-field" id="compass-triad-coachee-field" style="display:none;">
        <label class="form-label">Coachee <span class="required">*</span></label>
        <div class="searchable-select" id="compass-triad-coachee-wrapper">
          <input type="hidden" id="compass-triad-coachee" value="">
          <input type="text" class="form-input" id="compass-triad-coachee-search" placeholder="Search coachee..." autocomplete="off" onclick="compassToggleTriadCoacheeDropdown(true)" oninput="_compassFilterTriadCoacheesDebounced()">
          <div class="searchable-select-dropdown" id="compass-triad-coachee-dropdown" style="display:none;"></div>
        </div>
      </div>
      <div class="form-field" id="compass-followup-field" style="display:none;">
        <label class="form-label">Follow-Up From <span class="required">*</span></label>
        <div class="searchable-select" id="compass-followup-wrapper">
          <input type="text" class="form-input" id="compass-followup-search" placeholder="Search by coachee name, OHR, ID, or session goal..." autocomplete="off" oninput="_compassSearchParentLogsDebounced()">
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

    <!-- CAP removed — dedicated page under Compass -->

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

    <!-- Incident Report / Violation Tracker Fields (hidden by default) -->
    <div class="form-section" id="compass-violation-section" style="display:none;">
      <h4 class="form-section-title" style="color:#DC2626;">⚠ Violation Tracker</h4>
      <div class="form-field">
        <label class="form-label">Incident Timestamp <span class="required">*</span></label>
        <input type="datetime-local" class="form-input" id="compass-new-incident-ts" step="60">
      </div>
      <div class="form-field">
        <label class="form-label">Violation Type <span class="required">*</span></label>
        <select class="form-select" id="compass-new-violation-cat" onchange="compassOnViolationCatChange()">
          <option value="">— Select Violation Category —</option>
        </select>
      </div>
      <div class="form-field">
        <label class="form-label">Specific Violation <span class="required">*</span></label>
        <select class="form-select" id="compass-new-violation-type" onchange="compassOnViolationTypeChange()">
          <option value="">— Select Violation —</option>
        </select>
      </div>
      <div id="compass-violation-subtype-field" class="form-field" style="display:none;">
        <label class="form-label">Subtype / Description</label>
        <select class="form-select" id="compass-new-violation-subtype">
          <option value="">— Select Subtype —</option>
        </select>
      </div>
      <div id="compass-violation-penalty" style="display:none; margin-top:4px; padding:8px 12px; background:#FEF3C720; border:1px solid #F59E0B40; border-radius:var(--radius); font-size:12px; color:#D97706;"></div>
    </div>

    <!-- Support Joiner Fields for QA Feedback (hidden by default) -->
    <div class="form-section" id="compass-support-joiner-section" style="display:none;">
      <h4 class="form-section-title">Support Joiners</h4>
      <div class="form-field">
        <label class="form-label">Support Joiner 1 <span class="required">*</span></label>
        <div class="searchable-select" id="compass-joiner1-wrapper">
          <input type="hidden" id="compass-new-joiner1" value="">
          <input type="text" class="form-input" id="compass-joiner1-search" placeholder="Search SME or Team Lead..." autocomplete="off" onclick="compassToggleJoinerDropdown(1, true)" oninput="_compassFilterJoiner1Debounced()">
          <div class="searchable-select-dropdown" id="compass-joiner1-dropdown" style="display:none;"></div>
        </div>
      </div>
      <div class="form-field">
        <label class="form-label">Support Joiner 2 <span class="required">*</span></label>
        <div class="searchable-select" id="compass-joiner2-wrapper">
          <input type="hidden" id="compass-new-joiner2" value="">
          <input type="text" class="form-input" id="compass-joiner2-search" placeholder="Search SME or Team Lead..." autocomplete="off" onclick="compassToggleJoinerDropdown(2, true)" oninput="_compassFilterJoiner2Debounced()">
          <div class="searchable-select-dropdown" id="compass-joiner2-dropdown" style="display:none;"></div>
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
    <span id="compass-inline-success-msg"></span>
    <button class="btn btn-outline btn-sm" onclick="compassCollapseInlineAdd()">Cancel</button>
    <button class="btn btn-primary btn-sm" id="compass-submit-btn" onclick="compassSubmitNew()">Create</button>
  `;

  // Performance: mark form as built and cache all DOM references
  COMPASS._formBuilt = true;
  COMPASS._lastFormType = preselectedType;
  _compassCacheFormEls();

  // Show the inline form body and footer (no modal overlay)
  formBody.style.display = '';
  formFooter.style.display = '';

  // Set the pre-selected type and trigger field visibility
  if (preselectedType) {
    const typeSelect = COMPASS._formEls['compass-new-type'];
    if (typeSelect) {
      typeSelect.value = preselectedType;
    }
    compassOnTypeChange();
  }

  // Scroll form into view
  formBody.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function compassOnTypeChange() {
  // Performance: use cached DOM refs when available, fallback to getElementById
  const el = COMPASS._formEls || {};
  const _el = (id) => el[id] || document.getElementById(id);

  const type = (_el('compass-new-type') || {}).value || '';
  const coacheeField = _el('compass-coachee-field');
  const coacheeListField = _el('compass-coachee-list-field');
  const followupField = _el('compass-followup-field');
  const sessionGoalSection = _el('compass-session-goal-section');
  const ztpSection = _el('compass-ztp-section');
  const rcaSection = _el('compass-rca-section');
  const triadCoacheeField = _el('compass-triad-coachee-field');
  const coacheeSearch = _el('compass-coachee-search');
  const violationSection = _el('compass-violation-section');
  const joinerSection = _el('compass-support-joiner-section');
  const jobIdSection = _el('compass-job-id-section');

  // Reset all coachee-related fields
  if (coacheeField) coacheeField.style.display = 'none';
  if (coacheeListField) coacheeListField.style.display = 'none';
  if (followupField) followupField.style.display = 'none';
  if (triadCoacheeField) triadCoacheeField.style.display = 'none';
  // Reset Coachee label back to default
  if (coacheeField) {
    const coacheeLabel = coacheeField.querySelector('.form-label');
    if (coacheeLabel) coacheeLabel.innerHTML = 'Coachee <span class="required">*</span>';
  }
  if (coacheeSearch) coacheeSearch.placeholder = 'Search coachee...';

  // Show session goal by default
  if (sessionGoalSection) sessionGoalSection.style.display = '';

  // Filter session goal options based on coaching type
  compassFilterGoalOptions(type);

  COMPASS.selectedParentLog = null;
  // Also clear role filter first, Triad will re-apply it
  compassFilterCoacheesByRole(null);

  if (type === 'Follow-Up Session') {
    if (followupField) followupField.style.display = '';
    if (sessionGoalSection) sessionGoalSection.style.display = 'none';
    COMPASS.selectedParentLog = null;
    const searchInput = _el('compass-followup-search');
    if (searchInput) searchInput.value = '';
    const dropdown = _el('compass-followup-dropdown');
    if (dropdown) dropdown.style.display = 'none';
    const selected = _el('compass-followup-selected');
    if (selected) selected.style.display = 'none';
  } else if (type === 'Group Coaching') {
    if (coacheeListField) coacheeListField.style.display = '';
  } else if (type === 'Triad Coaching') {
    if (coacheeField) {
      coacheeField.style.display = '';
      const coacheeLabel = coacheeField.querySelector('.form-label');
      if (coacheeLabel) coacheeLabel.innerHTML = 'Leader <span class="required">*</span>';
    }
    if (coacheeSearch) coacheeSearch.placeholder = 'Search leader...';
    if (sessionGoalSection) sessionGoalSection.style.display = 'none';
    compassFilterCoacheesByRole(['Quality & Policy Expert', 'Operational SME', 'Team Lead', 'Trainer']);
    if (triadCoacheeField) triadCoacheeField.style.display = '';
  } else {
    if (coacheeField) coacheeField.style.display = '';
  }

  // Incident Report = Violation Tracker
  if (violationSection) {
    violationSection.style.display = type === 'Incident Report' ? '' : 'none';
    if (type === 'Incident Report') {
      compassInitViolationCatalog();
      if (sessionGoalSection) sessionGoalSection.style.display = 'none';
    }
  }

  // Support Joiner fields for QA Feedback
  if (joinerSection) joinerSection.style.display = type === 'QA Feedback' ? '' : 'none';

  // ZTP: use prefetched catalog data instead of network fetch
  if (ztpSection) ztpSection.style.display = type === 'ZTP Coaching' ? '' : 'none';
  if (type === 'ZTP Coaching') {
    _compassPopulateZtpFromCache();
    if (sessionGoalSection) sessionGoalSection.style.display = 'none';
  }

  if (rcaSection) rcaSection.style.display = type === 'QA Feedback' ? '' : 'none';
  if (jobIdSection) jobIdSection.style.display = type === 'QA Feedback' ? '' : 'none';

  if (type === 'QA Feedback') {
    if (sessionGoalSection) sessionGoalSection.style.display = 'none';
    // Use prefetched RCA data instead of network fetch
    _compassPopulateRcaFromCache();
  }
}

// Performance: populate ZTP dropdown from prefetched cache (no network call)
function _compassPopulateZtpFromCache() {
  if (COMPASS._ztpCatalogReady && COMPASS._ztpCategories.length > 0) {
    const sel = COMPASS._formEls['compass-new-infraction-cat'] || document.getElementById('compass-new-infraction-cat');
    if (sel) {
      sel.innerHTML = '<option value="">\u2014 Select Category \u2014</option>' +
        COMPASS._ztpCategories.map(c => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('');
    }
  } else {
    // Fallback: fetch if prefetch hasn't completed yet
    compassLoadZtpCategories();
  }
}

// Performance: populate RCA L1 dropdown from prefetched cache (no network call)
function _compassPopulateRcaFromCache() {
  if (COMPASS._rcaCatalogReady && COMPASS._rcaData.length > 0) {
    const l1Select = COMPASS._formEls['compass-new-rca-l1'] || document.getElementById('compass-new-rca-l1');
    if (!l1Select) return;
    const l1Values = [...new Set(COMPASS._rcaData.map(r => r.level_1_category).filter(Boolean))].sort();
    l1Select.innerHTML = '<option value="">\u2014 Select L1 Category \u2014</option>' +
      l1Values.map(v => `<option value="${escapeAttr(v)}">${escapeHtml(v)}</option>`).join('');
    compassResetRCAFrom('l2');
  } else {
    // Fallback: fetch if prefetch hasn't completed yet
    compassInitRCACascade();
  }
}

// ===== Follow-Up Session: Parent Log Search =====

var _compassSearchParentLogsDebounced = _compassDebounce(compassSearchParentLogs, 150);

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
  } else if (type === 'Incident Report') {
    // Incident Report (Violation Tracker) auto-sets to "Compliance & Behavior"
    sessionGoal = 'Compliance & Behavior';
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

  // CAP level disabled — always empty (CAP will be a dedicated page)
  const capLevel = '';

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
    status: type === 'QA Feedback' ? 'Pending SME Review' : (COMPASS.AWARENESS_ONLY_TYPES.includes(type) ? 'Issued' : 'Pending Acknowledgement'),
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

    // Support Joiners (required for QA Feedback)
    const joiner1Ohr = document.getElementById('compass-new-joiner1')?.value || '';
    const joiner2Ohr = document.getElementById('compass-new-joiner2')?.value || '';
    if (!joiner1Ohr) { showToast('Please select Support Joiner 1', 'error'); return; }
    if (!joiner2Ohr) { showToast('Please select Support Joiner 2', 'error'); return; }
    const joiner1Emp = COMPASS.employees.find(e => e.ohr_id === joiner1Ohr);
    // Legacy io_coaching uses sme_joiner + sme_meta_email for joiner 1
    record.sme_joiner = joiner1Emp ? joiner1Emp.full_name : joiner1Ohr;
    record.sme_meta_email = joiner1Emp ? (joiner1Emp.meta_email || '') : '';
    // Joiner 2: handle "No Other Joining Support" (__none__)
    if (joiner2Ohr === '__none__') {
      record.sme_joiner_2 = '';
      record.sme_joiner_2_email = '';
    } else {
      const joiner2Emp = COMPASS.employees.find(e => e.ohr_id === joiner2Ohr);
      record.sme_joiner_2 = joiner2Emp ? joiner2Emp.full_name : joiner2Ohr;
      record.sme_joiner_2_email = joiner2Emp ? (joiner2Emp.meta_email || '') : '';
    }
  }

  if (type === 'Incident Report') {
    // Violation Tracker fields
    const incidentTs = document.getElementById('compass-new-incident-ts')?.value || '';
    if (!incidentTs) { showToast('Please enter the incident timestamp', 'error'); return; }
    record.incident_timestamp = new Date(incidentTs).toISOString();
    record.violation_type = document.getElementById('compass-new-violation-cat')?.value || '';
    if (!record.violation_type) { showToast('Please select a violation category', 'error'); return; }
    const specificViolation = document.getElementById('compass-new-violation-type')?.value || '';
    if (!specificViolation) { showToast('Please select a specific violation', 'error'); return; }
    record.violation_subtype = specificViolation;
    const subtypeVal = document.getElementById('compass-new-violation-subtype')?.value || '';
    if (subtypeVal) record.violation_subtype += ' - ' + subtypeVal;
  }

  // Group Coaching: create one log per coachee
  if (type === 'Group Coaching' && coacheeList.length > 0) {
    let successCount = 0;
    let failCount = 0;
    const createdIds = [];

    for (const item of coacheeList) {
      const emp = item.emp || COMPASS.employees.find(e => e.ohr_id === item.ohr);
      const individualRecord = {
        coaching_type: 'General Coaching',
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
        const gId = created?.coaching_id || created?.id;
        createdIds.push(gId);
        successCount++;
        // #1 Notification: coaching_issued → notify each group coachee
        try {
          createNotification({
            type: 'coaching_issued',
            title: 'New Coaching Log',
            message: `You received a General Coaching from ${coach ? coach.full_name : 'Coach'} — ${sessionGoal}`,
            target_ohr: item.ohr,
            metadata: { coaching_id: gId, coaching_type: 'General Coaching', coach: coach ? coach.full_name : '', coachee: item.name }
          });
        } catch (notifErr) { console.error('[Notif] group coaching_issued error:', notifErr); }
      } catch (e) {
        failCount++;
        console.error(`Failed to create log for ${item.name}:`, e);
      }
    }

    if (successCount > 0) {
      showToast(`${successCount} coaching log${successCount > 1 ? 's' : ''} created successfully${failCount > 0 ? ` (${failCount} failed)` : ''}`, failCount > 0 ? 'warning' : 'success');
      _compassShowInlineSuccessMsg(`${successCount} log${successCount > 1 ? 's' : ''} created`);
    } else {
      showToast('Failed to create coaching logs', 'error');
    }
    // Keep inline form open for consecutive entries — just reset fields
    _compassResetFormFieldsForNext();
    await compassFetchLogs();
    return;
  }

  // CAP 1-3 NTE flow disabled — CAP will be a dedicated page under Compass
  const shouldOpenNte = false;
  if (shouldOpenNte) {
    // NTE flow placeholder — will be reimplemented in dedicated CAP page
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
    _compassShowInlineSuccessMsg('Log created: ' + (record.coachee || 'Unknown'));

    // #1 Notification: coaching_issued → notify coachee (+ supervisor for ZTP/Incident)
    try {
      const coacheeName = record.coachee || 'Coachee';
      const coachName = record.coach || 'Coach';
      const goalTag = record.session_goal ? ` — ${record.session_goal}` : '';
      const isHighWeight = (record.coaching_type === 'ZTP Coaching' || record.coaching_type === 'Incident Report');
      const notifTitle = isHighWeight
        ? (record.coaching_type === 'ZTP Coaching' ? 'ZTP Infraction Issued' : 'Incident Report Filed')
        : 'New Coaching Log';
      const notifMsg = isHighWeight
        ? `[HIGH PRIORITY] You received a ${record.coaching_type} from ${coachName}${goalTag}`
        : `You received a ${record.coaching_type} from ${coachName}${goalTag}`;
      createNotification({
        type: 'coaching_issued',
        title: notifTitle,
        message: notifMsg,
        target_ohr: record.coachee_ohr,
        metadata: { coaching_id: newId, coaching_type: record.coaching_type, coach: coachName, coachee: coacheeName, high_weight: isHighWeight }
      });
      // For ZTP/Incident: also notify coachee's supervisor
      if (isHighWeight && record.coachee_sup) {
        const supEmp = COMPASS.employees.find(e => e.full_name === record.coachee_sup);
        if (supEmp) {
          createNotification({
            type: 'coaching_issued',
            title: notifTitle,
            message: `[HIGH PRIORITY] ${coacheeName} received a ${record.coaching_type} from ${coachName}${goalTag}`,
            target_ohr: supEmp.ohr_id,
            metadata: { coaching_id: newId, coaching_type: record.coaching_type, coach: coachName, coachee: coacheeName, high_weight: true }
          });
        }
      }
    } catch (notifErr) { console.error('[Notif] coaching_issued error:', notifErr); }

    // Keep inline form open for consecutive entries — just reset fields
    _compassResetFormFieldsForNext();
    await compassFetchLogs();
  } catch (e) {
    console.error('Failed to create coaching log:', e);
    showToast('Failed to create coaching log: ' + e.message, 'error');
  }
}

function compassCloseForm() {
  // Close the modal overlay (used for detail views)
  const overlay = document.getElementById('compass-form-overlay');
  if (overlay) overlay.style.display = 'none';
  // Also collapse the inline add panel if open
  const inlinePanel = document.getElementById('compass-inline-add');
  if (inlinePanel && inlinePanel.style.display !== 'none') {
    compassCollapseInlineAdd();
  }
  COMPASS.editingId = null;
  if (COMPASS._formBuilt && !document.getElementById('compass-new-type')) {
    COMPASS._formBuilt = false;
    COMPASS._formEls = {};
  }
  COMPASS.selectedParentLog = null;
  _compassDetailStack = [];
}

// Reset form fields after successful submit, keeping the form open for consecutive entries
function _compassResetFormFieldsForNext() {
  _compassResetFormFields();
  // Re-apply the type change so conditional sections are correctly shown
  const type = COMPASS._inlineSelectedType || COMPASS._selectedType;
  const typeInput = document.getElementById('compass-new-type');
  if (typeInput && type) {
    typeInput.value = type;
    compassOnTypeChange();
  }
  // Focus the coachee search field for quick next entry
  const coacheeSearch = document.getElementById('compass-coachee-search');
  if (coacheeSearch && coacheeSearch.offsetParent !== null) {
    setTimeout(() => coacheeSearch.focus(), 100);
  }
}

// Show a brief success message in the inline footer
function _compassShowInlineSuccessMsg(msg) {
  const el = document.getElementById('compass-inline-success-msg');
  if (!el) return;
  el.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--compass-success)"><polyline points="20 6 9 17 4 12"/></svg> ${escapeHtml(msg)}`;
  el.className = 'submit-success-msg';
  // Auto-clear after 5 seconds
  setTimeout(() => { if (el) el.innerHTML = ''; }, 5000);
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
  const query = document.getElementById('compass-multi-coachee-search')?.value || '';
  _compassRenderMultiDropdownItems('compass-multi-coachee-options', COMPASS.employees, query);
}

var _compassFilterMultiCoacheesDebounced = _compassDebounce(compassFilterMultiCoachees, 120);

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

// Admin view mode: 'all' = see everything, 'tl' = TL-scoped view
if (typeof COMPASS !== 'undefined') COMPASS.viewMode = 'all';

function compassSetViewMode(mode) {
  COMPASS.viewMode = mode;
  COMPASS.pageGiven = 1;
  COMPASS.pageReceived = 1;
  // Update toggle button styles
  const btnAll = document.getElementById('compass-toggle-all');
  const btnTL = document.getElementById('compass-toggle-tl');
  if (btnAll && btnTL) {
    if (mode === 'all') {
      btnAll.style.background = '#1a365d'; btnAll.style.color = '#fff';
      btnTL.style.background = '#f8fafc'; btnTL.style.color = '#64748b';
    } else {
      btnTL.style.background = '#1a365d'; btnTL.style.color = '#fff';
      btnAll.style.background = '#f8fafc'; btnAll.style.color = '#64748b';
    }
  }
  // Re-run the omnibar filter pipeline (which includes role-based splitting)
  if (typeof compassApplyNow === 'function') {
    compassApplyNow();
  } else {
    compassApplyFilters();
  }
}

// Performance: lazy-load compass-violations.js on first Compass open
function _compassLazyLoadViolations() {
  if (typeof HR_VIOLATIONS !== 'undefined' || COMPASS._violationsLoading) return;
  COMPASS._violationsLoading = true;
  const script = document.createElement('script');
  script.src = 'js/compass-violations.js?v=102g';
  script.onload = () => { COMPASS._violationsLoading = false; };
  script.onerror = () => { COMPASS._violationsLoading = false; console.error('Failed to lazy-load compass-violations.js'); };
  document.head.appendChild(script);
}

async function initCompass() {
  await compassFetchEmployees();
  await compassFetchLogs();

  // Performance: lazy-load HR_VIOLATIONS catalog (non-blocking)
  _compassLazyLoadViolations();

  // Performance: prefetch ZTP + RCA catalogs in background (no await — non-blocking)
  compassPrefetchCatalogs();

  const isAgent = currentUser && currentUser.actual_role === 'Agent' && currentUser.ohr_id !== '740045023';
  const isAdmin740 = currentUser && currentUser.ohr_id === '740045023';

  // Initialize dual-table pagination
  COMPASS.pageGiven = 1;
  COMPASS.pageReceived = 1;
  COMPASS.viewMode = 'all'; // default for admin

  // Hide "Add" button for Agents (all other roles can create coaching logs)
  const newBtn = document.getElementById('compass-new-btn');
  if (newBtn) {
    newBtn.style.display = isAgent ? 'none' : '';
  }

  // Show view toggle only for admin (740045023)
  const viewToggle = document.getElementById('compass-view-toggle');
  if (viewToggle) {
    viewToggle.style.display = isAdmin740 ? 'flex' : 'none';
  }

  // Export CSV button: Managers get dropdown (Filtered / All), others get simple button
  const exportWrapper = document.getElementById('compass-export-wrapper');
  const exportBtn = document.getElementById('compass-export-btn');
  const exportDropdown = document.getElementById('compass-export-dropdown');
  const isManager = isAdmin740 || (currentUser && currentUser.actual_role === 'Manager');
  if (exportWrapper && exportBtn) {
    if (isAgent) {
      // Agents don't see the export button
      exportWrapper.style.display = 'none';
    } else if (isManager) {
      // Managers: show dropdown toggle
      exportBtn.classList.add('has-dropdown');
      exportBtn.removeAttribute('onclick');
      exportBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Export CSV <span class="dropdown-arrow">▾</span>`;
      exportBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        const dd = document.getElementById('compass-export-dropdown');
        dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
      });
      // Close dropdown on outside click
      document.addEventListener('click', function() {
        if (exportDropdown) exportDropdown.style.display = 'none';
      });
    }
    // Non-managers: default simple button (onclick already set in HTML)
  }

  compassApplyFilters();
}

// QA toggle handler for Disputes Area
function disputesSetQaMode(mode) {
  COMPASS._disputesQaMode = mode;
  // Update toggle button active states
  document.querySelectorAll('#disputes-qa-toggle .disputes-toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  // Reset pagination and re-render
  COMPASS._kanbanPages = {};
  compassRenderKanban();
}

async function initCompassDisputes() {
  await compassFetchEmployees();
  await compassFetchLogs();

  // Show QA toggle only for QA role
  const role = currentUser ? currentUser.actual_role : '';
  const isOwner = currentUser && currentUser.ohr_id === '740045023';
  const qaToggle = document.getElementById('disputes-qa-toggle');
  if (qaToggle) {
    qaToggle.style.display = (role === 'Quality & Policy Expert') ? 'inline-flex' : 'none';
  }
  // Default QA mode
  COMPASS._disputesQaMode = 'all';

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
  const search = document.getElementById('compass-coachee-search')?.value || '';
  const roleFilter = COMPASS._triadRoleFilter || null;
  _compassRenderDropdownItems('compass-coachee-dropdown', COMPASS.employees, search, 'compassSelectCoachee', roleFilter);
  const dropdown = document.getElementById('compass-coachee-dropdown');
  if (dropdown) dropdown.style.display = 'block';
}

// Debounced version for oninput
var _compassFilterCoacheesDebounced = _compassDebounce(compassFilterCoachees, 120);

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
  const search = document.getElementById('compass-triad-coachee-search')?.value || '';
  _compassRenderDropdownItems('compass-triad-coachee-dropdown', COMPASS.employees, search, 'compassSelectTriadCoachee', null);
  const dropdown = document.getElementById('compass-triad-coachee-dropdown');
  if (dropdown) dropdown.style.display = 'block';
}

var _compassFilterTriadCoacheesDebounced = _compassDebounce(compassFilterTriadCoachees, 120);

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
  const el = COMPASS._formEls || {};
  for (let i = startIdx; i < levels.length; i++) {
    const sel = el[`compass-new-rca-${levels[i]}`] || document.getElementById(`compass-new-rca-${levels[i]}`);
    if (sel) {
      sel.innerHTML = `<option value="">${placeholders[levels[i]]}</option>`;
      sel.disabled = true;
    }
  }
  // Reset guidelines
  const guidelinesDiv = el['compass-new-guidelines'] || document.getElementById('compass-new-guidelines');
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

// Goals to hide for "General Coaching" and "Incident Report" types
const NEW_SESSION_HIDDEN_GOALS = ['Coaching Observation', 'Quality Error Findings'];

function compassFilterGoalOptions(type) {
  const dropdown = document.getElementById('compass-goal-dropdown');
  if (!dropdown) return;
  const labels = dropdown.querySelectorAll('label.multi-select-option');
  labels.forEach(label => {
    const goalName = label.getAttribute('data-goal');
    if ((type === 'General Coaching' || type === 'Incident Report') && NEW_SESSION_HIDDEN_GOALS.includes(goalName)) {
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
  try {
  let log = COMPASS.logs.find(l => String(l.coaching_id || l.id) === String(coachingId));
  if (!log) { console.warn('[Disputes] Log not found for ID:', coachingId, 'Total logs:', COMPASS.logs.length); return; }
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

  // Aging info for header
  const aging = _disputesCalcAging(log);
  const levelIdx = _disputesGetLevelIndex(log);
  const levelLabel = `LV${levelIdx + 1}`;

  titleEl.innerHTML = `<span style="font-family:'SF Mono','Fira Code',monospace;font-size:14px;">${escapeHtml(log.coaching_id || '#' + log.id)}</span>
    <span class="kanban-card-aging ${aging.cls}" style="font-size:11px;">${aging.label}</span>`;

  const date = log.coaching_date ? new Date(log.coaching_date).toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '—';
  const statusColor = COMPASS.STATUS_COLORS[log.status] || 'var(--compass-text-muted)';

  // ===== HEADER CARD =====
  const typeIcon = log.coaching_type === 'QA Feedback' ? '\uD83D\uDCCB' : log.coaching_type === 'ZTP Coaching' ? '\uD83D\uDD12' : log.coaching_type === 'Incident Report' ? '\u26A0\uFE0F' : '\uD83D\uDCAC';
  let html = `<div class="cdp-header">`;
  html += `<div class="cdp-header-icon" style="background:rgba(99,102,241,0.08);">${typeIcon}</div>`;
  html += `<div class="cdp-header-info">`;
  html += `<div class="cdp-header-title">${escapeHtml(log.coachee || 'Employee')}</div>`;
  html += `<div class="cdp-header-sub">${escapeHtml(log.coaching_type || '')} &middot; ${date} &middot; ${levelLabel}</div>`;
  html += `</div>`;
  html += `<div class="cdp-header-actions">`;
  html += `<span style="display:inline-block;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:600;color:${statusColor};background:${statusColor}14;">${escapeHtml(log.status || '—')}</span>`;
  html += `</div></div>`;

  // ===== SECTION 1: SESSION DETAILS =====
  html += `<div class="cdp-section"><div class="cdp-section-title">Session Details</div>`;
  html += `<div class="cdp-grid">`;
  html += `<div class="cdp-field"><div class="cdp-field-label">Coachee</div><div class="cdp-field-value">${escapeHtml(log.coachee || '—')} (${escapeHtml(log.coachee_ohr || '')})</div></div>`;
  html += `<div class="cdp-field"><div class="cdp-field-label">Coach</div><div class="cdp-field-value">${escapeHtml(log.coach || '—')}</div></div>`;
  if (log.coaching_type === 'QA Feedback' && log.job_id) {
    html += `<div class="cdp-field"><div class="cdp-field-label">Job ID</div><div class="cdp-field-value" style="font-family:monospace;">${escapeHtml(log.job_id)}</div></div>`;
  }
  if (log.coachee_sup && log.coach !== log.coachee_sup) {
    html += `<div class="cdp-field"><div class="cdp-field-label">Coachee Supervisor</div><div class="cdp-field-value">${escapeHtml(log.coachee_sup)}</div></div>`;
  }
  if (log.session_goal) {
    html += `<div class="cdp-field cdp-grid-full"><div class="cdp-field-label">Session Goal</div><div class="cdp-field-value">${escapeHtml(log.session_goal)}</div></div>`;
  }
  if (log.sme_joiner) {
    html += `<div class="cdp-field"><div class="cdp-field-label">Support Joiner 1</div><div class="cdp-field-value">${escapeHtml(log.sme_joiner)}</div></div>`;
  }
  if (log.sme_joiner_2) {
    html += `<div class="cdp-field"><div class="cdp-field-label">Support Joiner 2</div><div class="cdp-field-value">${escapeHtml(log.sme_joiner_2)}</div></div>`;
  }
  html += `</div>`;
  html += `<div class="cdp-field cdp-grid-full" style="margin-top:6px;border-top:1px solid rgba(0,0,0,0.06);padding-top:8px;"><div class="cdp-field-label">Coaching Details</div><div class="cdp-field-value multiline">${log.coaching_details || '—'}</div></div>`;
  // Attachments
  html += compassRenderAttachmentsDetail(log);
  html += '</div>';

  // ===== SECTION 2: ROOT CAUSE ANALYSIS (QA Feedback only) =====
  if (log.coaching_type === 'QA Feedback') {
    html += `<div class="cdp-section"><div class="cdp-section-title">Root Cause Analysis</div>`;
    html += `<div class="cdp-grid">`;
    html += `<div class="cdp-field"><div class="cdp-field-label">L1 Category</div><div class="cdp-field-value">${escapeHtml(log.level_1_category || '—')}</div></div>`;
    html += `<div class="cdp-field"><div class="cdp-field-label">L2 Direct Cause</div><div class="cdp-field-value">${escapeHtml(log.level_2_direct_cause || '—')}</div></div>`;
    html += `<div class="cdp-field"><div class="cdp-field-label">L3 Contributing</div><div class="cdp-field-value">${escapeHtml(log.level_3_contributing_cause || '—')}</div></div>`;
    html += `<div class="cdp-field"><div class="cdp-field-label">L4 Deficiency</div><div class="cdp-field-value">${escapeHtml(log.level_4_deficiency || '—')}</div></div>`;
    html += `<div class="cdp-field"><div class="cdp-field-label">L5 Root Cause</div><div class="cdp-field-value">${escapeHtml(log.level_5_root_cause || '—')}</div></div>`;
    html += `<div class="cdp-field cdp-grid-full"><div class="cdp-field-label">RCA Description</div><div class="cdp-field-value multiline">${escapeHtml(log.guidelines || '—')}</div></div>`;
    html += `</div>`;
    const mdStatusColor = COMPASS.STATUS_COLORS[log.status] || 'var(--fg-muted)';
    html += `<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(0,0,0,0.06);display:flex;align-items:center;gap:8px;"><span class="cdp-field-label" style="margin:0;">Markdown Status</span><span style="font-weight:600;font-size:13px;color:${mdStatusColor};">${escapeHtml(log.status || '—')}</span></div>`;
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
      html += `<div class="cdp-section"><div class="cdp-section-title">Dispute Trail</div>`;
      html += disputesRenderTrailEntries(log);
      html += '</div>';
    }
  }

  bodyEl.innerHTML = html;

  // Footer actions based on role and status
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  let footerHtml = '';

  if (cu) {
    const role = cu.actual_role;
    const isAdmin = cu.ohr_id === '740045023';
    // Angelo Nieva (QTP Manager) — override access to ALL dispute levels
    const isQTPManager = cu.ohr_id === '740049863';

    // Helper: check if current user is one of the support joiners for this log
    const cuName = (cu.full_name || '').trim();
    const isSupportJoiner = cuName && (
      (log.sme_joiner || '').trim() === cuName ||
      (log.sme_joiner_2 || '').trim() === cuName
    );

    // Helper: check if current user is the coach who filed this log
    const isCoach = cu.ohr_id === log.coach_ohr;

    // Helper: check if current user is a Trainer whose PG matches the coachee's PG
    const isMatchingTrainer = role === 'Trainer' && cu.planning_group && log.coachee_pg &&
      (cu.planning_group === 'MULTIPLE' || cu.planning_group === log.coachee_pg);

    // LV1 - Support Joiner 1 & 2 only: Accept Markdown / Dispute Markdown
    if (isSupportJoiner || isQTPManager || isAdmin) {
      if (log.status === 'Pending SME Review') {
        footerHtml += ' <button class="btn btn-success btn-sm" onclick="disputesShowAcceptMarkdown()">Accept Markdown</button>';
        footerHtml += ' <button class="btn btn-danger btn-sm" onclick="disputesShowDisputeMarkdown()">Dispute Markdown</button>';
      }
    }

    // LV2 - Coach only: Reverse Markdown / Retain Markdown
    if (isCoach || isQTPManager || isAdmin) {
      if (log.status === 'Markdown Disputed' || log.status === 'Markdown Disputed - SME') {
        footerHtml += ' <button class="btn btn-success btn-sm" onclick="disputesShowReverseMarkdown()">Reverse Markdown</button>';
        footerHtml += ' <button class="btn btn-warning btn-sm" onclick="disputesShowRetainMarkdown()">Retain Markdown</button>';
      }
    }

    // LV3 - Support Joiner 1 & 2 only: Accept Decision / Reject Decision
    if (isSupportJoiner || isQTPManager || isAdmin) {
      if (log.status === 'Markdown Retained - QA') {
        footerHtml += ' <button class="btn btn-success btn-sm" onclick="disputesShowQADecisionAccepted()">Accept Decision</button>';
        footerHtml += ' <button class="btn btn-danger btn-sm" onclick="disputesShowQADecisionRejected()">Reject Decision</button>';
      }
    }

    // LV4 - Trainers whose PG matches coachee's PG: Reverse Markdown / Retain Markdown
    if (isMatchingTrainer || isQTPManager || isAdmin) {
      if (log.status === 'QA Decision Rejected' || log.status === 'QA Decision Rejected - SME') {
        footerHtml += ' <button class="btn btn-success btn-sm" onclick="disputesShowLV4ReverseMarkdown()">Reverse Markdown</button>';
        footerHtml += ' <button class="btn btn-warning btn-sm" onclick="disputesShowLV4RetainMarkdown()">Retain Markdown</button>';
      }
    }

    // LV5 - Support Joiner 1 & 2 only: Accept Decision / Reject Decision
    if (isSupportJoiner || isQTPManager || isAdmin) {
      if (log.status === 'Markdown Retained - Trainer') {
        footerHtml += ' <button class="btn btn-success btn-sm" onclick="disputesShowLV5AcceptDecision()">Accept Decision</button>';
        footerHtml += ' <button class="btn btn-danger btn-sm" onclick="disputesShowLV5RejectDecision()">Reject Decision</button>';
      }
    }

    // LV6 - QTP Manager Angelo Nieva only: Reverse Markdown / Retain Markdown
    if (isQTPManager || isAdmin) {
      if (log.status === 'Trainer Decision Rejected' || log.status === 'Trainer Decision Rejected - SME') {
        footerHtml += ' <button class="btn btn-success btn-sm" onclick="disputesShowLV6ReverseMarkdown()">Reverse Markdown</button>';
        footerHtml += ' <button class="btn btn-warning btn-sm" onclick="disputesShowLV6RetainMarkdown()">Retain Markdown</button>';
      }
    }
  }

  footerEl.innerHTML = footerHtml;
  // Open side panel
  overlay.classList.add('active');
  // display is controlled by .active class (display:none -> display:flex)
  const wrapper = document.getElementById('disputes-layout-wrapper');
  if (wrapper) wrapper.classList.add('panel-open');
  } catch (err) {
    console.error('[Disputes] Error opening detail:', err);
    alert('Error opening dispute detail: ' + err.message);
  }
}

function disputesCloseDetail() {
  const overlay = document.getElementById('disputes-detail-overlay');
  if (overlay) { overlay.classList.remove('active'); }
  const wrapper = document.getElementById('disputes-layout-wrapper');
  if (wrapper) wrapper.classList.remove('panel-open');
  _disputesEditingId = null;
}

function disputesCloseAction() {
  // Close legacy modal (kept as fallback)
  const overlay = document.getElementById('disputes-action-overlay');
  if (overlay) overlay.classList.remove('active');
  // Close inline action panel
  disputesCollapseInlineAction();
}

function disputesCollapseInlineAction() {
  const panel = document.getElementById('disputes-inline-action');
  if (panel) panel.classList.remove('open');
}

// Helper: open inline action panel and return element refs
function _disputesOpenInlineAction(title) {
  const panel = document.getElementById('disputes-inline-action');
  const titleEl = document.getElementById('disputes-inline-action-title');
  const bodyEl = document.getElementById('disputes-inline-action-body');
  const footerEl = document.getElementById('disputes-inline-action-footer');
  if (titleEl) titleEl.textContent = title;
  if (panel) {
    panel.classList.add('open');
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  return { titleEl, bodyEl, footerEl };
}

// ===== LV1: Dispute Markdown Popout =====

// ===== Dispute Notification Helper =====
// Centralised function to fire dispute notifications based on level and action.
// Recipients are determined by the dispute level and the action taken.
function disputeNotify(log, notifType, message, recipients) {
  const cid = log.coaching_id || log.id;
  const isHighWeight = (log.coaching_type === 'ZTP Coaching' || log.coaching_type === 'Incident Report');
  const prefix = isHighWeight ? '[HIGH PRIORITY] ' : '';
  const title = isHighWeight ? 'Dispute Update — ' + log.coaching_type : 'Dispute Update';
  for (const ohr of recipients) {
    if (!ohr) continue;
    try {
      createNotification({
        type: notifType,
        title: title,
        message: prefix + message,
        target_ohr: ohr,
        metadata: { coaching_id: cid, coachee: log.coachee, coach: log.coach, status: log.status, coaching_type: log.coaching_type, high_weight: isHighWeight }
      });
    } catch (e) { console.error('[Notif] dispute notify error:', e); }
  }
}

// Resolve OHR from name using COMPASS.employees
function resolveOhr(name) {
  if (!name) return null;
  const emp = COMPASS.employees.find(e => e.full_name === name);
  return emp ? emp.ohr_id : null;
}

var _disputeAttachedFiles = [];

function disputesShowDisputeMarkdown() {
  const { bodyEl, footerEl } = _disputesOpenInlineAction('Dispute Markdown');

  _disputeAttachedFiles = [];
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

    // #4 Notification: dispute_initiated → notify coach + coach's supervisor
    const cid = log.coaching_id || log.id;
    const coacheeName = log.coachee || 'Coachee';
    disputeNotify(log, 'dispute_initiated', `${coacheeName} disputed coaching ${cid}`, [
      log.coach_ohr,
      resolveOhr(log.coach_sup)
    ]);

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
  const { bodyEl, footerEl } = _disputesOpenInlineAction('Accept Markdown');
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

    // #5 Notification: L2 accept → notify coachee (markdown accepted, sent for ack)
    const cid = log.coaching_id || log.id;
    disputeNotify(log, 'dispute_l2_decision', `Your coaching ${cid} was accepted by the SME. Please acknowledge.`, [
      log.coachee_ohr
    ]);
    // Dispute Resolution Summary → notify TL
    try {
      const coacheeName = log.coachee || 'Coachee';
      const tlOhr = log.coach_sup ? (appState.employees || []).find(e => e.full_name === log.coach_sup)?.ohr_id : null;
      if (tlOhr) {
        createNotification({ type: 'dispute_resolved', title: `Dispute Resolved — ${coacheeName}`, message: `Dispute on ${cid} resolved at L2: SME accepted markdown. Sent to coachee for acknowledgement.`, target_ohr: tlOhr, metadata: { coaching_id: cid, outcome: 'Accepted', level: 'L2' } });
      }
    } catch (e) { console.error('[Notif] dispute_resolved error:', e); }

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
    return '<p class="disputes-trail-empty">No dispute entries recorded.</p>';
  }

  let html = '<div class="disputes-trail">';
  entries.forEach((entry, idx) => {
    const isLast = idx === entries.length - 1;
    html += `<div class="disputes-trail-entry${isLast ? ' last' : ''}">`;
    html += '<div class="disputes-trail-dot"></div>';
    html += `<div class="disputes-trail-meta">${escapeHtml(entry.timestamp)} \u2014 <strong>${escapeHtml(entry.actor)}</strong></div>`;
    html += `<div class="disputes-trail-message">${escapeHtml(entry.message)}</div>`;
    if (entry.attachmentLine) {
      const fileNames = entry.attachmentLine.split(',').map(f => f.trim());
      html += '<div class="disputes-trail-attachments">';
      fileNames.forEach(fn => {
        const att = disputeAttachments.find(a => a.name === fn);
        if (att && att.url) {
          html += `<a href="${escapeAttr(att.url)}" target="_blank" download="${escapeAttr(fn)}" class="disputes-trail-file">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            ${escapeHtml(fn)}
          </a>`;
        } else {
          html += `<span class="disputes-trail-file muted">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            ${escapeHtml(fn)}
          </span>`;
        }
      });
      html += '</div>';
    }
    html += '</div>';
  });
  html += '</div>';

  return html;
}

// ===== LV2: Retain Markdown Popout =====

function disputesShowRetainMarkdown() {
  const { bodyEl, footerEl } = _disputesOpenInlineAction('Retain Markdown');
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

    // #7 Notification: L2 retain → notify coachee + coach (escalated to LV3)
    const cid7 = log.coaching_id || log.id;
    disputeNotify(log, 'dispute_l3_decision', `Dispute on ${cid7} was retained by the SME. Escalated to LV3.`, [
      log.coachee_ohr,
      log.coach_ohr
    ]);

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
  const { bodyEl, footerEl } = _disputesOpenInlineAction('Reverse Markdown');
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

    // #6 Notification: L2 reverse → notify coachee (markdown reversed)
    const cid6 = log.coaching_id || log.id;
    disputeNotify(log, 'dispute_l2_decision', `Your dispute on ${cid6} was reversed by the coach. Sent for acknowledgement.`, [
      log.coachee_ohr
    ]);
    // Dispute Resolution Summary → notify TL
    try {
      const coacheeName = log.coachee || 'Coachee';
      const tlOhr = log.coach_sup ? (appState.employees || []).find(e => e.full_name === log.coach_sup)?.ohr_id : null;
      if (tlOhr) {
        createNotification({ type: 'dispute_resolved', title: `Dispute Resolved — ${coacheeName}`, message: `Dispute on ${cid6} resolved at L2: Coach reversed markdown. Sent to coachee for acknowledgement.`, target_ohr: tlOhr, metadata: { coaching_id: cid6, outcome: 'Reversed', level: 'L2' } });
      }
    } catch (e) { console.error('[Notif] dispute_resolved error:', e); }
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
  const { bodyEl, footerEl } = _disputesOpenInlineAction('Accept Decision');
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

    // #8 Notification: L3 QA decision accepted → notify coachee + coach
    const cid8 = log.coaching_id || log.id;
    disputeNotify(log, 'dispute_l3_decision', `QA decision on ${cid8} was accepted by the SME. Sent for acknowledgement.`, [
      log.coachee_ohr,
      log.coach_ohr
    ]);

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
  const { bodyEl, footerEl } = _disputesOpenInlineAction('Reject Decision');
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

    // #9 Notification: L3 QA decision rejected → notify coachee + coach + SME joiner (escalated to LV4)
    const cid9 = log.coaching_id || log.id;
    disputeNotify(log, 'dispute_l4_decision', `QA decision on ${cid9} was rejected. Escalated to LV4 — Pending Trainer Decision.`, [
      log.coachee_ohr,
      log.coach_ohr,
      resolveOhr(log.sme_joiner)
    ]);

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
  const { bodyEl, footerEl } = _disputesOpenInlineAction('Accept Decision');
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

    // #10 Notification: L5 trainer decision accepted → notify coachee + coach + SME joiner + QA
    const cid10 = log.coaching_id || log.id;
    disputeNotify(log, 'dispute_l5_decision', `Trainer decision on ${cid10} was accepted. Sent for acknowledgement.`, [
      log.coachee_ohr,
      log.coach_ohr,
      resolveOhr(log.sme_joiner),
      resolveOhr(log.sme_joiner_2)
    ]);

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
  const { bodyEl, footerEl } = _disputesOpenInlineAction('Reject Decision');
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
}

async function disputesSubmitQADecisionRejected(){
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

    // #10b Notification: L5 trainer decision rejected → notify coachee + coach + SME joiner + QA (escalated to LV6)
    const cid10b = log.coaching_id || log.id;
    disputeNotify(log, 'dispute_l5_decision', `Trainer decision on ${cid10b} was rejected. Escalated to LV6 — Pending QTP Manager Decision.`, [
      log.coachee_ohr,
      log.coach_ohr,
      resolveOhr(log.sme_joiner),
      resolveOhr(log.sme_joiner_2)
    ]);

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
  const { bodyEl, footerEl } = _disputesOpenInlineAction('Retain Markdown');
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

    // #9b Notification: L4 trainer retains → notify coachee + coach + SME joiner (escalated to LV5)
    const cid9b = log.coaching_id || log.id;
    disputeNotify(log, 'dispute_l4_decision', `Trainer retained markdown on ${cid9b}. Escalated to LV5 — Pending SME-Trainer Decision.`, [
      log.coachee_ohr,
      log.coach_ohr,
      resolveOhr(log.sme_joiner)
    ]);

    disputesCloseAction();
    disputesCloseDetail();
    await compassFetchLogs();
    compassRenderKanban();
  } catch (e) {
    showToast('Failed to retain markdown: ' + e.message, 'error');
  }
}

// ===== LV4: Trainer Decision — Reverse Markdown (popout confirmation → Coachee acknowledgement) =====

function disputesShowLV6ReverseMarkdown() {
  const { bodyEl, footerEl } = _disputesOpenInlineAction('Reverse Markdown');
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

    // #9c Notification: L4 trainer reverses → notify coachee + coach + SME joiner
    const cid9c = log.coaching_id || log.id;
    disputeNotify(log, 'dispute_l4_decision', `Trainer reversed markdown on ${cid9c}. Sent for acknowledgement.`, [
      log.coachee_ohr,
      log.coach_ohr,
      resolveOhr(log.sme_joiner)
    ]);

    disputesCloseAction();
    disputesCloseDetail();
    await compassFetchLogs();
    compassRenderKanban();
  } catch (e) {
    showToast('Failed to reverse markdown: ' + e.message, 'error');
  }
}

// ===== LV6: QTP Manager Decision — Reverse Markdown (confirmation → Markdown Reversed - QTP Manager) =====

function disputesShowLV4ReverseMarkdown() {
  const { bodyEl, footerEl } = _disputesOpenInlineAction('Reverse Markdown');
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

    // #11a Notification: L6 QTP Manager reverses → notify all parties
    const cid11a = log.coaching_id || log.id;
    disputeNotify(log, 'dispute_l6_decision', `QTP Manager reversed markdown on ${cid11a}. Final decision: Reversed. Sent for acknowledgement.`, [
      log.coachee_ohr,
      log.coach_ohr,
      resolveOhr(log.sme_joiner),
      resolveOhr(log.sme_joiner_2)
    ]);
    // Dispute Resolution Summary → notify TL
    try {
      const coacheeName = log.coachee || 'Coachee';
      const tlOhr = log.coach_sup ? (appState.employees || []).find(e => e.full_name === log.coach_sup)?.ohr_id : null;
      if (tlOhr) {
        createNotification({ type: 'dispute_resolved', title: `Dispute Resolved — ${coacheeName}`, message: `Dispute on ${cid11a} resolved: QTP Manager reversed markdown. Final decision reached.`, target_ohr: tlOhr, metadata: { coaching_id: cid11a, outcome: 'Reversed', level: 'L6' } });
      }
    } catch (e) { console.error('[Notif] dispute_resolved error:', e); }

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
  const { bodyEl, footerEl } = _disputesOpenInlineAction('Retain Markdown');
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

    // #11b Notification: L6 QTP Manager retains → notify all parties
    const cid11b = log.coaching_id || log.id;
    disputeNotify(log, 'dispute_l6_decision', `QTP Manager retained markdown on ${cid11b}. Final decision: Retained. Sent for acknowledgement.`, [
      log.coachee_ohr,
      log.coach_ohr,
      resolveOhr(log.sme_joiner),
      resolveOhr(log.sme_joiner_2)
    ]);
    // Dispute Resolution Summary → notify TL
    try {
      const coacheeName = log.coachee || 'Coachee';
      const tlOhr = log.coach_sup ? (appState.employees || []).find(e => e.full_name === log.coach_sup)?.ohr_id : null;
      if (tlOhr) {
        createNotification({ type: 'dispute_resolved', title: `Dispute Resolved — ${coacheeName}`, message: `Dispute on ${cid11b} resolved: QTP Manager retained markdown. Final decision reached.`, target_ohr: tlOhr, metadata: { coaching_id: cid11b, outcome: 'Retained', level: 'L6' } });
      }
    } catch (e) { console.error('[Notif] dispute_resolved error:', e); }

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
  overlay.classList.add('active');

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



      <input type="hidden" id="nte-coaching-id" value="${escapeAttr(params.coaching_id)}">
      <input type="hidden" id="nte-issued-by" value="${escapeAttr(params.coach_name)}">
      <input type="hidden" id="nte-issued-by-ohr" value="${escapeAttr(params.coach_ohr)}">
    `;

    formFooter.innerHTML = `
      <button class="btn btn-outline btn-sm" onclick="COMPASS_PENDING_COACHING_RECORD = null; compassCloseForm();">Cancel</button>
      <button class="btn btn-primary btn-sm" onclick="compassSubmitNte()">Save NTE</button>
    `;

    overlay.classList.add('active');
}

async function compassSubmitNte() {
  const employeeName = document.getElementById('nte-employee-name')?.value;
  const ohrId = document.getElementById('nte-ohr-id')?.value;
  const capLevel = document.getElementById('nte-cap-level')?.value;
  const dateOfIncident = document.getElementById('nte-date-of-incident')?.value;
  const incidentDesc = document.getElementById('nte-incident-desc')?.innerHTML?.trim() || '';
  const policyViolated = document.getElementById('nte-policy-violated')?.innerHTML?.trim() || '';
  const expectedBehavior = '';
  const deadline = '';
  const issuedBy = document.getElementById('nte-issued-by')?.value || '';
  const issuedByOhr = document.getElementById('nte-issued-by-ohr')?.value || '';

  // Validation
  if (!dateOfIncident) { showToast('Please enter the date of incident', 'error'); return; }
  if (!incidentDesc || incidentDesc === '<br>') { showToast('Please describe the incident', 'error'); return; }
  if (!policyViolated || policyViolated === '<br>') { showToast('Please specify the policy violated', 'error'); return; }


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
      <h4 class="form-section-title">Incident Description</h4>
      <div style="padding:10px 14px; background:var(--bg-inset); border:1px solid var(--border); border-radius:var(--radius); font-size:13px; line-height:1.6; color:var(--fg);">${nte.incident_description || '<em style="color:var(--fg-muted);">Not provided</em>'}</div>
    </div>

    <div class="form-section">
      <h4 class="form-section-title">Policy / Standard Violated</h4>
      <div style="padding:10px 14px; background:var(--bg-inset); border:1px solid var(--border); border-radius:var(--radius); font-size:13px; line-height:1.6; color:var(--fg);">${nte.policy_violated || '<em style="color:var(--fg-muted);">Not provided</em>'}</div>
    </div>

    <div class="form-section">
      <div class="detail-row"><span class="detail-label">ISSUED BY</span><span class="detail-value">${escapeHtml(nte.issued_by || '')} ${nte.issued_by_ohr ? '(' + escapeHtml(nte.issued_by_ohr) + ')' : ''}</span></div>
      <div class="detail-row"><span class="detail-label">CREATED</span><span class="detail-value">${formatDate(nte.created_at)}</span></div>
    </div>
  `;

  formFooter.innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="compassCloseForm()">Close</button>
  `;

  overlay.classList.add('active');
}


// ===== Incident Report / Violation Tracker Functions =====

/**
 * Initialize the violation category dropdown from HR_VIOLATIONS data.
 * HR_VIOLATIONS is defined in compass-violations.js.
 */
function compassInitViolationCatalog() {
  if (typeof HR_VIOLATIONS === 'undefined') {
    console.error('HR_VIOLATIONS not loaded');
    return;
  }
  const catSelect = document.getElementById('compass-new-violation-cat');
  if (!catSelect) return;
  catSelect.innerHTML = '<option value="">\u2014 Select Violation Category \u2014</option>' +
    HR_VIOLATIONS.map(c => `<option value="${escapeAttr(c.category)}">${escapeHtml(c.category)}</option>`).join('');
  // Reset downstream
  const typeSelect = document.getElementById('compass-new-violation-type');
  if (typeSelect) typeSelect.innerHTML = '<option value="">\u2014 Select Violation \u2014</option>';
  const subtypeField = document.getElementById('compass-violation-subtype-field');
  if (subtypeField) subtypeField.style.display = 'none';
  const penaltyDiv = document.getElementById('compass-violation-penalty');
  if (penaltyDiv) penaltyDiv.style.display = 'none';
}

function compassOnViolationCatChange() {
  const catVal = document.getElementById('compass-new-violation-cat')?.value || '';
  const typeSelect = document.getElementById('compass-new-violation-type');
  if (!typeSelect) return;

  const cat = (typeof HR_VIOLATIONS !== 'undefined') ? HR_VIOLATIONS.find(c => c.category === catVal) : null;
  if (!cat) {
    typeSelect.innerHTML = '<option value="">\u2014 Select Violation \u2014</option>';
    const subtypeField = document.getElementById('compass-violation-subtype-field');
    if (subtypeField) subtypeField.style.display = 'none';
    const penaltyDiv = document.getElementById('compass-violation-penalty');
    if (penaltyDiv) penaltyDiv.style.display = 'none';
    return;
  }

  // Build options from all sub-subsection items across subsections
  let opts = '<option value="">\u2014 Select Violation \u2014</option>';
  cat.subsections.forEach(sub => {
    opts += `<optgroup label="${escapeAttr(sub.code)} ${escapeAttr(sub.title)}">`;
    sub.items.forEach(item => {
      opts += `<option value="${escapeAttr(item.text)}" data-code="${escapeAttr(item.code)}" data-penalty="${escapeAttr(item.penalty)}">${escapeHtml(item.code)} \u2014 ${escapeHtml(item.text)}</option>`;
    });
    opts += '</optgroup>';
  });
  typeSelect.innerHTML = opts;

  // Reset downstream
  const subtypeField = document.getElementById('compass-violation-subtype-field');
  if (subtypeField) subtypeField.style.display = 'none';
  const penaltyDiv = document.getElementById('compass-violation-penalty');
  if (penaltyDiv) penaltyDiv.style.display = 'none';
}

function compassOnViolationTypeChange() {
  const catVal = document.getElementById('compass-new-violation-cat')?.value || '';
  const typeVal = document.getElementById('compass-new-violation-type')?.value || '';
  const subtypeField = document.getElementById('compass-violation-subtype-field');
  const penaltyDiv = document.getElementById('compass-violation-penalty');

  if (!catVal || !typeVal || typeof HR_VIOLATIONS === 'undefined') {
    if (subtypeField) subtypeField.style.display = 'none';
    if (penaltyDiv) penaltyDiv.style.display = 'none';
    return;
  }

  // No subtypes in the new structure — hide the subtype field
  if (subtypeField) subtypeField.style.display = 'none';

  // Find the selected item's penalty from data attributes
  const typeSelect = document.getElementById('compass-new-violation-type');
  const selectedOpt = typeSelect?.selectedOptions?.[0];
  const penalty = selectedOpt?.dataset?.penalty || '';

  if (penaltyDiv && penalty) {
    penaltyDiv.innerHTML = `<strong>Penalty:</strong> ${escapeHtml(penalty)}`;
    penaltyDiv.style.display = '';
  } else if (penaltyDiv) {
    penaltyDiv.style.display = 'none';
  }
}


// ===== Support Joiner Dropdown Functions (QA Feedback) =====

var _compassFilterJoiner1Debounced = _compassDebounce(function() { compassFilterJoinerDropdown(1); }, 120);
var _compassFilterJoiner2Debounced = _compassDebounce(function() { compassFilterJoinerDropdown(2); }, 120);

function compassGetJoinerEligible() {
  // SMEs and Team Leads only
  return COMPASS.employees.filter(e => {
    const role = (e.actual_role || '').toLowerCase();
    return role === 'operational sme' || role === 'team lead';
  });
}

function compassToggleJoinerDropdown(num, show) {
  const dropdown = document.getElementById(`compass-joiner${num}-dropdown`);
  if (!dropdown) return;
  dropdown.style.display = show ? 'block' : 'none';
  if (show) compassFilterJoinerDropdown(num);
}

function compassFilterJoinerDropdown(num) {
  const search = (document.getElementById(`compass-joiner${num}-search`)?.value || '').toLowerCase();
  const dropdown = document.getElementById(`compass-joiner${num}-dropdown`);
  if (!dropdown) return;

  let eligible = compassGetJoinerEligible();

  // Exclude the other joiner's selection
  const otherNum = num === 1 ? 2 : 1;
  const otherVal = document.getElementById(`compass-new-joiner${otherNum}`)?.value || '';
  if (otherVal && otherVal !== '__none__') {
    eligible = eligible.filter(e => e.ohr_id !== otherVal);
  }

  // Apply search filter
  let filtered = eligible;
  if (search.length > 0) {
    filtered = eligible.filter(e => {
      const name = (e.full_name || '').toLowerCase();
      const ohr = (e.ohr_id || '').toLowerCase();
      const role = (e.actual_role || '').toLowerCase();
      return name.includes(search) || ohr.includes(search) || role.includes(search);
    });
  }

  // Limit to 50 results
  const limited = filtered.slice(0, 50);

  // Build dropdown HTML
  let html = '';

  // For Joiner 2: add "No Other Joining Support" at the top (only if no search or search matches)
  if (num === 2) {
    const noJoinerLabel = 'No Other Joining Support';
    if (!search || noJoinerLabel.toLowerCase().includes(search)) {
      html += '<div class="searchable-select-option" onclick="compassSelectJoiner(2, \'__none__\', \'No Other Joining Support\')" style="padding:6px 10px; cursor:pointer; font-size:12px; border-bottom:1px solid var(--border); font-style:italic; color:var(--fg-muted);">No Other Joining Support</div>';
    }
  }

  if (limited.length === 0 && !html) {
    dropdown.innerHTML = '<div style="padding:8px 10px; font-size:12px; color:var(--fg-muted);">No matching SMEs or Team Leads found</div>';
  } else {
    html += limited.map(e => {
      const display = `${e.full_name || 'Unknown'} (${e.ohr_id || ''}) \u2014 ${e.actual_role || ''}`;
      return `<div class="searchable-select-option" onclick="compassSelectJoiner(${num}, '${e.ohr_id}', '${escapeAttr(e.full_name || '')}')" style="padding:6px 10px; cursor:pointer; font-size:12px; border-bottom:1px solid var(--border);">${escapeHtml(display)}</div>`;
    }).join('');
    dropdown.innerHTML = html;
  }

  dropdown.style.display = 'block';
}

function compassSelectJoiner(num, ohrId, displayText) {
  const hidden = document.getElementById(`compass-new-joiner${num}`);
  const search = document.getElementById(`compass-joiner${num}-search`);
  if (hidden) hidden.value = ohrId;
  if (search) search.value = displayText;
  compassToggleJoinerDropdown(num, false);

  // When Joiner 1 changes, re-filter Joiner 2 to exclude the new selection
  if (num === 1) {
    const joiner2Dropdown = document.getElementById('compass-joiner2-dropdown');
    if (joiner2Dropdown && joiner2Dropdown.style.display === 'block') {
      compassFilterJoinerDropdown(2);
    }
  }
}

// Close joiner dropdowns when clicking outside
document.addEventListener('click', function(e) {
  for (const num of [1, 2]) {
    const wrapper = document.getElementById(`compass-joiner${num}-wrapper`);
    if (wrapper && !wrapper.contains(e.target)) {
      compassToggleJoinerDropdown(num, false);
    }
  }
});


// ===== NTE Build Assist Wizard =====
// Multi-step wizard: 1) Employee + Violation Type  2) Date range + Attendance  3) AI Narrative + Review  4) Confirm & Save

var NTE_WIZARD = {
  step: 1,
  employee: null,       // selected employee object
  violationType: null,  // { code, type, penalty, category } — primary (first) violation for backward compat
  violations: [],       // array of violation objects for multi-violation support
  violationSubtype: '', // optional subtype
  dateRange: { start: '', end: '' },
  attendance: [],       // fetched attendance rows for the period
  previousNtes: [],     // existing NTEs for this employee
  capLevel: '',         // auto-determined or manually adjusted
  narrative: '',        // AI-generated incident narrative
  policyText: '',       // AI-generated policy citation
  isGenerating: false
};

function compassShowNteBuildAssist() {
  NTE_WIZARD = { step: 1, employee: null, violationType: null, violations: [], violationSubtype: '', dateRange: { start: '', end: '' }, attendance: [], previousNtes: [], capLevel: '', narrative: '', policyText: '', isGenerating: false };
  _nteWizardRender();
}

function _nteWizardRender() {
  const overlay = document.getElementById('compass-form-overlay');
  const formTitle = document.getElementById('compass-form-title');
  const formBody = document.getElementById('compass-form-body');
  const formFooter = document.getElementById('compass-form-footer');

  const stepLabels = ['Employee & Violation', 'Date Range & Attendance', 'AI Narrative & Review', 'Confirm & Save'];
  formTitle.innerHTML = `<span style="display:flex;align-items:center;gap:8px;">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366F1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/></svg>
    NTE Build Assist
    <span style="font-size:11px; color:var(--fg-muted); font-weight:400;">Step ${NTE_WIZARD.step} of 4 — ${stepLabels[NTE_WIZARD.step - 1]}</span>
  </span>`;

  // Progress bar
  const progressHtml = `<div style="display:flex;gap:4px;margin-bottom:16px;">
    ${[1,2,3,4].map(s => `<div style="flex:1;height:3px;border-radius:2px;background:${s <= NTE_WIZARD.step ? '#6366F1' : 'var(--border)'};transition:background 0.2s;"></div>`).join('')}
  </div>`;

  if (NTE_WIZARD.step === 1) _nteWizardStep1(formBody, formFooter, progressHtml);
  else if (NTE_WIZARD.step === 2) _nteWizardStep2(formBody, formFooter, progressHtml);
  else if (NTE_WIZARD.step === 3) _nteWizardStep3(formBody, formFooter, progressHtml);
  else if (NTE_WIZARD.step === 4) _nteWizardStep4(formBody, formFooter, progressHtml);

  overlay.classList.add('active');
}

// ---- Step 1: Employee + Violation Type (Multi-select) ----
function _nteWizardStep1(formBody, formFooter, progressHtml) {
  // Build selected violations chips
  var chipsHtml = '';
  if (NTE_WIZARD.violations.length > 0) {
    chipsHtml = '<div id="nte-wiz-violation-chips" style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;">';
    NTE_WIZARD.violations.forEach(function(v, idx) {
      chipsHtml += '<div style="display:inline-flex; align-items:center; gap:4px; padding:4px 10px; background:#6366F112; border:1px solid #6366F130; border-radius:16px; font-size:11px; line-height:1.3;">';
      chipsHtml += '<strong style="color:#6366F1;">' + escapeHtml(v.code) + '</strong> ';
      chipsHtml += '<span style="max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + escapeHtml(v.text) + '</span>';
      chipsHtml += '<span style="color:var(--fg-subtle); font-size:10px;">(' + escapeHtml(v.penalty) + ')</span>';
      chipsHtml += '<button type="button" onclick="_nteWizRemoveViolation(' + idx + ')" style="background:none; border:none; cursor:pointer; color:#6366F1; font-size:14px; line-height:1; padding:0 2px; font-weight:700;" title="Remove">×</button>';
      chipsHtml += '</div>';
    });
    chipsHtml += '</div>';
  }

  formBody.innerHTML = `${progressHtml}
    <div class="form-section">
      <div class="form-field">
        <label class="form-label">Employee <span class="required">*</span></label>
        <div class="searchable-select" id="nte-wiz-employee-wrapper">
          <input type="hidden" id="nte-wiz-employee-ohr" value="${NTE_WIZARD.employee ? escapeAttr(NTE_WIZARD.employee.ohr_id) : ''}">
          <input type="text" class="form-input" id="nte-wiz-employee-search" placeholder="Search by name or OHR ID..." autocomplete="off"
            value="${NTE_WIZARD.employee ? escapeAttr(NTE_WIZARD.employee.full_name + ' (' + NTE_WIZARD.employee.ohr_id + ')') : ''}"
            oninput="_nteWizFilterEmployees()" onclick="_nteWizToggleEmployeeDropdown(true)">
          <div class="searchable-select-dropdown" id="nte-wiz-employee-dropdown" style="display:none; max-height:200px; overflow-y:auto;"></div>
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-field">
        <label class="form-label">Violation(s) <span class="required">*</span> <span style="font-size:10px; color:var(--fg-muted); font-weight:400;">— select one or more</span></label>
        <div class="searchable-select" id="nte-wiz-violation-wrapper">
          <input type="text" class="form-input" id="nte-wiz-violation-search" placeholder="Search violations by code, keyword, or section..."
            autocomplete="off" value=""
            oninput="_nteWizFilterViolations()" onclick="_nteWizToggleViolationDropdown(true)" onfocus="_nteWizToggleViolationDropdown(true)">
          <div class="searchable-select-dropdown" id="nte-wiz-violation-dropdown" style="display:none; max-height:280px; overflow-y:auto;"></div>
        </div>
        ${chipsHtml}
      </div>
    </div>

    ${NTE_WIZARD.employee ? `
    <div class="form-section" style="background:var(--bg-inset); padding:12px 16px; border-radius:var(--radius); border:1px solid var(--border);">
      <div style="font-size:11px; color:var(--fg-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px;">Employee Details</div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:12px;">
        <div><strong>Name:</strong> ${escapeHtml(NTE_WIZARD.employee.full_name)}</div>
        <div><strong>OHR:</strong> ${escapeHtml(NTE_WIZARD.employee.ohr_id)}</div>
        <div><strong>Role:</strong> ${escapeHtml(NTE_WIZARD.employee.actual_role || '—')}</div>
        <div><strong>PG:</strong> ${escapeHtml(NTE_WIZARD.employee.planning_group || '—')}</div>
        <div><strong>Supervisor:</strong> ${escapeHtml(NTE_WIZARD.employee.supervisor_name || '—')}</div>
        <div><strong>Email:</strong> ${escapeHtml(NTE_WIZARD.employee.meta_email || '—')}</div>
      </div>
    </div>` : ''}
  `;

  formFooter.innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="compassCloseForm()">← Cancel</button>
    <button class="btn btn-primary btn-sm" onclick="_nteWizGoStep2()">Next →</button>
  `;

}

function _nteWizRemoveViolation(idx) {
  NTE_WIZARD.violations.splice(idx, 1);
  // Keep violationType in sync with first violation
  NTE_WIZARD.violationType = NTE_WIZARD.violations.length > 0 ? NTE_WIZARD.violations[0] : null;
  _nteWizardRender();
}

var _nteWizFilterTimer = null;
function _nteWizFilterEmployees() {
  clearTimeout(_nteWizFilterTimer);
  _nteWizFilterTimer = setTimeout(() => {
    const search = (document.getElementById('nte-wiz-employee-search')?.value || '').toLowerCase();
    const dropdown = document.getElementById('nte-wiz-employee-dropdown');
    if (!dropdown || !search) { if (dropdown) dropdown.style.display = 'none'; return; }

    // Filter only agents (exclude managers)
    const matches = COMPASS.employees
      .filter(e => e.actual_role !== 'Manager' && (
        (e.full_name || '').toLowerCase().includes(search) ||
        (e.ohr_id || '').toLowerCase().includes(search)
      ))
      .slice(0, 30);

    if (matches.length === 0) {
      dropdown.innerHTML = '<div style="padding:8px 12px; color:var(--fg-muted); font-size:12px;">No matches found</div>';
    } else {
      dropdown.innerHTML = matches.map(e => `
        <div class="searchable-select-option" onclick="_nteWizSelectEmployee('${escapeAttr(e.ohr_id)}')" style="padding:6px 12px; cursor:pointer; font-size:12px;">
          <strong>${escapeHtml(e.full_name)}</strong> <span style="color:var(--fg-muted);">(${escapeHtml(e.ohr_id)})</span>
          <span style="color:var(--fg-subtle); font-size:11px; margin-left:4px;">${escapeHtml(e.planning_group || '')}</span>
        </div>
      `).join('');
    }
    dropdown.style.display = '';
  }, 120);
}

function _nteWizToggleEmployeeDropdown(show) {
  const dropdown = document.getElementById('nte-wiz-employee-dropdown');
  if (dropdown) dropdown.style.display = show ? '' : 'none';
  if (show) _nteWizFilterEmployees();
}

function _nteWizSelectEmployee(ohrId) {
  const emp = COMPASS.employees.find(e => e.ohr_id === ohrId);
  if (!emp) return;
  NTE_WIZARD.employee = emp;
  document.getElementById('nte-wiz-employee-ohr').value = ohrId;
  document.getElementById('nte-wiz-employee-search').value = emp.full_name + ' (' + emp.ohr_id + ')';
  document.getElementById('nte-wiz-employee-dropdown').style.display = 'none';
  // Re-render to show employee details card
  _nteWizardRender();
}

// ---- Searchable Violation Picker with Keyboard Navigation ----
var _nteWizViolationFilterTimer = null;
var _nteWizViolationActiveIdx = -1;  // tracks highlighted option index
var _nteWizViolationMatchCodes = []; // ordered codes of current visible options

// Build a flat list of all violation items for search
function _nteWizGetAllViolationItems() {
  if (typeof HR_VIOLATIONS === 'undefined') return [];
  var items = [];
  HR_VIOLATIONS.forEach(function(cat) {
    cat.subsections.forEach(function(sub) {
      sub.items.forEach(function(item) {
        items.push({
          code: item.code,
          text: item.text,
          penalty: item.penalty,
          category: cat.category,
          subsectionCode: sub.code,
          subsectionTitle: sub.title,
          subsection: sub.code + ' ' + sub.title,
          _search: (item.code + ' ' + item.text + ' ' + cat.category + ' ' + sub.title).toLowerCase()
        });
      });
    });
  });
  return items;
}

function _nteWizFilterViolations() {
  clearTimeout(_nteWizViolationFilterTimer);
  _nteWizViolationFilterTimer = setTimeout(function() {
    var search = (document.getElementById('nte-wiz-violation-search')?.value || '').toLowerCase().trim();
    var dropdown = document.getElementById('nte-wiz-violation-dropdown');
    if (!dropdown) return;

    var allItems = _nteWizGetAllViolationItems();
    var matches;
    if (!search) {
      matches = allItems;
    } else {
      var terms = search.split(/\s+/);
      matches = allItems.filter(function(item) {
        return terms.every(function(t) { return item._search.includes(t); });
      });
    }

    // Reset keyboard index
    _nteWizViolationActiveIdx = -1;
    _nteWizViolationMatchCodes = [];

    if (matches.length === 0) {
      dropdown.innerHTML = '<div style="padding:10px 14px; color:var(--fg-muted); font-size:12px;">No violations found</div>';
    } else {
      var grouped = {};
      matches.forEach(function(item) {
        var key = item.category + ' \u203a ' + item.subsection;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(item);
      });

      var html = '';
      var idx = 0;
      Object.keys(grouped).forEach(function(groupLabel) {
        html += '<div style="padding:4px 12px; font-size:10px; font-weight:600; color:var(--fg-muted); text-transform:uppercase; letter-spacing:0.3px; background:var(--bg-inset); border-bottom:1px solid var(--border); position:sticky; top:0; z-index:1;">' + escapeHtml(groupLabel) + '</div>';
        grouped[groupLabel].forEach(function(item) {
          _nteWizViolationMatchCodes.push(item.code);
          var isSelected = NTE_WIZARD.violationType && NTE_WIZARD.violationType.code === item.code;
          html += '<div class="searchable-select-option" data-viol-idx="' + idx + '" data-viol-code="' + escapeAttr(item.code) + '" onclick="_nteWizSelectViolation(\'' + escapeAttr(item.code) + '\')" onmouseenter="_nteWizViolationHighlight(' + idx + ')" style="padding:6px 12px; cursor:pointer; font-size:12px; line-height:1.4; border-bottom:1px solid var(--border); transition:background 0.1s;' + (isSelected ? ' background:#6366F110;' : '') + '">';
          html += '<strong style="color:#6366F1;">' + escapeHtml(item.code) + '</strong> ';
          html += '<span>' + escapeHtml(item.text) + '</span> ';
          html += '<span style="color:var(--fg-subtle); font-size:10px;">(' + escapeHtml(item.penalty) + ')</span>';
          html += '</div>';
          idx++;
        });
      });
      dropdown.innerHTML = html;
    }
    dropdown.style.display = '';
  }, 100);
}

function _nteWizViolationHighlight(idx) {
  var dropdown = document.getElementById('nte-wiz-violation-dropdown');
  if (!dropdown) return;
  // Clear previous highlight
  var prev = dropdown.querySelector('[data-viol-idx="' + _nteWizViolationActiveIdx + '"]');
  if (prev) prev.style.background = '';
  _nteWizViolationActiveIdx = idx;
  var el = dropdown.querySelector('[data-viol-idx="' + idx + '"]');
  if (el) {
    el.style.background = '#6366F118';
    // Scroll into view if needed
    var dropRect = dropdown.getBoundingClientRect();
    var elRect = el.getBoundingClientRect();
    if (elRect.bottom > dropRect.bottom) el.scrollIntoView({ block: 'nearest' });
    if (elRect.top < dropRect.top) el.scrollIntoView({ block: 'nearest' });
  }
}

function _nteWizToggleViolationDropdown(show) {
  var dropdown = document.getElementById('nte-wiz-violation-dropdown');
  if (dropdown) {
    dropdown.style.display = show ? '' : 'none';
    if (show) {
      _nteWizViolationActiveIdx = -1;
      _nteWizFilterViolations();
    }
  }
}

function _nteWizSelectViolation(code) {
  // Check if already selected
  if (NTE_WIZARD.violations.some(function(v) { return v.code === code; })) {
    showToast('Violation already selected', 'error');
    return;
  }
  for (var ci = 0; ci < HR_VIOLATIONS.length; ci++) {
    var cat = HR_VIOLATIONS[ci];
    for (var si = 0; si < cat.subsections.length; si++) {
      var sub = cat.subsections[si];
      for (var ii = 0; ii < sub.items.length; ii++) {
        var item = sub.items[ii];
        if (item.code === code) {
          var violationObj = {
            code: item.code,
            type: item.text,
            text: item.text,
            penalty: item.penalty,
            category: cat.category,
            subsection: sub.code + ' ' + sub.title,
            subsectionCode: sub.code,
            subsectionTitle: sub.title
          };
          NTE_WIZARD.violations.push(violationObj);
          // Keep violationType as first violation for backward compat
          if (!NTE_WIZARD.violationType) NTE_WIZARD.violationType = violationObj;
          NTE_WIZARD.violationSubtype = '';
          _nteWizardRender();
          return;
        }
      }
    }
  }
}

// Keyboard navigation for violation search
document.addEventListener('keydown', function(e) {
  var input = document.getElementById('nte-wiz-violation-search');
  if (!input || document.activeElement !== input) return;
  var dropdown = document.getElementById('nte-wiz-violation-dropdown');
  if (!dropdown || dropdown.style.display === 'none') return;

  var total = _nteWizViolationMatchCodes.length;
  if (total === 0) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    var next = _nteWizViolationActiveIdx + 1;
    if (next >= total) next = 0;
    _nteWizViolationHighlight(next);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    var prev = _nteWizViolationActiveIdx - 1;
    if (prev < 0) prev = total - 1;
    _nteWizViolationHighlight(prev);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (_nteWizViolationActiveIdx >= 0 && _nteWizViolationActiveIdx < total) {
      _nteWizSelectViolation(_nteWizViolationMatchCodes[_nteWizViolationActiveIdx]);
    }
  } else if (e.key === 'Escape') {
    dropdown.style.display = 'none';
    _nteWizViolationActiveIdx = -1;
  }
});

// Close violation dropdown when clicking outside
document.addEventListener('click', function(e) {
  var wrapper = document.getElementById('nte-wiz-violation-wrapper');
  var dropdown = document.getElementById('nte-wiz-violation-dropdown');
  if (wrapper && dropdown && !wrapper.contains(e.target)) {
    dropdown.style.display = 'none';
    _nteWizViolationActiveIdx = -1;
  }
});

async function _nteWizGoStep2() {
  if (!NTE_WIZARD.employee) { showToast('Please select an employee', 'error'); return; }
  if (NTE_WIZARD.violations.length === 0) { showToast('Please select at least one violation', 'error'); return; }

  NTE_WIZARD.step = 2;

  // Set default date range: last 14 days
  const today = new Date();
  const twoWeeksAgo = new Date(today);
  twoWeeksAgo.setDate(today.getDate() - 14);
  if (!NTE_WIZARD.dateRange.start) NTE_WIZARD.dateRange.start = twoWeeksAgo.toISOString().split('T')[0];
  if (!NTE_WIZARD.dateRange.end) NTE_WIZARD.dateRange.end = today.toISOString().split('T')[0];

  _nteWizardRender();

  // Fetch attendance and previous NTEs in parallel
  await _nteWizFetchAttendanceAndNtes();
}

async function _nteWizFetchAttendanceAndNtes() {
  const loadingEl = document.getElementById('nte-wiz-attendance-loading');
  if (loadingEl) loadingEl.style.display = '';

  try {
    const [attResp, nteResp] = await Promise.all([
      fetch(`${IO_API_BASE}/attendance?ohr_id=${encodeURIComponent(NTE_WIZARD.employee.ohr_id)}&log_date_gte=${NTE_WIZARD.dateRange.start}&log_date_lte=${NTE_WIZARD.dateRange.end}&limit=100`),
      fetch(`${IO_API_BASE}/coaching-nte?ohr_id=${encodeURIComponent(NTE_WIZARD.employee.ohr_id)}`)
    ]);
    NTE_WIZARD.attendance = attResp.ok ? await attResp.json() : [];
    // Handle paginated response
    if (NTE_WIZARD.attendance.data) NTE_WIZARD.attendance = NTE_WIZARD.attendance.data;
    NTE_WIZARD.previousNtes = nteResp.ok ? await nteResp.json() : [];

    // Auto-determine CAP level based on previous NTEs + violation standard penalty
    _nteWizDetermineCapLevel();
  } catch (e) {
    console.error('NTE Wizard fetch error:', e);
    showToast('Failed to load data: ' + e.message, 'error');
  }

  // Re-render step 2 with data
  _nteWizardRender();
}

function _nteWizDetermineCapLevel() {
  // Find the highest standard penalty across all selected violations
  const capLevels = ['CAP 0', 'CAP 1', 'CAP 2', 'CAP 3', 'Review for Termination'];
  var highestIdx = 0;
  NTE_WIZARD.violations.forEach(function(v) {
    var idx = capLevels.indexOf(v.penalty || 'CAP 0');
    if (idx > highestIdx) highestIdx = idx;
  });

  // Count previous NTEs for this employee
  const prevCount = NTE_WIZARD.previousNtes.length;

  // Progressive escalation: if they already have NTEs, escalate from the highest base
  const escalatedIdx = Math.min(highestIdx + prevCount, capLevels.length - 1);

  // Use the higher of standard penalty or escalated level
  NTE_WIZARD.capLevel = capLevels[Math.max(highestIdx, escalatedIdx)];
}

// ---- Step 2: Date Range & Attendance ----
function _nteWizardStep2(formBody, formFooter, progressHtml) {
  // Build attendance table
  let attHtml = '';
  if (NTE_WIZARD.attendance.length > 0) {
    // Sort by date
    const sorted = [...NTE_WIZARD.attendance].sort((a, b) => (a.log_date || '').localeCompare(b.log_date || ''));
    attHtml = `<div style="max-height:220px; overflow-y:auto; border:1px solid var(--border); border-radius:var(--radius); margin-top:8px;">
      <table style="width:100%; font-size:11px; border-collapse:collapse;">
        <thead><tr style="background:var(--bg-inset); position:sticky; top:0;">
          <th style="padding:6px 8px; text-align:left; border-bottom:1px solid var(--border);">Date</th>
          <th style="padding:6px 8px; text-align:center; border-bottom:1px solid var(--border);">Tag</th>
          <th style="padding:6px 8px; text-align:left; border-bottom:1px solid var(--border);">Reason</th>
          <th style="padding:6px 8px; text-align:center; border-bottom:1px solid var(--border);">OT</th>
        </tr></thead>
        <tbody>
          ${sorted.map(r => {
            const tag = (r.tag || '—').toUpperCase();
            const tagColor = tag === 'UPL' ? '#EF4444' : tag === 'P' ? '#10B981' : tag === 'WO' ? '#6B7280' : tag === 'LATE' ? '#F59E0B' : tag === 'NCNS' ? '#DC2626' : 'var(--fg)';
            const d = r.log_date ? new Date(r.log_date + 'T00:00:00') : null;
            const dateStr = d ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : r.log_date;
            return `<tr style="border-bottom:1px solid var(--border);">
              <td style="padding:5px 8px;">${escapeHtml(dateStr)}</td>
              <td style="padding:5px 8px; text-align:center;"><span style="display:inline-block; padding:1px 8px; border-radius:10px; font-size:10px; font-weight:600; background:${tagColor}15; color:${tagColor};">${escapeHtml(tag)}</span></td>
              <td style="padding:5px 8px; color:var(--fg-muted);">${escapeHtml(r.upl_reason || '—')}</td>
              <td style="padding:5px 8px; text-align:center;">${r.ot_hours || '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  } else {
    attHtml = '<div id="nte-wiz-attendance-loading" style="text-align:center; padding:20px; color:var(--fg-muted); font-size:12px;">Loading attendance data...</div>';
  }

  // Previous NTEs summary
  const prevHtml = NTE_WIZARD.previousNtes.length > 0
    ? `<div style="margin-top:12px;">
        <div style="font-size:11px; color:var(--fg-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Previous NTEs (${NTE_WIZARD.previousNtes.length})</div>
        ${NTE_WIZARD.previousNtes.map(n => `<div style="padding:6px 10px; background:var(--bg-inset); border:1px solid var(--border); border-radius:var(--radius); margin-bottom:4px; font-size:11px;">
          <strong style="color:${n.cap_level === 'CAP 3' ? '#EF4444' : n.cap_level === 'CAP 2' ? '#F59E0B' : '#3B82F6'};">${escapeHtml(n.cap_level)}</strong>
          <span style="color:var(--fg-muted); margin-left:8px;">${n.date_of_incident ? new Date(n.date_of_incident).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</span>
          <span style="color:var(--fg-subtle); margin-left:8px;">${escapeHtml((n.incident_description || '').replace(/<[^>]*>/g, '').substring(0, 80))}${(n.incident_description || '').length > 80 ? '...' : ''}</span>
        </div>`).join('')}
      </div>`
    : '<div style="margin-top:12px; font-size:12px; color:var(--fg-muted); font-style:italic;">No previous NTEs on record.</div>';

  // CAP level display
  const capColor = NTE_WIZARD.capLevel === 'CAP 3' ? '#EF4444' : NTE_WIZARD.capLevel === 'CAP 2' ? '#F59E0B' : NTE_WIZARD.capLevel === 'CAP 1' ? '#3B82F6' : NTE_WIZARD.capLevel === 'Review for Termination' ? '#DC2626' : '#6B7280';

  formBody.innerHTML = `${progressHtml}
    <div class="form-section">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div class="form-field">
          <label class="form-label">Start Date</label>
          <input type="date" class="form-input" id="nte-wiz-start" value="${escapeAttr(NTE_WIZARD.dateRange.start)}" onchange="_nteWizDateChange()">
        </div>
        <div class="form-field">
          <label class="form-label">End Date</label>
          <input type="date" class="form-input" id="nte-wiz-end" value="${escapeAttr(NTE_WIZARD.dateRange.end)}" onchange="_nteWizDateChange()">
        </div>
      </div>
      <button class="btn btn-outline btn-xs" style="margin-top:8px;" onclick="_nteWizRefreshAttendance()">↻ Refresh Attendance</button>
    </div>

    <div class="form-section">
      <div style="font-size:11px; color:var(--fg-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Attendance Snapshot (Annexure A)</div>
      ${attHtml}
    </div>

    <div class="form-section">
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <div>
          <div style="font-size:11px; color:var(--fg-muted); text-transform:uppercase; letter-spacing:0.5px;">Recommended CAP Level</div>
          <div style="margin-top:4px;">
            <span style="display:inline-block; padding:4px 14px; border-radius:12px; font-size:13px; font-weight:700; background:${capColor}15; color:${capColor};">${escapeHtml(NTE_WIZARD.capLevel)}</span>
          </div>
        </div>
        <div class="form-field" style="width:160px;">
          <label class="form-label" style="font-size:11px;">Override CAP Level</label>
          <select class="form-select" id="nte-wiz-cap-override" onchange="NTE_WIZARD.capLevel = this.value; _nteWizardRender();" style="font-size:12px;">
            <option value="CAP 0" ${NTE_WIZARD.capLevel === 'CAP 0' ? 'selected' : ''}>CAP 0</option>
            <option value="CAP 1" ${NTE_WIZARD.capLevel === 'CAP 1' ? 'selected' : ''}>CAP 1</option>
            <option value="CAP 2" ${NTE_WIZARD.capLevel === 'CAP 2' ? 'selected' : ''}>CAP 2</option>
            <option value="CAP 3" ${NTE_WIZARD.capLevel === 'CAP 3' ? 'selected' : ''}>CAP 3</option>
            <option value="Review for Termination" ${NTE_WIZARD.capLevel === 'Review for Termination' ? 'selected' : ''}>Review for Termination</option>
          </select>
        </div>
      </div>
      ${prevHtml}
    </div>
  `;

  formFooter.innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="NTE_WIZARD.step = 1; _nteWizardRender();">← Back</button>
    <button class="btn btn-primary btn-sm" onclick="_nteWizGoStep3()">Generate Narrative →</button>
  `;
}

function _nteWizDateChange() {
  NTE_WIZARD.dateRange.start = document.getElementById('nte-wiz-start')?.value || '';
  NTE_WIZARD.dateRange.end = document.getElementById('nte-wiz-end')?.value || '';
}

async function _nteWizRefreshAttendance() {
  _nteWizDateChange();
  NTE_WIZARD.attendance = [];
  _nteWizardRender();
  await _nteWizFetchAttendanceAndNtes();
}

async function _nteWizGoStep3() {
  _nteWizDateChange();
  if (!NTE_WIZARD.dateRange.start || !NTE_WIZARD.dateRange.end) {
    showToast('Please select a date range', 'error'); return;
  }

  NTE_WIZARD.step = 3;
  NTE_WIZARD.isGenerating = true;
  _nteWizardRender();

  // Call the AI narrative generation endpoint
  try {
    const resp = await fetch(`${IO_API_BASE}/nte-build-assist/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee: {
          full_name: NTE_WIZARD.employee.full_name,
          ohr_id: NTE_WIZARD.employee.ohr_id,
          actual_role: NTE_WIZARD.employee.actual_role,
          planning_group: NTE_WIZARD.employee.planning_group,
          supervisor_name: NTE_WIZARD.employee.supervisor_name,
          supervisor_email: NTE_WIZARD.employee.supervisor_email,
          meta_email: NTE_WIZARD.employee.meta_email
        },
        violation: NTE_WIZARD.violations[0] ? {
          code: NTE_WIZARD.violations[0].code,
          type: NTE_WIZARD.violations[0].type,
          text: NTE_WIZARD.violations[0].text,
          penalty: NTE_WIZARD.violations[0].penalty,
          category: NTE_WIZARD.violations[0].category,
          subsection: NTE_WIZARD.violations[0].subsection || '',
          subsectionCode: NTE_WIZARD.violations[0].subsectionCode || '',
          subsectionTitle: NTE_WIZARD.violations[0].subsectionTitle || ''
        } : {},
        violations: NTE_WIZARD.violations.map(function(v) {
          return { code: v.code, type: v.type, text: v.text, penalty: v.penalty, category: v.category, subsection: v.subsection || '', subsectionCode: v.subsectionCode || '', subsectionTitle: v.subsectionTitle || '' };
        }),
        cap_level: NTE_WIZARD.capLevel,
        date_range: NTE_WIZARD.dateRange,
        attendance: NTE_WIZARD.attendance.map(a => ({ log_date: a.log_date, tag: a.tag, upl_reason: a.upl_reason, ot_hours: a.ot_hours })),
        previous_ntes: NTE_WIZARD.previousNtes.map(n => ({ cap_level: n.cap_level, date_of_incident: n.date_of_incident, incident_description: (n.incident_description || '').replace(/<[^>]*>/g, '').substring(0, 200) }))
      })
    });

    if (!resp.ok) throw new Error('AI generation failed');
    const result = await resp.json();
    NTE_WIZARD.narrative = result.narrative || '';
    NTE_WIZARD.policyText = result.policy_text || '';
  } catch (e) {
    console.error('NTE narrative generation error:', e);
    showToast('AI generation failed. You can write the narrative manually.', 'error');
    NTE_WIZARD.narrative = '';
    NTE_WIZARD.policyText = '';
  }

  NTE_WIZARD.isGenerating = false;
  _nteWizardRender();
}

// ---- Step 3: AI Narrative & Review ----
function _nteWizardStep3(formBody, formFooter, progressHtml) {
  if (NTE_WIZARD.isGenerating) {
    formBody.innerHTML = `${progressHtml}
      <div style="text-align:center; padding:60px 20px;">
        <div style="display:inline-block; width:32px; height:32px; border:3px solid var(--border); border-top-color:#6366F1; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
        <div style="margin-top:16px; color:var(--fg-muted); font-size:13px;">Generating NTE narrative with AI...</div>
        <div style="margin-top:8px; color:var(--fg-subtle); font-size:11px;">Analyzing attendance data, violation history, and policy references</div>
      </div>
      <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
    `;
    formFooter.innerHTML = '';
    return;
  }

  formBody.innerHTML = `${progressHtml}
    <div class="form-section">
      <div class="form-field">
        <label class="form-label">Incident Narrative <span class="required">*</span></label>
        <div style="font-size:11px; color:var(--fg-muted); margin-bottom:4px;">AI-generated — review and edit as needed</div>
        <div class="rte-container">
          <div class="rte-toolbar">
            <button type="button" class="rte-btn" onclick="compassRteExec('bold', 'nte-wiz-narrative')" title="Bold"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg></button>
            <button type="button" class="rte-btn" onclick="compassRteExec('italic', 'nte-wiz-narrative')" title="Italic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg></button>
          </div>
          <div class="rte-editor" id="nte-wiz-narrative" contenteditable="true" data-placeholder="Describe the incident..." style="min-height:100px;">${NTE_WIZARD.narrative}</div>
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-field">
        <label class="form-label">Policy / Standard Violated <span class="required">*</span></label>
        <div style="font-size:11px; color:var(--fg-muted); margin-bottom:4px;">AI-generated policy citations — review and edit</div>
        <div class="rte-container">
          <div class="rte-toolbar">
            <button type="button" class="rte-btn" onclick="compassRteExec('bold', 'nte-wiz-policy')" title="Bold"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg></button>
            <button type="button" class="rte-btn" onclick="compassRteExec('italic', 'nte-wiz-policy')" title="Italic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg></button>
          </div>
          <div class="rte-editor" id="nte-wiz-policy" contenteditable="true" data-placeholder="Specify the policy violated..." style="min-height:80px;">${NTE_WIZARD.policyText}</div>
        </div>
      </div>
    </div>

    <div class="form-section" style="background:var(--bg-inset); padding:12px 16px; border-radius:var(--radius); border:1px solid var(--border);">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:12px;">
        <div><strong>Employee:</strong> ${escapeHtml(NTE_WIZARD.employee.full_name)}</div>
        <div><strong>CAP Level:</strong> <span style="color:${NTE_WIZARD.capLevel === 'CAP 3' ? '#EF4444' : NTE_WIZARD.capLevel === 'CAP 2' ? '#F59E0B' : '#3B82F6'}; font-weight:600;">${escapeHtml(NTE_WIZARD.capLevel)}</span></div>
      </div>
      <div style="margin-top:8px; font-size:11px;"><strong>Violation(s):</strong></div>
      <div style="margin-top:4px; display:flex; flex-wrap:wrap; gap:4px;">
        ${NTE_WIZARD.violations.map(v => `<span style="padding:2px 8px; background:#6366F110; border:1px solid #6366F130; border-radius:12px; font-size:10px;"><strong>${escapeHtml(v.code)}</strong> ${escapeHtml(v.text.substring(0, 50))}${v.text.length > 50 ? '...' : ''}</span>`).join('')}
      </div>
    </div>
  `;

  formFooter.innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="NTE_WIZARD.step = 2; _nteWizardRender();">← Back</button>
    <button class="btn btn-outline btn-sm" onclick="_nteWizRegenerate()">↻ Regenerate</button>
    <button class="btn btn-primary btn-sm" onclick="_nteWizGoStep4()">Review & Confirm →</button>
  `;
}

async function _nteWizRegenerate() {
  // Save current edits before regenerating
  NTE_WIZARD.isGenerating = true;
  _nteWizardRender();
  await _nteWizGoStep3();
}

function _nteWizGoStep4() {
  // Save the edited narrative and policy text
  NTE_WIZARD.narrative = document.getElementById('nte-wiz-narrative')?.innerHTML?.trim() || '';
  NTE_WIZARD.policyText = document.getElementById('nte-wiz-policy')?.innerHTML?.trim() || '';

  if (!NTE_WIZARD.narrative || NTE_WIZARD.narrative === '<br>') {
    showToast('Please provide an incident narrative', 'error'); return;
  }
  if (!NTE_WIZARD.policyText || NTE_WIZARD.policyText === '<br>') {
    showToast('Please specify the policy violated', 'error'); return;
  }

  NTE_WIZARD.step = 4;
  _nteWizardRender();
}

// ---- Step 4: Confirm & Save ----
function _nteWizardStep4(formBody, formFooter, progressHtml) {
  const capColor = NTE_WIZARD.capLevel === 'CAP 3' ? '#EF4444' : NTE_WIZARD.capLevel === 'CAP 2' ? '#F59E0B' : NTE_WIZARD.capLevel === 'CAP 1' ? '#3B82F6' : NTE_WIZARD.capLevel === 'Review for Termination' ? '#DC2626' : '#6B7280';
  const coach = typeof currentUser !== 'undefined' ? currentUser : null;

  formBody.innerHTML = `${progressHtml}
    <div style="padding:12px 16px; background:#6366F108; border:1px solid #6366F130; border-radius:var(--radius); margin-bottom:16px;">
      <div style="font-size:13px; font-weight:600; color:#6366F1; margin-bottom:4px;">📋 NTE Summary — Ready to Submit</div>
      <div style="font-size:11px; color:var(--fg-muted);">Review all details below. This will create a coaching log and NTE record.</div>
    </div>

    <div class="form-section">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:12px;">
        <div class="detail-row"><span class="detail-label">EMPLOYEE</span><span class="detail-value">${escapeHtml(NTE_WIZARD.employee.full_name)} (${escapeHtml(NTE_WIZARD.employee.ohr_id)})</span></div>
        <div class="detail-row"><span class="detail-label">ROLE</span><span class="detail-value">${escapeHtml(NTE_WIZARD.employee.actual_role || '—')}</span></div>
        <div class="detail-row"><span class="detail-label">SUPERVISOR</span><span class="detail-value">${escapeHtml(NTE_WIZARD.employee.supervisor_name || '—')}</span></div>
        <div class="detail-row"><span class="detail-label">PLANNING GROUP</span><span class="detail-value">${escapeHtml(NTE_WIZARD.employee.planning_group || '—')}</span></div>
        <div class="detail-row"><span class="detail-label">VIOLATION(S)</span><span class="detail-value">${NTE_WIZARD.violations.map(function(v) { return escapeHtml(v.code + ' \u2014 ' + v.type); }).join('<br>')}</span></div>    <div class="detail-row"><span class="detail-label">CAP LEVEL</span><span class="detail-value"><span style="padding:2px 10px; border-radius:12px; font-size:11px; font-weight:600; background:${capColor}15; color:${capColor};">${escapeHtml(NTE_WIZARD.capLevel)}</span></span></div>
        <div class="detail-row"><span class="detail-label">DATE RANGE</span><span class="detail-value">${escapeHtml(NTE_WIZARD.dateRange.start)} to ${escapeHtml(NTE_WIZARD.dateRange.end)}</span></div>
        <div class="detail-row"><span class="detail-label">ISSUED BY</span><span class="detail-value">${escapeHtml(coach ? coach.full_name : '—')} ${coach ? '(' + escapeHtml(coach.ohr_id) + ')' : ''}</span></div>
      </div>
    </div>

    <div class="form-section">
      <h4 class="form-section-title">Incident Narrative</h4>
      <div style="padding:10px 14px; background:var(--bg-inset); border:1px solid var(--border); border-radius:var(--radius); font-size:13px; line-height:1.6;">${NTE_WIZARD.narrative}</div>
    </div>

    <div class="form-section">
      <h4 class="form-section-title">Policy Violated</h4>
      <div style="padding:10px 14px; background:var(--bg-inset); border:1px solid var(--border); border-radius:var(--radius); font-size:13px; line-height:1.6;">${NTE_WIZARD.policyText}</div>
    </div>




  `;

  formFooter.innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="NTE_WIZARD.step = 3; _nteWizardRender();">← Back</button>
    <button class="btn btn-primary btn-sm" id="nte-wiz-submit-btn" onclick="_nteWizSubmit()" style="display:flex; align-items:center; gap:6px;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
      Generate NTE Document
    </button>
  `;
}

async function _nteWizSubmit() {
  const expectedBehavior = '';
  const deadline = '';
  const coach = typeof currentUser !== 'undefined' ? currentUser : null;

  const submitBtn = document.getElementById('nte-wiz-submit-btn');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<span class="spinner-sm"></span> Generating Document...'; }

  try {
    // 1. Create the coaching log first
    const coachingRecord = {
      coaching_type: 'NTE Log',
      coach: coach ? coach.full_name : '',
      coach_ohr: coach ? coach.ohr_id : '',
      coach_meta_email: coach ? (coach.meta_email || '') : '',
      coach_sup: coach ? (coach.supervisor_name || '') : '',
      coach_sup_email: coach ? (coach.supervisor_email || '') : '',
      coach_pg: coach ? coach.planning_group : '',
      coaching_date: new Date().toISOString(),
      coachee: NTE_WIZARD.employee.full_name,
      coachee_ohr: NTE_WIZARD.employee.ohr_id,
      coachee_meta_email: NTE_WIZARD.employee.meta_email || '',
      coachee_sup: NTE_WIZARD.employee.supervisor_name || '',
      coachee_sup_email: NTE_WIZARD.employee.supervisor_email || '',
      coachee_pg: NTE_WIZARD.employee.planning_group || '',
      session_goal: 'Attendance & Tardiness',
      coaching_details: NTE_WIZARD.narrative,
      status: 'Issued',  // NTE Log is awareness-only — no acknowledgement
      cap_level: NTE_WIZARD.capLevel,
      coachee_list: []
    };

    const coachResp = await fetch(`${IO_API_BASE}/coaching`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(coachingRecord)
    });
    if (!coachResp.ok) throw new Error('Failed to create coaching log');
    const created = await coachResp.json();
    const coachingId = created?.coaching_id || (Array.isArray(created) ? created[0]?.coaching_id : null) || created?.id;

    // 2. Create the NTE record
    const nteRecord = {
      coaching_id: coachingId,
      employee_name: NTE_WIZARD.employee.full_name,
      ohr_id: NTE_WIZARD.employee.ohr_id,
      cap_level: NTE_WIZARD.capLevel,
      date_of_incident: NTE_WIZARD.dateRange.start,
      incident_description: NTE_WIZARD.narrative,
      policy_violated: NTE_WIZARD.policyText,
      issued_by: coach ? coach.full_name : '',
      issued_by_ohr: coach ? coach.ohr_id : ''
    };

    const nteResp = await fetch(`${IO_API_BASE}/coaching-nte`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nteRecord)
    });
    if (!nteResp.ok) throw new Error('Failed to save NTE');

    // 3. Generate the NTE DOCX document
    if (submitBtn) { submitBtn.innerHTML = '<span class="spinner-sm"></span> Generating DOCX...'; }

    const docxPayload = {
      date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      employee: {
        full_name: NTE_WIZARD.employee.full_name,
        ohr_id: NTE_WIZARD.employee.ohr_id,
        actual_role: NTE_WIZARD.employee.actual_role || 'Process Associate',
        department: NTE_WIZARD.employee.department || 'Operations',
        supervisor_name: NTE_WIZARD.employee.supervisor_name || '',
        gender: NTE_WIZARD.employee.gender || 'Male',
        sex: NTE_WIZARD.employee.sex || '',
      },
      narrative: NTE_WIZARD.narrative,
      policy_sections: NTE_WIZARD.policyText ? [NTE_WIZARD.policyText] : [],
      cap_level: NTE_WIZARD.capLevel,
      violation: NTE_WIZARD.violations[0] || NTE_WIZARD.violationType,
      violations: NTE_WIZARD.violations,
      flm_name: NTE_WIZARD.employee.supervisor_name || '',
      hr_name: 'Jocelyn Ramos',
      include_cwd_page: false,
    };

    const docxResp = await fetch(`${IO_API_BASE}/nte-build-assist/docx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(docxPayload)
    });

    if (!docxResp.ok) {
      const errData = await docxResp.json().catch(() => ({}));
      throw new Error('DOCX generation failed: ' + (errData.error || docxResp.statusText));
    }

    // Download the DOCX file
    const blob = await docxResp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = NTE_WIZARD.employee.full_name.replace(/[^a-zA-Z0-9 ,]/g, '').replace(/\s+/g, '_');
    a.href = url;
    a.download = `NTE_${safeName}_${new Date().toISOString().slice(0, 10)}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('NTE document generated and downloaded! Coaching log: ' + coachingId, 'success');
    compassCloseForm();
    await compassFetchLogs();
  } catch (e) {
    console.error('NTE submission error:', e);
    showToast('Failed to create NTE: ' + e.message, 'error');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = 'Generate NTE Document'; }
  }
}

// Close outside click for NTE wizard employee dropdown
document.addEventListener('click', function(e) {
  const wrapper = document.getElementById('nte-wiz-employee-wrapper');
  if (wrapper && !wrapper.contains(e.target)) {
    _nteWizToggleEmployeeDropdown(false);
  }
});
