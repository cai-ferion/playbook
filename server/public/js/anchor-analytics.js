/**
 * Anchor Analytics — High-level attendance analytics and predictive insights
 * Provides summary KPIs, trend charts, and predictive data from io_attendance.
 */

let aaInitialized = false;
let aaData = [];

async function initAnchorAnalytics() {
  if (!aaInitialized) {
    populateAAMonthFilter();
    aaInitialized = true;
  }
  await anchorAnalyticsRefresh();
}

function populateAAMonthFilter() {
  const sel = document.getElementById('aa-month-filter');
  if (!sel) return;
  const now = new Date();
  sel.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = d.toISOString().slice(0, 7); // YYYY-MM
    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    sel.innerHTML += `<option value="${val}">${label}</option>`;
  }
}

async function anchorAnalyticsRefresh() {
  const loading = document.getElementById('aa-loading');
  const content = document.getElementById('aa-content');
  if (loading) loading.style.display = 'flex';

  try {
    const month = document.getElementById('aa-month-filter')?.value;
    if (!month) return;

    const [year, mon] = month.split('-').map(Number);
    const startDate = `${month}-01`;
    const lastDay = new Date(year, mon, 0).getDate();
    const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;

    // Fetch attendance data for the selected month
    const url = `${IO_API_BASE}/attendance?attendance_date_gte=${startDate}&attendance_date_lte=${endDate}&limit=200000`;
    const resp = await fetch(url);
    aaData = await resp.json();
    if (!Array.isArray(aaData)) aaData = [];

    // Fetch employees for headcount
    const empResp = await fetch(`${IO_API_BASE}/employees?employement_status=Active&limit=3000`);
    const employees = await empResp.json();

    // Role-based filtering
    let filteredData = aaData;
    let filteredEmployees = Array.isArray(employees) ? employees : [];
    if (currentUser && currentUser.actual_role === 'Team Lead' && currentUser.ohr_id !== '740045032') {
      const myAgents = filteredEmployees.filter(e => e.sup_ohr === currentUser.ohr_id).map(e => e.ohr_id);
      filteredData = aaData.filter(r => myAgents.includes(r.ohr_id));
      filteredEmployees = filteredEmployees.filter(e => e.sup_ohr === currentUser.ohr_id);
    } else if (currentUser && currentUser.actual_role === 'Manager' && currentUser.ohr_id !== '740045032') {
      const myPGs = (currentUser.complete_planning_group || currentUser.planning_group || '').split(',').map(s => s.trim()).filter(Boolean);
      if (myPGs.length > 0) {
        filteredData = aaData.filter(r => myPGs.includes(r.planning_group));
        filteredEmployees = filteredEmployees.filter(e => myPGs.includes(e.planning_group));
      }
    }

    renderAnchorAnalytics(filteredData, filteredEmployees, month);
  } catch (err) {
    console.error('Anchor Analytics error:', err);
    if (content) content.innerHTML = `<div class="aa-error">Failed to load analytics: ${err.message}</div>`;
  } finally {
    if (loading) loading.style.display = 'none';
  }
}

