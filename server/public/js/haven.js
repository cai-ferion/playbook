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
  _startWeek: null, // Monday of the earliest rendered week
  _endWeek: null,   // Monday of the latest rendered week
  _loading: false,
  _WEEKS_INITIAL: 12, // Render 12 weeks initially (6 before today, 6 after)
  _WEEKS_LOAD: 6,     // Load 6 more weeks on scroll
};

// ─── Initialization ────────────────────────────────────────────────────────────
async function initHaven() {
  const el = document.getElementById('haven-loading');
  if (el) el.style.display = '';
  try {
    await havenLoadEmployees();
    await havenLoadLeaves();
    havenRenderContinuous();
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
    const url = `${IO_API_BASE}/leaves?limit=5000`;
    const res = await fetch(url);
    HAVEN.leaves = await res.json();
  } catch (e) {
    console.error('[Haven] loadLeaves error:', e);
    HAVEN.leaves = [];
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
  return HAVEN.employees
    .filter(e => e.supervisor_name === user.full_name)
    .map(e => e.ohr_id);
}

// ─── Date Utilities ────────────────────────────────────────────────────────────
function havenGetMonday(date) {
  // Get Monday of the week containing `date`
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon...
  const diff = day === 0 ? -6 : 1 - day;
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

// ─── Continuous Calendar Rendering ─────────────────────────────────────────────
function havenRenderContinuous() {
  const scrollEl = document.getElementById('haven-weeks-scroll');
  if (!scrollEl) return;

  const today = new Date(havenGetTodayPHT() + 'T00:00:00');
  const todayMonday = havenGetMonday(today);

  // Start 6 weeks before today, end 6 weeks after
  const halfWeeks = Math.floor(HAVEN._WEEKS_INITIAL / 2);
  HAVEN._startWeek = havenAddWeeks(todayMonday, -halfWeeks);
  HAVEN._endWeek = havenAddWeeks(todayMonday, halfWeeks);

  // Render weeks directly into the existing scroll container
  scrollEl.innerHTML = havenBuildWeeksHtml(HAVEN._startWeek, HAVEN._endWeek);

  // Attach scroll listener
  scrollEl.addEventListener('scroll', havenOnScroll);

  // Update month label in header
  havenUpdateMonthLabel();

  // Scroll to today's week
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

function havenBuildWeeksHtml(startMonday, endMonday) {
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
  // OMs see all

  let html = '';
  let currentMonday = new Date(startMonday);
  let lastRenderedMonth = -1;

  while (currentMonday < endMonday) {
    // Check if this week starts a new month (or first day of month falls in this week)
    const weekDates = [];
    for (let i = 0; i < 7; i++) {
      weekDates.push(havenAddDays(currentMonday, i));
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

    // Render the week row
    html += '<div class="haven-week-row">';
    for (let i = 0; i < 7; i++) {
      const cellDate = havenAddDays(currentMonday, i);
      const dateStr = havenFormatDate(cellDate);
      const dayLeaves = visibleLeaves.filter(l => l.start_date === dateStr);
      const isToday = dateStr === todayStr;
      const isWeekend = (i === 5 || i === 6); // Sat, Sun

      let cellClass = 'haven-cal-cell';
      if (isToday) cellClass += ' haven-cal-today';
      if (isWeekend) cellClass += ' haven-cal-weekend';

      html += `<div class="${cellClass}" data-date="${dateStr}">`;
      // Day number with month indicator for 1st of month
      const dayNum = cellDate.getDate();
      const dayLabel = dayNum === 1
        ? `${cellDate.toLocaleDateString('en-US', { month: 'short' })} ${dayNum}`
        : `${dayNum}`;
      html += `<div class="haven-cal-day-num">${dayLabel}</div>`;

      // Leave tabs
      if (dayLeaves.length > 0) {
        html += '<div class="haven-cal-events">';
        const maxShow = 3;
        for (let j = 0; j < Math.min(dayLeaves.length, maxShow); j++) {
          const lv = dayLeaves[j];
          const statusClass = havenStatusClass(lv.status);
          const displayName = role === 'agent'
            ? (lv.leave_type || 'Leave')
            : truncateName(lv.full_name || 'Unknown', 12);
          const typeTag = role !== 'agent' ? `<span class="haven-tab-type">${escapeHtml(lv.leave_type || '')}</span>` : '';
          const statusIcon = havenStatusIcon(lv.status);
          html += `<div class="haven-cal-tab ${statusClass}" onclick="havenShowLeaveDetail('${escapeHtml(lv.leave_id)}')" title="${escapeHtml(lv.full_name || '')} — ${escapeHtml(lv.status || '')}">
            <span class="haven-tab-name">${escapeHtml(displayName)}</span>${typeTag}<span class="haven-tab-icon">${statusIcon}</span>
          </div>`;
        }
        if (dayLeaves.length > maxShow) {
          html += `<div class="haven-cal-more" onclick="havenShowDayLeaves('${dateStr}')">+${dayLeaves.length - maxShow} more</div>`;
        }
        html += '</div>';
      }

      // Add button for filing leave (agents + TLs, today or future)
      if ((role === 'agent' || role === 'tl') && dateStr >= todayStr) {
        html += `<div class="haven-cal-add" onclick="havenShowFileForm('${dateStr}')" title="File leave for this date">+</div>`;
      }

      html += '</div>';
    }
    html += '</div>';

    // Move to next week
    currentMonday = havenAddWeeks(currentMonday, 1);
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

// ─── Leave Detail Popup (with approve/reject actions) ─────────────────────────
function havenShowLeaveDetail(leaveId) {
  const lv = HAVEN.leaves.find(l => l.leave_id === leaveId);
  if (!lv) return;

  const role = havenGetRole();
  const user = typeof currentUser !== 'undefined' ? currentUser : null;

  const canCancel = (role === 'agent' || role === 'tl') && lv.status === 'Pending TL' && user && lv.ohr_id === user.ohr_id;
  const canTLApprove = role === 'tl' && lv.status === 'Pending TL' && user && lv.ohr_id !== user.ohr_id;
  const canOMApprove = role === 'om' && lv.status === 'Pending OM';

  const formBody = document.getElementById('haven-form-body');
  const formTitle = document.getElementById('haven-form-title');
  const formFooter = document.getElementById('haven-form-footer');
  if (!formBody || !formTitle || !formFooter) return;

  formTitle.textContent = 'Leave Details';

  const statusBadge = `<span class="module-status-badge" style="background:${havenStatusColor(lv.status)}20;color:${havenStatusColor(lv.status)};border:1px solid ${havenStatusColor(lv.status)}40;">${escapeHtml(lv.status || '')}</span>`;

  formBody.innerHTML = `
    <div class="haven-detail-grid">
      <div class="haven-detail-row"><span class="haven-detail-label">Status</span><span>${statusBadge}</span></div>
      <div class="haven-detail-row"><span class="haven-detail-label">Employee</span><span>${escapeHtml(lv.full_name || '—')}</span></div>
      <div class="haven-detail-row"><span class="haven-detail-label">OHR</span><span>${escapeHtml(lv.ohr_id || '—')}</span></div>
      <div class="haven-detail-row"><span class="haven-detail-label">Date</span><span>${escapeHtml(lv.start_date || '—')}</span></div>
      <div class="haven-detail-row"><span class="haven-detail-label">Leave Type</span><span>${escapeHtml(lv.leave_type || '—')}</span></div>
      <div class="haven-detail-row"><span class="haven-detail-label">Reason</span><span>${escapeHtml(lv.reason || '—')}</span></div>
      <div class="haven-detail-row"><span class="haven-detail-label">Supervisor</span><span>${escapeHtml(lv.supervisor || '—')}</span></div>
      ${lv.tl_reviewer ? `<div class="haven-detail-row"><span class="haven-detail-label">TL Reviewer</span><span>${escapeHtml(lv.tl_reviewer)}</span></div>` : ''}
      ${lv.om_reviewer ? `<div class="haven-detail-row"><span class="haven-detail-label">OM Reviewer</span><span>${escapeHtml(lv.om_reviewer)}</span></div>` : ''}
      ${lv.rejection_reason ? `<div class="haven-detail-row"><span class="haven-detail-label">Rejection Reason</span><span style="color:#dc2626;">${escapeHtml(lv.rejection_reason)}</span></div>` : ''}
      <div class="haven-detail-row"><span class="haven-detail-label">Filed</span><span>${lv.created_at ? new Date(lv.created_at).toLocaleString() : '—'}</span></div>
    </div>
  `;

  let footerHtml = '';
  if (canTLApprove) {
    footerHtml += `<button class="btn btn-success btn-sm" onclick="havenSingleApprove('${escapeHtml(lv.leave_id)}')">Approve</button>`;
    footerHtml += `<button class="btn btn-danger btn-sm" onclick="havenSingleReject('${escapeHtml(lv.leave_id)}')">Reject</button>`;
  } else if (canOMApprove) {
    footerHtml += `<button class="btn btn-success btn-sm" onclick="havenSingleApprove('${escapeHtml(lv.leave_id)}')">Approve</button>`;
    footerHtml += `<button class="btn btn-danger btn-sm" onclick="havenSingleReject('${escapeHtml(lv.leave_id)}')">Reject</button>`;
  } else if (canCancel) {
    footerHtml += `<button class="btn btn-danger btn-sm" onclick="havenCancelLeave('${escapeHtml(lv.leave_id)}')">Cancel Leave</button>`;
  }
  footerHtml += `<button class="btn btn-outline btn-sm" onclick="havenCloseForm()">Close</button>`;
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

  const formBody = document.getElementById('haven-form-body');
  const formTitle = document.getElementById('haven-form-title');
  const formFooter = document.getElementById('haven-form-footer');
  if (!formBody) return;

  formTitle.textContent = `Leaves on ${new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;

  let html = '<div class="haven-day-list">';
  for (const lv of dayLeaves) {
    const statusClass = havenStatusClass(lv.status);
    html += `<div class="haven-day-item ${statusClass}" onclick="havenShowLeaveDetail('${escapeHtml(lv.leave_id)}')">
      <span class="haven-day-item-name">${escapeHtml(lv.full_name || '—')}</span>
      <span class="haven-day-item-type">${escapeHtml(lv.leave_type || '')}</span>
      <span class="haven-day-item-status">${escapeHtml(lv.status || '')}</span>
    </div>`;
  }
  html += '</div>';

  // Bulk actions
  const tier = role === 'tl' ? 'tl' : 'om';
  const actionableStatus = role === 'tl' ? 'Pending TL' : 'Pending OM';
  const actionable = dayLeaves.filter(l => l.status === actionableStatus);

  let bulkHtml = '';
  if ((role === 'tl' || role === 'om') && actionable.length > 0) {
    const ids = actionable.map(l => l.leave_id);
    bulkHtml = `
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);display:flex;gap:8px;align-items:center;">
        <span style="font-size:12px;color:var(--fg-muted);">${actionable.length} pending:</span>
        <button class="btn btn-success btn-xs" onclick="havenBulkApproveList(${JSON.stringify(ids).replace(/"/g, '&quot;')})">Approve All</button>
        <button class="btn btn-danger btn-xs" onclick="havenBulkRejectList(${JSON.stringify(ids).replace(/"/g, '&quot;')})">Reject All</button>
      </div>
    `;
  }

  formBody.innerHTML = html + bulkHtml;
  formFooter.innerHTML = `<button class="btn btn-outline btn-sm" onclick="havenCloseForm()">Close</button>`;
  havenOpenForm();
}

// ─── File Leave Form ───────────────────────────────────────────────────────────
function havenShowFileForm(prefillDate) {
  const user = typeof currentUser !== 'undefined' ? currentUser : null;
  if (!user) { showToast('Please log in first', 'error'); return; }

  const role = havenGetRole();
  const formBody = document.getElementById('haven-form-body');
  const formTitle = document.getElementById('haven-form-title');
  const formFooter = document.getElementById('haven-form-footer');
  if (!formBody) return;

  formTitle.textContent = 'File Leave Request';

  const leaveTypeField = (role === 'tl')
    ? `<div class="form-group">
        <label class="form-label">Leave Type <span class="required">*</span></label>
        <select class="form-select" id="haven-file-type">
          <option value="">Select type...</option>
          <option value="PTO">PTO</option>
          <option value="CTO">CTO</option>
        </select>
      </div>`
    : `<div class="form-group">
        <label class="form-label">Leave Type <span class="required">*</span></label>
        <select class="form-select" id="haven-file-type">
          <option value="">Select type...</option>
          <option value="PL">Planned Leave (PL)</option>
          <option value="CO">Comp Off (CO)</option>
          <option value="PH">Public Holiday (PH)</option>
        </select>
      </div>`;

  formBody.innerHTML = `
    <div class="form-group">
      <label class="form-label">Date <span class="required">*</span></label>
      <input type="date" class="form-input" id="haven-file-date" value="${prefillDate || havenGetTodayPHT()}">
    </div>
    ${leaveTypeField}
    <div class="form-group">
      <label class="form-label">Reason</label>
      <textarea class="form-input" id="haven-file-reason" rows="3" placeholder="Optional reason..."></textarea>
    </div>
  `;

  formFooter.innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="havenCloseForm()">Cancel</button>
    <button class="btn btn-primary btn-sm" onclick="havenSubmitLeave()">Submit</button>
  `;

  havenOpenForm();
}

