/**
 * Compass CA Cases — Full corrective action lifecycle management.
 * State machine: incident → NTE → response → hearing → NOD → CAP → active period → closed
 */
/* global currentUser, showToast, switchView */

const CA_API = '/api/io/compass';

const CA_STATUS_LABELS = {
  incident_reported: 'Incident Reported',
  nte_issued: 'NTE Issued',
  awaiting_response: 'Awaiting Response',
  response_received: 'Response Received',
  response_waived: 'Response Waived',
  hearing_scheduled: 'Hearing Scheduled',
  hearing_conducted: 'Hearing Conducted',
  nod_issued: 'NOD Issued',
  cap_issued: 'CAP Issued',
  active_period: 'Active Period',
  case_closed: 'Case Closed',
  case_dismissed: 'Case Dismissed',
};

const CA_STATUS_COLORS = {
  incident_reported: '#f59e0b',
  nte_issued: '#3b82f6',
  awaiting_response: '#8b5cf6',
  response_received: '#06b6d4',
  response_waived: '#64748b',
  hearing_scheduled: '#f97316',
  hearing_conducted: '#ec4899',
  nod_issued: '#14b8a6',
  cap_issued: '#ef4444',
  active_period: '#dc2626',
  case_closed: '#22c55e',
  case_dismissed: '#64748b',
};

const CA_TRANSITIONS = {
  incident_reported: ['nte_issued', 'cap_issued', 'case_dismissed'],
  nte_issued: ['awaiting_response'],
  awaiting_response: ['response_received', 'response_waived'],
  response_received: ['hearing_scheduled', 'nod_issued', 'cap_issued', 'case_dismissed'],
  response_waived: ['hearing_scheduled', 'nod_issued', 'cap_issued'],
  hearing_scheduled: ['hearing_conducted'],
  hearing_conducted: ['nod_issued', 'cap_issued', 'case_dismissed'],
  nod_issued: ['cap_issued', 'case_dismissed'],
  cap_issued: ['active_period'],
  active_period: ['case_closed'],
};

let caState = { page: 1, limit: 50, data: [], total: 0, filters: {}, employeeList: [], violationCatalog: [] };

async function initCompassCaCases() {
  const container = document.getElementById('compass-ca-content');
  const loading = document.getElementById('compass-ca-loading');
  if (!container) return;
  loading.style.display = 'flex';
  container.innerHTML = '';

  try {
    if (!caState.employeeList.length) {
      const empResp = await fetch('/api/io/employees');
      if (empResp.ok) { const d = await empResp.json(); caState.employeeList = d.data || d || []; }
    }
    if (!caState.violationCatalog.length) {
      const vResp = await fetch(CA_API + '/violations');
      if (vResp.ok) { const d = await vResp.json(); caState.violationCatalog = d.data || []; }
    }
    await caLoadList();
    container.innerHTML = caBuildListHTML();
    caRenderTable();
  } catch (err) {
    console.error('[Compass CA]', err);
    container.innerHTML = '<div style="text-align:center;padding:60px;color:var(--fg-muted);"><h3>Error loading CA cases</h3><p>' + err.message + '</p></div>';
  } finally {
    loading.style.display = 'none';
  }
}

async function caLoadList() {
  var params = new URLSearchParams({
    user_ohr: currentUser.ohr_id,
    user_role: currentUser.actual_role,
    page: caState.page,
    limit: caState.limit,
  });
  if (caState.filters.case_status) params.set('case_status', caState.filters.case_status);
  if (caState.filters.search) params.set('search', caState.filters.search);

  var resp = await fetch(CA_API + '/ca-cases?' + params);
  if (!resp.ok) throw new Error('Failed to load CA cases');
  var result = await resp.json();
  caState.data = result.data || [];
  caState.total = result.total || 0;
}

