/**
 * Conflict Resolution Dialog
 * Displays when a 409 VERSION_CONFLICT response is received from the server.
 * Shows the user's attempted changes vs the server's current state and lets them:
 * 1. Force overwrite (use their values with the new server version)
 * 2. Accept server values (discard their changes)
 * 3. Merge (pick field-by-field)
 *
 * Usage:
 *   const result = await showConflictDialog(conflictData, userPayload, fieldLabels);
 *   // result: { action: 'overwrite'|'accept'|'merge', mergedPayload: {...} }
 */

// ── Conflict Dialog State ────────────────────────────────────────────
let _conflictResolve = null;

/**
 * Show the conflict resolution dialog.
 * @param {Object} conflict - The conflict object from the 409 response
 *   { your_version, server_version, server_state }
 * @param {Object} userPayload - The payload the user tried to send
 * @param {Object} fieldLabels - Optional map of field keys to human-readable labels
 * @returns {Promise<{action: string, mergedPayload: Object}>}
 */
function showConflictDialog(conflict, userPayload, fieldLabels = {}) {
  return new Promise((resolve) => {
    _conflictResolve = resolve;
    const dialog = getOrCreateDialog();
    const serverState = conflict.server_state || {};
    const serverVersion = conflict.server_version || 0;

    // Build the comparison table
    const changedFields = Object.keys(userPayload).filter(
      k => k !== 'version' && k !== '_id' && String(userPayload[k] ?? '') !== String(serverState[k] ?? '')
    );

    let tableHtml = `
      <div class="conflict-header">
        <div class="conflict-icon">⚠️</div>
        <h3>Edit Conflict Detected</h3>
        <p>Another user modified this record while you were editing. Your version: <strong>v${conflict.your_version}</strong>, Server version: <strong>v${serverVersion}</strong>.</p>
      </div>
      <div class="conflict-table-wrap">
        <table class="conflict-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Your Value</th>
              <th>Server Value</th>
              <th>Use</th>
            </tr>
          </thead>
          <tbody>
    `;

    for (const field of changedFields) {
      const label = fieldLabels[field] || field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const yourVal = userPayload[field] ?? '—';
      const serverVal = serverState[field] ?? '—';
      tableHtml += `
        <tr>
          <td class="field-name">${label}</td>
          <td class="your-value">${escapeHtml(String(yourVal))}</td>
          <td class="server-value">${escapeHtml(String(serverVal))}</td>
          <td class="pick-col">
            <select data-field="${field}" class="conflict-pick">
              <option value="yours">Yours</option>
              <option value="server">Server</option>
            </select>
          </td>
        </tr>
      `;
    }

    tableHtml += `
          </tbody>
        </table>
      </div>
      <div class="conflict-actions">
        <button class="conflict-btn conflict-btn-overwrite" data-action="overwrite">
          Force My Changes
        </button>
        <button class="conflict-btn conflict-btn-accept" data-action="accept">
          Accept Server Values
        </button>
        <button class="conflict-btn conflict-btn-merge" data-action="merge">
          Use Selected (Merge)
        </button>
      </div>
    `;

    dialog.querySelector('.conflict-body').innerHTML = tableHtml;
    dialog.style.display = 'flex';
    document.body.classList.add('conflict-dialog-open');

    // Bind action buttons
    dialog.querySelectorAll('.conflict-btn').forEach(btn => {
      btn.onclick = () => {
        const action = btn.dataset.action;
        let mergedPayload = {};

        if (action === 'overwrite') {
          // Use all user values with the new server version
          mergedPayload = { ...userPayload, version: serverVersion };
        } else if (action === 'accept') {
          // Discard user changes — no PATCH needed
          mergedPayload = null;
        } else if (action === 'merge') {
          // Pick field-by-field based on selects
          mergedPayload = { version: serverVersion };
          dialog.querySelectorAll('.conflict-pick').forEach(sel => {
            const field = sel.dataset.field;
            mergedPayload[field] = sel.value === 'yours' ? userPayload[field] : serverState[field];
          });
        }

        closeConflictDialog();
        resolve({ action, mergedPayload });
      };
    });
  });
}

