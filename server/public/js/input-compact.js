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
    + '<th style="width:80px;text-align:center;">Tag</th>'
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
  var isSelected = bulkState.selected.has(idx);
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

  // Tag cell
  var tagCell = '<td style="text-align:center;">' + renderTagChip(r.tag) + '</td>';

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

  // Selection cell
  var selectCell;
  if (compactState.selectionMode) {
    if (locked) {
      selectCell = '<td class="row-select-cell"><span class="compact-lock" title="Locked">&#128274;</span></td>';
    } else {
      selectCell = '<td class="row-select-cell"><input type="checkbox" class="compact-checkbox" data-idx="' + idx + '" '
        + (isSelected ? 'checked' : '')
        + ' onclick="event.stopPropagation(); bulkToggleRow(' + idx + ', this.checked)" /></td>';
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
  var canSeePL = cu && (cu.ohr_id === '740045023' || cu.ohr_id === '740044909' || cu.actual_role === 'Manager');
  var tagOpts = TAG_OPTIONS.filter(function(t) { return t !== 'PL' || canSeePL; });

  var tagField;
  if (locked || isWFM) {
    tagField = '<span class="detail-readonly">' + escapeHtml(r.tag || '\u2014') + '</span>';
  } else {
    tagField = '<select class="detail-select" data-idx="' + idx + '" data-key="tag" onchange="handleCellEdit(this)" onclick="event.stopPropagation()">' 
      + '<option value="">\u2014</option>'
      + tagOpts.map(function(t) { return '<option value="' + t + '" ' + (r.tag === t ? 'selected' : '') + '>' + t + '</option>'; }).join('')
      + '</select>';
  }

  // UPL Reason
  var reasonField;
  var canEditReason = !locked && !isWFM && (r.tag === 'UPL' || r.tag === 'LATE');
  if (canEditReason) {
    reasonField = '<select class="detail-select" data-idx="' + idx + '" data-key="uplReason" onchange="handleCellEdit(this)" onclick="event.stopPropagation()">' 
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
  var isOtMechAgent = (r.role === 'Agent') && OT_MECH_PGS.indexOf(r.actualPlanningGroup) !== -1;
  var isAfterCutoff = r.date && r.date > OT_MECH_CUTOFF;
  if (locked || isWFM || (isOtMechAgent && isAfterCutoff)) {
    otField = '<span class="detail-readonly">' + escapeHtml(r.ot || '\u2014') + '</span>';
  } else {
    otField = '<input type="number" step="0.5" min="0" class="detail-input" value="' + escapeAttr(r.ot || '') + '" data-idx="' + idx + '" data-key="ot" onchange="handleCellEdit(this)" onclick="event.stopPropagation()" placeholder="\u2014">';
  }

  // Remarks
  var remarksField;
  if (locked || isWFM) {
    remarksField = '<span class="detail-readonly">' + escapeHtml(r.remarks || '\u2014') + '</span>';
  } else {
    remarksField = '<textarea class="detail-textarea" data-idx="' + idx + '" data-key="remarks" onchange="handleCellEdit(this)" onclick="event.stopPropagation()" placeholder="\u2014">' + escapeHtml(r.remarks || '') + '</textarea>';
  }

  // Role dropdown (per-day editable)
  var ROLE_OPTIONS = ['Agent', 'Operational SME', 'Quality & Policy Expert', 'Team Lead', 'Trainer'];
  var roleField;
  if (locked || isWFM) {
    roleField = '<span class="detail-readonly">' + escapeHtml(r.role || '\u2014') + '</span>';
  } else {
    roleField = '<select class="detail-select" data-idx="' + idx + '" data-key="role" onchange="handleCellEdit(this)" onclick="event.stopPropagation()">' 
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
    pgField = '<select class="detail-select" data-idx="' + idx + '" data-key="actualPlanningGroup" onchange="handleCellEdit(this)" onclick="event.stopPropagation()">' 
      + '<option value="">\u2014</option>'
      + PG_OPTIONS.map(function(pg) { return '<option value="' + pg + '" ' + (r.actualPlanningGroup === pg ? 'selected' : '') + '>' + pg + '</option>'; }).join('')
      + '</select>';
  }

  // === TWO-COLUMN LAYOUT: Details (left) | Audit Trail (right) ===
  return '<div class="detail-panel-split">'
    // LEFT COLUMN: Item details
    + '<div class="detail-panel-left">'
    + '<div class="detail-panel-grid">'
    // Row 1: Tag, Reason, OT Hours
    + '<div class="detail-section"><span class="detail-label">TAG</span>' + tagField + '</div>'
    + '<div class="detail-section"><span class="detail-label">REASON</span>' + reasonField + '</div>'
    + '<div class="detail-section"><span class="detail-label">OT HOURS</span>' + otField + '</div>'
    + '<div class="detail-divider"></div>'
    // Row 2: Remarks (full width within left column)
    + '<div class="detail-section" style="grid-column:1/-1;"><span class="detail-label">REMARKS</span>' + remarksField + '</div>'
    + '<div class="detail-divider"></div>'
    // Row 3: Status
    + '<div class="detail-section"><span class="detail-label">STATUS</span><span class="detail-value">' + escapeHtml(r.status || '\u2014') + '</span></div>'
    + '<div class="detail-section"></div>' /* spacer */
    + '<div class="detail-section"></div>' /* spacer */
    + '<div class="detail-divider"></div>'
    // Row 4: Billing Role and Billing Planning Group (editable dropdowns)
    + '<div class="detail-section"><span class="detail-label">BILLING ROLE</span>' + roleField + '</div>'
    + '<div class="detail-section"><span class="detail-label">BILLING PLANNING GROUP</span>' + pgField + '</div>'
    + '<div class="detail-section"></div>' /* spacer */
    + '<div class="detail-divider"></div>'
    // Row 5: Internal Role and Internal Planning Group (read-only, from io_employees)
    + '<div class="detail-section"><span class="detail-label">INTERNAL ROLE</span><span class="detail-value">' + escapeHtml(r.internalRole || '\u2014') + '</span></div>'
    + '<div class="detail-section"><span class="detail-label">INTERNAL PLANNING GROUP</span><span class="detail-value">' + escapeHtml(r.internalPlanningGroup || '\u2014') + '</span></div>'
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
      tagTd.innerHTML = renderTagChip(appState.records[i].tag);
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
  if (bulkState.selected.has(idx)) {
    bulkState.selected.delete(idx);
    rowEl.classList.remove('row-selected');
    var cb = rowEl.querySelector('.compact-checkbox');
    if (cb) cb.checked = false;
  } else {
    bulkState.selected.add(idx);
    rowEl.classList.add('row-selected');
    var cb2 = rowEl.querySelector('.compact-checkbox');
    if (cb2) cb2.checked = true;
  }
  updateFloatingCommandBar();
};

window.compactSelectAll = function() {
  // Select all non-locked rows in current filtered data
  var items;
  if (serverPagState.enabled) {
    items = (serverPagState.rows || []).map(function(r) {
      for (var i = 0; i < appState.records.length; i++) {
        if (appState.records[i]._id === r._id) return { record: r, originalIndex: i };
      }
      return null;
    }).filter(Boolean);
  } else {
    items = appState._filteredData || [];
  }
  for (var i = 0; i < items.length; i++) {
    if (!isRowLocked(items[i].record)) {
      bulkState.selected.add(items[i].originalIndex);
    }
  }
  renderCompactTable();
};

function updateFloatingCommandBar() {
  var bar = document.getElementById('floating-command-bar');
  if (!bar) return;
  var count = bulkState.selected.size;
  if (count > 0 && compactState.selectionMode) {
    bar.classList.add('visible');
    var countEl = document.getElementById('fcb-count');
    if (countEl) countEl.textContent = count + ' selected';
  } else {
    bar.classList.remove('visible');
  }
}

// Floating bar bulk apply
window.fcbApplyTag = async function() {
  var sel = document.getElementById('fcb-tag-select');
  var tag = sel ? sel.value : '';
  if (tag === '_select') { showToast('Please select a tag first', 'info'); return; }

  var selectedIds = [...bulkState.selected];
  if (selectedIds.length === 0) { showToast('No rows selected', 'info'); return; }
  if (selectedIds.length > 50) { showToast('Bulk editing is limited to 50 rows at a time', 'error'); return; }

  var recordIds = [];
  for (var si = 0; si < selectedIds.length; si++) {
    var record = appState.records[selectedIds[si]];
    if (record && record._id && !isRowLocked(record)) {
      recordIds.push(record._id);
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
      for (var si2 = 0; si2 < selectedIds.length; si2++) {
        if (appState.records[selectedIds[si2]] && !isRowLocked(appState.records[selectedIds[si2]])) {
          appState.records[selectedIds[si2]].tag = tag;
          if (tag !== 'UPL' && tag !== 'LATE') {
            appState.records[selectedIds[si2]].uplReason = '';
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
  var canSeePL = cu && (cu.ohr_id === '740045023' || cu.ohr_id === '740044909' || cu.actual_role === 'Manager');
  var tagOpts = TAG_OPTIONS.filter(function(t) { return t !== 'PL' || canSeePL; });
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
