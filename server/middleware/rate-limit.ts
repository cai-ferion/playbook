/**
 * Rate Limiting Middleware — Phase 6.2 Security Hardening
 *
 * In-memory sliding window rate limiter with per-endpoint tiering.
 * Categorizes requests into tiers based on HTTP method and route pattern,
 * applying different limits to prevent abuse while preserving legitimate bulk operations.
 *
 * Architecture decisions:
 * - In-memory (no Redis dependency) — acceptable for single-instance deployment
 * - Sliding window (not fixed window) — prevents burst-at-boundary attacks
 * - Per-user keying via x-actor-ohr header or session (not IP) — BPO shared IPs would false-positive
 * - Bulk endpoints identified by route pattern matching
 * - Returns standard rate limit headers (X-RateLimit-Remaining, X-RateLimit-Reset)
 * - Graceful degradation: if user can't be identified, falls back to IP-based limiting
 */
import { Request, Response, NextFunction } from "express";

// ── Tier Configuration ──────────────────────────────────────────────────────

export interface RateLimitTier {
  /** Maximum requests allowed within the window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Human-readable tier name for logging/headers */
  name: string;
}

export const TIERS: Record<string, RateLimitTier> = {
  /** Read endpoints — generous limit for dashboard/list views */
  READ: { maxRequests: 100, windowMs: 60_000, name: "read" },
  /** Standard write endpoints — single-record create/update/delete */
  WRITE: { maxRequests: 30, windowMs: 60_000, name: "write" },
  /** Bulk operations — imports, bulk-tag, bulk-action, uploads */
  BULK: { maxRequests: 10, windowMs: 60_000, name: "bulk" },
  /** Authentication endpoints — strict to prevent brute force */
  AUTH: { maxRequests: 10, windowMs: 60_000, name: "auth" },
};

// ── Bulk Route Patterns ─────────────────────────────────────────────────────
// These routes handle multi-record operations and get the BULK tier limit.
const BULK_ROUTE_PATTERNS: RegExp[] = [
  /\/bulk-import$/,
  /\/bulk-tag$/,
  /\/bulk-tag-filtered$/,
  /\/bulk-status$/,
  /\/bulk-status-filtered$/,
  /\/bulk-action$/,
  /\/bulk-validate$/,
  /\/bulk-update$/,
  /\/bulk-delete$/,
  /\/insights-bulk-delete$/,
  /\/tardiness\/upload$/,
  /\/performance\/upload$/,
  /\/performance\/resync$/,
  /\/productivity-hours\/upload$/,
];

// Auth route patterns
const AUTH_ROUTE_PATTERNS: RegExp[] = [
  /\/api\/oauth/,
  /\/api\/trpc\/auth\./,
];

// ── Sliding Window Store ────────────────────────────────────────────────────

interface WindowEntry {
  timestamps: number[];
}

// Map key format: `${userKey}:${tierName}`
const store = new Map<string, WindowEntry>();

// Periodic cleanup to prevent memory leaks (every 5 minutes)
const CLEANUP_INTERVAL_MS = 5 * 60_000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    const maxWindow = Math.max(TIERS.READ.windowMs, TIERS.WRITE.windowMs, TIERS.BULK.windowMs);
    store.forEach((entry: WindowEntry, key: string) => {
      // Remove entries where all timestamps are expired (oldest window)
      entry.timestamps = entry.timestamps.filter((t: number) => now - t < maxWindow);
      if (entry.timestamps.length === 0) {
        store.delete(key);
      }
    });
  }, CLEANUP_INTERVAL_MS);
  // Don't block process exit
  if (cleanupTimer.unref) cleanupTimer.unref();
}

// ── Tier Classification ─────────────────────────────────────────────────────

/**
 * Determine which rate limit tier applies to a given request.
 */
export function classifyTier(method: string, path: string): RateLimitTier {
  // Auth endpoints
  for (const pattern of AUTH_ROUTE_PATTERNS) {
    if (pattern.test(path)) return TIERS.AUTH;
  }

  // GET requests = READ tier
  if (method === "GET" || method === "HEAD") {
    return TIERS.READ;
  }

  // Check if this is a bulk operation
  for (const pattern of BULK_ROUTE_PATTERNS) {
    if (pattern.test(path)) return TIERS.BULK;
  }

  // All other writes (POST, PUT, PATCH, DELETE) = WRITE tier
  return TIERS.WRITE;
}

