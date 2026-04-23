/**
 * Corrective Actions Module — NTE → CAP Lifecycle UI
 * Compass sub-page: Corrective Actions (third tab)
 *
 * Depends on: IO_API_BASE (data.js), currentUser (app.js), escapeHtml (app.js),
 *             showToast (app.js), HR_VIOLATIONS (compass-violations.js, lazy-loaded)
 */

// ===== Constants =====
const CA_CAP_LEVELS = ['CAP 0', 'CAP 1', 'CAP 2', 'CAP 3', 'Corrective Suspension', 'Review for Termination'];
const CA_CAP_ACTIVE_DAYS = { 'CAP 0': 0, 'CAP 1': 60, 'CAP 2': 90, 'CAP 3': 180, 'Corrective Suspension': 0, 'Review for Termination': 0 };
const CA_NTE_TYPES = ['Attendance & Tardiness', 'Compliance & Behavior', 'Performance & Metrics', 'Policy Violation', 'Other'];
const CA_STATUS_COLORS = {
  'Served': 'served', 'CAP Issued': 'cap-issued', 'Dismissed': 'dismissed', 'Expired': 'expired'
};

// ===== Module State =====
const CA = {
  records: [],
  filtered: [],
  stats: { pending: 0, activeCaps: 0, expiringSoon: 0, dismissed: 0 },
  employees: [],  // shared from COMPASS or fetched independently
  currentDetail: null,
  _initialized: false,
  viewMode: 'all',  // 'all' = see everything, 'team' = TL-scoped view
  _expandedRowId: null,  // Currently expanded inline detail row
};

// ===== Initialization =====
async function initCorrectiveActions() {
  const loading = document.getElementById('ca-loading');
  if (loading) loading.style.display = 'flex';

  // Lazy-load violations catalog if not already loaded
  if (typeof HR_VIOLATIONS === 'undefined') {
    if (typeof _compassLazyLoadViolations === 'function') {
      _compassLazyLoadViolations();
    } else {
      // Compass hasn't been opened yet — load violations directly
      const script = document.createElement('script');
      script.src = 'js/compass-violations.js?v=102g';
      script.onerror = () => console.error('CA: Failed to lazy-load compass-violations.js');
      document.head.appendChild(script);
    }
  }

  try {
    // Fetch employees (reuse COMPASS cache if available)
    if (typeof COMPASS !== 'undefined' && COMPASS.employees && COMPASS.employees.length > 0) {
      CA.employees = COMPASS.employees;
    } else {
      try {
        const empResp = await fetch(`${IO_API_BASE}/employees?employement_status=Active&order=full_name&limit=2000`);
        if (empResp.ok) CA.employees = await empResp.json();
      } catch (e) { console.error('CA: Failed to fetch employees', e); }
    }

    await Promise.all([caFetchRecords(), caFetchStats()]);
    // Set default view mode: admin/managers see all, others see team
    const isAdmin740 = typeof isEffectiveAdmin === 'function' ? isEffectiveAdmin() : (currentUser && currentUser.ohr_id === '740045023');
    const isManager = currentUser && (typeof getEffectiveRole === 'function' ? getEffectiveRole() : currentUser.actual_role) === 'Manager';
    CA.viewMode = (isAdmin740 || isManager) ? 'all' : 'team';
    caRenderSummaryCards();
    caRenderFilterBar();
    caApplyFilters();
  } catch (err) {
    console.error('CA: init error', err);
    showToast('Failed to load Corrective Actions', 'error');
  } finally {
    if (loading) loading.style.display = 'none';
  }
}

// ===== Data Fetching =====
async function caFetchRecords() {
  try {
    const resp = await fetch(`${IO_API_BASE}/corrective-actions?limit=5000`);
    if (resp.ok) {
      CA.records = await resp.json();
    } else {
      console.error('CA: fetch error', resp.status);
    }
  } catch (err) {
    console.error('CA: fetch error', err);
  }
}

async function caFetchStats() {
  try {
    const resp = await fetch(`${IO_API_BASE}/corrective-actions/stats`);
    if (resp.ok) {
      CA.stats = await resp.json();
    }
  } catch (err) {
    console.error('CA: stats fetch error', err);
  }
}

// ===== Summary Cards =====
function caRenderSummaryCards() {
  const container = document.getElementById('ca-summary-cards');
  if (!container) return;

  container.innerHTML = `
    <div class="ca-stat-card pending">
      <span class="ca-stat-label">Pending NTEs</span>
      <span class="ca-stat-value">${CA.stats.pending}</span>
      <span class="ca-stat-sub">Awaiting CAP decision</span>
    </div>
    <div class="ca-stat-card active">
      <span class="ca-stat-label">Active CAPs</span>
      <span class="ca-stat-value">${CA.stats.activeCaps}</span>
      <span class="ca-stat-sub">Currently enforced</span>
    </div>
    <div class="ca-stat-card expiring">
      <span class="ca-stat-label">Expiring Soon</span>
      <span class="ca-stat-value">${CA.stats.expiringSoon}</span>
      <span class="ca-stat-sub">Within 30 days</span>
    </div>
    <div class="ca-stat-card dismissed">
      <span class="ca-stat-label">Dismissed (QTD)</span>
      <span class="ca-stat-value">${CA.stats.dismissed}</span>
      <span class="ca-stat-sub">This quarter</span>
    </div>
  `;
}

// ===== Filter Bar =====
function caRenderFilterBar() {
  const container = document.getElementById('ca-filter-bar');
  if (!container) return;

  // Determine if current user can create NTEs — use RBAC permission (covers TL, Manager, and owner OHR)
  const canCreate = currentUser && (currentUser.permissions && currentUser.permissions['compass.corrective_actions']);

  // Show view toggle for admin (740045023) and Managers
  const isAdmin740 = typeof isEffectiveAdmin === 'function' ? isEffectiveAdmin() : (currentUser && currentUser.ohr_id === '740045023');
  const isManager = currentUser && (typeof getEffectiveRole === 'function' ? getEffectiveRole() : currentUser.actual_role) === 'Manager';
  const showToggle = isAdmin740 || isManager;

  container.innerHTML = `
    ${showToggle ? `<div style="flex-shrink:0;">
      <div style="display:inline-flex;border-radius:6px;overflow:hidden;border:1px solid #cbd5e1;font-size:12px;font-weight:600;">
        <button id="ca-toggle-all" onclick="caSetViewMode('all')" style="padding:5px 12px;border:none;cursor:pointer;transition:background .15s,color .15s;background:${CA.viewMode === 'all' ? '#1a365d' : '#f8fafc'};color:${CA.viewMode === 'all' ? '#fff' : '#64748b'};">All Logs</button>
        <button id="ca-toggle-team" onclick="caSetViewMode('team')" style="padding:5px 12px;border:none;cursor:pointer;transition:background .15s,color .15s;background:${CA.viewMode === 'team' ? '#1a365d' : '#f8fafc'};color:${CA.viewMode === 'team' ? '#fff' : '#64748b'};">My Team</button>
      </div>
    </div>` : ''}
    <div class="ca-search-wrapper">
      <svg class="ca-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="text" id="ca-search-input" placeholder="Search by name, OHR, or incident..." oninput="_caApplyFiltersDebounced()">
    </div>
    <select id="ca-filter-status" onchange="caApplyFilters()">
      <option value="">All Statuses</option>
      <option value="Served">Served</option>
      <option value="CAP Issued">CAP Issued</option>
      <option value="Dismissed">Dismissed</option>
      <option value="Expired">Expired</option>
    </select>
    <select id="ca-filter-cap" onchange="caApplyFilters()">
      <option value="">All CAP Levels</option>
      ${CA_CAP_LEVELS.map(l => `<option value="${l}">${l}</option>`).join('')}
    </select>
    <span class="ca-filter-count" id="ca-filter-count"></span>
    <button class="ca-btn-kb" id="ca-kb-toggle-btn" onclick="caKbToggle()" title="Policy Reference">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
      Policy Reference
    </button>
    ${canCreate ? `<div style="position:relative;flex-shrink:0;" id="ca-dba-wrapper">
      <button class="ca-btn-create" id="ca-dba-trigger" onclick="caToggleDocBuildMenu()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/></svg>
        Document Build Assist
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left:2px;"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div id="ca-dba-menu" style="display:none;position:absolute;top:100%;right:0;margin-top:4px;min-width:280px;background:var(--bg-card,#fff);border:1px solid var(--border,#e2e8f0);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.12);z-index:1000;overflow:hidden;"></div>
    </div>` : ''}
  `;
}

// ===== Filtering =====
var _caDebounceTimer = null;
function _caApplyFiltersDebounced() {
  clearTimeout(_caDebounceTimer);
  _caDebounceTimer = setTimeout(caApplyFilters, 200);
}
function caApplyFilters() {
  const searchEl = document.getElementById('ca-search-input');
  const statusEl = document.getElementById('ca-filter-status');
  const capEl = document.getElementById('ca-filter-cap');
  const search = (searchEl ? searchEl.value : '').toLowerCase().trim();
  const status = statusEl ? statusEl.value : '';
  const cap = capEl ? capEl.value : '';

  let data = [...CA.records];

  // Role-based visibility (mirrors Coaching Profile rules)
  // Admin (740045023) and Managers respect the All/My Team toggle
  if (currentUser) {
    const isAdmin740 = typeof isEffectiveAdmin === 'function' ? isEffectiveAdmin() : (currentUser.ohr_id === '740045023');
    const role = typeof getEffectiveRole === 'function' ? getEffectiveRole() : currentUser.actual_role;

    if (isAdmin740 || role === 'Manager') {
      // Admin + Managers: 'all' = everything, 'team' = TL-scoped view
      if (CA.viewMode === 'team') {
        const myName = currentUser.full_name;
        const teamOhrs = new Set();
        if (CA.employees && CA.employees.length) {
          CA.employees.forEach(function(e) {
            if (e.supervisor_name === myName) teamOhrs.add(e.ohr_id);
          });
        }
        teamOhrs.add(currentUser.ohr_id);
        data = data.filter(function(r) {
          return teamOhrs.has(r.ohr_id) ||
                 r.supervisor_ohr === currentUser.ohr_id ||
                 r.created_by_ohr === currentUser.ohr_id;
        });
      }
      // else 'all' — no filter
    } else if (role === 'Agent') {
      // Agents: only see their own records
      data = data.filter(function(r) { return r.ohr_id === currentUser.ohr_id; });
    } else if (role === 'Team Lead') {
      // TLs: see records for their team (supervisor matches) + records they created + their own
      const myName = currentUser.full_name;
      const teamOhrs = new Set();
      if (CA.employees && CA.employees.length) {
        CA.employees.forEach(function(e) {
          if (e.supervisor_name === myName) teamOhrs.add(e.ohr_id);
        });
      }
      teamOhrs.add(currentUser.ohr_id);
      data = data.filter(function(r) {
        return teamOhrs.has(r.ohr_id) ||
               r.supervisor_ohr === currentUser.ohr_id ||
               r.created_by_ohr === currentUser.ohr_id;
      });
    } else if (role === 'Operational SME') {
      // SMEs: same as TL but team = agents under their supervisor's team
      const myTlName = currentUser.supervisor_name || '';
      const teamOhrs = new Set();
      if (CA.employees && CA.employees.length && myTlName) {
        CA.employees.forEach(function(e) {
          if (e.supervisor_name === myTlName) teamOhrs.add(e.ohr_id);
        });
      }
      teamOhrs.add(currentUser.ohr_id);
      data = data.filter(function(r) {
        return teamOhrs.has(r.ohr_id) ||
               r.created_by_ohr === currentUser.ohr_id;
      });
    } else if (role === 'Quality & Policy Expert' || role === 'Trainer') {
      // QAs & Trainers: see records they created + their own
      data = data.filter(function(r) {
        return r.created_by_ohr === currentUser.ohr_id ||
               r.ohr_id === currentUser.ohr_id;
      });
    } else {
      // Fallback: own records + records they created
      data = data.filter(function(r) {
        return r.created_by_ohr === currentUser.ohr_id ||
               r.ohr_id === currentUser.ohr_id;
      });
    }
  }

  if (search) {
    data = data.filter(r =>
      (r.employee_name || '').toLowerCase().includes(search) ||
      (r.ohr_id || '').toLowerCase().includes(search) ||
      (r.incident_description || '').toLowerCase().includes(search) ||
      (r.nte_type || '').toLowerCase().includes(search)
    );
  }
  if (status) data = data.filter(r => r.status === status);
  if (cap) data = data.filter(r => r.cap_level === cap);

  CA.filtered = data;

  const countEl = document.getElementById('ca-filter-count');
  if (countEl) countEl.textContent = `${data.length} record${data.length !== 1 ? 's' : ''}`;

  caRenderTable();
}

// ===== View Mode Toggle =====
function caSetViewMode(mode) {
  CA.viewMode = mode;
  // Update toggle button styles
  var btnAll = document.getElementById('ca-toggle-all');
  var btnTeam = document.getElementById('ca-toggle-team');
  if (btnAll && btnTeam) {
    if (mode === 'all') {
      btnAll.style.background = '#1a365d'; btnAll.style.color = '#fff';
      btnTeam.style.background = '#f8fafc'; btnTeam.style.color = '#64748b';
    } else {
      btnTeam.style.background = '#1a365d'; btnTeam.style.color = '#fff';
      btnAll.style.background = '#f8fafc'; btnAll.style.color = '#64748b';
    }
  }
  caApplyFilters();
}

// ===== Table Rendering =====
function caRenderTable() {
  const container = document.getElementById('ca-table-container');
  if (!container) return;

  if (CA.filtered.length === 0) {
    container.innerHTML = `
      <div class="ca-empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <h4>No corrective actions found</h4>
        <p>Adjust your filters or issue a new NTE to get started.</p>
      </div>
    `;
    return;
  }

  let html = `<table class="ca-table">
    <thead><tr>
      <th>Employee</th>
      <th>NTE Type</th>
      <th>Incident Date</th>
      <th>Status</th>
      <th>CAP Level</th>
      <th>Deadline</th>
      <th>Served</th>
    </tr></thead>
    <tbody>`;

  for (const r of CA.filtered) {
    const statusClass = CA_STATUS_COLORS[r.status] || '';
    const agingInfo = caGetAgingInfo(r);
    const capBadge = r.cap_level ? caGetCapBadge(r.cap_level) : '<span style="color:var(--compass-text-subtle);">\u2014</span>';
    const deadlineDisplay = r.response_deadline ? caFormatDate(r.response_deadline) : '\u2014';
    const servedDisplay = r.served_date ? caFormatDate(r.served_date) : '\u2014';
    const isExpanded = CA._expandedRowId === r.id;

    html += `<tr class="ca-table-row${isExpanded ? ' ca-row-expanded' : ''}" onclick="caToggleInlineDetail('${r.id}')">
      <td>
        <div class="ca-name-cell">${escapeHtml(r.employee_name || '')}</div>
        <div class="ca-ohr-cell">${escapeHtml(r.ohr_id || '')}</div>
      </td>
      <td>${escapeHtml(r.nte_type || '\u2014')}</td>
      <td>${r.date_of_incident ? caFormatDate(r.date_of_incident) : '\u2014'}</td>
      <td>${agingInfo.dot}<span class="ca-status-badge ${statusClass}">${escapeHtml(r.status)}</span></td>
      <td>${capBadge}</td>
      <td>${deadlineDisplay}</td>
      <td style="position:relative;">${servedDisplay}<span class="ca-expand-indicator"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="6 9 12 15 18 9"/></svg></span></td>
    </tr>`;
    if (isExpanded) {
      html += `<tr class="ca-detail-panel-row"><td colspan="7"><div class="ca-inline-detail-panel open" id="ca-inline-detail-${r.id}"><div style="text-align:center;padding:20px;color:var(--compass-text-muted);">Loading...</div></div></td></tr>`;
    }
  }

  html += '</tbody></table>';
  container.innerHTML = html;
}

// ===== Helpers =====
function caFormatDate(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return isoStr; }
}

function caFormatDateTime(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch { return isoStr; }
}

function caGetAgingInfo(record) {
  if (record.status !== 'Served' || !record.response_deadline) return { dot: '', class: 'ok' };
  const now = new Date();
  const deadline = new Date(record.response_deadline);
  const hoursLeft = (deadline - now) / 3600000;
  if (hoursLeft < 0) return { dot: '<span class="ca-aging-dot overdue"></span>', class: 'overdue' };
  if (hoursLeft < 12) return { dot: '<span class="ca-aging-dot warning"></span>', class: 'warning' };
  return { dot: '', class: 'ok' };
}

function caGetCapBadge(capLevel) {
  if (!capLevel) return '';
  const cls = capLevel.replace(/\s+/g, '-').toLowerCase();
  return `<span class="ca-cap-badge ${cls}">${escapeHtml(capLevel)}</span>`;
}

// ===== Inline Detail Expansion =====
async function caToggleInlineDetail(id) {
  // If already expanded, collapse it
  if (CA._expandedRowId === id) {
    CA._expandedRowId = null;
    CA.currentDetail = null;
    caRenderTable();
    return;
  }

  // Expand the new row
  CA._expandedRowId = id;
  caRenderTable();

  const record = CA.records.find(r => r.id === id);
  if (!record) return;
  CA.currentDetail = record;

  const panel = document.getElementById('ca-inline-detail-' + id);
  if (!panel) return;

  // Fetch employee CAP history
  let history = [];
  try {
    const resp = await fetch(`${IO_API_BASE}/corrective-actions/employee/${record.ohr_id}/history`);
    if (resp.ok) history = await resp.json();
  } catch (e) { console.error('CA: history fetch error', e); }

  panel.innerHTML = _caBuildInlineDetailHtml(record, history);
}