function caBuildListHTML() {
  var statusOpts = Object.entries(CA_STATUS_LABELS).map(function(e) { return '<option value="' + e[0] + '">' + e[1] + '</option>'; }).join('');
  return '<div style="padding:16px;">' +
    '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;">' +
      '<button class="btn btn-primary btn-sm" onclick="caShowNewForm()">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> New CA Case</button>' +
      '<input type="text" id="ca-search" placeholder="Search by name, case ID, or violation..." style="flex:1;min-width:200px;padding:6px 12px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input, var(--bg));color:var(--fg);font-size:13px;" oninput="caOnSearch(this.value)">' +
      '<select id="ca-filter-status" onchange="caOnFilterStatus(this.value)" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input, var(--bg));color:var(--fg);font-size:13px;">' +
        '<option value="">All Statuses</option>' + statusOpts + '</select>' +
      '<span style="font-size:12px;color:var(--fg-muted);">Total: <strong id="ca-total-count" style="color:var(--fg);">' + caState.total + '</strong></span>' +
    '</div>' +
    '<div class="module-table-wrapper"><table class="data-table module-table" id="ca-table"><thead><tr>' +
      '<th style="width:100px;">Case ID</th><th>Employee</th><th>Violation</th><th>CAP Level</th><th>Status</th><th>Created</th><th style="width:60px;">Actions</th>' +
    '</tr></thead><tbody id="ca-table-body"></tbody></table></div>' +
    '<div id="ca-pagination" style="display:flex;justify-content:center;gap:8px;margin-top:12px;"></div>' +
  '</div>';
}

function caRenderTable() {
  var tbody = document.getElementById('ca-table-body');
  var totalEl = document.getElementById('ca-total-count');
  if (!tbody) return;
  if (totalEl) totalEl.textContent = caState.total;

  if (!caState.data.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--fg-muted);">No CA cases found</td></tr>';
    return;
  }

  tbody.innerHTML = caState.data.map(function(c) {
    var statusColor = CA_STATUS_COLORS[c.case_status] || '#64748b';
    var capLevel = c.final_cap_level || c.recommended_cap_level || '\u2014';
    return '<tr onclick="caShowDetail(\'' + c.case_id + '\')" style="cursor:pointer;">' +
      '<td style="font-family:monospace;font-size:12px;">' + (c.case_id || '') + '</td>' +
      '<td>' + (c.employee_name || '') + '</td>' +
      '<td style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (c.violation_text || '') + '</td>' +
      '<td><span style="font-size:12px;padding:2px 8px;border-radius:4px;background:var(--bg-muted);color:var(--fg);">' + capLevel.replace('_', ' ').toUpperCase() + '</span></td>' +
      '<td><span style="font-size:12px;color:' + statusColor + ';font-weight:500;">' + (CA_STATUS_LABELS[c.case_status] || c.case_status) + '</span></td>' +
      '<td style="font-size:12px;">' + (c.created_at ? new Date(c.created_at).toLocaleDateString() : '') + '</td>' +
      '<td><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();caShowDetail(\'' + c.case_id + '\')">View</button></td>' +
    '</tr>';
  }).join('');
}

var caSearchTimeout;
function caOnSearch(val) {
  clearTimeout(caSearchTimeout);
  caSearchTimeout = setTimeout(async function() {
    caState.filters.search = val;
    caState.page = 1;
    await caLoadList();
    caRenderTable();
  }, 300);
}
async function caOnFilterStatus(val) {
  caState.filters.case_status = val;
  caState.page = 1;
  await caLoadList();
  caRenderTable();
}

// ---- Detail View ----
async function caShowDetail(caseId) {
  var overlay = document.getElementById('compass-ca-detail-overlay');
  var body = document.getElementById('compass-ca-detail-body');
  var footer = document.getElementById('compass-ca-detail-footer');
  var title = document.getElementById('compass-ca-detail-title');
  if (!overlay || !body) return;

  body.innerHTML = '<div style="text-align:center;padding:40px;"><div class="spinner"></div></div>';
  footer.innerHTML = '';
  overlay.style.display = 'flex';

  try {
    var resp = await fetch(CA_API + '/ca-cases/' + caseId);
    if (!resp.ok) throw new Error('Not found');
    var ca = await resp.json();
    title.textContent = 'CA Case \u2014 ' + ca.case_id;
    body.innerHTML = caBuildDetailHTML(ca);
    footer.innerHTML = caBuildDetailActions(ca);
  } catch (err) {
    body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--fg-muted);">' + err.message + '</div>';
  }
}

