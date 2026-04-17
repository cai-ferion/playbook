/**
 * Compass Dashboard — Analytics summary for coaching, CA cases, and disputes.
 * Calls /api/io/compass/analytics with user OHR and role for visibility-scoped data.
 */
/* global currentUser, showToast */

const COMPASS_API = '/api/io/compass';

async function initCompassDashboard() {
  const container = document.getElementById('compass-dash-content');
  const loading = document.getElementById('compass-dash-loading');
  if (!container) return;
  loading.style.display = 'flex';
  container.innerHTML = '';

  try {
    const params = new URLSearchParams({
      user_ohr: currentUser.ohr_id,
      user_role: currentUser.actual_role,
    });
    const resp = await fetch(`${COMPASS_API}/analytics?${params}`);
    if (!resp.ok) throw new Error('Failed to load analytics');
    const data = await resp.json();

    container.innerHTML = buildDashboardHTML(data);
  } catch (err) {
    console.error('[Compass Dashboard]', err);
    container.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--fg-muted);">
      <h3>Unable to load dashboard</h3>
      <p>${err.message}</p>
    </div>`;
  } finally {
    loading.style.display = 'none';
  }
}

function buildDashboardHTML(data) {
  const c = data.coaching || {};
  const ca = data.ca || {};

  return `
    <div style="padding:20px;max-width:1200px;">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:24px;">
        ${statCard('Total Coaching Logs', c.total, 'var(--accent, #6366f1)', 'compass-input')}
        ${statCard('Pending Acknowledgement', c.pending_ack, '#f59e0b', 'compass-input')}
        ${statCard('Active QA Disputes', c.active_disputes, '#ef4444', 'compass-disputes')}
        ${statCard('Total CA Cases', ca.total, '#8b5cf6', 'compass-ca')}
        ${statCard('Active CA Cases', ca.active, '#ec4899', 'compass-ca')}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
        <div style="background:var(--bg-card, #1e1e2e);border:1px solid var(--border, #333);border-radius:8px;padding:20px;">
          <h3 style="margin:0 0 12px;font-size:15px;color:var(--fg);font-weight:600;">Quick Actions</h3>
          <div style="display:flex;flex-direction:column;gap:8px;">
<button class="btn btn-primary btn-sm" onclick="switchView('compass-input'); setTimeout(compassShowNewForm, 300);" style="text-align:left;">
               <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
               New Coaching Log
             </button>
            ${currentUser.actual_role !== 'Agent' ? `<button class="btn btn-outline btn-sm" onclick="switchView('compass-ca')" style="text-align:left;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              New CA Case
            </button>` : ''}
            <button class="btn btn-outline btn-sm" onclick="switchView('compass-disputes')" style="text-align:left;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              View QA Disputes
            </button>
          </div>
        </div>

        <div style="background:var(--bg-card, #1e1e2e);border:1px solid var(--border, #333);border-radius:8px;padding:20px;">
          <h3 style="margin:0 0 12px;font-size:15px;color:var(--fg);font-weight:600;">Module Overview</h3>
          <div style="font-size:13px;color:var(--fg-muted);line-height:1.8;">
            <p><strong>Coaching Logs</strong> — Record and track coaching sessions (Incident Report, Follow-Up, Group, Triad, QA Feedback, ZTP).</p>
            <p><strong>QA Disputes</strong> — 6-level escalation board for QA feedback disputes.</p>
            <p><strong>CA Cases</strong> — Full corrective action lifecycle: incident &rarr; NTE &rarr; hearing &rarr; CAP &rarr; active period &rarr; closed.</p>
            <p><strong>AI Assistant</strong> — Advisory tool for CAP recommendations based on employee history and GPHR Policy v3.0.</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function statCard(label, value, color, targetView) {
  return `
    <div onclick="switchView('${targetView}')" style="background:var(--bg-card, #1e1e2e);border:1px solid var(--border, #333);border-radius:8px;padding:20px;cursor:pointer;transition:border-color 0.2s;" onmouseover="this.style.borderColor='${color}'" onmouseout="this.style.borderColor='var(--border, #333)'">
      <div style="font-size:28px;font-weight:700;color:${color};margin-bottom:4px;">${value ?? 0}</div>
      <div style="font-size:12px;color:var(--fg-muted);text-transform:uppercase;letter-spacing:0.5px;">${label}</div>
    </div>
  `;
}
