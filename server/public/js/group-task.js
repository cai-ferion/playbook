/**
 * Group Task — Bulk task assignment wizard, unified task list, completion flow
 * Depends on: helm.js (HELM state), app.js (MultiSelect, showConfirmModal, escapeHtml, escapeAttr, showToast)
 */

const GT = {
  step: 1,
  // Wizard state
  title: '',
  description: '',
  category: '',
  dueDate: '',
  planningGroups: [],
  departments: [],
  roles: [],
  excludedOhrs: [],
  // Preview data
  previewEmployees: [],
  previewCount: 0,
  previewSearch: '',
  // Group tasks list (for admin view)
  groupTasks: [],
  // My group tasks (for unified received tab)
  myGroupTasks: [],

  // Category removed per user request
  PLANNING_GROUPS: ['CS-ABF', 'CSO_CTR', 'FAD_CTR', 'MULTIPLE', 'QPE_CTR', 'RECALL_MEASUREMENT_CTR', 'S-ABF', 'SME_CTR'],
  DEPARTMENTS: ['Ops', 'QTP'],
  ROLES: ['Agent', 'Manager', 'Operational SME', 'Quality & Policy Expert', 'Team Lead', 'Trainer'],

  STATUS_COLORS: {
    'Pending': '#F59E0B',
    'Completed': '#22C55E',
    'Not Applicable': '#9CA3AF'
  }
};

// ===== Wizard: Open / Close / Navigate =====

function helmShowGroupTaskWizard() {
  GT.step = 1;
  GT.title = '';
  GT.description = '';
  GT.category = '';
  GT.dueDate = '';
  GT.planningGroups = [];
  GT.departments = [];
  GT.roles = [];
  GT.excludedOhrs = [];
  GT.previewEmployees = [];
  GT.previewCount = 0;
  GT.previewSearch = '';

  const overlay = document.getElementById('gt-wizard-overlay');
  if (overlay) overlay.style.display = 'flex';
  gtWizardRenderStep();
}

function gtWizardClose() {
  const overlay = document.getElementById('gt-wizard-overlay');
  if (overlay) overlay.style.display = 'none';
}

function gtWizardGoTo(step) {
  // Save current step data before navigating
  gtWizardSaveStepData();
  GT.step = step;
  gtWizardRenderStep();
}

function gtWizardSaveStepData() {
  if (GT.step === 1) {
    GT.title = (document.getElementById('gt-title')?.value || '').trim();
    GT.description = (document.getElementById('gt-desc')?.value || '').trim();
    // Category removed
    GT.dueDate = document.getElementById('gt-due-date')?.value || '';
  }
}

// ===== Step Indicator Update =====

function gtWizardUpdateSteps() {
  document.querySelectorAll('#gt-wizard-steps .gt-step').forEach(el => {
    const s = parseInt(el.dataset.step);
    el.classList.toggle('active', s === GT.step);
    el.classList.toggle('completed', s < GT.step);
  });
}

// ===== Step Rendering =====

function gtWizardRenderStep() {
  gtWizardUpdateSteps();
  const body = document.getElementById('gt-wizard-body');
  const footer = document.getElementById('gt-wizard-footer');
  if (!body || !footer) return;

  if (GT.step === 1) gtRenderStep1(body, footer);
  else if (GT.step === 2) gtRenderStep2(body, footer);
  else if (GT.step === 3) gtRenderStep3(body, footer);
  else if (GT.step === 4) gtRenderStep4(body, footer);
}

