/**
 * Helm — Task Dashboard
 * Group task completion analytics with progress bars, filters, and due date color coding
 * Visible to TL/Manager/Admin only
 */

const HELM_DASH = {
  groupTasks: [],
  filtered: [],
  page: 1,
  pageSize: 15,
};

// ===== Initialization =====

async function initHelmDashboard() {
  const loading = document.getElementById('helm-dash-loading');
  const content = document.getElementById('helm-dash-content');
  if (loading) loading.style.display = 'flex';
  if (content) content.style.display = 'none';

  try {
    const resp = await fetch(`${IO_API_BASE}/group-tasks`);
    if (!resp.ok) throw new Error('Failed');
    HELM_DASH.groupTasks = await resp.json();
  } catch (e) {
    console.error('[HelmDash] fetch error:', e);
    HELM_DASH.groupTasks = [];
  }

  if (loading) loading.style.display = 'none';
  if (content) content.style.display = '';

  helmDashRenderSummary();
  helmDashApplyFilters();
}

// ===== Summary Cards =====

function helmDashRenderSummary() {
  const el = document.getElementById('helm-dash-summary');
  if (!el) return;

  const tasks = HELM_DASH.groupTasks;
  const total = tasks.length;
  const open = tasks.filter(t => t.status === 'Open').length;
  const closed = tasks.filter(t => t.status === 'Closed').length;

  // Average completion rate
  const rates = tasks.filter(t => t.completion_pct != null).map(t => t.completion_pct);
  const avgRate = rates.length > 0 ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : 0;

  // Overdue count
  const now = new Date();
  const overdue = tasks.filter(t => t.status === 'Open' && t.due_date && new Date(t.due_date) < now).length;

  const cards = [
    { label: 'Total Tasks', value: total, color: '#3B82F6', icon: '📋' },
    { label: 'Open', value: open, color: '#F59E0B', icon: '🔓' },
    { label: 'Closed', value: closed, color: '#22C55E', icon: '✅' },
    { label: 'Avg. Completion', value: avgRate + '%', color: '#7C3AED', icon: '📊' },
    { label: 'Overdue', value: overdue, color: '#EF4444', icon: '⚠️' },
  ];

  el.innerHTML = cards.map(c => `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:16px;display:flex;align-items:center;gap:12px;">
      <div style="font-size:24px;">${c.icon}</div>
      <div>
        <div style="font-size:11px;color:var(--fg-muted);text-transform:uppercase;letter-spacing:0.5px;">${c.label}</div>
        <div style="font-size:22px;font-weight:700;color:${c.color};">${c.value}</div>
      </div>
    </div>
  `).join('');
}

// ===== Filters =====

function helmDashApplyFilters() {
  let data = [...HELM_DASH.groupTasks];

  const statusFilter = document.getElementById('helm-dash-filter-status')?.value || 'All';
  if (statusFilter !== 'All') {
    data = data.filter(t => t.status === statusFilter);
  }

  const search = (document.getElementById('helm-dash-search')?.value || '').toLowerCase().trim();
  if (search) {
    data = data.filter(t =>
      (t.title || '').toLowerCase().includes(search) ||
      (t.task_id || '').toLowerCase().includes(search)
    );
  }

  HELM_DASH.filtered = data;
  HELM_DASH.page = 1;
  helmDashRenderTable();
}

// ===== Table Rendering =====

