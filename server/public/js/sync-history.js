/**
 * Sync History — Admin-only page (OHR 740045023)
 * Tabbed view: Attendance sync + Roster sync
 * Each tab shows last sync status, manual trigger button, and full log table.
 */

/* global currentUser */

// ── State ──────────────────────────────────────────────────────────────────

const syncTabs = {
  active: 'attendance', // 'attendance' | 'roster'
  attendance: {
    logs: [], total: 0, page: 1, pageSize: 15, loading: false, syncing: false,
    syncType: 'attendance',
    endpoint: '/api/io/sync-attendance',
    cronLabel: 'Auto: 1:30 AM & 4:30 PM PHT',
    triggerLabel: 'Sync Attendance',
  },
  roster: {
    logs: [], total: 0, page: 1, pageSize: 15, loading: false, syncing: false,
    syncType: 'roster',
    endpoint: '/api/io/sync-roster',
    cronLabel: 'Auto: 2:00 AM PHT',
    triggerLabel: 'Sync Roster',
  },
};

function getActiveTab() {
  return syncTabs[syncTabs.active];
}

// ── Init ───────────────────────────────────────────────────────────────────

async function initSyncHistory() {
  if (!currentUser || currentUser.ohr_id !== '740045023') return;
  renderSyncShell();
  await loadTabData();
}

// ── Tab switching ──────────────────────────────────────────────────────────

function switchSyncTab(tabName) {
  if (tabName === syncTabs.active) return;
  syncTabs.active = tabName;

  // Update tab button styles
  document.querySelectorAll('.sh-tab-btn').forEach(btn => {
    btn.classList.toggle('sh-tab-active', btn.dataset.tab === tabName);
  });

  loadTabData();
}

// ── Data fetching ──────────────────────────────────────────────────────────

async function loadTabData() {
  const tab = getActiveTab();
  if (tab.loading) return;
  tab.loading = true;
  renderTabContent(tab, true);

  try {
    const offset = (tab.page - 1) * tab.pageSize;
    const res = await fetch(
      `/api/io/sync-log?sync_type=${tab.syncType}&limit=${tab.pageSize}&offset=${offset}`,
      { headers: { 'X-User-Ohr': currentUser.ohr_id } }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    tab.logs = data.rows || [];
    tab.total = data.total || 0;
  } catch (err) {
    console.error('[SyncHistory] Load error:', err);
    tab.logs = [];
    tab.total = 0;
  } finally {
    tab.loading = false;
    renderTabContent(tab, false);
  }
}

// ── Manual sync trigger ────────────────────────────────────────────────────

async function triggerManualSync(tabName) {
  const tab = syncTabs[tabName];
  if (tab.syncing) return;
  tab.syncing = true;
  const btn = document.getElementById(`sync-trigger-btn-${tabName}`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="sh-spinner"></span> Syncing...';
  }

  try {
    const res = await fetch(tab.endpoint, {
      method: 'POST',
      headers: { 'X-Actor-Ohr': currentUser.ohr_id },
    });
    const data = await res.json();
    if (data.status === 'success' || data.ok) {
      showSyncToast(`${tab.triggerLabel} completed successfully`, 'success');
    } else {
      showSyncToast(`${tab.triggerLabel} completed with errors: ` + (data.error || '').substring(0, 100), 'error');
    }
  } catch (err) {
    showSyncToast(`${tab.triggerLabel} failed: ` + err.message, 'error');
  } finally {
    tab.syncing = false;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = syncBtnIcon + ' ' + tab.triggerLabel;
    }
    tab.page = 1;
    await loadTabData();
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

// ── SVG icons ──────────────────────────────────────────────────────────────

const syncBtnIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>';

// ── Rendering: Shell (tabs) ────────────────────────────────────────────────

function renderSyncShell() {
  const container = document.getElementById('sync-history-content');
  if (!container) return;

  container.innerHTML = `
    <div class="sh-tabs-bar">
      <button class="sh-tab-btn sh-tab-active" data-tab="attendance" onclick="switchSyncTab('attendance')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        Attendance
      </button>
      <button class="sh-tab-btn" data-tab="roster" onclick="switchSyncTab('roster')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        Roster
      </button>
    </div>
    <div id="sh-tab-body"></div>
  `;
}

// ── Rendering: Tab content ─────────────────────────────────────────────────

function renderTabContent(tab, isLoading) {
  const body = document.getElementById('sh-tab-body');
  if (!body) return;

  if (isLoading) {
    body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;padding:60px 0;color:var(--fg-muted);">
        <span class="sh-spinner" style="margin-right:8px;"></span> Loading ${tab.triggerLabel.toLowerCase()} history...
      </div>`;
    return;
  }

  const latest = tab.logs.length > 0 ? tab.logs[0] : null;
  const totalPages = Math.ceil(tab.total / tab.pageSize) || 1;
  const tabName = tab.syncType;

  body.innerHTML = `
    <!-- Status Card -->
    <div class="sh-status-card">
      <div class="sh-status-row">
        <div class="sh-status-left">
          <div class="sh-status-indicator ${latest ? getStatusClass(latest.status) : 'sh-status-unknown'}">
            ${latest ? getStatusIcon(latest.status) : getStatusIcon('unknown')}
          </div>
          <div class="sh-status-info">
            <div class="sh-status-label">Last ${tab.triggerLabel}</div>
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
          <button class="btn btn-primary btn-sm" id="sync-trigger-btn-${tabName}" onclick="triggerManualSync('${tabName}')">
            ${syncBtnIcon} ${tab.triggerLabel}
          </button>
          <div class="sh-schedule-note">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ${tab.cronLabel}
          </div>
        </div>
      </div>
    </div>

    <!-- Sync Log Table -->
    <div class="sh-table-card">
      <div class="sh-table-header">
        <span class="sh-table-title">${tab.triggerLabel} Log</span>
        <span class="sh-table-count">${tab.total} total run${tab.total !== 1 ? 's' : ''}</span>
      </div>
      ${tab.logs.length === 0 ? `
        <div style="padding:40px 0;text-align:center;color:var(--fg-muted);font-size:13px;">
          No sync runs recorded yet. Click "${tab.triggerLabel}" to trigger the first sync.
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
              ${tab.logs.map((log, i) => {
                const rowNum = tab.total - ((tab.page - 1) * tab.pageSize) - i;
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
            <button class="btn btn-outline btn-sm" ${tab.page <= 1 ? 'disabled' : ''} onclick="syncTabGoPage('${tabName}', ${tab.page - 1})">
              &laquo; Prev
            </button>
            <span class="sh-page-info">Page ${tab.page} of ${totalPages}</span>
            <button class="btn btn-outline btn-sm" ${tab.page >= totalPages ? 'disabled' : ''} onclick="syncTabGoPage('${tabName}', ${tab.page + 1})">
              Next &raquo;
            </button>
          </div>
        ` : ''}
      `}
    </div>
  `;
}

// ── Pagination ─────────────────────────────────────────────────────────────

function syncTabGoPage(tabName, page) {
  if (page < 1) return;
  syncTabs[tabName].page = page;
  if (syncTabs.active === tabName) loadTabData();
}

// Keep old function name for backward compat
function syncHistoryGoPage(page) {
  syncTabGoPage(syncTabs.active, page);
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
  if (status === 'running') return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>';
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
  if (trigger === 'cron_0200') return 'Cron 2:00 AM';
  if (trigger === 'manual') return 'Manual';
  return trigger || '—';
}

function formatSyncTime(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
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
