/**
 * Compass QA Disputes — Kanban board for QA Feedback dispute escalation.
 * 6-level escalation: SME → QA → SME → Trainer → SME → QTP Manager
 * Calls /api/io/compass/disputes and /api/io/compass/coaching/:id/dispute
 */
/* global currentUser, showToast */

const CD_API = '/api/io/compass';

const DISPUTE_LEVELS = [
  { key: 'QA Dispute - LV1', label: 'LV1: SME Review', actor: 'Operational SME' },
  { key: 'QA Dispute - LV2', label: 'LV2: QA Review', actor: 'QA' },
  { key: 'QA Dispute - LV3', label: 'LV3: SME Rebuttal', actor: 'Operational SME' },
  { key: 'QA Dispute - LV4', label: 'LV4: Trainer Review', actor: 'Trainer' },
  { key: 'QA Dispute - LV5', label: 'LV5: SME Final', actor: 'Operational SME' },
  { key: 'QA Dispute - LV6', label: 'LV6: QTP Manager', actor: 'Manager' },
  { key: 'Resolved', label: 'Resolved', actor: null },
];

let cdState = { data: [] };

async function initCompassDisputesView() {
  const container = document.getElementById('compass-disputes-content');
  const loading = document.getElementById('compass-disputes-loading');
  if (!container) return;
  loading.style.display = 'flex';
  container.innerHTML = '';

  try {
    const params = new URLSearchParams({
      user_ohr: currentUser.ohr_id,
      user_role: currentUser.actual_role,
    });
    const resp = await fetch(`${CD_API}/disputes?${params}`);
    if (!resp.ok) throw new Error('Failed to load disputes');
    const result = await resp.json();
    cdState.data = result.data || [];

    container.innerHTML = cdBuildKanbanHTML();
  } catch (err) {
    console.error('[Compass Disputes]', err);
    container.innerHTML = `<div style="text-align:center;padding:60px;color:var(--fg-muted);"><h3>Error loading disputes</h3><p>${err.message}</p></div>`;
  } finally {
    loading.style.display = 'none';
  }
}

function cdBuildKanbanHTML() {
  const columns = DISPUTE_LEVELS.map(level => {
    const items = cdState.data.filter(d => d.status === level.key);
    const cards = items.map(d => `
      <div onclick="cdShowDisputeDetail('${d.coaching_id}')" style="background:var(--bg, #1a1a2e);border:1px solid var(--border);border-radius:6px;padding:12px;cursor:pointer;transition:border-color 0.2s;" onmouseover="this.style.borderColor='var(--accent, #6366f1)'" onmouseout="this.style.borderColor='var(--border)'">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span style="font-family:monospace;font-size:11px;color:var(--fg-muted);">${d.coaching_id}</span>
          <span style="font-size:10px;padding:2px 6px;border-radius:3px;background:var(--bg-muted);color:var(--fg-muted);">${d.coaching_type}</span>
        </div>
        <div style="font-size:13px;font-weight:500;color:var(--fg);margin-bottom:4px;">${d.coachee_name || 'Unknown'}</div>
        <div style="font-size:11px;color:var(--fg-muted);">Coach: ${d.coach_name || ''}</div>
        <div style="font-size:11px;color:var(--fg-muted);">Date: ${d.coaching_date || ''}</div>
      </div>
    `).join('');

    return `
      <div style="min-width:220px;max-width:280px;flex:1;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;">
          <span style="font-size:13px;font-weight:600;color:var(--fg);">${level.label}</span>
          <span style="font-size:11px;padding:1px 6px;border-radius:10px;background:var(--bg-muted);color:var(--fg-muted);">${items.length}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;min-height:80px;">
          ${cards || `<div style="text-align:center;padding:20px;font-size:12px;color:var(--fg-muted);border:1px dashed var(--border);border-radius:6px;">No disputes</div>`}
        </div>
      </div>
    `;
  });

  return `
    <div style="padding:16px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
        <h3 style="margin:0;font-size:15px;color:var(--fg);">QA Dispute Escalation Board</h3>
        <span style="font-size:12px;color:var(--fg-muted);">${cdState.data.length} total disputes</span>
      </div>
      <div style="display:flex;gap:16px;overflow-x:auto;padding-bottom:12px;">
        ${columns.join('')}
      </div>
    </div>
  `;
}

