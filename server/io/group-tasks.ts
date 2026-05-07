/**
 * Group Task Routes — Helm bulk task assignment system
 * POST   /api/io/group-tasks           — create group task + auto-assign
 * GET    /api/io/group-tasks           — list all group tasks with progress
 * GET    /api/io/group-tasks/my-tasks  — unified task list for current user
 * GET    /api/io/group-tasks/:id       — single task detail + assignments
 * POST   /api/io/group-tasks/:id/complete — mark own assignment as completed
 * POST   /api/io/group-tasks/:id/exclude  — exclude people from a group task
 * POST   /api/io/group-tasks/preview   — preview assignment count
 * POST   /api/io/group-tasks/:id/close — close a group task
 */

import { Router, Request, Response } from "express";
import { getDb } from "../db.js";
import { sql } from "drizzle-orm";
import { ioNotifications } from "../../drizzle/schema.js";
import { validate, groupTaskPreviewSchema, groupTaskCreateSchema, groupTaskCompleteSchema, groupTaskExcludeSchema } from "./validation.js";
import { emitChange } from "./emit-change.js";

const router = Router();

// ── Helper: resolve matching active employees based on filters ──
async function resolveTargetEmployees(filters: {
  planning_groups?: string[] | null;
  departments?: string[] | null;
  roles?: string[] | null;
  excluded_ohrs?: string[] | null;
}): Promise<Array<{ ohr_id: string; full_name: string }>> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const conditions = [`e.employement_status = 'Active'`];

  if (filters.planning_groups && filters.planning_groups.length > 0) {
    const escaped = filters.planning_groups.map(pg => `'${pg.replace(/'/g, "''")}'`).join(",");
    conditions.push(`e.planning_group IN (${escaped})`);
  }
  if (filters.departments && filters.departments.length > 0) {
    const escaped = filters.departments.map(d => `'${d.replace(/'/g, "''")}'`).join(",");
    conditions.push(`e.department IN (${escaped})`);
  }
  if (filters.roles && filters.roles.length > 0) {
    const escaped = filters.roles.map(r => `'${r.replace(/'/g, "''")}'`).join(",");
    conditions.push(`e.actual_role IN (${escaped})`);
  }
  if (filters.excluded_ohrs && filters.excluded_ohrs.length > 0) {
    const escaped = filters.excluded_ohrs.map(o => `'${o.replace(/'/g, "''")}'`).join(",");
    conditions.push(`e.ohr_id NOT IN (${escaped})`);
  }

  const query = `SELECT e.ohr_id, e.full_name FROM io_employees e WHERE ${conditions.join(" AND ")} ORDER BY e.full_name`;
  const [rows] = (await db.execute(sql.raw(query))) as unknown as [Array<{ ohr_id: string; full_name: string }>];
  return rows;
}