function _caBuildInlineDetailHtml(record, history) {
  // Parse violations JSON
  let violations = [];
  try { violations = record.violations ? JSON.parse(record.violations) : []; } catch { violations = []; }

  // NTE type icon map
  const nteIcons = { 'Attendance': '\uD83D\uDCC5', 'Performance': '\uD83D\uDCC9', 'Conduct': '\u26A0\uFE0F', 'Policy Violation': '\uD83D\uDCDC' };
  const nteIcon = nteIcons[record.nte_type] || '\uD83D\uDCC4';
  const statusBg = record.status === 'CAP Issued' ? 'rgba(239,68,68,0.1)' : record.status === 'Pending Response' ? 'rgba(245,158,11,0.1)' : record.status === 'Dismissed' ? 'rgba(16,185,129,0.1)' : 'rgba(99,102,241,0.08)';
  const statusFg = record.status === 'CAP Issued' ? '#EF4444' : record.status === 'Pending Response' ? '#D97706' : record.status === 'Dismissed' ? '#059669' : '#6366F1';

  // ===== HEADER =====
  let html = `<div class="cdp-header">`;
  html += `<div class="cdp-header-icon" style="background:${statusBg};">${nteIcon}</div>`;
  html += `<div class="cdp-header-info">`;
  html += `<div class="cdp-header-title">${escapeHtml(record.employee_name || 'Employee')}</div>`;
  html += `<div class="cdp-header-sub">${escapeHtml(record.nte_type || 'NTE')} &middot; ${record.date_of_incident ? caFormatDate(record.date_of_incident) : '\u2014'} &middot; ID: ${escapeHtml(String(record.id).slice(0,8))}</div>`;
  html += `</div>`;
  html += `<div class="cdp-header-actions">`;
  html += `<span class="ca-status-badge ${CA_STATUS_COLORS[record.status] || ''}">${escapeHtml(record.status)}</span>`;
  if (record.cap_level) {
    html += ` ${caGetCapBadge(record.cap_level)}`;
  }
  html += `</div></div>`;

  // ===== EMPLOYEE INFO CARD =====
  html += `<div class="cdp-section"><div class="cdp-section-title">Employee Information</div>`;
  html += `<div class="cdp-grid">`;
  html += `<div class="cdp-field"><div class="cdp-field-label">Name</div><div class="cdp-field-value">${escapeHtml(record.employee_name || '')}</div></div>`;
  html += `<div class="cdp-field"><div class="cdp-field-label">OHR ID</div><div class="cdp-field-value" style="font-family:monospace;">${escapeHtml(record.ohr_id || '')}</div></div>`;
  html += `<div class="cdp-field"><div class="cdp-field-label">Role</div><div class="cdp-field-value">${escapeHtml(record.actual_role || '\u2014')}</div></div>`;
  html += `<div class="cdp-field"><div class="cdp-field-label">Planning Group</div><div class="cdp-field-value">${escapeHtml(record.planning_group || '\u2014')}</div></div>`;
  html += `<div class="cdp-field"><div class="cdp-field-label">Supervisor</div><div class="cdp-field-value">${escapeHtml(record.supervisor_name || '\u2014')}</div></div>`;
  html += `<div class="cdp-field"><div class="cdp-field-label">Email</div><div class="cdp-field-value">${escapeHtml(record.employee_email || '\u2014')}</div></div>`;
  html += `</div></div>`;

  // ===== NTE DETAILS CARD =====
  html += `<div class="cdp-section"><div class="cdp-section-title">Notice to Explain</div>`;
  html += `<div class="cdp-grid">`;
  html += `<div class="cdp-field"><div class="cdp-field-label">NTE Type</div><div class="cdp-field-value">${escapeHtml(record.nte_type || '\u2014')}</div></div>`;
  html += `<div class="cdp-field"><div class="cdp-field-label">Date of Incident</div><div class="cdp-field-value">${record.date_of_incident ? caFormatDate(record.date_of_incident) : '\u2014'}</div></div>`;
  html += `<div class="cdp-field"><div class="cdp-field-label">Response Deadline</div><div class="cdp-field-value">${record.response_deadline ? caFormatDateTime(record.response_deadline) : '\u2014'}</div></div>`;
  html += `<div class="cdp-field"><div class="cdp-field-label">Served Date</div><div class="cdp-field-value">${record.served_date ? caFormatDateTime(record.served_date) : '\u2014'}</div></div>`;
  html += `</div>`;
  html += `<div class="cdp-content-block"><div class="cdp-field-label">Incident Description</div><div class="cdp-field-value multiline">${escapeHtml(record.incident_description || '\u2014')}</div></div>`;
  html += `<div class="cdp-content-block"><div class="cdp-field-label">Policy Violated</div><div class="cdp-field-value multiline">${escapeHtml(record.policy_violated || '\u2014')}</div></div>`;

  if (violations.length > 0) {
    html += `<div style="margin-top:8px;border-top:1px solid rgba(0,0,0,0.06);padding-top:8px;"><div class="cdp-field-label" style="margin-bottom:6px;">Violations (${violations.length})</div>`;
    for (const v of violations) {
      html += `<div style="font-size:12px;color:var(--compass-text,#1e293b);margin-bottom:4px;padding:4px 8px;background:rgba(0,0,0,0.02);border-radius:4px;">`;
      html += `<strong>${escapeHtml(v.code || '')}</strong> \u2014 ${escapeHtml(v.text || '')}`;
      if (v.penalty) html += ` <span style="color:var(--compass-text-muted,#94a3b8);font-size:11px;">(${escapeHtml(v.penalty)})</span>`;
      html += `</div>`;
    }
    html += '</div>';
  }
  html += '</div>';

  // ===== CAP DECISION CARD =====
  if (record.status === 'CAP Issued' || record.status === 'Expired' || record.status === 'Dismissed') {
    html += `<div class="cdp-section"><div class="cdp-section-title">CAP Decision</div>`;
    html += `<div class="cdp-grid">`;
    if (record.cap_level) html += `<div class="cdp-field"><div class="cdp-field-label">CAP Level</div><div class="cdp-field-value">${caGetCapBadge(record.cap_level)}</div></div>`;
    if (record.cap_active_days) html += `<div class="cdp-field"><div class="cdp-field-label">Active Period</div><div class="cdp-field-value">${record.cap_active_days} days</div></div>`;
    html += `<div class="cdp-field"><div class="cdp-field-label">Decision Date</div><div class="cdp-field-value">${record.cap_decision_date ? caFormatDateTime(record.cap_decision_date) : '\u2014'}</div></div>`;
    html += `<div class="cdp-field"><div class="cdp-field-label">Decision By</div><div class="cdp-field-value">${escapeHtml(record.cap_decision_by || '\u2014')}</div></div>`;
    if (record.cap_start_date) html += `<div class="cdp-field"><div class="cdp-field-label">CAP Start</div><div class="cdp-field-value">${caFormatDate(record.cap_start_date)}</div></div>`;
    if (record.cap_expiry_date) html += `<div class="cdp-field"><div class="cdp-field-label">CAP Expiry</div><div class="cdp-field-value">${caFormatDate(record.cap_expiry_date)}</div></div>`;
    if (record.suspension_days) html += `<div class="cdp-field"><div class="cdp-field-label">Suspension Days</div><div class="cdp-field-value">${record.suspension_days}</div></div>`;
    if (record.cap_remarks) html += `<div class="cdp-field cdp-grid-full"><div class="cdp-field-label">Remarks</div><div class="cdp-field-value multiline">${escapeHtml(record.cap_remarks)}</div></div>`;
    html += `</div>`;
    if (record.nod_issued) {
      html += `<div style="margin-top:10px;padding:10px 14px;background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.12);border-radius:8px;">`;
      html += `<div class="cdp-field-label" style="color:#3B82F6;">Notice of Decision Issued</div>`;
      if (record.nod_date) html += `<div style="font-size:12px;color:var(--compass-text-muted,#64748b);margin-top:2px;">${caFormatDate(record.nod_date)}</div>`;
      if (record.nod_summary) html += `<div style="font-size:13px;color:var(--compass-text,#1e293b);margin-top:4px;line-height:1.5;">${escapeHtml(record.nod_summary)}</div>`;
      html += `</div>`;
    }
    html += '</div>';
  }

  // ===== RECORD INFO CARD =====
  html += `<div class="cdp-section"><div class="cdp-section-title">Record Info</div>`;
  html += `<div class="cdp-grid">`;
  html += `<div class="cdp-field"><div class="cdp-field-label">Created By</div><div class="cdp-field-value">${escapeHtml(record.created_by || '\u2014')}</div></div>`;
  html += `<div class="cdp-field"><div class="cdp-field-label">Served Date</div><div class="cdp-field-value">${record.served_date ? caFormatDateTime(record.served_date) : '\u2014'}</div></div>`;
  if (record.linked_coaching_id) {
    html += `<div class="cdp-field"><div class="cdp-field-label">Linked Coaching Log</div><div class="cdp-field-value"><a href="#" onclick="event.stopPropagation();caOpenLinkedCoaching('${record.linked_coaching_id}')" style="color:var(--compass-accent,#6366F1);text-decoration:underline;font-size:12px;">${record.linked_coaching_id.substring(0,8)}...</a></div></div>`;
  }
  html += `</div></div>`;

  // ===== CAP HISTORY CARD =====
  const otherHistory = (history || []).filter(h => h.id !== record.id);
  if (otherHistory.length > 0) {
    html += `<div class="cdp-section"><div class="cdp-section-title">Employee CAP History (${otherHistory.length} prior record${otherHistory.length !== 1 ? 's' : ''})</div>`;
    html += `<div class="ca-history-timeline">`;
    for (const h of otherHistory) {
      const itemClass = h.status === 'CAP Issued' ? 'active' : h.status === 'Dismissed' ? 'dismissed' : h.status === 'Expired' ? 'expired' : '';
      html += `<div class="ca-history-item ${itemClass}">`;
      html += `<div class="ca-history-date">${h.served_date ? caFormatDate(h.served_date) : '\u2014'}</div>`;
      html += `<div class="ca-history-title">${escapeHtml(h.nte_type || 'NTE')} ${h.cap_level ? `\u2192 ${escapeHtml(h.cap_level)}` : ''}</div>`;
      html += `<div class="ca-history-sub">${escapeHtml(h.status)} ${h.cap_expiry_date ? `\u00B7 Expires ${caFormatDate(h.cap_expiry_date)}` : ''}</div>`;
      html += `</div>`;
    }
    html += '</div></div>';
  }

  // Footer removed — user clicks row to collapse

  return html;
}

// Legacy caOpenDetail — redirect to inline toggle
async function caOpenDetail(id) {
  caToggleInlineDetail(id);
}

function caCloseDetail() {
  // Legacy: close overlay if open
  const overlay = document.getElementById('ca-detail-overlay');
  if (overlay) overlay.classList.remove('active');
  // Also collapse inline detail
  if (CA._expandedRowId) {
    CA._expandedRowId = null;
    CA.currentDetail = null;
    caRenderTable();
  } else {
    CA.currentDetail = null;
  }
}

function caOpenLinkedCoaching(coachingId) {
  // Switch to Coaching Profile and try to open the log
  caCloseDetail();
  if (typeof switchView === 'function') switchView('compass-input');
  // Small delay to let the view render, then try to open the log
  setTimeout(() => {
    if (typeof compassOpenDetail === 'function') compassOpenDetail(coachingId);
  }, 500);
}


// ===== NTE Build Assist Wizard (relocated from Coaching Profile) =====
// Multi-step wizard: 1) Employee + Violation Type  2) Date range + Attendance  3) AI Narrative + Review  4) Confirm & Save
var CA_NTE_WIZARD = {
  step: 1,
  employee: null,
  violationType: null,
  violations: [],
  violationSubtype: '',
  dateRange: { start: '', end: '' },
  attendance: [],
  previousCAs: [],
  capLevel: '',
  narrative: '',
  policyText: '',
  isGenerating: false
};

// ===== Document Build Assist — Dropdown Menu =====
var CA_DOC_TYPE = ''; // 'nte', 'cap1', 'cap2', 'cap3'