function caBuildDetailHTML(ca) {
  function field(label, val) {
    return val ? '<div style="margin-bottom:8px;"><span style="font-size:11px;color:var(--fg-muted);text-transform:uppercase;letter-spacing:0.5px;">' + label + '</span><div style="font-size:14px;color:var(--fg);">' + val + '</div></div>' : '';
  }
  var statusColor = CA_STATUS_COLORS[ca.case_status] || '#64748b';
  var timeline = ca.timeline || [];

  var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">' +
    '<div>' +
      '<h4 style="font-size:13px;color:var(--fg-muted);margin:0 0 12px;text-transform:uppercase;">Case Info</h4>' +
      field('Case ID', ca.case_id) +
      field('Status', '<span style="color:' + statusColor + ';font-weight:600;">' + (CA_STATUS_LABELS[ca.case_status] || ca.case_status) + '</span>') +
      field('Employee', (ca.employee_name || '') + ' (' + (ca.employee_ohr || '') + ')') +
      field('Supervisor', ca.employee_supervisor) +
      field('Planning Group', ca.employee_pg) +
      field('Created By', ca.created_by_name) +
      field('Created', ca.created_at ? new Date(ca.created_at).toLocaleString() : '') +
    '</div><div>' +
      '<h4 style="font-size:13px;color:var(--fg-muted);margin:0 0 12px;text-transform:uppercase;">Violation</h4>' +
      field('Category', ca.violation_category_name) +
      field('Subsection', ca.violation_subsection) +
      field('Violation', ca.violation_text) +
      field('Type', ca.violation_type) +
      field('Incident Date', ca.incident_date) +
      field('Details', ca.incident_details) +
    '</div></div>';

  // CAP Decision
  html += '<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);">' +
    '<h4 style="font-size:13px;color:var(--fg-muted);margin:0 0 12px;text-transform:uppercase;">CAP Decision</h4>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">' +
      field('AI Recommended', ca.ai_recommended_cap_level ? ca.ai_recommended_cap_level.replace('_', ' ').toUpperCase() : '\u2014') +
      field('Recommended', ca.recommended_cap_level ? ca.recommended_cap_level.replace('_', ' ').toUpperCase() : '\u2014') +
      field('Final', ca.final_cap_level ? ca.final_cap_level.replace('_', ' ').toUpperCase() : '\u2014') +
    '</div>' +
    field('Active Period', ca.active_period_days ? ca.active_period_days + ' days' : '') +
    (ca.active_period_start ? field('Period', new Date(ca.active_period_start).toLocaleDateString() + ' \u2014 ' + new Date(ca.active_period_end).toLocaleDateString()) : '') +
    field('Override Reason', ca.cap_override_reason) +
  '</div>';

  // Documents
  html += '<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);">' +
    '<h4 style="font-size:13px;color:var(--fg-muted);margin:0 0 12px;text-transform:uppercase;">Documents</h4>' +
    '<div style="display:flex;gap:12px;flex-wrap:wrap;">' +
      (ca.nte_document_url ? '<a href="' + ca.nte_document_url + '" target="_blank" class="btn btn-outline btn-sm">Download NTE</a>' : '<span style="font-size:12px;color:var(--fg-muted);">No NTE generated</span>') +
      (ca.cap_document_url ? '<a href="' + ca.cap_document_url + '" target="_blank" class="btn btn-outline btn-sm">Download CAP</a>' : '') +
      (ca.nte_signed_url ? '<a href="' + ca.nte_signed_url + '" target="_blank" class="btn btn-outline btn-sm" style="color:#22c55e;">Signed NTE</a>' : '') +
      (ca.cap_signed_url ? '<a href="' + ca.cap_signed_url + '" target="_blank" class="btn btn-outline btn-sm" style="color:#22c55e;">Signed CAP</a>' : '') +
    '</div></div>';

  // NTE Response
  if (ca.nte_response_text) {
    html += '<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);">' +
      '<h4 style="font-size:13px;color:var(--fg-muted);margin:0 0 12px;text-transform:uppercase;">NTE Response</h4>' +
      field('Response Date', ca.nte_response_date ? new Date(ca.nte_response_date).toLocaleString() : '') +
      '<div style="padding:12px;background:var(--bg-muted);border-radius:6px;font-size:13px;color:var(--fg);">' + ca.nte_response_text + '</div>' +
    '</div>';
  }

  // Hearing
  if (ca.hearing_scheduled_date || ca.hearing_conducted) {
    html += '<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);">' +
      '<h4 style="font-size:13px;color:var(--fg-muted);margin:0 0 12px;text-transform:uppercase;">Admin Hearing</h4>' +
      field('Scheduled', ca.hearing_scheduled_date) +
      field('Conducted', ca.hearing_conducted ? 'Yes' : 'No') +
      field('Notes', ca.hearing_notes) +
    '</div>';
  }

  // Timeline
  if (timeline.length) {
    html += '<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);">' +
      '<h4 style="font-size:13px;color:var(--fg-muted);margin:0 0 12px;text-transform:uppercase;">Timeline (' + timeline.length + ')</h4>' +
      '<div style="display:flex;flex-direction:column;gap:6px;">' +
      timeline.map(function(t) {
        return '<div style="padding:8px 12px;background:var(--bg-muted);border-radius:6px;display:flex;justify-content:space-between;">' +
          '<div><span style="font-size:12px;font-weight:500;color:var(--fg);">' + (t.event_type || '').replace(/_/g, ' ') + '</span>' +
          '<span style="font-size:11px;color:var(--fg-muted);margin-left:8px;">' + (t.actor_name || '') + '</span></div>' +
          '<span style="font-size:11px;color:var(--fg-muted);">' + (t.created_at ? new Date(t.created_at).toLocaleString() : '') + '</span></div>';
      }).join('') +
      '</div></div>';
  }

  return html;
}

