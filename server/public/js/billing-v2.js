/**
 * Billing Compliance V2 — Admin Tools JS
 * Handles Billing Targets V2 editor.
 */

// ============================================================
// Constants
// ============================================================
const PG_ROLE_COMBOS_V2 = [
  { planning_group: 'CS-ABF', role: 'Agent' },
  { planning_group: 'CS-ABF', role: 'Operational SME' },
  { planning_group: 'CS-ABF', role: 'Quality & Policy Expert' },
  { planning_group: 'CSO_CTR', role: 'Agent' },
  { planning_group: 'FAD_CTR', role: 'Agent' },
  { planning_group: 'S-ABF', role: 'Agent' },
  { planning_group: 'S-ABF', role: 'Operational SME' },
  { planning_group: 'S-ABF', role: 'Quality & Policy Expert' },
  { planning_group: 'QPE_CTR', role: 'Quality & Policy Expert' },
  { planning_group: 'RECALL_MEASUREMENT_CTR', role: 'Agent' },
  { planning_group: 'SME_CTR', role: 'Operational SME' },
];

// Short labels for planning groups
const PG_SHORT_LABELS = {
  'CS-ABF': 'CEI Taskforce',
  'CSO_CTR': 'CSO',
  'FAD_CTR': 'FAD',
  'S-ABF': 'MASA/MAFSA',
  'QPE_CTR': 'QPE',
  'RECALL_MEASUREMENT_CTR': 'Recall Measurement',
  'SME_CTR': 'SME',
};

// ============================================================
// Billing Targets V2 Editor
// ============================================================

let targetsV2Data = [];
let targetsV2WeekEndings = [];

async function initTargetsV2Panel() {
  try {
    // Load available week endings
    const resp = await fetch(`${IO_API_BASE}/billing-targets-v2/weeks`);
    targetsV2WeekEndings = await resp.json();
    const select = document.getElementById('targets-v2-week-select');
    // Keep the first option
    select.innerHTML = '<option value="">Select Week Ending</option>';
    for (const we of targetsV2WeekEndings) {
      const opt = document.createElement('option');
      opt.value = we;
      opt.textContent = we;
      select.appendChild(opt);
    }
  } catch (e) {
    console.error('initTargetsV2Panel error:', e);
  }
}

async function loadTargetsV2() {
  const we = document.getElementById('targets-v2-week-select').value;
  if (!we) {
    document.getElementById('targets-v2-table-wrapper').style.display = 'none';
    document.getElementById('targets-v2-actions').style.display = 'none';
    document.getElementById('targets-v2-empty').style.display = 'block';
    return;
  }

  document.getElementById('targets-v2-empty').style.display = 'none';
  document.getElementById('targets-v2-loading').style.display = 'block';

  try {
    const resp = await fetch(`${IO_API_BASE}/billing-targets-v2?week_ending=${we}`);
    const data = await resp.json();

    // Build a map of existing targets
    const existingMap = new Map();
    for (const t of data) {
      existingMap.set(`${t.planning_group}|${t.role}`, t);
    }

    // Render table with all 11 combos
    const tbody = document.getElementById('targets-v2-body');
    tbody.innerHTML = '';
    targetsV2Data = [];

    for (const combo of PG_ROLE_COMBOS_V2) {
      const key = `${combo.planning_group}|${combo.role}`;
      const existing = existingMap.get(key);
      const hc = existing ? Number(existing.target_hc) || 0 : 0;
      const hrs = existing ? Number(existing.target_hours) || 0 : 0;

      targetsV2Data.push({ planning_group: combo.planning_group, role: combo.role, target_hc: hc, target_hours: hrs });

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${PG_SHORT_LABELS[combo.planning_group] || combo.planning_group}</td>
        <td>${combo.role}</td>
        <td style="text-align:center;"><input type="number" class="form-input" style="width:80px;text-align:center;font-size:12px;padding:4px 6px;" value="${hc}" min="0" data-pg="${combo.planning_group}" data-role="${combo.role}" data-field="target_hc" onchange="updateTargetV2Field(this)"></td>
        <td style="text-align:center;"><input type="number" class="form-input" style="width:100px;text-align:center;font-size:12px;padding:4px 6px;" value="${hrs}" min="0" step="0.01" data-pg="${combo.planning_group}" data-role="${combo.role}" data-field="target_hours" onchange="updateTargetV2Field(this)"></td>
      `;
      tbody.appendChild(tr);
    }

    document.getElementById('targets-v2-table-wrapper').style.display = 'block';
    document.getElementById('targets-v2-actions').style.display = 'flex';
    document.getElementById('targets-v2-loading').style.display = 'none';
  } catch (err) {
    console.error('loadTargetsV2 error:', err);
    document.getElementById('targets-v2-loading').style.display = 'none';
    showToast('Failed to load targets: ' + err.message, 'error');
  }
}

function updateTargetV2Field(input) {
  const pg = input.dataset.pg;
  const role = input.dataset.role;
  const field = input.dataset.field;
  const val = parseFloat(input.value) || 0;
  const entry = targetsV2Data.find(t => t.planning_group === pg && t.role === role);
  if (entry) entry[field] = val;
}

async function saveTargetsV2() {
  const we = document.getElementById('targets-v2-week-select').value;
  if (!we) {
    showToast('Select a week ending first.', 'error');
    return;
  }

  const targets = targetsV2Data.map(t => ({
    week_ending: we,
    planning_group: t.planning_group,
    role: t.role,
    target_hc: t.target_hc,
    target_hours: t.target_hours
  }));

  try {
    const resp = await fetch(`${IO_API_BASE}/billing-targets-v2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targets })
    });
    const result = await resp.json();
    if (result.success) {
      showToast(`Targets saved for ${we}: ${result.upserted} entries.`, 'success');
      const resultEl = document.getElementById('targets-v2-result');
      resultEl.style.display = 'block';
      resultEl.innerHTML = `<span style="color:#166534;">✓ Saved ${result.upserted} targets for ${we}.</span>`;
      // Refresh week list
      await initTargetsV2Panel();
      document.getElementById('targets-v2-week-select').value = we;
    } else {
      throw new Error(result.error || 'Save failed');
    }
  } catch (err) {
    console.error('saveTargetsV2 error:', err);
    showToast('Failed to save targets: ' + err.message, 'error');
  }
}

