/**
 * Playbook — Application Logic
 * Handles UI rendering, view switching, multi-select filters, tabular input,
 * shift breakdown, FLM supervisor table, shrink details expand, and alerts.
 * Optimized loading: default date first, then on-demand with progress bar.
 */

// ===== Multi-Select Component =====

class MultiSelect {
  constructor(wrapperId, allLabel, onChange, opts = {}) {
    this.wrapper = document.getElementById(wrapperId);
    this.allLabel = allLabel;
    this.onChange = onChange;
    this.options = [];
    this.selected = [];
    this.isOpen = false;
    this.id = wrapperId;
    this.noneMode = false;
    this.searchable = opts.searchable || false;
    this.searchTerm = '';
    if (this.wrapper) this.render();
  }

  setOptions(opts) {
    this.options = opts;
    this.selected = [];
    this.noneMode = false;
    if (this.wrapper) this.renderTrigger();
  }

  render() {
    this.wrapper.innerHTML = '';
    this.trigger = document.createElement('div');
    this.trigger.className = 'multi-select-trigger';
    this.trigger.onclick = (e) => { e.stopPropagation(); this.toggle(); };
    this.wrapper.appendChild(this.trigger);

    this.dropdown = document.createElement('div');
    this.dropdown.className = 'multi-select-dropdown';
    this.dropdown.onclick = (e) => e.stopPropagation();
    this.wrapper.appendChild(this.dropdown);

    this.renderTrigger();
  }

  renderTrigger() {
    const label = (this.selected.length === 0 && this.noneMode) ? 'None selected' :
      this.selected.length === 0 ? this.allLabel :
      this.selected.length === 1 ? this.selected[0] :
      `${this.selected.length} selected`;
    this.trigger.innerHTML = `<span>${escapeHtml(label)}</span><span class="arrow">&#9662;</span>`;
    if (this.isOpen) this.trigger.classList.add('active');
    else this.trigger.classList.remove('active');
  }

  renderDropdown() {
    let html = '';

    if (this.searchable) {
      html += `<div class="ms-search-wrap">
        <input type="text" class="ms-search-input" placeholder="Search..." value="${escapeAttr(this.searchTerm)}">
      </div>`;
    }

    const allChecked = this.selected.length === 0 && !this.noneMode;
    html += `<label class="multi-select-option select-all">
      <input type="checkbox" ${allChecked ? 'checked' : ''} data-value="__ALL__">
      <span>${this.allLabel}</span>
    </label>`;

    const term = this.searchTerm.toLowerCase();
    for (const opt of this.options) {
      if (term && !opt.toLowerCase().includes(term)) continue;
      const checked = (this.selected.length === 0 && !this.noneMode) || this.selected.includes(opt);
      html += `<label class="multi-select-option">
        <input type="checkbox" ${checked ? 'checked' : ''} data-value="${escapeAttr(opt)}">
        <span>${escapeHtml(opt)}</span>
      </label>`;
    }

    this.dropdown.innerHTML = html;
    this.dropdown.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.onchange = () => this.handleCheck(cb);
    });

    if (this.searchable) {
      const searchInput = this.dropdown.querySelector('.ms-search-input');
      if (searchInput) {
        searchInput.oninput = (e) => {
          this.searchTerm = e.target.value;
          this.renderDropdown();
          // Re-focus and restore cursor position
          const newInput = this.dropdown.querySelector('.ms-search-input');
          if (newInput) { newInput.focus(); newInput.selectionStart = newInput.selectionEnd = newInput.value.length; }
        };
        searchInput.onclick = (e) => e.stopPropagation();
      }
    }
  }

  handleCheck(cb) {
    const val = cb.dataset.value;
    if (val === '__ALL__') {
      if (cb.checked) {
        // Re-check All: select all (empty = all selected)
        this.selected = [];
        this.noneMode = false;
      } else {
        // Untick All: deselect everything so user can pick individually
        this.selected = [];
        this.noneMode = true;
      }
    } else {
      if (this.noneMode) {
        // In none-mode, user is building selection from scratch
        if (cb.checked) {
          this.selected.push(val);
        } else {
          this.selected = this.selected.filter(s => s !== val);
        }
        // If all options are selected, switch back to All mode
        if (this.selected.length === this.options.length) {
          this.selected = [];
          this.noneMode = false;
        }
      } else if (this.selected.length === 0 && !this.noneMode) {
        // All is selected, user unchecks one item
        this.selected = this.options.filter(o => o !== val);
      } else {
        if (cb.checked) {
          if (!this.selected.includes(val)) this.selected.push(val);
          if (this.selected.length === this.options.length) {
            this.selected = [];
            this.noneMode = false;
          }
        } else {
          this.selected = this.selected.filter(s => s !== val);
          if (this.selected.length === 0) {
            this.noneMode = true;
          }
        }
      }
    }
    this.renderTrigger();
    this.renderDropdown();
    this.onChange();
  }

  toggle() {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.searchTerm = '';
      this.renderDropdown();
      this.dropdown.classList.add('open');
      this.trigger.classList.add('active');
      if (this.searchable) {
        setTimeout(() => { const si = this.dropdown.querySelector('.ms-search-input'); if (si) si.focus(); }, 50);
      }
    } else {
      this.dropdown.classList.remove('open');
      this.trigger.classList.remove('active');
    }
  }

  close() {
    this.isOpen = false;
    this.dropdown.classList.remove('open');
    this.trigger.classList.remove('active');
  }

  reset() {
    this.selected = [];
    this.noneMode = false;
    this.searchTerm = '';
    if (this.wrapper) {
      this.renderTrigger();
      if (this.isOpen) this.renderDropdown();
    }
  }

  getSelected() {
    return this.selected;
  }
}

// Close all multi-selects on outside click
document.addEventListener('click', () => {
  if (appState.multiSelects) Object.values(appState.multiSelects).forEach(ms => ms.close());
  if (appState.dashMultiSelects) Object.values(appState.dashMultiSelects).forEach(ms => ms.close());
});

// ===== Authentication =====

let currentUser = null;

function showAuthForm(type) {
  document.getElementById('auth-buttons').style.display = 'none';
  document.getElementById('auth-form-signup').style.display = type === 'signup' ? 'block' : 'none';
  document.getElementById('auth-form-login').style.display = type === 'login' ? 'block' : 'none';
  document.getElementById('signup-error').textContent = '';
  document.getElementById('login-error').textContent = '';
  document.getElementById('signup-ohr').value = '';
  document.getElementById('signup-password').value = '';
  document.getElementById('login-ohr').value = '';
  document.getElementById('login-password').value = '';
}

function showAuthButtons() {
  document.getElementById('auth-buttons').style.display = 'flex';
  document.getElementById('auth-form-signup').style.display = 'none';
  document.getElementById('auth-form-login').style.display = 'none';
}

function unmaskPassword(inputId) {
  document.getElementById(inputId).type = 'text';
}

function maskPassword(inputId) {
  document.getElementById(inputId).type = 'password';
}

function validatePassword(pw) {
  return {
    length: pw.length >= 8,
    capital: /[A-Z]/.test(pw),
    alphanum: /[a-zA-Z]/.test(pw) && /[0-9]/.test(pw),
    special: !/[^a-zA-Z0-9!@#$%]/.test(pw),
  };
}

function updatePasswordRules(pw) {
  const rules = validatePassword(pw);
  const setClass = (id, pass) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = pass ? 'rule-pass' : (pw.length > 0 ? 'rule-fail' : '');
  };
  setClass('rule-length', rules.length);
  setClass('rule-capital', rules.capital);
  setClass('rule-alphanum', rules.alphanum);
  setClass('rule-special', rules.special);
  return rules.length && rules.capital && rules.alphanum && rules.special;
}

async function handleSignUp() {
  const ohr = document.getElementById('signup-ohr').value.trim();
  const pw = document.getElementById('signup-password').value;
  const errorEl = document.getElementById('signup-error');
  errorEl.textContent = '';
  errorEl.style.color = '';

  if (!ohr) { errorEl.textContent = 'Please enter your OHR ID.'; return; }
  if (!updatePasswordRules(pw)) { errorEl.textContent = 'Password does not meet all requirements.'; return; }

  try {
    const empResp = await fetch(
      `${IO_API_BASE}/employees?ohr_id=${ohr}&limit=1`
    );
    const empData = await empResp.json();

    if (!Array.isArray(empData) || empData.length === 0) {
      errorEl.textContent = 'OHR ID not found. Please check your ID.';
      return;
    }

    const emp = empData[0];
    if (emp.employement_status !== 'Active') {
      errorEl.textContent = 'Access denied. Only active employees can create an account.';
      return;
    }

    if (emp.password) {
      errorEl.textContent = 'OHR already has an account.';
      return;
    }

    const updateResp = await fetch(
      `${IO_API_BASE}/employees/${ohr}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw })
      }
    );

    if (updateResp.ok) {
      errorEl.style.color = 'var(--success)';
      errorEl.textContent = 'Account created! You can now login.';
      setTimeout(() => {
        errorEl.style.color = '';
        showAuthForm('login');
        document.getElementById('login-ohr').value = ohr;
      }, 1500);
    } else {
      errorEl.textContent = 'Failed to create account. Please try again.';
    }
  } catch (err) {
    errorEl.textContent = 'Network error. Please try again.';
  }
}

// Track failed login attempts per OHR
const failedAttempts = {};

async function handleLogin() {
  const ohr = document.getElementById('login-ohr').value.trim();
  const pw = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = '';

  if (!ohr) { errorEl.textContent = 'Please enter your OHR ID.'; return; }
  if (!pw) { errorEl.textContent = 'Please enter your password.'; return; }

  // Check if locally locked out (3 failed attempts)
  if (failedAttempts[ohr] >= 3) {
    errorEl.innerHTML = 'Your account has been locked due to multiple failed login attempts.<br>Please contact <strong>Arvin Bantasan</strong> for assistance.';
    return;
  }

  try {
    const empResp = await fetch(
      `${IO_API_BASE}/employees?ohr_id=${ohr}&limit=1`
    );
    const empData = await empResp.json();

    if (!Array.isArray(empData) || empData.length === 0) {
      errorEl.textContent = 'OHR ID not found.';
      return;
    }

    const emp = empData[0];

    // Check if account is locked in database
    if (emp.is_locked === true || emp.is_locked === 'true') {
      errorEl.innerHTML = 'Your account has been locked.<br>Please contact <strong>Arvin Bantasan</strong> for assistance.';
      return;
    }

    if (!emp.password) {
      errorEl.textContent = 'No account found. Please sign up first.';
      return;
    }

    if (emp.password !== pw) {
      // Increment failed attempts
      failedAttempts[ohr] = (failedAttempts[ohr] || 0) + 1;
      const remaining = 3 - failedAttempts[ohr];

      if (failedAttempts[ohr] >= 3) {
        // Lock the account in the database
        try {
          await fetch(
            `${IO_API_BASE}/employees/${ohr}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ is_locked: true })
            }
          );
        } catch (e) { /* non-critical */ }
        errorEl.innerHTML = 'Your account has been locked due to multiple failed login attempts.<br>Please contact <strong>Arvin Bantasan</strong> for assistance.';
      } else {
        errorEl.textContent = `Incorrect password. ${remaining} attempt(s) remaining.`;
      }
      return;
    }

    // Successful login — reset failed attempts
    delete failedAttempts[ohr];

    if (emp.employement_status !== 'Active') {
      errorEl.textContent = 'Access denied. Only active employees can access the platform.';
      return;
    }

    currentUser = {
      ohr_id: emp.ohr_id,
      full_name: emp.full_name,
      actual_role: emp.actual_role,
      employement_status: emp.employement_status,
      planning_group: emp.planning_group || '',
      complete_planning_group: emp.complete_planning_group || '',
      actualPlanningGroup: emp.planning_group || '',
      supervisor_name: emp.supervisor_name || ''
    };

    sessionStorage.setItem('playbook_user', JSON.stringify(currentUser));

    document.getElementById('auth-page').style.display = 'none';
    document.getElementById('app-container').style.display = 'flex';

    const ADMIN_OHR = '740045023';

    // Show Admin Tools nav only for admin OHR
    const adminNav = document.getElementById('nav-admin');
    if (adminNav) adminNav.style.display = (currentUser.ohr_id === ADMIN_OHR) ? '' : 'none';

    // Show Sync History nav only for admin OHR
    const syncHistoryNav = document.getElementById('nav-sync-history');
    if (syncHistoryNav) syncHistoryNav.style.display = (currentUser.ohr_id === ADMIN_OHR) ? '' : 'none';

    // Hide entire Anchor group from Agents
    const anchorGroupEl = document.getElementById('nav-group-anchor');
    if (anchorGroupEl) {
      if (currentUser.actual_role === 'Agent' && currentUser.ohr_id !== ADMIN_OHR) {
        anchorGroupEl.style.display = 'none';
      } else {
        anchorGroupEl.style.display = '';
      }
    }

    // Show Risk Intelligence nav for all non-Agents
    const alertsNav = document.getElementById('nav-alerts');
    if (alertsNav) alertsNav.style.display = (currentUser.actual_role !== 'Agent') || currentUser.ohr_id === ADMIN_OHR ? '' : 'none';

    // Show Billing Compliance nav for all non-Agents
    const billingNav = document.getElementById('nav-billing');
    if (billingNav) billingNav.style.display = (currentUser.actual_role !== 'Agent') || currentUser.ohr_id === ADMIN_OHR ? '' : 'none';

    // Compass — visible to all roles except Agents (role-based coaching visibility)
    const compassNav = document.getElementById('nav-group-compass');
    if (compassNav) {
      const isAgentNonAdmin = currentUser.actual_role === 'Agent' && currentUser.ohr_id !== ADMIN_OHR;
      compassNav.style.display = isAgentNonAdmin ? 'none' : '';
    }

    // Sandbox, Haven, Horizon — visible ONLY to admin OHR (under development)
    ['nav-group-sandbox', 'nav-group-haven', 'nav-group-horizon'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = (currentUser.ohr_id === ADMIN_OHR) ? '' : 'none';
    });

    // Helm — visible to all (agents see Task Board only)
    const helmNav = document.getElementById('nav-group-helm');
    if (helmNav) helmNav.style.display = '';

    // Helm Analytics — admin only
    const helmAnalyticsNav = document.getElementById('nav-helm-analytics');
    if (helmAnalyticsNav) helmAnalyticsNav.style.display = (currentUser.ohr_id === ADMIN_OHR) ? '' : 'none';

    // Regimen (Roster) — admin only
    const regimenNav = document.getElementById('nav-regimen');
    if (regimenNav) regimenNav.style.display = (currentUser.ohr_id === ADMIN_OHR) ? '' : 'none';

    // Dashboard — hidden from Agents
    const dashboardNav = document.getElementById('nav-dashboard');
    if (dashboardNav) dashboardNav.style.display = (currentUser.actual_role === 'Agent' && currentUser.ohr_id !== ADMIN_OHR) ? 'none' : '';

    initMultiSelects();
    initDashboardMultiSelects();
    await loadDataOptimized();
    startRefreshTimer();
    // Auto-expand Anchor and Helm nav groups
    const anchorGroup = document.getElementById('nav-group-anchor');
    if (anchorGroup) anchorGroup.classList.add('expanded');
    const helmGroup = document.getElementById('nav-group-helm');
    if (helmGroup) helmGroup.classList.add('expanded');
    // Default sidebar to Alerts (notifications) for all users
    if (typeof setSidebarMode === 'function') setSidebarMode('notifications');
    if (typeof initNotifications === 'function') initNotifications();
    // Route to Helm Task Board for Agents, Risk Intelligence for others
    if (currentUser.actual_role === 'Agent' && currentUser.ohr_id !== ADMIN_OHR) {
      switchView('helm-board');
    } else {
      switchView('alerts');
    }
  } catch (err) {
    errorEl.textContent = 'Network error. Please try again.';
  }
}

