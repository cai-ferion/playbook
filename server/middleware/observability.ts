/**
 * Observability Middleware — Phase 7.2 Error Monitoring & Observability
 *
 * Three responsibilities:
 * 1. Request Duration Logging — logs every API request with method, path, status, duration
 * 2. Slow Request Detection — flags requests exceeding threshold (default 500ms)
 * 3. Error Rate Tracking — sliding window counter for 5xx errors, triggers alert when threshold exceeded
 *
 * Architecture decisions:
 * - In-memory sliding window (not external store) — acceptable for single-instance BPO tool
 * - Structured JSON logs for future log aggregation compatibility
 * - Separate from rate-limiter to maintain single-responsibility
 * - Alert deduplication: max 1 alert per 15 minutes to avoid notification fatigue
 */
import type { Request, Response, NextFunction } from "express";
import { notifyOwner } from "../_core/notification.js";

// ── Configuration ──
const SLOW_REQUEST_THRESHOLD_MS = 500;
const ERROR_RATE_WINDOW_MS = 5 * 60 * 1000; // 5-minute sliding window
const ERROR_RATE_THRESHOLD = 10; // Alert if >10 errors in 5 minutes
const ALERT_COOLDOWN_MS = 15 * 60 * 1000; // Max 1 alert per 15 minutes
const SLOW_REQUEST_ALERT_THRESHOLD = 5; // Alert if >5 slow requests in window

// ── Metrics State ──
interface RequestMetric {
  timestamp: number;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  actor?: string;
}

interface ErrorEntry {
  timestamp: number;
  method: string;
  path: string;
  status: number;
  error?: string;
}

interface SlowEntry {
  timestamp: number;
  method: string;
  path: string;
  durationMs: number;
}

// Sliding window buffers
const errorWindow: ErrorEntry[] = [];
const slowWindow: SlowEntry[] = [];
let lastAlertTime = 0;
let lastSlowAlertTime = 0;

// Aggregate metrics for the /api/io/observability endpoint
let totalRequests = 0;
let totalErrors = 0;
let totalSlowRequests = 0;
const durationBuckets = { p50: 0, p95: 0, p99: 0 };
const recentDurations: number[] = []; // Last 1000 request durations for percentile calc
const MAX_DURATION_BUFFER = 1000;

// ── Helpers ──

function pruneWindow<T extends { timestamp: number }>(window: T[], maxAgeMs: number): void {
  const cutoff = Date.now() - maxAgeMs;
  while (window.length > 0 && window[0].timestamp < cutoff) {
    window.shift();
  }
}

function calculatePercentiles(): void {
  if (recentDurations.length === 0) return;
  const sorted = [...recentDurations].sort((a, b) => a - b);
  const len = sorted.length;
  durationBuckets.p50 = sorted[Math.floor(len * 0.5)] || 0;
  durationBuckets.p95 = sorted[Math.floor(len * 0.95)] || 0;
  durationBuckets.p99 = sorted[Math.floor(len * 0.99)] || 0;
}

function shouldSkip(path: string): boolean {
  // Skip health checks, static assets, and SSE streams from metrics
  return (
    path === "/api/health" ||
    path.startsWith("/api/site/") ||
    path === "/api/site" ||
    path.startsWith("/api/io/sse") ||
    path.startsWith("/assets/") ||
    path.endsWith(".js") ||
    path.endsWith(".css") ||
    path.endsWith(".png") ||
    path.endsWith(".ico")
  );
}

async function sendErrorRateAlert(errorCount: number, window: ErrorEntry[]): Promise<void> {
  const now = Date.now();
  if (now - lastAlertTime < ALERT_COOLDOWN_MS) return; // Deduplicate
  lastAlertTime = now;

  const topErrors = window.slice(-5).map(e =>
    `  ${e.method} ${e.path} → ${e.status}`
  ).join("\n");

  try {
    await notifyOwner({
      title: `⚠️ High Error Rate: ${errorCount} errors in 5 minutes`,
      content: `Playbook is experiencing elevated error rates.\n\nError count: ${errorCount} (threshold: ${ERROR_RATE_THRESHOLD})\nWindow: last 5 minutes\n\nRecent errors:\n${topErrors}\n\nCheck server logs for details.`,
    });
    console.log(`[Observability] Error rate alert sent (${errorCount} errors)`);
  } catch (err) {
    console.error("[Observability] Failed to send error rate alert:", err);
  }
}

async function sendSlowRequestAlert(slowCount: number, window: SlowEntry[]): Promise<void> {
  const now = Date.now();
  if (now - lastSlowAlertTime < ALERT_COOLDOWN_MS) return;
  lastSlowAlertTime = now;

  const topSlow = window.slice(-5).map(e =>
    `  ${e.method} ${e.path} → ${e.durationMs}ms`
  ).join("\n");

  try {
    await notifyOwner({
      title: `🐢 Slow Requests: ${slowCount} requests > ${SLOW_REQUEST_THRESHOLD_MS}ms in 5 minutes`,
      content: `Playbook is experiencing degraded response times.\n\nSlow requests: ${slowCount} (threshold: ${SLOW_REQUEST_ALERT_THRESHOLD})\nWindow: last 5 minutes\n\nSlowest recent requests:\n${topSlow}\n\nInvestigate database queries or external API calls.`,
    });
    console.log(`[Observability] Slow request alert sent (${slowCount} slow)`);
  } catch (err) {
    console.error("[Observability] Failed to send slow request alert:", err);
  }
}

// ── Middleware ──

