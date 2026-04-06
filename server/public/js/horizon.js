/**
 * Horizon — Productivity Hours
 * Weekly agent productivity table + Admin Tools upload
 */

/* ───── state ───── */
let PROD_DATA = [];          // raw rows from API
let PROD_FILTERED = [];      // after PG filter
let PROD_WEEKS = [];         // available week-ending dates

/* ───── init ───── */
function initProductivityHrs() {
  prodBuildWeekOptions();
}

/* ───── Week selector ───── */
async function prodBuildWeekOptions() {
  const sel = document.getElementById('prod-week-select');
  if (!sel) return;

  // Fetch distinct dates to build week options
  // We'll load a wide range and derive week-endings (Fridays)
  const now = new Date();
  const start = '2026-01-01';
  const end = now.toISOString().slice(0, 10);

  try {
    document.getElementById('productivity-hrs-loading').style.display = 'flex';
    const res = await fetch(`/api/io/productivity-hours?start=${start}&end=${end}`);
    const data = await res.json();
    PROD_DATA = Array.isArray(data) ? data : [];

    // Derive unique dates
    const dates = [...new Set(PROD_DATA.map(r => r.date))].sort();

    // Group by week ending (Friday). Find the Friday for each date.
    const weekEndings = new Set();
    dates.forEach(d => {
      const dt = new Date(d + 'T12:00:00Z');
      const day = dt.getUTCDay(); // 0=Sun
      // Find next Friday (or same day if Friday)
      const diff = (5 - day + 7) % 7;
      const fri = new Date(dt);
      fri.setUTCDate(fri.getUTCDate() + diff);
      weekEndings.add(fri.toISOString().slice(0, 10));
    });

    PROD_WEEKS = [...weekEndings].sort().reverse();

    sel.innerHTML = '';
    if (PROD_WEEKS.length === 0) {
      sel.innerHTML = '<option value="">No data available</option>';
      document.getElementById('prod-empty').style.display = 'block';
      document.getElementById('prod-table').style.display = 'none';
      document.getElementById('productivity-hrs-loading').style.display = 'none';
      return;
    }

    PROD_WEEKS.forEach((w, i) => {
      const opt = document.createElement('option');
      opt.value = w;
      const dt = new Date(w + 'T12:00:00Z');
      opt.textContent = dt.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }) + ' (' + w + ')';
      sel.appendChild(opt);
    });

    prodLoadWeek();
  } catch (err) {
    console.error('[Horizon] Failed to load productivity data:', err);
    document.getElementById('productivity-hrs-loading').style.display = 'none';
  }
}

/* ───── Load week data ───── */
function prodLoadWeek() {
  const sel = document.getElementById('prod-week-select');
  if (!sel || !sel.value) return;

  const weekEnd = sel.value;
  const weDate = new Date(weekEnd + 'T12:00:00Z');

  // Week is Sat-Fri, so start = weekEnd - 6 days (Saturday)
  const weekStart = new Date(weDate);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  const startStr = weekStart.toISOString().slice(0, 10);

  // Filter PROD_DATA to this week range
  const weekData = PROD_DATA.filter(r => r.date >= startStr && r.date <= weekEnd);

  // Aggregate by agent (sum across the week)
  const agentMap = {};
  weekData.forEach(r => {
    const key = r.ohr;
    if (!agentMap[key]) {
      agentMap[key] = {
        ohr: r.ohr,
        full_name: r.full_name || r.ohr,
        planning_group: r.planning_group || '',
        available: 0,
        non_srt_production: 0,
        fb_training: 0,
        onboarding: 0,
        coaching: 0,
        wellness_support: 0,
        team_meeting: 0,
        total_billable: 0,
        delivered_hours: 0,
      };
    }
    const a = agentMap[key];
    a.available += Number(r.available) || 0;
    a.non_srt_production += Number(r.non_srt_production) || 0;
    a.fb_training += Number(r.fb_training) || 0;
    a.onboarding += Number(r.onboarding) || 0;
    a.coaching += Number(r.coaching) || 0;
    a.wellness_support += Number(r.wellness_support) || 0;
    a.team_meeting += Number(r.team_meeting) || 0;
    a.total_billable += Number(r.total_billable) || 0;
    a.delivered_hours += Number(r.delivered_hours) || 0;
  });

  PROD_FILTERED = Object.values(agentMap).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));

  // Build PG filter
  const pgSet = new Set(PROD_FILTERED.map(r => r.planning_group).filter(Boolean));
  const pgSel = document.getElementById('prod-pg-filter');
  if (pgSel) {
    const currentVal = pgSel.value;
    pgSel.innerHTML = '<option value="All">All Groups</option>';
    [...pgSet].sort().forEach(pg => {
      const opt = document.createElement('option');
      opt.value = pg;
      opt.textContent = pg;
      pgSel.appendChild(opt);
    });
    pgSel.value = currentVal || 'All';
  }

  prodApplyFilters();
  document.getElementById('productivity-hrs-loading').style.display = 'none';
}

