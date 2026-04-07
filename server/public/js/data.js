/**
 * Playbook — Data Layer
 * Data integration, constants, calculations, risk detection.
 * Optimized: loads only the default date range first, then on-demand.
 */

// ===== Constants =====

const TAG_OPTIONS = ['P', 'LATE', 'UPL', 'PL', 'ML', 'WO', 'NYO', 'EXIT'];
const UPL_REASONS = ['Medical', 'Emergency', 'Transportation', 'Weather Constraint', 'Bereavement', 'Personal', 'Other', 'NCNS', 'Exit'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Table columns — reordered per user spec: Tag first, OHR removed, Billing Code last
const TABLE_COLUMNS = [
  { key: 'tag', label: 'Tag', editable: true },
  { key: 'uplReason', label: 'Reason', editable: true },
  { key: 'remarks', label: 'Remarks', editable: true },
  { key: 'ot', label: 'OT', editable: true },
  { key: 'date', label: 'Date' },
  { key: 'agent', label: 'Agent Name' },
  { key: 'flm', label: 'FLM' },
  { key: 'role', label: 'Role' },
  { key: 'actualPlanningGroup', label: 'Planning Group' },
  { key: 'status', label: 'Status' },
  { key: 'shiftTime', label: 'Shift Time' },
  { key: 'billingCode', label: 'Code' },
];

// ===== Application State =====

const appState = {
  records: [],
  originalRecords: [],
  roster: [],
  pendingEdits: {},
  activeView: 'dashboard',
  inputPage: 0,
  inputPageSize: 50,
  isLoading: false,
  lastUpdated: null,
  lastRefreshedTime: null,
  multiSelects: {},
  dashMultiSelects: {},
  alertFilters: { month: 'All', weekEnding: 'All' },
  alertCategory: 'upl_violation',
  blanksFilterActive: false,
  // Track which date ranges have been loaded
  loadedRanges: [],
  allEmployeesLoaded: false,
};

// ===== Utility Functions =====

function getTodayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/**
 * Get the smart end date for data loading: last day of (current month + 1).
 * E.g., if today is March 2026, returns '2026-04-30'.
 */
function getSmartEndDate() {
  const now = new Date();
  const nextMonth = now.getMonth() + 2; // +1 for 0-indexed, +1 for next month
  const year = now.getFullYear() + Math.floor(nextMonth / 12);
  const month = nextMonth % 12;
  // Day 0 of the next-next month gives last day of next month
  const lastDay = new Date(year, month + 1, 0);
  return lastDay.getFullYear() + '-' + String(lastDay.getMonth() + 1).padStart(2, '0') + '-' + String(lastDay.getDate()).padStart(2, '0');
}

function formatNumber(n) {
  return n.toLocaleString();
}

function getWeekEnding(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = (6 - day + 7) % 7;
  const sat = new Date(d);
  sat.setDate(d.getDate() + diff);
  return sat.getFullYear() + '-' + String(sat.getMonth() + 1).padStart(2, '0') + '-' + String(sat.getDate()).padStart(2, '0');
}

function getMonthName(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  const m = parseInt(parts[1], 10);
  return MONTHS[m - 1] || '';
}

function getDayOfWeek(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return DAY_NAMES[d.getDay()];
}

function getCurrentMonthName() {
  return MONTHS[new Date().getMonth()];
}

function getCurrentWeekEnding() {
  return getWeekEnding(getTodayStr());
}

function generateConcat(dateStr, ohr) {
  return dateStr + '_' + ohr;
}

/**
 * Format date string for display: "Mon, 02/14"
 */
function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const day = dayNames[d.getDay()];
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${day}, ${mm}/${dd}`;
}

// ===== KPI Calculations =====
// Blank tags are treated as "P" in all calculations

function getEffectiveTag(tag) {
  const t = (tag || '').trim();
  return t === '' ? 'P' : t;
}

function calculateKPIs(records) {
  let pCount = 0, lateCount = 0, uplCount = 0, plCount = 0, mlCount = 0;
  let totalOT = 0;

  for (const r of records) {
    const tag = getEffectiveTag(r.tag);
    if (tag === 'P') pCount++;
    else if (tag === 'LATE') lateCount++;
    else if (tag === 'UPL') uplCount++;
    else if (tag === 'PL') plCount++;
    else if (tag === 'ML') mlCount++;
    if (r.ot && !isNaN(parseFloat(r.ot))) totalOT += parseFloat(r.ot);
  }

  const denominator = pCount + lateCount + uplCount;
  const shrinkageRate = denominator > 0 ? (uplCount / denominator) * 100 : 0;

  return {
    scheduled: records.length,
    pCount, lateCount, uplCount, plCount, mlCount,
    shrinkageRate, totalOT,
  };
}

function getShiftBreakdown(records) {
  const shifts = {};

  for (const r of records) {
    const shift = r.shiftTime || 'Unknown';
    const pg = r.actualPlanningGroup || 'Unknown';
    const tag = getEffectiveTag(r.tag);

    if (!shifts[shift]) shifts[shift] = { workflows: {}, overall: { schedule: 0, present: 0, upl: 0, late: 0 } };
    if (!shifts[shift].workflows[pg]) shifts[shift].workflows[pg] = { schedule: 0, present: 0, upl: 0, late: 0 };

    const wf = shifts[shift].workflows[pg];
    const ov = shifts[shift].overall;

    wf.schedule++;
    ov.schedule++;

    if (tag === 'P') { wf.present++; ov.present++; }
    else if (tag === 'LATE') { wf.late++; ov.late++; }
    else if (tag === 'UPL') { wf.upl++; ov.upl++; }
  }

  return shifts;
}

function getFLMBreakdown(records) {
  const flms = {};

  for (const r of records) {
    const flm = r.flm || 'Unknown';
    const tag = getEffectiveTag(r.tag);

    if (!flms[flm]) flms[flm] = { name: flm, schedule: 0, present: 0, upl: 0, late: 0, pl: 0, ml: 0, ot: 0 };
    const f = flms[flm];
    f.schedule++;

    if (tag === 'P') f.present++;
    else if (tag === 'LATE') f.late++;
    else if (tag === 'UPL') f.upl++;
    else if (tag === 'PL') f.pl++;
    else if (tag === 'ML') f.ml++;

    if (r.ot && !isNaN(parseFloat(r.ot))) f.ot += parseFloat(r.ot);
  }

  return Object.values(flms).map(f => {
    const denom = f.present + f.late + f.upl;
    f.shrinkageRate = denom > 0 ? (f.upl / denom) * 100 : 0;
    return f;
  }).sort((a, b) => b.shrinkageRate - a.shrinkageRate);
}

function getUPLLateAgentList(records) {
  return records
    .filter(r => { const t = getEffectiveTag(r.tag); return t === 'UPL' || t === 'LATE'; })
    .map(r => ({
      tag: getEffectiveTag(r.tag),
      agent: r.agent,
      flm: r.flm,
      shiftTime: r.shiftTime,
      planningGroup: r.actualPlanningGroup,
      uplReason: r.uplReason,
      remarks: r.remarks,
    }))
    .sort((a, b) => {
      // Sort: Tag (LATE first), then Shift Time, then Planning Group, then FLM
      if (a.tag !== b.tag) return a.tag === 'LATE' ? -1 : 1;
      const s = (a.shiftTime || '').localeCompare(b.shiftTime || '');
      if (s !== 0) return s;
      const p = (a.planningGroup || '').localeCompare(b.planningGroup || '');
      if (p !== 0) return p;
      return (a.flm || '').localeCompare(b.flm || '');
    });
}

// ===== Risk Detection =====

function detectUPLViolations(records) {
  const filtered = records.filter(r => getEffectiveTag(r.tag) !== 'NYO' && getEffectiveTag(r.tag) !== 'EXIT');
  const grouped = {};
  for (const r of filtered) {
    if (getEffectiveTag(r.tag) === 'UPL') {
      const key = `${r.agent}__${r.month}`;
      if (!grouped[key]) grouped[key] = { agent: r.agent, month: r.month, count: 0 };
      grouped[key].count++;
    }
  }
  const alerts = [];
  for (const entry of Object.values(grouped)) {
    if (entry.count > 3) {
      alerts.push({
        id: `upl_${entry.agent}_${entry.month}`, category: 'upl_violation', agent: entry.agent,
        severity: 'critical', title: `${entry.count} UPL days in ${entry.month}`,
        detail: `${entry.agent} has ${entry.count} UPL days in ${entry.month} (threshold: >3)`,
        count: entry.count, month: entry.month
      });
    }
  }
  return alerts.sort((a, b) => (b.count || 0) - (a.count || 0));
}

function detectNCNSPipeline(records) {
  const filtered = records.filter(r => getEffectiveTag(r.tag) !== 'NYO' && getEffectiveTag(r.tag) !== 'EXIT');
  const grouped = {};
  for (const r of filtered) {
    if (r.uplReason === 'NCNS') {
      grouped[r.agent] = (grouped[r.agent] || 0) + 1;
    }
  }
  const alerts = [];
  for (const [agent, count] of Object.entries(grouped)) {
    if (count >= 4) {
      alerts.push({
        id: `ncns_${agent}`, category: 'ncns_pipeline', agent,
        severity: 'critical', title: 'RTWO Required',
        detail: `${agent} has ${count} cumulative NCNS incidents (threshold: 4)`,
        count
      });
    }
  }
  return alerts.sort((a, b) => (b.count || 0) - (a.count || 0));
}

function detectOffboardingRisk(records) {
  const filtered = records.filter(r => getEffectiveTag(r.tag) !== 'NYO' && getEffectiveTag(r.tag) !== 'EXIT');
  const byAgent = {};
  for (const r of filtered) {
    if (!byAgent[r.agent]) byAgent[r.agent] = [];
    byAgent[r.agent].push(r);
  }
  const alerts = [];
  for (const [agent, agentRecords] of Object.entries(byAgent)) {
    const sorted = agentRecords.filter(r => r.date).sort((a, b) => new Date(a.date) - new Date(b.date));
    let consecutiveUPL = 0;
    for (const r of sorted) {
      const tag = getEffectiveTag(r.tag);
      if (tag === 'WO') continue;
      if (tag === 'UPL') {
        consecutiveUPL++;
        if (consecutiveUPL >= 10) {
          alerts.push({
            id: `offboard_${agent}`, category: 'offboarding_risk', agent,
            severity: 'critical', title: 'Critical Offboarding Risk',
            detail: `${agent} has ${consecutiveUPL} consecutive UPL days (WO excluded)`,
            count: consecutiveUPL
          });
          break;
        }
      } else {
        consecutiveUPL = 0;
      }
    }
  }
  return alerts.sort((a, b) => (b.count || 0) - (a.count || 0));
}

function detectWeeklyLateTrend(records) {
  const filtered = records.filter(r => getEffectiveTag(r.tag) !== 'NYO' && getEffectiveTag(r.tag) !== 'EXIT');
  const grouped = {};
  for (const r of filtered) {
    if (getEffectiveTag(r.tag) === 'LATE') {
      const key = r.agent;
      if (!grouped[key]) grouped[key] = {};
      const we = r.weekEnding || 'Unknown';
      if (!grouped[key][we]) grouped[key][we] = 0;
      grouped[key][we]++;
    }
  }
  const alerts = [];
  for (const [agent, weeks] of Object.entries(grouped)) {
    for (const [weekEnding, count] of Object.entries(weeks)) {
      if (count >= 3) {
        alerts.push({
          id: `wlate_${agent}_${weekEnding}`, category: 'weekly_late', agent,
          severity: 'warning', title: `Weekly Late: ${count} times`,
          detail: `${agent} was late ${count} times in week ending ${weekEnding} (threshold: 3)`,
          count, weekEnding,
          month: getMonthFromWeekEnding(weekEnding)
        });
      }
    }
  }
  return alerts.sort((a, b) => (b.count || 0) - (a.count || 0));
}

function getMonthFromWeekEnding(we) {
  if (!we || we === 'Unknown') return '';
  const [, m] = we.split('-').map(Number);
  return MONTHS[m - 1] || '';
}

function detectMonthlyLateEscalation(records) {
  const filtered = records.filter(r => getEffectiveTag(r.tag) !== 'NYO' && getEffectiveTag(r.tag) !== 'EXIT');
  const grouped = {};
  for (const r of filtered) {
    if (getEffectiveTag(r.tag) === 'LATE') {
      const key = r.agent;
      if (!grouped[key]) grouped[key] = {};
      if (!grouped[key][r.month]) grouped[key][r.month] = 0;
      grouped[key][r.month]++;
    }
  }
  const alerts = [];
  for (const [agent, months] of Object.entries(grouped)) {
    for (const [month, count] of Object.entries(months)) {
      if (count >= 10) {
        alerts.push({
          id: `mlate_${agent}_${month}`, category: 'monthly_late', agent,
          severity: 'critical', title: `Monthly Late Escalation: ${count} times`,
          detail: `${agent} was late ${count} times in ${month} (threshold: 10)`,
          count, month
        });
      }
    }
  }
  return alerts.sort((a, b) => (b.count || 0) - (a.count || 0));
}

function detectActiveML(records) {
  const filtered = records.filter(r => getEffectiveTag(r.tag) !== 'NYO' && getEffectiveTag(r.tag) !== 'EXIT');
  const now = new Date();
  const tenDaysAgo = new Date(now);
  tenDaysAgo.setDate(now.getDate() - 10);

  const windowRecords = filtered.filter(r => {
    if (!r.date) return false;
    const d = new Date(r.date);
    return d >= tenDaysAgo && d <= now;
  });

  const byAgent = {};
  for (const r of windowRecords) {
    if (!byAgent[r.agent]) byAgent[r.agent] = [];
    byAgent[r.agent].push(r);
  }

  const alerts = [];
  for (const [agent, agentRecords] of Object.entries(byAgent)) {
    const hasML = agentRecords.some(r => getEffectiveTag(r.tag) === 'ML');
    if (hasML) {
      const mlDays = agentRecords.filter(r => getEffectiveTag(r.tag) === 'ML').map(r => r.date);
      const woDays = agentRecords.filter(r => getEffectiveTag(r.tag) === 'WO').map(r => r.date);
      alerts.push({
        id: `ml_${agent}`, category: 'active_ml', agent,
        severity: 'info', title: 'Active Maternity Leave',
        detail: `ML days: ${mlDays.join(', ')}${woDays.length > 0 ? ' | WO days: ' + woDays.join(', ') : ''}`,
        count: mlDays.length
      });
    }
  }
  return alerts;
}

function getAllAlerts(records) {
  return {
    upl_violation: detectUPLViolations(records),
    ncns_pipeline: detectNCNSPipeline(records),
    offboarding_risk: detectOffboardingRisk(records),
    weekly_late: detectWeeklyLateTrend(records),
    monthly_late: detectMonthlyLateEscalation(records),
    active_ml: detectActiveML(records),
  };
}

function getTotalAlertCount(alerts) {
  return Object.values(alerts).reduce((sum, arr) => sum + arr.length, 0);
}

function filterAlerts(alertList, monthFilter, weekFilter) {
  let result = alertList;
  if (monthFilter && monthFilter !== 'All') {
    result = result.filter(a => a.month === monthFilter);
  }
  if (weekFilter && weekFilter !== 'All') {
    result = result.filter(a => a.weekEnding === weekFilter);
  }
  return result;
}

// ===== API Service (TiDB via Express) =====

// Base URL for IO API — uses relative path so it works in both dev and production
const IO_API_BASE = '/api/io';

// Build an in-memory employee lookup from io_employees
let employeeLookup = {};

async function loadEmployeeLookup() {
  const resp = await fetch(`${IO_API_BASE}/employees?order=ohr_id&limit=3000`);
  const allEmployees = await resp.json();
  employeeLookup = {};
  for (const emp of allEmployees) {
    employeeLookup[emp.ohr_id] = emp;
  }
  appState.allEmployeesLoaded = true;
  return allEmployees.length;
}

/**
 * Normalize an attendance record (io_attendance joined with io_employees lookup) to our internal format.
 */
function normalizeRecord(att) {
  const emp = employeeLookup[att.ohr_id] || {};
  const dateStr = att.log_date || '';
  return {
    _id: att.id,
    tag: (att.tag || '').trim(),
    billingCode: (att.billing_code || '').trim(),
    uplReason: (att.upl_reason || '').trim(),
    remarks: (att.remarks || '').trim(),
    ot: (att.ot_hours || '').toString().trim(),
    date: dateStr,
    ohr: (att.ohr_id || '').toString().trim(),
    agent: (att.snap_full_name || emp.full_name || '').trim(),
    flm: (att.snap_supervisor || emp.supervisor_name || '').trim(),
    role: (att.snap_actual_role || emp.actual_role || '').trim(),
    actualPlanningGroup: (att.snap_planning_group || emp.planning_group || '').trim(),
    shiftTime: (att.snap_shift_time || emp.shift_time || '').trim(),
    status: (att.snap_status || emp.srt_status || '').trim(),
    completePlanningGroup: (emp.complete_planning_group || '').trim(),
    weekEnding: dateStr ? getWeekEnding(dateStr) : '',
    month: dateStr ? getMonthName(dateStr) : '',
    concat: dateStr ? generateConcat(dateStr, (att.ohr_id || '').toString().trim()) : '',
  };
}

/**
 * Get the total count of attendance records (for progress bar).
 */
async function getAttendanceCount(startDate, endDate) {
  const params = new URLSearchParams({ count_only: 'true' });
  if (startDate) params.set('log_date_gte', startDate);
  if (endDate) params.set('log_date_lte', endDate);
  const resp = await fetch(`${IO_API_BASE}/attendance?${params}`);
  const data = await resp.json();
  return data.count || 0;
}

/**
 * Fetch attendance records for a specific date range with progress callback.
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @param {function} onProgress - callback(loaded, total)
 * @returns {Array} normalized records
 */
async function fetchRecordsForRange(startDate, endDate, onProgress) {
  // Get total count first
  const totalCount = await getAttendanceCount(startDate, endDate);
  if (onProgress) onProgress(0, totalCount);

  const allRecords = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const params = new URLSearchParams({ limit: String(pageSize), offset: String(offset) });
    if (startDate) params.set('log_date_gte', startDate);
    if (endDate) params.set('log_date_lte', endDate);

    const resp = await fetch(`${IO_API_BASE}/attendance?${params}`);
    const data = await resp.json();
    if (!Array.isArray(data) || data.length === 0) break;
    allRecords.push(...data);
    if (onProgress) onProgress(allRecords.length, totalCount);
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  // Normalize
  const normalized = allRecords.map(r => normalizeRecord(r));
  return normalized;
}

/**
 * Fetch records for the default date range (today).
 * This is the fast initial load.
 */
async function fetchDefaultRecords(onProgress) {
  if (!appState.allEmployeesLoaded) {
    await loadEmployeeLookup();
  }
  const today = getTodayStr();
  return await fetchRecordsForRange(today, today, onProgress);
}

/**
 * Fetch records for a custom date range (on-demand).
 * Merges with existing records, avoiding duplicates.
 */
async function fetchAndMergeRecords(startDate, endDate, onProgress) {
  if (!appState.allEmployeesLoaded) {
    await loadEmployeeLookup();
  }
  const newRecords = await fetchRecordsForRange(startDate, endDate, onProgress);

  // Build a set of existing record IDs
  const existingIds = new Set(appState.records.map(r => r._id));

  // Add only new records
  let addedCount = 0;
  for (const r of newRecords) {
    if (!existingIds.has(r._id)) {
      appState.records.push(r);
      addedCount++;
    }
  }

  // Update original records
  appState.originalRecords = JSON.parse(JSON.stringify(appState.records));
  return { total: newRecords.length, added: addedCount };
}

/**
 * Smart fetch — loads records from Jan 1 through current month + 1.
 * This avoids loading empty future months unnecessarily.
 */
async function fetchAllRecords(onProgress) {
  if (!appState.allEmployeesLoaded) {
    await loadEmployeeLookup();
  }
  const smartEnd = getSmartEndDate();
  return await fetchRecordsForRange('2026-01-01', smartEnd, onProgress);
}

/**
 * Legacy fetchRecords for backward compatibility.
 */
async function fetchRecords() {
  try {
    await loadEmployeeLookup();
    const allRecords = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const resp = await fetch(`${IO_API_BASE}/attendance?limit=${pageSize}&offset=${offset}`);
      const data = await resp.json();
      if (!Array.isArray(data) || data.length === 0) break;
      allRecords.push(...data);
      if (data.length < pageSize) break;
      offset += pageSize;
    }
    const normalized = allRecords.map(r => normalizeRecord(r));
    return { success: true, data: normalized, lastUpdated: new Date().toISOString() };
  } catch (err) {
    console.error('API fetch error:', err);
    return { success: false, data: [], lastUpdated: new Date().toISOString() };
  }
}

/**
 * Save edits back to io_attendance table via API.
 */
async function saveRecords(edits) {
  try {
    let successCount = 0;
    let failCount = 0;

    for (const edit of edits) {
      const id = edit._id;
      if (!id) { failCount++; continue; }

      const payload = {};
      if (edit.tag !== undefined) payload.tag = edit.tag;
      if (edit.upl_reason !== undefined) payload.upl_reason = edit.upl_reason;
      if (edit.remarks !== undefined) payload.remarks = edit.remarks;
      if (edit.ot_hours !== undefined) payload.ot_hours = edit.ot_hours;
      if (edit.billing_code !== undefined) payload.billing_code = edit.billing_code;

      const actorHeaders = {};
      if (typeof currentUser !== 'undefined' && currentUser) {
        actorHeaders['x-actor-ohr'] = currentUser.ohr_id || '';
        actorHeaders['x-actor-name'] = currentUser.full_name || '';
      }
      const resp = await fetch(`${IO_API_BASE}/attendance/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...actorHeaders },
        body: JSON.stringify(payload)
      });

      if (resp.ok) {
        successCount++;
      } else {
        failCount++;
        console.error('Save error for id', id, ':', await resp.text());
      }
    }

    if (failCount === 0) {
      return { success: true, message: `${successCount} record(s) saved` };
    } else {
      return { success: successCount > 0, message: `${successCount} saved, ${failCount} failed` };
    }
  } catch (err) {
    return { success: false, message: 'Save failed: ' + err.message };
  }
}

