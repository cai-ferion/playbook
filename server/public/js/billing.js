/**
 * Playbook — Billing Compliance Page
 * Weekly Billing Compliance Report with target hours, goal calculations,
 * and conditional formatting.
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

/**
 * Generate all Friday week endings for the current year.
 * Weeks run Saturday → Friday.
 */
function getBillingWeekEndings() {
  const year = new Date().getFullYear();
  const weeks = [];
  const d = new Date(year, 0, 1);
  // Find first Friday (day 5)
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
  // Friday = 5; calculate days until next Friday
  const diff = (5 - day + 7) % 7;
  const fri = new Date(today);
  fri.setDate(today.getDate() + diff);
  return fri.getFullYear() + '-' + String(fri.getMonth() + 1).padStart(2, '0') + '-' + String(fri.getDate()).padStart(2, '0');
}

/**
 * Initialize the Billing Compliance page controls.
 */
function initBillingCompliance() {
  const select = document.getElementById('billing-week-select');
  if (!select) return;

  const weeks = getBillingWeekEndings();
  select.innerHTML = '<option value="">Select Week Ending</option>';
  for (const we of weeks) {
    const opt = document.createElement('option');
    opt.value = we;
    // Format as "MM/DD"
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
}

/**
 * Load and render the billing compliance report for the selected week.
 * Week runs Saturday (6 days before Friday) through Friday.
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
    // Week runs Saturday to Friday
    const friDate = new Date(selectedDate + 'T00:00:00');
    const satDate = new Date(friDate);
    satDate.setDate(friDate.getDate() - 6); // Saturday = Friday - 6
    const startISO = satDate.getFullYear() + '-' + String(satDate.getMonth() + 1).padStart(2, '0') + '-' + String(satDate.getDate()).padStart(2, '0');

    await ensureDataForRange(startISO, selectedDate);

    // We need to match records whose date falls within Saturday-Friday range
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

    // Group by billing_code
    const codeGroups = {};
    for (const r of weekRecords) {
      const code = (r.billingCode || '').trim();
      if (!code) continue;

      if (!codeGroups[code]) {
        codeGroups[code] = { forecastedP: 0, otRendered: 0, uplCount: 0, plCount: 0 };
      }

      const tag = getEffectiveTag(r.tag);
      if (tag === 'P' || tag === 'LATE') {
        codeGroups[code].forecastedP++;
      }
      if (tag === 'UPL') {
        codeGroups[code].uplCount++;
      }
      if (tag === 'PL') {
        codeGroups[code].plCount++;
      }
      if (r.ot && !isNaN(parseFloat(r.ot))) {
        codeGroups[code].otRendered += parseFloat(r.ot);
      }
    }

    // Build table data in the specified order — always show all billing codes
    // even for future weeks with no records yet (display zeros)
    const tableData = [];
    for (const code of BILLING_CODE_ORDER) {
      const data = codeGroups[code] || { forecastedP: 0, otRendered: 0, uplCount: 0, plCount: 0 };
      const deliveredHours = data.forecastedP * 7.5;
      const totalPayload = deliveredHours + data.otRendered;
      const targetHours = BILLING_TARGET_HOURS[code] !== undefined ? BILLING_TARGET_HOURS[code] : null;

      tableData.push({
        code,
        label: BILLING_CODE_LABELS[code] || code,
        forecastedP: data.forecastedP,
        otRendered: data.otRendered,
        deliveredHours,
        uplCount: data.uplCount,
        plCount: data.plCount,
        totalPayload,
        targetHours,
      });
    }

    // Also add any codes not in the predefined order (exclude SA, TR, SC, SV)
    const EXCLUDED_CODES = ['SA', 'TR', 'SC', 'SV', 'SR'];
    for (const [code, data] of Object.entries(codeGroups)) {
      if (!BILLING_CODE_ORDER.includes(code) && !EXCLUDED_CODES.includes(code)) {
        const deliveredHours = data.forecastedP * 7.5;
        const totalPayload = deliveredHours + data.otRendered;
        const targetHours = BILLING_TARGET_HOURS[code] !== undefined ? BILLING_TARGET_HOURS[code] : null;

        tableData.push({
          code,
          label: BILLING_CODE_LABELS[code] || code,
          forecastedP: data.forecastedP,
          otRendered: data.otRendered,
          deliveredHours,
          uplCount: data.uplCount,
          plCount: data.plCount,
          totalPayload,
          targetHours,
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
    const surplus = totalPayload - targetHours;
    return { text: `${surplus.toFixed(1)} hrs. surplus`, className: 'goal-surplus' };
  } else if (ratio < thresholdDecimal) {
    const remaining = neededForThreshold - totalPayload;
    return { text: `${remaining.toFixed(1)} hrs. until ${threshold}%`, className: 'goal-warning' };
  } else {
    return { text: 'Met', className: 'goal-met' };
  }
}

/**
 * Render the billing compliance data table.
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
    const goal101 = getGoalCell(row.totalPayload, row.targetHours, 101);

    let actualPct = '';
    let actualClass = '';
    if (row.targetHours !== null && row.targetHours > 0) {
      const pct = (row.totalPayload / row.targetHours) * 100;
      actualPct = pct.toFixed(1) + '%';
      if (pct > 100) actualClass = 'compliance-over';
    } else {
      actualPct = 'N/A';
      actualClass = 'compliance-na';
    }

    // Determine if any goal column has a deficit (goal-warning)
    const hasDeficit98 = goal98.className === 'goal-warning';
    const hasDeficit100 = goal100.className === 'goal-warning';
    const hasDeficit101 = goal101.className === 'goal-warning';
    const hasAnyDeficit = hasDeficit98 || hasDeficit100 || hasDeficit101;

    // For deficit highlighting: highlight from Billing Code through the first deficit threshold column
    // Column order: Code(0), ForecastedP(1), OTRendered(2), DeliveredHours(3), UPL(4), PL(5), Actual%(6), 98%(7), 100%(8), 101%(9)
    let deficitEndCol = -1;
    if (hasDeficit101) deficitEndCol = 9;
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
      <td class="cell-center${deficitClass(9)}"><span class="goal-badge ${goal101.className}">${goal101.text}</span></td>
    `;
    tbody.appendChild(tr);
  }

}