async function cdShowDisputeDetail(coachingId) {
  const overlay = document.getElementById('compass-disputes-detail-overlay');
  const body = document.getElementById('compass-disputes-detail-body');
  const footer = document.getElementById('compass-disputes-detail-footer');
  const title = document.getElementById('compass-disputes-detail-title');
  if (!overlay || !body) return;

  body.innerHTML = '<div style="text-align:center;padding:40px;"><div class="spinner"></div></div>';
  footer.innerHTML = '';
  overlay.style.display = 'flex';

  try {
    const resp = await fetch(`${CD_API}/coaching/${coachingId}`);
    if (!resp.ok) throw new Error('Not found');
    const log = await resp.json();
    title.textContent = `QA Dispute — ${log.coaching_id}`;

    const field = (label, val) => val ? `<div style="margin-bottom:8px;"><span style="font-size:11px;color:var(--fg-muted);text-transform:uppercase;">${label}</span><div style="font-size:14px;color:var(--fg);">${val}</div></div>` : '';
    const disputes = log.dispute_events || [];

    body.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div>
          ${field('Status', log.status)}
          ${field('Coachee', log.coachee_name)}
          ${field('Coach', log.coach_name)}
          ${field('Date', log.coaching_date)}
          ${field('Session Goals', log.session_goals)}
        </div>
        <div>
          ${field('RCA L1', log.rca_level_1)}
          ${field('RCA L2', log.rca_level_2)}
          ${field('Details', log.coaching_details)}
        </div>
      </div>
      ${disputes.length ? `
        <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);">
          <h4 style="font-size:13px;color:var(--fg-muted);margin:0 0 8px;">Escalation History</h4>
          ${disputes.map(d => `<div style="padding:8px 12px;margin-bottom:6px;background:var(--bg-muted);border-radius:6px;">
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--fg-muted);">
              <span>Level ${d.dispute_level} — ${d.action}</span>
              <span>${d.created_at || ''}</span>
            </div>
            <div style="font-size:13px;color:var(--fg);margin-top:2px;">${d.actor_name}: ${d.comments || ''}</div>
          </div>`).join('')}
        </div>
      ` : ''}
    `;

    // Determine available actions based on current status and user role
    const actions = [];
    const currentLevel = DISPUTE_LEVELS.findIndex(l => l.key === log.status);
    if (currentLevel >= 0 && currentLevel < DISPUTE_LEVELS.length - 1) {
      const nextLevel = DISPUTE_LEVELS[currentLevel + 1];
      // Escalate
      actions.push(`<button class="btn btn-primary btn-sm" onclick="cdEscalate('${coachingId}', ${currentLevel + 1}, '${nextLevel.key}')">Escalate to ${nextLevel.label}</button>`);
      // Resolve
      actions.push(`<button class="btn btn-outline btn-sm" onclick="cdResolve('${coachingId}', ${currentLevel + 1})">Resolve</button>`);
    }
    footer.innerHTML = actions.join(' ');
  } catch (err) {
    body.innerHTML = `<div style="text-align:center;padding:40px;color:var(--fg-muted);">${err.message}</div>`;
  }
}

function compassDisputesCloseDetail() {
  const overlay = document.getElementById('compass-disputes-detail-overlay');
  if (overlay) overlay.style.display = 'none';
}

async function cdEscalate(coachingId, level, newStatus) {
  const comments = prompt('Enter escalation comments:');
  if (comments === null) return;

  try {
    const resp = await fetch(`${CD_API}/coaching/${coachingId}/dispute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dispute_level: level,
        action: 'escalate',
        actor_ohr: currentUser.ohr_id,
        actor_name: currentUser.full_name,
        actor_role: currentUser.actual_role,
        comments,
        new_status: newStatus,
      }),
    });
    if (!resp.ok) throw new Error('Failed to escalate');
    showToast('Dispute escalated', 'success');
    compassDisputesCloseDetail();
    await initCompassDisputesView();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function cdResolve(coachingId, level) {
  const comments = prompt('Enter resolution comments:');
  if (comments === null) return;

  try {
    const resp = await fetch(`${CD_API}/coaching/${coachingId}/dispute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dispute_level: level,
        action: 'resolve',
        actor_ohr: currentUser.ohr_id,
        actor_name: currentUser.full_name,
        actor_role: currentUser.actual_role,
        comments,
        new_status: 'Resolved',
      }),
    });
    if (!resp.ok) throw new Error('Failed to resolve');
    showToast('Dispute resolved', 'success');
    compassDisputesCloseDetail();
    await initCompassDisputesView();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

function compassDisputesCloseAction() {
  const overlay = document.getElementById('compass-disputes-action-overlay');
  if (overlay) overlay.style.display = 'none';
}
