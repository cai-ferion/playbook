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
      employement_status: emp.employement_status
    };

    sessionStorage.setItem('playbook_user', JSON.stringify(currentUser));

    document.getElementById('auth-page').style.display = 'none';
    document.getElementById('app-container').style.display = 'flex';

    const ADMIN_OHR = '740045023';

    // Show Admin Tools nav only for admin OHR
    const adminNav = document.getElementById('nav-admin');
    if (adminNav) adminNav.style.display = (currentUser.ohr_id === ADMIN_OHR) ? '' : 'none';

    // Hide entire Anchor group from Agents
    const anchorGroupEl = document.getElementById('nav-group-anchor');
    if (anchorGroupEl) {
      if (currentUser.actual_role === 'Agent' && currentUser.ohr_id !== ADMIN_OHR) {
        anchorGroupEl.style.display = 'none';
      } else {
        anchorGroupEl.style.display = '';
      }
    }

    // Show Risk Intelligence nav only for Team Lead, Manager, Trainer
    const alertsNav = document.getElementById('nav-alerts');
    const allowedRoles = ['Team Lead', 'Manager', 'Trainer'];
    if (alertsNav) alertsNav.style.display = allowedRoles.includes(currentUser.actual_role) || currentUser.ohr_id === ADMIN_OHR ? '' : 'none';

    // Show Billing Compliance nav for Team Lead and Manager only
    const billingNav = document.getElementById('nav-billing');
    if (billingNav) billingNav.style.display = (['Team Lead', 'Manager'].includes(currentUser.actual_role) || currentUser.ohr_id === ADMIN_OHR) ? '' : 'none';

    // Compass, Sandbox, Haven, Horizon — visible ONLY to admin OHR (under development)
    ['nav-group-compass', 'nav-group-sandbox', 'nav-group-haven', 'nav-group-horizon'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = (currentUser.ohr_id === ADMIN_OHR) ? '' : 'none';
    });

    // Helm — visible to all except Agents
    const helmNav = document.getElementById('nav-group-helm');
    if (helmNav) helmNav.style.display = (currentUser.actual_role === 'Agent' && currentUser.ohr_id !== ADMIN_OHR) ? 'none' : '';

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
    // Auto-expand Anchor nav group
    const anchorGroup = document.getElementById('nav-group-anchor');
    if (anchorGroup) anchorGroup.classList.add('expanded');
    // Route to Dashboard for non-Agents, Compass for Agents (all Anchor pages hidden from Agents)
    if (currentUser.actual_role === 'Agent' && currentUser.ohr_id !== ADMIN_OHR) {
      switchView('input');
    } else {
      switchView('dashboard');
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

      // Hide entire Anchor group from Agents
      const anchorGroupEl2 = document.getElementById('nav-group-anchor');
      if (anchorGroupEl2) {
        if (currentUser.actual_role === 'Agent' && currentUser.ohr_id !== ADMIN_OHR2) {
          anchorGroupEl2.style.display = 'none';
        } else {
          anchorGroupEl2.style.display = '';
        }
      }

      // Show Risk Intelligence nav only for Team Lead, Manager, Trainer
      const alertsNav2 = document.getElementById('nav-alerts');
      const allowedRoles2 = ['Team Lead', 'Manager', 'Trainer'];
      if (alertsNav2) alertsNav2.style.display = allowedRoles2.includes(currentUser.actual_role) || currentUser.ohr_id === ADMIN_OHR2 ? '' : 'none';

      // Show Billing Compliance nav for Team Lead and Manager only
      const billingNav2 = document.getElementById('nav-billing');
      if (billingNav2) billingNav2.style.display = (['Team Lead', 'Manager'].includes(currentUser.actual_role) || currentUser.ohr_id === ADMIN_OHR2) ? '' : 'none';

      // Compass, Sandbox, Haven, Horizon — visible ONLY to admin OHR (under development)
      ['nav-group-compass', 'nav-group-sandbox', 'nav-group-haven', 'nav-group-horizon'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = (currentUser.ohr_id === ADMIN_OHR2) ? '' : 'none';
      });

      // Helm — visible to all except Agents
      const helmNav2 = document.getElementById('nav-group-helm');
      if (helmNav2) helmNav2.style.display = (currentUser.actual_role === 'Agent' && currentUser.ohr_id !== ADMIN_OHR2) ? 'none' : '';

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
      // Auto-expand Anchor nav group
      const anchorGroup2 = document.getElementById('nav-group-anchor');
      if (anchorGroup2) anchorGroup2.classList.add('expanded');
      // Route to Dashboard for non-Agents, Compass for Agents (all Anchor pages hidden from Agents)
      if (currentUser.actual_role === 'Agent' && currentUser.ohr_id !== ADMIN_OHR2) {
        switchView('input');
      } else {
        switchView('dashboard');
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
    showProgressBar('Loading employees...');
    await loadEmployeeLookup();

    // Load only today's data for fast initial load
    const today = getTodayStr();
    updateProgressBar(0, 0, 'Loading Data...');

    const records = await fetchRecordsForRange(today, today, (loaded, total) => {
      updateProgressBar(loaded, total, 'Loading Data...');
    });

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
        shiftTime: r.shiftTime, status: r.status, billingCode: r.billingCode
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
    document.getElementById('header-meta').textContent = 'Last refreshed: \u2014';
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
  document.getElementById('header-meta').textContent = text;
}

