/**
 * Playbook — Billing Compliance Page
 * Weekly Billing Compliance Report with target hours, goal calculations,
 * YTD doughnut chart for 95% compliance, and UPL/LATE/PL trend analytics.
 * Week: Saturday start → Friday end
 */

// ===== Billing Tab Switching =====
function switchBillingTab(tabId) {
  // Hide all tab content
  document.querySelectorAll('.billing-tab-content').forEach(el => el.style.display = 'none');
  // Show selected tab
  const target = document.getElementById('billing-tab-' + tabId);
  if (target) target.style.display = '';
  // Update tab button styles
  document.querySelectorAll('.billing-tab-btn').forEach(btn => {
    const isActive = btn.dataset.tab === tabId;
    btn.classList.toggle('active', isActive);
    btn.style.color = isActive ? 'var(--fg)' : 'var(--text-secondary)';
    btn.style.borderBottomColor = isActive ? 'var(--accent)' : 'transparent';
  });
}

// ===== Billing Code Label Mapping (display order) =====
const BILLING_CODE_LABELS = {
  'MA': 'S-ABF [Agent]',
  'MS': 'S-ABF [SME]',
  'MQ': 'S-ABF [QA]',
  'CA': 'CS-ABF [Agent]',
  'CS': 'CS-ABF [SME]',
  'CQ': 'CS-ABF [QA]',
  'RM': 'RM [Agent]',
  'FA': 'FAD [Agent]',
  'SO': 'CSO [Agent]',
  'SM': 'SME_CTR',
  'QP': 'QPE_CTR',
};

// Ordered billing codes for display
const BILLING_CODE_ORDER = ['MA', 'MS', 'MQ', 'CA', 'CS', 'CQ', 'RM', 'FA', 'SO', 'SM', 'QP'];

// ===== Target Hours Mapping =====
const BILLING_TARGET_HOURS = {
  'MA': 3293, 'MS': 222, 'MQ': 148,
  'CA': 1665, 'CS': 111, 'CQ': 74,
  'SO': 185, 'FA': 185, 'RM': 5476,
  'SM': 407, 'QP': 222,
};

// Excluded statuses for billing compliance
const EXCLUDED_STATUSES = ['Nesting', 'Attrition Backfill Training', 'Exit'];

// Chart instances (for cleanup)
let billingDoughnutChart = null;
let billingUplTrendsChart = null;
let billingLateTrendsChart = null;
let billingPlTrendsChart = null;

// Track whether the billing dropdown has been initialized
let billingDropdownInitialized = false;

// YTD doughnut state
let _ytdWeeklyDataCache = null;
let _ytdWeekDayCountsCache = null;
let _ytdCurrentThreshold = 100;
let _ytdBreakdownVisible = false;

/**
 * Generate all Friday week endings for the current year.
 */
function getBillingWeekEndings() {
  const year = new Date().getFullYear();
  const weeks = [];
  const d = new Date(year, 0, 1);
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
  while (d.getFullYear() === year) {
    const we = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    weeks.push(we);
    d.setDate(d.getDate() + 7);
  }
  return weeks;
}

/**
 * Get the current Friday week ending for today's date.
 */
function getBillingCurrentWeekEnding() {
  const today = new Date();
  const day = today.getDay();
  const diff = (5 - day + 7) % 7;
  const fri = new Date(today);
  fri.setDate(today.getDate() + diff);
  return fri.getFullYear() + '-' + String(fri.getMonth() + 1).padStart(2, '0') + '-' + String(fri.getDate()).padStart(2, '0');
}

/**
 * Initialize the Billing Compliance page controls and auto-load current week.
 * Made async to properly await data loading on first visit.
 */
