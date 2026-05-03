/**
 * IO Validation Layer — Zod schemas + Express middleware
 * -------------------------------------------------------
 * Centralised input validation for critical write endpoints.
 * Each schema mirrors the DB column constraints from drizzle/schema.ts
 * and adds semantic rules (filing windows, date restrictions, enums).
 *
 * Usage:  router.post("/coaching", validate(coachingCreateSchema), handler)
 *
 * Design decisions:
 *  - .passthrough() on object schemas so existing columns we don't
 *    explicitly validate still flow through (backward-compat).
 *  - Errors are returned as { error: string, details: ZodIssue[] }
 *    so the frontend can render field-level messages.
 *  - Schemas are exported for direct use in Vitest tests.
 */

import { z, ZodSchema, ZodError } from "zod";
import type { Request, Response, NextFunction } from "express";

// ── Express middleware factory ──────────────────────────────────
export function validate(schema: ZodSchema, source: "body" | "query" = "body") {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const flat = result.error.flatten();
      const firstMsg =
        result.error.issues[0]?.message ?? "Validation failed";
      return res.status(400).json({
        error: firstMsg,
        details: result.error.issues,
        fieldErrors: flat.fieldErrors,
      });
    }
    // Replace req.body/query with the parsed (coerced + defaulted) data
    (req as any)[source] = result.data;
    next();
  };
}

// ── Reusable primitives ─────────────────────────────────────────
const ohrId = z.string().min(1, "OHR ID is required").max(20);
const varchar255 = z.string().max(255);
const varchar100 = z.string().max(100);
const varchar64 = z.string().max(64);
const varchar30 = z.string().max(30);
const email320 = z.string().max(320).optional();
const optionalText = z.string().optional();
const optionalVarchar = z.string().max(255).optional();

// ISO-ish date string: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss...
const dateString = z.string().regex(
  /^\d{4}-\d{2}-\d{2}/,
  "Date must start with YYYY-MM-DD format"
);

// ── Coaching schemas ────────────────────────────────────────────

/** POST /api/io/coaching — create a new coaching log */
export const coachingCreateSchema = z.object({
  coaching_type: varchar100.min(1, "coaching_type is required"),
  coach: varchar255.optional(),
  coach_ohr: ohrId,
  coaching_date: dateString,
  coachee: varchar255.optional(),
  coachee_ohr: ohrId,
  // Serialised by handler; accept string or array
  coachee_list: z.union([
    z.array(z.string()),
    z.string(),
    z.null(),
  ]).optional(),
  // Optional metadata fields — passthrough keeps them
  coach_meta_email: email320,
  coach_sup: optionalVarchar,
  coach_sup_email: email320,
  coach_pg: varchar100.optional(),
  coachee_meta_email: email320,
  coachee_sup: optionalVarchar,
  coachee_sup_email: email320,
  coachee_pg: varchar100.optional(),
  sme_joiner: optionalVarchar,
  sme_meta_email: email320,
  session_goal: optionalText,
  level_1_category: optionalVarchar,
  level_2_direct_cause: optionalVarchar,
  level_3_contributing_cause: optionalVarchar,
  level_4_deficiency: optionalVarchar,
  level_5_root_cause: optionalText,
  guidelines: optionalText,
  coaching_details: optionalText,
  status: varchar100.optional(),
  ack_date: varchar64.optional(),
  week_ending: varchar30.optional(),
  month: varchar30.optional(),
}).passthrough();

/** PATCH /api/io/coaching/:id — partial update */
export const coachingUpdateSchema = z.object({
  // All fields optional for partial update
  coaching_type: varchar100.optional(),
  coaching_date: dateString.optional(),
  coachee: varchar255.optional(),
  coachee_ohr: ohrId.optional(),
  coach: varchar255.optional(),
  coach_ohr: ohrId.optional(),
  session_goal: optionalText,
  coaching_details: optionalText,
  status: varchar100.optional(),
  guidelines: optionalText,
  ack_date: varchar64.optional(),
  coachee_list: z.union([
    z.array(z.string()),
    z.string(),
    z.null(),
  ]).optional(),
}).passthrough();

