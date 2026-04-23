/**
 * Playbook — Billing Compliance Dashboard
 * Server-driven compliance engine with KPI cards, traffic-light table,
 * progress bars, drill-down, and week selector.
 * Work week: Saturday → Friday (week_ending = Friday).
 */

// Tab switching removed — OT Dashboard is now a section below compliance table

// ===== State =====
let _billingWeeksLoaded = false;
let _billingLastData = null; // cached API response

// ===== Helpers =====
function fmtNum(n, dec) { return n != null ? Number(n).toFixed(dec ?? 1) : '—'; }
function fmtPct(n) { return n != null ? Number(n).toFixed(2) + '%' : '—'; }
function signedHrs(n) {
  if (n == null) return '—';
  const v = Number(n);
  if (v > 0) return '+' + v.toFixed(1) + ' hrs';
  if (v < 0) return v.toFixed(1) + ' hrs';
  return '0 hrs';
}

function complianceColor(pct) {
  if (pct >= 100) return 'bc-green';
  if (pct >= 95) return 'bc-amber';
  return 'bc-red';
}

function complianceBadgeHTML(pct) {
  const cls = complianceColor(pct);
  return `<span class="bc-badge ${cls}">${fmtPct(pct)}</span>`;
}

// Progress bar with 98/100/102 markers (labels removed to prevent overlap)
function progressBarHTML(pct, targetHours) {
  if (!targetHours || targetHours <= 0) return '<span style="color:var(--text-secondary);">N/A</span>';
  const capped = Math.min(pct, 110); // cap visual at 110%
  const barPct = (capped / 110) * 100;
  const m98 = (98 / 110) * 100;
  const m100 = (100 / 110) * 100;
  const m102 = (102 / 110) * 100;
  const barColor = pct >= 100 ? 'var(--bc-green)' : pct >= 95 ? 'var(--bc-amber)' : 'var(--bc-red)';
  return `<div class="bc-progress-wrap">
    <div class="bc-progress-track">
      <div class="bc-progress-fill" style="width:${barPct}%;background:${barColor};"></div>
      <div class="bc-marker" style="left:${m98}%;" title="98%"></div>
      <div class="bc-marker bc-marker-100" style="left:${m100}%;" title="100%"></div>
      <div class="bc-marker" style="left:${m102}%;" title="102%"></div>
    </div>
  </div>`;
}

// ===== Week Selector =====
async function initBillingWeekSelector() {
  const select = document.getElementById('billing-week-select');
  if (!select || _billingWeeksLoaded) return;
  try {
    const resp = await fetch(`${IO_API_BASE}/billing-compliance/weeks`);
    if (!resp.ok) throw new Error('Failed to load weeks');
    const weeks = await resp.json(); // array of 'YYYY-MM-DD' Fridays
    select.innerHTML = '<option value="">Select Week Ending</option>';
    for (const we of weeks) {
      const d = new Date(we + 'T00:00:00');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const opt = document.createElement('option');
      opt.value = we;
      opt.textContent = `${mm}/${dd}`;
      select.appendChild(opt);
    }
    // Default: current week ending (nearest Friday)
    const today = new Date();
    const day = today.getDay();
    const diff = (5 - day + 7) % 7;
    const fri = new Date(today);
    fri.setDate(today.getDate() + diff);
    const currentWE = fri.getFullYear() + '-' + String(fri.getMonth() + 1).padStart(2, '0') + '-' + String(fri.getDate()).padStart(2, '0');
    if ([...select.options].some(o => o.value === currentWE)) {
      select.value = currentWE;
    }
    _billingWeeksLoaded = true;
  } catch (e) {
    console.error('Failed to load billing weeks:', e);
  }
}

