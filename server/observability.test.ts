/**
 * Vitest tests for Observability — Phase 7.2 Error Monitoring
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const MIDDLEWARE_PATH = path.join(__dirname, "middleware/observability.ts");
const ERROR_REPORTER_PATH = path.join(__dirname, "public/js/error-reporter.js");
const INDEX_TS_PATH = path.join(__dirname, "_core/index.ts");
const INDEX_HTML_PATH = path.join(__dirname, "public/index.html");

describe("Observability — Phase 7.2", () => {
  const middlewareSrc = fs.readFileSync(MIDDLEWARE_PATH, "utf-8");
  const errorReporterSrc = fs.readFileSync(ERROR_REPORTER_PATH, "utf-8");
  const indexTs = fs.readFileSync(INDEX_TS_PATH, "utf-8");
  const indexHtml = fs.readFileSync(INDEX_HTML_PATH, "utf-8");

  describe("Server-Side: Request Duration Logging", () => {
    it("exports observabilityMiddleware function", () => {
      expect(middlewareSrc).toContain("export function observabilityMiddleware");
    });

    it("uses process.hrtime.bigint() for precise timing", () => {
      expect(middlewareSrc).toContain("process.hrtime.bigint()");
    });

    it("hooks into res.on('finish') for post-response metrics", () => {
      expect(middlewareSrc).toContain('res.on("finish"');
    });

    it("logs method, path, status, and duration", () => {
      expect(middlewareSrc).toContain("method");
      expect(middlewareSrc).toContain("path");
      expect(middlewareSrc).toContain("status");
      expect(middlewareSrc).toContain("durationMs");
    });

    it("skips health checks and static assets", () => {
      expect(middlewareSrc).toContain("/api/health");
      expect(middlewareSrc).toContain("/api/site/");
      expect(middlewareSrc).toContain("/api/io/sse");
    });
  });

  describe("Server-Side: Slow Request Detection", () => {
    it("has 500ms slow request threshold", () => {
      expect(middlewareSrc).toContain("SLOW_REQUEST_THRESHOLD_MS = 500");
    });

    it("logs slow requests with SLOW prefix", () => {
      expect(middlewareSrc).toContain("[Observability] SLOW");
    });

    it("tracks slow requests in a sliding window", () => {
      expect(middlewareSrc).toContain("slowWindow");
    });

    it("alerts when slow request count exceeds threshold", () => {
      expect(middlewareSrc).toContain("SLOW_REQUEST_ALERT_THRESHOLD = 5");
      expect(middlewareSrc).toContain("sendSlowRequestAlert");
    });
  });

  describe("Server-Side: Error Rate Tracking", () => {
    it("uses 5-minute sliding window for error tracking", () => {
      expect(middlewareSrc).toContain("ERROR_RATE_WINDOW_MS = 5 * 60 * 1000");
    });

    it("alerts when error count exceeds 10 in 5 minutes", () => {
      expect(middlewareSrc).toContain("ERROR_RATE_THRESHOLD = 10");
    });

    it("has 15-minute alert cooldown to prevent notification fatigue", () => {
      expect(middlewareSrc).toContain("ALERT_COOLDOWN_MS = 15 * 60 * 1000");
    });

    it("tracks 5xx errors specifically", () => {
      expect(middlewareSrc).toContain("status >= 500");
    });

    it("logs 4xx as warnings (excluding 401 and 429)", () => {
      expect(middlewareSrc).toContain("status >= 400");
      expect(middlewareSrc).toContain("status !== 401 && status !== 429");
    });
  });

  describe("Server-Side: Alerting via notifyOwner", () => {
    it("imports notifyOwner for alert delivery", () => {
      expect(middlewareSrc).toContain('import { notifyOwner }');
    });

    it("sends error rate alert with recent error details", () => {
      expect(middlewareSrc).toContain("High Error Rate");
      expect(middlewareSrc).toContain("errors in 5 minutes");
    });

    it("sends slow request alert with timing details", () => {
      expect(middlewareSrc).toContain("Slow Requests");
      expect(middlewareSrc).toContain("requests >");
    });

    it("sends client error alert when frontend errors spike", () => {
      expect(middlewareSrc).toContain("High Client Error Rate");
      expect(middlewareSrc).toContain("CLIENT_ERROR_ALERT_THRESHOLD = 10");
    });

    it("deduplicates alerts with cooldown period", () => {
      expect(middlewareSrc).toContain("lastAlertTime");
      expect(middlewareSrc).toContain("ALERT_COOLDOWN_MS");
    });
  });

  describe("Server-Side: Metrics Endpoint", () => {
    it("exports getObservabilityMetrics function", () => {
      expect(middlewareSrc).toContain("export function getObservabilityMetrics");
    });

    it("returns percentile data (p50, p95, p99)", () => {
      expect(middlewareSrc).toContain("p50");
      expect(middlewareSrc).toContain("p95");
      expect(middlewareSrc).toContain("p99");
    });

    it("metrics endpoint is registered at /api/io/observability", () => {
      expect(indexTs).toContain("/api/io/observability");
    });

    it("client errors endpoint is registered at /api/client-errors (public)", () => {
      expect(indexTs).toContain("/api/client-errors");
    });

    it("client errors list is at /api/io/client-errors (protected)", () => {
      expect(indexTs).toContain("/api/io/client-errors");
    });
  });

  describe("Client-Side: Global Error Handler", () => {
    it("error-reporter.js exists", () => {
      expect(fs.existsSync(ERROR_REPORTER_PATH)).toBe(true);
    });

    it("captures window.onerror for uncaught exceptions", () => {
      expect(errorReporterSrc).toContain("window.onerror");
    });

    it("captures unhandled promise rejections", () => {
      expect(errorReporterSrc).toContain("unhandledrejection");
    });

    it("wraps fetch to capture 5xx API errors", () => {
      expect(errorReporterSrc).toContain("window.fetch");
      expect(errorReporterSrc).toContain("response.status >= 500");
    });

    it("uses sendBeacon for reliable delivery", () => {
      expect(errorReporterSrc).toContain("navigator.sendBeacon");
    });

    it("falls back to fetch when sendBeacon unavailable", () => {
      expect(errorReporterSrc).toContain("fetch(REPORT_ENDPOINT");
    });

    it("includes user context (actor, URL, userAgent)", () => {
      expect(errorReporterSrc).toContain("window.currentUserOhr");
      expect(errorReporterSrc).toContain("window.location.href");
      expect(errorReporterSrc).toContain("navigator.userAgent");
    });

    it("deduplicates identical errors within 1 second", () => {
      expect(errorReporterSrc).toContain("DEBOUNCE_MS = 1000");
      expect(errorReporterSrc).toContain("lastReportKey");
    });

    it("limits reports per session to prevent flooding", () => {
      expect(errorReporterSrc).toContain("MAX_REPORTS_PER_SESSION = 50");
    });

    it("truncates stack traces to 2000 chars", () => {
      expect(errorReporterSrc).toContain(".slice(0, 2000)");
    });

    it("exposes window.reportError for manual reporting", () => {
      expect(errorReporterSrc).toContain("window.reportError");
    });

    it("reports to /api/client-errors endpoint", () => {
      expect(errorReporterSrc).toContain("/api/client-errors");
    });
  });

  describe("Integration: HTML Loading Order", () => {
    it("error-reporter.js is loaded in the <head> section", () => {
      const headSection = indexHtml.split("</head>")[0];
      expect(headSection).toContain("error-reporter.js");
    });

    it("error-reporter.js loads before other application scripts", () => {
      const errorReporterPos = indexHtml.indexOf("error-reporter.js");
      const appJsPos = indexHtml.indexOf("js/app.js");
      expect(errorReporterPos).toBeLessThan(appJsPos);
    });

    it("error-reporter.js is NOT deferred (must execute immediately)", () => {
      const line = indexHtml.split("\n").find(l => l.includes("error-reporter.js"));
      expect(line).not.toContain("defer");
    });
  });

  describe("Middleware Registration", () => {
    it("observability middleware is imported in _core/index.ts", () => {
      expect(indexTs).toContain("observabilityMiddleware");
    });

    it("observability middleware is registered after rate limiting", () => {
      const rateLimitPos = indexTs.indexOf("rateLimitMiddleware");
      const obsPos = indexTs.indexOf("observabilityMiddleware");
      expect(obsPos).toBeGreaterThan(rateLimitPos);
    });

    it("observability middleware is registered before route handlers", () => {
      const obsPos = indexTs.indexOf("app.use(observabilityMiddleware)");
      const routePos = indexTs.indexOf("registerModularIORoutes(app)");
      expect(obsPos).toBeLessThan(routePos);
    });
  });
});
