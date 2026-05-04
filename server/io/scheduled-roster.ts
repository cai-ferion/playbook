/**
 * Scheduled Task Endpoint — /api/scheduled/roster
 *
 * Cross-site integration endpoint designed for the Manus platform's scheduled task pattern.
 * The platform automatically creates a session cookie for scheduled tasks, resulting in
 * a user with role == "user". This endpoint allows that role.
 *
 * Usage from the OTHER Manus site's scheduled task:
 *   curl -H "Cookie: app_session_id=$SCHEDULED_TASK_COOKIE" \
 *        "$SCHEDULED_TASK_ENDPOINT_BASE/api/scheduled/roster"
 *
 * Supports the same filters as the external API:
 *   ?status=Active&role=Agent&planning_group=MQ&fields=ohr_id,full_name&limit=100&offset=0
 */
import { Router, Request, Response } from "express";
import { getDb } from "../db.js";
import { ioEmployees } from "../../drizzle/schema.js";
import { eq, and, asc, sql } from "drizzle-orm";
import { sdk } from "../_core/sdk.js";

const router = Router();

// ─── Auth: Accept any authenticated user (role == "user" or "admin") ──────────
// The platform's scheduled task creates a cookie with role "user", so we allow it.
async function requireAnyAuth(req: Request, res: Response, next: Function): Promise<void> {
  try {
    const user = await sdk.authenticateRequest(req);
    req.user = user;
    // Allow both "user" and "admin" roles
    if (user.role === "user" || user.role === "admin") {
      next();
      return;
    }
    res.status(403).json({ error: "Forbidden" });
  } catch (err) {
    res.status(401).json({ error: "Unauthorized — valid session required" });
  }
}

router.use(requireAnyAuth);

// ─── GET /api/scheduled/roster ────────────────────────────────────────────────
router.get("/roster", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { status, role, planning_group, fields, limit, offset } = req.query;

    // Build WHERE conditions
    const conditions: any[] = [];
    if (status) conditions.push(eq(ioEmployees.employement_status, String(status)));
    if (role) conditions.push(eq(ioEmployees.actual_role, String(role)));
    if (planning_group) conditions.push(eq(ioEmployees.planning_group, String(planning_group)));

    // Allowed fields (safe subset — no PII)
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

    // Total count
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
    console.error("[Scheduled Roster] GET error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/scheduled/roster/:ohr_id ────────────────────────────────────────
router.get("/roster/:ohr_id", async (req: Request, res: Response) => {
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
    console.error("[Scheduled Roster] GET /:ohr_id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as scheduledRosterRouter };
