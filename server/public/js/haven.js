/**
 * Haven — Leave Management (3 Sub-pages)
 * Sub-page 1: Input Portal — file leave requests & browse (My Requests only)
 * Sub-page 2: Review Area — TL approval queue
 * Sub-page 3: Final Review Area — OM approval queue & WFM export
 */

const HAVEN = {
  leaves: [],
  filtered: [],
  employees: [],
  currentSubpage: 'input',
  page: 1,
  pageSize: 25,
  editingId: null,

  STATUS_COLORS: {
    'Pending TL': '#F59E0B',
    'Pending OM': '#3B82F6',
    'Approved': '#22C55E',
    'Rejected': '#EF4444'
  }
};

// ===== Data Fetching =====

async function havenFetchLeaves() {
  const loading = document.getElementById('haven-loading');
  if (loading) loading.style.display = 'flex';

  try {
    const url = `${IO_API_BASE}/leaves?limit=2000`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Failed to fetch leaves');
    HAVEN.leaves = await resp.json();
  } catch (e) {
    console.error('Haven fetch error:', e);
    HAVEN.leaves = [];
  }

  if (loading) loading.style.display = 'none';

  if (HAVEN.currentSubpage === 'input') havenApplyFilters();
  else if (HAVEN.currentSubpage === 'review') havenRenderReviewArea();
  else if (HAVEN.currentSubpage === 'final') havenRenderFinalReviewArea();
}

async function havenFetchEmployees() {
  if (HAVEN.employees.length > 0) return;
  try {
    const url = `${IO_API_BASE}/employees?employement_status=Active&order=full_name&limit=2000`;
    const resp = await fetch(url);
    if (resp.ok) HAVEN.employees = await resp.json();
  } catch (e) {
    console.error('Failed to fetch employees for Haven:', e);
  }
}

// ===== Input Portal: Filters (Status + Date Range only, My Requests) =====

function havenApplyFilters() {
  let data = [...HAVEN.leaves];

  // My Requests only
  if (typeof currentUser !== 'undefined' && currentUser) {
    data = data.filter(l => l.ohr === currentUser.ohr_id);
  }

  const statusFilter = document.getElementById('haven-filter-status')?.value || 'All';
  const startDate = document.getElementById('haven-filter-start')?.value || '';
  const endDate = document.getElementById('haven-filter-end')?.value || '';

  if (statusFilter !== 'All') data = data.filter(l => l.status === statusFilter);
  if (startDate) data = data.filter(l => l.requested_date && l.requested_date >= startDate);
  if (endDate) data = data.filter(l => l.requested_date && l.requested_date <= endDate);

  HAVEN.filtered = data;
  HAVEN.page = 1;
  havenRenderTable();
}

// ===== Input Portal: Table (ID, Requested Date, Reason, Status) =====