function showForgotPassword() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
  const box = document.createElement('div');
  box.style.cssText = 'background:var(--container);border:1px solid var(--border);border-radius:12px;padding:32px;max-width:400px;text-align:center;color:var(--text);box-shadow:0 8px 32px rgba(0,0,0,0.15);';
  box.innerHTML = `
    <h3 style="margin:0 0 12px;font-size:18px;color:var(--text);">Forgot Password</h3>
    <p style="margin:0 0 20px;color:var(--text-secondary);line-height:1.5;">Please contact <strong>Arvin Bantasan</strong> for password management.</p>
    <button onclick="this.closest('div').parentElement.remove()" style="background:var(--accent);color:#fff;border:none;padding:10px 24px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">OK</button>
  `;
  overlay.appendChild(box);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function handleLogout() {
  currentUser = null;
  sessionStorage.removeItem('playbook_user');
  appState.records = [];
  appState.originalRecords = [];
  appState.loadedRanges = [];
  if (typeof billingDropdownInitialized !== 'undefined') billingDropdownInitialized = false;
  document.getElementById('app-container').style.display = 'none';
  document.getElementById('auth-page').style.display = 'flex';
  showAuthButtons();
}

// ===== Progress Bar =====

function showProgressBar(message) {
  let container = document.getElementById('progress-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'progress-container';
    container.className = 'progress-container';
    document.body.appendChild(container);
  }
  container.innerHTML = `
    <div class="sprite-mascot mascot-loader" role="img" aria-label="Loading..."></div>
    <div class="progress-message">${escapeHtml(message || 'Loading data...')}</div>
    <div class="progress-bar-track">
      <div class="progress-bar-fill" id="progress-bar-fill" style="width:0%"></div>
    </div>
    <div class="progress-text" id="progress-text">0%</div>
  `;
  container.style.display = 'flex';
}

function updateProgressBar(loaded, total, message) {
  const fill = document.getElementById('progress-bar-fill');
  const text = document.getElementById('progress-text');
  const msgEl = document.querySelector('.progress-message');
  if (!fill || !text) return;

  const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
  fill.style.width = pct + '%';
  text.textContent = pct + '%';
  if (message && msgEl) msgEl.textContent = message;
}

function hideProgressBar() {
  const container = document.getElementById('progress-container');
  if (container) container.style.display = 'none';
}

// ===== Initialization =====

document.addEventListener('DOMContentLoaded', async () => {
  const stored = sessionStorage.getItem('playbook_user');
  if (stored) {
    try {
      currentUser = JSON.parse(stored);
      document.getElementById('auth-page').style.display = 'none';
      document.getElementById('app-container').style.display = 'flex';
      const ADMIN_OHR2 = '740045023';

      // Show Admin Tools nav only for admin OHR
      const adminNav2 = document.getElementById('nav-admin');
      if (adminNav2) adminNav2.style.display = (currentUser.ohr_id === ADMIN_OHR2) ? '' : 'none';

      // Show Sync History nav only for admin OHR
      const syncHistoryNav2 = document.getElementById('nav-sync-history');
      if (syncHistoryNav2) syncHistoryNav2.style.display = (currentUser.ohr_id === ADMIN_OHR2) ? '' : 'none';

      // Hide entire Anchor group from Agents
      const anchorGroupEl2 = document.getElementById('nav-group-anchor');
      if (anchorGroupEl2) {
        if (currentUser.actual_role === 'Agent' && currentUser.ohr_id !== ADMIN_OHR2) {
          anchorGroupEl2.style.display = 'none';
        } else {
          anchorGroupEl2.style.display = '';
        }
      }

      // Show Risk Intelligence nav for all non-Agents
      const alertsNav2 = document.getElementById('nav-alerts');
      if (alertsNav2) alertsNav2.style.display = (currentUser.actual_role !== 'Agent') || currentUser.ohr_id === ADMIN_OHR2 ? '' : 'none';

      // Show Billing Compliance nav for all non-Agents
      const billingNav2 = document.getElementById('nav-billing');
      if (billingNav2) billingNav2.style.display = (currentUser.actual_role !== 'Agent') || currentUser.ohr_id === ADMIN_OHR2 ? '' : 'none';

      // Compass — visible to all roles except Agents (role-based coaching visibility)
      const compassNav2 = document.getElementById('nav-group-compass');
      if (compassNav2) {
        const isAgentNonAdmin2 = currentUser.actual_role === 'Agent' && currentUser.ohr_id !== ADMIN_OHR2;
        compassNav2.style.display = isAgentNonAdmin2 ? 'none' : '';
      }

      // Sandbox, Haven, Horizon — visible ONLY to admin OHR (under development)
      ['nav-group-sandbox', 'nav-group-haven', 'nav-group-horizon'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = (currentUser.ohr_id === ADMIN_OHR2) ? '' : 'none';
      });

      // Helm — visible to all (agents see Task Board only)
      const helmNav2 = document.getElementById('nav-group-helm');
      if (helmNav2) helmNav2.style.display = '';

      // Helm Analytics — admin only
      const helmAnalyticsNav2 = document.getElementById('nav-helm-analytics');
      if (helmAnalyticsNav2) helmAnalyticsNav2.style.display = (currentUser.ohr_id === ADMIN_OHR2) ? '' : 'none';

      // Regimen — admin only
      const regimenNav2 = document.getElementById('nav-regimen');
      if (regimenNav2) regimenNav2.style.display = (currentUser.ohr_id === ADMIN_OHR2) ? '' : 'none';

      // Dashboard — hidden from Agents
      const dashboardNav2 = document.getElementById('nav-dashboard');
      if (dashboardNav2) dashboardNav2.style.display = (currentUser.actual_role === 'Agent' && currentUser.ohr_id !== ADMIN_OHR2) ? 'none' : '';

      initMultiSelects();
      initDashboardMultiSelects();
      await loadDataOptimized();
      startRefreshTimer();
      // Auto-expand Anchor and Helm nav groups
      const anchorGroup2 = document.getElementById('nav-group-anchor');
      if (anchorGroup2) anchorGroup2.classList.add('expanded');
      const helmGroup2 = document.getElementById('nav-group-helm');
      if (helmGroup2) helmGroup2.classList.add('expanded');
      // Default sidebar to Alerts (notifications) for all users
if (typeof setSidebarMode === 'function') setSidebarMode('notifications');
       if (typeof initNotifications === 'function') initNotifications();
       // Route to Helm Task Board for Agents, Risk Intelligence for others
       if (currentUser.actual_role === 'Agent' && currentUser.ohr_id !== ADMIN_OHR2) {
        switchView('helm-board');
      } else {
        switchView('alerts');
      }
    } catch (e) {
      sessionStorage.removeItem('playbook_user');
    }
  }

  const signupPw = document.getElementById('signup-password');
  if (signupPw) {
    signupPw.addEventListener('input', () => updatePasswordRules(signupPw.value));
  }

  // Enter key support for login form
  const loginOhr = document.getElementById('login-ohr');
  const loginPw = document.getElementById('login-password');
  if (loginOhr) loginOhr.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleLogin(); });
  if (loginPw) loginPw.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleLogin(); });
});

function initMultiSelects() {
  const cb = () => applyInputFilters();
  appState.multiSelects = {
    tag: new MultiSelect('ms-tag', 'All Tags', cb),
    billing: new MultiSelect('ms-billing', 'All Codes', cb),
    agent: new MultiSelect('ms-agent', 'All Agents', cb, { searchable: true }),
    flm: new MultiSelect('ms-flm', 'All FLMs', cb, { searchable: true }),
    role: new MultiSelect('ms-role', 'All Roles', cb),
    pg: new MultiSelect('ms-pg', 'All Groups', cb),
    shift: new MultiSelect('ms-shift', 'All Shifts', cb),
    status: new MultiSelect('ms-status', 'All Statuses', cb),
  };
}

function initDashboardMultiSelects() {
  const cb = () => applyDashboardFilters();
  appState.dashMultiSelects = {
    flm: new MultiSelect('ms-dash-flm', 'All FLMs', cb),
    pg: new MultiSelect('ms-dash-pg', 'All Groups', cb),
    day: new MultiSelect('ms-dash-day', 'All Days', cb),
  };
}

/**
 * Optimized data loading:
 * 1. Load employees
 * 2. Load only today's records (fast)
 * 3. Show the UI immediately
 */
async function loadDataOptimized() {
  appState.isLoading = true;
  showLoading(true);

  try {
    showProgressBar('Loading...');
    const today = getTodayStr();

    // Parallel fetch: employees + today's attendance in one shot
    // Skip the count query for single-day loads (< 500 records, progress bar unnecessary)
    const [empCount, attendanceRaw] = await Promise.all([
      loadEmployeeLookup(),
      fetchRecordsDirect(today, today)
    ]);

    updateProgressBar(attendanceRaw.length, attendanceRaw.length, 'Processing...');

    // Normalize after employee lookup is ready
    const records = attendanceRaw.map(r => normalizeRecord(r));

    appState.records = records;
    appState.originalRecords = JSON.parse(JSON.stringify(records));
    appState.lastUpdated = new Date().toISOString();
    appState.lastRefreshedTime = new Date();
    appState.pendingEdits = {};
    appState.loadedRanges = [{ start: today, end: today }];

    hideProgressBar();
    buildRosterFromRecords();
    setDefaultFilters();
    updateAllViews();
  } catch (err) {
    hideProgressBar();
    showToast('Failed to load data: ' + err.message, 'error');
  } finally {
    appState.isLoading = false;
    showLoading(false);
  }
}

/**
 * Check if a date range is already loaded.
 */
function isRangeLoaded(start, end) {
  for (const range of appState.loadedRanges) {
    if (range.start <= start && range.end >= end) return true;
  }
  return false;
}

/**
 * Merge a new range into loadedRanges.
 */
function mergeLoadedRange(start, end) {
  appState.loadedRanges.push({ start, end });
  // Simple merge: sort and combine overlapping
  appState.loadedRanges.sort((a, b) => a.start.localeCompare(b.start));
  const merged = [appState.loadedRanges[0]];
  for (let i = 1; i < appState.loadedRanges.length; i++) {
    const last = merged[merged.length - 1];
    const curr = appState.loadedRanges[i];
    if (curr.start <= last.end || isNextDay(last.end, curr.start)) {
      last.end = last.end > curr.end ? last.end : curr.end;
    } else {
      merged.push(curr);
    }
  }
  appState.loadedRanges = merged;
}

