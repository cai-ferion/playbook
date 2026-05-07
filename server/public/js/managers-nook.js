/**
 * Manager's Nook — Consolidated Supervisor Scorecard
 * Metrics: Valid Tardiness, Coaching Coverage, Insights, Shrinkage
 * Access: Managers + Admin only
 */

/* ───── state ───── */
let NOOK_DATA = null;       // API response { months, supervisors }
let NOOK_TREND = false;     // 3-month trend mode
let NOOK_INITIALIZED = false;

/* ───── init ───── */
async function initManagersNook() {
  if (NOOK_INITIALIZED) {
    // Already loaded — just re-render if data exists
    if (NOOK_DATA) nookRender();
    return;
  }
  NOOK_INITIALIZED = true;
  await nookBuildMonthOptions();
}

/* ───── Month selector ───── */
async function nookBuildMonthOptions() {
  const sel = document.getElementById('nook-month-select');
  if (!sel) return;

  try {
    const res = await fetch('/api/io/managers-nook/available-months');
    const data = await res.json();
    const months = data.months || [];

    sel.innerHTML = '';
    if (months.length === 0) {
      sel.innerHTML = '<option value="">No data available</option>';
      return;
    }

    // Current month YYYY-MM
    const now = new Date();
    const currentMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

    months.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      // Format: "April 2026"
      const [y, mo] = m.split('-');
      const dt = new Date(parseInt(y), parseInt(mo) - 1, 1);
      opt.textContent = dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      sel.appendChild(opt);
    });

    // Default to current month if available, otherwise first
    if (months.includes(currentMonth)) {
      sel.value = currentMonth;
    }

    await nookLoadScorecard();
  } catch (err) {
    console.error('[Managers Nook] Failed to load months:', err);
  }
}

/* ───── Load scorecard data ───── */
async function nookLoadScorecard() {
  const sel = document.getElementById('nook-month-select');
  if (!sel || !sel.value) return;

  const loading = document.getElementById('managers-nook-loading');
  if (loading) loading.style.display = 'flex';

  try {
    const month = sel.value;
    const url = NOOK_TREND
      ? `/api/io/managers-nook/scorecard?months=3&month=`
      : `/api/io/managers-nook/scorecard?month=${month}`;

    let finalUrl = url;
    if (NOOK_TREND) {
      // Compute 3-month range ending at selected month
      const [y, m] = month.split('-').map(Number);
      const months = [];
      for (let i = 0; i < 3; i++) {
        const d = new Date(y, m - 1 - i, 1);
        months.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
      }
      // Use the 3-month endpoint
      finalUrl = `/api/io/managers-nook/scorecard?months=3`;
    }

    const res = await fetch(finalUrl);
    NOOK_DATA = await res.json();
    nookRender();
  } catch (err) {
    console.error('[Managers Nook] Failed to load scorecard:', err);
  } finally {
    if (loading) loading.style.display = 'none';
  }
}

/* ───── Toggle trend mode ───── */
function nookToggleTrend() {
  NOOK_TREND = document.getElementById('nook-trend-toggle')?.checked || false;
  nookLoadScorecard();
}