async function initBillingCompliance() {
  const select = document.getElementById('billing-week-select');
  if (!select) return;

  // Only build the dropdown once; on subsequent visits just reload data
  if (!billingDropdownInitialized) {
    const weeks = getBillingWeekEndings();
    select.innerHTML = '<option value="">Select Week Ending</option>';
    for (const we of weeks) {
      const opt = document.createElement('option');
      opt.value = we;
      const d = new Date(we + 'T00:00:00');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      opt.textContent = `${mm}/${dd}`;
      select.appendChild(opt);
    }

    // Default to current week ending
    const currentWE = getBillingCurrentWeekEnding();
    if ([...select.options].some(o => o.value === currentWE)) {
      select.value = currentWE;
    }
    billingDropdownInitialized = true;
  }

  // Load persisted target hours from server, then render the reference table
  await loadBillingTargetHours();
  renderBillingCodeReference();

  // Always load/reload the selected week's data (await to ensure rendering completes)
  await loadBillingCompliance();

  // Load YTD analytics: doughnut (per-week compliance) + trend charts
  loadBillingYTDAnalytics();

  // Hide tab bar for RECALL_MEASUREMENT_CTR employees
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  if (cu) {
    try {
      const empResp = await fetch(`${IO_API_BASE}/employees`);
      if (empResp.ok) {
        const allEmps = await empResp.json();
        const myEmp = allEmps.find(e => e.ohr_id === cu.ohr_id);
        if (myEmp && (myEmp.complete_planning_group || '').includes('RECALL_MEASUREMENT_CTR')) {
          // Hide tab bar — they only see the Billing Dashboard content without tabs
          const tabBar = document.querySelector('.billing-tab-bar');
          if (tabBar) tabBar.style.display = 'none';
          // Ensure Billing Dashboard tab is visible
          const billingTab = document.getElementById('billing-tab-billing-dashboard');
          if (billingTab) billingTab.style.display = '';
          const otTab = document.getElementById('billing-tab-ot-dashboard');
          if (otTab) otTab.style.display = 'none';
          return; // Skip OT Dashboard init
        }
      }
    } catch (e) {
      console.warn('Failed to check employee planning group:', e);
    }
  }

  // Initialize OT Dashboard
  await otDashInit();
}

/**
 * Load and render the billing compliance report for the selected week.
 */
async function loadBillingCompliance() {
  const select = document.getElementById('billing-week-select');
  const selectedDate = select ? select.value : '';
  if (!selectedDate) {
    showToast('Please select a week ending date.', 'info');
    return;
  }
  const loadingEl = document.getElementById('billing-compliance-loading');
  const tableEl = document.getElementById('billing-compliance-table');
  if (loadingEl) loadingEl.style.display = 'flex';
  if (tableEl) tableEl.style.display = 'none';
  try {
    const friDate = new Date(selectedDate + 'T00:00:00');
    const satDate = new Date(friDate);
    satDate.setDate(friDate.getDate() - 6);
    const startISO = satDate.getFullYear() + '-' + String(satDate.getMonth() + 1).padStart(2, '0') + '-' + String(satDate.getDate()).padStart(2, '0');
    await ensureDataForRange(startISO, selectedDate);
    const satTime = satDate.getTime();
    const friTime = friDate.getTime();
    const weekRecords = appState.records.filter(r => {
      if (!r.date) return false;
      const rDate = new Date(r.date + 'T00:00:00');
      const rTime = rDate.getTime();
      if (rTime < satTime || rTime > friTime) return false;
      if (EXCLUDED_STATUSES.includes(r.status)) return false;
      return true;
    });
    const codeGroups = {};
    for (const r of weekRecords) {
      const code = (r.billingCode || '').trim();
      if (!code) continue;
      if (!codeGroups[code]) {
        codeGroups[code] = { forecastedP: 0, otRendered: 0, uplCount: 0, plCount: 0 };
      }
      const tag = getEffectiveTag(r.tag);
      if (tag === 'P' || tag === 'LATE') codeGroups[code].forecastedP++;
      if (tag === 'UPL') codeGroups[code].uplCount++;
      if (tag === 'PL') codeGroups[code].plCount++;
      if (r.ot && !isNaN(parseFloat(r.ot))) codeGroups[code].otRendered += parseFloat(r.ot);
    }
    // Build compliance data for the doughnut chart from the selected week
    const weekComplianceData = Object.entries(codeGroups).map(([code, data]) => ({
      billing_code: code,
      forecasted_p: String(data.forecastedP),
      ot_rendered: data.otRendered,
    }));
    renderComplianceDoughnut(weekComplianceData);
    const tableData = [];
    for (const code of BILLING_CODE_ORDER) {
      const data = codeGroups[code] || { forecastedP: 0, otRendered: 0, uplCount: 0, plCount: 0 };
      const deliveredHours = data.forecastedP * 7.5;
      const totalPayload = deliveredHours + data.otRendered;
      const targetHours = BILLING_TARGET_HOURS[code] !== undefined ? BILLING_TARGET_HOURS[code] : null;
      tableData.push({
        code, label: BILLING_CODE_LABELS[code] || code,
        forecastedP: data.forecastedP, otRendered: data.otRendered,
        deliveredHours, uplCount: data.uplCount, plCount: data.plCount,
        totalPayload, targetHours,
      });
    }

    const EXCLUDED_CODES = ['SA', 'TR', 'SC', 'SV', 'SR', 'EX'];
    for (const [code, data] of Object.entries(codeGroups)) {
      if (!BILLING_CODE_ORDER.includes(code) && !EXCLUDED_CODES.includes(code)) {
        const deliveredHours = data.forecastedP * 7.5;
        const totalPayload = deliveredHours + data.otRendered;
        const targetHours = BILLING_TARGET_HOURS[code] !== undefined ? BILLING_TARGET_HOURS[code] : null;
        tableData.push({
          code, label: BILLING_CODE_LABELS[code] || code,
          forecastedP: data.forecastedP, otRendered: data.otRendered,
          deliveredHours, uplCount: data.uplCount, plCount: data.plCount,
          totalPayload, targetHours,
        });
      }
    }

    renderBillingComplianceTable(tableData);
  } catch (err) {
    showToast('Error loading billing compliance: ' + err.message, 'error');
  } finally {
    if (loadingEl) loadingEl.style.display = 'none';
    if (tableEl) tableEl.style.display = 'block';
  }
}

