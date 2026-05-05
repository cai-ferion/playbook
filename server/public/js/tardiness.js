/**
 * Tardiness Validator — Client Module (Restyled)
 * Handles: Admin CSV upload, Validator table with inline validation,
 * summary stats strip, refined filter UX, modal-based validation.
 * Weekly cadence: Saturday to Friday.
 */

/* global currentUser, showToast */

/** Safe accessor for the global currentUser set by app.js */
function _cu() { return (typeof currentUser !== 'undefined') ? currentUser : null; }

// ============================================================
// State
// ============================================================
const TARD_STATE = {
  items: [],
  allItems: [],          // unfiltered for stats
  selectedIds: new Set(),
  isAdmin: false,
  weekEndings: [],
  planningGroups: [],
  searchTimer: null,
  myTeamOnly: false,
  page: 1,
  pageSize: 30,
};

// ============================================================
// Admin Upload
// ============================================================
// Immediately wire up file-input listener (script is lazy-loaded after DOM ready)
(function() {
  const fileInput = document.getElementById("tardiness-csv-input");
  const uploadBtn = document.getElementById("tardiness-upload-btn");
  if (fileInput && uploadBtn) {
    fileInput.addEventListener("change", () => {
      uploadBtn.disabled = !fileInput.files || fileInput.files.length === 0;
    });
  }
})();

async function tardinessUploadCSV() {
  const fileInput = document.getElementById("tardiness-csv-input");
  const progressEl = document.getElementById("tardiness-upload-progress");
  const progressFill = document.getElementById("tardiness-upload-progress-fill");
  const progressText = document.getElementById("tardiness-upload-progress-text");
  const resultEl = document.getElementById("tardiness-upload-result");
  const statusBadge = document.getElementById("tardiness-upload-status");

  if (!fileInput || !fileInput.files || fileInput.files.length === 0) return;
  const file = fileInput.files[0];

  progressEl.style.display = "block";
  resultEl.style.display = "none";
  progressFill.style.width = "10%";
  progressText.textContent = "Parsing file...";

  try {
    let records = [];
    const ext = file.name.split(".").pop().toLowerCase();

    if (ext === "csv") {
      const text = await file.text();
      records = parseCSVToRecords(text);
    } else if (ext === "xlsx" || ext === "xls") {
      if (typeof XLSX === "undefined") {
        throw new Error("XLSX library not loaded. Please upload a CSV file instead.");
      }
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
      records = json;
    } else {
      throw new Error("Unsupported file type. Please upload a .csv or .xlsx file.");
    }

    if (records.length === 0) throw new Error("No records found in file.");

    progressFill.style.width = "30%";
    progressText.textContent = `Parsed ${records.length} rows. Uploading...`;

    records = records.map(r => {
      const norm = {};
      for (const [k, v] of Object.entries(r)) {
        const key = k.trim().toLowerCase().replace(/\s+/g, "_");
        if (key === "ohr" || key === "ohr_id") norm.ohr = v;
        else if (key === "name" || key === "employee_name" || key === "full_name") norm.name = v;
        else if (key === "date") norm.date = v;
        else if (key === "roster_login" || key === "roaster_login") norm.roster_login = v;
        else if (key === "roster_logout" || key === "roaster_logout") norm.roster_logout = v;
        else if (key === "actual_login") norm.actual_login = v;
        else if (key === "actual_logout") norm.actual_logout = v;
        else norm[key] = v;
      }
      return norm;
    });

    const BATCH_SIZE = 500;
    let totalInserted = 0, totalSkipped = 0, totalEnriched = 0;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const pct = Math.round(30 + (i / records.length) * 60);
      progressFill.style.width = pct + "%";
      progressText.textContent = `Uploading batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(records.length / BATCH_SIZE)}...`;

      const resp = await fetch("/api/io/tardiness/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-actor-ohr": _cu()?.ohr_id || "",
          "x-actor-name": _cu()?.full_name || "",
        },
        body: JSON.stringify({ records: batch }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Upload failed");
      totalInserted += data.inserted || 0;
      totalSkipped += data.skipped || 0;
      totalEnriched += data.enriched || 0;
    }

    progressFill.style.width = "100%";
    progressText.textContent = "Upload complete!";

    resultEl.style.display = "block";
    resultEl.innerHTML = `<div style="padding:8px 12px;background:var(--bg-success,#0d2818);border:1px solid var(--success);border-radius:6px;font-size:13px;">
      <strong>Upload Complete</strong><br>
      Total rows: ${records.length} | Imported: <strong>${totalInserted}</strong> | Skipped (duplicates/on-time): ${totalSkipped} | Enriched from roster: ${totalEnriched}
    </div>`;

    if (statusBadge) {
      statusBadge.textContent = `${totalInserted} imported`;
      statusBadge.style.background = "var(--success)";
      statusBadge.style.color = "#fff";
    }

    if (totalInserted > 0 && typeof createNotification === 'function') {
      createNotification({
        type: 'tardiness_uploaded',
        title: 'Tardiness Data Uploaded',
        message: `${totalInserted} tardiness records uploaded`,
        target_ohr: _cu()?.ohr_id || '',
        actor_ohr: _cu()?.ohr_id || '',
        actor_name: _cu()?.full_name || '',
        metadata: JSON.stringify({ count: totalInserted, uploader: _cu()?.full_name || '' })
      });
    }

    fileInput.value = "";
    document.getElementById("tardiness-upload-btn").disabled = true;
  } catch (err) {
    progressFill.style.width = "100%";
    progressFill.style.background = "var(--danger)";
    progressText.textContent = "Upload failed";
    resultEl.style.display = "block";
    resultEl.innerHTML = `<div style="padding:8px 12px;background:var(--bg-danger,#2d1111);border:1px solid var(--danger);border-radius:6px;font-size:13px;color:var(--danger);">
      <strong>Error:</strong> ${err.message}
    </div>`;
  }
}

