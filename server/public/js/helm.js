/**
 * Helm — Task Assigning, Tracking & Cross-Module Execution
 * Sub-page 1: Task Board — create, browse, and manage tasks
 * Sub-page 2: Analytics — completion rates by TL, department, module
 */

const HELM = {
  tasks: [],
  filtered: [],
  employees: [],
  currentTab: 'all',
  currentSubpage: 'board',
  page: 1,
  pageSize: 25,
  editingId: null,

  STATUSES: ['Open', 'In Progress', 'Completed', 'Cancelled'],
  PRIORITIES: ['Low', 'Medium', 'High', 'Urgent'],
  ENTITIES: [
    { value: '', label: '— None —' },
    { value: 'Compass Coaching', label: 'Compass Coaching' },
    { value: 'Anchor Tardiness', label: 'Anchor Tardiness' },
    { value: 'Sandbox Insight', label: 'Sandbox Insight' },
    { value: 'Haven Leave', label: 'Haven Leave' },
    { value: 'Other', label: 'Other' }
  ],

  STATUS_COLORS: {
    'Open': '#3B82F6',
    'In Progress': '#F59E0B',
    'Completed': '#22C55E',
    'Cancelled': '#9CA3AF'
  },

  PRIORITY_COLORS: {
    'Low': '#9CA3AF',
    'Medium': '#3B82F6',
    'High': '#F59E0B',
    'Urgent': '#EF4444'
  }
};

// ===== Initialization =====

async function initHelm(view) {
  if (HELM.employees.length === 0) await helmFetchEmployees();
  await helmFetchTasks();
  const subMap = { 'helm-board': 'board', 'helm-analytics': 'analytics' };
  const sub = subMap[view] || 'board';
  if (sub === 'board') helmApplyFilters();
  else if (sub === 'analytics') helmRenderAnalytics();
}

// ===== Sub-page Switching =====

function helmSwitchSubpage(subpage) {
  HELM.currentSubpage = subpage;
  document.querySelectorAll('#helm-subpage-tabs .subpage-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.subpage === subpage);
  });
  document.querySelectorAll('.helm-subpage').forEach(el => el.style.display = 'none');
  const target = document.getElementById('helm-sub-' + subpage);
  if (target) target.style.display = '';

  if (subpage === 'board') helmApplyFilters();
  else if (subpage === 'analytics') helmRenderAnalytics();
}

// ===== Data Fetching =====

async function helmFetchTasks() {
  const loading = document.getElementById('helm-loading');
  if (loading) loading.style.display = 'flex';

  try {
    const url = `${IO_API_BASE}/tasks?limit=2000`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Failed to fetch tasks');
    HELM.tasks = await resp.json();
  } catch (e) {
    console.error('Helm fetch error:', e);
    HELM.tasks = [];
  }

  if (loading) loading.style.display = 'none';
  helmApplyFilters();
}

async function helmFetchEmployees() {
  try {
    const url = `${IO_API_BASE}/employees?employement_status=Active&limit=3000`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Failed');
    HELM.employees = await resp.json();
  } catch (e) {
    HELM.employees = [];
  }
}

// ===== Tab Switching =====

