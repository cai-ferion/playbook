/**
 * lookup.ts — Static lookup endpoints for Regimen inline editing dropdowns.
 * 
 * Provides:
 *   GET /lookup/barangays?q=<search>  — searchable Philippine barangay list (top 20)
 *   GET /lookup/team-leads            — all Team Leads from io_employees
 *   GET /lookup/planning-groups       — all distinct planning_group values
 */
import { Router } from "express";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const router = Router();

// ── Barangay Dataset (loaded once at startup) ─────────────────────
interface BarangayEntry {
  b: string; // barangay name
  c: string; // city/municipality
  p: string; // province
}

const __dirname2 = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname2, "..", "data", "ph-barangays.json");

let BARANGAYS: BarangayEntry[] = [];
try {
  const raw = readFileSync(dataPath, "utf-8");
  BARANGAYS = JSON.parse(raw);
  console.log(`[Lookup] Loaded ${BARANGAYS.length} barangays`);
} catch (err) {
  console.error("[Lookup] Failed to load barangay data:", err);
}

// Pre-build lowercase index for fast search
const BARANGAY_INDEX = BARANGAYS.map((entry) => ({
  ...entry,
  _lower: entry.b.toLowerCase(),
  _cityLower: entry.c.toLowerCase(),
}));

/**
 * GET /lookup/barangays?q=<search>
 * Returns top 20 matches. Searches barangay name first, then city.
 * Response: { results: [{ barangay, city, province }] }
 */
router.get("/lookup/barangays", (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();
  if (!q || q.length < 2) {
    return res.json({ results: [] });
  }

  // Prioritize: exact prefix match on barangay > contains on barangay > prefix on city
  const prefixMatches: BarangayEntry[] = [];
  const containsMatches: BarangayEntry[] = [];

  for (const entry of BARANGAY_INDEX) {
    if (prefixMatches.length >= 20) break;
    if (entry._lower.startsWith(q)) {
      prefixMatches.push(entry);
    } else if (entry._lower.includes(q) && containsMatches.length < 20) {
      containsMatches.push(entry);
    }
  }

  const combined = [...prefixMatches, ...containsMatches].slice(0, 20);
  const results = combined.map((e) => ({
    barangay: e.b,
    city: e.c,
    province: e.p,
  }));

  res.json({ results });
});

/**
 * GET /lookup/team-leads
 * Returns all employees with actual_role='Team Lead' (any status).
 * Response: { results: [{ ohr_id, full_name }] }
 */
router.get("/lookup/team-leads", async (req, res) => {
  try {
    const { getDb } = await import("../db.js");
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const { ioEmployees } = await import("../../drizzle/schema.js");
    const { eq } = await import("drizzle-orm");
    const rows = await db
      .select({ ohr_id: ioEmployees.ohr_id, full_name: ioEmployees.full_name })
      .from(ioEmployees)
      .where(eq(ioEmployees.actual_role, "Team Lead"));
    res.json({ results: rows.map(r => ({ ohr_id: r.ohr_id, full_name: r.full_name || '' })) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Internal error" });
  }
});

/**
 * GET /lookup/planning-groups
 * Returns all distinct non-null planning_group values from io_employees.
 * Response: { results: string[] }
 */
router.get("/lookup/planning-groups", async (req, res) => {
  try {
    const { getDb } = await import("../db.js");
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const { ioEmployees } = await import("../../drizzle/schema.js");
    const { isNotNull, sql } = await import("drizzle-orm");
    const rows = await db
      .selectDistinct({ pg: ioEmployees.planning_group })
      .from(ioEmployees)
      .where(isNotNull(ioEmployees.planning_group));
    const results = rows
      .map(r => r.pg)
      .filter((v): v is string => !!v && v.trim() !== '')
      .sort();
    res.json({ results });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Internal error" });
  }
});

/**
 * Validation constants for dropdown fields.
 * Used by the employee PATCH endpoint to reject invalid values.
 */
export const DROPDOWN_VALID_VALUES: Record<string, string[] | 'dynamic'> = {
  sex: ['M', 'F'],
  employement_status: ['Active', 'Inactive', 'Exit'],
  actual_role: ['Agent', 'Operational SME', 'Quality & Policy Expert', 'Team Lead', 'Trainer', 'Manager'],
  shift_time: ['Mid-Shift', 'GY Shift'],
  work_off: ['Sun - Mon', 'Mon - Tue', 'Tue - Wed', 'Wed - Thu', 'Thu - Fri', 'Fri - Sat', 'Sat - Sun'],
  platform: ['Facebook', 'Instagram', 'Not Applicable'],
  department: ['Ops', 'QTP'],
  locker_floor: Array.from({length: 30}, (_, i) => (i + 1) + (i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th') + ' Floor'),
  // These are validated dynamically against DB values:
  supervisor_name: 'dynamic',
  planning_group: 'dynamic',
  complete_planning_group: 'dynamic',
  barangay: 'dynamic',
};

export default router;