function havenSubmitLeave() {
  const dateVal = document.getElementById('haven-file-date')?.value;
  const typeVal = document.getElementById('haven-file-type')?.value;
  const reasonVal = document.getElementById('haven-file-reason')?.value || '';

  if (!dateVal) { showToast('Please select a date', 'error'); return; }
  if (!typeVal) { showToast('Please select a leave type', 'error'); return; }

  havenConfirm(`File a <b>${escapeHtml(typeVal)}</b> leave for <b>${dateVal}</b>?`, async () => {
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
        havenRefreshCalendar();
      } else {
        showToast('Error: ' + (result.error || 'Unknown'), 'error');
      }
    } catch (e) {
      showToast('Network error', 'error');
    }
  });
}

// ─── Cancel Leave ──────────────────────────────────────────────────────────────
function havenCancelLeave(leaveId) {
  havenConfirm('Are you sure you want to <b>cancel</b> this leave request?', async () => {
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
        havenRefreshCalendar();
      } else {
        showToast('Error: ' + (result.error || 'Unknown'), 'error');
      }
    } catch (e) {
      showToast('Network error', 'error');
    }
  });
}

// ─── Single Approve/Reject ─────────────────────────────────────────────────────
function havenSingleApprove(leaveId) {
  const role = havenGetRole();
  const tier = role === 'tl' ? 'tl' : 'om';
  havenConfirm('Approve this leave request?', async () => {
    await havenDoBulkAction([leaveId], 'approve', tier, '');
  });
}