// ===== View Switching =====

async function switchView(view) {
  appState.activeView = view;

  const allViews = ['input', 'dashboard', 'alerts', 'admin', 'billing', 'compass-input', 'compass-disputes', 'sandbox-input', 'sandbox-review', 'sandbox-analytics', 'haven-input', 'haven-review', 'haven-final', 'helm-board', 'helm-analytics', 'regimen', 'performance', 'productivity-hrs'];
  allViews.forEach(v => {
    const el = document.getElementById('view-' + v);
    if (el) el.classList.toggle('view-hidden', v !== view);
  });

  // Highlight active nav item (handle collapsible group children too)
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });

  // Auto-expand collapsible group if a child view is selected
  const anchorViews = ['input', 'dashboard', 'billing', 'alerts'];
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
    admin: 'Admin Tools', billing: 'Billing Compliance',
    'compass-input': 'Coaching Profile', 'compass-disputes': 'Disputes Area',
    'sandbox-input': 'Input Portal', 'sandbox-review': 'Review Area', 'sandbox-analytics': 'Analytics',
    'haven-input': 'Input Portal', 'haven-review': 'Review Area', 'haven-final': 'Final Review Area',
    'helm-board': 'Task Board', 'helm-analytics': 'Analytics',
    regimen: 'Regimen',
    performance: 'Main Metrics', 'productivity-hrs': 'Productivity Hrs.',
  };
  document.getElementById('view-title').textContent = titles[view] || view;

  // Show Export CSV button only on Input Portal
  const exportBtn = document.getElementById('export-csv-btn');
  if (exportBtn) exportBtn.style.display = view === 'input' ? '' : 'none';

  // Show "Last refreshed" only on Input Portal
  const headerMeta = document.getElementById('header-meta');
  if (headerMeta) headerMeta.style.display = view === 'input' ? '' : 'none';

  if (view === 'input') renderInputTable();
  if (view === 'dashboard') renderDashboard();
  if (view === 'alerts') loadAllDataForAlerts();
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
}

/**
 * Load all data for Risk Alerts if not already loaded.
 */
