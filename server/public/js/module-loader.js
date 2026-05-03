/**
 * Module Loader — Lazy-loads JS/CSS modules on demand.
 * Core files (data.js, app.js, conflict-dialog.js, sse-client.js) are eagerly loaded.
 * All other module scripts are loaded dynamically when their view is first activated.
 *
 * Architecture:
 * - moduleMap defines which scripts belong to each view
 * - loadModule() injects <script> tags and waits for onload
 * - switchView() in app.js calls ensureModuleLoaded(view) before init
 * - Modules that are already loaded (script tag present) are skipped
 */

(function() {
  'use strict';

  // Cache manifest — fetched once at startup for content-hash-based cache busting
  let _cacheHashes = null;
  fetch('/api/site/cache-manifest.json')
    .then(r => r.json())
    .then(manifest => { _cacheHashes = manifest; window._cacheHashes = manifest; })
    .catch(() => { console.warn('[ModuleLoader] Failed to fetch cache manifest, falling back to Date.now()'); });

  // Track which modules have been loaded
  const loadedModules = new Set();
  const loadingPromises = {};

  // Map views to their required scripts (order matters for dependencies)
  const moduleMap = {
    'input': {
      scripts: ['js/input-portal.js', 'js/input-compact.js'],
      group: 'anchor'
    },
    'dashboard': {
      scripts: ['js/dashboard-anim.js', 'js/dash-omnibar.js', 'js/anchor-analytics.js'],
      group: 'anchor'
    },
    'billing': {
      scripts: ['js/billing.js', 'js/billing-v2.js', 'js/billing-v2-page.js'],
      group: 'anchor'
    },
    'alerts': {
      scripts: [],  // alerts logic is in app.js
      group: 'anchor'
    },
    'compass-input': {
      scripts: ['js/compass.js', 'js/compass-omnibar.js', 'js/compass-coaching.js', 'js/compass-ai-assistant.js'],
      group: 'compass'
    },
    'compass-disputes': {
      scripts: ['js/compass.js', 'js/compass-omnibar.js'],
      group: 'compass'
    },
    'compass-corrective': {
      scripts: ['js/corrective-actions.js', 'js/ca-knowledge-base.js', 'js/compass-violations.js', 'js/compass-ca-cases.js'],
      group: 'compass'
    },
    'sandbox-input': {
      scripts: ['js/sandbox.js', 'js/sandbox-omnibar.js'],
      group: 'sandbox'
    },
    'sandbox-review': {
      scripts: ['js/sandbox.js', 'js/sandbox-omnibar.js'],
      group: 'sandbox'
    },
    'sandbox-analytics': {
      scripts: ['js/sandbox.js', 'js/sandbox-omnibar.js'],
      group: 'sandbox'
    },
    'haven': {
      scripts: ['js/haven.js'],
      group: 'haven'
    },
    'helm-board': {
      scripts: ['js/helm.js', 'js/group-task.js', 'js/shift-extension.js'],
      group: 'helm'
    },
    'helm-dashboard': {
      scripts: ['js/helm.js', 'js/helm-dashboard.js'],
      group: 'helm'
    },
    'regimen': {
      scripts: ['js/roster.js', 'js/permissions.js'],
      group: 'regimen'
    },
    'managers-nook': {
      scripts: ['js/managers-nook.js'],
      group: 'horizon'
    },
    'tardiness-validator': {
      scripts: ['js/tardiness.js'],
      group: 'horizon'
    },
    'admin': {
      scripts: ['js/admin.js'],
      group: 'admin'
    }
  };

  /**
   * Load a single script file and return a promise that resolves when loaded.
   */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      // Check if already loaded via eager <script> tag or previous lazy load
      const existing = document.querySelector(`script[src="${src}"], script[data-src="${src}"]`);
      if (existing) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      // Use content-hash from manifest (Phase 7.1) or fall back to Date.now()
      const hash = (_cacheHashes && _cacheHashes[src]) || Date.now();
      script.src = src + '?v=' + hash;
      script.dataset.src = src;
      script.dataset.lazy = 'true';
      script.onload = resolve;
      script.onerror = () => {
        console.error('[ModuleLoader] Failed to load:', src);
        reject(new Error('Failed to load script: ' + src));
      };
      document.body.appendChild(script);
    });
  }

  /**
   * Ensure all scripts for a given view are loaded.
   * Returns a promise that resolves when all scripts are ready.
   */
  async function ensureModuleLoaded(view) {
    const config = moduleMap[view];
    if (!config) return; // Unknown view, nothing to load

    // Check if already loaded (by group to avoid re-loading shared scripts)
    if (loadedModules.has(view)) return;

    // If currently loading, wait for the existing promise
    if (loadingPromises[view]) return loadingPromises[view];

    // Load all scripts sequentially (order matters for dependencies)
    loadingPromises[view] = (async () => {
      for (const src of config.scripts) {
        await loadScript(src);
      }
      loadedModules.add(view);
      delete loadingPromises[view];
    })();

    return loadingPromises[view];
  }

  /**
   * Mark a module as already loaded (for eagerly loaded scripts).
   */
  function markModuleLoaded(view) {
    loadedModules.add(view);
  }

  /**
   * Check if a module is loaded.
   */
  function isModuleLoaded(view) {
    return loadedModules.has(view);
  }

  /**
   * Get the module map for external inspection.
   */
  function getModuleMap() {
    return moduleMap;
  }

  // Expose globally
  window.ModuleLoader = {
    ensureModuleLoaded,
    markModuleLoaded,
    isModuleLoaded,
    getModuleMap,
    loadScript
  };

  // On DOMContentLoaded, scan existing <script> tags and mark their modules as loaded
  document.addEventListener('DOMContentLoaded', function() {
    const existingScripts = new Set();
    document.querySelectorAll('script[src]').forEach(s => {
      // Normalize: strip query string and leading /
      const src = s.getAttribute('src').split('?')[0];
      existingScripts.add(src);
    });

    // Mark views as loaded if all their scripts are already present
    for (const [view, config] of Object.entries(moduleMap)) {
      const allPresent = config.scripts.every(src => existingScripts.has(src));
      if (allPresent) {
        loadedModules.add(view);
      }
    }
  });
})();
