/**
 * Compass Coaching Logs — List, detail, new form, acknowledgement.
 * Calls /api/io/compass/coaching/* endpoints.
 */
/* global currentUser, showToast, switchView */

const CC_API = '/api/io/compass';
let ccState = { page: 1, limit: 50, data: [], total: 0, filters: {}, employeeList: [], rcaCatalog: [], ztpCatalog: [] };

async function initCompassCoaching() {
  const container = document.getElementById('compass-coaching-content');
  const loading = document.getElementById('compass-coaching-loading');
  if (!container) return;
  loading.style.display = 'flex';
  container.innerHTML = '';

  try {
    // Load employee list for dropdowns (cached)
    if (!ccState.employeeList.length) {
      const empResp = await fetch('/api/io/employees');
      if (empResp.ok) {
        const empData = await empResp.json();
        ccState.employeeList = empData.data || empData || [];
      }
    }
    await ccLoadList();
    container.innerHTML = ccBuildListHTML();
    ccRenderTable();
  } catch (err) {
    console.error('[Compass Coaching]', err);
    container.innerHTML = `<div style="text-align:center;padding:60px;color:var(--fg-muted);"><h3>Error loading coaching logs</h3><p>${err.message}</p></div>`;
  } finally {
    loading.style.display = 'none';
  }
}

async function ccLoadList() {
  const params = new URLSearchParams({
    user_ohr: currentUser.ohr_id,
    user_role: currentUser.actual_role,
    page: ccState.page,
    limit: ccState.limit,
  });
  if (ccState.filters.coaching_type) params.set('coaching_type', ccState.filters.coaching_type);
  if (ccState.filters.status) params.set('status', ccState.filters.status);
  if (ccState.filters.search) params.set('search', ccState.filters.search);

  const resp = await fetch(`${CC_API}/coaching?${params}`);
  if (!resp.ok) throw new Error('Failed to load coaching logs');
  const result = await resp.json();
  ccState.data = result.data || [];
  ccState.total = result.total || 0;
}

function ccBuildListHTML() {
  const canCreate = currentUser.actual_role !== 'Agent';
  return `
    <div style="padding:16px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
        ${canCreate ? `<button class="btn btn-primary btn-sm" onclick="compassShowNewForm()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Coaching Log
        </button>` : ''}
        <input type="text" id="cc-search" placeholder="Search by name, ID, or goals..." style="flex:1;min-width:200px;padding:6px 12px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input, var(--bg));color:var(--fg);font-size:13px;" oninput="ccOnSearch(this.value)">
        <select id="cc-filter-type" onchange="ccOnFilterType(this.value)" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input, var(--bg));color:var(--fg);font-size:13px;">
          <option value="">All Types</option>
          <option value="General Coaching">General</option>
          <option value="Incident Report">Incident Report</option>
          <option value="Follow-Up Session">Follow-Up</option>
          <option value="Group Coaching">Group</option>
          <option value="Triad Coaching">Triad</option>
          <option value="QA Feedback">QA Feedback</option>
          <option value="ZTP Coaching">ZTP</option>
        </select>
        <span style="font-size:12px;color:var(--fg-muted);">Total: <strong id="cc-total-count" style="color:var(--fg);">${ccState.total}</strong></span>
      </div>
      <div class="module-table-wrapper">
        <table class="data-table module-table" id="cc-table">
          <thead>
            <tr>
              <th style="width:100px;">ID</th>
              <th>Type</th>
              <th>Coachee</th>
              <th>Coach</th>
              <th>Date</th>
              <th style="width:60px;">Actions</th>
            </tr>
          </thead>
          <tbody id="cc-table-body"></tbody>
        </table>
      </div>
      <div id="cc-pagination" style="display:flex;justify-content:center;gap:8px;margin-top:12px;"></div>
    </div>
  `;
}

