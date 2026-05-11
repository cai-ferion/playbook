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

// ── Observability: fire-and-forget audit log for rejected payloads ──
// Logs: endpoint, method, actor OHR, failed field names, error messages.
// NEVER logs field values (PII protection). Silently swallows DB errors.
let _logRejection: ((entry: ValidationRejection) => void) | null = null;

// ── Volume cap: max rejections logged per endpoint per hour ──────
// Prevents log flooding from bots or broken clients.
// In-memory sliding window — resets naturally as entries expire.
const VOLUME_CAP_PER_HOUR = 10;
const VOLUME_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const _rejectionCounts = new Map<string, number[]>();

/** Exported for testing — allows overriding the cap and resetting state. */
export function _resetVolumeCap() {
  _rejectionCounts.clear();
}

/**
 * Returns true if the endpoint is under the volume cap (safe to log).
 * Prunes expired timestamps on each check to prevent memory leaks.
 */
function _isUnderVolumeCap(endpoint: string): boolean {
  const now = Date.now();
  const cutoff = now - VOLUME_WINDOW_MS;
  let timestamps = _rejectionCounts.get(endpoint);
  if (!timestamps) {
    timestamps = [];
    _rejectionCounts.set(endpoint, timestamps);
  }
  // Prune expired entries
  while (timestamps.length > 0 && timestamps[0] < cutoff) {
    timestamps.shift();
  }
  if (timestamps.length >= VOLUME_CAP_PER_HOUR) {
    return false; // Over cap — suppress this log
  }
  timestamps.push(now);
  return true;
}

export interface ValidationRejection {
  endpoint: string;
  method: string;
  actor_ohr: string;
  failed_fields: string[];
  error_summary: string;
  timestamp: string;
}

/**
 * Inject the logging function from outside (called once at boot).
 * This avoids a circular dependency on getDb() inside the validation module.
 */
export function setValidationLogger(fn: (entry: ValidationRejection) => void) {
  _logRejection = fn;
}

// ── Express middleware factory ──────────────────────────────────
export function validate(schema: ZodSchema, source: "body" | "query" = "body") {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const flat = result.error.flatten();
      const firstMsg =
        result.error.issues[0]?.message ?? "Validation failed";

      // Fire-and-forget: log rejection to audit log (no await, no throw)
      // Volume-capped: max 10 per endpoint per hour to prevent log flooding.
      if (_logRejection) {
        try {
          const endpoint = req.originalUrl || req.url;
          if (_isUnderVolumeCap(endpoint)) {
            const failedFields = result.error.issues.map((i) => i.path.join(".")).filter(Boolean);
            const actorOhr = (req as any).user?.ohr_id || (req as any).user?.openId || "unknown";
            _logRejection({
              endpoint,
              method: req.method,
              actor_ohr: actorOhr,
              failed_fields: Array.from(new Set(failedFields)),
              error_summary: firstMsg,
              timestamp: new Date().toISOString(),
            });
          }
        } catch { /* observability must never break the request */ }
      }

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
  leave_ids: z.array(z.string().min(1)).min(1, "leave_ids array must not be empty"),
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
  actor_ohr: z.string().max(20).optional(),
  actor_name: z.string().max(255).optional(),
}).strict();

/** PATCH /api/io/attendance/bulk-status — batch update status fields */
export const attendanceBulkStatusSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "ids array must not be empty"),
  updates: z.record(z.string(), z.any()).refine(
    (obj) => Object.keys(obj).length > 0,
    { message: "updates object must not be empty" }
  ),
}).strict();

// ── Permissions schemas ────────────────────────────────────────

/** PUT /api/io/permissions/:ohr_id — upsert permissions for a single employee */
export const permissionsUpdateSchema = z.object({
  permissions: z.record(z.string(), z.boolean()).refine(
    (obj) => Object.keys(obj).length > 0,
    { message: "permissions object must not be empty" }
  ),
  actor_ohr: ohrId.optional(),
  actor_name: varchar255.optional(),
}).passthrough();

/** POST /api/io/permissions/seed/:ohr_id — seed defaults for a new employee */
export const permissionsSeedSchema = z.object({
  role: z.string().min(1, "role is required").max(50),
}).strict();

/** POST /api/io/permissions/bulk-key-update — update a single key for all employees */
export const permissionsBulkKeyUpdateSchema = z.object({
  permission_key: z.string().min(1, "permission_key is required").max(100),
  granted: z.boolean({ message: "granted must be a boolean" }),
  actor_ohr: ohrId.optional(),
}).strict();

// ── Role Change schemas ────────────────────────────────────────

