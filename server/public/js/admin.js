/**
 * Playbook — Admin Tools
 * Handles file uploads for SRT Status and Billing Code updates,
 * plus locked-out account management.
 * Restricted to admin OHR 740045023.
 */

// ===== Constants =====

const ADMIN_OHR = '740045023';

// Planning group mapping: CSV value -> DB value
const PG_MAPPING = {
  'masa mafsa ctr scaled review': 'S-ABF',
  'cei taskforce ctr': 'CS-ABF',
  'cso ctr': 'CSO_CTR',
  'fad ctr': 'FAD_CTR',
  'sme ctr': 'SME_CTR',
  'qpe ctr': 'QPE_CTR',
  'recall_measurement_ctr': 'RECALL_MEASUREMENT_CTR',
};

// Designation mapping: CSV designation -> billing role
const DESIGNATION_MAPPING = {
  'content reviewer': 'Agent',
  'qa': 'Quality & Policy Expert',
  'sme': 'Operational SME',
  'team lead': 'Team Lead',
  'trainer': 'Trainer',
  'ops manager': 'Team Lead',
  'quality, training, policy manager': 'Quality & Policy Expert',
  'project manager': 'Team Lead',
  'wfm': 'Operational SME',
};

// Billing code lookup: "planningGroup|role" -> code
const BILLING_CODE_TABLE = {
  'S-ABF|Agent': 'MA',
  'S-ABF|Operational SME': 'MS',
  'S-ABF|Quality & Policy Expert': 'MQ',
  'S-ABF|Team Lead': 'SA',
  'CS-ABF|Agent': 'CA',
  'CS-ABF|Operational SME': 'CS',
  'CS-ABF|Quality & Policy Expert': 'CQ',
  'CS-ABF|Team Lead': 'SC',
  'CSO_CTR|Agent': 'SO',
  'CSO_CTR|Operational SME': 'SO',
  'CSO_CTR|Quality & Policy Expert': 'SO',
  'FAD_CTR|Agent': 'FA',
  'FAD_CTR|Operational SME': 'FA',
  'FAD_CTR|Quality & Policy Expert': 'FA',
  'RECALL_MEASUREMENT_CTR|Agent': 'RM',
  'RECALL_MEASUREMENT_CTR|Operational SME': 'RM',
  'RECALL_MEASUREMENT_CTR|Quality & Policy Expert': 'RM',
  'RECALL_MEASUREMENT_CTR|Team Lead': 'SR',
  'SME_CTR|Agent': 'SM',
  'SME_CTR|Operational SME': 'SM',
  'SME_CTR|Quality & Policy Expert': 'SM',
  'QPE_CTR|Agent': 'QP',
  'QPE_CTR|Operational SME': 'QP',
  'QPE_CTR|Quality & Policy Expert': 'QP',
};

// ===== State =====
let srtParsedData = null;
let srtPreviewFilter = 'all'; // 'all', 'changed', 'unchanged'
let billingParsedData = null;

// ===== Helpers =====

function isAdmin() {
  return currentUser && currentUser.ohr_id === ADMIN_OHR;
}

function excelDateToJS(serial) {
  return new Date((serial - 25569) * 86400 * 1000);
}