// ===== Main Init =====
async function initBillingCompliance() {
  await initBillingWeekSelector();
  await loadBillingCompliance();

  // Show Edit Targets button for owner, assistant, and managers
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  const BILLING_EDIT_OHRS = ['740045023', '740044909'];
  const effRole = typeof getEffectiveRole === 'function' ? getEffectiveRole() : (cu ? cu.actual_role : '');
  const effAdmin = typeof isEffectiveAdmin === 'function' ? isEffectiveAdmin() : (cu && cu.ohr_id === '740045023');
  const canEditTargets = cu && ((effAdmin && BILLING_EDIT_OHRS.includes(cu.ohr_id)) || cu.ohr_id === '740044909' || effRole === 'Manager');
  if (canEditTargets) {
    const editBtn = document.getElementById('billing-edit-targets-btn');
    if (editBtn) editBtn.style.display = '';
  }

  // OT Dashboard visibility check
  const OT_MECH_PGS = ['S-ABF', 'CS-ABF'];
  if (cu) {
    const OT_TAB_EXEMPT_OHRS = ['703212987', '740044909', '740045023', '740030270'];
    if (!OT_TAB_EXEMPT_OHRS.includes(cu.ohr_id)) {
      try {
        const empResp = await fetch(`${IO_API_BASE}/employees`);
        if (empResp.ok) {
          const allEmps = await empResp.json();
          const myEmp = allEmps.find(e => e.ohr_id === cu.ohr_id);
          if (myEmp && !OT_MECH_PGS.includes(myEmp.planning_group || '')) {
            const tabBar = document.querySelector('.billing-tab-bar');
            if (tabBar) tabBar.style.display = 'none';
            const billingTab = document.getElementById('billing-tab-billing-dashboard');
            if (billingTab) billingTab.style.display = '';
            const otTab = document.getElementById('billing-tab-ot-dashboard');
            if (otTab) otTab.style.display = 'none';
            return;
          }
        }
      } catch (e) {
        console.warn('Failed to check employee planning group:', e);
      }
    }
  }
  await otDashInit();
}

