/**
 * Performance Dashboard — Frontend Module
 * Handles data loading, filtering, KPI cards, sortable table, and file upload.
 */

/* global appState, showToast */

let perfData = null;       // Full dashboard data from API
let perfInitialized = false;
let perfSortCol = null;
let perfSortAsc = true;

const PERF_API = '/api/io/performance';

const METRIC_DEFS = [
  { key: 'utilization', label: 'UTILIZATION', format: 'percentage' },
  { key: 'occupancy', label: 'OCCUPANCY', format: 'percentage' },
  { key: 'throughput', label: 'THROUGHPUT', format: 'decimal' },
  { key: 'aht', label: 'AHT', format: 'seconds' },
  { key: 'nht', label: 'NHT', format: 'percentage' },
  { key: 'closures', label: 'CLOSURES', format: 'integer' },
];

// ---- Init ----

async function initPerformance() {
  if (perfInitialized && perfData) {
    perfApplyFilters();
    return;
  }

  const loading = document.getElementById('perf-loading');
  const empty = document.getElementById('perf-empty');
  const table = document.getElementById('perf-table');

  if (loading) loading.style.display = 'flex';
  if (empty) empty.style.display = 'none';
  if (table) table.style.display = 'none';

  try {
    const resp = await fetch(`${PERF_API}/data`);
    if (!resp.ok) throw new Error('Failed to load performance data');
    perfData = await resp.json();

    if (!perfData.employees || perfData.employees.length === 0) {
      if (loading) loading.style.display = 'none';
      if (empty) empty.style.display = 'block';
      perfLoadSyncInfo();
      return;
    }

    perfPopulateFilters();
    perfApplyFilters();
    perfLoadSyncInfo();
    perfInitialized = true;
  } catch (err) {
    console.error('[Performance] Init error:', err);
    if (typeof showToast === 'function') showToast('Failed to load performance data', 'error');
  } finally {
    if (loading) loading.style.display = 'none';
  }
}

// ---- Filters ----

function perfPopulateFilters() {
  if (!perfData) return;

  // Timeframe dropdown
  const tfSelect = document.getElementById('perf-timeframe');
  if (tfSelect) {
    tfSelect.innerHTML = '';
    const tfs = perfData.timeframes || [];
    // Group by type: weekly first, then monthly
    const weekly = tfs.filter(t => t.type === 'weekly');
    const monthly = tfs.filter(t => t.type === 'monthly');

    if (weekly.length > 0) {
      const optGroup = document.createElement('optgroup');
      optGroup.label = 'Weekly';
      weekly.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.key;
        opt.textContent = t.label;
        optGroup.appendChild(opt);
      });
      tfSelect.appendChild(optGroup);
    }

    if (monthly.length > 0) {
      const optGroup = document.createElement('optgroup');
      optGroup.label = 'Monthly';
      monthly.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.key;
        opt.textContent = t.label;
        optGroup.appendChild(opt);
      });
      tfSelect.appendChild(optGroup);
    }

    // Default to latest weekly
    if (weekly.length > 0) {
      tfSelect.value = weekly[weekly.length - 1].key;
    }
  }

  // Planning Group dropdown
  const pgSelect = document.getElementById('perf-planning-group');
  if (pgSelect) {
    pgSelect.innerHTML = '<option value="All">All</option>';
    (perfData.planning_groups || []).forEach(pg => {
      const opt = document.createElement('option');
      opt.value = pg;
      opt.textContent = pg;
      pgSelect.appendChild(opt);
    });
  }

  // Supervisor dropdown
  const supSelect = document.getElementById('perf-supervisor');
  if (supSelect) {
    supSelect.innerHTML = '<option value="All">All</option>';
    (perfData.supervisors || []).forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      supSelect.appendChild(opt);
    });
  }

  // Shift dropdown
  const shiftSelect = document.getElementById('perf-shift');
  if (shiftSelect) {
    shiftSelect.innerHTML = '<option value="All">All</option>';
    (perfData.shift_times || []).forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      shiftSelect.appendChild(opt);
    });
  }
}

