/* ============================================================
   ANCHOR DASHBOARD — Animations
   Animated counters, staggered reveals, pulse on critical KPIs.
   ============================================================ */

(function () {
  'use strict';

  var isAnimating = false; // Guard against MutationObserver re-entry

  /* ---------- Animated counter ---------- */
  function animateCounter(el, targetText) {
    if (!el || !targetText) return;

    // Parse numeric values: "4.52%", "13", "1,234"
    var match = targetText.match(/^([\d,.]+)\s*(%?)$/);
    if (!match) {
      el.textContent = targetText;
      return;
    }

    var targetNum = parseFloat(match[1].replace(/,/g, ''));
    var suffix = match[2] || '';
    var isDecimal = match[1].includes('.');
    var decimals = isDecimal ? (match[1].split('.')[1] || '').length : 0;
    var duration = 900;
    var startTime = performance.now();

    // Store target so we can detect stale animations
    el.setAttribute('data-anim-target', targetText);

    function step(now) {
      // Bail if target changed mid-animation
      if (el.getAttribute('data-anim-target') !== targetText) return;

      var elapsed = now - startTime;
      var progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = targetNum * eased;

      isAnimating = true;
      if (isDecimal) {
        el.textContent = current.toFixed(decimals) + suffix;
      } else {
        el.textContent = Math.round(current).toLocaleString() + suffix;
      }
      isAnimating = false;

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        isAnimating = true;
        el.textContent = targetText; // Ensure exact final value
        isAnimating = false;
      }
    }

    isAnimating = true;
    el.textContent = isDecimal ? (0).toFixed(decimals) + suffix : '0' + suffix;
    isAnimating = false;
    requestAnimationFrame(step);
  }

  /* ---------- Re-trigger card entrance animations ---------- */
  function replayCardAnimations() {
    var dashboard = document.getElementById('view-dashboard');
    if (!dashboard) return;

    // KPI cards — staggered fade-up
    var kpiCards = dashboard.querySelectorAll('.kpi-card');
    kpiCards.forEach(function (card, i) {
      card.style.animation = 'none';
      card.offsetHeight; // Force reflow
      card.style.animationDelay = (i * 0.1) + 's';
      card.style.animation = '';
    });

    // Table section cards
    var tableCards = dashboard.querySelectorAll('.shift-combined-card, .flm-card, .asset-inventory-card, .shrink-details-card');
    tableCards.forEach(function (card, i) {
      card.style.animation = 'none';
      card.offsetHeight;
      card.style.animationDelay = (0.4 + i * 0.12) + 's';
      card.style.animation = '';
    });
  }

  /* ---------- Animate KPI values ---------- */
  function animateKPIValues() {
    var dashboard = document.getElementById('view-dashboard');
    if (!dashboard) return;

    var kpiValues = dashboard.querySelectorAll('.kpi-value');
    kpiValues.forEach(function (el) {
      var text = el.textContent.trim();
      if (text && text !== '—' && text !== '-') {
        animateCounter(el, text);
      }
    });

    // Pulse critical shrinkage (>= 5%)
    var shrinkCard = dashboard.querySelector('.kpi-shrinkage');
    if (shrinkCard && !shrinkCard.classList.contains('kpi-ok')) {
      var val = shrinkCard.querySelector('.kpi-value');
      if (val) val.classList.add('dash-pulse');
    }
  }

  /* ---------- MutationObserver (debounced, guarded) ---------- */
  var dashObserver = null;
  var animTimeout = null;

  function setupDashboardObserver() {
    var dashContent = document.getElementById('dashboard-content');
    if (!dashContent || dashObserver) return;

    dashObserver = new MutationObserver(function () {
      // Skip mutations caused by our own animation writes
      if (isAnimating) return;

      clearTimeout(animTimeout);
      animTimeout = setTimeout(function () {
        replayCardAnimations();
        animateKPIValues();
      }, 200);
    });

    dashObserver.observe(dashContent, { childList: true, subtree: false });
  }

  /* ---------- Trigger on view switch ---------- */
  var origShowView = window.showView;
  if (typeof origShowView === 'function') {
    window.showView = function (viewName) {
      origShowView.apply(this, arguments);
      if (viewName === 'dashboard') {
        setTimeout(function () {
          setupDashboardObserver();
          replayCardAnimations();
          animateKPIValues();
        }, 120);
      }
    };
  }

  /* ---------- Initial trigger ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      var dashboard = document.getElementById('view-dashboard');
      if (dashboard && dashboard.style.display !== 'none') {
        setupDashboardObserver();
        replayCardAnimations();
        animateKPIValues();
      }
    }, 600);
  });

  // Expose for manual / programmatic triggering
  window.dashboardAnimations = {
    replay: replayCardAnimations,
    animateKPIs: animateKPIValues,
    setup: setupDashboardObserver
  };

})();