function isNextDay(d1, d2) {
  const a = new Date(d1 + 'T00:00:00');
  a.setDate(a.getDate() + 1);
  const b = a.getFullYear() + '-' + String(a.getMonth() + 1).padStart(2, '0') + '-' + String(a.getDate()).padStart(2, '0');
  return b === d2;
}

/**
 * Ensure records for a date range are loaded. Shows progress bar if fetching.
 */
async function ensureDataForRange(startDate, endDate) {
  if (!startDate || !endDate) return;
  if (isRangeLoaded(startDate, endDate)) return;

  appState.isLoading = true;
  showProgressBar('Loading Data...');

  try {
    const result = await fetchAndMergeRecords(startDate, endDate, (loaded, total) => {
      updateProgressBar(loaded, total, 'Loading Data...');
    });
    mergeLoadedRange(startDate, endDate);
    appState.lastRefreshedTime = new Date();
    buildRosterFromRecords();
    populateInputFilterDropdowns();
    populateDashboardFilterDropdowns();
  } catch (err) {
    showToast('Failed to load data: ' + err.message, 'error');
  } finally {
    hideProgressBar();
    appState.isLoading = false;
  }
}

function setDefaultFilters() {
  const today = getTodayStr();
  const startEl = document.getElementById('input-filter-start-date');
  const endEl = document.getElementById('input-filter-end-date');
  if (startEl) startEl.value = today;
  if (endEl) endEl.value = today;
  const dashStart = document.getElementById('dash-start-date');
  const dashEnd = document.getElementById('dash-end-date');
  if (dashStart) dashStart.value = today;
  if (dashEnd) dashEnd.value = today;
  // Set omnibar defaults if available
  if (typeof setDefaultOmnibarFilters === 'function') setDefaultOmnibarFilters();
}

function buildRosterFromRecords() {
  const rosterMap = {};
  for (const r of appState.records) {
    if (!rosterMap[r.agent]) {
      rosterMap[r.agent] = {
        ohr: r.ohr, fullName: r.agent, flm: r.flm,
        role: r.role, actualPG: r.actualPlanningGroup,
        shiftTime: r.shiftTime, status: r.status
      };
    }
  }
  appState.roster = Object.values(rosterMap).sort((a, b) => a.fullName.localeCompare(b.fullName));
}

// ===== Last Refreshed Timer =====

let refreshTimerInterval = null;

function startRefreshTimer() {
  updateRefreshDisplay();
  if (refreshTimerInterval) clearInterval(refreshTimerInterval);
  refreshTimerInterval = setInterval(updateRefreshDisplay, 30000);
}

function updateRefreshDisplay() {
  if (!appState.lastRefreshedTime) {
    var metaEl = document.getElementById('header-meta');
    if (metaEl) metaEl.textContent = 'Last refreshed: \u2014';
    return;
  }
  const now = new Date();
  const diffMs = now - appState.lastRefreshedTime;
  const diffMin = Math.floor(diffMs / 60000);

  let text;
  if (diffMin < 1) text = 'Last refreshed: just now';
  else if (diffMin === 1) text = 'Last refreshed: 1 minute ago';
  else if (diffMin < 60) text = `Last refreshed: ${diffMin} minutes ago`;
  else {
    const diffHr = Math.floor(diffMin / 60);
    text = `Last refreshed: ${diffHr} hour${diffHr > 1 ? 's' : ''} ago`;
  }
  var metaEl2 = document.getElementById('header-meta');
  if (metaEl2) metaEl2.textContent = text;
}

// ===== View Switching =====

async function switchView(view) {
  appState.activeView = view;

  const allViews = ['input', 'dashboard', 'alerts', 'admin', 'billing', 'sync-history', 'compass-input', 'compass-disputes', 'sandbox-input', 'sandbox-review', 'sandbox-analytics', 'haven-input', 'haven-review', 'haven-final', 'helm-board', 'helm-analytics', 'regimen', 'performance', 'productivity-hrs'];
  allViews.forEach(v => {
    const el = document.getElementById('view-' + v);
    if (el) el.classList.toggle('view-hidden', v !== view);
  });

  // Highlight active nav item (handle collapsible group children too)
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });

  // Auto-expand collapsible group if a child view is selected
  const anchorViews = ['input', 'dashboard', 'billing', 'alerts', 'sync-history'];
  if (anchorViews.includes(view)) {
    const anchorGroup = document.getElementById('nav-group-anchor');
    if (anchorGroup) anchorGroup.classList.add('expanded');
  }
  const compassViews = ['compass-input', 'compass-disputes'];
  if (compassViews.includes(view)) {
    const compassGroup = document.getElementById('nav-group-compass');
    if (compassGroup) compassGroup.classList.add('expanded');
  }
  const sandboxViews = ['sandbox-input', 'sandbox-review', 'sandbox-analytics'];
  if (sandboxViews.includes(view)) {
    const sandboxGroup = document.getElementById('nav-group-sandbox');
    if (sandboxGroup) sandboxGroup.classList.add('expanded');
  }
  const havenViews = ['haven-input', 'haven-review', 'haven-final'];
  if (havenViews.includes(view)) {
    const havenGroup = document.getElementById('nav-group-haven');
    if (havenGroup) havenGroup.classList.add('expanded');
  }
  const helmViews = ['helm-board', 'helm-analytics'];
  if (helmViews.includes(view)) {
    const helmGroup = document.getElementById('nav-group-helm');
    if (helmGroup) helmGroup.classList.add('expanded');
  }
  const horizonViews = ['performance', 'productivity-hrs'];
  if (horizonViews.includes(view)) {
    const horizonGroup = document.getElementById('nav-group-horizon');
    if (horizonGroup) horizonGroup.classList.add('expanded');
  }

  const titles = {
    input: 'Input Portal', dashboard: 'Command Dashboard', alerts: 'Risk Intelligence',
    admin: 'Admin Tools', billing: 'Billing Compliance', 'sync-history': 'Sync History',
    'compass-input': 'Coaching Profile', 'compass-disputes': 'Disputes Area',
    'sandbox-input': 'Input Portal', 'sandbox-review': 'Review Area', 'sandbox-analytics': 'Analytics',
    'haven-input': 'Input Portal', 'haven-review': 'Review Area', 'haven-final': 'Final Review Area',
    'helm-board': 'Task Board', 'helm-analytics': 'Analytics',
    regimen: 'Regimen',
    performance: 'Main Metrics', 'productivity-hrs': 'Productivity Hrs.',
  };
  var viewTitleEl = document.getElementById('view-title');
  if (viewTitleEl) viewTitleEl.textContent = titles[view] || view;

  // Show Export CSV button on Input Portal for all non-agents
  const exportBtn = document.getElementById('export-csv-btn');
  const isNonAgent = currentUser && currentUser.actual_role !== 'Operational SME' && currentUser.actual_role !== 'Agent';
  if (exportBtn) exportBtn.style.display = (view === 'input' && (isNonAgent || (currentUser && currentUser.ohr_id === '740045023'))) ? '' : 'none';

  // Show "Last refreshed" only on Input Portal
  const headerMeta = document.getElementById('header-meta');
  if (headerMeta) headerMeta.style.display = view === 'input' ? '' : 'none';

  if (view === 'input') window.renderInputTable();
  if (view === 'dashboard') renderDashboard();
  if (view === 'alerts') await loadAllDataForAlerts();
  if (view === 'billing') await initBillingCompliance();
  if (view === 'performance') { if (typeof initPerformance === 'function') await initPerformance(); }
  if (view === 'admin') { if (typeof onAdminViewLoad === 'function') onAdminViewLoad(); }
  if (view === 'compass-input') { if (typeof initCompass === 'function') initCompass(); }
  if (view === 'compass-disputes') { if (typeof initCompassDisputes === 'function') initCompassDisputes(); }
  if (sandboxViews.includes(view)) { if (typeof initSandbox === 'function') initSandbox(view); }
  if (havenViews.includes(view)) { if (typeof initHaven === 'function') initHaven(view); }
  if (helmViews.includes(view)) { if (typeof initHelm === 'function') initHelm(view); }
  if (view === 'regimen') { if (typeof initRoster === 'function') initRoster(); }
  if (view === 'productivity-hrs') { if (typeof initProductivityHrs === 'function') initProductivityHrs(); }
  if (view === 'sync-history') { if (typeof initSyncHistory === 'function') initSyncHistory(); }
}

/**
 * Load data for Risk Alerts based on the currently selected month filter.
 * Called when switching to the alerts view.
 */
async function loadAllDataForAlerts() {
  // First, ensure the filter dropdowns are populated and synced with appState
  populateAlertFilterDropdowns();

  // If no month is selected (still 'All'), default to the current month
  const monthEl = document.getElementById('alert-filter-month');
  if (monthEl && (!monthEl.value || monthEl.value === 'All')) {
    const currentMonth = getCurrentMonthName();
    if ([...monthEl.options].some(o => o.value === currentMonth)) {
      monthEl.value = currentMonth;
      appState.alertFilters.month = currentMonth;
    }
  }

  // Now trigger the full filter apply which loads data for the selected month and renders
  await applyAlertFilters();
}

// ===== Refresh Data =====

async function forceSync() {
  showProgressBar('Refreshing Data...');
  try {
    // Smart refresh: only re-fetch the currently loaded date ranges
    // and update changed rows instead of reloading everything
    const loadedRanges = appState.loadedRanges;
    if (loadedRanges.length === 0) {
      // Nothing loaded yet, just load today
      const today = getTodayStr();
      const records = await fetchRecordsForRange(today, today, (loaded, total) => {
        updateProgressBar(loaded, total, 'Refreshing Data...');
      });
      appState.records = records;
      appState.originalRecords = JSON.parse(JSON.stringify(records));
      appState.loadedRanges = [{ start: today, end: today }];
    } else {
      // Re-fetch all currently loaded ranges and merge/update
      let allFreshRecords = [];
      let totalLoaded = 0;
      let totalExpected = 0;

      // First get total count for progress
      for (const range of loadedRanges) {
        totalExpected += await getAttendanceCount(range.start, range.end);
      }

      for (const range of loadedRanges) {
        const freshRecords = await fetchRecordsForRange(range.start, range.end, (loaded, total) => {
          updateProgressBar(totalLoaded + loaded, totalExpected, 'Refreshing Data...');
        });
        totalLoaded += freshRecords.length;
        allFreshRecords.push(...freshRecords);
      }

      // Deduplicate by _id
      const seen = new Set();
      const deduped = [];
      for (const r of allFreshRecords) {
        if (!seen.has(r._id)) {
          seen.add(r._id);
          deduped.push(r);
        }
      }

      appState.records = deduped;
      appState.originalRecords = JSON.parse(JSON.stringify(deduped));
    }

    appState.lastRefreshedTime = new Date();
    appState.pendingEdits = {};
    buildRosterFromRecords();
    updateAllViews();
    showToast('Data refreshed successfully', 'success');
  } catch (err) {
    showToast('Refresh failed: ' + err.message, 'error');
  } finally {
    hideProgressBar();
  }
}

// ===== Loading States =====

function showLoading(show) {
  const dashLoading = document.getElementById('dashboard-loading');
  const dashContent = document.getElementById('dashboard-content');
  const alertsLoading = document.getElementById('alerts-loading');
  const alertsContent = document.getElementById('alerts-content');

  if (show) {
    if (dashLoading) dashLoading.style.display = 'flex';
    if (dashContent) dashContent.style.display = 'none';
    if (alertsLoading) alertsLoading.style.display = 'flex';
    if (alertsContent) alertsContent.style.display = 'none';
  } else {
    if (dashLoading) dashLoading.style.display = 'none';
    if (dashContent) dashContent.style.display = 'block';
    if (alertsLoading) alertsLoading.style.display = 'none';
    if (alertsContent) alertsContent.style.display = 'block';
  }
}

// ===== Toast Notifications =====

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 300ms';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ===== Update All Views =====

function updateAlertNavBadge() {
  const allAlerts = getAllAlerts(appState.records);
  const monthFilter = appState.alertFilters.month;
  const weekFilter = appState.alertFilters.weekEnding;

  // Apply same role-based filtering as renderAlerts
  const role = currentUser ? currentUser.actual_role : '';
  const userOhr = currentUser ? currentUser.ohr_id : '';
  const isAdmin = userOhr === '740045023';

  function filterByRole(alerts) {
    if (!currentUser) return alerts;
    if (isAdmin || role === 'Trainer') return alerts;
    if (role === 'Team Lead') {
      const myAgents = appState.records
        .filter(r => r.flm === currentUser.full_name)
        .map(r => r.agent);
      const myAgentSet = new Set(myAgents);
      return alerts.filter(a => myAgentSet.has(a.agent));
    }
    if (role === 'Manager') {
      const myPG = currentUser.complete_planning_group || '';
      if (!myPG) return alerts;
      const pgList = myPG.split(',').map(s => s.trim().toLowerCase());
      const pgAgents = appState.records
        .filter(r => {
          const rPG = (r.planningGroup || '').toLowerCase();
          return pgList.some(pg => rPG.includes(pg));
        })
        .map(r => r.agent);
      const pgAgentSet = new Set(pgAgents);
      return alerts.filter(a => pgAgentSet.has(a.agent));
    }
    return alerts;
  }

  let total = 0;
  for (const cat of (typeof ALERT_CATEGORIES !== 'undefined' ? ALERT_CATEGORIES : [])) {
    let catAlerts = filterByRole(allAlerts[cat.id] || []);
    if (cat.hasMonth && monthFilter && monthFilter !== 'All') {
      catAlerts = catAlerts.filter(a => a.month === monthFilter);
    }
    if (cat.hasWeek && weekFilter && weekFilter !== 'All') {
      catAlerts = catAlerts.filter(a => a.weekEnding === weekFilter);
    }
    total += catAlerts.length;
  }
  const alertNavEl = document.getElementById('alert-nav-count');
  if (alertNavEl) alertNavEl.textContent = total;
}