/**
 * Calculate goal cell content and CSS class.
 */
function getGoalCell(totalPayload, targetHours, threshold) {
  if (targetHours === null || targetHours === undefined || targetHours === 0) {
    return { text: 'N/A', className: 'goal-na' };
  }
  const ratio = totalPayload / targetHours;
  const thresholdDecimal = threshold / 100;
  const neededForThreshold = targetHours * thresholdDecimal;

  if (ratio > 1.05) {
    const surplus = Math.round(totalPayload - (1.05 * targetHours));
    return { text: `${surplus} hrs. surplus`, className: 'goal-surplus' };
  } else if (ratio < thresholdDecimal) {
    const remaining = Math.round(neededForThreshold - totalPayload);
    return { text: `${remaining} hrs. until ${threshold}%`, className: 'goal-warning' };
  } else {
    return { text: 'Met', className: 'goal-met' };
  }
}

/**
 * Render the billing compliance data table (with 98%, 100%, 102% goals).
 */
function renderBillingComplianceTable(tableData) {
  const tbody = document.getElementById('billing-compliance-body');
  const tableEl = document.getElementById('billing-compliance-table');
  if (!tbody || !tableEl) return;

  tableEl.style.display = 'block';

  if (tableData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--fg-muted);">No billing data found for the selected week.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  for (const row of tableData) {
    const goal98 = getGoalCell(row.totalPayload, row.targetHours, 98);
    const goal100 = getGoalCell(row.totalPayload, row.targetHours, 100);
    const goal102 = getGoalCell(row.totalPayload, row.targetHours, 102);

    let actualPct = '';
    let actualClass = '';
    if (row.targetHours !== null && row.targetHours > 0) {
      const pct = (row.totalPayload / row.targetHours) * 100;
      actualPct = pct.toFixed(2) + '%';
      if (pct > 100) actualClass = 'compliance-over';
    } else {
      actualPct = 'N/A';
      actualClass = 'compliance-na';
    }

    const hasDeficit98 = goal98.className === 'goal-warning';
    const hasDeficit100 = goal100.className === 'goal-warning';
    const hasDeficit102 = goal102.className === 'goal-warning';
    const hasAnyDeficit = hasDeficit98 || hasDeficit100 || hasDeficit102;

    let deficitEndCol = -1;
    if (hasDeficit102) deficitEndCol = 9;
    else if (hasDeficit100) deficitEndCol = 8;
    else if (hasDeficit98) deficitEndCol = 7;

    function deficitClass(colIdx) {
      return (hasAnyDeficit && colIdx >= 0 && colIdx <= deficitEndCol) ? ' billing-deficit-highlight' : '';
    }

    const tr = document.createElement('tr');
    if (hasAnyDeficit) tr.classList.add('billing-deficit-row');
    tr.innerHTML = `
      <td class="cell-code${deficitClass(0)}"><strong>${escapeHtml(row.label)}</strong></td>
      <td class="cell-center${deficitClass(1)}">${row.forecastedP}</td>
      <td class="cell-center${deficitClass(2)}">${row.otRendered > 0 ? row.otRendered.toFixed(1) : '0'}</td>
      <td class="cell-center${deficitClass(3)}">${row.deliveredHours.toFixed(1)}</td>
      <td class="cell-center${deficitClass(4)}">${row.uplCount || ''}</td>
      <td class="cell-center${deficitClass(5)}">${row.plCount || ''}</td>
      <td class="cell-center ${actualClass}${deficitClass(6)}"><strong>${actualPct}</strong></td>
      <td class="cell-center${deficitClass(7)}"><span class="goal-badge ${goal98.className}">${goal98.text}</span></td>
      <td class="cell-center${deficitClass(8)}"><span class="goal-badge ${goal100.className}">${goal100.text}</span></td>
      <td class="cell-center${deficitClass(9)}"><span class="goal-badge ${goal102.className}">${goal102.text}</span></td>
    `;
    tbody.appendChild(tr);
  }
}