function helmSwitchTab(tab) {
  HELM.currentTab = tab;
  HELM.page = 1;
  document.querySelectorAll('#helm-tabs .module-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  helmApplyFilters();
}

// ===== Filters =====

function helmApplyFilters() {
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  let data = [...HELM.tasks];

  // Tab filter
  if (HELM.currentTab === 'mine' && cu) {
    data = data.filter(t => {
      // Check if current user is one of the assigned (comma-separated) or the assigner
      const assignedOhrs = (t.assigned_to_ohr || '').split(',').map(s => s.trim());
      return assignedOhrs.includes(cu.ohr_id) || t.assigned_by_ohr === cu.ohr_id;
    });
  }

  // Status filter
  const statusFilter = document.getElementById('helm-filter-status')?.value || 'All';
  if (statusFilter !== 'All') {
    data = data.filter(t => t.status === statusFilter);
  }

  // Priority filter
  const priorityFilter = document.getElementById('helm-filter-priority')?.value || 'All';
  if (priorityFilter !== 'All') {
    data = data.filter(t => t.priority === priorityFilter);
  }

  // Search
  const search = (document.getElementById('helm-search')?.value || '').toLowerCase().trim();
  if (search) {
    data = data.filter(t =>
      (t.title || '').toLowerCase().includes(search) ||
      (t.task_id || '').toLowerCase().includes(search) ||
      (t.assigned_to_name || '').toLowerCase().includes(search) ||
      (t.assigned_by_name || '').toLowerCase().includes(search)
    );
  }

  HELM.filtered = data;
  helmRenderStats();
  helmRenderTable();
}

// ===== Stats =====

function helmRenderStats() {
  const el = document.getElementById('helm-stats');
  if (!el) return;
  const total = HELM.filtered.length;
  const open = HELM.filtered.filter(t => t.status === 'Open').length;
  const inProgress = HELM.filtered.filter(t => t.status === 'In Progress').length;
  const completed = HELM.filtered.filter(t => t.status === 'Completed').length;
  const overdue = HELM.filtered.filter(t => {
    if (!t.due_date || t.status === 'Completed' || t.status === 'Cancelled') return false;
    return new Date(t.due_date) < new Date();
  }).length;

  el.innerHTML = `
    <div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">Total</div></div>
    <div class="stat-card"><div class="stat-value" style="color:${HELM.STATUS_COLORS['Open']}">${open}</div><div class="stat-label">Open</div></div>
    <div class="stat-card"><div class="stat-value" style="color:${HELM.STATUS_COLORS['In Progress']}">${inProgress}</div><div class="stat-label">In Progress</div></div>
    <div class="stat-card"><div class="stat-value" style="color:${HELM.STATUS_COLORS['Completed']}">${completed}</div><div class="stat-label">Completed</div></div>
    <div class="stat-card"><div class="stat-value" style="color:#EF4444">${overdue}</div><div class="stat-label">Overdue</div></div>
  `;
}

// ===== Table Rendering =====

function helmRenderTable() {
  const thead = document.getElementById('helm-table-head');
  const tbody = document.getElementById('helm-table-body');
  if (!thead || !tbody) return;

  thead.innerHTML = `<tr>
    <th>Task ID</th>
    <th>Title</th>
    <th>Assigned To</th>
    <th>Priority</th>
    <th>Status</th>
    <th>Due Date</th>
    <th>Linked Entity</th>
    <th>Actions</th>
  </tr>`;

  const start = (HELM.page - 1) * HELM.pageSize;
  const pageData = HELM.filtered.slice(start, start + HELM.pageSize);

  if (pageData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--fg-muted);">No tasks found</td></tr>';
    helmRenderPagination();
    return;
  }

  tbody.innerHTML = pageData.map(t => {
    const statusColor = HELM.STATUS_COLORS[t.status] || 'var(--fg-muted)';
    const priorityColor = HELM.PRIORITY_COLORS[t.priority] || 'var(--fg-muted)';
    const isOverdue = t.due_date && t.status !== 'Completed' && t.status !== 'Cancelled' && new Date(t.due_date) < new Date();
    const dueStr = t.due_date ? new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
    const entityLabel = t.target_entity ? `${t.target_entity}${t.target_entity_id ? ' #' + t.target_entity_id : ''}` : '—';

    return `<tr class="data-row" onclick="helmOpenDetail('${escapeAttr(t.task_id)}')">
      <td><span style="font-family:monospace;font-size:12px;color:var(--primary);">${escapeHtml(t.task_id)}</span></td>
      <td><span style="font-weight:500;">${escapeHtml(t.title || '—')}</span></td>
      <td>${escapeHtml(t.assigned_to_name || '—')}</td>
      <td><span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:50%;background:${priorityColor};display:inline-block;"></span>${escapeHtml(t.priority || '—')}</span></td>
      <td><span style="color:${statusColor};font-weight:600;font-size:12px;">${escapeHtml(t.status || '—')}</span></td>
      <td style="${isOverdue ? 'color:var(--error);font-weight:600;' : ''}">${dueStr}${isOverdue ? ' (Overdue)' : ''}</td>
      <td style="font-size:12px;color:var(--fg-muted);">${escapeHtml(entityLabel)}</td>
      <td>
        <button class="btn btn-ghost btn-xs" onclick="event.stopPropagation();helmOpenDetail('${escapeAttr(t.task_id)}')" title="View">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      </td>
    </tr>`;
  }).join('');

  helmRenderPagination();
}

