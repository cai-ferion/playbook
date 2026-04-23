/* ============================================================
   maintenance.js — Pause Site / Maintenance Mode
   Uses io_notifications table to store maintenance state.
   Only OHR 740045023 can toggle and bypass maintenance.
   ============================================================ */

const ADMIN_OHR = '740045023';
const MAINTENANCE_KEY = 'site_maintenance';

// ---- Role Preview System ----
// Allows admin (740045023) to preview the app as any role.
// Supported modes: null (admin), 'tl', 'qa', 'sme', 'agent'
window.PLAYBOOK_ROLE_PREVIEW = null;

const ROLE_PREVIEW_MAP = {
  tl:    { label: 'Team Lead',                  role: 'Team Lead',                badgeBg: '#fef3c7', badgeColor: '#d97706' },
  qa:    { label: 'Quality & Policy Expert',     role: 'Quality & Policy Expert',  badgeBg: '#ede9fe', badgeColor: '#7c3aed' },
  sme:   { label: 'Operational SME',             role: 'Operational SME',          badgeBg: '#e0f2fe', badgeColor: '#0284c7' },
  agent: { label: 'Agent',                       role: 'Agent',                    badgeBg: '#fce7f3', badgeColor: '#db2777' },
};

/**
 * Returns the effective role for the current user, respecting the role preview toggle.
 */
function getEffectiveRole() {
  if (!window.currentUser) return '';
  if (window.currentUser.ohr_id === ADMIN_OHR && window.PLAYBOOK_ROLE_PREVIEW) {
    const entry = ROLE_PREVIEW_MAP[window.PLAYBOOK_ROLE_PREVIEW];
    return entry ? entry.role : (window.currentUser.actual_role || '');
  }
  return window.currentUser.actual_role || '';
}

/**
 * Returns true if the current user should be treated as admin (740045023).
 * Returns false when any role preview is active.
 */
function isEffectiveAdmin() {
  if (!window.currentUser) return false;
  if (window.currentUser.ohr_id !== ADMIN_OHR) return false;
  return !window.PLAYBOOK_ROLE_PREVIEW;
}

/**
 * Toggle the role preview mode. Called from Admin Tools.
 * @param {string} mode - 'admin', 'tl', 'qa', 'sme', or 'agent'
 */
function setRolePreview(mode) {
  if (mode === 'admin' || !mode) {
    window.PLAYBOOK_ROLE_PREVIEW = null;
  } else {
    window.PLAYBOOK_ROLE_PREVIEW = mode;
  }

  // Update all toggle buttons
  const allBtns = document.querySelectorAll('.role-preview-btn');
  allBtns.forEach(btn => {
    btn.style.background = 'transparent';
    btn.style.color = 'var(--fg-muted)';
  });
  const activeBtn = document.getElementById('role-preview-' + (mode || 'admin'));
  if (activeBtn) {
    activeBtn.style.background = '#1a365d';
    activeBtn.style.color = '#fff';
  }

  // Update badge
  const badge = document.getElementById('role-preview-badge');
  if (badge) {
    const entry = ROLE_PREVIEW_MAP[mode];
    if (entry) {
      badge.textContent = entry.label;
      badge.style.background = entry.badgeBg;
      badge.style.color = entry.badgeColor;
    } else {
      badge.textContent = 'Admin';
      badge.style.background = '#f0fdf4';
      badge.style.color = '#16a34a';
    }
  }

  // Update banner
  const banner = document.getElementById('role-preview-banner');
  const bannerRole = document.getElementById('role-preview-banner-role');
  if (banner) {
    const entry = ROLE_PREVIEW_MAP[mode];
    if (entry) {
      banner.style.display = '';
      if (bannerRole) bannerRole.textContent = entry.label;
    } else {
      banner.style.display = 'none';
    }
  }

  // Persist in sessionStorage
  if (window.PLAYBOOK_ROLE_PREVIEW) {
    sessionStorage.setItem('playbook_role_preview', window.PLAYBOOK_ROLE_PREVIEW);
  } else {
    sessionStorage.removeItem('playbook_role_preview');
  }

  // Re-apply filters in currently active modules
  _rolePreviewRefreshModules();
}

function _rolePreviewRefreshModules() {
  // Refresh Compass (Coaching Profile + Disputes)
  if (typeof compassApplyNow === 'function') {
    compassApplyNow();
  } else if (typeof compassApplyFilters === 'function') {
    compassApplyFilters();
  }
  // Refresh Corrective Actions
  if (typeof caApplyFilters === 'function') {
    caApplyFilters();
  }
  // Refresh Haven (Leave Requests)
  if (typeof havenInit === 'function') {
    try { havenInit(); } catch(e) { /* ignore if haven not loaded */ }
  }
  // Refresh Anchor (Dashboard / Input Portal)
  if (typeof loadAttendanceData === 'function') {
    try { loadAttendanceData(); } catch(e) { /* ignore */ }
  }
  // Refresh view toggle visibility in Compass
  const viewToggle = document.getElementById('compass-view-toggle');
  if (viewToggle) {
    viewToggle.style.display = isEffectiveAdmin() ? 'flex' : 'none';
  }
  // Reset view mode based on preview
  if (typeof COMPASS !== 'undefined') {
    if (window.PLAYBOOK_ROLE_PREVIEW) {
      COMPASS.viewMode = 'tl'; // Non-admin roles use team-scoped view
    } else {
      COMPASS.viewMode = 'all';
    }
  }
  // Refresh sidebar nav visibility for role-gated pages
  _rolePreviewUpdateNav();
}

