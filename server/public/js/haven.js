/**
 * Haven — Unified Leave Management (Infinite Continuous Scrolling Calendar)
 * Roles: Agent (file + view own), Team Lead (approve/reject for team), Manager/OM (final approve/reject)
 * Statuses: Pending TL → Pending OM → Approved | Rejected | Cancelled
 * Calendar: Continuous vertical stream of weeks with inline month headers.
 *           Scrolling down/up loads more weeks seamlessly.
 */

const HAVEN = {
  leaves: [],
  employees: [],
  confirmCallback: null,
  _rejectIds: [],
  _rejectTier: 'tl',
  // Infinite scroll state
  _startWeek: null, // Saturday of the earliest rendered week
  _endWeek: null,   // Saturday of the latest rendered week
  _loading: false,
  _WEEKS_INITIAL: 12, // Render 12 weeks initially (6 before today, 6 after)
  _WEEKS_LOAD: 6,     // Load 6 more weeks on scroll
  _periodMinDate: null, // Period-based minimum leave date (from admin config)
};

// ─── Initialization ────────────────────────────────────────────────────────────
async function initHaven() {
  const el = document.getElementById('haven-loading');
  if (el) el.style.display = '';
  try {
    await havenLoadEmployees();
    await havenLoadLeaves();
    await havenLoadPeriodConfig();
    await havenRenderContinuous();
  } catch (e) {
    console.error('[Haven] init error:', e);
  } finally {
    if (el) el.style.display = 'none';
  }
}

async function havenLoadEmployees() {
  try {
    const url = `${IO_API_BASE}/employees?employement_status=Active&order=full_name&limit=2000`;
    const res = await fetch(url);
    HAVEN.employees = await res.json();
  } catch (e) {
    console.error('[Haven] loadEmployees error:', e);
    HAVEN.employees = [];
  }
}

async function havenLoadLeaves() {
  try {
    const user = typeof currentUser !== 'undefined' ? currentUser : null;
    const headers = {};
    if (user) {
      headers['x-actor-ohr'] = user.ohr_id || '';
      headers['x-actor-role'] = user.actual_role || '';
    }
    const url = `${IO_API_BASE}/leaves?limit=5000`;
    const res = await fetch(url, { headers });
    HAVEN.leaves = await res.json();
  } catch (e) {
    console.error('[Haven] loadLeaves error:', e);
    HAVEN.leaves = [];
  }
}
async function havenLoadPeriodConfig() {
  try {
    const res = await fetch(`${IO_API_BASE}/leave-periods/current`);
    if (res.ok) {
      const data = await res.json();
      if (data.configured && data.start_week_ending) {
        // Compute Saturday of the configured week (WE Friday - 6 days)
        const weDate = new Date(data.start_week_ending + "T00:00:00");
        const satDate = new Date(weDate);
        satDate.setDate(weDate.getDate() - 6);
        HAVEN._periodMinDate = havenFormatDate(satDate);
      }
    }
  } catch (e) {
    console.error("[Haven] loadPeriodConfig error:", e);
  }
}

// ─── Role Helpers ──────────────────────────────────────────────────────────────
function havenGetRole() {
  const user = typeof currentUser !== 'undefined' ? currentUser : null;
  if (!user) return 'agent';
  const isAdmin = (window.ADMIN_OHRS || []).includes(user.ohr_id);
  if (isAdmin || user.actual_role === 'Manager') return 'om';
  if (user.actual_role === 'Team Lead') return 'tl';
  return 'agent';
}

function havenGetMyAgentOhrs() {
  const user = typeof currentUser !== 'undefined' ? currentUser : null;
  if (!user) return [];
  // Look up the TL's own record in io_employees by ohr_id to get the canonical full_name
  // (users.name is "First Last" but io_employees.supervisor_name is "Last, First Middle")
  const myEmpRecord = HAVEN.employees.find(e => e.ohr_id === user.ohr_id);
  const supervisorKey = myEmpRecord ? myEmpRecord.full_name : user.full_name;
  return HAVEN.employees
    .filter(e => e.supervisor_name === supervisorKey)
    .map(e => e.ohr_id);
}
// Get all OHRs under a manager (direct reports + agents under their TLs)
function havenGetMyTeamOhrs() {
  const user = typeof currentUser !== 'undefined' ? currentUser : null;
  if (!user) return [];
  // Look up the manager's own record in io_employees by ohr_id to get the canonical full_name
  const myEmpRecord = HAVEN.employees.find(e => e.ohr_id === user.ohr_id);
  const managerKey = myEmpRecord ? myEmpRecord.full_name : user.full_name;
  // Direct reports to this manager
  const directReports = HAVEN.employees.filter(e => e.supervisor_name === managerKey);
  const directOhrs = directReports.map(e => e.ohr_id);
  // Find TLs among direct reports, then get their agents
  const myTLs = directReports.filter(e => e.actual_role === 'Team Lead');
  let tlAgentOhrs = [];
  for (const tl of myTLs) {
    const agents = HAVEN.employees.filter(e => e.supervisor_name === tl.full_name);
    tlAgentOhrs = tlAgentOhrs.concat(agents.map(e => e.ohr_id));
  }
  return [...new Set([...directOhrs, ...tlAgentOhrs])];
}