function caBuildDetailActions(ca) {
  var transitions = CA_TRANSITIONS[ca.case_status] || [];
  if (!transitions.length) return '';

  var btns = [];

  // Generate Document buttons
  if (['incident_reported', 'nte_issued'].indexOf(ca.case_status) >= 0 && !ca.nte_document_url) {
    btns.push('<button class="btn btn-outline btn-sm" onclick="caGenerateDoc(\'' + ca.case_id + '\', \'nte\')">Generate NTE</button>');
  }
  if (['cap_issued', 'nod_issued'].indexOf(ca.case_status) >= 0 && !ca.cap_document_url) {
    var capLvl = ca.final_cap_level || ca.recommended_cap_level || 'cap_1';
    btns.push('<button class="btn btn-outline btn-sm" onclick="caGenerateDoc(\'' + ca.case_id + '\', \'' + capLvl + '\')">Generate CAP Doc</button>');
  }

  // Upload signed document
  if (ca.case_status === 'cap_issued' && !ca.cap_signed_url) {
    btns.push('<button class="btn btn-outline btn-sm" onclick="caUploadSigned(\'' + ca.case_id + '\', \'cap\')">Upload Signed CAP</button>');
  }
  if (['nte_issued', 'awaiting_response'].indexOf(ca.case_status) >= 0 && !ca.nte_signed_url) {
    btns.push('<button class="btn btn-outline btn-sm" onclick="caUploadSigned(\'' + ca.case_id + '\', \'nte\')">Upload Signed NTE</button>');
  }

  // Transition buttons
  transitions.forEach(function(t) {
    var label = CA_STATUS_LABELS[t] || t;
    var isPrimary = ['cap_issued', 'active_period', 'case_closed'].indexOf(t) >= 0;
    btns.push('<button class="btn ' + (isPrimary ? 'btn-primary' : 'btn-outline') + ' btn-sm" onclick="caTransition(\'' + ca.case_id + '\', \'' + t + '\')">' + label + '</button>');
  });

  return btns.join(' ');
}

function compassCaCloseDetail() {
  var overlay = document.getElementById('compass-ca-detail-overlay');
  if (overlay) overlay.style.display = 'none';
}

// ---- Transitions ----
async function caTransition(caseId, newStatus) {
  var extra = {};

  if (newStatus === 'cap_issued') {
    var level = prompt('Enter CAP level (cap_0, cap_1, cap_2, cap_3):');
    if (!level) return;
    extra.final_cap_level = level;
  }
  if (newStatus === 'hearing_scheduled') {
    var date = prompt('Enter hearing date (YYYY-MM-DD):');
    if (!date) return;
    extra.hearing_scheduled_date = date;
  }
  if (newStatus === 'hearing_conducted') {
    var notes = prompt('Enter hearing notes:');
    extra.hearing_notes = notes || '';
  }
  if (newStatus === 'response_received') {
    var text = prompt('Enter employee NTE response:');
    if (text === null) return;
    extra.nte_response_text = text;
  }
  if (newStatus === 'nod_issued') {
    var decision = prompt('Enter NOD decision:');
    extra.nod_decision = decision || '';
  }

  try {
    var resp = await fetch(CA_API + '/ca-cases/' + caseId + '/transition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({
        new_status: newStatus,
        actor_ohr: currentUser.ohr_id,
        actor_name: currentUser.full_name,
        details: 'Status changed to ' + (CA_STATUS_LABELS[newStatus] || newStatus),
      }, extra)),
    });
    if (!resp.ok) { var e = await resp.json(); throw new Error(e.error || 'Failed'); }
    showToast('Case advanced to ' + (CA_STATUS_LABELS[newStatus] || newStatus), 'success');
    await caShowDetail(caseId);
    await caLoadList();
    caRenderTable();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ---- Document Generation ----
