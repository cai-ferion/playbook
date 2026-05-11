/**
 * Billing Compliance V2 — Page Logic
 * Handles the Billing Compliance V2 tab: week selector, compliance table, KPIs, and daily drilldown.
 */

let billingV2Data = null; // cached response from /api/io/billing-compliance-v2

// ============================================================
// Initialization
// ============================================================

async function initBillingComplianceV2() {
  try {
    const resp = await fetch(`${IO_API_BASE}/billing-compliance-v2/weeks`);
    const weeks = await resp.json();
    const select = document.getElementById('billing-v2-week-select');
    if (!select) return;
    select.innerHTML = '<option value="">Select Week Ending</option>';
    for (const we of weeks) {
      const opt = document.createElement('option');
      opt.value = we;
      // Format: "Apr 05, 2026" style
      const d = new Date(we + 'T00:00:00Z');
      opt.textContent = we + ' (' + d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ')';
      select.appendChild(opt);
    }

    // Auto-select the most relevant week (current or most recent past Saturday)
    if (weeks.length > 0) {
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      // Find the week ending closest to today (past or current)
      let bestWe = weeks[0];
      for (const we of weeks) {
        if (we <= todayStr) { bestWe = we; break; }
        bestWe = we;
      }
      select.value = bestWe;
      await loadBillingComplianceV2();
    }
  } catch (err) {
    console.error('initBillingComplianceV2 error:', err);
  }
}

// ============================================================
// Load Compliance Data
// ============================================================

async function loadBillingComplianceV2() {
  const we = document.getElementById('billing-v2-week-select').value;
  if (!we) {
    document.getElementById('billing-v2-empty').style.display = 'block';
    document.getElementById('billing-v2-table-container').style.display = 'none';
    document.getElementById('billing-v2-kpis').style.display = 'none';
    document.getElementById('billing-v2-drilldown').style.display = 'none';
    return;
  }

  document.getElementById('billing-v2-empty').style.display = 'none';
  document.getElementById('billing-v2-loading').style.display = 'flex';
  document.getElementById('billing-v2-table-container').style.display = 'none';
  document.getElementById('billing-v2-kpis').style.display = 'none';
  document.getElementById('billing-v2-drilldown').style.display = 'none';

  try {
    const resp = await fetch(`${IO_API_BASE}/billing-compliance-v2?week_ending=${we}`);
    const data = await resp.json();
    if (data.error) throw new Error(data.error);

    billingV2Data = data;
    renderBillingV2KPIs(data);
    renderBillingV2Table(data);

    // Freshness indicator
    const freshEl = document.getElementById('billing-v2-freshness');
    freshEl.textContent = `Week: ${data.week_start} to ${data.week_ending}`;

    document.getElementById('billing-v2-loading').style.display = 'none';
    document.getElementById('billing-v2-table-container').style.display = 'block';
    document.getElementById('billing-v2-kpis').style.display = 'block';
  } catch (err) {
    console.error('loadBillingComplianceV2 error:', err);
    document.getElementById('billing-v2-loading').style.display = 'none';
    document.getElementById('billing-v2-empty').style.display = 'block';
    document.getElementById('billing-v2-empty').innerHTML = `<p style="color:#dc2626;">Error loading data: ${err.message}</p>`;
  }
}

// ============================================================
// Render KPIs
// ============================================================

function renderBillingV2KPIs(data) {
  const t = data.totals;
  document.getElementById('v2-kpi-target-hc').textContent = t.target_hc;
  document.getElementById('v2-kpi-production-hc').textContent = t.production_hc;
  document.getElementById('v2-kpi-target-hrs').textContent = Number(t.target_hours).toLocaleString();
  document.getElementById('v2-kpi-payload').textContent = Number(t.total_payload).toLocaleString();

  const gapEl = document.getElementById('v2-kpi-gap');
  gapEl.textContent = (t.gap_hours > 0 ? '-' : '+') + Math.abs(t.gap_hours).toLocaleString();
  gapEl.style.color = t.gap_hours > 0 ? '#dc2626' : '#16a34a';
}

// ============================================================
// Render Compliance Table
// ============================================================

