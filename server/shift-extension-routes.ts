/**
 * Shift Extension Request Routes
 * Agent → TL Approval → OM Final Approval
 * Notifications sent to Agent + TL only on OM approval.
 */

import type { Express, Request, Response } from "express";
import { getDb } from "./db.js";
import { ioShiftExtensions, ioNotifications } from "../drizzle/schema.js";
import { eq, desc, sql, and } from "drizzle-orm";

export function registerShiftExtensionRoutes(app: Express) {
  const BASE = "/api/io/shift-extensions";

  // ===== GET all shift extensions (with role-based filtering via query) =====
  app.get(BASE, async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 500, 2000);
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Database unavailable" });
      const rows = await db
        .select()
        .from(ioShiftExtensions)
        .orderBy(desc(ioShiftExtensions.id))
        .limit(limit);
      res.json(rows);
    } catch (e: any) {
      console.error("[shift-ext] GET error:", e.message);
      res.status(500).json({ error: "Failed to fetch shift extensions" });
    }
  });

  // ===== POST create a new shift extension request =====
  app.post(BASE, async (req: Request, res: Response) => {
    try {
      const {
        agent_ohr, agent_name, supervisor_ohr, supervisor_name,
        planning_group, shift_date, extension_minutes,
        reason_details
      } = req.body;

      if (!agent_ohr || !shift_date || !extension_minutes || !reason_details) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Database unavailable" });
      const reqId = "SE-" + Date.now().toString(36).toUpperCase();
      const now = new Date().toISOString();

      await db.insert(ioShiftExtensions).values({
        request_id: reqId,
        agent_ohr,
        agent_name: agent_name || "",
        supervisor_ohr: supervisor_ohr || "",
        supervisor_name: supervisor_name || "",
        planning_group: planning_group || "",
        shift_date,
        extension_minutes: parseInt(extension_minutes) || 0,
        reason_details,
        tl_status: "Pending",
        om_status: "Pending",
        overall_status: "Pending TL",
        created_at: now,
        updated_at: now,
      });

      res.json({ request_id: reqId, message: "Shift extension request created" });
    } catch (e: any) {
      console.error("[shift-ext] POST error:", e.message);
      res.status(500).json({ error: "Failed to create shift extension request" });
    }
  });

  // ===== GET single shift extension by id =====
  app.get(`${BASE}/:id`, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Database unavailable" });
      const rows = await db
        .select()
        .from(ioShiftExtensions)
        .where(eq(ioShiftExtensions.id, id))
        .limit(1);

      if (rows.length === 0) return res.status(404).json({ error: "Not found" });
      res.json(rows[0]);
    } catch (e: any) {
      console.error("[shift-ext] GET/:id error:", e.message);
      res.status(500).json({ error: "Failed to fetch shift extension" });
    }
  });

  // ===== PATCH TL action (approve/reject) =====
  app.patch(`${BASE}/:id/tl-action`, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

      const { action, comments, actioned_by } = req.body;
      if (!action || !["Approved", "Rejected"].includes(action)) {
        return res.status(400).json({ error: "Invalid action. Must be Approved or Rejected" });
      }

      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Database unavailable" });
      const now = new Date().toISOString();
      const newOverall = action === "Approved" ? "Pending OM" : "Rejected";

      await db
        .update(ioShiftExtensions)
        .set({
          tl_status: action,
          tl_comments: comments || null,
          tl_actioned_by: actioned_by || "",
          tl_actioned_at: now,
          overall_status: newOverall,
          updated_at: now,
        })
        .where(eq(ioShiftExtensions.id, id));

      res.json({ message: `TL ${action.toLowerCase()} shift extension`, overall_status: newOverall });
    } catch (e: any) {
      console.error("[shift-ext] TL action error:", e.message);
      res.status(500).json({ error: "Failed to process TL action" });
    }
  });

  // ===== PATCH OM action (approve/reject) — triggers notifications =====
  app.patch(`${BASE}/:id/om-action`, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

      const { action, comments, actioned_by } = req.body;
      if (!action || !["Approved", "Rejected"].includes(action)) {
        return res.status(400).json({ error: "Invalid action. Must be Approved or Rejected" });
      }

      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Database unavailable" });
      const now = new Date().toISOString();

      await db
        .update(ioShiftExtensions)
        .set({
          om_status: action,
          om_comments: comments || null,
          om_actioned_by: actioned_by || "",
          om_actioned_at: now,
          overall_status: action,
          updated_at: now,
        })
        .where(eq(ioShiftExtensions.id, id));

      // Fetch the record to get agent/TL info for notifications
      const rows = await db
        .select()
        .from(ioShiftExtensions)
        .where(eq(ioShiftExtensions.id, id))
        .limit(1);

      // Send notifications only on OM Approval
      if (action === "Approved" && rows.length > 0) {
        const ext = rows[0];
        const shiftDateReadable = ext.shift_date
          ? new Date(ext.shift_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
          : ext.shift_date;

        const notifPayload = [
          // Notify the agent
          {
            type: "shift_extension_approved",
            title: "Shift Extension Approved",
            message: `Your shift extension request for ${shiftDateReadable} (${ext.extension_minutes} min) has been approved.`,
            target_ohr: ext.agent_ohr || "",
            is_read: false,
            created_at: now,
            metadata: JSON.stringify({
              request_id: ext.request_id,
              shift_date: ext.shift_date,
              extension_minutes: ext.extension_minutes,
            }),
          },
          // Notify the TL
          {
            type: "shift_extension_approved",
            title: "Shift Extension Approved",
            message: `Shift extension for ${ext.agent_name} on ${shiftDateReadable} (${ext.extension_minutes} min) has been approved by OM.`,
            target_ohr: ext.supervisor_ohr || "",
            is_read: false,
            created_at: now,
            metadata: JSON.stringify({
              request_id: ext.request_id,
              agent_name: ext.agent_name,
              shift_date: ext.shift_date,
              extension_minutes: ext.extension_minutes,
            }),
          },
        ].filter(n => n.target_ohr);

        // Fire-and-forget notification insertion
        if (notifPayload.length > 0) {
          db.insert(ioNotifications).values(notifPayload).catch((err) => {
            console.error("[shift-ext] Notification insert error:", err.message);
          });
        }
      }

      res.json({ message: `OM ${action.toLowerCase()} shift extension`, overall_status: action });
    } catch (e: any) {
      console.error("[shift-ext] OM action error:", e.message);
      res.status(500).json({ error: "Failed to process OM action" });
    }
  });
}
