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

// ===== Locked Out Accounts =====

async function loadLockedAccounts() {
  if (!isAdmin()) return;

  const loadingEl = document.getElementById('lockout-loading');
  const emptyEl = document.getElementById('lockout-empty');
  const wrapperEl = document.getElementById('lockout-table-wrapper');
  const tbody = document.getElementById('lockout-body');

  loadingEl.style.display = 'block';
  emptyEl.style.display = 'none';
  wrapperEl.style.display = 'none';

  try {
    const resp = await fetch(
      `${IO_API_BASE}/employees?is_locked=true&select=ohr_id,full_name,password,is_locked&limit=100`
    );
    const locked = await resp.json();

    loadingEl.style.display = 'none';

    if (!Array.isArray(locked) || locked.length === 0) {
      emptyEl.style.display = 'block';
      wrapperEl.style.display = 'none';
      return;
    }

    tbody.innerHTML = '';
    for (const emp of locked) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(emp.ohr_id)}</td>
        <td>${escapeHtml(emp.full_name || '')}</td>
        <td style="font-family:monospace;font-size:12px;">${escapeHtml(emp.password || '(none)')}</td>
        <td><button class="btn-unlock" onclick="unlockAccount('${escapeHtml(emp.ohr_id)}', this)">Unlock</button></td>
      `;
      tbody.appendChild(tr);
    }

    emptyEl.style.display = 'none';
    wrapperEl.style.display = 'block';
  } catch (err) {
    loadingEl.style.display = 'none';
    emptyEl.textContent = 'Error loading locked accounts.';
    emptyEl.style.display = 'block';
    console.error('Lockout load error:', err);
  }
}

async function unlockAccount(ohr, btn) {
  if (!isAdmin()) return;
  btn.disabled = true;
  btn.textContent = 'Unlocking...';

  try {
    const resp = await fetch(
      `${IO_API_BASE}/employees/${ohr}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_locked: false })
      }
    );
    if (resp.ok) {
      showToast(`Account ${ohr} unlocked successfully.`, 'success');
      btn.closest('tr').remove();
      const tbody = document.getElementById('lockout-body');
      if (tbody.children.length === 0) {
        document.getElementById('lockout-table-wrapper').style.display = 'none';
        document.getElementById('lockout-empty').style.display = 'block';
      }
    } else {
      showToast('Failed to unlock account.', 'error');
      btn.disabled = false;
      btn.textContent = 'Unlock';
    }
  } catch (err) {
    showToast('Error unlocking account: ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Unlock';
  }
}

// ===== Billing Data Sync from Google Sheet =====

async function runBillingSync() {
  if (!isAdmin()) return;

  const btn = document.getElementById('billing-sync-btn');
  const progressEl = document.getElementById('billing-sync-progress');
  const progressFill = document.getElementById('billing-sync-progress-fill');
  const progressText = document.getElementById('billing-sync-progress-text');
  const resultEl = document.getElementById('billing-sync-result');

  btn.disabled = true;
  btn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;animation:spin 1s linear infinite;"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
    Syncing...
  `;
  progressEl.style.display = 'flex';
  progressFill.style.width = '30%';
  progressText.textContent = 'Reading Google Sheet and updating attendance rows...';
  resultEl.style.display = 'none';

  try {
    const resp = await fetch(`${IO_API_BASE}/billing-sheet-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Actor-Ohr': window.currentUserOhr
      }
    });

    progressFill.style.width = '100%';

    const data = await resp.json();

    if (resp.ok && data.success) {
      progressText.textContent = 'Complete!';
      resultEl.className = 'admin-result success';
      resultEl.textContent = `Sync complete: ${data.totalSheetRows} sheet rows processed, ${data.updated} attendance rows updated, ${data.skipped} skipped (no match), ${data.employeesSynced || 0} employees updated. Duration: ${data.durationMs}ms.`;
      resultEl.style.display = 'block';
      showToast('Billing data synced successfully.', 'success');
      // Refresh the last sync info
      loadBillingSyncStatus();
    } else {
      progressText.textContent = 'Failed';
      resultEl.className = 'admin-result warning';
      resultEl.textContent = data.error || data.message || 'Sync failed.';
      resultEl.style.display = 'block';
      showToast('Billing sync failed.', 'error');
    }
  } catch (err) {
    progressFill.style.width = '100%';
    progressText.textContent = 'Error';
    resultEl.className = 'admin-result warning';
    resultEl.textContent = 'Network error: ' + err.message;
    resultEl.style.display = 'block';
    showToast('Billing sync error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
      Sync from Sheet
    `;
    setTimeout(() => {
      progressEl.style.display = 'none';
    }, 2000);
  }
}

async function loadBillingSyncStatus() {
  const statusEl = document.getElementById('billing-sync-status');
  const lastEl = document.getElementById('billing-sync-last');
  if (!statusEl || !lastEl) return;

  try {
    const resp = await fetch(`${IO_API_BASE}/sync-log/latest`, {
      headers: { 'X-User-Ohr': window.currentUserOhr }
    });
    if (!resp.ok) return;
    const log = await resp.json();

    // Find the latest billing sync log
    if (log && log.sync_type === 'billing_sheet') {
      const ts = new Date(log.completed_at || log.started_at);
      const timeAgo = getTimeAgo(ts);
      statusEl.textContent = log.status === 'success' ? 'Last sync OK' : 'Last sync failed';
      statusEl.style.background = log.status === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)';
      statusEl.style.color = log.status === 'success' ? '#22c55e' : '#ef4444';
      lastEl.textContent = `Last synced: ${ts.toLocaleString()} (${timeAgo})`;
    } else {
      lastEl.textContent = 'No billing sync has been run yet.';
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
