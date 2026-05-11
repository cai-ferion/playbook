/**
 * Helm — Task Assigning, Tracking & Cross-Module Execution
 * Task Board — create, browse, and manage tasks
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

  // Role-based nav visibility for Task Dashboard (TL/Manager/Admin only)
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  const isAgent = cu && cu.actual_role === 'Agent' && (window.ADMIN_OHRS || []).indexOf(cu.ohr_id) === -1;
  const dashNav = document.getElementById('nav-helm-dashboard');
  if (dashNav) dashNav.style.display = isAgent ? 'none' : '';

  if (view === 'helm-dashboard') {
    if (typeof initHelmDashboard === 'function') initHelmDashboard();
    return;
  }

  await helmFetchTasks();
  // Fetch shift extension data for Approvals tab
  if (typeof seFetchData === 'function') await seFetchData();
  helmApplyFilters();
  helmApplyReceivedFilters();
  helmApplyApprovalsFilters();
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

  // Also fetch group tasks for Tasks Given tab
  if (typeof gtFetchGroupTasks === 'function') await gtFetchGroupTasks();
  if (typeof gtFetchMyGroupTasks === 'function') await gtFetchMyGroupTasks();



  if (boardLoading) boardLoading.style.display = 'none';
  if (boardContent) boardContent.style.display = '';

  // Role-based tab visibility
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  const isAgent = cu && cu.actual_role === 'Agent' && (window.ADMIN_OHRS || []).indexOf(cu.ohr_id) === -1;
  const isSM = cu && cu.ohr_id === '703212987';
  const newTaskBtn = document.getElementById('helm-new-btn');
  if (newTaskBtn) newTaskBtn.style.display = isAgent ? 'none' : '';

  // Hide tab buttons based on role
  const givenTabBtn = document.querySelector('#helm-board-tabs [data-board-tab="given"]');
  const receivedTabBtn = document.querySelector('#helm-board-tabs [data-board-tab="received"]');
  const approvalsTabBtn = document.querySelector('#helm-board-tabs [data-board-tab="approvals"]');
  if (givenTabBtn) givenTabBtn.style.display = isAgent ? 'none' : '';
  if (receivedTabBtn) receivedTabBtn.style.display = isSM ? 'none' : '';
  if (approvalsTabBtn) approvalsTabBtn.style.display = ''; // visible to all roles (includes shift extensions now)

  // Set initial active tab based on role
  let initialTab = 'given';
  if (isAgent) initialTab = 'received';
  else if (isSM) initialTab = 'given';
  helmSwitchBoardTab(initialTab);
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

// Shared filter dispatcher — calls the right filter function for the active tab
function helmApplyActiveTabFilters() {
  const tab = HELM.currentBoardTab || 'given';
  if (tab === 'given') helmApplyFilters();
  else if (tab === 'received') helmApplyReceivedFilters();
  else if (tab === 'approvals') helmApplyApprovalsFilters();
}

// ===== Board Tab Switcher (Tabbed layout) =====

function helmSwitchBoardTab(tab) {
  HELM.currentBoardTab = tab;
  // Toggle tab button active state
  document.querySelectorAll('#helm-board-tabs .helm-board-tab').forEach(btn => {
    const isActive = btn.dataset.boardTab === tab;
    btn.classList.toggle('active', isActive);
    btn.style.borderBottomColor = isActive ? 'var(--primary)' : 'transparent';
    btn.style.color = isActive ? 'var(--primary)' : 'var(--fg-muted)';
  });
  // Show/hide panels
  const tasksPanel = document.getElementById('helm-tab-tasks');
  const receivedPanel = document.getElementById('helm-tab-received');
  const approvalsPanel = document.getElementById('helm-tab-approvals');
  if (tasksPanel) tasksPanel.style.display = (tab === 'given') ? 'block' : 'none';
  if (receivedPanel) receivedPanel.style.display = (tab === 'received') ? 'block' : 'none';
  if (approvalsPanel) approvalsPanel.style.display = (tab === 'approvals') ? 'block' : 'none';
  // Reset page-level filter to 'All' when switching tabs
  const statusSel = document.getElementById('helm-filter-status');
  if (statusSel) statusSel.value = 'All';
  const searchInput = document.getElementById('helm-search');
  if (searchInput) searchInput.value = '';
  // Apply filters for the active tab
  helmApplyActiveTabFilters();
}

function helmApplyFilters() {
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  // Individual tasks where current user is the creator
  let singleTasks = HELM.tasks.filter(t => t.record_type !== 'request');
  if (cu && cu.ohr_id) {
    singleTasks = singleTasks.filter(t => (t.assigned_by_ohr || '').trim() === cu.ohr_id.trim());
  } else {
    singleTasks = [];
  }

  // Map individual tasks to unified format
  const singles = singleTasks.map(t => ({
    ...t,
    _taskType: 'Single',
    _completionRate: null,
    _assignedTo: t.assigned_to_name || '\u2014',
    _sortDate: t.due_date || t.created_at || '9999',
  }));

  // Group tasks created by current user
  const groups = (typeof GT !== 'undefined' && GT.groupTasks ? GT.groupTasks : []).filter(g => {
    if (!cu || !cu.ohr_id) return false;
    return (g.created_by_ohr || '').trim() === cu.ohr_id.trim();
  }).map(g => ({
    task_id: g.task_id,
    title: g.title,
    status: g.status,
    due_date: g.due_date,
    created_at: g.created_at,
    _taskType: 'Group',
    _completionRate: g.completion_pct != null ? g.completion_pct : null,
    _assignedTo: null,
    _sortDate: g.due_date || g.created_at || '9999',
    _groupTaskId: g.id,
  }));

  let merged = [...singles, ...groups];

  // Page-level status filter
  const statusFilter = document.getElementById('helm-filter-status')?.value || 'All';
  if (statusFilter !== 'All') {
    merged = merged.filter(t => t.status === statusFilter);
  }

  // Page-level search
  const search = (document.getElementById('helm-search')?.value || '').toLowerCase().trim();
  if (search) {
    merged = merged.filter(t =>
      (t.title || '').toLowerCase().includes(search) ||
      (t.task_id || '').toLowerCase().includes(search) ||
      (t._assignedTo || '').toLowerCase().includes(search)
    );
  }

  // Sort by due date
  merged.sort((a, b) => (a._sortDate || '').localeCompare(b._sortDate || ''));

  HELM.filtered = merged;
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
    <th>Task Type</th>
    <th>Completion Rate</th>
    <th>Assigned To</th>
    <th>Due Date</th>
  </tr>`;

  const start = (HELM.page - 1) * HELM.pageSize;
  const pageData = HELM.filtered.slice(start, start + HELM.pageSize);

  if (pageData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="mascot-empty-state"><div class="sprite-mascot" role="img" aria-label="No data"></div><div class="empty-title">No tasks found</div><div class="empty-subtitle">Create a new task or adjust filters</div></div></td></tr>';
    helmRenderPagination();
    return;
  }

  tbody.innerHTML = pageData.map(t => {
    const isGroup = t._taskType === 'Group';
    const isOverdue = t.due_date && t.status !== 'Completed' && t.status !== 'Cancelled' && t.status !== 'Closed' && new Date(t.due_date) < new Date();
    const dueStr = t.due_date ? new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '\u2014';

    const typeBadge = isGroup
      ? '<span style="background:#7C3AED22;color:#7C3AED;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">Group</span>'
      : '<span style="background:#3B82F622;color:#3B82F6;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">Single</span>';

    // Completion Rate: show progress bar for group tasks only
    let completionHtml = '\u2014';
    if (isGroup && t._completionRate != null) {
      const pct = t._completionRate;
      const barColor = pct >= 100 ? '#22C55E' : pct >= 50 ? '#3B82F6' : '#F59E0B';
      completionHtml = `<div style="display:flex;align-items:center;gap:6px;"><div style="flex:1;height:6px;background:#e5e7eb;border-radius:3px;min-width:60px;"><div style="height:100%;width:${pct}%;background:${barColor};border-radius:3px;"></div></div><span style="font-size:11px;font-weight:600;min-width:32px;">${pct}%</span></div>`;
    }

    // Assigned To: show only for single tasks
    const assignedToHtml = isGroup ? '\u2014' : escapeHtml(t._assignedTo || '\u2014');

    // Click handlers disabled per user request — no modal on Tasks Given rows

    return `<tr class="data-row">
      <td><span style="font-family:monospace;font-size:12px;color:var(--primary);">${escapeHtml(t.task_id)}</span></td>
      <td><span style="font-weight:500;">${escapeHtml(t.title || '\u2014')}</span></td>
      <td>${typeBadge}</td>
      <td>${completionHtml}</td>
      <td>${assignedToHtml}</td>
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

  // Tasks Received: EVERYONE sees only tasks where they are in "Assigned To"
  if (cu && cu.ohr_id) {
    const myOhr = cu.ohr_id.trim();
    data = data.filter(t => {
      const assignedOhrs = (t.assigned_to_ohr || '').split(',').map(s => s.trim()).filter(Boolean);
      return assignedOhrs.includes(myOhr);
    });
  } else {
    data = [];
  }

  // Page-level status filter
  const statusFilter = document.getElementById('helm-filter-status')?.value || 'All';
  if (statusFilter !== 'All') {
    data = data.filter(t => t.status === statusFilter);
  }

  // Page-level search
  const search = (document.getElementById('helm-search')?.value || '').toLowerCase().trim();
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
    tbody.innerHTML = '<tr><td colspan="4"><div class="mascot-empty-state"><div class="sprite-mascot" role="img" aria-label="No data"></div><div class="empty-title">No tasks found</div><div class="empty-subtitle">Create a new task or adjust filters</div></div></td></tr>';
    helmRenderReceivedPagination();
    return;
  }

  tbody.innerHTML = pageData.map(t => {
    const statusColor = HELM.STATUS_COLORS[t.status] || 'var(--fg-muted)';
    const isOverdue = t.due_date && t.status !== 'Completed' && t.status !== 'Cancelled' && new Date(t.due_date) < new Date();
    const dueStr = t.due_date ? new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '\u2014';

    return `<tr class="data-row">
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
          <input type="text" class="form-input" id="helm-assignee-search" placeholder="Search and select employees..." autocomplete="off" onclick="helmToggleAssigneeDropdown(true)" oninput="_helmFilterAssigneesDebounced()" style="width:100%;">
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

var _helmAssigneeDebounce = null;
function _helmFilterAssigneesDebounced() {
  clearTimeout(_helmAssigneeDebounce);
  _helmAssigneeDebounce = setTimeout(helmFilterAssignees, 150);
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



  // Attachments (supports both legacy single URL and JSON array of {name,url})
  const rawAttach = task.attachment_url || task.attachments || '';
  if (rawAttach) {
    let atts = [];
    try {
      const parsed = JSON.parse(rawAttach);
      if (Array.isArray(parsed)) atts = parsed;
    } catch (e) {
      // Legacy plain URL
      if (rawAttach.startsWith('http')) atts = [{ name: 'Attachment', url: rawAttach }];
    }
    if (atts.length > 0) {
      html += '<div class="detail-row"><span class="detail-label">Attachments</span><span class="detail-value" style="display:flex;flex-direction:column;gap:4px;">';
      atts.forEach(a => {
        html += `<a href="${escapeAttr(a.url)}" target="_blank" download="${escapeAttr(a.name)}" style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--primary);text-decoration:none;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          ${escapeHtml(a.name)}
        </a>`;
      });
      html += '</span></div>';
    }
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
      footerHtml += `<button class="btn btn-success btn-sm" onclick="helmUpdateStatus('${escapeAttr(taskId)}','Completed')">Mark as Complete</button>`;
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
  const task = HELM.tasks.find(t => t.task_id === taskId);
  if (task && task.version) update.version = task.version;

  try {
    const resp = await fetchWithConflictHandling(`${IO_API_BASE}/tasks/${taskId}`, {
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



// ===== New Request Form =====

const HELM_REQUEST_TYPES = [
  { value: 'attendance_backdated_change_tag', label: 'I want to change an already locked tag on a previous date.' },
  { value: 'shift_extension', label: 'I want to extend my time to complete my production hours' }
];

var _helmRequestSelectedAgent = null;

async function helmShowNewRequestForm() {
  const formTitle = document.getElementById('helm-form-title');
  const formBody = document.getElementById('helm-form-body');
  const formFooter = document.getElementById('helm-form-footer');
  const overlay = document.getElementById('helm-form-overlay');

  HELM.editingId = null;
  _helmRequestSelectedAgent = null;

  const reqId = 'REQ-' + Date.now().toString(36).toUpperCase();
  HELM._pendingReqId = reqId;
  formTitle.textContent = reqId;

  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  const isAgent = cu && cu.actual_role === 'Agent' && (window.ADMIN_OHRS || []).indexOf(cu.ohr_id) === -1;

  // Filter request types by role: agents can only see shift_extension
  const availableTypes = isAgent
    ? HELM_REQUEST_TYPES.filter(t => t.value === 'shift_extension')
    : HELM_REQUEST_TYPES;
  if (availableTypes.length === 0) {
    showToast('No request types available for your role', 'info');
    return;
  }

  const typeOptions = availableTypes.map(t =>
    `<option value="${escapeAttr(t.value)}">${escapeHtml(t.label)}</option>`
  ).join('');

  const employeeOptions = HELM.employees.map(e =>
    `<div class="searchable-select-option" data-ohr="${escapeAttr(e.ohr_id)}" data-name="${escapeAttr(e.full_name)}" onclick="helmSelectRequestAgent('${escapeAttr(e.ohr_id)}','${escapeAttr(e.full_name)}')">${escapeHtml(e.full_name)} (${escapeHtml(e.ohr_id)})</div>`
  ).join('');

  formBody.innerHTML = `
    <div class="form-section">
      <div class="form-field">
        <label class="form-label">Request Type <span class="required">*</span></label>
        <select class="form-input" id="helm-req-type" onchange="helmOnRequestTypeChange()" style="width:100%;">
          ${typeOptions}
        </select>
      </div>

      <!-- Shift Extension fields -->
      <div id="helm-req-shift-ext-fields" style="display:none;">
        <div class="form-field">
          <label class="form-label">Shift Date <span class="required">*</span></label>
          <input type="date" class="form-input" id="helm-req-se-date" style="max-width:220px;">
        </div>
        <div class="form-field">
          <label class="form-label">Extension (minutes) <span class="required">*</span></label>
          <input type="number" class="form-input" id="helm-req-se-minutes" min="1" max="480" placeholder="e.g. 60" style="max-width:180px;">
        </div>
        <div class="form-field">
          <label class="form-label">Reason Details <span class="required">*</span></label>
          <textarea class="form-textarea" id="helm-req-se-reason" rows="4" placeholder="Explain why you need to extend your shift..." style="width:100%;resize:vertical;"></textarea>
        </div>
      </div>

      <!-- Attendance Backdated Change Tag fields -->
      <div id="helm-req-attendance-fields">
        <div class="form-field">
          <label class="form-label">Date <span class="required">*</span></label>
          <input type="date" class="form-input" id="helm-req-date" style="max-width:220px;" onchange="helmUpdateCurrentTag()">
        </div>
        <div class="form-field">
          <label class="form-label">Name <span class="required">*</span></label>
          <div id="helm-req-agent-chip" style="margin-bottom:6px;"></div>
          <div class="searchable-select" id="helm-req-agent-wrapper">
            <input type="text" class="form-input" id="helm-req-agent-search" placeholder="Search for an employee..." autocomplete="off" onclick="helmToggleRequestAgentDropdown(true)" oninput="_helmFilterRequestAgentsDebounced()" style="max-width:320px;">
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

  // Auto-trigger type change so correct fields show (especially for agents who only see shift_extension)
  helmOnRequestTypeChange();
}

function helmOnRequestTypeChange() {
  const type = document.getElementById('helm-req-type')?.value || '';
  const attendanceFields = document.getElementById('helm-req-attendance-fields');
  const shiftExtFields = document.getElementById('helm-req-shift-ext-fields');
  if (attendanceFields) {
    attendanceFields.style.display = (type === 'attendance_backdated_change_tag') ? '' : 'none';
  }
  if (shiftExtFields) {
    shiftExtFields.style.display = (type === 'shift_extension') ? '' : 'none';
  }
}

function helmToggleRequestAgentDropdown(show) {
  const dd = document.getElementById('helm-req-agent-dropdown');
  if (dd) dd.style.display = show ? '' : 'none';
}

var _helmReqAgentDebounce = null;
function _helmFilterRequestAgentsDebounced() {
  clearTimeout(_helmReqAgentDebounce);
  _helmReqAgentDebounce = setTimeout(helmFilterRequestAgents, 150);
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

      helmCloseForm();
      await helmFetchTasks();
      helmSwitchBoardTab('approvals');
    } catch (e) {
      showToast('Failed to submit request: ' + e.message, 'error');
    }
  } else if (reqType === 'shift_extension') {
    const shiftDate = document.getElementById('helm-req-se-date')?.value || '';
    const minutes = parseInt(document.getElementById('helm-req-se-minutes')?.value || '0');
    const reasonDetails = (document.getElementById('helm-req-se-reason')?.value || '').trim();

    if (!shiftDate) { showToast('Please select the shift date', 'error'); return; }
    if (!minutes || minutes <= 0) { showToast('Please enter the extension in minutes', 'error'); return; }
    if (!reasonDetails) { showToast('Please provide reason details', 'error'); return; }

    // Resolve agent info (self for agents, or selected agent for TLs)
    const agentOhr = cu ? cu.ohr_id : '';
    const agentName = cu ? cu.full_name : '';
    const agentEmp = HELM.employees.find(e => (e.ohr_id || '').trim() === agentOhr.trim());
    const supervisorName = agentEmp ? (agentEmp.supervisor_name || '') : '';
    let supervisorOhr = '';
    if (supervisorName) {
      const supEmp = HELM.employees.find(e => e.full_name === supervisorName);
      if (supEmp) supervisorOhr = supEmp.ohr_id;
    }
    const planningGroup = agentEmp ? (agentEmp.planning_group || '') : '';

    try {
      const resp = await fetch(`${IO_API_BASE}/shift-extensions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_ohr: agentOhr,
          agent_name: agentName,
          supervisor_ohr: supervisorOhr,
          supervisor_name: supervisorName,
          planning_group: planningGroup,
          shift_date: shiftDate,
          extension_minutes: minutes,
          reason_details: reasonDetails
        })
      });
      if (!resp.ok) throw new Error('Failed to submit shift extension request');
      showToast('Shift extension request submitted successfully', 'success');
      helmCloseForm();
      // Switch to shift extensions tab to see the new request
      if (typeof seFetchData === 'function') await seFetchData();
      helmSwitchBoardTab('shift-ext');
    } catch (e) {
      showToast('Failed to submit: ' + e.message, 'error');
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
  'FLM Approved': '#3B82F6',
  'OM Approved': '#22C55E',
  'Rejected': '#EF4444'
};

function helmApplyApprovalsFilters() {
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  const role = cu ? cu.actual_role : '';
  const myOhr = cu ? (cu.ohr_id || '').trim() : '';
  const isManager = role === 'Manager' || (window.ADMIN_OHRS || []).includes(myOhr);
  const isTL = role === 'Team Leader';
  const isAgent = cu && cu.actual_role === 'Agent' && !(window.ADMIN_OHRS || []).includes(myOhr);

  // 1. Task-based requests (e.g., Attendance Backdated Change Tag)
  let taskRequests = HELM.tasks.filter(t => t.record_type === 'request');

  // Role-based visibility for task requests:
  if (isManager) {
    // No filtering — see everything
  } else if (isTL && cu) {
    const teamOhrs = new Set(HELM.employees.filter(e => (e.supervisor_ohr || '').trim() === myOhr).map(e => (e.ohr_id || '').trim()));
    teamOhrs.add(myOhr);
    taskRequests = taskRequests.filter(t => {
      const submitterOhr = (t.assigned_by_ohr || '').trim();
      if (teamOhrs.has(submitterOhr)) return true;
      if (t.description && [...teamOhrs].some(ohr => t.description.includes(ohr))) return true;
      return false;
    });
  } else if (cu) {
    taskRequests = taskRequests.filter(t => {
      if ((t.assigned_by_ohr || '').trim() === myOhr) return true;
      if (t.description && t.description.includes(myOhr)) return true;
      return false;
    });
  } else {
    taskRequests = [];
  }

  // 2. Shift Extension requests — normalize into approvals shape
  let seRequests = [];
  if (typeof SE !== 'undefined' && SE.data && SE.data.length > 0) {
    let seRows = SE.data;
    // Role-based visibility for shift extensions:
    // Agents: only their own
    // TLs: their direct reports
    // Managers/Admin: all
    if (isAgent) {
      seRows = seRows.filter(r => r.agent_ohr === myOhr);
    } else if (isTL) {
      seRows = seRows.filter(r => r.supervisor_ohr === myOhr || r.agent_ohr === myOhr);
    }
    // Map SE status to approval status: Pending TL → Pending, Pending OM → FLM Approved, Approved → OM Approved, Rejected → Rejected
    seRequests = seRows.map(r => {
      let approvalStatus = 'Pending';
      if (r.overall_status === 'Pending TL') approvalStatus = 'Pending';
      else if (r.overall_status === 'Pending OM') approvalStatus = 'FLM Approved';
      else if (r.overall_status === 'Approved') approvalStatus = 'OM Approved';
      else if (r.overall_status === 'Rejected') approvalStatus = 'Rejected';
      return {
        task_id: 'SE-' + r.id,
        title: 'Shift Extension',
        request_type: 'shift_extension',
        assigned_by_name: r.agent_name || '—',
        assigned_by_ohr: r.agent_ohr || '',
        approval_status: approvalStatus,
        created_at: r.created_at,
        _seId: r.id,
        _isShiftExt: true
      };
    });
  }

  let data = [...taskRequests, ...seRequests];

  // Sort by created_at descending (newest first)
  data.sort((a, b) => {
    const da = a.created_at ? new Date(a.created_at).getTime() : 0;
    const db = b.created_at ? new Date(b.created_at).getTime() : 0;
    return db - da;
  });

  // Page-level status filter
  const statusFilter = document.getElementById('helm-filter-status')?.value || 'All';
  if (statusFilter !== 'All') {
    data = data.filter(t => (t.approval_status || 'Pending') === statusFilter);
  }

  // Page-level search
  const search = (document.getElementById('helm-search')?.value || '').toLowerCase().trim();
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
  const flmApproved = HELM.filteredApprovals.filter(t => t.approval_status === 'FLM Approved').length;
  const omApproved = HELM.filteredApprovals.filter(t => t.approval_status === 'OM Approved' || t.approval_status === 'Approved').length;
  const rejected = HELM.filteredApprovals.filter(t => t.approval_status === 'Rejected').length;

  el.innerHTML = `
    <div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">Total</div></div>
    <div class="stat-card"><div class="stat-value" style="color:${HELM_APPROVAL_COLORS['Pending']}">${pending}</div><div class="stat-label">Pending</div></div>
    <div class="stat-card"><div class="stat-value" style="color:${HELM_APPROVAL_COLORS['FLM Approved']}">${flmApproved}</div><div class="stat-label">FLM Approved</div></div>
    <div class="stat-card"><div class="stat-value" style="color:${HELM_APPROVAL_COLORS['OM Approved']}">${omApproved}</div><div class="stat-label">OM Approved</div></div>
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
    tbody.innerHTML = '<tr><td colspan="5"><div class="mascot-empty-state"><div class="sprite-mascot" role="img" aria-label="No data"></div><div class="empty-title">No requests found</div><div class="empty-subtitle">Try adjusting the filters</div></div></td></tr>';
    helmRenderApprovalsPagination();
    return;
  }

  tbody.innerHTML = pageData.map(t => {
    const approvalStatus = t.approval_status || 'Pending';
    const statusColor = HELM_APPROVAL_COLORS[approvalStatus] || 'var(--fg-muted)';
    const dateVal = t.created_at || (t._otData && t._otData.submitted_at) || '';
    const createdStr = dateVal ? new Date(dateVal).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

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
  // Check if this is a shift extension item
  if (taskId.startsWith('SE-')) {
    const seId = parseInt(taskId.replace('SE-', ''), 10);
    if (typeof seShowDetail === 'function') seShowDetail(seId);
    return;
  }
  // Search in both tasks and filteredApprovals (which includes OT requests)
  let task = HELM.tasks.find(t => t.task_id === taskId);
  if (!task) {
    task = HELM.filteredApprovals.find(t => t.task_id === taskId);
  }
  if (!task) return;
  HELM.editingId = taskId;

  const formTitle = document.getElementById('helm-form-title');
  const formBody = document.getElementById('helm-form-body');
  const formFooter = document.getElementById('helm-form-footer');
  const overlay = document.getElementById('helm-form-overlay');

  const approvalStatus = task.approval_status || 'Pending';
  const statusColor = HELM_APPROVAL_COLORS[approvalStatus] || 'var(--fg-muted)';
  const detailDateVal = task.created_at || (task._otData && task._otData.submitted_at) || '';
  const createdStr = detailDateVal ? new Date(detailDateVal).toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '—';

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

  // Comments section — hidden for agents
  const _cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  const _isAgentView = _cu && _cu.actual_role === 'Agent' && _(window.ADMIN_OHRS || []).indexOf(cu.ohr_id) === -1;
  if (!_isAgentView) {
    html += '<div class="detail-section" style="margin-top:16px;"><h4 class="detail-section-title" style="font-size:13px;text-transform:uppercase;letter-spacing:1px;color:var(--fg-muted);border-bottom:2px solid var(--primary);padding-bottom:6px;margin-bottom:12px;">Comments</h4>';
    html += '<div id="helm-comments-list" style="margin-bottom:12px;"><div style="text-align:center;padding:12px;color:var(--fg-muted);font-size:12px;">Loading comments...</div></div>';
    html += `<div style="display:flex;gap:8px;align-items:flex-start;">
      <textarea class="form-input" id="helm-comment-input" rows="2" placeholder="Add a comment..." style="flex:1;resize:vertical;font-size:13px;"></textarea>
      <button class="btn btn-primary btn-sm" onclick="helmSubmitComment()" style="white-space:nowrap;">Post</button>
    </div>`;
    html += '</div>';
  }

  formBody.innerHTML = html;

  // Footer: Approve/Reject buttons if Pending
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  const isAgent = cu && cu.actual_role === 'Agent' && (window.ADMIN_OHRS || []).indexOf(cu.ohr_id) === -1;
  let footerHtml = '';
  if (approvalStatus === 'Pending' && !isAgent) {
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
  // Only load comments if the comments section is shown
  if (!_isAgentView) {
    helmLoadComments(taskId);
  }
}

async function helmApproveRequest(taskId, decision) {
  try {
    const task = HELM.tasks.find(t => t.task_id === taskId);
    if (!task) throw new Error('Task not found');

    // Update the task's approval status (keep status as Open so it stays visible)
    const payload = {
      approval_status: decision,
      completed_date: new Date().toISOString()
    };
    if (task.version) payload.version = task.version;
    const resp = await fetchWithConflictHandling(`${IO_API_BASE}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
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
  const attPayload = { tag: newTag };
  if (record.version) attPayload.version = record.version;
  const updateResp = await fetchWithConflictHandling(`${IO_API_BASE}/attendance/${record.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-actor-ohr': cu ? cu.ohr_id : '',
      'x-actor-name': cu ? cu.full_name : 'System'
    },
    body: JSON.stringify(attPayload)
  });

  if (!updateResp.ok) {
    const errData = await updateResp.json().catch(() => ({}));
    console.warn('Failed to update attendance tag:', errData.error || 'Unknown error');
    showToast('Approved but could not update attendance tag: ' + (errData.error || 'Unknown error'), 'warning');
  }
}
