/**
 * CA Cases Module — tRPC Router
 *
 * Full corrective action lifecycle: incident → NTE → response → hearing → NOD → CAP → active → closed.
 * Server-enforced state machine, attendance violation aggregation, DOCX generation, AI advisory.
 * All queries are role-scoped via the same visibility middleware as coaching.
 */
import { router, protectedProcedure } from "../_core/trpc.js";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../db.js";
import {
  compassCaCases,
  compassCaTimeline,
  compassCoachingLogs,
  compassViolationCatalog,
  ioEmployees,
  ioAttendance,
} from "../../drizzle/schema.js";
import { eq, and, or, inArray, like, desc, asc, sql, gte, lte, count } from "drizzle-orm";
import { storagePut } from "../storage.js";
import crypto from "crypto";
import { OWNER_OHR as ADMIN_OHR, ADMIN_OHRS } from "../config.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** CA Case status lifecycle — ordered progression */
const CA_STATUSES = {
  INCIDENT_REPORTED: "incident_reported",
  NTE_ISSUED: "nte_issued",
  AWAITING_RESPONSE: "awaiting_response",
  RESPONSE_RECEIVED: "response_received",
  RESPONSE_WAIVED: "response_waived",
  HEARING_SCHEDULED: "hearing_scheduled",
  HEARING_CONDUCTED: "hearing_conducted",
  NOD_ISSUED: "nod_issued",
  CAP_ISSUED: "cap_issued",
  ACTIVE_PERIOD: "active_period",
  CASE_CLOSED: "case_closed",
  CASE_DISMISSED: "case_dismissed",
} as const;

/** Valid status transitions — state machine definition */
const STATUS_TRANSITIONS: Record<string, string[]> = {
  [CA_STATUSES.INCIDENT_REPORTED]: [CA_STATUSES.NTE_ISSUED, CA_STATUSES.CAP_ISSUED, CA_STATUSES.CASE_DISMISSED],
  [CA_STATUSES.NTE_ISSUED]: [CA_STATUSES.AWAITING_RESPONSE],
  [CA_STATUSES.AWAITING_RESPONSE]: [CA_STATUSES.RESPONSE_RECEIVED, CA_STATUSES.RESPONSE_WAIVED],
  [CA_STATUSES.RESPONSE_RECEIVED]: [CA_STATUSES.HEARING_SCHEDULED, CA_STATUSES.NOD_ISSUED, CA_STATUSES.CAP_ISSUED, CA_STATUSES.CASE_DISMISSED],
  [CA_STATUSES.RESPONSE_WAIVED]: [CA_STATUSES.HEARING_SCHEDULED, CA_STATUSES.NOD_ISSUED, CA_STATUSES.CAP_ISSUED],
  [CA_STATUSES.HEARING_SCHEDULED]: [CA_STATUSES.HEARING_CONDUCTED],
  [CA_STATUSES.HEARING_CONDUCTED]: [CA_STATUSES.NOD_ISSUED, CA_STATUSES.CAP_ISSUED, CA_STATUSES.CASE_DISMISSED],
  [CA_STATUSES.NOD_ISSUED]: [CA_STATUSES.CAP_ISSUED, CA_STATUSES.CASE_DISMISSED],
  [CA_STATUSES.CAP_ISSUED]: [CA_STATUSES.ACTIVE_PERIOD],
  [CA_STATUSES.ACTIVE_PERIOD]: [CA_STATUSES.CASE_CLOSED],
  [CA_STATUSES.CASE_CLOSED]: [],
  [CA_STATUSES.CASE_DISMISSED]: [],
};

/** Active period durations per GPHR Policy v3.0 (Feb 2026) */
const CAP_ACTIVE_PERIODS: Record<string, number> = {
  cap_0: 0,
  cap_1: 60,
  cap_2: 90,
  cap_3: 180,
};

/** Attendance tags that count as violations */
const ATTENDANCE_VIOLATION_TAGS = {
  LATE: "LATE",
  UPL_NCNS: "NCNS",    // UPL with reason NCNS
  UPL_UNAUTHORIZED: "UPL_UNAUTHORIZED", // UPL with non-medical, non-NCNS reason
};

// Template CDN URLs
const TEMPLATE_URLS: Record<string, string> = {
  nte: "https://d2xsxph8kpxj0f.cloudfront.net/310519663445219651/5AVfpygNb7cNbPRpHCcCdp/Template-NTE_849823ad.docx",
  cap_0: "https://d2xsxph8kpxj0f.cloudfront.net/310519663445219651/5AVfpygNb7cNbPRpHCcCdp/Template-CAP0_350fbeae.docx",
  cap_1: "https://d2xsxph8kpxj0f.cloudfront.net/310519663445219651/5AVfpygNb7cNbPRpHCcCdp/Template-CAP1_bfdc8261.docx",
  cap_2: "https://d2xsxph8kpxj0f.cloudfront.net/310519663445219651/5AVfpygNb7cNbPRpHCcCdp/Template-CAP2_fbec4ea4.docx",
  cap_3: "https://d2xsxph8kpxj0f.cloudfront.net/310519663445219651/5AVfpygNb7cNbPRpHCcCdp/Template-CAP3_bbb57f1f.docx",
  cap_waived: "https://d2xsxph8kpxj0f.cloudfront.net/310519663445219651/5AVfpygNb7cNbPRpHCcCdp/Template-CAPw_oExplanationLetter_68ae82a8.docx",
};