async function caGenerateDoc(caseId, docType) {
  try {
    showToast('Generating document...', 'info');
    var resp = await fetch(CA_API + '/ca-cases/' + caseId + '/generate-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        document_type: docType,
        actor_ohr: currentUser.ohr_id,
        actor_name: currentUser.full_name,
      }),
    });
    if (!resp.ok) { var e = await resp.json(); throw new Error(e.error || 'Failed'); }
    var result = await resp.json();
    showToast('Document generated successfully', 'success');
    if (result.url) window.open(result.url, '_blank');
    await caShowDetail(caseId);
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ---- Signed Document Upload ----
async function caUploadSigned(caseId, docType) {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.pdf,.jpg,.jpeg,.png,.docx';
  input.onchange = async function() {
    var file = input.files[0];
    if (!file) return;
    try {
      showToast('Uploading signed document...', 'info');
      var formData = new FormData();
      formData.append('file', file);
      var uploadResp = await fetch('/api/io/compass/upload-file', { method: 'POST', body: formData });
      var fileUrl;
      if (uploadResp.ok) {
        var uploadResult = await uploadResp.json();
        fileUrl = uploadResult.url;
      } else {
        fileUrl = await new Promise(function(resolve) {
          var reader = new FileReader();
          reader.onload = function() { resolve(reader.result); };
          reader.readAsDataURL(file);
        });
      }
      var resp = await fetch(CA_API + '/ca-cases/' + caseId + '/upload-signed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_type: docType, url: fileUrl, actor_ohr: currentUser.ohr_id, actor_name: currentUser.full_name }),
      });
      if (!resp.ok) throw new Error('Upload failed');
      showToast('Signed document uploaded', 'success');
      await caShowDetail(caseId);
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  };
  input.click();
}

// ---- New CA Case Form ----
async function caShowNewForm() {
  var overlay = document.getElementById('compass-ca-form-overlay');
  var body = document.getElementById('compass-ca-form-body');
  var footer = document.getElementById('compass-ca-form-footer');
  if (!overlay || !body) return;

  var empOptions = caState.employeeList.map(function(e) { return '<option value="' + e.ohr_id + '">' + e.full_name + ' (' + e.ohr_id + ')</option>'; }).join('');

  var categories = {};
  caState.violationCatalog.forEach(function(v) {
    var key = v.category_number + '. ' + v.category_name;
    if (!categories[key]) categories[key] = [];
    categories[key].push(v);
  });
  var catOptions = Object.keys(categories).map(function(k) { return '<option value="' + k + '">' + k + '</option>'; }).join('');

  body.innerHTML = '<div style="display:flex;flex-direction:column;gap:16px;">' +
    '<div><label style="font-size:12px;color:var(--fg-muted);display:block;margin-bottom:4px;">Employee *</label>' +
      '<select id="ca-form-employee" class="form-select" style="width:100%;" onchange="caFormEmployeeChanged()"><option value="">Select employee...</option>' + empOptions + '</select></div>' +
    '<div id="ca-form-attendance-summary" style="display:none;padding:12px;background:var(--bg-muted);border-radius:6px;"></div>' +
    '<div><label style="font-size:12px;color:var(--fg-muted);display:block;margin-bottom:4px;">Violation Category *</label>' +
      '<select id="ca-form-category" class="form-select" style="width:100%;" onchange="caFormCategoryChanged()"><option value="">Select category...</option>' + catOptions + '</select></div>' +
    '<div><label style="font-size:12px;color:var(--fg-muted);display:block;margin-bottom:4px;">Specific Violation *</label>' +
      '<select id="ca-form-violation" class="form-select" style="width:100%;"><option value="">Select violation...</option></select></div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
      '<div><label style="font-size:12px;color:var(--fg-muted);display:block;margin-bottom:4px;">Incident Date & Time *</label>' +
        '<input type="datetime-local" id="ca-form-incident-date" class="form-input" value="" style="width:100%;"></div>' +
      '<div><label style="font-size:12px;color:var(--fg-muted);display:block;margin-bottom:4px;">Recommended CAP Level</label>' +
        '<select id="ca-form-cap-level" class="form-select" style="width:100%;"><option value="">Select...</option><option value="cap_0">CAP 0</option><option value="cap_1">CAP 1 (60 days)</option><option value="cap_2">CAP 2 (90 days)</option><option value="cap_3">CAP 3 (180 days)</option></select></div>' +
    '</div>' +
    '<div><label style="font-size:12px;color:var(--fg-muted);display:block;margin-bottom:4px;">Incident Details *</label>' +
      '<textarea id="ca-form-details" class="form-input" rows="4" placeholder="Describe the incident in detail..." style="width:100%;resize:vertical;"></textarea></div>' +
    '<div id="ca-form-ai-recommendation" style="display:none;padding:12px;background:var(--bg-muted);border-radius:6px;border-left:3px solid var(--accent, #6366f1);"></div>' +
    '<button class="btn btn-outline btn-sm" onclick="caFormGetAiRecommendation()" id="ca-form-ai-btn" style="align-self:flex-start;">Get AI Recommendation</button>' +
  '</div>';

  footer.innerHTML = '<button class="btn btn-outline btn-sm" onclick="compassCaCloseForm()">Cancel</button> ' +
    '<button class="btn btn-primary btn-sm" onclick="caSubmitNewForm()">Create CA Case</button>';

  overlay.style.display = 'flex';
}