function getOrCreateDialog() {
  let dialog = document.getElementById('conflict-dialog');
  if (!dialog) {
    dialog = document.createElement('div');
    dialog.id = 'conflict-dialog';
    dialog.className = 'conflict-overlay';
    dialog.innerHTML = '<div class="conflict-body"></div>';
    document.body.appendChild(dialog);
  }
  return dialog;
}

function closeConflictDialog() {
  const dialog = document.getElementById('conflict-dialog');
  if (dialog) {
    dialog.style.display = 'none';
    document.body.classList.remove('conflict-dialog-open');
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Wrapper for fetch that handles 409 conflicts automatically.
 * If a 409 is received, shows the conflict dialog and optionally retries.
 *
 * @param {string} url - The fetch URL
 * @param {Object} options - Fetch options (must include body as object, not string)
 * @param {Object} fieldLabels - Optional field label map for the dialog
 * @returns {Promise<Response>} - The final response (either original success or retry result)
 */
async function fetchWithConflictHandling(url, options, fieldLabels = {}) {
  const bodyObj = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
  const resp = await fetch(url, {
    ...options,
    body: JSON.stringify(bodyObj),
  });

  if (resp.status === 409) {
    const errorData = await resp.json();
    if (errorData.error === 'VERSION_CONFLICT') {
      const result = await showConflictDialog(errorData.conflict, bodyObj, fieldLabels);

      if (result.action === 'accept') {
        // User accepted server values — reload the data
        return { ok: true, conflict_resolved: 'accepted', _synthetic: true };
      }

      if (result.mergedPayload) {
        // Retry with merged/overwritten payload
        const retryResp = await fetch(url, {
          ...options,
          body: JSON.stringify(result.mergedPayload),
        });
        return retryResp;
      }
    }
  }

  return resp;
}

// ── Batch Conflict Summary Dialog ─────────────────────────────────────────────────────

/**
 * Show a batch conflict summary for multiple records that had version conflicts.
 * Instead of per-record popups, shows one table with all conflicting rows.
 *
 * @param {Array<Object>} conflicts - Array of conflict objects:
 *   { id, identifier, userPayload, conflict: { your_version, server_version, server_state } }
 * @param {Object} fieldLabels - Map of field keys to human-readable labels
 * @returns {Promise<{action: string, resolutions: Array}>}
 *   action: 'force_all' | 'accept_all' | 'per_row'
 *   resolutions: Array of { id, action: 'force'|'accept', payload } for per_row
 */
function showBatchConflictDialog(conflicts, fieldLabels = {}) {
  return new Promise((resolve) => {
    const dialog = getOrCreateBatchDialog();
    const body = dialog.querySelector('.batch-conflict-body');

    // Identify which fields actually differ across all conflicts
    const allChangedFields = new Set();
    conflicts.forEach(c => {
      const serverState = c.conflict.server_state || {};
      Object.keys(c.userPayload).forEach(k => {
        if (k !== 'version' && k !== '_id' && String(c.userPayload[k] ?? '') !== String(serverState[k] ?? '')) {
          allChangedFields.add(k);
        }
      });
    });
    const changedFieldsArr = Array.from(allChangedFields);

    let html = `
      <div class="conflict-header">
        <div class="conflict-icon">⚠️</div>
        <h3>Batch Edit Conflicts Detected</h3>
        <p><strong>${conflicts.length}</strong> record(s) were modified by another user while you were editing.</p>
      </div>
      <div class="batch-conflict-table-wrap">
        <table class="conflict-table batch-conflict-table">
          <thead>
            <tr>
              <th style="width:30px;"><input type="checkbox" id="batch-conflict-select-all" checked /></th>
              <th>Record</th>
              ${changedFieldsArr.map(f => `<th>${fieldLabels[f] || f.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</th>`).join('')}
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
    `;

    conflicts.forEach((c, idx) => {
      const serverState = c.conflict.server_state || {};
      html += `<tr data-idx="${idx}">`;
      html += `<td><input type="checkbox" class="batch-row-check" data-idx="${idx}" checked /></td>`;
      html += `<td class="field-name">${escapeHtml(c.identifier || 'ID: ' + c.id)}</td>`;
      changedFieldsArr.forEach(f => {
        const yours = c.userPayload[f] ?? '—';
        const server = serverState[f] ?? '—';
        const differs = String(yours) !== String(server);
        if (differs) {
          html += `<td><span class="your-value" title="Your value">${escapeHtml(String(yours))}</span> <span style="color:var(--text-secondary,#777)">→</span> <span class="server-value" title="Server value">${escapeHtml(String(server))}</span></td>`;
        } else {
          html += `<td style="color:var(--text-secondary,#777);">${escapeHtml(String(yours))}</td>`;
        }
      });
      html += `<td>
        <select class="conflict-pick batch-row-action" data-idx="${idx}">
          <option value="force">Force Mine</option>
          <option value="accept">Accept Server</option>
        </select>
      </td>`;
      html += `</tr>`;
    });

    html += `
          </tbody>
        </table>
      </div>
      <div class="batch-conflict-summary" style="font-size:12px;color:var(--text-secondary,#aaa);margin:12px 0;text-align:center;">
        <span id="batch-conflict-count">${conflicts.length}</span> of ${conflicts.length} selected
      </div>
      <div class="conflict-actions">
        <button class="conflict-btn conflict-btn-overwrite" data-action="force_all">
          Force All My Changes
        </button>
        <button class="conflict-btn conflict-btn-accept" data-action="accept_all">
          Accept All Server Values
        </button>
        <button class="conflict-btn conflict-btn-merge" data-action="per_row">
          Apply Per-Row Selections
        </button>
      </div>
    `;

    body.innerHTML = html;
    dialog.style.display = 'flex';
    document.body.classList.add('conflict-dialog-open');

    // Select-all checkbox
    const selectAll = dialog.querySelector('#batch-conflict-select-all');
    selectAll.onchange = () => {
      dialog.querySelectorAll('.batch-row-check').forEach(cb => { cb.checked = selectAll.checked; });
      updateBatchCount();
    };

    // Individual checkboxes
    dialog.querySelectorAll('.batch-row-check').forEach(cb => {
      cb.onchange = updateBatchCount;
    });

    function updateBatchCount() {
      const checked = dialog.querySelectorAll('.batch-row-check:checked').length;
      const countEl = dialog.querySelector('#batch-conflict-count');
      if (countEl) countEl.textContent = checked;
    }

    // Action buttons
    dialog.querySelectorAll('.conflict-btn').forEach(btn => {
      btn.onclick = () => {
        const action = btn.dataset.action;
        let resolutions = [];

        if (action === 'force_all') {
          resolutions = conflicts.map(c => ({
            id: c.id,
            action: 'force',
            payload: { ...c.userPayload, version: c.conflict.server_version }
          }));
        } else if (action === 'accept_all') {
          resolutions = conflicts.map(c => ({
            id: c.id,
            action: 'accept',
            payload: null
          }));
        } else if (action === 'per_row') {
          conflicts.forEach((c, idx) => {
            const checkbox = dialog.querySelector(`.batch-row-check[data-idx="${idx}"]`);
            const select = dialog.querySelector(`.batch-row-action[data-idx="${idx}"]`);
            if (!checkbox || !checkbox.checked) return; // skip unchecked rows
            const rowAction = select ? select.value : 'accept';
            if (rowAction === 'force') {
              resolutions.push({
                id: c.id,
                action: 'force',
                payload: { ...c.userPayload, version: c.conflict.server_version }
              });
            } else {
              resolutions.push({
                id: c.id,
                action: 'accept',
                payload: null
              });
            }
          });
        }

        closeBatchConflictDialog();
        resolve({ action, resolutions });
      };
    });
  });
}

function getOrCreateBatchDialog() {
  let dialog = document.getElementById('batch-conflict-dialog');
  if (!dialog) {
    dialog = document.createElement('div');
    dialog.id = 'batch-conflict-dialog';
    dialog.className = 'conflict-overlay';
    dialog.innerHTML = '<div class="batch-conflict-body conflict-body"></div>';
    document.body.appendChild(dialog);
  }
  return dialog;
}

function closeBatchConflictDialog() {
  const dialog = document.getElementById('batch-conflict-dialog');
  if (dialog) {
    dialog.style.display = 'none';
    document.body.classList.remove('conflict-dialog-open');
  }
}

// ── CSS Injection ──────────────────────────────────────────────────────────────────────
(function injectConflictStyles() {
  if (document.getElementById('conflict-dialog-styles')) return;
  const style = document.createElement('style');
  style.id = 'conflict-dialog-styles';
  style.textContent = `
    .conflict-overlay {
      display: none;
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(2px);
      align-items: center;
      justify-content: center;
    }
    .conflict-body {
      background: var(--bg-primary, #1a1a2e);
      border: 1px solid var(--border-color, #333);
      border-radius: 12px;
      padding: 24px;
      max-width: 680px;
      width: 90vw;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    }
    .conflict-header {
      text-align: center;
      margin-bottom: 20px;
    }
    .conflict-header .conflict-icon {
      font-size: 2rem;
      margin-bottom: 8px;
    }
    .conflict-header h3 {
      color: #ff6b6b;
      margin: 0 0 8px 0;
      font-size: 1.25rem;
    }
    .conflict-header p {
      color: var(--text-secondary, #aaa);
      font-size: 0.875rem;
      margin: 0;
    }
    .conflict-table-wrap {
      overflow-x: auto;
      margin-bottom: 20px;
    }
    .conflict-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }
    .conflict-table th {
      background: rgba(255,255,255,0.05);
      padding: 8px 12px;
      text-align: left;
      color: var(--text-secondary, #aaa);
      font-weight: 600;
      border-bottom: 1px solid var(--border-color, #333);
    }
    .conflict-table td {
      padding: 8px 12px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      color: var(--text-primary, #eee);
    }
    .conflict-table .field-name {
      font-weight: 500;
      color: var(--text-secondary, #aaa);
    }
    .conflict-table .your-value {
      color: #4ecdc4;
    }
    .conflict-table .server-value {
      color: #ff6b6b;
    }
    .conflict-pick {
      background: rgba(255,255,255,0.08);
      border: 1px solid var(--border-color, #444);
      color: var(--text-primary, #eee);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.8rem;
    }
    .conflict-actions {
      display: flex;
      gap: 10px;
      justify-content: center;
      flex-wrap: wrap;
    }
    .conflict-btn {
      padding: 10px 18px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.85rem;
      font-weight: 600;
      transition: opacity 0.2s;
    }
    .conflict-btn:hover { opacity: 0.85; }
    .conflict-btn-overwrite {
      background: #ff6b6b;
      color: #fff;
    }
    .conflict-btn-accept {
      background: #4ecdc4;
      color: #1a1a2e;
    }
    .conflict-btn-merge {
      background: #ffd93d;
      color: #1a1a2e;
    }
    body.conflict-dialog-open {
      overflow: hidden;
    }
    .batch-conflict-table-wrap {
      overflow-x: auto;
      margin-bottom: 16px;
      max-height: 50vh;
      overflow-y: auto;
    }
    .batch-conflict-table {
      min-width: 500px;
    }
    .batch-conflict-body {
      max-width: 850px;
    }
  `;
  document.head.appendChild(style);
})();
