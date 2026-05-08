/**
 * Input Portal — Compact Card-Row Table Renderer
 * Replaces the old wide-column table with a 3-column compact layout:
 *   Employee (name + role badge + meta) | Tag (color chip) | Date
 * Click to expand inline detail panel for editing.
 * Floating command bar for bulk operations.
 */

// ============================================================
// STATE
// ============================================================

const compactState = {
  expandedId: null,       // Currently expanded record _id
  selectionMode: false,   // Whether bulk selection mode is active
};

// ============================================================
// TAG CHIP HELPER
// ============================================================

function renderTagChip(tag) {
  if (!tag || tag.trim() === '') {
    return '<span class="tag-chip tag-chip--empty">\u2014</span>';
  }
  return '<span class="tag-chip tag-chip--' + escapeHtml(tag) + '">' + escapeHtml(tag) + '</span>';
}

// ============================================================
// ROLE BADGE HELPER
// ============================================================

function getRoleBadgeClass(role) {
  if (!role) return 'role-badge--agent';
  var r = role.toLowerCase();
  if (r.includes('sme')) return 'role-badge--sme';
  if (r.includes('quality') || r.includes('qpe')) return 'role-badge--qpe';
  if (r.includes('team lead') || r.includes('tl')) return 'role-badge--tl';
  if (r.includes('trainer')) return 'role-badge--trainer';
  if (r.includes('manager')) return 'role-badge--manager';
  return 'role-badge--agent';
}

function getShortRole(role) {
  if (!role) return 'AGT';
  var r = role.toLowerCase();
  if (r.includes('operational sme')) return 'SME';
  if (r.includes('quality')) return 'QPE';
  if (r.includes('team lead')) return 'TL';
  if (r.includes('trainer')) return 'TRN';
  if (r.includes('manager')) return 'MGR';
  return 'AGT';
}

// ============================================================
// COMPACT TABLE RENDERER
// ============================================================

function renderCompactTable() {
  initBulkTagDropdown();
  initFcbTagDropdown();
  var tbody = document.getElementById('input-table-body');
  var thead = document.getElementById('input-table-head');
  if (!tbody || !thead) return;

  var pageItems;
  var totalRecords;

  if (serverPagState.enabled) {
    pageItems = (serverPagState.rows || []).map(function(r) {
      var oi = -1;
      for (var i = 0; i < appState.records.length; i++) {
        if (appState.records[i]._id === r._id) { oi = i; break; }
      }
      if (oi === -1) { oi = appState.records.length; appState.records.push(r); }
      return { record: r, originalIndex: oi };
    });
    totalRecords = serverPagState.total || 0;
  } else {
    var allFiltered = getFilteredInputRecords();
    appState._filteredData = allFiltered;
    totalRecords = allFiltered.length;
    var pageSize = appState.inputPageSize;
    var totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
    var page = Math.min(appState.inputPage, totalPages - 1);
    appState.inputPage = page;
    var start = page * pageSize;
    pageItems = allFiltered.slice(start, start + pageSize);
  }

  // Update counts
  var rcEl = document.getElementById('input-record-count');
  if (rcEl) rcEl.textContent = 'Filtered Records: ' + formatNumber(totalRecords);
  var fcEl = document.getElementById('input-filter-count');
  if (fcEl) fcEl.textContent = 'Filtered Records: ' + formatNumber(totalRecords);

  // Update edit count
  var editCount = Object.keys(appState.pendingEdits).length;
  var editCountEl = document.getElementById('input-edit-count');
  var saveBtn = document.getElementById('save-btn');
  var undoBtn = document.getElementById('undo-btn');
  if (editCount > 0) {
    if (editCountEl) { editCountEl.textContent = editCount + ' record(s) edited'; editCountEl.style.display = 'inline'; }
    if (saveBtn) saveBtn.disabled = false;
    if (undoBtn) undoBtn.disabled = false;
  } else {
    if (editCountEl) editCountEl.style.display = 'none';
    if (saveBtn) saveBtn.disabled = true;
    if (undoBtn) undoBtn.disabled = true;
  }

  // Pagination info
  var pageSize2 = serverPagState.enabled ? serverPagState.pageSize : appState.inputPageSize;
  var page2 = appState.inputPage;
  var start2 = page2 * pageSize2;
  var infoEl = document.getElementById('input-record-info');
  if (totalRecords > 0) {
    if (infoEl) infoEl.textContent = 'Showing ' + (start2 + 1) + '\u2013' + Math.min(start2 + pageSize2, totalRecords) + ' of ' + formatNumber(totalRecords);
  } else {
    if (infoEl) infoEl.textContent = 'No records';
  }

  // Header
  var selClass = compactState.selectionMode ? ' selection-mode' : '';
  thead.innerHTML = '<tr>'
    + '<th style="width:36px;"></th>'
    + '<th>Employee</th>'
    + '<th style="width:140px;text-align:center;">Tag</th>'
    + '<th style="width:120px;text-align:right;">Date</th>'
    + '<th style="width:32px;"></th>'
    + '</tr>';

  // Body
  if (pageItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5">'
      + '<div class="compact-empty-mascot">'
      + '<div class="sprite-mascot" role="img" aria-label="No data"></div>'
      + '<div class="empty-text">No records found</div>'
      + '<div style="font-size:12px;color:var(--fg-muted);">Adjust the filters above to load data</div>'
      + '</div></td></tr>';
  } else {
    var html = '';
    for (var i = 0; i < pageItems.length; i++) {
      html += renderCompactRow(pageItems[i]);
    }
    tbody.innerHTML = html;

    // Re-open expanded panel if still in view
    if (compactState.expandedId) {
      var panelEl = document.getElementById('detail-panel-' + compactState.expandedId);
      if (panelEl) {
        setTimeout(function() { panelEl.classList.add('open'); }, 20);
      } else {
        compactState.expandedId = null;
      }
    }
  }

  // Add selection-mode class to table wrapper
  var wrapper = document.getElementById('vtable-scroll-container');
  if (wrapper) {
    if (compactState.selectionMode) wrapper.classList.add('selection-mode');
    else wrapper.classList.remove('selection-mode');
  }

  // Pagination
  if (serverPagState.enabled) {
    var tp = Math.max(1, Math.ceil(totalRecords / serverPagState.pageSize));
    renderServerPagination(appState.inputPage, tp);
  } else {
    var tp2 = Math.max(1, Math.ceil(totalRecords / appState.inputPageSize));
    renderInputPagination(appState.inputPage, tp2);
  }

  updateFloatingCommandBar();
}

// ============================================================
// COMPACT ROW RENDERER
// ============================================================