function updateAllViews() {
  updateRefreshDisplay();
  populateInputFilterDropdowns();
  populateDashboardFilterDropdowns();
  populateAlertFilterDropdowns();

  updateAlertNavBadge();

  if (appState.activeView === 'input') window.renderInputTable();
  if (appState.activeView === 'dashboard') renderDashboard();
  if (appState.activeView === 'alerts') renderAlerts();
}

// ===== Input Portal Filter Dropdowns (Multi-Select) =====

function populateInputFilterDropdowns() {
  const records = appState.records;
  const tags = [...new Set(records.map(r => r.tag).filter(Boolean))].sort();
  const agents = [...new Set(records.map(r => r.agent).filter(Boolean))].sort();
  const flms = [...new Set(records.map(r => r.flm).filter(Boolean))].sort();
  const roles = [...new Set(records.map(r => r.role).filter(Boolean))].sort();
  const pgs = [...new Set(records.map(r => r.actualPlanningGroup).filter(Boolean))].sort();
  const shifts = [...new Set(records.map(r => r.shiftTime).filter(Boolean))].sort();
  const statuses = [...new Set(records.map(r => r.status).filter(Boolean))].sort();

  if (appState.multiSelects.tag) appState.multiSelects.tag.setOptions(tags);
  if (appState.multiSelects.agent) appState.multiSelects.agent.setOptions(agents);
  if (appState.multiSelects.flm) appState.multiSelects.flm.setOptions(flms);
  if (appState.multiSelects.role) appState.multiSelects.role.setOptions(roles);
  if (appState.multiSelects.pg) appState.multiSelects.pg.setOptions(pgs);
  if (appState.multiSelects.shift) appState.multiSelects.shift.setOptions(shifts);
  if (appState.multiSelects.status) appState.multiSelects.status.setOptions(statuses);
}

function fillSelect(id, options, allLabel) {
  const el = document.getElementById(id);
  if (!el) return;
  const curVal = el.value;
  while (el.options.length > 1) el.remove(1);
  el.options[0].textContent = allLabel;
  options.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o;
    // Format week ending dates as mm/dd for week filter selects
    if ((id === 'alert-filter-week') && /^\d{4}-\d{2}-\d{2}$/.test(o)) {
      const d = new Date(o + 'T00:00:00');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      opt.textContent = `${mm}/${dd}`;
    } else {
      opt.textContent = o;
    }
    el.appendChild(opt);
  });
  el.value = curVal || 'All';
}

// ===== Blanks Filter Toggle =====

function toggleBlanksFilter() {
  appState.blanksFilterActive = !appState.blanksFilterActive;
  const btn = document.getElementById('blanks-toggle');
  if (btn) {
    if (appState.blanksFilterActive) {
      btn.classList.add('blanks-active');
      btn.textContent = 'Hide Blanks';
    } else {
      btn.classList.remove('blanks-active');
      btn.textContent = 'Show Blanks';
    }
  }
  appState.inputPage = 0;
  window.renderInputTable();
}

// ===== Input Portal Filtering =====

async function applyInputFilters() {
  // Delegate to omnibar if available
  if (typeof omnibarApplyView === 'function') { await omnibarApplyView(); return; }
  const startEl = document.getElementById('input-filter-start-date');
  const endEl = document.getElementById('input-filter-end-date');
  const startDate = startEl ? startEl.value : '';
  const endDate = endEl ? endEl.value : '';
  if (startDate && endDate) {
    await ensureDataForRange(startDate, endDate);
  }
  appState.inputPage = 0;
  window.renderInputTable();
}

function clearInputFilters() {
  if (appState.multiSelects) Object.values(appState.multiSelects).forEach(ms => { if (ms && ms.reset) ms.reset(); });
  const today = getTodayStr();
  const startEl = document.getElementById('input-filter-start-date');
  const endEl = document.getElementById('input-filter-end-date');
  if (startEl) startEl.value = today;
  if (endEl) endEl.value = today;
  appState.blanksFilterActive = false;
  const blanksBtn = document.getElementById('blanks-toggle');
  if (blanksBtn) { blanksBtn.classList.remove('blanks-active'); blanksBtn.textContent = 'Show Blanks'; }
  // Delegate to omnibar if available
  if (typeof omnibarClearAll === 'function') { omnibarClearAll(); return; }
  appState.inputPage = 0;
  window.renderInputTable();
}

function getFilteredInputRecords() {
  let result = [];
  const records = appState.records;

  const ms = appState.multiSelects;
  const tagSel = ms.tag ? ms.tag.getSelected() : [];
  const tagNone = ms.tag && ms.tag.noneMode && tagSel.length === 0;
  const agentSel = ms.agent ? ms.agent.getSelected() : [];
  const agentNone = ms.agent && ms.agent.noneMode && agentSel.length === 0;
  const flmSel = ms.flm ? ms.flm.getSelected() : [];
  const flmNone = ms.flm && ms.flm.noneMode && flmSel.length === 0;
  const roleSel = ms.role ? ms.role.getSelected() : [];
  const roleNone = ms.role && ms.role.noneMode && roleSel.length === 0;
  const pgSel = ms.pg ? ms.pg.getSelected() : [];
  const pgNone = ms.pg && ms.pg.noneMode && pgSel.length === 0;
  const shiftSel = ms.shift ? ms.shift.getSelected() : [];
  const shiftNone = ms.shift && ms.shift.noneMode && shiftSel.length === 0;
  const statusSel = ms.status ? ms.status.getSelected() : [];
  const statusNone = ms.status && ms.status.noneMode && statusSel.length === 0;

  // If any filter is in noneMode with nothing selected, no records match
  if (tagNone || billingNone || agentNone || flmNone || roleNone || pgNone || shiftNone || statusNone) return [];
  const startEl = document.getElementById('input-filter-start-date');
  const endEl = document.getElementById('input-filter-end-date');
  const startDate = startEl ? startEl.value : '';
  const endDate = endEl ? endEl.value : '';

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (tagSel.length > 0 && !tagSel.includes(r.tag)) continue;
    if (startDate && r.date && r.date < startDate) continue;
    if (endDate && r.date && r.date > endDate) continue;
    if (agentSel.length > 0 && !agentSel.includes(r.agent)) continue;
    if (flmSel.length > 0 && !flmSel.includes(r.flm)) continue;
    if (roleSel.length > 0 && !roleSel.includes(r.role)) continue;
    if (pgSel.length > 0 && !pgSel.includes(r.actualPlanningGroup)) continue;
    if (shiftSel.length > 0 && !shiftSel.includes(r.shiftTime)) continue;
    if (statusSel.length > 0 && !statusSel.includes(r.status)) continue;
    if (appState.blanksFilterActive && (r.tag || '').trim() !== '') continue;
    result.push({ record: r, originalIndex: i });
  }

  return result;
}

function goInputPage(page) {
  if (typeof serverPagState !== 'undefined' && serverPagState.enabled) {
    serverPageChange(page);
  } else {
    appState.inputPage = page;
    window.renderInputTable();
  }
}

function renderInputTable() {
  const allFiltered = getFilteredInputRecords();

  const totalRecords = allFiltered.length;
  const pageSize = appState.inputPageSize;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const page = Math.min(appState.inputPage, totalPages - 1);
  const start = page * pageSize;
  const pageItems = allFiltered.slice(start, start + pageSize);

  const rcEl = document.getElementById('input-record-count');
  if (rcEl) rcEl.textContent = `Filtered Records: ${formatNumber(totalRecords)}`;

  const editCount = Object.keys(appState.pendingEdits).length;
  const editCountEl = document.getElementById('input-edit-count');
  const saveBtn = document.getElementById('save-btn');
  const undoBtn = document.getElementById('undo-btn');
  if (editCount > 0) {
    if (editCountEl) { editCountEl.textContent = `${editCount} record(s) edited`; editCountEl.style.display = 'inline'; }
    if (saveBtn) saveBtn.disabled = false;
    if (undoBtn) undoBtn.disabled = false;
  } else {
    if (editCountEl) editCountEl.style.display = 'none';
    if (saveBtn) saveBtn.disabled = true;
    if (undoBtn) undoBtn.disabled = true;
  }

  if (totalRecords > 0) {
    const infoEl = document.getElementById('input-record-info');
    if (infoEl) infoEl.textContent =
      `Showing ${start + 1}\u2013${Math.min(start + pageSize, totalRecords)} of ${formatNumber(totalRecords)}`;
  } else {
    const infoEl2 = document.getElementById('input-record-info');
    if (infoEl2) infoEl2.textContent = 'No records';
  }

  // Table header with column width classes
  const thead = document.getElementById('input-table-head');
  if (!thead) return; // Guard: Input Portal DOM not ready
  thead.innerHTML = '<tr>' + TABLE_COLUMNS.map(col => {
    const isEditable = col.editable;
    const widthClass = getColumnWidthClass(col.key);
    return `<th class="${isEditable ? 'th-editable' : ''} ${widthClass}">${col.label}${isEditable ? ' <span class="edit-indicator">&#9998;</span>' : ''}</th>`;
  }).join('') + '</tr>';

  // Table body
  const tbody = document.getElementById('input-table-body');
  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${TABLE_COLUMNS.length}"><div class="mascot-empty-state"><div class="sprite-mascot" role="img" aria-label="No data"></div><div class="empty-title">No records found</div><div class="empty-subtitle">Adjust the filters above to load data</div></div></td></tr>`;
  } else {
    tbody.innerHTML = pageItems.map(item => {
      const record = item.record;
      const globalIdx = item.originalIndex;
      const isEdited = appState.pendingEdits[globalIdx] !== undefined;
      const locked = isRowLocked(record);
      const rowClass = (isEdited ? 'row-edited' : '') + (locked ? ' row-locked' : '');

      return `<tr class="${rowClass}">` + TABLE_COLUMNS.map(col => {
        const val = record[col.key] || '';
        const widthClass = getColumnWidthClass(col.key);

        // OT field gets special treatment: editable on locked rows within current week (only 11 AM lock applies)
        if (col.key === 'ot' && locked) {
          // Compute current WE (Friday) and week start (Saturday)
          const nowOt = new Date();
          const phtOt = new Date(nowOt.getTime() + 8 * 60 * 60000);
          const phtDayOt = phtOt.getUTCDay(); // 0=Sun
          const daysToFri = (5 - phtDayOt + 7) % 7;
          const weFri = new Date(phtOt);
          weFri.setUTCDate(weFri.getUTCDate() + daysToFri);
          const weStart = new Date(weFri);
          weStart.setUTCDate(weStart.getUTCDate() - 6); // Saturday
          const weStartStr = weStart.toISOString().slice(0, 10);
          const weEndStr = weFri.toISOString().slice(0, 10);
          const inCurrentWeek = record.date >= weStartStr && record.date <= weEndStr;
          if (inCurrentWeek) {
            // Check OT mechanism lock (S-ABF & CS-ABF agents from 04/11 onward)
            const OT_MECH_PGS_1 = ['S-ABF', 'CS-ABF'];
            const otLockDate = '2026-04-11';
            const isOtMechanismAgent = currentUser && currentUser.actual_role === 'Agent'
              && OT_MECH_PGS_1.includes(currentUser.actualPlanningGroup || currentUser.planning_group || '')
              && currentUser.ohr_id !== '740045023';
            const isOtFieldLocked = isOtMechanismAgent && record.date >= otLockDate;
            if (isOtFieldLocked) {
              return `<td class="cell-readonly cell-locked ${widthClass}">${escapeHtml(val)} <span class="lock-icon" title="OT managed via OT Dashboard">&#128274;</span></td>`;
            }
            // OT editable even on locked row (within current week)
            return `<td class="cell-editable ${widthClass}"><input type="number" step="0.5" min="0" class="cell-input cell-input-ot" value="${escapeAttr(val)}" data-idx="${globalIdx}" data-key="ot" onchange="handleCellEdit(this)" placeholder="\u2014"></td>`;
          }
          // Outside current week and row is locked: show as readonly
          return `<td class="cell-readonly cell-locked ${widthClass}">${escapeHtml(val)}</td>`;
        }

        if (!col.editable || locked) {
          // Format date column
          if (col.key === 'date') {
            return `<td class="cell-readonly col-date ${widthClass}">${formatDateDisplay(val)}${locked && col.editable ? ' <span class="lock-icon" title="Locked after 11 AM PHT">&#128274;</span>' : ''}</td>`;
          }
          if (locked && col.editable) {
            return `<td class="cell-readonly cell-locked ${widthClass}">${escapeHtml(val)}</td>`;
          }
          return `<td class="cell-readonly ${widthClass}">${escapeHtml(val)}</td>`;
        }

        if (col.key === 'tag') {
          return `<td class="cell-editable ${widthClass}"><select class="cell-select" data-idx="${globalIdx}" data-key="tag" onchange="handleCellEdit(this)">
            <option value="" ${!val ? 'selected' : ''}>&mdash;</option>
            ${TAG_OPTIONS.map(t => `<option value="${t}" ${val === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select></td>`;
        }
        if (col.key === 'uplReason') {
          const canEdit = record.tag === 'UPL' || record.tag === 'LATE';
          if (!canEdit) return `<td class="cell-readonly cell-na ${widthClass}">&mdash;</td>`;
          return `<td class="cell-editable ${widthClass}"><select class="cell-select" data-idx="${globalIdx}" data-key="uplReason" onchange="handleCellEdit(this)">
            <option value="">&mdash;</option>
            ${UPL_REASONS.map(r => `<option value="${r}" ${val === r ? 'selected' : ''}>${r}</option>`).join('')}
          </select></td>`;
        }
        if (col.key === 'ot') {
          // OT lock for S-ABF & CS-ABF agents: locked from dates >= 2026-04-11
          // Exempt: all other PGs, non-agent roles (SME, TL, Manager, etc.), admin
          const OT_MECH_PGS_2 = ['S-ABF', 'CS-ABF'];
          const otLockDate = '2026-04-11';
          const isOtMechanismAgent = currentUser && currentUser.actual_role === 'Agent'
            && OT_MECH_PGS_2.includes(currentUser.actualPlanningGroup || currentUser.planning_group || '')
            && currentUser.ohr_id !== '740045023';
          const isOtFieldLocked = isOtMechanismAgent && record.date >= otLockDate;
          if (isOtFieldLocked) {
            return `<td class="cell-readonly cell-locked ${widthClass}">${escapeHtml(val)} <span class="lock-icon" title="OT managed via OT Dashboard">&#128274;</span></td>`;
          }
          return `<td class="cell-editable ${widthClass}"><input type="number" step="0.5" min="0" class="cell-input cell-input-ot" value="${escapeAttr(val)}" data-idx="${globalIdx}" data-key="ot" onchange="handleCellEdit(this)" placeholder="\u2014"></td>`;
        }
        if (col.key === 'remarks') {
          return `<td class="cell-editable ${widthClass}"><textarea class="cell-input cell-textarea-remarks" data-idx="${globalIdx}" data-key="remarks" onchange="handleCellEdit(this)" placeholder="\u2014">${escapeHtml(val)}</textarea></td>`;
        }

        return `<td class="cell-readonly ${widthClass}">${escapeHtml(val)}</td>`;
      }).join('') + '</tr>';
    }).join('');
  }

  renderInputPagination(page, totalPages);
}

