/**
 * Tardiness Validator & Analytics — Client Module
 * Handles: Admin CSV upload, Validator table with inline validation, Analytics charts.
 * Weekly cadence: Saturday to Friday.
 */

/* global currentUser, showToast, Chart */

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
  // Analytics chart instances
  chartWeekly: null,
  chartPg: null,
  chartTeam: null,
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
    const search = document.getElementById("tard-search")?.value || "";

    const params = new URLSearchParams();
    if (we) params.set("week_ending", we);
    if (status) params.set("status", status);
    if (pg) params.set("planning_group", pg);
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

    // Populate week endings dropdown (only first load)
    const weSelect = document.getElementById("tard-week-select");
    if (weSelect && weSelect.options.length <= 1) {
      // Get distinct week endings from data
      const weeks = [...new Set(TARD_STATE.items.map(i => i.week_ending))].sort().reverse();
      // Also fetch from analytics for full list
      try {
        const aResp = await fetch("/api/io/tardiness/analytics", {
          headers: { "x-actor-ohr": _cu()?.ohr_id || "", "x-actor-name": _cu()?.full_name || "" },
        });
        const aData = await aResp.json();
        if (aData.filters?.weeks) {
          const allWeeks = [...new Set([...weeks, ...aData.filters.weeks])].sort().reverse();
          weSelect.innerHTML = '<option value="">All Weeks</option>' + allWeeks.map(w => `<option value="${w}">${w}</option>`).join("");
          // Populate PG filter
          const pgSelect = document.getElementById("tard-pg-filter");
          if (pgSelect && aData.filters?.planning_groups) {
            pgSelect.innerHTML = '<option value="">All Groups</option>' + aData.filters.planning_groups.map(p => `<option value="${p}">${p}</option>`).join("");
          }
        }
      } catch (_) {}
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
           <button class="btn btn-sm" style="font-size:11px;padding:2px 8px;background:var(--success);color:#fff;border:none;" onclick="tardValidateItem(${item.id},'Valid')">Valid</button>
           <button class="btn btn-sm" style="font-size:11px;padding:2px 8px;background:var(--danger);color:#fff;border:none;" onclick="tardValidateItem(${item.id},'Invalid')">Invalid</button>
         </div>`
      : TARD_STATE.isAdmin
        ? `<button class="btn btn-sm btn-outline" style="font-size:10px;padding:2px 6px;" onclick="tardUnlockItem(${item.id})">Unlock</button>`
        : '<span style="font-size:11px;color:var(--fg-muted);">Locked</span>';

    const checked = TARD_STATE.selectedIds.has(item.id) ? "checked" : "";
    const checkboxDisabled = !isPending ? "disabled" : "";

    return `<tr style="border-bottom:1px solid var(--border);">
      <td><input type="checkbox" class="tard-row-check" data-id="${item.id}" ${checked} ${checkboxDisabled} onchange="tardToggleRow(${item.id})"></td>
      <td style="font-weight:500;">${escHtml(item.employee_name)}</td>
      <td style="font-size:11px;color:var(--fg-muted);">${escHtml(item.ohr_id)}</td>
      <td>${item.date}</td>
      <td style="text-align:right;font-weight:700;color:${minColor};">${item.tardiness_minutes}</td>
      <td style="font-size:11px;">${escHtml(item.shift_type || "")}</td>
      <td style="font-size:11px;">${escHtml(item.roster_login || "")}</td>
      <td style="font-size:11px;">${escHtml(item.actual_login || "")}</td>
      <td>${statusBadge}</td>
      <td style="font-size:11px;">${escHtml(item.validated_by || "")}</td>
      <td style="font-size:11px;max-width:150px;overflow:hidden;text-overflow:ellipsis;" title="${escHtml(item.remarks || "")}">${escHtml(item.remarks || "")}</td>
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

async function tardValidateItem(id, status) {
  const remarks = prompt(`Remarks for marking as "${status}" (optional):`);
  if (remarks === null) return; // cancelled

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

    // Notification: tardiness_validated
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

async function tardBulkValidate(status) {
  const ids = Array.from(TARD_STATE.selectedIds);
  if (ids.length === 0) { showToast("No items selected", "warning"); return; }
  if (!confirm(`Mark ${ids.length} item(s) as "${status}"?`)) return;

  const remarks = prompt(`Bulk remarks (optional):`);
  if (remarks === null) return;

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
  const params = new URLSearchParams();
  if (we) params.set("week_ending", we);
  if (status) params.set("status", status);
  if (pg) params.set("planning_group", pg);
  window.open(`/api/io/tardiness/export?${params.toString()}`, "_blank");
}

// ============================================================
// Tardiness Analytics
// ============================================================

function initTardinessAnalytics() {
  tardaLoadAnalytics();
}

async function tardaLoadAnalytics() {
  const loading = document.getElementById("tardiness-analytics-loading");
  if (loading) loading.style.display = "flex";

  try {
    const startWe = document.getElementById("tarda-start-we")?.value || "";
    const endWe = document.getElementById("tarda-end-we")?.value || "";
    const pg = document.getElementById("tarda-pg-filter")?.value || "";

    const params = new URLSearchParams();
    if (startWe) params.set("start_we", startWe);
    if (endWe) params.set("end_we", endWe);
    if (pg) params.set("planning_group", pg);

    const resp = await fetch(`/api/io/tardiness/analytics?${params.toString()}`, {
      headers: {
        "x-actor-ohr": _cu()?.ohr_id || "",
        "x-actor-name": _cu()?.full_name || "",
      },
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Failed");

    // Populate filter dropdowns (first load)
    const startSelect = document.getElementById("tarda-start-we");
    const endSelect = document.getElementById("tarda-end-we");
    if (startSelect && startSelect.options.length <= 1 && data.filters?.weeks?.length) {
      const weeks = data.filters.weeks;
      startSelect.innerHTML = '<option value="">Earliest</option>' + weeks.map(w => `<option value="${w}">${w}</option>`).join("");
      endSelect.innerHTML = '<option value="">Latest</option>' + weeks.map(w => `<option value="${w}">${w}</option>`).join("");
      const pgSelect = document.getElementById("tarda-pg-filter");
      if (pgSelect && data.filters?.planning_groups) {
        pgSelect.innerHTML = '<option value="">All Groups</option>' + data.filters.planning_groups.map(p => `<option value="${p}">${p}</option>`).join("");
      }
    }

    // KPI Cards
    document.getElementById("tarda-kpi-instances").textContent = data.kpi.total_instances;
    document.getElementById("tarda-kpi-avg").textContent = data.kpi.avg_minutes + " min";
    document.getElementById("tarda-kpi-agents").textContent = data.kpi.unique_agents;
    document.getElementById("tarda-kpi-ontime").textContent = data.kpi.on_time_rate + "%";

    // Weekly Trend Chart
    tardaRenderWeeklyChart(data.weekly);

    // PG Breakdown Chart
    tardaRenderPgChart(data.by_pg);

    // Team Chart
    tardaRenderTeamChart(data.by_team);

    // Top Offenders Table
    tardaRenderOffenders(data.top_offenders);

    // Escalation Alerts
    tardaLoadEscalations();

  } catch (err) {
    showToast("Failed to load analytics: " + err.message, "error");
  } finally {
    if (loading) loading.style.display = "none";
  }
}

function tardaRenderWeeklyChart(weekly) {
  const ctx = document.getElementById("tarda-chart-weekly");
  if (!ctx) return;
  if (TARD_STATE.chartWeekly) TARD_STATE.chartWeekly.destroy();

  const labels = weekly.map(w => w.week_ending);
  const instances = weekly.map(w => Number(w.instances));
  const avgMins = weekly.map(w => Math.round(Number(w.avg_minutes)));

  TARD_STATE.chartWeekly = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Late Instances", data: instances, backgroundColor: "rgba(239,68,68,0.7)", yAxisID: "y" },
        { label: "Avg Minutes", data: avgMins, type: "line", borderColor: "#f59e0b", backgroundColor: "transparent", yAxisID: "y1", tension: 0.3, pointRadius: 3 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "top", labels: { font: { size: 11 } } } },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "Instances" } },
        y1: { beginAtZero: true, position: "right", title: { display: true, text: "Avg Minutes" }, grid: { drawOnChartArea: false } },
      },
    },
  });
}

