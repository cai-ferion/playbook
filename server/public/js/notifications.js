/**
 * Playbook — Notification Center
 * Database-backed in-app notification system.
 * Sidebar toggle panel: brief alert overview + card detail on click.
 */

// ===== Notification State =====
const notifState = {
  notifications: [],
  unreadCount: 0,
  pollInterval: null,
  lastFetch: null,
  loading: false,
};

// ===== Sidebar Mode Toggle =====
let _sidebarMode = 'notifications'; // 'nav' | 'notifications'

function setSidebarMode(mode) {
  _sidebarMode = mode;
  const navEl = document.querySelector('.sidebar-nav');
  const notifPanelEl = document.getElementById('sidebar-notif-panel');
  const toggleNav = document.getElementById('sidebar-toggle-nav');
  const toggleNotif = document.getElementById('sidebar-toggle-notif');
  if (mode === 'notifications') {
    if (navEl) navEl.style.display = 'none';
    if (notifPanelEl) notifPanelEl.style.display = 'flex';
    if (toggleNav) toggleNav.classList.remove('active');
    if (toggleNotif) toggleNotif.classList.add('active');
    renderSidebarNotifList();
  } else {
    if (navEl) navEl.style.display = '';
    if (notifPanelEl) notifPanelEl.style.display = 'none';
    if (toggleNav) toggleNav.classList.add('active');
    if (toggleNotif) toggleNotif.classList.remove('active');
  }
}

// ===== API Helpers =====

async function fetchNotifications(limit = 100) {
  const params = new URLSearchParams({ limit: String(limit) });
  const url = `${IO_API_BASE}/notifications?${params}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Failed to fetch notifications');
  return resp.json();
}

async function createNotification({ type, title, message, target_ohr, target_role, metadata = {} }) {
  const actor_ohr = typeof currentUser !== 'undefined' && currentUser ? currentUser.ohr_id : null;
  const actor_name = typeof currentUser !== 'undefined' && currentUser ? currentUser.full_name : null;
  const payload = {
    type,
    title,
    message,
    actor_ohr,
    actor_name,
    target_ohr: target_ohr || null,
    target_role: target_role || 'all',
    metadata: JSON.stringify(metadata),
    is_read: false,
    created_at: new Date().toISOString(),
  };
  try {
    const resp = await fetch(`${IO_API_BASE}/notifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      console.error('[Notifications] Failed to create notification:', await resp.text());
      return null;
    }
    const data = await resp.json();
    await loadNotifications();
    return data;
  } catch (err) {
    console.error('[Notifications] Create error:', err);
    return null;
  }
}