/**
 * Get CSS class for column width.
 */
function getColumnWidthClass(key) {
  const map = {
    date: 'col-date',
    tag: 'col-tag',
    uplReason: 'col-reason',
    remarks: 'col-remarks',
    ot: 'col-ot',
    agent: 'col-agent',
    flm: 'col-flm',
  };
  return map[key] || '';
}

function renderInputPagination(currentPage, totalPages) {
  const container = document.getElementById('input-pagination');
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = '';
  html += `<button class="page-btn" ${currentPage === 0 ? 'disabled' : ''} onclick="goInputPage(${currentPage - 1})">&laquo;</button>`;

  const pages = new Set();
  pages.add(0);
  if (currentPage > 0) pages.add(currentPage - 1);
  pages.add(currentPage);
  if (currentPage < totalPages - 1) pages.add(currentPage + 1);
  pages.add(totalPages - 1);

  let prev = -1;
  for (const p of [...pages].sort((a, b) => a - b)) {
    if (prev >= 0 && p - prev > 1) html += '<span class="page-ellipsis">&hellip;</span>';
    html += `<button class="page-btn ${p === currentPage ? 'active' : ''}" onclick="goInputPage(${p})">${p + 1}</button>`;
    prev = p;
  }

  html += `<button class="page-btn" ${currentPage >= totalPages - 1 ? 'disabled' : ''} onclick="goInputPage(${currentPage + 1})">&raquo;</button>`;
  container.innerHTML = html;
}

// ===== Row Locking Logic =====

/**
 * Check if a row should be locked based on:
 * - Past dates are always locked
 * - Current date is editable before 11:00 AM PHT, locked after
 * - Future dates are not locked
 * - Exempt: OHR 740045023 and actual_role = 'Manager'
 */
