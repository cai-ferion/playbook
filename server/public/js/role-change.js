/**
 * Role Change Email Automation — Wizard Logic
 * Lives as a tab within Billing Compliance.
 * Access: Managers, Team Leads, Admin OHRs.
 */

// ── State ─────────────────────────────────────────────────────
let _rcDeficits = [];
let _rcStaff = [];
let _rcSuggestions = {};
let _rcLastEmail = '';
let _rcLastSubject = '';
let _rcInitialized = false;
let _rcDateFrom = '';
let _rcDateTo = '';

// PG options for the "New PG" dropdown
const RC_PG_OPTIONS = [
  'S-ABF', 'CS-ABF', 'RECALL_MEASUREMENT_CTR', 'CSO_CTR', 'FAD_CTR', 'SME_CTR', 'QPE_CTR'
];

// Role options for the "New Role" dropdown
const RC_ROLE_OPTIONS = [
  'Agent', 'Operational SME', 'Quality & Policy Expert'
];

// ── Tab Switching ─────────────────────────────────────────────
function switchBillingMainTab(tab) {
  const complianceTab = document.getElementById('billing-tab-compliance');
  const roleChangesTab = document.getElementById('billing-tab-role-changes');
  const complianceBtn = document.getElementById('billing-main-tab-compliance');
  const roleChangesBtn = document.getElementById('billing-main-tab-role-changes');

  if (tab === 'compliance') {
    if (complianceTab) complianceTab.style.display = '';
    if (roleChangesTab) roleChangesTab.style.display = 'none';
    if (complianceBtn) complianceBtn.classList.add('active');
    if (roleChangesBtn) roleChangesBtn.classList.remove('active');
  } else if (tab === 'role-changes') {
    if (complianceTab) complianceTab.style.display = 'none';
    if (roleChangesTab) roleChangesTab.style.display = '';
    if (complianceBtn) complianceBtn.classList.remove('active');
    if (roleChangesBtn) roleChangesBtn.classList.add('active');
    if (!_rcInitialized) initRoleChangeTab();
  }
}

// ── Helper: derive Sat–Fri date range from week ending (Friday) ──
function rcDeriveWeekDates(weekEnding) {
  const weDate = new Date(weekEnding + 'T00:00:00');
  const wsDate = new Date(weDate);
  wsDate.setDate(wsDate.getDate() - 6);
  return {
    dateFrom: wsDate.toISOString().slice(0, 10),
    dateTo: weekEnding,
  };
}

// ── Init ──────────────────────────────────────────────────────
async function initRoleChangeTab() {
  _rcInitialized = true;

  // Populate week selector (reuse billing weeks endpoint)
  // API returns a plain JSON array of YYYY-MM-DD strings
  try {
    const resp = await fetch(`${IO_API_BASE}/billing-compliance/weeks`);
    if (resp.ok) {
      const weeks = await resp.json();
      const select = document.getElementById('rc-week-select');
      if (select && Array.isArray(weeks) && weeks.length > 0) {
        select.innerHTML = '<option value="">Select Week Ending</option>';
        weeks.forEach(w => {
          // Format label as mm/dd for display, value stays YYYY-MM-DD
          const d = new Date(w + 'T00:00:00');
          const label = String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0');
          const opt = document.createElement('option');
          opt.value = w;
          opt.textContent = label;
          select.appendChild(opt);
        });
        // Default to the week ending closest to today (not in the future)
        const today = new Date().toISOString().slice(0, 10);
        const pastWeeks = weeks.filter(w => w <= today);
        const currentWE = pastWeeks.length > 0 ? pastWeeks[pastWeeks.length - 1] : weeks[0];
        select.value = currentWE;
        rcOnWeekChange();
      }
    }
  } catch (e) {
    console.error('Failed to load role change weeks:', e);
  }

  // Load suggestion map
  try {
    const resp = await fetch(`${IO_API_BASE}/role-change/suggest?week_ending=any`);
    if (resp.ok) {
      const data = await resp.json();
      _rcSuggestions = data.suggestions || {};
    }
  } catch (e) {
    console.warn('Failed to load suggestions:', e);
  }
}