async function caFormEmployeeChanged() {
  var ohr = document.getElementById('ca-form-employee').value;
  var summaryEl = document.getElementById('ca-form-attendance-summary');
  if (!ohr) { summaryEl.style.display = 'none'; return; }
  try {
    var resp = await fetch(CA_API + '/attendance-summary/' + ohr);
    if (!resp.ok) throw new Error('Failed');
    var data = await resp.json();
    summaryEl.style.display = 'block';
    summaryEl.innerHTML = '<div style="font-size:12px;font-weight:600;color:var(--fg);margin-bottom:6px;">Attendance Violation Summary</div>' +
      '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;font-size:12px;">' +
        '<div><span style="color:var(--fg-muted);">Late:</span> <strong style="color:#f59e0b;">' + ((data.late && data.late.count) || 0) + '</strong></div>' +
        '<div><span style="color:var(--fg-muted);">UPL:</span> <strong style="color:#ef4444;">' + ((data.upl && data.upl.count) || 0) + '</strong></div>' +
        '<div><span style="color:var(--fg-muted);">NCNS:</span> <strong style="color:#dc2626;">' + ((data.ncns && data.ncns.count) || 0) + '</strong></div>' +
        '<div><span style="color:var(--fg-muted);">Total:</span> <strong>' + (data.total_violations || 0) + '</strong></div>' +
      '</div>' +
      '<div style="margin-top:4px;font-size:11px;color:var(--fg-muted);">Recommended: <strong style="color:var(--accent);">' + ((data.recommended_cap || 'none').replace('_', ' ').toUpperCase()) + '</strong>' +
      (data.reset_date ? ' (since ' + new Date(data.reset_date).toLocaleDateString() + ')' : ' (no prior CAP reset)') + '</div>';
  } catch (e) {
    summaryEl.style.display = 'none';
  }
}

function caFormCategoryChanged() {
  var catKey = document.getElementById('ca-form-category').value;
  var violSelect = document.getElementById('ca-form-violation');
  violSelect.innerHTML = '<option value="">Select violation...</option>';
  if (!catKey) return;
  var catNum = catKey.split('.')[0].trim();
  caState.violationCatalog.filter(function(v) { return String(v.category_number) === catNum; }).forEach(function(v) {
    var o = document.createElement('option');
    o.value = JSON.stringify({ subsection: v.subsection, text: v.violation_text, type: v.violation_type });
    o.textContent = v.subsection + ': ' + v.violation_text;
    violSelect.appendChild(o);
  });
}