function isRowLocked(record) {
  // Exempt admin OHR 740045023 and Managers — never locked
  if (currentUser && (currentUser.ohr_id === '740045023' || currentUser.actual_role === 'Manager')) {
    return false;
  }

  const now = new Date();
  // Convert to Philippine Time (UTC+8)
  const phtOffset = 8 * 60; // minutes
  const phtTime = new Date(now.getTime() + phtOffset * 60000);
  const phtHour = phtTime.getUTCHours();

  // Compute yesterday in PHT
  const yesterdayPHT_d = new Date(phtTime);
  yesterdayPHT_d.setUTCDate(yesterdayPHT_d.getUTCDate() - 1);
  const yesterdayPHT = yesterdayPHT_d.getUTCFullYear() + '-' + String(yesterdayPHT_d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(yesterdayPHT_d.getUTCDate()).padStart(2, '0');

  if (!record.date) return true;

  // Dates before yesterday are always locked
  if (record.date < yesterdayPHT) {
    return true;
  }

  // Yesterday: editable before 11:00 AM PHT, locked after
  if (record.date === yesterdayPHT) {
    return phtHour >= 11; // locked if 11 AM or later
  }

  // Current day and future dates are not locked
  return false;
}



function handleCellEdit(el) {
  const idx = parseInt(el.dataset.idx);
  const key = el.dataset.key;
  let value = el.value;

  if (key === 'ot') {
    if (value !== '' && isNaN(parseFloat(value))) {
      showToast('OT must be a number', 'error');
      el.value = appState.records[idx][key] || '';
      return;
    }
  }

  if (idx >= 0 && idx < appState.records.length) {
    appState.records[idx][key] = value;
    if (!appState.pendingEdits[idx]) appState.pendingEdits[idx] = {};
    appState.pendingEdits[idx][key] = value;

    if (key === 'tag' && value !== 'UPL' && value !== 'LATE') {
      appState.records[idx].uplReason = '';
      if (!appState.pendingEdits[idx]) appState.pendingEdits[idx] = {};
      appState.pendingEdits[idx].uplReason = '';
    }

    // Sync serverPagState.rows so compact view re-renders show edited values
    if (typeof serverPagState !== 'undefined' && serverPagState.enabled && serverPagState.rows) {
      var editedRecId = appState.records[idx]._id;
      var spRow = serverPagState.rows.find(function(r) { return r._id === editedRecId; });
      if (spRow) {
        // Map frontend keys to both frontend and DB column names
        var keyMap = { tag: ['tag'], uplReason: ['uplReason', 'upl_reason'], remarks: ['remarks'], ot: ['ot', 'ot_hours'], role: ['role'], actualPlanningGroup: ['actualPlanningGroup', 'planning_group'] };
        var targets = keyMap[key] || [key];
        for (var ti = 0; ti < targets.length; ti++) { spRow[targets[ti]] = value; }
        if (key === 'tag' && value !== 'UPL' && value !== 'LATE') {
          spRow.uplReason = '';
          spRow.upl_reason = '';
        }
      }
    }

    const editCount = Object.keys(appState.pendingEdits).length;
    const editCountEl = document.getElementById('input-edit-count');
    if (editCountEl) { editCountEl.textContent = `${editCount} record(s) edited`; editCountEl.style.display = 'inline'; }
    const saveBtn = document.getElementById('save-btn');
    const undoBtn = document.getElementById('undo-btn');
    if (saveBtn) saveBtn.disabled = false;
    if (undoBtn) undoBtn.disabled = false;

    // Invalidate audit cache for this record (will re-fetch on next expand)
    var editedRec = appState.records[idx];
    if (editedRec && typeof invalidateAuditCache === 'function') {
      invalidateAuditCache(editedRec._id);
    }

    if (key === 'tag') {
      // In compact mode, just refresh the tag chip + detail panel without full re-render
      if (editedRec && typeof compactRefreshRow === 'function') {
        compactRefreshRow(editedRec._id);
        // Also refresh the detail panel reason field (UPL reason becomes editable/readonly based on tag)
        compactRefreshDetailPanel(editedRec._id, idx);
      } else {
        window.renderInputTable();
      }
    }
  }
}

// ===== Undo All Changes =====

function handleUndoAll() {
  if (Object.keys(appState.pendingEdits).length === 0) return;
  appState.records = JSON.parse(JSON.stringify(appState.originalRecords));
  appState.pendingEdits = {};

  // Sync serverPagState.rows from restored records so compact view shows reverted data
  if (typeof serverPagState !== 'undefined' && serverPagState.enabled && serverPagState.rows) {
    for (var si = 0; si < serverPagState.rows.length; si++) {
      var sRow = serverPagState.rows[si];
      var origRec = appState.records.find(function(r) { return r._id === sRow._id; });
      if (origRec) {
        sRow.tag = origRec.tag;
        sRow.uplReason = origRec.uplReason;
        sRow.upl_reason = origRec.uplReason;
        sRow.remarks = origRec.remarks;
        sRow.ot = origRec.ot;
        sRow.ot_hours = origRec.ot;
        sRow.role = origRec.role;
        sRow.actualPlanningGroup = origRec.actualPlanningGroup;
        sRow.planning_group = origRec.actualPlanningGroup;
      }
    }
  }

  window.renderInputTable();
  showToast('All changes have been reverted', 'info');
}

// ===== Save Functionality =====

function handleSave() {
  const editCount = Object.keys(appState.pendingEdits).length;
  if (editCount === 0) return;
  document.getElementById('save-modal').style.display = 'flex';
}

function closeSaveModal() {
  document.getElementById('save-modal').style.display = 'none';
}

async function confirmSave() {
  const btn = document.getElementById('save-confirm-btn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const edits = [];
    for (const [idx, changes] of Object.entries(appState.pendingEdits)) {
      const record = appState.records[parseInt(idx)];
      const edit = { _id: record._id || '' };
      const fieldMap = { tag: 'tag', uplReason: 'upl_reason', remarks: 'remarks', ot: 'ot_hours', role: 'role', actualPlanningGroup: 'planning_group' };
      for (const [field, value] of Object.entries(changes)) {
        const dbCol = fieldMap[field] || field;
        edit[dbCol] = value;
      }
      edits.push(edit);
    }

    const result = await saveRecords(edits);
    if (result.success) {
      showToast(result.message || 'Changes saved successfully', 'success');
      appState.pendingEdits = {};

      // Sync serverPagState.rows with saved values so re-render shows fresh data
      if (typeof serverPagState !== 'undefined' && serverPagState.enabled && serverPagState.rows) {
        const reverseFieldMap = { tag: 'tag', upl_reason: 'uplReason', remarks: 'remarks', ot_hours: 'ot', role: 'role', planning_group: 'actualPlanningGroup' };
        for (const edit of edits) {
          const row = serverPagState.rows.find(r => r._id === edit._id);
          if (row) {
            for (const [dbCol, val] of Object.entries(edit)) {
              if (dbCol === '_id') continue;
              // Update using the frontend key name
              const frontendKey = reverseFieldMap[dbCol] || dbCol;
              row[frontendKey] = val;
              // Also update the DB column name variant if present
              row[dbCol] = val;
            }
          }
        }
      }

      appState.originalRecords = JSON.parse(JSON.stringify(appState.records));

      // Invalidate audit cache for all saved records so inline trail re-fetches
      if (typeof invalidateAuditCache === 'function') {
        for (const edit of edits) {
          if (edit._id) invalidateAuditCache(edit._id);
        }
      }

      // Re-fetch current page from server to ensure data consistency (server-side pagination)
      if (typeof serverPagState !== 'undefined' && serverPagState.enabled && typeof serverPageChange === 'function') {
        try {
          await serverPageChange(appState.inputPage);
        } catch (refreshErr) {
          console.warn('[Save] Server re-fetch failed, using local state:', refreshErr);
          window.renderInputTable();
        }
      } else {
        window.renderInputTable();
      }

      // Trigger absent alerts for agents tagged as absent-related tags
      try {
        const absentTags = ['UPL', 'PL', 'ML', 'WO', 'NYO', 'EXIT'];
        for (const edit of edits) {
          const savedTag = edit.tag; // edits use DB column names, tag is 'tag'
          if (savedTag && absentTags.includes(savedTag)) {
            const rec = appState.records.find(r => r._id === edit._id);
            if (rec && typeof notifyAbsentTag === 'function') {
              notifyAbsentTag(rec.agent, rec.ohr, rec.date).catch(() => {});
            }
          }
        }
      } catch (absentErr) {
        console.error('[Absent Alert] Error:', absentErr);
      }
    } else {
      showToast('Save failed: ' + (result.message || 'Unknown error'), 'error');
    }
  } catch (err) {
    showToast('Save failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Yes, Save Changes';
    closeSaveModal();
  }
}

// ===== Dashboard =====

function populateDashboardFilterDropdowns() {
  const records = appState.records;
  const flms = [...new Set(records.map(r => r.flm).filter(Boolean))].sort();
  const pgs = [...new Set(records.map(r => r.actualPlanningGroup).filter(Boolean))].sort();
  const days = DAY_NAMES.slice();

  if (appState.dashMultiSelects.flm) appState.dashMultiSelects.flm.setOptions(flms);
  if (appState.dashMultiSelects.pg) appState.dashMultiSelects.pg.setOptions(pgs);
  if (appState.dashMultiSelects.day) appState.dashMultiSelects.day.setOptions(days);
}

function getFilteredDashboardRecords() {
  let records = appState.records;
  const startDate = document.getElementById('dash-start-date')?.value || '';
  const endDate = document.getElementById('dash-end-date')?.value || '';
  const dms = appState.dashMultiSelects;
  const flmSel = dms.flm ? dms.flm.getSelected() : [];
  const flmNone = dms.flm && dms.flm.noneMode && flmSel.length === 0;
  const pgSel = dms.pg ? dms.pg.getSelected() : [];
  const pgNone = dms.pg && dms.pg.noneMode && pgSel.length === 0;
  const daySel = dms.day ? dms.day.getSelected() : [];
  const dayNone = dms.day && dms.day.noneMode && daySel.length === 0;

  if (flmNone || pgNone || dayNone) return [];

  if (startDate) records = records.filter(r => r.date && r.date >= startDate);
  if (endDate) records = records.filter(r => r.date && r.date <= endDate);
  if (flmSel.length > 0) records = records.filter(r => flmSel.includes(r.flm));
  if (pgSel.length > 0) records = records.filter(r => pgSel.includes(r.actualPlanningGroup));
  if (daySel.length > 0) records = records.filter(r => r.date && daySel.includes(getDayOfWeek(r.date)));

  return records;
}

async function applyDashboardFilters() {
  const startDate = document.getElementById('dash-start-date')?.value || '';
  const endDate = document.getElementById('dash-end-date')?.value || '';

  if (startDate && endDate) {
    await ensureDataForRange(startDate, endDate);
  }

  renderDashboard();
}

function clearDashboardFilters() {
  const today = getTodayStr();
  document.getElementById('dash-start-date').value = today;
  document.getElementById('dash-end-date').value = today;
  Object.values(appState.dashMultiSelects).forEach(ms => ms.reset());
  renderDashboard();
}

function renderDashboard() {
  const records = getFilteredDashboardRecords();
  const kpis = calculateKPIs(records);

  // Update dashboard filtered record count
  const dashRecordCountEl = document.getElementById('dash-record-count');
  if (dashRecordCountEl) dashRecordCountEl.textContent = `Filtered Records: ${records.length}`;

  const shrinkageOk = kpis.shrinkageRate < 5;
  const kpiGrid = document.getElementById('kpi-grid');
  kpiGrid.innerHTML = `
    <div class="kpi-card kpi-shrinkage ${shrinkageOk ? 'kpi-ok' : ''}">
      <div class="kpi-label">Shrinkage Rate</div>
      <div class="kpi-value">${kpis.shrinkageRate.toFixed(2)}%</div>
      <div class="kpi-detail">(PL + UPL) / (P + PL + UPL)</div>
    </div>
    <div class="kpi-card kpi-upl">
      <div class="kpi-label">UPL Count</div>
      <div class="kpi-value">${formatNumber(kpis.uplCount)}</div>
      <div class="kpi-detail">Total UPL tags</div>
    </div>
    <div class="kpi-card kpi-pl">
      <div class="kpi-label">PL Count</div>
      <div class="kpi-value">${formatNumber(kpis.plCount)}</div>
      <div class="kpi-detail">Total PL tags (excl. ML)</div>
    </div>
    <div class="kpi-card kpi-late">
      <div class="kpi-label">Late Count</div>
      <div class="kpi-value">${formatNumber(kpis.lateCount)}</div>
      <div class="kpi-detail">Total LATE tags</div>
    </div>
  `;

  renderShiftBreakdown(records);
  renderFLMBreakdown(records);
  renderAssetInventory(records);
  renderAgentList(records);

  // Trigger dashboard animations (counters, stagger, pulse)
  if (window.dashboardAnimations) {
    setTimeout(function() {
      window.dashboardAnimations.replay();
      window.dashboardAnimations.animateKPIs();
    }, 50);
  }
}

// ===== Shift Breakdown =====

function buildShiftBreakdownHTML(records) {
  const shifts = getShiftBreakdown(records);

  if (Object.keys(shifts).length === 0) {
    return '<div style="text-align:center;color:var(--text-secondary);padding:20px;">No shift data available</div>';
  }

  let html = `<table class="data-table shift-table shift-bordered">
    <tbody>`;

  // Render shifts in defined order: GY Shift first, then Mid-Shift
  const shiftOrder = ['GY Shift', 'Mid-Shift'];
  const grandOverall = { schedule: 0, present: 0, upl: 0, late: 0, pl: 0 };

  for (const shiftName of shiftOrder) {
    const shiftData = shifts[shiftName];
    if (!shiftData) continue;
    const planningGroups = shiftData.planningGroups;
    const overall = shiftData.overall;

    grandOverall.schedule += overall.schedule;
    grandOverall.present += overall.present;
    grandOverall.upl += overall.upl;
    grandOverall.late += overall.late;
    grandOverall.pl += overall.pl;

    // Shift section header with column headers on the same row
    html += `<tr class="shift-section-header">
      <th><strong>${escapeHtml(shiftName)}</strong></th>
      <th style="text-align:center">Schedule</th>
      <th style="text-align:center">Present</th>
      <th style="text-align:center">UPL</th>
      <th style="text-align:center">Shrinkage</th>
      <th style="text-align:center">Late</th>
    </tr>`;

    // Fixed planning groups in defined order
    const pgNames = Object.keys(planningGroups).sort();
    for (const pgName of pgNames) {
      const pg = planningGroups[pgName];
      const shrinkage = (pg.present + pg.pl + pg.upl) > 0 ? ((pg.pl + pg.upl) / (pg.present + pg.pl + pg.upl) * 100) : 0;
      html += `<tr>
        <td style="padding-left:24px;">${escapeHtml(pgName)}</td>
        <td class="cell-center">${pg.schedule}</td>
        <td class="cell-center">${pg.present}</td>
        <td class="cell-center">${pg.upl || ''}</td>
        <td class="cell-center">${shrinkage.toFixed(2)}%</td>
        <td class="cell-center">${pg.late || ''}</td>
      </tr>`;
    }

    const overallShrinkage = (overall.present + overall.pl + overall.upl) > 0 ? ((overall.pl + overall.upl) / (overall.present + overall.pl + overall.upl) * 100) : 0;
    html += `<tr class="shift-overall-row">
      <td><strong>${escapeHtml(shiftName)} Overall</strong></td>
      <td class="cell-center"><strong>${overall.schedule}</strong></td>
      <td class="cell-center"><strong>${overall.present}</strong></td>
      <td class="cell-center"><strong>${overall.upl}</strong></td>
      <td class="cell-center"><strong>${overallShrinkage.toFixed(2)}%</strong></td>
      <td class="cell-center"><strong>${overall.late}</strong></td>
    </tr>`;
  }

  const grandShrinkage = (grandOverall.present + grandOverall.pl + grandOverall.upl) > 0 ? ((grandOverall.pl + grandOverall.upl) / (grandOverall.present + grandOverall.pl + grandOverall.upl) * 100) : 0;
  html += `<tr class="shift-grand-overall-row">
    <td><strong>Overall</strong></td>
    <td class="cell-center"><strong>${grandOverall.schedule}</strong></td>
    <td class="cell-center"><strong>${grandOverall.present}</strong></td>
    <td class="cell-center"><strong>${grandOverall.upl}</strong></td>
    <td class="cell-center"><strong>${grandShrinkage.toFixed(2)}%</strong></td>
    <td class="cell-center"><strong>${grandOverall.late}</strong></td>
  </tr>`;

  html += '</tbody></table>';
  return html;
}

function renderShiftBreakdown(records) {
  const container = document.getElementById('shift-breakdown');
  container.innerHTML = buildShiftBreakdownHTML(records);
}

function expandShiftBreakdown() {
  const records = getFilteredDashboardRecords();
  const overlay = document.getElementById('shift-fullscreen');
  const body = document.getElementById('shift-fullscreen-body');
  body.innerHTML = buildShiftBreakdownHTML(records);
  overlay.style.display = 'flex';
}

function closeShiftFullscreen() {
  document.getElementById('shift-fullscreen').style.display = 'none';
}

// ===== FLM Supervisor Breakdown =====

function renderFLMBreakdown(records) {
  const breakdown = getFLMBreakdown(records);
  const container = document.getElementById('flm-breakdown');

  if (breakdown.length === 0) {
    container.innerHTML = '<div class="mascot-empty-state"><div class="sprite-mascot" role="img" aria-label="No data"></div><div class="empty-title">No data available</div><div class="empty-subtitle">Try adjusting the date range or filters</div></div>';
    return;
  }

  let html = `<table class="data-table flm-bordered">
    <thead>
      <tr>
        <th>SUPERVISOR WISE</th>
        <th style="text-align:center">Shrinkage</th>
        <th style="text-align:center">UPL</th>
        <th style="text-align:center">Late</th>
        <th style="text-align:center">PL</th>
        <th style="text-align:center">OT Hours</th>
      </tr>
    </thead>
    <tbody>`;

  breakdown.forEach(flm => {
    const shrinkColor = flm.shrinkageRate >= 5 ? 'var(--critical)' : 'var(--text)';
    html += `<tr>
      <td style="font-weight:500;">${escapeHtml(flm.name)}</td>
      <td class="cell-center" style="color:${shrinkColor}">${flm.shrinkageRate.toFixed(2)}%</td>
      <td class="cell-center">${flm.upl || ''}</td>
      <td class="cell-center">${flm.late || ''}</td>
      <td class="cell-center">${flm.pl + flm.ml || ''}</td>
      <td class="cell-center">${flm.ot > 0 ? flm.ot.toFixed(1) : ''}</td>
    </tr>`;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

// ===== Shrink Details =====

function buildAgentListHTML(records) {
  const agents = getUPLLateAgentList(records);

  if (agents.length === 0) {
    return '<div style="text-align:center;color:var(--text-secondary);padding:20px;">No UPL or LATE records found</div>';
  }

  let html = `<table class="data-table">
    <thead>
      <tr>
        <th>Tag</th>
        <th>Agent Name</th>
        <th>FLM</th>
        <th>Shift Time</th>
        <th>Planning Group</th>
        <th>Reason</th>
        <th>Remarks</th>
      </tr>
    </thead>
    <tbody>`;

  agents.forEach(a => {
    const tagClass = a.tag === 'LATE' ? 'tag-badge-late' : 'tag-badge-upl';
    html += `<tr>
      <td><span class="tag-badge ${tagClass}">${a.tag}</span></td>
      <td>${escapeHtml(a.agent)}</td>
      <td>${escapeHtml(a.flm)}</td>
      <td>${escapeHtml(a.shiftTime)}</td>
      <td>${escapeHtml(a.planningGroup)}</td>
      <td>${escapeHtml(a.uplReason)}</td>
      <td>${escapeHtml(a.remarks)}</td>
    </tr>`;
  });

  html += '</tbody></table>';
  return html;
}

// ===== Asset Inventory & Endorsement =====
function renderAssetInventory(records) {
  const container = document.getElementById('asset-inventory-widget');
  if (!container) return;
  // Use end date from dashFilterState (omnibar), fall back to today
  const dateFilter = (typeof dashFilterState !== 'undefined' && dashFilterState.filters) ? dashFilterState.filters['date_range'] : null;
  let endDateVal = dateFilter ? dateFilter.endDate : '';
  if (!endDateVal) {
    const el = document.getElementById('dash-end-date') || document.getElementById('dash-date-end');
    endDateVal = el ? el.value : '';
  }
  let dateStr;
  if (endDateVal) {
    const parts = endDateVal.split('-'); // YYYY-MM-DD
    dateStr = `${parseInt(parts[1])}/${parseInt(parts[2])}/${parts[0]}`;
  } else {
    const today = new Date();
    dateStr = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;
  }
  // Group records by shift time and role, count present (P or blank tag)
  // Filtering is handled by dashboard omnibar — no hardcoded exclusions here
  const shiftData = {};
  for (const r of records) {
    const shift = r.shiftTime || 'Unknown';
    const role = r.role || 'Unknown';
    const tag = getEffectiveTag(r.tag);
    if (!shiftData[shift]) shiftData[shift] = {};
    if (!shiftData[shift][role]) shiftData[shift][role] = { present: 0 };
    if (tag === 'P' || tag === 'LATE') shiftData[shift][role].present++;
  }
  // Sort shifts and roles
  const shifts = Object.keys(shiftData).sort();
  if (shifts.length === 0) {
    container.innerHTML = '<div class="mascot-empty-state"><div class="sprite-mascot" role="img" aria-label="No data"></div><div class="empty-title">No data available</div><div class="empty-subtitle">Try adjusting the date range or filters</div></div>';
    return;
  }
  // Role order: Agent first, then SME, then FLM, then others
  const roleOrder = ['Agent', 'Operational SME', 'Quality & Policy Expert', 'Team Lead', 'Trainer'];
  function sortRoles(roles) {
    return roles.sort((a, b) => {
      const ia = roleOrder.indexOf(a) === -1 ? 999 : roleOrder.indexOf(a);
      const ib = roleOrder.indexOf(b) === -1 ? 999 : roleOrder.indexOf(b);
      return ia - ib;
    });
  }
  let html = `<table class="data-table" style="font-size:12px;width:100%;">`;
  html += `<thead><tr style="background:var(--bg-subtle);"><th style="text-align:center;padding:6px;">Date</th><th colspan="3" style="text-align:center;padding:6px;font-weight:700;">${escapeHtml(dateStr)}</th></tr></thead>`;
  html += '<tbody>';
  for (const shift of shifts) {
    const roles = sortRoles(Object.keys(shiftData[shift]));
    // Shift header row
    html += `<tr style="background:var(--primary);color:#fff;"><th style="padding:6px;">Shift Time</th><th colspan="3" style="text-align:center;padding:6px;font-weight:700;">${escapeHtml(shift)}</th></tr>`;
    html += `<tr style="background:var(--bg-subtle);font-weight:600;"><td style="padding:6px;text-align:right;">Role</td><td style="padding:6px;text-align:center;">Present</td><td style="padding:6px;text-align:center;">Chromebook/Mac</td><td style="padding:6px;text-align:center;">Yubikey</td></tr>`;
    for (const role of roles) {
      const d = shiftData[shift][role];
      // Chromebook/Mac and Yubikey columns mirror Present count
      html += `<tr><td style="padding:6px;font-weight:500;text-align:right;">${escapeHtml(role)} |</td><td style="padding:6px;text-align:center;">${d.present}</td><td style="padding:6px;text-align:center;">${d.present}</td><td style="padding:6px;text-align:center;">${d.present}</td></tr>`;
    }
  }
  html += '</tbody></table>';
  container.innerHTML = html;
}

function buildAssetInventoryHTML(records) {
  // Use end date from dashFilterState (omnibar), fall back to today
  const dateFilter = (typeof dashFilterState !== 'undefined' && dashFilterState.filters) ? dashFilterState.filters['date_range'] : null;
  let endDateVal = dateFilter ? dateFilter.endDate : '';
  if (!endDateVal) {
    const el = document.getElementById('dash-end-date') || document.getElementById('dash-date-end');
    endDateVal = el ? el.value : '';
  }
  let dateStr;
  if (endDateVal) {
    const parts = endDateVal.split('-'); // YYYY-MM-DD
    dateStr = `${parseInt(parts[1])}/${parseInt(parts[2])}/${parts[0]}`;
  } else {
    const today = new Date();
    dateStr = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;
  }
  // Filtering is handled by dashboard omnibar — no hardcoded exclusions here
  const shiftData = {};
  for (const r of records) {
    const shift = r.shiftTime || 'Unknown';
    const role = r.role || 'Unknown';
    const tag = getEffectiveTag(r.tag);
    if (!shiftData[shift]) shiftData[shift] = {};
    if (!shiftData[shift][role]) shiftData[shift][role] = { present: 0 };
    if (tag === 'P' || tag === 'LATE') shiftData[shift][role].present++;
  }
  const shifts = Object.keys(shiftData).sort();
  if (shifts.length === 0) return '<div class="mascot-empty-state"><div class="sprite-mascot" role="img" aria-label="No data"></div><div class="empty-title">No data available</div><div class="empty-subtitle">Try adjusting the date range or filters</div></div>';
  const roleOrder = ['Agent', 'Operational SME', 'Quality & Policy Expert', 'Team Lead', 'Trainer'];
  function sortRoles(roles) {
    return roles.sort((a, b) => {
      const ia = roleOrder.indexOf(a) === -1 ? 999 : roleOrder.indexOf(a);
      const ib = roleOrder.indexOf(b) === -1 ? 999 : roleOrder.indexOf(b);
      return ia - ib;
    });
  }
  let html = `<table class="data-table" style="font-size:12px;width:100%;">`;
  html += `<thead><tr style="background:var(--bg-subtle);"><th style="text-align:center;padding:6px;">Date</th><th colspan="3" style="text-align:center;padding:6px;font-weight:700;">${escapeHtml(dateStr)}</th></tr></thead>`;
  html += '<tbody>';
  for (const shift of shifts) {
    const roles = sortRoles(Object.keys(shiftData[shift]));
    html += `<tr style="background:var(--primary);color:#fff;"><th style="padding:6px;">Shift Time</th><th colspan="3" style="text-align:center;padding:6px;font-weight:700;">${escapeHtml(shift)}</th></tr>`;
    html += `<tr style="background:var(--bg-subtle);font-weight:600;"><td style="padding:6px;text-align:right;">Role</td><td style="padding:6px;text-align:center;">Present</td><td style="padding:6px;text-align:center;">Chromebook/Mac</td><td style="padding:6px;text-align:center;">Yubikey</td></tr>`;
    for (const role of roles) {
      const d = shiftData[shift][role];
      html += `<tr><td style="padding:6px;font-weight:500;text-align:right;">${escapeHtml(role)} |</td><td style="padding:6px;text-align:center;">${d.present}</td><td style="padding:6px;text-align:center;">${d.present}</td><td style="padding:6px;text-align:center;">${d.present}</td></tr>`;
    }
  }
  html += '</tbody></table>';
  return html;
}

function expandAssetInventory() {
  const records = getFilteredDashboardRecords();
  const overlay = document.getElementById('asset-fullscreen');
  const body = document.getElementById('asset-fullscreen-body');
  body.innerHTML = buildAssetInventoryHTML(records);
  overlay.style.display = 'flex';
}

function closeAssetFullscreen() {
  document.getElementById('asset-fullscreen').style.display = 'none';
}

function renderAgentList(records) {
  const container = document.getElementById('agent-list');
  container.innerHTML = buildAgentListHTML(records);
}

let shrinkPaginationState = { agents: [], page: 1, perPage: 15 };

function expandShrinkDetails() {
  const records = getFilteredDashboardRecords();
  shrinkPaginationState.agents = getUPLLateAgentList(records);
  shrinkPaginationState.page = 1;
  renderShrinkPage();
  document.getElementById('shrink-fullscreen').style.display = 'flex';
}

function renderShrinkPage() {
  const { agents, page, perPage } = shrinkPaginationState;
  const totalPages = Math.max(1, Math.ceil(agents.length / perPage));
  const start = (page - 1) * perPage;
  const pageAgents = agents.slice(start, start + perPage);

  const body = document.getElementById('shrink-fullscreen-body');
  if (agents.length === 0) {
    body.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:20px;">No UPL or LATE records found</div>';
    var shrinkPagEl = document.getElementById('shrink-pagination');
    if (shrinkPagEl) shrinkPagEl.innerHTML = '';
    return;
  }

  let html = `<table class="data-table">
    <thead>
      <tr>
        <th>Tag</th>
        <th>Agent Name</th>
        <th>FLM</th>
        <th>Shift Time</th>
        <th>Planning Group</th>
        <th>Reason</th>
        <th>Remarks</th>
      </tr>
    </thead>
    <tbody>`;

  pageAgents.forEach(a => {
    const tagClass = a.tag === 'LATE' ? 'tag-badge-late' : 'tag-badge-upl';
    html += `<tr>
      <td><span class="tag-badge ${tagClass}">${a.tag}</span></td>
      <td>${escapeHtml(a.agent)}</td>
      <td>${escapeHtml(a.flm)}</td>
      <td>${escapeHtml(a.shiftTime)}</td>
      <td>${escapeHtml(a.planningGroup)}</td>
      <td>${escapeHtml(a.uplReason)}</td>
      <td>${escapeHtml(a.remarks)}</td>
    </tr>`;
  });

  html += '</tbody></table>';
  body.innerHTML = html;

  // Render pagination
  const pag = document.getElementById('shrink-pagination');
  if (totalPages <= 1) {
    pag.innerHTML = `<span class="pagination-info">Showing ${agents.length} of ${agents.length} records</span>`;
    return;
  }

  let pagHtml = `<button class="pagination-btn" onclick="shrinkGoToPage(${page - 1})" ${page === 1 ? 'disabled' : ''}>&laquo; Prev</button>`;

  for (let i = 1; i <= totalPages; i++) {
    if (totalPages <= 7 || i === 1 || i === totalPages || Math.abs(i - page) <= 1) {
      pagHtml += `<button class="pagination-btn ${i === page ? 'active' : ''}" onclick="shrinkGoToPage(${i})">${i}</button>`;
    } else if (i === 2 && page > 4) {
      pagHtml += '<span class="pagination-info">...</span>';
    } else if (i === totalPages - 1 && page < totalPages - 3) {
      pagHtml += '<span class="pagination-info">...</span>';
    }
  }

  pagHtml += `<button class="pagination-btn" onclick="shrinkGoToPage(${page + 1})" ${page === totalPages ? 'disabled' : ''}>Next &raquo;</button>`;
  pagHtml += `<span class="pagination-info">Page ${page} of ${totalPages} (${agents.length} records)</span>`;
  pag.innerHTML = pagHtml;
}

function shrinkGoToPage(p) {
  const totalPages = Math.max(1, Math.ceil(shrinkPaginationState.agents.length / shrinkPaginationState.perPage));
  if (p < 1 || p > totalPages) return;
  shrinkPaginationState.page = p;
  renderShrinkPage();
  document.getElementById('shrink-fullscreen-body').scrollTop = 0;
}

function closeShrinkFullscreen() {
  document.getElementById('shrink-fullscreen').style.display = 'none';
}

// ===== Alerts Rendering =====

const ALERT_CATEGORIES = [
  { id: 'upl_violation', label: 'UPL Violations', icon: '\u26A0', description: 'Agents with more than 3 UPL (absent) days in a single month. Threshold: >3 UPL per agent per month.', hasMonth: true, hasWeek: false },
  { id: 'ncns_pipeline', label: 'NCNS Pipeline', icon: '\uD83D\uDEA8', description: 'Agents with 4 or more cumulative No Call No Show incidents. Flagged as "RTWO Required" (Ready to Write Off).', hasMonth: false, hasWeek: false },
  { id: 'offboarding_risk', label: 'Offboarding Risk', icon: '\uD83D\uDD34', description: 'Agents with 10+ consecutive UPL days (WO days excluded from count). Critical offboarding risk.', hasMonth: false, hasWeek: false },
  { id: 'weekly_late', label: 'Weekly Late', icon: '\u23F0', description: 'Agents late 3 or more times in a single week ending period. Threshold: >=3 LATE per week.', hasMonth: true, hasWeek: true },
  { id: 'monthly_late', label: 'Monthly Late', icon: '\uD83D\uDCC5', description: 'Agents late 10 or more times in a single month (non-consecutive). Threshold: >=10 LATE per month.', hasMonth: true, hasWeek: false },
  { id: 'active_ml', label: 'Active ML', icon: '\u2139', description: 'Agents on Maternity Leave within the trailing 10-day window, showing WO days for timeline continuity.', hasMonth: false, hasWeek: false },
];

/**
 * Generate all Saturday week-endings for the given year.
 */
function getAllWeekEndings(year) {
  const allWeeks = [];
  const d = new Date(year, 0, 1);
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
  while (d.getFullYear() === year) {
    const we = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    allWeeks.push(we);
    d.setDate(d.getDate() + 7);
  }
  return allWeeks;
}

/**
 * Return week endings whose Sun-Sat span overlaps the given month (0-indexed).
 */
function getWeeksForMonth(allWeeks, monthIdx, year) {
  const monthStart = new Date(year, monthIdx, 1);
  const monthEnd = new Date(year, monthIdx + 1, 0); // last day of month
  return allWeeks.filter(we => {
    const parts = we.split('-');
    const sat = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    const sun = new Date(sat);
    sun.setDate(sat.getDate() - 6);
    // Week overlaps month if week-start <= month-end AND week-end >= month-start
    return sun <= monthEnd && sat >= monthStart;
  });
}

function populateAlertFilterDropdowns() {
  // Preserve current user selection before rebuilding options
  const prevMonth = appState.alertFilters.month;
  const prevWeek = appState.alertFilters.weekEnding;

  // Show ALL months (Jan-Dec) regardless of loaded data
  fillSelect('alert-filter-month', MONTHS.slice(), 'All Months');

  const year = new Date().getFullYear();
  const allWeeks = getAllWeekEndings(year);

  // Filter weeks based on selected month
  const monthEl = document.getElementById('alert-filter-month');
  const weekEl = document.getElementById('alert-filter-week');

  // Restore month selection first
  const targetMonth = prevMonth || getCurrentMonthName();
  if ([...monthEl.options].some(o => o.value === targetMonth)) {
    monthEl.value = targetMonth;
    appState.alertFilters.month = targetMonth;
  } else {
    const currentMonth = getCurrentMonthName();
    if ([...monthEl.options].some(o => o.value === currentMonth)) {
      monthEl.value = currentMonth;
      appState.alertFilters.month = currentMonth;
    }
  }

  // Now populate weeks based on selected month
  const selectedMonth = monthEl.value;
  let weeksToShow = allWeeks;
  if (selectedMonth && selectedMonth !== 'All') {
    const monthIdx = MONTHS.indexOf(selectedMonth);
    if (monthIdx >= 0) {
      weeksToShow = getWeeksForMonth(allWeeks, monthIdx, year);
    }
  }
  fillSelect('alert-filter-week', weeksToShow, 'All Weeks');

  // Restore week selection if it's still in the filtered list, otherwise reset to All
  const targetWeek = prevWeek || getCurrentWeekEnding();
  if (targetWeek && targetWeek !== 'All' && [...weekEl.options].some(o => o.value === targetWeek)) {
    weekEl.value = targetWeek;
    appState.alertFilters.weekEnding = targetWeek;
  } else {
    weekEl.value = 'All';
    appState.alertFilters.weekEnding = 'All';
  }
}

async function applyAlertFilters() {
  const monthEl = document.getElementById('alert-filter-month');
  const weekEl = document.getElementById('alert-filter-week');
  const selectedMonth = monthEl.value;

  // When month changes, rebuild week dropdown to show only overlapping weeks
  const year = new Date().getFullYear();
  const allWeeks = getAllWeekEndings(year);
  const prevWeek = weekEl.value;

  if (selectedMonth && selectedMonth !== 'All') {
    const monthIdx = MONTHS.indexOf(selectedMonth);
    if (monthIdx >= 0) {
      const filteredWeeks = getWeeksForMonth(allWeeks, monthIdx, year);
      fillSelect('alert-filter-week', filteredWeeks, 'All Weeks');
      if (prevWeek && prevWeek !== 'All' && [...weekEl.options].some(o => o.value === prevWeek)) {
        weekEl.value = prevWeek;
      } else {
        weekEl.value = 'All';
      }
    }
  } else {
    fillSelect('alert-filter-week', allWeeks, 'All Weeks');
    if (prevWeek && prevWeek !== 'All' && [...weekEl.options].some(o => o.value === prevWeek)) {
      weekEl.value = prevWeek;
    } else {
      weekEl.value = 'All';
    }
  }

  const selectedWeek = weekEl.value;
  appState.alertFilters.month = selectedMonth;
  appState.alertFilters.weekEnding = selectedWeek;

  // Always compute the full date range to load for the selected month
  let rangeStart = null;
  let rangeEnd = null;

  if (selectedMonth !== 'All') {
    const monthIdx = MONTHS.indexOf(selectedMonth);
    if (monthIdx >= 0) {
      rangeStart = year + '-' + String(monthIdx + 1).padStart(2, '0') + '-01';
      const lastDay = new Date(year, monthIdx + 1, 0).getDate();
      rangeEnd = year + '-' + String(monthIdx + 1).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0');
    }
  }

  // Expand range if a specific week is selected that extends beyond the month
  if (selectedWeek !== 'All') {
    const weParts = selectedWeek.split('-');
    const weDate = new Date(parseInt(weParts[0]), parseInt(weParts[1]) - 1, parseInt(weParts[2]));
    const sunStart = new Date(weDate);
    sunStart.setDate(weDate.getDate() - 6);
    const weekStart = sunStart.getFullYear() + '-' + String(sunStart.getMonth() + 1).padStart(2, '0') + '-' + String(sunStart.getDate()).padStart(2, '0');
    if (!rangeStart || weekStart < rangeStart) rangeStart = weekStart;
    if (!rangeEnd || selectedWeek > rangeEnd) rangeEnd = selectedWeek;
  }

  // Load data for the range, then render AFTER data is available
  if (rangeStart && rangeEnd) {
    try {
      await ensureDataForRange(rangeStart, rangeEnd);
    } catch (err) {
      console.error('Failed to load alert data:', err);
    }

    // Sync date range to Dashboard and Input Portal (null-safe)
    const dashStartEl = document.getElementById('dash-start-date');
    const dashEndEl = document.getElementById('dash-end-date');
    if (dashStartEl) dashStartEl.value = rangeStart;
    if (dashEndEl) dashEndEl.value = rangeEnd;
    const inputStartEl = document.getElementById('input-filter-start-date');
    const inputEndEl = document.getElementById('input-filter-end-date');
    if (inputStartEl) inputStartEl.value = rangeStart;
    if (inputEndEl) inputEndEl.value = rangeEnd;
    if (typeof omnibarState !== 'undefined' && Array.isArray(omnibarState.filters)) {
      omnibarState.filters = omnibarState.filters.filter(f => f.key !== 'date_range');
      omnibarState.filters.unshift({ key: 'date_range', label: 'Date Range', type: 'date_range', startDate: rangeStart, endDate: rangeEnd });
      if (typeof renderOmnibarChips === 'function') renderOmnibarChips();
    }
  }

  // Render AFTER data has been loaded (await above ensures this)
  renderAlerts();
  updateAlertNavBadge();
}

function switchAlertCategory(cat) {
  appState.alertCategory = cat;
  renderAlerts();
}

function renderAlerts() {
  const allAlerts = getAllAlerts(appState.records);
  const monthFilter = appState.alertFilters.month;
  const weekFilter = appState.alertFilters.weekEnding;

  // Role-based filtering: Team Lead sees only their agents, Manager sees their planning group
  const role = typeof currentUser !== 'undefined' ? currentUser?.actual_role : '';
  const userOhr = typeof currentUser !== 'undefined' ? currentUser?.ohr_id : '';
  const isAdmin = userOhr === '740045023';

  function filterAlertsByRole(alerts) {
    if (isAdmin || role === 'Trainer') return alerts; // Admin and Trainer see all
    if (role === 'Team Lead') {
      // Team Lead sees only alerts for agents they supervise
      const myAgents = appState.records
        .filter(r => r.flm === (typeof currentUser !== 'undefined' ? currentUser.full_name : ''))
        .map(r => r.agent);
      const myAgentSet = new Set(myAgents);
      return alerts.filter(a => myAgentSet.has(a.agent));
    }
    if (role === 'Manager') {
      // Manager sees alerts for agents in their planning group
      const myPG = typeof currentUser !== 'undefined' ? currentUser.complete_planning_group : '';
      if (!myPG) return alerts;
      const pgList = myPG.split(',').map(s => s.trim().toLowerCase());
      const pgAgents = appState.records
        .filter(r => {
          const rPG = (r.planningGroup || '').toLowerCase();
          return pgList.some(pg => rPG.includes(pg));
        })
        .map(r => r.agent);
      const pgAgentSet = new Set(pgAgents);
      return alerts.filter(a => pgAgentSet.has(a.agent));
    }
    return alerts; // Other roles see all (shouldn't normally access this page)
  }

  const tabsContainer = document.getElementById('alert-tabs');
  tabsContainer.innerHTML = ALERT_CATEGORIES.map(cat => {
    let catAlerts = filterAlertsByRole(allAlerts[cat.id]);
    if (cat.hasMonth && monthFilter !== 'All') {
      catAlerts = catAlerts.filter(a => a.month === monthFilter);
    }
    if (cat.hasWeek && weekFilter !== 'All') {
      catAlerts = catAlerts.filter(a => a.weekEnding === weekFilter);
    }
    const count = catAlerts.length;
    const isActive = appState.alertCategory === cat.id;
    return `<button class="alert-tab ${isActive ? 'active' : ''}" onclick="switchAlertCategory('${cat.id}')">
      <span class="alert-tab-icon">${cat.icon}</span>
      <span class="alert-tab-label">${cat.label}</span>
      <span class="alert-tab-count">${count}</span>
    </button>`;
  }).join('');

  const currentCat = ALERT_CATEGORIES.find(c => c.id === appState.alertCategory);
  var alertDescEl = document.getElementById('alert-description');
  if (alertDescEl) alertDescEl.innerHTML =
    `<div class="alert-desc-text">${currentCat.description}</div>`;

  let alerts = filterAlertsByRole(allAlerts[appState.alertCategory]);
  if (currentCat.hasMonth && monthFilter !== 'All') {
    alerts = alerts.filter(a => a.month === monthFilter);
  }
  if (currentCat.hasWeek && weekFilter !== 'All') {
    alerts = alerts.filter(a => a.weekEnding === weekFilter);
  }

  const listContainer = document.getElementById('alert-list');
  if (alerts.length === 0) {
    listContainer.innerHTML = `<div class="alert-empty">
      <div class="alert-empty-icon">&#10003;</div>
      <div class="alert-empty-text">No alerts in this category</div>
    </div>`;
    return;
  }

  listContainer.innerHTML = alerts.map(alert => {
    const severityClass = `severity-${alert.severity}`;
    // Metadata: supervisor + dates for all alert categories
    let extraHtml = '';
    if (alert.supervisor) {
      extraHtml += `<div class="alert-card-meta"><span class="alert-meta-label">Supervisor:</span> ${escapeHtml(alert.supervisor)}</div>`;
    }
    // UPL Violations use uplDates, all others use metaDates
    const dates = alert.uplDates || alert.metaDates;
    const datesLabel = alert.metaDatesLabel || 'Dates';
    if (dates && dates.length > 0) {
      extraHtml += `<div class="alert-card-meta"><span class="alert-meta-label">${escapeHtml(datesLabel)}:</span> ${dates.map(d => escapeHtml(d)).join(', ')}</div>`;
    }
    return `<div class="alert-card ${severityClass}">
      <div class="alert-card-header">
        <span class="alert-severity-badge ${severityClass}">${alert.severity.toUpperCase()}</span>
        <span class="alert-agent">${escapeHtml(alert.agent)}</span>
      </div>
      <div class="alert-card-title">${escapeHtml(alert.title)}</div>
      <div class="alert-card-detail">${escapeHtml(alert.detail)}</div>
      ${extraHtml}
    </div>`;
  }).join('');
}

// ===== Export CSV =====

function showExportProgress(message) {
  let container = document.getElementById('export-progress-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'export-progress-container';
    container.className = 'export-progress-container';
    document.body.appendChild(container);
  }
  container.innerHTML = `
    <div class="export-progress-message">${escapeHtml(message || 'Exporting CSV...')}</div>
    <div class="export-progress-track">
      <div class="export-progress-fill" id="export-progress-fill" style="width:0%"></div>
    </div>
    <div class="export-progress-text" id="export-progress-text">Preparing...</div>
  `;
  container.style.display = 'flex';
}

function updateExportProgress(pct, text) {
  const fill = document.getElementById('export-progress-fill');
  const textEl = document.getElementById('export-progress-text');
  if (fill) fill.style.width = pct + '%';
  if (textEl) textEl.textContent = text || (pct + '%');
}

function hideExportProgress() {
  const container = document.getElementById('export-progress-container');
  if (container) container.style.display = 'none';
}

async function handleExportCSV() {
  const btn = document.getElementById('export-csv-btn');
  btn.classList.add('exporting');
  showExportProgress('Exporting CSV...');

  try {
    // Get filtered records based on current filters
    const filteredItems = getFilteredInputRecords();
    const totalRecords = filteredItems.length;

    if (totalRecords === 0) {
      hideExportProgress();
      btn.classList.remove('exporting');
      showToast('No records to export', 'info');
      return;
    }

    updateExportProgress(10, `Processing ${formatNumber(totalRecords)} records...`);

    // Build CSV header from TABLE_COLUMNS
    const headers = TABLE_COLUMNS.map(col => col.label);
    let csvContent = headers.map(h => '"' + h.replace(/"/g, '""') + '"').join(',') + '\n';

    // Build CSV rows in chunks for progress feedback
    const chunkSize = 500;
    for (let i = 0; i < totalRecords; i += chunkSize) {
      const chunk = filteredItems.slice(i, i + chunkSize);
      for (const item of chunk) {
        const record = item.record;
        const row = TABLE_COLUMNS.map(col => {
          let val = record[col.key] || '';
          if (col.key === 'date') val = formatDateDisplay(val);
          return '"' + String(val).replace(/"/g, '""') + '"';
        });
        csvContent += row.join(',') + '\n';
      }
      const pct = Math.min(90, 10 + Math.round((i + chunk.length) / totalRecords * 80));
      updateExportProgress(pct, `${formatNumber(Math.min(i + chunkSize, totalRecords))} / ${formatNumber(totalRecords)} records`);
      // Yield to UI thread
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    updateExportProgress(95, 'Generating file...');

    // Create and download the CSV file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const today = getTodayStr();
    link.href = url;
    link.download = `playbook_export_${today}.csv`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    updateExportProgress(100, 'Complete!');
    await new Promise(resolve => setTimeout(resolve, 500));

    showToast(`Exported ${formatNumber(totalRecords)} records to CSV`, 'success');
  } catch (err) {
    showToast('Export failed: ' + err.message, 'error');
  } finally {
    hideExportProgress();
    btn.classList.remove('exporting');
  }
}

// ===== Utility =====

function toggleNavGroup(groupId) {
  const group = document.getElementById('nav-group-' + groupId);
  if (group) group.classList.toggle('expanded');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
