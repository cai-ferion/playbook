/**
 * Command Palette (Cmd+K / Ctrl+K) — Quick navigation and actions.
 * Provides fuzzy search across modules, actions, and recent records.
 */
(function() {
  'use strict';

  // All navigable commands
  const commands = [
    // Anchor group
    { id: 'nav-input', label: 'Attendance Input', keywords: 'anchor input attendance records edit tags', view: 'input', group: 'Anchor', icon: '📋' },
    { id: 'nav-dashboard', label: 'Dashboard', keywords: 'anchor dashboard kpi metrics analytics overview', view: 'dashboard', group: 'Anchor', icon: '📊' },
    { id: 'nav-alerts', label: 'Alerts & Notifications', keywords: 'anchor alerts notifications warnings', view: 'alerts', group: 'Anchor', icon: '🔔' },
    { id: 'nav-billing', label: 'Billing Compliance', keywords: 'anchor billing compliance hours target', view: 'billing', group: 'Anchor', icon: '💰' },
    // Compass group
    { id: 'nav-compass-input', label: 'Coaching Logs', keywords: 'compass coaching logs input new create', view: 'compass-input', group: 'Compass', icon: '📝' },
    { id: 'nav-compass-disputes', label: 'Coaching Disputes', keywords: 'compass disputes challenge appeal', view: 'compass-disputes', group: 'Compass', icon: '⚖️' },
    { id: 'nav-compass-corrective', label: 'Corrective Actions', keywords: 'compass corrective actions disciplinary nda nte', view: 'compass-corrective', group: 'Compass', icon: '⚠️' },
    // Sandbox group
    { id: 'nav-sandbox-input', label: 'Sandbox Input', keywords: 'sandbox input quality audit', view: 'sandbox-input', group: 'Sandbox', icon: '🔍' },
    { id: 'nav-sandbox-review', label: 'Sandbox Review', keywords: 'sandbox review quality check', view: 'sandbox-review', group: 'Sandbox', icon: '✅' },
    // Haven
    { id: 'nav-haven', label: 'Haven (Leave Management)', keywords: 'haven leave management pto sick vacation', view: 'haven', group: 'Haven', icon: '🏖️' },
    // Helm group
    { id: 'nav-helm-board', label: 'Helm Task Board', keywords: 'helm task board kanban assignments', view: 'helm-board', group: 'Helm', icon: '📌' },
    { id: 'nav-helm-dashboard', label: 'Helm Dashboard', keywords: 'helm dashboard task metrics', view: 'helm-dashboard', group: 'Helm', icon: '📈' },
    // Horizon group
    { id: 'nav-managers-nook', label: "Manager's Nook", keywords: 'horizon managers nook team overview', view: 'managers-nook', group: 'Horizon', icon: '👔' },
    { id: 'nav-tardiness', label: 'Tardiness Validator', keywords: 'horizon tardiness validator late attendance', view: 'tardiness-validator', group: 'Horizon', icon: '⏰' },
    // Regimen
    { id: 'nav-regimen', label: 'Regimen (Shift Extensions)', keywords: 'regimen shift extension overtime request', view: 'regimen', group: 'Regimen', icon: '🕐' },
    // Admin
    { id: 'nav-admin', label: 'Admin Tools', keywords: 'admin tools sync backup export', view: 'admin', group: 'Admin', icon: '⚙️' },
    // Quick actions
    { id: 'action-save', label: 'Save Changes', keywords: 'save commit changes edits', action: 'save', group: 'Actions', icon: '💾' },
    { id: 'action-undo', label: 'Undo All Changes', keywords: 'undo revert discard changes', action: 'undo', group: 'Actions', icon: '↩️' },
    { id: 'action-refresh', label: 'Refresh Data', keywords: 'refresh reload data fetch', action: 'refresh', group: 'Actions', icon: '🔄' },
    { id: 'action-export', label: 'Export to Excel', keywords: 'export excel download xlsx spreadsheet', action: 'export', group: 'Actions', icon: '📥' },
  ];

  let paletteEl = null;
  let inputEl = null;
  let resultsEl = null;
  let selectedIdx = 0;
  let filteredCommands = [];
  let isOpen = false;

  /**
   * Simple fuzzy match — checks if all query characters appear in order.
   */
  function fuzzyMatch(query, text) {
    query = query.toLowerCase();
    text = text.toLowerCase();
    let qi = 0;
    for (let ti = 0; ti < text.length && qi < query.length; ti++) {
      if (text[ti] === query[qi]) qi++;
    }
    return qi === query.length;
  }

  /**
   * Score a command against a query (higher = better match).
   */
  function scoreCommand(cmd, query) {
    const q = query.toLowerCase();
    const label = cmd.label.toLowerCase();
    const keywords = cmd.keywords.toLowerCase();

    // Exact prefix match on label is highest priority
    if (label.startsWith(q)) return 100;
    // Word boundary match in label
    if (label.includes(q)) return 80;
    // Keyword match
    if (keywords.includes(q)) return 60;
    // Fuzzy match on label
    if (fuzzyMatch(q, label)) return 40;
    // Fuzzy match on keywords
    if (fuzzyMatch(q, keywords)) return 20;
    return 0;
  }

  /**
   * Filter and rank commands by query.
   */
  function filterCommands(query) {
    if (!query) {
      // Show all navigation commands when empty (no actions)
      return commands.filter(c => c.view).slice(0, 12);
    }
    return commands
      .map(cmd => ({ cmd, score: scoreCommand(cmd, query) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.cmd)
      .slice(0, 10);
  }

  /**
   * Render the results list.
   */
  function renderResults() {
    if (filteredCommands.length === 0) {
      resultsEl.innerHTML = '<div class="cmd-empty">No results found</div>';
      return;
    }

    let currentGroup = '';
    let html = '';
    filteredCommands.forEach((cmd, idx) => {
      if (cmd.group !== currentGroup) {
        currentGroup = cmd.group;
        html += `<div class="cmd-group-label">${currentGroup}</div>`;
      }
      const isSelected = idx === selectedIdx;
      html += `<div class="cmd-item ${isSelected ? 'cmd-item-selected' : ''}" data-idx="${idx}">
        <span class="cmd-icon">${cmd.icon}</span>
        <span class="cmd-label">${cmd.label}</span>
        <span class="cmd-shortcut">${cmd.view ? '↵ Go' : '↵ Run'}</span>
      </div>`;
    });
    resultsEl.innerHTML = html;

    // Scroll selected into view
    const selected = resultsEl.querySelector('.cmd-item-selected');
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  }

  /**
   * Execute the selected command.
   */
  function executeCommand(cmd) {
    closePalette();
    if (cmd.view) {
      if (typeof switchView === 'function') switchView(cmd.view);
    } else if (cmd.action) {
      switch (cmd.action) {
        case 'save':
          if (typeof confirmSave === 'function') confirmSave();
          break;
        case 'undo':
          if (typeof undoAllChanges === 'function') undoAllChanges();
          break;
        case 'refresh':
          if (typeof loadDataOptimized === 'function') loadDataOptimized();
          break;
        case 'export':
          if (typeof exportToExcel === 'function') exportToExcel();
          break;
      }
    }
  }

  /**
   * Create the palette DOM.
   */
  function createPalette() {
    if (paletteEl) return;

    paletteEl = document.createElement('div');
    paletteEl.className = 'cmd-palette-overlay';
    paletteEl.innerHTML = `
      <div class="cmd-palette">
        <div class="cmd-input-wrap">
          <svg class="cmd-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" class="cmd-input" placeholder="Search modules, actions..." autocomplete="off" spellcheck="false">
          <kbd class="cmd-esc">ESC</kbd>
        </div>
        <div class="cmd-results"></div>
        <div class="cmd-footer">
          <span><kbd>↑↓</kbd> Navigate</span>
          <span><kbd>↵</kbd> Select</span>
          <span><kbd>Esc</kbd> Close</span>
        </div>
      </div>
    `;
    document.body.appendChild(paletteEl);

    inputEl = paletteEl.querySelector('.cmd-input');
    resultsEl = paletteEl.querySelector('.cmd-results');

    // Event handlers
    inputEl.addEventListener('input', function() {
      selectedIdx = 0;
      filteredCommands = filterCommands(inputEl.value.trim());
      renderResults();
    });

    inputEl.addEventListener('keydown', function(e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIdx = Math.min(selectedIdx + 1, filteredCommands.length - 1);
        renderResults();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIdx = Math.max(selectedIdx - 1, 0);
        renderResults();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands[selectedIdx]) {
          executeCommand(filteredCommands[selectedIdx]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closePalette();
      }
    });

    // Click on result item
    resultsEl.addEventListener('click', function(e) {
      const item = e.target.closest('.cmd-item');
      if (item) {
        const idx = parseInt(item.dataset.idx, 10);
        if (filteredCommands[idx]) executeCommand(filteredCommands[idx]);
      }
    });

    // Click on overlay to close
    paletteEl.addEventListener('click', function(e) {
      if (e.target === paletteEl) closePalette();
    });
  }

  /**
   * Open the command palette.
   */
  function openPalette() {
    if (isOpen) return;
    createPalette();
    isOpen = true;
    paletteEl.classList.add('active');
    inputEl.value = '';
    selectedIdx = 0;
    filteredCommands = filterCommands('');
    renderResults();
    setTimeout(() => inputEl.focus(), 50);
  }

  /**
   * Close the command palette.
   */
  function closePalette() {
    if (!isOpen) return;
    isOpen = false;
    if (paletteEl) paletteEl.classList.remove('active');
  }

  // Global keyboard shortcut: Cmd+K / Ctrl+K
  document.addEventListener('keydown', function(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      if (isOpen) {
        closePalette();
      } else {
        openPalette();
      }
    }
  });

  // Expose globally
  window.CommandPalette = { open: openPalette, close: closePalette };

  // Inject styles
  const style = document.createElement('style');
  style.textContent = `
    .cmd-palette-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(4px);
      z-index: 99999;
      display: none;
      align-items: flex-start;
      justify-content: center;
      padding-top: 15vh;
    }
    .cmd-palette-overlay.active { display: flex; }
    .cmd-palette {
      width: 560px;
      max-width: 90vw;
      background: var(--bg-secondary, #161b22);
      border: 1px solid var(--border-primary, #30363d);
      border-radius: 12px;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
      overflow: hidden;
    }
    .cmd-input-wrap {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-primary, #30363d);
      gap: 10px;
    }
    .cmd-search-icon { opacity: 0.5; flex-shrink: 0; }
    .cmd-input {
      flex: 1;
      background: none;
      border: none;
      outline: none;
      color: var(--text-primary, #e6edf3);
      font-size: 15px;
      font-family: inherit;
    }
    .cmd-input::placeholder { color: var(--text-tertiary, #6e7681); }
    .cmd-esc {
      font-size: 11px;
      padding: 2px 6px;
      background: var(--bg-tertiary, #21262d);
      border: 1px solid var(--border-primary, #30363d);
      border-radius: 4px;
      color: var(--text-secondary, #8b949e);
    }
    .cmd-results {
      max-height: 340px;
      overflow-y: auto;
      padding: 8px;
    }
    .cmd-group-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-tertiary, #6e7681);
      padding: 8px 12px 4px;
    }
    .cmd-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.1s;
    }
    .cmd-item:hover, .cmd-item-selected {
      background: var(--bg-tertiary, #21262d);
    }
    .cmd-icon { font-size: 16px; width: 24px; text-align: center; }
    .cmd-label {
      flex: 1;
      color: var(--text-primary, #e6edf3);
      font-size: 14px;
    }
    .cmd-shortcut {
      font-size: 11px;
      color: var(--text-tertiary, #6e7681);
      opacity: 0;
      transition: opacity 0.1s;
    }
    .cmd-item:hover .cmd-shortcut,
    .cmd-item-selected .cmd-shortcut { opacity: 1; }
    .cmd-empty {
      text-align: center;
      padding: 24px;
      color: var(--text-tertiary, #6e7681);
      font-size: 13px;
    }
    .cmd-footer {
      display: flex;
      gap: 16px;
      padding: 8px 16px;
      border-top: 1px solid var(--border-primary, #30363d);
      font-size: 11px;
      color: var(--text-tertiary, #6e7681);
    }
    .cmd-footer kbd {
      font-size: 10px;
      padding: 1px 4px;
      background: var(--bg-tertiary, #21262d);
      border: 1px solid var(--border-primary, #30363d);
      border-radius: 3px;
      margin-right: 4px;
    }
  `;
  document.head.appendChild(style);
})();
