/**
 * Skeleton Loading States — Shows content-shaped placeholders while modules lazy-load.
 * Integrated with ModuleLoader to show/hide skeletons during module transitions.
 */
(function() {
  'use strict';

  // Module type → skeleton template
  const skeletonTemplates = {
    table: function(rows) {
      rows = rows || 8;
      let html = '<div class="skeleton-container">';
      html += '<div class="skeleton-filter-bar">';
      html += '<div class="skeleton-pulse skeleton-filter"></div>';
      html += '<div class="skeleton-pulse skeleton-filter"></div>';
      html += '<div class="skeleton-pulse skeleton-filter"></div>';
      html += '<div class="skeleton-pulse skeleton-btn" style="margin-left:auto;"></div>';
      html += '</div>';
      html += '<div class="skeleton-table-header">';
      for (let i = 0; i < 6; i++) {
        html += '<div class="skeleton-pulse skeleton-cell"></div>';
      }
      html += '</div>';
      for (let r = 0; r < rows; r++) {
        html += '<div class="skeleton-table-row">';
        for (let i = 0; i < 6; i++) {
          html += '<div class="skeleton-pulse skeleton-cell' + (i > 3 ? '-sm' : '') + '"></div>';
        }
        html += '</div>';
      }
      html += '</div>';
      return html;
    },

    dashboard: function() {
      let html = '<div class="skeleton-container">';
      // KPI cards
      html += '<div class="skeleton-cards">';
      for (let i = 0; i < 5; i++) {
        html += '<div class="skeleton-card skeleton-pulse">';
        html += '<div class="skeleton-pulse skeleton-card-title"></div>';
        html += '<div class="skeleton-pulse skeleton-card-value"></div>';
        html += '<div class="skeleton-pulse skeleton-card-subtitle"></div>';
        html += '</div>';
      }
      html += '</div>';
      // Chart area
      html += '<div class="skeleton-pulse skeleton-chart"></div>';
      // Table below
      html += '<div style="margin-top:16px;">';
      for (let r = 0; r < 5; r++) {
        html += '<div class="skeleton-table-row">';
        for (let i = 0; i < 6; i++) {
          html += '<div class="skeleton-pulse skeleton-cell"></div>';
        }
        html += '</div>';
      }
      html += '</div>';
      html += '</div>';
      return html;
    },

    form: function() {
      let html = '<div class="skeleton-container">';
      html += '<div class="skeleton-filter-bar">';
      html += '<div class="skeleton-pulse skeleton-filter" style="width:200px;"></div>';
      html += '<div class="skeleton-pulse skeleton-btn"></div>';
      html += '</div>';
      html += '<div class="skeleton-text-block" style="margin-top:12px;">';
      for (let i = 0; i < 4; i++) {
        html += '<div class="skeleton-pulse skeleton-text-line"></div>';
      }
      html += '</div>';
      html += '<div class="skeleton-pulse skeleton-chart" style="height:300px;margin-top:16px;"></div>';
      html += '</div>';
      return html;
    }
  };

  // Map views to their skeleton type
  const viewSkeletonType = {
    'input': 'table',
    'dashboard': 'dashboard',
    'billing': 'table',
    'alerts': 'table',
    'admin': 'form',
    'compass-input': 'table',
    'compass-disputes': 'table',
    'compass-corrective': 'table',
    'sandbox-input': 'table',
    'sandbox-review': 'table',
    'sandbox-analytics': 'dashboard',
    'haven': 'form',
    'helm-board': 'table',
    'helm-dashboard': 'dashboard',
    'regimen': 'table',
    'managers-nook': 'table',
    'tardiness-validator': 'table'
  };

  // Active skeleton elements (for cleanup)
  let activeSkeleton = null;

  /**
   * Show a skeleton loading state for a view.
   */
  function showSkeleton(view) {
    hideSkeleton(); // Clean up any existing

    const viewEl = document.getElementById('view-' + view);
    if (!viewEl) return;

    const type = viewSkeletonType[view] || 'table';
    const template = skeletonTemplates[type];
    if (!template) return;

    const skeleton = document.createElement('div');
    skeleton.className = 'module-loading-skeleton active';
    skeleton.innerHTML = template(type === 'table' ? 8 : undefined);
    skeleton.dataset.skeletonFor = view;
    viewEl.style.position = 'relative';
    viewEl.appendChild(skeleton);
    activeSkeleton = skeleton;
  }

  /**
   * Hide the active skeleton.
   */
  function hideSkeleton() {
    if (activeSkeleton) {
      activeSkeleton.remove();
      activeSkeleton = null;
    }
    // Also remove any orphaned skeletons
    document.querySelectorAll('.module-loading-skeleton').forEach(el => el.remove());
  }

  // Expose globally
  window.Skeleton = {
    show: showSkeleton,
    hide: hideSkeleton
  };
})();