// ===== Load Compliance Data =====
async function loadBillingCompliance() {
  const select = document.getElementById('billing-week-select');
  const selectedDate = select ? select.value : '';
  if (!selectedDate) return;

  const loadingEl = document.getElementById('billing-compliance-loading');
  const tableEl = document.getElementById('billing-compliance-table');
  const kpiEl = document.getElementById('billing-kpi-cards');
  const weekInfoEl = document.getElementById('billing-week-info');

  if (loadingEl) loadingEl.style.display = 'flex';
  if (tableEl) tableEl.style.display = 'none';
  if (kpiEl) kpiEl.style.display = 'none';
  if (weekInfoEl) weekInfoEl.style.display = 'none';

  try {
    const resp = await fetch(`${IO_API_BASE}/billing-compliance?week_ending=${selectedDate}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    _billingLastData = data;

    renderBillingKPIs(data);
    renderBillingWeekInfo(data);
    renderBillingComplianceTable(data);

    if (kpiEl) kpiEl.style.display = '';
    if (weekInfoEl) weekInfoEl.style.display = '';
    if (tableEl) tableEl.style.display = 'block';
  } catch (err) {
    showToast('Error loading billing compliance: ' + err.message, 'error');
    console.error('Billing compliance error:', err);
  } finally {
    if (loadingEl) loadingEl.style.display = 'none';
  }
}

// ===== KPI Cards =====
function renderBillingKPIs(data) {
  const t = data.totals;

  // Total Compliance %
  const compVal = document.getElementById('kpi-compliance-value');
  const compSub = document.getElementById('kpi-compliance-sub');
  const compCard = document.getElementById('kpi-compliance');
  if (compVal) compVal.textContent = fmtPct(t.compliance_pct);
  if (compSub) compSub.textContent = `${fmtNum(t.total_billed, 0)} / ${fmtNum(t.target_hours, 0)} hrs`;
  if (compCard) {
    compCard.className = 'billing-kpi-card';
    compCard.classList.add(t.compliance_pct >= 100 ? 'kpi-good' : t.compliance_pct >= 95 ? 'kpi-warn' : 'kpi-bad');
  }

  // Hours Gap to 100%
  const gapVal = document.getElementById('kpi-hours-gap-value');
  const gapSub = document.getElementById('kpi-hours-gap-sub');
  const gapCard = document.getElementById('kpi-hours-gap');
  const gap = t.goal_to_100;
  if (gapVal) gapVal.textContent = signedHrs(gap);
  if (gapSub) gapSub.textContent = gap >= 0 ? 'Surplus' : 'Deficit';
  if (gapCard) {
    gapCard.className = 'billing-kpi-card';
    gapCard.classList.add(gap >= 0 ? 'kpi-good' : 'kpi-bad');
  }

  // OT Hours Needed
  const otVal = document.getElementById('kpi-ot-needed-value');
  const otSub = document.getElementById('kpi-ot-needed-sub');
  const otCard = document.getElementById('kpi-ot-needed');
  if (otVal) otVal.textContent = fmtNum(t.ots_needed, 1) + ' hrs';
  if (otSub) otSub.textContent = t.ots_needed > 0 ? 'To close gap' : 'No OT needed';
  if (otCard) {
    otCard.className = 'billing-kpi-card';
    otCard.classList.add(t.ots_needed > 0 ? 'kpi-warn' : 'kpi-good');
  }

  // HC Needed
  const hcVal = document.getElementById('kpi-hc-needed-value');
  const hcSub = document.getElementById('kpi-hc-needed-sub');
  const hcCard = document.getElementById('kpi-hc-needed');
  if (hcVal) hcVal.textContent = t.hc_needed > 0 ? t.hc_needed : '0';
  if (hcSub) hcSub.textContent = data.days_remaining > 0 ? `${data.days_remaining} day(s) remaining` : 'Week complete';
  if (hcCard) {
    hcCard.className = 'billing-kpi-card';
    hcCard.classList.add(t.hc_needed > 0 ? 'kpi-bad' : 'kpi-good');
  }
}

// ===== Week Info Bar =====
function renderBillingWeekInfo(data) {
  const rangeEl = document.getElementById('billing-week-range');
  const badgeEl = document.getElementById('billing-days-badge');
  if (rangeEl) {
    const ws = new Date(data.week_start + 'T00:00:00');
    const we = new Date(data.week_ending + 'T00:00:00');
    const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    rangeEl.textContent = `${fmt(ws)} — ${fmt(we)}`;
  }
  if (badgeEl) {
    const de = data.days_elapsed;
    const dr = data.days_remaining;
    if (data.is_completed_week) {
      badgeEl.textContent = 'Completed';
      badgeEl.style.background = 'rgba(22,163,74,0.12)';
      badgeEl.style.color = '#16a34a';
    } else if (data.is_current_week) {
      badgeEl.textContent = `Day ${de}/7 — ${dr} remaining`;
      badgeEl.style.background = 'rgba(59,130,246,0.12)';
      badgeEl.style.color = '#2563eb';
    } else {
      badgeEl.textContent = 'Future week';
      badgeEl.style.background = 'rgba(107,114,128,0.12)';
      badgeEl.style.color = '#6b7280';
    }
  }
}

// ===== Compliance Table =====
function renderBillingComplianceTable(data) {
  const tbody = document.getElementById('billing-compliance-body');
  if (!tbody) return;

  // Sort by compliance % ascending (worst first)
  const rows = [...data.compliance].sort((a, b) => a.compliance_pct - b.compliance_pct);

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="13" style="text-align:center;padding:40px;color:var(--fg-muted);">No billing data found for the selected week.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.className = 'bc-row';
    tr.style.cursor = 'pointer';
    tr.setAttribute('data-pg', r.planning_group);
    tr.setAttribute('data-role', r.role);
    tr.onclick = () => showBillingDrilldown(r);

    // Traffic light class for the row
    const tl = complianceColor(r.compliance_pct);

    // Goal columns: show signed delta, color-code
    const g98cls = r.goal_to_98 >= 0 ? 'bc-delta-pos' : 'bc-delta-neg';
    const g100cls = r.goal_to_100 >= 0 ? 'bc-delta-pos' : 'bc-delta-neg';
    const g102cls = r.goal_to_102 >= 0 ? 'bc-delta-pos' : 'bc-delta-neg';

    tr.innerHTML = `
      <td class="bc-label-cell">
        <span class="bc-tl-dot ${tl}"></span>
        <strong>${escapeHtml(r.label.replace(' × Any', ''))}</strong>
      </td>
      <td class="cell-center">${fmtNum(r.total_billed, 1)}</td>
      <td class="cell-center">${fmtNum(r.target_hours, 0)}</td>
      <td class="cell-center${r.upl_days > 0 ? ' bc-delta-neg' : ''}" style="font-weight:${r.upl_days > 0 ? '600' : '400'}">${r.upl_days || '—'}</td>
      <td class="cell-center${r.pl_days > 0 ? ' bc-delta-warn' : ''}" style="font-weight:${r.pl_days > 0 ? '600' : '400'}">${r.pl_days || '—'}</td>
      <td class="cell-center bc-compliance-cell">
        ${complianceBadgeHTML(r.compliance_pct)}
        ${progressBarHTML(r.compliance_pct, r.target_hours)}
      </td>
      <td class="cell-center ${g98cls}">${signedHrs(r.goal_to_98)}</td>
      <td class="cell-center ${g100cls}">${signedHrs(r.goal_to_100)}</td>
      <td class="cell-center ${g102cls}">${signedHrs(r.goal_to_102)}</td>
      <td class="cell-center" style="color:var(--text-secondary);font-style:italic;">${fmtNum(r.predictive_upl_hours, 0)}</td>
      <td class="cell-center" style="color:var(--text-secondary);font-style:italic;">${fmtNum(r.predictive_ot_hours, 0)}</td>
      <td class="cell-center" style="font-weight:600;${r.ots_needed > 0 ? 'color:var(--bc-red);' : ''}">${fmtNum(r.ots_needed, 1)}</td>
      <td class="cell-center" style="font-weight:600;${r.hc_needed > 0 ? 'color:var(--bc-red);' : ''}">${r.hc_needed}</td>
    `;
    tbody.appendChild(tr);
  }

  // Totals row
  const t = data.totals;
  const ttr = document.createElement('tr');
  ttr.className = 'bc-totals-row';
  const tg98cls = t.goal_to_98 >= 0 ? 'bc-delta-pos' : 'bc-delta-neg';
  const tg100cls = t.goal_to_100 >= 0 ? 'bc-delta-pos' : 'bc-delta-neg';
  const tg102cls = t.goal_to_102 >= 0 ? 'bc-delta-pos' : 'bc-delta-neg';
  ttr.innerHTML = `
    <td class="bc-label-cell"><strong>TOTAL</strong></td>
    <td class="cell-center"><strong>${fmtNum(t.total_billed, 1)}</strong></td>
    <td class="cell-center"><strong>${fmtNum(t.target_hours, 0)}</strong></td>
    <td class="cell-center"><strong>${t.upl_days || '—'}</strong></td>
    <td class="cell-center"><strong>${t.pl_days || '—'}</strong></td>
    <td class="cell-center">${complianceBadgeHTML(t.compliance_pct)}</td>
    <td class="cell-center ${tg98cls}"><strong>${signedHrs(t.goal_to_98)}</strong></td>
    <td class="cell-center ${tg100cls}"><strong>${signedHrs(t.goal_to_100)}</strong></td>
    <td class="cell-center ${tg102cls}"><strong>${signedHrs(t.goal_to_102)}</strong></td>
    <td class="cell-center">—</td>
    <td class="cell-center">—</td>
    <td class="cell-center" style="font-weight:700;${t.ots_needed > 0 ? 'color:var(--bc-red);' : ''}">${fmtNum(t.ots_needed, 1)}</td>
    <td class="cell-center" style="font-weight:700;${t.hc_needed > 0 ? 'color:var(--bc-red);' : ''}">${t.hc_needed}</td>
  `;
  tbody.appendChild(ttr);
}

// ===== Drill-Down =====
function showBillingDrilldown(row) {
  const panel = document.getElementById('billing-drilldown');
  const title = document.getElementById('billing-drilldown-title');
  const body = document.getElementById('billing-drilldown-body');
  if (!panel || !body) return;

  if (title) title.textContent = `DAILY BREAKDOWN — ${row.label.replace(' × Any', '')}`;
  panel.style.display = '';

  const days = row.day_breakdown || [];
  if (days.length === 0) {
    body.innerHTML = '<p style="padding:20px;text-align:center;color:var(--text-secondary);">No daily data available.</p>';
    return;
  }

  // Summary stats
  let html = `<div class="bc-drill-summary">
    <div class="bc-drill-stat"><span class="bc-drill-stat-label">Unique HC</span><span class="bc-drill-stat-value">${row.unique_hc}</span></div>
    <div class="bc-drill-stat"><span class="bc-drill-stat-label">Billable Days</span><span class="bc-drill-stat-value">${row.billable_days}</span></div>
    <div class="bc-drill-stat"><span class="bc-drill-stat-label">UPL Days</span><span class="bc-drill-stat-value" style="${row.upl_days > 0 ? 'color:var(--bc-red);' : ''}">${row.upl_days}</span></div>
    <div class="bc-drill-stat"><span class="bc-drill-stat-label">PL Days</span><span class="bc-drill-stat-value" style="${row.pl_days > 0 ? 'color:var(--bc-amber);' : ''}">${row.pl_days}</span></div>
    <div class="bc-drill-stat"><span class="bc-drill-stat-label">OT Hours</span><span class="bc-drill-stat-value">${fmtNum(row.ot_hours, 1)}</span></div>
  </div>`;

  // Daily table
  html += `<div style="overflow-x:auto;margin-top:12px;">
    <table class="data-table" style="width:100%;font-size:12px;">
      <thead><tr>
        <th style="text-align:left;">Date</th>
        <th style="text-align:center;">Day</th>
        <th style="text-align:center;">HC</th>
        <th style="text-align:center;">Billable</th>
        <th style="text-align:center;">UPL</th>
        <th style="text-align:center;">PL</th>
        <th style="text-align:center;">Delivered Hrs</th>
        <th style="text-align:center;">OT Hrs</th>
        <th style="text-align:center;">Total Billed</th>
      </tr></thead><tbody>`;

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let totalBilled = 0;
  for (const d of days) {
    const dt = new Date(d.date + 'T00:00:00');
    const dayName = dayNames[dt.getDay()];
    const dateStr = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    totalBilled += d.total_billed;
    html += `<tr>
      <td style="text-align:left;">${dateStr}</td>
      <td style="text-align:center;">${dayName}</td>
      <td style="text-align:center;">${d.headcount}</td>
      <td style="text-align:center;">${d.billable_days}</td>
      <td style="text-align:center;${d.upl_days > 0 ? 'color:var(--bc-red);font-weight:600;' : ''}">${d.upl_days || '—'}</td>
      <td style="text-align:center;${d.pl_days > 0 ? 'color:var(--bc-amber);font-weight:600;' : ''}">${d.pl_days || '—'}</td>
      <td style="text-align:center;">${fmtNum(d.delivered_hours, 1)}</td>
      <td style="text-align:center;${d.ot_hours > 0 ? 'color:var(--bc-green);font-weight:600;' : ''}">${d.ot_hours > 0 ? fmtNum(d.ot_hours, 1) : '—'}</td>
      <td style="text-align:center;font-weight:600;">${fmtNum(d.total_billed, 1)}</td>
    </tr>`;
  }

  // Running total
  html += `<tr style="border-top:2px solid var(--border);font-weight:700;">
    <td colspan="6" style="text-align:right;">Running Total</td>
    <td style="text-align:center;">${fmtNum(row.delivered_hours, 1)}</td>
    <td style="text-align:center;">${fmtNum(row.ot_hours, 1)}</td>
    <td style="text-align:center;">${fmtNum(row.total_billed, 1)}</td>
  </tr>`;

  html += '</tbody></table></div>';
  body.innerHTML = html;

  // Scroll to drill-down
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


// ============================================================
// OT Dashboard — Request Table, Approval, Open Form
// ============================================================

var OT_DASH = {
  requests: [],
  filteredRequests: [],
  selectedPg: '',
  planningGroups: []
};

async function otDashInit() {
  // Show approval controls for OM (740030270) and Senior Manager (703212987)
  const OT_APPROVER_OHRS = ['740030270', '703212987'];
  const approvalControls = document.getElementById('ot-dash-approval-controls');
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  if (approvalControls) {
    approvalControls.style.display = (cu && OT_APPROVER_OHRS.includes(cu.ohr_id)) ? 'flex' : 'none';
  }

  // Populate planning group dropdown from employees (S-ABF & CS-ABF only)
  const OT_DASH_PGS = ['S-ABF', 'CS-ABF'];
  try {
    const resp = await fetch(`${IO_API_BASE}/employees`);
    if (resp.ok) {
      const employees = await resp.json();
      const pgSet = new Set();
      employees.forEach(e => {
        if (e.planning_group && OT_DASH_PGS.includes(e.planning_group)) {
          pgSet.add(e.planning_group);
        }
      });
      OT_DASH.planningGroups = Array.from(pgSet).sort();
      const select = document.getElementById('ot-dash-pg-select');
      if (select) {
        let opts = '<option value="">— Select Planning Group —</option>';
        OT_DASH.planningGroups.forEach(pg => {
          opts += `<option value="${escapeAttr(pg)}">${escapeHtml(pg)}</option>`;
        });
        select.innerHTML = opts;
      }
    }
  } catch (e) {
    console.error('Failed to load planning groups for OT Dashboard:', e);
  }
  await otDashFetchRequests();
}

async function otDashFetchRequests() {
  try {
    const resp = await fetch(`${IO_API_BASE}/ot-requests`);
    if (!resp.ok) throw new Error('Failed to fetch OT requests');
    OT_DASH.requests = await resp.json();
    otDashApplyFilter();
  } catch (e) {
    console.error('Failed to fetch OT requests:', e);
    OT_DASH.requests = [];
    otDashApplyFilter();
  }
}

function otDashApplyFilter() {
  const pg = OT_DASH.selectedPg;
  if (pg) {
    OT_DASH.filteredRequests = OT_DASH.requests.filter(r => r.planning_group === pg);
  } else {
    OT_DASH.filteredRequests = [...OT_DASH.requests];
  }
  // Sort by submitted_at ascending (FIFO — earliest first)
  OT_DASH.filteredRequests.sort((a, b) => new Date(a.submitted_at || 0) - new Date(b.submitted_at || 0));
  otDashRender();
}

function otDashRender() {
  const tbody = document.getElementById('ot-dash-table-body');
  if (!tbody) return;

  // Update count badge
  const badge = document.getElementById('ot-dash-count-badge');
  if (badge) badge.textContent = OT_DASH.filteredRequests.length + ' request' + (OT_DASH.filteredRequests.length !== 1 ? 's' : '');

  if (OT_DASH.filteredRequests.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="ot-dash-empty">No OT requests found.</td></tr>';
    return;
  }

  let html = '';
  OT_DASH.filteredRequests.forEach(r => {
    const submittedDate = r.submitted_at ? new Date(r.submitted_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '—';
    const approvedDate = r.applied_date ? new Date(r.applied_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

    let statusLabel, statusCls;
    if (r.status === 'approved') {
      statusLabel = 'Approved'; statusCls = 'ot-status-approved';
    } else if (r.status === 'forfeited') {
      statusLabel = 'Forfeited'; statusCls = 'ot-status-rejected';
    } else {
      statusLabel = 'Waitlisted'; statusCls = 'ot-status-waitlisted';
    }

    html += `<tr>
      <td>${submittedDate}</td>
      <td>${escapeHtml(r.agent_name || '—')}</td>
      <td>${escapeHtml(r.planning_group || '—')}</td>
      <td style="text-align:center;"><span class="ot-status-badge ${statusCls}">${statusLabel}</span></td>
      <td>${approvedDate}</td>
    </tr>`;
  });
  tbody.innerHTML = html;
}

function otDashOnPgChange() {
  const select = document.getElementById('ot-dash-pg-select');
  OT_DASH.selectedPg = select ? select.value : '';

  // Enable/disable Apply button based on planning group selection
  const applyBtn = document.getElementById('ot-dash-apply-btn');
  if (applyBtn) {
    if (OT_DASH.selectedPg) {
      applyBtn.disabled = false;
      applyBtn.style.opacity = '1';
      applyBtn.style.cursor = 'pointer';
    } else {
      applyBtn.disabled = true;
      applyBtn.style.opacity = '0.5';
      applyBtn.style.cursor = 'not-allowed';
    }
  }

  otDashApplyFilter();
}

async function otDashApply() {
  const pg = OT_DASH.selectedPg;
  if (!pg) { showToast('Please select a Planning Group first', 'error'); return; }

  const hoursInput = document.getElementById('ot-dash-hours-input');
  const hours = hoursInput ? parseFloat(hoursInput.value) : 0;
  if (!hours || hours <= 0) { showToast('Please enter the number of OT hours needed', 'error'); return; }

  // Check if there are enough waitlisted hours to cover the request
  const waitlistedRequests = OT_DASH.filteredRequests.filter(r => r.status === 'pending');
  const totalWaitlistedHours = waitlistedRequests.length * 2.5;
  if (waitlistedRequests.length === 0) {
    showToast('No waitlisted OT commitments available. Please reopen the OT form to collect new commitments from agents.', 'error');
    return;
  }
  if (hours > totalWaitlistedHours) {
    showToast(`Insufficient waitlisted hours. Only ${totalWaitlistedHours} hour(s) available from ${waitlistedRequests.length} commitment(s). Please reopen the OT form to collect more commitments.`, 'error');
    return;
  }

  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;

  try {
    const resp = await fetch(`${IO_API_BASE}/ot-requests/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planning_group: pg,
        ot_hours_needed: hours,
        approved_by: cu ? cu.full_name : '',
        approved_by_ohr: cu ? cu.ohr_id : ''
      })
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to approve OT requests');
    }
    const result = await resp.json();
    let toastMsg = `Applied ${result.approved_count} request(s) — ${result.total_hours_approved} hours for ${pg}`;
    if (result.waitlisted_count > 0) {
      toastMsg += `. ${result.waitlisted_count} request(s) kept waitlisted (no available day).`;
    }
    showToast(toastMsg, 'success');

    // Clear hours input
    if (hoursInput) hoursInput.value = '';

    // Refresh the table
    await otDashFetchRequests();
  } catch (e) {
    showToast(e.message || 'Failed to approve OT requests', 'error');
  }
}

