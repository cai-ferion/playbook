/**
 * Playbook — Admin Tools
 * Handles billing data sync from Google Sheet, locked-out account management,
 * and database backup/export.
 * Restricted to admin OHR 740045023.
 */

// ===== Constants =====

// ADMIN_OHR is declared in maintenance.js (loaded before admin.js)

// ===== Helpers =====

function isAdmin() {
  return window.currentUserOhr === ADMIN_OHR;
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== Locked Out Accounts (REMOVED — password system removed) =====

// ===== Billing CSV Upload =====

// Enable upload button when a billing CSV file is selected
document.addEventListener('DOMContentLoaded', () => {
  const csvInput = document.getElementById('billing-csv-input');
  const uploadBtn = document.getElementById('billing-upload-btn');
  if (csvInput && uploadBtn) {
    csvInput.addEventListener('change', () => {
      uploadBtn.disabled = !csvInput.files || csvInput.files.length === 0;
    });
  }
  // Load billing upload status on page load if admin
  setTimeout(() => {
    if (typeof isAdmin === 'function' && isAdmin()) {
      loadBillingUploadStatus();
    }
  }, 2000);
});

function billingParseCSV(text) {
  const rows = [];
  let current = '';
  let inQuotes = false;
  let row = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = false; }
      } else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { row.push(current.trim()); current = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') i++;
        row.push(current.trim());
        if (row.some(c => c !== '')) rows.push(row);
        row = []; current = '';
      } else { current += ch; }
    }
  }
  row.push(current.trim());
  if (row.some(c => c !== '')) rows.push(row);
  return rows;
}