/** Single assignment in a role-change batch */
const roleChangeAssignment = z.object({
  ohr_id: ohrId,
  new_role: varchar100.min(1, "new_role is required"),
  new_pg: varchar100.min(1, "new_pg is required"),
  date_from: dateString,
  date_to: dateString,
}).passthrough();

/** POST /api/io/role-change/generate — generate role change records */
export const roleChangeGenerateSchema = z.object({
  week_ending: dateString,
  assignments: z.array(roleChangeAssignment).min(1, "assignments array must not be empty"),
}).passthrough();

// ── Corrective Actions schemas ─────────────────────────────────

/** POST /api/io/corrective-actions — create a new corrective action record */
export const correctiveActionCreateSchema = z.object({
  employee_name: varchar255.min(1, "employee_name is required"),
  ohr_id: ohrId,
  employee_email: email320,
  supervisor_name: optionalVarchar,
  supervisor_ohr: ohrId.optional(),
  supervisor_email: email320,
  planning_group: varchar100.optional(),
  actual_role: varchar100.optional(),
  nte_type: varchar100.optional(),
  date_of_incident: varchar64.optional(),
  incident_description: optionalText,
  policy_violated: optionalText,
  violations: z.union([z.string(), z.array(z.any()), z.null()]).optional(),
  linked_coaching_id: z.string().max(50).optional(),
  attachments: z.union([z.string(), z.array(z.any()), z.null()]).optional(),
  indicated_cap_level: varchar100.optional(),
  created_by: optionalVarchar,
  created_by_ohr: ohrId.optional(),
}).passthrough();

/** PATCH /api/io/corrective-actions/:id — update status/assign CAP */
export const correctiveActionUpdateSchema = z.object({
  action: z.string().max(50).optional(),
  cap_level: varchar100.optional(),
  remarks: optionalText,
  decision_by: optionalVarchar,
  decision_by_ohr: ohrId.optional(),
  cap_start_date: dateString.optional(),
  suspension_days: z.number().int().min(0).optional(),
  nod_issued: z.boolean().optional(),
  nod_summary: optionalText,
  // Employee response fields
  employee_response: optionalText,
  response_date: varchar64.optional(),
  status: varchar100.optional(),
}).passthrough();

/** POST /api/io/nte-build-assist/generate — AI-generate NTE narrative */
export const nteBuildAssistGenerateSchema = z.object({
  employee: z.object({
    full_name: varchar255.min(1, "employee.full_name is required"),
    ohr_id: ohrId,
    actual_role: varchar100.optional(),
    department: varchar100.optional(),
    supervisor_name: optionalVarchar,
    gender: z.string().max(20).optional(),
    sex: z.string().max(20).optional(),
  }).passthrough(),
  attendance: z.array(z.any()).optional(),
  coaching: z.array(z.any()).optional(),
  previous_ntes: z.array(z.any()).optional(),
  violation: z.any().optional(),
  violations: z.array(z.any()).optional(),
}).passthrough();

/** POST /api/io/nte-build-assist/docx — generate NTE DOCX document */
export const nteBuildAssistDocxSchema = z.object({
  employee: z.object({
    full_name: varchar255.min(1, "employee.full_name is required"),
    ohr_id: ohrId.optional(),
    actual_role: varchar100.optional(),
    department: varchar100.optional(),
    supervisor_name: optionalVarchar,
    gender: z.string().max(20).optional(),
    sex: z.string().max(20).optional(),
  }).passthrough(),
  narrative: z.string().min(1, "narrative is required"),
  date: z.string().optional(),
  policy_sections: z.union([z.array(z.string()), z.string()]).optional(),
}).passthrough();

/** POST /api/io/cap-build-assist/generate — AI-generate CAP deliberation */
export const capBuildAssistGenerateSchema = z.object({
  employee: z.object({
    full_name: varchar255.min(1, "employee.full_name is required"),
    ohr_id: ohrId,
    actual_role: varchar100.optional(),
  }).passthrough(),
  cap_level: z.string().min(1, "cap_level is required").max(50),
  violation: z.any().optional(),
  violations: z.array(z.any()).optional(),
  explanation_date: z.string().optional(),
  explanation_summary: optionalText,
  nte_narrative: optionalText,
  previous_caps: z.array(z.any()).optional(),
}).passthrough();

/** POST /api/io/cap-build-assist/docx — generate CAP DOCX document */
export const capBuildAssistDocxSchema = z.object({
  employee: z.object({
    full_name: varchar255.min(1, "employee.full_name is required"),
    ohr_id: ohrId.optional(),
    actual_role: varchar100.optional(),
  }).passthrough(),
  cap_level: z.string().min(1, "cap_level is required").max(50),
  explanation_date: z.string().optional(),
  explanation_summary: optionalText,
  violation_section: z.string().optional(),
  violation_subsection: z.string().optional(),
  violations: z.array(z.any()).optional(),
  flm_name: optionalVarchar,
  issuance_date: z.string().optional(),
  nte_response_text: optionalText,
}).passthrough();