// ── Step 1: Task Details ──
function gtRenderStep1(body, footer) {
  body.innerHTML = `
    <div class="form-section" style="padding:20px;">
      <div class="form-field" style="margin-bottom:16px;">
        <label class="form-label">Title <span class="required">*</span></label>
        <input type="text" class="form-input" id="gt-title" value="${escapeAttr(GT.title)}" placeholder="Enter a brief, descriptive title for this task" style="width:100%;">
      </div>
      <div class="form-field" style="margin-bottom:16px;">
        <label class="form-label">Description</label>
        <textarea class="form-textarea" id="gt-desc" rows="5" placeholder="Describe the task in detail..." style="width:100%;resize:vertical;">${escapeHtml(GT.description)}</textarea>
      </div>
      <div class="form-field">
        <label class="form-label">Due Date</label>
        <input type="date" class="form-input" id="gt-due-date" value="${GT.dueDate}" style="width:100%;">
      </div>
    </div>
  `;

  footer.innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="gtWizardClose()">Cancel</button>
    <button class="btn btn-primary btn-sm" onclick="gtWizardGoTo(2)">Next: Filters &rarr;</button>
  `;
}

// ── Step 2: Audience Filters ──
function gtRenderStep2(body, footer) {
  body.innerHTML = `
    <div class="form-section" style="padding:20px;">
      <p style="font-size:13px;color:var(--fg-muted);margin-bottom:16px;">Select which employees should receive this task. Leave a filter on "All" to include everyone in that category.</p>

      <div class="form-field" style="margin-bottom:16px;">
        <label class="form-label">Planning Groups</label>
        <div id="gt-ms-pg" class="multi-select-wrapper" style="max-width:400px;"></div>
      </div>

      <div class="form-field" style="margin-bottom:16px;">
        <label class="form-label">Departments</label>
        <div id="gt-ms-dept" class="multi-select-wrapper" style="max-width:400px;"></div>
      </div>

      <div class="form-field" style="margin-bottom:16px;">
        <label class="form-label">Roles</label>
        <div id="gt-ms-roles" class="multi-select-wrapper" style="max-width:400px;"></div>
      </div>
    </div>
  `;

  // Initialize MultiSelect components
  GT._msPG = new MultiSelect('gt-ms-pg', 'All Planning Groups', () => {
    GT.planningGroups = GT._msPG.getSelected();
  }, { searchable: true });
  GT._msPG.setOptions(GT.PLANNING_GROUPS);
  if (GT.planningGroups.length > 0) {
    GT._msPG.selected = [...GT.planningGroups];
    GT._msPG.noneMode = false;
    GT._msPG.renderTrigger();
  }

  GT._msDept = new MultiSelect('gt-ms-dept', 'All Departments', () => {
    GT.departments = GT._msDept.getSelected();
  });
  GT._msDept.setOptions(GT.DEPARTMENTS);
  if (GT.departments.length > 0) {
    GT._msDept.selected = [...GT.departments];
    GT._msDept.noneMode = false;
    GT._msDept.renderTrigger();
  }

  GT._msRoles = new MultiSelect('gt-ms-roles', 'All Roles', () => {
    GT.roles = GT._msRoles.getSelected();
  }, { searchable: true });
  GT._msRoles.setOptions(GT.ROLES);
  if (GT.roles.length > 0) {
    GT._msRoles.selected = [...GT.roles];
    GT._msRoles.noneMode = false;
    GT._msRoles.renderTrigger();
  }

  footer.innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="gtWizardGoTo(1)">&larr; Back</button>
    <button class="btn btn-primary btn-sm" onclick="gtWizardGoTo(3)">Next: Preview &rarr;</button>
  `;
}

