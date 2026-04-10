/**
 * Billing Compliance V2 — Admin Tools JS
 * Handles SRT Billing Upload and Billing Targets V2 editor.
 */

// ============================================================
// Constants
// ============================================================
const PG_ROLE_COMBOS_V2 = [
  { planning_group: 'CEI_TASKFORCE_CTR', role: 'Agent' },
  { planning_group: 'CEI_TASKFORCE_CTR', role: 'Operational SME' },
  { planning_group: 'CEI_TASKFORCE_CTR', role: 'Quality & Policy Expert' },
  { planning_group: 'CSO_CTR', role: 'Agent' },
  { planning_group: 'FAD_CTR', role: 'Agent' },
  { planning_group: 'MASA_MAFSA_CTR_SCALED_REVIEW', role: 'Agent' },
  { planning_group: 'MASA_MAFSA_CTR_SCALED_REVIEW', role: 'Operational SME' },
  { planning_group: 'MASA_MAFSA_CTR_SCALED_REVIEW', role: 'Quality & Policy Expert' },
  { planning_group: 'QPE_CTR', role: 'Quality & Policy Expert' },
  { planning_group: 'RECALL_MEASUREMENT_CTR', role: 'Agent' },
  { planning_group: 'SME_CTR', role: 'Operational SME' },
];

// Short labels for planning groups
const PG_SHORT_LABELS = {
  'CEI_TASKFORCE_CTR': 'CEI Taskforce',
  'CSO_CTR': 'CSO',
  'FAD_CTR': 'FAD',
  'MASA_MAFSA_CTR_SCALED_REVIEW': 'MASA/MAFSA',
  'QPE_CTR': 'QPE',
  'RECALL_MEASUREMENT_CTR': 'Recall Measurement',
  'SME_CTR': 'SME',
};

let srtV2ParsedRows = null;

// ============================================================
// SRT Billing Upload
// ============================================================

async function initSrtV2Panel() {
  try {
    const resp = await fetch(`${IO_API_BASE}/srt-bill/summary`);
    const data = await resp.json();
    const el = document.getElementById('srt-v2-current-data');
    const badge = document.getElementById('srt-v2-status-badge');
    if (data && data.total_rows && Number(data.total_rows) > 0) {
      el.innerHTML = `<strong>Current data:</strong> ${Number(data.total_rows).toLocaleString()} rows | ${Number(data.unique_employees).toLocaleString()} employees | ${data.min_date} to ${data.max_date} | Actuals: ${Number(data.actuals_count || 0).toLocaleString()} | Projection: ${Number(data.projection_count || 0).toLocaleString()}`;
      badge.textContent = 'Data Loaded';
      badge.style.background = '#dcfce7';
      badge.style.color = '#166534';
    } else {
      el.innerHTML = '<em>No SRT billing data uploaded yet.</em>';
      badge.textContent = 'No Data';
      badge.style.background = '#fef3c7';
      badge.style.color = '#92400e';
    }
  } catch (e) {
    console.error('initSrtV2Panel error:', e);
  }
}