async function loadAllDataForAlerts() {
  // Risk alerts use only the currently loaded date range
  // Data will be loaded on-demand when user changes date filters
  renderAlerts();
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

function updateAllViews() {
  updateRefreshDisplay();
  populateInputFilterDropdowns();
  populateDashboardFilterDropdowns();
  populateAlertFilterDropdowns();

  const alerts = getAllAlerts(appState.records);
  const totalAlerts = getTotalAlertCount(alerts);
  document.getElementById('alert-nav-count').textContent = totalAlerts;

  if (appState.activeView === 'input') renderInputTable();
  if (appState.activeView === 'dashboard') renderDashboard();
  if (appState.activeView === 'alerts') renderAlerts();
}

// ===== Input Portal Filter Dropdowns (Multi-Select) =====

function populateInputFilterDropdowns() {
  const records = appState.records;
  const tags = [...new Set(records.map(r => r.tag).filter(Boolean))].sort();
  const billingCodes = [...new Set(records.map(r => r.billingCode).filter(Boolean))].sort();
  const agents = [...new Set(records.map(r => r.agent).filter(Boolean))].sort();
  const flms = [...new Set(records.map(r => r.flm).filter(Boolean))].sort();
  const roles = [...new Set(records.map(r => r.role).filter(Boolean))].sort();
  const pgs = [...new Set(records.map(r => r.actualPlanningGroup).filter(Boolean))].sort();
  const shifts = [...new Set(records.map(r => r.shiftTime).filter(Boolean))].sort();
  const statuses = [...new Set(records.map(r => r.status).filter(Boolean))].sort();

  if (appState.multiSelects.tag) appState.multiSelects.tag.setOptions(tags);
  if (appState.multiSelects.billing) appState.multiSelects.billing.setOptions(billingCodes);
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
  renderInputTable();
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
  renderInputTable();
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
  renderInputTable();
}

function getFilteredInputRecords() {
  let result = [];
  const records = appState.records;

  const ms = appState.multiSelects;
  const tagSel = ms.tag ? ms.tag.getSelected() : [];
  const tagNone = ms.tag && ms.tag.noneMode && tagSel.length === 0;
  const billingSel = ms.billing ? ms.billing.getSelected() : [];
  const billingNone = ms.billing && ms.billing.noneMode && billingSel.length === 0;
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
    if (billingSel.length > 0 && !billingSel.includes(r.billingCode)) continue;
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
  appState.inputPage = page;
  renderInputTable();
}

function renderInputTable() {
  const allFiltered = getFilteredInputRecords();

  const totalRecords = allFiltered.length;
  const pageSize = appState.inputPageSize;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const page = Math.min(appState.inputPage, totalPages - 1);
  const start = page * pageSize;
  const pageItems = allFiltered.slice(start, start + pageSize);

  document.getElementById('input-record-count').textContent = `Filtered Records: ${formatNumber(totalRecords)}`;

  const editCount = Object.keys(appState.pendingEdits).length;
  const editCountEl = document.getElementById('input-edit-count');
  if (editCount > 0) {
    editCountEl.textContent = `${editCount} record(s) edited`;
    editCountEl.style.display = 'inline';
    document.getElementById('save-btn').disabled = false;
    document.getElementById('undo-btn').disabled = false;
  } else {
    editCountEl.style.display = 'none';
    document.getElementById('save-btn').disabled = true;
    document.getElementById('undo-btn').disabled = true;
  }

  if (totalRecords > 0) {
    document.getElementById('input-record-info').textContent =
      `Showing ${start + 1}\u2013${Math.min(start + pageSize, totalRecords)} of ${formatNumber(totalRecords)}`;
  } else {
    document.getElementById('input-record-info').textContent = 'No records';
  }

  // Table header with column width classes
  const thead = document.getElementById('input-table-head');
  thead.innerHTML = '<tr>' + TABLE_COLUMNS.map(col => {
    const isEditable = col.editable;
    const widthClass = getColumnWidthClass(col.key);
    return `<th class="${isEditable ? 'th-editable' : ''} ${widthClass}">${col.label}${isEditable ? ' <span class="edit-indicator">&#9998;</span>' : ''}</th>`;
  }).join('') + '</tr>';

  // Table body
  const tbody = document.getElementById('input-table-body');
  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${TABLE_COLUMNS.length}" style="text-align:center;padding:40px;color:var(--text-secondary);">No records found</td></tr>`;
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
            ${TAG_OPTIONS.map(t => `<option value="${t}" ${val === t ? 'selected' : ''}>${t}</option>`).join('')}
            ${!val ? '<option value="" selected>&mdash;</option>' : ''}
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

  // Initialize billing code edit section
  initBillingCodeEdit();
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
    billingCode: 'col-billing',
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
  // Exempt admin OHR 740045023 and Managers
  if (currentUser && (currentUser.ohr_id === '740045023' || currentUser.actual_role === 'Manager')) {
    return false;
  }

  const now = new Date();
  // Convert to Philippine Time (UTC+8)
  const phtOffset = 8 * 60; // minutes
  const phtTime = new Date(now.getTime() + phtOffset * 60000);
  const phtHour = phtTime.getUTCHours();
  const todayPHT = phtTime.getUTCFullYear() + '-' + String(phtTime.getUTCMonth() + 1).padStart(2, '0') + '-' + String(phtTime.getUTCDate()).padStart(2, '0');

  if (!record.date) return true;

  // Past dates are always locked
  if (record.date < todayPHT) {
    return true;
  }

  // Current date: editable before 11:00 AM PHT, locked after
  if (record.date === todayPHT) {
    return phtHour >= 11; // locked if 11 AM or later
  }

  // Future dates are not locked
  return false;
}

// ===== Billing Code Edit Functions =====

let bcEditPendingChanges = {}; // ohr -> { newCode, records: [indices] }

function initBillingCodeEdit() {
  const section = document.getElementById('billing-code-edit-section');
  if (!section) return;

  // Show only for Team Lead, Manager, admin, and Joshua Masacote
  const allowed = currentUser && (
    currentUser.actual_role === 'Team Lead' ||
    currentUser.actual_role === 'Manager' ||
    currentUser.ohr_id === '740045023' ||
    currentUser.ohr_id === '740044909'
  );
  section.style.display = allowed ? 'block' : 'none';

  if (!allowed) return;

  // Populate agent dropdown from current filtered records
  const agentSelect = document.getElementById('bc-edit-agent');
  const agents = [...new Set(appState.records.map(r => r.agent).filter(Boolean))].sort();
  agentSelect.innerHTML = '<option value="">\u2014 Select Agent \u2014</option>';
  for (const agent of agents) {
    const opt = document.createElement('option');
    opt.value = agent;
    opt.textContent = agent;
    agentSelect.appendChild(opt);
  }

  // Populate billing code dropdown
  const codeSelect = document.getElementById('bc-edit-new-code');
  const allCodes = [...new Set(appState.records.map(r => r.billingCode).filter(Boolean))].sort();
  codeSelect.innerHTML = '<option value="">\u2014 Select \u2014</option>';
  for (const code of allCodes) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = code;
    codeSelect.appendChild(opt);
  }

  document.getElementById('bc-edit-current').textContent = '\u2014';
  bcEditPendingChanges = {};
}