// ── Step 3: Smart Exclusion Preview ──
async function gtRenderStep3(body, footer) {
  body.innerHTML = `<div style="padding:40px;text-align:center;"><div class="sprite-mascot mascot-loader" role="img" aria-label="Loading..."></div><div class="loading-text" style="margin-top:12px;">Calculating target audience...</div></div>`;
  footer.innerHTML = `<button class="btn btn-outline btn-sm" onclick="gtWizardGoTo(2)">&larr; Back</button><span></span>`;

  try {
    const resp = await fetch(`${IO_API_BASE}/group-tasks/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planning_groups: GT.planningGroups.length > 0 ? GT.planningGroups : null,
        departments: GT.departments.length > 0 ? GT.departments : null,
        roles: GT.roles.length > 0 ? GT.roles : null,
        excluded_ohrs: GT.excludedOhrs.length > 0 ? GT.excludedOhrs : null,
      })
    });
    if (!resp.ok) throw new Error('Preview failed');
    const data = await resp.json();
    GT.previewEmployees = data.employees || [];
    GT.previewCount = data.count || 0;
    GT.previewSearch = '';
  } catch (e) {
    console.error('[GT] Preview error:', e);
    GT.previewEmployees = [];
    GT.previewCount = 0;
  }

  gtRenderPreviewContent(body);

  footer.innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="gtWizardGoTo(2)">&larr; Back</button>
    <button class="btn btn-primary btn-sm" onclick="gtWizardGoTo(4)" ${GT.previewCount === 0 ? 'disabled title="No employees matched"' : ''}>Next: Confirm &rarr;</button>
  `;
}

function gtRenderPreviewContent(body) {
  const search = GT.previewSearch.toLowerCase();
  const filtered = search
    ? GT.previewEmployees.filter(e => e.full_name.toLowerCase().includes(search) || e.ohr_id.includes(search))
    : GT.previewEmployees;

  const excludedSet = new Set(GT.excludedOhrs);
  const activeCount = GT.previewEmployees.filter(e => !excludedSet.has(e.ohr_id)).length;

  body.innerHTML = `
    <div style="padding:20px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <div>
          <span style="font-size:28px;font-weight:700;color:var(--primary);">${activeCount}</span>
          <span style="font-size:14px;color:var(--fg-muted);margin-left:6px;">employees will be assigned</span>
          ${GT.excludedOhrs.length > 0 ? `<span style="font-size:12px;color:var(--fg-muted);margin-left:8px;">(${GT.excludedOhrs.length} excluded)</span>` : ''}
        </div>
        <input type="text" class="form-input form-input-sm" placeholder="Search name or OHR..." value="${escapeAttr(GT.previewSearch)}" oninput="GT.previewSearch=this.value;gtRenderPreviewContent(document.getElementById('gt-wizard-body'));" style="max-width:200px;">
      </div>
      <div style="max-height:320px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;">
        <table class="data-table" style="font-size:12px;width:100%;">
          <thead><tr><th style="width:40px;"></th><th>Name</th><th>OHR</th></tr></thead>
          <tbody>
            ${filtered.length === 0 ? '<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--fg-muted);">No employees match</td></tr>' : ''}
            ${filtered.map(e => {
              const isExcluded = excludedSet.has(e.ohr_id);
              return `<tr style="${isExcluded ? 'opacity:0.4;text-decoration:line-through;' : ''}">
                <td style="text-align:center;">
                  <input type="checkbox" ${isExcluded ? '' : 'checked'} onchange="gtToggleExclude('${escapeAttr(e.ohr_id)}', this.checked)" title="${isExcluded ? 'Include' : 'Exclude'} this employee">
                </td>
                <td>${escapeHtml(e.full_name)}</td>
                <td style="font-family:monospace;font-size:11px;">${escapeHtml(e.ohr_id)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function gtToggleExclude(ohr, include) {
  if (include) {
    GT.excludedOhrs = GT.excludedOhrs.filter(o => o !== ohr);
  } else {
    if (!GT.excludedOhrs.includes(ohr)) GT.excludedOhrs.push(ohr);
  }
  gtRenderPreviewContent(document.getElementById('gt-wizard-body'));
  // Update next button state
  const activeCount = GT.previewEmployees.filter(e => !GT.excludedOhrs.includes(e.ohr_id)).length;
  const nextBtn = document.querySelector('#gt-wizard-footer .btn:last-child');
  if (nextBtn) nextBtn.disabled = activeCount === 0;
}

// ── Step 4: Confirm & Create ──
function gtRenderStep4(body, footer) {
  const activeCount = GT.previewEmployees.filter(e => !GT.excludedOhrs.includes(e.ohr_id)).length;
  const pgLabel = GT.planningGroups.length > 0 ? GT.planningGroups.join(', ') : 'All';
  const deptLabel = GT.departments.length > 0 ? GT.departments.join(', ') : 'All';
  const roleLabel = GT.roles.length > 0 ? GT.roles.join(', ') : 'All';

  body.innerHTML = `
    <div style="padding:20px;">
      <div style="background:var(--bg-subtle);border:1px solid var(--border);border-radius:10px;padding:20px;margin-bottom:16px;">
        <h4 style="margin:0 0 12px 0;font-size:15px;color:var(--fg-primary);">Task Summary</h4>
        <table style="width:100%;font-size:13px;line-height:1.8;">
          <tr><td style="color:var(--fg-muted);width:130px;">Title</td><td style="font-weight:600;">${escapeHtml(GT.title)}</td></tr>
          ${GT.description ? `<tr><td style="color:var(--fg-muted);">Description</td><td>${escapeHtml(GT.description)}</td></tr>` : ''}

          ${GT.dueDate ? `<tr><td style="color:var(--fg-muted);">Due Date</td><td>${new Date(GT.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</td></tr>` : ''}
          <tr><td style="color:var(--fg-muted);">Planning Groups</td><td>${escapeHtml(pgLabel)}</td></tr>
          <tr><td style="color:var(--fg-muted);">Departments</td><td>${escapeHtml(deptLabel)}</td></tr>
          <tr><td style="color:var(--fg-muted);">Roles</td><td>${escapeHtml(roleLabel)}</td></tr>
          <tr><td style="color:var(--fg-muted);">Assignments</td><td><span style="font-size:20px;font-weight:700;color:var(--primary);">${activeCount}</span> employees</td></tr>
          ${GT.excludedOhrs.length > 0 ? `<tr><td style="color:var(--fg-muted);">Excluded</td><td>${GT.excludedOhrs.length} employees</td></tr>` : ''}
        </table>
      </div>
      <p style="font-size:12px;color:var(--fg-muted);text-align:center;">Click "Create Group Task" to assign this task to all ${activeCount} employees.</p>
    </div>
  `;

  footer.innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="gtWizardGoTo(3)">&larr; Back</button>
    <button class="btn btn-primary btn-sm" id="gt-confirm-btn" onclick="gtWizardSubmit()" style="font-weight:600;">Create Group Task</button>
  `;
}

// ===== Submit Group Task =====

async function gtWizardSubmit() {
  if (!GT.title) {
    showToast('Title is required', 'error');
    gtWizardGoTo(1);
    return;
  }

  const btn = document.getElementById('gt-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating...'; }

  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;

  try {
    const resp = await fetch(`${IO_API_BASE}/group-tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: GT.title,
        description: GT.description || null,

        planning_groups: GT.planningGroups.length > 0 ? GT.planningGroups : null,
        departments: GT.departments.length > 0 ? GT.departments : null,
        roles: GT.roles.length > 0 ? GT.roles : null,
        excluded_ohrs: GT.excludedOhrs.length > 0 ? GT.excludedOhrs : null,
        due_date: GT.dueDate || null,
        created_by_ohr: cu ? cu.ohr_id : 'unknown',
        created_by_name: cu ? cu.full_name : 'Unknown',
      })
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create group task');
    }

    const result = await resp.json();
    showToast(`Group task created! ${result.assigned_count} employees assigned.`, 'success');
    gtWizardClose();

    // Refresh tasks
    await gtFetchGroupTasks();
    await gtFetchMyGroupTasks();
    // Always re-render received tab and switch to it so the new task is visible
    helmApplyReceivedFilters();
    if (typeof helmSwitchBoardTab === 'function') helmSwitchBoardTab('received');

  } catch (e) {
    console.error('[GT] Submit error:', e);
    showToast('Error: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Create Group Task'; }
  }
}

// ===== Fetch Group Tasks =====

async function gtFetchGroupTasks() {
  try {
    const resp = await fetch(`${IO_API_BASE}/group-tasks`);
    if (!resp.ok) throw new Error('Failed');
    GT.groupTasks = await resp.json();
  } catch (e) {
    GT.groupTasks = [];
  }
}

async function gtFetchMyGroupTasks() {
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  if (!cu || !cu.ohr_id) { GT.myGroupTasks = []; return; }

  try {
    const resp = await fetch(`${IO_API_BASE}/group-tasks/my-tasks?ohr=${encodeURIComponent(cu.ohr_id)}`);
    if (!resp.ok) throw new Error('Failed');
    GT.myGroupTasks = await resp.json();
  } catch (e) {
    GT.myGroupTasks = [];
  }
}

// ===== Unified Received Tab: Merge individual + group tasks =====

// Override helmApplyReceivedFilters to include group tasks
const _originalHelmApplyReceivedFilters = helmApplyReceivedFilters;

helmApplyReceivedFilters = function() {
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;

  // Individual tasks (original logic)
  let data = HELM.tasks.filter(t => t.record_type !== 'request');
  if (cu && cu.ohr_id) {
    const myOhr = cu.ohr_id.trim();
    data = data.filter(t => {
      const assignedOhrs = (t.assigned_to_ohr || '').split(',').map(s => s.trim()).filter(Boolean);
      return assignedOhrs.includes(myOhr);
    });
  } else {
    data = [];
  }

  // Map individual tasks to unified format
  const individualTasks = data.map(t => ({
    ...t,
    _type: 'individual',
    _sortDate: t.due_date || t.created_at || '9999',
    _isPending: t.status === 'Open' || t.status === 'In Progress',
  }));

  // Map group tasks to unified format
  const groupTasks = GT.myGroupTasks.map(g => ({
    task_id: g.task_id,
    title: g.title,
    description: g.description,
    due_date: g.due_date,
    status: g.assignment_status,
    created_at: g.created_at,
    assigned_by_name: g.created_by_name,
    group_task_id: g.group_task_id,
    assignment_id: g.assignment_id,
    completed_at: g.completed_at,
    attachment_url: g.attachment_url,
    _type: 'group',
    _sortDate: g.due_date || g.created_at || '9999',
    _isPending: g.assignment_status === 'Pending',
  }));

  let merged = [...individualTasks, ...groupTasks];

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
      (t.task_id || '').toLowerCase().includes(search)
    );
  }

  // Sort: pending first, then by due date
  merged.sort((a, b) => {
    if (a._isPending && !b._isPending) return -1;
    if (!a._isPending && b._isPending) return 1;
    return (a._sortDate || '').localeCompare(b._sortDate || '');
  });

  HELM.filteredReceived = merged;
  gtRenderUnifiedReceivedTable();
};