// ── POST /preview — preview how many employees will be assigned ──
router.post("/preview", validate(groupTaskPreviewSchema), async (req: Request, res: Response) => {
  try {
    const { planning_groups, departments, roles, excluded_ohrs } = req.body;
    const employees = await resolveTargetEmployees({
      planning_groups: planning_groups || null,
      departments: departments || null,
      roles: roles || null,
      excluded_ohrs: excluded_ohrs || null,
    });
    res.json({
      count: employees.length,
      employees: employees.map(e => ({ ohr_id: e.ohr_id, full_name: e.full_name })),
    });
  } catch (err: any) {
    console.error("[GroupTask] Preview error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST / — create group task + auto-assign ──
router.post("/", validate(groupTaskCreateSchema), async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const {
      title, description, category,
      planning_groups, departments, roles,
      excluded_ohrs, due_date,
      created_by_ohr, created_by_name,
    } = req.body;

    // title + created_by_ohr enforced by Zod schema

    const taskId = "GT-" + Date.now().toString(36).toUpperCase();
    const now = new Date().toISOString();

    // Insert group task via raw SQL (matches project pattern)
    const pgJson = planning_groups ? JSON.stringify(planning_groups).replace(/'/g, "''") : null;
    const deptJson = departments ? JSON.stringify(departments).replace(/'/g, "''") : null;
    const rolesJson = roles ? JSON.stringify(roles).replace(/'/g, "''") : null;
    const exclJson = excluded_ohrs ? JSON.stringify(excluded_ohrs).replace(/'/g, "''") : null;
    const descEsc = description ? description.replace(/'/g, "''") : null;
    const titleEsc = title.replace(/'/g, "''");
    const catEsc = category ? category.replace(/'/g, "''") : null;
    const creatorOhrEsc = created_by_ohr.replace(/'/g, "''");
    const creatorNameEsc = created_by_name ? created_by_name.replace(/'/g, "''") : null;

    const insertResult: any = await db.execute(sql.raw(`
      INSERT INTO io_group_tasks
        (task_id, title, description, category, planning_groups, departments, roles, excluded_ohrs, due_date, status, created_by_ohr, created_by_name, created_at, updated_at)
      VALUES
        ('${taskId}', '${titleEsc}', ${descEsc ? `'${descEsc}'` : 'NULL'}, ${catEsc ? `'${catEsc}'` : 'NULL'}, ${pgJson ? `'${pgJson}'` : 'NULL'}, ${deptJson ? `'${deptJson}'` : 'NULL'}, ${rolesJson ? `'${rolesJson}'` : 'NULL'}, ${exclJson ? `'${exclJson}'` : 'NULL'}, ${due_date ? `'${due_date}'` : 'NULL'}, 'Active', '${creatorOhrEsc}', ${creatorNameEsc ? `'${creatorNameEsc}'` : 'NULL'}, '${now}', '${now}')
      RETURNING id
    `));

    const groupTaskId = Array.isArray(insertResult) ? insertResult[0]?.id : undefined;

    // Resolve and assign employees
    const employees = await resolveTargetEmployees({
      planning_groups: planning_groups || null,
      departments: departments || null,
      roles: roles || null,
      excluded_ohrs: excluded_ohrs || null,
    });

    if (employees.length > 0) {
      // Batch insert in chunks of 100
      for (let i = 0; i < employees.length; i += 100) {
        const chunk = employees.slice(i, i + 100);
        const valueRows = chunk.map(e => {
          const nameEsc = e.full_name.replace(/'/g, "''");
          const ohrEsc = e.ohr_id.replace(/'/g, "''");
          return `(${groupTaskId}, '${ohrEsc}', '${nameEsc}', 'Pending', '${now}')`;
        }).join(",\n");

        await db.execute(sql.raw(`
          INSERT INTO io_task_assignments (group_task_id, employee_ohr, employee_name, status, created_at)
          VALUES ${valueRows}
        `));
      }
    }

    // ── Send in-app notification to each assigned employee ──
    if (employees.length > 0) {
      const dueStr = due_date
        ? new Date(due_date + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
        : 'No due date';
      const notifMsg = `${taskId}: ${title} — Due: ${dueStr}. Assigned by ${created_by_name || 'System'}.`;

      // Batch insert notifications in chunks of 100 (fire-and-forget, don't block response)
      (async () => {
        try {
          for (let i = 0; i < employees.length; i += 100) {
            const chunk = employees.slice(i, i + 100);
            await db.insert(ioNotifications).values(
              chunk.map(e => ({
                type: 'group_task_assigned',
                title: 'New Group Task Assigned',
                message: notifMsg,
                actor_ohr: created_by_ohr || null,
                actor_name: created_by_name || 'System',
                target_ohr: e.ohr_id,
                target_role: 'agent',
                metadata: JSON.stringify({ task_id: taskId, group_task_id: groupTaskId, title, due_date: due_date || null }),
                is_read: false,
                created_at: now,
              }))
            );
          }
          console.log(`[GroupTask] Sent ${employees.length} assignment notifications for ${taskId}`);
        } catch (notifErr) {
          console.error('[GroupTask] Notification insert error:', notifErr);
        }
      })();
    }

    emitChange(req, "group-tasks", "record_created", { id: groupTaskId });
    res.json({
      id: groupTaskId,
      task_id: taskId,
      assigned_count: employees.length,
    });
  } catch (err: any) {
    console.error("[GroupTask] Create error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET / — list all group tasks with progress stats ──
router.get("/", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const listResult: any = await db.execute(sql.raw(`
      SELECT
        gt.*,
        COUNT(ta.id) AS total_assigned,
        SUM(CASE WHEN ta.status = 'Completed' THEN 1 ELSE 0 END) AS completed_count,
        SUM(CASE WHEN ta.status = 'Pending' THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN ta.status = 'Not Applicable' THEN 1 ELSE 0 END) AS na_count
      FROM io_group_tasks gt
      LEFT JOIN io_task_assignments ta ON ta.group_task_id = gt.id
      GROUP BY gt.id
      ORDER BY gt.created_at DESC
    `));

    const rows = Array.isArray(listResult) ? listResult : [];
    res.json(rows.map((r: any) => ({
      ...r,
      planning_groups: r.planning_groups ? JSON.parse(r.planning_groups) : null,
      departments: r.departments ? JSON.parse(r.departments) : null,
      roles: r.roles ? JSON.parse(r.roles) : null,
      excluded_ohrs: r.excluded_ohrs ? JSON.parse(r.excluded_ohrs) : null,
      total_assigned: Number(r.total_assigned),
      completed_count: Number(r.completed_count),
      pending_count: Number(r.pending_count),
      na_count: Number(r.na_count),
      completion_pct: Number(r.total_assigned) > 0
        ? Math.round((Number(r.completed_count) / Math.max(Number(r.total_assigned) - Number(r.na_count || 0), 1)) * 100)
        : 0,
    })));
  } catch (err: any) {
    console.error("[GroupTask] List error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /my-tasks — unified task list for current user ──
router.get("/my-tasks", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const ohr = req.query.ohr as string;
    if (!ohr) return res.status(400).json({ error: "ohr query param required" });

    const ohrEsc = ohr.replace(/'/g, "''");
    const myTasksResult: any = await db.execute(sql.raw(`
      SELECT
        ta.id AS assignment_id,
        ta.status AS assignment_status,
        ta.completed_at,
        ta.attachment_url,
        gt.id AS group_task_id,
        gt.task_id,
        gt.title,
        gt.description,
        gt.category,
        gt.due_date,
        gt.status AS task_status,
        gt.created_by_name,
        gt.created_at,
        'group' AS task_type
      FROM io_task_assignments ta
      JOIN io_group_tasks gt ON gt.id = ta.group_task_id
      WHERE ta.employee_ohr = '${ohrEsc}'
        AND ta.status != 'Not Applicable'
        AND gt.status = 'Active'
      ORDER BY
        CASE WHEN ta.status = 'Pending' THEN 0 ELSE 1 END,
        gt.due_date IS NULL,
        gt.due_date ASC,
        gt.created_at DESC
    `));

    res.json(Array.isArray(myTasksResult) ? myTasksResult : []);
  } catch (err: any) {
    console.error("[GroupTask] My tasks error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /:id — single task detail with assignment list ──
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const taskId = parseInt(req.params.id);
    if (isNaN(taskId)) return res.status(400).json({ error: "Invalid task ID" });

    const taskRows: any = await db.execute(sql.raw(`
      SELECT * FROM io_group_tasks WHERE id = ${taskId}
    `));

    const taskArr = Array.isArray(taskRows) ? taskRows : [];
    if (taskArr.length === 0) return res.status(404).json({ error: "Task not found" });

    const task = taskArr[0];

    const assignments: any = await db.execute(sql.raw(`
      SELECT ta.*, e.supervisor_name, e.planning_group, e.actual_role
      FROM io_task_assignments ta
      LEFT JOIN io_employees e ON e.ohr_id = ta.employee_ohr
      WHERE ta.group_task_id = ${taskId}
      ORDER BY ta.status ASC, ta.employee_name ASC
    `));

    res.json({
      ...task,
      planning_groups: task.planning_groups ? JSON.parse(task.planning_groups) : null,
      departments: task.departments ? JSON.parse(task.departments) : null,
      roles: task.roles ? JSON.parse(task.roles) : null,
      excluded_ohrs: task.excluded_ohrs ? JSON.parse(task.excluded_ohrs) : null,
      assignments,
    });
  } catch (err: any) {
    console.error("[GroupTask] Detail error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /:id/complete — mark own assignment as completed ──
// Accepts either `attachment_url` (string, legacy) or `attachment_urls` (JSON array of {name,url})
router.post("/:id/complete", validate(groupTaskCompleteSchema), async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const groupTaskId = parseInt(req.params.id);
    const { ohr, attachment_url, attachment_urls } = req.body;
    if (!ohr || isNaN(groupTaskId)) {
      return res.status(400).json({ error: "ohr and valid task ID required" });
    }

    const now = new Date().toISOString();
    const ohrEsc = ohr.replace(/'/g, "''");

    // Support multiple attachments: store as JSON array string
    let attachValue: string | null = null;
    if (attachment_urls && Array.isArray(attachment_urls) && attachment_urls.length > 0) {
      attachValue = JSON.stringify(attachment_urls);
    } else if (attachment_url) {
      // Legacy single URL — wrap in array format for consistency
      attachValue = JSON.stringify([{ name: 'attachment', url: attachment_url }]);
    }
    const attachClause = attachValue ? `, attachment_url = '${attachValue.replace(/'/g, "''")}'` : '';

    const completeResult: any = await db.execute(sql.raw(`
      UPDATE io_task_assignments
      SET status = 'Completed', completed_at = '${now}'${attachClause}
      WHERE group_task_id = ${groupTaskId}
        AND employee_ohr = '${ohrEsc}'
        AND status = 'Pending'
    `));

    if ((Array.isArray(completeResult) ? completeResult.length : 0) === 0) {
      return res.status(404).json({ error: "No pending assignment found" });
    }

    emitChange(req, "group-tasks", "record_updated", { id: req.params.id, action: "complete" });
    res.json({ success: true, completed_at: now });
  } catch (err: any) {
    console.error("[GroupTask] Complete error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /:id/exclude — exclude specific people from a group task ──
router.post("/:id/exclude", validate(groupTaskExcludeSchema), async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const groupTaskId = parseInt(req.params.id);
    const { ohrs } = req.body; // array of OHR IDs to exclude — validated by Zod
    if (isNaN(groupTaskId)) {
      return res.status(400).json({ error: "Invalid task ID" });
    }

    const escaped = ohrs.map((o: string) => `'${o.replace(/'/g, "''")}'`).join(",");

    // Mark as Not Applicable instead of deleting (audit trail)
    const excludeResult: any = await db.execute(sql.raw(`
      UPDATE io_task_assignments
      SET status = 'Not Applicable'
      WHERE group_task_id = ${groupTaskId}
        AND employee_ohr IN (${escaped})
        AND status = 'Pending'
    `));

    // Update the excluded_ohrs list on the group task
    const taskRows: any = await db.execute(sql.raw(`
      SELECT excluded_ohrs FROM io_group_tasks WHERE id = ${groupTaskId}
    `));

    let existing: string[] = [];
    const firstRow = Array.isArray(taskRows) ? taskRows[0] : null;
    if (firstRow?.excluded_ohrs) {
      existing = JSON.parse(firstRow.excluded_ohrs);
    }
    const merged = Array.from(new Set([...existing, ...ohrs]));

    await db.execute(sql.raw(`
      UPDATE io_group_tasks
      SET excluded_ohrs = '${JSON.stringify(merged).replace(/'/g, "''")}'
      WHERE id = ${groupTaskId}
    `));

    emitChange(req, "group-tasks", "record_updated", { id: req.params.id, action: "exclude" });
    res.json({ success: true, excluded_count: Array.isArray(excludeResult) ? excludeResult.length : 0 });
  } catch (err: any) {
    console.error("[GroupTask] Exclude error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /:id/close — close a group task ──
router.post("/:id/close", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const groupTaskId = parseInt(req.params.id);
    if (isNaN(groupTaskId)) return res.status(400).json({ error: "Invalid task ID" });

    await db.execute(sql.raw(`
      UPDATE io_group_tasks SET status = 'Closed', updated_at = '${new Date().toISOString()}'
      WHERE id = ${groupTaskId}
    `));

    res.json({ success: true });
  } catch (err: any) {
    console.error("[GroupTask] Close error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