function renderCompactRow(item) {
  var r = item.record;
  var idx = item.originalIndex;
  var locked = isRowLocked(r);
  var isEdited = appState.pendingEdits[idx] !== undefined;
  var isSelected = (typeof serverPagState !== 'undefined' && serverPagState.enabled)
    ? bulkState.selected.has(r._id)
    : bulkState.selected.has(idx);
  var isExpanded = compactState.expandedId === r._id;

  var rowClasses = 'compact-row';
  if (isEdited) rowClasses += ' row-edited';
  if (locked) rowClasses += ' row-locked';
  if (isSelected) rowClasses += ' row-selected';
  if (isExpanded) rowClasses += ' row-expanded';

  // Employee cell
  var roleBadge = '<span class="role-badge ' + getRoleBadgeClass(r.role) + '">' + getShortRole(r.role) + '</span>';
  var shiftBadge = '';
  if (r.shiftTime) {
    var sc = r.shiftTime.toLowerCase().includes('gy') ? 'shift-badge--gy' : 'shift-badge--mid';
    shiftBadge = '<span class="shift-badge ' + sc + '">' + escapeHtml(r.shiftTime === 'GY Shift' ? 'GY' : 'MID') + '</span>';
  }
  var empCell = '<td class="emp-cell-td"><div class="emp-cell">'
    + '<div class="emp-name">' + escapeHtml(r.agent || 'Unknown') + roleBadge + shiftBadge + '</div>'
    + '<div class="emp-meta">'
    + '<span class="emp-flm">' + escapeHtml(r.flm || '') + '</span>'
    + (r.actualPlanningGroup ? '<span class="emp-pg">' + escapeHtml(r.actualPlanningGroup) + '</span>' : '')
    + '</div>'
    + '</div></td>';

  // Tag cell + WFM Tag (side by side)
  var wfmChip = r.wfm_tag ? '<span class="wfm-tag-chip">' + escapeHtml(r.wfm_tag) + '</span>' : '';
  var tagCell = '<td style="text-align:center;"><div style="display:flex;align-items:center;justify-content:center;gap:4px;">' + renderTagChip(r.tag) + wfmChip + '</div></td>';

  // Date cell
  var dateDisplay = formatDateDisplay ? formatDateDisplay(r.date) : r.date;
  var dayName = '';
  if (r.date) {
    var d = new Date(r.date + 'T00:00:00');
    dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  }
  var dateCell = '<td><div class="date-cell">'
    + '<span class="date-day">' + escapeHtml(dayName) + '</span>'
    + '<span class="date-full">' + escapeHtml(dateDisplay) + '</span>'
    + '</div></td>';

  // Selection cell — in server-side mode, pass _id string directly for stable selection
  var selectCell;
  var selArg = (typeof serverPagState !== 'undefined' && serverPagState.enabled && r._id)
    ? "'" + r._id.replace(/'/g, "\\'") + "'"
    : idx;
  if (compactState.selectionMode) {
    if (locked) {
      selectCell = '<td class="row-select-cell"><span class="compact-lock" title="Locked">&#128274;</span></td>';
    } else {
      selectCell = '<td class="row-select-cell"><input type="checkbox" class="compact-checkbox" data-idx="' + idx + '" '
        + (isSelected ? 'checked' : '')
        + ' onclick="event.stopPropagation(); bulkToggleRow(' + selArg + ', this.checked)" /></td>';
    }
  } else {
    if (locked) {
      selectCell = '<td class="row-select-cell" style="opacity:1;"><span class="compact-lock" title="Locked">&#128274;</span></td>';
    } else {
      selectCell = '<td class="row-select-cell"></td>';
    }
  }

  // Expand indicator
  var expandCell = '<td style="text-align:center;"><span class="expand-indicator">' + (isExpanded ? '&#9650;' : '&#9660;') + '</span></td>';

  // Row click handler
  var clickHandler = compactState.selectionMode && !locked
    ? 'onclick="compactToggleSelect(' + idx + ', this)"'
    : 'onclick="compactToggleExpand(\'' + r._id + '\', ' + idx + ')"';

  var row = '<tr class="' + rowClasses + '" data-id="' + r._id + '" ' + clickHandler + '>'
    + selectCell + empCell + tagCell + dateCell + expandCell + '</tr>';

  // Detail panel row (always rendered, toggled via CSS)
  var detailRow = '<tr class="detail-panel-row" id="detail-row-' + r._id + '"><td colspan="5">'
    + '<div class="detail-panel" id="detail-panel-' + r._id + '">'
    + renderDetailPanel(r, idx, locked)
    + '</div></td></tr>';

  return row + detailRow;
}

// ============================================================
// DETAIL PANEL
// ============================================================

function renderDetailPanel(r, idx, locked) {
  // WFM read-only flag — WFM users see all fields as plain text
  var cu = typeof currentUser !== 'undefined' ? currentUser : null;
  var isWFM = cu && cu.actual_role === 'WFM';

  // Tag dropdown
  var tagOpts = TAG_OPTIONS;

  var tagField;
  if (locked || isWFM) {
    tagField = '<span class="detail-readonly">' + escapeHtml(r.tag || '\u2014') + '</span>';
  } else {
    tagField = '<select class="detail-select" data-idx="' + idx + '" data-key="tag" data-record-id="' + escapeAttr(r._id || '') + '" onchange="handleCellEdit(this)" onclick="event.stopPropagation()">' 
      + '<option value="">\u2014</option>'
      + tagOpts.map(function(t) { return '<option value="' + t + '" ' + (r.tag === t ? 'selected' : '') + '>' + t + '</option>'; }).join('')
      + '</select>';
  }

  // UPL Reason
  var reasonField;
  var canEditReason = !locked && !isWFM && (r.tag === 'UPL' || r.tag === 'LATE');
  if (canEditReason) {
    reasonField = '<select class="detail-select" data-idx="' + idx + '" data-key="uplReason" data-record-id="' + escapeAttr(r._id || '') + '" onchange="handleCellEdit(this)" onclick="event.stopPropagation()">' 
      + '<option value="">\u2014</option>'
      + UPL_REASONS.map(function(rr) { return '<option value="' + rr + '" ' + (r.uplReason === rr ? 'selected' : '') + '>' + rr + '</option>'; }).join('')
      + '</select>';
  } else {
    reasonField = '<span class="detail-readonly">' + escapeHtml(r.uplReason || '\u2014') + '</span>';
  }

  // OT
  var otField;
  var OT_MECH_CUTOFF = '2026-04-10';
  var OT_MECH_PGS = ['S-ABF', 'CS-ABF'];
  var _ADMIN_OHRS_OT = window.ADMIN_OHRS || ['740045023', '740044909'];
  var isCurrentUserAdmin = cu && (_ADMIN_OHRS_OT.indexOf(cu.ohr_id) !== -1 || (cu.permissions && cu.permissions['anchor.edit_attendance']));
  var isOtMechAgent = (r.role === 'Agent') && OT_MECH_PGS.indexOf(r.actualPlanningGroup) !== -1;
  var isAfterCutoff = r.date && r.date > OT_MECH_CUTOFF;
  if (locked || isWFM || (isOtMechAgent && isAfterCutoff && !isCurrentUserAdmin)) {
    otField = '<span class="detail-readonly">' + escapeHtml(r.ot || '\u2014') + '</span>';
  } else {
    otField = '<input type="number" step="0.5" min="0" class="detail-input" value="' + escapeAttr(r.ot || '') + '" data-idx="' + idx + '" data-key="ot" data-record-id="' + escapeAttr(r._id || '') + '" onchange="handleCellEdit(this)" onclick="event.stopPropagation()" placeholder="\u2014">';
  }

  // Remarks
  var remarksField;
  if (locked || isWFM) {
    remarksField = '<span class="detail-readonly">' + escapeHtml(r.remarks || '\u2014') + '</span>';
  } else {
    remarksField = '<textarea class="detail-textarea" data-idx="' + idx + '" data-key="remarks" data-record-id="' + escapeAttr(r._id || '') + '" onchange="handleCellEdit(this)" onclick="event.stopPropagation()" placeholder="\u2014">' + escapeHtml(r.remarks || '') + '</textarea>';
  }

  // Role dropdown (per-day editable)
  var ROLE_OPTIONS = ['Agent', 'Operational SME', 'Quality & Policy Expert', 'Team Lead', 'Trainer'];
  var roleField;
  if (locked || isWFM) {
    roleField = '<span class="detail-readonly">' + escapeHtml(r.role || '\u2014') + '</span>';
  } else {
    roleField = '<select class="detail-select" data-idx="' + idx + '" data-key="role" data-record-id="' + escapeAttr(r._id || '') + '" onchange="handleCellEdit(this)" onclick="event.stopPropagation()">' 
      + '<option value="">\u2014</option>'
      + ROLE_OPTIONS.map(function(ro) { return '<option value="' + ro + '" ' + (r.role === ro ? 'selected' : '') + '>' + ro + '</option>'; }).join('')
      + '</select>';
  }

  // Planning Group dropdown (per-day editable)
  var PG_OPTIONS = ['S-ABF', 'CS-ABF', 'RECALL_MEASUREMENT_CTR', 'FAD_CTR', 'CSO_CTR', 'SME_CTR', 'QPE_CTR', 'MULTIPLE'];
  var pgField;
  if (locked || isWFM) {
    pgField = '<span class="detail-readonly">' + escapeHtml(r.actualPlanningGroup || '\u2014') + '</span>';
  } else {
    pgField = '<select class="detail-select" data-idx="' + idx + '" data-key="actualPlanningGroup" data-record-id="' + escapeAttr(r._id || '') + '" onchange="handleCellEdit(this)" onclick="event.stopPropagation()">' 
      + '<option value="">\u2014</option>'
      + PG_OPTIONS.map(function(pg) { return '<option value="' + pg + '" ' + (r.actualPlanningGroup === pg ? 'selected' : '') + '>' + pg + '</option>'; }).join('')
      + '</select>';
  }

  // Supervisor field — editable only by Managers and ADMIN_OHRS (updates snap_supervisor on this record only)
  var _ADMIN_OHRS_SUP = window.ADMIN_OHRS || ['740045023', '740044909'];
  var isAdminOrManager = cu && (cu.actual_role === 'Manager' || _ADMIN_OHRS_SUP.indexOf(cu.ohr_id) !== -1);
  var supervisorField;
  if (locked || isWFM || !isAdminOrManager) {
    supervisorField = '<span class="detail-readonly">' + escapeHtml(r.flm || '\u2014') + '</span>';
  } else {
    supervisorField = '<input type="text" class="detail-input" value="' + escapeAttr(r.flm || '') + '" data-idx="' + idx + '" data-key="flm" data-record-id="' + escapeAttr(r._id || '') + '" onchange="handleCellEdit(this)" onclick="event.stopPropagation()" placeholder="\u2014" list="supervisor-datalist">';
  }
  // Shift Time field — editable only by Managers and ADMIN_OHRS
  var SHIFT_OPTIONS = ['GY Shift', 'Mid-Shift'];
  var shiftField;
  if (locked || isWFM || !isAdminOrManager) {
    shiftField = '<span class="detail-readonly">' + escapeHtml(r.shiftTime || '\u2014') + '</span>';
  } else {
    shiftField = '<select class="detail-select" data-idx="' + idx + '" data-key="shiftTime" data-record-id="' + escapeAttr(r._id || '') + '" onchange="handleCellEdit(this)" onclick="event.stopPropagation()">'
      + '<option value="">\u2014</option>'
      + SHIFT_OPTIONS.map(function(s) { return '<option value="' + s + '" ' + (r.shiftTime === s ? 'selected' : '') + '>' + s + '</option>'; }).join('')
      + '</select>';
  }
  // Status dropdown — editable only by Managers and ADMIN_OHRS
  var STATUS_OPTIONS = ['Production', 'Training', 'Nesting', 'Attrition Backfill Training', 'Inactive', 'Exit'];
  var isStatusEditor = isAdminOrManager;
  var statusField;
  if (locked || isWFM || !isStatusEditor) {
    statusField = '<span class="detail-readonly">' + escapeHtml(r.status || '\u2014') + '</span>';
  } else {
    statusField = '<select class="detail-select" data-idx="' + idx + '" data-key="status" data-record-id="' + escapeAttr(r._id || '') + '" onchange="handleCellEdit(this)" onclick="event.stopPropagation()">' 
      + '<option value="">\u2014</option>'
      + STATUS_OPTIONS.map(function(s) { return '<option value="' + s + '" ' + (r.status === s ? 'selected' : '') + '>' + s + '</option>'; }).join('')
      + '</select>';
  }

  // === TWO-COLUMN LAYOUT: Details (left) | Audit Trail (right) ===
  return '<div class="detail-panel-split">'
    // LEFT COLUMN: Item details
    + '<div class="detail-panel-left">'
    + '<div class="detail-panel-grid">'
    // Row 1: Tag, WFM Tag, Reason, OT Hours
    + '<div class="detail-section"><span class="detail-label">TAG</span>' + tagField + '</div>'
    + '<div class="detail-section"><span class="detail-label">WFM TAG</span><span class="detail-readonly wfm-tag-detail">' + escapeHtml(r.wfm_tag || '\u2014') + '</span></div>'
    + '<div class="detail-section"><span class="detail-label">REASON</span>' + reasonField + '</div>'
    + '<div class="detail-section"><span class="detail-label">OT HOURS</span>' + otField + '</div>'
    + '<div class="detail-divider"></div>'
    // Row 2: Remarks (full width within left column)
    + '<div class="detail-section" style="grid-column:1/-1;"><span class="detail-label">REMARKS</span>' + remarksField + '</div>'
    + '<div class="detail-divider"></div>'
    // Row 3: Supervisor and Shift Time (admin/manager editable)
    + '<div class="detail-section"><span class="detail-label">SUPERVISOR</span>' + supervisorField + '</div>'
    + '<div class="detail-section"><span class="detail-label">SHIFT TIME</span>' + shiftField + '</div>'
    + '<div class="detail-section"><span class="detail-label">STATUS</span>' + statusField + '</div>'
    + '<div class="detail-section"></div>' /* spacer */
    + '<div class="detail-divider"></div>'
    // Row 4: Billing Role and Billing Planning Group (editable dropdowns)
    + '<div class="detail-section"><span class="detail-label">BILLING ROLE</span>' + roleField + '</div>'
    + '<div class="detail-section"><span class="detail-label">BILLING PLANNING GROUP</span>' + pgField + '</div>'
    + '<div class="detail-section"></div>' /* spacer */
    + '<div class="detail-section"></div>' /* spacer */
    + '<div class="detail-divider"></div>'
    // Row 5: Internal Role and Internal Planning Group (read-only, from io_employees)
    + '<div class="detail-section"><span class="detail-label">INTERNAL ROLE</span><span class="detail-value">' + escapeHtml(r.internalRole || '\u2014') + '</span></div>'
    + '<div class="detail-section"><span class="detail-label">INTERNAL PLANNING GROUP</span><span class="detail-value">' + escapeHtml(r.internalPlanningGroup || '\u2014') + '</span></div>'
    + '<div class="detail-section"></div>' /* spacer */
    + '<div class="detail-section"></div>' /* spacer */
    + '</div>'
    + '</div>'
    // RIGHT COLUMN: Audit Trail
    + '<div class="detail-panel-right">'
    + '<div class="detail-section detail-audit-inline">'
    + '<span class="detail-label">'
    + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:4px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
    + 'AUDIT TRAIL</span>'
    + '<div class="inline-audit-container" id="inline-audit-' + r._id + '">'
    + '<div class="inline-audit-loading"><div class="inline-audit-spinner"></div> Loading...</div>'
    + '</div>'
    + '</div>'
    + '</div>'
    + '</div>';
}

// ============================================================
// EXPAND / COLLAPSE
// ============================================================

window.compactToggleExpand = function(recordId, idx) {
  if (compactState.selectionMode) return; // Don't expand in selection mode

  if (compactState.expandedId === recordId) {
    // Collapse
    var panel = document.getElementById('detail-panel-' + recordId);
    if (panel) panel.classList.remove('open');
    var row = document.querySelector('tr.compact-row[data-id="' + recordId + '"]');
    if (row) row.classList.remove('row-expanded');
    var indicator = row ? row.querySelector('.expand-indicator') : null;
    if (indicator) indicator.innerHTML = '&#9660;';
    compactState.expandedId = null;
  } else {
    // Collapse previous
    if (compactState.expandedId) {
      var prevPanel = document.getElementById('detail-panel-' + compactState.expandedId);
      if (prevPanel) prevPanel.classList.remove('open');
      var prevRow = document.querySelector('tr.compact-row[data-id="' + compactState.expandedId + '"]');
      if (prevRow) { prevRow.classList.remove('row-expanded'); var pi = prevRow.querySelector('.expand-indicator'); if (pi) pi.innerHTML = '&#9660;'; }
    }
    // Expand new
    compactState.expandedId = recordId;
    var newPanel = document.getElementById('detail-panel-' + recordId);
    var newRow = document.querySelector('tr.compact-row[data-id="' + recordId + '"]');
    if (newRow) { newRow.classList.add('row-expanded'); var ni = newRow.querySelector('.expand-indicator'); if (ni) ni.innerHTML = '&#9650;'; }
    if (newPanel) {
      setTimeout(function() { newPanel.classList.add('open'); }, 10);
      // Auto-fetch inline audit trail
      fetchInlineAudit(recordId);
    }
  }
};

// Refresh the detail panel content after a tag change (without full re-render)
window.compactRefreshDetailPanel = function(recordId, idx) {
  var panel = document.getElementById('detail-panel-' + recordId);
  if (!panel || !panel.classList.contains('open')) return;
  var r = null;
  for (var i = 0; i < appState.records.length; i++) {
    if (appState.records[i]._id === recordId) { r = appState.records[i]; break; }
  }
  if (!r) return;
  var locked = isRowLocked(r);
  panel.innerHTML = renderDetailPanel(r, idx, locked);
  // Re-fetch the inline audit trail (cache was already invalidated by handleCellEdit)
  fetchInlineAudit(recordId);
};

// Refresh a single row's tag chip after edit (without full re-render)
window.compactRefreshRow = function(recordId) {
  // Find the record
  var row = document.querySelector('tr.compact-row[data-id="' + recordId + '"]');
  if (!row) return;
  // Find the tag cell (3rd td)
  var tagTd = row.querySelectorAll('td')[2];
  if (!tagTd) return;
  // Find the record
  for (var i = 0; i < appState.records.length; i++) {
    if (appState.records[i]._id === recordId) {
      var rec = appState.records[i];
      var wfmChip = rec.wfm_tag ? '<span class="wfm-tag-chip">' + escapeHtml(rec.wfm_tag) + '</span>' : '';
      tagTd.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;gap:4px;">' + renderTagChip(rec.tag) + wfmChip + '</div>';
      // Add pulse animation
      var chip = tagTd.querySelector('.tag-chip');
      if (chip) {
        chip.classList.add('just-changed');
        setTimeout(function() { chip.classList.remove('just-changed'); }, 300);
      }
      break;
    }
  }
};

// ============================================================
// SELECTION MODE & FLOATING COMMAND BAR
// ============================================================

window.toggleSelectionMode = function() {
  compactState.selectionMode = !compactState.selectionMode;
  if (!compactState.selectionMode) {
    bulkDeselectAll();
  }
  // Close any expanded panel
  compactState.expandedId = null;
  renderCompactTable();

  // Show/hide bulk status action for Managers/Admins only
  var cu = typeof currentUser !== 'undefined' ? currentUser : null;
  var _ADMIN_OHRS_BULK = window.ADMIN_OHRS || ['740045023', '740044909'];
  var isStatusEditor = cu && (cu.actual_role === 'Manager' || _ADMIN_OHRS_BULK.indexOf(cu.ohr_id) !== -1);
  var statusEls = document.querySelectorAll('.fcb-status-only');
  for (var si = 0; si < statusEls.length; si++) {
    statusEls[si].style.display = (compactState.selectionMode && isStatusEditor) ? '' : 'none';
  }

  var btn = document.getElementById('select-mode-btn');
  if (btn) {
    if (compactState.selectionMode) {
      btn.classList.add('active');
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> Selection Mode';
    } else {
      btn.classList.remove('active');
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg> Select Rows';
    }
  }
};

window.compactToggleSelect = function(idx, rowEl) {
  // In server-side mode, resolve the _id for stable selection
  var selKey = idx;
  if (typeof serverPagState !== 'undefined' && serverPagState.enabled) {
    if (typeof idx === 'string') {
      // Direct _id string
      selKey = idx;
    } else {
      // Numeric index fallback
      var rec = (serverPagState.rows || [])[idx] || appState.records[idx];
      if (rec && rec._id) selKey = rec._id;
    }
  }
  if (bulkState.selected.has(selKey)) {
    bulkState.selected.delete(selKey);
    rowEl.classList.remove('row-selected');
    var cb = rowEl.querySelector('.compact-checkbox');
    if (cb) cb.checked = false;
  } else {
    bulkState.selected.add(selKey);
    rowEl.classList.add('row-selected');
    var cb2 = rowEl.querySelector('.compact-checkbox');
    if (cb2) cb2.checked = true;
  }
  updateFloatingCommandBar();
};

window.compactSelectAll = function() {
  bulkState.selectAllMatching = false; // reset cross-page flag
  // Select all non-locked rows in current filtered data
  if (typeof serverPagState !== 'undefined' && serverPagState.enabled) {
    // Server-side mode: select by _id from current page rows
    var rows = serverPagState.rows || [];
    for (var si = 0; si < rows.length; si++) {
      if (rows[si] && rows[si]._id && !isRowLocked(rows[si])) {
        bulkState.selected.add(rows[si]._id);
      }
    }
    // Show cross-page banner if total exceeds current page
    if (typeof showSelectAllBanner === 'function') {
      showSelectAllBanner(serverPagState.total, rows.length);
    }
  } else {
    // Client-side mode: select by originalIndex
    var items = appState._filteredData || [];
    for (var i = 0; i < items.length; i++) {
      if (!isRowLocked(items[i].record)) {
        bulkState.selected.add(items[i].originalIndex);
      }
    }
    if (typeof hideSelectAllBanner === 'function') hideSelectAllBanner();
  }
  renderCompactTable();
};

function updateFloatingCommandBar() {
  var bar = document.getElementById('floating-command-bar');
  if (!bar) return;
  var count = bulkState.selectAllMatching ? (serverPagState.total || bulkState.selected.size) : bulkState.selected.size;
  if (count > 0 && compactState.selectionMode) {
    bar.classList.add('visible');
    var countEl = document.getElementById('fcb-count');
    if (countEl) countEl.textContent = formatNumber(count) + ' selected' + (bulkState.selectAllMatching ? ' (all matching)' : '');
  } else {
    bar.classList.remove('visible');
  }
}

// Floating bar bulk apply
window.fcbApplyTag = async function() {
  var sel = document.getElementById('fcb-tag-select');
  var tag = sel ? sel.value : '';
  if (tag === '_select') { showToast('Please select a tag first', 'info'); return; }

  // ===== Cross-page bulk tag: use filtered endpoint =====
  if (bulkState.selectAllMatching && typeof serverPagState !== 'undefined' && serverPagState.enabled) {
    var totalMatching = serverPagState.total || 0;
    if (!confirm('Apply tag to all ' + formatNumber(totalMatching) + ' matching records? This cannot be undone.')) return;
    var applyBtn2 = document.getElementById('fcb-apply-btn');
    if (applyBtn2) { applyBtn2.disabled = true; applyBtn2.textContent = 'Applying...'; }
    try {
      var user2 = typeof currentUser !== 'undefined' ? currentUser : null;
      var dateFilter2 = omnibarState.filters['date_range'];
      var today2 = typeof getTodayStr === 'function' ? getTodayStr() : new Date().toISOString().slice(0, 10);
      var filterPayload = {
        log_date_gte: dateFilter2 ? dateFilter2.startDate : today2,
        log_date_lte: dateFilter2 ? dateFilter2.endDate : today2,
      };
      var fkeys = Object.keys(omnibarState.filters);
      for (var fki = 0; fki < fkeys.length; fki++) {
        var ff = omnibarState.filters[fkeys[fki]];
        if (ff.type === 'multi' && ff.values && ff.values.length > 0) {
          var fkMap = { tag: 'tag_in', agent: 'agent_in', flm: 'flm_in',
            actualPlanningGroup: 'planning_group_in', status: 'status_in',
            shiftTime: 'shift_time_in', role: 'role_in' };
          var fpk = fkMap[ff.key];
          if (fpk) filterPayload[fpk] = ff.values.join('|');
        }
        if (ff.type === 'toggle' && ff.key === 'blanks') filterPayload.blanks_only = true;
      }
      var resp2 = await fetch(IO_API_BASE + '/attendance/bulk-tag-filtered', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tag: tag,
          actor_ohr: user2 ? user2.ohr_id || '' : '',
          actor_name: user2 ? user2.full_name || '' : '',
          filters: filterPayload,
        }),
      });
      var result2 = await resp2.json();
      if (result2.ok) {
        var tagLabel2 = tag === '' ? 'blank' : '"' + tag + '"';
        var msg2 = 'Bulk tagged ' + result2.updated + ' of ' + result2.total + ' record(s) as ' + tagLabel2
          + (result2.locked > 0 ? ' (' + result2.locked + ' locked rows skipped)' : '')
          + (result2.skipped > 0 ? ' (' + result2.skipped + ' already tagged)' : '');
        showToast(msg2, 'success');
        compactState.selectionMode = false;
        bulkDeselectAll();
        if (typeof serverPageChange === 'function') {
          try { await serverPageChange(appState.inputPage); } catch (e) { renderCompactTable(); }
        } else { renderCompactTable(); }
      } else {
        showToast('Bulk tag failed: ' + (result2.error || 'Unknown error'), 'error');
      }
    } catch (err2) {
      showToast('Bulk tag failed: ' + err2.message, 'error');
    } finally {
      if (applyBtn2) { applyBtn2.disabled = false; applyBtn2.textContent = 'Apply'; }
    }
    return;
  }

  // ===== Standard per-ID bulk tag =====
  var selectedIds = [...bulkState.selected];
  if (selectedIds.length === 0) { showToast('No rows selected', 'info'); return; }
  if (selectedIds.length > 50) { showToast('Bulk editing is limited to 50 rows at a time', 'error'); return; }

  var recordIds = [];
  if (typeof serverPagState !== 'undefined' && serverPagState.enabled) {
    // Server-side mode: selectedIds are _id strings
    for (var si = 0; si < selectedIds.length; si++) {
      var rid = selectedIds[si];
      var record = (serverPagState.rows || []).find(function(r) { return r._id === rid; })
        || appState.records.find(function(r) { return r._id === rid; });
      if (record && !isRowLocked(record)) {
        recordIds.push(rid);
      }
    }
  } else {
    // Client-side mode: selectedIds are indices
    for (var si = 0; si < selectedIds.length; si++) {
      var record = appState.records[selectedIds[si]];
      if (record && record._id && !isRowLocked(record)) {
        recordIds.push(record._id);
      }
    }
  }
  if (recordIds.length === 0) { showToast('No editable rows in selection', 'info'); return; }

  var applyBtn = document.getElementById('fcb-apply-btn');
  if (applyBtn) { applyBtn.disabled = true; applyBtn.textContent = 'Applying...'; }

  try {
    var user = typeof currentUser !== 'undefined' ? currentUser : null;
    var resp = await fetch(IO_API_BASE + '/attendance/bulk-tag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: recordIds,
        tag: tag,
        actor_ohr: user ? user.ohr_id || '' : '',
        actor_name: user ? user.full_name || '' : '',
      }),
    });
    var result = await resp.json();
    if (result.ok) {
      // Update local state with new tag values
      for (var ri2 = 0; ri2 < recordIds.length; ri2++) {
        var taggedId = recordIds[ri2];
        var localRec = appState.records.find(function(r) { return r._id === taggedId; });
        if (localRec && !isRowLocked(localRec)) {
          localRec.tag = tag;
          if (tag !== 'UPL' && tag !== 'LATE') {
            localRec.uplReason = '';
          }
        }
      }
      appState.originalRecords = JSON.parse(JSON.stringify(appState.records));

      // Sync serverPagState.rows with bulk-tagged values
      if (typeof serverPagState !== 'undefined' && serverPagState.enabled && serverPagState.rows) {
        for (var bri = 0; bri < recordIds.length; bri++) {
          var bRow = serverPagState.rows.find(function(r) { return r._id === recordIds[bri]; });
          if (bRow) {
            bRow.tag = tag;
            if (tag !== 'UPL' && tag !== 'LATE') {
              bRow.uplReason = '';
              bRow.upl_reason = '';
            }
          }
        }
      }

      // Invalidate audit cache for all bulk-tagged records
      for (var ri = 0; ri < recordIds.length; ri++) {
        invalidateAuditCache(recordIds[ri]);
      }

      var tagLabel = tag === '' ? 'blank' : '"' + tag + '"';
      showToast('Bulk tagged ' + result.updated + ' record(s) as ' + tagLabel, 'success');
      compactState.selectionMode = false;
      bulkDeselectAll();

      // Re-fetch current page from server for data consistency
      if (typeof serverPagState !== 'undefined' && serverPagState.enabled && typeof serverPageChange === 'function') {
        try {
          await serverPageChange(appState.inputPage);
        } catch (refreshErr) {
          console.warn('[FCB BulkTag] Server re-fetch failed, using local state:', refreshErr);
          renderCompactTable();
        }
      } else {
        renderCompactTable();
      }
    } else {
      showToast('Bulk tag failed: ' + (result.error || 'Unknown error'), 'error');
    }
  } catch (err) {
    showToast('Bulk tag failed: ' + err.message, 'error');
  } finally {
    if (applyBtn) { applyBtn.disabled = false; applyBtn.textContent = 'Apply'; }
  }
};

