/**
 * Module Loader — Lazy-loads JS and CSS modules on demand.
 * Core files (data.js, app.js, conflict-dialog.js, sse-client.js) are eagerly loaded.
 * All other module scripts AND their associated stylesheets are loaded dynamically
 * when their view is first activated.
 *
 * Architecture:
 * - moduleMap defines which scripts and styles belong to each view
 * - loadModule() injects <script> and <link> tags and waits for onload
 * - switchView() in app.js calls ensureModuleLoaded(view) before init
 * - Modules that are already loaded (script/link tag present) are skipped
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

  // Track which stylesheets have been injected (by base href, ignoring query string)
  const loadedStyles = new Set();

  // Map views to their required scripts and styles (order matters for script dependencies)
  const moduleMap = {
    'input': {
      scripts: ['js/input-portal.js', 'js/input-compact.js'],
      styles: [], // input-redesign.css stays in HTML — used by login page too
      group: 'anchor'
    },
    'dashboard': {
      scripts: ['js/dashboard-anim.js', 'js/dash-omnibar.js'],
      styles: [],
      group: 'anchor'
    },
    'billing': {
      scripts: ['js/billing.js', 'js/billing-v2.js', 'js/billing-v2-page.js'],
      styles: [],
      group: 'anchor'
    },
    'alerts': {
      scripts: [],  // alerts logic is in app.js
      styles: [],
      group: 'anchor'
    },
    'compass-input': {
      scripts: ['js/compass.js', 'js/compass-omnibar.js', 'js/compass-coaching.js', 'js/compass-ai-assistant.js'],
      styles: ['css/compass-redesign.css'],
      group: 'compass'
    },
    'compass-disputes': {
      scripts: ['js/compass.js', 'js/compass-omnibar.js'],
      styles: ['css/compass-redesign.css'],
      group: 'compass'
    },
    'compass-corrective': {
      scripts: ['js/corrective-actions.js', 'js/ca-knowledge-base.js', 'js/compass-violations.js', 'js/compass-ca-cases.js'],
      styles: ['css/compass-redesign.css', 'css/corrective-actions.css'],
      group: 'compass'
    },
    'sandbox-input': {
      scripts: ['js/sandbox.js', 'js/sandbox-omnibar.js'],
      styles: ['css/sandbox-redesign.css'],
      group: 'sandbox'
    },
    'sandbox-review': {
      scripts: ['js/sandbox.js', 'js/sandbox-omnibar.js'],
      styles: ['css/sandbox-redesign.css'],
      group: 'sandbox'
    },
    'sandbox-analytics': {
      scripts: ['js/sandbox.js', 'js/sandbox-omnibar.js'],
      styles: ['css/sandbox-redesign.css'],
      group: 'sandbox'
    },
    'haven': {
      scripts: ['js/haven.js'],
      styles: ['css/haven.css'],
      group: 'haven'
    },
    'helm-board': {
      scripts: ['js/helm.js', 'js/group-task.js', 'js/shift-extension.js'],
      styles: [],
      group: 'helm'
    },
    'helm-dashboard': {
      scripts: ['js/helm.js', 'js/helm-dashboard.js'],
      styles: [],
      group: 'helm'
    },
    'regimen': {
      scripts: ['js/roster.js', 'js/permissions.js'],
      styles: [],
      group: 'regimen'
    },
    'managers-nook': {
      scripts: ['js/managers-nook.js'],
      styles: [],
      group: 'horizon'
    },
    'tardiness-validator': {
      scripts: ['js/tardiness.js'],
      styles: ['css/tardiness-restyle.css'],
      group: 'horizon'
    },
    'admin': {
      scripts: ['js/admin.js', 'js/permissions.js', 'js/tardiness.js'],
      styles: [],
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
   * Load a single stylesheet and return a promise that resolves when loaded.
   * De-duplicates by base href (ignoring query string).
   */
  function loadStyle(href) {
    var baseHref = href.split('?')[0];
    if (loadedStyles.has(baseHref)) return Promise.resolve();

    // Also check if it's already in the DOM (e.g. from a previous session or eager load)
    var existing = document.querySelector('link[rel="stylesheet"][href^="' + baseHref + '"]');
    if (existing) {
      loadedStyles.add(baseHref);
      return Promise.resolve();
    }

    var hash = (_cacheHashes && _cacheHashes[href]) || Date.now();
    var fullHref = href + '?v=' + hash;

    return new Promise(function(resolve) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = fullHref;
      link.dataset.lazy = 'true';
      link.onload = function() {
        loadedStyles.add(baseHref);
        resolve();
      };
      link.onerror = function() {
        console.warn('[ModuleLoader] Failed to load stylesheet:', fullHref);
        resolve(); // Don't block module loading on CSS failure
      };
      document.head.appendChild(link);
    });
  }

  /**
   * Ensure all scripts and styles for a given view are loaded.
   * Returns a promise that resolves when all assets are ready.
   */
  async function ensureModuleLoaded(view) {
    const config = moduleMap[view];
    if (!config) return; // Unknown view, nothing to load

    // Check if already loaded (by group to avoid re-loading shared scripts)
    if (loadedModules.has(view)) return;

    // If currently loading, wait for the existing promise
    if (loadingPromises[view]) return loadingPromises[view];

    // Load scripts sequentially (order matters) and styles in parallel
    loadingPromises[view] = (async () => {
      // Kick off all style loads immediately (parallel, non-blocking order)
      const stylePromises = (config.styles || []).map(href => loadStyle(href));

      // Load scripts sequentially (order matters for dependencies)
      for (const src of config.scripts) {
        await loadScript(src);
      }

      // Wait for styles to finish (they're likely done already)
      await Promise.all(stylePromises);

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
    loadScript,
    loadStyle
  };

  // On DOMContentLoaded, scan existing <script> and <link> tags and mark their modules as loaded
  document.addEventListener('DOMContentLoaded', function() {
    const existingScripts = new Set();
    document.querySelectorAll('script[src]').forEach(s => {
      // Normalize: strip query string and leading /
      const src = s.getAttribute('src').split('?')[0];
      existingScripts.add(src);
    });

    // Scan existing stylesheets so we don't re-inject them
    document.querySelectorAll('link[rel="stylesheet"]').forEach(l => {
      const href = l.getAttribute('href');
      if (href) loadedStyles.add(href.split('?')[0]);
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