function onBcEditAgentChange() {
  const agentName = document.getElementById('bc-edit-agent').value;
  const currentEl = document.getElementById('bc-edit-current');
  const codeSelect = document.getElementById('bc-edit-new-code');

  if (!agentName) {
    currentEl.textContent = '\u2014';
    // Reset dropdown to all codes
    const allCodes = [...new Set(appState.records.map(r => r.billingCode).filter(Boolean))].sort();
    codeSelect.innerHTML = '<option value="">\u2014 Select \u2014</option>';
    for (const code of allCodes) {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = code;
      codeSelect.appendChild(opt);
    }
    return;
  }

  // Find the current billing code(s) for this agent
  const agentRecords = appState.records.filter(r => r.agent === agentName);
  const currentCodes = [...new Set(agentRecords.map(r => r.billingCode).filter(Boolean))];
  currentEl.textContent = currentCodes.length > 0 ? currentCodes.join(', ') : '(none)';

  // Rebuild New Code dropdown excluding the agent's current code(s)
  const allCodes = [...new Set(appState.records.map(r => r.billingCode).filter(Boolean))].sort();
  const filteredCodes = allCodes.filter(c => !currentCodes.includes(c));
  codeSelect.innerHTML = '<option value="">\u2014 Select \u2014</option>';
  for (const code of filteredCodes) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = code;
    codeSelect.appendChild(opt);
  }
}