function helmDashRenderTable() {
  const thead = document.getElementById('helm-dash-table-head');
  const tbody = document.getElementById('helm-dash-table-body');
  if (!thead || !tbody) return;

  thead.innerHTML = `<tr>
    <th>Task ID</th>
    <th>Title</th>
    <th>Status</th>
    <th style="width:200px;">Completion Rate</th>
    <th>Completed</th>
    <th>Pending</th>
    <th>N/A</th>
    <th>Due Date</th>
  </tr>`;

  const start = (HELM_DASH.page - 1) * HELM_DASH.pageSize;
  const pageData = HELM_DASH.filtered.slice(start, start + HELM_DASH.pageSize);

  if (pageData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="mascot-empty-state"><div class="sprite-mascot" role="img" aria-label="No data"></div><div class="empty-title">No group tasks found</div><div class="empty-subtitle">Create a group task to see analytics here</div></div></td></tr>';
    helmDashRenderPagination();
    return;
  }

  const now = new Date();

  tbody.innerHTML = pageData.map(t => {
    const pct = t.completion_pct != null ? t.completion_pct : 0;
    const barColor = pct >= 100 ? '#22C55E' : pct >= 75 ? '#3B82F6' : pct >= 50 ? '#F59E0B' : '#EF4444';

    const statusBadge = t.status === 'Open'
      ? '<span style="background:#F59E0B22;color:#F59E0B;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">Open</span>'
      : '<span style="background:#22C55E22;color:#22C55E;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">Closed</span>';

    // Due date color coding
    let dueDateStyle = '';
    let dueDateSuffix = '';
    if (t.due_date) {
      const dueDate = new Date(t.due_date);
      const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
      if (t.status === 'Open') {
        if (daysUntilDue < 0) {
          dueDateStyle = 'color:#EF4444;font-weight:700;';
          dueDateSuffix = ' <span style="font-size:10px;">(Overdue)</span>';
        } else if (daysUntilDue <= 3) {
          dueDateStyle = 'color:#F59E0B;font-weight:600;';
          dueDateSuffix = ' <span style="font-size:10px;">(Due soon)</span>';
        }
      }
    }
    const dueStr = t.due_date ? new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '\u2014';

    const completedCount = t.completed_count || 0;
    const pendingCount = (t.total_assigned || 0) - completedCount - (t.na_count || 0);
    const naCount = t.na_count || 0;

    return `<tr class="data-row" onclick="gtOpenDashDetail(${t.id})" style="cursor:pointer;">
      <td><span style="font-family:monospace;font-size:12px;color:var(--primary);">${escapeHtml(t.task_id)}</span></td>
      <td><span style="font-weight:500;">${escapeHtml(t.title || '\u2014')}</span></td>
      <td>${statusBadge}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="flex:1;height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:${barColor};border-radius:4px;transition:width 0.3s;"></div>
          </div>
          <span style="font-size:12px;font-weight:700;min-width:36px;color:${barColor};">${pct}%</span>
        </div>
      </td>
      <td style="text-align:center;"><span style="color:#22C55E;font-weight:600;">${completedCount}</span></td>
      <td style="text-align:center;"><span style="color:#F59E0B;font-weight:600;">${pendingCount > 0 ? pendingCount : 0}</span></td>
      <td style="text-align:center;"><span style="color:#9CA3AF;font-weight:600;">${naCount}</span></td>
      <td style="${dueDateStyle}">${dueStr}${dueDateSuffix}</td>
    </tr>`;
  }).join('');

  helmDashRenderPagination();
}

// ===== Pagination =====

function helmDashRenderPagination() {
  const el = document.getElementById('helm-dash-pagination');
  if (!el) return;
  const total = HELM_DASH.filtered.length;
  const totalPages = Math.ceil(total / HELM_DASH.pageSize) || 1;
  const start = (HELM_DASH.page - 1) * HELM_DASH.pageSize + 1;
  const end = Math.min(HELM_DASH.page * HELM_DASH.pageSize, total);

  el.innerHTML = `
    <span class="pagination-info">${total > 0 ? start + '\u2013' + end + ' of ' + total : '0 tasks'}</span>
    <div class="pagination-btns">
      <button class="btn btn-outline btn-xs" ${HELM_DASH.page <= 1 ? 'disabled' : ''} onclick="HELM_DASH.page--;helmDashRenderTable();">Prev</button>
      <span class="pagination-page">${HELM_DASH.page} / ${totalPages}</span>
      <button class="btn btn-outline btn-xs" ${HELM_DASH.page >= totalPages ? 'disabled' : ''} onclick="HELM_DASH.page++;helmDashRenderTable();">Next</button>
    </div>
  `;
}

// ===== Dashboard-local Group Task Detail =====
// Opens the detail modal within the Dashboard view (not the Task Board overlay)