function havenRenderTable() {
  const thead = document.getElementById('haven-table-head');
  const tbody = document.getElementById('haven-table-body');
  if (!thead || !tbody) return;

  thead.innerHTML = `<tr>
    <th>ID</th><th>Requested Date</th><th>Reason</th><th>Status</th>
  </tr>`;

  const start = (HAVEN.page - 1) * HAVEN.pageSize;
  const pageData = HAVEN.filtered.slice(start, start + HAVEN.pageSize);

  if (pageData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4"><div class="mascot-empty-state"><div class="sprite-mascot" role="img" aria-label="No data"></div><div class="empty-title">No leave requests found</div><div class="empty-subtitle">Try adjusting the filters or date range</div></div></td></tr>';
    havenRenderPagination();
    return;
  }

  tbody.innerHTML = pageData.map(lv => {
    const statusColor = HAVEN.STATUS_COLORS[lv.status] || 'var(--text-secondary)';
    const reqDate = lv.requested_date ? new Date(lv.requested_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

    return `<tr class="module-row" onclick="havenOpenDetail('${escapeAttr(lv.leave_id)}')">
      <td><span class="module-id">${escapeHtml(lv.leave_id || '')}</span></td>
      <td>${reqDate}</td>
      <td class="module-title-cell">${escapeHtml(lv.reason || '—')}</td>
      <td><span class="module-status-badge" style="background:${statusColor}20;color:${statusColor};border:1px solid ${statusColor}40;">${escapeHtml(lv.status || '')}</span></td>
    </tr>`;
  }).join('');

  havenRenderPagination();
}

function havenRenderPagination() {
  const el = document.getElementById('haven-pagination');
  if (!el) return;
  const total = HAVEN.filtered.length;
  const totalPages = Math.ceil(total / HAVEN.pageSize) || 1;
  const start = (HAVEN.page - 1) * HAVEN.pageSize + 1;
  const end = Math.min(HAVEN.page * HAVEN.pageSize, total);

  el.innerHTML = `
    <span class="module-page-info">${total > 0 ? `${start}-${end} of ${total}` : '0 records'}</span>
    <button class="btn btn-ghost btn-xs" ${HAVEN.page <= 1 ? 'disabled' : ''} onclick="HAVEN.page--;havenRenderTable();">&laquo; Prev</button>
    <span class="module-page-num">Page ${HAVEN.page} of ${totalPages}</span>
    <button class="btn btn-ghost btn-xs" ${HAVEN.page >= totalPages ? 'disabled' : ''} onclick="HAVEN.page++;havenRenderTable();">Next &raquo;</button>
  `;
}

// ===== Review Area (TL Approval Queue) =====

function havenRenderReviewArea() {
  const container = document.getElementById('haven-review-content');
  if (!container) return;

  const user = typeof currentUser !== 'undefined' ? currentUser : null;
  const role = user ? user.actual_role : '';
  const isAdmin = user && (window.ADMIN_OHRS || []).includes(user.ohr_id);

  let pendingTL = HAVEN.leaves.filter(l => l.status === 'Pending TL');
  if (role === 'Team Lead' && !isAdmin) {
    const myAgents = HAVEN.employees.filter(e => e.supervisor_name === user.full_name).map(e => e.ohr_id);
    pendingTL = pendingTL.filter(l => myAgents.includes(l.ohr));
  }

  let html = `
    <div class="review-area-header">
      <h3 class="review-area-title">Team Lead Review Queue</h3>
      <span class="review-area-count">${pendingTL.length} pending</span>
    </div>`;

  if (pendingTL.length === 0) {
    html += '<div class="mascot-empty-state"><div class="sprite-mascot" role="img" aria-label="No data"></div><div class="empty-title">No leave requests pending TL approval</div></div>';
  } else {
    html += '<div class="review-cards-grid">';
    pendingTL.forEach(lv => {
      const reqDate = lv.requested_date ? new Date(lv.requested_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—';
      html += `
        <div class="review-card">
          <div class="review-card-header">
            <span class="review-card-id">${escapeHtml(lv.leave_id || '')}</span>
          </div>
          <div class="review-card-body">
            <div class="review-card-name">${escapeHtml(lv.full_name || '—')}</div>
            <div class="review-card-date" style="font-size:12px;color:var(--text-secondary);margin-top:2px;">${reqDate}</div>
            <div class="review-card-reason" style="margin-top:4px;">${escapeHtml((lv.reason || '').substring(0, 100))}${(lv.reason || '').length > 100 ? '...' : ''}</div>
          </div>
          <div class="review-card-actions">
            <button class="btn btn-success btn-xs" onclick="havenQuickApprove('${escapeAttr(lv.leave_id)}','tl')">Approve</button>
            <button class="btn btn-danger btn-xs" onclick="havenQuickReject('${escapeAttr(lv.leave_id)}','tl')">Reject</button>
          </div>
        </div>`;
    });
    html += '</div>';
  }

  container.innerHTML = html;
}

// ===== Final Review Area (OM Approval Queue & Export) =====

function havenRenderFinalReviewArea() {
  const container = document.getElementById('haven-final-content');
  if (!container) return;

  const pendingOM = HAVEN.leaves.filter(l => l.status === 'Pending OM');
  const approved = HAVEN.leaves.filter(l => l.status === 'Approved');

  let html = `
    <div class="review-area-header">
      <h3 class="review-area-title">Operations Manager Final Review</h3>
      <div style="display:flex;gap:8px;align-items:center;">
        <span class="review-area-count">${pendingOM.length} pending</span>
        <button class="btn btn-outline btn-sm" onclick="havenExportWFM()" title="Export approved leaves for WFM">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export WFM
        </button>
      </div>
    </div>

    <div class="review-section">
      <h4 class="review-section-title">Pending OM Approval (${pendingOM.length})</h4>`;

  if (pendingOM.length === 0) {
    html += '<div class="mascot-empty-state"><div class="sprite-mascot" role="img" aria-label="No data"></div><div class="empty-title">No leave requests pending OM approval</div></div>';
  } else {
    html += '<div class="review-cards-grid">';
    pendingOM.forEach(lv => {
      const reqDate = lv.requested_date ? new Date(lv.requested_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—';
      html += `
        <div class="review-card">
          <div class="review-card-header">
            <span class="review-card-id">${escapeHtml(lv.leave_id || '')}</span>
          </div>
          <div class="review-card-body">
            <div class="review-card-name">${escapeHtml(lv.full_name || '—')}</div>
            <div class="review-card-date" style="font-size:12px;color:var(--text-secondary);margin-top:2px;">${reqDate}</div>
            <div class="review-card-reason" style="margin-top:4px;">${escapeHtml((lv.reason || '').substring(0, 100))}${(lv.reason || '').length > 100 ? '...' : ''}</div>
            <div class="review-card-tl" style="font-size:11px;color:var(--text-secondary);margin-top:4px;">TL: ${escapeHtml(lv.tl_reviewer || '—')}</div>
          </div>
          <div class="review-card-actions">
            <button class="btn btn-success btn-xs" onclick="havenQuickApprove('${escapeAttr(lv.leave_id)}','om')">Approve</button>
            <button class="btn btn-danger btn-xs" onclick="havenQuickReject('${escapeAttr(lv.leave_id)}','om')">Reject</button>
          </div>
        </div>`;
    });
    html += '</div>';
  }

  html += `</div>

    <div class="review-section" style="margin-top:24px;">
      <h4 class="review-section-title">Recently Approved (${approved.length})</h4>`;

  if (approved.length === 0) {
    html += '<div class="review-area-empty">No approved leaves yet.</div>';
  } else {
    html += `<div class="analytics-table-wrapper">
      <table class="data-table">
        <thead><tr><th>ID</th><th>Employee</th><th>Date</th><th>TL</th><th>OM</th><th>Approved On</th></tr></thead>
        <tbody>`;
    approved.slice(0, 50).forEach(lv => {
      const reqDate = lv.requested_date ? new Date(lv.requested_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
      const omDate = lv.om_review_date ? new Date(lv.om_review_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
      html += `<tr class="module-row" onclick="havenOpenDetail('${escapeAttr(lv.leave_id)}')">
        <td>${escapeHtml(lv.leave_id || '')}</td>
        <td>${escapeHtml(lv.full_name || '—')}</td>
        <td>${reqDate}</td>
        <td>${escapeHtml(lv.tl_reviewer || '—')}</td>
        <td>${escapeHtml(lv.om_reviewer || '—')}</td>
        <td>${omDate}</td>
      </tr>`;
    });
    html += '</tbody></table></div>';
  }

  html += '</div>';
  container.innerHTML = html;
}

// ===== Quick Approve/Reject from Review Cards =====

async function havenQuickApprove(leaveId, tier) {
  const lv = HAVEN.leaves.find(l => l.leave_id === leaveId);
  if (!lv) return;

  const user = typeof currentUser !== 'undefined' ? currentUser : null;

  if (tier === 'tl') {
    const valid = await havenCheckAbsences(lv.ohr);
    if (!valid) {
      showToast('Cannot approve: Employee has UPL or NCNS tags in the previous month', 'error');
      return;
    }
  }

  const updates = { updated_at: new Date().toISOString() };
  if (tier === 'tl') {
    updates.status = 'Pending OM';
    updates.tl_reviewer = user ? user.full_name : '';
    updates.tl_review_date = new Date().toISOString();
  } else {
    updates.status = 'Approved';
    updates.om_reviewer = user ? user.full_name : '';
    updates.om_review_date = new Date().toISOString();
  }

  try {
    const url = `${IO_API_BASE}/leaves/${encodeURIComponent(leaveId)}`;
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!resp.ok) throw new Error('Failed to approve');

    showToast(`Leave approved (${tier.toUpperCase()})`, 'success');
    await havenFetchLeaves();
  } catch (e) {
    showToast('Failed: ' + e.message, 'error');
  }
}

async function havenQuickReject(leaveId, tier) {
  const reason = prompt('Enter rejection reason:');
  if (!reason) return;

  const lv = HAVEN.leaves.find(l => l.leave_id === leaveId);
  if (!lv) return;

  const user = typeof currentUser !== 'undefined' ? currentUser : null;
  const updates = {
    status: 'Rejected',
    rejection_reason: reason,
    updated_at: new Date().toISOString()
  };

  if (tier === 'tl') {
    updates.tl_reviewer = user ? user.full_name : '';
    updates.tl_review_date = new Date().toISOString();
  } else {
    updates.om_reviewer = user ? user.full_name : '';
    updates.om_review_date = new Date().toISOString();
  }

  try {
    const url = `${IO_API_BASE}/leaves/${encodeURIComponent(leaveId)}`;
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!resp.ok) throw new Error('Failed to reject');

    showToast('Leave rejected', 'success');
    await havenFetchLeaves();
  } catch (e) {
    showToast('Failed: ' + e.message, 'error');
  }
}

// ===== Detail View =====

function havenOpenDetail(leaveId) {
  const lv = HAVEN.leaves.find(l => l.leave_id === leaveId);
  if (!lv) return;
  HAVEN.editingId = leaveId;

  const formTitle = document.getElementById('haven-form-title');
  const formBody = document.getElementById('haven-form-body');
  const formFooter = document.getElementById('haven-form-footer');
  const overlay = document.getElementById('haven-form-overlay');

  formTitle.textContent = `Leave Request — ${lv.leave_id}`;
  const statusColor = HAVEN.STATUS_COLORS[lv.status] || 'var(--text-secondary)';

  let html = `
    <div class="detail-section">
      <div class="detail-row">
        <span class="detail-label">Status</span>
        <span class="module-status-badge" style="background:${statusColor}20;color:${statusColor};border:1px solid ${statusColor}40;">${escapeHtml(lv.status || '')}</span>
      </div>
    </div>

    <div class="detail-section">
      <h4 class="detail-section-title">Request Details</h4>
      <div class="detail-row"><span class="detail-label">Employee</span><span class="detail-value">${escapeHtml(lv.full_name || '—')} (${escapeHtml(lv.ohr || '')})</span></div>
      <div class="detail-row"><span class="detail-label">Planning Group</span><span class="detail-value">${escapeHtml(lv.planning_group || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">Supervisor</span><span class="detail-value">${escapeHtml(lv.sup_name || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">Requested Date</span><span class="detail-value">${lv.requested_date ? new Date(lv.requested_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '—'}</span></div>
      <div class="detail-row"><span class="detail-label">Reason</span><span class="detail-value detail-multiline">${escapeHtml(lv.reason || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">Filed On</span><span class="detail-value">${lv.created_at ? new Date(lv.created_at).toLocaleString() : '—'}</span></div>
    </div>

    <div class="detail-section">
      <h4 class="detail-section-title">Approval History</h4>
      <div class="detail-row"><span class="detail-label">TL Reviewer</span><span class="detail-value">${escapeHtml(lv.tl_reviewer || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">TL Review Date</span><span class="detail-value">${lv.tl_review_date ? new Date(lv.tl_review_date).toLocaleString() : '—'}</span></div>
      <div class="detail-row"><span class="detail-label">OM Reviewer</span><span class="detail-value">${escapeHtml(lv.om_reviewer || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">OM Review Date</span><span class="detail-value">${lv.om_review_date ? new Date(lv.om_review_date).toLocaleString() : '—'}</span></div>
      ${lv.rejection_reason ? `<div class="detail-row"><span class="detail-label">Rejection Reason</span><span class="detail-value detail-multiline" style="color:#EF4444;">${escapeHtml(lv.rejection_reason)}</span></div>` : ''}
    </div>`;

  formBody.innerHTML = html;

  // Footer: no Close button (X exists at top right)
  let footerHtml = '';

  if (typeof currentUser !== 'undefined' && currentUser) {
    const role = currentUser.actual_role;
    const isAdmin = (window.ADMIN_OHRS || []).includes(currentUser.ohr_id);

    if ((role === 'Team Lead' || isAdmin) && lv.status === 'Pending TL') {
      const myAgents = HAVEN.employees.filter(e => e.supervisor_name === currentUser.full_name).map(e => e.ohr_id);
      if (myAgents.includes(lv.ohr) || role === 'Manager' || isAdmin) {
        footerHtml += '<button class="btn btn-success btn-sm" onclick="havenQuickApprove(\'' + escapeAttr(lv.leave_id) + '\',\'tl\');havenCloseForm();">Approve (TL)</button>';
        footerHtml += ' <button class="btn btn-danger btn-sm" onclick="havenQuickReject(\'' + escapeAttr(lv.leave_id) + '\',\'tl\');havenCloseForm();">Reject (TL)</button>';
      }
    }

    if ((role === 'Manager' || isAdmin) && lv.status === 'Pending OM') { // Only admin/manager can approve OM-level
      footerHtml += '<button class="btn btn-success btn-sm" onclick="havenQuickApprove(\'' + escapeAttr(lv.leave_id) + '\',\'om\');havenCloseForm();">Approve (OM)</button>';
      footerHtml += ' <button class="btn btn-danger btn-sm" onclick="havenQuickReject(\'' + escapeAttr(lv.leave_id) + '\',\'om\');havenCloseForm();">Reject (OM)</button>';
    }
  }

  formFooter.innerHTML = footerHtml;
  formFooter.style.display = footerHtml ? '' : 'none';
  overlay.style.display = 'flex';
}

// ===== UPL/NCNS Validation =====

async function havenCheckAbsences(ohr) {
  try {
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const startStr = prevMonth.toISOString().slice(0, 10);
    const endStr = prevMonthEnd.toISOString().slice(0, 10);

    const url = `${IO_API_BASE}/attendance?ohr_id=${ohr}&date_gte=${startStr}&date_lte=${endStr}&tag=UPL,NCNS&limit=1&select=tag`;
    const resp = await fetch(url);
    if (!resp.ok) return true;
    const data = await resp.json();
    return data.length === 0;
  } catch (e) {
    console.error('Failed to check absences:', e);
    return true;
  }
}

// ===== New Leave Form =====

async function havenShowNewForm() {
  await havenFetchEmployees();
  HAVEN.editingId = null;

  const formTitle = document.getElementById('haven-form-title');
  const formBody = document.getElementById('haven-form-body');
  const formFooter = document.getElementById('haven-form-footer');
  const overlay = document.getElementById('haven-form-overlay');

  // Generate unique leave ID as form title
  const leaveId = 'LV-' + Date.now().toString(36).toUpperCase();
  HAVEN._pendingLeaveId = leaveId;
  formTitle.textContent = leaveId;

  formBody.innerHTML = `
    <div class="form-section">
      <div class="form-field">
        <label class="form-label">Requested Date <span class="required">*</span></label>
        <input type="date" class="form-input" id="haven-new-date">
      </div>
      <div class="form-field">
        <label class="form-label">Reason <span class="required">*</span></label>
        <textarea class="form-textarea" id="haven-new-reason" rows="3" placeholder="Reason for leave request..."></textarea>
      </div>
    </div>
  `;

  formFooter.innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="havenCloseForm()">Cancel</button>
    <button class="btn btn-primary btn-sm" onclick="havenSubmitNew()">Submit Leave Request</button>
  `;
  formFooter.style.display = '';

  overlay.style.display = 'flex';
}

async function havenSubmitNew() {
  const user = typeof currentUser !== 'undefined' ? currentUser : null;
  const empOhr = user ? user.ohr_id : '';
  const rosterEmp = HAVEN.employees.find(e => e.ohr_id === empOhr);
  const emp = rosterEmp || (user ? { full_name: user.full_name, ohr_id: user.ohr_id, planning_group: user.planning_group, supervisor_name: user.supervisor_name, meta_email: user.meta_email } : null);

  const date = document.getElementById('haven-new-date')?.value;
  if (!date) { showToast('Please select a date', 'error'); return; }

  const reason = document.getElementById('haven-new-reason')?.value?.trim();
  if (!reason) { showToast('Please enter a reason', 'error'); return; }

  const leaveId = HAVEN._pendingLeaveId || ('LV-' + Date.now().toString(36).toUpperCase());

  const record = {
    leave_id: leaveId,
    full_name: emp ? emp.full_name : '',
    ohr: empOhr,
    meta_email: emp ? emp.meta_email : '',
    planning_group: emp ? emp.planning_group : '',
    sup_name: emp ? emp.supervisor_name : '',
    requested_date: date,
    reason: reason,
    status: 'Pending TL'
  };

  try {
    const url = `${IO_API_BASE}/leaves`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    });
    if (!resp.ok) throw new Error('Failed to file leave');

    showToast('Leave request filed successfully', 'success');
    havenCloseForm();
    await havenFetchLeaves();
  } catch (e) {
    console.error('Failed to file leave:', e);
    showToast('Failed to file: ' + e.message, 'error');
  }
}

function havenCloseForm() {
  const overlay = document.getElementById('haven-form-overlay');
  if (overlay) overlay.style.display = 'none';
  HAVEN.editingId = null;
}

// ===== WFM Export =====

function havenExportWFM() {
  const approved = HAVEN.leaves.filter(l => l.status === 'Approved');
  if (approved.length === 0) {
    showToast('No approved leaves to export', 'error');
    return;
  }

  const headers = ['Leave ID', 'Full Name', 'OHR', 'Meta Email', 'Planning Group', 'Supervisor', 'Requested Date', 'Reason', 'TL Reviewer', 'TL Review Date', 'OM Reviewer', 'OM Review Date'];
  const rows = approved.map(l => [
    l.leave_id || '',
    l.full_name || '',
    l.ohr || '',
    l.meta_email || '',
    l.planning_group || '',
    l.sup_name || '',
    l.requested_date || '',
    (l.reason || '').replace(/,/g, ';'),
    l.tl_reviewer || '',
    l.tl_review_date ? new Date(l.tl_review_date).toLocaleDateString() : '',
    l.om_reviewer || '',
    l.om_review_date ? new Date(l.om_review_date).toLocaleDateString() : ''
  ]);

  let csv = headers.join(',') + '\n';
  rows.forEach(r => { csv += r.join(',') + '\n'; });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `WFM_Leave_Export_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  showToast(`Exported ${approved.length} approved leave records`, 'success');
}

// ===== Init =====

async function initHaven(view) {
  await havenFetchEmployees();
  await havenFetchLeaves();
  const subMap = { 'haven-input': 'input', 'haven-review': 'review', 'haven-final': 'final' };
  const sub = subMap[view] || 'input';
  HAVEN.currentSubpage = sub;
  if (sub === 'input') havenApplyFilters();
  else if (sub === 'review') havenRenderReviewArea();
  else if (sub === 'final') havenRenderFinalReviewArea();
}