function handleSrtV2FileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  document.getElementById('srt-v2-file-name').textContent = file.name;
  document.getElementById('srt-v2-result').style.display = 'none';
  document.getElementById('srt-v2-preview').style.display = 'none';

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });

      // Find SRT_BILL sheet
      const sheetName = workbook.SheetNames.find(s => s.toUpperCase().includes('SRT_BILL'));
      if (!sheetName) {
        showToast('Sheet "SRT_BILL" not found in the uploaded file.', 'error');
        return;
      }

      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false });
      if (rows.length < 2) {
        showToast('No data rows found in SRT_BILL sheet.', 'error');
        return;
      }

      // Parse header row
      const headers = rows[0].map(h => String(h || '').trim().toLowerCase());
      const colIdx = {
        date: headers.indexOf('date'),
        ohr: headers.indexOf('ohr'),
        srt_id: headers.indexOf('srt_id'),
        billing_name: headers.indexOf('billing_name'),
        srt_status: headers.indexOf('srt_status'),
        actual_vs_projection: headers.indexOf('actual_vs_projection'),
        role: headers.indexOf('role'),
        planning_group: headers.indexOf('planning_group'),
      };

      if (colIdx.date < 0 || colIdx.ohr < 0) {
        showToast('Required columns "date" and "ohr" not found in SRT_BILL sheet.', 'error');
        return;
      }

      // Parse data rows
      const parsed = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row[colIdx.date] || !row[colIdx.ohr]) continue;

        // Parse date
        let dateVal = row[colIdx.date];
        let dateStr = '';
        if (dateVal instanceof Date) {
          dateStr = dateVal.toISOString().slice(0, 10);
        } else if (typeof dateVal === 'number') {
          // Excel serial date
          const d = new Date((dateVal - 25569) * 86400000);
          dateStr = d.toISOString().slice(0, 10);
        } else {
          // Try parsing string
          const d = new Date(String(dateVal));
          if (!isNaN(d.getTime())) {
            dateStr = d.toISOString().slice(0, 10);
          } else {
            dateStr = String(dateVal).trim();
          }
        }

        // Parse OHR (ensure it's a string, handle numeric)
        let ohr = row[colIdx.ohr];
        if (typeof ohr === 'number') ohr = String(Math.round(ohr));
        else ohr = String(ohr).trim();

        let srtId = colIdx.srt_id >= 0 ? row[colIdx.srt_id] : '';
        if (typeof srtId === 'number') srtId = String(Math.round(srtId));
        else srtId = String(srtId || '').trim();

        parsed.push({
          date: dateStr,
          ohr: ohr,
          srt_id: srtId,
          billing_name: colIdx.billing_name >= 0 ? String(row[colIdx.billing_name] || '').trim() : '',
          srt_status: colIdx.srt_status >= 0 ? String(row[colIdx.srt_status] || '').trim() : '',
          actual_vs_projection: colIdx.actual_vs_projection >= 0 ? String(row[colIdx.actual_vs_projection] || '').trim() : '',
          role: colIdx.role >= 0 ? String(row[colIdx.role] || '').trim() : '',
          planning_group: colIdx.planning_group >= 0 ? String(row[colIdx.planning_group] || '').trim() : '',
        });
      }

      if (parsed.length === 0) {
        showToast('No valid data rows found.', 'error');
        return;
      }

      srtV2ParsedRows = parsed;
      renderSrtV2Preview(parsed);
    } catch (err) {
      console.error('SRT V2 parse error:', err);
      showToast('Error parsing file: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function renderSrtV2Preview(parsed) {
  // Build summary: PG x Role -> { employees: Set, dates: Set, actuals: count, projection: count }
  const summary = new Map();
  const allDates = new Set();
  const allEmployees = new Set();
  let actualsTotal = 0, projectionTotal = 0;

  for (const r of parsed) {
    const key = `${r.planning_group}|${r.role}`;
    if (!summary.has(key)) {
      summary.set(key, { pg: r.planning_group, role: r.role, employees: new Set(), dates: new Set(), actuals: 0, projection: 0 });
    }
    const s = summary.get(key);
    s.employees.add(r.ohr);
    s.dates.add(r.date);
    allDates.add(r.date);
    allEmployees.add(r.ohr);
    if (r.actual_vs_projection === 'Actuals') { s.actuals++; actualsTotal++; }
    else { s.projection++; projectionTotal++; }
  }

  const sortedDates = Array.from(allDates).sort();
  const statsEl = document.getElementById('srt-v2-preview-stats');
  statsEl.innerHTML = `
    <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:13px;">
      <span><strong>Total Rows:</strong> ${parsed.length.toLocaleString()}</span>
      <span><strong>Employees:</strong> ${allEmployees.size.toLocaleString()}</span>
      <span><strong>Date Range:</strong> ${sortedDates[0]} to ${sortedDates[sortedDates.length - 1]}</span>
      <span><strong>Days:</strong> ${allDates.size}</span>
      <span style="color:#166534;"><strong>Actuals:</strong> ${actualsTotal.toLocaleString()}</span>
      <span style="color:#1e40af;"><strong>Projection:</strong> ${projectionTotal.toLocaleString()}</span>
    </div>
  `;

  const tbody = document.getElementById('srt-v2-preview-body');
  tbody.innerHTML = '';
  // Sort by PG_ROLE_COMBOS_V2 order
  const orderedKeys = PG_ROLE_COMBOS_V2.map(c => `${c.planning_group}|${c.role}`);
  const allSummaryKeys = new Set(orderedKeys);
  summary.forEach((_, k) => allSummaryKeys.add(k));

  for (const key of allSummaryKeys) {
    const s = summary.get(key);
    if (!s) continue;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${PG_SHORT_LABELS[s.pg] || s.pg}</td>
      <td>${s.role}</td>
      <td style="text-align:center">${s.employees.size}</td>
      <td style="text-align:center">${s.dates.size}</td>
      <td style="text-align:center;color:#166534;">${s.actuals}</td>
      <td style="text-align:center;color:#1e40af;">${s.projection}</td>
    `;
    tbody.appendChild(tr);
  }

  document.getElementById('srt-v2-preview').style.display = 'block';
}

function cancelSrtV2Upload() {
  srtV2ParsedRows = null;
  document.getElementById('srt-v2-preview').style.display = 'none';
  document.getElementById('srt-v2-file-input').value = '';
  document.getElementById('srt-v2-file-name').textContent = 'No file selected';
}

async function applySrtV2Upload() {
  if (!srtV2ParsedRows || srtV2ParsedRows.length === 0) {
    showToast('No data to upload.', 'error');
    return;
  }

  const btn = document.getElementById('srt-v2-apply-btn');
  btn.disabled = true;
  btn.textContent = 'Uploading...';

  const progressEl = document.getElementById('srt-v2-progress');
  const progressFill = document.getElementById('srt-v2-progress-fill');
  const progressText = document.getElementById('srt-v2-progress-text');
  progressEl.style.display = 'block';
  progressFill.style.width = '10%';
  progressText.textContent = 'Clearing existing data...';

  try {
    // Step 1: Clear existing SRT bill data
    await fetch(`${IO_API_BASE}/srt-bill`, { method: 'DELETE' });
    progressFill.style.width = '20%';
    progressText.textContent = 'Uploading rows...';

    // Step 2: Upload in batches of 500
    const batchSize = 500;
    const total = srtV2ParsedRows.length;
    let uploaded = 0;

    for (let i = 0; i < total; i += batchSize) {
      const batch = srtV2ParsedRows.slice(i, i + batchSize);
      const resp = await fetch(`${IO_API_BASE}/srt-bill-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: batch })
      });
      const result = await resp.json();
      if (!result.success) throw new Error(result.error || 'Upload failed');
      uploaded += batch.length;
      const pct = 20 + Math.round((uploaded / total) * 70);
      progressFill.style.width = pct + '%';
      progressText.textContent = `Uploaded ${uploaded.toLocaleString()} / ${total.toLocaleString()} rows...`;
    }

    progressFill.style.width = '95%';
    progressText.textContent = 'Syncing employee data...';

    // Final sync is done server-side in the last batch
    progressFill.style.width = '100%';
    progressText.textContent = 'Complete!';

    const resultEl = document.getElementById('srt-v2-result');
    resultEl.style.display = 'block';
    resultEl.innerHTML = `<span style="color:#166534;">✓ Successfully uploaded ${total.toLocaleString()} rows.</span>`;

    // Refresh the summary
    await initSrtV2Panel();

    // Hide preview
    document.getElementById('srt-v2-preview').style.display = 'none';
    srtV2ParsedRows = null;
    document.getElementById('srt-v2-file-input').value = '';
    document.getElementById('srt-v2-file-name').textContent = 'No file selected';

    showToast(`SRT Billing data uploaded: ${total.toLocaleString()} rows`, 'success');
  } catch (err) {
    console.error('SRT V2 upload error:', err);
    showToast('Upload failed: ' + err.message, 'error');
    const resultEl = document.getElementById('srt-v2-result');
    resultEl.style.display = 'block';
    resultEl.innerHTML = `<span style="color:#dc2626;">✗ Upload failed: ${err.message}</span>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Apply & Upload';
    setTimeout(() => { progressEl.style.display = 'none'; }, 3000);
  }
}

// ============================================================
// Billing Targets V2 Editor
// ============================================================

let targetsV2Data = [];
let targetsV2WeekEndings = [];

async function initTargetsV2Panel() {
  try {
    // Load available week endings
    const resp = await fetch(`${IO_API_BASE}/billing-targets-v2/weeks`);
    targetsV2WeekEndings = await resp.json();
    const select = document.getElementById('targets-v2-week-select');
    // Keep the first option
    select.innerHTML = '<option value="">Select Week Ending</option>';
    for (const we of targetsV2WeekEndings) {
      const opt = document.createElement('option');
      opt.value = we;
      opt.textContent = we;
      select.appendChild(opt);
    }
  } catch (e) {
    console.error('initTargetsV2Panel error:', e);
  }
}

async function loadTargetsV2() {
  const we = document.getElementById('targets-v2-week-select').value;
  if (!we) {
    document.getElementById('targets-v2-table-wrapper').style.display = 'none';
    document.getElementById('targets-v2-actions').style.display = 'none';
    document.getElementById('targets-v2-empty').style.display = 'block';
    return;
  }

  document.getElementById('targets-v2-empty').style.display = 'none';
  document.getElementById('targets-v2-loading').style.display = 'block';

  try {
    const resp = await fetch(`${IO_API_BASE}/billing-targets-v2?week_ending=${we}`);
    const data = await resp.json();

    // Build a map of existing targets
    const existingMap = new Map();
    for (const t of data) {
      existingMap.set(`${t.planning_group}|${t.role}`, t);
    }

    // Render table with all 11 combos
    const tbody = document.getElementById('targets-v2-body');
    tbody.innerHTML = '';
    targetsV2Data = [];

    for (const combo of PG_ROLE_COMBOS_V2) {
      const key = `${combo.planning_group}|${combo.role}`;
      const existing = existingMap.get(key);
      const hc = existing ? Number(existing.target_hc) || 0 : 0;
      const hrs = existing ? Number(existing.target_hours) || 0 : 0;

      targetsV2Data.push({ planning_group: combo.planning_group, role: combo.role, target_hc: hc, target_hours: hrs });

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${PG_SHORT_LABELS[combo.planning_group] || combo.planning_group}</td>
        <td>${combo.role}</td>
        <td style="text-align:center;"><input type="number" class="form-input" style="width:80px;text-align:center;font-size:12px;padding:4px 6px;" value="${hc}" min="0" data-pg="${combo.planning_group}" data-role="${combo.role}" data-field="target_hc" onchange="updateTargetV2Field(this)"></td>
        <td style="text-align:center;"><input type="number" class="form-input" style="width:100px;text-align:center;font-size:12px;padding:4px 6px;" value="${hrs}" min="0" step="0.01" data-pg="${combo.planning_group}" data-role="${combo.role}" data-field="target_hours" onchange="updateTargetV2Field(this)"></td>
      `;
      tbody.appendChild(tr);
    }

    document.getElementById('targets-v2-table-wrapper').style.display = 'block';
    document.getElementById('targets-v2-actions').style.display = 'flex';
    document.getElementById('targets-v2-loading').style.display = 'none';
  } catch (err) {
    console.error('loadTargetsV2 error:', err);
    document.getElementById('targets-v2-loading').style.display = 'none';
    showToast('Failed to load targets: ' + err.message, 'error');
  }
}