/* ───── Render scorecard table ───── */
function nookRender() {
  if (!NOOK_DATA) return;

  const { months, supervisors } = NOOK_DATA;
  const tbody = document.getElementById('nook-table-body');
  const thead = document.getElementById('nook-table-head');
  const emptyEl = document.getElementById('nook-empty');
  const tableEl = document.getElementById('nook-table');
  const countEl = document.getElementById('nook-supervisor-count');

  if (!supervisors || supervisors.length === 0) {
    if (tbody) tbody.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    if (tableEl) tableEl.style.display = 'none';
    if (countEl) countEl.textContent = 'Supervisors: 0';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  if (tableEl) tableEl.style.display = '';
  if (countEl) countEl.textContent = `Supervisors: ${supervisors.length}`;

  const isTrend = NOOK_TREND && months.length > 1;
  const selectedMonth = document.getElementById('nook-month-select')?.value || months[0];

  // Build header
  if (thead) {
    if (isTrend) {
      // Multi-month headers
      const monthLabels = months.map(m => {
        const [y, mo] = m.split('-');
        const dt = new Date(parseInt(y), parseInt(mo) - 1, 1);
        return dt.toLocaleDateString('en-US', { month: 'short' });
      }).reverse(); // oldest first

      thead.innerHTML = `
        <tr>
          <th rowspan="2" style="position:sticky;left:0;z-index:3;background:var(--bg-secondary);min-width:200px;vertical-align:bottom;">Supervisor</th>
          <th rowspan="2" style="text-align:center;min-width:50px;vertical-align:bottom;">Agents</th>
          <th colspan="${months.length}" style="text-align:center;border-bottom:1px solid var(--border-color);">Valid Tardiness</th>
          <th colspan="${months.length}" style="text-align:center;border-bottom:1px solid var(--border-color);">Coaching Coverage</th>
          <th colspan="${months.length}" style="text-align:center;border-bottom:1px solid var(--border-color);">Insights (Sub/App)</th>
          <th colspan="${months.length}" style="text-align:center;border-bottom:1px solid var(--border-color);">Shrinkage %</th>
        </tr>
        <tr>
          ${monthLabels.map(l => `<th style="text-align:center;font-size:10px;font-weight:500;color:var(--text-secondary);">${l}</th>`).join('')}
          ${monthLabels.map(l => `<th style="text-align:center;font-size:10px;font-weight:500;color:var(--text-secondary);">${l}</th>`).join('')}
          ${monthLabels.map(l => `<th style="text-align:center;font-size:10px;font-weight:500;color:var(--text-secondary);">${l}</th>`).join('')}
          ${monthLabels.map(l => `<th style="text-align:center;font-size:10px;font-weight:500;color:var(--text-secondary);">${l}</th>`).join('')}
        </tr>
      `;
    } else {
      thead.innerHTML = `
        <tr>
          <th style="position:sticky;left:0;z-index:2;background:var(--bg-secondary);min-width:200px;">Supervisor</th>
          <th style="text-align:center;min-width:50px;">Agents</th>
          <th style="text-align:center;min-width:80px;">Valid Tardiness</th>
          <th style="text-align:center;min-width:120px;">Coaching Coverage</th>
          <th style="text-align:center;min-width:100px;">Insights (Sub/App)</th>
          <th style="text-align:center;min-width:90px;">Shrinkage %</th>
        </tr>
      `;
    }
  }

  // Build rows
  if (tbody) {
    tbody.innerHTML = supervisors.map((sup, idx) => {
      if (isTrend) {
        // Trend mode: one cell per month per metric
        const orderedMonths = [...months].reverse(); // oldest first
        const tardCells = orderedMonths.map(m => {
          const t = sup.months[m]?.tardiness || { valid: 0, total: 0 };
          const valid = typeof t === 'object' ? t.valid : t;
          const total = typeof t === 'object' ? t.total : 0;
          const label = `${valid}/${total}`;
          return `<td style="text-align:center;">${nookColorCell(valid, 'tardiness', label)}</td>`;
        }).join('');

        const coachCells = orderedMonths.map(m => {
          const c = sup.months[m]?.coaching || { coverage_pct: 0, unique_agents_coached: 0, total_agents: 0 };
          const pct = c.coverage_pct;
          const label = `${c.unique_agents_coached}/${c.total_agents}`;
          const missingCount = (c.missing_agents || []).length;
          const clickAttr = missingCount > 0 ? `onclick="nookShowMissing(${idx}, '${m}')" style="cursor:pointer;text-align:center;"` : `style="text-align:center;"`;
          return `<td ${clickAttr}>${nookColorCell(pct, 'coaching', label)}${missingCount > 0 ? `<span style="font-size:9px;color:var(--danger);display:block;">${missingCount} missing</span>` : ''}</td>`;
        }).join('');

        const insightCells = orderedMonths.map(m => {
          const ins = sup.months[m]?.insights || { submitted: 0, approved: 0 };
          return `<td style="text-align:center;">${ins.submitted}/${ins.approved}</td>`;
        }).join('');

        const shrinkCells = orderedMonths.map(m => {
          const s = sup.months[m]?.shrinkage || { pct: 0 };
          return `<td style="text-align:center;">${nookColorCell(s.pct, 'shrinkage')}</td>`;
        }).join('');

        return `<tr>
          <td style="position:sticky;left:0;z-index:1;background:var(--bg-primary);font-weight:500;white-space:nowrap;">${sup.supervisor_name}</td>
          <td style="text-align:center;">${sup.total_agents}</td>
          ${tardCells}${coachCells}${insightCells}${shrinkCells}
        </tr>`;
      } else {
        // Single month mode
        const m = selectedMonth;
        const md = sup.months[m] || {};
        const tardObj = md.tardiness || { valid: 0, total: 0 };
        const tardValid = typeof tardObj === 'object' ? tardObj.valid : tardObj;
        const tardTotal = typeof tardObj === 'object' ? tardObj.total : 0;
        const tardLabel = `${tardValid}/${tardTotal}`;
        const coach = md.coaching || { coverage_pct: 0, unique_agents_coached: 0, total_agents: 0, missing_agents: [] };
        const ins = md.insights || { submitted: 0, approved: 0 };
        const shrink = md.shrinkage || { pct: 0 };

        const missingCount = (coach.missing_agents || []).length;
        const coachLabel = `${coach.unique_agents_coached}/${coach.total_agents} (${coach.coverage_pct}%)`;
        const coachClick = missingCount > 0 ? `onclick="nookShowMissing(${idx}, '${m}')" style="cursor:pointer;text-align:center;"` : `style="text-align:center;"`;

        return `<tr>
          <td style="position:sticky;left:0;z-index:1;background:var(--bg-primary);font-weight:500;white-space:nowrap;">${sup.supervisor_name}</td>
          <td style="text-align:center;">${sup.total_agents}</td>
          <td style="text-align:center;">${nookColorCell(tardValid, 'tardiness', tardLabel)}</td>
          <td ${coachClick}>${nookColorCell(coach.coverage_pct, 'coaching', coachLabel)}${missingCount > 0 ? `<br><span style="font-size:10px;color:var(--danger);cursor:pointer;text-decoration:underline;">${missingCount} missing</span>` : ''}</td>
          <td style="text-align:center;">${ins.submitted} / ${ins.approved}</td>
          <td style="text-align:center;">${nookColorCell(shrink.pct, 'shrinkage')}</td>
        </tr>`;
      }
    }).join('');
  }
}

/* ───── Color coding helper ───── */
function nookColorCell(value, metric, label) {
  const v = Number(value) || 0;
  let color = 'inherit';
  let displayVal = label || v;

  switch (metric) {
    case 'tardiness':
      // Higher = worse. 0 = green, 1-3 = yellow, 4+ = red
      if (v === 0) color = 'var(--success, #22c55e)';
      else if (v <= 3) color = 'var(--warning, #f59e0b)';
      else color = 'var(--danger, #ef4444)';
      displayVal = label || v;
      break;
    case 'coaching':
      // coverage_pct: 100% = green, 80-99% = yellow, <80% = red
      if (v >= 100) color = 'var(--success, #22c55e)';
      else if (v >= 80) color = 'var(--warning, #f59e0b)';
      else color = 'var(--danger, #ef4444)';
      if (!label) displayVal = v.toFixed(0) + '%';
      break;
    case 'shrinkage':
      // Lower = better. <5% = green, 5-10% = yellow, >10% = red
      if (v < 5) color = 'var(--success, #22c55e)';
      else if (v <= 10) color = 'var(--warning, #f59e0b)';
      else color = 'var(--danger, #ef4444)';
      displayVal = label || v.toFixed(1) + '%';
      break;
  }

  return `<span style="color:${color};font-weight:600;">${displayVal}</span>`;
}

/* ───── Show missing coaching agents modal ───── */
function nookShowMissing(supIdx, month) {
  if (!NOOK_DATA || !NOOK_DATA.supervisors[supIdx]) return;

  const sup = NOOK_DATA.supervisors[supIdx];
  const md = sup.months[month];
  if (!md || !md.coaching) return;

  const missing = md.coaching.missing_agents || [];
  const title = document.getElementById('nook-coaching-modal-title');
  const body = document.getElementById('nook-coaching-modal-body');
  const modal = document.getElementById('nook-coaching-modal');

  if (title) {
    const [y, mo] = month.split('-');
    const dt = new Date(parseInt(y), parseInt(mo) - 1, 1);
    const monthLabel = dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    title.textContent = `Missing Coaching — ${sup.supervisor_name} (${monthLabel})`;
  }

  if (body) {
    if (missing.length === 0) {
      body.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:20px;">All agents have been coached this month.</p>';
    } else {
      body.innerHTML = `
        <p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">${missing.length} agent(s) without coaching sessions this month:</p>
        <table class="data-table" style="font-size:12px;width:100%;">
          <thead>
            <tr>
              <th style="text-align:left;">Agent Name</th>
              <th style="text-align:left;">OHR ID</th>
            </tr>
          </thead>
          <tbody>
            ${missing.map(a => `<tr><td>${a.full_name}</td><td style="font-family:monospace;font-size:11px;">${a.ohr_id}</td></tr>`).join('')}
          </tbody>
        </table>
      `;
    }
  }

  if (modal) modal.style.display = 'flex';
}