async function gtOpenDashDetail(groupTaskId) {
  const overlay = document.getElementById('gt-dash-detail-overlay');
  const body = document.getElementById('gt-dash-detail-body');
  const footer = document.getElementById('gt-dash-detail-footer');
  const title = document.getElementById('gt-dash-detail-title');
  if (!overlay || !body) return;

  overlay.style.display = 'flex';
  body.innerHTML = '<div style="padding:40px;text-align:center;"><div class="sprite-mascot mascot-loader" role="img" aria-label="Loading..."></div><div class="loading-text" style="margin-top:12px;">Loading task details...</div></div>';
  footer.innerHTML = '';

  try {
    const resp = await fetch(`${IO_API_BASE}/group-tasks/${groupTaskId}`);
    if (!resp.ok) throw new Error('Failed to load');
    const task = await resp.json();

    if (title) title.textContent = task.task_id + ' — ' + (task.title || 'Group Task');

    const assignments = task.assignments || [];
    const completed = assignments.filter(a => a.status === 'Completed').length;
    const pending = assignments.filter(a => a.status === 'Pending').length;
    const na = assignments.filter(a => a.status === 'Not Applicable').length;
    const effective = assignments.length - na;
    const pct = effective > 0 ? Math.round((completed / effective) * 100) : 0;

    const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
    const isCreator = cu && cu.ohr_id === task.created_by_ohr;
    const isAdmin = cu && ((window.ADMIN_OHRS || []).includes(cu.ohr_id) || cu.actual_role === 'Manager');

    body.innerHTML = `
      <div style="padding:20px;">
        <div style="display:flex;gap:16px;margin-bottom:20px;">
          <div style="flex:1;background:var(--bg-subtle);border-radius:10px;padding:16px;text-align:center;">
            <div style="font-size:28px;font-weight:700;color:var(--primary);">${pct}%</div>
            <div style="font-size:11px;color:var(--fg-muted);">Completion</div>
          </div>
          <div style="flex:1;background:var(--bg-subtle);border-radius:10px;padding:16px;text-align:center;">
            <div style="font-size:28px;font-weight:700;color:#22C55E;">${completed}</div>
            <div style="font-size:11px;color:var(--fg-muted);">Completed</div>
          </div>
          <div style="flex:1;background:var(--bg-subtle);border-radius:10px;padding:16px;text-align:center;">
            <div style="font-size:28px;font-weight:700;color:#F59E0B;">${pending}</div>
            <div style="font-size:11px;color:var(--fg-muted);">Pending</div>
          </div>
          <div style="flex:1;background:var(--bg-subtle);border-radius:10px;padding:16px;text-align:center;">
            <div style="font-size:28px;font-weight:700;color:var(--fg-muted);">${effective}</div>
            <div style="font-size:11px;color:var(--fg-muted);">Total</div>
          </div>
        </div>

        ${task.description ? `<p style="font-size:13px;color:var(--fg-secondary);margin-bottom:12px;">${escapeHtml(task.description)}</p>` : ''}

        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;font-size:12px;">
          <span style="color:var(--fg-muted);">Created by ${escapeHtml(task.created_by_name || 'Unknown')}</span>
          ${task.due_date ? `<span style="color:var(--fg-muted);">Due: ${new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>` : ''}
          <span style="padding:3px 12px;border-radius:12px;font-weight:600;font-size:11px;background:${task.status === 'Active' ? '#22C55E22' : '#9CA3AF22'};color:${task.status === 'Active' ? '#22C55E' : '#9CA3AF'};">${escapeHtml(task.status)}</span>
        </div>

        <!-- Progress bar -->
        <div style="background:var(--border);border-radius:6px;height:8px;margin-bottom:20px;overflow:hidden;">
          <div style="background:#22C55E;height:100%;width:${pct}%;border-radius:6px;transition:width 0.3s;"></div>
        </div>

        <!-- Assignment list -->
        <div style="margin-bottom:8px;font-size:13px;font-weight:600;">Assignments</div>
        <div style="max-height:280px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;">
          <table class="data-table" style="font-size:12px;width:100%;">
            <thead><tr><th>Name</th><th>OHR</th><th>PG</th><th>Role</th><th>Status</th><th>Completed</th></tr></thead>
            <tbody>
              ${assignments.map(a => {
                const sc = (typeof GT !== 'undefined' ? GT.STATUS_COLORS : {})[ a.status] || 'var(--fg-muted)';
                return `<tr>
                  <td>${escapeHtml(a.employee_name || '\u2014')}</td>
                  <td style="font-family:monospace;font-size:11px;">${escapeHtml(a.employee_ohr)}</td>
                  <td style="font-size:11px;">${escapeHtml(a.planning_group || '\u2014')}</td>
                  <td style="font-size:11px;">${escapeHtml(a.actual_role || '\u2014')}</td>
                  <td><span style="color:${sc};font-weight:600;">${escapeHtml(a.status)}</span></td>
                  <td style="font-size:11px;">${a.completed_at ? new Date(a.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '\u2014'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Footer with close action (and close task for creators/admins)
    let footerHtml = '<button class="btn btn-outline btn-sm" onclick="gtDashDetailClose()">Close</button>';
    if ((isCreator || isAdmin) && task.status === 'Active') {
      footerHtml += ` <button class="btn btn-sm" style="background:#EF4444;color:#fff;border:none;" onclick="gtDashCloseTask(${groupTaskId})">Close Task</button>`;
    }
    footer.innerHTML = footerHtml;

  } catch (e) {
    body.innerHTML = `<div style="padding:40px;text-align:center;color:var(--error);">Failed to load task details: ${escapeHtml(e.message)}</div>`;
    footer.innerHTML = '<button class="btn btn-outline btn-sm" onclick="gtDashDetailClose()">Close</button>';
  }
}

function gtDashDetailClose() {
  const overlay = document.getElementById('gt-dash-detail-overlay');
  if (overlay) overlay.style.display = 'none';
}

async function gtDashCloseTask(groupTaskId) {
  showConfirmModal({
    title: 'Close Group Task',
    message: 'Are you sure you want to close this group task? Pending assignments will remain but no new completions can be recorded.',
    confirmText: 'Close Task',
    confirmClass: 'btn-danger',
    onConfirm: async () => {
      try {
        const resp = await fetch(`${IO_API_BASE}/group-tasks/${groupTaskId}/close`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        if (!resp.ok) throw new Error('Failed');
        showToast('Group task closed', 'success');
        gtDashDetailClose();
        // Refresh dashboard data
        await initHelmDashboard();
      } catch (e) {
        showToast('Error: ' + e.message, 'error');
      }
    }
  });
}