function renderAnchorAnalytics(data, employees, month) {
  const content = document.getElementById('aa-content');
  if (!content) return;

  const totalHeadcount = employees.length;
  const uniqueEmployees = [...new Set(data.map(r => r.ohr_id))].length;
  const totalRecords = data.length;

  // Count tags
  const tagCounts = {};
  data.forEach(r => {
    const tag = (r.tag || r.effective_tag || 'Unknown').trim();
    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
  });

  const presentCount = (tagCounts['P'] || 0) + (tagCounts['OT'] || 0);
  const uplCount = tagCounts['UPL'] || 0;
  const plCount = tagCounts['PL'] || 0;
  const ncnsCount = tagCounts['NCNS'] || 0;
  const restDayCount = tagCounts['RD'] || 0;
  const holidayCount = tagCounts['HOL'] || 0;
  const suspensionCount = tagCounts['Suspension'] || 0;

  // Attendance rate (P + OT) / (total - RD - HOL)
  const workingDayRecords = totalRecords - restDayCount - holidayCount;
  const attendanceRate = workingDayRecords > 0 ? ((presentCount / workingDayRecords) * 100).toFixed(1) : '0.0';

  // UPL rate
  const uplRate = workingDayRecords > 0 ? ((uplCount / workingDayRecords) * 100).toFixed(1) : '0.0';

  // Weekly breakdown
  const weeklyData = {};
  data.forEach(r => {
    const we = r.week_ending || 'Unknown';
    if (!weeklyData[we]) weeklyData[we] = { total: 0, present: 0, upl: 0, ncns: 0, pl: 0 };
    weeklyData[we].total++;
    const tag = (r.tag || r.effective_tag || '').trim();
    if (tag === 'P' || tag === 'OT') weeklyData[we].present++;
    if (tag === 'UPL') weeklyData[we].upl++;
    if (tag === 'NCNS') weeklyData[we].ncns++;
    if (tag === 'PL') weeklyData[we].pl++;
  });

  const weeklyKeys = Object.keys(weeklyData).sort();

  // Planning group breakdown
  const pgData = {};
  data.forEach(r => {
    const pg = r.planning_group || 'Unknown';
    if (!pgData[pg]) pgData[pg] = { total: 0, present: 0, upl: 0, ncns: 0 };
    pgData[pg].total++;
    const tag = (r.tag || r.effective_tag || '').trim();
    if (tag === 'P' || tag === 'OT') pgData[pg].present++;
    if (tag === 'UPL') pgData[pg].upl++;
    if (tag === 'NCNS') pgData[pg].ncns++;
  });

  // Top UPL offenders
  const uplByEmployee = {};
  data.forEach(r => {
    const tag = (r.tag || r.effective_tag || '').trim();
    if (tag === 'UPL' || tag === 'NCNS') {
      const key = r.ohr_id || 'Unknown';
      if (!uplByEmployee[key]) uplByEmployee[key] = { name: r.full_name || key, ohr: key, pg: r.planning_group || '', count: 0 };
      uplByEmployee[key].count++;
    }
  });
  const topUPL = Object.values(uplByEmployee).sort((a, b) => b.count - a.count).slice(0, 10);

  // Predictive: employees at risk (2+ UPL/NCNS this month)
  const atRisk = Object.values(uplByEmployee).filter(e => e.count >= 2).sort((a, b) => b.count - a.count);

  const monthLabel = new Date(month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  content.innerHTML = `
    <!-- KPI Cards -->
    <div class="aa-kpi-grid">
      <div class="aa-kpi-card">
        <div class="aa-kpi-value">${totalHeadcount}</div>
        <div class="aa-kpi-label">Active Headcount</div>
      </div>
      <div class="aa-kpi-card aa-kpi-success">
        <div class="aa-kpi-value">${attendanceRate}%</div>
        <div class="aa-kpi-label">Attendance Rate</div>
      </div>
      <div class="aa-kpi-card aa-kpi-warning">
        <div class="aa-kpi-value">${uplCount}</div>
        <div class="aa-kpi-label">UPL Count</div>
      </div>
      <div class="aa-kpi-card aa-kpi-danger">
        <div class="aa-kpi-value">${ncnsCount}</div>
        <div class="aa-kpi-label">NCNS Count</div>
      </div>
      <div class="aa-kpi-card">
        <div class="aa-kpi-value">${plCount}</div>
        <div class="aa-kpi-label">Planned Leave</div>
      </div>
      <div class="aa-kpi-card">
        <div class="aa-kpi-value">${uplRate}%</div>
        <div class="aa-kpi-label">UPL Rate</div>
      </div>
    </div>

    <!-- Tag Distribution -->
    <div class="aa-section">
      <h4 class="aa-section-title">Tag Distribution — ${monthLabel}</h4>
      <div class="aa-tag-bars">
        ${Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).map(([tag, count]) => {
          const pct = totalRecords > 0 ? ((count / totalRecords) * 100).toFixed(1) : 0;
          const color = getTagColor(tag);
          return `<div class="aa-tag-bar-row">
            <span class="aa-tag-label">${escapeHtml(tag)}</span>
            <div class="aa-tag-bar-track">
              <div class="aa-tag-bar-fill" style="width:${pct}%;background:${color};"></div>
            </div>
            <span class="aa-tag-count">${count} (${pct}%)</span>
          </div>`;
        }).join('')}
      </div>
    </div>

    <!-- Weekly Trend Table -->
    <div class="aa-section">
      <h4 class="aa-section-title">Weekly Trend</h4>
      <div class="module-table-wrapper">
        <table class="data-table module-table">
          <thead>
            <tr>
              <th>Week Ending</th>
              <th>Total Records</th>
              <th>Present</th>
              <th>UPL</th>
              <th>NCNS</th>
              <th>PL</th>
              <th>Attendance %</th>
            </tr>
          </thead>
          <tbody>
            ${weeklyKeys.map(we => {
              const w = weeklyData[we];
              const wWorking = w.total - (tagCounts['RD'] || 0) / weeklyKeys.length; // approximate
              const wRate = w.total > 0 ? ((w.present / w.total) * 100).toFixed(1) : '0.0';
              return `<tr>
                <td>${we}</td>
                <td>${w.total}</td>
                <td style="color:var(--success-color,#22c55e);font-weight:600;">${w.present}</td>
                <td style="color:${w.upl > 0 ? 'var(--error-color,#ef4444)' : 'inherit'};font-weight:${w.upl > 0 ? '600' : '400'};">${w.upl}</td>
                <td style="color:${w.ncns > 0 ? 'var(--error-color,#ef4444)' : 'inherit'};font-weight:${w.ncns > 0 ? '600' : '400'};">${w.ncns}</td>
                <td>${w.pl}</td>
                <td style="font-weight:600;">${wRate}%</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Planning Group Breakdown -->
    <div class="aa-section">
      <h4 class="aa-section-title">Planning Group Breakdown</h4>
      <div class="module-table-wrapper">
        <table class="data-table module-table">
          <thead>
            <tr>
              <th>Planning Group</th>
              <th>Total Records</th>
              <th>Present</th>
              <th>UPL</th>
              <th>NCNS</th>
              <th>Attendance %</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(pgData).sort((a, b) => b[1].total - a[1].total).map(([pg, d]) => {
              const pgRate = d.total > 0 ? ((d.present / d.total) * 100).toFixed(1) : '0.0';
              return `<tr>
                <td>${escapeHtml(pg)}</td>
                <td>${d.total}</td>
                <td style="color:var(--success-color,#22c55e);font-weight:600;">${d.present}</td>
                <td style="color:${d.upl > 0 ? 'var(--error-color,#ef4444)' : 'inherit'};font-weight:${d.upl > 0 ? '600' : '400'};">${d.upl}</td>
                <td style="color:${d.ncns > 0 ? 'var(--error-color,#ef4444)' : 'inherit'};font-weight:${d.ncns > 0 ? '600' : '400'};">${d.ncns}</td>
                <td style="font-weight:600;">${pgRate}%</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Top UPL/NCNS Offenders -->
    <div class="aa-section">
      <h4 class="aa-section-title">Top UPL/NCNS — ${monthLabel}</h4>
      ${topUPL.length === 0 ? '<p class="aa-empty">No UPL or NCNS records this month.</p>' : `
      <div class="module-table-wrapper">
        <table class="data-table module-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Employee</th>
              <th>OHR ID</th>
              <th>Planning Group</th>
              <th>UPL+NCNS Count</th>
            </tr>
          </thead>
          <tbody>
            ${topUPL.map((e, i) => `<tr>
              <td>${i + 1}</td>
              <td>${escapeHtml(e.name)}</td>
              <td>${escapeHtml(e.ohr)}</td>
              <td>${escapeHtml(e.pg)}</td>
              <td style="color:var(--error-color,#ef4444);font-weight:700;">${e.count}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`}
    </div>

    <!-- Predictive: At-Risk Employees -->
    <div class="aa-section">
      <h4 class="aa-section-title">Predictive — At-Risk Employees (2+ UPL/NCNS)</h4>
      ${atRisk.length === 0 ? '<p class="aa-empty">No employees at risk this month.</p>' : `
      <div class="aa-risk-grid">
        ${atRisk.map(e => `<div class="aa-risk-card">
          <div class="aa-risk-name">${escapeHtml(e.name)}</div>
          <div class="aa-risk-meta">${escapeHtml(e.ohr)} · ${escapeHtml(e.pg)}</div>
          <div class="aa-risk-count">${e.count} incidents</div>
          <div class="aa-risk-bar">
            <div class="aa-risk-bar-fill" style="width:${Math.min(e.count * 20, 100)}%;"></div>
          </div>
        </div>`).join('')}
      </div>`}
    </div>
  `;
}

function getTagColor(tag) {
  const colors = {
    'P': '#22c55e', 'OT': '#3b82f6', 'UPL': '#ef4444', 'NCNS': '#dc2626',
    'PL': '#8b5cf6', 'RD': '#6b7280', 'HOL': '#f59e0b', 'Suspension': '#f97316',
    'VL': '#06b6d4', 'SL': '#14b8a6', 'EL': '#ec4899'
  };
  return colors[tag] || '#6b7280';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