// ============================================================
// BULK STATUS UPDATE
// ============================================================
window.fcbApplyStatus = async function() {
  var sel = document.getElementById('fcb-status-select');
  var status = sel ? sel.value : '';
  if (status === '_select') { showToast('Please select a status first', 'info'); return; }

  var count = bulkState.selectAllMatching ? (serverPagState.total || bulkState.selected.size) : bulkState.selected.size;
  if (count === 0) { showToast('No rows selected', 'info'); return; }

  // Confirmation dialog
  if (!confirm('Change status to "' + status + '" for ' + formatNumber(count) + ' record(s)?\n\nThis will be logged in the audit trail and you will receive a notification.')) return;

  var user = typeof currentUser !== 'undefined' ? currentUser : null;
  var applyBtn = document.getElementById('fcb-apply-status-btn');
  if (applyBtn) { applyBtn.disabled = true; applyBtn.textContent = 'Applying...'; }

  try {
    // Cross-page bulk status: use filtered endpoint
    if (bulkState.selectAllMatching && typeof serverPagState !== 'undefined' && serverPagState.enabled) {
      var dateFilter = omnibarState.filters['date_range'];
      var today = typeof getTodayStr === 'function' ? getTodayStr() : new Date().toISOString().slice(0, 10);
      var filterPayload = {
        log_date_gte: dateFilter ? dateFilter.startDate : today,
        log_date_lte: dateFilter ? dateFilter.endDate : today,
      };
      var fkeys = Object.keys(omnibarState.filters);
      for (var fki = 0; fki < fkeys.length; fki++) {
        var ff = omnibarState.filters[fkeys[fki]];
        if (ff.type === 'multi' && ff.values && ff.values.length > 0) {
          var fkMap = { tag: 'tag_in', agent: 'agent_in', flm: 'flm_in',
            actualPlanningGroup: 'planning_group_in', status: 'status_in',
            shiftTime: 'shift_time_in', role: 'role_in' };
          var fpk = fkMap[ff.key];
          if (fpk) filterPayload[fpk] = ff.values.join('|');
        }
        if (ff.type === 'toggle' && ff.key === 'blanks') filterPayload.blanks_only = true;
      }
      var resp = await fetch(IO_API_BASE + '/attendance/bulk-status-filtered', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: status,
          actor_ohr: user ? user.ohr_id || '' : '',
          actor_name: user ? user.full_name || '' : '',
          filters: filterPayload,
        }),
      });
      var result = await resp.json();
      if (result.ok) {
        var msg = 'Bulk status changed: ' + result.updated + ' of ' + result.total + ' record(s) to "' + status + '"'
          + (result.locked > 0 ? ' (' + result.locked + ' locked rows skipped)' : '')
          + (result.skipped > 0 ? ' (' + result.skipped + ' already "' + status + '")' : '');
        showToast(msg, 'success');
        compactState.selectionMode = false;
        bulkDeselectAll();
        if (typeof serverPageChange === 'function') {
          try { await serverPageChange(appState.inputPage); } catch (e) { renderCompactTable(); }
        } else { renderCompactTable(); }
      } else {
        showToast('Bulk status failed: ' + (result.error || 'Unknown error'), 'error');
      }
      return;
    }

    // Standard per-ID bulk status
    var selectedIds = [...bulkState.selected];
    if (selectedIds.length === 0) { showToast('No rows selected', 'info'); return; }
    if (selectedIds.length > 50) { showToast('Bulk status is limited to 50 rows at a time', 'error'); return; }

    var recordIds = [];
    if (typeof serverPagState !== 'undefined' && serverPagState.enabled) {
      recordIds = selectedIds; // Already _id strings
    } else {
      for (var i = 0; i < selectedIds.length; i++) {
        var rec = appState.records[selectedIds[i]];
        if (rec && rec._id) recordIds.push(rec._id);
      }
    }

    var resp2 = await fetch(IO_API_BASE + '/attendance/bulk-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: recordIds,
        status: status,
        actor_ohr: user ? user.ohr_id || '' : '',
        actor_name: user ? user.full_name || '' : '',
      }),
    });
    var result2 = await resp2.json();
    if (result2.ok) {
      // Update local state
      for (var ri = 0; ri < recordIds.length; ri++) {
        var localRec = appState.records.find(function(r) { return r._id === recordIds[ri]; });
        if (localRec) localRec.status = status;
      }
      if (typeof serverPagState !== 'undefined' && serverPagState.enabled && serverPagState.rows) {
        for (var bri = 0; bri < recordIds.length; bri++) {
          var bRow = serverPagState.rows.find(function(r) { return r._id === recordIds[bri]; });
          if (bRow) { bRow.status = status; bRow.snap_status = status; }
        }
      }
      for (var ai = 0; ai < recordIds.length; ai++) { invalidateAuditCache(recordIds[ai]); }

      var msg2 = 'Bulk status changed: ' + result2.updated + ' record(s) to "' + status + '"'
        + (result2.locked > 0 ? ' (' + result2.locked + ' locked rows skipped)' : '')
        + (result2.skipped > 0 ? ' (' + result2.skipped + ' already "' + status + '")' : '');
      showToast(msg2, 'success');
      compactState.selectionMode = false;
      bulkDeselectAll();

      if (typeof serverPagState !== 'undefined' && serverPagState.enabled && typeof serverPageChange === 'function') {
        try { await serverPageChange(appState.inputPage); } catch (e) { renderCompactTable(); }
      } else { renderCompactTable(); }
    } else {
      showToast('Bulk status failed: ' + (result2.error || 'Unknown error'), 'error');
    }
  } catch (err) {
    showToast('Bulk status failed: ' + err.message, 'error');
  } finally {
    if (applyBtn) { applyBtn.disabled = false; applyBtn.textContent = 'Apply Status'; }
    if (sel) sel.value = '_select';
  }
};

