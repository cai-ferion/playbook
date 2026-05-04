/**
 * External API — Read-only endpoints secured by API key.
 * Designed for cross-site integration (e.g., connecting Playbook roster data to other internal tools).
 *
 * Auth: Requires `X-API-Key` header matching the EXTERNAL_API_KEY environment variable.
 * Rate limit: Inherits global rate limiting from middleware stack.
 */
import { Router, Request, Response, NextFunction } from "express";
import { getDb } from "../db.js";
import { ioEmployees } from "../../drizzle/schema.js";
import { eq, and, asc, sql } from "drizzle-orm";

const router = Router();

// ─── API Key Auth Middleware ───────────────────────────────────────────────────
function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const apiKey = process.env.EXTERNAL_API_KEY;
  if (!apiKey) {
    // If no key is configured, the external API is disabled
    res.status(503).json({ error: "External API not configured" });
    return;
  }

  const providedKey = req.headers["x-api-key"] as string | undefined;
  if (!providedKey || providedKey !== apiKey) {
    res.status(401).json({ error: "Invalid or missing API key" });
    return;
  }

  next();
}

// Apply API key check to all routes in this router
router.use(requireApiKey);

// ─── GET /api/external/employees ──────────────────────────────────────────────
// Returns the employee roster with optional filters.
// Query params:
//   status     — filter by employement_status (e.g., "Active", "Onboarding", "Resigned")
//   role       — filter by actual_role (e.g., "Agent", "Team Leader")
//   planning_group — filter by planning_group
//   fields     — comma-separated list of fields to return (default: core fields)
//   limit      — max rows (default 500, max 2000)
//   offset     — pagination offset
router.get("/employees", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { status, role, planning_group, fields, limit, offset } = req.query;

    // Build WHERE conditions
    const conditions: any[] = [];
    if (status) conditions.push(eq(ioEmployees.employement_status, String(status)));
    if (role) conditions.push(eq(ioEmployees.actual_role, String(role)));
    if (planning_group) conditions.push(eq(ioEmployees.planning_group, String(planning_group)));

    // Determine which fields to return
    const allowedFields: Record<string, any> = {
      ohr_id: ioEmployees.ohr_id,
      full_name: ioEmployees.full_name,
      last_name: ioEmployees.last_name,
      given_name: ioEmployees.given_name,
      actual_role: ioEmployees.actual_role,
      employement_status: ioEmployees.employement_status,
      supervisor_name: ioEmployees.supervisor_name,
      planning_group: ioEmployees.planning_group,
      complete_planning_group: ioEmployees.complete_planning_group,
      shift_time: ioEmployees.shift_time,
      work_off: ioEmployees.work_off,
      department: ioEmployees.department,
      hire_date: ioEmployees.hire_date,
      meta_email: ioEmployees.meta_email,
      srt_status: ioEmployees.srt_status,
      sex: ioEmployees.sex,
    };

    // Default fields (safe subset — no PII like address, contact, personal email)
    const defaultFields = [
      "ohr_id", "full_name", "last_name", "given_name", "actual_role",
      "employement_status", "supervisor_name", "planning_group",
      "shift_time", "work_off", "department", "hire_date", "meta_email"
    ];

    let selectedFields: string[];
    if (fields) {
      const requested = String(fields).split(",").map(f => f.trim());
      selectedFields = requested.filter(f => f in allowedFields);
      if (selectedFields.length === 0) selectedFields = defaultFields;
    } else {
      selectedFields = defaultFields;
    }

    const selectObj: Record<string, any> = {};
    for (const f of selectedFields) {
      selectObj[f] = allowedFields[f];
    }

    // Build query
    let query = db.select(selectObj).from(ioEmployees);
    const q = conditions.length > 0 ? query.where(and(...conditions)) : query;
    const ordered = q.orderBy(asc(ioEmployees.full_name));

    // Pagination
    const maxLimit = 2000;
    const rowLimit = Math.min(Math.max(Number(limit) || 500, 1), maxLimit);
    const rowOffset = Math.max(Number(offset) || 0, 0);
    const limited = ordered.limit(rowLimit).offset(rowOffset);

    const rows = await limited;

    // Get total count for pagination metadata
    const [countResult] = await (
      conditions.length > 0
        ? db.select({ count: sql<number>`COUNT(*)` }).from(ioEmployees).where(and(...conditions))
        : db.select({ count: sql<number>`COUNT(*)` }).from(ioEmployees)
    );

    res.json({
      data: rows,
      meta: {
        total: Number(countResult.count),
        limit: rowLimit,
        offset: rowOffset,
        fields: selectedFields,
      },
    });
  } catch (err: any) {
    console.error("[External API] employees GET error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/external/employees/:ohr_id ──────────────────────────────────────
// Returns a single employee by OHR ID.
router.get("/employees/:ohr_id", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { ohr_id } = req.params;
    const [employee] = await db.select({
      ohr_id: ioEmployees.ohr_id,
      full_name: ioEmployees.full_name,
      last_name: ioEmployees.last_name,
      given_name: ioEmployees.given_name,
      actual_role: ioEmployees.actual_role,
      employement_status: ioEmployees.employement_status,
      supervisor_name: ioEmployees.supervisor_name,
      planning_group: ioEmployees.planning_group,
      complete_planning_group: ioEmployees.complete_planning_group,
      shift_time: ioEmployees.shift_time,
      work_off: ioEmployees.work_off,
      department: ioEmployees.department,
      hire_date: ioEmployees.hire_date,
      meta_email: ioEmployees.meta_email,
      srt_status: ioEmployees.srt_status,
      sex: ioEmployees.sex,
    }).from(ioEmployees).where(eq(ioEmployees.ohr_id, String(ohr_id)));

    if (!employee) {
      return res.status(404).json({ error: "Employee not found" });
    }

    res.json({ data: employee });
  } catch (err: any) {
    console.error("[External API] employees/:ohr_id GET error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as externalApiRouter };
