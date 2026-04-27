/**
 * Tardiness Validator — Client Module
 * Handles: Admin CSV upload, Validator table with inline validation.
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
  selectedIds: new Set(),
  isAdmin: false,
  weekEndings: [],
  planningGroups: [],
  searchTimer: null,
};

// ============================================================
// Admin Upload
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  const fileInput = document.getElementById("tardiness-csv-input");
  const uploadBtn = document.getElementById("tardiness-upload-btn");
  if (fileInput && uploadBtn) {
    fileInput.addEventListener("change", () => {
      uploadBtn.disabled = !fileInput.files || fileInput.files.length === 0;
    });
  }
});

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
      // Use SheetJS if available (loaded in horizon.js)
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

    // Normalize column names to expected format
    records = records.map(r => {
      const norm = {};
      for (const [k, v] of Object.entries(r)) {
        const key = k.trim().toLowerCase().replace(/\s+/g, "_");
        // Map common column name variants
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

    // Batch upload (500 per batch)
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

    // Notification: tardiness_uploaded
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
        weSelect.innerHTML = '<option value="">All Weeks</option>' + data.filters.weeks.map(w => `<option value="${w}">${w}</option>`).join("");
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

    tardRenderTable();
  } catch (err) {
    showToast("Failed to load tardiness data: " + err.message, "error");
  } finally {
    if (loading) loading.style.display = "none";
  }
}

function tardRenderTable() {
  const tbody = document.getElementById("tard-table-body");
  const emptyEl = document.getElementById("tard-empty");
  const countEl = document.getElementById("tard-record-count");
  const bulkValidBtn = document.getElementById("tard-bulk-valid-btn");
  const bulkInvalidBtn = document.getElementById("tard-bulk-invalid-btn");
  const selectAll = document.getElementById("tard-select-all");

  if (!tbody) return;

  const items = TARD_STATE.items;
  if (countEl) countEl.textContent = `Items: ${items.length}`;

  if (items.length === 0) {
    tbody.innerHTML = "";
    if (emptyEl) emptyEl.style.display = "block";
    if (bulkValidBtn) bulkValidBtn.style.display = "none";
    if (bulkInvalidBtn) bulkInvalidBtn.style.display = "none";
    return;
  }
  if (emptyEl) emptyEl.style.display = "none";

  // Show bulk buttons if any pending items
  const hasPending = items.some(i => i.validation_status === "Pending");
  if (bulkValidBtn) bulkValidBtn.style.display = hasPending ? "inline-flex" : "none";
  if (bulkInvalidBtn) bulkInvalidBtn.style.display = hasPending ? "inline-flex" : "none";

  // New column order: OHR, Full Name, Date, Minutes Late, Supervisor, Shift Type, PG, Roster Login, Actual Login, Status, Remarks, Validated By, Actions
  tbody.innerHTML = items.map(item => {
    const isPending = item.validation_status === "Pending";
    const isValid = item.validation_status === "Valid";
    const isInvalid = item.validation_status === "Invalid";

    // Color coding: Red (>150), Yellow (30-150), Green (<30)
    let minColor = "var(--success)";
    if (item.tardiness_minutes >= 150) minColor = "var(--danger)";
    else if (item.tardiness_minutes >= 30) minColor = "var(--warning)";

    const statusBadge = isPending
      ? '<span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:var(--bg-muted);color:var(--fg-muted);">Pending</span>'
      : isValid
        ? '<span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:var(--success);color:#fff;">Valid</span>'
        : '<span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:var(--danger);color:#fff;">Invalid</span>';

    const actions = isPending
      ? `<div style="display:flex;gap:4px;flex-wrap:wrap;">
           <button class="btn btn-sm" style="font-size:11px;padding:2px 8px;background:var(--success);color:#fff;border:none;" onclick="tardOpenModal(${item.id},'Valid')">Valid</button>
           <button class="btn btn-sm" style="font-size:11px;padding:2px 8px;background:var(--danger);color:#fff;border:none;" onclick="tardOpenModal(${item.id},'Invalid')">Invalid</button>
         </div>`
      : TARD_STATE.isAdmin
        ? `<button class="btn btn-sm btn-outline" style="font-size:10px;padding:2px 6px;" onclick="tardUnlockItem(${item.id})">Unlock</button>`
        : '<span style="font-size:11px;color:var(--fg-muted);">Locked</span>';

    const checked = TARD_STATE.selectedIds.has(item.id) ? "checked" : "";
    const checkboxDisabled = !isPending ? "disabled" : "";

    // Progressive cascade: use live_supervisor from io_employees JOIN (falls back to snapshot)
    const supervisor = item.live_supervisor || item.supervisor_name || "";
    const planningGroup = item.live_planning_group || item.planning_group || "";

    return `<tr style="border-bottom:1px solid var(--border);">
      <td><input type="checkbox" class="tard-row-check" data-id="${item.id}" ${checked} ${checkboxDisabled} onchange="tardToggleRow(${item.id})"></td>
      <td style="font-size:11px;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(item.ohr_id)}">${escHtml(item.ohr_id)}</td>
      <td style="font-weight:500;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(item.employee_name)}">${escHtml(item.employee_name)}</td>
      <td style="white-space:nowrap;">${item.date}</td>
      <td style="text-align:right;font-weight:700;color:${minColor};">${item.tardiness_minutes}</td>
      <td style="font-size:11px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(supervisor)}">${escHtml(supervisor)}</td>
      <td style="font-size:11px;white-space:nowrap;">${escHtml(item.shift_type || "")}</td>
      <td style="font-size:11px;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(planningGroup)}">${escHtml(planningGroup)}</td>
      <td style="font-size:11px;white-space:nowrap;">${escHtml(item.roster_login || "")}</td>
      <td style="font-size:11px;white-space:nowrap;">${escHtml(item.actual_login || "")}</td>
      <td>${statusBadge}</td>
      <td style="font-size:11px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(item.remarks || "")}">${escHtml(item.remarks || "")}</td>
      <td style="font-size:11px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(item.validated_by || "")}">${escHtml(item.validated_by || "")}</td>
      <td>${actions}</td>
    </tr>`;
  }).join("");

  if (selectAll) selectAll.checked = false;
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

// ── Modal-based validation (replaces browser prompt()) ──
let _tardModalResolve = null;

function tardOpenModal(id, status) {
  TARD_STATE._pendingValidation = { id, status, mode: 'single' };
  const modal = document.getElementById('tard-validation-modal');
  const title = document.getElementById('tard-modal-title');
  const remarks = document.getElementById('tard-modal-remarks');
  const confirmBtn = document.getElementById('tard-modal-confirm');
  if (!modal) { /* fallback if modal HTML missing */ tardValidateItem(id, status); return; }
  title.textContent = `Mark as ${status}`;
  remarks.value = '';
  confirmBtn.textContent = `Mark ${status}`;
  confirmBtn.style.background = status === 'Valid' ? 'var(--success)' : 'var(--danger)';
  modal.style.display = 'flex';
  remarks.focus();
}