window.fcbDeselectAll = function() {
  bulkDeselectAll();
  compactState.selectionMode = false;
  var btn = document.getElementById('select-mode-btn');
  if (btn) {
    btn.classList.remove('active');
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg> Select Rows';
  }
  renderCompactTable();
};

// ============================================================
// INIT FCB TAG DROPDOWN
// ============================================================

function initFcbTagDropdown() {
  var sel = document.getElementById('fcb-tag-select');
  if (!sel) return;
  var cu = typeof currentUser !== 'undefined' ? currentUser : null;
  var tagOpts = TAG_OPTIONS;
  while (sel.options.length > 2) sel.remove(2);
  tagOpts.forEach(function(t) {
    var opt = document.createElement('option');
    opt.value = t; opt.textContent = t;
    sel.appendChild(opt);
  });
}

// ============================================================
// OVERRIDE renderInputTable to use compact renderer
// ============================================================

// Store original for fallback
var _origRenderInputTable = typeof renderInputTable === 'function' ? renderInputTable : null;

// Override
window.renderInputTable = function() {
  renderCompactTable();
};

// Also override the server-side version
var _origRenderInputTableServerSide = typeof renderInputTableServerSide === 'function' ? renderInputTableServerSide : null;
window.renderInputTableServerSide = function() {
  renderCompactTable();
};

