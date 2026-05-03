/**
 * Permissions (RBAC) Domain Module
 * Extracted from io-routes.ts — handles permission CRUD, role defaults, config
 */
import { Router, Request, Response } from "express";
import { getDb } from "../db.js";
import { ioPermissions, ioEmployees, ioAuditLog } from "../../drizzle/schema.js";
import { eq, and } from "drizzle-orm";
import { ADMIN_OHRS, getPermissionDefaults, ALL_PERMISSION_KEYS } from "./shared.js";
import { OWNER_OHR } from "../config.js";

const router = Router();

// GET /api/io/config/admin-ohrs — single source of truth for admin OHR list
router.get("/config/admin-ohrs", (_req: Request, res: Response) => {
  res.json({ admin_ohrs: ADMIN_OHRS, owner_ohr: OWNER_OHR });
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
router.put("/permissions/:ohr_id", async (req: Request, res: Response) => {
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

    res.json({ ok: true, changes_count: changes.length });
  } catch (err: any) {
    console.error("[PERMISSIONS] Error updating permissions for", req.params.ohr_id, err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/permissions/seed/:ohr_id — seed defaults for a single employee (used when new employee added)
router.post("/permissions/seed/:ohr_id", async (req: Request, res: Response) => {
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

    res.json({ ok: true, count: rows.length });
  } catch (err: any) {
    console.error("[PERMISSIONS] Error seeding permissions for", req.params.ohr_id, err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/permissions/bulk-key-update — update a single permission key for all employees (admin only)
router.post("/permissions/bulk-key-update", async (req: Request, res: Response) => {
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
    res.json({ ok: true, permission_key, granted });
  } catch (err: any) {
    console.error("[PERMISSIONS] Bulk key update error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
