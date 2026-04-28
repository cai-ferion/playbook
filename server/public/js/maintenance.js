/* ============================================================
   maintenance.js — Pause Site / Maintenance Mode
   Uses io_notifications table to store maintenance state.
   Only OHR 740045023 can toggle and bypass maintenance.
   ============================================================ */

const ADMIN_OHR = (window.OWNER_OHR || '740045023');
const MAINTENANCE_KEY = 'site_maintenance';


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