// Override pageToggleAll for compact mode
window.pageToggleAll = function(checked) {
  if (checked) {
    compactSelectAll();
  } else {
    bulkDeselectAll();
    renderCompactTable();
  }
};

// ============================================================
// INLINE AUDIT TRAIL — fetch and render on expand
// ============================================================

var auditCache = {}; // Cache by recordId to avoid re-fetching

async function fetchInlineAudit(recordId) {
  var container = document.getElementById('inline-audit-' + recordId);
  if (!container) return;

  // If cached, render immediately
  if (auditCache[recordId]) {
    container.innerHTML = renderInlineAuditTimeline(auditCache[recordId]);
    animateAuditEntries(container);
    return;
  }

  // Show loading
  container.innerHTML = '<div class="inline-audit-loading"><div class="inline-audit-spinner"></div> Loading...</div>';

  try {
    var resp = await fetch(IO_API_BASE + '/audit-log?record_id=' + encodeURIComponent(recordId) + '&record_type=attendance&limit=50');
    var logs = await resp.json();
    auditCache[recordId] = logs;
    container.innerHTML = renderInlineAuditTimeline(logs);
    animateAuditEntries(container);
  } catch (err) {
    container.innerHTML = '<div class="inline-audit-empty">Failed to load audit trail.</div>';
  }
}

