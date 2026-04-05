/**
 * Helm — Task Assigning, Tracking & Cross-Module Execution
 * Sub-page 1: Task Board — create, browse, and manage tasks
 * Sub-page 2: Analytics — completion rates by TL, department, module
 */

const HELM = {
  tasks: [],
  filtered: [],
  filteredReceived: [],
  approvals: [],
  filteredApprovals: [],
  employees: [],
  currentTab: 'all',
  currentBoardTab: 'tasks',
  currentSubpage: 'board',
  page: 1,
  receivedPage: 1,
  pageSize: 25,
  approvalsPage: 1,
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
  if (sub === 'board') {
    helmApplyFilters();
    helmApplyReceivedFilters();
    helmApplyApprovalsFilters();
  }
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
  const boardLoading = document.getElementById('helm-board-loading');
  const boardContent = document.getElementById('helm-board-content');
  if (boardLoading) boardLoading.style.display = 'flex';
  if (boardContent) boardContent.style.display = 'none';

  try {
    const url = `${IO_API_BASE}/tasks?limit=2000`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Failed to fetch tasks');
    HELM.tasks = await resp.json();
  } catch (e) {
    console.error('Helm fetch error:', e);
    HELM.tasks = [];
  }

  if (boardLoading) boardLoading.style.display = 'none';
  if (boardContent) boardContent.style.display = '';

  // Hide "New Task" button and "Tasks Given" panel from Agents
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  const isAgent = cu && cu.actual_role === 'Agent' && cu.ohr_id !== '740045023';
  const newTaskBtn = document.getElementById('helm-new-btn');
  if (newTaskBtn) newTaskBtn.style.display = isAgent ? 'none' : '';
  const tasksGivenPanel = document.getElementById('helm-tab-tasks');
  if (tasksGivenPanel) tasksGivenPanel.style.display = isAgent ? 'none' : '';
  // Switch to 2-column grid for agents, 3-column for others
  const boardGrid = tasksGivenPanel ? tasksGivenPanel.parentElement : null;
  if (boardGrid && boardGrid.style) {
    boardGrid.style.gridTemplateColumns = isAgent ? '1fr 1fr' : '1fr 1fr 1fr';
  }

  helmApplyFilters();
  helmApplyReceivedFilters();
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

// ===== Board Tab Switcher =====

function helmSwitchBoardTab(tab) {
  // All three tables are always visible side-by-side now
  HELM.currentBoardTab = tab;
  // Ensure all panels are visible
  const tasksPanel = document.getElementById('helm-tab-tasks');
  const receivedPanel = document.getElementById('helm-tab-received');
  const approvalsPanel = document.getElementById('helm-tab-approvals');
  if (tasksPanel) tasksPanel.style.display = '';
  if (receivedPanel) receivedPanel.style.display = '';
  if (approvalsPanel) approvalsPanel.style.display = '';
  // Refresh all tables
  helmApplyReceivedFilters();
  helmApplyApprovalsFilters();
}

function helmApplyFilters() {
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  // Filter only task records (not requests) where current user is the creator
  let data = HELM.tasks.filter(t => t.record_type !== 'request');

  // Tasks Given: only tasks created by the current user
  if (cu && cu.ohr_id) {
    data = data.filter(t => (t.assigned_by_ohr || '').trim() === cu.ohr_id.trim());
  } else {
    // No user logged in — show nothing
    data = [];
  }

  // Status filter
  const statusFilter = document.getElementById('helm-filter-status')?.value || 'All';
  if (statusFilter !== 'All') {
    data = data.filter(t => t.status === statusFilter);
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
  helmRenderTable();
}

// ===== Table Rendering (Tasks Given) =====

function helmRenderTable() {
  const thead = document.getElementById('helm-table-head');
  const tbody = document.getElementById('helm-table-body');
  if (!thead || !tbody) return;

  thead.innerHTML = `<tr>
    <th>Task ID</th>
    <th>Title</th>
    <th>Assigned To</th>
    <th>Status</th>
    <th>Due Date</th>
  </tr>`;

  const start = (HELM.page - 1) * HELM.pageSize;
  const pageData = HELM.filtered.slice(start, start + HELM.pageSize);

  if (pageData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--fg-muted);">No tasks found</td></tr>';
    helmRenderPagination();
    return;
  }

  tbody.innerHTML = pageData.map(t => {
    const statusColor = HELM.STATUS_COLORS[t.status] || 'var(--fg-muted)';
    const isOverdue = t.due_date && t.status !== 'Completed' && t.status !== 'Cancelled' && new Date(t.due_date) < new Date();
    const dueStr = t.due_date ? new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

    return `<tr class="data-row" onclick="helmOpenDetail('${escapeAttr(t.task_id)}')">
      <td><span style="font-family:monospace;font-size:12px;color:var(--primary);">${escapeHtml(t.task_id)}</span></td>
      <td><span style="font-weight:500;">${escapeHtml(t.title || '—')}</span></td>
      <td>${escapeHtml(t.assigned_to_name || '—')}</td>
      <td><span style="color:${statusColor};font-weight:600;font-size:12px;">${escapeHtml(t.status || '—')}</span></td>
      <td style="${isOverdue ? 'color:var(--error);font-weight:600;' : ''}">${dueStr}${isOverdue ? ' (Overdue)' : ''}</td>
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

// ===== Tasks Received: Filter, Render, Pagination =====

function helmApplyReceivedFilters() {
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  // Filter only task records (not requests) where current user is an assignee
  let data = HELM.tasks.filter(t => t.record_type !== 'request');

  // Tasks Received: only tasks assigned to the current user
  if (cu && cu.ohr_id) {
    const myOhr = cu.ohr_id.trim();
    data = data.filter(t => {
      const assignedOhrs = (t.assigned_to_ohr || '').split(',').map(s => s.trim()).filter(Boolean);
      return assignedOhrs.includes(myOhr);
    });
  } else {
    // No user logged in — show nothing
    data = [];
  }

  // Status filter
  const statusFilter = document.getElementById('helm-received-filter-status')?.value || 'All';
  if (statusFilter !== 'All') {
    data = data.filter(t => t.status === statusFilter);
  }

  // Search
  const search = (document.getElementById('helm-received-search')?.value || '').toLowerCase().trim();
  if (search) {
    data = data.filter(t =>
      (t.title || '').toLowerCase().includes(search) ||
      (t.task_id || '').toLowerCase().includes(search) ||
      (t.assigned_to_name || '').toLowerCase().includes(search) ||
      (t.assigned_by_name || '').toLowerCase().includes(search)
    );
  }

  HELM.filteredReceived = data;
  helmRenderReceivedTable();
}

function helmRenderReceivedTable() {
  const thead = document.getElementById('helm-received-table-head');
  const tbody = document.getElementById('helm-received-table-body');
  if (!thead || !tbody) return;

  thead.innerHTML = `<tr>
    <th>Task ID</th>
    <th>Title</th>
    <th>Status</th>
    <th>Due Date</th>
  </tr>`;

  const start = (HELM.receivedPage - 1) * HELM.pageSize;
  const pageData = HELM.filteredReceived.slice(start, start + HELM.pageSize);

  if (pageData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--fg-muted);">No tasks found</td></tr>';
    helmRenderReceivedPagination();
    return;
  }

  tbody.innerHTML = pageData.map(t => {
    const statusColor = HELM.STATUS_COLORS[t.status] || 'var(--fg-muted)';
    const isOverdue = t.due_date && t.status !== 'Completed' && t.status !== 'Cancelled' && new Date(t.due_date) < new Date();
    const dueStr = t.due_date ? new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '\u2014';

    return `<tr class="data-row" onclick="helmOpenDetail('${escapeAttr(t.task_id)}')">
      <td><span style="font-family:monospace;font-size:12px;color:var(--primary);">${escapeHtml(t.task_id)}</span></td>
      <td><span style="font-weight:500;">${escapeHtml(t.title || '\u2014')}</span></td>
      <td><span style="color:${statusColor};font-weight:600;font-size:12px;">${escapeHtml(t.status || '\u2014')}</span></td>
      <td style="${isOverdue ? 'color:var(--error);font-weight:600;' : ''}">${dueStr}${isOverdue ? ' (Overdue)' : ''}</td>
    </tr>`;
  }).join('');

  helmRenderReceivedPagination();
}

function helmRenderReceivedPagination() {
  const el = document.getElementById('helm-received-pagination');
  if (!el) return;
  const total = HELM.filteredReceived.length;
  const totalPages = Math.ceil(total / HELM.pageSize) || 1;
  const start = (HELM.receivedPage - 1) * HELM.pageSize + 1;
  const end = Math.min(HELM.receivedPage * HELM.pageSize, total);

  el.innerHTML = `
    <span class="pagination-info">${total > 0 ? start + '\u2013' + end + ' of ' + total : '0 tasks'}</span>
    <div class="pagination-btns">
      <button class="btn btn-outline btn-xs" ${HELM.receivedPage <= 1 ? 'disabled' : ''} onclick="HELM.receivedPage--;helmRenderReceivedTable();">Prev</button>
      <span class="pagination-page">${HELM.receivedPage} / ${totalPages}</span>
      <button class="btn btn-outline btn-xs" ${HELM.receivedPage >= totalPages ? 'disabled' : ''} onclick="HELM.receivedPage++;helmRenderReceivedTable();">Next</button>
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
        <div class="searchable-select" id="helm-assignee-wrapper" style="width:100%;">
          <input type="text" class="form-input" id="helm-assignee-search" placeholder="Search and select employees..." autocomplete="off" onclick="helmToggleAssigneeDropdown(true)" oninput="helmFilterAssignees()" style="width:100%;">
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

    assigned_to_ohr: assigneeOhrs,
    assigned_to_name: assigneeNames,
    assigned_to_pg: assigneePgs,
    assigned_by_ohr: cu ? cu.ohr_id : '',
    assigned_by_name: cu ? cu.full_name : '',
    due_date: document.getElementById('helm-new-due')?.value || '',

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

    // Create targeted in-app notification for each assignee
    if (typeof createNotification === 'function') {
      for (const assignee of _helmSelectedAssignees) {
        createNotification({
          type: 'task_assigned',
          title: 'Task Assigned',
          message: `"${title}" assigned to you`,
          target_ohr: assignee.ohr,
          metadata: JSON.stringify({
            taskId: created.task_id,
            taskTitle: title,
            assignedBy: cu ? cu.full_name : 'Unknown',
            dueDate: record.due_date || ''
          })
        });
      }
    }

    // Queue GChat notification for each assignee
    try {
      await fetch(`${IO_API_BASE}/gchat-notify-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: created.task_id,
          title: title,
          description: record.description || '',
          assigned_by: cu ? cu.full_name : 'Unknown',
          due_date: record.due_date || '',
          assignees: _helmSelectedAssignees.map(a => ({
            ohr: a.ohr,
            name: a.name
          }))
        })
      });
    } catch (gchatErr) {
      console.warn('GChat task notification queue failed:', gchatErr);
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
  const dueStr = task.due_date ? new Date(task.due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';
  const isOverdue = task.due_date && task.status !== 'Completed' && task.status !== 'Cancelled' && new Date(task.due_date) < new Date();
  const createdStr = task.created_at ? new Date(task.created_at).toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '—';

  formTitle.innerHTML = `<span>${escapeHtml(task.task_id)}</span>`;

  let html = '<div class="detail-section"><h4 class="detail-section-title" style="font-size:13px;text-transform:uppercase;letter-spacing:1px;color:var(--fg-muted);border-bottom:2px solid var(--primary);padding-bottom:6px;margin-bottom:12px;">Task Details</h4>';
  html += `<div class="detail-row"><span class="detail-label">Title</span><span class="detail-value" style="font-weight:600;">${escapeHtml(task.title || '—')}</span></div>`;
  html += `<div class="detail-row"><span class="detail-label">Status</span><span class="detail-value"><span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:50%;background:${statusColor};display:inline-block;"></span><strong style="color:${statusColor};">${escapeHtml(task.status || '—')}</strong></span></span></div>`;

  html += `<div class="detail-row"><span class="detail-label">Assigned To</span><span class="detail-value">${escapeHtml(task.assigned_to_name || '—')}</span></div>`;
  html += `<div class="detail-row"><span class="detail-label">Assigned By</span><span class="detail-value">${escapeHtml(task.assigned_by_name || '—')}</span></div>`;
  html += `<div class="detail-row"><span class="detail-label">Due Date</span><span class="detail-value" style="${isOverdue ? 'color:var(--error);font-weight:600;' : ''}">${dueStr}${isOverdue ? ' (Overdue)' : ''}</span></div>`;
  html += `<div class="detail-row"><span class="detail-label">Created</span><span class="detail-value">${createdStr}</span></div>`;

  if (task.description) {
    html += `<div class="detail-row"><span class="detail-label">Description</span><span class="detail-value detail-multiline">${escapeHtml(task.description)}</span></div>`;
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


// ===== New Request Form =====

const HELM_REQUEST_TYPES = [
  { value: 'attendance_backdated_change_tag', label: 'Attendance Backdated Change Tag' },
  { value: 'ot_request', label: 'OT Request' }
];

var _helmRequestSelectedAgent = null;

function helmShowNewRequestForm() {
  const formTitle = document.getElementById('helm-form-title');
  const formBody = document.getElementById('helm-form-body');
  const formFooter = document.getElementById('helm-form-footer');
  const overlay = document.getElementById('helm-form-overlay');

  HELM.editingId = null;
  _helmRequestSelectedAgent = null;

  const reqId = 'REQ-' + Date.now().toString(36).toUpperCase();
  HELM._pendingReqId = reqId;
  formTitle.textContent = reqId;

  // Filter request types: hide Attendance Backdated Change Tag from agents
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  const isAgent = cu && cu.actual_role === 'Agent' && cu.ohr_id !== '740045023';
  const filteredRequestTypes = isAgent
    ? HELM_REQUEST_TYPES.filter(t => t.value !== 'attendance_backdated_change_tag')
    : HELM_REQUEST_TYPES;
  const typeOptions = filteredRequestTypes.map(t =>
    `<option value="${escapeAttr(t.value)}">${escapeHtml(t.label)}</option>`
  ).join('');

  const employeeOptions = HELM.employees.map(e =>
    `<div class="searchable-select-option" data-ohr="${escapeAttr(e.ohr_id)}" data-name="${escapeAttr(e.full_name)}" onclick="helmSelectRequestAgent('${escapeAttr(e.ohr_id)}','${escapeAttr(e.full_name)}')">${escapeHtml(e.full_name)} (${escapeHtml(e.ohr_id)})</div>`
  ).join('');

  // For agents: auto-select OT Request, hide dropdown, show OT fields immediately
  const agentAutoOT = isAgent;
  formBody.innerHTML = `
    <div class="form-section">
      <div class="form-field" ${agentAutoOT ? 'style="display:none;"' : ''}>
        <label class="form-label">Request Type <span class="required">*</span></label>
        <select class="form-input" id="helm-req-type" onchange="helmOnRequestTypeChange()" style="width:100%;">
          ${typeOptions}
        </select>
      </div>

      <!-- OT Request fields -->
      <div id="helm-req-ot-fields" style="${agentAutoOT ? '' : 'display:none;'}">
        <div class="form-field">
          <label class="form-label">How many OT hours are you willing to render? <span class="required">*</span></label>
          <select class="form-input" id="helm-req-ot-hours" style="max-width:220px;">
            <option value="">— Select Hours —</option>
            <option value="1">1 hour</option>
            <option value="1.5">1.5 hours</option>
            <option value="2">2 hours</option>
            <option value="2.5">2.5 hours</option>
          </select>
        </div>
      </div>

      <!-- Attendance Backdated Change Tag fields -->
      <div id="helm-req-attendance-fields" style="${agentAutoOT ? 'display:none;' : ''}">
        <div class="form-field">
          <label class="form-label">Date <span class="required">*</span></label>
          <input type="date" class="form-input" id="helm-req-date" style="max-width:220px;" onchange="helmUpdateCurrentTag()">
        </div>
        <div class="form-field">
          <label class="form-label">Name <span class="required">*</span></label>
          <div id="helm-req-agent-chip" style="margin-bottom:6px;"></div>
          <div class="searchable-select" id="helm-req-agent-wrapper">
            <input type="text" class="form-input" id="helm-req-agent-search" placeholder="Search for an employee..." autocomplete="off" onclick="helmToggleRequestAgentDropdown(true)" oninput="helmFilterRequestAgents()" style="max-width:320px;">
            <div class="searchable-select-dropdown" id="helm-req-agent-dropdown" style="display:none;max-height:200px;overflow-y:auto;">
              ${employeeOptions}
            </div>
          </div>
        </div>
        <div class="form-field">
          <label class="form-label">Current Tag</label>
          <span id="helm-req-current-tag" style="display:inline-block;padding:6px 12px;background:var(--bg-subtle);border:1px solid var(--border);border-radius:6px;font-size:13px;color:var(--fg-muted);min-width:60px;">—</span>
        </div>
        <div class="form-field">
          <label class="form-label">New Tag <span class="required">*</span></label>
          <select class="form-input" id="helm-req-new-tag" style="max-width:220px;">
            <option value="">— Select New Tag —</option>
          </select>
        </div>
        <div class="form-field">
          <label class="form-label">Reason for Change <span class="required">*</span></label>
          <textarea class="form-textarea" id="helm-req-reason" rows="4" placeholder="Explain why the tag needs to be changed for this date..." style="width:100%;resize:vertical;"></textarea>
        </div>
      </div>
    </div>
  `;

  formFooter.innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="helmCloseForm()">Cancel</button>
    <button class="btn btn-primary btn-sm" onclick="helmSubmitNewRequest()">Submit</button>
  `;

  overlay.style.display = 'flex';
}

function helmOnRequestTypeChange() {
  const type = document.getElementById('helm-req-type')?.value || '';
  const attendanceFields = document.getElementById('helm-req-attendance-fields');
  const otFields = document.getElementById('helm-req-ot-fields');
  if (attendanceFields) {
    attendanceFields.style.display = (type === 'attendance_backdated_change_tag') ? '' : 'none';
  }
  if (otFields) {
    otFields.style.display = (type === 'ot_request') ? '' : 'none';
  }
}

function helmToggleRequestAgentDropdown(show) {
  const dd = document.getElementById('helm-req-agent-dropdown');
  if (dd) dd.style.display = show ? '' : 'none';
}

function helmFilterRequestAgents() {
  const query = (document.getElementById('helm-req-agent-search')?.value || '').toLowerCase();
  const dd = document.getElementById('helm-req-agent-dropdown');
  if (!dd) return;
  dd.style.display = '';
  dd.querySelectorAll('.searchable-select-option').forEach(opt => {
    const name = (opt.getAttribute('data-name') || '').toLowerCase();
    const ohr = (opt.getAttribute('data-ohr') || '').toLowerCase();
    opt.style.display = (name.includes(query) || ohr.includes(query)) ? '' : 'none';
  });
}

function helmSelectRequestAgent(ohr, name) {
  _helmRequestSelectedAgent = { ohr, name };
  const chipEl = document.getElementById('helm-req-agent-chip');
  if (chipEl) {
    chipEl.innerHTML = `
      <span style="display:inline-flex;align-items:center;gap:4px;background:var(--primary);color:#fff;padding:3px 8px;border-radius:12px;font-size:11px;font-weight:500;">
        ${escapeHtml(name)}
        <span onclick="helmClearRequestAgent()" style="cursor:pointer;display:flex;align-items:center;margin-left:2px;opacity:0.8;" title="Remove">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </span>
      </span>
    `;
  }
  helmToggleRequestAgentDropdown(false);
  const searchInput = document.getElementById('helm-req-agent-search');
  if (searchInput) { searchInput.value = ''; searchInput.style.display = 'none'; }
  helmUpdateCurrentTag();
}

async function helmUpdateCurrentTag() {
  const tagEl = document.getElementById('helm-req-current-tag');
  const newTagSelect = document.getElementById('helm-req-new-tag');
  if (!tagEl) return;
  const date = document.getElementById('helm-req-date')?.value || '';
  const agent = _helmRequestSelectedAgent;
  if (!date || !agent) {
    tagEl.textContent = '\u2014';
    if (newTagSelect) newTagSelect.innerHTML = '<option value="">\u2014 Select New Tag \u2014</option>';
    return;
  }

  // Use only the tags available in the Input Portal Tag dropdown
  const PORTAL_TAGS = (typeof TAG_OPTIONS !== 'undefined') ? TAG_OPTIONS : ['P', 'LATE', 'UPL', 'PL', 'ML', 'WO', 'NYO', 'EXIT'];
  let currentTag = '';

  try {
    const resp = await fetch(`${IO_API_BASE}/attendance?ohr_id=${agent.ohr}&log_date=${date}&limit=1`);
    if (!resp.ok) { tagEl.textContent = '\u2014'; return; }
    const records = await resp.json();
    if (records.length > 0 && records[0].tag) {
      currentTag = records[0].tag;
      tagEl.textContent = currentTag;
      tagEl.style.color = 'var(--fg)';
      tagEl.style.fontWeight = '600';
    } else {
      tagEl.textContent = '(blank)';
      tagEl.style.color = 'var(--fg-muted)';
      tagEl.style.fontWeight = 'normal';
    }
  } catch (e) {
    tagEl.textContent = '\u2014';
  }

  // Populate New Tag dropdown excluding current tag
  if (newTagSelect) {
    let opts = '<option value="">\u2014 Select New Tag \u2014</option>';
    for (const tag of PORTAL_TAGS) {
      if (tag === currentTag) continue;
      opts += `<option value="${tag}">${tag}</option>`;
    }
    newTagSelect.innerHTML = opts;
  }
}

function helmClearRequestAgent() {
  _helmRequestSelectedAgent = null;
  const chipEl = document.getElementById('helm-req-agent-chip');
  if (chipEl) chipEl.innerHTML = '';
  const searchInput = document.getElementById('helm-req-agent-search');
  if (searchInput) searchInput.style.display = '';
}

// Close request agent dropdown when clicking outside
document.addEventListener('click', function(e) {
  const wrapper = document.getElementById('helm-req-agent-wrapper');
  if (wrapper && !wrapper.contains(e.target)) {
    helmToggleRequestAgentDropdown(false);
  }
});

async function helmSubmitNewRequest() {
  const reqType = document.getElementById('helm-req-type')?.value || '';
  if (!reqType) { showToast('Please select a request type', 'error'); return; }

  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;

  if (reqType === 'attendance_backdated_change_tag') {
    const date = document.getElementById('helm-req-date')?.value || '';
    const reason = (document.getElementById('helm-req-reason')?.value || '').trim();

    const newTag = document.getElementById('helm-req-new-tag')?.value || '';

    if (!date) { showToast('Please select the date to change', 'error'); return; }
    if (!_helmRequestSelectedAgent) { showToast('Please select an agent', 'error'); return; }
    if (!newTag) { showToast('Please select the new tag', 'error'); return; }
    if (!reason) { showToast('Please provide a reason for the change', 'error'); return; }

    const agentName = _helmRequestSelectedAgent.name;
    const agentOhr = _helmRequestSelectedAgent.ohr;
    const readableDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

    // Find the agent's supervisor
    const agentEmp = HELM.employees.find(e => e.ohr_id === agentOhr);
    const supervisorName = agentEmp ? (agentEmp.supervisor_name || '') : '';

    // Find supervisor OHR from employees list by matching supervisor_name
    let supervisorOhr = '';
    if (supervisorName) {
      const supEmp = HELM.employees.find(e => e.full_name === supervisorName);
      if (supEmp) supervisorOhr = supEmp.ohr_id;
    }

    // Create as a request with approval metadata
    const reqId = HELM._pendingReqId || ('REQ-' + Date.now().toString(36).toUpperCase());
    const record = {
      task_id: reqId,
      title: `[Request] Attendance Backdated Change Tag — ${agentName}`,
      description: `Request Type: Attendance Backdated Change Tag\nAgent: ${agentName} (${agentOhr})\nDate: ${readableDate}\nPrevious Tag: ${document.getElementById('helm-req-current-tag')?.textContent || '—'}\nNew Tag: ${newTag}\nReason: ${reason}\n\nRequested by: ${cu ? cu.full_name : 'Unknown'}`,
      assigned_to_ohr: supervisorOhr || (cu ? cu.ohr_id : ''),
      assigned_to_name: supervisorName || (cu ? cu.full_name : ''),
      assigned_to_pg: agentEmp ? (agentEmp.planning_group || '') : '',
      assigned_by_ohr: cu ? cu.ohr_id : '',
      assigned_by_name: cu ? cu.full_name : '',
      due_date: '',
      status: 'Open',
      record_type: 'request',
      request_type: 'attendance_backdated_change_tag',
      approval_status: 'Pending',
      attachments: ''
    };

    try {
      const resp = await fetch(`${IO_API_BASE}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
      });
      if (!resp.ok) throw new Error('Failed to create request');
      const created = await resp.json();

      showToast('Request submitted successfully', 'success');

      // Create targeted notification for the supervisor
      if (typeof createNotification === 'function' && supervisorOhr) {
        createNotification({
          type: 'backdate_request',
          title: 'Backdate Tag Change',
          message: `${agentName} · ${readableDate} · Requested by ${cu ? cu.full_name : 'Unknown'}`,
          target_ohr: supervisorOhr,
          metadata: JSON.stringify({
            requestId: reqId,
            agentName: agentName,
            requestDate: readableDate,
            newTag: newTag || '',
            reason: reason || '',
            requesterName: cu ? cu.full_name : 'Unknown'
          })
        });
      }

      // Send GChat notification to supervisor
      try {
        await fetch(`${IO_API_BASE}/gchat-notify-supervisor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            request_id: reqId,
            agent_name: agentName,
            agent_ohr: agentOhr,
            date: readableDate,
            new_tag: newTag,
            reason: reason,
            requester_name: cu ? cu.full_name : 'Unknown',
            requester_ohr: cu ? cu.ohr_id : '',
            supervisor_name: supervisorName
          })
        });
      } catch (gchatErr) {
        console.warn('GChat notification failed:', gchatErr);
      }

      helmCloseForm();
      await helmFetchTasks();
      helmSwitchBoardTab('approvals');
    } catch (e) {
      showToast('Failed to submit request: ' + e.message, 'error');
    }
  } else if (reqType === 'ot_request') {
    const otHours = document.getElementById('helm-req-ot-hours')?.value || '';
    if (!otHours) { showToast('Please select the number of OT hours', 'error'); return; }
    if (!cu) { showToast('You must be logged in to submit an OT request', 'error'); return; }

    // Check if this agent is RECALL_MEASUREMENT_CTR (excluded from OT system)
    const myEmp = HELM.employees.find(e => e.ohr_id === cu.ohr_id);
    if (myEmp && (myEmp.complete_planning_group || '').includes('RECALL_MEASUREMENT_CTR')) {
      showToast('OT requests are not available for your planning group', 'error');
      return;
    }

    // Check if OT form is open for this agent's planning group
    const agentPg = myEmp ? (myEmp.planning_group || '') : '';
    try {
      const configResp = await fetch(`${IO_API_BASE}/ot-config`);
      if (configResp.ok) {
        const configs = await configResp.json();
        const pgConfig = configs.find(c => c.planning_group === agentPg);
        if (!pgConfig || !pgConfig.ot_form_open) {
          showToast('OT requests are currently closed for your planning group. Please wait for your manager to open the form.', 'error');
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to check OT form status:', e);
    }

    try {
      const resp = await fetch(`${IO_API_BASE}/ot-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ohr_id: cu.ohr_id,
          agent_name: cu.full_name || '',
          planning_group: myEmp ? (myEmp.planning_group || '') : '',
          requested_hours: otHours
        })
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to submit OT request');
      }
      const result = await resp.json();
      showToast(`OT Request submitted successfully (${otHours} hours)`, 'success');
      helmCloseForm();
    } catch (e) {
      showToast(e.message || 'Failed to submit OT request', 'error');
    }
  }
}


// ===== Helper: Extract request type from title =====

/**
 * Extract just the request type from a task title.
 * Title format: "[Request] Attendance Backdated Change Tag — Agent Name"
 * Returns: "Attendance Backdated Change Tag"
 */
function helmExtractRequestType(title) {
  if (!title) return '—';
  // Remove [Request] prefix
  let t = title.replace(/^\[Request\]\s*/, '');
  // Remove " — Name" suffix (everything after the em-dash)
  const dashIdx = t.indexOf(' \u2014 ');
  if (dashIdx > 0) t = t.substring(0, dashIdx);
  // Also handle regular dash
  const regDashIdx = t.indexOf(' — ');
  if (regDashIdx > 0) t = t.substring(0, regDashIdx);
  return t.trim() || '—';
}

// ===== Approvals Tab =====

const HELM_APPROVAL_COLORS = {
  'Pending': '#F59E0B',
  'Approved': '#22C55E',
  'Rejected': '#EF4444'
};

function helmApplyApprovalsFilters() {
  // Filter only request records
  let data = HELM.tasks.filter(t => t.record_type === 'request');

  // Approval status filter
  const statusFilter = document.getElementById('helm-approvals-filter-status')?.value || 'All';
  if (statusFilter !== 'All') {
    data = data.filter(t => (t.approval_status || 'Pending') === statusFilter);
  }

  // Search
  const search = (document.getElementById('helm-approvals-search')?.value || '').toLowerCase().trim();
  if (search) {
    data = data.filter(t =>
      (t.title || '').toLowerCase().includes(search) ||
      (t.task_id || '').toLowerCase().includes(search) ||
      (t.assigned_by_name || '').toLowerCase().includes(search) ||
      (t.assigned_to_name || '').toLowerCase().includes(search)
    );
  }

  HELM.filteredApprovals = data;
  helmRenderApprovalsStats();
  helmRenderApprovalsTable();
}

function helmRenderApprovalsStats() {
  const el = document.getElementById('helm-approvals-stats');
  if (!el) return;
  const total = HELM.filteredApprovals.length;
  const pending = HELM.filteredApprovals.filter(t => (t.approval_status || 'Pending') === 'Pending').length;
  const approved = HELM.filteredApprovals.filter(t => t.approval_status === 'Approved').length;
  const rejected = HELM.filteredApprovals.filter(t => t.approval_status === 'Rejected').length;

  el.innerHTML = `
    <div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">Total</div></div>
    <div class="stat-card"><div class="stat-value" style="color:${HELM_APPROVAL_COLORS['Pending']}">${pending}</div><div class="stat-label">Pending</div></div>
    <div class="stat-card"><div class="stat-value" style="color:${HELM_APPROVAL_COLORS['Approved']}">${approved}</div><div class="stat-label">Approved</div></div>
    <div class="stat-card"><div class="stat-value" style="color:${HELM_APPROVAL_COLORS['Rejected']}">${rejected}</div><div class="stat-label">Rejected</div></div>
  `;
}

function helmRenderApprovalsTable() {
  const thead = document.getElementById('helm-approvals-table-head');
  const tbody = document.getElementById('helm-approvals-table-body');
  if (!thead || !tbody) return;

  thead.innerHTML = `<tr>
    <th>Request ID</th>
    <th>Request Type</th>
    <th>Requested By</th>
    <th>Status</th>
    <th>Request Date</th>
  </tr>`;

  const start = (HELM.approvalsPage - 1) * HELM.pageSize;
  const pageData = HELM.filteredApprovals.slice(start, start + HELM.pageSize);

  if (pageData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--fg-muted);">No requests found</td></tr>';
    helmRenderApprovalsPagination();
    return;
  }

  tbody.innerHTML = pageData.map(t => {
    const approvalStatus = t.approval_status || 'Pending';
    const statusColor = HELM_APPROVAL_COLORS[approvalStatus] || 'var(--fg-muted)';
    const createdStr = t.created_at ? new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

    return `<tr class="data-row" onclick="helmOpenApprovalDetail('${escapeAttr(t.task_id)}')">
      <td><span style="font-family:monospace;font-size:12px;color:var(--primary);">${escapeHtml(t.task_id)}</span></td>
      <td><span style="font-weight:500;">${escapeHtml(helmExtractRequestType(t.title))}</span></td>
      <td>${escapeHtml(t.assigned_by_name || '—')}</td>
      <td><span style="color:${statusColor};font-weight:600;font-size:12px;">${escapeHtml(approvalStatus)}</span></td>
      <td>${createdStr}</td>
    </tr>`;
  }).join('');

  helmRenderApprovalsPagination();
}

function helmRenderApprovalsPagination() {
  const el = document.getElementById('helm-approvals-pagination');
  if (!el) return;
  const total = HELM.filteredApprovals.length;
  const totalPages = Math.ceil(total / HELM.pageSize) || 1;
  const start = (HELM.approvalsPage - 1) * HELM.pageSize + 1;
  const end = Math.min(HELM.approvalsPage * HELM.pageSize, total);

  el.innerHTML = `
    <span class="pagination-info">${total > 0 ? start + '–' + end + ' of ' + total : '0 requests'}</span>
    <div class="pagination-btns">
      <button class="btn btn-outline btn-xs" ${HELM.approvalsPage <= 1 ? 'disabled' : ''} onclick="HELM.approvalsPage--;helmRenderApprovalsTable();">Prev</button>
      <span class="pagination-page">${HELM.approvalsPage} / ${totalPages}</span>
      <button class="btn btn-outline btn-xs" ${HELM.approvalsPage >= totalPages ? 'disabled' : ''} onclick="HELM.approvalsPage++;helmRenderApprovalsTable();">Next</button>
    </div>
  `;
}

// ===== Approval Detail View =====

function helmOpenApprovalDetail(taskId) {
  const task = HELM.tasks.find(t => t.task_id === taskId);
  if (!task) return;
  HELM.editingId = taskId;

  const formTitle = document.getElementById('helm-form-title');
  const formBody = document.getElementById('helm-form-body');
  const formFooter = document.getElementById('helm-form-footer');
  const overlay = document.getElementById('helm-form-overlay');

  const approvalStatus = task.approval_status || 'Pending';
  const statusColor = HELM_APPROVAL_COLORS[approvalStatus] || 'var(--fg-muted)';
  const createdStr = task.created_at ? new Date(task.created_at).toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '—';

  formTitle.innerHTML = `<span>${escapeHtml(task.task_id)}</span>`;

  let html = '<div class="detail-section"><h4 class="detail-section-title" style="font-size:13px;text-transform:uppercase;letter-spacing:1px;color:var(--fg-muted);border-bottom:2px solid var(--primary);padding-bottom:6px;margin-bottom:12px;">Request Details</h4>';
  html += `<div class="detail-row"><span class="detail-label">Request Type</span><span class="detail-value" style="font-weight:600;">${escapeHtml(helmExtractRequestType(task.title))}</span></div>`;
  html += `<div class="detail-row"><span class="detail-label">Approval Status</span><span class="detail-value"><span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:50%;background:${statusColor};display:inline-block;"></span><strong style="color:${statusColor};">${escapeHtml(approvalStatus)}</strong></span></span></div>`;
  html += `<div class="detail-row"><span class="detail-label">Requested By</span><span class="detail-value">${escapeHtml(task.assigned_by_name || '—')}</span></div>`;

  // Parse description for Attendance Backdated Change Tag specific fields
  if (task.request_type === 'attendance_backdated_change_tag' && task.description) {
    const descLines = task.description.split('\n');
    let agentName = '—', dateChanged = '—', prevTag = '—', newTag = '—';
    for (const line of descLines) {
      if (line.startsWith('Agent:')) agentName = line.replace('Agent:', '').trim().replace(/\s*\(\d+\)$/, '');
      if (line.startsWith('Date:')) dateChanged = line.replace('Date:', '').trim();
      if (line.startsWith('Previous Tag:')) prevTag = line.replace('Previous Tag:', '').trim();
      if (line.startsWith('New Tag:')) newTag = line.replace('New Tag:', '').trim();
    }
    html += `<div class="detail-row"><span class="detail-label">Employee</span><span class="detail-value" style="font-weight:600;">${escapeHtml(agentName)}</span></div>`;
    html += `<div class="detail-row"><span class="detail-label">Date Changed</span><span class="detail-value">${escapeHtml(dateChanged)}</span></div>`;
    html += `<div class="detail-row"><span class="detail-label">Tag Change</span><span class="detail-value"><span style="background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:4px;font-weight:600;font-size:12px;">${escapeHtml(prevTag)}</span> <span style="color:var(--fg-muted);margin:0 4px;">→</span> <span style="background:#dcfce7;color:#16a34a;padding:2px 8px;border-radius:4px;font-weight:600;font-size:12px;">${escapeHtml(newTag)}</span></span></div>`;
  }

  html += `<div class="detail-row"><span class="detail-label">Request Date</span><span class="detail-value">${createdStr}</span></div>`;
  html += '</div>';

  // Comments section
  html += '<div class="detail-section" style="margin-top:16px;"><h4 class="detail-section-title" style="font-size:13px;text-transform:uppercase;letter-spacing:1px;color:var(--fg-muted);border-bottom:2px solid var(--primary);padding-bottom:6px;margin-bottom:12px;">Comments</h4>';
  html += '<div id="helm-comments-list" style="margin-bottom:12px;"><div style="text-align:center;padding:12px;color:var(--fg-muted);font-size:12px;">Loading comments...</div></div>';
  html += `<div style="display:flex;gap:8px;align-items:flex-start;">
    <textarea class="form-input" id="helm-comment-input" rows="2" placeholder="Add a comment..." style="flex:1;resize:vertical;font-size:13px;"></textarea>
    <button class="btn btn-primary btn-sm" onclick="helmSubmitComment()" style="white-space:nowrap;">Post</button>
  </div>`;
  html += '</div>';

  formBody.innerHTML = html;

  // Footer: Approve/Reject buttons if Pending
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  let footerHtml = '';
  if (approvalStatus === 'Pending') {
    footerHtml += `<button class="btn btn-sm" style="background:#22C55E;color:#fff;border:none;" onclick="helmApproveRequest('${escapeAttr(taskId)}','Approved')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><polyline points="20 6 9 17 4 12"/></svg>
      Approve
    </button>`;
    footerHtml += ` <button class="btn btn-sm" style="background:#EF4444;color:#fff;border:none;" onclick="helmApproveRequest('${escapeAttr(taskId)}','Rejected')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      Reject
    </button>`;
  }
  formFooter.innerHTML = footerHtml;

  overlay.style.display = 'flex';
  helmLoadComments(taskId);
}

async function helmApproveRequest(taskId, decision) {
  try {
    const task = HELM.tasks.find(t => t.task_id === taskId);
    if (!task) throw new Error('Task not found');

    // Update the task's approval status (keep status as Open so it stays visible)
    const resp = await fetch(`${IO_API_BASE}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        approval_status: decision,
        completed_date: new Date().toISOString()
      })
    });
    if (!resp.ok) throw new Error('Failed to update request status');

    // If Approved, apply the new tag to the attendance record
    if (decision === 'Approved') {
      await helmApplyApprovedTagChange(task);
    }
    // If Rejected, do nothing to attendance — old tag is retained

    showToast(`Request ${decision.toLowerCase()} successfully`, 'success');
    helmCloseForm();
    await helmFetchTasks();
    helmApplyApprovalsFilters();
  } catch (e) {
    showToast('Failed to update request: ' + e.message, 'error');
  }
}

/**
 * Apply the approved tag change to the attendance record.
 * Parses the description to extract agent OHR, date, and new tag.
 */
async function helmApplyApprovedTagChange(task) {
  const desc = task.description || '';
  // Extract agent OHR from description: "Agent: Name (OHR)"
  const ohrMatch = desc.match(/Agent:.*?\((\d+)\)/);
  // Extract date from description: "Date: Wed, Apr 1, 2026" or similar
  const dateMatch = desc.match(/Date:\s*(.+?)\n/);
  // Extract new tag from description: "New Tag: LATE"
  const tagMatch = desc.match(/New Tag:\s*(.+?)\n/);

  if (!ohrMatch || !dateMatch || !tagMatch) {
    console.warn('Could not parse request description for tag change:', desc);
    return;
  }

  const agentOhr = ohrMatch[1];
  const newTag = tagMatch[1].trim();
  const dateStr = dateMatch[1].trim();

  // Parse the date string to YYYY-MM-DD format
  const parsedDate = new Date(dateStr);
  if (isNaN(parsedDate.getTime())) {
    console.warn('Could not parse date:', dateStr);
    return;
  }
  const logDate = parsedDate.toISOString().slice(0, 10);

  // Find the attendance record for this agent and date
  const searchResp = await fetch(`${IO_API_BASE}/attendance?ohr_id=${agentOhr}&log_date=${logDate}&limit=1`);
  if (!searchResp.ok) {
    console.warn('Could not find attendance record');
    return;
  }
  const records = await searchResp.json();
  const rows = records.data || records;
  if (!Array.isArray(rows) || rows.length === 0) {
    console.warn('No attendance record found for', agentOhr, logDate);
    return;
  }

  const record = rows[0];
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;

  // Update the attendance record's tag
  const updateResp = await fetch(`${IO_API_BASE}/attendance/${record.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-actor-ohr': cu ? cu.ohr_id : '',
      'x-actor-name': cu ? cu.full_name : 'System'
    },
    body: JSON.stringify({ tag: newTag })
  });

  if (!updateResp.ok) {
    const errData = await updateResp.json().catch(() => ({}));
    console.warn('Failed to update attendance tag:', errData.error || 'Unknown error');
    showToast('Approved but could not update attendance tag: ' + (errData.error || 'Unknown error'), 'warning');
  }
}
