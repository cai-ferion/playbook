/**
 * Error Reporter — Phase 7.2 Client-Side Error Monitoring
 *
 * Captures unhandled exceptions and promise rejections, then reports them
 * to the server-side observability endpoint for aggregation and alerting.
 *
 * Must be loaded FIRST (before any other scripts) to catch early errors.
 * Uses beacon API for reliable delivery even during page unload.
 */
(function() {
  'use strict';

  var REPORT_ENDPOINT = '/api/client-errors';
  var MAX_REPORTS_PER_SESSION = 50; // Prevent infinite error loops from flooding
  var DEBOUNCE_MS = 1000; // Deduplicate identical errors within 1 second
  var reportCount = 0;
  var lastReportKey = '';
  var lastReportTime = 0;

  /**
   * Send error report to server.
   * Uses sendBeacon for reliability, falls back to fetch.
   */
  function sendReport(report) {
    if (reportCount >= MAX_REPORTS_PER_SESSION) return;

    // Deduplicate: same error within 1 second
    var key = report.message + ':' + (report.source || '') + ':' + (report.lineno || 0);
    var now = Date.now();
    if (key === lastReportKey && (now - lastReportTime) < DEBOUNCE_MS) return;
    lastReportKey = key;
    lastReportTime = now;
    reportCount++;

    // Enrich with context
    report.url = window.location.href;
    report.userAgent = navigator.userAgent;
    report.actor = window.currentUserOhr || 'anonymous';
    report.timestamp = now;

    var payload = JSON.stringify(report);

    // Prefer sendBeacon (works during page unload)
    if (navigator.sendBeacon) {
      var blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon(REPORT_ENDPOINT, blob);
    } else {
      // Fallback to fetch (fire-and-forget)
      fetch(REPORT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      }).catch(function() {}); // Swallow network errors
    }
  }

  /**
   * Global error handler — catches uncaught exceptions.
   */
  window.onerror = function(message, source, lineno, colno, error) {
    sendReport({
      message: String(message),
      source: source || '',
      lineno: lineno || 0,
      colno: colno || 0,
      stack: (error && error.stack) ? error.stack.slice(0, 2000) : ''
    });
    // Don't suppress the error — let it appear in console
    return false;
  };

  /**
   * Unhandled promise rejection handler.
   */
  window.addEventListener('unhandledrejection', function(event) {
    var reason = event.reason;
    var message = 'Unhandled Promise Rejection';
    var stack = '';

    if (reason instanceof Error) {
      message = reason.message || message;
      stack = (reason.stack || '').slice(0, 2000);
    } else if (typeof reason === 'string') {
      message = reason;
    } else if (reason && typeof reason === 'object') {
      message = reason.message || JSON.stringify(reason).slice(0, 500);
    }

    sendReport({
      message: '[Promise] ' + message,
      source: 'unhandledrejection',
      lineno: 0,
      colno: 0,
      stack: stack
    });
  });

  /**
   * Capture fetch/XHR failures for API calls.
   * Only reports 5xx responses to avoid noise from expected 4xx.
   */
  var originalFetch = window.fetch;
  window.fetch = function() {
    var args = arguments;
    var url = (typeof args[0] === 'string') ? args[0] : (args[0] && args[0].url) || '';

    return originalFetch.apply(this, args).then(function(response) {
      // Only report 5xx errors on API calls
      if (response.status >= 500 && url.startsWith('/api/')) {
        sendReport({
          message: 'API Error: ' + response.status + ' ' + response.statusText + ' on ' + url,
          source: 'fetch',
          lineno: 0,
          colno: 0,
          stack: ''
        });
      }
      return response;
    }).catch(function(err) {
      // Network errors on API calls
      if (url.startsWith('/api/')) {
        sendReport({
          message: 'Network Error: ' + (err.message || 'Unknown') + ' on ' + url,
          source: 'fetch',
          lineno: 0,
          colno: 0,
          stack: (err.stack || '').slice(0, 2000)
        });
      }
      throw err; // Re-throw so caller's .catch() still works
    });
  };

  // Expose for manual error reporting from other scripts
  window.reportError = function(message, context) {
    sendReport({
      message: String(message),
      source: context || 'manual',
      lineno: 0,
      colno: 0,
      stack: ''
    });
  };

  console.log('[ErrorReporter] Global error monitoring active');
})();
