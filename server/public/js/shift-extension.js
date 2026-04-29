/**
 * shift-extension.js — Shift Extension Request UI
 * 
 * Renders the "Shift Extensions" tab in Helm with role-based views:
 * - Agent: sees only their own requests + status
 * - TL: sees requests from their agents pending TL approval
 * - OM/Admin: sees requests pending OM approval (after TL approved)
 *
 * Depends on: helm.js (HELM state), app.js (IO_API_BASE, escapeHtml, showToast, currentUser)
 */

/* ===== State ===== */
var SE = {
  data: [],
  filtered: [],
  loading: false
};

/* ===== Data Fetch ===== */
async function seFetchData() {
  SE.loading = true;
  try {
    const resp = await fetch(`${IO_API_BASE}/shift-extensions?limit=1000`);
    if (!resp.ok) throw new Error('Failed to fetch');
    SE.data = await resp.json();
  } catch (e) {
    console.error('[shift-ext] fetch error:', e.message);
    SE.data = [];
  }
  SE.loading = false;
}

/* ===== Role Detection ===== */
function seGetRole() {
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  if (!cu) return { role: 'unknown', ohr: '', name: '' };
  const isAdmin = (window.ADMIN_OHRS || []).includes(cu.ohr_id);
  const isAgent = cu.actual_role === 'Agent' && !isAdmin;
  const isTL = (cu.actual_role === 'Team Lead' || cu.actual_role === 'Team Leader') && !isAdmin;
  // OM or Admin sees everything
  return {
    role: isAgent ? 'agent' : (isTL ? 'tl' : 'om'),
    ohr: cu.ohr_id || '',
    name: cu.full_name || ''
  };
}

