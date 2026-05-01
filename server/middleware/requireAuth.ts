/**
 * Express middleware: Require authenticated session for all io-routes.
 * Reuses the same SDK session verification as tRPC context.
 * Attaches `req.user` for downstream route handlers.
 */
import { Request, Response, NextFunction } from "express";
import { sdk } from "../_core/sdk.js";
import type { User } from "../../drizzle/schema";

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = await sdk.authenticateRequest(req);
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: "Unauthorized — valid session required" });
  }
}
