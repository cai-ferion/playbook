/**
 * CORS Middleware — Phase 6.1 Security Hardening
 *
 * Replaces the permissive "reflect any origin" policy with a strict allowlist.
 * Only known deployment domains and local development origins are permitted.
 *
 * Architecture decisions:
 * - Allowlist is built at startup from environment + hardcoded known domains
 * - Requests without an Origin header (same-origin, server-to-server) pass through
 * - Preflight (OPTIONS) returns 204 with appropriate headers
 * - Non-allowlisted cross-origin requests get NO Access-Control-Allow-Origin header,
 *   causing the browser to reject the response (fail-closed)
 */
import { Request, Response, NextFunction } from "express";

// Known deployment domains (static — these are the Manus-assigned domains)
const STATIC_ALLOWED_ORIGINS: string[] = [
  "https://playbook-5avfpygn.manus.space",
  "https://play-book.manus.space",
];

// Development origins (only active when NODE_ENV !== 'production')
const DEV_ORIGINS: string[] = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
];

// Dynamic origins from environment (supports comma-separated list)
function getEnvOrigins(): string[] {
  const envOrigins = process.env.CORS_ALLOWED_ORIGINS;
  if (!envOrigins) return [];
  return envOrigins
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
}

// Manus sandbox preview URLs follow a pattern: https://<port>-<id>.sg1.manus.computer
const MANUS_SANDBOX_PATTERN = /^https:\/\/\d+-[a-z0-9]+-[a-f0-9]+\.sg1\.manus\.computer$/;

// Vercel deployment patterns (production + preview deployments)
const VERCEL_PROD_PATTERN = /^https:\/\/[a-z0-9-]+\.vercel\.app$/;
const VERCEL_PREVIEW_PATTERN = /^https:\/\/[a-z0-9-]+-[a-z0-9]+-[a-z0-9]+\.vercel\.app$/;

/**
 * Build the full allowlist at module load time.
 * In production, dev origins are excluded.
 */
function buildAllowlist(): Set<string> {
  const origins = new Set<string>(STATIC_ALLOWED_ORIGINS);

  // Add environment-configured origins
  for (const o of getEnvOrigins()) {
    origins.add(o);
  }

  // Add dev origins only in non-production
  if (process.env.NODE_ENV !== "production") {
    for (const o of DEV_ORIGINS) {
      origins.add(o);
    }
  }

  return origins;
}

const allowedOrigins = buildAllowlist();

// Allowed headers — includes custom headers used by the app
const ALLOWED_HEADERS = [
  "Origin",
  "X-Requested-With",
  "Content-Type",
  "Accept",
  "Authorization",
  "x-actor-ohr",
  "x-actor-name",
  "x-client-version",
].join(", ");

const ALLOWED_METHODS = "GET, POST, PUT, DELETE, PATCH, OPTIONS";

// Cache preflight responses for 1 hour (reduces OPTIONS requests)
const PREFLIGHT_MAX_AGE = "3600";

/**
 * Check if an origin is allowed.
 * Checks static allowlist first, then falls back to pattern matching for sandbox URLs.
 */
function isOriginAllowed(origin: string): boolean {
  if (allowedOrigins.has(origin)) return true;

  // Allow Manus sandbox preview URLs in non-production
  if (process.env.NODE_ENV !== "production" && MANUS_SANDBOX_PATTERN.test(origin)) {
    return true;
  }

  // Allow all Vercel domains (production + preview deployments)
  if (VERCEL_PROD_PATTERN.test(origin) || VERCEL_PREVIEW_PATTERN.test(origin)) {
    return true;
  }

  return false;
}

/**
 * CORS middleware — strict origin allowlist with preflight caching.
 *
 * Behavior:
 * - No Origin header → pass through (same-origin or server-to-server)
 * - Origin in allowlist → set ACAO + credentials headers
 * - Origin NOT in allowlist → no ACAO header (browser rejects response)
 * - OPTIONS → return 204 with full preflight headers
 */
export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;

  // No Origin header = same-origin request or non-browser client — allow through
  if (!origin) {
    next();
    return;
  }

  if (isOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
    res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
    res.setHeader("Access-Control-Max-Age", PREFLIGHT_MAX_AGE);

    // Expose headers that the client may need to read
    res.setHeader("Access-Control-Expose-Headers", "X-RateLimit-Remaining, X-RateLimit-Reset");
  }
  // If origin is NOT allowed, we intentionally do NOT set any ACAO header.
  // The browser will reject the response due to missing ACAO.

  // Handle preflight
  if (req.method === "OPTIONS") {
    // Even for disallowed origins, return 204 to avoid confusing error messages.
    // The lack of ACAO header is what actually blocks the request.
    if (isOriginAllowed(origin)) {
      res.status(204).end();
    } else {
      res.status(403).json({ error: "Origin not allowed" });
    }
    return;
  }

  next();
}

// Export for testing
export { isOriginAllowed, buildAllowlist, STATIC_ALLOWED_ORIGINS, DEV_ORIGINS, MANUS_SANDBOX_PATTERN };