function perfApplyFilters() {
  if (!perfData || !perfData.employees) return;

  const tfKey = document.getElementById('perf-timeframe')?.value || '';
  const pgFilter = document.getElementById('perf-planning-group')?.value || 'All';
  const supFilter = document.getElementById('perf-supervisor')?.value || 'All';
  const shiftFilter = document.getElementById('perf-shift')?.value || 'All';

  let filtered = perfData.employees.filter(emp => {
    if (pgFilter !== 'All' && emp.planning_group !== pgFilter) return false;
    if (supFilter !== 'All' && emp.sup_name !== supFilter) return false;
    if (shiftFilter !== 'All' && emp.shift_time !== shiftFilter) return false;
    return true;
  });

  // Sort
  if (perfSortCol) {
    filtered.sort((a, b) => {
      let va, vb;
      if (perfSortCol === 'name') {
        va = (a.name || '').toLowerCase();
        vb = (b.name || '').toLowerCase();
      } else if (perfSortCol === 'planning_group') {
        va = (a.planning_group || '').toLowerCase();
        vb = (b.planning_group || '').toLowerCase();
      } else if (perfSortCol === 'sup_name') {
        va = (a.sup_name || '').toLowerCase();
        vb = (b.sup_name || '').toLowerCase();
      } else if (perfSortCol === 'shift_time') {
        va = (a.shift_time || '').toLowerCase();
        vb = (b.shift_time || '').toLowerCase();
      } else {
        // Metric column
        const ma = a.metrics?.[tfKey];
        const mb = b.metrics?.[tfKey];
        va = ma ? (ma[perfSortCol] ?? -Infinity) : -Infinity;
        vb = mb ? (mb[perfSortCol] ?? -Infinity) : -Infinity;
      }
      if (va < vb) return perfSortAsc ? -1 : 1;
      if (va > vb) return perfSortAsc ? 1 : -1;
      return 0;
    });
  }

  perfRenderKPICards(filtered, tfKey);
  perfRenderTable(filtered, tfKey);
}

// ---- KPI Cards ----

function perfRenderKPICards(employees, tfKey) {
  const container = document.getElementById('perf-kpi-cards');
  if (!container) return;

  // Compute team averages from filtered employees
  const vals = employees.map(e => e.metrics?.[tfKey]).filter(Boolean);
  const teamAvg = computeTeamAvg(vals);

  const cards = METRIC_DEFS.map(def => {
    const val = teamAvg[def.key];
    const formatted = formatMetric(val, def.format);
    const color = getKPIColor(def.key, val);
    return `
      <div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;letter-spacing:0.5px;">${def.label}</div>
        <div style="font-size:24px;font-weight:700;color:${color};">${formatted}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">${employees.length} employees</div>
      </div>
    `;
  });

  container.innerHTML = cards.join('');
}

function computeTeamAvg(metricsArr) {
  if (!metricsArr.length) return {};
  const sums = {};
  const counts = {};
  for (const m of metricsArr) {
    for (const def of METRIC_DEFS) {
      const v = m[def.key];
      if (v != null && !isNaN(v)) {
        sums[def.key] = (sums[def.key] || 0) + v;
        counts[def.key] = (counts[def.key] || 0) + 1;
      }
    }
  }
  const avg = {};
  for (const def of METRIC_DEFS) {
    if (def.key === 'closures') {
      // Sum, not average
      avg[def.key] = sums[def.key] || 0;
    } else {
      avg[def.key] = counts[def.key] ? sums[def.key] / counts[def.key] : null;
    }
  }
  return avg;
}

