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
    ${canCreate ? `<button class="ca-btn-create" onclick="caOpenNteWizard()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      NTE Build Assist
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

function caOpenNteWizard() {
  CA_NTE_WIZARD = { step: 1, employee: null, violationType: null, violations: [], violationSubtype: '', dateRange: { start: '', end: '' }, attendance: [], previousCAs: [], capLevel: '', narrative: '', policyText: '', isGenerating: false };
  _caWizRender();
}

function caCloseWizard() {
  const overlay = document.getElementById('ca-form-overlay');
  if (overlay) overlay.style.display = 'none';
}

// ---- Rich text exec helper ----
function caRteExec(command) {
  document.execCommand(command, false, null);
}

function _caWizRender() {
  const overlay = document.getElementById('ca-form-overlay');
  const formTitle = document.getElementById('ca-form-title');
  const formBody = document.getElementById('ca-form-body');
  const formFooter = document.getElementById('ca-form-footer');
  const stepLabels = ['Employee & Violation', 'Date Range & Attendance', 'AI Narrative & Review', 'Confirm & Save'];

  formTitle.innerHTML = `<span style="display:flex;align-items:center;gap:8px;">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366F1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/></svg>
    NTE Build Assist
    <span style="font-size:11px; color:var(--fg-muted); font-weight:400;">Step ${CA_NTE_WIZARD.step} of 4 — ${stepLabels[CA_NTE_WIZARD.step - 1]}</span>
  </span>`;

  const progressHtml = `<div style="display:flex;gap:4px;margin-bottom:16px;">
    ${[1,2,3,4].map(s => `<div style="flex:1;height:3px;border-radius:2px;background:${s <= CA_NTE_WIZARD.step ? '#6366F1' : 'var(--border)'};transition:background 0.2s;"></div>`).join('')}
  </div>`;

  if (CA_NTE_WIZARD.step === 1) _caWizStep1(formBody, formFooter, progressHtml);
  else if (CA_NTE_WIZARD.step === 2) _caWizStep2(formBody, formFooter, progressHtml);
  else if (CA_NTE_WIZARD.step === 3) _caWizStep3(formBody, formFooter, progressHtml);
  else if (CA_NTE_WIZARD.step === 4) _caWizStep4(formBody, formFooter, progressHtml);

  overlay.style.display = 'flex';
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
    <button class="btn btn-outline btn-sm" onclick="caCloseWizard()">← Cancel</button>
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
