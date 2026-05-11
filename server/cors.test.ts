/**
 * Vitest tests for CORS middleware (Phase 6.1 Security Hardening)
 *
 * Tests the strict origin allowlist, preflight handling, and fail-closed behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import { corsMiddleware, isOriginAllowed, STATIC_ALLOWED_ORIGINS, DEV_ORIGINS, MANUS_SANDBOX_PATTERN } from "./middleware/cors";

// Helper to create mock req/res/next
function createMockReq(origin?: string, method: string = "GET"): Partial<Request> {
  return {
    headers: origin ? { origin } : {},
    method,
  };
}

function createMockRes(): Partial<Response> & { headers: Record<string, string>; statusCode: number } {
  const headers: Record<string, string> = {};
  const res: any = {
    headers,
    statusCode: 200,
    setHeader: vi.fn((key: string, value: string) => { headers[key] = value; return res; }),
    status: vi.fn((code: number) => { res.statusCode = code; return res; }),
    end: vi.fn(() => res),
    json: vi.fn(() => res),
  };
  return res;
}

describe("CORS Middleware — Phase 6.1", () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe("isOriginAllowed()", () => {
    it("allows static deployment domains", () => {
      expect(isOriginAllowed("https://playbook-5avfpygn.manus.space")).toBe(true);
      expect(isOriginAllowed("https://play-book.manus.space")).toBe(true);
    });

    it("allows localhost in development", () => {
      process.env.NODE_ENV = "development";
      expect(isOriginAllowed("http://localhost:3000")).toBe(true);
      expect(isOriginAllowed("http://localhost:5173")).toBe(true);
      expect(isOriginAllowed("http://127.0.0.1:3000")).toBe(true);
    });

    it("rejects unknown origins", () => {
      expect(isOriginAllowed("https://evil.com")).toBe(false);
      expect(isOriginAllowed("https://playbook-fake.manus.space")).toBe(false);
      expect(isOriginAllowed("http://localhost:9999")).toBe(false);
    });

    it("allows Manus sandbox preview URLs in non-production", () => {
      process.env.NODE_ENV = "development";
      expect(isOriginAllowed("https://3000-abc123def-046fdbbc.sg1.manus.computer")).toBe(true);
    });

    it("rejects Manus sandbox preview URLs in production", () => {
      process.env.NODE_ENV = "production";
      expect(isOriginAllowed("https://3000-abc123def-046fdbbc.sg1.manus.computer")).toBe(false);
    });

    it("rejects origins that look similar but aren't exact matches", () => {
      expect(isOriginAllowed("https://playbook-5avfpygn.manus.space.evil.com")).toBe(false);
      expect(isOriginAllowed("https://sub.playbook-5avfpygn.manus.space")).toBe(false);
    });
  });

  describe("corsMiddleware — same-origin requests (no Origin header)", () => {
    it("passes through without setting CORS headers", () => {
      const req = createMockReq(undefined, "GET");
      const res = createMockRes();
      const next = vi.fn();

      corsMiddleware(req as Request, res as unknown as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.setHeader).not.toHaveBeenCalled();
    });
  });

  describe("corsMiddleware — allowed origins", () => {
    it("sets ACAO header for allowed origin", () => {
      const req = createMockReq("https://play-book.manus.space", "GET");
      const res = createMockRes();
      const next = vi.fn();

      corsMiddleware(req as Request, res as unknown as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.setHeader).toHaveBeenCalledWith("Access-Control-Allow-Origin", "https://play-book.manus.space");
      expect(res.setHeader).toHaveBeenCalledWith("Access-Control-Allow-Credentials", "true");
    });

    it("sets all required headers for allowed origin", () => {
      const req = createMockReq("https://playbook-5avfpygn.manus.space", "POST");
      const res = createMockRes();
      const next = vi.fn();

      corsMiddleware(req as Request, res as unknown as Response, next);

      expect(res.headers["Access-Control-Allow-Origin"]).toBe("https://playbook-5avfpygn.manus.space");
      expect(res.headers["Access-Control-Allow-Credentials"]).toBe("true");
      expect(res.headers["Access-Control-Allow-Methods"]).toContain("POST");
      expect(res.headers["Access-Control-Allow-Methods"]).toContain("PATCH");
      expect(res.headers["Access-Control-Allow-Headers"]).toContain("x-actor-ohr");
      expect(res.headers["Access-Control-Max-Age"]).toBe("3600");
    });
  });

  describe("corsMiddleware — disallowed origins", () => {
    it("does NOT set ACAO header for disallowed origin", () => {
      const req = createMockReq("https://evil.com", "GET");
      const res = createMockRes();
      const next = vi.fn();

      corsMiddleware(req as Request, res as unknown as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.headers["Access-Control-Allow-Origin"]).toBeUndefined();
    });

    it("still calls next() for non-OPTIONS requests from disallowed origins", () => {
      const req = createMockReq("https://attacker.io", "POST");
      const res = createMockRes();
      const next = vi.fn();

      corsMiddleware(req as Request, res as unknown as Response, next);

      // next() is called — the request proceeds, but without ACAO the browser blocks the response
      expect(next).toHaveBeenCalled();
    });
  });

  describe("corsMiddleware — preflight (OPTIONS)", () => {
    it("returns 204 for allowed origin preflight", () => {
      const req = createMockReq("https://play-book.manus.space", "OPTIONS");
      const res = createMockRes();
      const next = vi.fn();

      corsMiddleware(req as Request, res as unknown as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.end).toHaveBeenCalled();
      expect(res.headers["Access-Control-Allow-Origin"]).toBe("https://play-book.manus.space");
    });

    it("returns 403 for disallowed origin preflight", () => {
      const req = createMockReq("https://evil.com", "OPTIONS");
      const res = createMockRes();
      const next = vi.fn();

      corsMiddleware(req as Request, res as unknown as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Origin not allowed" });
    });

    it("includes Max-Age header for preflight caching", () => {
      const req = createMockReq("https://playbook-5avfpygn.manus.space", "OPTIONS");
      const res = createMockRes();
      const next = vi.fn();

      corsMiddleware(req as Request, res as unknown as Response, next);

      expect(res.headers["Access-Control-Max-Age"]).toBe("3600");
    });
  });

  describe("corsMiddleware — Expose-Headers", () => {
    it("exposes rate limit headers for allowed origins", () => {
      const req = createMockReq("https://play-book.manus.space", "GET");
      const res = createMockRes();
      const next = vi.fn();

      corsMiddleware(req as Request, res as unknown as Response, next);

      expect(res.headers["Access-Control-Expose-Headers"]).toContain("X-RateLimit-Remaining");
      expect(res.headers["Access-Control-Expose-Headers"]).toContain("X-RateLimit-Reset");
    });
  });

  describe("MANUS_SANDBOX_PATTERN regex", () => {
    it("matches valid sandbox URLs", () => {
      expect(MANUS_SANDBOX_PATTERN.test("https://3000-i3yv3ir2qyb3u11s6y1kc-7b337990.sg1.manus.computer")).toBe(true);
      expect(MANUS_SANDBOX_PATTERN.test("https://5173-abc123-def456.sg1.manus.computer")).toBe(true);
    });

    it("rejects invalid sandbox URLs", () => {
      expect(MANUS_SANDBOX_PATTERN.test("https://evil.sg1.manus.computer")).toBe(false);
      expect(MANUS_SANDBOX_PATTERN.test("http://3000-abc-def.sg1.manus.computer")).toBe(false); // http not https
      expect(MANUS_SANDBOX_PATTERN.test("https://3000-abc-def.sg2.manus.computer")).toBe(false); // sg2 not sg1
    });
  });

  describe("STATIC_ALLOWED_ORIGINS constant", () => {
    it("contains the known deployment domains", () => {
      expect(STATIC_ALLOWED_ORIGINS).toContain("https://playbook-5avfpygn.manus.space");
      expect(STATIC_ALLOWED_ORIGINS).toContain("https://play-book.manus.space");
    });
  });
});
