/**
 * Permissions (RBAC) Domain Module
 * Extracted from io-routes.ts — handles permission CRUD, role defaults, config
 */
import { Router, Request, Response } from "express";
import { getDb } from "../db.js";
import { ioPermissions, ioEmployees, ioAuditLog, ioAdminOhrs } from "../../drizzle/schema.js";
import { eq, and } from "drizzle-orm";
import { ADMIN_OHRS, getPermissionDefaults, ALL_PERMISSION_KEYS } from "./shared.js";
import { validate, permissionsUpdateSchema, permissionsSeedSchema, permissionsBulkKeyUpdateSchema } from "./validation.js";
import { OWNER_OHR, refreshAdminOhrs } from "../config.js";
import { emitChange } from "./emit-change.js";

const router = Router();

// GET /api/io/config/admin-ohrs — single source of truth for admin OHR list (cached from DB)
router.get("/config/admin-ohrs", (_req: Request, res: Response) => {
  res.json({ admin_ohrs: ADMIN_OHRS, owner_ohr: OWNER_OHR });
});

// ─── Admin OHR Management CRUD ───
// GET /api/io/admin-ohrs — list all admins with metadata
router.get("/admin-ohrs", async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const rows = await db.select().from(ioAdminOhrs);
    res.json({ data: rows, owner_ohr: OWNER_OHR });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/admin-ohrs — add a new admin (only existing admins can add)
router.post("/admin-ohrs", async (req: Request, res: Response) => {
  const actorOhr = req.headers["x-actor-ohr"] as string;
  if (!actorOhr || !ADMIN_OHRS.includes(actorOhr)) {
    return res.status(403).json({ error: "Only admins can manage the admin list" });
  }
  const { ohr_id, full_name } = req.body;
  if (!ohr_id || typeof ohr_id !== "string" || !ohr_id.trim()) {
    return res.status(400).json({ error: "ohr_id is required" });
  }
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    // Check duplicate
    const [existing] = await db.select().from(ioAdminOhrs).where(eq(ioAdminOhrs.ohr_id, ohr_id.trim()));
    if (existing) return res.status(409).json({ error: "OHR is already an admin" });
    await db.insert(ioAdminOhrs).values({
      ohr_id: ohr_id.trim(),
      full_name: full_name || null,
      added_by: req.headers["x-actor-name"] as string || actorOhr,
      added_by_ohr: actorOhr,
      added_at: new Date().toISOString(),
    });
    // Refresh in-memory cache
    await refreshAdminOhrs();
    emitChange(req, "admin-ohrs", "record_created", { ohr_id: ohr_id.trim() });
    res.json({ success: true, admin_ohrs: ADMIN_OHRS });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/io/admin-ohrs/:ohr_id — remove an admin (cannot remove OWNER_OHR)
router.delete("/admin-ohrs/:ohr_id", async (req: Request, res: Response) => {
  const actorOhr = req.headers["x-actor-ohr"] as string;
  if (!actorOhr || !ADMIN_OHRS.includes(actorOhr)) {
    return res.status(403).json({ error: "Only admins can manage the admin list" });
  }
  const targetOhr = req.params.ohr_id;
  if (targetOhr === OWNER_OHR) {
    return res.status(403).json({ error: "Cannot remove the system owner from admin list" });
  }
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    await db.delete(ioAdminOhrs).where(eq(ioAdminOhrs.ohr_id, targetOhr));
    // Refresh in-memory cache
    await refreshAdminOhrs();
    emitChange(req, "admin-ohrs", "record_deleted", { ohr_id: targetOhr });
    res.json({ success: true, admin_ohrs: ADMIN_OHRS });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/io/my-permissions — current user's permissions (merged DB + defaults)
router.get("/my-permissions", async (req: Request, res: Response) => {
  try {
    const ohrId = req.query.ohr_id as string;
    const role = req.query.role as string;
    if (!ohrId || !role) return res.status(400).json({ error: "ohr_id and role required" });

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    // Get defaults for this role
    const defaults = getPermissionDefaults(role, ohrId);

    // Get DB overrides
    const dbRows = await db.select().from(ioPermissions).where(eq(ioPermissions.ohr_id, ohrId));
    const dbMap: Record<string, boolean> = {};
    for (const row of dbRows) {
      dbMap[row.permission_key] = row.granted;
    }

    // Merge: DB overrides defaults
    const merged: Record<string, boolean> = { ...defaults };
    for (const key of ALL_PERMISSION_KEYS) {
      if (key in dbMap) merged[key] = dbMap[key];
    }

    res.json({ ohr_id: ohrId, permissions: merged });
  } catch (err: any) {
    console.error("[PERMISSIONS] Error fetching my-permissions:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/io/permissions — all permissions (admin only, returns per-employee summary)
router.get("/permissions", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const allPerms = await db.select().from(ioPermissions);

    // Group by ohr_id
    const byOhr: Record<string, Record<string, boolean>> = {};
    for (const row of allPerms) {
      if (!byOhr[row.ohr_id]) byOhr[row.ohr_id] = {};
      byOhr[row.ohr_id][row.permission_key] = row.granted;
    }

    res.json({ permissions: byOhr, keys: ALL_PERMISSION_KEYS });
  } catch (err: any) {
    console.error("[PERMISSIONS] Error fetching all permissions:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/io/permissions/:ohr_id — single employee's permissions
router.get("/permissions/:ohr_id", async (req: Request, res: Response) => {
  try {
    const { ohr_id } = req.params;
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const rows = await db.select().from(ioPermissions).where(eq(ioPermissions.ohr_id, ohr_id));
    const perms: Record<string, boolean> = {};
    for (const row of rows) perms[row.permission_key] = row.granted;

    // Also fetch employee info for context
    const [emp] = await db.select().from(ioEmployees).where(eq(ioEmployees.ohr_id, ohr_id));

    res.json({
      ohr_id,
      employee: emp ? { full_name: emp.full_name, actual_role: emp.actual_role, employement_status: emp.employement_status } : null,
      permissions: perms,
      all_keys: ALL_PERMISSION_KEYS,
    });
  } catch (err: any) {
    console.error("[PERMISSIONS] Error fetching permissions for", req.params.ohr_id, err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/io/permissions/:ohr_id — update permissions (admin only)
router.put("/permissions/:ohr_id", validate(permissionsUpdateSchema), async (req: Request, res: Response) => {
  try {
    const { ohr_id } = req.params;
    const { permissions, actor_ohr, actor_name } = req.body;

    if (!permissions || typeof permissions !== 'object') {
      return res.status(400).json({ error: "permissions object required" });
    }

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    // Get current permissions for diff/audit
    const currentRows = await db.select().from(ioPermissions).where(eq(ioPermissions.ohr_id, ohr_id));
    const currentMap: Record<string, boolean> = {};
    for (const row of currentRows) currentMap[row.permission_key] = row.granted;

    const changes: Array<{ key: string; old_value: boolean; new_value: boolean }> = [];

    for (const [key, granted] of Object.entries(permissions)) {
      if (!ALL_PERMISSION_KEYS.includes(key)) continue;
      const grantedBool = Boolean(granted);
      const oldVal = currentMap[key];

      // Track changes for audit
      if (oldVal !== undefined && oldVal !== grantedBool) {
        changes.push({ key, old_value: oldVal, new_value: grantedBool });
      } else if (oldVal === undefined) {
        changes.push({ key, old_value: false, new_value: grantedBool });
      }

      // Upsert
      if (key in currentMap) {
        await db.update(ioPermissions)
          .set({ granted: grantedBool, updated_by: actor_ohr || 'SYSTEM' })
          .where(and(eq(ioPermissions.ohr_id, ohr_id), eq(ioPermissions.permission_key, key)));
      } else {
        await db.insert(ioPermissions).values({
          ohr_id,
          permission_key: key,
          granted: grantedBool,
          updated_by: actor_ohr || 'SYSTEM',
        });
      }
    }

    // Audit log each change
    if (changes.length > 0) {
      for (const change of changes) {
        await db.insert(ioAuditLog).values({
          record_type: 'permission',
          record_id: ohr_id,
          action: change.new_value ? 'grant' : 'revoke',
          field_name: change.key,
          old_value: String(change.old_value),
          new_value: String(change.new_value),
          actor_ohr: actor_ohr || 'SYSTEM',
          actor_name: actor_name || 'System',
          timestamp: new Date().toISOString(),
        });
      }
      console.log(`[PERMISSIONS] ${changes.length} permission changes for ${ohr_id} by ${actor_ohr}`);
    }

    emitChange(req, "permissions", "record_updated", { ohr_id, changes: changes.length });
    res.json({ ok: true, changes_count: changes.length });
  } catch (err: any) {
    console.error("[PERMISSIONS] Error updating permissions for", req.params.ohr_id, err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/permissions/seed/:ohr_id — seed defaults for a single employee (used when new employee added)
router.post("/permissions/seed/:ohr_id", validate(permissionsSeedSchema), async (req: Request, res: Response) => {
  try {
    const { ohr_id } = req.params;
    const { role } = req.body;
    if (!role) return res.status(400).json({ error: "role required" });

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const defaults = getPermissionDefaults(role, ohr_id);
    const rows = Object.entries(defaults).map(([key, granted]) => ({
      ohr_id,
      permission_key: key,
      granted,
      updated_by: 'SYSTEM',
    }));

    // Check if already seeded
    const existing = await db.select().from(ioPermissions).where(eq(ioPermissions.ohr_id, ohr_id));
    if (existing.length > 0) {
      return res.json({ ok: true, message: 'Already seeded', count: existing.length });
    }

    for (const row of rows) {
      await db.insert(ioPermissions).values(row);
    }

    emitChange(req, "permissions", "record_created", { ohr_id, count: rows.length });
    res.json({ ok: true, count: rows.length });
  } catch (err: any) {
    console.error("[PERMISSIONS] Error seeding permissions for", req.params.ohr_id, err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/permissions/bulk-key-update — update a single permission key for all employees (admin only)
router.post("/permissions/bulk-key-update", validate(permissionsBulkKeyUpdateSchema), async (req: Request, res: Response) => {
  try {
    const { permission_key, granted, actor_ohr } = req.body;
    if (!permission_key || typeof granted !== 'boolean') {
      return res.status(400).json({ error: "permission_key (string) and granted (boolean) required" });
    }
    if (!ALL_PERMISSION_KEYS.includes(permission_key)) {
      return res.status(400).json({ error: `Invalid permission key: ${permission_key}` });
    }
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    // Single UPDATE statement for all rows with this key
    const result = await db.update(ioPermissions)
      .set({ granted, updated_by: actor_ohr || 'SYSTEM' })
      .where(eq(ioPermissions.permission_key, permission_key));

    console.log(`[PERMISSIONS] Bulk update: ${permission_key} = ${granted} by ${actor_ohr}`);
    emitChange(req, "permissions", "bulk_update", { permission_key, granted });
    res.json({ ok: true, permission_key, granted });
  } catch (err: any) {
    console.error("[PERMISSIONS] Bulk key update error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