function renderInlineAuditTimeline(logs) {
  if (!Array.isArray(logs) || logs.length === 0) {
    return '<div class="inline-audit-empty">No changes recorded.</div>';
  }

  var html = '<div class="inline-audit-timeline">';
  for (var i = 0; i < logs.length; i++) {
    var entry = logs[i];
    var ts = entry.timestamp ? new Date(entry.timestamp) : null;
    var timeStr = ts ? ts.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Unknown';
    var actionLabel = entry.action === 'bulk_tag' ? 'Bulk Tag' : entry.action === 'edit' ? 'Edit' : entry.action || 'Change';
    var fieldLabel = (entry.field_name || '').replace(/_/g, ' ');

    html += '<div class="inline-audit-entry" style="animation-delay:' + (i * 60) + 'ms">'
      + '<div class="inline-audit-dot"></div>'
      + '<div class="inline-audit-content">'
      + '<div class="inline-audit-header">'
      + '<span class="inline-audit-action inline-audit-action-' + (entry.action || 'edit') + '">' + escapeHtml(actionLabel) + '</span>'
      + '<span class="inline-audit-field">' + escapeHtml(fieldLabel) + '</span>'
      + '<span class="inline-audit-time">' + escapeHtml(timeStr) + '</span>'
      + '</div>'
      + '<div class="inline-audit-change">'
      + '<span class="inline-audit-old">' + escapeHtml(entry.old_value || '(empty)') + '</span>'
      + '<span class="inline-audit-arrow">\u2192</span>'
      + '<span class="inline-audit-new">' + escapeHtml(entry.new_value || '(empty)') + '</span>'
      + '</div>'
      + '<div class="inline-audit-actor">by ' + escapeHtml(entry.actor_name || entry.actor_ohr || 'System') + '</div>'
      + '</div>'
      + '</div>';
  }
  html += '</div>';
  return html;
}

