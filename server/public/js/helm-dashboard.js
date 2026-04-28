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

    return `<tr class="data-row" onclick="gtOpenDetail(${t.id})" style="cursor:pointer;">
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