function getKPIColor(key, val) {
  if (val == null) return 'var(--text-muted)';
  // Color coding based on performance thresholds
  if (key === 'utilization') {
    return val >= 0.85 ? '#3fb950' : val >= 0.75 ? '#d29922' : '#f85149';
  }
  if (key === 'occupancy') {
    return val >= 0.80 ? '#3fb950' : val >= 0.70 ? '#d29922' : '#f85149';
  }
  if (key === 'throughput') {
    return val >= 3.0 ? '#3fb950' : val >= 2.0 ? '#d29922' : '#f85149';
  }
  if (key === 'aht') {
    // Lower is better for AHT
    return val <= 600 ? '#3fb950' : val <= 900 ? '#d29922' : '#f85149';
  }
  if (key === 'nht') {
    // Lower is better for NHT
    return val <= 0.20 ? '#3fb950' : val <= 0.35 ? '#d29922' : '#f85149';
  }
  return 'var(--text-primary)';
}

// ---- Table ----

function perfRenderTable(employees, tfKey) {
  const table = document.getElementById('perf-table');
  const empty = document.getElementById('perf-empty');
  const headerRow = document.getElementById('perf-table-header');
  const tbody = document.getElementById('perf-table-body');

  if (!employees.length) {
    if (table) table.style.display = 'none';
    if (empty) empty.style.display = 'block';
    return;
  }

  if (table) table.style.display = '';
  if (empty) empty.style.display = 'none';

  // Build header
  const columns = [
    { key: 'name', label: 'AGENT NAME' },
    { key: 'planning_group', label: 'PLANNING GROUP' },
    { key: 'sup_name', label: 'SUPERVISOR' },
    { key: 'shift_time', label: 'SHIFT' },
    ...METRIC_DEFS.map(d => ({ key: d.key, label: d.label })),
  ];

  if (headerRow) {
    headerRow.innerHTML = columns.map(col => {
      const arrow = perfSortCol === col.key ? (perfSortAsc ? ' ▲' : ' ▼') : '';
      return `<th style="cursor:pointer;white-space:nowrap;user-select:none;" onclick="perfSort('${col.key}')">${col.label}${arrow}</th>`;
    }).join('');
  }

  // Build body
  if (tbody) {
    tbody.innerHTML = employees.map(emp => {
      const m = emp.metrics?.[tfKey] || {};
      const cells = [
        `<td style="white-space:nowrap;font-weight:500;">${escHtml(emp.name || '')}</td>`,
        `<td>${escHtml(emp.planning_group || '')}</td>`,
        `<td>${escHtml(emp.sup_name || '')}</td>`,
        `<td>${escHtml(emp.shift_time || '')}</td>`,
      ];

      for (const def of METRIC_DEFS) {
        const val = m[def.key];
        const formatted = formatMetric(val, def.format);
        const color = val != null ? getKPIColor(def.key, val) : 'var(--text-muted)';
        cells.push(`<td style="text-align:right;color:${color};">${formatted}</td>`);
      }

      return `<tr>${cells.join('')}</tr>`;
    }).join('');
  }
}

function perfSort(colKey) {
  if (perfSortCol === colKey) {
    perfSortAsc = !perfSortAsc;
  } else {
    perfSortCol = colKey;
    perfSortAsc = true;
  }
  perfApplyFilters();
}

// ---- Upload ----