function applyBillingCodeEditToPending() {
  const agentName = document.getElementById('bc-edit-agent').value;
  const newCode = document.getElementById('bc-edit-new-code').value;
  const startDate = document.getElementById('bc-edit-start-date')?.value || '';
  const endDate = document.getElementById('bc-edit-end-date')?.value || '';

  if (!agentName || !newCode) {
    showToast('Please select an agent and a new billing code.', 'info');
    return;
  }
  if (!startDate || !endDate) {
    showToast('Please select both a start date and end date.', 'info');
    return;
  }
  if (startDate > endDate) {
    showToast('Start date cannot be after end date.', 'info');
    return;
  }

  // Find records for this agent within the date range and mark billing code changes as pending edits
  let count = 0;
  for (let i = 0; i < appState.records.length; i++) {
    const r = appState.records[i];
    if (r.agent === agentName && r.date >= startDate && r.date <= endDate && r.billingCode !== newCode) {
      r.billingCode = newCode;
      if (!appState.pendingEdits[i]) appState.pendingEdits[i] = {};
      appState.pendingEdits[i].billingCode = newCode;
      count++;
    }
  }

  if (count > 0) {
    showToast(`Billing code changed to "${newCode}" for ${count} record(s) of ${agentName} (${startDate} to ${endDate}). Click Save Changes to persist.`, 'success');
    renderInputTable();
    const oldCode = document.getElementById('bc-edit-current')?.textContent || '';
    if (typeof notifyBillingCodeChange === 'function') {
      notifyBillingCodeChange(agentName, oldCode, newCode, count).catch(() => {});
    }
  } else {
    showToast('No records needed updating in the specified date range.', 'info');
  }
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

    const editCount = Object.keys(appState.pendingEdits).length;
    const editCountEl = document.getElementById('input-edit-count');
    editCountEl.textContent = `${editCount} record(s) edited`;
    editCountEl.style.display = 'inline';
    document.getElementById('save-btn').disabled = false;
    document.getElementById('undo-btn').disabled = false;

    if (key === 'tag') {
      renderInputTable();
    }
  }
}

// ===== Undo All Changes =====