function renderBillingV2Table(data) {
  const tbody = document.getElementById('billing-v2-compliance-body');
  const tfoot = document.getElementById('billing-v2-compliance-foot');
  tbody.innerHTML = '';
  tfoot.innerHTML = '';

  for (let i = 0; i < data.compliance.length; i++) {
    const row = data.compliance[i];
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.onclick = () => openBillingV2Drilldown(i);

    const statusClass = row.status === 'MET' ? 'color:#16a34a;font-weight:600;' : 'color:#dc2626;font-weight:600;';
    const gapClass = row.gap_hours > 0 ? 'color:#dc2626;' : 'color:#16a34a;';
    const payloadVsTarget = row.total_payload >= row.target_hours;

    // Highlight row if behind target
    if (row.status === 'BEHIND' && row.target_hours > 0) {
      tr.style.background = 'rgba(220, 38, 38, 0.04)';
    }

    const pgLabel = (typeof PG_SHORT_LABELS !== 'undefined' && PG_SHORT_LABELS[row.planning_group]) || row.planning_group;

    tr.innerHTML = `
      <td style="font-weight:500;">${pgLabel}</td>
      <td>${row.role}</td>
      <td style="text-align:center;">${row.target_hc}</td>
      <td style="text-align:center;">${row.production_hc}</td>
      <td style="text-align:center;">${row.present_hc}</td>
      <td style="text-align:center;">${row.delivered_hours.toLocaleString()}</td>
      <td style="text-align:center;">${row.ot_hours}</td>
      <td style="text-align:center;font-weight:700;${payloadVsTarget ? 'color:#16a34a;' : 'color:#dc2626;'}">${row.total_payload.toLocaleString()}</td>
      <td style="text-align:center;">${Number(row.target_hours).toLocaleString()}</td>
      <td style="text-align:center;${gapClass}">${row.gap_hours > 0 ? '-' + row.gap_hours : '+' + Math.abs(row.gap_hours)}</td>
      <td style="text-align:center;${gapClass}">${row.gap_hc_days > 0 ? '-' + row.gap_hc_days : '+' + Math.abs(row.gap_hc_days)}</td>
      <td style="text-align:center;${statusClass}">${row.status === 'MET' ? '✓ MET' : '✗ BEHIND'}</td>
    `;
    tbody.appendChild(tr);
  }

  // Totals row
  const t = data.totals;
  const totalPayloadVsTarget = t.total_payload >= t.target_hours;
  const totalGapClass = t.gap_hours > 0 ? 'color:#dc2626;' : 'color:#16a34a;';
  const tfootTr = document.createElement('tr');
  tfootTr.style.fontWeight = '700';
  tfootTr.style.background = 'var(--bg-secondary, #f8fafc)';
  tfootTr.innerHTML = `
    <td colspan="2" style="font-weight:700;">TOTAL</td>
    <td style="text-align:center;">${t.target_hc}</td>
    <td style="text-align:center;">${t.production_hc}</td>
    <td style="text-align:center;">${t.present_hc}</td>
    <td style="text-align:center;">${t.delivered_hours.toLocaleString()}</td>
    <td style="text-align:center;">${t.ot_hours}</td>
    <td style="text-align:center;font-weight:700;${totalPayloadVsTarget ? 'color:#16a34a;' : 'color:#dc2626;'}">${t.total_payload.toLocaleString()}</td>
    <td style="text-align:center;">${Number(t.target_hours).toLocaleString()}</td>
    <td style="text-align:center;${totalGapClass}">${t.gap_hours > 0 ? '-' + t.gap_hours : '+' + Math.abs(t.gap_hours)}</td>
    <td style="text-align:center;${totalGapClass}">${t.gap_hc_days > 0 ? '-' + t.gap_hc_days : '+' + Math.abs(t.gap_hc_days)}</td>
    <td style="text-align:center;"></td>
  `;
  tfoot.appendChild(tfootTr);
}

// ============================================================
// Daily Drilldown
// ============================================================

function openBillingV2Drilldown(index) {
  if (!billingV2Data || !billingV2Data.drilldown || !billingV2Data.drilldown[index]) return;

  const dd = billingV2Data.drilldown[index];
  const comp = billingV2Data.compliance[index];
  const pgLabel = (typeof PG_SHORT_LABELS !== 'undefined' && PG_SHORT_LABELS[dd.planning_group]) || dd.planning_group;

  document.getElementById('billing-v2-drilldown-title').textContent = `Daily Breakdown: ${pgLabel} — ${dd.role}`;

  const tbody = document.getElementById('billing-v2-drilldown-body');
  tbody.innerHTML = '';

  if (!dd.days || dd.days.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);padding:20px;">No daily data available for this combination.</td></tr>';
  } else {
    for (const day of dd.days) {
      const tr = document.createElement('tr');
      // Format date nicely
      const d = new Date(day.date + 'T00:00:00Z');
      const dateLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

      tr.innerHTML = `
        <td>${dateLabel}</td>
        <td style="text-align:center;">${day.production_hc}</td>
        <td style="text-align:center;">${day.present_hc}</td>
        <td style="text-align:center;">${day.delivered_hours}</td>
        <td style="text-align:center;">${day.ot_hours}</td>
        <td style="text-align:center;font-weight:600;">${day.total_payload}</td>
      `;

      tbody.appendChild(tr);
    }
  }

  document.getElementById('billing-v2-drilldown').style.display = 'block';
  document.getElementById('billing-v2-drilldown').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeBillingV2Drilldown() {
  document.getElementById('billing-v2-drilldown').style.display = 'none';
}

// ============================================================
// Hook into billing tab switch
// ============================================================
// The existing switchBillingTab in billing.js already handles tab switching.
// We wrap it to add V2 initialization when the V2 tab is selected.
(function() {
  const _origSwitch = window.switchBillingTab;
  window.switchBillingTab = function(tabId) {
    // Call the original tab switcher (defined in billing.js)
    if (typeof _origSwitch === 'function') {
      _origSwitch(tabId);
    }
    // Initialize V2 tab when first switched to
    if (tabId === 'billing-v2') {
      const select = document.getElementById('billing-v2-week-select');
      if (select && select.options.length <= 1) {
        initBillingComplianceV2();
      }
    }
  };
})();