async function perfHandleUpload(input) {
  const file = input.files?.[0];
  if (!file) return;

  if (!file.name.endsWith('.xlsb')) {
    if (typeof showToast === 'function') showToast('Please select a .xlsb file', 'error');
    input.value = '';
    return;
  }

  // Size check (50MB limit)
  if (file.size > 50 * 1024 * 1024) {
    if (typeof showToast === 'function') showToast('File too large (max 50MB)', 'error');
    input.value = '';
    return;
  }

  const loading = document.getElementById('perf-loading');
  if (loading) {
    loading.style.display = 'flex';
    loading.querySelector('.loading-text').textContent = 'Uploading and processing file...';
  }

  try {
    // Read file as base64
    const base64 = await readFileAsBase64(file);

    const resp = await fetch(`${PERF_API}/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileData: base64,
        fileName: file.name,
        syncedBy: appState.currentUser?.ohr || '',
        syncedByName: appState.currentUser?.name || '',
      }),
    });

    if (!resp.ok) throw new Error('Upload failed');
    const result = await resp.json();

    if (typeof showToast === 'function') showToast('File uploaded. Processing...', 'success');

    // Poll for completion
    await perfPollSync(result.syncId);
  } catch (err) {
    console.error('[Performance] Upload error:', err);
    if (typeof showToast === 'function') showToast('Upload failed: ' + err.message, 'error');
    if (loading) loading.style.display = 'none';
  }

  input.value = '';
}

async function perfResync() {
  const loading = document.getElementById('perf-loading');
  if (loading) {
    loading.style.display = 'flex';
    loading.querySelector('.loading-text').textContent = 'Re-processing stored file...';
  }

  try {
    const resp = await fetch(`${PERF_API}/resync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        syncedBy: appState.currentUser?.ohr || '',
        syncedByName: appState.currentUser?.name || '',
      }),
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || 'Resync failed');
    }

    const result = await resp.json();
    if (typeof showToast === 'function') showToast('Re-processing started...', 'success');
    await perfPollSync(result.syncId);
  } catch (err) {
    console.error('[Performance] Resync error:', err);
    if (typeof showToast === 'function') showToast('Resync failed: ' + err.message, 'error');
    if (loading) loading.style.display = 'none';
  }
}

async function perfPollSync(syncId) {
  const loading = document.getElementById('perf-loading');
  const maxAttempts = 120; // 2 minutes max
  let attempt = 0;

  while (attempt < maxAttempts) {
    await new Promise(r => setTimeout(r, 1000));
    attempt++;

    try {
      const resp = await fetch(`${PERF_API}/sync-status/${syncId}`);
      const status = await resp.json();

      if (status.status === 'completed') {
        if (typeof showToast === 'function') {
          showToast(`Sync complete: ${status.total_employees} employees processed`, 'success');
        }
        // Reload data
        perfInitialized = false;
        await initPerformance();
        return;
      }

      if (status.status === 'failed') {
        throw new Error(status.error_message || 'Processing failed');
      }

      // Still processing
      if (loading) {
        loading.querySelector('.loading-text').textContent =
          `Processing... (${attempt}s)`;
      }
    } catch (err) {
      console.error('[Performance] Poll error:', err);
      if (typeof showToast === 'function') showToast('Processing failed: ' + err.message, 'error');
      if (loading) loading.style.display = 'none';
      return;
    }
  }

  if (typeof showToast === 'function') showToast('Processing timed out', 'error');
  if (loading) loading.style.display = 'none';
}

// ---- Sync Info ----

async function perfLoadSyncInfo() {
  try {
    const resp = await fetch(`${PERF_API}/sync-latest`);
    const latest = await resp.json();
    const infoEl = document.getElementById('perf-sync-info');
    if (infoEl && latest && latest.completed_at) {
      const d = new Date(latest.completed_at);
      infoEl.textContent = `Last sync: ${d.toLocaleDateString()} ${d.toLocaleTimeString()} (${latest.total_employees} employees)`;
    }
  } catch (err) {
    // Ignore
  }
}

// ---- Helpers ----

function formatMetric(val, format) {
  if (val == null || isNaN(val)) return '—';
  switch (format) {
    case 'percentage':
      return (val * 100).toFixed(1) + '%';
    case 'decimal':
      return val.toFixed(2);
    case 'seconds': {
      const mins = Math.floor(val / 60);
      const secs = Math.round(val % 60);
      return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
    }
    case 'integer':
      return Math.round(val).toLocaleString();
    default:
      return String(val);
  }
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