function gtRenderUnifiedReceivedTable() {
  const thead = document.getElementById('helm-received-table-head');
  const tbody = document.getElementById('helm-received-table-body');
  if (!thead || !tbody) return;

  thead.innerHTML = `<tr>
    <th>Task ID</th>
    <th>Title</th>
    <th>Task Type</th>
    <th>Created By</th>
    <th>Status</th>
    <th>Due Date</th>
    <th>Completed On</th>
    <th>Attachment</th>
    <th style="width:140px;">Action</th>
  </tr>`;

  const start = (HELM.receivedPage - 1) * HELM.pageSize;
  const pageData = HELM.filteredReceived.slice(start, start + HELM.pageSize);

  if (pageData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9"><div class="mascot-empty-state"><div class="sprite-mascot" role="img" aria-label="No data"></div><div class="empty-title">No tasks found</div><div class="empty-subtitle">You have no assigned tasks</div></div></td></tr>';
    helmRenderReceivedPagination();
    return;
  }

  tbody.innerHTML = pageData.map(t => {
    const isGroup = t._type === 'group';
    const statusColor = isGroup ? (GT.STATUS_COLORS[t.status] || 'var(--fg-muted)') : (HELM.STATUS_COLORS[t.status] || 'var(--fg-muted)');
    const isOverdue = t.due_date && t._isPending && new Date(t.due_date) < new Date();
    const dueStr = t.due_date ? new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '\u2014';
    const typeBadge = isGroup
      ? '<span style="background:#7C3AED22;color:#7C3AED;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">Group</span>'
      : '<span style="background:#3B82F622;color:#3B82F6;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">Single</span>';

    // Action column: Mark as Complete button for pending tasks, "Done" label for completed
    let actionHtml = '';
    if (isGroup) {
      if (t.status === 'Pending') {
        actionHtml = `<button class="btn btn-sm" style="background:#22C55E;color:#fff;border:none;font-size:11px;padding:4px 12px;white-space:nowrap;" onclick="event.stopPropagation();gtConfirmComplete(${t.group_task_id})">Mark as Complete</button>`;
      } else if (t.status === 'Completed') {
        actionHtml = '<span style="color:#22C55E;font-size:11px;font-weight:600;">\u2714 Completed</span>';
      } else {
        actionHtml = '<span style="color:var(--fg-muted);font-size:11px;">N/A</span>';
      }
    } else {
      if (t.status === 'Open' || t.status === 'In Progress') {
        actionHtml = `<button class="btn btn-sm" style="background:#22C55E;color:#fff;border:none;font-size:11px;padding:4px 12px;white-space:nowrap;" onclick="event.stopPropagation();gtConfirmCompleteSingle('${escapeAttr(t.task_id)}')">Mark as Complete</button>`;
      } else if (t.status === 'Completed') {
        actionHtml = '<span style="color:#22C55E;font-size:11px;font-weight:600;">\u2714 Completed</span>';
      } else {
        actionHtml = `<span style="color:var(--fg-muted);font-size:11px;">${escapeHtml(t.status || '')}</span>`;
      }
    }

    // Rows are NOT clickable per user request
    return `<tr>
      <td><span style="font-family:monospace;font-size:12px;color:var(--primary);">${escapeHtml(t.task_id || '\u2014')}</span></td>
      <td style="max-width:250px;"><span style="font-weight:500;">${escapeHtml(t.title || '\u2014')}</span></td>
      <td>${typeBadge}</td>
      <td>${isGroup ? '\u2014' : `<span style="font-size:12px;">${escapeHtml(t.assigned_by_name || '\u2014')}</span>`}</td>
      <td><span style="color:${statusColor};font-weight:600;font-size:12px;">${escapeHtml(t.status || '\u2014')}</span></td>
      <td style="${isOverdue ? 'color:var(--error);font-weight:600;' : ''}">${dueStr}${isOverdue ? ' <span style="font-size:10px;">(Overdue)</span>' : ''}</td>
      <td>${t.completed_at ? new Date(t.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '\u2014'}</td>
      <td>${gtRenderAttachmentCell(t)}</td>
      <td>${actionHtml}</td>
    </tr>`;
  }).join('');

  helmRenderReceivedPagination();
}