function handleUndoAll() {
  if (Object.keys(appState.pendingEdits).length === 0) return;
  appState.records = JSON.parse(JSON.stringify(appState.originalRecords));
  appState.pendingEdits = {};
  renderInputTable();
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
  // Auto-apply billing code edit if fields are filled
  const bcAgent = document.getElementById('bc-edit-agent')?.value;
  const bcNewCode = document.getElementById('bc-edit-new-code')?.value;
  const bcStartDate = document.getElementById('bc-edit-start-date')?.value;
  const bcEndDate = document.getElementById('bc-edit-end-date')?.value;
  if (bcAgent && bcNewCode && bcStartDate && bcEndDate) {
    applyBillingCodeEditToPending();
  }
  const btn = document.getElementById('save-confirm-btn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const edits = [];
    for (const [idx, changes] of Object.entries(appState.pendingEdits)) {
      const record = appState.records[parseInt(idx)];
      const edit = { _id: record._id || '' };
      const fieldMap = { tag: 'tag', uplReason: 'upl_reason', remarks: 'remarks', ot: 'ot_hours', billingCode: 'billing_code' };
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
      appState.originalRecords = JSON.parse(JSON.stringify(appState.records));
      renderInputTable();
      // Notification trigger for record save
      const dateFilter = document.getElementById('input-date')?.value || '';
      notifyRecordSave(edits.length, dateFilter).catch(() => {});

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
      <div class="kpi-detail">UPL / (P + LATE + UPL)</div>
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
  renderAgentList(records);
}

// ===== Shift Breakdown =====

function buildShiftBreakdownHTML(records) {
  const shifts = getShiftBreakdown(records);

  if (Object.keys(shifts).length === 0) {
    return '<div style="text-align:center;color:var(--text-secondary);padding:20px;">No shift data available</div>';
  }

  let html = `<table class="data-table shift-table shift-bordered">
    <thead>
      <tr>
        <th>Shift / Workflow</th>
        <th style="text-align:center">Schedule</th>
        <th style="text-align:center">Present</th>
        <th style="text-align:center">UPL</th>
        <th style="text-align:center">Shrinkage</th>
        <th style="text-align:center">Late</th>
      </tr>
    </thead>
    <tbody>`;

  const shiftNames = Object.keys(shifts).sort();
  const grandOverall = { schedule: 0, present: 0, upl: 0, late: 0 };

  for (const shiftName of shiftNames) {
    const shiftData = shifts[shiftName];
    const workflows = shiftData.workflows;
    const overall = shiftData.overall;

    grandOverall.schedule += overall.schedule;
    grandOverall.present += overall.present;
    grandOverall.upl += overall.upl;
    grandOverall.late += overall.late;

    html += `<tr class="shift-section-header">
      <td colspan="6"><strong>${escapeHtml(shiftName)}</strong></td>
    </tr>`;

    const wfNames = Object.keys(workflows).sort();
    for (const wfName of wfNames) {
      const wf = workflows[wfName];
      const shrinkage = (wf.present + wf.late + wf.upl) > 0 ? (wf.upl / (wf.present + wf.late + wf.upl) * 100) : 0;
      html += `<tr>
        <td style="padding-left:24px;">${escapeHtml(wfName)}</td>
        <td class="cell-center">${wf.schedule}</td>
        <td class="cell-center">${wf.present}</td>
        <td class="cell-center">${wf.upl || ''}</td>
        <td class="cell-center">${shrinkage.toFixed(2)}%</td>
        <td class="cell-center">${wf.late || ''}</td>
      </tr>`;
    }

    const overallShrinkage = (overall.present + overall.late + overall.upl) > 0 ? (overall.upl / (overall.present + overall.late + overall.upl) * 100) : 0;
    html += `<tr class="shift-overall-row">
      <td><strong>${escapeHtml(shiftName)} Overall</strong></td>
      <td class="cell-center"><strong>${overall.schedule}</strong></td>
      <td class="cell-center"><strong>${overall.present}</strong></td>
      <td class="cell-center"><strong>${overall.upl}</strong></td>
      <td class="cell-center"><strong>${overallShrinkage.toFixed(2)}%</strong></td>
      <td class="cell-center"><strong>${overall.late}</strong></td>
    </tr>`;
  }

  const grandShrinkage = (grandOverall.present + grandOverall.late + grandOverall.upl) > 0 ? (grandOverall.upl / (grandOverall.present + grandOverall.late + grandOverall.upl) * 100) : 0;
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
    container.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:20px;">No data available</div>';
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
    document.getElementById('shrink-pagination').innerHTML = '';
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

function populateAlertFilterDropdowns() {
  // Show ALL months (Jan-Dec) regardless of loaded data
  fillSelect('alert-filter-month', MONTHS.slice(), 'All Months');

  // Generate all week endings (Saturdays) for the current year to match getWeekEnding()
  const year = new Date().getFullYear();
  const allWeeks = [];
  const d = new Date(year, 0, 1);
  // Find first Saturday (day 6)
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
  while (d.getFullYear() === year) {
    const we = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    allWeeks.push(we);
    d.setDate(d.getDate() + 7);
  }
  fillSelect('alert-filter-week', allWeeks, 'All Weeks');

  const currentMonth = getCurrentMonthName();
  const currentWE = getCurrentWeekEnding();

  const monthEl = document.getElementById('alert-filter-month');
  if ([...monthEl.options].some(o => o.value === currentMonth)) {
    monthEl.value = currentMonth;
    appState.alertFilters.month = currentMonth;
  }

  const weekEl = document.getElementById('alert-filter-week');
  if ([...weekEl.options].some(o => o.value === currentWE)) {
    weekEl.value = currentWE;
    appState.alertFilters.weekEnding = currentWE;
  }
}

async function applyAlertFilters() {
  const selectedMonth = document.getElementById('alert-filter-month').value;
  const selectedWeek = document.getElementById('alert-filter-week').value;
  appState.alertFilters.month = selectedMonth;
  appState.alertFilters.weekEnding = selectedWeek;

  // Determine the date range for the selected month/week and load data if needed
  let rangeStart = null;
  let rangeEnd = null;
  const year = new Date().getFullYear();

  if (selectedMonth !== 'All') {
    const monthIdx = MONTHS.indexOf(selectedMonth);
    if (monthIdx >= 0) {
      rangeStart = year + '-' + String(monthIdx + 1).padStart(2, '0') + '-01';
      const lastDay = new Date(year, monthIdx + 1, 0).getDate();
      rangeEnd = year + '-' + String(monthIdx + 1).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0');
    }
  }

  if (selectedWeek !== 'All') {
    // Week ending is Saturday; week starts on Sunday (6 days before)
    const weParts = selectedWeek.split('-');
    const weDate = new Date(parseInt(weParts[0]), parseInt(weParts[1]) - 1, parseInt(weParts[2]));
    const sunStart = new Date(weDate);
    sunStart.setDate(weDate.getDate() - 6);
    const weekStart = sunStart.getFullYear() + '-' + String(sunStart.getMonth() + 1).padStart(2, '0') + '-' + String(sunStart.getDate()).padStart(2, '0');
    if (!rangeStart || weekStart < rangeStart) rangeStart = weekStart;
    if (!rangeEnd || selectedWeek > rangeEnd) rangeEnd = selectedWeek;
  }

  if (rangeStart && rangeEnd) {
    // Load data for this range if not already loaded
    await ensureDataForRange(rangeStart, rangeEnd);

    // Sync date range to Dashboard and Input Portal
    document.getElementById('dash-start-date').value = rangeStart;
    document.getElementById('dash-end-date').value = rangeEnd;
    const inputStartEl = document.getElementById('input-filter-start-date');
    const inputEndEl = document.getElementById('input-filter-end-date');
    if (inputStartEl) inputStartEl.value = rangeStart;
    if (inputEndEl) inputEndEl.value = rangeEnd;
    // Sync to omnibar if available
    if (typeof omnibarState !== 'undefined') {
      omnibarState.filters = omnibarState.filters.filter(f => f.key !== 'date_range');
      omnibarState.filters.unshift({ key: 'date_range', label: 'Date Range', type: 'date_range', startDate: rangeStart, endDate: rangeEnd });
      if (typeof renderOmnibarChips === 'function') renderOmnibarChips();
    }
  }

  renderAlerts();
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
        .filter(r => r.supervisor === (typeof currentUser !== 'undefined' ? currentUser.full_name : ''))
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
  document.getElementById('alert-description').innerHTML =
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
    return `<div class="alert-card ${severityClass}">
      <div class="alert-card-header">
        <span class="alert-severity-badge ${severityClass}">${alert.severity.toUpperCase()}</span>
        <span class="alert-agent">${escapeHtml(alert.agent)}</span>
      </div>
      <div class="alert-card-title">${escapeHtml(alert.title)}</div>
      <div class="alert-card-detail">${escapeHtml(alert.detail)}</div>
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
