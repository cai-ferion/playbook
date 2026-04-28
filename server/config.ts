/**
 * Centralized configuration — single source of truth for admin OHRs and owner identity.
 * All backend routes and frontend code should reference these values instead of hardcoding.
 */

// Owner OHR — the primary system owner with full unrestricted access
export const OWNER_OHR = "740045023";

// Admin OHRs — users with elevated privileges (lock bypass, delete, bulk ops, etc.)
// To add a new admin, add their OHR here — it propagates to all backend gates and the frontend config endpoint.
export const ADMIN_OHRS: string[] = ["740045023", "740044909"];

// Helper: check if an OHR is an admin
export function isAdminOhr(ohr: string): boolean {
  return ADMIN_OHRS.includes(ohr);
}
