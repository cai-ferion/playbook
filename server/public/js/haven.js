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

// ─── Continuous Calendar Rendering ─────────────────────────────────────────────
function havenRenderContinuous() {
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
  // OMs see all

  let html = '';
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
      const dayLeaves = visibleLeaves.filter(l => l.start_date === dateStr);
      const isToday = dateStr === todayStr;
      const isWeekend = (i === 0 || i === 1); // Sat, Sun (first two columns)

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
  const canCancel = (role === 'agent' || role === 'tl') && lv.status === 'Pending TL' && user && lv.ohr_id === user.ohr_id;
  const canTLApprove = role === 'tl' && lv.status === 'Pending TL' && user && lv.ohr_id !== user.ohr_id;
  const canOMApprove = role === 'om' && (lv.status === 'Pending OM' || lv.status === 'Pending TL') && user && lv.ohr_id !== user.ohr_id;
  const formBody = document.getElementById('haven-form-body');
  const formTitle = document.getElementById('haven-form-title');
  const formFooter = document.getElementById('haven-form-footer');
  if (!formBody || !formTitle || !formFooter) return;
  formTitle.textContent = 'Leave Details';
  const statusBadge = `<span class="module-status-badge" style="background:${havenStatusColor(lv.status)}20;color:${havenStatusColor(lv.status)};border:1px solid ${havenStatusColor(lv.status)}40;">${escapeHtml(lv.status || '')}</span>`;
  formBody.innerHTML = `
    <div class="haven-detail-grid">
      <div class="haven-detail-row"><span class="haven-detail-label">Status</span><span>${statusBadge}</span></div>
      <div class="haven-detail-row"><span class="haven-detail-label">Employee</span><span>${escapeHtml(lv.full_name || '\u2014')}</span></div>
      <div class="haven-detail-row"><span class="haven-detail-label">OHR</span><span>${escapeHtml(lv.ohr_id || '\u2014')}</span></div>
      <div class="haven-detail-row"><span class="haven-detail-label">Date</span><span>${escapeHtml(lv.start_date || '\u2014')}</span></div>
      <div class="haven-detail-row"><span class="haven-detail-label">Leave Type</span><span>${escapeHtml(lv.leave_type || '\u2014')}</span></div>
      <div class="haven-detail-row"><span class="haven-detail-label">Reason</span><span>${escapeHtml(lv.reason || '\u2014')}</span></div>
      <div class="haven-detail-row"><span class="haven-detail-label">Supervisor</span><span>${escapeHtml(lv.supervisor || '\u2014')}</span></div>
      
      ${lv.om_reviewer ? `<div class="haven-detail-row"><span class="haven-detail-label">Operations Manager</span><span>${escapeHtml(lv.om_reviewer)}</span></div>` : ''}
      ${lv.rejection_reason ? `<div class="haven-detail-row"><span class="haven-detail-label">Rejection Reason</span><span style="color:#dc2626;">${escapeHtml(lv.rejection_reason)}</span></div>` : ''}
      <div class="haven-detail-row"><span class="haven-detail-label">Filed</span><span>${lv.created_at ? new Date(lv.created_at).toLocaleString() : '\u2014'}</span></div>
    </div>
    <div id="haven-inline-action-zone"></div>
  `;
  // Footer: action buttons only (no Close — X suffices)
  let footerHtml = '';
  if (canTLApprove || canOMApprove) {
    footerHtml += `<button class="haven-form-btn haven-form-btn-approve" onclick="havenInlineApprove('${escapeHtml(lv.leave_id)}','${escapeHtml(lv.status)}')">Approve</button>`;
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
  const formBody = document.getElementById('haven-form-body');
  const formTitle = document.getElementById('haven-form-title');
  const formFooter = document.getElementById('haven-form-footer');
  if (!formBody) return;
  formTitle.textContent = `Leaves on ${new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;
  let html = '<div class="haven-day-list">';
  for (const lv of dayLeaves) {
    const statusClass = havenStatusClass(lv.status);
    html += `<div class="haven-day-item ${statusClass}" onclick="havenShowLeaveDetail('${escapeHtml(lv.leave_id)}')">
      <span class="haven-day-item-name">${escapeHtml(lv.full_name || '\u2014')}</span>
      <span class="haven-day-item-type">${escapeHtml(lv.leave_type || '')}</span>
      <span class="haven-day-item-status">${escapeHtml(lv.status || '')}</span>
    </div>`;
  }
  html += '</div>';
  // Bulk actions — group by status so tier is always correct
  let bulkHtml = '';
  if (role === 'tl' || role === 'om') {
    // OM can act on both Pending TL and Pending OM; TL only on Pending TL
    const pendingTL = dayLeaves.filter(l => l.status === 'Pending TL');
    const pendingOM = dayLeaves.filter(l => l.status === 'Pending OM');
    const actionable = role === 'om' ? [...pendingTL, ...pendingOM] : pendingTL;
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
      <input type="date" class="haven-form-input" id="haven-file-date" value="${prefillDate || havenGetTodayPHT()}">
    </div>
    ${leaveTypeField}
    <div class="haven-form-field">
      <label class="haven-form-label">Reason</label>
      <textarea class="haven-form-input haven-form-textarea" id="haven-file-reason" rows="3" placeholder="Brief reason (optional)"></textarea>
    </div>
    <div id="haven-file-confirm-zone"></div>
  `;
  formFooter.innerHTML = `
    <button class="haven-form-btn haven-form-btn-cancel" onclick="havenCloseForm()">Cancel</button>
    <button class="haven-form-btn haven-form-btn-submit" onclick="havenSubmitLeave()">Submit Request</button>
  `;
  havenOpenForm();
}
function havenSubmitLeave() {
  const dateVal = document.getElementById('haven-file-date')?.value;
  const typeEl = document.getElementById('haven-file-type');
  const typeVal = typeEl ? typeEl.value : 'PTO';
  const reasonVal = document.getElementById('haven-file-reason')?.value || '';
  if (!dateVal) { showToast('Please select a date', 'error'); return; }
  if (typeEl && !typeVal) { showToast('Please select a leave type', 'error'); return; }
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
function havenInlineApprove(leaveId, leaveStatus) {
  const zone = document.getElementById('haven-inline-action-zone');
  if (!zone) return;
  // Tier is determined by the leave's current status, not the user's role
  const tier = leaveStatus === 'Pending OM' ? 'om' : 'tl';
  zone.innerHTML = `
    <div class="haven-inline-confirm haven-inline-confirm-success">
      <p class="haven-inline-confirm-msg">Approve this leave request?</p>
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
