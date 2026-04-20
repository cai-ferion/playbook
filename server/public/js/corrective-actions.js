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
};

// ===== Initialization =====
async function initCorrectiveActions() {
  const loading = document.getElementById('ca-loading');
  if (loading) loading.style.display = 'flex';

  // Lazy-load violations catalog if not already loaded
  if (typeof HR_VIOLATIONS === 'undefined' && typeof _compassLazyLoadViolations === 'function') {
    _compassLazyLoadViolations();
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

  // Determine if current user can create NTEs (TL or Manager only)
  const canCreate = currentUser && ['Team Lead', 'Manager'].includes(currentUser.actual_role);

  container.innerHTML = `
    <div class="ca-search-wrapper">
      <svg class="ca-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="text" id="ca-search-input" placeholder="Search by name, OHR, or incident..." oninput="caApplyFilters()">
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
    ${canCreate ? `<button class="ca-btn-create" onclick="caOpenCreate()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Issue NTE
    </button>` : ''}
  `;
}

// ===== Filtering =====
function caApplyFilters() {
  const searchEl = document.getElementById('ca-search-input');
  const statusEl = document.getElementById('ca-filter-status');
  const capEl = document.getElementById('ca-filter-cap');
  const search = (searchEl ? searchEl.value : '').toLowerCase().trim();
  const status = statusEl ? statusEl.value : '';
  const cap = capEl ? capEl.value : '';

  let data = [...CA.records];

  // Role-based scoping: Agents see only their own; TLs see their team; Managers see all
  if (currentUser) {
    const role = currentUser.actual_role;
    if (role === 'Agent') {
      data = data.filter(r => r.ohr_id === currentUser.ohr_id);
    } else if (role === 'Team Lead') {
      // TLs see records for their team (supervisor_name matches) + records they created
      data = data.filter(r =>
        r.supervisor_name === currentUser.full_name ||
        r.supervisor_ohr === currentUser.ohr_id ||
        r.created_by_ohr === currentUser.ohr_id ||
        r.ohr_id === currentUser.ohr_id
      );
    }
    // Managers + owner see all
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
    const capBadge = r.cap_level ? caGetCapBadge(r.cap_level) : '<span style="color:var(--compass-text-subtle);">—</span>';
    const deadlineDisplay = r.response_deadline ? caFormatDate(r.response_deadline) : '—';
    const servedDisplay = r.served_date ? caFormatDate(r.served_date) : '—';

    html += `<tr onclick="caOpenDetail('${r.id}')">
      <td>
        <div class="ca-name-cell">${escapeHtml(r.employee_name || '')}</div>
        <div class="ca-ohr-cell">${escapeHtml(r.ohr_id || '')}</div>
      </td>
      <td>${escapeHtml(r.nte_type || '—')}</td>
      <td>${r.date_of_incident ? caFormatDate(r.date_of_incident) : '—'}</td>
      <td>${agingInfo.dot}<span class="ca-status-badge ${statusClass}">${escapeHtml(r.status)}</span></td>
      <td>${capBadge}</td>
      <td>${deadlineDisplay}</td>
      <td>${servedDisplay}</td>
    </tr>`;
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

// ===== Detail Overlay =====
async function caOpenDetail(id) {
  const overlay = document.getElementById('ca-detail-overlay');
  if (!overlay) return;

  const record = CA.records.find(r => r.id === id);
  if (!record) return;
  CA.currentDetail = record;

  // Fetch employee CAP history
  let history = [];
  try {
    const resp = await fetch(`${IO_API_BASE}/corrective-actions/employee/${record.ohr_id}/history`);
    if (resp.ok) history = await resp.json();
  } catch (e) { console.error('CA: history fetch error', e); }

  const body = document.getElementById('ca-detail-body');
  const footer = document.getElementById('ca-detail-footer');
  const title = document.getElementById('ca-detail-title');
  if (title) title.textContent = `NTE — ${record.employee_name || 'Unknown'}`;

  // Parse violations JSON
  let violations = [];
  try { violations = record.violations ? JSON.parse(record.violations) : []; } catch { violations = []; }

  let html = '';

  // Section 1: Employee Info
  html += `<div class="ca-detail-section">
    <div class="ca-detail-section-title">Employee Information</div>
    <div class="ca-detail-grid">
      <div class="ca-detail-field"><span class="ca-detail-label">Name</span><span class="ca-detail-value">${escapeHtml(record.employee_name || '')}</span></div>
      <div class="ca-detail-field"><span class="ca-detail-label">OHR ID</span><span class="ca-detail-value">${escapeHtml(record.ohr_id || '')}</span></div>
      <div class="ca-detail-field"><span class="ca-detail-label">Role</span><span class="ca-detail-value">${escapeHtml(record.actual_role || '—')}</span></div>
      <div class="ca-detail-field"><span class="ca-detail-label">Planning Group</span><span class="ca-detail-value">${escapeHtml(record.planning_group || '—')}</span></div>
      <div class="ca-detail-field"><span class="ca-detail-label">Supervisor</span><span class="ca-detail-value">${escapeHtml(record.supervisor_name || '—')}</span></div>
      <div class="ca-detail-field"><span class="ca-detail-label">Email</span><span class="ca-detail-value">${escapeHtml(record.employee_email || '—')}</span></div>
    </div>
  </div>`;

  // Section 2: NTE Details
  html += `<div class="ca-detail-section">
    <div class="ca-detail-section-title">Notice to Explain</div>
    <div class="ca-detail-grid">
      <div class="ca-detail-field"><span class="ca-detail-label">NTE Type</span><span class="ca-detail-value">${escapeHtml(record.nte_type || '—')}</span></div>
      <div class="ca-detail-field"><span class="ca-detail-label">Date of Incident</span><span class="ca-detail-value">${record.date_of_incident ? caFormatDate(record.date_of_incident) : '—'}</span></div>
      <div class="ca-detail-field"><span class="ca-detail-label">Status</span><span class="ca-detail-value"><span class="ca-status-badge ${CA_STATUS_COLORS[record.status] || ''}">${escapeHtml(record.status)}</span></span></div>
      <div class="ca-detail-field"><span class="ca-detail-label">Response Deadline</span><span class="ca-detail-value">${record.response_deadline ? caFormatDateTime(record.response_deadline) : '—'}</span></div>
      <div class="ca-detail-field full-width"><span class="ca-detail-label">Incident Description</span><span class="ca-detail-value">${escapeHtml(record.incident_description || '—')}</span></div>
      <div class="ca-detail-field full-width"><span class="ca-detail-label">Policy Violated</span><span class="ca-detail-value">${escapeHtml(record.policy_violated || '—')}</span></div>
    </div>`;

  if (violations.length > 0) {
    html += `<div style="margin-top:10px;"><span class="ca-detail-label">Violations</span>
      <div style="margin-top:4px;">`;
    for (const v of violations) {
      html += `<div style="font-size:12px;color:var(--compass-text);margin-bottom:4px;">
        <strong>${escapeHtml(v.code || '')}</strong> — ${escapeHtml(v.text || '')}
        ${v.penalty ? `<span style="color:var(--compass-text-muted);font-size:11px;"> (${escapeHtml(v.penalty)})</span>` : ''}
      </div>`;
    }
    html += '</div></div>';
  }
  html += '</div>';

  // Section 3: CAP Decision (if issued)
  if (record.status === 'CAP Issued' || record.status === 'Expired' || record.status === 'Dismissed') {
    html += `<div class="ca-detail-section">
      <div class="ca-detail-section-title">CAP Decision</div>
      <div class="ca-detail-grid">
        ${record.cap_level ? `<div class="ca-detail-field"><span class="ca-detail-label">CAP Level</span><span class="ca-detail-value">${caGetCapBadge(record.cap_level)}</span></div>` : ''}
        ${record.cap_active_days ? `<div class="ca-detail-field"><span class="ca-detail-label">Active Period</span><span class="ca-detail-value">${record.cap_active_days} days</span></div>` : ''}
        <div class="ca-detail-field"><span class="ca-detail-label">Decision Date</span><span class="ca-detail-value">${record.cap_decision_date ? caFormatDateTime(record.cap_decision_date) : '—'}</span></div>
        <div class="ca-detail-field"><span class="ca-detail-label">Decision By</span><span class="ca-detail-value">${escapeHtml(record.cap_decision_by || '—')}</span></div>
        ${record.cap_start_date ? `<div class="ca-detail-field"><span class="ca-detail-label">CAP Start</span><span class="ca-detail-value">${caFormatDate(record.cap_start_date)}</span></div>` : ''}
        ${record.cap_expiry_date ? `<div class="ca-detail-field"><span class="ca-detail-label">CAP Expiry</span><span class="ca-detail-value">${caFormatDate(record.cap_expiry_date)}</span></div>` : ''}
        ${record.suspension_days ? `<div class="ca-detail-field"><span class="ca-detail-label">Suspension Days</span><span class="ca-detail-value">${record.suspension_days}</span></div>` : ''}
        ${record.cap_remarks ? `<div class="ca-detail-field full-width"><span class="ca-detail-label">Remarks</span><span class="ca-detail-value">${escapeHtml(record.cap_remarks)}</span></div>` : ''}
      </div>`;
    if (record.nod_issued) {
      html += `<div style="margin-top:10px;padding:10px;background:var(--compass-info-bg);border-radius:8px;">
        <span class="ca-detail-label" style="color:var(--compass-info);">Notice of Decision Issued</span>
        ${record.nod_date ? `<div style="font-size:12px;color:var(--compass-text-muted);margin-top:2px;">${caFormatDate(record.nod_date)}</div>` : ''}
        ${record.nod_summary ? `<div style="font-size:13px;color:var(--compass-text);margin-top:4px;">${escapeHtml(record.nod_summary)}</div>` : ''}
      </div>`;
    }
    html += '</div>';
  }

  // Section 4: Metadata
  html += `<div class="ca-detail-section">
    <div class="ca-detail-section-title">Record Info</div>
    <div class="ca-detail-grid">
      <div class="ca-detail-field"><span class="ca-detail-label">Created By</span><span class="ca-detail-value">${escapeHtml(record.created_by || '—')}</span></div>
      <div class="ca-detail-field"><span class="ca-detail-label">Served Date</span><span class="ca-detail-value">${record.served_date ? caFormatDateTime(record.served_date) : '—'}</span></div>
      ${record.linked_coaching_id ? `<div class="ca-detail-field"><span class="ca-detail-label">Linked Coaching Log</span><span class="ca-detail-value"><a href="#" onclick="event.stopPropagation();caOpenLinkedCoaching('${record.linked_coaching_id}')" style="color:var(--compass-accent);text-decoration:underline;">${record.linked_coaching_id.substring(0,8)}...</a></span></div>` : ''}
    </div>
  </div>`;

  // Section 5: Employee CAP History
  const otherHistory = history.filter(h => h.id !== record.id);
  if (otherHistory.length > 0) {
    html += `<div class="ca-detail-section">
      <div class="ca-detail-section-title">Employee CAP History (${otherHistory.length} prior record${otherHistory.length !== 1 ? 's' : ''})</div>
      <div class="ca-history-timeline">`;
    for (const h of otherHistory) {
      const itemClass = h.status === 'CAP Issued' ? 'active' : h.status === 'Dismissed' ? 'dismissed' : h.status === 'Expired' ? 'expired' : '';
      html += `<div class="ca-history-item ${itemClass}">
        <div class="ca-history-date">${h.served_date ? caFormatDate(h.served_date) : '—'}</div>
        <div class="ca-history-title">${escapeHtml(h.nte_type || 'NTE')} ${h.cap_level ? `→ ${escapeHtml(h.cap_level)}` : ''}</div>
        <div class="ca-history-sub">${escapeHtml(h.status)} ${h.cap_expiry_date ? `· Expires ${caFormatDate(h.cap_expiry_date)}` : ''}</div>
      </div>`;
    }
    html += '</div></div>';
  }

  body.innerHTML = html;

  // Footer actions
  const canAct = currentUser && ['Team Lead', 'Manager'].includes(currentUser.actual_role);
  let footerHtml = '';
  if (canAct && record.status === 'Served') {
    footerHtml = `
      <button class="ca-btn ghost" onclick="caCloseDetail()">Close</button>
      <button class="ca-btn success" onclick="caOpenDismissConfirm()">Dismiss</button>
      <button class="ca-btn primary" onclick="caOpenCapModal()">Assign CAP</button>
    `;
  } else {
    footerHtml = `<button class="ca-btn ghost" onclick="caCloseDetail()">Close</button>`;
  }
  footer.innerHTML = footerHtml;

  overlay.classList.add('active');
}

function caCloseDetail() {
  const overlay = document.getElementById('ca-detail-overlay');
  if (overlay) overlay.classList.remove('active');
  CA.currentDetail = null;
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

// ===== Create NTE Modal =====
function caOpenCreate(linkedCoachingId) {
  const overlay = document.getElementById('ca-create-overlay');
  if (!overlay) return;

  const body = document.getElementById('ca-create-body');
  const footer = document.getElementById('ca-create-footer');

  // Build employee dropdown
  const empOptions = CA.employees
    .filter(e => e.employement_status === 'Active')
    .map(e => `<option value="${escapeHtml(e.ohr_id)}" data-name="${escapeHtml(e.full_name)}" data-email="${escapeHtml(e.meta_email || '')}" data-role="${escapeHtml(e.actual_role || '')}" data-pg="${escapeHtml(e.planning_group || '')}" data-sup="${escapeHtml(e.supervisor_name || '')}">${escapeHtml(e.full_name)} (${escapeHtml(e.ohr_id)})</option>`)
    .join('');

  // Build violations category dropdown
  let violationCatOptions = '<option value="">— Select Category —</option>';
  if (typeof HR_VIOLATIONS !== 'undefined') {
    HR_VIOLATIONS.forEach((cat, i) => {
      violationCatOptions += `<option value="${i}">${escapeHtml(cat.category)}</option>`;
    });
  }

  body.innerHTML = `
    <div class="ca-form-group">
      <label>Employee *</label>
      <select id="ca-create-employee" onchange="caOnEmployeeSelect()">
        <option value="">— Select Employee —</option>
        ${empOptions}
      </select>
    </div>
    <div class="ca-form-row">
      <div class="ca-form-group">
        <label>NTE Type *</label>
        <select id="ca-create-nte-type">
          <option value="">— Select —</option>
          ${CA_NTE_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>
      </div>
      <div class="ca-form-group">
        <label>Date of Incident *</label>
        <input type="date" id="ca-create-incident-date" max="${new Date().toISOString().slice(0,10)}">
      </div>
    </div>
    <div class="ca-form-group">
      <label>Incident Description *</label>
      <textarea id="ca-create-description" placeholder="Describe the incident in detail..."></textarea>
    </div>
    <div class="ca-form-group">
      <label>Violation Category</label>
      <select id="ca-create-violation-cat" onchange="caOnViolationCatChange()">
        ${violationCatOptions}
      </select>
    </div>
    <div class="ca-form-group" id="ca-create-violation-type-group" style="display:none;">
      <label>Violation</label>
      <select id="ca-create-violation-type" onchange="caOnViolationTypeChange()">
        <option value="">— Select Violation —</option>
      </select>
    </div>
    <div class="ca-form-group" id="ca-create-violation-item-group" style="display:none;">
      <label>Specific Violation</label>
      <select id="ca-create-violation-item">
        <option value="">— Select —</option>
      </select>
    </div>
    <div id="ca-create-violation-penalty" style="display:none;margin-bottom:14px;padding:8px 12px;background:var(--compass-warning-bg);border-radius:8px;font-size:12px;color:var(--compass-warning);">
    </div>
    <div class="ca-form-group">
      <label>Policy Violated (summary)</label>
      <input type="text" id="ca-create-policy" placeholder="e.g., GP HR Policy 3.0 — Section 7.1">
    </div>
    ${linkedCoachingId ? `<input type="hidden" id="ca-create-linked-coaching" value="${linkedCoachingId}">` : ''}
  `;

  footer.innerHTML = `
    <button class="ca-btn ghost" onclick="caCloseCreate()">Cancel</button>
    <button class="ca-btn primary" id="ca-create-submit-btn" onclick="caSubmitCreate()">Issue NTE</button>
  `;

  overlay.classList.add('active');
}

function caCloseCreate() {
  const overlay = document.getElementById('ca-create-overlay');
  if (overlay) overlay.classList.remove('active');
}

function caOnEmployeeSelect() {
  // Auto-fill is handled by the data attributes on the option
}

function caOnViolationCatChange() {
  const catSelect = document.getElementById('ca-create-violation-cat');
  const typeGroup = document.getElementById('ca-create-violation-type-group');
  const typeSelect = document.getElementById('ca-create-violation-type');
  const itemGroup = document.getElementById('ca-create-violation-item-group');
  const penaltyDiv = document.getElementById('ca-create-violation-penalty');

  if (!catSelect || !typeSelect) return;
  const catIdx = catSelect.value;
  if (catIdx === '' || typeof HR_VIOLATIONS === 'undefined') {
    if (typeGroup) typeGroup.style.display = 'none';
    if (itemGroup) itemGroup.style.display = 'none';
    if (penaltyDiv) penaltyDiv.style.display = 'none';
    return;
  }

  const cat = HR_VIOLATIONS[parseInt(catIdx)];
  if (!cat) return;

  typeSelect.innerHTML = '<option value="">— Select Violation —</option>';
  cat.subsections.forEach((sub, i) => {
    typeSelect.innerHTML += `<option value="${i}">${escapeHtml(sub.code)} — ${escapeHtml(sub.title)}</option>`;
  });
  if (typeGroup) typeGroup.style.display = '';
  if (itemGroup) itemGroup.style.display = 'none';
  if (penaltyDiv) penaltyDiv.style.display = 'none';
}

function caOnViolationTypeChange() {
  const catSelect = document.getElementById('ca-create-violation-cat');
  const typeSelect = document.getElementById('ca-create-violation-type');
  const itemGroup = document.getElementById('ca-create-violation-item-group');
  const itemSelect = document.getElementById('ca-create-violation-item');
  const penaltyDiv = document.getElementById('ca-create-violation-penalty');

  if (!catSelect || !typeSelect || !itemSelect) return;
  const catIdx = catSelect.value;
  const typeIdx = typeSelect.value;
  if (catIdx === '' || typeIdx === '' || typeof HR_VIOLATIONS === 'undefined') {
    if (itemGroup) itemGroup.style.display = 'none';
    if (penaltyDiv) penaltyDiv.style.display = 'none';
    return;
  }

  const sub = HR_VIOLATIONS[parseInt(catIdx)].subsections[parseInt(typeIdx)];
  if (!sub || !sub.items) return;

  itemSelect.innerHTML = '<option value="">— Select —</option>';
  sub.items.forEach((item, i) => {
    itemSelect.innerHTML += `<option value="${i}" data-penalty="${escapeHtml(item.penalty)}">${escapeHtml(item.code)} — ${escapeHtml(item.text)}</option>`;
  });
  if (itemGroup) itemGroup.style.display = '';

  // Show penalty on item select
  itemSelect.onchange = function() {
    const opt = itemSelect.options[itemSelect.selectedIndex];
    const penalty = opt ? opt.dataset.penalty : '';
    if (penalty && penaltyDiv) {
      penaltyDiv.textContent = `Recommended penalty: ${penalty}`;
      penaltyDiv.style.display = '';
    } else if (penaltyDiv) {
      penaltyDiv.style.display = 'none';
    }
  };
}

async function caSubmitCreate() {
  const empSelect = document.getElementById('ca-create-employee');
  const nteType = document.getElementById('ca-create-nte-type');
  const incidentDate = document.getElementById('ca-create-incident-date');
  const description = document.getElementById('ca-create-description');
  const policy = document.getElementById('ca-create-policy');
  const linkedCoaching = document.getElementById('ca-create-linked-coaching');
  const submitBtn = document.getElementById('ca-create-submit-btn');

  if (!empSelect || !empSelect.value) { showToast('Please select an employee', 'error'); return; }
  if (!nteType || !nteType.value) { showToast('Please select NTE type', 'error'); return; }
  if (!incidentDate || !incidentDate.value) { showToast('Please enter incident date', 'error'); return; }
  if (!description || !description.value.trim()) { showToast('Please describe the incident', 'error'); return; }

  const selectedOpt = empSelect.options[empSelect.selectedIndex];

  // Build violations array from selected violation
  const violations = [];
  const itemSelect = document.getElementById('ca-create-violation-item');
  if (itemSelect && itemSelect.value !== '') {
    const catIdx = document.getElementById('ca-create-violation-cat').value;
    const typeIdx = document.getElementById('ca-create-violation-type').value;
    if (catIdx !== '' && typeIdx !== '' && typeof HR_VIOLATIONS !== 'undefined') {
      const item = HR_VIOLATIONS[parseInt(catIdx)].subsections[parseInt(typeIdx)].items[parseInt(itemSelect.value)];
      if (item) violations.push({ code: item.code, text: item.text, penalty: item.penalty });
    }
  }

  const payload = {
    employee_name: selectedOpt.dataset.name,
    ohr_id: empSelect.value,
    employee_email: selectedOpt.dataset.email || null,
    supervisor_name: selectedOpt.dataset.sup || currentUser.full_name,
    supervisor_ohr: currentUser.ohr_id,
    planning_group: selectedOpt.dataset.pg || null,
    actual_role: selectedOpt.dataset.role || null,
    nte_type: nteType.value,
    date_of_incident: incidentDate.value,
    incident_description: description.value.trim(),
    policy_violated: policy ? policy.value.trim() : null,
    violations: violations.length > 0 ? violations : null,
    linked_coaching_id: linkedCoaching ? linkedCoaching.value : null,
    created_by: currentUser.full_name,
    created_by_ohr: currentUser.ohr_id,
  };

  if (submitBtn) submitBtn.disabled = true;
  try {
    const resp = await fetch(`${IO_API_BASE}/corrective-actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create NTE');
    }
    showToast('NTE issued successfully', 'success');
    caCloseCreate();
    await Promise.all([caFetchRecords(), caFetchStats()]);
    caRenderSummaryCards();
    caApplyFilters();
  } catch (err) {
    showToast(err.message || 'Failed to create NTE', 'error');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

// ===== Assign CAP Modal =====
function caOpenCapModal() {
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
