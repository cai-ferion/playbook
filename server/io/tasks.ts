/**
 * Tasks (Helm) Domain Module
 * Extracted from io-routes.ts — handles Tasks CRUD, comments, file upload
 */
import { Router, Request, Response } from "express";
import { getDb } from "../db.js";
import { ioTasks, ioTaskComments } from "../../drizzle/schema.js";
import { eq, desc, asc } from "drizzle-orm";
import crypto from "crypto";
import { sendTaskAssignmentNotifications, generateTaskId } from "./shared.js";
import { emitChange } from "./emit-change.js";

const router = Router();

// GET /api/io/tasks - list tasks
router.get("/tasks", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });
    const { limit } = req.query;
    const rows = await db.select().from(ioTasks).orderBy(desc(ioTasks.id)).limit(Number(limit) || 2000);
    res.json(rows);
  } catch (err: any) {
    console.error("[IO API] tasks list error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/tasks - create a task
router.post("/tasks", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });
    const taskId = generateTaskId();
    const now = new Date().toISOString();
    const record = {
      ...req.body,
      task_id: taskId,
      status: req.body.status || 'Open',
      created_at: now,
      updated_at: now,
    };
    await db.insert(ioTasks).values(record);
    emitChange(req, "tasks", "record_created", { task_id: taskId });
    res.json({ ok: true, task_id: taskId, ...record });
    // Create in-app notifications for all assigned users (fire-and-forget)
    sendTaskAssignmentNotifications(record).catch((err: any) => {
      console.error('[IO API] Background task notification error:', err.message);
    });
  } catch (err: any) {
    console.error("[IO API] tasks create error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/io/tasks/:taskId - update a task
router.patch("/tasks/:taskId", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });
    const { taskId } = req.params;
    const now = new Date().toISOString();
    const updates = { ...req.body, updated_at: now };
    await db.update(ioTasks).set(updates).where(eq(ioTasks.task_id, taskId));
    emitChange(req, "tasks", "record_updated", { task_id: taskId });
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] tasks update error:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/io/tasks/:taskId - delete a task
router.delete("/tasks/:taskId", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });
    const { taskId } = req.params;
    await db.delete(ioTasks).where(eq(ioTasks.task_id, taskId));
    await db.delete(ioTaskComments).where(eq(ioTaskComments.task_id, taskId));
    emitChange(req, "tasks", "record_deleted", { task_id: taskId });
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] tasks delete error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/io/tasks/:taskId/comments - list comments for a task
router.get("/tasks/:taskId/comments", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });
    const { taskId } = req.params;
    const rows = await db.select().from(ioTaskComments).where(eq(ioTaskComments.task_id, taskId)).orderBy(asc(ioTaskComments.id));
    res.json(rows);
  } catch (err: any) {
    console.error("[IO API] task comments list error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/tasks/:taskId/comments - add a comment
router.post("/tasks/:taskId/comments", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });
    const { taskId } = req.params;
    const now = new Date().toISOString();
    const record = {
      ...req.body,
      task_id: taskId,
      created_at: now,
    };
    await db.insert(ioTaskComments).values(record);
    emitChange(req, "tasks", "record_updated", { task_id: taskId, sub: "comment" });
    res.json({ ok: true, ...record });
  } catch (err: any) {
    console.error("[IO API] task comment create error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/upload - upload a file to storage (base64 encoded)
router.post("/upload", async (req: Request, res: Response) => {
  try {
    const { fileName, contentType, data } = req.body;
    if (!fileName || !data) {
      return res.status(400).json({ error: "fileName and data (base64) are required" });
    }
    const { storagePut } = await import("../storage.js");
    const buffer = Buffer.from(data, "base64");
    const folder = req.body.folder || 'coaching-disputes';
    const key = `${folder}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const result = await storagePut(key, buffer, contentType || "application/octet-stream");
    res.json({ ok: true, url: result.url, key: result.key });
  } catch (err: any) {
    console.error("[IO API] upload error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