/* ===== Main Tab Renderer ===== */
async function seRenderTab() {
  const contentEl = document.getElementById('se-content');
  const subTabsEl = document.getElementById('se-sub-tabs');
  if (!contentEl) return;

  if (SE.data.length === 0 && !SE.loading) {
    await seFetchData();
  }

  const { role, ohr } = seGetRole();

  // Sub-tabs: Agent sees "My Requests"; TL sees "Pending My Review" + "All My Team"; OM sees "Pending OM Review" + "All"
  let subTabs = [];
  if (role === 'agent') {
    subTabs = [{ key: 'my', label: 'My Requests' }];
  } else if (role === 'tl') {
    subTabs = [
      { key: 'pending-tl', label: 'Pending My Review' },
      { key: 'team', label: 'My Team' }
    ];
  } else {
    // OM / Admin
    subTabs = [
      { key: 'pending-om', label: 'Pending OM Review' },
      { key: 'pending-tl', label: 'Pending TL Review' },
      { key: 'all', label: 'All Requests' }
    ];
  }

  if (!SE._activeSubTab || !subTabs.find(t => t.key === SE._activeSubTab)) {
    SE._activeSubTab = subTabs[0].key;
  }

  if (subTabsEl) {
    subTabsEl.innerHTML = subTabs.map(t =>
      `<button class="btn btn-sm ${t.key === SE._activeSubTab ? 'btn-primary' : 'btn-outline'}" 
        onclick="SE._activeSubTab='${t.key}';seRenderTab()" 
        style="font-size:12px;padding:5px 14px;">${escapeHtml(t.label)}</button>`
    ).join('');
  }

  // Filter data based on sub-tab
  let rows = SE.data;
  const tab = SE._activeSubTab;

  if (tab === 'my') {
    rows = rows.filter(r => r.agent_ohr === ohr);
  } else if (tab === 'pending-tl') {
    if (role === 'tl') {
      rows = rows.filter(r => r.supervisor_ohr === ohr && r.overall_status === 'Pending TL');
    } else {
      rows = rows.filter(r => r.overall_status === 'Pending TL');
    }
  } else if (tab === 'team') {
    rows = rows.filter(r => r.supervisor_ohr === ohr);
  } else if (tab === 'pending-om') {
    rows = rows.filter(r => r.overall_status === 'Pending OM');
  }
  // 'all' shows everything

  SE.filtered = rows;

  if (rows.length === 0) {
    contentEl.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--fg-muted);font-size:13px;">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.3;margin-bottom:8px;"><circle cx="12" cy="12" r="10"/><line x1="8" y1="15" x2="16" y2="15"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
      <div>No shift extension requests found.</div>
    </div>`;
    return;
  }

  // Sort by created_at descending
  rows.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

  const showActions = (tab === 'pending-tl' || tab === 'pending-om');

  contentEl.innerHTML = `
    <div style="overflow-x:auto;">
      <table class="module-table" style="width:100%;font-size:13px;">
        <thead>
          <tr>
            <th style="padding:10px 12px;text-align:left;">Request ID</th>
            <th style="padding:10px 12px;text-align:left;">Agent</th>
            <th style="padding:10px 12px;text-align:left;">Shift Date</th>
            <th style="padding:10px 12px;text-align:center;">Extension</th>
            <th style="padding:10px 12px;text-align:left;">Reason</th>
            <th style="padding:10px 12px;text-align:center;">TL Status</th>
            <th style="padding:10px 12px;text-align:center;">OM Status</th>
            <th style="padding:10px 12px;text-align:center;">Overall</th>
            ${showActions ? '<th style="padding:10px 12px;text-align:center;">Action</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => seRenderRow(r, tab, showActions)).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/* ===== Row Renderer ===== */
function seRenderRow(r, tab, showActions) {
  const statusBadge = (status) => {
    const colors = {
      'Pending': 'background:#fef3c7;color:#92400e;',
      'Approved': 'background:#d1fae5;color:#065f46;',
      'Rejected': 'background:#fee2e2;color:#991b1b;',
      'Pending TL': 'background:#fef3c7;color:#92400e;',
      'Pending OM': 'background:#dbeafe;color:#1e40af;'
    };
    const style = colors[status] || 'background:var(--bg-subtle);color:var(--fg-muted);';
    return `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;${style}">${escapeHtml(status || '—')}</span>`;
  };

  const shiftDate = r.shift_date ? new Date(r.shift_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—';
  const reason = (r.reason_details || '').length > 60 ? r.reason_details.substring(0, 60) + '...' : (r.reason_details || '—');

  let actionHtml = '';
  if (showActions) {
    if (tab === 'pending-tl') {
      actionHtml = `<td style="padding:10px 12px;text-align:center;white-space:nowrap;">
        <button class="btn btn-sm" style="background:#d1fae5;color:#065f46;border:1px solid #a7f3d0;font-size:11px;padding:4px 10px;margin-right:4px;" onclick="seAction(${r.id},'tl','Approved')">Approve</button>
        <button class="btn btn-sm" style="background:#fee2e2;color:#991b1b;border:1px solid #fecaca;font-size:11px;padding:4px 10px;" onclick="seAction(${r.id},'tl','Rejected')">Reject</button>
      </td>`;
    } else if (tab === 'pending-om') {
      actionHtml = `<td style="padding:10px 12px;text-align:center;white-space:nowrap;">
        <button class="btn btn-sm" style="background:#d1fae5;color:#065f46;border:1px solid #a7f3d0;font-size:11px;padding:4px 10px;margin-right:4px;" onclick="seAction(${r.id},'om','Approved')">Approve</button>
        <button class="btn btn-sm" style="background:#fee2e2;color:#991b1b;border:1px solid #fecaca;font-size:11px;padding:4px 10px;" onclick="seAction(${r.id},'om','Rejected')">Reject</button>
      </td>`;
    }
  }

  return `<tr style="cursor:pointer;" onclick="seShowDetail(${r.id})">
    <td style="padding:10px 12px;font-weight:600;color:var(--primary);">${escapeHtml(r.request_id || '')}</td>
    <td style="padding:10px 12px;">${escapeHtml(r.agent_name || '—')}</td>
    <td style="padding:10px 12px;">${shiftDate}</td>
    <td style="padding:10px 12px;text-align:center;font-weight:600;">${r.extension_minutes || 0} min</td>
    <td style="padding:10px 12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeAttr(r.reason_details || '')}">${escapeHtml(reason)}</td>
    <td style="padding:10px 12px;text-align:center;">${statusBadge(r.tl_status)}</td>
    <td style="padding:10px 12px;text-align:center;">${statusBadge(r.om_status)}</td>
    <td style="padding:10px 12px;text-align:center;">${statusBadge(r.overall_status)}</td>
    ${actionHtml}
  </tr>`;
}

/* ===== Detail Modal ===== */
function seShowDetail(id) {
  const r = SE.data.find(d => d.id === id);
  if (!r) return;

  const shiftDate = r.shift_date ? new Date(r.shift_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '—';
  const createdAt = r.created_at ? new Date(r.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

  const statusBadge = (status) => {
    const colors = {
      'Pending': 'background:#fef3c7;color:#92400e;',
      'Approved': 'background:#d1fae5;color:#065f46;',
      'Rejected': 'background:#fee2e2;color:#991b1b;',
      'Pending TL': 'background:#fef3c7;color:#92400e;',
      'Pending OM': 'background:#dbeafe;color:#1e40af;'
    };
    const style = colors[status] || 'background:var(--bg-subtle);color:var(--fg-muted);';
    return `<span style="display:inline-block;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600;${style}">${escapeHtml(status || '—')}</span>`;
  };

  const tlActionedAt = r.tl_actioned_at ? new Date(r.tl_actioned_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
  const omActionedAt = r.om_actioned_at ? new Date(r.om_actioned_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

  const { role, ohr } = seGetRole();
  const canTLAct = (role === 'tl' || role === 'om') && r.overall_status === 'Pending TL';
  const canOMAct = role === 'om' && r.overall_status === 'Pending OM';

  let actionsHtml = '';
  if (canTLAct) {
    actionsHtml = `
      <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);">
        <label style="font-size:12px;font-weight:600;color:var(--fg-muted);display:block;margin-bottom:6px;">TL Comments (optional)</label>
        <textarea id="se-detail-tl-comments" rows="2" class="form-textarea" style="width:100%;resize:vertical;font-size:13px;margin-bottom:10px;" placeholder="Add comments..."></textarea>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn btn-sm" style="background:#d1fae5;color:#065f46;border:1px solid #a7f3d0;" onclick="seActionFromDetail(${r.id},'tl','Approved')">Approve</button>
          <button class="btn btn-sm" style="background:#fee2e2;color:#991b1b;border:1px solid #fecaca;" onclick="seActionFromDetail(${r.id},'tl','Rejected')">Reject</button>
        </div>
      </div>`;
  } else if (canOMAct) {
    actionsHtml = `
      <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);">
        <label style="font-size:12px;font-weight:600;color:var(--fg-muted);display:block;margin-bottom:6px;">OM Comments (optional)</label>
        <textarea id="se-detail-om-comments" rows="2" class="form-textarea" style="width:100%;resize:vertical;font-size:13px;margin-bottom:10px;" placeholder="Add comments..."></textarea>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn btn-sm" style="background:#d1fae5;color:#065f46;border:1px solid #a7f3d0;" onclick="seActionFromDetail(${r.id},'om','Approved')">Approve</button>
          <button class="btn btn-sm" style="background:#fee2e2;color:#991b1b;border:1px solid #fecaca;" onclick="seActionFromDetail(${r.id},'om','Rejected')">Reject</button>
        </div>
      </div>`;
  }

  const overlay = document.getElementById('helm-form-overlay');
  const formTitle = document.getElementById('helm-form-title');
  const formBody = document.getElementById('helm-form-body');
  const formFooter = document.getElementById('helm-form-footer');

  formTitle.textContent = r.request_id || 'Shift Extension';
  formBody.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 24px;margin-bottom:16px;">
      <div>
        <div style="font-size:11px;font-weight:600;color:var(--fg-muted);text-transform:uppercase;margin-bottom:2px;">Agent</div>
        <div style="font-size:14px;font-weight:500;">${escapeHtml(r.agent_name || '—')}</div>
      </div>
      <div>
        <div style="font-size:11px;font-weight:600;color:var(--fg-muted);text-transform:uppercase;margin-bottom:2px;">Supervisor</div>
        <div style="font-size:14px;font-weight:500;">${escapeHtml(r.supervisor_name || '—')}</div>
      </div>
      <div>
        <div style="font-size:11px;font-weight:600;color:var(--fg-muted);text-transform:uppercase;margin-bottom:2px;">Shift Date</div>
        <div style="font-size:14px;font-weight:500;">${shiftDate}</div>
      </div>
      <div>
        <div style="font-size:11px;font-weight:600;color:var(--fg-muted);text-transform:uppercase;margin-bottom:2px;">Extension</div>
        <div style="font-size:14px;font-weight:600;color:var(--primary);">${r.extension_minutes || 0} minutes</div>
      </div>
      <div>
        <div style="font-size:11px;font-weight:600;color:var(--fg-muted);text-transform:uppercase;margin-bottom:2px;">Planning Group</div>
        <div style="font-size:14px;">${escapeHtml(r.planning_group || '—')}</div>
      </div>
      <div>
        <div style="font-size:11px;font-weight:600;color:var(--fg-muted);text-transform:uppercase;margin-bottom:2px;">Submitted</div>
        <div style="font-size:14px;">${createdAt}</div>
      </div>
    </div>

    <div style="margin-bottom:16px;">
      <div style="font-size:11px;font-weight:600;color:var(--fg-muted);text-transform:uppercase;margin-bottom:4px;">Reason Details</div>
      <div style="font-size:13px;line-height:1.6;padding:10px 14px;background:var(--bg-subtle);border-radius:8px;border:1px solid var(--border);">${escapeHtml(r.reason_details || '—')}</div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 24px;padding:14px;background:var(--bg-subtle);border-radius:8px;border:1px solid var(--border);">
      <div>
        <div style="font-size:11px;font-weight:600;color:var(--fg-muted);text-transform:uppercase;margin-bottom:4px;">TL Status</div>
        <div>${statusBadge(r.tl_status)}</div>
        ${r.tl_actioned_by ? `<div style="font-size:11px;color:var(--fg-muted);margin-top:4px;">By ${escapeHtml(r.tl_actioned_by)} · ${tlActionedAt}</div>` : ''}
        ${r.tl_comments ? `<div style="font-size:12px;margin-top:4px;font-style:italic;color:var(--fg-muted);">"${escapeHtml(r.tl_comments)}"</div>` : ''}
      </div>
      <div>
        <div style="font-size:11px;font-weight:600;color:var(--fg-muted);text-transform:uppercase;margin-bottom:4px;">OM Status</div>
        <div>${statusBadge(r.om_status)}</div>
        ${r.om_actioned_by ? `<div style="font-size:11px;color:var(--fg-muted);margin-top:4px;">By ${escapeHtml(r.om_actioned_by)} · ${omActionedAt}</div>` : ''}
        ${r.om_comments ? `<div style="font-size:12px;margin-top:4px;font-style:italic;color:var(--fg-muted);">"${escapeHtml(r.om_comments)}"</div>` : ''}
      </div>
    </div>

    <div style="margin-top:12px;text-align:center;">
      <div style="font-size:11px;font-weight:600;color:var(--fg-muted);text-transform:uppercase;margin-bottom:4px;">Overall Status</div>
      ${statusBadge(r.overall_status)}
    </div>

    ${actionsHtml}
  `;

  formFooter.innerHTML = `<button class="btn btn-outline btn-sm" onclick="helmCloseForm()">Close</button>`;
  overlay.style.display = 'flex';
}

/* ===== Actions (from table row buttons) ===== */
async function seAction(id, level, action, event) {
  if (event) event.stopPropagation();
  const { ohr, name } = seGetRole();
  const comments = '';
  await seSubmitAction(id, level, action, comments, name);
}

/* ===== Actions (from detail modal) ===== */
async function seActionFromDetail(id, level, action) {
  const commentsEl = document.getElementById(`se-detail-${level}-comments`);
  const comments = commentsEl ? commentsEl.value.trim() : '';
  const { name } = seGetRole();
  await seSubmitAction(id, level, action, comments, name);
  helmCloseForm();
}

/* ===== Submit Action ===== */
async function seSubmitAction(id, level, action, comments, actionedBy) {
  try {
    const resp = await fetch(`${IO_API_BASE}/shift-extensions/${id}/${level}-action`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: action,
        comments: comments,
        actioned_by: actionedBy
      })
    });
    if (!resp.ok) throw new Error('Action failed');
    showToast(`Request ${action.toLowerCase()} successfully`, 'success');
    await seFetchData();
    // Refresh the Approvals tab (shift extensions are now merged there)
    if (typeof helmApplyApprovalsFilters === 'function') helmApplyApprovalsFilters();
  } catch (e) {
    showToast('Failed: ' + e.message, 'error');
  }
}