// ── Tardiness schemas ──────────────────────────────────────────

/** Single row in a tardiness bulk upload */
const tardinessUploadRow = z.object({
  ohr: z.string().min(1, "ohr is required").max(20).optional(),
  OHR: z.string().min(1).max(20).optional(),
  ohr_id: z.string().min(1).max(20).optional(),
  date: z.string().optional(),
  tardiness_date: z.string().optional(),
  minutes: z.union([z.number(), z.string()]).optional(),
  tardiness_minutes: z.union([z.number(), z.string()]).optional(),
}).passthrough().refine(
  (row) => !!(row.ohr || row.OHR || row.ohr_id),
  { message: "Each row must have an OHR identifier (ohr, OHR, or ohr_id)" }
);

/** POST /api/io/tardiness/upload — bulk upload tardiness records */
export const tardinessUploadSchema = z.object({
  records: z.array(tardinessUploadRow).min(1, "records array must not be empty"),
}).passthrough();

/** PATCH /api/io/tardiness/:id — update a single tardiness record */
export const tardinessUpdateSchema = z.object({
  validation_status: z.enum(["Valid", "Invalid", "Pending"], {
    error: "validation_status must be 'Valid', 'Invalid', or 'Pending'",
  }).optional(),
  remarks: optionalText,
  unlock: z.boolean().optional(),
}).passthrough();

/** PATCH /api/io/tardiness/bulk-validate — bulk validate tardiness records */
export const tardinessBulkValidateSchema = z.object({
  ids: z.array(z.union([z.number().int().positive(), z.string().min(1)])).min(1, "ids array must not be empty"),
  validation_status: z.enum(["Valid", "Invalid"], {
    error: "validation_status must be 'Valid' or 'Invalid'",
  }),
  remarks: optionalText,
}).strict();

// ── Group Tasks schemas ────────────────────────────────────────

/** POST /api/io/group-tasks — create a new group task */
export const groupTaskCreateSchema = z.object({
  title: z.string().min(1, "title is required").max(500),
  description: optionalText,
  category: optionalVarchar,
  planning_groups: z.union([z.array(z.string()), z.null()]).optional(),
  departments: z.union([z.array(z.string()), z.null()]).optional(),
  roles: z.union([z.array(z.string()), z.null()]).optional(),
  excluded_ohrs: z.union([z.array(z.string()), z.null()]).optional(),
  due_date: dateString.optional(),
  created_by_ohr: ohrId,
  created_by_name: optionalVarchar,
}).passthrough();

/** POST /api/io/group-tasks/preview — preview target employees */
export const groupTaskPreviewSchema = z.object({
  planning_groups: z.union([z.array(z.string()), z.null()]).optional(),
  departments: z.union([z.array(z.string()), z.null()]).optional(),
  roles: z.union([z.array(z.string()), z.null()]).optional(),
  excluded_ohrs: z.union([z.array(z.string()), z.null()]).optional(),
}).passthrough();

/** POST /api/io/group-tasks/:id/complete — mark assignment as completed */
export const groupTaskCompleteSchema = z.object({
  ohr: ohrId,
  attachment_url: z.string().optional(),
  attachment_urls: z.array(z.any()).optional(),
}).passthrough();

/** POST /api/io/group-tasks/:id/exclude — exclude OHRs from a group task */
export const groupTaskExcludeSchema = z.object({
  ohrs: z.array(z.string().min(1)).min(1, "ohrs array must not be empty"),
}).strict();

// ── Shift Extension schemas ────────────────────────────────────

/** POST /api/io/shift-extensions — create a new shift extension request */
export const shiftExtensionCreateSchema = z.object({
  agent_ohr: ohrId,
  agent_name: optionalVarchar,
  supervisor_ohr: ohrId.optional(),
  supervisor_name: optionalVarchar,
  planning_group: varchar100.optional(),
  shift_date: dateString,
  extension_minutes: z.union([
    z.number().int().positive("extension_minutes must be positive"),
    z.string().min(1, "extension_minutes is required"),
  ]),
  reason_details: z.string().min(1, "reason_details is required"),
}).passthrough();

/** PATCH /api/io/shift-extensions/:id/tl-action — TL approve/reject */
export const shiftExtensionActionSchema = z.object({
  action: z.enum(["Approved", "Rejected"], {
    error: "action must be 'Approved' or 'Rejected'",
  }),
  comments: optionalText,
  actioned_by: optionalVarchar,
}).passthrough();
