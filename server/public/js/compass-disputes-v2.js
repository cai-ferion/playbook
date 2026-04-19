/**
 * Compass QA Disputes — Kanban board for QA Feedback dispute escalation.
 * 6-level escalation: SME → QA → SME → Trainer → SME → QTP Manager
 * Calls /api/io/compass/disputes and /api/io/compass/coaching/:id/dispute
 *
 * Features: Smooth FLIP-style card animations on column transitions,
 * staggered card entrance, and polished micro-interactions.
 */
/* global currentUser, showToast */

const CD_API = '/api/io/compass';

const DISPUTE_LEVELS = [
  { key: 'QA Dispute - LV1', label: 'LV1: SME Review', actor: 'Operational SME', color: '#6366f1' },
  { key: 'QA Dispute - LV2', label: 'LV2: QA Review', actor: 'QA', color: '#8b5cf6' },
  { key: 'QA Dispute - LV3', label: 'LV3: SME Rebuttal', actor: 'Operational SME', color: '#a855f7' },
  { key: 'QA Dispute - LV4', label: 'LV4: Trainer Review', actor: 'Trainer', color: '#d946ef' },
  { key: 'QA Dispute - LV5', label: 'LV5: SME Final', actor: 'Operational SME', color: '#ec4899' },
  { key: 'QA Dispute - LV6', label: 'LV6: QTP Manager', actor: 'Manager', color: '#f43f5e' },
  { key: 'Resolved', label: 'Resolved', actor: null, color: '#22c55e' },
];

let cdState = { data: [], prevPositions: {} };

// ── Inject animation CSS once ──
(function injectDisputeStyles() {
  if (document.getElementById('cd-anim-styles')) return;
  const style = document.createElement('style');
  style.id = 'cd-anim-styles';
  style.textContent = `
    @keyframes cd-card-enter {
      from { opacity: 0; transform: translateY(12px) scale(0.95); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes cd-card-fly-in {
      0%   { opacity: 0; transform: translateX(var(--cd-dx, -60px)) translateY(var(--cd-dy, 0px)) scale(0.9); }
      60%  { opacity: 1; transform: translateX(calc(var(--cd-dx, -60px) * -0.08)) translateY(calc(var(--cd-dy, 0px) * -0.08)) scale(1.02); }
      100% { opacity: 1; transform: translateX(0) translateY(0) scale(1); }
    }
    @keyframes cd-card-glow {
      0%   { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4); }
      50%  { box-shadow: 0 0 16px 4px rgba(99, 102, 241, 0.2); }
      100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
    }
    @keyframes cd-count-bump {
      0%   { transform: scale(1); }
      50%  { transform: scale(1.3); }
      100% { transform: scale(1); }
    }
    @keyframes cd-resolve-pulse {
      0%   { opacity: 0; transform: scale(0.8); }
      50%  { transform: scale(1.05); }
      100% { opacity: 1; transform: scale(1); }
    }
    .cd-card {
      background: var(--bg, #1a1a2e);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px;
      cursor: pointer;
      transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1),
                  border-color 0.2s ease,
                  box-shadow 0.2s ease;
      position: relative;
      overflow: hidden;
    }
    .cd-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0;
      width: 3px; height: 100%;
      background: var(--cd-accent, var(--accent, #6366f1));
      border-radius: 8px 0 0 8px;
      opacity: 0;
      transition: opacity 0.2s ease;
    }
    .cd-card:hover {
      transform: translateY(-2px) scale(1.01);
      border-color: var(--cd-accent, var(--accent, #6366f1));
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .cd-card:hover::before { opacity: 1; }
    .cd-card:active { transform: translateY(0) scale(0.99); }
    .cd-card.cd-entering {
      animation: cd-card-enter 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
    }
    .cd-card.cd-flying {
      animation: cd-card-fly-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) both,
                 cd-card-glow 0.8s ease-out 0.2s both;
    }
    .cd-card.cd-resolving {
      animation: cd-resolve-pulse 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
    }
    .cd-count-badge {
      font-size: 11px;
      padding: 1px 8px;
      border-radius: 10px;
      background: var(--bg-muted);
      color: var(--fg-muted);
      font-weight: 600;
      transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .cd-count-badge.cd-bumping {
      animation: cd-count-bump 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .cd-column-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 2px solid var(--cd-col-color, var(--border));
    }
    .cd-column-empty {
      text-align: center;
      padding: 24px 12px;
      font-size: 12px;
      color: var(--fg-muted);
      border: 1px dashed var(--border);
      border-radius: 8px;
      opacity: 0.6;
    }
  `;
  document.head.appendChild(style);
})();

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
    // Staggered entrance animation for initial load
    cdAnimateEntrance();
  } catch (err) {
    console.error('[Compass Disputes]', err);
    container.innerHTML = `<div style="text-align:center;padding:60px;color:var(--fg-muted);"><h3>Error loading disputes</h3><p>${err.message}</p></div>`;
  } finally {
    loading.style.display = 'none';
  }
}