function parseCSVToRecords(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(l => l);
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    if (vals.length < headers.length) continue;
    const obj = {};
    headers.forEach((h, idx) => { obj[h.trim()] = (vals[idx] || "").trim(); });
    records.push(obj);
  }
  return records;
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ",") { result.push(current); current = ""; }
      else { current += ch; }
    }
  }
  result.push(current);
  return result;
}

// ============================================================
// Tardiness Validator
// ============================================================

function initTardinessValidator() {
  tardLoadData();
}

async function tardLoadData() {
  const loading = document.getElementById("tardiness-validator-loading");
  if (loading) loading.style.display = "flex";
  TARD_STATE.page = 1; // Reset to first page on any filter change

  try {
    const we = document.getElementById("tard-week-select")?.value || "";
    const status = document.getElementById("tard-status-filter")?.value || "";
    const pg = document.getElementById("tard-pg-filter")?.value || "";
    const supervisor = document.getElementById("tard-supervisor-filter")?.value || "";
    const shiftType = document.getElementById("tard-shift-filter")?.value || "";
    const search = document.getElementById("tard-search")?.value || "";

    const params = new URLSearchParams();
    if (we) params.set("week_ending", we);
    if (status) params.set("status", status);
    if (pg) params.set("planning_group", pg);
    if (supervisor) params.set("supervisor", supervisor);
    if (shiftType) params.set("shift_type", shiftType);
    if (search) params.set("search", search);
    if (TARD_STATE.myTeamOnly) params.set("scope", "team");

    const resp = await fetch(`/api/io/tardiness?${params.toString()}`, {
      headers: {
        "x-actor-ohr": _cu()?.ohr_id || "",
        "x-actor-name": _cu()?.full_name || "",
      },
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Failed to load");
    TARD_STATE.items = data.items || [];
    TARD_STATE.isAdmin = data.is_admin || false;
    TARD_STATE.selectedIds.clear();

    // Populate filter dropdowns from server-provided filter metadata (first load)
    const weSelect = document.getElementById("tard-week-select");
    if (weSelect && weSelect.options.length <= 1 && data.filters) {
      if (data.filters.weeks) {
        weSelect.innerHTML = '<option value="">All Weeks</option>' + data.filters.weeks.map(w => {
          const parts = w.split('/');
          const display = parts.length === 3 ? `${parts[0].padStart(2,'0')}/${parts[1].padStart(2,'0')}` : w;
          return `<option value="${w}">${display}</option>`;
        }).join("");
      }
      const pgSelect = document.getElementById("tard-pg-filter");
      if (pgSelect && data.filters.planning_groups) {
        pgSelect.innerHTML = '<option value="">All Groups</option>' + data.filters.planning_groups.map(p => `<option value="${p}">${p}</option>`).join("");
      }
      const supSelect = document.getElementById("tard-supervisor-filter");
      if (supSelect && data.filters.supervisors) {
        supSelect.innerHTML = '<option value="">All Supervisors</option>' + data.filters.supervisors.map(s => `<option value="${s}">${s}</option>`).join("");
      }
      const stSelect = document.getElementById("tard-shift-filter");
      if (stSelect && data.filters.shift_types) {
        stSelect.innerHTML = '<option value="">All Shifts</option>' + data.filters.shift_types.map(s => `<option value="${s}">${s}</option>`).join("");
      }
    }

    // Update stats from server-provided counts (or compute from items)
    tardUpdateStats(data.stats || null);
    tardRenderTable();
  } catch (err) {
    showToast("Failed to load tardiness data: " + err.message, "error");
  } finally {
    if (loading) loading.style.display = "none";
  }
}

// ============================================================
// Stats Strip
// ============================================================

function tardUpdateStats(serverStats) {
  const items = TARD_STATE.items;
  let total, pending, valid, invalid, grace;

  if (serverStats) {
    total = serverStats.total || items.length;
    pending = serverStats.pending || 0;
    valid = serverStats.valid || 0;
    invalid = serverStats.invalid || 0;
    grace = serverStats.grace || 0;
  } else {
    total = items.length;
    pending = items.filter(i => i.validation_status === "Pending").length;
    grace = items.filter(i => i.validation_status === "Invalid" && i.tardiness_minutes < 5 && (i.remarks || "").toLowerCase().includes("grace period")).length;
    invalid = items.filter(i => i.validation_status === "Invalid").length - grace;
    valid = items.filter(i => i.validation_status === "Valid").length;
  }

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setVal('tard-stat-total-val', total);
  setVal('tard-stat-pending-val', pending);
  setVal('tard-stat-valid-val', valid);
  setVal('tard-stat-invalid-val', invalid);
  setVal('tard-stat-grace-val', grace);
}

/** Quick-filter from stats card click */
function tardQuickFilter(status) {
  const statusSelect = document.getElementById('tard-status-filter');
  if (!statusSelect) return;
  if (status === 'Grace') {
    // No direct status for grace — set to Invalid and let the badge distinguish
    statusSelect.value = 'Invalid';
  } else {
    statusSelect.value = status;
  }
  tardLoadData();
}

// ============================================================
// Table Rendering
// ============================================================

function tardRenderTable() {
  const tbody = document.getElementById("tard-table-body");
  const emptyEl = document.getElementById("tard-empty");
  const countEl = document.getElementById("tard-record-count");
  const bulkValidBtn = document.getElementById("tard-bulk-valid-btn");
  const bulkInvalidBtn = document.getElementById("tard-bulk-invalid-btn");
  const selectAll = document.getElementById("tard-select-all");

  if (!tbody) return;

  const items = TARD_STATE.items;
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / TARD_STATE.pageSize));
  if (TARD_STATE.page > totalPages) TARD_STATE.page = totalPages;
  if (TARD_STATE.page < 1) TARD_STATE.page = 1;
  const startIdx = (TARD_STATE.page - 1) * TARD_STATE.pageSize;
  const endIdx = Math.min(startIdx + TARD_STATE.pageSize, totalItems);
  const pageItems = items.slice(startIdx, endIdx);

  if (countEl) countEl.textContent = `${totalItems} item${totalItems !== 1 ? 's' : ''} \u2022 Page ${TARD_STATE.page}/${totalPages}`;

  if (totalItems === 0) {
    tbody.innerHTML = "";
    if (emptyEl) emptyEl.style.display = "flex";
    if (bulkValidBtn) bulkValidBtn.style.display = "none";
    if (bulkInvalidBtn) bulkInvalidBtn.style.display = "none";
    tardRenderPagination(0, 1);
    return;
  }
  if (emptyEl) emptyEl.style.display = "none";

  const hasPending = items.some(i => i.validation_status === "Pending");
  if (bulkValidBtn) bulkValidBtn.style.display = hasPending ? "inline-flex" : "none";
  if (bulkInvalidBtn) bulkInvalidBtn.style.display = hasPending ? "inline-flex" : "none";

  tbody.innerHTML = pageItems.map(item => {
    const isPending = item.validation_status === "Pending";
    const isValid = item.validation_status === "Valid";
    const isInvalid = item.validation_status === "Invalid";

    // Severity color for minutes late
    let sevClass = "tard-sev-low";
    if (item.tardiness_minutes >= 150) sevClass = "tard-sev-high";
    else if (item.tardiness_minutes >= 30) sevClass = "tard-sev-med";

    // Grace period detection
    const isGracePeriod = isInvalid && item.tardiness_minutes < 5 && (item.remarks || "").toLowerCase().includes("grace period");

    // Status badge
    let statusBadge;
    if (isPending) statusBadge = '<span class="tard-badge tard-badge-pending">Pending</span>';
    else if (isValid) statusBadge = '<span class="tard-badge tard-badge-valid">Valid</span>';
    else if (isGracePeriod) statusBadge = '<span class="tard-badge tard-badge-grace" title="Auto-invalidated: within 5-minute grace period">Grace Period</span>';
    else statusBadge = '<span class="tard-badge tard-badge-invalid">Invalid</span>';

    // Action column
    let actions;
    if (isPending) {
      actions = `<button class="tard-action-btn tard-action-edit" onclick="tardOpenModal(${item.id})" title="Validate this item">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>`;
    } else if (TARD_STATE.isAdmin) {
      actions = `<button class="tard-action-btn tard-action-unlock" onclick="tardUnlockItem(${item.id})" title="Unlock and reset to Pending">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
      </button>`;
    } else {
      actions = `<span class="tard-action-locked"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>`;
    }

    const checked = TARD_STATE.selectedIds.has(item.id) ? "checked" : "";
    const checkboxDisabled = !isPending ? "disabled" : "";

    const supervisor = item.live_supervisor || item.supervisor_name || "";
    const planningGroup = item.live_planning_group || item.planning_group || "";

    const rowClass = isPending ? "tard-row-pending" : isValid ? "tard-row-valid" : isGracePeriod ? "tard-row-grace" : "tard-row-invalid";

    return `<tr class="tard-row ${rowClass}">
      <td class="tard-td-check"><input type="checkbox" class="tard-row-check" data-id="${item.id}" ${checked} ${checkboxDisabled} onchange="tardToggleRow(${item.id})"></td>
      <td class="tard-td-ohr" title="${escHtml(item.ohr_id)}">${escHtml(item.ohr_id)}</td>
      <td class="tard-td-name" title="${escHtml(item.employee_name)}">${escHtml(item.employee_name)}</td>
      <td class="tard-td-date">${tardFormatDate(item.date)}</td>
      <td class="tard-td-min ${sevClass}">${item.tardiness_minutes}</td>
      <td class="tard-td-sup" title="${escHtml(supervisor)}">${escHtml(supervisor)}</td>
      <td class="tard-td-shift">${escHtml(item.shift_type || "")}</td>
      <td class="tard-td-pg" title="${escHtml(planningGroup)}">${escHtml(planningGroup)}</td>
      <td class="tard-td-time">${escHtml(item.roster_login || "")}</td>
      <td class="tard-td-time">${escHtml(item.actual_login || "")}</td>
      <td class="tard-td-status">${statusBadge}</td>
      <td class="tard-td-remarks" title="${escHtml(item.remarks || "")}">${escHtml(item.remarks || "")}</td>
      <td class="tard-td-validby" title="${escHtml(item.validated_by || "")}">${escHtml(item.validated_by || "")}</td>
      <td class="tard-td-actions">${actions}</td>
    </tr>`;
  }).join("");

  if (selectAll) selectAll.checked = false;
  tardRenderPagination(totalPages, TARD_STATE.page);
}