export function observabilityMiddleware(req: Request, res: Response, next: NextFunction): void {
  const path = req.path;

  // Skip non-API paths
  if (shouldSkip(path)) {
    next();
    return;
  }

  const startTime = Date.now();
  const startHrTime = process.hrtime.bigint();

  // Hook into response finish event
  res.on("finish", () => {
    const durationNs = Number(process.hrtime.bigint() - startHrTime);
    const durationMs = Math.round(durationNs / 1_000_000);
    const status = res.statusCode;
    const method = req.method;
    const actor = (req.headers["x-actor-ohr"] as string) || "unknown";

    totalRequests++;

    // Track duration for percentile calculation
    recentDurations.push(durationMs);
    if (recentDurations.length > MAX_DURATION_BUFFER) {
      recentDurations.shift();
    }

    // Structured log for every API request
    const logEntry: RequestMetric = {
      timestamp: startTime,
      method,
      path,
      status,
      durationMs,
      actor,
    };

    // Slow request detection
    if (durationMs > SLOW_REQUEST_THRESHOLD_MS) {
      totalSlowRequests++;
      console.warn(
        `[Observability] SLOW ${method} ${path} → ${status} (${durationMs}ms) actor=${actor}`
      );
      slowWindow.push({ timestamp: Date.now(), method, path, durationMs });
      pruneWindow(slowWindow, ERROR_RATE_WINDOW_MS);

      if (slowWindow.length > SLOW_REQUEST_ALERT_THRESHOLD) {
        sendSlowRequestAlert(slowWindow.length, slowWindow);
      }
    }

    // Error tracking (5xx)
    if (status >= 500) {
      totalErrors++;
      console.error(
        `[Observability] ERROR ${method} ${path} → ${status} (${durationMs}ms) actor=${actor}`
      );
      errorWindow.push({ timestamp: Date.now(), method, path, status });
      pruneWindow(errorWindow, ERROR_RATE_WINDOW_MS);

      if (errorWindow.length > ERROR_RATE_THRESHOLD) {
        sendErrorRateAlert(errorWindow.length, errorWindow);
      }
    } else if (status >= 400) {
      // Log 4xx as warnings (not errors) — useful for debugging
      if (status !== 401 && status !== 429) {
        // Skip 401 (expected for unauthenticated) and 429 (rate limited)
        console.log(
          `[Observability] WARN ${method} ${path} → ${status} (${durationMs}ms) actor=${actor}`
        );
      }
    }
  });

  next();
}

// ── Metrics Endpoint ──

export interface ObservabilityMetrics {
  uptime: number;
  totalRequests: number;
  totalErrors: number;
  totalSlowRequests: number;
  errorRate5min: number;
  slowRate5min: number;
  percentiles: { p50: number; p95: number; p99: number };
  thresholds: {
    slowRequestMs: number;
    errorRateLimit: number;
    slowRateLimit: number;
    alertCooldownMs: number;
  };
}

const serverStartTime = Date.now();

export function getObservabilityMetrics(): ObservabilityMetrics {
  pruneWindow(errorWindow, ERROR_RATE_WINDOW_MS);
  pruneWindow(slowWindow, ERROR_RATE_WINDOW_MS);
  calculatePercentiles();

  return {
    uptime: Date.now() - serverStartTime,
    totalRequests,
    totalErrors,
    totalSlowRequests,
    errorRate5min: errorWindow.length,
    slowRate5min: slowWindow.length,
    percentiles: { ...durationBuckets },
    thresholds: {
      slowRequestMs: SLOW_REQUEST_THRESHOLD_MS,
      errorRateLimit: ERROR_RATE_THRESHOLD,
      slowRateLimit: SLOW_REQUEST_ALERT_THRESHOLD,
      alertCooldownMs: ALERT_COOLDOWN_MS,
    },
  };
}

// ── Client Error Reporting ──

export interface ClientErrorReport {
  message: string;
  source?: string;
  lineno?: number;
  colno?: number;
  stack?: string;
  userAgent?: string;
  url?: string;
  actor?: string;
  timestamp?: number;
}

const clientErrors: ClientErrorReport[] = [];
const MAX_CLIENT_ERRORS = 100;
let clientErrorAlertTime = 0;
const CLIENT_ERROR_ALERT_THRESHOLD = 10; // Alert if >10 client errors in 5 min
const clientErrorWindow: { timestamp: number }[] = [];

export function recordClientError(report: ClientErrorReport): void {
  clientErrors.push(report);
  if (clientErrors.length > MAX_CLIENT_ERRORS) {
    clientErrors.shift();
  }

  // Track for alerting
  clientErrorWindow.push({ timestamp: Date.now() });
  pruneWindow(clientErrorWindow, ERROR_RATE_WINDOW_MS);

  console.error(
    `[Observability] CLIENT ERROR: ${report.message} at ${report.source || "unknown"}:${report.lineno || 0} actor=${report.actor || "unknown"}`
  );

  // Alert on high client error rate
  if (clientErrorWindow.length > CLIENT_ERROR_ALERT_THRESHOLD) {
    const now = Date.now();
    if (now - clientErrorAlertTime > ALERT_COOLDOWN_MS) {
      clientErrorAlertTime = now;
      notifyOwner({
        title: `🖥️ High Client Error Rate: ${clientErrorWindow.length} errors in 5 minutes`,
        content: `Playbook frontend is experiencing elevated error rates.\n\nClient errors: ${clientErrorWindow.length}\n\nLatest error: ${report.message}\nSource: ${report.source || "unknown"}:${report.lineno || 0}\nActor: ${report.actor || "unknown"}\n\nCheck browser console logs for details.`,
      }).catch(() => {});
    }
  }
}

export function getClientErrors(): ClientErrorReport[] {
  return [...clientErrors];
}
