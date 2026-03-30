/**
 * Playbook — Notification Center
 * Database-backed in-app notification system.
 * Provides bell icon with badge, dropdown panel, and event tracking.
 */

// ===== Notification State =====

const notifState = {
  notifications: [],
  unreadCount: 0,
  isOpen: false,
  pollInterval: null,
  lastFetch: null,
  loading: false,
};

// ===== API Helpers =====

async function fetchNotifications(limit = 50) {
  const url = `${IO_API_BASE}/notifications?limit=${limit}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Failed to fetch notifications');
  return resp.json();
}

async function createNotification({ type, title, message, metadata = {} }) {
  const actor_ohr = currentUser ? currentUser.ohr_id : null;
  const actor_name = currentUser ? currentUser.full_name : null;
  const target_role = 'all';

  const payload = {
    type,
    title,
    message,
    actor_ohr,
    actor_name,
    target_role,
    metadata: JSON.stringify(metadata),
    is_read: false,
  };

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
  // Refresh notifications after creating
  await loadNotifications();
  return data;
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
  renderNotifBadge();
  renderNotifList();
}

async function clearAllNotifications() {
  // Delete all notifications except maintenance flag
  await fetch(`${IO_API_BASE}/notifications/clear-all`, {
    method: 'DELETE',
  });
  notifState.notifications = [];
  notifState.unreadCount = 0;
  renderNotifBadge();
  renderNotifList();
}

// ===== Load & Poll =====

async function loadNotifications() {
  if (notifState.loading) return;
  notifState.loading = true;
  try {
    const data = await fetchNotifications(100);
    notifState.notifications = data;
    notifState.unreadCount = data.filter(n => !n.is_read && n.type !== 'system_maintenance' && n.title !== 'MAINTENANCE_FLAG').length;
    notifState.lastFetch = new Date();
    renderNotifBadge();
    if (notifState.isOpen) renderNotifList();
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

function renderNotifBadge() {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  if (notifState.unreadCount > 0) {
    badge.textContent = notifState.unreadCount > 99 ? '99+' : notifState.unreadCount;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

function toggleNotifPanel() {
  notifState.isOpen = !notifState.isOpen;
  const panel = document.getElementById('notif-panel');
  if (!panel) return;

  if (notifState.isOpen) {
    panel.classList.add('notif-panel-open');
    renderNotifList();
    // Close panel when clicking outside
    setTimeout(() => {
      document.addEventListener('click', closeNotifOnOutsideClick);
    }, 10);
  } else {
    panel.classList.remove('notif-panel-open');
    document.removeEventListener('click', closeNotifOnOutsideClick);
  }
}

function closeNotifOnOutsideClick(e) {
  const panel = document.getElementById('notif-panel');
  const bell = document.getElementById('notif-bell');
  if (panel && bell && !panel.contains(e.target) && !bell.contains(e.target)) {
    notifState.isOpen = false;
    panel.classList.remove('notif-panel-open');
    document.removeEventListener('click', closeNotifOnOutsideClick);
  }
}

function getNotifIcon(type) {
  switch (type) {
    case 'record_save':
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>';
    case 'srt_upload':
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
    case 'billing_change':
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
    case 'system_alert':
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    case 'login':
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>';
    case 'billing_code_edit':
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    case 'coaching_issued':
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
    case 'absent_alert':
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/></svg>';
    default:
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
  }
}

function formatNotifTime(isoStr) {
  const date = new Date(isoStr);
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

function renderNotifList() {
  const list = document.getElementById('notif-list');
  if (!list) return;

  if (notifState.notifications.length === 0) {
    list.innerHTML = `
      <div class="notif-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        <p>No notifications yet</p>
      </div>
    `;
    return;
  }

  // Filter out maintenance flag notifications from display
  const displayNotifs = notifState.notifications.filter(n => n.type !== 'system_maintenance' && n.title !== 'MAINTENANCE_FLAG');

  if (displayNotifs.length === 0) {
    list.innerHTML = `
      <div class="notif-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        <p>No notifications yet</p>
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
    if (date.toDateString() === today.toDateString()) {
      groupKey = 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      groupKey = 'Yesterday';
    } else {
      groupKey = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }

    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(n);
  }

  let html = '';
  for (const [groupLabel, items] of Object.entries(groups)) {
    html += `<div class="notif-group-label">${escapeHtml(groupLabel)}</div>`;
    for (const n of items) {
      const readClass = n.is_read ? 'notif-read' : 'notif-unread';
      html += `
        <div class="notif-item ${readClass}" data-id="${n.id}" onclick="handleNotifClick(${n.id})">
          <div class="notif-icon">${getNotifIcon(n.type)}</div>
          <div class="notif-content">
            <div class="notif-title">${escapeHtml(n.title)}</div>
            <div class="notif-message">${escapeHtml(n.message)}</div>
            <div class="notif-time">${formatNotifTime(n.created_at)}</div>
          </div>
        </div>
      `;
    }
  }

  list.innerHTML = html;
}

