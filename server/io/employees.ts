/**
 * server/io/employees.ts
 * Domain module: Employee CRUD operations.
 * Extracted from io-routes.ts during Sub-Phase 2.3.
 */
import { Router, Request, Response } from "express";
import { getDb } from "../db.js";
import {
  ioEmployees,
  ioAttendance,
  ioAuditLog,
} from "../../drizzle/schema.js";
import { eq, and, gte, lte, asc, sql } from "drizzle-orm";
import crypto from "crypto";
import { syncEmployeesToSupabase, deleteEmployeesFromSupabase } from "../supabase-sync.js";
import { emitChange } from "./emit-change.js";
import { optimisticUpdate, sendConflict, getClientVersion } from "./optimistic-lock.js";

const router = Router();

// ── In-memory cache for employees/slim (5-minute TTL) ──
// This data changes rarely (roster updates) but is fetched on every login.
let _slimCache: any[] | null = null;
let _slimCacheTs = 0;
const SLIM_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// GET /api/io/employees/slim — lightweight lookup for attendance normalization
router.get("/employees/slim", async (req: Request, res: Response) => {
  try {
    // Serve from cache if fresh
    if (_slimCache && Date.now() - _slimCacheTs < SLIM_CACHE_TTL) {
      return res.json(_slimCache);
    }
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });
    const rows = await db.select({
      ohr_id: ioEmployees.ohr_id,
      full_name: ioEmployees.full_name,
      supervisor_name: ioEmployees.supervisor_name,
      actual_role: ioEmployees.actual_role,
      planning_group: ioEmployees.planning_group,
      complete_planning_group: ioEmployees.complete_planning_group,
      shift_time: ioEmployees.shift_time,
      srt_status: ioEmployees.srt_status,
      department: ioEmployees.department,
      floor: ioEmployees.floor,
      sex: ioEmployees.sex,
    }).from(ioEmployees).orderBy(asc(ioEmployees.ohr_id)).limit(3000);
    _slimCache = rows;
    _slimCacheTs = Date.now();
    res.json(rows);
  } catch (err: any) {
    console.error("[IO API] employees/slim GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/io/employees — list employees with optional filters
router.get("/employees", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { select: selectCols, limit, offset, order, ohr_id, employement_status, srt_id_not_null } = req.query;

    let query = db.select().from(ioEmployees);
    const conditions: any[] = [];

    if (ohr_id) conditions.push(eq(ioEmployees.ohr_id, String(ohr_id)));
    if (employement_status) conditions.push(eq(ioEmployees.employement_status, String(employement_status)));
    if (srt_id_not_null === "true") conditions.push(sql`${ioEmployees.srt_id} IS NOT NULL`);

    const q = conditions.length > 0 ? query.where(and(...conditions)) : query;
    const ordered = String(order || "full_name") === "ohr_id" ? q.orderBy(asc(ioEmployees.ohr_id)) : q.orderBy(asc(ioEmployees.full_name));
    const limited = limit ? ordered.limit(Number(limit)) : ordered.limit(3000);
    const offsetQ = offset ? limited.offset(Number(offset)) : limited;

    const rows = await offsetQ;
    res.json(rows);
  } catch (err: any) {
    console.error("[IO API] employees GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/io/employees/:ohr_id — update an employee (with audit logging)
router.patch("/employees/:ohr_id", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { ohr_id } = req.params;
    const rawBody = { ...req.body };

    // Extract audit metadata (not persisted to io_employees)
    const actorOhr = rawBody._actor_ohr || null;
    const actorName = rawBody._actor_name || null;
    delete rawBody._actor_ohr;
    delete rawBody._actor_name;

    const updates = rawBody;
    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    // ── Dropdown field validation ─────────────────────────────────────
    const { DROPDOWN_VALID_VALUES } = await import("./lookup.js");
    const rejections: string[] = [];
    for (const [field, value] of Object.entries(updates)) {
      const allowed = DROPDOWN_VALID_VALUES[field];
      if (!allowed || allowed === 'dynamic') continue; // skip dynamic or non-dropdown fields
      if (value === null || value === '') continue; // allow clearing
      if (!allowed.includes(String(value))) {
        rejections.push(`${field}: "${value}" is not a valid option`);
      }
    }
    if (rejections.length > 0) {
      return res.status(400).json({ error: "Invalid dropdown values", details: rejections });
    }

    // Fetch current state for audit diff
    const [before] = await db.select().from(ioEmployees).where(eq(ioEmployees.ohr_id, ohr_id));

    const clientVersion = getClientVersion(req.body);
    if (clientVersion !== null) {
      const { version: _v, ...updateFields } = updates;
      const lockResult = await optimisticUpdate(db, ioEmployees, ioEmployees.ohr_id, ohr_id, clientVersion, updateFields);
      if (!lockResult.ok) {
        if (lockResult.reason === "not_found") return res.status(404).json({ error: "Employee not found" });
        return sendConflict(res, clientVersion, lockResult.serverState);
      }
    } else {
      await db.update(ioEmployees).set(updates).where(eq(ioEmployees.ohr_id, ohr_id));
    }

    // Audit logging: log each changed field
    if (before && actorOhr) {
      const now = new Date().toISOString();
      const auditEntries: any[] = [];
      for (const [key, newVal] of Object.entries(updates)) {
        const oldVal = (before as any)[key];
        const oldStr = oldVal != null ? String(oldVal) : '';
        const newStr = newVal != null ? String(newVal) : '';
        if (oldStr !== newStr) {
          auditEntries.push({
            record_type: 'io_employees',
            record_id: ohr_id,
            action: 'UPDATE',
            field_name: key,
            old_value: oldStr || null,
            new_value: newStr || null,
            actor_ohr: actorOhr,
            actor_name: actorName,
            timestamp: now,
          });
        }
      }
      if (auditEntries.length > 0) {
        db.insert(ioAuditLog).values(auditEntries).catch((e: any) =>
          console.error('[IO API] audit log insert error:', e)
        );
      }
    }

    // Fire-and-forget: mirror change to Supabase
    const [updated] = await db.select().from(ioEmployees).where(eq(ioEmployees.ohr_id, ohr_id));
    if (updated) syncEmployeesToSupabase([updated]).catch(() => {});
    _slimCache = null; // Invalidate cache on update
    emitChange(req, "employees", "record_updated", { ohr_id });
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] employees PATCH error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/employees — create a new employee
// Auto-generates attendance rows for the remainder of the current month
// when the employee is non-Manager and non-Inactive.
router.post("/employees", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    await db.insert(ioEmployees).values(req.body);
    // Fire-and-forget: mirror new employee to Supabase
    syncEmployeesToSupabase([req.body]).catch(() => {});

    // --- Auto-generate attendance rows for new non-Manager, non-Inactive employees ---
    const emp = req.body;
    const role = emp.actual_role || '';
    const status = emp.srt_status || '';
    const EXEMPT_ROLES = ['Manager'];
    const INACTIVE_STATUSES = ['Inactive', 'Exit'];

    if (!EXEMPT_ROLES.includes(role) && !INACTIVE_STATUSES.includes(status) && emp.ohr_id) {
      try {
        // Determine date range: today through end of current month
        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        const year = now.getFullYear();
        const month = now.getMonth(); // 0-indexed
        const lastDay = new Date(year, month + 1, 0).getDate();
        const endStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        // Check which dates already exist for this employee
        const existing = await db.select({ log_date: ioAttendance.log_date })
          .from(ioAttendance)
          .where(and(
            eq(ioAttendance.ohr_id, emp.ohr_id),
            gte(ioAttendance.log_date, todayStr),
            lte(ioAttendance.log_date, endStr)
          ));
        const existingDates = new Set(existing.map(r => r.log_date));

        // Build rows for missing dates
        const rows: any[] = [];
        for (let d = new Date(todayStr + 'T00:00:00Z'); d.toISOString().slice(0, 10) <= endStr; d.setUTCDate(d.getUTCDate() + 1)) {
          const dateStr = d.toISOString().slice(0, 10);
          if (existingDates.has(dateStr)) continue;
          rows.push({
            id: crypto.randomBytes(8).toString('hex'),
            ohr_id: emp.ohr_id,
            log_date: dateStr,
            created_at: now.toISOString(),
            snap_full_name: emp.full_name || '',
            snap_supervisor: emp.supervisor_name || emp.sup_name || '',
            snap_planning_group: emp.planning_group || '',
            snap_shift_time: emp.shift_time || '',
            snap_actual_role: role,
            snap_billing_name: emp.billing_name || '',
            snap_status: status,
          });
        }

        if (rows.length > 0) {
          // Batch insert in chunks of 50 to avoid query size limits
          for (let i = 0; i < rows.length; i += 50) {
            await db.insert(ioAttendance).values(rows.slice(i, i + 50));
          }
          console.log(`[IO API] Auto-generated ${rows.length} attendance rows for new employee ${emp.ohr_id} (${todayStr} → ${endStr})`);
        }
      } catch (attErr: any) {
        // Non-fatal: employee was created, attendance generation failed
        console.error(`[IO API] Auto-attendance generation failed for ${emp.ohr_id}:`, attErr.message);
      }
    }

    _slimCache = null; // Invalidate cache on create
    emitChange(req, "employees", "record_created", {});
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] employees POST error:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/io/employees/:ohr_id — delete an employee
router.delete("/employees/:ohr_id", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    await db.delete(ioEmployees).where(eq(ioEmployees.ohr_id, req.params.ohr_id));
    // Fire-and-forget: mirror deletion to Supabase
    deleteEmployeesFromSupabase([req.params.ohr_id]).catch(() => {});
    _slimCache = null; // Invalidate cache on delete
    emitChange(req, "employees", "record_deleted", { ohr_id: req.params.ohr_id });
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] employees DELETE error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