/* ───── Apply PG filter and render ───── */
function prodApplyFilters() {
  const pgVal = document.getElementById('prod-pg-filter')?.value || 'All';
  let data = PROD_FILTERED;
  if (pgVal !== 'All') {
    data = data.filter(r => r.planning_group === pgVal);
  }

  document.getElementById('prod-record-count').textContent = `Agents: ${data.length}`;

  const tbody = document.getElementById('prod-table-body');
  const tfoot = document.getElementById('prod-table-foot');
  const emptyEl = document.getElementById('prod-empty');
  const tableEl = document.getElementById('prod-table');

  if (data.length === 0) {
    tbody.innerHTML = '';
    tfoot.innerHTML = '';
    emptyEl.style.display = 'block';
    tableEl.style.display = 'none';
    return;
  }

  emptyEl.style.display = 'none';
  tableEl.style.display = '';

  // Render rows
  const fmt = (v) => {
    const n = Number(v) || 0;
    return n === 0 ? '<span style="color:var(--text-tertiary);">—</span>' : n.toFixed(2);
  };

  tbody.innerHTML = data.map(r => `
    <tr>
      <td style="position:sticky;left:0;z-index:1;background:var(--bg-primary);font-weight:500;white-space:nowrap;">${r.full_name || r.ohr}</td>
      <td style="text-align:right;">${fmt(r.available)}</td>
      <td style="text-align:right;">${fmt(r.non_srt_production)}</td>
      <td style="text-align:right;">${fmt(r.fb_training)}</td>
      <td style="text-align:right;">${fmt(r.onboarding)}</td>
      <td style="text-align:right;">${fmt(r.coaching)}</td>
      <td style="text-align:right;">${fmt(r.wellness_support)}</td>
      <td style="text-align:right;">${fmt(r.team_meeting)}</td>
      <td style="text-align:right;font-weight:600;">${fmt(r.total_billable)}</td>
      <td style="text-align:right;font-weight:600;">${fmt(r.delivered_hours)}</td>
    </tr>
  `).join('');

  // Totals row
  const totals = {
    available: 0, non_srt_production: 0, fb_training: 0, onboarding: 0,
    coaching: 0, wellness_support: 0, team_meeting: 0, total_billable: 0, delivered_hours: 0
  };
  data.forEach(r => {
    Object.keys(totals).forEach(k => { totals[k] += Number(r[k]) || 0; });
  });

  tfoot.innerHTML = `
    <tr style="font-weight:700;border-top:2px solid var(--border-color);">
      <td style="position:sticky;left:0;z-index:1;background:var(--bg-secondary);">TOTAL (${data.length} agents)</td>
      <td style="text-align:right;">${totals.available.toFixed(2)}</td>
      <td style="text-align:right;">${totals.non_srt_production.toFixed(2)}</td>
      <td style="text-align:right;">${totals.fb_training.toFixed(2)}</td>
      <td style="text-align:right;">${totals.onboarding.toFixed(2)}</td>
      <td style="text-align:right;">${totals.coaching.toFixed(2)}</td>
      <td style="text-align:right;">${totals.wellness_support.toFixed(2)}</td>
      <td style="text-align:right;">${totals.team_meeting.toFixed(2)}</td>
      <td style="text-align:right;">${totals.total_billable.toFixed(2)}</td>
      <td style="text-align:right;">${totals.delivered_hours.toFixed(2)}</td>
    </tr>
  `;
}