function ccRenderTable() {
  const tbody = document.getElementById('cc-table-body');
  const totalEl = document.getElementById('cc-total-count');
  if (!tbody) return;
  if (totalEl) totalEl.textContent = ccState.total;

  if (!ccState.data.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="mascot-empty-state"><div class="sprite-mascot" role="img" aria-label="No data"></div><div class="empty-title">No coaching logs found</div><div class="empty-subtitle">Try adjusting the filters or date range</div></div></td></tr>`;
    return;
  }

  tbody.innerHTML = ccState.data.map(log => {
    const statusClass = log.status === 'Acknowledged' ? 'color:#22c55e' : log.status?.startsWith('QA Dispute') ? 'color:#ef4444' : 'color:#f59e0b';
    return `<tr onclick="ccShowDetail('${log.coaching_id}')" style="cursor:pointer;">
      <td style="font-family:monospace;font-size:12px;">${log.coaching_id || ''}</td>
      <td><span style="font-size:12px;padding:2px 8px;border-radius:4px;background:var(--bg-muted, #2a2a3a);color:var(--fg);">${log.coaching_type || ''}</span></td>
      <td>${log.coachee_name || ''}</td>
      <td>${log.coach_name || ''}</td>
      <td style="font-size:12px;">${log.coaching_date || ''}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();ccShowDetail('${log.coaching_id}')">View</button></td>
    </tr>`;
  }).join('');

  // Pagination
  const pages = Math.ceil(ccState.total / ccState.limit);
  const pagEl = document.getElementById('cc-pagination');
  if (pagEl && pages > 1) {
    let html = '';
    for (let i = 1; i <= pages; i++) {
      html += `<button class="btn btn-sm ${i === ccState.page ? 'btn-primary' : 'btn-outline'}" onclick="ccGoPage(${i})">${i}</button>`;
    }
    pagEl.innerHTML = html;
  }
}

let ccSearchTimeout;
function ccOnSearch(val) {
  clearTimeout(ccSearchTimeout);
  ccSearchTimeout = setTimeout(async () => {
    ccState.filters.search = val;
    ccState.page = 1;
    await ccLoadList();
    ccRenderTable();
  }, 300);
}
async function ccOnFilterType(val) {
  ccState.filters.coaching_type = val;
  ccState.page = 1;
  await ccLoadList();
  ccRenderTable();
}
async function ccOnFilterStatus(val) {
  ccState.filters.status = val;
  ccState.page = 1;
  await ccLoadList();
  ccRenderTable();
}
async function ccGoPage(p) {
  ccState.page = p;
  await ccLoadList();
  ccRenderTable();
}

// ---- Detail View ----
async function ccShowDetail(coachingId) {
  const overlay = document.getElementById('compass-coaching-detail-overlay');
  const body = document.getElementById('compass-coaching-detail-body');
  const footer = document.getElementById('compass-coaching-detail-footer');
  const title = document.getElementById('compass-coaching-detail-title');
  if (!overlay || !body) return;

  body.innerHTML = '<div style="text-align:center;padding:40px;"><div class="spinner"></div></div>';
  footer.innerHTML = '';
  overlay.style.display = 'flex';

  try {
    const resp = await fetch(`${CC_API}/coaching/${coachingId}`);
    if (!resp.ok) throw new Error('Not found');
    const log = await resp.json();
    title.textContent = `${log.coaching_type} — ${log.coaching_id}`;

    body.innerHTML = ccBuildDetailHTML(log);

    // Footer actions
    const actions = [];
    if (log.status === 'Pending Acknowledgement' && log.coachee_ohr === currentUser.ohr_id) {
      actions.push(`<button class="btn btn-primary btn-sm" onclick="ccAcknowledge('${log.coaching_id}')">Acknowledge</button>`);
    }
    footer.innerHTML = actions.join(' ');
  } catch (err) {
    body.innerHTML = `<div style="text-align:center;padding:40px;color:var(--fg-muted);">${err.message}</div>`;
  }
}

function ccBuildDetailHTML(log) {
  const disputes = log.dispute_events || [];
  const field = (label, val) => val ? `<div style="margin-bottom:8px;"><span style="font-size:11px;color:var(--fg-muted);text-transform:uppercase;letter-spacing:0.5px;">${label}</span><div style="font-size:14px;color:var(--fg);">${val}</div></div>` : '';

  let html = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
    <div>
      <h4 style="font-size:13px;color:var(--fg-muted);margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px;">Session Info</h4>
      ${field('Coaching ID', log.coaching_id)}
      ${field('Type', log.coaching_type)}
      ${field('Date', log.coaching_date)}
      ${field('Status', `<span style="color:${log.status === 'Acknowledged' ? '#22c55e' : '#f59e0b'}">${log.status}</span>`)}
      ${field('Session Goals', log.session_goals)}
      ${field('Details', log.coaching_details)}
    </div>
    <div>
      <h4 style="font-size:13px;color:var(--fg-muted);margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px;">Participants</h4>
      ${field('Coach', `${log.coach_name} (${log.coach_ohr})`)}
      ${field('Coachee', `${log.coachee_name} (${log.coachee_ohr})`)}
      ${field('SME Joiner', log.sme_joiner_name)}
      ${field('Planning Group', log.coachee_pg)}
    </div>
  </div>`;

  if (log.rca_level_1) {
    html += `<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);">
      <h4 style="font-size:13px;color:var(--fg-muted);margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px;">Root Cause Analysis</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        ${field('L1 Category', log.rca_level_1)}
        ${field('L2 Direct Cause', log.rca_level_2)}
        ${field('L3 Contributing Cause', log.rca_level_3)}
        ${field('L4 Deficiency', log.rca_level_4)}
        ${field('L5 Root Cause', log.rca_level_5)}
      </div>
      ${field('RCA Description', log.rca_description)}
    </div>`;
  }

  if (log.infraction_category) {
    html += `<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);">
      <h4 style="font-size:13px;color:var(--fg-muted);margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px;">Infraction</h4>
      ${field('Category', log.infraction_category)}
      ${field('Infraction', log.infraction)}
      ${field('Description', log.infraction_description)}
      ${field('Severity', log.severity)}
    </div>`;
  }

  if (log.coachee_ack) {
    html += `<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);">
      <h4 style="font-size:13px;color:var(--fg-muted);margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px;">Acknowledgement</h4>
      ${field('Acknowledged', log.ack_date)}
      ${field('Commitments', log.coachee_commitments)}
      ${field('Rating', log.coaching_rating ? '★'.repeat(log.coaching_rating) : '')}
      ${field('Sentiments', log.coachee_sentiments)}
    </div>`;
  }

  if (disputes.length) {
    html += `<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);">
      <h4 style="font-size:13px;color:var(--fg-muted);margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px;">Dispute History (${disputes.length})</h4>
      ${disputes.map(d => `<div style="padding:8px 12px;margin-bottom:8px;background:var(--bg-muted, #2a2a3a);border-radius:6px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--fg-muted);">
          <span>Level ${d.dispute_level} — ${d.action}</span>
          <span>${d.created_at || ''}</span>
        </div>
        <div style="font-size:13px;color:var(--fg);margin-top:4px;">${d.actor_name} (${d.actor_role}): ${d.comments || 'No comments'}</div>
      </div>`).join('')}
    </div>`;
  }

  return html;
}

function compassCoachingCloseDetail() {
  const overlay = document.getElementById('compass-coaching-detail-overlay');
  if (overlay) overlay.style.display = 'none';
}

// ---- Acknowledge ----
async function ccAcknowledge(coachingId) {
  const commitments = prompt('Enter your commitments (what you will do differently):');
  if (commitments === null) return;
  const rating = prompt('Rate this session (1-5):');

  try {
    const resp = await fetch(`${CC_API}/coaching/${coachingId}/acknowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commitments,
        rating: parseInt(rating) || null,
        sentiments: '',
      }),
    });
    if (!resp.ok) throw new Error('Failed to acknowledge');
    showToast('Coaching log acknowledged successfully', 'success');
    compassCoachingCloseDetail();
    await ccLoadList();
    ccRenderTable();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// Duplicate form removed — "New Coaching Log" button now calls compassShowNewForm() from compass.js