function animateAuditEntries(container) {
  var entries = container.querySelectorAll('.inline-audit-entry');
  for (var i = 0; i < entries.length; i++) {
    entries[i].classList.add('animate-in');
  }
}

// Invalidate audit cache for a record after edit
window.invalidateAuditCache = function(recordId) {
  delete auditCache[recordId];
};

// Init FCB dropdown on load
(function() {
  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFcbTagDropdown);
  } else {
    setTimeout(initFcbTagDropdown, 100);
  }
})();

// ===== Bulk Field Change (Admin/Manager only) =====
// Show inline confirmation for bulk field change
window.fcbShowFieldConfirm = function() {
  var fieldSel = document.getElementById('fcb-field-select');
  var valueSel = document.getElementById('fcb-field-value');
  var field = fieldSel ? fieldSel.value : '';
  var value = valueSel ? valueSel.value : '';
  if (value === '_select') value = '';
  if (field === '_select') { showToast('Please select a field first', 'info'); return; }
  if (!value) { showToast('Please select a value', 'info'); return; }
  var count = bulkState.selectAllMatching ? (serverPagState.total || bulkState.selected.size) : bulkState.selected.size;
  if (count === 0) { showToast('No rows selected/matched', 'info'); return; }
  var FIELD_LABELS = {
    snap_supervisor: 'Supervisor', role: 'Billing Role', planning_group: 'Billing PG',
    internal_role: 'Internal Role', internal_planning_group: 'Internal PG',
    snap_shift_time: 'Shift Time', snap_status: 'Status'
  };
  var label = FIELD_LABELS[field] || field;
  var confirmPanel = document.getElementById('fcb-field-confirm');
  var confirmMsg = document.getElementById('fcb-field-confirm-msg');
  if (confirmMsg) confirmMsg.textContent = 'Change \u201c' + label + '\u201d to \u201c' + (value || '(empty)') + '\u201d for ' + formatNumber(count) + ' record(s)? (Logged in audit trail)';
  if (confirmPanel) confirmPanel.style.display = 'flex';
};
window.fcbHideFieldConfirm = function() {
  var confirmPanel = document.getElementById('fcb-field-confirm');
  if (confirmPanel) confirmPanel.style.display = 'none';
};

