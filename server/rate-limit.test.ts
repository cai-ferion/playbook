/**
 * Vitest tests for Rate Limiting middleware (Phase 6.2 Security Hardening)
 *
 * Tests tier classification, sliding window logic, and middleware behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import {
  classifyTier,
  checkRateLimit,
  rateLimitMiddleware,
  TIERS,
  BULK_ROUTE_PATTERNS,
  AUTH_ROUTE_PATTERNS,
  _resetRateLimitStore,
  _getStoreSize,
  _stopCleanup,
} from "./middleware/rate-limit";

// Helper to create mock req/res/next
function createMockReq(method: string, path: string, actorOhr?: string): Partial<Request> {
  return {
    method,
    originalUrl: path,
    path,
    headers: actorOhr ? { "x-actor-ohr": actorOhr } : {},
    ip: "192.168.1.1",
    socket: { remoteAddress: "192.168.1.1" } as any,
  };
}

function createMockRes(): any {
  const headers: Record<string, string> = {};
  const res: any = {
    headers,
    statusCode: 200,
    setHeader: vi.fn((key: string, value: string) => { headers[key] = value; return res; }),
    status: vi.fn((code: number) => { res.statusCode = code; return res; }),
    json: vi.fn(() => res),
    end: vi.fn(() => res),
  };
  return res;
}

describe("Rate Limiting — Phase 6.2", () => {
  beforeEach(() => {
    _resetRateLimitStore();
  });

  afterEach(() => {
    _resetRateLimitStore();
  });

  describe("classifyTier()", () => {
    it("classifies GET requests as READ tier", () => {
      expect(classifyTier("GET", "/api/io/attendance")).toBe(TIERS.READ);
      expect(classifyTier("GET", "/api/io/coaching")).toBe(TIERS.READ);
      expect(classifyTier("HEAD", "/api/io/employees")).toBe(TIERS.READ);
    });

    it("classifies standard POST/PATCH/DELETE as WRITE tier", () => {
      expect(classifyTier("POST", "/api/io/coaching")).toBe(TIERS.WRITE);
      expect(classifyTier("PATCH", "/api/io/coaching/123")).toBe(TIERS.WRITE);
      expect(classifyTier("DELETE", "/api/io/coaching/123")).toBe(TIERS.WRITE);
      expect(classifyTier("PUT", "/api/io/leaves/456")).toBe(TIERS.WRITE);
    });

    it("classifies bulk operations as BULK tier", () => {
      expect(classifyTier("POST", "/api/io/attendance/bulk-import")).toBe(TIERS.BULK);
      expect(classifyTier("POST", "/api/io/attendance/bulk-tag")).toBe(TIERS.BULK);
      expect(classifyTier("POST", "/api/io/attendance/bulk-tag-filtered")).toBe(TIERS.BULK);
      expect(classifyTier("POST", "/api/io/attendance/bulk-status")).toBe(TIERS.BULK);
      expect(classifyTier("POST", "/api/io/attendance/bulk-status-filtered")).toBe(TIERS.BULK);
      expect(classifyTier("POST", "/api/io/leaves/bulk-action")).toBe(TIERS.BULK);
      expect(classifyTier("PATCH", "/api/io/tardiness/bulk-validate")).toBe(TIERS.BULK);
      expect(classifyTier("POST", "/api/io/tardiness/upload")).toBe(TIERS.BULK);
      expect(classifyTier("POST", "/api/io/performance/upload")).toBe(TIERS.BULK);
      expect(classifyTier("POST", "/api/io/performance/resync")).toBe(TIERS.BULK);
      expect(classifyTier("POST", "/api/io/productivity-hours/upload")).toBe(TIERS.BULK);
      expect(classifyTier("POST", "/api/io/insights-bulk-delete")).toBe(TIERS.BULK);
    });

    it("classifies auth endpoints as AUTH tier", () => {
      expect(classifyTier("POST", "/api/oauth/callback")).toBe(TIERS.AUTH);
      expect(classifyTier("GET", "/api/oauth/callback")).toBe(TIERS.AUTH);
      expect(classifyTier("POST", "/api/trpc/auth.login")).toBe(TIERS.AUTH);
      expect(classifyTier("POST", "/api/trpc/auth.logout")).toBe(TIERS.AUTH);
    });

    it("does not misclassify non-bulk POST as BULK", () => {
      expect(classifyTier("POST", "/api/io/coaching")).toBe(TIERS.WRITE);
      expect(classifyTier("POST", "/api/io/leaves")).toBe(TIERS.WRITE);
      expect(classifyTier("POST", "/api/io/shift-extensions")).toBe(TIERS.WRITE);
    });
  });

  describe("checkRateLimit() — sliding window", () => {
    it("allows requests within the limit", () => {
      const result = checkRateLimit("user:test123", TIERS.WRITE);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(29); // 30 max - 1 recorded = 29 remaining
    });

    it("tracks remaining count correctly", () => {
      for (let i = 0; i < 5; i++) {
        checkRateLimit("user:counter-test", TIERS.WRITE);
      }
      const result = checkRateLimit("user:counter-test", TIERS.WRITE);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(24); // 30 - 6 = 24
    });

    it("blocks requests exceeding the limit", () => {
      // Fill up the BULK tier (10 requests)
      for (let i = 0; i < 10; i++) {
        const r = checkRateLimit("user:bulk-test", TIERS.BULK);
        expect(r.allowed).toBe(true);
      }
      // 11th request should be blocked
      const blocked = checkRateLimit("user:bulk-test", TIERS.BULK);
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
    });

    it("isolates users from each other", () => {
      // Fill up user A
      for (let i = 0; i < 10; i++) {
        checkRateLimit("user:A", TIERS.BULK);
      }
      // User B should still be allowed
      const resultB = checkRateLimit("user:B", TIERS.BULK);
      expect(resultB.allowed).toBe(true);
    });

    it("isolates tiers from each other", () => {
      // Fill up BULK tier for user
      for (let i = 0; i < 10; i++) {
        checkRateLimit("user:multi-tier", TIERS.BULK);
      }
      // WRITE tier should still be available
      const writeResult = checkRateLimit("user:multi-tier", TIERS.WRITE);
      expect(writeResult.allowed).toBe(true);
    });

    it("returns correct resetMs timestamp", () => {
      const before = Date.now();
      const result = checkRateLimit("user:reset-test", TIERS.READ);
      const after = Date.now();

      // resetMs should be approximately now + windowMs
      expect(result.resetMs).toBeGreaterThanOrEqual(before + TIERS.READ.windowMs);
      expect(result.resetMs).toBeLessThanOrEqual(after + TIERS.READ.windowMs);
    });
  });

  describe("rateLimitMiddleware — Express integration", () => {
    it("allows normal requests and sets headers", () => {
      const req = createMockReq("GET", "/api/io/attendance", "740045023");
      const res = createMockRes();
      const next = vi.fn();

      rateLimitMiddleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", "600");
      expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Tier", "read");
    });

    it("returns 429 when limit is exceeded", () => {
      const actorOhr = "user-429-test";
      // Fill up BULK tier
      for (let i = 0; i < 10; i++) {
        const req = createMockReq("POST", "/api/io/attendance/bulk-import", actorOhr);
        const res = createMockRes();
        const next = vi.fn();
        rateLimitMiddleware(req as Request, res as Response, next);
        expect(next).toHaveBeenCalled();
      }

      // 11th request should be blocked
      const req = createMockReq("POST", "/api/io/attendance/bulk-import", actorOhr);
      const res = createMockRes();
      const next = vi.fn();
      rateLimitMiddleware(req as Request, res as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: "Too Many Requests",
        tier: "bulk",
      }));
    });

    it("includes Retry-After header on 429", () => {
      const actorOhr = "retry-after-test";
      for (let i = 0; i < 10; i++) {
        const req = createMockReq("POST", "/api/io/attendance/bulk-tag", actorOhr);
        const res = createMockRes();
        rateLimitMiddleware(req as Request, res as Response, vi.fn());
      }

      const req = createMockReq("POST", "/api/io/attendance/bulk-tag", actorOhr);
      const res = createMockRes();
      rateLimitMiddleware(req as Request, res as Response, vi.fn());

      expect(res.setHeader).toHaveBeenCalledWith("Retry-After", expect.any(String));
    });

    it("skips rate limiting for health check", () => {
      const req = createMockReq("GET", "/api/health");
      const res = createMockRes();
      const next = vi.fn();

      rateLimitMiddleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.setHeader).not.toHaveBeenCalled();
    });

    it("skips rate limiting for static site files", () => {
      const req = createMockReq("GET", "/api/site/js/app.js");
      const res = createMockRes();
      const next = vi.fn();

      rateLimitMiddleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.setHeader).not.toHaveBeenCalled();
    });

    it("skips rate limiting for SSE event stream", () => {
      const req = createMockReq("GET", "/api/io/events");
      const res = createMockRes();
      const next = vi.fn();

      rateLimitMiddleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.setHeader).not.toHaveBeenCalled();
    });

    it("skips rate limiting for lookup endpoints", () => {
      const lookupPaths = [
        "/api/io/lookup/planning-groups",
        "/api/io/lookup/team-leads",
        "/api/io/lookup/barangays?q=manila",
        "/api/io/employees/slim",
      ];
      for (const path of lookupPaths) {
        const req = createMockReq("GET", path);
        const res = createMockRes();
        const next = vi.fn();
        rateLimitMiddleware(req as Request, res as Response, next);
        expect(next).toHaveBeenCalled();
        expect(res.setHeader).not.toHaveBeenCalled();
      }
    });

    it("falls back to IP-based key when no actor OHR", () => {
      // Use a non-auth GET path to test IP fallback
      const req = createMockReq("GET", "/api/io/attendance");
      const res = createMockRes();
      const next = vi.fn();

      rateLimitMiddleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      // Should still work — just uses IP key
      expect(res.headers["X-RateLimit-Tier"]).toBe("read");
    });
  });

  describe("_resetRateLimitStore()", () => {
    it("clears all stored rate limit data", () => {
      checkRateLimit("user:reset-1", TIERS.READ);
      checkRateLimit("user:reset-2", TIERS.WRITE);
      expect(_getStoreSize()).toBeGreaterThan(0);

      _resetRateLimitStore();
      expect(_getStoreSize()).toBe(0);
    });
  });

  describe("BULK_ROUTE_PATTERNS coverage", () => {
    it("matches all known bulk endpoints", () => {
      const bulkPaths = [
        "/api/io/attendance/bulk-import",
        "/api/io/attendance/bulk-tag",
        "/api/io/attendance/bulk-tag-filtered",
        "/api/io/attendance/bulk-status",
        "/api/io/attendance/bulk-status-filtered",
        "/api/io/attendance/bulk-update",
        "/api/io/leaves/bulk-action",
        "/api/io/tardiness/bulk-validate",
        "/api/io/tardiness/upload",
        "/api/io/performance/upload",
        "/api/io/performance/resync",
        "/api/io/productivity-hours/upload",
        "/api/io/insights-bulk-delete",
      ];

      for (const path of bulkPaths) {
        const matched = BULK_ROUTE_PATTERNS.some((p) => p.test(path));
        expect(matched, `Expected ${path} to match BULK pattern`).toBe(true);
      }
    });

    it("does not match non-bulk paths", () => {
      const nonBulkPaths = [
        "/api/io/coaching",
        "/api/io/attendance",
        "/api/io/leaves",
        "/api/io/shift-extensions",
      ];

      for (const path of nonBulkPaths) {
        const matched = BULK_ROUTE_PATTERNS.some((p) => p.test(path));
        expect(matched, `Expected ${path} to NOT match BULK pattern`).toBe(false);
      }
    });
  });

  describe("Tier limits are correctly configured", () => {
    it("READ tier: 600 req/min", () => {
      expect(TIERS.READ.maxRequests).toBe(600);
      expect(TIERS.READ.windowMs).toBe(60_000);
    });

    it("WRITE tier: 30 req/min", () => {
      expect(TIERS.WRITE.maxRequests).toBe(30);
      expect(TIERS.WRITE.windowMs).toBe(60_000);
    });

    it("BULK tier: 10 req/min", () => {
      expect(TIERS.BULK.maxRequests).toBe(10);
      expect(TIERS.BULK.windowMs).toBe(60_000);
    });

    it("AUTH tier: 10 req/min", () => {
      expect(TIERS.AUTH.maxRequests).toBe(10);
      expect(TIERS.AUTH.windowMs).toBe(60_000);
    });
  });
});