function tardaRenderPgChart(byPg) {
  const ctx = document.getElementById("tarda-chart-pg");
  if (!ctx) return;
  if (TARD_STATE.chartPg) TARD_STATE.chartPg.destroy();

  const labels = byPg.map(p => p.planning_group || "Unknown");
  const instances = byPg.map(p => Number(p.instances));
  const colors = labels.map((_, i) => `hsl(${(i * 47) % 360}, 65%, 55%)`);

  TARD_STATE.chartPg = new Chart(ctx, {
    type: "doughnut",
    data: { labels, datasets: [{ data: instances, backgroundColor: colors }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "right", labels: { font: { size: 10 }, boxWidth: 12 } } },
    },
  });
}

function tardaRenderTeamChart(byTeam) {
  const ctx = document.getElementById("tarda-chart-team");
  if (!ctx) return;
  if (TARD_STATE.chartTeam) TARD_STATE.chartTeam.destroy();

  const top10 = byTeam.slice(0, 10);
  const labels = top10.map(t => (t.supervisor_name || "Unknown").split(",")[0]);
  const instances = top10.map(t => Number(t.instances));

  TARD_STATE.chartTeam = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Valid Late Instances", data: instances, backgroundColor: "rgba(99,102,241,0.7)" }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true } },
    },
  });
}

