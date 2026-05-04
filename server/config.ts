/**
 * Centralized configuration — single source of truth for admin OHRs and owner identity.
 * ADMIN_OHRS is now DB-backed (io_admin_ohrs table) with an in-memory cache.
 * The cache is loaded on startup and refreshed on every mutation via refreshAdminOhrs().
 */
import { getDb } from "./db.js";
import { ioAdminOhrs } from "../drizzle/schema.js";

// Owner OHR — the primary system owner with full unrestricted access (cannot be removed)
export const OWNER_OHR = "740045023";

// In-memory cache — initialized with hardcoded fallback, replaced by DB on first load
export let ADMIN_OHRS: string[] = ["740045023", "740044909"];

/**
 * Refresh the in-memory ADMIN_OHRS cache from the database.
 * Called on server startup and after every add/remove mutation.
 */
export async function refreshAdminOhrs(): Promise<string[]> {
  try {
    const db = await getDb();
    if (!db) return ADMIN_OHRS;
    const rows = await db.select({ ohr_id: ioAdminOhrs.ohr_id }).from(ioAdminOhrs);
    const ohrList = rows.map(r => r.ohr_id);
    // Ensure OWNER_OHR is always included regardless of DB state
    if (!ohrList.includes(OWNER_OHR)) ohrList.unshift(OWNER_OHR);
    ADMIN_OHRS = ohrList;
    return ADMIN_OHRS;
  } catch (err) {
    console.error("[config] Failed to refresh ADMIN_OHRS from DB:", err);
    return ADMIN_OHRS;
  }
}

// Helper: check if an OHR is an admin (synchronous, uses cached list)
export function isAdminOhr(ohr: string): boolean {
  return ADMIN_OHRS.includes(ohr);
}