// ===== Completion Confirmation =====

// ===== Completion Modal with Optional Attachment =====

function gtShowCompleteModal(type, id) {
  // type: 'group' or 'single', id: groupTaskId or taskId string
  const existing = document.getElementById('gt-complete-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'gt-complete-modal-overlay';
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '9999';

  overlay.innerHTML = `
    <div class="modal-box" style="max-width:440px;">
      <div class="modal-header">
        <h3 style="color:var(--primary);display:flex;align-items:center;gap:8px">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          Mark Task as Completed
        </h3>
      </div>
      <div class="modal-body">
        <p>Are you sure you want to mark this task as completed?</p>
        <p class="modal-detail" style="margin-top:4px">This action cannot be undone.</p>
        <div style="margin-top:16px;">
          <a href="#" id="gt-complete-attach-toggle" style="font-size:12px;color:var(--primary);text-decoration:none;display:inline-flex;align-items:center;gap:4px;" onclick="event.preventDefault();document.getElementById('gt-complete-attach-area').style.display='block';this.style.display='none';">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            Add attachment (optional)
          </a>
          <div id="gt-complete-attach-area" style="display:none;margin-top:8px;">
            <div id="gt-complete-drop-zone" style="border:2px dashed var(--border);border-radius:8px;padding:16px;text-align:center;cursor:pointer;transition:border-color 0.2s;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--fg-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin:0 auto 6px;display:block;">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
              <span style="font-size:11px;color:var(--fg-muted);">Click or drag files here (max 5 files, 10 MB each)</span>
              <input type="file" id="gt-complete-file" style="display:none;" multiple accept="image/*,.pdf,.doc,.docx,.xlsx,.xls,.csv,.txt,.pptx,.ppt">
            </div>
            <div id="gt-complete-file-list" style="margin-top:8px;"></div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" id="gt-complete-cancel">Cancel</button>
        <button class="btn btn-primary" id="gt-complete-ok">Yes, Complete</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  let selectedFiles = []; // Array of File objects
  const fileInput = document.getElementById('gt-complete-file');
  const dropZone = document.getElementById('gt-complete-drop-zone');
  const fileListEl = document.getElementById('gt-complete-file-list');

  function renderFileList() {
    if (selectedFiles.length === 0) {
      fileListEl.innerHTML = '';
      dropZone.style.display = 'block';
      return;
    }
    let html = '';
    selectedFiles.forEach((f, idx) => {
      html += `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg-secondary);border-radius:6px;font-size:12px;margin-bottom:4px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(f.name)}</span>
        <span style="color:var(--fg-muted);font-size:11px;white-space:nowrap;">${(f.size / 1024).toFixed(0)} KB</span>
        <button onclick="gtRemoveFile(${idx})" style="background:none;border:none;color:var(--error);cursor:pointer;font-size:14px;font-weight:700;padding:0 4px;">&times;</button>
      </div>`;
    });
    fileListEl.innerHTML = html;
    // Keep drop zone visible if under max
    dropZone.style.display = selectedFiles.length >= 5 ? 'none' : 'block';
  }

  window.gtRemoveFile = function(idx) {
    selectedFiles.splice(idx, 1);
    renderFileList();
  };

  function addFiles(files) {
    for (const f of files) {
      if (selectedFiles.length >= 5) { showToast('Maximum 5 files allowed', 'error'); break; }
      if (f.size > 10 * 1024 * 1024) { showToast(`"${f.name}" is too large (max 10 MB)`, 'error'); continue; }
      // Avoid duplicates by name+size
      if (selectedFiles.some(sf => sf.name === f.name && sf.size === f.size)) continue;
      selectedFiles.push(f);
    }
    renderFileList();
  }

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--primary)'; });
  dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = 'var(--border)'; });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--border)';
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  });
  fileInput.addEventListener('change', () => { if (fileInput.files.length > 0) addFiles(fileInput.files); fileInput.value = ''; });

  const close = () => { window.gtRemoveFile = undefined; overlay.remove(); };
  document.getElementById('gt-complete-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  document.getElementById('gt-complete-ok').addEventListener('click', async () => {
    const btn = document.getElementById('gt-complete-ok');
    btn.disabled = true;
    btn.textContent = 'Completing...';
    try {
      let attachmentUrls = [];
      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          const url = await gtUploadAttachment(file);
          attachmentUrls.push({ name: file.name, url: url });
        }
      }
      if (type === 'group') {
        await gtDoComplete(id, attachmentUrls);
      } else {
        await gtDoCompleteSingle(id, attachmentUrls);
      }
      close();
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Yes, Complete';
    }
  });

  document.getElementById('gt-complete-cancel').focus();
}

async function gtUploadAttachment(file) {
  const reader = new FileReader();
  const base64 = await new Promise((resolve, reject) => {
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const resp = await fetch(`${IO_API_BASE}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      data: base64,
      folder: 'task-attachments'
    })
  });
  if (!resp.ok) throw new Error('File upload failed');
  const result = await resp.json();
  return result.url;
}