function formatDate(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function toISODate(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function scientificToFull(sci) {
  if (!sci) return '';
  const s = String(sci).trim();
  if (/^\d+$/.test(s)) return s;
  try {
    const n = Number(s);
    if (isNaN(n)) return s;
    return n.toFixed(0);
  } catch {
    return s;
  }
}

function getMostRecentSaturday() {
  const now = new Date();
  const day = now.getDay();
  const diff = (day + 1) % 7;
  const sat = new Date(now);
  sat.setDate(sat.getDate() - diff);
  sat.setHours(0, 0, 0, 0);
  return sat;
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function lookupBillingCode(pg, role) {
  const key = `${pg}|${role}`;
  if (BILLING_CODE_TABLE[key]) return BILLING_CODE_TABLE[key];
  if (role === 'Team Lead') {
    if (BILLING_CODE_TABLE[key]) return BILLING_CODE_TABLE[key];
    return 'SV';
  }
  if (role === 'Trainer') return 'TR';
  const genericKey = `${pg}|Agent`;
  if (BILLING_CODE_TABLE[genericKey]) return BILLING_CODE_TABLE[genericKey];
  return '';
}

// ===== Locked Out Accounts =====

async function loadLockedAccounts() {
  if (!isAdmin()) return;

  const loadingEl = document.getElementById('lockout-loading');
  const emptyEl = document.getElementById('lockout-empty');
  const wrapperEl = document.getElementById('lockout-table-wrapper');
  const tbody = document.getElementById('lockout-body');

  loadingEl.style.display = 'block';
  emptyEl.style.display = 'none';
  wrapperEl.style.display = 'none';

  try {
    const resp = await fetch(
      `${IO_API_BASE}/employees?is_locked=true&select=ohr_id,full_name,password,is_locked&limit=100`
    );
    const locked = await resp.json();

    loadingEl.style.display = 'none';

    if (!Array.isArray(locked) || locked.length === 0) {
      emptyEl.style.display = 'block';
      wrapperEl.style.display = 'none';
      return;
    }

    tbody.innerHTML = '';
    for (const emp of locked) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(emp.ohr_id)}</td>
        <td>${escapeHtml(emp.full_name || '')}</td>
        <td style="font-family:monospace;font-size:12px;">${escapeHtml(emp.password || '(none)')}</td>
        <td><button class="btn-unlock" onclick="unlockAccount('${escapeHtml(emp.ohr_id)}', this)">Unlock</button></td>
      `;
      tbody.appendChild(tr);
    }

    emptyEl.style.display = 'none';
    wrapperEl.style.display = 'block';
  } catch (err) {
    loadingEl.style.display = 'none';
    emptyEl.textContent = 'Error loading locked accounts.';
    emptyEl.style.display = 'block';
    console.error('Lockout load error:', err);
  }
}

async function unlockAccount(ohr, btn) {
  if (!isAdmin()) return;
  btn.disabled = true;
  btn.textContent = 'Unlocking...';

  try {
    const resp = await fetch(
      `${IO_API_BASE}/employees/${ohr}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_locked: false })
      }
    );
    if (resp.ok) {
      showToast(`Account ${ohr} unlocked successfully.`, 'success');
      // Remove the row
      btn.closest('tr').remove();
      // Check if table is now empty
      const tbody = document.getElementById('lockout-body');
      if (tbody.children.length === 0) {
        document.getElementById('lockout-table-wrapper').style.display = 'none';
        document.getElementById('lockout-empty').style.display = 'block';
      }
    } else {
      showToast('Failed to unlock account.', 'error');
      btn.disabled = false;
      btn.textContent = 'Unlock';
    }
  } catch (err) {
    showToast('Error unlocking account: ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Unlock';
  }
}

// Auto-load locked accounts when switching to admin view
function onAdminViewLoad() {
  if (isAdmin()) {
    loadLockedAccounts();
    loadBackupTables();
  }
}

// ===== SRT Status Upload =====