async function markNotificationRead(id) {
  await fetch(`${IO_API_BASE}/notifications/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_read: true }),
  });
}

async function markAllNotificationsRead() {
  await fetch(`${IO_API_BASE}/notifications/mark-all-read`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
  });
  notifState.notifications.forEach(n => n.is_read = true);
  notifState.unreadCount = 0;
  renderSidebarNotifBadge();
  renderSidebarNotifList();
}

async function clearAllNotifications() {
  await fetch(`${IO_API_BASE}/notifications/clear-all`, {
    method: 'DELETE',
  });
  notifState.notifications = [];
  notifState.unreadCount = 0;
  renderSidebarNotifBadge();
  renderSidebarNotifList();
}

// ===== Load & Poll =====

async function loadNotifications() {
  if (notifState.loading) return;
  notifState.loading = true;
  try {
    const data = await fetchNotifications(100);
    const userOhr = typeof currentUser !== 'undefined' && currentUser ? currentUser.ohr_id : null;

    notifState.notifications = data.filter(n => {
      if (n.type === 'system_maintenance' || n.title === 'MAINTENANCE_FLAG') return false;
      if (n.target_ohr && n.target_ohr !== userOhr && userOhr !== '740045023') return false;
      return true;
    });

    notifState.unreadCount = notifState.notifications.filter(n => !n.is_read).length;
    notifState.lastFetch = new Date();
    renderSidebarNotifBadge();
    if (_sidebarMode === 'notifications') renderSidebarNotifList();
  } catch (err) {
    console.error('[Notifications] Load error:', err);
  } finally {
    notifState.loading = false;
  }
}

function startNotifPolling(intervalMs = 30000) {
  if (notifState.pollInterval) clearInterval(notifState.pollInterval);
  notifState.pollInterval = setInterval(loadNotifications, intervalMs);
}

function stopNotifPolling() {
  if (notifState.pollInterval) {
    clearInterval(notifState.pollInterval);
    notifState.pollInterval = null;
  }
}

// ===== Rendering =====

function renderSidebarNotifBadge() {
  const badge = document.getElementById('sidebar-notif-badge');
  if (!badge) return;
  if (notifState.unreadCount > 0) {
    badge.textContent = notifState.unreadCount > 99 ? '99+' : notifState.unreadCount;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

function getNotifIcon(type) {
  const icons = {
    record_save: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
    billing_change: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    billing_code_edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    upl_notice: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    late_notice: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    task_assigned: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>',
    backdate_request: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01"/></svg>',
    coaching_issued: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
    system_alert: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    daily_summary: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    login: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>',
    srt_upload: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
    absent_alert: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/></svg>',
  };
  return icons[type] || '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
}

function getNotifColor(type) {
  const colors = {
    record_save: '#22c55e', billing_change: '#f59e0b', billing_code_edit: '#f59e0b',
    upl_notice: '#ef4444', late_notice: '#d97706', task_assigned: '#8b5cf6',
    backdate_request: '#0ea5e9', coaching_issued: '#f97316', system_alert: '#ef4444',
    daily_summary: '#06b6d4', login: '#8b5cf6', srt_upload: '#3b82f6', absent_alert: '#ef4444',
  };
  return colors[type] || '#9ca3af';
}

function formatNotifTime(ts) {
  if (!ts) return '';
  const date = new Date(typeof ts === 'number' ? ts : ts);
  if (isNaN(date.getTime()) || date.getFullYear() < 2000) return '';
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatNotifFullTime(ts) {
  if (!ts) return 'N/A';
  const date = new Date(typeof ts === 'number' ? ts : ts);
  if (isNaN(date.getTime()) || date.getFullYear() < 2000) return 'N/A';
  return date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  });
}

/** Brief one-line summary for the alert bar */
function getNotifBrief(n) {
  switch (n.type) {
    case 'record_save': {
      const meta = tryParseMeta(n.metadata);
      const count = meta.count || '';
      const date = meta.date || '';
      return `${count} record${count !== 1 ? 's' : ''} saved${date ? ' · ' + date : ''}`;
    }
    case 'billing_code_edit': {
      const meta = tryParseMeta(n.metadata);
      return `${meta.agentName || 'Agent'}: ${meta.oldCode || '—'} → ${meta.newCode || '—'}`;
    }
    case 'backdate_request': {
      const meta = tryParseMeta(n.metadata);
      return `${meta.agentName || 'Agent'} · ${meta.requestDate || ''}`;
    }
    case 'task_assigned': {
      return n.message ? n.message.substring(0, 60) : 'New task assigned';
    }
    case 'upl_notice':
    case 'late_notice': {
      return n.message ? n.message.substring(0, 60) : n.title;
    }
    default:
      return n.message ? n.message.substring(0, 60) : '';
  }
}

function tryParseMeta(metadata) {
  if (!metadata) return {};
  if (typeof metadata === 'object') return metadata;
  try { return JSON.parse(metadata); } catch { return {}; }
}

function renderSidebarNotifList() {
  const list = document.getElementById('sidebar-notif-list');
  if (!list) return;

  const displayNotifs = notifState.notifications;

  if (displayNotifs.length === 0) {
    list.innerHTML = `
      <div class="notif-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--fg-subtle)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        <p>No alerts</p>
      </div>
    `;
    return;
  }

  // Group by date
  const groups = {};
  for (const n of displayNotifs) {
    const date = new Date(n.created_at);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let groupKey;
    if (isNaN(date.getTime()) || date.getFullYear() < 2000) {
      groupKey = 'Older';
    } else if (date.toDateString() === today.toDateString()) {
      groupKey = 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      groupKey = 'Yesterday';
    } else {
      groupKey = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(n);
  }

  let html = '';
  for (const [groupLabel, items] of Object.entries(groups)) {
    html += `<div class="notif-group-label">${escapeHtml(groupLabel)}</div>`;
    for (const n of items) {
      const readClass = n.is_read ? 'notif-read' : 'notif-unread';
      const accentColor = getNotifColor(n.type);
      const brief = getNotifBrief(n);
      const timeStr = formatNotifTime(n.created_at);
      html += `
        <div class="notif-item ${readClass}" data-id="${n.id}" onclick="handleNotifClick(${n.id})" style="border-left-color:${n.is_read ? 'transparent' : accentColor}">
          <div class="notif-icon" style="background:${accentColor}15">${getNotifIcon(n.type)}</div>
          <div class="notif-content">
            <div class="notif-row">
              <span class="notif-title">${escapeHtml(n.title)}</span>
              <span class="notif-time">${timeStr}</span>
            </div>
            <div class="notif-brief">${escapeHtml(brief)}</div>
          </div>
        </div>
      `;
    }
  }

  list.innerHTML = html;
}

// ===== Card Detail View =====

async function handleNotifClick(id) {
  const notif = notifState.notifications.find(n => n.id === id);
  if (!notif) return;

  // Mark as read
  if (!notif.is_read) {
    notif.is_read = true;
    notifState.unreadCount = Math.max(0, notifState.unreadCount - 1);
    renderSidebarNotifBadge();
    renderSidebarNotifList();
    await markNotificationRead(id);
  }

  // Show detail card overlay
  showNotifDetailCard(notif);
}

function showNotifDetailCard(n) {
  // Remove existing overlay
  const existing = document.getElementById('notif-detail-overlay');
  if (existing) existing.remove();

  const meta = tryParseMeta(n.metadata);
  const accentColor = getNotifColor(n.type);
  const fullTime = formatNotifFullTime(n.created_at);

  // Build detail rows based on type
  let detailRows = '';

  if (n.actor_name) {
    detailRows += `<div class="notif-detail-row"><span class="notif-detail-label">By</span><span class="notif-detail-value">${escapeHtml(n.actor_name)}</span></div>`;
  }

  detailRows += `<div class="notif-detail-row"><span class="notif-detail-label">Time</span><span class="notif-detail-value">${escapeHtml(fullTime)}</span></div>`;

  // Type-specific details
  switch (n.type) {
    case 'record_save':
      if (meta.count) detailRows += `<div class="notif-detail-row"><span class="notif-detail-label">Records</span><span class="notif-detail-value">${meta.count} saved</span></div>`;
      if (meta.date) detailRows += `<div class="notif-detail-row"><span class="notif-detail-label">Date</span><span class="notif-detail-value">${escapeHtml(meta.date)}</span></div>`;
      break;
    case 'billing_code_edit':
      if (meta.agentName) detailRows += `<div class="notif-detail-row"><span class="notif-detail-label">Agent</span><span class="notif-detail-value">${escapeHtml(meta.agentName)}</span></div>`;
      if (meta.oldCode || meta.newCode) detailRows += `<div class="notif-detail-row"><span class="notif-detail-label">Change</span><span class="notif-detail-value">${escapeHtml(meta.oldCode || '—')} → ${escapeHtml(meta.newCode || '—')}</span></div>`;
      if (meta.count) detailRows += `<div class="notif-detail-row"><span class="notif-detail-label">Records</span><span class="notif-detail-value">${meta.count} affected</span></div>`;
      break;
    case 'backdate_request':
      if (meta.agentName) detailRows += `<div class="notif-detail-row"><span class="notif-detail-label">Agent</span><span class="notif-detail-value">${escapeHtml(meta.agentName)}</span></div>`;
      if (meta.requestDate) detailRows += `<div class="notif-detail-row"><span class="notif-detail-label">Date</span><span class="notif-detail-value">${escapeHtml(meta.requestDate)}</span></div>`;
      if (meta.newTag) detailRows += `<div class="notif-detail-row"><span class="notif-detail-label">New Tag</span><span class="notif-detail-value">${escapeHtml(meta.newTag)}</span></div>`;
      if (meta.reason) detailRows += `<div class="notif-detail-row"><span class="notif-detail-label">Reason</span><span class="notif-detail-value">${escapeHtml(meta.reason)}</span></div>`;
      break;
    case 'task_assigned':
      if (meta.taskId) detailRows += `<div class="notif-detail-row"><span class="notif-detail-label">Task ID</span><span class="notif-detail-value">${escapeHtml(meta.taskId)}</span></div>`;
      if (meta.taskTitle) detailRows += `<div class="notif-detail-row"><span class="notif-detail-label">Task</span><span class="notif-detail-value">${escapeHtml(meta.taskTitle)}</span></div>`;
      break;
    case 'upl_notice':
    case 'late_notice':
      if (meta.date) detailRows += `<div class="notif-detail-row"><span class="notif-detail-label">Date</span><span class="notif-detail-value">${escapeHtml(meta.date)}</span></div>`;
      if (meta.agentName) detailRows += `<div class="notif-detail-row"><span class="notif-detail-label">Agent</span><span class="notif-detail-value">${escapeHtml(meta.agentName)}</span></div>`;
      break;
    default:
      if (n.message) detailRows += `<div class="notif-detail-row"><span class="notif-detail-label">Details</span><span class="notif-detail-value">${escapeHtml(n.message)}</span></div>`;
  }

  const overlay = document.createElement('div');
  overlay.id = 'notif-detail-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;z-index:10000;';
  overlay.innerHTML = `
    <div class="notif-detail-card" style="--accent:${accentColor}">
      <div class="notif-detail-header">
        <div class="notif-detail-icon" style="background:${accentColor}15">${getNotifIcon(n.type)}</div>
        <div class="notif-detail-title">${escapeHtml(n.title)}</div>
        <button class="notif-detail-close" onclick="document.getElementById('notif-detail-overlay').remove()">&times;</button>
      </div>
      <div class="notif-detail-body">
        ${detailRows}
      </div>
    </div>
  `;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

// ===== Notification Trigger Helpers =====

async function notifyRecordSave(count, date) {
  await createNotification({
    type: 'record_save',
    title: 'Attendance Saved',
    message: `${count} record(s) saved for ${date || 'selected date'}.`,
    metadata: { count, date },
  });
}

async function notifySrtUpload(updated, fixed, failed) {
  const parts = [];
  if (fixed > 0) parts.push(`${fixed} SRT ID(s) fixed`);
  if (updated > 0) parts.push(`${updated} status(es) updated`);
  if (failed > 0) parts.push(`${failed} failed`);
  await createNotification({
    type: 'srt_upload',
    title: 'SRT File Processed',
    message: parts.join(', ') + '.',
    metadata: { updated, fixed, failed },
  });
}

async function notifyBillingCodeChange(agentName, oldCode, newCode, count) {
  await createNotification({
    type: 'billing_code_edit',
    title: 'Billing Code Changed',
    message: `${agentName}: ${oldCode || '—'} → ${newCode}`,
    metadata: { agentName, oldCode, newCode, count: count || 1 },
  });
}

async function notifyBillingFileUpload(count) {
  await createNotification({
    type: 'billing_change',
    title: 'Billing Codes Updated',
    message: `Billing code file applied: ${count} record(s) updated.`,
    metadata: { count },
  });
}

async function notifyBackdateRequest(agentName, requestDate, newTag, reason) {
  // Get the supervisor OHR for the agent
  let supervisorOhr = null;
  try {
    const empResp = await fetch(`${IO_API_BASE}/employees`);
    if (empResp.ok) {
      const emps = await empResp.json();
      const agent = emps.find(e => e.full_name === agentName);
      if (agent && agent.supervisor_ohr) supervisorOhr = agent.supervisor_ohr;
    }
  } catch (e) { /* ignore */ }

  await createNotification({
    type: 'backdate_request',
    title: 'Backdate Tag Change',
    message: `${agentName} · ${requestDate} · ${newTag}`,
    target_ohr: supervisorOhr,
    metadata: { agentName, requestDate, newTag, reason },
  });
}

async function notifyUserLogin() {
  await createNotification({
    type: 'login',
    title: 'User Login',
    message: `${currentUser.full_name} logged in.`,
    metadata: { ohr_id: currentUser.ohr_id, role: currentUser.actual_role },
  });
}

async function notifySystemAlert(title, message) {
  await createNotification({
    type: 'system_alert',
    title,
    message,
    metadata: {},
  });
}

async function notifyCoachingIssued(coacheeName, coachingType, coachingId, sessionGoal) {
  await createNotification({
    type: 'coaching_issued',
    title: 'Coaching Log Issued',
    message: `${coachingType} to ${coacheeName}${sessionGoal ? ': ' + sessionGoal : ''} (${coachingId})`,
    metadata: { coacheeName, coachingType, coachingId, sessionGoal },
  });
}

async function notifyAbsentTag(agentName, agentOhr, date) {
  await createNotification({
    type: 'absent_alert',
    title: 'Absence Recorded',
    message: `Marked absent on ${date || 'a recent date'}.`,
    target_ohr: agentOhr || null,
    target_role: 'agent',
    metadata: { agentName, agentOhr, date },
  });
}

async function notifyTaskAssigned(taskId, taskTitle, assignees) {
  // Create notification for each assignee
  const assigneeNames = assignees.map(a => a.name || a.full_name || 'Unknown');
  for (const assignee of assignees) {
    await createNotification({
      type: 'task_assigned',
      title: 'Task Assigned',
      message: `"${taskTitle}" assigned to you`,
      target_ohr: assignee.ohr_id || null,
      metadata: { taskId, taskTitle, assigneeNames },
    });
  }
}

// ===== Initialization =====

function initNotifications() {
  loadNotifications();
  startNotifPolling(30000);
  // Default sidebar to Alerts (notifications) tab on login
  setSidebarMode('notifications');
}