async function otDashOpenForm() {
  const pg = OT_DASH.selectedPg;
  if (!pg) { showToast('Please select a Planning Group first', 'error'); return; }

  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;

  try {
    const resp = await fetch(`${IO_API_BASE}/ot-requests/open-form`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planning_group: pg,
        opened_by: cu ? cu.full_name : '',
        opened_by_ohr: cu ? cu.ohr_id : ''
      })
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to open OT form');
    }
    const result = await resp.json();
    showToast(`OT form opened for ${pg} — ${result.notifications_sent} agent(s) notified`, 'success');
  } catch (e) {
    showToast(e.message || 'Failed to open OT form', 'error');
  }
}


// ===== Billing Targets Editor (Admin Only) =====
const BILLING_PG_ROLE_COMBOS = [
  { pg: 'S-ABF', role: 'Agent', label: 'S-ABF × Agent' },
  { pg: 'S-ABF', role: 'Operational SME', label: 'S-ABF × SME' },
  { pg: 'S-ABF', role: 'Quality & Policy Expert', label: 'S-ABF × QA' },
  { pg: 'CS-ABF', role: 'Agent', label: 'CS-ABF × Agent' },
  { pg: 'CS-ABF', role: 'Operational SME', label: 'CS-ABF × SME' },
  { pg: 'CS-ABF', role: 'Quality & Policy Expert', label: 'CS-ABF × QA' },
  { pg: 'RECALL_MEASUREMENT_CTR', role: 'Agent', label: 'RECALL_MEASUREMENT_CTR' },
  { pg: 'CSO_CTR', role: 'Agent', label: 'CSO_CTR' },
  { pg: 'FAD_CTR', role: 'Agent', label: 'FAD_CTR' },
  { pg: 'SME_CTR', role: '*', label: 'SME_CTR' },
  { pg: 'QPE_CTR', role: '*', label: 'QPE_CTR' },
];