async function handleSrtFileSelect(event) {
  if (!isAdmin()) return;
  const file = event.target.files[0];
  if (!file) return;

  document.getElementById('srt-file-name').textContent = file.name;
  document.getElementById('srt-result').style.display = 'none';
  document.getElementById('srt-preview').style.display = 'none';

  try {
    showToast('Parsing file...', 'info');
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });

    // Find IO-Working sheet
    let sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('io-working'));
    if (!sheetName) {
      sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('io') && n.toLowerCase().includes('working'));
    }
    if (!sheetName) {
      showToast('Could not find IO-Working sheet in the file.', 'error');
      return;
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

    if (rows.length < 2) {
      showToast('IO-Working sheet is empty.', 'error');
      return;
    }

    const targetSat = getMostRecentSaturday();
    const targetSatSerial = Math.round((targetSat.getTime() / 86400000) + 25569);
    const weekStart = targetSatSerial;
    const weekEnd = targetSatSerial + 6;

    // Build OHR -> status map AND OHR -> SRT ID map
    const ohrStatusMap = new Map();
    const ohrSrtIdMap = new Map();
    let filteredCount = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const dateVal = row[2];
      const ohr = row[4];
      const srtId = row[5];
      const status = row[10];

      if (!ohr) continue;
      const ohrStr = String(Math.round(ohr));

      // Collect OHR -> SRT ID mapping from all rows
      if (srtId) {
        const srtIdStr = String(typeof srtId === 'number' ? Math.round(srtId) : srtId).trim();
        if (srtIdStr && srtIdStr !== '0') {
          ohrSrtIdMap.set(ohrStr, srtIdStr);
        }
      }

      if (!dateVal || !status) continue;
      const dateSerial = typeof dateVal === 'number' ? Math.round(dateVal) : null;
      if (!dateSerial) continue;

      if (dateSerial >= weekStart && dateSerial <= weekEnd) {
        filteredCount++;
        ohrStatusMap.set(ohrStr, status);
      }
    }

    if (ohrStatusMap.size === 0) {
      showToast(`No data found for week starting ${formatDate(targetSat)}. Found ${rows.length - 1} total rows.`, 'warning');
      return;
    }

    // Fetch current employee data
    const empResp = await fetch(
      `${IO_API_BASE}/employees?select=ohr_id,full_name,srt_status,srt_id&limit=1000`
    );
    const employees = await empResp.json();
    const empMap = new Map();
    employees.forEach(e => empMap.set(e.ohr_id, e));

    // Build changes list — include ALL employees from io_employees
    const changes = [];
    // First add employees that appear in the uploaded file
    const processedOhrs = new Set();
    for (const [ohr, newStatus] of ohrStatusMap) {
      const emp = empMap.get(ohr);
      if (emp) {
        processedOhrs.add(ohr);
        changes.push({
          ohr,
          name: emp.full_name || ohr,
          currentStatus: emp.srt_status || '(empty)',
          newStatus,
          changed: emp.srt_status !== newStatus
        });
      }
    }
    // Then add ALL remaining employees not in the file (so we can see who has blank status)
    for (const emp of employees) {
      if (!processedOhrs.has(emp.ohr_id)) {
        changes.push({
          ohr: emp.ohr_id,
          name: emp.full_name || emp.ohr_id,
          currentStatus: emp.srt_status || '(empty)',
          newStatus: emp.srt_status || '(empty)',
          changed: false,
          notInFile: true
        });
      }
    }

    // Build SRT ID fix list
    const srtIdFixes = [];
    for (const [ohr, newSrtId] of ohrSrtIdMap) {
      const emp = empMap.get(ohr);
      if (emp) {
        const currentSrtId = emp.srt_id || '';
        if (currentSrtId !== newSrtId) {
          srtIdFixes.push({ ohr, name: emp.full_name || ohr, oldSrtId: currentSrtId || '(empty)', newSrtId });
        }
      }
    }

    // Sort: changed first, then by name
    changes.sort((a, b) => {
      if (a.changed !== b.changed) return a.changed ? -1 : 1;
      return (a.name || '').localeCompare(b.name || '');
    });

    srtParsedData = { changes, srtIdFixes, weekStart: formatDate(targetSat) };
    srtPreviewFilter = 'all';

    // Render preview
    renderSrtPreview();

    document.getElementById('srt-preview').style.display = 'block';
    const changedCount = changes.filter(c => c.changed).length;
    showToast(`Parsed ${ohrStatusMap.size} employees, ${changedCount} status changes, ${srtIdFixes.length} SRT ID fixes.`, 'success');

  } catch (err) {
    console.error('SRT parse error:', err);
    showToast('Error parsing file: ' + err.message, 'error');
  }
}

let srtNameSearch = '';