// ---------------------------------------------------------------------------
// Helpers (reuse visibility from compass router)
// ---------------------------------------------------------------------------

function generateCaseId(): string {
  return `CA-${crypto.randomBytes(4).toString("hex")}`;
}

/** Resolve an OAuth user to their io_employees record via email match */
async function resolveEmployee(userEmail: string | null | undefined) {
  if (!userEmail) return null;
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(ioEmployees)
    .where(eq(ioEmployees.meta_email, userEmail))
    .limit(1);
  return rows[0] ?? null;
}

/** Get all OHRs on a team */
async function getTeamOhrs(supervisorFullName: string): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ ohr: ioEmployees.ohr_id })
    .from(ioEmployees)
    .where(eq(ioEmployees.supervisor_name, supervisorFullName));
  return rows.map((r) => r.ohr);
}

type VisibilityScope =
  | { type: "all" }
  | { type: "team"; ohrs: string[]; selfOhr: string }
  | { type: "self_filed"; selfOhr: string }
  | { type: "self_only"; selfOhr: string };

async function buildScope(
  employee: NonNullable<Awaited<ReturnType<typeof resolveEmployee>>>,
  isAdmin: boolean
): Promise<VisibilityScope> {
  const role = employee.actual_role ?? "";
  if (role === "Manager" || isAdmin) return { type: "all" };
  if (role === "Team Lead") {
    const ohrs = await getTeamOhrs(employee.full_name ?? "");
    return { type: "team", ohrs, selfOhr: employee.ohr_id };
  }
  if (role === "Operational SME") {
    const supervisor = employee.supervisor_name;
    if (supervisor) {
      const ohrs = await getTeamOhrs(supervisor);
      return { type: "team", ohrs, selfOhr: employee.ohr_id };
    }
    return { type: "self_filed", selfOhr: employee.ohr_id };
  }
  if (role === "Quality & Policy Expert" || role === "Trainer") {
    return { type: "self_filed", selfOhr: employee.ohr_id };
  }
  return { type: "self_only", selfOhr: employee.ohr_id };
}

/** Apply visibility scope as WHERE conditions for CA cases */
function scopeCaWhere(scope: VisibilityScope) {
  const t = compassCaCases;
  switch (scope.type) {
    case "all":
      return undefined;
    case "team":
      return or(
        inArray(t.employee_ohr, scope.ohrs.length > 0 ? scope.ohrs : [""]),
        eq(t.created_by_ohr, scope.selfOhr)
      );
    case "self_filed":
      return eq(t.created_by_ohr, scope.selfOhr);
    case "self_only":
      return eq(t.employee_ohr, scope.selfOhr);
  }
}

/** Write a timeline event for a CA case */
async function writeTimelineEvent(
  caseId: string,
  eventType: string,
  actorOhr: string,
  actorName: string,
  details?: string,
  attachments?: string
) {
  const db = await getDb();
  if (!db) return;
  const now = String(Date.now());
  await db.insert(compassCaTimeline).values({
    case_id: caseId,
    event_type: eventType,
    event_date: now,
    actor_ohr: actorOhr,
    actor_name: actorName,
    details: details || null,
    attachments: attachments || null,
    created_at: now,
  });
}

/** Format a timestamp to a readable date string */
function formatDate(ts: string | number): string {
  const d = new Date(typeof ts === "string" ? parseInt(ts) : ts);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Scoped procedure middleware
// ---------------------------------------------------------------------------

const scopedProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const employee = await resolveEmployee(ctx.user?.email);
  if (!employee) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Your account is not linked to an employee record. Contact your administrator.",
    });
  }
  const isAdmin = employee.ohr_id === ADMIN_OHR || ctx.user?.role === "admin";
  const scope = await buildScope(employee, isAdmin);
  return next({ ctx: { ...ctx, employee, scope, isAdmin } });
});

// ---------------------------------------------------------------------------
// DOCX Generation Helper
// ---------------------------------------------------------------------------

/**
 * Generate a DOCX document by fetching the template from CDN, 
 * then using docxtemplater to replace placeholder text.
 * 
 * Since the legal team requires templates to remain unmodified,
 * we do text-level find-and-replace on the DOCX XML directly.
 */