function caToggleDocBuildMenu() {
  var panel = document.getElementById('ca-inline-add');
  if (!panel) return;
  var isOpen = panel.style.display !== 'none';
  if (isOpen) { caCollapseInlineAdd(); return; }

  // Show the inline panel with type chips
  panel.style.display = 'block';
  var typesContainer = document.getElementById('ca-inline-add-types');
  if (typesContainer) {
    var docTypes = [
      { id: 'nte', icon: '\u26A0\uFE0F', label: 'NTE', accent: '#EF4444' },
      { id: 'cap1', icon: '\u{1F4C4}', label: 'CAP 1', accent: '#3B82F6' },
      { id: 'cap2', icon: '\u{1F4CB}', label: 'CAP 2', accent: '#F59E0B' },
      { id: 'cap3', icon: '\u{1F6A8}', label: 'CAP 3', accent: '#DC2626' },
    ];
    typesContainer.innerHTML = docTypes.map(function(t) {
      var isActive = CA_DOC_TYPE === t.id;
      return `<button onclick="caInlineSelectDocType('${t.id}')" style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:999px;border:2px solid ${isActive ? t.accent : '#e2e8f0'};background:${isActive ? t.accent + '15' : '#fff'};cursor:pointer;font-size:12px;font-weight:600;color:${isActive ? t.accent : '#475569'};transition:all 0.15s;white-space:nowrap;">
        <span style="font-size:14px;">${t.icon}</span>${t.label}
      </button>`;
    }).join('') + `<button onclick="caCollapseInlineAdd()" title="Collapse" style="margin-left:auto;flex-shrink:0;background:none;border:1px solid #e2e8f0;cursor:pointer;color:#64748b;padding:6px 14px;border-radius:8px;display:flex;align-items:center;justify-content:center;transition:all 0.15s;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
    </button>`;
  }
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function caCollapseInlineAdd() {
  var panel = document.getElementById('ca-inline-add');
  if (panel) panel.style.display = 'none';
  CA_DOC_TYPE = '';
}

function caInlineSelectDocType(type) {
  CA_DOC_TYPE = type;
  // Re-render chips to show active state
  caToggleDocBuildMenu();
  // Close the inline panel and open the wizard
  caDocBuildMenuSelect(type);
}

function caDocBuildMenuSelect(type) {
  var menu = document.getElementById('ca-dba-menu');
  if (menu) menu.style.display = 'none';
  if (type === 'nte') caStartNteWizard();
  else if (type === 'cap1') caStartCap1Wizard();
  else if (type === 'cap2') caStartCap2Wizard();
  else if (type === 'cap3') caStartCap3Wizard();
}

// Keep legacy function for back buttons
function caOpenDocBuildAssist() {
  caToggleDocBuildMenu();
}

function caStartNteWizard() {
  CA_DOC_TYPE = 'nte';
  CA_NTE_WIZARD = { step: 1, employee: null, violationType: null, violations: [], violationSubtype: '', dateRange: { start: '', end: '' }, attendance: [], previousCAs: [], capLevel: '', narrative: '', policyText: '', isGenerating: false };
  _caWizRender();
}

function caOpenNteWizard() { caStartNteWizard(); }

// ===== CAP 1 Wizard State =====
var CA_CAP1_WIZARD = {
  step: 1,
  employee: null,
  linkedNte: null,
  servedNtes: [],
  explanationDate: '',
  explanationSummary: '',
  deliberation: '',
  violationSection: '',
  violationSubsection: '',
  isGenerating: false
};

function caStartCap1Wizard() {
  CA_DOC_TYPE = 'cap1';
  CA_CAP1_WIZARD = { step: 1, employee: null, linkedNte: null, servedNtes: [], explanationDate: '', explanationSummary: '', deliberation: '', violationSection: '', violationSubsection: '', isGenerating: false };
  _caCap1WizRender();
}

function caCloseWizard() {
  // Close legacy modal overlay (if still present)
  var overlay = document.getElementById('ca-form-overlay');
  if (overlay) overlay.style.display = 'none';
  // Close inline wizard form and restore type chips
  var formPanel = document.getElementById('ca-inline-add-form');
  var typesEl = document.getElementById('ca-inline-add-types');
  if (formPanel) formPanel.style.display = 'none';
  if (typesEl) typesEl.style.display = 'flex';
  CA_DOC_TYPE = '';
}

// ---- Rich text exec helper ----
function caRteExec(command) {
  document.execCommand(command, false, null);
}

function _caWizRender() {
  var formTitle = document.getElementById('ca-inline-form-title');
  var formBody = document.getElementById('ca-inline-form-body');
  var formFooter = document.getElementById('ca-inline-form-footer');
  var formPanel = document.getElementById('ca-inline-add-form');
  var typesEl = document.getElementById('ca-inline-add-types');
  var stepLabels = ['Employee & Violation', 'Date Range & Attendance', 'AI Narrative & Review', 'Confirm & Save'];

  if (formTitle) formTitle.innerHTML = `<span style="display:flex;align-items:center;gap:8px;">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366F1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/></svg>
    NTE Build Assist
    <span style="font-size:11px; color:var(--fg-muted); font-weight:400;">Step ${CA_NTE_WIZARD.step} of 4 — ${stepLabels[CA_NTE_WIZARD.step - 1]}</span>
  </span>`;

  var progressHtml = `<div style="display:flex;gap:4px;margin-bottom:16px;">
    ${[1,2,3,4].map(s => `<div style="flex:1;height:3px;border-radius:2px;background:${s <= CA_NTE_WIZARD.step ? '#6366F1' : 'var(--border)'};transition:background 0.2s;"></div>`).join('')}
  </div>`;

  if (formBody && formFooter) {
    if (CA_NTE_WIZARD.step === 1) _caWizStep1(formBody, formFooter, progressHtml);
    else if (CA_NTE_WIZARD.step === 2) _caWizStep2(formBody, formFooter, progressHtml);
    else if (CA_NTE_WIZARD.step === 3) _caWizStep3(formBody, formFooter, progressHtml);
    else if (CA_NTE_WIZARD.step === 4) _caWizStep4(formBody, formFooter, progressHtml);
  }

  // Show inline form, hide type chips
  if (typesEl) typesEl.style.display = 'none';
  if (formPanel) formPanel.style.display = 'block';
  var panel = document.getElementById('ca-inline-add');
  if (panel) { panel.style.display = 'block'; panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
}

// ---- Step 1: Employee + Violation Type (Multi-select) ----
function _caWizStep1(formBody, formFooter, progressHtml) {
  const empVal = CA_NTE_WIZARD.employee ? CA_NTE_WIZARD.employee.full_name + ' (' + CA_NTE_WIZARD.employee.ohr_id + ')' : '';
  const chipsHtml = CA_NTE_WIZARD.violations.length > 0
    ? '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px;">' +
      CA_NTE_WIZARD.violations.map(function(v, i) {
        return '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;background:#6366F110;border:1px solid #6366F130;border-radius:12px;font-size:11px;">' +
          '<strong>' + escapeHtml(v.code) + '</strong> ' + escapeHtml(v.text.substring(0, 40)) + (v.text.length > 40 ? '...' : '') +
          ' <span style="cursor:pointer;color:#EF4444;font-weight:700;margin-left:4px;" onclick="_caWizRemoveViolation(' + i + ')">&times;</span>' +
          '</span>';
      }).join('') + '</div>'
    : '';

  formBody.innerHTML = `${progressHtml}
    <div class="form-section">
      <div class="form-field">
        <label class="form-label">Employee <span class="required">*</span></label>
        <div class="searchable-select" id="ca-wiz-employee-wrapper">
          <input type="text" class="form-input" id="ca-wiz-employee-search" placeholder="Search by name or OHR..."
            autocomplete="off" value="${escapeAttr(empVal)}"
            oninput="_caWizFilterEmployees()" onclick="_caWizToggleEmployeeDropdown(true)" onfocus="_caWizToggleEmployeeDropdown(true)">
          <input type="hidden" id="ca-wiz-employee-ohr" value="${CA_NTE_WIZARD.employee ? escapeAttr(CA_NTE_WIZARD.employee.ohr_id) : ''}">
          <div class="searchable-select-dropdown" id="ca-wiz-employee-dropdown" style="display:none; max-height:200px; overflow-y:auto;"></div>
        </div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-field">
        <label class="form-label">Violation(s) <span class="required">*</span> <span style="font-size:10px; color:var(--fg-muted); font-weight:400;">— select one or more</span></label>
        <div class="searchable-select" id="ca-wiz-violation-wrapper">
          <input type="text" class="form-input" id="ca-wiz-violation-search" placeholder="Search violations by code, keyword, or section..."
            autocomplete="off" value=""
            oninput="_caWizFilterViolations()" onclick="_caWizToggleViolationDropdown(true)" onfocus="_caWizToggleViolationDropdown(true)">
          <div class="searchable-select-dropdown" id="ca-wiz-violation-dropdown" style="display:none; max-height:280px; overflow-y:auto;"></div>
        </div>
        ${chipsHtml}
      </div>
    </div>
    ${CA_NTE_WIZARD.employee ? `
    <div class="form-section" style="background:var(--bg-inset); padding:12px 16px; border-radius:var(--radius); border:1px solid var(--border);">
      <div style="font-size:11px; color:var(--fg-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px;">Employee Details</div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:12px;">
        <div><strong>Name:</strong> ${escapeHtml(CA_NTE_WIZARD.employee.full_name)}</div>
        <div><strong>OHR:</strong> ${escapeHtml(CA_NTE_WIZARD.employee.ohr_id)}</div>
        <div><strong>Role:</strong> ${escapeHtml(CA_NTE_WIZARD.employee.actual_role || '—')}</div>
        <div><strong>PG:</strong> ${escapeHtml(CA_NTE_WIZARD.employee.planning_group || '—')}</div>
        <div><strong>Supervisor:</strong> ${escapeHtml(CA_NTE_WIZARD.employee.supervisor_name || '—')}</div>
        <div><strong>Email:</strong> ${escapeHtml(CA_NTE_WIZARD.employee.meta_email || '—')}</div>
      </div>
    </div>` : ''}
  `;

  formFooter.innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="caCloseWizard()">← Back</button>
    <button class="btn btn-primary btn-sm" onclick="_caWizGoStep2()">Next →</button>
  `;
}

function _caWizRemoveViolation(idx) {
  CA_NTE_WIZARD.violations.splice(idx, 1);
  CA_NTE_WIZARD.violationType = CA_NTE_WIZARD.violations.length > 0 ? CA_NTE_WIZARD.violations[0] : null;
  _caWizRender();
}

// ---- Searchable Employee Picker ----
var _caWizEmpFilterTimer = null;
function _caWizFilterEmployees() {
  clearTimeout(_caWizEmpFilterTimer);
  _caWizEmpFilterTimer = setTimeout(function() {
    var search = (document.getElementById('ca-wiz-employee-search')?.value || '').toLowerCase();
    var dropdown = document.getElementById('ca-wiz-employee-dropdown');
    if (!dropdown || !search) { if (dropdown) dropdown.style.display = 'none'; return; }
    var matches = CA.employees
      .filter(function(e) { return e.actual_role !== 'Manager' && (
        (e.full_name || '').toLowerCase().includes(search) ||
        (e.ohr_id || '').toLowerCase().includes(search)
      ); })
      .slice(0, 30);
    if (matches.length === 0) {
      dropdown.innerHTML = '<div style="padding:8px 12px; color:var(--fg-muted); font-size:12px;">No matches found</div>';
    } else {
      dropdown.innerHTML = matches.map(function(e) {
        return '<div class="searchable-select-option" onclick="_caWizSelectEmployee(\'' + escapeAttr(e.ohr_id) + '\')" style="padding:6px 12px; cursor:pointer; font-size:12px;">' +
          '<strong>' + escapeHtml(e.full_name) + '</strong> <span style="color:var(--fg-muted);">(' + escapeHtml(e.ohr_id) + ')</span>' +
          '<span style="color:var(--fg-subtle); font-size:11px; margin-left:4px;">' + escapeHtml(e.planning_group || '') + '</span>' +
          '</div>';
      }).join('');
    }
    dropdown.style.display = '';
  }, 120);
}

function _caWizToggleEmployeeDropdown(show) {
  var dropdown = document.getElementById('ca-wiz-employee-dropdown');
  if (dropdown) dropdown.style.display = show ? '' : 'none';
  if (show) _caWizFilterEmployees();
}

function _caWizSelectEmployee(ohrId) {
  var emp = CA.employees.find(function(e) { return e.ohr_id === ohrId; });
  if (!emp) return;
  CA_NTE_WIZARD.employee = emp;
  document.getElementById('ca-wiz-employee-ohr').value = ohrId;
  document.getElementById('ca-wiz-employee-search').value = emp.full_name + ' (' + emp.ohr_id + ')';
  document.getElementById('ca-wiz-employee-dropdown').style.display = 'none';
  _caWizRender();
}

// ---- Searchable Violation Picker with Keyboard Navigation ----
var _caWizViolFilterTimer = null;
var _caWizViolActiveIdx = -1;
var _caWizViolMatchCodes = [];

function _caWizGetAllViolationItems() {
  if (typeof HR_VIOLATIONS === 'undefined') return [];
  var items = [];
  for (var ci = 0; ci < HR_VIOLATIONS.length; ci++) {
    var cat = HR_VIOLATIONS[ci];
    for (var si = 0; si < cat.subsections.length; si++) {
      var sub = cat.subsections[si];
      for (var ii = 0; ii < sub.items.length; ii++) {
        var item = sub.items[ii];
        items.push({
          code: item.code, text: item.text, penalty: item.penalty,
          category: cat.category, subsection: sub.code + ' ' + sub.title,
          subsectionCode: sub.code, subsectionTitle: sub.title,
          searchText: (item.code + ' ' + item.text + ' ' + cat.category + ' ' + sub.title).toLowerCase()
        });
      }
    }
  }
  return items;
}

function _caWizFilterViolations() {
  clearTimeout(_caWizViolFilterTimer);
  _caWizViolFilterTimer = setTimeout(function() {
    var search = (document.getElementById('ca-wiz-violation-search')?.value || '').toLowerCase().trim();
    var dropdown = document.getElementById('ca-wiz-violation-dropdown');
    if (!dropdown) return;
    var allItems = _caWizGetAllViolationItems();
    _caWizViolMatchCodes = [];
    _caWizViolActiveIdx = -1;
    if (!search) {
      // Show all grouped by category
      var grouped = {};
      allItems.forEach(function(item) {
        var key = item.category + ' > ' + item.subsection;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(item);
      });
      var html = '';
      var idx = 0;
      Object.keys(grouped).forEach(function(groupLabel) {
        html += '<div style="padding:4px 12px; font-size:10px; font-weight:700; color:var(--fg-muted); text-transform:uppercase; background:var(--bg-inset); border-bottom:1px solid var(--border); position:sticky; top:0; z-index:1;">' + escapeHtml(groupLabel) + '</div>';
        grouped[groupLabel].forEach(function(item) {
          _caWizViolMatchCodes.push(item.code);
          var isSelected = CA_NTE_WIZARD.violations.some(function(v) { return v.code === item.code; });
          html += '<div class="searchable-select-option" data-viol-idx="' + idx + '" data-viol-code="' + escapeAttr(item.code) + '" onclick="_caWizSelectViolation(\'' + escapeAttr(item.code) + '\')" onmouseenter="_caWizViolHighlight(' + idx + ')" style="padding:6px 12px; cursor:pointer; font-size:12px; line-height:1.4; border-bottom:1px solid var(--border); transition:background 0.1s;' + (isSelected ? ' background:#6366F110;' : '') + '">';
          html += '<strong style="color:#6366F1;">' + escapeHtml(item.code) + '</strong> ';
          html += '<span>' + escapeHtml(item.text) + '</span> ';
          html += '<span style="color:var(--fg-subtle); font-size:10px;">(' + escapeHtml(item.penalty) + ')</span>';
          html += '</div>';
          idx++;
        });
      });
      dropdown.innerHTML = html;
    } else {
      var matches = allItems.filter(function(item) { return item.searchText.includes(search); });
      if (matches.length === 0) {
        dropdown.innerHTML = '<div style="padding:8px 12px; color:var(--fg-muted); font-size:12px;">No violations match "' + escapeHtml(search) + '"</div>';
      } else {
        var grouped = {};
        matches.forEach(function(item) {
          var key = item.category + ' > ' + item.subsection;
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(item);
        });
        var html = '';
        var idx = 0;
        Object.keys(grouped).forEach(function(groupLabel) {
          html += '<div style="padding:4px 12px; font-size:10px; font-weight:700; color:var(--fg-muted); text-transform:uppercase; background:var(--bg-inset); border-bottom:1px solid var(--border); position:sticky; top:0; z-index:1;">' + escapeHtml(groupLabel) + '</div>';
          grouped[groupLabel].forEach(function(item) {
            _caWizViolMatchCodes.push(item.code);
            var isSelected = CA_NTE_WIZARD.violations.some(function(v) { return v.code === item.code; });
            html += '<div class="searchable-select-option" data-viol-idx="' + idx + '" data-viol-code="' + escapeAttr(item.code) + '" onclick="_caWizSelectViolation(\'' + escapeAttr(item.code) + '\')" onmouseenter="_caWizViolHighlight(' + idx + ')" style="padding:6px 12px; cursor:pointer; font-size:12px; line-height:1.4; border-bottom:1px solid var(--border); transition:background 0.1s;' + (isSelected ? ' background:#6366F110;' : '') + '">';
            html += '<strong style="color:#6366F1;">' + escapeHtml(item.code) + '</strong> ';
            html += '<span>' + escapeHtml(item.text) + '</span> ';
            html += '<span style="color:var(--fg-subtle); font-size:10px;">(' + escapeHtml(item.penalty) + ')</span>';
            html += '</div>';
            idx++;
          });
        });
        dropdown.innerHTML = html;
      }
    }
    dropdown.style.display = '';
  }, 100);
}

function _caWizViolHighlight(idx) {
  var dropdown = document.getElementById('ca-wiz-violation-dropdown');
  if (!dropdown) return;
  var prev = dropdown.querySelector('[data-viol-idx="' + _caWizViolActiveIdx + '"]');
  if (prev) prev.style.background = '';
  _caWizViolActiveIdx = idx;
  var el = dropdown.querySelector('[data-viol-idx="' + idx + '"]');
  if (el) {
    el.style.background = '#6366F118';
    var dropRect = dropdown.getBoundingClientRect();
    var elRect = el.getBoundingClientRect();
    if (elRect.bottom > dropRect.bottom) el.scrollIntoView({ block: 'nearest' });
    if (elRect.top < dropRect.top) el.scrollIntoView({ block: 'nearest' });
  }
}

function _caWizToggleViolationDropdown(show) {
  var dropdown = document.getElementById('ca-wiz-violation-dropdown');
  if (dropdown) {
    dropdown.style.display = show ? '' : 'none';
    if (show) {
      _caWizViolActiveIdx = -1;
      _caWizFilterViolations();
    }
  }
}

function _caWizSelectViolation(code) {
  if (CA_NTE_WIZARD.violations.some(function(v) { return v.code === code; })) {
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
            code: item.code, type: item.text, text: item.text, penalty: item.penalty,
            category: cat.category, subsection: sub.code + ' ' + sub.title,
            subsectionCode: sub.code, subsectionTitle: sub.title
          };
          CA_NTE_WIZARD.violations.push(violationObj);
          if (!CA_NTE_WIZARD.violationType) CA_NTE_WIZARD.violationType = violationObj;
          CA_NTE_WIZARD.violationSubtype = '';
          _caWizRender();
          return;
        }
      }
    }
  }
}

// Keyboard navigation for violation search
document.addEventListener('keydown', function(e) {
  var input = document.getElementById('ca-wiz-violation-search');
  if (!input || document.activeElement !== input) return;
  var dropdown = document.getElementById('ca-wiz-violation-dropdown');
  if (!dropdown || dropdown.style.display === 'none') return;
  var total = _caWizViolMatchCodes.length;
  if (total === 0) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    var next = _caWizViolActiveIdx + 1;
    if (next >= total) next = 0;
    _caWizViolHighlight(next);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    var prev = _caWizViolActiveIdx - 1;
    if (prev < 0) prev = total - 1;
    _caWizViolHighlight(prev);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (_caWizViolActiveIdx >= 0 && _caWizViolActiveIdx < total) {
      _caWizSelectViolation(_caWizViolMatchCodes[_caWizViolActiveIdx]);
    }
  } else if (e.key === 'Escape') {
    dropdown.style.display = 'none';
    _caWizViolActiveIdx = -1;
  }
});

// Close dropdowns on outside click
document.addEventListener('click', function(e) {
  var empWrapper = document.getElementById('ca-wiz-employee-wrapper');
  if (empWrapper && !empWrapper.contains(e.target)) {
    _caWizToggleEmployeeDropdown(false);
  }
  var violWrapper = document.getElementById('ca-wiz-violation-wrapper');
  var violDropdown = document.getElementById('ca-wiz-violation-dropdown');
  if (violWrapper && violDropdown && !violWrapper.contains(e.target)) {
    violDropdown.style.display = 'none';
    _caWizViolActiveIdx = -1;
  }
});

// ---- Step 2: Date Range & Attendance ----
async function _caWizGoStep2() {
  if (!CA_NTE_WIZARD.employee) { showToast('Please select an employee', 'error'); return; }
  if (CA_NTE_WIZARD.violations.length === 0) { showToast('Please select at least one violation', 'error'); return; }
  CA_NTE_WIZARD.step = 2;
  var today = new Date();
  var twoWeeksAgo = new Date(today);
  twoWeeksAgo.setDate(today.getDate() - 14);
  if (!CA_NTE_WIZARD.dateRange.start) CA_NTE_WIZARD.dateRange.start = twoWeeksAgo.toISOString().split('T')[0];
  if (!CA_NTE_WIZARD.dateRange.end) CA_NTE_WIZARD.dateRange.end = today.toISOString().split('T')[0];
  _caWizRender();
  await _caWizFetchAttendanceAndHistory();
}

async function _caWizFetchAttendanceAndHistory() {
  var loadingEl = document.getElementById('ca-wiz-attendance-loading');
  if (loadingEl) loadingEl.style.display = '';
  try {
    var [attResp, histResp] = await Promise.all([
      fetch(IO_API_BASE + '/attendance?ohr_id=' + encodeURIComponent(CA_NTE_WIZARD.employee.ohr_id) + '&log_date_gte=' + CA_NTE_WIZARD.dateRange.start + '&log_date_lte=' + CA_NTE_WIZARD.dateRange.end + '&limit=100'),
      fetch(IO_API_BASE + '/corrective-actions/employee/' + encodeURIComponent(CA_NTE_WIZARD.employee.ohr_id) + '/history')
    ]);
    CA_NTE_WIZARD.attendance = attResp.ok ? await attResp.json() : [];
    if (CA_NTE_WIZARD.attendance.data) CA_NTE_WIZARD.attendance = CA_NTE_WIZARD.attendance.data;
    CA_NTE_WIZARD.previousCAs = histResp.ok ? await histResp.json() : [];
    _caWizDetermineCapLevel();
  } catch (e) {
    console.error('CA Wizard fetch error:', e);
    showToast('Failed to load data: ' + e.message, 'error');
  }
  _caWizRender();
}

function _caWizDetermineCapLevel() {
  var capLevels = ['CAP 0', 'CAP 1', 'CAP 2', 'CAP 3', 'Review for Termination'];
  var highestIdx = 0;
  CA_NTE_WIZARD.violations.forEach(function(v) {
    // Handle range-style penalties like "CAP 1 up to Review for Termination"
    var penalty = v.penalty || 'CAP 0';
    var idx = capLevels.indexOf(penalty);
    if (idx < 0) {
      // Try extracting the base level from range strings
      for (var i = capLevels.length - 1; i >= 0; i--) {
        if (penalty.includes(capLevels[i])) { idx = i; break; }
      }
      if (idx < 0) idx = 0;
    }
    if (idx > highestIdx) highestIdx = idx;
  });
  // Count active/recent CAs for escalation
  var activeCount = CA_NTE_WIZARD.previousCAs.filter(function(ca) {
    return ca.status === 'CAP Issued' || ca.status === 'Served';
  }).length;
  var escalatedIdx = Math.min(highestIdx + activeCount, capLevels.length - 1);
  CA_NTE_WIZARD.capLevel = capLevels[Math.max(highestIdx, escalatedIdx)];
}

function _caWizStep2(formBody, formFooter, progressHtml) {
  var attHtml = '';
  if (CA_NTE_WIZARD.attendance.length > 0) {
    attHtml = '<div style="max-height:200px; overflow-y:auto; border:1px solid var(--border); border-radius:var(--radius);">' +
      '<table style="width:100%; border-collapse:collapse; font-size:11px;">' +
      '<thead><tr style="background:var(--bg-inset); position:sticky; top:0;">' +
      '<th style="padding:4px 8px; text-align:left; font-weight:600;">Date</th>' +
      '<th style="padding:4px 8px; text-align:left; font-weight:600;">Tag</th>' +
      '<th style="padding:4px 8px; text-align:left; font-weight:600;">Reason</th>' +
      '<th style="padding:4px 8px; text-align:left; font-weight:600;">OT Hrs</th>' +
      '</tr></thead><tbody>';
    CA_NTE_WIZARD.attendance.forEach(function(a) {
      var tagColor = a.tag === 'Absent' ? '#EF4444' : a.tag === 'Tardy' ? '#F59E0B' : a.tag === 'UPL' ? '#F97316' : 'var(--fg)';
      attHtml += '<tr style="border-bottom:1px solid var(--border);">' +
        '<td style="padding:4px 8px;">' + escapeHtml(a.log_date || '') + '</td>' +
        '<td style="padding:4px 8px; color:' + tagColor + '; font-weight:600;">' + escapeHtml(a.tag || '') + '</td>' +
        '<td style="padding:4px 8px; color:var(--fg-muted);">' + escapeHtml(a.upl_reason || a.notes || '—') + '</td>' +
        '<td style="padding:4px 8px;">' + escapeHtml(a.ot_hours || '—') + '</td>' +
        '</tr>';
    });
    attHtml += '</tbody></table></div>';
  } else {
    attHtml = '<div id="ca-wiz-attendance-loading" style="text-align:center; padding:20px; color:var(--fg-muted); font-size:12px;">Loading attendance data...</div>';
  }

  // Previous CAs summary
  var prevHtml = CA_NTE_WIZARD.previousCAs.length > 0
    ? '<div style="margin-top:12px;">' +
      '<div style="font-size:11px; color:var(--fg-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Previous Corrective Actions (' + CA_NTE_WIZARD.previousCAs.length + ')</div>' +
      CA_NTE_WIZARD.previousCAs.map(function(ca) {
        return '<div style="padding:6px 10px; background:var(--bg-inset); border:1px solid var(--border); border-radius:var(--radius); margin-bottom:4px; font-size:11px;">' +
          '<strong style="color:' + (ca.cap_level === 'CAP 3' ? '#EF4444' : ca.cap_level === 'CAP 2' ? '#F59E0B' : '#3B82F6') + ';">' + escapeHtml(ca.cap_level || ca.status) + '</strong>' +
          '<span style="color:var(--fg-muted); margin-left:8px;">' + (ca.date_of_incident ? new Date(ca.date_of_incident).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '') + '</span>' +
          '<span style="color:var(--fg-subtle); margin-left:8px;">' + escapeHtml(((ca.incident_description || '').replace(/<[^>]*>/g, '')).substring(0, 80)) + ((ca.incident_description || '').length > 80 ? '...' : '') + '</span>' +
          '</div>';
      }).join('') + '</div>'
    : '<div style="margin-top:12px; font-size:12px; color:var(--fg-muted); font-style:italic;">No previous corrective actions on record.</div>';

  var capColor = CA_NTE_WIZARD.capLevel === 'CAP 3' ? '#EF4444' : CA_NTE_WIZARD.capLevel === 'CAP 2' ? '#F59E0B' : CA_NTE_WIZARD.capLevel === 'CAP 1' ? '#3B82F6' : CA_NTE_WIZARD.capLevel === 'Review for Termination' ? '#DC2626' : '#6B7280';

  formBody.innerHTML = progressHtml +
    '<div class="form-section">' +
      '<div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">' +
        '<div class="form-field"><label class="form-label">Start Date</label>' +
          '<input type="date" class="form-input" id="ca-wiz-start" value="' + escapeAttr(CA_NTE_WIZARD.dateRange.start) + '" onchange="_caWizDateChange()"></div>' +
        '<div class="form-field"><label class="form-label">End Date</label>' +
          '<input type="date" class="form-input" id="ca-wiz-end" value="' + escapeAttr(CA_NTE_WIZARD.dateRange.end) + '" onchange="_caWizDateChange()"></div>' +
      '</div>' +
      '<button class="btn btn-outline btn-xs" style="margin-top:8px;" onclick="_caWizRefreshAttendance()">↻ Refresh Attendance</button>' +
    '</div>' +
    '<div class="form-section">' +
      '<div style="font-size:11px; color:var(--fg-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Attendance Snapshot (Annexure A)</div>' +
      attHtml +
    '</div>' +
    '<div class="form-section">' +
      '<div style="display:flex; align-items:center; justify-content:space-between;">' +
        '<div>' +
          '<div style="font-size:11px; color:var(--fg-muted); text-transform:uppercase; letter-spacing:0.5px;">Recommended CAP Level</div>' +
          '<div style="margin-top:4px;"><span style="display:inline-block; padding:4px 14px; border-radius:12px; font-size:13px; font-weight:700; background:' + capColor + '15; color:' + capColor + ';">' + escapeHtml(CA_NTE_WIZARD.capLevel) + '</span></div>' +
        '</div>' +
        '<div class="form-field" style="width:160px;">' +
          '<label class="form-label" style="font-size:11px;">Override CAP Level</label>' +
          '<select class="form-select" id="ca-wiz-cap-override" onchange="CA_NTE_WIZARD.capLevel = this.value; _caWizRender();" style="font-size:12px;">' +
            '<option value="CAP 0"' + (CA_NTE_WIZARD.capLevel === 'CAP 0' ? ' selected' : '') + '>CAP 0</option>' +
            '<option value="CAP 1"' + (CA_NTE_WIZARD.capLevel === 'CAP 1' ? ' selected' : '') + '>CAP 1</option>' +
            '<option value="CAP 2"' + (CA_NTE_WIZARD.capLevel === 'CAP 2' ? ' selected' : '') + '>CAP 2</option>' +
            '<option value="CAP 3"' + (CA_NTE_WIZARD.capLevel === 'CAP 3' ? ' selected' : '') + '>CAP 3</option>' +
            '<option value="Review for Termination"' + (CA_NTE_WIZARD.capLevel === 'Review for Termination' ? ' selected' : '') + '>Review for Termination</option>' +
          '</select>' +
        '</div>' +
      '</div>' +
      prevHtml +
    '</div>';

  formFooter.innerHTML = '<button class="btn btn-outline btn-sm" onclick="CA_NTE_WIZARD.step = 1; _caWizRender();">← Back</button>' +
    '<button class="btn btn-primary btn-sm" onclick="_caWizGoStep3()">Generate Narrative →</button>';
}

function _caWizDateChange() {
  CA_NTE_WIZARD.dateRange.start = document.getElementById('ca-wiz-start')?.value || '';
  CA_NTE_WIZARD.dateRange.end = document.getElementById('ca-wiz-end')?.value || '';
}

async function _caWizRefreshAttendance() {
  _caWizDateChange();
  CA_NTE_WIZARD.attendance = [];
  _caWizRender();
  await _caWizFetchAttendanceAndHistory();
}

// ---- Step 3: AI Narrative & Review ----
async function _caWizGoStep3() {
  _caWizDateChange();
  if (!CA_NTE_WIZARD.dateRange.start || !CA_NTE_WIZARD.dateRange.end) {
    showToast('Please select a date range', 'error'); return;
  }
  CA_NTE_WIZARD.step = 3;
  CA_NTE_WIZARD.isGenerating = true;
  _caWizRender();
  try {
    var resp = await fetch(IO_API_BASE + '/nte-build-assist/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee: {
          full_name: CA_NTE_WIZARD.employee.full_name,
          ohr_id: CA_NTE_WIZARD.employee.ohr_id,
          actual_role: CA_NTE_WIZARD.employee.actual_role,
          planning_group: CA_NTE_WIZARD.employee.planning_group,
          supervisor_name: CA_NTE_WIZARD.employee.supervisor_name,
          supervisor_email: CA_NTE_WIZARD.employee.supervisor_email,
          meta_email: CA_NTE_WIZARD.employee.meta_email
        },
        violation: CA_NTE_WIZARD.violations[0] ? {
          code: CA_NTE_WIZARD.violations[0].code, type: CA_NTE_WIZARD.violations[0].type,
          text: CA_NTE_WIZARD.violations[0].text, penalty: CA_NTE_WIZARD.violations[0].penalty,
          category: CA_NTE_WIZARD.violations[0].category,
          subsection: CA_NTE_WIZARD.violations[0].subsection || '',
          subsectionCode: CA_NTE_WIZARD.violations[0].subsectionCode || '',
          subsectionTitle: CA_NTE_WIZARD.violations[0].subsectionTitle || ''
        } : {},
        violations: CA_NTE_WIZARD.violations.map(function(v) {
          return { code: v.code, type: v.type, text: v.text, penalty: v.penalty, category: v.category, subsection: v.subsection || '', subsectionCode: v.subsectionCode || '', subsectionTitle: v.subsectionTitle || '' };
        }),
        cap_level: CA_NTE_WIZARD.capLevel,
        date_range: CA_NTE_WIZARD.dateRange,
        attendance: CA_NTE_WIZARD.attendance.map(function(a) { return { log_date: a.log_date, tag: a.tag, upl_reason: a.upl_reason, ot_hours: a.ot_hours }; }),
        previous_ntes: CA_NTE_WIZARD.previousCAs.map(function(ca) { return { cap_level: ca.cap_level, date_of_incident: ca.date_of_incident, incident_description: ((ca.incident_description || '').replace(/<[^>]*>/g, '')).substring(0, 200) }; })
      })
    });
    if (!resp.ok) throw new Error('AI generation failed');
    var result = await resp.json();
    CA_NTE_WIZARD.narrative = result.narrative || '';
    CA_NTE_WIZARD.policyText = result.policy_text || '';
  } catch (e) {
    console.error('CA NTE narrative generation error:', e);
    showToast('AI generation failed. You can write the narrative manually.', 'error');
    CA_NTE_WIZARD.narrative = '';
    CA_NTE_WIZARD.policyText = '';
  }
  CA_NTE_WIZARD.isGenerating = false;
  _caWizRender();
}

function _caWizStep3(formBody, formFooter, progressHtml) {
  if (CA_NTE_WIZARD.isGenerating) {
    formBody.innerHTML = progressHtml +
      '<div style="text-align:center; padding:60px 20px;">' +
        '<div style="display:inline-block; width:32px; height:32px; border:3px solid var(--border); border-top-color:#6366F1; border-radius:50%; animation:spin 0.8s linear infinite;"></div>' +
        '<div style="margin-top:16px; color:var(--fg-muted); font-size:13px;">Generating NTE narrative with AI...</div>' +
        '<div style="margin-top:8px; color:var(--fg-subtle); font-size:11px;">Analyzing attendance data, violation history, and policy references</div>' +
      '</div>' +
      '<style>@keyframes spin { to { transform: rotate(360deg); } }</style>';
    formFooter.innerHTML = '';
    return;
  }

  formBody.innerHTML = progressHtml +
    '<div class="form-section">' +
      '<div class="form-field">' +
        '<label class="form-label">Incident Narrative <span class="required">*</span></label>' +
        '<div style="font-size:11px; color:var(--fg-muted); margin-bottom:4px;">AI-generated — review and edit as needed</div>' +
        '<div class="rte-container">' +
          '<div class="rte-toolbar">' +
            '<button type="button" class="rte-btn" onclick="caRteExec(\'bold\')" title="Bold"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg></button>' +
            '<button type="button" class="rte-btn" onclick="caRteExec(\'italic\')" title="Italic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg></button>' +
          '</div>' +
          '<div class="rte-editor" id="ca-wiz-narrative" contenteditable="true" data-placeholder="Describe the incident..." style="min-height:100px;">' + CA_NTE_WIZARD.narrative + '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="form-section">' +
      '<div class="form-field">' +
        '<label class="form-label">Policy / Standard Violated <span class="required">*</span></label>' +
        '<div style="font-size:11px; color:var(--fg-muted); margin-bottom:4px;">AI-generated policy citations — review and edit</div>' +
        '<div class="rte-container">' +
          '<div class="rte-toolbar">' +
            '<button type="button" class="rte-btn" onclick="caRteExec(\'bold\')" title="Bold"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg></button>' +
            '<button type="button" class="rte-btn" onclick="caRteExec(\'italic\')" title="Italic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg></button>' +
          '</div>' +
          '<div class="rte-editor" id="ca-wiz-policy" contenteditable="true" data-placeholder="Specify the policy violated..." style="min-height:80px;">' + CA_NTE_WIZARD.policyText + '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="form-section" style="background:var(--bg-inset); padding:12px 16px; border-radius:var(--radius); border:1px solid var(--border);">' +
      '<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:12px;">' +
        '<div><strong>Employee:</strong> ' + escapeHtml(CA_NTE_WIZARD.employee.full_name) + '</div>' +
        '<div><strong>CAP Level:</strong> <span style="color:' + (CA_NTE_WIZARD.capLevel === 'CAP 3' ? '#EF4444' : CA_NTE_WIZARD.capLevel === 'CAP 2' ? '#F59E0B' : '#3B82F6') + '; font-weight:600;">' + escapeHtml(CA_NTE_WIZARD.capLevel) + '</span></div>' +
      '</div>' +
      '<div style="margin-top:8px; font-size:11px;"><strong>Violation(s):</strong></div>' +
      '<div style="margin-top:4px; display:flex; flex-wrap:wrap; gap:4px;">' +
        CA_NTE_WIZARD.violations.map(function(v) {
          return '<span style="padding:2px 8px; background:#6366F110; border:1px solid #6366F130; border-radius:12px; font-size:10px;"><strong>' + escapeHtml(v.code) + '</strong> ' + escapeHtml(v.text.substring(0, 50)) + (v.text.length > 50 ? '...' : '') + '</span>';
        }).join('') +
      '</div>' +
    '</div>';

  formFooter.innerHTML = '<button class="btn btn-outline btn-sm" onclick="CA_NTE_WIZARD.step = 2; _caWizRender();">← Back</button>' +
    '<button class="btn btn-outline btn-sm" onclick="_caWizRegenerate()">↻ Regenerate</button>' +
    '<button class="btn btn-primary btn-sm" onclick="_caWizGoStep4()">Review & Confirm →</button>';
}

async function _caWizRegenerate() {
  CA_NTE_WIZARD.isGenerating = true;
  _caWizRender();
  await _caWizGoStep3();
}

function _caWizGoStep4() {
  CA_NTE_WIZARD.narrative = document.getElementById('ca-wiz-narrative')?.innerHTML?.trim() || '';
  CA_NTE_WIZARD.policyText = document.getElementById('ca-wiz-policy')?.innerHTML?.trim() || '';
  if (!CA_NTE_WIZARD.narrative || CA_NTE_WIZARD.narrative === '<br>') {
    showToast('Please provide an incident narrative', 'error'); return;
  }
  if (!CA_NTE_WIZARD.policyText || CA_NTE_WIZARD.policyText === '<br>') {
    showToast('Please specify the policy violated', 'error'); return;
  }
  CA_NTE_WIZARD.step = 4;
  _caWizRender();
}

// ---- Step 4: Confirm & Save ----
function _caWizStep4(formBody, formFooter, progressHtml) {
  var capColor = CA_NTE_WIZARD.capLevel === 'CAP 3' ? '#EF4444' : CA_NTE_WIZARD.capLevel === 'CAP 2' ? '#F59E0B' : CA_NTE_WIZARD.capLevel === 'CAP 1' ? '#3B82F6' : CA_NTE_WIZARD.capLevel === 'Review for Termination' ? '#DC2626' : '#6B7280';
  var coach = typeof currentUser !== 'undefined' ? currentUser : null;

  formBody.innerHTML = progressHtml +
    '<div style="padding:12px 16px; background:#6366F108; border:1px solid #6366F130; border-radius:var(--radius); margin-bottom:16px;">' +
      '<div style="font-size:13px; font-weight:600; color:#6366F1; margin-bottom:4px;">NTE Summary — Ready to Submit</div>' +
      '<div style="font-size:11px; color:var(--fg-muted);">Review all details below. This will create a corrective action record and generate the NTE document.</div>' +
    '</div>' +
    '<div class="form-section">' +
      '<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:12px;">' +
        '<div class="detail-row"><span class="detail-label">EMPLOYEE</span><span class="detail-value">' + escapeHtml(CA_NTE_WIZARD.employee.full_name) + ' (' + escapeHtml(CA_NTE_WIZARD.employee.ohr_id) + ')</span></div>' +
        '<div class="detail-row"><span class="detail-label">ROLE</span><span class="detail-value">' + escapeHtml(CA_NTE_WIZARD.employee.actual_role || '—') + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">SUPERVISOR</span><span class="detail-value">' + escapeHtml(CA_NTE_WIZARD.employee.supervisor_name || '—') + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">PLANNING GROUP</span><span class="detail-value">' + escapeHtml(CA_NTE_WIZARD.employee.planning_group || '—') + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">VIOLATION(S)</span><span class="detail-value">' + CA_NTE_WIZARD.violations.map(function(v) { return escapeHtml(v.code + ' — ' + v.type); }).join('<br>') + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">CAP LEVEL</span><span class="detail-value"><span style="padding:2px 10px; border-radius:12px; font-size:11px; font-weight:600; background:' + capColor + '15; color:' + capColor + ';">' + escapeHtml(CA_NTE_WIZARD.capLevel) + '</span></span></div>' +
        '<div class="detail-row"><span class="detail-label">DATE RANGE</span><span class="detail-value">' + escapeHtml(CA_NTE_WIZARD.dateRange.start) + ' to ' + escapeHtml(CA_NTE_WIZARD.dateRange.end) + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">ISSUED BY</span><span class="detail-value">' + escapeHtml(coach ? coach.full_name : '—') + (coach ? ' (' + escapeHtml(coach.ohr_id) + ')' : '') + '</span></div>' +
      '</div>' +
    '</div>' +
    '<div class="form-section">' +
      '<h4 class="form-section-title">Incident Narrative</h4>' +
      '<div style="padding:10px 14px; background:var(--bg-inset); border:1px solid var(--border); border-radius:var(--radius); font-size:13px; line-height:1.6;">' + CA_NTE_WIZARD.narrative + '</div>' +
    '</div>' +
    '<div class="form-section">' +
      '<h4 class="form-section-title">Policy Violated</h4>' +
      '<div style="padding:10px 14px; background:var(--bg-inset); border:1px solid var(--border); border-radius:var(--radius); font-size:13px; line-height:1.6;">' + CA_NTE_WIZARD.policyText + '</div>' +
    '</div>';

  formFooter.innerHTML = '<button class="btn btn-outline btn-sm" onclick="CA_NTE_WIZARD.step = 3; _caWizRender();">← Back</button>' +
    '<button class="btn btn-primary btn-sm" id="ca-wiz-submit-btn" onclick="_caWizSubmit()" style="display:flex; align-items:center; gap:6px;">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' +
      'Generate NTE Document' +
    '</button>';
}

async function _caWizSubmit() {
  var coach = typeof currentUser !== 'undefined' ? currentUser : null;
  var submitBtn = document.getElementById('ca-wiz-submit-btn');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<span class="spinner-sm"></span> Creating Record...'; }

  try {
    // 1. Create the corrective action record
    var caPayload = {
      employee_name: CA_NTE_WIZARD.employee.full_name,
      ohr_id: CA_NTE_WIZARD.employee.ohr_id,
      employee_email: CA_NTE_WIZARD.employee.meta_email || null,
      supervisor_name: CA_NTE_WIZARD.employee.supervisor_name || (coach ? coach.full_name : ''),
      supervisor_ohr: CA_NTE_WIZARD.employee.supervisor_ohr || (coach ? coach.ohr_id : ''),
      supervisor_email: CA_NTE_WIZARD.employee.supervisor_email || null,
      planning_group: CA_NTE_WIZARD.employee.planning_group || null,
      actual_role: CA_NTE_WIZARD.employee.actual_role || null,
      nte_type: 'Attendance & Tardiness',
      date_of_incident: CA_NTE_WIZARD.dateRange.start,
      incident_description: CA_NTE_WIZARD.narrative,
      policy_violated: CA_NTE_WIZARD.policyText,
      violations: CA_NTE_WIZARD.violations.map(function(v) {
        return { code: v.code, text: v.text, penalty: v.penalty, category: v.category, subsection: v.subsection };
      }),
      indicated_cap_level: CA_NTE_WIZARD.capLevel,
      created_by: coach ? coach.full_name : '',
      created_by_ohr: coach ? coach.ohr_id : '',
    };

    var caResp = await fetch(IO_API_BASE + '/corrective-actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(caPayload)
    });
    if (!caResp.ok) throw new Error('Failed to create corrective action record');
    var caCreated = await caResp.json();

    // 2. Also create a coaching log for audit trail (NTE Log type, awareness-only)
    if (submitBtn) { submitBtn.innerHTML = '<span class="spinner-sm"></span> Creating Coaching Log...'; }
    var coachingRecord = {
      coaching_type: 'NTE Log',
      coach: coach ? coach.full_name : '',
      coach_ohr: coach ? coach.ohr_id : '',
      coach_meta_email: coach ? (coach.meta_email || '') : '',
      coach_sup: coach ? (coach.supervisor_name || '') : '',
      coach_sup_email: coach ? (coach.supervisor_email || '') : '',
      coach_pg: coach ? coach.planning_group : '',
      coaching_date: new Date().toISOString(),
      coachee: CA_NTE_WIZARD.employee.full_name,
      coachee_ohr: CA_NTE_WIZARD.employee.ohr_id,
      coachee_meta_email: CA_NTE_WIZARD.employee.meta_email || '',
      coachee_sup: CA_NTE_WIZARD.employee.supervisor_name || '',
      coachee_sup_email: CA_NTE_WIZARD.employee.supervisor_email || '',
      coachee_pg: CA_NTE_WIZARD.employee.planning_group || '',
      session_goal: 'Attendance & Tardiness',
      coaching_details: CA_NTE_WIZARD.narrative,
      status: 'Issued',
      cap_level: CA_NTE_WIZARD.capLevel,
      coachee_list: []
    };
    var coachResp = await fetch(IO_API_BASE + '/coaching', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(coachingRecord)
    });
    var coachingId = null;
    if (coachResp.ok) {
      var created = await coachResp.json();
      coachingId = created?.coaching_id || (Array.isArray(created) ? created[0]?.coaching_id : null) || created?.id;
    }

    // 3. Generate the NTE DOCX document
    if (submitBtn) { submitBtn.innerHTML = '<span class="spinner-sm"></span> Generating DOCX...'; }
    var docxPayload = {
      date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      employee: {
        full_name: CA_NTE_WIZARD.employee.full_name,
        ohr_id: CA_NTE_WIZARD.employee.ohr_id,
        actual_role: CA_NTE_WIZARD.employee.actual_role || 'Process Associate',
        department: CA_NTE_WIZARD.employee.department || 'Operations',
        supervisor_name: CA_NTE_WIZARD.employee.supervisor_name || '',
        gender: CA_NTE_WIZARD.employee.gender || 'Male',
        sex: CA_NTE_WIZARD.employee.sex || '',
      },
      narrative: CA_NTE_WIZARD.narrative,
      policy_sections: CA_NTE_WIZARD.policyText ? [CA_NTE_WIZARD.policyText] : [],
      cap_level: CA_NTE_WIZARD.capLevel,
      violation: CA_NTE_WIZARD.violations[0] || CA_NTE_WIZARD.violationType,
      violations: CA_NTE_WIZARD.violations,
      flm_name: CA_NTE_WIZARD.employee.supervisor_name || '',
      hr_name: 'Jocelyn Ramos',
      include_cwd_page: false,
    };
    var docxResp = await fetch(IO_API_BASE + '/nte-build-assist/docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(docxPayload)
    });
    if (!docxResp.ok) {
      var errData = await docxResp.json().catch(function() { return {}; });
      throw new Error('DOCX generation failed: ' + (errData.error || docxResp.statusText));
    }

    // Download the DOCX file
    var blob = await docxResp.blob();
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var safeName = CA_NTE_WIZARD.employee.full_name.replace(/[^a-zA-Z0-9 ,]/g, '').replace(/\s+/g, '_');
    a.href = url;
    a.download = 'NTE_' + safeName + '_' + new Date().toISOString().slice(0, 10) + '.docx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('NTE document generated and downloaded! CA record created.', 'success');
    caCloseWizard();
    // Refresh the corrective actions list
    await Promise.all([caFetchRecords(), caFetchStats()]);
    caRenderSummaryCards();
    caApplyFilters();
  } catch (e) {
    console.error('CA NTE submission error:', e);
    showToast('Failed to create NTE: ' + e.message, 'error');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = 'Generate NTE Document'; }
  }
}

// ===== Assign CAP Modal & Dismiss — REMOVED (handled via Document Build Assist) =====
// Kept as stubs in case any residual calls exist
function caOpenCapModal() { showToast('Use Document Build Assist to manage CAP assignments', 'info'); }
function caCloseCapModal() { const o = document.getElementById('ca-cap-overlay'); if (o) o.classList.remove('active'); }
function caOnCapLevelChange() {}
async function caSubmitCap() {}
function caOpenDismissConfirm() { showToast('Dismiss functionality has been removed', 'info'); }
async function caSubmitDismiss() {}

/*--- REMOVED CODE START (Assign CAP Modal + Dismiss Confirmation) ---
function caOpenCapModal_REMOVED() {
  const overlay = document.getElementById('ca-cap-overlay');
  if (!overlay || !CA.currentDetail) return;

  const record = CA.currentDetail;
  const body = document.getElementById('ca-cap-body');
  const footer = document.getElementById('ca-cap-footer');
  const title = document.getElementById('ca-cap-title');
  if (title) title.textContent = `Assign CAP — ${record.employee_name}`;

  body.innerHTML = `
    <div class="ca-form-group">
      <label>CAP Level *</label>
      <select id="ca-cap-level" onchange="caOnCapLevelChange()">
        <option value="">— Select CAP Level —</option>
        ${CA_CAP_LEVELS.map(l => `<option value="${l}">${l} ${CA_CAP_ACTIVE_DAYS[l] > 0 ? `(${CA_CAP_ACTIVE_DAYS[l]} days)` : ''}</option>`).join('')}
      </select>
    </div>
    <div class="ca-form-row">
      <div class="ca-form-group">
        <label>CAP Start Date</label>
        <input type="date" id="ca-cap-start-date" value="${new Date().toISOString().slice(0,10)}">
      </div>
      <div class="ca-form-group" id="ca-cap-suspension-group" style="display:none;">
        <label>Suspension Days</label>
        <input type="number" id="ca-cap-suspension-days" min="1" max="30" placeholder="Number of days">
      </div>
    </div>
    <div class="ca-form-group">
      <label>Remarks</label>
      <textarea id="ca-cap-remarks" placeholder="Decision rationale or additional notes..."></textarea>
    </div>
    <div class="ca-form-group">
      <label style="display:flex;align-items:center;gap:6px;">
        <input type="checkbox" id="ca-cap-nod" style="width:auto;margin:0;"> Issue Notice of Decision (NOD)
      </label>
    </div>
    <div class="ca-form-group" id="ca-cap-nod-summary-group" style="display:none;">
      <label>NOD Summary</label>
      <textarea id="ca-cap-nod-summary" placeholder="Summary of the decision for the NOD..."></textarea>
    </div>
  `;

  // NOD checkbox toggle
  setTimeout(() => {
    const nodCb = document.getElementById('ca-cap-nod');
    if (nodCb) {
      nodCb.onchange = () => {
        const group = document.getElementById('ca-cap-nod-summary-group');
        if (group) group.style.display = nodCb.checked ? '' : 'none';
      };
    }
  }, 50);

  footer.innerHTML = `
    <button class="ca-btn ghost" onclick="caCloseCapModal()">Cancel</button>
    <button class="ca-btn primary" id="ca-cap-submit-btn" onclick="caSubmitCap()">Assign CAP</button>
  `;

  overlay.classList.add('active');
}

function caCloseCapModal() {
  const overlay = document.getElementById('ca-cap-overlay');
  if (overlay) overlay.classList.remove('active');
}

function caOnCapLevelChange() {
  const level = document.getElementById('ca-cap-level');
  const suspGroup = document.getElementById('ca-cap-suspension-group');
  if (!level) return;
  if (suspGroup) {
    suspGroup.style.display = level.value === 'Corrective Suspension' ? '' : 'none';
  }
}

async function caSubmitCap() {
  const levelEl = document.getElementById('ca-cap-level');
  const startEl = document.getElementById('ca-cap-start-date');
  const remarksEl = document.getElementById('ca-cap-remarks');
  const suspEl = document.getElementById('ca-cap-suspension-days');
  const nodEl = document.getElementById('ca-cap-nod');
  const nodSummaryEl = document.getElementById('ca-cap-nod-summary');
  const submitBtn = document.getElementById('ca-cap-submit-btn');

  if (!levelEl || !levelEl.value) { showToast('Please select a CAP level', 'error'); return; }
  if (!CA.currentDetail) return;

  const payload = {
    action: 'assign_cap',
    cap_level: levelEl.value,
    cap_start_date: startEl ? startEl.value : new Date().toISOString().slice(0,10),
    remarks: remarksEl ? remarksEl.value.trim() : null,
    suspension_days: suspEl && levelEl.value === 'Corrective Suspension' ? parseInt(suspEl.value) || null : null,
    nod_issued: nodEl ? nodEl.checked : false,
    nod_summary: nodSummaryEl ? nodSummaryEl.value.trim() : null,
    decision_by: currentUser.full_name,
    decision_by_ohr: currentUser.ohr_id,
  };

  if (submitBtn) submitBtn.disabled = true;
  try {
    const resp = await fetch(`${IO_API_BASE}/corrective-actions/${CA.currentDetail.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to assign CAP');
    }
    showToast(`${levelEl.value} assigned successfully`, 'success');
    caCloseCapModal();
    caCloseDetail();
    await Promise.all([caFetchRecords(), caFetchStats()]);
    caRenderSummaryCards();
    caApplyFilters();
  } catch (err) {
    showToast(err.message || 'Failed to assign CAP', 'error');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

// ===== Dismiss Confirmation =====
function caOpenDismissConfirm() {
  if (!CA.currentDetail) return;
  const overlay = document.getElementById('ca-cap-overlay');
  const body = document.getElementById('ca-cap-body');
  const footer = document.getElementById('ca-cap-footer');
  const title = document.getElementById('ca-cap-title');

  if (title) title.textContent = `Dismiss NTE — ${CA.currentDetail.employee_name}`;

  body.innerHTML = `
    <div style="text-align:center;margin-bottom:16px;">
      <div class="disputes-confirm-icon success">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <p style="font-size:14px;color:var(--compass-text);margin:0;">Dismiss this NTE with no further corrective action?</p>
    </div>
    <div class="ca-form-group">
      <label>Remarks (optional)</label>
      <textarea id="ca-dismiss-remarks" placeholder="Reason for dismissal..."></textarea>
    </div>
    <div class="ca-form-group">
      <label style="display:flex;align-items:center;gap:6px;">
        <input type="checkbox" id="ca-dismiss-nod" style="width:auto;margin:0;"> Issue Notice of Decision (NOD)
      </label>
    </div>
    <div class="ca-form-group" id="ca-dismiss-nod-summary-group" style="display:none;">
      <label>NOD Summary</label>
      <textarea id="ca-dismiss-nod-summary" placeholder="Summary for the NOD..."></textarea>
    </div>
  `;

  setTimeout(() => {
    const nodCb = document.getElementById('ca-dismiss-nod');
    if (nodCb) {
      nodCb.onchange = () => {
        const group = document.getElementById('ca-dismiss-nod-summary-group');
        if (group) group.style.display = nodCb.checked ? '' : 'none';
      };
    }
  }, 50);

  footer.innerHTML = `
    <button class="ca-btn ghost" onclick="caCloseCapModal()">Cancel</button>
    <button class="ca-btn success" id="ca-dismiss-submit-btn" onclick="caSubmitDismiss()">Confirm Dismiss</button>
  `;

  if (overlay) overlay.classList.add('active');
}

async function caSubmitDismiss() {
  const remarksEl = document.getElementById('ca-dismiss-remarks');
  const nodEl = document.getElementById('ca-dismiss-nod');
  const nodSummaryEl = document.getElementById('ca-dismiss-nod-summary');
  const submitBtn = document.getElementById('ca-dismiss-submit-btn');

  if (!CA.currentDetail) return;

  const payload = {
    action: 'dismiss',
    remarks: remarksEl ? remarksEl.value.trim() : null,
    nod_issued: nodEl ? nodEl.checked : false,
    nod_summary: nodSummaryEl ? nodSummaryEl.value.trim() : null,
    decision_by: currentUser.full_name,
    decision_by_ohr: currentUser.ohr_id,
  };

  if (submitBtn) submitBtn.disabled = true;
  try {
    const resp = await fetch(`${IO_API_BASE}/corrective-actions/${CA.currentDetail.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to dismiss NTE');
    }
    showToast('NTE dismissed successfully', 'success');
    caCloseCapModal();
    caCloseDetail();
    await Promise.all([caFetchRecords(), caFetchStats()]);
    caRenderSummaryCards();
    caApplyFilters();
  } catch (err) {
    showToast(err.message || 'Failed to dismiss NTE', 'error');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}


--- REMOVED CODE END ---*/

// ===== CAP 1 Build Assist Wizard =====
// 3-step wizard: 1) Select Employee + Linked NTE  2) Explanation + AI Deliberation  3) Confirm & Generate DOCX

var _caCap1EmpFilterTimer = null;

function _caCap1WizRender() {
  var formTitle = document.getElementById('ca-inline-form-title');
  var formBody = document.getElementById('ca-inline-form-body');
  var formFooter = document.getElementById('ca-inline-form-footer');
  var formPanel = document.getElementById('ca-inline-add-form');
  var typesEl = document.getElementById('ca-inline-add-types');

  var stepLabels = ['Employee & NTE', 'Explanation & Deliberation', 'Confirm & Generate'];

  if (formTitle) formTitle.innerHTML = '<span style="display:flex;align-items:center;gap:8px;">' +
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' +
    'CAP 1 Build Assist' +
    '<span style="font-size:11px; color:var(--fg-muted); font-weight:400;">Step ' + CA_CAP1_WIZARD.step + ' of 3 — ' + stepLabels[CA_CAP1_WIZARD.step - 1] + '</span>' +
    '</span>';

  var progressHtml = '<div style="display:flex;gap:4px;margin-bottom:16px;">' +
    [1,2,3].map(function(s) {
      return '<div style="flex:1;height:3px;border-radius:2px;background:' + (s <= CA_CAP1_WIZARD.step ? '#3B82F6' : 'var(--border)') + ';transition:background 0.2s;"></div>';
    }).join('') + '</div>';

  if (formBody && formFooter) {
    if (CA_CAP1_WIZARD.step === 1) _caCap1Step1(formBody, formFooter, progressHtml);
    else if (CA_CAP1_WIZARD.step === 2) _caCap1Step2(formBody, formFooter, progressHtml);
    else if (CA_CAP1_WIZARD.step === 3) _caCap1Step3(formBody, formFooter, progressHtml);
  }

  if (typesEl) typesEl.style.display = 'none';
  if (formPanel) formPanel.style.display = 'block';
  var panel = document.getElementById('ca-inline-add');
  if (panel) { panel.style.display = 'block'; panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
}

// ---- Step 1: Select Employee + Linked NTE ----
function _caCap1Step1(formBody, formFooter, progressHtml) {
  var empHtml = '';
  if (CA_CAP1_WIZARD.employee) {
    var emp = CA_CAP1_WIZARD.employee;
    empHtml = '<div style="padding:10px 14px; background:var(--bg-alt); border:1px solid var(--border); border-radius:var(--radius); display:flex; justify-content:space-between; align-items:center;">' +
      '<div><div style="font-weight:600; font-size:13px;">' + escapeHtml(emp.full_name) + '</div>' +
      '<div style="font-size:11px; color:var(--fg-muted);">' + escapeHtml(emp.ohr_id) + ' · ' + escapeHtml(emp.actual_role || '') + '</div></div>' +
      '<button class="btn btn-outline btn-xs" onclick="CA_CAP1_WIZARD.employee=null; CA_CAP1_WIZARD.linkedNte=null; CA_CAP1_WIZARD.servedNtes=[]; _caCap1WizRender();">Change</button>' +
      '</div>';
  } else {
    empHtml = '<div style="position:relative;">' +
      '<input type="text" id="cap1-wiz-emp-search" placeholder="Search by name or OHR ID..." ' +
      'oninput="_caCap1FilterEmployees()" autocomplete="off" ' +
      'style="width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:var(--radius); font-size:13px; background:var(--bg); color:var(--fg);">' +
      '<div id="cap1-wiz-emp-dropdown" style="display:none; position:absolute; top:100%; left:0; right:0; max-height:200px; overflow-y:auto; background:var(--bg); border:1px solid var(--border); border-radius:var(--radius); z-index:10; box-shadow:0 4px 12px rgba(0,0,0,0.15);"></div>' +
      '</div>';
  }

  // NTE picker
  var nteHtml = '';
  if (CA_CAP1_WIZARD.employee) {
    if (CA_CAP1_WIZARD.servedNtes.length === 0) {
      nteHtml = '<div style="padding:12px; background:#FEF2F2; border:1px solid #FECACA; border-radius:var(--radius); font-size:12px; color:#991B1B;">' +
        '<strong>No served NTEs found</strong> for this employee. An NTE must be served before issuing a CAP 1. Use the NTE Build Assist first.' +
        '</div>';
    } else if (CA_CAP1_WIZARD.linkedNte) {
      var nte = CA_CAP1_WIZARD.linkedNte;
      var nteDate = nte.created_at ? new Date(nte.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
      nteHtml = '<div style="padding:10px 14px; background:var(--bg-alt); border:1px solid var(--border); border-radius:var(--radius);">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">' +
        '<div style="font-weight:600; font-size:13px;">NTE #' + nte.id + ' — ' + nteDate + '</div>' +
        '<button class="btn btn-outline btn-xs" onclick="CA_CAP1_WIZARD.linkedNte=null; _caCap1WizRender();">Change</button>' +
        '</div>' +
        '<div style="font-size:11px; color:var(--fg-muted); line-height:1.5;">' +
        '<div><strong>Violation:</strong> ' + escapeHtml((nte.policy_violated || nte.nte_type || 'N/A').substring(0, 120)) + '</div>' +
        '<div><strong>Incident:</strong> ' + escapeHtml((nte.incident_description || '').replace(/<[^>]*>/g, '').substring(0, 150)) + '</div>' +
        '</div></div>';
    } else {
      nteHtml = '<div style="display:flex; flex-direction:column; gap:8px;">';
      CA_CAP1_WIZARD.servedNtes.forEach(function(nte) {
        var nteDate = nte.created_at ? new Date(nte.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
        var desc = (nte.incident_description || '').replace(/<[^>]*>/g, '').substring(0, 100);
        nteHtml += '<div onclick="CA_CAP1_WIZARD.linkedNte=CA_CAP1_WIZARD.servedNtes.find(function(n){return n.id===' + nte.id + '}); _caCap1WizRender();" ' +
          'style="cursor:pointer; padding:10px 14px; border:1px solid var(--border); border-radius:var(--radius); transition:border-color 0.15s;" ' +
          'onmouseover="this.style.borderColor=\'#3B82F6\'" onmouseout="this.style.borderColor=\'var(--border)\'">' +
          '<div style="font-weight:600; font-size:12px;">NTE #' + nte.id + ' — ' + nteDate + '</div>' +
          '<div style="font-size:11px; color:var(--fg-muted); margin-top:2px;">' + escapeHtml(desc) + '</div>' +
          '</div>';
      });
      nteHtml += '</div>';
    }
  }

  formBody.innerHTML = progressHtml +
    '<div style="padding:10px 14px; background:#3B82F608; border:1px solid #3B82F630; border-radius:var(--radius); margin-bottom:16px; font-size:11px; color:var(--fg-muted);">' +
    '<strong style="color:#3B82F6;">Step 1:</strong> Select the employee and the served NTE this CAP 1 references.' +
    '</div>' +
    '<div class="ca-form-group"><label style="font-weight:600; font-size:12px; margin-bottom:6px; display:block;">Employee *</label>' + empHtml + '</div>' +
    (CA_CAP1_WIZARD.employee ? '<div class="ca-form-group" style="margin-top:16px;"><label style="font-weight:600; font-size:12px; margin-bottom:6px; display:block;">Linked NTE *</label>' + nteHtml + '</div>' : '');

  var canProceed = CA_CAP1_WIZARD.employee && CA_CAP1_WIZARD.linkedNte;
  formFooter.innerHTML = '<button class="btn btn-outline btn-sm" onclick="caCloseWizard()">← Back</button>' +
    '<button class="btn btn-primary btn-sm" ' + (canProceed ? '' : 'disabled') + ' onclick="_caCap1GoStep2()">Next →</button>';
}

function _caCap1FilterEmployees() {
  clearTimeout(_caCap1EmpFilterTimer);
  _caCap1EmpFilterTimer = setTimeout(function() {
    var search = (document.getElementById('cap1-wiz-emp-search')?.value || '').toLowerCase();
    var dropdown = document.getElementById('cap1-wiz-emp-dropdown');
    if (!dropdown || !search) { if (dropdown) dropdown.style.display = 'none'; return; }
    var matches = CA.employees
      .filter(function(e) { return e.actual_role !== 'Manager' && (
        (e.full_name || '').toLowerCase().includes(search) ||
        (e.ohr_id || '').toLowerCase().includes(search)
      ); })
      .slice(0, 30);
    if (matches.length === 0) {
      dropdown.innerHTML = '<div style="padding:8px 12px; color:var(--fg-muted); font-size:12px;">No matches found</div>';
    } else {
      dropdown.innerHTML = matches.map(function(e) {
        return '<div onclick="_caCap1SelectEmployee(\'' + e.ohr_id + '\')" style="padding:8px 12px; cursor:pointer; font-size:12px; border-bottom:1px solid var(--border);" onmouseover="this.style.background=\'var(--bg-alt)\'" onmouseout="this.style.background=\'transparent\'">' +
          '<div style="font-weight:600;">' + escapeHtml(e.full_name) + '</div>' +
          '<div style="font-size:11px; color:var(--fg-muted);">' + escapeHtml(e.ohr_id) + ' · ' + escapeHtml(e.actual_role || '') + '</div></div>';
      }).join('');
    }
    dropdown.style.display = 'block';
  }, 200);
}

async function _caCap1SelectEmployee(ohrId) {
  var emp = CA.employees.find(function(e) { return e.ohr_id === ohrId; });
  if (!emp) return;
  CA_CAP1_WIZARD.employee = emp;
  CA_CAP1_WIZARD.linkedNte = null;

  // Fetch served NTEs for this employee
  try {
    var resp = await fetch(IO_API_BASE + '/corrective-actions?status=Served&ohr_id=' + encodeURIComponent(ohrId));
    if (resp.ok) {
      var data = await resp.json();
      CA_CAP1_WIZARD.servedNtes = Array.isArray(data) ? data : (data.records || []);
    } else {
      CA_CAP1_WIZARD.servedNtes = [];
    }
  } catch (e) {
    CA_CAP1_WIZARD.servedNtes = [];
  }

  _caCap1WizRender();
}

// ---- Step 2: Explanation + AI Deliberation ----
function _caCap1GoStep2() {
  CA_CAP1_WIZARD.step = 2;
  _caCap1WizRender();
}

function _caCap1Step2(formBody, formFooter, progressHtml) {
  var nte = CA_CAP1_WIZARD.linkedNte || {};
  var nteNarrative = (nte.incident_description || '').replace(/<[^>]*>/g, '').substring(0, 300);

  formBody.innerHTML = progressHtml +
    '<div style="padding:10px 14px; background:#3B82F608; border:1px solid #3B82F630; border-radius:var(--radius); margin-bottom:16px; font-size:11px; color:var(--fg-muted);">' +
    '<strong style="color:#3B82F6;">Step 2:</strong> Provide the explanation details and generate the AI-assisted deliberation paragraph.' +
    '</div>' +
    '<div style="padding:10px 14px; background:var(--bg-alt); border:1px solid var(--border); border-radius:var(--radius); margin-bottom:16px;">' +
    '<div style="font-size:11px; color:var(--fg-muted); margin-bottom:4px;"><strong>NTE Context:</strong></div>' +
    '<div style="font-size:12px; color:var(--fg); line-height:1.5;">' + escapeHtml(nteNarrative || 'No narrative available') + '</div>' +
    '</div>' +
    '<div class="ca-form-group">' +
    '<label style="font-weight:600; font-size:12px; margin-bottom:6px; display:block;">Explanation Letter Date</label>' +
    '<input type="date" id="cap1-explanation-date" value="' + (CA_CAP1_WIZARD.explanationDate || '') + '" ' +
    'style="width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:var(--radius); font-size:13px; background:var(--bg); color:var(--fg);">' +
    '</div>' +
    '<div class="ca-form-group" style="margin-top:12px;">' +
    '<label style="font-weight:600; font-size:12px; margin-bottom:6px; display:block;">Explanation Summary *</label>' +
    '<textarea id="cap1-explanation-summary" rows="4" placeholder="Summarize what the employee stated in their explanation letter..." ' +
    'style="width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:var(--radius); font-size:13px; background:var(--bg); color:var(--fg); resize:vertical;">' +
    escapeHtml(CA_CAP1_WIZARD.explanationSummary || '') + '</textarea>' +
    '</div>' +
    '<div style="margin-top:16px;">' +
    '<button class="btn btn-primary btn-sm" id="cap1-generate-btn" onclick="_caCap1GenerateDeliberation()" style="width:100%;">' +
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>' +
    'Generate AI Deliberation' +
    '</button>' +
    '</div>' +
    (CA_CAP1_WIZARD.deliberation ? '<div style="margin-top:16px;">' +
      '<label style="font-weight:600; font-size:12px; margin-bottom:6px; display:block;">Generated Deliberation</label>' +
      '<div id="cap1-deliberation-preview" contenteditable="true" style="padding:10px 14px; background:var(--bg-alt); border:1px solid #3B82F650; border-radius:var(--radius); font-size:12px; line-height:1.6; min-height:60px; color:var(--fg);">' +
      CA_CAP1_WIZARD.deliberation + '</div>' +
      '<div style="font-size:10px; color:var(--fg-muted); margin-top:4px;">You can edit the text above before proceeding.</div>' +
      (CA_CAP1_WIZARD.violationSection ? '<div style="margin-top:8px; font-size:11px; color:var(--fg-muted);"><strong>Policy Section:</strong> ' + escapeHtml(CA_CAP1_WIZARD.violationSection) + '</div>' : '') +
      (CA_CAP1_WIZARD.violationSubsection ? '<div style="font-size:11px; color:var(--fg-muted);"><strong>Sub-section:</strong> ' + escapeHtml(CA_CAP1_WIZARD.violationSubsection) + '</div>' : '') +
      '</div>' : '');

  var canProceed = CA_CAP1_WIZARD.deliberation && CA_CAP1_WIZARD.explanationSummary;
  formFooter.innerHTML = '<button class="btn btn-outline btn-sm" onclick="CA_CAP1_WIZARD.step=1; _caCap1WizRender();">← Back</button>' +
    '<button class="btn btn-primary btn-sm" ' + (canProceed ? '' : 'disabled') + ' onclick="_caCap1GoStep3()">Next →</button>';
}

async function _caCap1GenerateDeliberation() {
  var summary = document.getElementById('cap1-explanation-summary')?.value?.trim();
  var expDate = document.getElementById('cap1-explanation-date')?.value || '';
  if (!summary) { showToast('Please provide an explanation summary first.', 'warning'); return; }

  CA_CAP1_WIZARD.explanationSummary = summary;
  CA_CAP1_WIZARD.explanationDate = expDate;

  var btn = document.getElementById('cap1-generate-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-sm"></span> Generating...'; }

  try {
    var nte = CA_CAP1_WIZARD.linkedNte || {};
    var violations = [];
    try { violations = JSON.parse(nte.violations || '[]'); } catch(e) {}

    // Fetch previous CAs for context
    var previousCaps = [];
    try {
      var histResp = await fetch(IO_API_BASE + '/corrective-actions/employee/' + encodeURIComponent(CA_CAP1_WIZARD.employee.ohr_id) + '/history');
      if (histResp.ok) previousCaps = await histResp.json();
    } catch(e) {}

    var resp = await fetch(IO_API_BASE + '/cap-build-assist/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee: CA_CAP1_WIZARD.employee,
        violation: violations[0] || null,
        violations: violations,
        cap_level: 'CAP 1',
        explanation_date: expDate,
        explanation_summary: summary,
        nte_narrative: nte.incident_description || '',
        previous_caps: previousCaps
      })
    });

    if (!resp.ok) throw new Error('AI generation failed');
    var data = await resp.json();

    CA_CAP1_WIZARD.deliberation = data.deliberation || '';
    CA_CAP1_WIZARD.violationSection = data.violation_section || '';
    CA_CAP1_WIZARD.violationSubsection = data.violation_subsection || '';

    _caCap1WizRender();
    showToast('Deliberation generated successfully!', 'success');
  } catch (e) {
    console.error('CAP 1 AI generation error:', e);
    showToast('Failed to generate deliberation: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = 'Generate AI Deliberation'; }
  }
}

// ---- Step 3: Confirm & Generate DOCX ----
function _caCap1GoStep3() {
  // Capture any edits from the deliberation preview
  var preview = document.getElementById('cap1-deliberation-preview');
  if (preview) CA_CAP1_WIZARD.deliberation = preview.innerHTML;

  var summary = document.getElementById('cap1-explanation-summary')?.value?.trim();
  if (summary) CA_CAP1_WIZARD.explanationSummary = summary;

  CA_CAP1_WIZARD.step = 3;
  _caCap1WizRender();
}

function _caCap1Step3(formBody, formFooter, progressHtml) {
  var emp = CA_CAP1_WIZARD.employee || {};
  var nte = CA_CAP1_WIZARD.linkedNte || {};
  var nteDate = nte.created_at ? new Date(nte.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
  var coach = typeof currentUser !== 'undefined' ? currentUser : null;

  var activeDays = 60; // CAP 1 = 60 days per HR Policy v3.0
  var startDate = new Date();
  var endDate = new Date(startDate.getTime() + activeDays * 24 * 60 * 60 * 1000);
  var fmtDate = function(d) { return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); };

  formBody.innerHTML = progressHtml +
    '<div style="padding:10px 14px; background:#10B98108; border:1px solid #10B98130; border-radius:var(--radius); margin-bottom:16px; font-size:11px; color:var(--fg-muted);">' +
    '<strong style="color:#10B981;">Step 3:</strong> Review the details below and generate the CAP 1 document.' +
    '</div>' +
    '<div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px;">' +
    '<div style="padding:10px 14px; background:var(--bg-alt); border:1px solid var(--border); border-radius:var(--radius);">' +
    '<div style="font-size:10px; color:var(--fg-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Employee</div>' +
    '<div style="font-size:13px; font-weight:600;">' + escapeHtml(emp.full_name || '') + '</div>' +
    '<div style="font-size:11px; color:var(--fg-muted);">' + escapeHtml(emp.ohr_id || '') + ' · ' + escapeHtml(emp.actual_role || 'Process Associate') + '</div>' +
    '</div>' +
    '<div style="padding:10px 14px; background:var(--bg-alt); border:1px solid var(--border); border-radius:var(--radius);">' +
    '<div style="font-size:10px; color:var(--fg-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">CAP Details</div>' +
    '<div style="font-size:13px; font-weight:600; color:#3B82F6;">CAP 1 — First Formal Corrective Action</div>' +
    '<div style="font-size:11px; color:var(--fg-muted);">Active: ' + activeDays + ' days (until ' + fmtDate(endDate) + ')</div>' +
    '</div>' +
    '</div>' +
    '<div style="padding:10px 14px; background:var(--bg-alt); border:1px solid var(--border); border-radius:var(--radius); margin-bottom:12px;">' +
    '<div style="font-size:10px; color:var(--fg-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Linked NTE</div>' +
    '<div style="font-size:12px;">NTE #' + (nte.id || 'N/A') + ' — Served ' + nteDate + '</div>' +
    '</div>' +
    '<div style="padding:10px 14px; background:var(--bg-alt); border:1px solid var(--border); border-radius:var(--radius); margin-bottom:12px;">' +
    '<div style="font-size:10px; color:var(--fg-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Policy Violated</div>' +
    '<div style="font-size:12px;">' + escapeHtml(CA_CAP1_WIZARD.violationSection || 'N/A') + '</div>' +
    (CA_CAP1_WIZARD.violationSubsection ? '<div style="font-size:11px; color:var(--fg-muted); margin-top:2px;">' + escapeHtml(CA_CAP1_WIZARD.violationSubsection) + '</div>' : '') +
    '</div>' +
    '<div style="padding:10px 14px; background:var(--bg-alt); border:1px solid var(--border); border-radius:var(--radius); margin-bottom:12px;">' +
    '<div style="font-size:10px; color:var(--fg-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Deliberation</div>' +
    '<div style="font-size:12px; line-height:1.6;">' + (CA_CAP1_WIZARD.deliberation || 'N/A') + '</div>' +
    '</div>' +
    '<div style="padding:10px 14px; background:var(--bg-alt); border:1px solid var(--border); border-radius:var(--radius);">' +
    '<div style="font-size:10px; color:var(--fg-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Issued By</div>' +
    '<div style="font-size:12px;">' + escapeHtml(coach ? coach.full_name : 'Unknown') + ' (' + escapeHtml(emp.supervisor_name || '') + ')</div>' +
    '</div>';

  formFooter.innerHTML = '<button class="btn btn-outline btn-sm" onclick="CA_CAP1_WIZARD.step=2; _caCap1WizRender();">← Back</button>' +
    '<button class="btn btn-primary btn-sm" id="cap1-submit-btn" onclick="_caCap1Submit();">' +
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
    'Generate CAP 1 Document</button>';
}

async function _caCap1Submit() {
  var coach = typeof currentUser !== 'undefined' ? currentUser : null;
  var submitBtn = document.getElementById('cap1-submit-btn');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<span class="spinner-sm"></span> Updating Record...'; }

  try {
    var nte = CA_CAP1_WIZARD.linkedNte || {};
    var emp = CA_CAP1_WIZARD.employee || {};

    // 1. Update the NTE record with CAP 1 assignment
    if (submitBtn) { submitBtn.innerHTML = '<span class="spinner-sm"></span> Assigning CAP...'; }
    var activeDays = 60;
    var startDate = new Date();
    var endDate = new Date(startDate.getTime() + activeDays * 24 * 60 * 60 * 1000);

    var patchPayload = {
      action: 'assign_cap',
      cap_level: 'CAP 1',
      cap_start_date: startDate.toISOString().slice(0, 10),
      cap_expiry_date: endDate.toISOString().slice(0, 10),
      decision_remarks: 'CAP 1 issued via Document Build Assist. Deliberation: ' + (CA_CAP1_WIZARD.deliberation || '').replace(/<[^>]*>/g, '').substring(0, 200),
      decided_by: coach ? coach.full_name : '',
      decided_by_ohr: coach ? coach.ohr_id : '',
    };

    var patchResp = await fetch(IO_API_BASE + '/corrective-actions/' + nte.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patchPayload)
    });
    if (!patchResp.ok) {
      var errData = await patchResp.json().catch(function() { return {}; });
      console.warn('CAP assignment warning:', errData.error || patchResp.statusText);
    }

    // 2. Generate the CAP 1 DOCX document
    if (submitBtn) { submitBtn.innerHTML = '<span class="spinner-sm"></span> Generating DOCX...'; }

    var violations = [];
    try { violations = JSON.parse(nte.violations || '[]'); } catch(e) {}

    var docxPayload = {
      cap_level: 'CAP 1',
      employee: {
        full_name: emp.full_name || '',
        ohr_id: emp.ohr_id || '',
        actual_role: emp.actual_role || 'Process Associate',
        department: emp.department || 'Operations',
        supervisor_name: emp.supervisor_name || '',
        gender: emp.gender || 'Male',
      },
      explanation_date: CA_CAP1_WIZARD.explanationDate || '',
      explanation_summary: CA_CAP1_WIZARD.explanationSummary || '',
      violation_section: CA_CAP1_WIZARD.violationSection || '',
      violation_subsection: CA_CAP1_WIZARD.violationSubsection || '',
      violations: violations,
      flm_name: emp.supervisor_name || (coach ? coach.full_name : ''),
      issuance_date: startDate.toISOString().slice(0, 10),
      nte_response_text: CA_CAP1_WIZARD.deliberation ? CA_CAP1_WIZARD.deliberation.replace(/<[^>]*>/g, '') : '',
    };

    var docxResp = await fetch(IO_API_BASE + '/cap-build-assist/docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(docxPayload)
    });
    if (!docxResp.ok) {
      var errData2 = await docxResp.json().catch(function() { return {}; });
      throw new Error('DOCX generation failed: ' + (errData2.error || docxResp.statusText));
    }

    // Download the DOCX file
    var blob = await docxResp.blob();
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var safeName = emp.full_name.replace(/[^a-zA-Z0-9 ,]/g, '').replace(/\s+/g, '_');
    a.href = url;
    a.download = 'CAP1_' + safeName + '_' + new Date().toISOString().slice(0, 10) + '.docx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('CAP 1 document generated and downloaded! Record updated.', 'success');
    caCloseWizard();
    // Refresh the corrective actions list
    await Promise.all([caFetchRecords(), caFetchStats()]);
    caRenderSummaryCards();
    caApplyFilters();
  } catch (e) {
    console.error('CAP 1 submission error:', e);
    showToast('Failed to generate CAP 1: ' + e.message, 'error');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = 'Generate CAP 1 Document'; }
  }
}




// ============================================================
// CAP 2 & CAP 3 BUILD ASSIST WIZARDS
// ============================================================
// Reuse the same 3-step pattern as CAP 1:
//   Step 1: Select Employee + Linked NTE/CAP record
//   Step 2: Explanation Letter + AI Deliberation
//   Step 3: Confirm & Generate DOCX
// Backend endpoints already support CAP 2/3:
//   POST /cap-build-assist/generate  (AI deliberation)
//   POST /cap-build-assist/docx      (DOCX from CDN template)

// ===== CAP 2 Wizard State =====
var CA_CAP2_WIZARD = {
  step: 1,
  employee: null,
  linkedNte: null,
  servedNtes: [],
  explanationDate: '',
  explanationSummary: '',
  deliberation: '',
  violationSection: '',
  violationSubsection: '',
  isGenerating: false
};

function caStartCap2Wizard() {
  CA_DOC_TYPE = 'cap2';
  CA_CAP2_WIZARD = { step: 1, employee: null, linkedNte: null, servedNtes: [], explanationDate: '', explanationSummary: '', deliberation: '', violationSection: '', violationSubsection: '', isGenerating: false };
  _caCap2WizRender();
}

// ===== CAP 3 Wizard State =====
var CA_CAP3_WIZARD = {
  step: 1,
  employee: null,
  linkedNte: null,
  servedNtes: [],
  explanationDate: '',
  explanationSummary: '',
  deliberation: '',
  violationSection: '',
  violationSubsection: '',
  isGenerating: false
};

function caStartCap3Wizard() {
  CA_DOC_TYPE = 'cap3';
  CA_CAP3_WIZARD = { step: 1, employee: null, linkedNte: null, servedNtes: [], explanationDate: '', explanationSummary: '', deliberation: '', violationSection: '', violationSubsection: '', isGenerating: false };
  _caCap3WizRender();
}

// ===== Generic CAP N Wizard (shared logic for CAP 2 and CAP 3) =====
// Config maps for CAP 2 vs CAP 3 differences
var _capNConfig = {
  cap2: {
    level: 'CAP 2', num: '2', ordinal: 'Second', activeDays: 90, accent: '#F59E0B',
    title: 'CAP 2 Build Assist', desc: 'Second Formal Corrective Action',
    getWiz: function() { return CA_CAP2_WIZARD; },
    setWiz: function(k, v) { CA_CAP2_WIZARD[k] = v; },
    render: function() { _caCap2WizRender(); }
  },
  cap3: {
    level: 'CAP 3', num: '3', ordinal: 'Third', activeDays: 180, accent: '#DC2626',
    title: 'CAP 3 Build Assist', desc: 'Third Formal Corrective Action',
    getWiz: function() { return CA_CAP3_WIZARD; },
    setWiz: function(k, v) { CA_CAP3_WIZARD[k] = v; },
    render: function() { _caCap3WizRender(); }
  }
};

function _capNWizRender(capKey) {
  var cfg = _capNConfig[capKey];
  var wiz = cfg.getWiz();
  var formTitle = document.getElementById('ca-inline-form-title');
  var formBody = document.getElementById('ca-inline-form-body');
  var formFooter = document.getElementById('ca-inline-form-footer');
  var formPanel = document.getElementById('ca-inline-add-form');
  var typesEl = document.getElementById('ca-inline-add-types');

  var stepLabels = ['Employee & NTE', 'Explanation & Deliberation', 'Confirm & Generate'];

  if (formTitle) formTitle.innerHTML = '<span style="display:flex;align-items:center;gap:8px;">' +
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' + cfg.accent + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' +
    cfg.title +
    '<span style="font-size:11px; color:var(--fg-muted); font-weight:400;">Step ' + wiz.step + ' of 3 — ' + stepLabels[wiz.step - 1] + '</span>' +
    '</span>';

  var progressHtml = '<div style="display:flex;gap:4px;margin-bottom:16px;">' +
    [1,2,3].map(function(s) {
      return '<div style="flex:1;height:3px;border-radius:2px;background:' + (s <= wiz.step ? cfg.accent : 'var(--border)') + ';transition:background 0.2s;"></div>';
    }).join('') + '</div>';

  if (formBody && formFooter) {
    if (wiz.step === 1) _capNStep1(capKey, formBody, formFooter, progressHtml);
    else if (wiz.step === 2) _capNStep2(capKey, formBody, formFooter, progressHtml);
    else if (wiz.step === 3) _capNStep3(capKey, formBody, formFooter, progressHtml);
  }

  if (typesEl) typesEl.style.display = 'none';
  if (formPanel) formPanel.style.display = 'block';
  var panel = document.getElementById('ca-inline-add');
  if (panel) { panel.style.display = 'block'; panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
}

function _caCap2WizRender() { _capNWizRender('cap2'); }
function _caCap3WizRender() { _capNWizRender('cap3'); }

// ---- Step 1: Select Employee + Linked NTE/CAP Record ----
function _capNStep1(capKey, formBody, formFooter, progressHtml) {
  var cfg = _capNConfig[capKey];
  var wiz = cfg.getWiz();
  var empHtml = '';

  if (wiz.employee) {
    empHtml = '<div style="padding:10px 14px; background:var(--bg-alt); border:1px solid var(--border); border-radius:var(--radius);">' +
      '<div style="display:flex; justify-content:space-between; align-items:center;">' +
      '<div><div style="font-weight:600; font-size:13px;">' + escapeHtml(wiz.employee.full_name) + '</div>' +
      '<div style="font-size:11px; color:var(--fg-muted);">' + escapeHtml(wiz.employee.ohr_id) + ' · ' + escapeHtml(wiz.employee.actual_role || '') + '</div></div>' +
      '<button class="btn btn-outline btn-xs" onclick="_capNConfig[\'' + capKey + '\'].getWiz().employee=null; _capNConfig[\'' + capKey + '\'].getWiz().linkedNte=null; _capNConfig[\'' + capKey + '\'].getWiz().servedNtes=[]; _capNConfig[\'' + capKey + '\'].render();">Change</button>' +
      '</div></div>';
  } else {
    empHtml = '<div class="searchable-select" id="' + capKey + '-wiz-emp-wrapper">' +
      '<input type="text" class="form-input" id="' + capKey + '-wiz-emp-search" placeholder="Search by name or OHR..." autocomplete="off" oninput="_capNFilterEmployees(\'' + capKey + '\')" onclick="_capNToggleEmpDropdown(\'' + capKey + '\', true)" onfocus="_capNToggleEmpDropdown(\'' + capKey + '\', true)">' +
      '<div class="searchable-select-dropdown" id="' + capKey + '-wiz-emp-dropdown" style="display:none; max-height:200px; overflow-y:auto;"></div>' +
      '</div>';
  }

  // Build NTE/CAP record list
  var nteHtml = '';
  if (wiz.employee) {
    if (wiz.servedNtes.length === 0 && !wiz.linkedNte) {
      nteHtml = '<div style="padding:12px 16px; background:#EF444408; border:1px solid #EF444430; border-radius:var(--radius); font-size:12px; color:#EF4444;">' +
        'No served NTEs or prior CAP records found for <strong>' + escapeHtml(wiz.employee.full_name) + '</strong>. An NTE must be served before issuing a ' + cfg.level + '.' +
        '</div>';
    } else if (wiz.linkedNte) {
      var nte = wiz.linkedNte;
      var nteDate = nte.created_at ? new Date(nte.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
      nteHtml = '<div style="padding:10px 14px; background:var(--bg-alt); border:1px solid var(--border); border-radius:var(--radius);">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">' +
        '<div style="font-weight:600; font-size:13px;">NTE #' + nte.id + ' — ' + nteDate + (nte.cap_level ? ' (' + nte.cap_level + ')' : '') + '</div>' +
        '<button class="btn btn-outline btn-xs" onclick="_capNConfig[\'' + capKey + '\'].getWiz().linkedNte=null; _capNConfig[\'' + capKey + '\'].render();">Change</button>' +
        '</div>' +
        '<div style="font-size:11px; color:var(--fg-muted); line-height:1.5;">' +
        '<div><strong>Violation:</strong> ' + escapeHtml((nte.policy_violated || nte.nte_type || 'N/A').substring(0, 120)) + '</div>' +
        '<div><strong>Incident:</strong> ' + escapeHtml((nte.incident_description || '').replace(/<[^>]*>/g, '').substring(0, 150)) + '</div>' +
        '</div></div>';
    } else {
      nteHtml = '<div style="display:flex; flex-direction:column; gap:8px;">';
      wiz.servedNtes.forEach(function(nte) {
        var nteDate = nte.created_at ? new Date(nte.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
        var desc = (nte.incident_description || '').replace(/<[^>]*>/g, '').substring(0, 100);
        var capBadge = nte.cap_level ? ' <span style="padding:1px 6px;background:' + cfg.accent + '15;color:' + cfg.accent + ';border-radius:8px;font-size:10px;font-weight:600;">' + nte.cap_level + '</span>' : '';
        nteHtml += '<div onclick="_capNSelectNte(\'' + capKey + '\',' + nte.id + ')" ' +
          'style="cursor:pointer; padding:10px 14px; border:1px solid var(--border); border-radius:var(--radius); transition:border-color 0.15s;" ' +
          'onmouseover="this.style.borderColor=\'' + cfg.accent + '\'" onmouseout="this.style.borderColor=\'var(--border)\'">' +
          '<div style="font-weight:600; font-size:12px;">NTE #' + nte.id + ' — ' + nteDate + capBadge + '</div>' +
          '<div style="font-size:11px; color:var(--fg-muted); margin-top:2px;">' + escapeHtml(desc) + '</div>' +
          '</div>';
      });
      nteHtml += '</div>';
    }
  }

  formBody.innerHTML = progressHtml +
    '<div style="padding:10px 14px; background:' + cfg.accent + '08; border:1px solid ' + cfg.accent + '30; border-radius:var(--radius); margin-bottom:16px; font-size:11px; color:var(--fg-muted);">' +
    '<strong style="color:' + cfg.accent + ';">Step 1:</strong> Select the employee and the served NTE/CAP record this ' + cfg.level + ' references.' +
    '</div>' +
    '<div class="ca-form-group"><label style="font-weight:600; font-size:12px; margin-bottom:6px; display:block;">Employee *</label>' + empHtml + '</div>' +
    (wiz.employee ? '<div class="ca-form-group" style="margin-top:16px;"><label style="font-weight:600; font-size:12px; margin-bottom:6px; display:block;">Linked NTE/CAP Record *</label>' + nteHtml + '</div>' : '');

  var canProceed = wiz.employee && wiz.linkedNte;
  formFooter.innerHTML = '<button class="btn btn-outline btn-sm" onclick="caCloseWizard()">← Back</button>' +
    '<button class="btn btn-primary btn-sm" ' + (canProceed ? '' : 'disabled') + ' onclick="_capNGoStep2(\'' + capKey + '\')">Next →</button>';
}

function _capNSelectNte(capKey, nteId) {
  var wiz = _capNConfig[capKey].getWiz();
  var nte = wiz.servedNtes.find(function(n) { return n.id === nteId; });
  if (nte) {
    wiz.linkedNte = nte;
    _capNConfig[capKey].render();
  }
}

// ---- Employee Picker (shared for CAP 2/3) ----
var _capNEmpFilterTimer = null;
function _capNFilterEmployees(capKey) {
  clearTimeout(_capNEmpFilterTimer);
  _capNEmpFilterTimer = setTimeout(function() {
    var search = (document.getElementById(capKey + '-wiz-emp-search')?.value || '').toLowerCase();
    var dropdown = document.getElementById(capKey + '-wiz-emp-dropdown');
    if (!dropdown || !search) { if (dropdown) dropdown.style.display = 'none'; return; }
    var matches = CA.employees
      .filter(function(e) { return e.actual_role !== 'Manager' && (
        (e.full_name || '').toLowerCase().includes(search) ||
        (e.ohr_id || '').toLowerCase().includes(search)
      ); })
      .slice(0, 30);
    if (matches.length === 0) {
      dropdown.innerHTML = '<div style="padding:8px 12px; color:var(--fg-muted); font-size:12px;">No matches found</div>';
    } else {
      dropdown.innerHTML = matches.map(function(e) {
        return '<div onclick="_capNSelectEmployee(\'' + capKey + '\',\'' + e.ohr_id + '\')" style="padding:8px 12px; cursor:pointer; font-size:12px; border-bottom:1px solid var(--border);" onmouseover="this.style.background=\'var(--bg-alt)\'" onmouseout="this.style.background=\'transparent\'">' +
          '<div style="font-weight:600;">' + escapeHtml(e.full_name) + '</div>' +
          '<div style="font-size:11px; color:var(--fg-muted);">' + escapeHtml(e.ohr_id) + ' · ' + escapeHtml(e.actual_role || '') + '</div></div>';
      }).join('');
    }
    dropdown.style.display = 'block';
  }, 200);
}

function _capNToggleEmpDropdown(capKey, show) {
  var dropdown = document.getElementById(capKey + '-wiz-emp-dropdown');
  if (dropdown) dropdown.style.display = show ? '' : 'none';
  if (show) _capNFilterEmployees(capKey);
}

async function _capNSelectEmployee(capKey, ohrId) {
  var wiz = _capNConfig[capKey].getWiz();
  var emp = CA.employees.find(function(e) { return e.ohr_id === ohrId; });
  if (!emp) return;
  wiz.employee = emp;
  wiz.linkedNte = null;

  // Fetch served NTEs / CAP records for this employee
  try {
    var resp = await fetch(IO_API_BASE + '/corrective-actions?status=Served&ohr_id=' + encodeURIComponent(ohrId));
    if (resp.ok) {
      var data = await resp.json();
      wiz.servedNtes = Array.isArray(data) ? data : (data.records || []);
    } else {
      wiz.servedNtes = [];
    }
    // Also fetch CAP Issued records (prior CAP levels that could be escalated)
    var capResp = await fetch(IO_API_BASE + '/corrective-actions?status=CAP%20Issued&ohr_id=' + encodeURIComponent(ohrId));
    if (capResp.ok) {
      var capData = await capResp.json();
      var capRecords = Array.isArray(capData) ? capData : (capData.records || []);
      // Merge, avoiding duplicates
      var existingIds = new Set(wiz.servedNtes.map(function(n) { return n.id; }));
      capRecords.forEach(function(r) { if (!existingIds.has(r.id)) wiz.servedNtes.push(r); });
    }
  } catch (e) {
    wiz.servedNtes = [];
  }

  _capNConfig[capKey].render();
}

// ---- Step 2: Explanation + AI Deliberation ----
function _capNGoStep2(capKey) {
  var wiz = _capNConfig[capKey].getWiz();
  wiz.step = 2;
  _capNConfig[capKey].render();
}

function _capNStep2(capKey, formBody, formFooter, progressHtml) {
  var cfg = _capNConfig[capKey];
  var wiz = cfg.getWiz();
  var nte = wiz.linkedNte || {};
  var nteNarrative = (nte.incident_description || '').replace(/<[^>]*>/g, '').substring(0, 300);

  formBody.innerHTML = progressHtml +
    '<div style="padding:10px 14px; background:' + cfg.accent + '08; border:1px solid ' + cfg.accent + '30; border-radius:var(--radius); margin-bottom:16px; font-size:11px; color:var(--fg-muted);">' +
    '<strong style="color:' + cfg.accent + ';">Step 2:</strong> Provide the explanation details and generate the AI-assisted deliberation paragraph for ' + cfg.level + '.' +
    '</div>' +
    '<div style="padding:10px 14px; background:var(--bg-alt); border:1px solid var(--border); border-radius:var(--radius); margin-bottom:16px;">' +
    '<div style="font-size:11px; color:var(--fg-muted); margin-bottom:4px;"><strong>NTE/Prior CAP Context:</strong></div>' +
    '<div style="font-size:12px; color:var(--fg); line-height:1.5;">' + escapeHtml(nteNarrative || 'No narrative available') + '</div>' +
    '</div>' +
    '<div class="ca-form-group">' +
    '<label style="font-weight:600; font-size:12px; margin-bottom:6px; display:block;">Explanation Letter Date</label>' +
    '<input type="date" id="' + capKey + '-explanation-date" value="' + (wiz.explanationDate || '') + '" ' +
    'style="width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:var(--radius); font-size:13px; background:var(--bg); color:var(--fg);">' +
    '</div>' +
    '<div class="ca-form-group" style="margin-top:12px;">' +
    '<label style="font-weight:600; font-size:12px; margin-bottom:6px; display:block;">Explanation Summary *</label>' +
    '<textarea id="' + capKey + '-explanation-summary" rows="4" placeholder="Summarize what the employee stated in their explanation letter..." ' +
    'style="width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:var(--radius); font-size:13px; background:var(--bg); color:var(--fg); resize:vertical;">' +
    escapeHtml(wiz.explanationSummary || '') + '</textarea>' +
    '</div>' +
    '<div style="margin-top:16px;">' +
    '<button class="btn btn-primary btn-sm" id="' + capKey + '-generate-btn" onclick="_capNGenerateDeliberation(\'' + capKey + '\')" style="width:100%;">' +
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>' +
    'Generate AI Deliberation' +
    '</button>' +
    '</div>' +
    (wiz.deliberation ? '<div style="margin-top:16px;">' +
      '<label style="font-weight:600; font-size:12px; margin-bottom:6px; display:block;">Generated Deliberation</label>' +
      '<div id="' + capKey + '-deliberation-preview" contenteditable="true" style="padding:10px 14px; background:var(--bg-alt); border:1px solid ' + cfg.accent + '50; border-radius:var(--radius); font-size:12px; line-height:1.6; min-height:60px; color:var(--fg);">' +
      wiz.deliberation + '</div>' +
      '<div style="font-size:10px; color:var(--fg-muted); margin-top:4px;">You can edit the text above before proceeding.</div>' +
      (wiz.violationSection ? '<div style="margin-top:8px; font-size:11px; color:var(--fg-muted);"><strong>Policy Section:</strong> ' + escapeHtml(wiz.violationSection) + '</div>' : '') +
      (wiz.violationSubsection ? '<div style="font-size:11px; color:var(--fg-muted);"><strong>Sub-section:</strong> ' + escapeHtml(wiz.violationSubsection) + '</div>' : '') +
      '</div>' : '');

  var canProceed = wiz.deliberation && wiz.explanationSummary;
  formFooter.innerHTML = '<button class="btn btn-outline btn-sm" onclick="_capNConfig[\'' + capKey + '\'].getWiz().step=1; _capNConfig[\'' + capKey + '\'].render();">← Back</button>' +
    '<button class="btn btn-primary btn-sm" ' + (canProceed ? '' : 'disabled') + ' onclick="_capNGoStep3(\'' + capKey + '\')">Next →</button>';
}

async function _capNGenerateDeliberation(capKey) {
  var cfg = _capNConfig[capKey];
  var wiz = cfg.getWiz();
  var summary = document.getElementById(capKey + '-explanation-summary')?.value?.trim();
  var expDate = document.getElementById(capKey + '-explanation-date')?.value || '';
  if (!summary) { showToast('Please provide an explanation summary first.', 'warning'); return; }

  wiz.explanationSummary = summary;
  wiz.explanationDate = expDate;

  var btn = document.getElementById(capKey + '-generate-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-sm"></span> Generating...'; }

  try {
    var nte = wiz.linkedNte || {};
    var violations = [];
    try { violations = JSON.parse(nte.violations || '[]'); } catch(e) {}

    // Fetch previous CAs for context
    var previousCaps = [];
    try {
      var histResp = await fetch(IO_API_BASE + '/corrective-actions/employee/' + encodeURIComponent(wiz.employee.ohr_id) + '/history');
      if (histResp.ok) previousCaps = await histResp.json();
    } catch(e) {}

    var resp = await fetch(IO_API_BASE + '/cap-build-assist/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee: wiz.employee,
        violation: violations[0] || null,
        violations: violations,
        cap_level: cfg.level,
        explanation_date: expDate,
        explanation_summary: summary,
        nte_narrative: nte.incident_description || '',
        previous_caps: previousCaps
      })
    });

    if (!resp.ok) throw new Error('AI generation failed');
    var data = await resp.json();

    wiz.deliberation = data.deliberation || '';
    wiz.violationSection = data.violation_section || '';
    wiz.violationSubsection = data.violation_subsection || '';

    cfg.render();
    showToast('Deliberation generated successfully!', 'success');
  } catch (e) {
    console.error(cfg.level + ' AI generation error:', e);
    showToast('Failed to generate deliberation: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = 'Generate AI Deliberation'; }
  }
}

// ---- Step 3: Confirm & Generate DOCX ----
function _capNGoStep3(capKey) {
  var cfg = _capNConfig[capKey];
  var wiz = cfg.getWiz();
  // Capture any edits from the deliberation preview
  var preview = document.getElementById(capKey + '-deliberation-preview');
  if (preview) wiz.deliberation = preview.innerHTML;

  var summary = document.getElementById(capKey + '-explanation-summary')?.value?.trim();
  if (summary) wiz.explanationSummary = summary;

  wiz.step = 3;
  cfg.render();
}

function _capNStep3(capKey, formBody, formFooter, progressHtml) {
  var cfg = _capNConfig[capKey];
  var wiz = cfg.getWiz();
  var emp = wiz.employee || {};
  var nte = wiz.linkedNte || {};
  var nteDate = nte.created_at ? new Date(nte.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
  var coach = typeof currentUser !== 'undefined' ? currentUser : null;

  var activeDays = cfg.activeDays;
  var startDate = new Date();
  var endDate = new Date(startDate.getTime() + activeDays * 24 * 60 * 60 * 1000);
  var fmtDate = function(d) { return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); };

  formBody.innerHTML = progressHtml +
    '<div style="padding:10px 14px; background:#10B98108; border:1px solid #10B98130; border-radius:var(--radius); margin-bottom:16px; font-size:11px; color:var(--fg-muted);">' +
    '<strong style="color:#10B981;">Step 3:</strong> Review the details below and generate the ' + cfg.level + ' document.' +
    '</div>' +
    '<div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px;">' +
    '<div style="padding:10px 14px; background:var(--bg-alt); border:1px solid var(--border); border-radius:var(--radius);">' +
    '<div style="font-size:10px; color:var(--fg-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Employee</div>' +
    '<div style="font-size:13px; font-weight:600;">' + escapeHtml(emp.full_name || '') + '</div>' +
    '<div style="font-size:11px; color:var(--fg-muted);">' + escapeHtml(emp.ohr_id || '') + ' · ' + escapeHtml(emp.actual_role || 'Process Associate') + '</div>' +
    '</div>' +
    '<div style="padding:10px 14px; background:var(--bg-alt); border:1px solid var(--border); border-radius:var(--radius);">' +
    '<div style="font-size:10px; color:var(--fg-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">CAP Details</div>' +
    '<div style="font-size:13px; font-weight:600; color:' + cfg.accent + ';">' + cfg.level + ' — ' + cfg.desc + '</div>' +
    '<div style="font-size:11px; color:var(--fg-muted);">Active: ' + activeDays + ' days (until ' + fmtDate(endDate) + ')</div>' +
    '</div>' +
    '</div>' +
    '<div style="padding:10px 14px; background:var(--bg-alt); border:1px solid var(--border); border-radius:var(--radius); margin-bottom:12px;">' +
    '<div style="font-size:10px; color:var(--fg-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Linked NTE/CAP Record</div>' +
    '<div style="font-size:12px;">NTE #' + (nte.id || 'N/A') + ' — Served ' + nteDate + (nte.cap_level ? ' (' + nte.cap_level + ')' : '') + '</div>' +
    '</div>' +
    '<div style="padding:10px 14px; background:var(--bg-alt); border:1px solid var(--border); border-radius:var(--radius); margin-bottom:12px;">' +
    '<div style="font-size:10px; color:var(--fg-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Policy Violated</div>' +
    '<div style="font-size:12px;">' + escapeHtml(wiz.violationSection || 'N/A') + '</div>' +
    (wiz.violationSubsection ? '<div style="font-size:11px; color:var(--fg-muted); margin-top:2px;">' + escapeHtml(wiz.violationSubsection) + '</div>' : '') +
    '</div>' +
    '<div style="padding:10px 14px; background:var(--bg-alt); border:1px solid var(--border); border-radius:var(--radius); margin-bottom:12px;">' +
    '<div style="font-size:10px; color:var(--fg-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Deliberation</div>' +
    '<div style="font-size:12px; line-height:1.6;">' + (wiz.deliberation || 'N/A') + '</div>' +
    '</div>' +
    '<div style="padding:10px 14px; background:var(--bg-alt); border:1px solid var(--border); border-radius:var(--radius);">' +
    '<div style="font-size:10px; color:var(--fg-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Issued By</div>' +
    '<div style="font-size:12px;">' + escapeHtml(coach ? coach.full_name : 'Unknown') + ' (' + escapeHtml(emp.supervisor_name || '') + ')</div>' +
    '</div>';

  formFooter.innerHTML = '<button class="btn btn-outline btn-sm" onclick="_capNConfig[\'' + capKey + '\'].getWiz().step=2; _capNConfig[\'' + capKey + '\'].render();">← Back</button>' +
    '<button class="btn btn-primary btn-sm" id="' + capKey + '-submit-btn" onclick="_capNSubmit(\'' + capKey + '\');">' +
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
    'Generate ' + cfg.level + ' Document</button>';
}

async function _capNSubmit(capKey) {
  var cfg = _capNConfig[capKey];
  var wiz = cfg.getWiz();
  var coach = typeof currentUser !== 'undefined' ? currentUser : null;
  var submitBtn = document.getElementById(capKey + '-submit-btn');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<span class="spinner-sm"></span> Updating Record...'; }

  try {
    var nte = wiz.linkedNte || {};
    var emp = wiz.employee || {};

    // 1. Update the NTE record with CAP assignment
    if (submitBtn) { submitBtn.innerHTML = '<span class="spinner-sm"></span> Assigning ' + cfg.level + '...'; }
    var activeDays = cfg.activeDays;
    var startDate = new Date();
    var endDate = new Date(startDate.getTime() + activeDays * 24 * 60 * 60 * 1000);

    var patchPayload = {
      action: 'assign_cap',
      cap_level: cfg.level,
      cap_start_date: startDate.toISOString().slice(0, 10),
      cap_expiry_date: endDate.toISOString().slice(0, 10),
      decision_remarks: cfg.level + ' issued via Document Build Assist. Deliberation: ' + (wiz.deliberation || '').replace(/<[^>]*>/g, '').substring(0, 200),
      decided_by: coach ? coach.full_name : '',
      decided_by_ohr: coach ? coach.ohr_id : '',
    };

    var patchResp = await fetch(IO_API_BASE + '/corrective-actions/' + nte.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patchPayload)
    });
    if (!patchResp.ok) {
      var errData = await patchResp.json().catch(function() { return {}; });
      console.warn(cfg.level + ' assignment warning:', errData.error || patchResp.statusText);
    }

    // 2. Generate the CAP DOCX document
    if (submitBtn) { submitBtn.innerHTML = '<span class="spinner-sm"></span> Generating DOCX...'; }

    var violations = [];
    try { violations = JSON.parse(nte.violations || '[]'); } catch(e) {}

    var docxPayload = {
      cap_level: cfg.level,
      employee: {
        full_name: emp.full_name || '',
        ohr_id: emp.ohr_id || '',
        actual_role: emp.actual_role || 'Process Associate',
        department: emp.department || 'Operations',
        supervisor_name: emp.supervisor_name || '',
        gender: emp.gender || 'Male',
      },
      explanation_date: wiz.explanationDate || '',
      explanation_summary: wiz.explanationSummary || '',
      violation_section: wiz.violationSection || '',
      violation_subsection: wiz.violationSubsection || '',
      violations: violations,
      flm_name: emp.supervisor_name || (coach ? coach.full_name : ''),
      issuance_date: startDate.toISOString().slice(0, 10),
      nte_response_text: wiz.deliberation ? wiz.deliberation.replace(/<[^>]*>/g, '') : '',
    };

    var docxResp = await fetch(IO_API_BASE + '/cap-build-assist/docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(docxPayload)
    });
    if (!docxResp.ok) {
      var errData2 = await docxResp.json().catch(function() { return {}; });
      throw new Error('DOCX generation failed: ' + (errData2.error || docxResp.statusText));
    }

    // Download the DOCX file
    var blob = await docxResp.blob();
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var safeName = emp.full_name.replace(/[^a-zA-Z0-9 ,]/g, '').replace(/\s+/g, '_');
    a.href = url;
    a.download = cfg.level.replace(' ', '') + '_' + safeName + '_' + new Date().toISOString().slice(0, 10) + '.docx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(cfg.level + ' document generated and downloaded! Record updated.', 'success');
    caCloseWizard();
    // Refresh the corrective actions list
    await Promise.all([caFetchRecords(), caFetchStats()]);
    caRenderSummaryCards();
    caApplyFilters();
  } catch (e) {
    console.error(cfg.level + ' submission error:', e);
    showToast('Failed to generate ' + cfg.level + ': ' + e.message, 'error');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = 'Generate ' + cfg.level + ' Document'; }
  }
}


// ============================================================
// KNOWLEDGE BASE SIDEBAR
// ============================================================

const CA_KB = {
  open: false,
  activeCategory: 'All',
  searchQuery: '',
  currentArticleId: null,
};

/** Toggle KB sidebar open/close */
function caKbToggle() {
  const sidebar = document.getElementById('ca-kb-sidebar');
  if (!sidebar) return;
  CA_KB.open = !CA_KB.open;
  sidebar.classList.toggle('open', CA_KB.open);

  // Toggle active state on button
  const btn = document.getElementById('ca-kb-toggle-btn');
  if (btn) btn.classList.toggle('active', CA_KB.open);

  // Initialize content on first open
  if (CA_KB.open && !sidebar.dataset.initialized) {
    sidebar.dataset.initialized = '1';
    caKbRenderTabs();
    caKbRenderList(CA_KB_ARTICLES);
  }
}

/** Render category tabs */
function caKbRenderTabs() {
  const container = document.getElementById('ca-kb-tabs');
  if (!container || typeof CA_KB_CATEGORIES === 'undefined') return;

  container.innerHTML = CA_KB_CATEGORIES.map(cat => {
    const active = cat === CA_KB.activeCategory ? ' active' : '';
    const count = cat === 'All'
      ? CA_KB_ARTICLES.length
      : CA_KB_ARTICLES.filter(a => a.category === cat).length;
    return '<button class="ca-kb-tab' + active + '" onclick="caKbSwitchCategory(\'' + cat + '\')">' +
      cat + ' <span class="ca-kb-tab-count">' + count + '</span></button>';
  }).join('');
}

/** Switch category tab */
function caKbSwitchCategory(cat) {
  CA_KB.activeCategory = cat;
  CA_KB.currentArticleId = null;
  // Show list, hide article
  const listEl = document.getElementById('ca-kb-list');
  const articleEl = document.getElementById('ca-kb-article');
  if (listEl) listEl.style.display = '';
  if (articleEl) articleEl.style.display = 'none';
  caKbRenderTabs();
  caKbApplyFilters();
}

/** Search handler */
function caKbSearch(query) {
  CA_KB.searchQuery = (query || '').toLowerCase().trim();
  CA_KB.currentArticleId = null;
  const listEl = document.getElementById('ca-kb-list');
  const articleEl = document.getElementById('ca-kb-article');
  if (listEl) listEl.style.display = '';
  if (articleEl) articleEl.style.display = 'none';
  caKbApplyFilters();
}

/** Apply category + search filters and render */
function caKbApplyFilters() {
  if (typeof CA_KB_ARTICLES === 'undefined') return;
  let results = [...CA_KB_ARTICLES];

  // Category filter
  if (CA_KB.activeCategory !== 'All') {
    results = results.filter(a => a.category === CA_KB.activeCategory);
  }

  // Search filter
  if (CA_KB.searchQuery) {
    const q = CA_KB.searchQuery;
    results = results.filter(a => {
      // Search in title, tags, keywords, and raw content text
      if (a.title.toLowerCase().includes(q)) return true;
      if (a.tags.some(t => t.toLowerCase().includes(q))) return true;
      if (a.keywords.some(k => k.toLowerCase().includes(q))) return true;
      // Strip HTML tags for content search
      const plainContent = a.content.replace(/<[^>]*>/g, ' ').toLowerCase();
      return plainContent.includes(q);
    });
  }

  caKbRenderList(results);
}

/** Render article list */
function caKbRenderList(articles) {
  const container = document.getElementById('ca-kb-list');
  if (!container) return;

  if (!articles || articles.length === 0) {
    container.innerHTML = '<div class="ca-kb-empty">' +
      '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
      '<p>No articles found</p>' +
      '<span>Try a different search term or category</span>' +
      '</div>';
    return;
  }

  // Group by category
  const grouped = {};
  articles.forEach(a => {
    if (!grouped[a.category]) grouped[a.category] = [];
    grouped[a.category].push(a);
  });

  let html = '';
  for (const [category, items] of Object.entries(grouped)) {
    if (CA_KB.activeCategory === 'All') {
      html += '<div class="ca-kb-group-label">' + escapeHtml(category) + '</div>';
    }
    items.forEach(a => {
      const tagHtml = a.tags.slice(0, 3).map(t =>
        '<span class="ca-kb-tag">' + escapeHtml(t) + '</span>'
      ).join('');
      html += '<div class="ca-kb-item" onclick="caKbOpenArticle(\'' + a.id + '\')">' +
        '<div class="ca-kb-item-title">' + escapeHtml(a.title) + '</div>' +
        '<div class="ca-kb-item-tags">' + tagHtml + '</div>' +
        '</div>';
    });
  }

  container.innerHTML = html;
}

/** Open a single article */
function caKbOpenArticle(id) {
  if (typeof CA_KB_ARTICLES === 'undefined') return;
  const article = CA_KB_ARTICLES.find(a => a.id === id);
  if (!article) return;

  CA_KB.currentArticleId = id;

  const listEl = document.getElementById('ca-kb-list');
  const articleEl = document.getElementById('ca-kb-article');
  if (listEl) listEl.style.display = 'none';
  if (articleEl) {
    articleEl.style.display = '';
    articleEl.innerHTML =
      '<button class="ca-kb-back" onclick="caKbBackToList()">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>' +
        ' Back to list' +
      '</button>' +
      '<div class="ca-kb-article-content">' + article.content + '</div>';
  }
}

/** Back to article list from article view */
function caKbBackToList() {
  CA_KB.currentArticleId = null;
  const listEl = document.getElementById('ca-kb-list');
  const articleEl = document.getElementById('ca-kb-article');
  if (listEl) listEl.style.display = '';
  if (articleEl) articleEl.style.display = 'none';
}