function renderSrtPreview() {
  if (!srtParsedData) return;

  const { changes, srtIdFixes } = srtParsedData;
  const changedCount = changes.filter(c => c.changed).length;
  const unchangedCount = changes.filter(c => !c.changed && !c.notInFile).length;
  const blankCount = changes.filter(c => c.currentStatus === '(empty)').length;
  const notInFileCount = changes.filter(c => c.notInFile).length;

  // Stats
  const statsEl = document.getElementById('srt-preview-stats');
  statsEl.innerHTML = `
    <span class="stat-item">Week Starting: <strong>${srtParsedData.weekStart}</strong></span>
    <span class="stat-item">Total Employees: <strong>${changes.length}</strong></span>
    <span class="stat-item">Status Changes: <strong>${changedCount}</strong></span>
    <span class="stat-item">Blank Status: <strong>${blankCount}</strong></span>
    <span class="stat-item">SRT ID Fixes: <strong>${srtIdFixes.length}</strong></span>
  `;

  // Filter buttons
  const filtersEl = document.getElementById('srt-preview-filters');
  filtersEl.innerHTML = `
    <button class="srt-filter-btn ${srtPreviewFilter === 'all' ? 'active' : ''}" onclick="setSrtFilter('all')">All (${changes.length})</button>
    <button class="srt-filter-btn ${srtPreviewFilter === 'changed' ? 'active' : ''}" onclick="setSrtFilter('changed')">Changed (${changedCount})</button>
    <button class="srt-filter-btn ${srtPreviewFilter === 'unchanged' ? 'active' : ''}" onclick="setSrtFilter('unchanged')">Unchanged (${unchangedCount})</button>
    <button class="srt-filter-btn ${srtPreviewFilter === 'blank' ? 'active' : ''}" onclick="setSrtFilter('blank')">Blank Status (${blankCount})</button>
    <button class="srt-filter-btn ${srtPreviewFilter === 'notinfile' ? 'active' : ''}" onclick="setSrtFilter('notinfile')">Not In File (${notInFileCount})</button>
    <input type="text" class="srt-name-search" placeholder="Search by name..." value="${escapeAttr(srtNameSearch)}" oninput="srtNameSearch=this.value;renderSrtPreview()">
  `;

  // Filter data
  let filtered = changes;
  if (srtPreviewFilter === 'changed') filtered = changes.filter(c => c.changed);
  else if (srtPreviewFilter === 'unchanged') filtered = changes.filter(c => !c.changed && !c.notInFile);
  else if (srtPreviewFilter === 'blank') filtered = changes.filter(c => c.currentStatus === '(empty)');
  else if (srtPreviewFilter === 'notinfile') filtered = changes.filter(c => c.notInFile);

  // Apply name search
  if (srtNameSearch.trim()) {
    const q = srtNameSearch.trim().toLowerCase();
    filtered = filtered.filter(c => (c.name || '').toLowerCase().includes(q));
  }

  // Table
  const tbody = document.getElementById('srt-preview-body');
  tbody.innerHTML = '';
  for (const c of filtered) {
    const tr = document.createElement('tr');
    const statusClass = c.changed ? 'change-new' : (c.currentStatus === '(empty)' ? 'change-blank' : 'change-same');
    tr.innerHTML = `
      <td>${escapeHtml(c.ohr)}</td>
      <td>${escapeHtml(c.name)}</td>
      <td class="${c.currentStatus === '(empty)' ? 'change-blank' : ''}">${escapeHtml(c.currentStatus)}</td>
      <td class="${statusClass}">${escapeHtml(c.newStatus)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function setSrtFilter(filter) {
  srtPreviewFilter = filter;
  renderSrtPreview();
}

function cancelSrtUpload() {
  srtParsedData = null;
  document.getElementById('srt-preview').style.display = 'none';
  document.getElementById('srt-file-input').value = '';
  document.getElementById('srt-file-name').textContent = 'No file selected';
}

async function applySrtChanges() {
  if (!srtParsedData || !isAdmin()) return;

  const statusChanges = srtParsedData.changes.filter(c => c.changed);
  const srtIdFixes = srtParsedData.srtIdFixes || [];

  if (statusChanges.length === 0 && srtIdFixes.length === 0) {
    showToast('No changes to apply.', 'info');
    return;
  }

  document.getElementById('srt-apply-btn').disabled = true;
  document.getElementById('srt-progress').style.display = 'flex';
  const progressFill = document.getElementById('srt-progress-fill');
  const progressText = document.getElementById('srt-progress-text');

  let success = 0;
  let failed = 0;
  let srtFixed = 0;
  const totalSteps = statusChanges.length + srtIdFixes.length;

  // Step 1: Fix SRT IDs
  for (let i = 0; i < srtIdFixes.length; i++) {
    const fix = srtIdFixes[i];
    try {
      const resp = await fetch(
        `${IO_API_BASE}/employees/${fix.ohr}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ srt_id: fix.newSrtId })
        }
      );
      if (resp.ok) srtFixed++;
      else failed++;
    } catch {
      failed++;
    }
    const pct = Math.round(((i + 1) / totalSteps) * 100);
    progressFill.style.width = pct + '%';
    progressText.textContent = `Fixing SRT IDs: ${i + 1} / ${srtIdFixes.length}`;
  }

  // Step 2: Apply status changes
  for (let i = 0; i < statusChanges.length; i++) {
    const c = statusChanges[i];
    try {
      const resp = await fetch(
        `${IO_API_BASE}/employees/${c.ohr}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ srt_status: c.newStatus })
        }
      );
      if (resp.ok) success++;
      else failed++;
    } catch {
      failed++;
    }
    const pct = Math.round(((srtIdFixes.length + i + 1) / totalSteps) * 100);
    progressFill.style.width = pct + '%';
    progressText.textContent = `Updating status: ${i + 1} / ${statusChanges.length}`;
  }

  document.getElementById('srt-progress').style.display = 'none';
  document.getElementById('srt-apply-btn').disabled = false;

  const resultEl = document.getElementById('srt-result');
  resultEl.style.display = 'block';
  if (failed === 0) {
    resultEl.className = 'admin-result success';
    resultEl.textContent = `Successfully fixed ${srtFixed} SRT ID(s) and updated ${success} employee status(es).`;
  } else {
    resultEl.className = 'admin-result warning';
    resultEl.textContent = `Fixed ${srtFixed} SRT IDs, updated ${success} statuses, failed ${failed}.`;
  }

  if (typeof loadEmployees === 'function') {
    await loadEmployees();
  }


  cancelSrtUpload();
}

// ===== Billing Code Upload =====

async function handleBillingFileSelect(event) {
  if (!isAdmin()) return;
  const file = event.target.files[0];
  if (!file) return;

  document.getElementById('billing-file-name').textContent = file.name;
  document.getElementById('billing-result').style.display = 'none';
  document.getElementById('billing-preview').style.display = 'none';

  try {
    showToast('Parsing CSV...', 'info');
    const text = await file.text();
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);

    if (lines.length < 2) {
      showToast('CSV file is empty.', 'error');
      return;
    }

    function parseCSVLine(line) {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
      result.push(current.trim());
      return result;
    }

    const header = parseCSVLine(lines[0]);
    const idIdx = header.findIndex(h => h.replace(/^\uFEFF/, '').toLowerCase() === 'id');
    const desigIdx = header.findIndex(h => h.toLowerCase() === 'designation');
    const pgIdx = header.findIndex(h => h.toLowerCase() === 'planninggroup');

    if (idIdx === -1 || desigIdx === -1 || pgIdx === -1) {
      showToast(`Missing required columns. Found: id=${idIdx}, designation=${desigIdx}, planningGroup=${pgIdx}`, 'error');
      return;
    }

    const csvRows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      if (cols.length > Math.max(idIdx, desigIdx, pgIdx)) {
        csvRows.push({
          srtId: cols[idIdx],
          designation: cols[desigIdx],
          planningGroup: cols[pgIdx],
        });
      }
    }

    // Fetch all employees with srt_id
    const empResp = await fetch(
      `${IO_API_BASE}/employees?srt_id_not_null=true&select=ohr_id,full_name,srt_id&limit=1000`
    );
    const employees = await empResp.json();

    const srtToEmp = new Map();
    for (const emp of employees) {
      const fullSrtId = scientificToFull(emp.srt_id);
      if (fullSrtId) {
        srtToEmp.set(fullSrtId, emp);
      }
    }

    const mappings = [];
    let matched = 0;
    let unmatched = 0;

    for (const row of csvRows) {
      const srtId = row.srtId.trim();
      const emp = srtToEmp.get(srtId);

      if (!emp) {
        unmatched++;
        continue;
      }

      matched++;
      const pgLower = (row.planningGroup || '').toLowerCase();
      const desigLower = (row.designation || '').toLowerCase();
      const mappedPg = PG_MAPPING[pgLower] || row.planningGroup;
      const mappedRole = DESIGNATION_MAPPING[desigLower] || row.designation;
      const code = lookupBillingCode(mappedPg, mappedRole);

      mappings.push({
        ohr: emp.ohr_id,
        name: emp.full_name || emp.ohr_id,
        srtId,
        designation: row.designation,
        planningGroup: row.planningGroup,
        mappedPg,
        mappedRole,
        code,
      });
    }

    const startDate = getMostRecentSaturday();
    const endDate = addDays(startDate, 27);

    billingParsedData = { mappings, startDate, endDate };

    const withCode = mappings.filter(m => m.code);
    const withoutCode = mappings.filter(m => !m.code);

    const statsEl = document.getElementById('billing-preview-stats');
    statsEl.innerHTML = `
      <span class="stat-item">CSV Rows: <strong>${csvRows.length}</strong></span>
      <span class="stat-item">Matched: <strong>${matched}</strong></span>
      <span class="stat-item">Unmatched: <strong>${unmatched}</strong></span>
      <span class="stat-item">With Code: <strong>${withCode.length}</strong></span>
      <span class="stat-item">No Code: <strong>${withoutCode.length}</strong></span>
    `;

    document.getElementById('billing-date-range').textContent =
      `${formatDate(startDate)} to ${formatDate(endDate)} (4 weeks). Dates beyond this range will be blanked.`;

    const tbody = document.getElementById('billing-preview-body');
    tbody.innerHTML = '';
    for (const m of mappings) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(m.ohr)}</td>
        <td>${escapeHtml(m.name)}</td>
        <td style="font-size:11px;">${escapeHtml(m.srtId)}</td>
        <td>${escapeHtml(m.designation)}</td>
        <td>${escapeHtml(m.planningGroup)}</td>
        <td>${escapeHtml(m.mappedPg)}</td>
        <td>${escapeHtml(m.mappedRole)}</td>
        <td class="${m.code ? 'change-new' : ''}">${escapeHtml(m.code || '(none)')}</td>
      `;
      tbody.appendChild(tr);
    }

    document.getElementById('billing-preview').style.display = 'block';
    showToast(`Parsed ${csvRows.length} rows, ${matched} matched, ${withCode.length} with codes.`, 'success');

  } catch (err) {
    console.error('Billing parse error:', err);
    showToast('Error parsing CSV: ' + err.message, 'error');
  }
}