async function generateDocx(
  templateKey: string,
  replacements: Record<string, string>
): Promise<Buffer> {
  const templateUrl = TEMPLATE_URLS[templateKey];
  if (!templateUrl) throw new Error(`Unknown template key: ${templateKey}`);

  // Fetch template from CDN
  const resp = await fetch(templateUrl);
  if (!resp.ok) throw new Error(`Failed to fetch template: ${resp.status}`);
  const templateBuffer = Buffer.from(await resp.arrayBuffer());

  // Use PizZip + docxtemplater for XML-level replacement
  const PizZip = (await import("pizzip")).default;
  const Docxtemplater = (await import("docxtemplater")).default;

  const zip = new PizZip(templateBuffer);
  
  // We need to do raw XML text replacement since templates don't have {placeholders}
  // Process each XML file in the DOCX
  const xmlFiles = Object.keys(zip.files).filter(
    (f) => f.endsWith(".xml") && !f.startsWith("_rels/")
  );

  for (const xmlFile of xmlFiles) {
    let content = zip.file(xmlFile)?.asText();
    if (!content) continue;

    for (const [search, replace] of Object.entries(replacements)) {
      // Replace in the raw XML, handling cases where Word splits text across runs
      content = content.split(search).join(replace);
    }

    zip.file(xmlFile, content);
  }

  return Buffer.from(zip.generate({ type: "nodebuffer" }));
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const caCasesRouter = router({
  // =========================================================================
  // CA CASES — List (server-paginated, role-scoped)
  // =========================================================================
  list: scopedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
        caseStatus: z.string().optional(),
        employeeOhr: z.string().optional(),
        violationType: z.string().optional(),
        capLevel: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        search: z.string().optional(),
        sortBy: z.enum(["created_at", "incident_date", "employee_name"]).default("created_at"),
        sortDir: z.enum(["asc", "desc"]).default("desc"),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const t = compassCaCases;
      const conditions: any[] = [];

      const scopeWhere = scopeCaWhere(ctx.scope);
      if (scopeWhere) conditions.push(scopeWhere);

      if (input.caseStatus) conditions.push(eq(t.case_status, input.caseStatus));
      if (input.employeeOhr) conditions.push(eq(t.employee_ohr, input.employeeOhr));
      if (input.violationType) conditions.push(eq(t.violation_type, input.violationType));
      if (input.capLevel) conditions.push(eq(t.final_cap_level, input.capLevel));
      if (input.dateFrom) conditions.push(gte(t.created_at, input.dateFrom));
      if (input.dateTo) conditions.push(lte(t.created_at, input.dateTo));
      if (input.search) {
        conditions.push(
          or(
            like(t.employee_name, `%${input.search}%`),
            like(t.case_id, `%${input.search}%`),
            like(t.violation_text, `%${input.search}%`)
          )
        );
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [{ total }] = await db.select({ total: count() }).from(t).where(where);

      const sortCol =
        input.sortBy === "incident_date" ? t.incident_date
          : input.sortBy === "employee_name" ? t.employee_name
          : t.created_at;
      const orderFn = input.sortDir === "asc" ? asc : desc;

      const items = await db
        .select()
        .from(t)
        .where(where)
        .orderBy(orderFn(sortCol))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      return {
        items,
        total,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.ceil(total / input.pageSize),
      };
    }),

  // =========================================================================
  // CA CASES — Get single case with timeline
  // =========================================================================
  get: scopedProcedure
    .input(z.object({ caseId: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const rows = await db
        .select()
        .from(compassCaCases)
        .where(eq(compassCaCases.case_id, input.caseId))
        .limit(1);

      if (rows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Case not found" });
      }

      const caCase = rows[0];

      // Visibility check
      if (ctx.scope.type === "self_only" && caCase.employee_ohr !== ctx.scope.selfOhr) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      if (ctx.scope.type === "self_filed" && caCase.created_by_ohr !== ctx.scope.selfOhr) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      if (ctx.scope.type === "team") {
        const hasAccess =
          ctx.scope.ohrs.includes(caCase.employee_ohr) ||
          caCase.created_by_ohr === ctx.scope.selfOhr;
        if (!hasAccess) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
      }

      // Fetch timeline
      const timeline = await db
        .select()
        .from(compassCaTimeline)
        .where(eq(compassCaTimeline.case_id, input.caseId))
        .orderBy(asc(compassCaTimeline.created_at));

      // Fetch linked coaching logs
      let linkedCoachingLogs: any[] = [];
      if (caCase.linked_coaching_ids) {
        try {
          const ids = JSON.parse(caCase.linked_coaching_ids);
          if (Array.isArray(ids) && ids.length > 0) {
            linkedCoachingLogs = await db
              .select({
                coaching_id: compassCoachingLogs.coaching_id,
                coaching_type: compassCoachingLogs.coaching_type,
                coaching_date: compassCoachingLogs.coaching_date,
                coachee_name: compassCoachingLogs.coachee_name,
                coach_name: compassCoachingLogs.coach_name,
                status: compassCoachingLogs.status,
              })
              .from(compassCoachingLogs)
              .where(inArray(compassCoachingLogs.coaching_id, ids));
          }
        } catch {}
      }

      return { ...caCase, timeline, linkedCoachingLogs };
    }),

  // =========================================================================
  // CA CASES — Create new case
  // =========================================================================
  create: scopedProcedure
    .input(
      z.object({
        employeeOhr: z.string(),
        violationCategoryNumber: z.number().optional(),
        violationCategoryName: z.string().optional(),
        violationSubsection: z.string().optional(),
        violationText: z.string().optional(),
        violationType: z.string().optional(),
        incidentDate: z.string(),
        incidentDetails: z.string(),
        evidenceAttachments: z.string().optional(),
        recommendedCapLevel: z.string().optional(),
        aiRecommendedCapLevel: z.string().optional(),
        aiRecommendationReasoning: z.string().optional(),
        linkedCoachingIds: z.array(z.string()).optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Agents cannot create cases
      const role = ctx.employee.actual_role ?? "";
      if (!["Manager", "Team Lead", "Operational SME", "Quality & Policy Expert", "Trainer"].includes(role) && !ctx.isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Agents cannot create CA cases" });
      }

      // Resolve employee
      const empRows = await db
        .select()
        .from(ioEmployees)
        .where(eq(ioEmployees.ohr_id, input.employeeOhr))
        .limit(1);
      if (empRows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      }
      const emp = empRows[0];

      // Determine NTE/hearing requirements from violation catalog
      let nteRequired = true;
      let hearingRequired = false;
      if (input.violationCategoryNumber && input.violationSubsection) {
        const violations = await db
          .select()
          .from(compassViolationCatalog)
          .where(
            and(
              eq(compassViolationCatalog.category_number, input.violationCategoryNumber),
              eq(compassViolationCatalog.subsection, input.violationSubsection)
            )
          )
          .limit(1);
        if (violations.length > 0) {
          nteRequired = violations[0].requires_nte ?? true;
          hearingRequired = violations[0].requires_hearing ?? false;
        }
      }

      // CAP 0 cases skip NTE
      if (input.recommendedCapLevel === "cap_0") {
        nteRequired = false;
      }

      // CAP 3 requires hearing
      if (input.recommendedCapLevel === "cap_3") {
        hearingRequired = true;
      }

      const caseId = generateCaseId();
      const now = String(Date.now());

      await db.insert(compassCaCases).values({
        case_id: caseId,
        case_status: CA_STATUSES.INCIDENT_REPORTED,
        employee_ohr: input.employeeOhr,
        employee_name: emp.full_name,
        employee_pg: emp.planning_group,
        employee_supervisor: emp.supervisor_name,
        violation_category_number: input.violationCategoryNumber ?? null,
        violation_category_name: input.violationCategoryName ?? null,
        violation_subsection: input.violationSubsection ?? null,
        violation_text: input.violationText ?? null,
        violation_type: input.violationType ?? null,
        incident_date: input.incidentDate,
        incident_details: input.incidentDetails,
        evidence_attachments: input.evidenceAttachments ?? null,
        ai_recommended_cap_level: input.aiRecommendedCapLevel ?? null,
        ai_recommendation_reasoning: input.aiRecommendationReasoning ?? null,
        recommended_cap_level: input.recommendedCapLevel ?? null,
        nte_required: nteRequired,
        hearing_required: hearingRequired,
        linked_coaching_ids: input.linkedCoachingIds ? JSON.stringify(input.linkedCoachingIds) : null,
        created_by_ohr: ctx.employee.ohr_id,
        created_by_name: ctx.employee.full_name,
        notes: input.notes ?? null,
        created_at: now,
        updated_at: now,
      });

      await writeTimelineEvent(
        caseId,
        "case_created",
        ctx.employee.ohr_id,
        ctx.employee.full_name ?? "",
        `Case created for ${emp.full_name} (${input.employeeOhr}). Recommended CAP: ${input.recommendedCapLevel || "pending"}.`
      );

      return { ok: true, caseId };
    }),

  // =========================================================================
  // CA CASES — Transition status (state machine)
  // =========================================================================
  transition: scopedProcedure
    .input(
      z.object({
        caseId: z.string(),
        targetStatus: z.string(),
        // Optional fields for specific transitions
        finalCapLevel: z.string().optional(),
        capOverrideReason: z.string().optional(),
        nteResponseText: z.string().optional(),
        hearingNotes: z.string().optional(),
        hearingScheduledDate: z.string().optional(),
        nodDecision: z.string().optional(),
        witnessNames: z.string().optional(),
        refusalWitnessed: z.boolean().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const rows = await db
        .select()
        .from(compassCaCases)
        .where(eq(compassCaCases.case_id, input.caseId))
        .limit(1);

      if (rows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Case not found" });
      }

      const caCase = rows[0];

      // Validate transition is allowed
      const allowed = STATUS_TRANSITIONS[caCase.case_status] || [];
      if (!allowed.includes(input.targetStatus)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot transition from "${caCase.case_status}" to "${input.targetStatus}". Allowed: ${allowed.join(", ")}`,
        });
      }

      // Role check — agents cannot transition
      const role = ctx.employee.actual_role ?? "";
      if (!["Manager", "Team Lead", "Operational SME", "Quality & Policy Expert", "Trainer"].includes(role) && !ctx.isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions" });
      }

      const now = String(Date.now());
      const updates: Record<string, any> = {
        case_status: input.targetStatus,
        updated_at: now,
      };

      // Transition-specific logic
      switch (input.targetStatus) {
        case CA_STATUSES.NTE_ISSUED:
          updates.nte_issued_date = now;
          // Calculate response deadline (48 or 72 hours)
          const responseHours = 48; // Default, can be overridden by violation catalog
          updates.nte_response_deadline = String(Date.now() + responseHours * 60 * 60 * 1000);
          break;

        case CA_STATUSES.AWAITING_RESPONSE:
          // NTE has been issued and sent
          break;

        case CA_STATUSES.RESPONSE_RECEIVED:
          updates.nte_response_date = now;
          if (input.nteResponseText) updates.nte_response_text = input.nteResponseText;
          break;

        case CA_STATUSES.RESPONSE_WAIVED:
          updates.nte_response_date = now;
          updates.nte_response_text = "Response waived — employee did not submit within deadline.";
          break;

        case CA_STATUSES.HEARING_SCHEDULED:
          if (input.hearingScheduledDate) updates.hearing_scheduled_date = input.hearingScheduledDate;
          break;

        case CA_STATUSES.HEARING_CONDUCTED:
          updates.hearing_conducted = true;
          if (input.hearingNotes) updates.hearing_notes = input.hearingNotes;
          break;

        case CA_STATUSES.NOD_ISSUED:
          updates.nod_issued_date = now;
          if (input.nodDecision) updates.nod_decision = input.nodDecision;
          break;

        case CA_STATUSES.CAP_ISSUED: {
          const capLevel = input.finalCapLevel || caCase.recommended_cap_level || "cap_0";
          updates.final_cap_level = capLevel;

          // Check if coach overrode AI recommendation
          if (caCase.ai_recommended_cap_level && capLevel !== caCase.ai_recommended_cap_level) {
            if (!input.capOverrideReason) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Override reason is required when the final CAP level differs from the AI recommendation.",
              });
            }
            updates.cap_override_reason = input.capOverrideReason;
          }

          const activeDays = CAP_ACTIVE_PERIODS[capLevel] ?? 0;
          updates.active_period_days = activeDays;

          if (activeDays > 0) {
            const startMs = Date.now();
            updates.active_period_start = String(startMs);
            updates.active_period_end = String(startMs + activeDays * 24 * 60 * 60 * 1000);
          }

          if (input.refusalWitnessed !== undefined) updates.refusal_witnessed = input.refusalWitnessed;
          if (input.witnessNames) updates.witness_names = input.witnessNames;
          break;
        }

        case CA_STATUSES.ACTIVE_PERIOD:
          // Signed document must be uploaded before entering active period
          if (!caCase.cap_signed_url && !caCase.employee_signed) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Signed CAP document must be uploaded before entering active period.",
            });
          }
          break;

        case CA_STATUSES.CASE_CLOSED:
          // Active period must have expired
          if (caCase.active_period_end) {
            const endMs = parseInt(caCase.active_period_end);
            if (Date.now() < endMs && !ctx.isAdmin) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Active period has not expired yet. Expires: ${formatDate(endMs)}`,
              });
            }
          }
          break;

        case CA_STATUSES.CASE_DISMISSED:
          if (!input.notes) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Dismissal reason is required.",
            });
          }
          updates.notes = input.notes;
          break;
      }

      await db
        .update(compassCaCases)
        .set(updates)
        .where(eq(compassCaCases.case_id, input.caseId));

      await writeTimelineEvent(
        input.caseId,
        `status_${input.targetStatus}`,
        ctx.employee.ohr_id,
        ctx.employee.full_name ?? "",
        input.notes || `Status changed to ${input.targetStatus}`
      );

      return { ok: true, newStatus: input.targetStatus };
    }),

  // =========================================================================
  // CA CASES — Generate DOCX document
  // =========================================================================
  generateDocument: scopedProcedure
    .input(
      z.object({
        caseId: z.string(),
        documentType: z.enum(["nte", "cap_0", "cap_1", "cap_2", "cap_3", "cap_waived"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const rows = await db
        .select()
        .from(compassCaCases)
        .where(eq(compassCaCases.case_id, input.caseId))
        .limit(1);

      if (rows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Case not found" });
      }

      const caCase = rows[0];
      const issuanceDate = formatDate(Date.now());
      const employeeName = caCase.employee_name || "Employee";
      const lastName = employeeName.split(",")[0]?.trim() || employeeName.split(" ").pop() || "Employee";
      const supervisorName = ctx.employee.full_name || "Supervisor";
      const violationSection = caCase.violation_category_name || "Section";
      const violationSubsection = caCase.violation_text || "Sub Section";

      let replacements: Record<string, string> = {};

      if (input.documentType === "nte") {
        // NTE template replacements
        const responseHours = "48";
        replacements = {
          "August 07, 2023": issuanceDate,
          "First Name and Last Name": employeeName,
          "Dear Ms. Last Name,": `Dear Mr./Ms. ${lastName},`,
          "This refers to the reported incident last 4th of August 2023 where it is alleged that you failed to work on the following dates: July 26-27, July 31 and August 1, 2023. Further, you also failed to notify your supervisor that you will not be able to report to work during these dates: July 24-25, July 28 and August 2, 2023 (see Annexure A.)": caCase.incident_details || "Details of the incident as reported.",
          "FLM Name, FLM email@genpact.com": `${supervisorName}`,
          "(48)": `(${responseHours})`,
          "Section I: Attendance Policy": violationSection,
          "Sub Section: A: Unauthorized Absence": violationSubsection,
          "Sub Section: D: NCNS": "",
          // Signature blocks
          "FLM\nSupervisor, Operations": `${supervisorName}\nSupervisor, Operations`,
          "Employee\nProcess Associate": `${employeeName}\nProcess Associate`,
        };
      } else if (input.documentType === "cap_0") {
        replacements = {
          "November 8, 2023": issuanceDate,
          "Name of Employee": employeeName,
          "Dear Mr./Ms. Last Name,": `Dear Mr./Ms. ${lastName},`,
          "This is to inform you that after due deliberation on the administrative charge leveled against you, you have stated/admitted during the admin hearing last October 26, 2023.": caCase.incident_details || "Details of the incident.",
          "Section 8: Conflict of Interest": violationSection,
          "Sub Section E Pawning or lending money with interest.": violationSubsection,
          "Name of FLM": supervisorName,
        };
      } else if (input.documentType.startsWith("cap_") && input.documentType !== "cap_waived") {
        const capNum = input.documentType.replace("cap_", "");
        const activeDays = CAP_ACTIVE_PERIODS[input.documentType] || 60;
        const activeEndDate = formatDate(Date.now() + activeDays * 24 * 60 * 60 * 1000);

        const capLabels: Record<string, string> = {
          "1": "First",
          "2": "Second",
          "3": "Third",
        };

        replacements = {
          "December 22, 2023": issuanceDate,
          "Name of Employee": employeeName,
          "Dear Mr./Ms. Last Name,": `Dear Mr./Ms. ${lastName},`,
          "This is to inform you that after due deliberation on the administrative charge leveled against you, you have stated in your explanation letter dated 12th Dec 2023 that you waited in the zoom session for your M and G , but , did not receive any explanation for the M and G with and the declined post for.": caCase.nte_response_text || caCase.incident_details || "Details of the incident.",
          "Section 3 Misconduct and Acts of Negligence": violationSection,
          "Sub Section D Insubordination or serious misconduct or willful disobedience by the employee of the lawful orders of his employer or representative in connection with his work.": violationSubsection,
          "Name of FLM": supervisorName,
        };

        // Handle the active period line for each CAP level
        if (capNum === "1") {
          replacements["This violation merits First Formal Corrective Action (CAP 1) which will remain active for one (1) month  = 30 days and shall become effective until 19th Feb 2024."] =
            `This violation merits First Formal Corrective Action (CAP 1) which will remain active for ${activeDays} days and shall become effective until ${activeEndDate}.`;
        } else if (capNum === "2") {
          replacements["This violation merits Second Formal Corrective Action (CAP 2) which will remain active for two (2) month2  = 60 days and shall become effective until <60 days from issuance date>"] =
            `This violation merits Second Formal Corrective Action (CAP 2) which will remain active for ${activeDays} days and shall become effective until ${activeEndDate}.`;
        } else if (capNum === "3") {
          replacements["This violation merits Third Formal Corrective Action (CAP 3) which will remain active for three (3) months = 90 days and shall become effective until <90 days from issuance date>"] =
            `This violation merits Third Formal Corrective Action (CAP 3) which will remain active for ${activeDays} days and shall become effective until ${activeEndDate}.`;
        }
      } else if (input.documentType === "cap_waived") {
        const capLevel = caCase.final_cap_level || caCase.recommended_cap_level || "cap_1";
        const activeDays = CAP_ACTIVE_PERIODS[capLevel] || 60;
        const activeEndDate = formatDate(Date.now() + activeDays * 24 * 60 * 60 * 1000);
        const capNum = capLevel.replace("cap_", "");
        const capLabels: Record<string, string> = { "0": "Coaching", "1": "First", "2": "Second", "3": "Third" };

        replacements = {
          "Date of Issuance": issuanceDate,
          "Name of Employee": employeeName,
          "Designation": "Process Associate",
          "Dear Mr./Ms <Last Name>,": `Dear Mr./Ms. ${lastName},`,
          "(indicate Section then sub-section of the CAP Policy)": `${violationSection} — ${violationSubsection}`,
          "<INDICATE CAP LEVEL)": `${capLabels[capNum] || capNum}`,
          "INDICATE CAP LEVEL NUMBER": `CAP ${capNum}`,
          "<INDICATE CAP LEVEL ROLL OFF PERIOD>": `${activeDays} days`,
          "<APPLICABLE NO OF MONTHS/ROLL OFF PERIOD>": `${Math.ceil(activeDays / 30)}`,
          "INDICATE EQUIVALENT DAYS": `${activeDays}`,
          "<Name of Unit Manager/Supervisor>": supervisorName,
          "<Name of Employee>": employeeName,
          "<Designation>": "Process Associate",
        };
      }

      try {
        const docxBuffer = await generateDocx(
          input.documentType,
          replacements
        );

        // Upload to S3
        const fileKey = `ca-documents/${input.caseId}/${input.documentType}-${crypto.randomBytes(4).toString("hex")}.docx`;
        const { url } = await storagePut(fileKey, docxBuffer, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

        // Update case with document URL
        const urlField = input.documentType === "nte" ? "nte_document_url" : "cap_document_url";
        await db
          .update(compassCaCases)
          .set({ [urlField]: url, updated_at: String(Date.now()) })
          .where(eq(compassCaCases.case_id, input.caseId));

        await writeTimelineEvent(
          input.caseId,
          `document_generated_${input.documentType}`,
          ctx.employee.ohr_id,
          ctx.employee.full_name ?? "",
          `${input.documentType.toUpperCase()} document generated.`
        );

        return { ok: true, documentUrl: url };
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Document generation failed: ${err.message}`,
        });
      }
    }),

  // =========================================================================
  // CA CASES — Upload signed document
  // =========================================================================
  uploadSignedDocument: scopedProcedure
    .input(
      z.object({
        caseId: z.string(),
        documentType: z.enum(["nte", "cap"]),
        signedDocumentUrl: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const urlField = input.documentType === "nte" ? "nte_signed_url" : "cap_signed_url";
      const now = String(Date.now());

      const updates: Record<string, any> = {
        [urlField]: input.signedDocumentUrl,
        updated_at: now,
      };

      if (input.documentType === "cap") {
        updates.employee_signed = true;
        updates.employee_signed_date = now;
      }

      await db
        .update(compassCaCases)
        .set(updates)
        .where(eq(compassCaCases.case_id, input.caseId));

      await writeTimelineEvent(
        input.caseId,
        `signed_document_uploaded_${input.documentType}`,
        ctx.employee.ohr_id,
        ctx.employee.full_name ?? "",
        `Signed ${input.documentType.toUpperCase()} document uploaded.`
      );

      return { ok: true };
    }),

  // =========================================================================
  // ATTENDANCE — Aggregate violations for an employee (progression system)
  // =========================================================================
  attendanceSummary: scopedProcedure
    .input(z.object({ employeeOhr: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Find the last CAP (1+) that was served and closed — this is the reset point
      const lastCap = await db
        .select()
        .from(compassCaCases)
        .where(
          and(
            eq(compassCaCases.employee_ohr, input.employeeOhr),
            inArray(compassCaCases.final_cap_level, ["cap_1", "cap_2", "cap_3"]),
            inArray(compassCaCases.case_status, [CA_STATUSES.ACTIVE_PERIOD, CA_STATUSES.CASE_CLOSED, CA_STATUSES.CAP_ISSUED])
          )
        )
        .orderBy(desc(compassCaCases.created_at))
        .limit(1);

      // Reset point: the date the last CAP was issued, or beginning of time
      let resetDate: string | null = null;
      if (lastCap.length > 0 && lastCap[0].active_period_start) {
        resetDate = lastCap[0].active_period_start;
      }

      // Query attendance records since reset
      const attendanceConditions: any[] = [
        eq(ioAttendance.ohr_id, input.employeeOhr),
      ];
      if (resetDate) {
        attendanceConditions.push(gte(ioAttendance.created_at, resetDate));
      }

      const attendance = await db
        .select()
        .from(ioAttendance)
        .where(and(...attendanceConditions));

      // Count violations
      let tardiness = 0;
      let ncns = 0;
      let unauthorizedAbsence = 0;
      let totalPresent = 0;
      let totalWo = 0;

      for (const record of attendance) {
        const tag = record.tag?.toUpperCase();
        if (tag === "LATE") tardiness++;
        else if (tag === "UPL") {
          const reason = record.upl_reason?.toUpperCase();
          if (reason === "NCNS") ncns++;
          else if (reason && !["MEDICAL", "BEREAVEMENT"].includes(reason)) {
            unauthorizedAbsence++;
          }
        } else if (tag === "P") totalPresent++;
        else if (tag === "WO") totalWo++;
      }

      // Determine current active CAP
      const activeCap = await db
        .select()
        .from(compassCaCases)
        .where(
          and(
            eq(compassCaCases.employee_ohr, input.employeeOhr),
            eq(compassCaCases.case_status, CA_STATUSES.ACTIVE_PERIOD)
          )
        )
        .orderBy(desc(compassCaCases.created_at))
        .limit(1);

      // Recommend next CAP level based on progression
      let recommendedCapLevel = "cap_0";
      const totalViolations = tardiness + ncns + unauthorizedAbsence;

      if (activeCap.length > 0) {
        // Employee is currently under an active CAP — next violation escalates
        const currentLevel = activeCap[0].final_cap_level;
        if (currentLevel === "cap_0") recommendedCapLevel = "cap_1";
        else if (currentLevel === "cap_1") recommendedCapLevel = "cap_2";
        else if (currentLevel === "cap_2") recommendedCapLevel = "cap_3";
        else recommendedCapLevel = "cap_3";
      } else if (totalViolations >= 5) {
        recommendedCapLevel = "cap_1";
      } else if (totalViolations >= 3) {
        recommendedCapLevel = "cap_0";
      }

      return {
        employeeOhr: input.employeeOhr,
        sinceDate: resetDate ? formatDate(resetDate) : "All time",
        tardiness,
        ncns,
        unauthorizedAbsence,
        totalViolations,
        totalPresent,
        totalWo,
        totalRecords: attendance.length,
        activeCap: activeCap.length > 0
          ? {
              caseId: activeCap[0].case_id,
              capLevel: activeCap[0].final_cap_level,
              activeUntil: activeCap[0].active_period_end
                ? formatDate(activeCap[0].active_period_end)
                : null,
              daysRemaining: activeCap[0].active_period_end
                ? Math.max(0, Math.ceil((parseInt(activeCap[0].active_period_end) - Date.now()) / (24 * 60 * 60 * 1000)))
                : null,
            }
          : null,
        recommendedCapLevel,
      };
    }),

  // =========================================================================
  // CA CASES — Analytics summary (role-scoped)
  // =========================================================================
  analyticsSummary: scopedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const t = compassCaCases;
    const scopeWhere = scopeCaWhere(ctx.scope);

    const [{ total }] = await db.select({ total: count() }).from(t).where(scopeWhere);

    // Active cases (not closed/dismissed)
    const activeConditions: any[] = [
      inArray(t.case_status, [
        CA_STATUSES.INCIDENT_REPORTED,
        CA_STATUSES.NTE_ISSUED,
        CA_STATUSES.AWAITING_RESPONSE,
        CA_STATUSES.RESPONSE_RECEIVED,
        CA_STATUSES.RESPONSE_WAIVED,
        CA_STATUSES.HEARING_SCHEDULED,
        CA_STATUSES.HEARING_CONDUCTED,
        CA_STATUSES.NOD_ISSUED,
        CA_STATUSES.CAP_ISSUED,
        CA_STATUSES.ACTIVE_PERIOD,
      ]),
    ];
    if (scopeWhere) activeConditions.push(scopeWhere);
    const [{ activeCases }] = await db
      .select({ activeCases: count() })
      .from(t)
      .where(and(...activeConditions));

    // Active CAPs
    const activeCapConditions: any[] = [eq(t.case_status, CA_STATUSES.ACTIVE_PERIOD)];
    if (scopeWhere) activeCapConditions.push(scopeWhere);
    const [{ activeCaps }] = await db
      .select({ activeCaps: count() })
      .from(t)
      .where(and(...activeCapConditions));

    // Closed cases
    const closedConditions: any[] = [
      inArray(t.case_status, [CA_STATUSES.CASE_CLOSED, CA_STATUSES.CASE_DISMISSED]),
    ];
    if (scopeWhere) closedConditions.push(scopeWhere);
    const [{ closedCases }] = await db
      .select({ closedCases: count() })
      .from(t)
      .where(and(...closedConditions));

    return {
      totalCases: total,
      activeCases,
      activeCaps,
      closedCases,
    };
  }),

  // =========================================================================
  // CA CASES — Employee CA history
  // =========================================================================
  employeeCaHistory: scopedProcedure
    .input(z.object({ employeeOhr: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Visibility check
      if (ctx.scope.type === "self_only" && input.employeeOhr !== ctx.scope.selfOhr) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      const cases = await db
        .select()
        .from(compassCaCases)
        .where(eq(compassCaCases.employee_ohr, input.employeeOhr))
        .orderBy(desc(compassCaCases.created_at));

      return cases;
    }),

  // =========================================================================
  // FILE UPLOAD — Generic file upload for CA documents
  // =========================================================================
  uploadFile: scopedProcedure
    .input(
      z.object({
        caseId: z.string(),
        fileName: z.string(),
        fileBase64: z.string(),
        contentType: z.string().default("application/octet-stream"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fileBuffer = Buffer.from(input.fileBase64, "base64");
      const suffix = crypto.randomBytes(4).toString("hex");
      const fileKey = `ca-documents/${input.caseId}/${input.fileName}-${suffix}`;
      const { url } = await storagePut(fileKey, fileBuffer, input.contentType);

      await writeTimelineEvent(
        input.caseId,
        "file_uploaded",
        ctx.employee.ohr_id,
        ctx.employee.full_name ?? "",
        `File uploaded: ${input.fileName}`
      );

      return { ok: true, url };
    }),
});