// ===================================================================
// YTD ANALYTICS: Doughnut Chart + Reason Trends + 3-Month Prediction
// ===================================================================

/**
 * Load YTD billing analytics using server-side aggregation endpoints.
 * The doughnut chart uses per-week per-billing-code data to compute
 * the ratio: (PG-weeks passing threshold%) / (total PG-weeks YTD).
 * Trend charts use the monthly aggregation endpoint.
 */
async function loadBillingYTDAnalytics() {
  const year = new Date().getFullYear();

  try {
    // Fetch per-week per-billing-code data for YTD doughnut
    const weeklyResp = await fetch(`${IO_API_BASE}/attendance/billing-ytd-weekly?year=${year}`);
    if (!weeklyResp.ok) throw new Error(`HTTP ${weeklyResp.status}`);
    const weeklyResult = await weeklyResp.json();
    _ytdWeeklyDataCache = weeklyResult.weeks || [];
    _ytdWeekDayCountsCache = weeklyResult.weekDayCounts || {};
    renderYTDComplianceDoughnut(_ytdWeeklyDataCache, _ytdCurrentThreshold, _ytdWeekDayCountsCache);

    // Fetch monthly trends for UPL/LATE/PL charts
    const trendResp = await fetch(`${IO_API_BASE}/attendance/billing-ytd?year=${year}`);
    if (!trendResp.ok) throw new Error(`HTTP ${trendResp.status}`);
    const trendResult = await trendResp.json();
    const trends = trendResult.trends || [];
    renderReasonTrendsChartFromAgg(trends, 'UPL', 'billing-upl-trends-chart', 'billingUplTrendsChart');
    renderReasonTrendsChartFromAgg(trends, 'LATE', 'billing-late-trends-chart', 'billingLateTrendsChart');
    renderReasonTrendsChartFromAgg(trends, 'PL', 'billing-pl-trends-chart', 'billingPlTrendsChart');
  } catch (err) {
    console.error('Error loading YTD analytics:', err);
  }
}

/**
 * Switch the YTD doughnut threshold and re-render.
 */
function switchYTDThreshold(threshold) {
  _ytdCurrentThreshold = threshold;
  // Update button active state
  document.querySelectorAll('.billing-threshold-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.threshold) === threshold);
  });
  // Update title
  const titleEl = document.getElementById('billing-ytd-title');
  if (titleEl) titleEl.textContent = `YTD COMPLIANCE \u2014 ${threshold}% THRESHOLD`;
  // Re-render with cached data
  if (_ytdWeeklyDataCache) {
    renderYTDComplianceDoughnut(_ytdWeeklyDataCache, threshold, _ytdWeekDayCountsCache);
  }
}

/**
 * Toggle the weekly breakdown table visibility.
 */
function toggleYTDBreakdown() {
  const inner = document.getElementById('billing-ytd-breakdown-inner');
  if (!inner) return;
  _ytdBreakdownVisible = !_ytdBreakdownVisible;
  inner.style.display = _ytdBreakdownVisible ? 'block' : 'none';
  // Update toggle button text
  const btn = document.querySelector('.billing-ytd-toggle-btn');
  if (btn) btn.textContent = _ytdBreakdownVisible ? '\u25B2 Hide Weekly Breakdown' : '\u25BC Show Weekly Breakdown';
}

/**
 * Render the YTD compliance doughnut chart with configurable threshold.
 * Calculates: (count of PG-weeks passing threshold%) / (total PG-weeks YTD).
 * @param {Array} weeklyData - [{week_ending, billing_code, forecasted_p, ot_rendered}]
 * @param {number} threshold - compliance threshold percentage (98, 100, or 102)
 */
