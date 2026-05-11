/**
 * Role Change — Inline Contextual Flow
 * Integrated into Billing Compliance drilldown panel.
 * Access: Managers, Team Leads, Admin OHRs.
 *
 * Flow: Click PG row → Drilldown → "Do Assignment Change?" → Staff panel → Add to Queue → Generate Email
 */

// ── State ─────────────────────────────────────────────────────
let _rcInlineStaff = [];
let _rcQueue = []; // Array of { ohr_id, full_name, original_role, original_pg, new_role, new_pg, target_pg, target_role }
let _rcLastEmail = '';
let _rcLastSubject = '';
let _rcHistoryExpanded = false;

// PG options for the "New Role" dropdown in inline panel
const RC_PG_OPTIONS = [
  'S-ABF', 'CS-ABF', 'RECALL_MEASUREMENT_CTR', 'CSO_CTR', 'FAD_CTR', 'SME_CTR', 'QPE_CTR'
];

const RC_ROLE_OPTIONS = [
  'Agent', 'Operational SME', 'Quality & Policy Expert'
];

// ── Inline Panel: Open ───────────────────────────────────────
async function rcOpenInlinePanel() {
  const row = (typeof _currentDrilldownRow !== 'undefined') ? _currentDrilldownRow : null;
  if (!row) { showToast('No PG selected', 'warning'); return; }

  const panel = document.getElementById('rc-inline-panel');
  if (panel) panel.style.display = '';

  // Set context badge
  const badge = document.getElementById('rc-inline-context-badge');
  if (badge) badge.textContent = row.label.replace(' × Any', '');

  // Set context bar
  const pgEl = document.getElementById('rc-context-pg');
  const deficitEl = document.getElementById('rc-context-deficit');
  const hcEl = document.getElementById('rc-context-hc');
  if (pgEl) pgEl.innerHTML = `<strong>Fixing:</strong> ${escapeHtml(row.label.replace(' × Any', ''))}`;
  if (deficitEl) {
    const gap = row.goal_to_100;
    deficitEl.innerHTML = `<strong>Deficit:</strong> <span style="color:${gap < 0 ? 'var(--bc-red)' : 'var(--bc-green)'}">${gap < 0 ? gap.toFixed(1) : '+' + gap.toFixed(1)} hrs</span>`;
  }
  if (hcEl) hcEl.innerHTML = `<strong>HC Needed:</strong> <span style="color:${row.hc_needed > 0 ? 'var(--bc-red)' : 'inherit'}">${row.hc_needed}</span>`;

  // Load available staff filtered to EXCLUDE current PG
  await rcLoadInlineStaff(row.planning_group, row.role);

  // Scroll to panel
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Inline Panel: Close ──────────────────────────────────────
function rcCloseInlinePanel() {
  const panel = document.getElementById('rc-inline-panel');
  if (panel) panel.style.display = 'none';
}

// ── Load Staff (filtered by excluding target PG) ─────────────
async function rcLoadInlineStaff(targetPG, targetRole) {
  const body = document.getElementById('rc-inline-staff-body');
  if (!body) return;

  body.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:#9ca3af;">Loading available staff...</td></tr>';

  // Get week ending from billing selector
  const select = document.getElementById('billing-week-select');
  const weekEnding = select ? select.value : '';
  if (!weekEnding) {
    body.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:#ef4444;">No week selected</td></tr>';
    return;
  }

  // Derive date range
  const weDate = new Date(weekEnding + 'T00:00:00');
  const wsDate = new Date(weDate);
  wsDate.setDate(wsDate.getDate() - 6);
  const dateFrom = wsDate.getFullYear() + '-' + String(wsDate.getMonth() + 1).padStart(2, '0') + '-' + String(wsDate.getDate()).padStart(2, '0');
  const dateTo = weekEnding;

  try {
    const resp = await fetch(`${IO_API_BASE}/role-change/available-staff?week_ending=${weekEnding}&date_from=${dateFrom}&date_to=${dateTo}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    let staff = data.staff || [];

    // Filter: exclude staff who already match BOTH the target PG AND target role
    // e.g. for S-ABF × QA: exclude S-ABF staff who are already QAs, but keep S-ABF Agents/SMEs
    if (targetRole && targetRole !== '*') {
      staff = staff.filter(s => !(s.planning_group === targetPG && s.actual_role === targetRole));
    } else {
      staff = staff.filter(s => s.planning_group !== targetPG);
    }

    // Also filter out anyone already in the queue for this week
    const queuedOhrs = _rcQueue.map(q => q.ohr_id);
    staff = staff.map(s => ({
      ...s,
      already_queued: queuedOhrs.includes(s.ohr_id),
    }));

    _rcInlineStaff = staff;
    rcRenderInlineStaff(targetPG, targetRole);
  } catch (e) {
    console.error('Failed to load inline staff:', e);
    body.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:#ef4444;">Failed to load staff</td></tr>';
  }
}

// ── Render Inline Staff Table ────────────────────────────────
function rcRenderInlineStaff(targetPG, targetRole) {
  const body = document.getElementById('rc-inline-staff-body');
  if (!body) return;
  if (_rcInlineStaff.length === 0) {
    body.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:#9ca3af;">No staff available outside this PG</td></tr>';
    return;
  }
  // Update the Schedule column header with actual dates
  const headerEl = document.getElementById('rc-schedule-header');
  if (headerEl && _rcInlineStaff[0] && _rcInlineStaff[0].schedule) {
    const dayLetters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const dateCells = _rcInlineStaff[0].schedule.map((d) => {
      const dt = new Date(d.date + 'T00:00:00');
      const dayNum = dt.getDate();
      const dayLetter = dayLetters[dt.getDay()];
      return `<span style="display:inline-flex;flex-direction:column;align-items:center;width:24px;"><span style="font-size:8px;color:#9ca3af;font-weight:400;">${dayLetter}</span><span style="font-size:10px;font-weight:600;">${dayNum}</span></span>`;
    }).join('')
    headerEl.innerHTML = `Schedule<div style="display:flex;gap:3px;justify-content:center;margin-top:3px;">${dateCells}</div>`;
  }
  // Suggest the target role for the "New Role" dropdown
  const suggestedRole = targetRole === '*' ? 'Agent' : targetRole;
  // Color map for schedule codes
  const codeColors = {
    'SCH': { bg: '#dcfce7', text: '#166534', label: 'Scheduled' },
    'WO':  { bg: '#f3f4f6', text: '#6b7280', label: 'Work-Off' },
    'PL':  { bg: '#fef3c7', text: '#92400e', label: 'Planned Leave' },
    'UPL': { bg: '#fee2e2', text: '#991b1b', label: 'Unplanned Leave' },
    'ML':  { bg: '#fef3c7', text: '#92400e', label: 'Medical Leave' },
    'LOA': { bg: '#fef3c7', text: '#92400e', label: 'Leave of Absence' },
    'EXIT':{ bg: '#fee2e2', text: '#991b1b', label: 'Exit' },
    'RC':  { bg: '#dbeafe', text: '#1e40af', label: 'Role Changed' },
    '-':   { bg: '#f9fafb', text: '#d1d5db', label: 'No Data' },
  };
  body.innerHTML = _rcInlineStaff.map((s, idx) => {
    const isQueued = s.already_queued;
    // Staff is selectable unless already queued
    const disabled = isQueued ? 'disabled' : '';
    const roleOptions = RC_ROLE_OPTIONS.map(r =>
      `<option value="${r}" ${r === suggestedRole ? 'selected' : ''}>${r}</option>`
    ).join('');
    // Build the 7-day schedule strip
    const scheduleStrip = (s.schedule || []).map(day => {
      const c = codeColors[day.code] || codeColors['-'];
      const tooltip = day.detail ? `${c.label}: ${day.detail}` : c.label;
      return `<span class="rc-sched-cell" style="background:${c.bg};color:${c.text};" title="${tooltip}">${day.code}</span>`;
    }).join('');
    const rowClass = isQueued ? 'rc-row-unavailable' : '';
    const pgOptions = RC_PG_OPTIONS.map(p =>
      `<option value="${p}" ${p === targetPG ? 'selected' : ''}>${p}</option>`
    ).join('');
    return `<tr class="${rowClass}">
      <td style="text-align:center;"><input type="checkbox" class="rc-inline-check" data-idx="${idx}" ${disabled} onchange="rcInlineUpdateCount()"></td>
      <td style="font-weight:500;">${escapeHtml(s.full_name)}</td>
      <td style="font-family:monospace;font-size:12px;">${s.ohr_id}</td>
      <td>${s.actual_role}</td>
      <td>${s.planning_group || '—'}</td>
      <td style="text-align:center;">
        <div class="rc-sched-strip">${scheduleStrip}</div>
      </td>
      <td><select class="rc-inline-select" id="rc-inline-role-${idx}" ${disabled}>${roleOptions}</select></td>
      <td><select class="rc-inline-select" id="rc-inline-pg-${idx}" ${disabled}>${pgOptions}</select></td>
    </tr>`;
  }).join('');
  rcInlineUpdateCount();
}
// ── Select All Toggle ────────────────────────────────────────
function rcInlineToggleSelectAll() {
  const selectAll = document.getElementById('rc-inline-select-all');
  const checks = document.querySelectorAll('.rc-inline-check:not(:disabled)');
  checks.forEach(cb => { cb.checked = selectAll.checked; });
  rcInlineUpdateCount();
}

// ── Update Selected Count ────────────────────────────────────
function rcInlineUpdateCount() {
  const checks = document.querySelectorAll('.rc-inline-check:checked');
  const countEl = document.getElementById('rc-inline-selected-count');
  const bar = document.getElementById('rc-inline-action-bar');

  if (countEl) countEl.textContent = `${checks.length} selected`;
  if (bar) bar.style.display = checks.length > 0 ? 'flex' : 'none';
}

// ── Add to Queue ─────────────────────────────────────────────
function rcAddToQueue() {
  const row = _currentDrilldownRow;
  if (!row) return;

  const checks = document.querySelectorAll('.rc-inline-check:checked');
  if (checks.length === 0) {
    showToast('Select at least one staff member', 'warning');
    return;
  }

  const targetPG = row.planning_group;
  let added = 0;

  checks.forEach(cb => {
    const idx = parseInt(cb.dataset.idx);
    const staff = _rcInlineStaff[idx];
    if (!staff) return;

    const newRole = document.getElementById(`rc-inline-role-${idx}`)?.value || 'Agent';

    // Prevent duplicates
    if (_rcQueue.some(q => q.ohr_id === staff.ohr_id)) return;

    _rcQueue.push({
      ohr_id: staff.ohr_id,
      full_name: staff.full_name,
      original_role: staff.actual_role,
      original_pg: staff.planning_group,
      new_role: newRole,
      new_pg: targetPG,
      target_pg: targetPG,
      target_role: row.role,
    });
    added++;
  });

  if (added > 0) {
    showToast(`${added} staff added to queue`, 'success');
    rcUpdateQueueBar();
    // Re-render staff to mark queued ones
    rcRenderInlineStaff(row.planning_group, row.role);
    // Uncheck select-all
    const selectAll = document.getElementById('rc-inline-select-all');
    if (selectAll) selectAll.checked = false;
  }
}

// ── Queue Bar Update ─────────────────────────────────────────
function rcUpdateQueueBar() {
  const bar = document.getElementById('rc-queue-bar');
  const countEl = document.getElementById('rc-queue-count');

  if (bar) bar.style.display = _rcQueue.length > 0 ? '' : 'none';
  if (countEl) countEl.textContent = `${_rcQueue.length} role change(s) queued`;
}

// ── Queue Preview Modal ──────────────────────────────────────
function rcShowQueuePreview() {
  const modal = document.getElementById('rc-queue-modal');
  const body = document.getElementById('rc-queue-modal-body');
  if (!modal || !body) return;

  modal.style.display = '';

  if (_rcQueue.length === 0) {
    body.innerHTML = '<p style="text-align:center;padding:20px;color:#9ca3af;">Queue is empty</p>';
    return;
  }

  let html = `<table class="rc-table" style="width:100%;font-size:12px;">
    <thead><tr>
      <th>Name</th>
      <th>OHR</th>
      <th>From Role</th>
      <th>From PG</th>
      <th>→ New Role</th>
      <th>→ New PG</th>
      <th style="width:40px;"></th>
    </tr></thead><tbody>`;

  _rcQueue.forEach((q, idx) => {
    html += `<tr>
      <td style="font-weight:500;">${escapeHtml(q.full_name)}</td>
      <td style="font-family:monospace;font-size:11px;">${q.ohr_id}</td>
      <td>${q.original_role}</td>
      <td>${q.original_pg}</td>
      <td style="font-weight:600;color:var(--accent-primary, #3b82f6);">${q.new_role}</td>
      <td style="font-weight:600;color:var(--accent-primary, #3b82f6);">${q.new_pg}</td>
      <td style="text-align:center;">
        <button class="rc-btn rc-btn-ghost rc-btn-sm" onclick="rcRemoveFromQueue(${idx})" title="Remove" style="color:var(--bc-red);padding:2px 6px;">&times;</button>
      </td>
    </tr>`;
  });

  html += '</tbody></table>';
  body.innerHTML = html;
}

function rcCloseQueuePreview() {
  const modal = document.getElementById('rc-queue-modal');
  if (modal) modal.style.display = 'none';
}

function rcRemoveFromQueue(idx) {
  _rcQueue.splice(idx, 1);
  rcUpdateQueueBar();
  rcShowQueuePreview(); // re-render
  if (_rcQueue.length === 0) rcCloseQueuePreview();
}

function rcClearQueue() {
  if (_rcQueue.length > 0 && !confirm('Clear all queued role changes?')) return;
  _rcQueue = [];
  rcUpdateQueueBar();
  showToast('Queue cleared', 'info');
}

// ── Process Queue (Generate Email & Apply) ───────────────────
// ── Inline Confirmation Flow ─────────────────────────────────────
function rcShowProcessConfirm() {
  if (_rcQueue.length === 0) {
    showToast('Queue is empty', 'warning');
    return;
  }
  const select = document.getElementById('billing-week-select');
  const weekEnding = select ? select.value : '';
  if (!weekEnding) {
    showToast('No week selected', 'error');
    return;
  }
  const panel = document.getElementById('rc-queue-confirm-panel');
  const detail = document.getElementById('rc-confirm-detail');
  const footer = document.getElementById('rc-queue-modal-footer');
  if (detail) {
    detail.innerHTML = `This will:<br>• Create <strong>${_rcQueue.length}</strong> role change record(s)<br>• Update attendance records for WE <strong>${weekEnding}</strong><br>• Generate the email template`;
  }
  if (footer) footer.style.display = 'none';
  if (panel) panel.style.display = '';
}
function rcHideProcessConfirm() {
  const panel = document.getElementById('rc-queue-confirm-panel');
  const footer = document.getElementById('rc-queue-modal-footer');
  if (panel) panel.style.display = 'none';
  if (footer) footer.style.display = '';
}
function rcConfirmAndProcess() {
  rcHideProcessConfirm();
  rcCloseQueuePreview();
  rcProcessQueue();
}

async function rcProcessQueue() {
  if (_rcQueue.length === 0) {
    showToast('Queue is empty', 'warning');
    return;
  }

  const select = document.getElementById('billing-week-select');
  const weekEnding = select ? select.value : '';
  if (!weekEnding) {
    showToast('No week selected', 'error');
    return;
  }

  // Derive date range: start from today (shift date) to week ending
  const now = new Date();
  const dateFrom = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  const dateTo = weekEnding;

  // Build assignments from queue
  const assignments = _rcQueue.map(q => ({
    ohr_id: q.ohr_id,
    new_role: q.new_role,
    new_pg: q.new_pg,
    date_from: dateFrom,
    date_to: dateTo,
  }));
  rcCloseQueuePreview();

  try {
    const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
    const resp = await fetch(`${IO_API_BASE}/role-change/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-actor-ohr': cu?.ohr_id || '',
        'x-actor-name': cu?.full_name || '',
      },
      body: JSON.stringify({ week_ending: weekEnding, assignments }),
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    _rcLastEmail = data.email_html || '';
    _rcLastSubject = data.email_subject || '';

    // Show email result panel
    const resultPanel = document.getElementById('rc-email-result');
    if (resultPanel) resultPanel.style.display = '';

    // Render email preview
    const subjectEl = document.getElementById('rc-email-subject');
    if (subjectEl) subjectEl.textContent = `Subject: ${_rcLastSubject}`;

    const previewEl = document.getElementById('rc-email-preview');
    if (previewEl) previewEl.innerHTML = _rcLastEmail;

    // Show result summary
    const summaryEl = document.getElementById('rc-result-summary');
    if (summaryEl) {
      const totalAttRows = data.results.reduce((s, r) => s + (r.attendance_rows_updated || 0), 0);
      summaryEl.style.display = '';
      summaryEl.innerHTML = `
        <div class="rc-result-card">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <div>
            <div style="font-weight:600;color:#22c55e;">Successfully Generated</div>
            <div style="font-size:12px;color:#9ca3af;margin-top:2px;">${data.total_assignments} assignment change(s) created • ${totalAttRows} attendance row(s) updated</div>
          </div>
        </div>`;
    }

    showToast(`Email generated! ${data.total_assignments} assignment change(s) applied.`, 'success');

    // Clear queue
    _rcQueue = [];
    rcUpdateQueueBar();

    // Refresh history
    rcLoadHistoryForBilling();

    // Refresh compliance data
    if (typeof loadBillingCompliance === 'function') loadBillingCompliance();

    // Scroll to email result
    resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (e) {
    console.error('Generate email failed:', e);
    showToast(`Failed: ${e.message}`, 'error');
  }
}

// ── Clipboard Copy ────────────────────────────────────────────
async function rcCopyEmailHtml() {
  if (!_rcLastEmail) { showToast('No email to copy', 'warning'); return; }
  try {
    const blob = new Blob([_rcLastEmail], { type: 'text/html' });
    const item = new ClipboardItem({ 'text/html': blob, 'text/plain': new Blob([_rcLastEmail], { type: 'text/plain' }) });
    await navigator.clipboard.write([item]);
    showToast('Email HTML copied to clipboard! Paste directly into Outlook/Gmail.', 'success');
  } catch (e) {
    try {
      await navigator.clipboard.writeText(_rcLastEmail);
      showToast('HTML copied as text (rich paste not supported in this browser)', 'info');
    } catch (e2) {
      showToast('Failed to copy to clipboard', 'error');
    }
  }
}

async function rcCopyEmailPlainText() {
  if (!_rcLastEmail) { showToast('No email to copy', 'warning'); return; }
  const temp = document.createElement('div');
  temp.innerHTML = _rcLastEmail;
  const text = temp.textContent || temp.innerText || '';
  try {
    await navigator.clipboard.writeText(text);
    showToast('Plain text copied to clipboard!', 'success');
  } catch (e) {
    showToast('Failed to copy to clipboard', 'error');
  }
}

// ── History (collapsible at bottom of Billing Compliance) ────
function rcToggleHistory() {
  const bodyWrap = document.getElementById('rc-history-body-wrap');
  const chevron = document.getElementById('rc-history-chevron');
  if (!bodyWrap) return;

  _rcHistoryExpanded = !_rcHistoryExpanded;
  bodyWrap.style.display = _rcHistoryExpanded ? '' : 'none';
  if (chevron) chevron.style.transform = _rcHistoryExpanded ? 'rotate(180deg)' : '';

  if (_rcHistoryExpanded) {
    rcLoadHistoryForBilling();
  }
}

async function rcLoadHistoryForBilling() {
  const body = document.getElementById('rc-history-body');
  const countBadge = document.getElementById('rc-history-count');
  if (!body) return;
  const select = document.getElementById('billing-week-select');
  const weekEnding = select ? select.value : '';
  if (!weekEnding) {
    body.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:24px;color:#9ca3af;">Select a week to view history</td></tr>';
    return;
  }
  try {
    const resp = await fetch(`${IO_API_BASE}/role-change/history?week_ending=${weekEnding}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const history = data.history || [];
    // Count only active (non-reverted) records for the badge
    const activeCount = history.filter(h => !h.is_reverted).length;
    if (countBadge) countBadge.textContent = activeCount > 0 ? `${activeCount}` : '—';
    if (history.length === 0) {
      body.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:24px;color:#9ca3af;">No role changes for this week</td></tr>';
      return;
    }
    // Check if current user can revert
    const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
    const ADMIN_OHRS = window.ADMIN_OHRS || ['740045023', '740044909'];
    const canRevert = cu && (ADMIN_OHRS.includes(cu.ohr_id) || cu.actual_role === 'Manager' || cu.actual_role === 'Team Lead');

    body.innerHTML = history.map(h => {
      const genAt = h.email_generated_at ? new Date(h.email_generated_at).toLocaleString() : '—';
      const isReverted = h.is_reverted;
      const rowStyle = isReverted ? 'opacity:0.55;' : '';
      const statusHtml = isReverted
        ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:#ef4444;background:rgba(239,68,68,0.08);padding:2px 8px;border-radius:4px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            Reverted</span>`
        : `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:#22c55e;background:rgba(34,197,94,0.08);padding:2px 8px;border-radius:4px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            Active</span>`;
      let actionsHtml = '';
      if (canRevert && !isReverted) {
        actionsHtml = `<button class="rc-btn rc-btn-outline" style="font-size:11px;padding:3px 10px;color:#ef4444;border-color:rgba(239,68,68,0.3);" onclick="rcRevertRoleChange(${h.id}, '${(h.employee_name || '').replace(/'/g, "\\'")}')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          Revert</button>`;
      } else if (isReverted) {
        const revertedAt = h.reverted_at ? new Date(h.reverted_at).toLocaleString() : '';
        const revertedBy = h.reverted_by || '';
        actionsHtml = `<span style="font-size:10px;color:#9ca3af;" title="Reverted by ${revertedBy} at ${revertedAt}">by ${revertedBy.split(',')[0] || '—'}</span>`;
      }
      return `<tr style="${rowStyle}">
        <td style="font-weight:500;">${h.employee_name}</td>
        <td style="font-family:monospace;font-size:12px;">${h.ohr_id}</td>
        <td>${h.original_role}</td>
        <td>${h.original_pg}</td>
        <td style="font-weight:600;color:var(--accent-primary, #3b82f6);">${h.new_role}</td>
        <td style="font-weight:600;color:var(--accent-primary, #3b82f6);">${h.new_pg}</td>
        <td>${h.date_from} → ${h.date_to}</td>
        <td>${h.created_by || '—'}</td>
        <td style="font-size:11px;">${genAt}</td>
        <td>${statusHtml}</td>
        <td style="text-align:center;">${actionsHtml}</td>
      </tr>`;
    }).join('');
  } catch (e) {
    console.error('Failed to load role change history:', e);
    body.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:24px;color:#ef4444;">Failed to load history</td></tr>';
  }
}


// ── Revert a role change with inline confirmation ──
async function rcRevertRoleChange(id, employeeName) {
  // Show inline confirmation toast
  const toastEl = document.createElement('div');
  toastEl.className = 'toast-confirm-overlay';
  toastEl.innerHTML = `
    <div class="toast-confirm-card">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <span style="font-weight:600;font-size:14px;">Revert Assignment Change</span>
      </div>
      <p style="font-size:13px;color:var(--fg-muted, #5E6C84);margin-bottom:16px;">
        This will restore <strong>${employeeName}</strong>'s original role and planning group in attendance records. This action cannot be undone.
      </p>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="rc-btn rc-btn-outline" onclick="this.closest('.toast-confirm-overlay').remove()">Cancel</button>
        <button class="rc-btn" style="background:#ef4444;color:#fff;font-weight:600;" onclick="rcDoRevert(${id}, this)">Revert</button>
      </div>
    </div>`;
  document.body.appendChild(toastEl);
}

async function rcDoRevert(id, btnEl) {
  const overlay = btnEl.closest('.toast-confirm-overlay');
  btnEl.disabled = true;
  btnEl.textContent = 'Reverting...';
  try {
    const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
    const resp = await fetch(`${IO_API_BASE}/role-change/revert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-actor-ohr': cu ? cu.ohr_id : '',
        'x-actor-name': cu ? cu.full_name : '',
      },
      body: JSON.stringify({ id }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Revert failed');
    if (overlay) overlay.remove();
    showToast(`Reverted: ${data.employee_name} (${data.attendance_rows_reverted} attendance rows restored)`, 'success');
    rcLoadHistoryForBilling();
    // Refresh compliance data
    if (typeof loadBillingCompliance === 'function') loadBillingCompliance();
  } catch (e) {
    console.error('Revert failed:', e);
    if (overlay) overlay.remove();
    showToast(`Revert failed: ${e.message}`, 'error');
  }
}

// ── Visibility Gate (now controls "Do Assignment Change?" button visibility) ──
function initRoleChangeVisibility() {
  // No longer needed — button visibility is handled in showBillingDrilldown
  // Kept as no-op for backward compatibility
}