function cancelBillingUpload() {
  billingParsedData = null;
  document.getElementById('billing-preview').style.display = 'none';
  document.getElementById('billing-file-input').value = '';
  document.getElementById('billing-file-name').textContent = 'No file selected';
}

async function applyBillingChanges() {
  if (!billingParsedData || !isAdmin()) return;

  const { mappings, startDate, endDate } = billingParsedData;
  const withCode = mappings.filter(m => m.code);

  if (withCode.length === 0) {
    showToast('No billing codes to apply.', 'info');
    return;
  }

  document.getElementById('billing-apply-btn').disabled = true;
  document.getElementById('billing-progress').style.display = 'flex';
  const progressFill = document.getElementById('billing-progress-fill');
  const progressText = document.getElementById('billing-progress-text');

  const startISO = toISODate(startDate);
  const endISO = toISODate(endDate);

  let success = 0;
  let failed = 0;
  let blanked = 0;
  const totalSteps = withCode.length + 1;

  for (let i = 0; i < withCode.length; i++) {
    const m = withCode[i];
    try {
      const resp = await fetch(
        `${IO_API_BASE}/attendance/bulk-update?ohr_id=${m.ohr}&log_date_gte=${startISO}&log_date_lte=${endISO}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ billing_code: m.code })
        }
      );
      if (resp.ok) success++;
      else failed++;
    } catch {
      failed++;
    }
    const pct = Math.round(((i + 1) / totalSteps) * 100);
    progressFill.style.width = pct + '%';
    progressText.textContent = `Updating codes: ${i + 1} / ${withCode.length}`;
  }

  // Blank out beyond the 4-week window
  progressText.textContent = 'Blanking codes beyond 4-week window...';
  const beyondISO = toISODate(addDays(endDate, 1));

  try {
    const ohrList = [...new Set(withCode.map(m => m.ohr))];
    for (const ohr of ohrList) {
      try {
        await fetch(
          `${IO_API_BASE}/attendance/bulk-update?ohr_id=${ohr}&log_date_gte=${beyondISO}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ billing_code: '' })
          }
        );
        blanked++;
      } catch { /* Non-critical */ }
    }
  } catch (err) {
    console.error('Blanking error:', err);
  }

  progressFill.style.width = '100%';
  progressText.textContent = 'Complete!';

  setTimeout(() => {
    document.getElementById('billing-progress').style.display = 'none';
    document.getElementById('billing-apply-btn').disabled = false;

    const resultEl = document.getElementById('billing-result');
    resultEl.style.display = 'block';
    if (failed === 0) {
      resultEl.className = 'admin-result success';
      resultEl.textContent = `Successfully updated billing codes for ${success} employee(s) from ${formatDate(startDate)} to ${formatDate(endDate)}. Blanked codes for ${blanked} employee(s) beyond the window.`;
    } else {
      resultEl.className = 'admin-result warning';
      resultEl.textContent = `Updated ${success}, failed ${failed}. Blanked ${blanked} beyond window.`;
    }

    cancelBillingUpload();

  }, 500);
}