function tardaRenderOffenders(offenders) {
  const container = document.getElementById("tarda-offenders-table");
  if (!container) return;

  if (!offenders || offenders.length === 0) {
    container.innerHTML = '<p style="color:var(--fg-muted);font-size:12px;text-align:center;padding:20px;">No data available.</p>';
    return;
  }

  container.innerHTML = `<table style="width:100%;font-size:12px;border-collapse:collapse;">
    <thead><tr style="border-bottom:1px solid var(--border);">
      <th style="text-align:left;padding:4px 8px;">Agent</th>
      <th style="text-align:right;padding:4px 8px;">Instances</th>
      <th style="text-align:right;padding:4px 8px;">Total Min.</th>
    </tr></thead>
    <tbody>${offenders.map((o, i) => {
      const bg = i < 3 ? "background:rgba(239,68,68,0.1);" : "";
      return `<tr style="border-bottom:1px solid var(--border);${bg}">
        <td style="padding:4px 8px;">${escHtml(o.employee_name)}<br><span style="font-size:10px;color:var(--fg-muted);">${escHtml(o.planning_group || "")}</span></td>
        <td style="text-align:right;padding:4px 8px;font-weight:700;color:var(--danger);">${o.instances}</td>
        <td style="text-align:right;padding:4px 8px;">${o.total_minutes}</td>
      </tr>`;
    }).join("")}</tbody>
  </table>`;
}

async function tardaLoadEscalations() {
  try {
    const resp = await fetch("/api/io/tardiness/escalation-check", {
      headers: { "x-actor-ohr": _cu()?.ohr_id || "", "x-actor-name": _cu()?.full_name || "" },
    });
    const data = await resp.json();
    if (!resp.ok) return;

    const card = document.getElementById("tarda-escalation-card");
    const list = document.getElementById("tarda-escalation-list");
    if (!card || !list) return;

    if (!data.escalations || data.escalations.length === 0) {
      card.style.display = "none";
      return;
    }

    card.style.display = "block";
    list.innerHTML = `<table style="width:100%;font-size:12px;border-collapse:collapse;">
      <thead><tr style="border-bottom:1px solid var(--border);">
        <th style="text-align:left;padding:4px 8px;">Agent</th>
        <th>OHR</th>
        <th>Supervisor</th>
        <th>PG</th>
        <th style="text-align:right;">Instances</th>
        <th style="text-align:right;">Total Min.</th>
      </tr></thead>
      <tbody>${data.escalations.map(e => `<tr style="border-bottom:1px solid var(--border);background:rgba(239,68,68,0.08);">
        <td style="padding:4px 8px;font-weight:600;">${escHtml(e.employee_name)}</td>
        <td style="padding:4px 8px;font-size:11px;">${escHtml(e.ohr_id)}</td>
        <td style="padding:4px 8px;font-size:11px;">${escHtml(e.supervisor_name || "")}</td>
        <td style="padding:4px 8px;font-size:11px;">${escHtml(e.planning_group || "")}</td>
        <td style="text-align:right;padding:4px 8px;font-weight:700;color:var(--danger);">${e.instances}</td>
        <td style="text-align:right;padding:4px 8px;">${e.total_minutes}</td>
      </tr>`).join("")}</tbody>
    </table>
    <p style="font-size:11px;color:var(--fg-muted);margin-top:8px;">Window: ${data.window_weeks?.join(", ") || "N/A"}</p>`;
  } catch (_) {}
}

// ============================================================
// View Initialization Hooks
/// Init hooks are registered in app.js switchView() — no monkey-patching needed.