function renderYTDComplianceDoughnut(weeklyData, threshold, weekDayCounts) {
  threshold = threshold || 100;
  const thresholdDecimal = threshold / 100;
  weekDayCounts = weekDayCounts || {};
  const canvas = document.getElementById('billing-compliance-doughnut');
  const breakdownEl = document.getElementById('billing-ytd-breakdown');
  if (!canvas) return;

  // Group data by week_ending -> billing_code
  const byWeek = {};
  for (const r of weeklyData) {
    const we = r.week_ending;
    const code = (r.billing_code || '').trim();
    if (!code) continue;
    if (!byWeek[we]) byWeek[we] = {};
    byWeek[we][code] = {
      forecastedP: parseInt(r.forecasted_p) || 0,
      otRendered: parseFloat(r.ot_rendered) || 0,
    };
  }

  // Count passing/failing PG-weeks across all weeks
  let passing = 0;
  let failing = 0;
  const codeFailCount = {};
  const codeWeekCount = {};
  // Detailed breakdown: weekFailures[we] = [{code, pct}]
  const weekFailures = {};
  const weekResults = {}; // weekResults[we][code] = { pct, pass }
  const sortedWeeks = Object.keys(byWeek).sort();

  for (const we of sortedWeeks) {
    weekFailures[we] = [];
    weekResults[we] = {};
    // Pro-rate target hours for partial weeks (e.g., first/last week of year)
    const dayCount = parseInt(weekDayCounts[we]) || 7;
    const proRateFactor = dayCount / 7;
    for (const code of BILLING_CODE_ORDER) {
      const target = BILLING_TARGET_HOURS[code];
      if (!target) continue;
      const adjustedTarget = target * proRateFactor;
      const data = byWeek[we][code] || { forecastedP: 0, otRendered: 0 };
      const totalPayload = (data.forecastedP * 7.5) + data.otRendered;
      const pct = (totalPayload / adjustedTarget) * 100;
      if (!codeWeekCount[code]) codeWeekCount[code] = 0;
      if (!codeFailCount[code]) codeFailCount[code] = 0;
      codeWeekCount[code]++;
      const pass = pct >= threshold;
      weekResults[we][code] = { pct, pass };
      if (pass) {
        passing++;
      } else {
        failing++;
        codeFailCount[code]++;
        weekFailures[we].push({ code, pct });
      }
    }
  }

  // Destroy previous chart
  if (billingDoughnutChart) {
    billingDoughnutChart.destroy();
    billingDoughnutChart = null;
  }

  const total = passing + failing;
  const passPct = total > 0 ? ((passing / total) * 100).toFixed(1) : '0.0';
  const totalWeeks = sortedWeeks.length;

  billingDoughnutChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: [`Passing (${threshold}%)`, `Below ${threshold}%`],
      datasets: [{
        data: [passing, failing],
        backgroundColor: ['#22c55e', '#ef4444'],
        borderWidth: 2,
        borderColor: '#fff',
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '65%',
      plugins: {
        legend: { display: true, position: 'bottom', labels: { font: { size: 12 }, padding: 12 } },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              const val = ctx.raw;
              return `${ctx.label}: ${val} PG-week${val !== 1 ? 's' : ''}`;
            }
          }
        }
      }
    },
    plugins: [{
      id: 'centerText',
      afterDraw(chart) {
        const { ctx, chartArea } = chart;
        const cx = (chartArea.left + chartArea.right) / 2;
        const cy = (chartArea.top + chartArea.bottom) / 2;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 28px sans-serif';
        ctx.fillStyle = total > 0 && passing === total ? '#22c55e' : (failing > passing ? '#ef4444' : '#f59e0b');
        ctx.fillText(`${passPct}%`, cx, cy - 8);
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#6b7280';
        ctx.fillText(`${passing}/${total} PG-wks`, cx, cy + 14);
        ctx.restore();
      }
    }]
  });

  // Build weekly breakdown table (always visible, no toggle)
  if (breakdownEl) {
    function fmtWE(we) {
      const d = new Date(we + 'T00:00:00');
      return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
    }

    let html = '<div style="overflow:auto;" id="billing-ytd-breakdown-inner">';
    html += '<table class="billing-ytd-breakdown-table">';
    html += '<thead><tr><th class="ytd-sticky-col ytd-sticky-header" style="text-align:left;min-width:60px;z-index:3;">Week</th>';
    for (const code of BILLING_CODE_ORDER) {
      if (!BILLING_TARGET_HOURS[code]) continue;
      html += `<th class="ytd-sticky-header" title="${BILLING_CODE_LABELS[code] || code}">${code}</th>`;
    }
    html += '<th class="ytd-sticky-header">Score</th></tr></thead><tbody>';

    for (const we of sortedWeeks) {
      html += `<tr><td class="ytd-sticky-col" style="text-align:left;font-weight:600;white-space:nowrap;">${fmtWE(we)}</td>`;
      let weekPass = 0;
      let weekTotal = 0;
      for (const code of BILLING_CODE_ORDER) {
        if (!BILLING_TARGET_HOURS[code]) continue;
        const res = weekResults[we][code];
        weekTotal++;
        if (res && res.pass) {
          weekPass++;
          html += `<td class="ytd-pass" title="${(BILLING_CODE_LABELS[code] || code)}: ${res.pct.toFixed(1)}%">\u2713</td>`;
        } else {
          const pctStr = res ? res.pct.toFixed(1) + '%' : '0.0%';
          html += `<td class="ytd-fail" title="${(BILLING_CODE_LABELS[code] || code)}: ${pctStr}">${pctStr}</td>`;
        }
      }
      const weekPct = weekTotal > 0 ? ((weekPass / weekTotal) * 100).toFixed(0) : '0';
      const scoreClass = weekPass === weekTotal ? 'ytd-pass' : 'ytd-fail';
      html += `<td class="${scoreClass}">${weekPass}/${weekTotal}</td></tr>`;
    }

    html += '</tbody></table></div>';
    breakdownEl.innerHTML = html;
  }
}