/** Render pagination controls below the table */
function tardRenderPagination(totalPages, currentPage) {
  let container = document.getElementById('tard-pagination');
  if (!container) {
    // Create pagination container after the table wrapper
    const tableWrapper = document.getElementById('tard-table')?.closest('.tard-table-wrapper') || document.getElementById('tard-table')?.parentElement;
    if (!tableWrapper) return;
    container = document.createElement('div');
    container.id = 'tard-pagination';
    container.className = 'tard-pagination';
    tableWrapper.parentElement.insertBefore(container, tableWrapper.nextSibling);
  }

  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = '<div class="tard-pagination-inner">';
  // Prev button
  html += `<button class="tard-page-btn" ${currentPage <= 1 ? 'disabled' : ''} onclick="tardGoToPage(${currentPage - 1})">&laquo; Prev</button>`;

  // Page numbers — show max 7 with ellipsis
  const maxVisible = 7;
  let pages = [];
  if (totalPages <= maxVisible) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    let start = Math.max(2, currentPage - 2);
    let end = Math.min(totalPages - 1, currentPage + 2);
    if (currentPage <= 3) { start = 2; end = 5; }
    if (currentPage >= totalPages - 2) { start = totalPages - 4; end = totalPages - 1; }
    if (start > 2) pages.push('...');
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages - 1) pages.push('...');
    pages.push(totalPages);
  }

  pages.forEach(p => {
    if (p === '...') {
      html += '<span class="tard-page-ellipsis">\u2026</span>';
    } else {
      html += `<button class="tard-page-btn ${p === currentPage ? 'tard-page-active' : ''}" onclick="tardGoToPage(${p})">${p}</button>`;
    }
  });

  // Next button
  html += `<button class="tard-page-btn" ${currentPage >= totalPages ? 'disabled' : ''} onclick="tardGoToPage(${currentPage + 1})">Next &raquo;</button>`;
  html += '</div>';
  container.innerHTML = html;
}