async function openBillingTargetsEditor() {
  const editor = document.getElementById('billing-targets-editor');
  if (!editor) return;
  editor.style.display = '';

  const select = document.getElementById('billing-week-select');
  const weekEnding = select ? select.value : '';

  // Load current targets for the selected week (or carried-forward)
  let existingTargets = {};
  try {
    // Use the compliance API which already handles carry-forward
    if (_billingLastData && _billingLastData.compliance) {
      for (const r of _billingLastData.compliance) {
        existingTargets[`${r.planning_group}|${r.role}`] = {
          target_hc: Math.round(r.target_hours / 52.5) || 0, // approx HC from hours
          target_hours: r.target_hours
        };
      }
    }
    // Also try to get exact targets from the API
    const resp = await fetch(`${IO_API_BASE}/billing-targets-v2${weekEnding ? '?week_ending=' + weekEnding : ''}`);
    if (resp.ok) {
      const rows = await resp.json();
      for (const r of rows) {
        existingTargets[`${r.planning_group}|${r.role}`] = {
          target_hc: Number(r.target_hc) || 0,
          target_hours: Number(r.target_hours) || 0
        };
      }
    }
  } catch (e) {
    console.warn('Failed to load existing targets:', e);
  }

  const tbody = document.getElementById('billing-targets-edit-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  for (let i = 0; i < BILLING_PG_ROLE_COMBOS.length; i++) {
    const combo = BILLING_PG_ROLE_COMBOS[i];
    const key = `${combo.pg}|${combo.role}`;
    const existing = existingTargets[key] || { target_hours: 0 };
    const tr = document.createElement('tr');
    tr.className = 'billing-editor-row' + (i % 2 === 0 ? '' : ' billing-editor-row-alt');
    tr.innerHTML = `
      <td class="billing-editor-label">
        <span class="billing-editor-pg-badge">${escapeHtml(combo.label)}</span>
      </td>
      <td class="billing-editor-input-cell">
        <input type="number" class="billing-editor-input"
          data-pg="${combo.pg}" data-role="${combo.role}" data-field="target_hours"
          value="${existing.target_hours}" min="0" step="0.5">
      </td>
    `;
    tbody.appendChild(tr);
  }
}