async function caFormGetAiRecommendation() {
  var ohr = document.getElementById('ca-form-employee').value;
  var catKey = document.getElementById('ca-form-category').value;
  var violJson = document.getElementById('ca-form-violation').value;
  var details = document.getElementById('ca-form-details').value;
  var recEl = document.getElementById('ca-form-ai-recommendation');
  var btn = document.getElementById('ca-form-ai-btn');

  if (!ohr) { showToast('Select an employee first', 'error'); return; }

  var violText = '';
  if (violJson) { try { violText = JSON.parse(violJson).text; } catch (e) {} }

  btn.disabled = true;
  btn.textContent = 'Analyzing...';
  recEl.style.display = 'block';
  recEl.innerHTML = '<div style="text-align:center;"><div class="spinner" style="width:20px;height:20px;"></div></div>';

  try {
    var resp = await fetch(CA_API + '/ai/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_ohr: ohr,
        violation_description: violText || details,
        violation_category_name: catKey,
        additional_context: details,
      }),
    });
    if (!resp.ok) throw new Error('AI recommendation failed');
    var result = await resp.json();
    var rec = result.recommendation;

    if (rec) {
      recEl.innerHTML = '<div style="font-size:12px;font-weight:600;color:var(--fg);margin-bottom:6px;">AI Recommendation</div>' +
        '<div style="font-size:14px;font-weight:700;color:var(--accent);margin-bottom:6px;">' + ((rec.recommended_cap_level || '').replace('_', ' ').toUpperCase()) + '</div>' +
        '<div style="font-size:12px;color:var(--fg);margin-bottom:8px;">' + (rec.reasoning || '') + '</div>' +
        (rec.aggravating_factors && rec.aggravating_factors.length ? '<div style="font-size:11px;color:#ef4444;margin-bottom:4px;">Aggravating: ' + rec.aggravating_factors.join(', ') + '</div>' : '') +
        (rec.mitigating_factors && rec.mitigating_factors.length ? '<div style="font-size:11px;color:#22c55e;margin-bottom:4px;">Mitigating: ' + rec.mitigating_factors.join(', ') + '</div>' : '') +
        '<div style="font-size:11px;color:var(--fg-muted);">Confidence: ' + (rec.confidence || 'N/A') + '</div>';
      var capSelect = document.getElementById('ca-form-cap-level');
      if (capSelect && rec.recommended_cap_level) capSelect.value = rec.recommended_cap_level;
    } else {
      recEl.innerHTML = '<div style="font-size:12px;color:var(--fg-muted);">No recommendation available</div>';
    }
  } catch (err) {
    recEl.innerHTML = '<div style="font-size:12px;color:#ef4444;">Error: ' + err.message + '</div>';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Get AI Recommendation';
  }
}

async function caSubmitNewForm() {
  var empOhr = document.getElementById('ca-form-employee').value;
  var catKey = document.getElementById('ca-form-category').value;
  var violJson = document.getElementById('ca-form-violation').value;
  var incidentDateRaw = document.getElementById('ca-form-incident-date').value;
  var incidentDate = incidentDateRaw ? new Date(incidentDateRaw + '+08:00').toISOString() : '';
  var details = document.getElementById('ca-form-details').value;
  var capLevel = document.getElementById('ca-form-cap-level').value;

  if (!empOhr || !catKey || !details || !incidentDateRaw) {
    showToast('Please fill in all required fields (including date & time)', 'error');
    return;
  }

  var emp = caState.employeeList.find(function(e) { return e.ohr_id === empOhr; });
  var violation = {};
  if (violJson) { try { violation = JSON.parse(violJson); } catch (e) {} }

  var catParts = catKey.split('.');
  var catNum = catParts[0].trim();
  var catName = catParts.slice(1).join('.').trim();

  var payload = {
    employee_ohr: empOhr,
    employee_name: emp ? emp.full_name : '',
    employee_pg: emp ? emp.planning_group : '',
    employee_supervisor: emp ? emp.supervisor_name : '',
    violation_category_number: catNum,
    violation_category_name: catName,
    violation_subsection: violation.subsection || '',
    violation_text: violation.text || '',
    violation_type: violation.type || '',
    incident_date: incidentDate,
    incident_details: details,
    recommended_cap_level: capLevel || null,
    created_by_ohr: currentUser.ohr_id,
    created_by_name: currentUser.full_name,
  };

  try {
    var resp = await fetch(CA_API + '/ca-cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) { var e = await resp.json(); throw new Error(e.error || 'Failed'); }
    var result = await resp.json();
    showToast('CA Case ' + result.case_id + ' created', 'success');
    compassCaCloseForm();
    await caLoadList();
    caRenderTable();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

function compassCaCloseForm() {
  var overlay = document.getElementById('compass-ca-form-overlay');
  if (overlay) overlay.style.display = 'none';
}