function gtConfirmComplete(groupTaskId) {
  gtShowCompleteModal('group', groupTaskId);
}

function gtConfirmCompleteSingle(taskId) {
  gtShowCompleteModal('single', taskId);
}

async function gtDoComplete(groupTaskId, attachmentUrls) {
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  if (!cu) return;

  const body = { ohr: cu.ohr_id };
  if (attachmentUrls && attachmentUrls.length > 0) body.attachment_urls = attachmentUrls;

  const resp = await fetch(`${IO_API_BASE}/group-tasks/${groupTaskId}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || 'Failed');
  }
  showToast('Task marked as completed!', 'success');
  await gtFetchMyGroupTasks();
  helmApplyReceivedFilters();
}

async function gtDoCompleteSingle(taskId, attachmentUrls) {
  const body = { status: 'Completed', completed_at: new Date().toISOString() };
  if (attachmentUrls && attachmentUrls.length > 0) body.attachments = JSON.stringify(attachmentUrls);

  const resp = await fetch(`${IO_API_BASE}/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || 'Failed');
  }
  showToast('Task marked as completed!', 'success');
  await helmFetchTasks();
  helmApplyReceivedFilters();
}

// ===== Group Task Detail Modal =====

async function gtOpenDetail(groupTaskId) {
  const overlay = document.getElementById('gt-detail-overlay');
  const body = document.getElementById('gt-detail-body');
  const footer = document.getElementById('gt-detail-footer');
  const title = document.getElementById('gt-detail-title');
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
                const sc = GT.STATUS_COLORS[a.status] || 'var(--fg-muted)';
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
    let footerHtml = '<button class="btn btn-outline btn-sm" onclick="gtDetailClose()">Close</button>';
    if ((isCreator || isAdmin) && task.status === 'Active') {
      footerHtml += `<button class="btn btn-sm" style="background:#EF4444;color:#fff;border:none;" onclick="gtCloseTask(${groupTaskId})">Close Task</button>`;
    }
    footer.innerHTML = footerHtml;

  } catch (e) {
    body.innerHTML = `<div style="padding:40px;text-align:center;color:var(--error);">Failed to load task details: ${escapeHtml(e.message)}</div>`;
    footer.innerHTML = '<button class="btn btn-outline btn-sm" onclick="gtDetailClose()">Close</button>';
  }
}

