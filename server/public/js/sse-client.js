/**
 * SSE Client — Real-Time Sync
 * Connects to /api/io/events and triggers targeted data refreshes
 * when another user modifies data in the same module.
 */
(function () {
  'use strict';

  // ── Configuration ──
  const SSE_ENDPOINT = '/api/io/events';
  const RECONNECT_DELAY_MS = 3000;
  const MAX_RECONNECT_DELAY_MS = 30000;
  const DEBOUNCE_MS = 500; // Debounce rapid-fire events from same module

  // ── State ──
  let eventSource = null;
  let reconnectAttempts = 0;
  let debounceTimers = {};
  let connected = false;

  // ── Module → Refresh function mapping ──
  // Maps SSE module names to the frontend refresh functions
  const MODULE_REFRESH_MAP = {
    'attendance': () => {
      if (appState.activeView === 'input' || appState.activeView === 'dashboard') {
        loadDataOptimized({ silent: true });
      }
    },
    'attendance-ops': () => {
      if (appState.activeView === 'input' || appState.activeView === 'dashboard') {
        loadDataOptimized({ silent: true });
      }
    },
    'coaching': () => {
      if (appState.activeView === 'compass-input') {
        if (typeof loadCoachingData === 'function') loadCoachingData();
      }
    },
    'leaves': () => {
      if (appState.activeView === 'haven') {
        if (typeof loadHavenData === 'function') loadHavenData();
      }
    },
    'tasks': () => {
      if (appState.activeView === 'helm-board' || appState.activeView === 'helm-dashboard') {
        if (typeof loadHelmTasks === 'function') loadHelmTasks();
      }
    },
    'notifications': () => {
      if (typeof loadNotifications === 'function') loadNotifications();
    },
    'insights': () => {
      if (appState.activeView === 'compass-input') {
        if (typeof loadInsightsData === 'function') loadInsightsData();
      }
    },
    'employees': () => {
      if (typeof loadEmployeeLookup === 'function') loadEmployeeLookup();
    },
    'permissions': () => {
      if (typeof loadPermissions === 'function') loadPermissions();
    },
    'billing': () => {
      if (appState.activeView === 'billing') {
        if (typeof loadBillingData === 'function') loadBillingData();
      }
    },
    'tardiness': () => {
      if (appState.activeView === 'tardiness-validator') {
        if (typeof loadTardinessData === 'function') loadTardinessData();
      }
    },
    'corrective-actions': () => {
      if (appState.activeView === 'compass-corrective') {
        if (typeof loadCorrectiveActions === 'function') loadCorrectiveActions();
      }
    },
    'group-tasks': () => {
      if (typeof loadGroupTasks === 'function') loadGroupTasks();
    },
    'shift-extensions': () => {
      if (typeof loadShiftExtensions === 'function') loadShiftExtensions();
    },
    'performance': () => {
      if (appState.activeView === 'regimen') {
        if (typeof loadPerformanceData === 'function') loadPerformanceData();
      }
    },
    'role-change': () => {
      if (typeof loadRoleChangeData === 'function') loadRoleChangeData();
    },
  };

  // ── Connection indicator ──
  function updateConnectionIndicator(state) {
    let indicator = document.getElementById('sse-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'sse-indicator';
      indicator.style.cssText = 'position:fixed;bottom:8px;right:8px;width:8px;height:8px;border-radius:50%;z-index:9999;transition:background-color 0.3s;opacity:0.7;';
      indicator.title = 'Real-time sync status';
      document.body.appendChild(indicator);
    }
    switch (state) {
      case 'connected':
        indicator.style.backgroundColor = '#22c55e';
        indicator.title = 'Real-time sync: Connected';
        break;
      case 'reconnecting':
        indicator.style.backgroundColor = '#f59e0b';
        indicator.title = 'Real-time sync: Reconnecting...';
        break;
      case 'disconnected':
        indicator.style.backgroundColor = '#ef4444';
        indicator.title = 'Real-time sync: Disconnected';
        break;
    }
  }

  // ── Debounced refresh ──
  function debouncedRefresh(module) {
    if (debounceTimers[module]) {
      clearTimeout(debounceTimers[module]);
    }
    debounceTimers[module] = setTimeout(() => {
      delete debounceTimers[module];
      const refreshFn = MODULE_REFRESH_MAP[module];
      if (refreshFn) {
        try {
          refreshFn();
        } catch (err) {
          console.warn(`[SSE] Refresh error for ${module}:`, err.message);
        }
      }
    }, DEBOUNCE_MS);
  }

  // ── Connect to SSE ──
  function connect() {
    // Guard: Do not connect if user is not authenticated
    if (!sessionStorage.getItem('playbook_user')) {
      return;
    }
    if (eventSource) {
      eventSource.close();
    }

    try {
      eventSource = new EventSource(SSE_ENDPOINT);

      eventSource.onopen = () => {
        connected = true;
        reconnectAttempts = 0;
        updateConnectionIndicator('connected');
        console.log('[SSE] Connected to real-time event stream');
      };

      // Handle 'change' events (data mutations by other users)
      eventSource.addEventListener('change', (event) => {
        try {
          const data = JSON.parse(event.data);
          const { module, action, actor_ohr, meta } = data;

          // Skip events triggered by the current user (they already see their own changes)
          if (actor_ohr && window.currentUserOhr && actor_ohr === window.currentUserOhr) {
            return;
          }

          console.log(`[SSE] Change: ${module}.${action} by ${actor_ohr || 'unknown'}`);
          debouncedRefresh(module);

          // Show subtle toast for important changes (not own actions)
          if (action === 'record_created' || action === 'bulk_update') {
            const moduleLabel = module.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            if (typeof showToast === 'function') {
              showToast(`${moduleLabel} updated by another user`, 'info', 2000);
            }
          }
        } catch (err) {
          console.warn('[SSE] Failed to parse change event:', err);
        }
      });

      // Handle 'connected' event (initial user list)
      eventSource.addEventListener('connected', (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.activeUsers) {
            activeUsers = data.activeUsers;
            renderPresenceBar();
          }
        } catch (err) {
          console.warn('[SSE] Failed to parse connected event:', err);
        }
      });

      // Handle 'change' events that carry presence info (join/leave)
      eventSource.addEventListener('change', handlePresenceFromChange);

      // Handle heartbeat (keep-alive)
      eventSource.addEventListener('heartbeat', () => {
        // No-op, just confirms connection is alive
      });

      eventSource.onerror = () => {
        connected = false;
        eventSource.close();
        eventSource = null;

        // If user is logged out (no session), don't reconnect — session expired
        if (!window.currentUserOhr) {
          console.log('[SSE] User logged out — stopping reconnection.');
          updateConnectionIndicator('disconnected');
          return;
        }

        // Check if session is still valid before reconnecting
        // If we've failed 5+ times, probe the auth endpoint
        if (reconnectAttempts >= 5) {
          fetch('/api/io/employees?limit=1', { credentials: 'same-origin' })
            .then(resp => {
              if (resp.status === 401) {
                // Session expired server-side — trigger logout
                console.log('[SSE] Session expired (401) — triggering logout.');
                updateConnectionIndicator('disconnected');
                if (typeof handleLogout === 'function') handleLogout('timeout');
                return;
              }
              // Server is reachable but SSE failed — keep trying
              _scheduleReconnect();
            })
            .catch(() => {
              // Network error — keep trying
              _scheduleReconnect();
            });
          return;
        }

        _scheduleReconnect();
      };

      function _scheduleReconnect() {
        updateConnectionIndicator('reconnecting');
        const delay = Math.min(
          RECONNECT_DELAY_MS * Math.pow(1.5, reconnectAttempts) + Math.random() * 1000,
          MAX_RECONNECT_DELAY_MS
        );
        reconnectAttempts++;
        console.log(`[SSE] Disconnected. Reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempts})`);
        setTimeout(connect, delay);
      }
    } catch (err) {
      console.error('[SSE] Failed to create EventSource:', err);
      updateConnectionIndicator('disconnected');
    }
  }

  // ── Visibility-based connection management ──
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Tab hidden: disconnect to save resources
      if (eventSource) {
        eventSource.close();
        eventSource = null;
        connected = false;
        updateConnectionIndicator('disconnected');
      }
    } else {
      // Tab visible: reconnect and refresh stale data (only if authenticated)
      if (!eventSource && sessionStorage.getItem('playbook_user')) {
        reconnectAttempts = 0;
        connect();
        // Refresh current view since data may have changed while tab was hidden
        const currentModule = getModuleForView(appState.activeView);
        if (currentModule) {
          debouncedRefresh(currentModule);
        }
      }
    }
  });

  // ── Map active view to module name ──
  function getModuleForView(view) {
    const viewModuleMap = {
      'input': 'attendance',
      'dashboard': 'attendance',
      'compass-input': 'coaching',
      'compass-corrective': 'corrective-actions',
      'haven': 'leaves',
      'helm-board': 'tasks',
      'helm-dashboard': 'tasks',
      'billing': 'billing',
      'tardiness-validator': 'tardiness',
      'regimen': 'performance',
    };
    return viewModuleMap[view] || null;
  }

  // ── Presence State ──
  let activeUsers = []; // Array of { ohr, name, connectedAt, modules }

  function handlePresenceFromChange(event) {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'presence_join') {
        const { ohr, name } = data.payload;
        if (!activeUsers.find(u => u.ohr === ohr)) {
          activeUsers.push({ ohr, name, connectedAt: Date.now(), modules: [] });
        }
        renderPresenceBar();
      } else if (data.type === 'presence_leave') {
        const { ohr } = data.payload;
        activeUsers = activeUsers.filter(u => u.ohr !== ohr);
        renderPresenceBar();
      }
    } catch (err) {
      // Not a presence event — ignore
    }
  }

  function renderPresenceBar() {
    let bar = document.getElementById('sse-presence-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'sse-presence-bar';
      bar.style.cssText = 'position:fixed;bottom:8px;right:24px;display:flex;align-items:center;gap:4px;z-index:9998;font-size:11px;color:#94a3b8;';
      document.body.appendChild(bar);
    }

    // Filter out current user
    const others = activeUsers.filter(u => u.ohr !== window.currentUserOhr);
    if (others.length === 0) {
      bar.innerHTML = '';
      return;
    }

    // Show up to 3 avatars + overflow count
    const maxShow = 3;
    const shown = others.slice(0, maxShow);
    const overflow = others.length - maxShow;

    let html = '<span style="margin-right:4px;">Online:</span>';
    shown.forEach(u => {
      const initials = u.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
      html += `<span title="${u.name}" style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#334155;color:#e2e8f0;font-size:9px;font-weight:600;border:1.5px solid #22c55e;">${initials}</span>`;
    });
    if (overflow > 0) {
      html += `<span style="font-size:10px;color:#64748b;">+${overflow}</span>`;
    }
    bar.innerHTML = html;
  }

  // ── Public API ──
  window.sseClient = {
    connect,
    disconnect: () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
        connected = false;
        updateConnectionIndicator('disconnected');
      }
    },
    isConnected: () => connected,
    getConnectionCount: () => reconnectAttempts,
  };

  // ── Auto-connect on page load ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', connect);
  } else {
    connect();
  }
})();