// ─── Date Utilities ────────────────────────────────────────────────────────────
function havenGetSaturday(date) {
  // Get Saturday that starts the week containing `date` (week = Sat-Fri)
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  // Offset to previous Saturday: Sat=0, Sun=-1, Mon=-2, Tue=-3, Wed=-4, Thu=-5, Fri=-6
  const diff = day === 6 ? 0 : -(day + 1);
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function havenAddDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function havenAddWeeks(date, weeks) {
  return havenAddDays(date, weeks * 7);
}

function havenFormatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function havenGetTodayPHT() {
  // Use getTodayStr if available (PHT-aware), otherwise fallback
  if (typeof getTodayStr === 'function') return getTodayStr();
  return havenFormatDate(new Date());
}
// ─── Filing Window Check ───────────────────────────────────────────────────────
function havenIsFilingWindowOpen() {
  // Filing window: 1st to 7th 23:59:59 PHT of every month
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
  const day = now.getDate();
  if (day >= 1 && day <= 7) return true;
  // Check if the current user has an active admin-granted override
  if (HAVEN._hasLeaveOverride) return true;
  return false;
}
function havenIsNormalWindow() {
  // Returns true if we're within the normal 1st-7th filing window (no override needed)
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
  const day = now.getDate();
  return day >= 1 && day <= 7;
}

async function havenCheckLeaveOverride() {
  // Check if the current user has a permanent filing override (admin-toggled)
  HAVEN._hasLeaveOverride = false;
  try {
    const user = typeof currentUser !== 'undefined' ? currentUser : null;
    if (!user || !user.ohr_id) return;
    const resp = await fetch(`${IO_API_BASE}/leave-overrides/check/${user.ohr_id}`);
    if (resp.ok) {
      const data = await resp.json();
      if (data.hasOverride) {
        HAVEN._hasLeaveOverride = true;
      }
    }
  } catch (err) {
    console.warn('[Haven] Override check failed:', err);
  }
}

function havenGetMinLeaveDate() {
  // If admin has configured a period for the current month, use that as the minimum
  if (HAVEN._periodMinDate) return HAVEN._periodMinDate;
  // Fallback: Saturday of the last Sat-Fri week whose week still overlaps the current month
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const dow = lastDayOfMonth.getDay();
  const daysBack = (dow + 1) % 7;
  const saturday = new Date(lastDayOfMonth);
  saturday.setDate(lastDayOfMonth.getDate() - daysBack);
  return havenFormatDate(saturday);
}
















// ─── Continuous Calendar Rendering ─────────────────────────────────────────────
async function havenRenderContinuous() {
  const scrollEl = document.getElementById('haven-weeks-scroll');
  if (!scrollEl) return;

  const today = new Date(havenGetTodayPHT() + 'T00:00:00');
  const todaySaturday = havenGetSaturday(today);

  // Start 6 weeks before today, end 6 weeks after
  const halfWeeks = Math.floor(HAVEN._WEEKS_INITIAL / 2);
  HAVEN._startWeek = havenAddWeeks(todaySaturday, -halfWeeks);
  HAVEN._endWeek = havenAddWeeks(todaySaturday, halfWeeks);

  // Render weeks directly into the existing scroll container
  scrollEl.innerHTML = havenBuildWeeksHtml(HAVEN._startWeek, HAVEN._endWeek);

  // Attach scroll listener
  scrollEl.addEventListener('scroll', havenOnScroll);

  // Update month label in header
  havenUpdateMonthLabel();

  // Scroll to today's week
  // Check for leave filing override before showing/hiding button
  await havenCheckLeaveOverride();
  // Show/hide File Leave button based on filing window
  const fileBtn = document.getElementById('haven-file-btn');
  if (fileBtn) {
    if (havenIsFilingWindowOpen()) {
      fileBtn.style.display = '';
      if (HAVEN._hasLeaveOverride && !havenIsNormalWindow()) {
        fileBtn.title = 'Filing override enabled — can file anytime';
      }
    } else {
      fileBtn.style.display = 'none';
    }
  }
  // Show/hide Config button for admins only
  const configBtn = document.getElementById('haven-config-btn');
  if (configBtn) {
    const user = typeof currentUser !== 'undefined' ? currentUser : null;
    if (user && (window.ADMIN_OHRS || []).includes(user.ohr_id)) {
      configBtn.style.display = '';
    } else {
      configBtn.style.display = 'none';
    }
  }
  // Show/hide the admin override checkbox next to File Leave button
  havenRenderOverrideCheckbox();
  requestAnimationFrame(() => {
    const todayCell = scrollEl.querySelector(`[data-date="${havenGetTodayPHT()}"]`);
    if (todayCell) {
      const weekRow = todayCell.closest('.haven-week-row');
      if (weekRow) {
        weekRow.scrollIntoView({ block: 'center', behavior: 'instant' });
      }
    }
  });
}

function havenBuildWeeksHtml(startSaturday, endSaturday) {
  const role = havenGetRole();
  const user = typeof currentUser !== 'undefined' ? currentUser : null;
  const todayStr = havenGetTodayPHT();

  // Filter visible leaves based on role
  let visibleLeaves = [...HAVEN.leaves];
  if (role === 'agent') {
    visibleLeaves = visibleLeaves.filter(l => user && l.ohr_id === user.ohr_id);
  } else if (role === 'tl') {
    const myAgents = havenGetMyAgentOhrs();
    visibleLeaves = visibleLeaves.filter(l => user && (l.ohr_id === user.ohr_id || myAgents.includes(l.ohr_id)));
  }
  // OMs/Managers see all leaves

  let html = '';
  const minLeaveDate = havenGetMinLeaveDate(); // Earliest eligible filing date
  let currentSaturday = new Date(startSaturday);
  let lastRenderedMonth = -1;

  while (currentSaturday < endSaturday) {
    // Check if this week starts a new month (or first day of month falls in this week)
    const weekDates = [];
    for (let i = 0; i < 7; i++) {
      weekDates.push(havenAddDays(currentSaturday, i));
    }

    // Check if any day in this week is the 1st of a month
    for (const wd of weekDates) {
      if (wd.getDate() === 1 && wd.getMonth() !== lastRenderedMonth) {
        lastRenderedMonth = wd.getMonth();
        const monthLabel = wd.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        html += `<div class="haven-month-divider" data-month="${wd.getFullYear()}-${String(wd.getMonth()+1).padStart(2,'0')}">
          <span class="haven-month-divider-label">${monthLabel}</span>
        </div>`;
        break; // Only one divider per week
      }
    }

    // Render the week row (Sat=0, Sun=1, Mon=2, Tue=3, Wed=4, Thu=5, Fri=6)
    html += '<div class="haven-week-row">';
    for (let i = 0; i < 7; i++) {
      const cellDate = havenAddDays(currentSaturday, i);
      const dateStr = havenFormatDate(cellDate);
      const dayLeaves = visibleLeaves.filter(l => l.start_date === dateStr)
        .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
      const isToday = dateStr === todayStr;
      const isWeekend = (i === 0 || i === 1); // Sat, Sun (first two columns)

      let cellClass = 'haven-cal-cell';
      if (isToday) cellClass += ' haven-cal-today';
      if (isWeekend) cellClass += ' haven-cal-weekend';
      if (dateStr < minLeaveDate) cellClass += ' haven-cal-ineligible';

      html += `<div class="${cellClass}" data-date="${dateStr}">`;
      // Day number with month indicator for 1st of month
      const dayNum = cellDate.getDate();
      const dayLabel = dayNum === 1
        ? `${cellDate.toLocaleDateString('en-US', { month: 'short' })} ${dayNum}`
        : `${dayNum}`;
      html += `<div class="haven-cal-day-num">${dayLabel}</div>`;

      // Leave tabs — show ALL leaves (no truncation), sorted by filing date
      if (dayLeaves.length > 0) {
        html += '<div class="haven-cal-events">';
        // Pre-compute "my team" OHRs for managers (not admin) to show indicator
        const _isOMRole = role === 'om';
        const _isAdminUser = user && (window.ADMIN_OHRS || []).includes(user.ohr_id);
        const _myTeamForIndicator = (_isOMRole && !_isAdminUser) ? havenGetMyTeamOhrs() : [];
        for (let j = 0; j < dayLeaves.length; j++) {
          const lv = dayLeaves[j];
          const statusClass = havenStatusClass(lv.status);
          const displayName = role === 'agent'
            ? (lv.leave_type || 'Leave')
            : truncateName(lv.full_name || 'Unknown', 12);
          const typeTag = role !== 'agent' ? `<span class="haven-tab-type">${escapeHtml(lv.leave_type || '')}</span>` : '';
          const statusIcon = havenStatusIcon(lv.status);
          const myTeamBadge = (lv.status === 'Pending OM' && _myTeamForIndicator.length > 0 && _myTeamForIndicator.includes(lv.ohr_id)) ? '<span class="haven-my-team-dot" title="My Team">MY</span>' : '';
          html += `<div class="haven-cal-tab ${statusClass}" onclick="havenShowLeaveDetail('${escapeHtml(lv.leave_id)}')" title="${escapeHtml(lv.full_name || '')} — ${escapeHtml(lv.status || '')}">
            ${myTeamBadge}<span class="haven-tab-name">${escapeHtml(displayName)}</span>${typeTag}<span class="haven-tab-icon">${statusIcon}</span>
          </div>`;
        }
        html += '</div>';
      }

      // Add button for filing leave (agents + TLs, eligible dates only)
      // Check if current user already has a non-cancelled leave on this date
      const userAlreadyFiled = user && dayLeaves.some(l => l.ohr_id === user.ohr_id && l.status !== 'Cancelled');
      if ((role === 'agent' || role === 'tl') && dateStr >= minLeaveDate && havenIsFilingWindowOpen()) {
        if (userAlreadyFiled) {
          html += `<div class="haven-cal-add haven-cal-add--filed" title="You already have a leave filed for this date">&#10003;</div>`;
        } else {
          html += `<div class="haven-cal-add" onclick="havenShowFileForm('${dateStr}')" title="File leave for this date">+</div>`;
        }
      }

      html += '</div>';
    }
    html += '</div>';

    // Move to next week
    currentSaturday = havenAddWeeks(currentSaturday, 1);
  }

  return html;
}

// ─── Infinite Scroll Handler ────────────────────────────────────────────
function havenOnScroll() {
  // Update month label on every scroll
  havenUpdateMonthLabel();

  if (HAVEN._loading) return;
  const scrollEl = document.getElementById('haven-weeks-scroll');
  if (!scrollEl) return;

  const threshold = 200; // px from edge to trigger load

  // Scroll near bottom → load more future weeks
  if (scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < threshold) {
    HAVEN._loading = true;
    const newEnd = havenAddWeeks(HAVEN._endWeek, HAVEN._WEEKS_LOAD);
    const html = havenBuildWeeksHtml(HAVEN._endWeek, newEnd);
    HAVEN._endWeek = newEnd;
    scrollEl.insertAdjacentHTML('beforeend', html);
    HAVEN._loading = false;
  }

  // Scroll near top → load more past weeks
  if (scrollEl.scrollTop < threshold) {
    HAVEN._loading = true;
    const prevScrollHeight = scrollEl.scrollHeight;
    const newStart = havenAddWeeks(HAVEN._startWeek, -HAVEN._WEEKS_LOAD);
    const html = havenBuildWeeksHtml(newStart, HAVEN._startWeek);
    HAVEN._startWeek = newStart;
    scrollEl.insertAdjacentHTML('afterbegin', html);
    // Maintain scroll position after prepending
    const addedHeight = scrollEl.scrollHeight - prevScrollHeight;
    scrollEl.scrollTop += addedHeight;
    HAVEN._loading = false;
  }
}

// ─── Helper: re-render after data changes ─────────────────────────────────────
function havenRefreshCalendar() {
  // Re-render the weeks between _startWeek and _endWeek
  const scrollEl = document.getElementById('haven-weeks-scroll');
  if (!scrollEl) return;
  const prevScroll = scrollEl.scrollTop;
  scrollEl.innerHTML = havenBuildWeeksHtml(HAVEN._startWeek, HAVEN._endWeek);
  scrollEl.scrollTop = prevScroll;
}

// ─── Update month label in header based on scroll position ────────────────────
function havenUpdateMonthLabel() {
  const scrollEl = document.getElementById('haven-weeks-scroll');
  const label = document.getElementById('haven-current-month');
  if (!scrollEl || !label) return;

  // Find the topmost visible month divider
  const dividers = scrollEl.querySelectorAll('.haven-month-divider');
  let currentMonth = '';
  const scrollTop = scrollEl.scrollTop;
  for (const div of dividers) {
    if (div.offsetTop <= scrollTop + 60) {
      currentMonth = div.querySelector('.haven-month-divider-label')?.textContent || '';
    } else {
      break;
    }
  }
  // If no divider found above scroll, use the first one
  if (!currentMonth && dividers.length > 0) {
    currentMonth = dividers[0].querySelector('.haven-month-divider-label')?.textContent || '';
  }
  label.textContent = currentMonth;
}

// ─── Scroll to Today ─────────────────────────────────────────────────────────
function havenScrollToToday() {
  const scrollEl = document.getElementById('haven-weeks-scroll');
  if (!scrollEl) return;
  const todayCell = scrollEl.querySelector(`[data-date="${havenGetTodayPHT()}"]`);
  if (todayCell) {
    const weekRow = todayCell.closest('.haven-week-row');
    if (weekRow) {
      weekRow.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }
}

// ─── Status Helpers ───────────────────────────────────────────────────────────
function truncateName(name, maxLen) {
  if (!name) return '';
  if (name.length <= maxLen) return name;
  const first = name.split(' ')[0];
  return first.length <= maxLen ? first : first.substring(0, maxLen - 1) + '…';
}

function havenStatusClass(status) {
  switch (status) {
    case 'Pending TL': return 'haven-ev-pending';
    case 'Pending OM': return 'haven-ev-pendingom';
    case 'Approved': return 'haven-ev-approved';
    case 'Rejected': return 'haven-ev-rejected';
    case 'Cancelled': return 'haven-ev-cancelled';
    default: return 'haven-ev-pending';
  }
}

function havenStatusIcon(status) {
  switch (status) {
    case 'Pending TL': return '⏳';
    case 'Pending OM': return '🔵';
    case 'Approved': return '✓';
    case 'Rejected': return '✗';
    case 'Cancelled': return '—';
    default: return '⏳';
  }
}

function havenStatusColor(status) {
  switch (status) {
    case 'Pending TL': return '#e6a817';
    case 'Pending OM': return '#3b82f6';
    case 'Approved': return '#16a34a';
    case 'Rejected': return '#dc2626';
    case 'Cancelled': return '#6b7280';
    default: return '#9ca3af';
  }
}


// ─── Leave Detail Popup (with inline approve/reject/cancel/delete) ─────────────
function havenShowLeaveDetail(leaveId) {
  const lv = HAVEN.leaves.find(l => l.leave_id === leaveId);
  if (!lv) return;
  const role = havenGetRole();
  const user = typeof currentUser !== 'undefined' ? currentUser : null;
  const isAdmin = user && (window.ADMIN_OHRS || []).includes(user.ohr_id);
  const _cancelFilerEmp = HAVEN.employees.find(e => e.ohr_id === lv.ohr_id);
  const _cancelFilerIsTL = _cancelFilerEmp && _cancelFilerEmp.actual_role === 'Team Lead';
  const canCancel = user && lv.ohr_id === user.ohr_id && (
    (lv.status === 'Pending TL') ||
    (lv.status === 'Pending OM' && _cancelFilerIsTL)
  );
  const myAgentOhrs = havenGetMyAgentOhrs();
  const isMyAgent = myAgentOhrs.includes(lv.ohr_id);
  // TL can FLM approve their agents; Admin/OM can FLM approve only their own agents
  const canTLApprove = lv.status === 'Pending TL' && user && lv.ohr_id !== user.ohr_id && (
    (role === 'tl') || (role === 'om' && isMyAgent)
  );
  // Admin can OM approve any Pending OM; Managers scoped to their team (direct reports + TL agents)
  const canOMApprove = role === 'om' && lv.status === 'Pending OM' && user && lv.ohr_id !== user.ohr_id && (
    (window.ADMIN_OHRS || []).includes(user.ohr_id) || havenGetMyTeamOhrs().includes(lv.ohr_id)
  );
  const formBody = document.getElementById('haven-form-body');
  const formTitle = document.getElementById('haven-form-title');
  const formFooter = document.getElementById('haven-form-footer');
  if (!formBody || !formTitle || !formFooter) return;
  formTitle.textContent = 'Leave Details';
  const statusBadge = `<span class="module-status-badge" style="background:${havenStatusColor(lv.status)}20;color:${havenStatusColor(lv.status)};border:1px solid ${havenStatusColor(lv.status)}40;">${escapeHtml(lv.status || '')}</span>`;
  // "My Team" badge for managers (not admin) on Pending OM leaves
  const _isManagerNotAdmin = role === 'om' && !isAdmin;
  const _detailMyTeam = _isManagerNotAdmin ? havenGetMyTeamOhrs() : [];
  const myTeamDetailBadge = (lv.status === 'Pending OM' && _detailMyTeam.length > 0 && _detailMyTeam.includes(lv.ohr_id))
    ? ' <span class="haven-my-team-badge">My Team</span>' : '';
  formBody.innerHTML = `
    <div class="haven-detail-grid">
      <div class="haven-detail-row"><span class="haven-detail-label">Status</span><span>${statusBadge}${myTeamDetailBadge}</span></div>
      <div class="haven-detail-row"><span class="haven-detail-label">Employee</span><span>${escapeHtml(lv.full_name || '\u2014')}</span></div>
      <div class="haven-detail-row"><span class="haven-detail-label">OHR</span><span>${escapeHtml(lv.ohr_id || '\u2014')}</span></div>
      <div class="haven-detail-row"><span class="haven-detail-label">Date</span><span>${escapeHtml(lv.start_date || '\u2014')}</span></div>
      <div class="haven-detail-row"><span class="haven-detail-label">Leave Type</span><span>${escapeHtml(lv.leave_type || '\u2014')}</span></div>
      <div class="haven-detail-row"><span class="haven-detail-label">Reason</span><span>${escapeHtml(lv.reason || '\u2014')}</span></div>
      <div class="haven-detail-row"><span class="haven-detail-label">Supervisor</span><span>${escapeHtml(lv.supervisor || '\u2014')}</span></div>
      
      ${lv.rejection_reason ? `<div class="haven-detail-row"><span class="haven-detail-label">Rejection Reason</span><span style="color:#dc2626;">${escapeHtml(lv.rejection_reason)}</span></div>` : ''}
      <div class="haven-detail-row"><span class="haven-detail-label">Filed</span><span>${lv.created_at ? new Date(lv.created_at).toLocaleString() : '\u2014'}</span></div>
      ${lv.tl_review_date ? `<div class="haven-detail-row"><span class="haven-detail-label">FLM Approved</span><span>${new Date(lv.tl_review_date).toLocaleString()}</span></div>` : ''}
    </div>
    <div id="haven-inline-action-zone"></div>
  `;
  // Footer: action buttons only (no Close — X suffices)
  let footerHtml = '';
  if (canTLApprove || canOMApprove) {
    footerHtml += `<button class="haven-form-btn haven-form-btn-approve" onclick="havenInlineApprove('${escapeHtml(lv.leave_id)}','${escapeHtml(lv.status)}','${escapeHtml(lv.ohr_id)}','${escapeHtml(lv.start_date)}')">Approve</button>`;
    footerHtml += `<button class="haven-form-btn haven-form-btn-reject" onclick="havenInlineReject('${escapeHtml(lv.leave_id)}','${escapeHtml(lv.status)}')">Reject</button>`;
  }
  if (canCancel) {
    footerHtml += `<button class="haven-form-btn haven-form-btn-reject" onclick="havenInlineCancel('${escapeHtml(lv.leave_id)}')">Cancel Leave</button>`;
  }
  if (isAdmin) {
    footerHtml += `<button class="haven-form-btn haven-form-btn-delete" onclick="havenInlineDelete('${escapeHtml(lv.leave_id)}')">Delete</button>`;
  }
  formFooter.innerHTML = footerHtml;
  havenOpenForm();
}
// ─── Show Day Leaves (when +N more is clicked) ─────────────────────────────────
function havenShowDayLeaves(dateStr) {
  const role = havenGetRole();
  const user = typeof currentUser !== 'undefined' ? currentUser : null;
  let dayLeaves = HAVEN.leaves.filter(l => l.start_date === dateStr);
  if (role === 'agent') {
    dayLeaves = dayLeaves.filter(l => user && l.ohr_id === user.ohr_id);
  } else if (role === 'tl') {
    const myAgents = havenGetMyAgentOhrs();
    dayLeaves = dayLeaves.filter(l => user && (l.ohr_id === user.ohr_id || myAgents.includes(l.ohr_id)));
  }
  // OMs/Managers see all leaves
  const formBody = document.getElementById('haven-form-body');
  const formTitle = document.getElementById('haven-form-title');
  const formFooter = document.getElementById('haven-form-footer');
  if (!formBody) return;
  formTitle.textContent = `Leaves on ${new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;
  const _isOMForDay = role === 'om';
  const _isAdminForDay = user && (window.ADMIN_OHRS || []).includes(user.ohr_id);
  const _myTeamForDay = (_isOMForDay && !_isAdminForDay) ? havenGetMyTeamOhrs() : [];
  let html = '<div class="haven-day-list">';
  for (const lv of dayLeaves) {
    const statusClass = havenStatusClass(lv.status);
    const isMyTeam = lv.status === 'Pending OM' && _myTeamForDay.length > 0 && _myTeamForDay.includes(lv.ohr_id);
    const myTeamTag = isMyTeam ? '<span class="haven-my-team-badge">My Team</span>' : '';
    html += `<div class="haven-day-item ${statusClass}" onclick="havenShowLeaveDetail('${escapeHtml(lv.leave_id)}')">
      <span class="haven-day-item-name">${escapeHtml(lv.full_name || '\u2014')}</span>
      <span class="haven-day-item-type">${escapeHtml(lv.leave_type || '')}</span>
      <span class="haven-day-item-status">${escapeHtml(lv.status || '')}${myTeamTag}</span>
    </div>`;
  }
  html += '</div>';
  // Bulk actions — group by status so tier is always correct
  let bulkHtml = '';
  if (role === 'tl' || role === 'om') {
    const bulkMyAgents = havenGetMyAgentOhrs();
    // TL: Pending TL for their agents; OM/Admin: own agents' Pending TL + scoped Pending OM
    const pendingTL = dayLeaves.filter(l => l.status === 'Pending TL');
    const pendingOM = dayLeaves.filter(l => l.status === 'Pending OM');
    let actionable;
    if (role === 'om') {
      const isAdmin = (window.ADMIN_OHRS || []).includes((typeof currentUser !== 'undefined' ? currentUser : {}).ohr_id);
      const myPendingTL = pendingTL.filter(l => bulkMyAgents.includes(l.ohr_id));
      // Admin: all Pending OM; Managers: only their team's Pending OM
      const myTeamOhrs = isAdmin ? null : havenGetMyTeamOhrs();
      const myPendingOM = isAdmin ? pendingOM : pendingOM.filter(l => myTeamOhrs.includes(l.ohr_id));
      actionable = [...myPendingTL, ...myPendingOM];
    } else {
      actionable = pendingTL;
    }
    if (actionable.length > 0) {
      // For mixed statuses, we group by status for correct tier handling
      const allSameStatus = actionable.every(l => l.status === actionable[0].status);
      const ids = actionable.map(l => l.leave_id);
      const bulkStatus = actionable[0].status; // for tier determination
      bulkHtml = `
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);display:flex;gap:8px;align-items:center;">
          <span style="font-size:12px;color:var(--fg-muted);">${actionable.length} pending:</span>
          <button class="btn btn-success btn-xs" onclick="havenBulkApproveList(${JSON.stringify(ids).replace(/"/g, '&quot;')},'${bulkStatus}')">Approve All</button>
          <button class="btn btn-danger btn-xs" onclick="havenBulkRejectList(${JSON.stringify(ids).replace(/"/g, '&quot;')},'${bulkStatus}')">Reject All</button>
        </div>
      `;
    }
  }
  formBody.innerHTML = html + bulkHtml;
  formFooter.innerHTML = ''; // No Close button — X suffices
  havenOpenForm();
}
// ─── File Leave Form ───────────────────────────────────────────────────────────
function havenShowFileForm(prefillDate) {
  const user = typeof currentUser !== 'undefined' ? currentUser : null;
  if (!user) { showToast('Please log in first', 'error'); return; }
  // Duplicate check: prevent filing on a date already filed
  if (prefillDate && HAVEN.leaves.some(l => l.ohr_id === user.ohr_id && l.start_date === prefillDate && l.status !== 'Cancelled')) {
    showToast('You already have a leave filed for ' + prefillDate + '. Cancel the existing one first if you need to refile.', 'error');
    return;
  }
  const role = havenGetRole();
  const formBody = document.getElementById('haven-form-body');
  const formTitle = document.getElementById('haven-form-title');
  const formFooter = document.getElementById('haven-form-footer');
  if (!formBody) return;
  formTitle.textContent = 'File Leave Request';
  const leaveTypeField = (role === 'tl' || role === 'om')
    ? `<div class="haven-form-field">
        <label class="haven-form-label">Leave Type <span class="haven-form-req">*</span></label>
        <div class="haven-form-select-wrap">
          <select class="haven-form-select" id="haven-file-type">
            <option value="">Select type...</option>
            <option value="PTO">PTO</option>
            <option value="CTO">CTO</option>
          </select>
          <svg class="haven-form-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>`
    : '';
  formBody.innerHTML = `
    <div class="haven-form-field">
      <label class="haven-form-label">Date <span class="haven-form-req">*</span></label>
      <input type="date" class="haven-form-input" id="haven-file-date" value="${prefillDate || ''}" min="${havenGetMinLeaveDate()}">
    </div>
    ${leaveTypeField}
    <div class="haven-form-field">
      <label class="haven-form-label">Reason <span class="haven-form-req">*</span></label>
      <textarea class="haven-form-input haven-form-textarea" id="haven-file-reason" rows="3" placeholder="Reason for leave (required)"></textarea>
    </div>
    <div id="haven-file-confirm-zone"></div>
  `;
  formFooter.innerHTML = `
    <button class="haven-form-btn haven-form-btn-cancel" onclick="havenCloseForm()">Cancel</button>
    <button class="haven-form-btn haven-form-btn-submit" onclick="havenSubmitLeave()">Submit Request</button>
  `;
  havenOpenForm();
  // Check current month period status and show info message
  havenCheckPeriodStatus();
}
function havenSubmitLeave() {
  const dateVal = document.getElementById('haven-file-date')?.value;
  const typeEl = document.getElementById('haven-file-type');
  const typeVal = typeEl ? typeEl.value : 'PTO';
  const reasonVal = (document.getElementById('haven-file-reason')?.value || '').trim();
  if (!dateVal) { showToast('Please select a date', 'error'); return; }
  if (dateVal < havenGetMinLeaveDate()) { showToast('Leave date is too early. Earliest allowed: ' + havenGetMinLeaveDate(), 'error'); return; }
  if (!havenIsFilingWindowOpen()) { showToast('Filing window is closed. Leave requests can only be filed from the 1st to the 7th of each month.', 'error'); return; }
  if (typeEl && !typeVal) { showToast('Please select a leave type', 'error'); return; }
  if (!reasonVal) { showToast('Please provide a reason for your leave', 'error'); return; }
  // Inline confirmation
  const zone = document.getElementById('haven-file-confirm-zone');
  if (!zone) return;
  zone.innerHTML = `
    <div class="haven-inline-confirm">
      <p class="haven-inline-confirm-msg">File a <b>${escapeHtml(typeVal)}</b> leave for <b>${dateVal}</b>?</p>
      <div class="haven-inline-confirm-actions">
        <button class="haven-form-btn haven-form-btn-cancel" onclick="document.getElementById('haven-file-confirm-zone').innerHTML=''">No</button>
        <button class="haven-form-btn haven-form-btn-submit" id="haven-file-confirm-yes">Yes, Submit</button>
      </div>
    </div>
  `;
  zone.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  document.getElementById('haven-file-confirm-yes').onclick = async () => {
    zone.innerHTML = '';
    const user = currentUser;
    const leaveId = 'LV-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
    const now = new Date().toISOString();
    const payload = {
      leave_id: leaveId,
      leave_type: typeVal,
      status: 'Pending TL',
      ohr_id: user.ohr_id,
      full_name: user.full_name,
      meta_email: user.meta_email || '',
      supervisor: user.supervisor_name || '',
      supervisor_email: user.supervisor_email || '',
      planning_group: user.planning_group || '',
      start_date: dateVal,
      end_date: dateVal,
      reason: reasonVal,
      created_at: now,
      updated_at: now,
    };
    try {
      const res = await fetch(`${IO_API_BASE}/leaves`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (result.ok) {
        showToast('Leave filed successfully', 'success');
        havenCloseForm();
        await havenLoadLeaves();
    await havenLoadPeriodConfig();
        havenRefreshCalendar();
      } else {
        showToast('Error: ' + (result.error || 'Unknown'), 'error');
      }
    } catch (e) {
      showToast('Network error', 'error');
    }
  };
}
// ─── Inline Cancel Leave ───────────────────────────────────────────────────────
function havenCancelLeave(leaveId) {
  havenInlineCancel(leaveId);
}
function havenInlineCancel(leaveId) {
  const zone = document.getElementById('haven-inline-action-zone');
  if (!zone) return;
  zone.innerHTML = `
    <div class="haven-inline-confirm haven-inline-confirm-danger">
      <p class="haven-inline-confirm-msg">Are you sure you want to <b>cancel</b> this leave request?</p>
      <div class="haven-inline-confirm-actions">
        <button class="haven-form-btn haven-form-btn-cancel" onclick="document.getElementById('haven-inline-action-zone').innerHTML=''">No</button>
        <button class="haven-form-btn haven-form-btn-reject" id="haven-cancel-yes">Yes, Cancel It</button>
      </div>
    </div>
  `;
  zone.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  document.getElementById('haven-cancel-yes').onclick = async () => {
    try {
      const res = await fetch(`${IO_API_BASE}/leaves/${leaveId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const result = await res.json();
      if (result.ok) {
        showToast('Leave cancelled', 'success');
        havenCloseForm();
        await havenLoadLeaves();
    await havenLoadPeriodConfig();
        havenRefreshCalendar();
      } else {
        showToast('Error: ' + (result.error || 'Unknown'), 'error');
      }
    } catch (e) {
      showToast('Network error', 'error');
    }
  };
}
// ─── Inline Approve ────────────────────────────────────────────────────────────
function havenSingleApprove(leaveId, leaveStatus) {
  havenInlineApprove(leaveId, leaveStatus);
}
function havenInlineApprove(leaveId, leaveStatus, ohrId, startDate) {
  const zone = document.getElementById('haven-inline-action-zone');
  if (!zone) return;
  const tier = leaveStatus === 'Pending OM' ? 'om' : 'tl';
  // Shrinkage forecast only shown for OM-tier approvals, and NOT for Team Lead or Trainer leaves
  const _shrinkFilerEmp = HAVEN.employees.find(e => e.ohr_id === ohrId);
  const _shrinkFilerRole = _shrinkFilerEmp ? _shrinkFilerEmp.actual_role : '';
  const showShrinkage = tier === 'om' && _shrinkFilerRole !== 'Team Lead' && _shrinkFilerRole !== 'Trainer';
  zone.innerHTML = `
    <div class="haven-inline-confirm haven-inline-confirm-success">
      <p class="haven-inline-confirm-msg">Approve this leave request?</p>
      ${showShrinkage ? `<div class="haven-shrinkage-card haven-shrinkage-loading">
        <span class="haven-shrinkage-loading-text">Loading shrinkage forecast...</span>
      </div>` : ''}
      <div class="haven-inline-confirm-actions">
        <button class="haven-form-btn haven-form-btn-cancel" onclick="document.getElementById('haven-inline-action-zone').innerHTML=''">No</button>
        <button class="haven-form-btn haven-form-btn-approve" id="haven-approve-yes">Yes, Approve</button>
      </div>
    </div>
  `;
  zone.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  document.getElementById('haven-approve-yes').onclick = async () => {
    await havenDoBulkAction([leaveId], 'approve', tier, '');
  };
  // Fetch shrinkage forecast only for OM-tier
  if (showShrinkage) {
    havenFetchShrinkage(ohrId, startDate, leaveId);
  }
}

async function havenFetchShrinkage(ohrId, startDate, currentLeaveId) {
  try {
    const resp = await fetch('/api/io/leaves/shrinkage-forecast?ohr_id=' + encodeURIComponent(ohrId) + '&start_date=' + encodeURIComponent(startDate));
    const data = await resp.json();
    if (data.error && data.headcount === undefined) {
      console.warn('Shrinkage forecast unavailable:', data.error);
      return;
    }
    // Trainers are excluded from shrinkage forecast — hide the card
    if (data.skip) {
      const skipCard = document.querySelector('.haven-shrinkage-card');
      if (skipCard) skipCard.style.display = 'none';
      return;
    }
    const card = document.querySelector('.haven-shrinkage-card');
    if (!card) return;
    card.classList.remove('haven-shrinkage-loading');
    // Include the current leave in the count if not already counted (it's Pending OM, which IS counted)
    const leaveCount = data.leave_count;
    const headcount = data.headcount;
    const plPct = data.pl_pct;
    const threshold = data.threshold;
    const isOver = plPct > threshold;
    const colorClass = isOver ? 'haven-shrinkage-over' : 'haven-shrinkage-ok';
    // Build leaves detail list (other leaves that week)
    let detailHtml = '';
    if (data.leaves_detail && data.leaves_detail.length > 0) {
      const otherLeaves = data.leaves_detail.filter(l => l.leave_id !== currentLeaveId);
      if (otherLeaves.length > 0) {
        detailHtml = '<div class="haven-shrinkage-detail"><span class="haven-shrinkage-detail-title">Other leaves this week:</span>';
        otherLeaves.forEach(l => {
          detailHtml += '<span class="haven-shrinkage-detail-item">' + escapeHtml(l.full_name) + ' — ' + escapeHtml(l.start_date) + ' (' + escapeHtml(l.status) + ')</span>';
        });
        detailHtml += '</div>';
      }
    }
    card.innerHTML = `
      <div class="haven-shrinkage-header ${colorClass}">
        <span class="haven-shrinkage-title">${escapeHtml(data.planning_group)} · ${escapeHtml(data.actual_role)}s</span>
        <span class="haven-shrinkage-badge ${colorClass}">${plPct.toFixed(1)}%</span>
      </div>
      <div class="haven-shrinkage-stats">
        <div class="haven-shrinkage-stat">
          <span class="haven-shrinkage-stat-value">${headcount}</span>
          <span class="haven-shrinkage-stat-label">Headcount</span>
        </div>
        <div class="haven-shrinkage-stat">
          <span class="haven-shrinkage-stat-value">${leaveCount}</span>
          <span class="haven-shrinkage-stat-label">Leaves (WE ${(() => { const p = data.week_end.split('-'); return p[1] + '-' + p[2] + '-' + p[0].slice(2); })()})</span>
        </div>
        <div class="haven-shrinkage-stat">
          <span class="haven-shrinkage-stat-value haven-shrinkage-pct ${colorClass}">${plPct.toFixed(1)}%</span>
          <span class="haven-shrinkage-stat-label">PL% ${isOver ? '⚠️ Over threshold' : '✓ Within threshold'}</span>
        </div>
      </div>
      ${detailHtml}
    `;
  } catch (err) {
    console.error('Shrinkage forecast fetch error:', err);
    const card = document.querySelector('.haven-shrinkage-card');
    if (card) card.innerHTML = '<span style="color:#6b7280;font-size:12px;">Forecast unavailable</span>';
  }
}
// ─── Inline Reject ─────────────────────────────────────────────────────────────
function havenSingleReject(leaveId, leaveStatus) {
  havenInlineReject(leaveId, leaveStatus);
}
function havenInlineReject(leaveId, leaveStatus) {
  const zone = document.getElementById('haven-inline-action-zone');
  if (!zone) return;
  // Tier is determined by the leave's current status, not the user's role
  const tier = leaveStatus === 'Pending OM' ? 'om' : 'tl';
  zone.innerHTML = `
    <div class="haven-inline-confirm haven-inline-confirm-danger">
      <p class="haven-inline-confirm-msg">Reject this leave request?</p>
      <div class="haven-form-field" style="margin-top:8px;">
        <label class="haven-form-label">Remarks (optional)</label>
        <textarea class="haven-form-input haven-form-textarea" id="haven-inline-reject-remarks" rows="2" placeholder="Reason for rejection..."></textarea>
      </div>
      <div class="haven-inline-confirm-actions">
        <button class="haven-form-btn haven-form-btn-cancel" onclick="document.getElementById('haven-inline-action-zone').innerHTML=''">No</button>
        <button class="haven-form-btn haven-form-btn-reject" id="haven-reject-yes">Yes, Reject</button>
      </div>
    </div>
  `;
  zone.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  document.getElementById('haven-reject-yes').onclick = async () => {
    const remarks = document.getElementById('haven-inline-reject-remarks')?.value || '';
    await havenDoBulkAction([leaveId], 'reject', tier, remarks);
  };
}
// ─── Admin Delete (inline confirm) ─────────────────────────────────────────────
function havenInlineDelete(leaveId) {
  const zone = document.getElementById('haven-inline-action-zone');
  if (!zone) return;
  zone.innerHTML = `
    <div class="haven-inline-confirm haven-inline-confirm-danger">
      <p class="haven-inline-confirm-msg"><strong>Permanently delete</strong> this leave entry? This cannot be undone.</p>
      <div class="haven-inline-confirm-actions">
        <button class="haven-form-btn haven-form-btn-cancel" onclick="document.getElementById('haven-inline-action-zone').innerHTML=''">No</button>
        <button class="haven-form-btn haven-form-btn-delete" id="haven-delete-yes">Yes, Delete</button>
      </div>
    </div>
  `;
  zone.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  document.getElementById('haven-delete-yes').onclick = async () => {
    try {
      const res = await fetch(`${IO_API_BASE}/leaves/${leaveId}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.ok) {
        showToast('Leave deleted', 'success');
        havenCloseForm();
        await havenLoadLeaves();
    await havenLoadPeriodConfig();
        havenRefreshCalendar();
      } else {
        showToast('Error: ' + (result.error || 'Unknown'), 'error');
      }
    } catch (e) {
      showToast('Network error', 'error');
    }
  };
}
// ─── Bulk Approve/Reject from Day View ─────────────────────────────────────────
function havenBulkApproveList(ids, leaveStatus) {
  if (!ids || ids.length === 0) return;
  // Tier determined by leave status, not user role
  const tier = leaveStatus === 'Pending OM' ? 'om' : 'tl';
  // Inline confirm in the day-view form body
  const formBody = document.getElementById('haven-form-body');
  if (!formBody) return;
  let zone = document.getElementById('haven-bulk-confirm-zone');
  if (!zone) {
    zone = document.createElement('div');
    zone.id = 'haven-bulk-confirm-zone';
    formBody.appendChild(zone);
  }
  zone.innerHTML = `
    <div class="haven-inline-confirm haven-inline-confirm-success" style="margin-top:12px;">
      <p class="haven-inline-confirm-msg">Approve <b>${ids.length}</b> leave request(s)?</p>
      <div class="haven-inline-confirm-actions">
        <button class="haven-form-btn haven-form-btn-cancel" onclick="document.getElementById('haven-bulk-confirm-zone').innerHTML=''">No</button>
        <button class="haven-form-btn haven-form-btn-approve" id="haven-bulk-approve-yes">Yes, Approve All</button>
      </div>
    </div>
  `;
  zone.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  document.getElementById('haven-bulk-approve-yes').onclick = async () => {
    await havenDoBulkAction(ids, 'approve', tier, '');
  };
}
function havenBulkRejectList(ids, leaveStatus) {
  if (!ids || ids.length === 0) return;
  // Tier determined by leave status, not user role
  const tier = leaveStatus === 'Pending OM' ? 'om' : 'tl';
  const formBody = document.getElementById('haven-form-body');
  if (!formBody) return;
  let zone = document.getElementById('haven-bulk-confirm-zone');
  if (!zone) {
    zone = document.createElement('div');
    zone.id = 'haven-bulk-confirm-zone';
    formBody.appendChild(zone);
  }
  zone.innerHTML = `
    <div class="haven-inline-confirm haven-inline-confirm-danger" style="margin-top:12px;">
      <p class="haven-inline-confirm-msg">Reject <b>${ids.length}</b> leave request(s)?</p>
      <div class="haven-form-field" style="margin-top:8px;">
        <label class="haven-form-label">Remarks (optional)</label>
        <textarea class="haven-form-input haven-form-textarea" id="haven-bulk-reject-remarks" rows="2" placeholder="Reason for rejection..."></textarea>
      </div>
      <div class="haven-inline-confirm-actions">
        <button class="haven-form-btn haven-form-btn-cancel" onclick="document.getElementById('haven-bulk-confirm-zone').innerHTML=''">No</button>
        <button class="haven-form-btn haven-form-btn-reject" id="haven-bulk-reject-yes">Yes, Reject All</button>
      </div>
    </div>
  `;
  zone.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  document.getElementById('haven-bulk-reject-yes').onclick = async () => {
    const remarks = document.getElementById('haven-bulk-reject-remarks')?.value || '';
    await havenDoBulkAction(ids, 'reject', tier, remarks);
  };
}
// ─── Reject Form (legacy, kept for bulk compatibility) ─────────────────────────
function havenShowRejectForm(leaveIds, leaveStatus) {
  if (leaveIds.length === 1) {
    havenInlineReject(leaveIds[0], leaveStatus);
    return;
  }
  havenBulkRejectList(leaveIds, leaveStatus);
}
async function havenDoReject() {
  const remarks = document.getElementById('haven-reject-remarks')?.value || '';
  const ids = HAVEN._rejectIds || [];
  const tier = HAVEN._rejectTier || 'tl';
  havenCloseForm();
  await havenDoBulkAction(ids, 'reject', tier, remarks);
}
// ─── Bulk Action API Call ──────────────────────────────────────────────────────
async function havenDoBulkAction(leaveIds, action, tier, rejectionReason) {
  const user = typeof currentUser !== 'undefined' ? currentUser : null;
  try {
    const res = await fetch(`${IO_API_BASE}/leaves/bulk-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leave_ids: leaveIds,
        action,
        tier,
        reviewer_name: user ? user.full_name : '',
        rejection_reason: rejectionReason,
      }),
    });
    const result = await res.json();
    if (result.ok) {
      showToast(`${result.updated} leave(s) ${action === 'approve' ? 'approved' : 'rejected'}`, 'success');
      havenCloseForm();
      await havenLoadLeaves();
    await havenLoadPeriodConfig();
      havenRefreshCalendar();
    } else {
      showToast('Error: ' + (result.error || 'Unknown'), 'error');
    }
  } catch (e) {
    showToast('Network error', 'error');
  }
}
// ─── Form Open/Close ──────────────────────────────────────────────────────────
function havenOpenForm() {
  const overlay = document.getElementById('haven-form-overlay');
  if (overlay) overlay.style.display = 'flex';
}
function havenCloseForm() {
  const overlay = document.getElementById('haven-form-overlay');
  if (overlay) overlay.style.display = 'none';
}
// ─── Expose globally ───────────────────────────────────────────────────────────
window.initHaven = initHaven;
window.havenShowFileForm = havenShowFileForm;
window.havenSubmitLeave = havenSubmitLeave;
window.havenCancelLeave = havenCancelLeave;
window.havenInlineCancel = havenInlineCancel;
window.havenShowLeaveDetail = havenShowLeaveDetail;
window.havenShowDayLeaves = havenShowDayLeaves;
window.havenCloseForm = havenCloseForm;
window.havenOpenForm = havenOpenForm;
window.havenSingleApprove = havenSingleApprove;
window.havenSingleReject = havenSingleReject;
window.havenInlineApprove = havenInlineApprove;
window.havenInlineReject = havenInlineReject;
window.havenInlineDelete = havenInlineDelete;
window.havenBulkApproveList = havenBulkApproveList;
window.havenBulkRejectList = havenBulkRejectList;
window.havenDoReject = havenDoReject;
window.havenScrollToToday = havenScrollToToday;

// ─── Leave Period Configuration (Admin-only) ───────────────────────────────────
/**
 * Generates an array of Fridays in and around a given month/year.
 * Returns objects with { value: 'YYYY-MM-DD', label: 'MM/DD (Fri)' }
 */
function havenGetFridaysForMonth(month, year) {
  // Start from 2 weeks before the 1st of the month, end 2 weeks after last day
  const start = new Date(year, month - 1, -13); // ~2 weeks before
  const end = new Date(year, month, 14); // ~2 weeks after
  const fridays = [];
  const d = new Date(start);
  // Advance to first Friday
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
  while (d <= end) {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    fridays.push({
      value: `${yyyy}-${mm}-${dd}`,
      label: `${mm}/${dd} (Fri)`
    });
    d.setDate(d.getDate() + 7);
  }
  return fridays;
}

async function havenShowPeriodConfig() {
  const formBody = document.getElementById('haven-form-body');
  const formTitle = document.getElementById('haven-form-title');
  const formFooter = document.getElementById('haven-form-footer');
  if (!formBody) return;
  formTitle.textContent = 'Leave Period Configuration';
  formBody.innerHTML = '<div style="text-align:center;padding:24px;color:#94a3b8;">Loading...</div>';
  formFooter.innerHTML = ""; // No Close button — X suffices
  havenOpenForm();
  // Fetch existing periods
  let periods = [];
  try {
    const res = await fetch(`${IO_API_BASE}/leave-periods`);
    if (res.ok) periods = await res.json();
  } catch (e) { console.error('[Haven] load periods error:', e); }
  // Build the config UI
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
  const curMonth = now.getMonth() + 1;
  const curYear = now.getFullYear();
  // Month options: current month + next 3 months
  const monthOptions = [];
  for (let i = 0; i < 4; i++) {
    let m = curMonth + i;
    let y = curYear;
    if (m > 12) { m -= 12; y++; }
    const label = new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
    monthOptions.push({ month: m, year: y, label });
  }
  const defaultMonth = monthOptions[0].month;
  const defaultYear = monthOptions[0].year;
  const fridays = havenGetFridaysForMonth(defaultMonth, defaultYear);
  formBody.innerHTML = `
    <div style="margin-bottom:16px;">
      <p style="font-size:12px;color:#94a3b8;margin:0 0 12px 0;">
        Set the start week ending (Friday) for each month. Agents can only file leaves for the current month once configured.
        Future months are always open for filing.
      </p>
      <div class="haven-form-field">
        <label class="haven-form-label">Month</label>
        <div class="haven-form-select-wrap">
          <select class="haven-form-select" id="haven-period-month" onchange="havenPeriodMonthChanged()">
            ${monthOptions.map(o => `<option value="${o.month}-${o.year}">${o.label}</option>`).join('')}
          </select>
          <svg class="haven-form-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
      <div class="haven-form-field">
        <label class="haven-form-label">Start Week Ending (Friday)</label>
        <div class="haven-form-select-wrap">
          <select class="haven-form-select" id="haven-period-friday">
            ${fridays.map(f => `<option value="${f.value}">${f.label}</option>`).join('')}
          </select>
          <svg class="haven-form-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
      <button class="haven-form-btn haven-form-btn-submit" onclick="havenSavePeriodConfig()" style="margin-top:8px;">Save Configuration</button>
    </div>
    <div style="border-top:1px solid #334155;padding-top:12px;">
      <h4 style="font-size:13px;font-weight:600;color:#e2e8f0;margin:0 0 8px 0;">Configured Periods</h4>
      <div id="haven-period-table">
        ${periods.length === 0
          ? '<p style="font-size:12px;color:#64748b;">No periods configured yet.</p>'
          : `<table style="width:100%;font-size:12px;border-collapse:collapse;">
              <thead><tr style="color:#94a3b8;text-align:left;">
                <th style="padding:4px 8px;">Month</th>
                <th style="padding:4px 8px;">Start WE</th>
                <th style="padding:4px 8px;">Set By</th>
                <th style="padding:4px 8px;"></th>
              </tr></thead>
              <tbody>
                ${periods.map(p => {
                  const mLabel = new Date(p.year, p.month - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' });
                  const weDate = p.start_week_ending;
                  const weMM = weDate.slice(5,7);
                  const weDD = weDate.slice(8,10);
                  return `<tr style="border-top:1px solid #1e293b;">
                    <td style="padding:4px 8px;">${mLabel}</td>
                    <td style="padding:4px 8px;">${weMM}/${weDD}</td>
                    <td style="padding:4px 8px;">${p.created_by || p.created_by_ohr || '-'}</td>
                    <td style="padding:4px 8px;"><span id="haven-period-del-${p.id}"><button class="btn btn-ghost btn-sm" style="color:#ef4444;font-size:11px;" onclick="havenConfirmDeletePeriod(${p.id})">Delete</button></span></td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>`
        }
      </div>
    </div>
  `;
}

function havenPeriodMonthChanged() {
  const sel = document.getElementById('haven-period-month');
  if (!sel) return;
  const [m, y] = sel.value.split('-').map(Number);
  const fridays = havenGetFridaysForMonth(m, y);
  const fridaySel = document.getElementById('haven-period-friday');
  if (fridaySel) {
    fridaySel.innerHTML = fridays.map(f => `<option value="${f.value}">${f.label}</option>`).join('');
  }
}

async function havenSavePeriodConfig() {
  const monthSel = document.getElementById('haven-period-month');
  const fridaySel = document.getElementById('haven-period-friday');
  if (!monthSel || !fridaySel) return;
  const [month, year] = monthSel.value.split('-').map(Number);
  const start_week_ending = fridaySel.value;
  if (!start_week_ending) { showToast('Please select a Friday', 'error'); return; }
  try {
    const res = await fetch(`${IO_API_BASE}/leave-periods`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-actor-ohr': currentUser.ohr_id, 'x-actor-name': currentUser.full_name || '' },
      body: JSON.stringify({ month, year, start_week_ending })
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Failed to save', 'error'); return; }
    showToast('Leave period configured successfully', 'success');
    await havenLoadPeriodConfig(); // Refresh period min date
    havenShowPeriodConfig(); // Refresh the panel
  } catch (e) {
    console.error('[Haven] save period error:', e);
    showToast('Failed to save period configuration', 'error');
  }
}

function havenConfirmDeletePeriod(id) {
  const span = document.getElementById('haven-period-del-' + id);
  if (!span) return;
  span.innerHTML = '<span style="font-size:11px;color:#f87171;">Remove?</span> ' +
    '<button class="btn btn-ghost btn-sm" style="color:#22c55e;font-size:11px;margin-left:4px;" onclick="havenDeletePeriod(' + id + ')">Yes</button>' +
    '<button class="btn btn-ghost btn-sm" style="color:#94a3b8;font-size:11px;margin-left:2px;" onclick="havenCancelDeletePeriod(' + id + ')">No</button>';
}
function havenCancelDeletePeriod(id) {
  const span = document.getElementById('haven-period-del-' + id);
  if (!span) return;
  span.innerHTML = '<button class="btn btn-ghost btn-sm" style="color:#ef4444;font-size:11px;" onclick="havenConfirmDeletePeriod(' + id + ')">Delete</button>';
}
async function havenDeletePeriod(id) {
  try {
    const res = await fetch(`${IO_API_BASE}/leave-periods/${id}`, { method: 'DELETE', headers: { 'x-actor-ohr': currentUser.ohr_id } });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Failed to delete', 'error'); return; }
    showToast('Period configuration removed', 'success');
    await havenLoadPeriodConfig(); // Refresh period min date
    havenShowPeriodConfig(); // Refresh
  } catch (e) {
    console.error('[Haven] delete period error:', e);
    showToast('Failed to delete period', 'error');
  }
}

// Expose new functions globally
window.havenShowPeriodConfig = havenShowPeriodConfig;
window.havenPeriodMonthChanged = havenPeriodMonthChanged;
window.havenSavePeriodConfig = havenSavePeriodConfig;
window.havenDeletePeriod = havenDeletePeriod;
window.havenConfirmDeletePeriod = havenConfirmDeletePeriod;
window.havenCancelDeletePeriod = havenCancelDeletePeriod;

// ─── Period Status Check (shown in File Leave form) ────────────────────────────
async function havenCheckPeriodStatus() {
  const zone = document.getElementById('haven-file-confirm-zone');
  if (!zone) return;
  try {
    const res = await fetch(`${IO_API_BASE}/leave-periods/current`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data.configured) {
      const monthName = new Date(data.year, data.month - 1, 1).toLocaleString('en-US', { month: 'long' });
      zone.innerHTML = `<div style="background:#1e293b;border:1px solid #f59e0b;border-radius:6px;padding:8px 12px;margin-top:8px;font-size:12px;color:#fbbf24;">
        <strong>⚠ Note:</strong> Leave filing for ${monthName} has not been opened yet. Your admin needs to configure the leave period before you can file for this month. You can still file for future months.
      </div>`;
    } else {
      const weDate = data.start_week_ending;
      const weMM = weDate.slice(5, 7);
      const weDD = weDate.slice(8, 10);
      zone.innerHTML = `<div style="background:#1e293b;border:1px solid #22c55e;border-radius:6px;padding:8px 12px;margin-top:8px;font-size:12px;color:#86efac;">
        <strong>✓</strong> Leave filing is open for this month (WE ${weMM}/${weDD} onward).
      </div>`;
    }
  } catch (e) {
    // Silently fail — don't block the form
  }
}
window.havenCheckPeriodStatus = havenCheckPeriodStatus;


// ─── Admin Override Checkbox (next to File Leave button) ──────────────────────
/**
 * Renders a checkbox next to the File Leave button, visible only to admins.
 * When checked, the currently viewed agent can file leaves outside the 1st-7th window.
 * The checkbox reflects the current user's filing_override flag.
 */
function havenRenderOverrideCheckbox() {
  const user = typeof currentUser !== 'undefined' ? currentUser : null;
  if (!user) return;
  const isAdmin = (window.ADMIN_OHRS || []).includes(user.ohr_id);

  // Remove existing checkbox if present
  const existing = document.getElementById('haven-override-checkbox-wrap');
  if (existing) existing.remove();

  if (!isAdmin) return;

  // Insert checkbox next to the File Leave button
  const fileBtn = document.getElementById('haven-file-btn');
  if (!fileBtn || !fileBtn.parentElement) return;

  const wrap = document.createElement('label');
  wrap.id = 'haven-override-checkbox-wrap';
  wrap.style.cssText = 'display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--text-secondary);cursor:pointer;margin-left:12px;user-select:none;';
  wrap.title = 'Allow this user to file leaves outside the 1st-7th window (permanent until unchecked)';

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.id = 'haven-override-checkbox';
  cb.checked = !!HAVEN._hasLeaveOverride;
  cb.style.cssText = 'accent-color:var(--accent-primary);cursor:pointer;';
  cb.addEventListener('change', havenToggleOverride);

  const label = document.createElement('span');
  label.textContent = 'Allow filing anytime';

  wrap.appendChild(cb);
  wrap.appendChild(label);
  fileBtn.parentElement.insertBefore(wrap, fileBtn.nextSibling);
}

async function havenToggleOverride(e) {
  const user = typeof currentUser !== 'undefined' ? currentUser : null;
  if (!user) return;
  const enabled = e.target.checked;

  try {
    const resp = await fetch(`${IO_API_BASE}/leave-overrides/toggle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-actor-ohr': user.ohr_id || '',
        'x-actor-role': user.actual_role || '',
        'x-actor-name': user.full_name || ''
      },
      body: JSON.stringify({ ohr_id: user.ohr_id, enabled })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      showToast(err.error || 'Failed to toggle override', 'error');
      e.target.checked = !enabled; // revert
      return;
    }
    HAVEN._hasLeaveOverride = enabled;
    // Re-evaluate File Leave button visibility
    const fileBtn = document.getElementById('haven-file-btn');
    if (fileBtn) {
      if (havenIsFilingWindowOpen()) {
        fileBtn.style.display = '';
        fileBtn.title = enabled && !havenIsNormalWindow() ? 'Filing override enabled — can file anytime' : '';
      } else {
        fileBtn.style.display = 'none';
      }
    }
    showToast(enabled ? 'Filing override enabled — can file leaves anytime' : 'Filing override removed — normal window rules apply', 'success');
  } catch (err) {
    console.error('[Haven] Toggle override error:', err);
    showToast('Network error toggling override', 'error');
    e.target.checked = !enabled; // revert
  }
}