/**
 * Fetch attendance records with server-side pagination, filtering, and sorting.
 * Uses the ?paginated=true mode of the attendance GET endpoint.
 *
 * @param {Object} params - Query parameters
 * @param {string} params.startDate - YYYY-MM-DD
 * @param {string} params.endDate - YYYY-MM-DD
 * @param {number} params.limit - rows per page (default 50)
 * @param {number} params.offset - row offset
 * @param {string} [params.sortBy] - column key to sort by
 * @param {string} [params.sortDir] - 'asc' or 'desc'
 * @param {Object} [params.filters] - { tag_in, agent_in, flm_in, planning_group_in, billing_code_in, status_in, shift_time_in, role_in, blanks_only }
 * @returns {{ rows: Array, total: number }}
 */
async function fetchPaginatedAttendance({ startDate, endDate, limit = 50, offset = 0, sortBy, sortDir, filters = {} }) {
  const params = new URLSearchParams({
    paginated: 'true',
    limit: String(limit),
    offset: String(offset),
  });

  if (startDate) params.set('log_date_gte', startDate);
  if (endDate) params.set('log_date_lte', endDate);
  if (sortBy) params.set('sort_by', sortBy);
  if (sortDir) params.set('sort_dir', sortDir);

  // Multi-value filters
  if (filters.tag_in) params.set('tag_in', filters.tag_in);
  if (filters.agent_in) params.set('agent_in', filters.agent_in);
  if (filters.flm_in) params.set('flm_in', filters.flm_in);
  if (filters.planning_group_in) params.set('planning_group_in', filters.planning_group_in);
  if (filters.billing_code_in) params.set('billing_code_in', filters.billing_code_in);
  if (filters.status_in) params.set('status_in', filters.status_in);
  if (filters.shift_time_in) params.set('shift_time_in', filters.shift_time_in);
  if (filters.role_in) params.set('role_in', filters.role_in);
  if (filters.blanks_only) params.set('blanks_only', 'true');

  const resp = await fetch(`${IO_API_BASE}/attendance?${params}`);
  if (!resp.ok) throw new Error('Failed to fetch paginated attendance');
  const data = await resp.json();

  // Normalize the rows
  const rows = (data.rows || []).map(att => normalizeRecord(att));
  return { rows, total: data.total || 0 };
}