async function handleNotifClick(id) {
  const notif = notifState.notifications.find(n => n.id === id);
  if (notif && !notif.is_read) {
    notif.is_read = true;
    notifState.unreadCount = Math.max(0, notifState.unreadCount - 1);
    renderNotifBadge();
    renderNotifList();
    await markNotificationRead(id);
  }
}

// ===== Notification Trigger Helpers =====

/**
 * Create a notification for record saves.
 * @param {number} count - Number of records saved
 * @param {string} date - Date of the records
 */
async function notifyRecordSave(count, date) {
  await createNotification({
    type: 'record_save',
    title: 'Records Saved',
    message: `${count} record(s) saved for ${date || 'selected date'}.`,
    metadata: { count, date },
  });
}

/**
 * Create a notification for SRT file upload.
 * @param {number} updated - Number of statuses updated
 * @param {number} fixed - Number of SRT IDs fixed
 * @param {number} failed - Number of failures
 */
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

/**
 * Create a notification for billing code changes.
 * @param {string} agentName - Name of the agent whose code was changed
 * @param {string} oldCode - Previous billing code
 * @param {string} newCode - New billing code
 */
async function notifyBillingCodeChange(agentName, oldCode, newCode) {
  await createNotification({
    type: 'billing_code_edit',
    title: 'Billing Code Changed',
    message: `${agentName}: ${oldCode || '(none)'} → ${newCode}.`,
    metadata: { agentName, oldCode, newCode },
  });
}

/**
 * Create a notification for billing file upload.
 * @param {number} count - Number of records updated
 */
async function notifyBillingFileUpload(count) {
  await createNotification({
    type: 'billing_change',
    title: 'Billing Codes Updated',
    message: `Billing code file applied: ${count} record(s) updated.`,
    metadata: { count },
  });
}

/**
 * Create a notification for user login.
 */
async function notifyUserLogin() {
  await createNotification({
    type: 'login',
    title: 'User Login',
    message: `${currentUser.full_name} logged in.`,
    metadata: { ohr_id: currentUser.ohr_id, role: currentUser.actual_role },
  });
}

/**
 * Create a system alert notification.
 * @param {string} title - Alert title
 * @param {string} message - Alert message
 */
async function notifySystemAlert(title, message) {
  await createNotification({
    type: 'system_alert',
    title,
    message,
    metadata: {},
  });
}

/**
 * Create a notification when a coaching log is issued.
 * @param {string} coacheeName - Name of the coachee
 * @param {string} coachingType - Type of coaching (e.g., New Session)
 * @param {string} coachingId - The coaching_id (CL-xxx)
 * @param {string} sessionGoal - The session goal/topic
 */
async function notifyCoachingIssued(coacheeName, coachingType, coachingId, sessionGoal) {
  await createNotification({
    type: 'coaching_issued',
    title: 'Coaching Log Issued',
    message: `${coachingType} issued to ${coacheeName}${sessionGoal ? ': ' + sessionGoal : ''} (${coachingId})`,
    metadata: { coacheeName, coachingType, coachingId, sessionGoal },
  });
}

/**
 * Create a targeted notification when an agent is tagged as Absent.
 * @param {string} agentName - Name of the agent tagged absent
 * @param {string} agentOhr - OHR ID of the agent (for targeting)
 * @param {string} date - The date of the absence
 */
async function notifyAbsentTag(agentName, agentOhr, date) {
  const actor_ohr = currentUser ? currentUser.ohr_id : null;
  const actor_name = currentUser ? currentUser.full_name : null;

  const payload = {
    type: 'absent_alert',
    title: 'Absence Recorded',
    message: `You have been marked as Absent on ${date || 'a recent date'}. If this is incorrect, please contact your supervisor.`,
    actor_ohr,
    actor_name,
    target_ohr: agentOhr || null,
    target_role: 'agent',
    metadata: JSON.stringify({ agentName, agentOhr, date }),
    is_read: false,
  };

  try {
    await fetch(`${IO_API_BASE}/notifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('[Notifications] Failed to create absent alert:', err);
  }
}

// ===== Initialization =====

function initNotifications() {
  loadNotifications();
  startNotifPolling(30000); // Poll every 30 seconds
}