/**
 * Extract the user key for rate limiting.
 * Prefers x-actor-ohr header (set by authenticated IO requests),
 * falls back to session user, then IP address.
 */
function getUserKey(req: Request): string {
  // IO routes set x-actor-ohr after auth
  const actorOhr = req.headers["x-actor-ohr"] as string;
  if (actorOhr) return `user:${actorOhr}`;

  // tRPC/React routes have req.user from session
  const user = (req as any).user;
  if (user?.openId) return `user:${user.openId}`;

  // Fallback to IP (less ideal for BPO shared IPs, but better than nothing)
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  return `ip:${ip}`;
}

// ── Core Rate Check ─────────────────────────────────────────────────────────

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
  tier: RateLimitTier;
}

/**
 * Check if a request is within rate limits using sliding window algorithm.
 */
export function checkRateLimit(userKey: string, tier: RateLimitTier): RateLimitResult {
  const now = Date.now();
  const storeKey = `${userKey}:${tier.name}`;

  let entry = store.get(storeKey);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(storeKey, entry);
  }

  // Slide the window: remove timestamps older than windowMs
  const windowStart = now - tier.windowMs;
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  const currentCount = entry.timestamps.length;
  const remaining = Math.max(0, tier.maxRequests - currentCount);

  // Calculate when the oldest request in the window will expire
  const resetMs = entry.timestamps.length > 0
    ? entry.timestamps[0] + tier.windowMs
    : now + tier.windowMs;

  if (currentCount >= tier.maxRequests) {
    return { allowed: false, remaining: 0, resetMs, tier };
  }

  // Record this request
  entry.timestamps.push(now);
  return { allowed: true, remaining: remaining - 1, resetMs, tier };
}

// ── Express Middleware ───────────────────────────────────────────────────────

/**
 * Rate limiting middleware.
 *
 * Applies tiered rate limits based on request method and route.
 * Returns 429 Too Many Requests when limit is exceeded.
 * Sets standard rate limit headers on all responses.
 *
 * Skipped for:
 * - Health check endpoint
 * - Static file serving (/api/site/)
 * - SSE event stream (long-lived connection)
 */
export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const path = req.originalUrl || req.path;

  // Skip rate limiting for non-API paths and special endpoints
  if (
    path === "/api/health" ||
    path.startsWith("/api/site/") ||
    path === "/api/site" ||
    path === "/api/io/events" || // SSE stream — single long-lived connection
    path === "/api/debug-paths"
  ) {
    next();
    return;
  }

  const tier = classifyTier(req.method, path);
  const userKey = getUserKey(req);
  const result = checkRateLimit(userKey, tier);

  // Set rate limit headers on all responses (even allowed ones)
  res.setHeader("X-RateLimit-Limit", tier.maxRequests.toString());
  res.setHeader("X-RateLimit-Remaining", result.remaining.toString());
  res.setHeader("X-RateLimit-Reset", Math.ceil(result.resetMs / 1000).toString());
  res.setHeader("X-RateLimit-Tier", tier.name);

  if (!result.allowed) {
    const retryAfterSeconds = Math.ceil((result.resetMs - Date.now()) / 1000);
    res.setHeader("Retry-After", retryAfterSeconds.toString());
    res.status(429).json({
      error: "Too Many Requests",
      message: `Rate limit exceeded for ${tier.name} tier. Try again in ${retryAfterSeconds}s.`,
      tier: tier.name,
      limit: tier.maxRequests,
      windowSeconds: tier.windowMs / 1000,
      retryAfter: retryAfterSeconds,
    });
    return;
  }

  next();
}

// Start the cleanup interval
startCleanup();

// ── Exports for Testing ─────────────────────────────────────────────────────

/** Reset all rate limit state — for testing only */
export function _resetRateLimitStore(): void {
  store.clear();
}

/** Get current store size — for testing/monitoring */
export function _getStoreSize(): number {
  return store.size;
}

/** Stop the cleanup timer — for testing teardown */
export function _stopCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

export { BULK_ROUTE_PATTERNS, AUTH_ROUTE_PATTERNS };