// ===== Database Backup / Export =====

async function loadBackupTables() {
  if (!isAdmin()) return;

  const loadingEl = document.getElementById('backup-loading');
  const wrapperEl = document.getElementById('backup-table-wrapper');
  const tbody = document.getElementById('backup-body');
  const resultEl = document.getElementById('backup-result');

  loadingEl.style.display = 'block';
  wrapperEl.style.display = 'none';
  resultEl.style.display = 'none';

  try {
    const resp = await fetch(`${IO_API_BASE}/backup/tables`);
    const tables = await resp.json();

    loadingEl.style.display = 'none';

    if (!Array.isArray(tables) || tables.length === 0) {
      resultEl.textContent = 'No tables found.';
      resultEl.className = 'admin-result warning';
      resultEl.style.display = 'block';
      return;
    }

    tbody.innerHTML = '';
    let totalRecords = 0;
    for (const t of tables) {
      totalRecords += t.count;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family:monospace;font-size:13px;">${escapeHtml(t.name)}</td>
        <td style="text-align:right;font-weight:600;">${Number(t.count).toLocaleString()}</td>
        <td><button class="btn-unlock" onclick="exportSingleTable('${escapeHtml(t.name)}', this)" style="font-size:12px;">Download CSV</button></td>
      `;
      tbody.appendChild(tr);
    }

    // Add total row
    const totalTr = document.createElement('tr');
    totalTr.style.borderTop = '2px solid var(--border)';
    totalTr.style.fontWeight = '700';
    totalTr.innerHTML = `
      <td>TOTAL</td>
      <td style="text-align:right;">${totalRecords.toLocaleString()}</td>
      <td></td>
    `;
    tbody.appendChild(totalTr);

    wrapperEl.style.display = 'block';
  } catch (err) {
    loadingEl.style.display = 'none';
    resultEl.textContent = 'Error loading table info: ' + err.message;
    resultEl.className = 'admin-result warning';
    resultEl.style.display = 'block';
    console.error('Backup tables error:', err);
  }
}

async function exportSingleTable(tableName, btn) {
  if (!isAdmin()) return;
  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Exporting...';

  try {
    const resp = await fetch(`${IO_API_BASE}/backup/export/${tableName}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `${tableName}_${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`Downloaded ${tableName} as CSV.`, 'success');
  } catch (err) {
    showToast('Export error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
}

async function exportAllTables() {
  if (!isAdmin()) return;
  const resultEl = document.getElementById('backup-result');
  resultEl.textContent = 'Exporting all tables... This may take a moment for large datasets.';
  resultEl.className = 'admin-result';
  resultEl.style.display = 'block';

  try {
    const resp = await fetch(`${IO_API_BASE}/backup/export-all`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `io_backup_${today}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    resultEl.textContent = 'All tables exported successfully.';
    resultEl.className = 'admin-result success';
    showToast('Full backup downloaded.', 'success');
  } catch (err) {
    resultEl.textContent = 'Export error: ' + err.message;
    resultEl.className = 'admin-result warning';
    showToast('Export error: ' + err.message, 'error');
  }
}