// ── Capture card positions before re-render (FLIP: First) ──
function cdCapturePositions() {
  const positions = {};
  document.querySelectorAll('.cd-card[data-id]').forEach(el => {
    const rect = el.getBoundingClientRect();
    positions[el.dataset.id] = { x: rect.left, y: rect.top, col: el.closest('[data-col]')?.dataset.col };
  });
  cdState.prevPositions = positions;
}

// ── Animate cards after re-render (FLIP: Last, Invert, Play) ──
function cdAnimateTransitions() {
  const prev = cdState.prevPositions;
  document.querySelectorAll('.cd-card[data-id]').forEach(el => {
    const id = el.dataset.id;
    const old = prev[id];
    if (!old) {
      // New card — entrance animation
      el.classList.add('cd-entering');
      el.addEventListener('animationend', () => el.classList.remove('cd-entering'), { once: true });
      return;
    }

    const newRect = el.getBoundingClientRect();
    const dx = old.x - newRect.left;
    const dy = old.y - newRect.top;
    const colChanged = old.col !== el.closest('[data-col]')?.dataset.col;

    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      el.style.setProperty('--cd-dx', `${dx}px`);
      el.style.setProperty('--cd-dy', `${dy}px`);

      if (colChanged) {
        // Card moved to a different column — fly animation with glow
        const isResolved = el.closest('[data-col]')?.dataset.col === 'Resolved';
        el.classList.add(isResolved ? 'cd-resolving' : 'cd-flying');
        el.addEventListener('animationend', () => {
          el.classList.remove('cd-flying', 'cd-resolving');
        }, { once: true });
      } else {
        // Same column, just repositioned — subtle slide
        el.style.transition = 'none';
        el.style.transform = `translateX(${dx}px) translateY(${dy}px)`;
        requestAnimationFrame(() => {
          el.style.transition = 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)';
          el.style.transform = '';
        });
      }
    }
  });

  // Animate count badges that changed
  document.querySelectorAll('.cd-count-badge').forEach(badge => {
    badge.classList.add('cd-bumping');
    badge.addEventListener('animationend', () => badge.classList.remove('cd-bumping'), { once: true });
  });
}

// ── Staggered entrance for initial load ──
function cdAnimateEntrance() {
  document.querySelectorAll('.cd-card').forEach((el, i) => {
    el.style.animationDelay = `${i * 60}ms`;
    el.classList.add('cd-entering');
    el.addEventListener('animationend', () => {
      el.classList.remove('cd-entering');
      el.style.animationDelay = '';
    }, { once: true });
  });
}