function addTargetsV2Week() {
  // Prompt for a new week ending date (Saturday)
  const input = prompt('Enter the new Week Ending date (Saturday, YYYY-MM-DD):');
  if (!input) return;
  const d = new Date(input + 'T00:00:00Z');
  if (isNaN(d.getTime())) {
    showToast('Invalid date format.', 'error');
    return;
  }
  // Validate it's a Saturday (day 6)
  if (d.getUTCDay() !== 6) {
    showToast('Week ending must be a Saturday.', 'error');
    return;
  }
  const dateStr = d.toISOString().slice(0, 10);
  const select = document.getElementById('targets-v2-week-select');
  // Check if already exists
  const existing = Array.from(select.options).find(o => o.value === dateStr);
  if (!existing) {
    const opt = document.createElement('option');
    opt.value = dateStr;
    opt.textContent = dateStr;
    // Insert in sorted position
    let inserted = false;
    for (let i = 1; i < select.options.length; i++) {
      if (select.options[i].value < dateStr) {
        select.insertBefore(opt, select.options[i]);
        inserted = true;
        break;
      }
    }
    if (!inserted) select.appendChild(opt);
  }
  select.value = dateStr;
  loadTargetsV2();
}

async function copyTargetsV2FromPrevious() {
  const we = document.getElementById('targets-v2-week-select').value;
  if (!we) {
    showToast('Select a week ending first.', 'error');
    return;
  }

  // Find the previous week ending in the list
  const currentIdx = targetsV2WeekEndings.indexOf(we);
  let prevWe = null;
  if (currentIdx >= 0 && currentIdx < targetsV2WeekEndings.length - 1) {
    prevWe = targetsV2WeekEndings[currentIdx + 1]; // list is DESC sorted
  } else {
    // Try computing previous Saturday
    const d = new Date(we + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 7);
    prevWe = d.toISOString().slice(0, 10);
  }

  try {
    const resp = await fetch(`${IO_API_BASE}/billing-targets-v2?week_ending=${prevWe}`);
    const data = await resp.json();
    if (!data || data.length === 0) {
      showToast(`No targets found for previous week (${prevWe}).`, 'info');
      return;
    }

    // Apply to current inputs
    const inputs = document.querySelectorAll('#targets-v2-body input');
    for (const input of inputs) {
      const pg = input.dataset.pg;
      const role = input.dataset.role;
      const field = input.dataset.field;
      const match = data.find(t => t.planning_group === pg && t.role === role);
      if (match) {
        input.value = field === 'target_hc' ? (Number(match.target_hc) || 0) : (Number(match.target_hours) || 0);
        updateTargetV2Field(input);
      }
    }

    showToast(`Copied targets from ${prevWe}. Click "Save Targets" to apply.`, 'success');
  } catch (err) {
    console.error('copyTargetsV2FromPrevious error:', err);
    showToast('Failed to copy: ' + err.message, 'error');
  }
}

// ============================================================
// Init on admin view load
// ============================================================
// Hook into the existing switchView function
const _origSwitchViewForV2 = window.switchView;
if (_origSwitchViewForV2) {
  window.switchView = function(view) {
    _origSwitchViewForV2(view);
    if (view === 'admin') {
      initTargetsV2Panel();
    }
  };
} else {
  // Fallback: init when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    initTargetsV2Panel();
  });
}