window.fcbApplyField = async function() {
  // Hide the inline confirmation
  fcbHideFieldConfirm();
  var fieldSel = document.getElementById('fcb-field-select');
  var valueSel = document.getElementById('fcb-field-value');
  var field = fieldSel ? fieldSel.value : '';
  var value = valueSel ? valueSel.value : '';
  if (value === '_select') value = '';
  if (field === '_select') { showToast('Please select a field first', 'info'); return; }
  if (!value) { showToast('Please select a value', 'info'); return; }
  var count = bulkState.selectAllMatching ? (serverPagState.total || bulkState.selected.size) : bulkState.selected.size;
  if (count === 0) { showToast('No rows selected/matched', 'info'); return; }
  var FIELD_LABELS = {
    snap_supervisor: 'Supervisor', role: 'Billing Role', planning_group: 'Billing PG',
    internal_role: 'Internal Role', internal_planning_group: 'Internal PG',
    snap_shift_time: 'Shift Time', snap_status: 'Status'
  };
  var label = FIELD_LABELS[field] || field;
  var user = typeof currentUser !== 'undefined' ? currentUser : null;
  var applyBtn = document.getElementById('fcb-apply-field-btn');
  if (applyBtn) { applyBtn.disabled = true; applyBtn.textContent = 'Applying...'; }
  try {
    // Build filters from current appState
    var filters = {};
    if (appState.dateRange && appState.dateRange.start) filters.log_date_gte = appState.dateRange.start;
    if (appState.dateRange && appState.dateRange.end) filters.log_date_lte = appState.dateRange.end;
    if (appState.filters) {
      if (appState.filters.tag_in) filters.tag_in = appState.filters.tag_in;
      if (appState.filters.agent_in) filters.agent_in = appState.filters.agent_in;
      if (appState.filters.flm_in) filters.flm_in = appState.filters.flm_in;
      if (appState.filters.planning_group_in) filters.planning_group_in = appState.filters.planning_group_in;
      if (appState.filters.status_in) filters.status_in = appState.filters.status_in;
      if (appState.filters.shift_time_in) filters.shift_time_in = appState.filters.shift_time_in;
      if (appState.filters.role_in) filters.role_in = appState.filters.role_in;
      if (appState.filters.wfm_tag_in) filters.wfm_tag_in = appState.filters.wfm_tag_in;
      if (appState.filters.blanks_only) filters.blanks_only = true;
    }
    var resp = await fetch(IO_API_BASE + '/attendance/bulk-field-filtered', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-actor-ohr': user ? user.ohr_id || '' : '', 'x-actor-name': user ? user.full_name || '' : '' },
      body: JSON.stringify({
        field: field,
        value: value,
        actor_ohr: user ? user.ohr_id || '' : '',
        actor_name: user ? user.full_name || '' : '',
        filters: filters,
      }),
    });
    var text = await resp.text();
    var result;
    try { result = JSON.parse(text); } catch (e) {
      showToast('Bulk field change failed: ' + (resp.status === 500 ? 'Server error — please try again' : text.slice(0, 100)), 'error');
      return;
    }
    if (result.ok) {
      showToast(label + ' updated for ' + formatNumber(result.updated) + ' record(s)' + (result.skipped > 0 ? ' (' + result.skipped + ' already had this value)' : ''), 'success');
      // Reset field selection
      if (fieldSel) fieldSel.value = '_select';
      if (valueSel) valueSel.innerHTML = '<option value="_select">&mdash; Value &mdash;</option>';
      // Refresh data
      if (typeof serverPageChange === 'function') {
        try { await serverPageChange(appState.inputPage); } catch (e) { renderCompactTable(); }
      } else { renderCompactTable(); }
    } else {
      showToast('Bulk field change failed: ' + (result.error || 'Unknown error'), 'error');
    }
  } catch (err) {
    showToast('Bulk field change failed: ' + err.message, 'error');
  } finally {
    if (applyBtn) { applyBtn.disabled = false; applyBtn.textContent = 'Apply Field'; }
  }
};

// === Dynamic value dropdown for Bulk Edit Field ===
(function() {
  var fieldSel = document.getElementById('fcb-field-select');
  var valueSel = document.getElementById('fcb-field-value');
  if (!fieldSel || !valueSel) return;

  // Helper: extract unique sorted values from employeeLookup by field name
  function getValuesFromEmployees(empField) {
    if (typeof employeeLookup !== 'object') return [];
    var vals = Object.values(employeeLookup).map(function(e) { return (e[empField] || '').trim(); }).filter(Boolean);
    return [...new Set(vals)].sort();
  }

  // Helper: extract unique sorted values from serverPagState.rows by field name
  function getValuesFromRows(rowField) {
    if (typeof serverPagState === 'undefined' || !serverPagState.rows) return [];
    var vals = serverPagState.rows.map(function(r) { return (r[rowField] || '').trim(); }).filter(Boolean);
    return [...new Set(vals)].sort();
  }

  fieldSel.addEventListener('change', function() {
    var field = fieldSel.value;
    // Clear existing options and reset to placeholder
    valueSel.innerHTML = '<option value="_select">&mdash; Value &mdash;</option>';

    if (field === '_select') return;

    var options = [];
    var ms = (typeof appState !== 'undefined' && appState.multiSelects) ? appState.multiSelects : {};
    var hasMultiSelects = ms.flm && ms.flm.options && ms.flm.options.length > 0;

    if (field === 'snap_supervisor') {
      options = hasMultiSelects ? (ms.flm.options || []) : getValuesFromEmployees('supervisor_name');
      if (!options.length) options = getValuesFromRows('snap_supervisor');
    } else if (field === 'role') {
      options = hasMultiSelects ? (ms.role.options || []) : getValuesFromRows('role');
      if (!options.length) options = getValuesFromRows('snap_actual_role');
      if (!options.length) options = getValuesFromEmployees('actual_role');
    } else if (field === 'planning_group') {
      options = hasMultiSelects ? (ms.pg.options || []) : getValuesFromRows('planning_group');
      if (!options.length) options = getValuesFromRows('snap_planning_group');
      if (!options.length) options = getValuesFromEmployees('planning_group');
    } else if (field === 'internal_role') {
      options = hasMultiSelects ? (ms.role && ms.role.options || []) : getValuesFromRows('internal_role');
      if (!options.length) options = getValuesFromEmployees('actual_role');
    } else if (field === 'internal_planning_group') {
      options = hasMultiSelects ? (ms.pg && ms.pg.options || []) : getValuesFromRows('internal_planning_group');
      if (!options.length) options = getValuesFromEmployees('planning_group');
    } else if (field === 'snap_shift_time') {
      options = ['GY Shift', 'Mid-Shift'];
    } else if (field === 'snap_status') {
      options = hasMultiSelects ? (ms.status && ms.status.options || []) : getValuesFromRows('snap_status');
      if (!options.length) options = getValuesFromEmployees('srt_status');
    }

    for (var i = 0; i < options.length; i++) {
      var opt = document.createElement('option');
      opt.value = options[i];
      opt.textContent = options[i];
      valueSel.appendChild(opt);
    }
  });
})();