// ── Step 1: Week Selection ────────────────────────────────────
function rcOnWeekChange() {
  const select = document.getElementById('rc-week-select');
  const we = select ? select.value : '';
  if (!we) return;

  // Derive full week dates from week ending
  const { dateFrom, dateTo } = rcDeriveWeekDates(we);
  _rcDateFrom = dateFrom;
  _rcDateTo = dateTo;

  const analyzeBtn = document.getElementById('rc-analyze-btn');
  if (analyzeBtn) analyzeBtn.disabled = false;

  // Load history for this week
  rcLoadHistory(we);
}

// ── Step 2: Analyze Deficits ──────────────────────────────────
async function rcAnalyze() {
  const we = document.getElementById('rc-week-select')?.value;
  if (!we) return;

  // Show step 2
  const step2 = document.getElementById('rc-step-2');
  const step3 = document.getElementById('rc-step-3');
  const step4 = document.getElementById('rc-step-4');
  if (step2) step2.style.display = '';
  if (step3) step3.style.display = '';
  if (step4) step4.style.display = 'none';

  // Fetch deficit analysis
  try {
    const resp = await fetch(`${IO_API_BASE}/role-change/deficit-analysis?week_ending=${we}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    _rcDeficits = data.deficits || [];
    rcRenderDeficits(data);
  } catch (e) {
    console.error('Deficit analysis failed:', e);
    showToast('Failed to load deficit analysis', 'error');
    return;
  }

  // Fetch available staff using derived dates
  try {
    const resp = await fetch(`${IO_API_BASE}/role-change/available-staff?week_ending=${we}&date_from=${_rcDateFrom}&date_to=${_rcDateTo}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    _rcStaff = data.staff || [];
    rcRenderStaff();
  } catch (e) {
    console.error('Available staff fetch failed:', e);
    showToast('Failed to load available staff', 'error');
  }
}

function rcRenderDeficits(data) {
  const body = document.getElementById('rc-deficit-body');
  const summary = document.getElementById('rc-deficit-summary');
  if (!body) return;

  const deficits = data.deficits || [];
  const inDeficit = deficits.filter(d => d.in_deficit);

  if (summary) {
    summary.textContent = inDeficit.length > 0
      ? `${inDeficit.length} PG(s) below 98% target`
      : 'All PGs at or above 98% target';
    summary.style.color = inDeficit.length > 0 ? 'var(--danger, #ef4444)' : 'var(--success, #22c55e)';
  }

  body.innerHTML = deficits.map(d => {
    const pct = d.compliance_pct;
    let badgeClass = 'rc-badge-success';
    let badgeText = 'On Track';
    if (pct < 98) { badgeClass = 'rc-badge-danger'; badgeText = 'Deficit'; }
    else if (pct < 100) { badgeClass = 'rc-badge-warning'; badgeText = 'At Risk'; }

    return `<tr class="${d.in_deficit ? 'rc-row-deficit' : ''}">
      <td style="font-weight:600;">${d.label}</td>
      <td style="text-align:center;">${d.target_hours.toLocaleString()}</td>
      <td style="text-align:center;">${d.total_billed.toLocaleString()}</td>
      <td style="text-align:center;">${pct.toFixed(1)}%</td>
      <td style="text-align:center;font-weight:600;color:${d.hours_gap > 0 ? 'var(--danger, #ef4444)' : 'var(--success, #22c55e)'};">${d.hours_gap > 0 ? '+' : ''}${d.hours_gap.toFixed(1)}</td>
      <td style="text-align:center;">${d.hc_needed}</td>
      <td style="text-align:center;"><span class="rc-badge ${badgeClass}">${badgeText}</span></td>
    </tr>`;
  }).join('');
}

// ── Step 3: Available Staff ───────────────────────────────────
function rcRenderStaff() {
  const body = document.getElementById('rc-staff-body');
  const staffSummary = document.getElementById('rc-staff-summary');
  if (!body) return;

  const available = _rcStaff.filter(s => s.is_available);
  if (staffSummary) {
    staffSummary.textContent = `${available.length} available of ${_rcStaff.length} total`;
  }

  // Find deficit PGs for auto-suggest
  const deficitPGs = _rcDeficits.filter(d => d.in_deficit).map(d => d.planning_group);

  body.innerHTML = _rcStaff.map((s, idx) => {
    const statusClass = s.is_available ? 'rc-badge-success' : (s.status === 'On Leave' ? 'rc-badge-warning' : 'rc-badge-muted');
    const disabled = !s.is_available ? 'disabled' : '';

    // Auto-suggest: pick the first deficit PG that's different from staff's current PG
    let suggestedPG = '';
    let suggestedRole = '';
    if (s.is_available && deficitPGs.length > 0) {
      const candidatePG = deficitPGs.find(pg => pg !== s.planning_group) || deficitPGs[0];
      suggestedPG = candidatePG;
      suggestedRole = _rcSuggestions[candidatePG] || 'Agent';
    }

    const pgOptions = RC_PG_OPTIONS.map(pg =>
      `<option value="${pg}" ${pg === suggestedPG ? 'selected' : ''}>${pg}</option>`
    ).join('');

    const roleOptions = RC_ROLE_OPTIONS.map(r =>
      `<option value="${r}" ${r === suggestedRole ? 'selected' : ''}>${r}</option>`
    ).join('');

    return `<tr class="${!s.is_available ? 'rc-row-unavailable' : ''}">
      <td style="text-align:center;"><input type="checkbox" class="rc-staff-check" data-idx="${idx}" ${disabled} onchange="rcUpdateSelectedCount()"></td>
      <td style="font-weight:500;">${s.full_name}</td>
      <td style="font-family:monospace;font-size:12px;">${s.ohr_id}</td>
      <td>${s.actual_role}</td>
      <td>${s.planning_group || '—'}</td>
      <td style="text-align:center;">
        <span class="rc-badge ${statusClass}">${s.status}</span>
        ${s.status_detail ? `<div style="font-size:10px;color:#9ca3af;margin-top:2px;">${s.status_detail}</div>` : ''}
      </td>
      <td><select class="rc-inline-select" id="rc-new-role-${idx}" ${disabled}>${roleOptions}</select></td>
      <td><select class="rc-inline-select" id="rc-new-pg-${idx}" ${disabled}>${pgOptions}</select></td>
    </tr>`;
  }).join('');

  rcUpdateSelectedCount();
}

function rcToggleSelectAll() {
  const selectAll = document.getElementById('rc-select-all');
  const checks = document.querySelectorAll('.rc-staff-check:not(:disabled)');
  checks.forEach(cb => { cb.checked = selectAll.checked; });
  rcUpdateSelectedCount();
}

function rcUpdateSelectedCount() {
  const checks = document.querySelectorAll('.rc-staff-check:checked');
  const countEl = document.getElementById('rc-selected-count');
  const bar = document.getElementById('rc-generate-bar');
  const btn = document.getElementById('rc-generate-btn');

  if (countEl) countEl.textContent = `${checks.length} selected`;
  if (bar) bar.style.display = checks.length > 0 ? 'flex' : 'none';
  if (btn) btn.disabled = checks.length === 0;
}

// ── Step 4: Generate Email & Update Attendance ────────────────
async function rcGenerateEmail() {
  const we = document.getElementById('rc-week-select')?.value;
  if (!we) return;

  const checks = document.querySelectorAll('.rc-staff-check:checked');
  if (checks.length === 0) {
    showToast('Please select at least one staff member', 'warning');
    return;
  }

  // Build assignments — dates derived from week ending
  const assignments = [];
  checks.forEach(cb => {
    const idx = parseInt(cb.dataset.idx);
    const staff = _rcStaff[idx];
    if (!staff) return;

    const newRole = document.getElementById(`rc-new-role-${idx}`)?.value || 'Agent';
    const newPG = document.getElementById(`rc-new-pg-${idx}`)?.value || '';

    assignments.push({
      ohr_id: staff.ohr_id,
      new_role: newRole,
      new_pg: newPG,
      date_from: _rcDateFrom,
      date_to: _rcDateTo,
    });
  });

  // Confirm
  if (!confirm(`This will:\n• Create ${assignments.length} role change record(s)\n• Update attendance records for WE ${we}\n• Generate the email template\n\nProceed?`)) {
    return;
  }

  const btn = document.getElementById('rc-generate-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Generating...'; }

  try {
    const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
    const resp = await fetch(`${IO_API_BASE}/role-change/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-actor-ohr': cu?.ohr_id || '',
        'x-actor-name': cu?.full_name || '',
      },
      body: JSON.stringify({ week_ending: we, assignments }),
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    _rcLastEmail = data.email_html || '';
    _rcLastSubject = data.email_subject || '';

    // Show step 4
    const step4 = document.getElementById('rc-step-4');
    if (step4) step4.style.display = '';

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
            <div style="font-size:12px;color:#9ca3af;margin-top:2px;">${data.total_assignments} role change(s) created • ${totalAttRows} attendance row(s) updated</div>
          </div>
        </div>`;
    }

    showToast(`Email generated! ${data.total_assignments} role change(s) applied.`, 'success');

    // Refresh history
    rcLoadHistory(we);

    // Scroll to email preview
    step4.scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (e) {
    console.error('Generate email failed:', e);
    showToast(`Failed: ${e.message}`, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Generate Email & Update Attendance'; }
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

// ── History ───────────────────────────────────────────────────
async function rcLoadHistory(weekEnding) {
  const body = document.getElementById('rc-history-body');
  if (!body) return;

  try {
    const resp = await fetch(`${IO_API_BASE}/role-change/history?week_ending=${weekEnding}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const history = data.history || [];

    if (history.length === 0) {
      body.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;color:#9ca3af;">No role changes for this week</td></tr>';
      return;
    }

    body.innerHTML = history.map(h => {
      const genAt = h.email_generated_at ? new Date(h.email_generated_at).toLocaleString() : '—';
      return `<tr>
        <td style="font-weight:500;">${h.employee_name}</td>
        <td style="font-family:monospace;font-size:12px;">${h.ohr_id}</td>
        <td>${h.original_role}</td>
        <td>${h.original_pg}</td>
        <td style="font-weight:600;color:var(--accent-primary, #3b82f6);">${h.new_role}</td>
        <td style="font-weight:600;color:var(--accent-primary, #3b82f6);">${h.new_pg}</td>
        <td>${h.date_from} → ${h.date_to}</td>
        <td>${h.created_by || '—'}</td>
        <td style="font-size:11px;">${genAt}</td>
      </tr>`;
    }).join('');
  } catch (e) {
    console.error('Failed to load role change history:', e);
    body.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;color:#ef4444;">Failed to load history</td></tr>';
  }
}

// ── Visibility Gate ───────────────────────────────────────────
function initRoleChangeVisibility() {
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  if (!cu) return;

  const ADMIN_OHRS = ['740045023', '740044909'];
  const isAdmin = ADMIN_OHRS.includes(cu.ohr_id);
  const isManager = cu.actual_role === 'Manager';
  const isTL = cu.actual_role === 'Team Lead';

  if (isAdmin || isManager || isTL) {
    const tabBtn = document.getElementById('billing-main-tab-role-changes');
    if (tabBtn) tabBtn.style.display = '';
    const tabBar = document.getElementById('billing-main-tabs');
    if (tabBar) tabBar.style.display = '';
  }
}