function helmRenderPagination() {
  const el = document.getElementById('helm-pagination');
  if (!el) return;
  const total = HELM.filtered.length;
  const totalPages = Math.ceil(total / HELM.pageSize) || 1;
  const start = (HELM.page - 1) * HELM.pageSize + 1;
  const end = Math.min(HELM.page * HELM.pageSize, total);

  el.innerHTML = `
    <span class="pagination-info">${total > 0 ? start + '–' + end + ' of ' + total : '0 tasks'}</span>
    <div class="pagination-btns">
      <button class="btn btn-outline btn-xs" ${HELM.page <= 1 ? 'disabled' : ''} onclick="HELM.page--;helmRenderTable();">Prev</button>
      <span class="pagination-page">${HELM.page} / ${totalPages}</span>
      <button class="btn btn-outline btn-xs" ${HELM.page >= totalPages ? 'disabled' : ''} onclick="HELM.page++;helmRenderTable();">Next</button>
    </div>
  `;
}

// ===== New Task Form =====

var _helmAttachedFiles = [];

function helmShowNewForm() {
  const formTitle = document.getElementById('helm-form-title');
  const formBody = document.getElementById('helm-form-body');
  const formFooter = document.getElementById('helm-form-footer');
  const overlay = document.getElementById('helm-form-overlay');

  HELM.editingId = null;
  _helmAttachedFiles = [];
  _helmSelectedAssignees = [];

  const taskId = 'TSK-' + Date.now().toString(36).toUpperCase();
  HELM._pendingTaskId = taskId;
  formTitle.textContent = taskId;

  formBody.innerHTML = `
    <div class="form-section">
      <div class="form-field">
        <label class="form-label">Title <span class="required">*</span></label>
        <input type="text" class="form-input" id="helm-new-title" placeholder="Enter a brief, descriptive title for this task" style="width:100%;">
      </div>
      <div class="form-field">
        <label class="form-label">Description</label>
        <textarea class="form-textarea" id="helm-new-desc" rows="5" placeholder="Describe the task in detail..." style="width:100%;resize:vertical;"></textarea>
      </div>
      <div class="form-field">
        <label class="form-label">Assign To <span class="required">*</span></label>
        <div id="helm-assignee-chips" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;"></div>
        <div class="searchable-select" id="helm-assignee-wrapper">
          <input type="text" class="form-input" id="helm-assignee-search" placeholder="Search and select employees..." autocomplete="off" onclick="helmToggleAssigneeDropdown(true)" oninput="helmFilterAssignees()">
          <div class="searchable-select-dropdown" id="helm-assignee-dropdown" style="display:none;max-height:200px;overflow-y:auto;">
            ${HELM.employees.map(e => `<div class="searchable-select-option" data-ohr="${escapeAttr(e.ohr_id)}" data-name="${escapeAttr(e.full_name)}" onclick="helmToggleAssigneeMulti('${escapeAttr(e.ohr_id)}','${escapeAttr(e.full_name)}')">${escapeHtml(e.full_name)}</div>`).join('')}
          </div>
        </div>
      </div>
      <div class="form-field">
        <label class="form-label">Due Date</label>
        <input type="date" class="form-input" id="helm-new-due">
      </div>
      <div class="form-field">
        <label class="form-label">Attachments</label>
        <input type="file" id="helm-file-input" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.gif,.bmp,.webp" style="display:none" onchange="helmUpdateFiles()">
        <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('helm-file-input').click()" style="display:flex;align-items:center;gap:6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
          Attach Files
        </button>
        <div id="helm-file-list" style="margin-top:6px;"></div>
      </div>
    </div>
  `;

  formFooter.innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="helmCloseForm()">Cancel</button>
    <button class="btn btn-primary btn-sm" onclick="helmSubmitNew()">Create Task</button>
  `;

  overlay.style.display = 'flex';
}

function helmOnEntityChange() {
  const entity = document.getElementById('helm-new-entity')?.value || '';
  const idField = document.getElementById('helm-entity-id-field');
  if (idField) idField.style.display = entity ? '' : 'none';
}

// Multi-select assignee state
var _helmSelectedAssignees = []; // [{ohr, name}]

function helmToggleAssigneeDropdown(show) {
  const dd = document.getElementById('helm-assignee-dropdown');
  if (dd) dd.style.display = show ? '' : 'none';
}

function helmFilterAssignees() {
  const query = (document.getElementById('helm-assignee-search')?.value || '').toLowerCase();
  const dd = document.getElementById('helm-assignee-dropdown');
  if (!dd) return;
  dd.style.display = '';
  dd.querySelectorAll('.searchable-select-option').forEach(opt => {
    const name = opt.textContent.toLowerCase();
    const ohr = opt.getAttribute('data-ohr');
    const isSelected = _helmSelectedAssignees.some(a => a.ohr === ohr);
    opt.style.display = (name.includes(query) && !isSelected) ? '' : 'none';
  });
}

function helmToggleAssigneeMulti(ohr, name) {
  const idx = _helmSelectedAssignees.findIndex(a => a.ohr === ohr);
  if (idx >= 0) {
    _helmSelectedAssignees.splice(idx, 1);
  } else {
    _helmSelectedAssignees.push({ ohr, name });
  }
  helmRenderAssigneeChips();
  document.getElementById('helm-assignee-search').value = '';
  helmFilterAssignees();
}

function helmRemoveAssignee(ohr) {
  _helmSelectedAssignees = _helmSelectedAssignees.filter(a => a.ohr !== ohr);
  helmRenderAssigneeChips();
  helmFilterAssignees();
}

// Close assignee dropdown when clicking outside
document.addEventListener('click', function(e) {
  const wrapper = document.getElementById('helm-assignee-wrapper');
  if (wrapper && !wrapper.contains(e.target)) {
    helmToggleAssigneeDropdown(false);
  }
});

function helmRenderAssigneeChips() {
  const container = document.getElementById('helm-assignee-chips');
  if (!container) return;
  if (_helmSelectedAssignees.length === 0) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = _helmSelectedAssignees.map(a => `
    <span style="display:inline-flex;align-items:center;gap:4px;background:var(--primary);color:#fff;padding:3px 8px;border-radius:12px;font-size:11px;font-weight:500;">
      ${escapeHtml(a.name)}
      <span onclick="helmRemoveAssignee('${escapeAttr(a.ohr)}')" style="cursor:pointer;display:flex;align-items:center;margin-left:2px;opacity:0.8;" title="Remove">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </span>
    </span>
  `).join('');
}

function helmUpdateFiles() {
  const input = document.getElementById('helm-file-input');
  if (!input || !input.files) return;
  for (let i = 0; i < input.files.length; i++) {
    _helmAttachedFiles.push(input.files[i]);
  }
  input.value = '';
  helmRenderFileList();
}

function helmRemoveFile(index) {
  _helmAttachedFiles.splice(index, 1);
  helmRenderFileList();
}

function helmRenderFileList() {
  const listEl = document.getElementById('helm-file-list');
  if (!listEl) return;
  if (_helmAttachedFiles.length === 0) { listEl.innerHTML = ''; return; }
  let html = '';
  for (let i = 0; i < _helmAttachedFiles.length; i++) {
    const f = _helmAttachedFiles[i];
    const sizeKB = (f.size / 1024).toFixed(1);
    html += `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px;color:var(--fg);">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <span>${escapeHtml(f.name)}</span>
      <span style="color:var(--fg-subtle);">(${sizeKB} KB)</span>
      <button type="button" onclick="helmRemoveFile(${i})" style="background:none;border:none;cursor:pointer;padding:2px;display:flex;align-items:center;color:var(--error, #EF4444);" title="Remove">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`;
  }
  listEl.innerHTML = html;
}

async function helmSubmitNew() {
  const title = (document.getElementById('helm-new-title')?.value || '').trim();
  const priority = document.getElementById('helm-new-priority')?.value || 'Medium';

  if (!title) { showToast('Title is required', 'error'); return; }
  if (_helmSelectedAssignees.length === 0) { showToast('Please select at least one assignee', 'error'); return; }

  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;

  // Build comma-separated values for multi-select assignees
  const assigneeOhrs = _helmSelectedAssignees.map(a => a.ohr).join(', ');
  const assigneeNames = _helmSelectedAssignees.map(a => a.name).join(', ');
  const assigneePgs = _helmSelectedAssignees.map(a => {
    const emp = HELM.employees.find(e => e.ohr_id === a.ohr);
    return emp ? emp.planning_group : '';
  }).join(', ');

  // Upload attachments
  let attachmentUrls = [];
  for (const file of _helmAttachedFiles) {
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

  const record = {
    task_id: HELM._pendingTaskId || ('TSK-' + Date.now().toString(36).toUpperCase()),
    title: title,
    description: document.getElementById('helm-new-desc')?.value || '',
    priority: priority,
    assigned_to_ohr: assigneeOhrs,
    assigned_to_name: assigneeNames,
    assigned_to_pg: assigneePgs,
    assigned_by_ohr: cu ? cu.ohr_id : '',
    assigned_by_name: cu ? cu.full_name : '',
    due_date: document.getElementById('helm-new-due')?.value || '',
    target_entity: '',
    target_entity_id: '',
    attachments: attachmentUrls.length > 0 ? JSON.stringify(attachmentUrls) : ''
  };

  try {
    const resp = await fetch(`${IO_API_BASE}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    });
    if (!resp.ok) throw new Error('Failed to create task');
    const created = await resp.json();

    showToast('Task created successfully', 'success');
    if (typeof createNotification === 'function') {
      createNotification({ type: 'task_assigned', title: 'New Task Assigned',
        message: `${created.task_id}: "${title}" assigned to ${assigneeNames}` });
    }
    helmCloseForm();
    await helmFetchTasks();
  } catch (e) {
    showToast('Failed to create task: ' + e.message, 'error');
  }
}