async function runBillingCsvUpload() {
  if (!isAdmin()) return;
  const fileInput = document.getElementById('billing-csv-input');
  const btn = document.getElementById('billing-upload-btn');
  const progressEl = document.getElementById('billing-upload-progress');
  const progressFill = document.getElementById('billing-upload-progress-fill');
  const progressText = document.getElementById('billing-upload-progress-text');
  const resultEl = document.getElementById('billing-upload-result');

  if (!fileInput.files || fileInput.files.length === 0) {
    showToast('Please select a CSV file first.', 'warning'); return;
  }
  const file = fileInput.files[0];
  if (!file.name.toLowerCase().endsWith('.csv')) {
    showToast('Please select a .csv file.', 'warning'); return;
  }

  btn.disabled = true;
  btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;animation:spin 1s linear infinite;"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Uploading...';
  progressEl.style.display = 'flex';
  progressFill.style.width = '10%';
  progressText.textContent = 'Reading CSV file...';
  resultEl.style.display = 'none';

  try {
    const text = await file.text();
    progressFill.style.width = '20%';
    progressText.textContent = 'Parsing CSV data...';
    const allRows = billingParseCSV(text);
    if (allRows.length < 2) throw new Error('CSV must have at least a header row and one data row.');
    const header = allRows[0];
    const dataRows = allRows.slice(1);
    const totalData = dataRows.length;

    // Client-side chunking: send 2000 data rows per request to stay under proxy payload limits
    const CHUNK_SIZE = 2000;
    const totalChunks = Math.ceil(totalData / CHUNK_SIZE);
    let totalUpdated = 0, totalSkipped = 0, totalParsed = 0, totalParseErrors = 0;
    let totalEmployeesSynced = 0, totalSrtBillUpserted = 0, totalDurationMs = 0;
    let lastError = null;

    for (let c = 0; c < totalChunks; c++) {
      const start = c * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, totalData);
      const chunkRows = [header, ...dataRows.slice(start, end)];
      const pct = 20 + Math.round(((c + 0.5) / totalChunks) * 70);
      progressFill.style.width = pct + '%';
      progressText.textContent = `Uploading chunk ${c + 1}/${totalChunks} (rows ${start + 1}-${end} of ${totalData.toLocaleString()})...`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 min per chunk
      try {
        const resp = await fetch(`${IO_API_BASE}/billing-csv-upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Actor-Ohr': window.currentUserOhr },
          body: JSON.stringify({ rows: chunkRows }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        const data = await resp.json();
        if (resp.ok && data.success) {
          totalUpdated += (data.updated || 0);
          totalSkipped += (data.skipped || 0);
          totalParsed += (data.parsed || 0);
          totalParseErrors += (data.parseErrors || 0);
          totalEmployeesSynced += (data.employeesSynced || 0);
          totalSrtBillUpserted += (data.srtBillUpserted || 0);
          totalDurationMs += (data.durationMs || 0);
        } else {
          lastError = data.error || 'Chunk ' + (c + 1) + ' failed.';
        }
      } catch (chunkErr) {
        clearTimeout(timeoutId);
        lastError = 'Chunk ' + (c + 1) + ': ' + chunkErr.message;
      }
    }

    progressFill.style.width = '100%';
    if (lastError) {
      progressText.textContent = 'Completed with errors';
      resultEl.className = 'admin-result warning';
      resultEl.textContent = `Partial upload: ${totalParsed.toLocaleString()} parsed, ${totalUpdated.toLocaleString()} updated, ${totalSkipped.toLocaleString()} skipped. Last error: ${lastError}`;
      resultEl.style.display = 'block';
      showToast('Billing upload completed with errors.', 'warning');
    } else {
      progressText.textContent = 'Complete!';
      resultEl.className = 'admin-result success';
      resultEl.textContent = `Upload complete: ${totalParsed.toLocaleString()} rows parsed, ${totalUpdated.toLocaleString()} attendance rows updated, ${totalSkipped.toLocaleString()} skipped (no match), ${totalEmployeesSynced} employees updated, ${totalSrtBillUpserted} SRT bill entries. Total time: ${totalDurationMs}ms.`;
      resultEl.style.display = 'block';
      showToast('Billing data uploaded successfully.', 'success');
    }
    loadBillingUploadStatus();
  } catch (err) {
    progressFill.style.width = '100%';
    progressText.textContent = 'Error';
    resultEl.className = 'admin-result warning';
    resultEl.textContent = 'Error: ' + err.message;
    resultEl.style.display = 'block';
    showToast('Billing upload error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Upload CSV';
    fileInput.value = '';
    setTimeout(() => { progressEl.style.display = 'none'; }, 5000);
  }
}

async function loadBillingUploadStatus() {
  const statusEl = document.getElementById('billing-upload-status');
  const lastEl = document.getElementById('billing-upload-last');
  if (!statusEl || !lastEl) return;

  try {
    const resp = await fetch(`${IO_API_BASE}/sync-log/latest`, {
      headers: { 'X-User-Ohr': window.currentUserOhr }
    });
    if (!resp.ok) return;
    const log = await resp.json();

    if (log && (log.sync_type === 'billing_csv' || log.sync_type === 'billing_sheet')) {
      const ts = new Date(log.completed_at || log.started_at);
      const timeAgo = getTimeAgo(ts);
      statusEl.textContent = log.status === 'success' ? 'Last upload OK' : 'Last upload failed';
      statusEl.style.background = log.status === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)';
      statusEl.style.color = log.status === 'success' ? '#22c55e' : '#ef4444';
      lastEl.textContent = `Last uploaded: ${ts.toLocaleString()} (${timeAgo})`;
    } else {
      lastEl.textContent = 'No billing data has been uploaded yet.';
    }
  } catch {
    // Silently fail — non-critical
  }
}

function getTimeAgo(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

// ===== Admin View Load =====

function onAdminViewLoad() {
  if (isAdmin()) {
    loadLockedAccounts();
    loadBackupTables();
    loadBillingSyncStatus();
  }
}

// ===== Admin Tab Switching (Tools / Permissions) =====
function adminSwitchTab(tab) {
  const toolsPanel = document.getElementById('admin-panel-tools');
  const permsPanel = document.getElementById('admin-panel-permissions');
  const toolsTab = document.getElementById('admin-tab-tools');
  const permsTab = document.getElementById('admin-tab-permissions');

  if (tab === 'tools') {
    if (toolsPanel) toolsPanel.style.display = '';
    if (permsPanel) permsPanel.style.display = 'none';
    if (toolsTab) { toolsTab.style.borderBottomColor = 'var(--primary)'; toolsTab.style.color = 'var(--primary)'; toolsTab.classList.add('active'); }
    if (permsTab) { permsTab.style.borderBottomColor = 'transparent'; permsTab.style.color = 'var(--fg-muted)'; permsTab.classList.remove('active'); }
  } else if (tab === 'permissions') {
    if (toolsPanel) toolsPanel.style.display = 'none';
    if (permsPanel) permsPanel.style.display = '';
    if (permsTab) { permsTab.style.borderBottomColor = 'var(--primary)'; permsTab.style.color = 'var(--primary)'; permsTab.classList.add('active'); }
    if (toolsTab) { toolsTab.style.borderBottomColor = 'transparent'; toolsTab.style.color = 'var(--fg-muted)'; toolsTab.classList.remove('active'); }
    // Initialize permissions if not loaded
    if (typeof initPermissions === 'function') initPermissions();
  }
}

// ===== Database Backup / Export =====

async function loadBackupTables() {
  if (!isAdmin()) return;

  const loadingEl = document.getElementById('backup-loading');
  const wrapperEl = document.getElementById('backup-table-wrapper');
  const tbody = document.getElementById('backup-body');
  const resultEl = document.getElementById('backup-result');

  loadingEl.style.display = 'block';
  wrapperEl.style.display = 'none';
  resultEl.style.display = 'none';

  try {
    const resp = await fetch(`${IO_API_BASE}/backup/tables`);
    const tables = await resp.json();

    loadingEl.style.display = 'none';

    if (!Array.isArray(tables) || tables.length === 0) {
      resultEl.textContent = 'No tables found.';
      resultEl.className = 'admin-result warning';
      resultEl.style.display = 'block';
      return;
    }

    tbody.innerHTML = '';
    let totalRecords = 0;
    for (const t of tables) {
      totalRecords += t.count;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family:monospace;font-size:13px;">${escapeHtml(t.name)}</td>
        <td style="text-align:right;font-weight:600;">${Number(t.count).toLocaleString()}</td>
        <td><button class="btn-unlock" onclick="exportSingleTable('${escapeHtml(t.name)}', this)" style="font-size:12px;">Download CSV</button></td>
      `;
      tbody.appendChild(tr);
    }

    const totalTr = document.createElement('tr');
    totalTr.style.borderTop = '2px solid var(--border)';
    totalTr.style.fontWeight = '700';
    totalTr.innerHTML = `
      <td>TOTAL</td>
      <td style="text-align:right;">${totalRecords.toLocaleString()}</td>
      <td></td>
    `;
    tbody.appendChild(totalTr);

    wrapperEl.style.display = 'block';
  } catch (err) {
    loadingEl.style.display = 'none';
    resultEl.textContent = 'Error loading table info: ' + err.message;
    resultEl.className = 'admin-result warning';
    resultEl.style.display = 'block';
    console.error('Backup tables error:', err);
  }
}

async function exportSingleTable(tableName, btn) {
  if (!isAdmin()) return;
  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Exporting...';

  try {
    const resp = await fetch(`${IO_API_BASE}/backup/export/${tableName}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `${tableName}_${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`Downloaded ${tableName} as CSV.`, 'success');
  } catch (err) {
    showToast('Export error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
}

// ============================================================
// WFM Schedule Upload
// ============================================================

// Enable upload button when a file is selected
document.addEventListener('DOMContentLoaded', () => {
  const csvInput = document.getElementById('wfm-csv-input');
  const uploadBtn = document.getElementById('wfm-upload-btn');
  if (csvInput && uploadBtn) {
    csvInput.addEventListener('change', () => {
      uploadBtn.disabled = !csvInput.files || csvInput.files.length === 0;
    });
  }
  // Load WFM summary on page load if admin
  setTimeout(() => {
    if (typeof isAdmin === 'function' && isAdmin()) {
      wfmLoadScheduleSummary();
    }
  }, 2000);
});

function wfmParseCSV(text) {
  const rows = [];
  let current = '';
  let inQuotes = false;
  let row = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = false; }
      } else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { row.push(current.trim()); current = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') i++;
        row.push(current.trim());
        if (row.some(c => c !== '')) rows.push(row);
        row = []; current = '';
      } else { current += ch; }
    }
  }
  row.push(current.trim());
  if (row.some(c => c !== '')) rows.push(row);
  return rows;
}