function tardOpenBulkModal(status) {
  const ids = Array.from(TARD_STATE.selectedIds);
  if (ids.length === 0) { showToast('No items selected', 'warning'); return; }
  TARD_STATE._pendingValidation = { ids, status, mode: 'bulk' };
  const modal = document.getElementById('tard-validation-modal');
  const title = document.getElementById('tard-modal-title');
  const remarks = document.getElementById('tard-modal-remarks');
  const confirmBtn = document.getElementById('tard-modal-confirm');
  if (!modal) { tardBulkValidate(status); return; }
  title.textContent = `Mark ${ids.length} item(s) as ${status}`;
  remarks.value = '';
  confirmBtn.textContent = `Mark ${status}`;
  confirmBtn.style.background = status === 'Valid' ? 'var(--success)' : 'var(--danger)';
  modal.style.display = 'flex';
  remarks.focus();
}

function tardCloseModal() {
  const modal = document.getElementById('tard-validation-modal');
  if (modal) modal.style.display = 'none';
  TARD_STATE._pendingValidation = null;
}

async function tardConfirmModal() {
  const pending = TARD_STATE._pendingValidation;
  if (!pending) return;
  const remarks = (document.getElementById('tard-modal-remarks')?.value || '').trim();
  tardCloseModal();
  if (pending.mode === 'single') {
    await tardValidateItem(pending.id, pending.status, remarks);
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

    // Notification: tardiness_validated (bulk)
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

// ============================================================
// View Initialization Hooks
/// Init hooks are registered in app.js switchView() — no monkey-patching needed.