/**
 * Render the selected-week compliance doughnut chart (called from loadBillingCompliance).
 * This is now a no-op — the doughnut always shows YTD data.
 * @param {Array} complianceData - [{billing_code, forecasted_p, ot_rendered}]
 */
function renderComplianceDoughnut(complianceData) {
  // The YTD doughnut is rendered separately by renderYTDComplianceDoughnut.
  // This function is intentionally a no-op now — the doughnut always shows YTD data.
  // The selected week's pass/fail is visible in the compliance table itself.
}

/**
 * Render a monthly reason trends line chart from pre-aggregated server data.
 * @param {Array} trendsData - [{tag, month, cnt}]
 * @param {string} tagFilter - 'UPL', 'LATE', or 'PL'
 * @param {string} canvasId - Canvas element ID
 * @param {string} chartVarName - Global variable name for chart instance
 */
function renderReasonTrendsChartFromAgg(trendsData, tagFilter, canvasId, chartVarName) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  // Destroy previous chart
  if (window[chartVarName]) {
    window[chartVarName].destroy();
    window[chartVarName] = null;
  }

  // Build month counts from aggregated data
  const monthCounts = {};
  for (const r of trendsData) {
    if (r.tag === tagFilter) {
      monthCounts[r.month] = parseInt(r.cnt) || 0;
    }
  }

  // Build sorted month labels from Jan to current month
  const year = new Date().getFullYear();
  const currentMonth = new Date().getMonth(); // 0-indexed
  const currentDay = new Date().getDate();
  const months = [];
  const counts = [];
  for (let m = 0; m <= currentMonth; m++) {
    const key = `${year}-${String(m + 1).padStart(2, '0')}`;
    months.push(key);
    counts.push(monthCounts[key] || 0);
  }

  // Separate completed months from the current (incomplete) month.
  // Only use completed months for regression to avoid skewing predictions.
  // A month is considered "complete" if it's before the current month,
  // or if we're on the last day of the current month.
  const isCurrentMonthComplete = currentDay >= 28 && currentMonth === new Date(year, currentMonth + 1, 0).getDate();
  const completedCounts = isCurrentMonthComplete ? [...counts] : counts.slice(0, -1);
  const hasPartialMonth = !isCurrentMonthComplete && counts.length > 0;

  // Linear regression on COMPLETED months only
  const nc = completedCounts.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < nc; i++) {
    sumX += i;
    sumY += completedCounts[i];
    sumXY += i * completedCounts[i];
    sumX2 += i * i;
  }
  const slope = nc > 1 ? (nc * sumXY - sumX * sumY) / (nc * sumX2 - sumX * sumX) : 0;
  const intercept = nc > 0 ? (sumY - slope * sumX) / nc : 0;

  // Prediction starts from the current month (if incomplete) or next month
  // If current month is incomplete, predict it + 2 more = 3 predicted months
  // If current month is complete, predict next 3 months
  const predStartIdx = hasPartialMonth ? nc : nc; // regression index for first prediction
  const predMonthStart = hasPartialMonth ? currentMonth : currentMonth + 1;
  const predCount = hasPartialMonth ? 3 : 3;

  const predictionMonths = [];
  const predictionCounts = [];
  for (let i = 0; i < predCount; i++) {
    const futureM = predMonthStart + i;
    const futureYear = year + Math.floor(futureM / 12);
    const futureMonth = futureM % 12;
    const key = `${futureYear}-${String(futureMonth + 1).padStart(2, '0')}`;
    predictionMonths.push(key);
    predictionCounts.push(Math.max(0, Math.round(slope * (predStartIdx + i) + intercept)));
  }

  // Format month labels as "Jan '26", etc.
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // For display: show completed months + prediction months
  // If there's a partial month, exclude it from actual and include it in prediction range
  const displayMonths = hasPartialMonth ? months.slice(0, -1) : months;
  const displayCounts = hasPartialMonth ? counts.slice(0, -1) : counts;
  const allLabelKeys = [...displayMonths, ...predictionMonths];
  const allLabels = allLabelKeys.map(m => {
    const parts = m.split('-');
    return monthNames[parseInt(parts[1]) - 1] + ' ' + parts[0].substring(2);
  });

  // Colors per tag
  const colors = {
    'UPL': { main: '#ef4444', pred: '#fca5a5' },
    'LATE': { main: '#f59e0b', pred: '#fcd34d' },
    'PL': { main: '#3b82f6', pred: '#93c5fd' },
  };
  const color = colors[tagFilter] || colors['UPL'];

  // Build datasets
  const nDisplay = displayCounts.length;
  const actualData = [...displayCounts, ...Array(predCount).fill(null)];
  // Prediction line connects from last actual point
  const predData = [...Array(nDisplay > 0 ? nDisplay - 1 : 0).fill(null), nDisplay > 0 ? displayCounts[nDisplay - 1] : 0, ...predictionCounts];

  window[chartVarName] = new Chart(canvas, {
    type: 'line',
    data: {
      labels: allLabels,
      datasets: [
        {
          label: `${tagFilter} Count (Actual)`,
          data: actualData,
          borderColor: color.main,
          backgroundColor: color.main + '20',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: color.main,
        },
        {
          label: `${tagFilter} Count (Predicted)`,
          data: predData,
          borderColor: color.pred,
          backgroundColor: 'transparent',
          borderDash: [6, 4],
          tension: 0.3,
          pointRadius: 4,
          pointStyle: 'triangle',
          pointBackgroundColor: color.pred,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'top', labels: { font: { size: 11 }, usePointStyle: true } },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              if (ctx.raw === null) return null;
              return `${ctx.dataset.label}: ${ctx.raw}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { precision: 0, font: { size: 11 } },
          grid: { color: 'rgba(0,0,0,0.06)' },
        },
        x: {
          ticks: { font: { size: 11 } },
          grid: { display: false },
        }
      }
    }
  });
}


// ===== Billing Code Reference Table with Editable Target Hours =====

async function loadBillingTargetHours() {
  try {
    const resp = await fetch(`${IO_API_BASE}/billing-target-hours`);
    if (!resp.ok) return;
    const data = await resp.json();
    // data is an array of [rows, fields] from mysql2 — rows is the first element
    const rows = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : data;
    for (const row of rows) {
      if (row.code) BILLING_TARGET_HOURS[row.code] = row.target_hours;
    }
  } catch (e) {
    console.warn('Failed to load billing target hours:', e);
  }
}

const BILLING_CODE_REF_DATA = [
  { pg: 'S-ABF', role: 'Agent', code: 'MA' },
  { pg: 'S-ABF', role: 'SME', code: 'MS' },
  { pg: 'S-ABF', role: 'QA', code: 'MQ' },
  { pg: 'S-ABF', role: 'TL', code: 'SA' },
  { pg: 'CS-ABF', role: 'Agent', code: 'CA' },
  { pg: 'CS-ABF', role: 'SME', code: 'CS' },
  { pg: 'CS-ABF', role: 'QA', code: 'CQ' },
  { pg: 'CS-ABF', role: 'TL', code: 'SC' },
  { pg: 'CSO_CTR', role: '(any)', code: 'SO' },
  { pg: 'FAD_CTR', role: '(any)', code: 'FA' },
  { pg: 'RM_CTR', role: '(any)', code: 'RM' },
  { pg: 'SME_CTR', role: '(any)', code: 'SM' },
  { pg: 'QPE_CTR', role: '(any)', code: 'QP' },
  { pg: '(any)', role: 'TL', code: 'SV' },
  { pg: '(any)', role: 'Trainer', code: 'TR' },
];

function renderBillingCodeReference() {
  const tbody = document.getElementById('billing-code-ref-body');
  if (!tbody) return;

  const isAdmin = typeof currentUser !== 'undefined' && currentUser && currentUser.ohr_id === '740045023';

  tbody.innerHTML = BILLING_CODE_REF_DATA.map(row => {
    const targetHrs = BILLING_TARGET_HOURS[row.code] ?? '';
    const targetCell = isAdmin
      ? `<td><input type="number" class="form-input form-input-sm billing-target-input" data-code="${escapeAttr(row.code)}" value="${targetHrs}" style="width:70px;padding:2px 6px;font-size:12px;text-align:right;" onchange="billingUpdateTargetHours('${escapeAttr(row.code)}', this.value)"></td>`
      : `<td style="text-align:right;">${targetHrs !== '' ? targetHrs.toLocaleString() : '—'}</td>`;
    return `<tr>
      <td>${escapeHtml(row.pg)}</td>
      <td>${escapeHtml(row.role)}</td>
      <td><strong>${escapeHtml(row.code)}</strong></td>
      ${targetCell}
    </tr>`;
  }).join('');
}

async function billingUpdateTargetHours(code, value) {
  const numVal = parseInt(value, 10);
  if (isNaN(numVal) || numVal < 0) {
    showToast('Please enter a valid positive number', 'error');
    return;
  }

  // Update the local mapping
  BILLING_TARGET_HOURS[code] = numVal;

  // Persist to server
  try {
    const resp = await fetch(`${IO_API_BASE}/billing-target-hours`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, target_hours: numVal })
    });
    if (!resp.ok) throw new Error('Failed to save');
    showToast(`Target hours for ${code} updated to ${numVal}`, 'success');

    // Reload the compliance table to reflect new target
    await loadBillingCompliance();
  } catch (e) {
    console.error('Failed to save target hours:', e);
    showToast('Failed to save target hours', 'error');
  }
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
  // Hide approval controls for non-OM users (only OHR 740030270 can see them)
  const OT_APPROVER_OHR = '740030270';
  const approvalControls = document.getElementById('ot-dash-approval-controls');
  const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
  if (approvalControls) {
    approvalControls.style.display = (cu && cu.ohr_id === OT_APPROVER_OHR) ? 'flex' : 'none';
  }

  // Populate planning group dropdown from employees (exclude RECALL_MEASUREMENT_CTR)
  try {
    const resp = await fetch(`${IO_API_BASE}/employees`);
    if (resp.ok) {
      const employees = await resp.json();
      const pgSet = new Set();
      employees.forEach(e => {
        if (e.planning_group && !(e.complete_planning_group || '').includes('RECALL_MEASUREMENT_CTR')) {
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

  if (OT_DASH.filteredRequests.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-secondary);">No OT requests found.</td></tr>';
    return;
  }

  let html = '';
  OT_DASH.filteredRequests.forEach(r => {
    const submittedDate = r.submitted_at ? new Date(r.submitted_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '—';
    const approvedDate = r.approved_at ? new Date(r.approved_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '—';
    const statusColor = r.status === 'approved' ? 'var(--accent)' : 'var(--fg)';
    const rowBg = r.status === 'approved' ? 'background:rgba(var(--accent-rgb, 46,125,50),0.06);' : '';

    const statusLabel = r.status === 'approved' ? 'Applied' : 'Waitlisted';
    const statusBadgeBg = r.status === 'approved' ? 'rgba(22,163,74,0.1)' : 'rgba(234,179,8,0.1)';
    const statusBadgeColor = r.status === 'approved' ? '#16a34a' : '#b45309';

    html += `<tr style="${rowBg}">
      <td style="padding:8px 12px;">${submittedDate}</td>
      <td style="padding:8px 12px;">${escapeHtml(r.agent_name || '—')}</td>
      <td style="padding:8px 12px;">${escapeHtml(r.planning_group || '—')}</td>
      <td style="padding:8px 12px;text-align:center;font-weight:600;">${r.requested_hours}</td>
      <td style="padding:8px 12px;text-align:center;"><span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;background:${statusBadgeBg};color:${statusBadgeColor};">${statusLabel}</span></td>
      <td style="padding:8px 12px;color:${statusColor};">${approvedDate}</td>
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
    showToast(`Approved ${result.total_approved} request(s) — ${result.total_hours_approved} hours for ${pg}`, 'success');

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