/**
 * Show/hide sidebar nav items based on effective role.
 * Admin sees everything; non-admin roles see restricted nav.
 */
function _rolePreviewUpdateNav() {
  if (!window.currentUser || window.currentUser.ohr_id !== ADMIN_OHR) return;
  const adminOnlyGroups = ['nav-group-horizon', 'nav-group-helm'];
  const adminOnlyItems = ['nav-admin-tools'];
  const isAdmin = isEffectiveAdmin();
  adminOnlyGroups.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = isAdmin ? '' : 'none';
  });
  adminOnlyItems.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = isAdmin ? '' : 'none';
  });
}

// ---- API helpers ----

// ---- Check / Get maintenance state ----
// Uses a dedicated row in io_notifications table with a special ohr_id marker
// This ensures all browsers see the same state (not just localStorage)
const MAINT_OHR_MARKER = 'SYSTEM_MAINTENANCE';

async function getMaintenanceState() {
  try {
    const resp = await fetch(`${IO_API_BASE}/notifications?title=MAINTENANCE_FLAG&type=system_maintenance&limit=1`);
    if (!resp.ok) {
      return localStorage.getItem('playbook_maintenance') === 'true';
    }
    const rows = await resp.json();
    if (rows.length > 0) {
      return rows[0].message === 'true';
    }
    return false;
  } catch (e) {
    return localStorage.getItem('playbook_maintenance') === 'true';
  }
}

async function setMaintenanceState(paused) {
  const val = paused ? 'true' : 'false';
  localStorage.setItem('playbook_maintenance', val);

  try {
    const resp = await fetch(`${IO_API_BASE}/notifications/maintenance`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: val })
    });
    if (!resp.ok) throw new Error('Failed to set maintenance state');
  } catch (e) {
    console.warn('Could not persist maintenance state to API, using localStorage');
  }
}

// ---- UI Updates ----
function updatePauseUI(isPaused) {
  const badge = document.getElementById('pause-status-badge');
  const btnText = document.getElementById('pause-btn-text');
  const btn = document.getElementById('pause-site-btn');

  if (!badge || !btnText || !btn) return;

  if (isPaused) {
    badge.textContent = 'PAUSED';
    badge.style.background = 'rgba(248,81,73,0.15)';
    badge.style.color = '#f85149';
    btnText.textContent = 'Resume Site';
    btn.style.background = 'rgba(63,185,80,0.15)';
    btn.style.color = '#3fb950';
    btn.style.borderColor = 'rgba(63,185,80,0.3)';
    // Change icon to play
    btn.querySelector('svg').innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
  } else {
    badge.textContent = 'LIVE';
    badge.style.background = 'rgba(63,185,80,0.15)';
    badge.style.color = '#3fb950';
    btnText.textContent = 'Pause Site';
    btn.style.background = '';
    btn.style.color = '';
    btn.style.borderColor = '';
    // Change icon to pause
    btn.querySelector('svg').innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
  }
}

// ---- Toggle ----
async function toggleSitePause() {
  const current = await getMaintenanceState();
  const action = current ? 'resume' : 'pause';
  const msg = current
    ? 'Are you sure you want to resume the site? All users will be able to access it again.'
    : 'Are you sure you want to pause the site? All users except you will see a maintenance screen and cannot access any features.';

  if (!confirm(msg)) return;

  await setMaintenanceState(!current);
  updatePauseUI(!current);

  // If we just paused, no overlay for admin
  // If we just resumed, hide overlay (shouldn't be showing for admin anyway)
  const overlay = document.getElementById('maintenance-overlay');
  if (overlay) overlay.style.display = 'none';

  showToast(current ? 'Site resumed — all users can now access Playbook.' : 'Site paused — maintenance screen is now active for all users.', current ? 'success' : 'warning');
}

// ---- Enforce maintenance on page load (after login) ----
async function enforceMaintenanceMode() {
  const isPaused = await getMaintenanceState();

  // Update admin UI if on admin page
  updatePauseUI(isPaused);

  if (!isPaused) return;

  // If current user is NOT admin, show overlay
  if (!currentUser || currentUser.ohr_id !== ADMIN_OHR) {
    const overlay = document.getElementById('maintenance-overlay');
    if (overlay) {
      overlay.style.display = 'block';
      // Disable scrolling
      document.body.style.overflow = 'hidden';
    }
  }
}

// ---- Poll for maintenance state changes (every 30s for non-admin users) ----
let maintenancePollInterval = null;

function startMaintenancePoll() {
  if (maintenancePollInterval) clearInterval(maintenancePollInterval);
  maintenancePollInterval = setInterval(async () => {
    const isPaused = await getMaintenanceState();
    const overlay = document.getElementById('maintenance-overlay');

    if (isPaused && currentUser && currentUser.ohr_id !== ADMIN_OHR) {
      if (overlay) {
        overlay.style.display = 'block';
        document.body.style.overflow = 'hidden';
      }
    } else if (!isPaused && overlay) {
      overlay.style.display = 'none';
      document.body.style.overflow = '';
    }

    // Update admin UI
    updatePauseUI(isPaused);
  }, 30000);
}