function helmCloseForm() {
  const overlay = document.getElementById('helm-form-overlay');
  if (overlay) overlay.style.display = 'none';
  HELM.editingId = null;
  _helmAttachedFiles = [];
}

// ===== Detail View =====

async function helmOpenDetail(taskId) {
  const task = HELM.tasks.find(t => t.task_id === taskId);
  if (!task) return;
  HELM.editingId = taskId;

  const formTitle = document.getElementById('helm-form-title');
  const formBody = document.getElementById('helm-form-body');
  const formFooter = document.getElementById('helm-form-footer');
  const overlay = document.getElementById('helm-form-overlay');

  const statusColor = HELM.STATUS_COLORS[task.status] || 'var(--fg-muted)';
  const priorityColor = HELM.PRIORITY_COLORS[task.priority] || 'var(--fg-muted)';
  const dueStr = task.due_date ? new Date(task.due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';
  const isOverdue = task.due_date && task.status !== 'Completed' && task.status !== 'Cancelled' && new Date(task.due_date) < new Date();
  const createdStr = task.created_at ? new Date(task.created_at).toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '—';

  formTitle.innerHTML = `<span>${escapeHtml(task.task_id)}</span>`;

  let html = '<div class="detail-section"><h4 class="detail-section-title" style="font-size:13px;text-transform:uppercase;letter-spacing:1px;color:var(--fg-muted);border-bottom:2px solid var(--primary);padding-bottom:6px;margin-bottom:12px;">Task Details</h4>';
  html += `<div class="detail-row"><span class="detail-label">Title</span><span class="detail-value" style="font-weight:600;">${escapeHtml(task.title || '—')}</span></div>`;
  html += `<div class="detail-row"><span class="detail-label">Status</span><span class="detail-value"><span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:50%;background:${statusColor};display:inline-block;"></span><strong style="color:${statusColor};">${escapeHtml(task.status || '—')}</strong></span></span></div>`;
  html += `<div class="detail-row"><span class="detail-label">Priority</span><span class="detail-value"><span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:50%;background:${priorityColor};display:inline-block;"></span>${escapeHtml(task.priority || '—')}</span></span></div>`;
  html += `<div class="detail-row"><span class="detail-label">Assigned To</span><span class="detail-value">${escapeHtml(task.assigned_to_name || '—')}</span></div>`;
  html += `<div class="detail-row"><span class="detail-label">Assigned By</span><span class="detail-value">${escapeHtml(task.assigned_by_name || '—')}</span></div>`;
  html += `<div class="detail-row"><span class="detail-label">Due Date</span><span class="detail-value" style="${isOverdue ? 'color:var(--error);font-weight:600;' : ''}">${dueStr}${isOverdue ? ' (Overdue)' : ''}</span></div>`;
  html += `<div class="detail-row"><span class="detail-label">Created</span><span class="detail-value">${createdStr}</span></div>`;

  if (task.description) {
    html += `<div class="detail-row"><span class="detail-label">Description</span><span class="detail-value detail-multiline">${escapeHtml(task.description)}</span></div>`;
  }

  if (task.target_entity) {
    html += `<div class="detail-row"><span class="detail-label">Linked Entity</span><span class="detail-value">${escapeHtml(task.target_entity)}${task.target_entity_id ? ' <span style="font-family:monospace;color:var(--primary);">#' + escapeHtml(task.target_entity_id) + '</span>' : ''}</span></div>`;
  }

  // Attachments
  if (task.attachments) {
    try {
      const atts = JSON.parse(task.attachments);
      if (atts.length > 0) {
        html += '<div class="detail-row"><span class="detail-label">Attachments</span><span class="detail-value">';
        atts.forEach(a => {
          html += `<a href="${escapeAttr(a.url)}" target="_blank" download="${escapeAttr(a.name)}" style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--primary);text-decoration:none;margin-right:10px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            ${escapeHtml(a.name)}
          </a>`;
        });
        html += '</span></div>';
      }
    } catch (e) {}
  }

  html += '</div>';

  // ===== COMMENTS SECTION =====
  html += '<div class="detail-section" style="margin-top:16px;"><h4 class="detail-section-title" style="font-size:13px;text-transform:uppercase;letter-spacing:1px;color:var(--fg-muted);border-bottom:2px solid var(--primary);padding-bottom:6px;margin-bottom:12px;">Comments</h4>';
  html += '<div id="helm-comments-list" style="margin-bottom:12px;"><div style="text-align:center;padding:12px;color:var(--fg-muted);font-size:12px;">Loading comments...</div></div>';
  html += `<div style="display:flex;gap:8px;align-items:flex-start;">
    <textarea class="form-input" id="helm-comment-input" rows="2" placeholder="Add a comment..." style="flex:1;resize:vertical;font-size:13px;"></textarea>
    <button class="btn btn-primary btn-sm" onclick="helmSubmitComment()" style="white-space:nowrap;">Post</button>
  </div>`;
  html += '</div>';

  formBody.innerHTML = html;

  // Footer actions
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  let footerHtml = '';
  if (task.status !== 'Completed' && task.status !== 'Cancelled') {
    if (task.status === 'Open') {
      footerHtml += `<button class="btn btn-primary btn-sm" onclick="helmUpdateStatus('${escapeAttr(taskId)}','In Progress')">Start</button>`;
    }
    if (task.status === 'In Progress') {
      footerHtml += `<button class="btn btn-success btn-sm" onclick="helmUpdateStatus('${escapeAttr(taskId)}','Completed')">Complete</button>`;
    }
    footerHtml += ` <button class="btn btn-outline btn-sm" onclick="helmUpdateStatus('${escapeAttr(taskId)}','Cancelled')">Cancel Task</button>`;
  }
  if (task.status === 'Completed') {
    footerHtml += `<span style="font-size:12px;color:var(--success);font-weight:600;">Completed${task.completed_date ? ' on ' + new Date(task.completed_date).toLocaleDateString() : ''}</span>`;
  }
  formFooter.innerHTML = footerHtml;

  overlay.style.display = 'flex';

  // Load comments
  helmLoadComments(taskId);
}

async function helmLoadComments(taskId) {
  const listEl = document.getElementById('helm-comments-list');
  if (!listEl) return;

  try {
    const resp = await fetch(`${IO_API_BASE}/tasks/${taskId}/comments`);
    if (!resp.ok) throw new Error('Failed');
    const comments = await resp.json();

    if (comments.length === 0) {
      listEl.innerHTML = '<div style="text-align:center;padding:12px;color:var(--fg-muted);font-size:12px;">No comments yet.</div>';
      return;
    }

    let html = '';
    comments.forEach(c => {
      const ts = c.created_at ? new Date(c.created_at).toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '';
      html += `<div style="padding:8px 0;border-bottom:1px solid var(--border);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <strong style="font-size:12px;color:var(--fg);">${escapeHtml(c.author_name || 'Unknown')}</strong>
          <span style="font-size:11px;color:var(--fg-muted);">${ts}</span>
        </div>
        <div style="font-size:13px;color:var(--fg);line-height:1.5;">${escapeHtml(c.content || '')}</div>
      </div>`;
    });
    listEl.innerHTML = html;
  } catch (e) {
    listEl.innerHTML = '<div style="text-align:center;padding:12px;color:var(--error);font-size:12px;">Failed to load comments.</div>';
  }
}

async function helmSubmitComment() {
  const content = (document.getElementById('helm-comment-input')?.value || '').trim();
  if (!content) { showToast('Comment cannot be empty', 'error'); return; }

  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  const taskId = HELM.editingId;
  if (!taskId) return;

  try {
    const resp = await fetch(`${IO_API_BASE}/tasks/${taskId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author_ohr: cu ? cu.ohr_id : '',
        author_name: cu ? cu.full_name : 'Unknown',
        content: content
      })
    });
    if (!resp.ok) throw new Error('Failed');

    document.getElementById('helm-comment-input').value = '';
    helmLoadComments(taskId);
    showToast('Comment added', 'success');
  } catch (e) {
    showToast('Failed to add comment: ' + e.message, 'error');
  }
}

async function helmUpdateStatus(taskId, newStatus) {
  const update = { status: newStatus };
  if (newStatus === 'Completed') {
    update.completed_date = new Date().toISOString();
  }

  try {
    const resp = await fetch(`${IO_API_BASE}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update)
    });
    if (!resp.ok) throw new Error('Failed');

    showToast(`Task status updated to ${newStatus}`, 'success');
    helmCloseForm();
    await helmFetchTasks();
  } catch (e) {
    showToast('Failed to update task: ' + e.message, 'error');
  }
}