function tardGoToPage(page) {
  TARD_STATE.page = page;
  tardRenderTable();
  // Scroll to top of table
  const table = document.getElementById('tard-table');
  if (table) table.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Format date string to MM/DD/YYYY consistently */
function tardFormatDate(d) {
  if (!d) return "";
  const s = String(d);
  const slashParts = s.split('/');
  if (slashParts.length === 3) {
    return `${slashParts[0].padStart(2,'0')}/${slashParts[1].padStart(2,'0')}/${slashParts[2]}`;
  }
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    return `${String(dt.getMonth()+1).padStart(2,'0')}/${String(dt.getDate()).padStart(2,'0')}/${dt.getFullYear()}`;
  }
  return s;
}

function escHtml(s) {
  if (!s) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function tardToggleSelectAll() {
  const selectAll = document.getElementById("tard-select-all");
  const checkboxes = document.querySelectorAll(".tard-row-check:not(:disabled)");
  TARD_STATE.selectedIds.clear();
  checkboxes.forEach(cb => {
    cb.checked = selectAll.checked;
    if (selectAll.checked) TARD_STATE.selectedIds.add(parseInt(cb.dataset.id, 10));
  });
}

function tardToggleRow(id) {
  if (TARD_STATE.selectedIds.has(id)) TARD_STATE.selectedIds.delete(id);
  else TARD_STATE.selectedIds.add(id);
}

// ============================================================
// Modal-based Validation
// ============================================================
let _tardModalResolve = null;

function tardOpenModal(id) {
  const item = TARD_STATE.items.find(i => i.id === id);
  TARD_STATE._pendingValidation = { id, mode: 'single' };
  const modal = document.getElementById('tard-validation-modal');
  const title = document.getElementById('tard-modal-title');
  const agentEl = document.getElementById('tard-modal-agent');
  const remarks = document.getElementById('tard-modal-remarks');
  const errorEl = document.getElementById('tard-modal-error');
  if (!modal) { tardValidateItem(id, 'Valid'); return; }
  title.textContent = 'Validate Item';
  if (agentEl && item) agentEl.textContent = `${item.employee_name} \u2014 ${tardFormatDate(item.date)} (${item.tardiness_minutes} min late)`;
  remarks.value = '';
  if (errorEl) errorEl.style.display = 'none';
  modal.style.display = 'flex';
  remarks.focus();
}

function tardOpenBulkModal(status) {
  const ids = Array.from(TARD_STATE.selectedIds);
  if (ids.length === 0) { showToast('No items selected', 'warning'); return; }
  TARD_STATE._pendingValidation = { ids, status, mode: 'bulk' };
  const modal = document.getElementById('tard-validation-modal');
  const title = document.getElementById('tard-modal-title');
  const agentEl = document.getElementById('tard-modal-agent');
  const remarks = document.getElementById('tard-modal-remarks');
  const errorEl = document.getElementById('tard-modal-error');
  if (!modal) { tardBulkValidate(status); return; }
  title.textContent = `Bulk Validate ${ids.length} Item(s)`;
  if (agentEl) agentEl.textContent = `Action: Mark as ${status}`;
  remarks.value = '';
  if (errorEl) errorEl.style.display = 'none';
  modal.style.display = 'flex';
  remarks.focus();
}

function tardCloseModal() {
  const modal = document.getElementById('tard-validation-modal');
  if (modal) modal.style.display = 'none';
  TARD_STATE._pendingValidation = null;
}

async function tardConfirmModal(status) {
  const pending = TARD_STATE._pendingValidation;
  if (!pending) return;
  const remarks = (document.getElementById('tard-modal-remarks')?.value || '').trim();
  const errorEl = document.getElementById('tard-modal-error');
  if (!remarks) {
    if (errorEl) errorEl.style.display = 'block';
    document.getElementById('tard-modal-remarks')?.focus();
    return;
  }
  tardCloseModal();
  if (pending.mode === 'single') {
    await tardValidateItem(pending.id, status, remarks);
  } else {
    await tardBulkValidate(pending.status, remarks);
  }
}

async function tardValidateItem(id, status, remarks) {
  if (remarks === undefined) remarks = '';
  try {
    const resp = await fetch(`/api/io/tardiness/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-actor-ohr": _cu()?.ohr_id || "",
        "x-actor-name": _cu()?.full_name || "",
      },
      body: JSON.stringify({ validation_status: status, remarks: remarks || "" }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Failed");
    showToast(`Item marked as ${status}`, "success");

    if (typeof createNotification === 'function') {
      createNotification({
        type: 'tardiness_validated',
        title: `Tardiness ${status}`,
        message: `1 tardiness item validated as ${status}`,
        target_ohr: _cu()?.ohr_id || '',
        actor_ohr: _cu()?.ohr_id || '',
        actor_name: _cu()?.full_name || '',
        metadata: JSON.stringify({ status, count: 1, validator: _cu()?.full_name || '' })
      });
    }

    tardLoadData();
  } catch (err) {
    showToast("Validation failed: " + err.message, "error");
  }
}

async function tardUnlockItem(id) {
  if (!confirm("Unlock this item and reset to Pending?")) return;
  try {
    const resp = await fetch(`/api/io/tardiness/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-actor-ohr": _cu()?.ohr_id || "",
        "x-actor-name": _cu()?.full_name || "",
      },
      body: JSON.stringify({ unlock: true }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Failed");
    showToast("Item unlocked", "success");
    tardLoadData();
  } catch (err) {
    showToast("Unlock failed: " + err.message, "error");
  }
}

async function tardBulkValidate(status, remarks) {
  const ids = Array.from(TARD_STATE.selectedIds);
  if (ids.length === 0) { showToast("No items selected", "warning"); return; }
  if (remarks === undefined) remarks = '';

  try {
    const resp = await fetch("/api/io/tardiness/bulk-validate", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-actor-ohr": _cu()?.ohr_id || "",
        "x-actor-name": _cu()?.full_name || "",
      },
      body: JSON.stringify({ ids, validation_status: status, remarks: remarks || "" }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Failed");
    showToast(`${data.updated} item(s) marked as ${status}`, "success");

    if (data.updated > 0 && typeof createNotification === 'function') {
      createNotification({
        type: 'tardiness_validated',
        title: `Bulk Tardiness ${status}`,
        message: `${data.updated} tardiness item(s) validated as ${status}`,
        target_ohr: _cu()?.ohr_id || '',
        actor_ohr: _cu()?.ohr_id || '',
        actor_name: _cu()?.full_name || '',
        metadata: JSON.stringify({ status, count: data.updated, validator: _cu()?.full_name || '' })
      });
    }

    TARD_STATE.selectedIds.clear();
    tardLoadData();
  } catch (err) {
    showToast("Bulk validation failed: " + err.message, "error");
  }
}

function tardSearchDebounce() {
  clearTimeout(TARD_STATE.searchTimer);
  TARD_STATE.searchTimer = setTimeout(() => tardLoadData(), 200);
}

function tardExportCSV() {
  const we = document.getElementById("tard-week-select")?.value || "";
  const status = document.getElementById("tard-status-filter")?.value || "";
  const pg = document.getElementById("tard-pg-filter")?.value || "";
  const supervisor = document.getElementById("tard-supervisor-filter")?.value || "";
  const shiftType = document.getElementById("tard-shift-filter")?.value || "";
  const params = new URLSearchParams();
  if (we) params.set("week_ending", we);
  if (status) params.set("status", status);
  if (pg) params.set("planning_group", pg);
  if (supervisor) params.set("supervisor", supervisor);
  if (shiftType) params.set("shift_type", shiftType);
  window.open(`/api/io/tardiness/export?${params.toString()}`, "_blank");
}

/** Toggle My Team filter for TLs */
function tardToggleMyTeam() {
  TARD_STATE.myTeamOnly = !TARD_STATE.myTeamOnly;
  const btn = document.getElementById('tard-my-team-btn');
  if (btn) {
    if (TARD_STATE.myTeamOnly) {
      btn.classList.add('tard-btn-team-active');
    } else {
      btn.classList.remove('tard-btn-team-active');
    }
  }
  tardLoadData();
}

/** Reset all filters to default state and reload */
function tardClearFilters() {
  const weSelect = document.getElementById('tard-week-select');
  const statusSelect = document.getElementById('tard-status-filter');
  const pgSelect = document.getElementById('tard-pg-filter');
  const supSelect = document.getElementById('tard-supervisor-filter');
  const stSelect = document.getElementById('tard-shift-filter');
  const searchInput = document.getElementById('tard-search');

  if (weSelect) weSelect.value = '';
  if (statusSelect) statusSelect.value = 'Pending';
  if (pgSelect) pgSelect.value = '';
  if (supSelect) supSelect.value = '';
  if (stSelect) stSelect.value = '';
  if (searchInput) searchInput.value = '';

  if (TARD_STATE.myTeamOnly) {
    TARD_STATE.myTeamOnly = false;
    const btn = document.getElementById('tard-my-team-btn');
    if (btn) btn.classList.remove('tard-btn-team-active');
  }

  tardLoadData();
}

// ============================================================
// View Initialization Hooks
/// Init hooks are registered in app.js switchView() — no monkey-patching needed.