function gtDetailClose() {
  const overlay = document.getElementById('gt-detail-overlay');
  if (overlay) overlay.style.display = 'none';
}

async function gtCloseTask(groupTaskId) {
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
        gtDetailClose();
        await gtFetchGroupTasks();
        await gtFetchMyGroupTasks();
        helmApplyReceivedFilters();
      } catch (e) {
        showToast('Error: ' + e.message, 'error');
      }
    }
  });
}

// ===== Hook into Helm initialization =====

// ===== Attachment Cell Renderer =====

function gtRenderAttachmentCell(t) {
  // For group tasks, attachment_url is directly on the unified object
  // For individual tasks, the attachments field may hold a URL or JSON array
  const raw = t.attachment_url || t.attachments || '';
  if (!raw) return '\u2014';

  // Try to parse as JSON array (new multi-attachment format)
  let attachments = [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) attachments = parsed;
  } catch (e) {
    // Legacy: plain URL string
    attachments = [{ name: 'attachment', url: raw }];
  }

  if (attachments.length === 0) return '\u2014';

  const clipIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>';

  if (attachments.length === 1) {
    return `<a href="${escapeAttr(attachments[0].url)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;color:var(--primary);font-size:11px;font-weight:600;text-decoration:none;" title="${escapeAttr(attachments[0].name || 'View')}">${clipIcon} View</a>`;
  }

  // Multiple: show count with a dropdown-style tooltip
  return `<span class="gt-multi-attach" style="display:inline-flex;align-items:center;gap:4px;color:var(--primary);font-size:11px;font-weight:600;cursor:pointer;position:relative;" onclick="gtShowAttachPopup(event, ${escapeAttr(JSON.stringify(JSON.stringify(attachments)))})">${clipIcon} ${attachments.length} files</span>`;
}

