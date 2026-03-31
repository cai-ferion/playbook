/**
 * Playbook — Billing Compliance Page
 * Weekly Billing Compliance Report with target hours, goal calculations,
 * YTD doughnut chart for 95% compliance, and UPL/LATE/PL trend analytics.
 * Week: Saturday start → Friday end
 */

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

  // Also load YTD analytics (doughnut + trends)
  loadBillingYTDAnalytics();
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
 * Load YTD billing analytics using server-side aggregation endpoint.
 * Returns pre-computed compliance and trend data instead of fetching all records.
 */
async function loadBillingYTDAnalytics() {
  const year = new Date().getFullYear();

  try {
    const resp = await fetch(`${IO_API_BASE}/attendance/billing-ytd?year=${year}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const result = await resp.json();
    const compliance = result.compliance || [];
    const trends = result.trends || [];

    renderComplianceDoughnut(compliance);
    renderReasonTrendsChartFromAgg(trends, 'UPL', 'billing-upl-trends-chart', 'billingUplTrendsChart');
    renderReasonTrendsChartFromAgg(trends, 'LATE', 'billing-late-trends-chart', 'billingLateTrendsChart');
    renderReasonTrendsChartFromAgg(trends, 'PL', 'billing-pl-trends-chart', 'billingPlTrendsChart');
  } catch (err) {
    console.error('Error loading YTD analytics:', err);
  }
}

/**
 * Render the YTD compliance doughnut chart from pre-aggregated server data.
 * @param {Array} complianceData - [{billing_code, forecasted_p, ot_rendered}]
 */
function renderComplianceDoughnut(complianceData) {
  const canvas = document.getElementById('billing-compliance-doughnut');
  const legendEl = document.getElementById('billing-doughnut-legend');
  if (!canvas) return;

  // Build lookup from aggregated data
  const codeGroups = {};
  for (const r of complianceData) {
    const code = (r.billing_code || '').trim();
    if (!code) continue;
    codeGroups[code] = {
      forecastedP: parseInt(r.forecasted_p) || 0,
      otRendered: parseFloat(r.ot_rendered) || 0,
    };
  }

  let passing = 0;
  let failing = 0;
  const details = [];

  for (const code of BILLING_CODE_ORDER) {
    const target = BILLING_TARGET_HOURS[code];
    if (!target) continue;
    const data = codeGroups[code] || { forecastedP: 0, otRendered: 0 };
    const totalPayload = (data.forecastedP * 7.5) + data.otRendered;
    const pct = (totalPayload / target) * 100;
    if (pct >= 95) {
      passing++;
      details.push({ code, pct, status: 'pass' });
    } else {
      failing++;
      details.push({ code, pct, status: 'fail' });
    }
  }

  // Destroy previous chart
  if (billingDoughnutChart) {
    billingDoughnutChart.destroy();
    billingDoughnutChart = null;
  }

  const total = passing + failing;
  const passPct = total > 0 ? ((passing / total) * 100).toFixed(1) : '0.0';

  billingDoughnutChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Passing (\u226595%)', 'Below 95%'],
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
              return `${ctx.label}: ${val} code${val !== 1 ? 's' : ''}`;
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
        ctx.fillText(`${passing}/${total} codes`, cx, cy + 14);
        ctx.restore();
      }
    }]
  });

  // Legend details
  if (legendEl) {
    const failingCodes = details.filter(d => d.status === 'fail');
    if (failingCodes.length > 0) {
      legendEl.innerHTML = '<strong style="color:#ef4444;">Below 95%:</strong> ' +
        failingCodes.map(d => `${BILLING_CODE_LABELS[d.code] || d.code} (${d.pct.toFixed(1)}%)`).join(', ');
    } else {
      legendEl.innerHTML = '<strong style="color:#22c55e;">All billing codes are meeting the 95% threshold.</strong>';
    }
  }
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
  const months = [];
  const counts = [];
  for (let m = 0; m <= currentMonth; m++) {
    const key = `${year}-${String(m + 1).padStart(2, '0')}`;
    months.push(key);
    counts.push(monthCounts[key] || 0);
  }

  // Simple linear regression for 3-month prediction
  const n = counts.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += counts[i];
    sumXY += i * counts[i];
    sumX2 += i * i;
  }
  const slope = n > 1 ? (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX) : 0;
  const intercept = n > 0 ? (sumY - slope * sumX) / n : 0;

  // Generate 3 future months
  const predictionMonths = [];
  const predictionCounts = [];
  for (let i = 1; i <= 3; i++) {
    const futureM = currentMonth + i;
    const futureYear = year + Math.floor(futureM / 12);
    const futureMonth = futureM % 12;
    const key = `${futureYear}-${String(futureMonth + 1).padStart(2, '0')}`;
    predictionMonths.push(key);
    predictionCounts.push(Math.max(0, Math.round(slope * (n + i - 1) + intercept)));
  }

  // Format month labels as "Jan", "Feb", etc.
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const allLabels = [...months, ...predictionMonths].map(m => {
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
  const actualData = [...counts, ...Array(3).fill(null)];
  const predData = [...Array(n > 0 ? n - 1 : 0).fill(null), counts.length > 0 ? counts[counts.length - 1] : 0, ...predictionCounts];

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