/* ───── Admin Upload: Productivity Hours ───── */
async function handleProdFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  document.getElementById('prod-file-name').textContent = file.name;
  document.getElementById('prod-progress').style.display = 'flex';
  document.getElementById('prod-progress-text').textContent = 'Reading file...';
  document.getElementById('prod-progress-fill').style.width = '10%';
  document.getElementById('prod-result').style.display = 'none';

  try {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: 'array' });

    // Find RAW sheet
    let sheetName = wb.SheetNames.find(s => s.toUpperCase().includes('RAW'));
    if (!sheetName) sheetName = wb.SheetNames[0];

    document.getElementById('prod-progress-text').textContent = `Parsing sheet: ${sheetName}...`;
    document.getElementById('prod-progress-fill').style.width = '30%';

    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: 0 });

    if (rows.length === 0) {
      showProdResult('error', 'No data rows found in the RAW sheet.');
      return;
    }

    // Map columns
    const records = [];
    for (const row of rows) {
      const dateVal = row['Date'] || row['date'];
      const ohrVal = row['OHR'] || row['ohr'];
      if (!dateVal || !ohrVal) continue;

      // Convert Excel serial date
      let dateStr;
      if (typeof dateVal === 'number') {
        const epoch = new Date(1899, 11, 30);
        const d = new Date(epoch.getTime() + dateVal * 86400000);
        dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      } else {
        dateStr = String(dateVal);
      }

      records.push({
        date: dateStr,
        ohr: String(Math.round(Number(ohrVal))),
        actual_projection: row['Actual/Projection'] || row['actual_projection'] || 'Actuals',
        available: Number(row['Available'] || row['available']) || 0,
        non_srt_production: Number(row['non_srt_production'] || row['Non SRT Production'] || row['non_srt_prod']) || 0,
        fb_training: Number(row['Fb Training'] || row['fb_training'] || row['FB Training']) || 0,
        onboarding: Number(row['onboarding'] || row['Onboarding']) || 0,
        coaching: Number(row['Coaching'] || row['coaching']) || 0,
        wellness_support: Number(row['Wellness Support'] || row['wellness_support']) || 0,
        team_meeting: Number(row['Team Meeting'] || row['team_meeting']) || 0,
        total_billable: Number(row['Total Billable'] || row['total_billable']) || 0,
        delivered_hours: Number(row['Delivered hours'] || row['delivered_hours'] || row['Delivered Hours']) || 0,
      });
    }

    if (records.length === 0) {
      showProdResult('error', 'No valid records found. Ensure the RAW sheet has Date and OHR columns.');
      return;
    }

    document.getElementById('prod-progress-text').textContent = `Uploading ${records.length} records...`;
    document.getElementById('prod-progress-fill').style.width = '50%';

    // Send in batches of 200
    const BATCH = 200;
    let totalInserted = 0;
    let totalUpdated = 0;

    for (let i = 0; i < records.length; i += BATCH) {
      const batch = records.slice(i, i + BATCH);
      const pct = 50 + Math.round((i / records.length) * 45);
      document.getElementById('prod-progress-fill').style.width = pct + '%';
      document.getElementById('prod-progress-text').textContent = `Uploading batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(records.length / BATCH)}...`;

      const resp = await fetch('/api/io/productivity-hours/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: batch }),
      });
      const result = await resp.json();
      if (result.error) throw new Error(result.error);
      totalInserted += result.inserted || 0;
      totalUpdated += result.updated || 0;
    }

    document.getElementById('prod-progress-fill').style.width = '100%';

    const dates = [...new Set(records.map(r => r.date))].sort();
    showProdResult('success',
      `<strong>${records.length}</strong> records processed (${totalInserted} inserted, ${totalUpdated} updated).<br>` +
      `Date range: <strong>${dates[0]}</strong> to <strong>${dates[dates.length - 1]}</strong><br>` +
      `Unique agents: <strong>${new Set(records.map(r => r.ohr)).size}</strong>`
    );

    // Refresh the productivity view data
    setTimeout(() => prodBuildWeekOptions(), 500);

  } catch (err) {
    console.error('[Horizon] Upload error:', err);
    showProdResult('error', 'Upload failed: ' + err.message);
  }

  // Reset file input
  event.target.value = '';
}

function showProdResult(type, html) {
  const el = document.getElementById('prod-result');
  el.style.display = 'block';
  el.className = 'admin-result ' + (type === 'error' ? 'admin-result-error' : 'admin-result-success');
  el.innerHTML = html;
  document.getElementById('prod-progress').style.display = 'none';
}