function gtShowAttachPopup(event, jsonStr) {
  event.stopPropagation();
  // Remove any existing popup
  const old = document.getElementById('gt-attach-popup');
  if (old) old.remove();

  const attachments = JSON.parse(jsonStr);
  const popup = document.createElement('div');
  popup.id = 'gt-attach-popup';
  popup.style.cssText = 'position:fixed;z-index:99999;background:var(--bg);border:1px solid var(--border);border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);padding:8px 0;min-width:200px;max-width:300px;';

  let html = '';
  attachments.forEach(a => {
    html += `<a href="${escapeAttr(a.url)}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:8px;padding:6px 12px;font-size:12px;color:var(--fg);text-decoration:none;transition:background 0.1s;" onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background='transparent'">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(a.name || 'File')}</span>
    </a>`;
  });
  popup.innerHTML = html;

  document.body.appendChild(popup);

  // Position near the click
  const rect = event.target.getBoundingClientRect();
  popup.style.top = (rect.bottom + 4) + 'px';
  popup.style.left = Math.min(rect.left, window.innerWidth - 320) + 'px';

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function _closePopup() {
      const el = document.getElementById('gt-attach-popup');
      if (el) el.remove();
      document.removeEventListener('click', _closePopup);
    });
  }, 10);
}

const _originalInitHelm = initHelm;
initHelm = async function(view) {
  await _originalInitHelm(view);
  // Fetch group tasks data
  await gtFetchMyGroupTasks();

  // Role-based visibility for New Group Task button — only ADMIN_OHRS can see it
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  const isAdminOhr = cu && (window.ADMIN_OHRS || []).includes(cu.ohr_id);
  const groupTaskBtn = document.getElementById('helm-new-group-task-btn');
  if (groupTaskBtn) groupTaskBtn.style.display = isAdminOhr ? '' : 'none';

  // New Request button: visible to all roles (agents can submit shift extension requests)
  const reqBtn = document.getElementById('helm-new-request-btn');
  if (reqBtn) reqBtn.style.display = '';

  // Re-apply received filters to include group tasks
  if (HELM.currentBoardTab === 'received') {
    helmApplyReceivedFilters();
  }
};