function havenSingleReject(leaveId) {
  havenShowRejectForm([leaveId]);
}

// ─── Bulk Approve/Reject from Day View ─────────────────────────────────────────
function havenBulkApproveList(ids) {
  if (!ids || ids.length === 0) return;
  const role = havenGetRole();
  const tier = role === 'tl' ? 'tl' : 'om';
  havenConfirm(`Approve <b>${ids.length}</b> leave request(s)?`, async () => {
    await havenDoBulkAction(ids, 'approve', tier, '');
  });
}

function havenBulkRejectList(ids) {
  if (!ids || ids.length === 0) return;
  havenShowRejectForm(ids);
}

// ─── Reject Form (inline remarks) ─────────────────────────────────────────────
function havenShowRejectForm(leaveIds) {
  const role = havenGetRole();
  const tier = role === 'tl' ? 'tl' : 'om';

  const formBody = document.getElementById('haven-form-body');
  const formTitle = document.getElementById('haven-form-title');
  const formFooter = document.getElementById('haven-form-footer');
  if (!formBody) return;

  formTitle.textContent = `Reject ${leaveIds.length} Leave Request(s)`;
  formBody.innerHTML = `
    <div class="form-group">
      <label class="form-label">Remarks (optional)</label>
      <textarea class="form-input" id="haven-reject-remarks" rows="3" placeholder="Reason for rejection..."></textarea>
    </div>
  `;
  formFooter.innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="havenCloseForm()">Cancel</button>
    <button class="btn btn-danger btn-sm" onclick="havenDoReject()">Reject</button>
  `;

  HAVEN._rejectIds = leaveIds;
  HAVEN._rejectTier = tier;
  havenOpenForm();
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

// ─── Confirmation Dialog ───────────────────────────────────────────────────────
function havenConfirm(message, callback) {
  const overlay = document.getElementById('haven-confirm-overlay');
  const msg = document.getElementById('haven-confirm-msg');
  if (!overlay || !msg) { callback(); return; }
  msg.innerHTML = message;
  HAVEN.confirmCallback = callback;
  overlay.style.display = 'flex';
}

function havenConfirmYes() {
  document.getElementById('haven-confirm-overlay').style.display = 'none';
  if (HAVEN.confirmCallback) {
    HAVEN.confirmCallback();
    HAVEN.confirmCallback = null;
  }
}

function havenConfirmCancel() {
  document.getElementById('haven-confirm-overlay').style.display = 'none';
  HAVEN.confirmCallback = null;
}

// ─── Expose globally ───────────────────────────────────────────────────────────
window.initHaven = initHaven;
window.havenShowFileForm = havenShowFileForm;
window.havenSubmitLeave = havenSubmitLeave;
window.havenCancelLeave = havenCancelLeave;
window.havenShowLeaveDetail = havenShowLeaveDetail;
window.havenShowDayLeaves = havenShowDayLeaves;
window.havenCloseForm = havenCloseForm;
window.havenOpenForm = havenOpenForm;
window.havenConfirmYes = havenConfirmYes;
window.havenConfirmCancel = havenConfirmCancel;
window.havenSingleApprove = havenSingleApprove;
window.havenSingleReject = havenSingleReject;
window.havenBulkApproveList = havenBulkApproveList;
window.havenBulkRejectList = havenBulkRejectList;
window.havenDoReject = havenDoReject;
window.havenScrollToToday = havenScrollToToday;