async function wfmUploadSchedule() {
  if (!isAdmin()) return;
  const fileInput = document.getElementById('wfm-csv-input');
  const btn = document.getElementById('wfm-upload-btn');
  const progressEl = document.getElementById('wfm-upload-progress');
  const progressFill = document.getElementById('wfm-upload-progress-fill');
  const progressText = document.getElementById('wfm-upload-progress-text');
  const resultEl = document.getElementById('wfm-upload-result');

  if (!fileInput.files || fileInput.files.length === 0) {
    showToast('Please select a CSV file first.', 'warning'); return;
  }
  const file = fileInput.files[0];
  if (!file.name.toLowerCase().endsWith('.csv')) {
    showToast('Please select a .csv file.', 'warning'); return;
  }

  btn.disabled = true;
  btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;animation:spin 1s linear infinite;"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Uploading...';
  progressEl.style.display = 'flex';
  progressFill.style.width = '20%';
  progressText.textContent = 'Reading CSV file...';
  resultEl.style.display = 'none';

  try {
    const text = await file.text();
    progressFill.style.width = '40%';
    progressText.textContent = 'Parsing CSV data...';
    const rows = wfmParseCSV(text);
    if (rows.length < 2) throw new Error('CSV must have at least a header row and one data row.');
    const dateCount = rows[0].length - 2;
    if (dateCount < 1) throw new Error('CSV header must have at least 3 columns: OHR, Name, and at least one date.');

    progressFill.style.width = '60%';
    progressText.textContent = `Uploading ${rows.length - 1} employees × ${dateCount} dates...`;

    const wfmController = new AbortController();
    const wfmTimeoutId = setTimeout(() => wfmController.abort(), 180000); // 3 min timeout
    const resp = await fetch(`${IO_API_BASE}/wfm-schedule-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Actor-Ohr': window.currentUserOhr },
      body: JSON.stringify({ rows, uploadedBy: window.currentUserName || window.currentUserOhr }),
      signal: wfmController.signal
    });
    clearTimeout(wfmTimeoutId);
    progressFill.style.width = '100%';
    const data = await resp.json();

    if (resp.ok && data.success) {
      progressText.textContent = 'Complete!';
      resultEl.className = 'admin-result success';
      resultEl.textContent = `Upload complete: ${data.totalInserted} schedule entries across ${data.datesProcessed} dates. ${data.attendanceBackfilled} attendance rows backfilled with WFM tags.`;
      resultEl.style.display = 'block';
      showToast('WFM schedule uploaded successfully.', 'success');
      wfmLoadScheduleSummary();
    } else {
      progressText.textContent = 'Failed';
      resultEl.className = 'admin-result warning';
      resultEl.textContent = data.error || 'Upload failed.';
      resultEl.style.display = 'block';
      showToast('WFM upload failed: ' + (data.error || 'Unknown error'), 'error');
    }
  } catch (err) {
    progressFill.style.width = '100%';
    progressText.textContent = 'Error';
    resultEl.className = 'admin-result warning';
    resultEl.textContent = 'Error: ' + err.message;
    resultEl.style.display = 'block';
    showToast('WFM upload error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Upload Schedule';
    fileInput.value = '';
    setTimeout(() => { progressEl.style.display = 'none'; }, 3000);
  }
}

async function wfmLoadScheduleSummary() {
  const container = document.getElementById('wfm-schedule-summary');
  if (!container) return;
  try {
    const resp = await fetch(`${IO_API_BASE}/wfm-schedule/dates`);
    const dates = await resp.json();
    if (!Array.isArray(dates) || dates.length === 0) {
      container.innerHTML = '<p style="color:var(--fg-muted);font-size:13px;">No WFM schedule data uploaded yet.</p>';
      return;
    }
    let html = '<p style="font-size:13px;font-weight:600;color:var(--fg);margin-bottom:8px;">Uploaded Schedule Data</p>';
    html += '<div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;">';
    html += '<table class="data-table" style="font-size:12px;margin:0;"><thead><tr><th>Date</th><th>Entries</th><th>Last Upload</th><th>Uploaded By</th></tr></thead><tbody>';
    for (const d of dates) {
      const uploadTime = d.last_upload ? new Date(d.last_upload).toLocaleString() : '-';
      html += `<tr><td>${escapeHtml(d.schedule_date)}</td><td>${d.count}</td><td>${uploadTime}</td><td>${escapeHtml(d.uploaded_by || '-')}</td></tr>`;
    }
    html += '</tbody></table></div>';
    html += '<div style="margin-top:8px;"><button class="btn btn-outline btn-sm" onclick="wfmClearAllSchedules()" style="color:var(--danger);border-color:var(--danger);">Clear All WFM Data</button></div>';
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<p style="color:var(--danger);font-size:13px;">Failed to load schedule summary: ${err.message}</p>`;
  }
}

async function wfmClearAllSchedules() {
  if (!confirm('Are you sure you want to clear ALL WFM schedule data? This will also remove WFM tags from all attendance records.')) return;
  try {
    const resp = await fetch(`${IO_API_BASE}/wfm-schedule`, { method: 'DELETE', headers: { 'X-Actor-Ohr': window.currentUserOhr } });
    const data = await resp.json();
    if (resp.ok && data.success) {
      showToast('All WFM schedule data cleared.', 'success');
      wfmLoadScheduleSummary();
    } else {
      showToast('Failed to clear WFM data: ' + (data.error || 'Unknown'), 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ===== Database Backup / Export =====

async function exportAllTables() {
  if (!isAdmin()) return;
  const resultEl = document.getElementById('backup-result');
  resultEl.textContent = 'Exporting all tables... This may take a moment for large datasets.';
  resultEl.className = 'admin-result';
  resultEl.style.display = 'block';

  try {
    const resp = await fetch(`${IO_API_BASE}/backup/export-all`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `io_backup_${today}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    resultEl.textContent = 'All tables exported successfully.';
    resultEl.className = 'admin-result success';
    showToast('Full backup downloaded.', 'success');
  } catch (err) {
    resultEl.textContent = 'Export error: ' + err.message;
    resultEl.className = 'admin-result warning';
    showToast('Export error: ' + err.message, 'error');
  }
}