function closeBillingTargetsEditor() {
  const editor = document.getElementById('billing-targets-editor');
  if (editor) editor.style.display = 'none';
}

async function saveBillingTargets() {
  const select = document.getElementById('billing-week-select');
  const weekEnding = select ? select.value : '';
  if (!weekEnding) {
    showToast('Please select a week ending first.', 'error');
    return;
  }

  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  const BILLING_SAVE_OHRS = ['740045023', '740044909'];
  const effRole2 = typeof getEffectiveRole === 'function' ? getEffectiveRole() : (cu ? cu.actual_role : '');
  const effAdmin2 = typeof isEffectiveAdmin === 'function' ? isEffectiveAdmin() : (cu && cu.ohr_id === '740045023');
  const canSaveTargets = cu && ((effAdmin2 && BILLING_SAVE_OHRS.includes(cu.ohr_id)) || cu.ohr_id === '740044909' || effRole2 === 'Manager');
  if (!canSaveTargets) {
    showToast('Only Managers and designated admins can edit billing targets.', 'error');
    return;
  }

  const inputs = document.querySelectorAll('#billing-targets-edit-body input[data-field]');
  const targetsByKey = {};
  for (const inp of inputs) {
    const pg = inp.getAttribute('data-pg');
    const role = inp.getAttribute('data-role');
    const field = inp.getAttribute('data-field');
    const key = `${pg}|${role}`;
    if (!targetsByKey[key]) targetsByKey[key] = { planning_group: pg, role, week_ending: weekEnding };
    targetsByKey[key][field] = Number(inp.value) || 0;
  }

  const targets = Object.values(targetsByKey);
  const saveBtn = document.getElementById('billing-targets-save-btn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

  try {
    const resp = await fetch(`${IO_API_BASE}/billing-targets-v2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Ohr': cu.ohr_id, 'X-User-Role': cu.actual_role || '' },
      body: JSON.stringify({ targets })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to save targets');
    }
    const result = await resp.json();
    showToast(`Billing targets saved for ${weekEnding} (${result.upserted} rows)`, 'success');
    closeBillingTargetsEditor();
    // Reload compliance data to reflect new targets
    await loadBillingCompliance();
  } catch (e) {
    showToast(e.message || 'Failed to save targets', 'error');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Targets'; }
  }
}