// ===== Analytics =====

function helmRenderAnalytics() {
  const el = document.getElementById('helm-analytics-content');
  if (!el) return;

  const tasks = HELM.tasks;
  const total = tasks.length;
  const completed = tasks.filter(t => t.status === 'Completed').length;
  const completionRate = total > 0 ? ((completed / total) * 100).toFixed(1) : 0;
  const overdue = tasks.filter(t => t.due_date && t.status !== 'Completed' && t.status !== 'Cancelled' && new Date(t.due_date) < new Date()).length;
  const avgCompletionDays = helmCalcAvgCompletion();

  // Group by assignee (Team Lead / person)
  const byAssignee = {};
  tasks.forEach(t => {
    const name = t.assigned_to_name || 'Unassigned';
    if (!byAssignee[name]) byAssignee[name] = { total: 0, completed: 0, open: 0, overdue: 0 };
    byAssignee[name].total++;
    if (t.status === 'Completed') byAssignee[name].completed++;
    if (t.status === 'Open' || t.status === 'In Progress') byAssignee[name].open++;
    if (t.due_date && t.status !== 'Completed' && t.status !== 'Cancelled' && new Date(t.due_date) < new Date()) byAssignee[name].overdue++;
  });

  // Group by planning group (department)
  const byDept = {};
  tasks.forEach(t => {
    const pg = t.assigned_to_pg || 'Unknown';
    if (!byDept[pg]) byDept[pg] = { total: 0, completed: 0 };
    byDept[pg].total++;
    if (t.status === 'Completed') byDept[pg].completed++;
  });

  // Group by linked entity (module)
  const byModule = {};
  tasks.forEach(t => {
    const mod = t.target_entity || 'No Link';
    if (!byModule[mod]) byModule[mod] = { total: 0, completed: 0 };
    byModule[mod].total++;
    if (t.status === 'Completed') byModule[mod].completed++;
  });

  // Group by priority
  const byPriority = {};
  HELM.PRIORITIES.forEach(p => byPriority[p] = 0);
  tasks.forEach(t => { if (t.priority) byPriority[t.priority] = (byPriority[t.priority] || 0) + 1; });

  let html = '<div class="analytics-grid">';

  // KPI Cards
  html += `
    <div class="analytics-card analytics-card-wide">
      <h4 class="analytics-card-title">Overview</h4>
      <div style="display:flex;gap:16px;flex-wrap:wrap;">
        <div class="analytics-kpi"><div class="analytics-kpi-value">${total}</div><div class="analytics-kpi-label">Total Tasks</div></div>
        <div class="analytics-kpi"><div class="analytics-kpi-value" style="color:var(--success);">${completionRate}%</div><div class="analytics-kpi-label">Completion Rate</div></div>
        <div class="analytics-kpi"><div class="analytics-kpi-value" style="color:var(--error);">${overdue}</div><div class="analytics-kpi-label">Overdue</div></div>
        <div class="analytics-kpi"><div class="analytics-kpi-value">${avgCompletionDays}</div><div class="analytics-kpi-label">Avg Days to Complete</div></div>
      </div>
    </div>
  `;

  // By Assignee Table
  const assigneeRows = Object.entries(byAssignee).sort((a, b) => b[1].total - a[1].total);
  html += `
    <div class="analytics-card">
      <h4 class="analytics-card-title">Completion by Assignee</h4>
      <div style="max-height:300px;overflow-y:auto;">
        <table class="analytics-table">
          <thead><tr><th>Assignee</th><th>Total</th><th>Done</th><th>Open</th><th>Overdue</th><th>Rate</th></tr></thead>
          <tbody>
            ${assigneeRows.map(([name, d]) => {
              const rate = d.total > 0 ? ((d.completed / d.total) * 100).toFixed(0) : 0;
              return `<tr><td>${escapeHtml(name)}</td><td>${d.total}</td><td style="color:var(--success);">${d.completed}</td><td>${d.open}</td><td style="color:${d.overdue > 0 ? 'var(--error)' : 'var(--fg-muted)'};">${d.overdue}</td><td><strong>${rate}%</strong></td></tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // By Department Table
  const deptRows = Object.entries(byDept).sort((a, b) => b[1].total - a[1].total);
  html += `
    <div class="analytics-card">
      <h4 class="analytics-card-title">Completion by Department</h4>
      <div style="max-height:300px;overflow-y:auto;">
        <table class="analytics-table">
          <thead><tr><th>Department</th><th>Total</th><th>Completed</th><th>Rate</th></tr></thead>
          <tbody>
            ${deptRows.map(([name, d]) => {
              const rate = d.total > 0 ? ((d.completed / d.total) * 100).toFixed(0) : 0;
              return `<tr><td>${escapeHtml(name)}</td><td>${d.total}</td><td style="color:var(--success);">${d.completed}</td><td><strong>${rate}%</strong></td></tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // By Module Table
  const moduleRows = Object.entries(byModule).sort((a, b) => b[1].total - a[1].total);
  html += `
    <div class="analytics-card">
      <h4 class="analytics-card-title">Completion by Module</h4>
      <div style="max-height:300px;overflow-y:auto;">
        <table class="analytics-table">
          <thead><tr><th>Module</th><th>Total</th><th>Completed</th><th>Rate</th></tr></thead>
          <tbody>
            ${moduleRows.map(([name, d]) => {
              const rate = d.total > 0 ? ((d.completed / d.total) * 100).toFixed(0) : 0;
              return `<tr><td>${escapeHtml(name)}</td><td>${d.total}</td><td style="color:var(--success);">${d.completed}</td><td><strong>${rate}%</strong></td></tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Priority Distribution
  html += `
    <div class="analytics-card">
      <h4 class="analytics-card-title">Priority Distribution</h4>
      <div style="display:flex;flex-direction:column;gap:8px;padding:8px 0;">
        ${HELM.PRIORITIES.map(p => {
          const count = byPriority[p] || 0;
          const pct = total > 0 ? ((count / total) * 100).toFixed(0) : 0;
          return `<div style="display:flex;align-items:center;gap:8px;">
            <span style="width:60px;font-size:12px;font-weight:500;color:var(--fg);">${p}</span>
            <div style="flex:1;height:20px;background:var(--bg-inset);border-radius:4px;overflow:hidden;">
              <div style="height:100%;width:${pct}%;background:${HELM.PRIORITY_COLORS[p]};border-radius:4px;transition:width 0.3s;"></div>
            </div>
            <span style="width:40px;text-align:right;font-size:12px;color:var(--fg-muted);">${count}</span>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;

  html += '</div>';
  el.innerHTML = html;
}

function helmCalcAvgCompletion() {
  const completed = HELM.tasks.filter(t => t.status === 'Completed' && t.created_at && t.completed_date);
  if (completed.length === 0) return '—';
  const totalDays = completed.reduce((sum, t) => {
    const created = new Date(t.created_at);
    const done = new Date(t.completed_date);
    return sum + ((done - created) / (1000 * 60 * 60 * 24));
  }, 0);
  return (totalDays / completed.length).toFixed(1);
}