function updateTargetV2Field(input) {
  const pg = input.dataset.pg;
  const role = input.dataset.role;
  const field = input.dataset.field;
  const val = parseFloat(input.value) || 0;
  const entry = targetsV2Data.find(t => t.planning_group === pg && t.role === role);
  if (entry) entry[field] = val;
}

async function saveTargetsV2() {
  const we = document.getElementById('targets-v2-week-select').value;
  if (!we) {
    showToast('Select a week ending first.', 'error');
    return;
  }

  const targets = targetsV2Data.map(t => ({
    week_ending: we,
    planning_group: t.planning_group,
    role: t.role,
    target_hc: t.target_hc,
    target_hours: t.target_hours
  }));

  try {
    const resp = await fetch(`${IO_API_BASE}/billing-targets-v2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targets })
    });
    const result = await resp.json();
    if (result.success) {
      showToast(`Targets saved for ${we}: ${result.upserted} entries.`, 'success');
      const resultEl = document.getElementById('targets-v2-result');
      resultEl.style.display = 'block';
      resultEl.innerHTML = `<span style="color:#166534;">✓ Saved ${result.upserted} targets for ${we}.</span>`;
      // Refresh week list
      await initTargetsV2Panel();
      document.getElementById('targets-v2-week-select').value = we;
    } else {
      throw new Error(result.error || 'Save failed');
    }
  } catch (err) {
    console.error('saveTargetsV2 error:', err);
    showToast('Failed to save targets: ' + err.message, 'error');
  }
}

function addTargetsV2Week() {
  // Prompt for a new week ending date (Saturday)
  const input = prompt('Enter the new Week Ending date (Saturday, YYYY-MM-DD):');
  if (!input) return;
  const d = new Date(input + 'T00:00:00Z');
  if (isNaN(d.getTime())) {
    showToast('Invalid date format.', 'error');
    return;
  }
  // Validate it's a Saturday (day 6)
  if (d.getUTCDay() !== 6) {
    showToast('Week ending must be a Saturday.', 'error');
    return;
  }
  const dateStr = d.toISOString().slice(0, 10);
  const select = document.getElementById('targets-v2-week-select');
  // Check if already exists
  const existing = Array.from(select.options).find(o => o.value === dateStr);
  if (!existing) {
    const opt = document.createElement('option');
    opt.value = dateStr;
    opt.textContent = dateStr;
    // Insert in sorted position
    let inserted = false;
    for (let i = 1; i < select.options.length; i++) {
      if (select.options[i].value < dateStr) {
        select.insertBefore(opt, select.options[i]);
        inserted = true;
        break;
      }
    }
    if (!inserted) select.appendChild(opt);
  }
  select.value = dateStr;
  loadTargetsV2();
}

async function copyTargetsV2FromPrevious() {
  const we = document.getElementById('targets-v2-week-select').value;
  if (!we) {
    showToast('Select a week ending first.', 'error');
    return;
  }

  // Find the previous week ending in the list
  const currentIdx = targetsV2WeekEndings.indexOf(we);
  let prevWe = null;
  if (currentIdx >= 0 && currentIdx < targetsV2WeekEndings.length - 1) {
    prevWe = targetsV2WeekEndings[currentIdx + 1]; // list is DESC sorted
  } else {
    // Try computing previous Saturday
    const d = new Date(we + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 7);
    prevWe = d.toISOString().slice(0, 10);
  }

  try {
    const resp = await fetch(`${IO_API_BASE}/billing-targets-v2?week_ending=${prevWe}`);
    const data = await resp.json();
    if (!data || data.length === 0) {
      showToast(`No targets found for previous week (${prevWe}).`, 'info');
      return;
    }

    // Apply to current inputs
    const inputs = document.querySelectorAll('#targets-v2-body input');
    for (const input of inputs) {
      const pg = input.dataset.pg;
      const role = input.dataset.role;
      const field = input.dataset.field;
      const match = data.find(t => t.planning_group === pg && t.role === role);
      if (match) {
        input.value = field === 'target_hc' ? (Number(match.target_hc) || 0) : (Number(match.target_hours) || 0);
        updateTargetV2Field(input);
      }
    }

    showToast(`Copied targets from ${prevWe}. Click "Save Targets" to apply.`, 'success');
  } catch (err) {
    console.error('copyTargetsV2FromPrevious error:', err);
    showToast('Failed to copy: ' + err.message, 'error');
  }
}

// ============================================================
// Init on admin view load
// ============================================================
// Hook into the existing switchView function
const _origSwitchViewForV2 = window.switchView;
if (_origSwitchViewForV2) {
  window.switchView = function(view) {
    _origSwitchViewForV2(view);
    if (view === 'admin') {
      initSrtV2Panel();
      initTargetsV2Panel();
    }
  };
} else {
  // Fallback: init when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    initSrtV2Panel();
    initTargetsV2Panel();
  });
}
