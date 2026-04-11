/**
 * Sync History — Admin-only page (OHR 740045023)
 * Shows last sync status indicator + full sync log table with pagination.
 */

/* global currentUser */

// ── State ──────────────────────────────────────────────────────────────────

const syncHistoryState = {
  logs: [],
  total: 0,
  page: 1,
  pageSize: 15,
  loading: false,
  syncing: false,
};

// ── Init ───────────────────────────────────────────────────────────────────

async function initSyncHistory() {
  if (!currentUser || currentUser.ohr_id !== '740045023') return;
  await loadSyncHistory();
}

// ── Data fetching ──────────────────────────────────────────────────────────

async function loadSyncHistory() {
  if (syncHistoryState.loading) return;
  syncHistoryState.loading = true;
  renderSyncHistoryLoading();

  try {
    const offset = (syncHistoryState.page - 1) * syncHistoryState.pageSize;
    const res = await fetch(`/api/io/sync-log?limit=${syncHistoryState.pageSize}&offset=${offset}`, {
      headers: { 'X-User-Ohr': currentUser.ohr_id },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    syncHistoryState.logs = data.rows || [];
    syncHistoryState.total = data.total || 0;
  } catch (err) {
    console.error('[SyncHistory] Load error:', err);
    syncHistoryState.logs = [];
    syncHistoryState.total = 0;
  } finally {
    syncHistoryState.loading = false;
    renderSyncHistory();
  }
}

// ── Manual sync trigger ────────────────────────────────────────────────────

async function triggerManualSync() {
  if (syncHistoryState.syncing) return;
  syncHistoryState.syncing = true;
  const btn = document.getElementById('sync-trigger-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="sh-spinner"></span> Syncing...';
  }

  try {
    const res = await fetch('/api/io/sync-attendance', {
      method: 'POST',
      headers: { 'X-Actor-Ohr': currentUser.ohr_id },
    });
    const data = await res.json();
    if (data.ok) {
      showSyncToast('Sync completed successfully', 'success');
    } else {
      showSyncToast('Sync completed with errors: ' + (data.error || '').substring(0, 100), 'error');
    }
  } catch (err) {
    showSyncToast('Sync failed: ' + err.message, 'error');
  } finally {
    syncHistoryState.syncing = false;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Run Sync Now';
    }
    // Reload the log table
    syncHistoryState.page = 1;
    await loadSyncHistory();
  }
}

// ── Toast notification ─────────────────────────────────────────────────────

function showSyncToast(message, type) {
  const existing = document.getElementById('sync-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'sync-toast';
  toast.className = `sh-toast sh-toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add('sh-toast-visible'), 10);
  setTimeout(() => {
    toast.classList.remove('sh-toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ── Rendering ──────────────────────────────────────────────────────────────

function renderSyncHistoryLoading() {
  const container = document.getElementById('sync-history-content');
  if (!container) return;
  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;padding:60px 0;color:var(--fg-muted);">
      <span class="sh-spinner" style="margin-right:8px;"></span> Loading sync history...
    </div>`;
}

function renderSyncHistory() {
  const container = document.getElementById('sync-history-content');
  if (!container) return;

  const latest = syncHistoryState.logs.length > 0 ? syncHistoryState.logs[0] : null;
  const totalPages = Math.ceil(syncHistoryState.total / syncHistoryState.pageSize) || 1;

  container.innerHTML = `
    <!-- Status Card -->
    <div class="sh-status-card">
      <div class="sh-status-row">
        <div class="sh-status-left">
          <div class="sh-status-indicator ${latest ? getStatusClass(latest.status) : 'sh-status-unknown'}">
            ${latest ? getStatusIcon(latest.status) : getStatusIcon('unknown')}
          </div>
          <div class="sh-status-info">
            <div class="sh-status-label">Last Sync</div>
            <div class="sh-status-time">${latest ? formatSyncTime(latest.completed_at || latest.started_at) : 'No sync runs yet'}</div>
            ${latest ? `<div class="sh-status-meta">
              <span class="sh-meta-badge sh-trigger-${latest.trigger}">${formatTrigger(latest.trigger)}</span>
              <span class="sh-meta-sep">&middot;</span>
              <span>${latest.rows_updated || 0} updated</span>
              <span class="sh-meta-sep">&middot;</span>
              <span>${latest.rows_appended || 0} appended</span>
              ${latest.duration_ms ? `<span class="sh-meta-sep">&middot;</span><span>${formatDuration(latest.duration_ms)}</span>` : ''}
            </div>` : ''}
          </div>
        </div>
        <div class="sh-status-right">
          <button class="btn btn-primary btn-sm" id="sync-trigger-btn" onclick="triggerManualSync()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            Run Sync Now
          </button>
          <div class="sh-schedule-note">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Auto: 1:30 AM &amp; 4:30 PM PHT
          </div>
        </div>
      </div>
    </div>

    <!-- Sync Log Table -->
    <div class="sh-table-card">
      <div class="sh-table-header">
        <span class="sh-table-title">Sync Log</span>
        <span class="sh-table-count">${syncHistoryState.total} total run${syncHistoryState.total !== 1 ? 's' : ''}</span>
      </div>
      ${syncHistoryState.logs.length === 0 ? `
        <div style="padding:40px 0;text-align:center;color:var(--fg-muted);font-size:13px;">
          No sync runs recorded yet. Click "Run Sync Now" to trigger the first sync.
        </div>
      ` : `
        <div class="sh-table-wrapper">
          <table class="sh-table">
            <thead>
              <tr>
                <th style="width:50px;">#</th>
                <th>Started</th>
                <th>Trigger</th>
                <th>Status</th>
                <th style="text-align:right;">Updated</th>
                <th style="text-align:right;">Appended</th>
                <th style="text-align:right;">Duration</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              ${syncHistoryState.logs.map((log, i) => {
                const rowNum = syncHistoryState.total - ((syncHistoryState.page - 1) * syncHistoryState.pageSize) - i;
                return `
                  <tr class="sh-row ${log.status === 'error' ? 'sh-row-error' : ''}">
                    <td class="sh-cell-num">${rowNum}</td>
                    <td>${formatSyncTime(log.started_at)}</td>
                    <td><span class="sh-meta-badge sh-trigger-${log.trigger}">${formatTrigger(log.trigger)}</span></td>
                    <td>
                      <span class="sh-status-badge sh-badge-${log.status}">
                        ${getStatusDot(log.status)} ${log.status}
                      </span>
                    </td>
                    <td style="text-align:right;font-variant-numeric:tabular-nums;">${log.rows_updated || 0}</td>
                    <td style="text-align:right;font-variant-numeric:tabular-nums;">${log.rows_appended || 0}</td>
                    <td style="text-align:right;font-variant-numeric:tabular-nums;">${log.duration_ms ? formatDuration(log.duration_ms) : '—'}</td>
                    <td>
                      <button class="sh-detail-btn" onclick="toggleSyncLogDetail(${log.id})" title="View output">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      </button>
                    </td>
                  </tr>
                  <tr class="sh-detail-row" id="sh-detail-${log.id}" style="display:none;">
                    <td colspan="8">
                      <div class="sh-detail-content">
                        ${log.error_message ? `<div class="sh-detail-error"><strong>Error:</strong> ${escapeHtml(log.error_message)}</div>` : ''}
                        <div class="sh-detail-stats">
                          <span>DB Rows: ${log.total_db_rows || '—'}</span>
                          <span>Sheet Rows: ${log.total_sheet_rows || '—'}</span>
                          <span>Completed: ${log.completed_at ? formatSyncTime(log.completed_at) : '—'}</span>
                        </div>
                        ${log.output_log ? `<pre class="sh-detail-output">${escapeHtml(log.output_log)}</pre>` : '<div style="color:var(--fg-subtle);font-size:12px;">No output captured</div>'}
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
        ${totalPages > 1 ? `
          <div class="sh-pagination">
            <button class="btn btn-outline btn-sm" ${syncHistoryState.page <= 1 ? 'disabled' : ''} onclick="syncHistoryGoPage(${syncHistoryState.page - 1})">
              &laquo; Prev
            </button>
            <span class="sh-page-info">Page ${syncHistoryState.page} of ${totalPages}</span>
            <button class="btn btn-outline btn-sm" ${syncHistoryState.page >= totalPages ? 'disabled' : ''} onclick="syncHistoryGoPage(${syncHistoryState.page + 1})">
              Next &raquo;
            </button>
          </div>
        ` : ''}
      `}
    </div>
  `;
}

// ── Pagination ─────────────────────────────────────────────────────────────

function syncHistoryGoPage(page) {
  if (page < 1) return;
  syncHistoryState.page = page;
  loadSyncHistory();
}

// ── Toggle detail row ──────────────────────────────────────────────────────

function toggleSyncLogDetail(id) {
  const row = document.getElementById('sh-detail-' + id);
  if (!row) return;
  row.style.display = row.style.display === 'none' ? '' : 'none';
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getStatusClass(status) {
  if (status === 'success') return 'sh-status-ok';
  if (status === 'error') return 'sh-status-err';
  if (status === 'running') return 'sh-status-run';
  return 'sh-status-unknown';
}

function getStatusIcon(status) {
  if (status === 'success') return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  if (status === 'error') return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
  if (status === 'running') return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
  return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
}

function getStatusDot(status) {
  const colors = { success: '#22C55E', error: '#E53935', running: '#00B5E2' };
  const color = colors[status] || '#8993A4';
  return `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${color};margin-right:4px;vertical-align:middle;"></span>`;
}

function formatTrigger(trigger) {
  if (trigger === 'cron_0130') return 'Cron 1:30 AM';
  if (trigger === 'cron_1630') return 'Cron 4:30 PM';
  if (trigger === 'manual') return 'Manual';
  return trigger || '—';
}

function formatSyncTime(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    // Format in PHT (UTC+8)
    return d.toLocaleString('en-US', {
      timeZone: 'Asia/Manila',
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', second: '2-digit',
      hour12: true,
    });
  } catch {
    return isoStr;
  }
}

function formatDuration(ms) {
  if (ms < 1000) return ms + 'ms';
  const secs = (ms / 1000).toFixed(1);
  if (secs < 60) return secs + 's';
  const mins = Math.floor(ms / 60000);
  const remSecs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${remSecs}s`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