function cdBuildKanbanHTML() {
  const columns = DISPUTE_LEVELS.map(level => {
    const items = cdState.data.filter(d => d.status === level.key);
    const cards = items.map(d => `
      <div class="cd-card" data-id="${d.coaching_id}" style="--cd-accent:${level.color};" onclick="cdShowDisputeDetail('${d.coaching_id}')">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-family:monospace;font-size:11px;color:var(--fg-muted);">${d.coaching_id}</span>
          <span style="font-size:10px;padding:2px 6px;border-radius:3px;background:var(--bg-muted);color:var(--fg-muted);">${d.coaching_type}</span>
        </div>
        <div style="font-size:13px;font-weight:600;color:var(--fg);margin-bottom:4px;">${d.coachee_name || 'Unknown'}</div>
        <div style="font-size:11px;color:var(--fg-muted);margin-bottom:2px;">Coach: ${d.coach_name || ''}</div>
        <div style="font-size:11px;color:var(--fg-muted);">Date: ${d.coaching_date || ''}</div>
      </div>
    `).join('');

    return `
      <div data-col="${level.key}" style="min-width:220px;max-width:280px;flex:1;">
        <div class="cd-column-header" style="--cd-col-color:${level.color};">
          <span style="font-size:13px;font-weight:600;color:var(--fg);">${level.label}</span>
          <span class="cd-count-badge">${items.length}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;min-height:80px;">
          ${cards || `<div class="cd-column-empty">No disputes</div>`}
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

    const field = (label, val) => val ? `<div style="margin-bottom:10px;"><span style="font-size:11px;color:var(--fg-muted);text-transform:uppercase;letter-spacing:0.3px;">${label}</span><div style="font-size:14px;color:var(--fg);margin-top:2px;">${val}</div></div>` : '';
    const disputes = log.dispute_events || [];

    // Build escalation timeline with connected dots
    let timeline = '';
    if (disputes.length) {
      const timelineItems = disputes.map((d, i) => {
        const isLast = i === disputes.length - 1;
        const levelInfo = DISPUTE_LEVELS.find(l => l.key === `QA Dispute - LV${d.dispute_level}`) || {};
        const dotColor = levelInfo.color || 'var(--accent)';
        return `
          <div style="display:flex;gap:12px;position:relative;">
            <div style="display:flex;flex-direction:column;align-items:center;min-width:20px;">
              <div style="width:10px;height:10px;border-radius:50%;background:${dotColor};flex-shrink:0;z-index:1;box-shadow:0 0 6px ${dotColor}40;"></div>
              ${!isLast ? `<div style="width:2px;flex:1;background:linear-gradient(${dotColor}, ${(DISPUTE_LEVELS.find(l => l.key === 'QA Dispute - LV' + disputes[i+1]?.dispute_level) || {}).color || 'var(--border)'});opacity:0.4;"></div>` : ''}
            </div>
            <div style="padding-bottom:${isLast ? '0' : '16px'};flex:1;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <span style="font-size:12px;font-weight:600;color:${dotColor};">Level ${d.dispute_level} — ${d.action === 'escalate' ? 'Escalated' : d.action === 'resolve' ? 'Resolved' : d.action}</span>
                <span style="font-size:10px;color:var(--fg-muted);">${d.created_at || ''}</span>
              </div>
              <div style="font-size:13px;color:var(--fg);">${d.actor_name}: ${d.comments || ''}</div>
            </div>
          </div>
        `;
      }).join('');

      timeline = `
        <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);">
          <h4 style="font-size:13px;color:var(--fg-muted);margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px;">Escalation Timeline</h4>
          <div style="padding-left:4px;">${timelineItems}</div>
        </div>
      `;
    }

    body.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div>
          ${field('Status', `<span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:50%;background:${(DISPUTE_LEVELS.find(l => l.key === log.status) || {}).color || 'var(--fg-muted)'};"></span>${log.status}</span>`)}
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
      ${timeline}
    `;

    // Determine available actions based on current status and user role
    const actions = [];
    const currentLevel = DISPUTE_LEVELS.findIndex(l => l.key === log.status);
    if (currentLevel >= 0 && currentLevel < DISPUTE_LEVELS.length - 1) {
      const nextLevel = DISPUTE_LEVELS[currentLevel + 1];
      actions.push(`<button class="btn btn-primary btn-sm" onclick="cdEscalate('${coachingId}', ${currentLevel + 1}, '${nextLevel.key}')">Escalate to ${nextLevel.label}</button>`);
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
    // Capture positions before the data changes (FLIP: First)
    cdCapturePositions();

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

    // Reload data and animate the transition
    const params = new URLSearchParams({ user_ohr: currentUser.ohr_id, user_role: currentUser.actual_role });
    const dataResp = await fetch(`${CD_API}/disputes?${params}`);
    if (dataResp.ok) {
      const result = await dataResp.json();
      cdState.data = result.data || [];
    }

    const container = document.getElementById('compass-disputes-content');
    if (container) {
      container.innerHTML = cdBuildKanbanHTML();
      // Animate the FLIP transition (Last, Invert, Play)
      cdAnimateTransitions();
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function cdResolve(coachingId, level) {
  const comments = prompt('Enter resolution comments:');
  if (comments === null) return;

  try {
    // Capture positions before the data changes (FLIP: First)
    cdCapturePositions();

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

    // Reload data and animate the transition
    const params = new URLSearchParams({ user_ohr: currentUser.ohr_id, user_role: currentUser.actual_role });
    const dataResp = await fetch(`${CD_API}/disputes?${params}`);
    if (dataResp.ok) {
      const result = await dataResp.json();
      cdState.data = result.data || [];
    }

    const container = document.getElementById('compass-disputes-content');
    if (container) {
      container.innerHTML = cdBuildKanbanHTML();
      cdAnimateTransitions();
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

function compassDisputesCloseAction() {
  const overlay = document.getElementById('compass-disputes-action-overlay');
  if (overlay) overlay.style.display = 'none';
}