/** POST /api/io/coaching-rca — create an RCA entry */
export const coachingRcaCreateSchema = z.object({
  coaching_id: z.string().min(1, "coaching_id is required").max(50),
  level_1_category: optionalVarchar,
  level_2_direct_cause: optionalVarchar,
  level_3_contributing_cause: optionalVarchar,
  level_4_deficiency: optionalVarchar,
  level_5_root_cause: optionalText,
  guidelines: optionalText,
}).passthrough();

// ── Leaves schemas ──────────────────────────────────────────────

/** POST /api/io/leaves — file a new leave request */
export const leaveCreateSchema = z.object({
  leave_type: varchar100.min(1, "leave_type is required"),
  ohr_id: ohrId,
  full_name: varchar255.min(1, "full_name is required"),
  supervisor: varchar255.optional(),
  supervisor_email: email320,
  meta_email: email320,
  planning_group: varchar100.optional(),
  start_date: dateString,
  end_date: dateString.optional(),
  reason: optionalText,
  remarks: optionalText,
  attachments: optionalText,
}).passthrough();

/** POST /api/io/leaves/bulk-action — approve/reject multiple leaves */
export const leavesBulkActionSchema = z.object({
  leave_ids: z.array(z.number().int().positive()).min(1, "leave_ids array must not be empty"),
  action: z.enum(["approve", "reject"], {
    error: "action must be 'approve' or 'reject'",
  }),
  tier: z.enum(["tl", "om"], {
    error: "tier must be 'tl' or 'om'",
  }),
  reviewer_name: z.string().optional(),
  rejection_reason: z.string().optional(),
}).strict();

/** POST /api/io/leaves/cancel — cancel a leave */
export const leaveCancelSchema = z.object({
  leave_id: z.number().int().positive("leave_id must be a positive integer"),
}).strict();

// ── Attendance schemas ──────────────────────────────────────────

/** Single attendance row for bulk-import creates */
const attendanceCreateRow = z.object({
  id: z.string().min(1).max(64),
  ohr_id: ohrId,
  log_date: dateString,
  tag: z.string().max(50).optional(),
  upl_reason: optionalVarchar,
  remarks: optionalText,
  ot_hours: z.string().max(20).optional(),
  snap_full_name: optionalVarchar,
  snap_supervisor: optionalVarchar,
  snap_planning_group: varchar100.optional(),
  snap_shift_time: varchar100.optional(),
  snap_actual_role: varchar100.optional(),
  snap_billing_name: optionalVarchar,
  snap_status: z.string().max(50).optional(),
  role: varchar100.optional(),
  planning_group: varchar100.optional(),
  internal_role: varchar100.optional(),
  internal_planning_group: varchar100.optional(),
}).passthrough();

/** Single attendance row for bulk-import updates */
const attendanceUpdateRow = z.object({
  id: z.union([z.number().int().positive(), z.string().min(1)]),
  tag: z.string().max(50).optional(),
  is_locked: z.boolean().optional(),
  locked_at: varchar64.optional(),
}).passthrough();

/** POST /api/io/attendance/bulk-import — batch create/update attendance */
export const attendanceBulkImportSchema = z.object({
  updates: z.array(attendanceUpdateRow).optional().default([]),
  creates: z.array(attendanceCreateRow).optional().default([]),
}).refine(
  (data) => (data.updates?.length ?? 0) + (data.creates?.length ?? 0) > 0,
  { message: "At least one update or create row is required" }
);

/** PATCH /api/io/attendance/bulk-tag — batch update tags */
export const attendanceBulkTagSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "ids array must not be empty"),
  tag: z.string().max(50),
}).strict();

/** PATCH /api/io/attendance/bulk-status — batch update status fields */
export const attendanceBulkStatusSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "ids array must not be empty"),
  updates: z.record(z.string(), z.any()).refine(
    (obj) => Object.keys(obj).length > 0,
    { message: "updates object must not be empty" }
  ),
}).strict();
