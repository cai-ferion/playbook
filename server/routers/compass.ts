/**
 * Compass Module — tRPC Router
 *
 * Coaching CRUD, QA Dispute 6-level escalation, Acknowledgement workflow.
 * All queries are server-paginated and role-scoped.
 */
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../db";
import {
  compassCoachingLogs,
  compassDisputeEvents,
  compassViolationCatalog,
  ioEmployees,
  ioCoachingRca,
  ioCoachingZtp,
} from "../../drizzle/schema";
import { eq, and, or, inArray, like, desc, asc, sql, gte, lte, count } from "drizzle-orm";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ADMIN_OHR = "740045023";

const COACHING_TYPES = [
  "cap_0",
  "follow_up",
  "group",
  "triad",
  "qa_feedback",
  "ztp",
] as const;

// QA Feedback dispute statuses
const DISPUTE_STATUSES = {
  PENDING_SME_REVIEW: "Pending SME Review",
  MARKDOWN_DISPUTED: "Markdown Disputed",
  MARKDOWN_RETAINED_QA: "Markdown Retained - QA",
  QA_DECISION_REJECTED: "QA Decision Rejected",
  MARKDOWN_RETAINED_TRAINER: "Markdown Retained - Trainer",
  TRAINER_DECISION_REJECTED: "Trainer Decision Rejected",
  PENDING_ACK: "Pending Acknowledgement",
  ACKNOWLEDGED: "Acknowledged",
} as const;

// Role-action matrix for dispute levels
const DISPUTE_LEVEL_CONFIG: Record<
  number,
  {
    entryStatus: string;
    requiredRole: string[];
    actions: string[];
    resultStatuses: Record<string, string>;
  }
> = {
  1: {
    entryStatus: DISPUTE_STATUSES.PENDING_SME_REVIEW,
    requiredRole: ["Operational SME"],
    actions: ["accept_markdown", "dispute_markdown"],
    resultStatuses: {
      accept_markdown: DISPUTE_STATUSES.PENDING_ACK,
      dispute_markdown: DISPUTE_STATUSES.MARKDOWN_DISPUTED,
    },
  },
  2: {
    entryStatus: DISPUTE_STATUSES.MARKDOWN_DISPUTED,
    requiredRole: ["Quality & Policy Expert"],
    actions: ["reverse_markdown", "retain_markdown"],
    resultStatuses: {
      reverse_markdown: DISPUTE_STATUSES.PENDING_ACK,
      retain_markdown: DISPUTE_STATUSES.MARKDOWN_RETAINED_QA,
    },
  },
  3: {
    entryStatus: DISPUTE_STATUSES.MARKDOWN_RETAINED_QA,
    requiredRole: ["Operational SME"],
    actions: ["accept_decision", "reject_decision"],
    resultStatuses: {
      accept_decision: DISPUTE_STATUSES.PENDING_ACK,
      reject_decision: DISPUTE_STATUSES.QA_DECISION_REJECTED,
    },
  },
  4: {
    entryStatus: DISPUTE_STATUSES.QA_DECISION_REJECTED,
    requiredRole: ["Trainer"],
    actions: ["reverse_markdown", "retain_markdown"],
    resultStatuses: {
      reverse_markdown: DISPUTE_STATUSES.PENDING_ACK,
      retain_markdown: DISPUTE_STATUSES.MARKDOWN_RETAINED_TRAINER,
    },
  },
  5: {
    entryStatus: DISPUTE_STATUSES.MARKDOWN_RETAINED_TRAINER,
    requiredRole: ["Operational SME"],
    actions: ["accept_decision", "reject_decision"],
    resultStatuses: {
      accept_decision: DISPUTE_STATUSES.PENDING_ACK,
      reject_decision: DISPUTE_STATUSES.TRAINER_DECISION_REJECTED,
    },
  },
  6: {
    entryStatus: DISPUTE_STATUSES.TRAINER_DECISION_REJECTED,
    requiredRole: ["Manager"],
    actions: ["reverse_markdown", "retain_markdown"],
    resultStatuses: {
      reverse_markdown: DISPUTE_STATUSES.PENDING_ACK,
      retain_markdown: DISPUTE_STATUSES.PENDING_ACK,
    },
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateCoachingId(): string {
  return `CL-${crypto.randomBytes(4).toString("hex")}`;
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

/** Get all OHRs on a team (employees whose supervisor_name matches the given name) */
async function getTeamOhrs(supervisorFullName: string): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ ohr: ioEmployees.ohr_id })
    .from(ioEmployees)
    .where(eq(ioEmployees.supervisor_name, supervisorFullName));
  return rows.map((r) => r.ohr);
}

// Visibility scope types
type VisibilityScope =
  | { type: "all" }
  | { type: "team"; ohrs: string[]; selfOhr: string }
  | { type: "self_filed"; selfOhr: string }
  | { type: "self_only"; selfOhr: string };

/** Build visibility scope from the resolved employee record */
async function buildScope(
  employee: NonNullable<Awaited<ReturnType<typeof resolveEmployee>>>,
  isAdmin: boolean
): Promise<VisibilityScope> {
  const role = employee.actual_role ?? "";

  if (role === "Manager" || isAdmin) {
    return { type: "all" };
  }

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

  // Agent or unknown role
  return { type: "self_only", selfOhr: employee.ohr_id };
}

/** Apply visibility scope as WHERE conditions for coaching logs */
function scopeCoachingWhere(scope: VisibilityScope) {
  const t = compassCoachingLogs;
  switch (scope.type) {
    case "all":
      return undefined;
    case "team":
      return or(
        inArray(t.coachee_ohr, scope.ohrs.length > 0 ? scope.ohrs : [""]),
        eq(t.coach_ohr, scope.selfOhr)
      );
    case "self_filed":
      return eq(t.coach_ohr, scope.selfOhr);
    case "self_only":
      return eq(t.coachee_ohr, scope.selfOhr);
  }
}

// ---------------------------------------------------------------------------
// Scoped procedure middleware — injects employee + scope into context
// ---------------------------------------------------------------------------

const scopedProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const employee = await resolveEmployee(ctx.user?.email);
  if (!employee) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Your account is not linked to an employee record. Contact your administrator.",
    });
  }

  const isAdmin =
    employee.ohr_id === ADMIN_OHR || ctx.user?.role === "admin";
  const scope = await buildScope(employee, isAdmin);

  return next({
    ctx: {
      ...ctx,
      employee,
      scope,
      isAdmin,
    },
  });
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const compassRouter = router({
  // =========================================================================
  // COACHING — List (server-paginated, role-scoped)
  // =========================================================================
  coachingList: scopedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
        coachingType: z.enum(COACHING_TYPES).optional(),
        status: z.string().optional(),
        coacheeOhr: z.string().optional(),
        coachOhr: z.string().optional(),
        planningGroup: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        search: z.string().optional(),
        sortBy: z
          .enum(["coaching_date", "created_at", "coachee_name", "coach_name"])
          .default("coaching_date"),
        sortDir: z.enum(["asc", "desc"]).default("desc"),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const t = compassCoachingLogs;
      const conditions: any[] = [];

      // Visibility scope
      const scopeWhere = scopeCoachingWhere(ctx.scope);
      if (scopeWhere) conditions.push(scopeWhere);

      // Filters
      if (input.coachingType) conditions.push(eq(t.coaching_type, input.coachingType));
      if (input.status) conditions.push(eq(t.status, input.status));
      if (input.coacheeOhr) conditions.push(eq(t.coachee_ohr, input.coacheeOhr));
      if (input.coachOhr) conditions.push(eq(t.coach_ohr, input.coachOhr));
      if (input.planningGroup) conditions.push(eq(t.coachee_pg, input.planningGroup));
      if (input.dateFrom) conditions.push(gte(t.coaching_date, input.dateFrom));
      if (input.dateTo) conditions.push(lte(t.coaching_date, input.dateTo));
      if (input.search) {
        conditions.push(
          or(
            like(t.coachee_name, `%${input.search}%`),
            like(t.coach_name, `%${input.search}%`),
            like(t.coaching_id, `%${input.search}%`),
            like(t.job_id, `%${input.search}%`)
          )
        );
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [{ total }] = await db
        .select({ total: count() })
        .from(t)
        .where(where);

      const sortCol =
        input.sortBy === "coaching_date"
          ? t.coaching_date
          : input.sortBy === "coachee_name"
          ? t.coachee_name
          : input.sortBy === "coach_name"
          ? t.coach_name
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
  // COACHING — Get single log by coaching_id
  // =========================================================================
  coachingGet: scopedProcedure
    .input(z.object({ coachingId: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const t = compassCoachingLogs;

      const rows = await db
        .select()
        .from(t)
        .where(eq(t.coaching_id, input.coachingId))
        .limit(1);

      if (rows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Coaching log not found" });
      }

      const log = rows[0];

      // Visibility check
      const scope = ctx.scope;
      if (scope.type === "self_only" && log.coachee_ohr !== scope.selfOhr) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      if (scope.type === "self_filed" && log.coach_ohr !== scope.selfOhr) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      if (
        scope.type === "team" &&
        !scope.ohrs.includes(log.coachee_ohr ?? "") &&
        log.coach_ohr !== scope.selfOhr
      ) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      // Fetch dispute events if QA Feedback
      let disputeEvents: any[] = [];
      if (log.coaching_type === "qa_feedback") {
        disputeEvents = await db
          .select()
          .from(compassDisputeEvents)
          .where(eq(compassDisputeEvents.coaching_id, input.coachingId))
          .orderBy(asc(compassDisputeEvents.created_at));
      }

      // Privacy: mask rating + sentiments unless viewer is coachee, coach's supervisor, or admin
      const maskedLog = { ...log } as Record<string, any>;
      const viewerOhr = ctx.employee.ohr_id;
      const isCoachee = viewerOhr === log.coachee_ohr;
      const isCoachSupervisor = ctx.employee.full_name === log.coach_supervisor;
      const canSeePrivate = isCoachee || isCoachSupervisor || ctx.isAdmin;

      if (!canSeePrivate) {
        maskedLog.coaching_rating = null;
        maskedLog.coachee_sentiments = null;
      }

      return {
        log: maskedLog,
        disputeEvents,
      };
    }),

  // =========================================================================
  // COACHING — Create new log
  // =========================================================================
  coachingCreate: scopedProcedure
    .input(
      z.object({
        coachingType: z.enum(COACHING_TYPES),
        coachingDate: z.string(), // ISO date string or timestamp string
        sessionGoals: z.array(z.string()).min(1),
        coachingDetails: z.string(),
        coacheeOhr: z.string(),
        jobId: z.string().optional(),
        rcaLevel1: z.string().optional(),
        rcaLevel2: z.string().optional(),
        rcaLevel3: z.string().optional(),
        rcaLevel4: z.string().optional(),
        rcaLevel5: z.string().optional(),
        rcaDescription: z.string().optional(),
        infractionCategory: z.string().optional(),
        infraction: z.string().optional(),
        infractionDescription: z.string().optional(),
        severity: z.string().optional(),
        parentCoachingId: z.string().optional(),
        smeJoinerName: z.string().optional(),
        smeJoinerEmail: z.string().optional(),
        coacheeList: z.string().optional(),
        attachments: z.string().optional(),
        groupCoacheeOhrs: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const coach = ctx.employee;

      // Agents cannot create logs
      if ((coach.actual_role ?? "") === "Agent") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Agents cannot create coaching logs",
        });
      }

      // Resolve coachee
      const coacheeRows = await db
        .select()
        .from(ioEmployees)
        .where(eq(ioEmployees.ohr_id, input.coacheeOhr))
        .limit(1);
      if (coacheeRows.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Employee ${input.coacheeOhr} not found`,
        });
      }
      const coachee = coacheeRows[0];

      const now = String(Date.now());
      const coachingDate = new Date(input.coachingDate);
      const weekDay = coachingDate.getDay();
      const daysToFriday = (5 - weekDay + 7) % 7;
      const friday = new Date(coachingDate);
      friday.setDate(friday.getDate() + daysToFriday);
      const weekEnding = `${friday.getFullYear()}-${String(friday.getMonth() + 1).padStart(2, "0")}-${String(friday.getDate()).padStart(2, "0")}`;
      const monthName = coachingDate.toLocaleString("en-US", { month: "long" });

      const initialStatus =
        input.coachingType === "qa_feedback"
          ? DISPUTE_STATUSES.PENDING_SME_REVIEW
          : DISPUTE_STATUSES.PENDING_ACK;

      // Handle Group Coaching — create N individual logs
      if (
        input.coachingType === "group" &&
        input.groupCoacheeOhrs &&
        input.groupCoacheeOhrs.length > 0
      ) {
        const groupSessionId = `GS-${crypto.randomBytes(4).toString("hex")}`;
        const createdIds: string[] = [];

        for (const ohr of input.groupCoacheeOhrs) {
          const cRows = await db
            .select()
            .from(ioEmployees)
            .where(eq(ioEmployees.ohr_id, ohr))
            .limit(1);
          if (cRows.length === 0) continue;
          const c = cRows[0];

          const cid = generateCoachingId();
          await db.insert(compassCoachingLogs).values({
            coaching_id: cid,
            coaching_type: "cap_0",
            coaching_date: input.coachingDate,
            session_goals: JSON.stringify(input.sessionGoals),
            coaching_details: input.coachingDetails,
            status: DISPUTE_STATUSES.PENDING_ACK,
            coach_ohr: coach.ohr_id,
            coach_name: coach.full_name,
            coach_email: coach.meta_email,
            coach_supervisor: coach.supervisor_name,
            coach_supervisor_email: coach.supervisor_email,
            coach_pg: coach.planning_group,
            coachee_ohr: c.ohr_id,
            coachee_name: c.full_name,
            coachee_email: c.meta_email,
            coachee_supervisor: c.supervisor_name,
            coachee_supervisor_email: c.supervisor_email,
            coachee_pg: c.planning_group,
            group_session_id: groupSessionId,
            coachee_list: input.coacheeList || null,
            attachments: input.attachments || null,
            week_ending: weekEnding,
            month: monthName,
            created_at: now,
            updated_at: now,
          });
          createdIds.push(cid);
        }

        return { ok: true, coachingIds: createdIds, groupSessionId };
      }

      // Single coaching log
      const coachingId = generateCoachingId();
      await db.insert(compassCoachingLogs).values({
        coaching_id: coachingId,
        coaching_type: input.coachingType,
        coaching_date: input.coachingDate,
        session_goals: JSON.stringify(input.sessionGoals),
        coaching_details: input.coachingDetails,
        status: initialStatus,
        coach_ohr: coach.ohr_id,
        coach_name: coach.full_name,
        coach_email: coach.meta_email,
        coach_supervisor: coach.supervisor_name,
        coach_supervisor_email: coach.supervisor_email,
        coach_pg: coach.planning_group,
        coachee_ohr: coachee.ohr_id,
        coachee_name: coachee.full_name,
        coachee_email: coachee.meta_email,
        coachee_supervisor: coachee.supervisor_name,
        coachee_supervisor_email: coachee.supervisor_email,
        coachee_pg: coachee.planning_group,
        job_id: input.jobId || null,
        rca_level_1: input.rcaLevel1 || null,
        rca_level_2: input.rcaLevel2 || null,
        rca_level_3: input.rcaLevel3 || null,
        rca_level_4: input.rcaLevel4 || null,
        rca_level_5: input.rcaLevel5 || null,
        rca_description: input.rcaDescription || null,
        infraction_category: input.infractionCategory || null,
        infraction: input.infraction || null,
        infraction_description: input.infractionDescription || null,
        severity: input.severity || null,
        parent_coaching_id: input.parentCoachingId || null,
        sme_joiner_name: input.smeJoinerName || null,
        sme_joiner_email: input.smeJoinerEmail || null,
        coachee_list: input.coacheeList || null,
        attachments: input.attachments || null,
        week_ending: weekEnding,
        month: monthName,
        created_at: now,
        updated_at: now,
      });

      return { ok: true, coachingId };
    }),

  // =========================================================================
  // COACHING — Acknowledge (coachee only)
  // =========================================================================
  coachingAcknowledge: scopedProcedure
    .input(
      z.object({
        coachingId: z.string(),
        commitments: z.string().min(1, "Commitments are required"),
        rating: z.number().int().min(1).max(5),
        sentiments: z.string().min(1, "Sentiments are required"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const t = compassCoachingLogs;

      const rows = await db
        .select()
        .from(t)
        .where(eq(t.coaching_id, input.coachingId))
        .limit(1);

      if (rows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Coaching log not found" });
      }

      const log = rows[0];

      if (log.coachee_ohr !== ctx.employee.ohr_id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the coachee can acknowledge this log",
        });
      }

      if (log.status !== DISPUTE_STATUSES.PENDING_ACK) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot acknowledge — current status is "${log.status}"`,
        });
      }

      const now = String(Date.now());
      await db
        .update(t)
        .set({
          coachee_ack: true,
          coachee_commitments: input.commitments,
          coaching_rating: input.rating,
          coachee_sentiments: input.sentiments,
          ack_date: now,
          status: DISPUTE_STATUSES.ACKNOWLEDGED,
          updated_at: now,
        })
        .where(eq(t.coaching_id, input.coachingId));

      return { ok: true };
    }),

  // =========================================================================
  // DISPUTE — Transition (6-level escalation, server-enforced)
  // =========================================================================
  disputeTransition: scopedProcedure
    .input(
      z.object({
        coachingId: z.string(),
        action: z.string(),
        comments: z.string().optional(),
        attachments: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const t = compassCoachingLogs;

      const rows = await db
        .select()
        .from(t)
        .where(eq(t.coaching_id, input.coachingId))
        .limit(1);

      if (rows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Coaching log not found" });
      }

      const log = rows[0];

      if (log.coaching_type !== "qa_feedback") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Dispute transitions only apply to QA Feedback logs",
        });
      }

      // Determine current dispute level from status
      let currentLevel = 0;
      for (const [level, config] of Object.entries(DISPUTE_LEVEL_CONFIG)) {
        if (config.entryStatus === log.status) {
          currentLevel = parseInt(level);
          break;
        }
      }

      if (currentLevel === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Log status "${log.status}" is not in a disputable state`,
        });
      }

      const levelConfig = DISPUTE_LEVEL_CONFIG[currentLevel];

      if (!levelConfig.actions.includes(input.action)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invalid action "${input.action}" for level ${currentLevel}. Valid: ${levelConfig.actions.join(", ")}`,
        });
      }

      // Validate role (admin can override)
      const actorRole = ctx.employee.actual_role ?? "";
      if (
        !ctx.isAdmin &&
        !levelConfig.requiredRole.includes(actorRole)
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Level ${currentLevel} requires role: ${levelConfig.requiredRole.join(" or ")}. Your role: ${actorRole}`,
        });
      }

      // Require comments for dispute/retain/reject actions
      const requiresComments = [
        "dispute_markdown",
        "retain_markdown",
        "reject_decision",
      ].includes(input.action);
      if (requiresComments && (!input.comments || input.comments.trim() === "")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Comments are required for this action",
        });
      }

      const newStatus = levelConfig.resultStatuses[input.action];
      if (!newStatus) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not determine result status",
        });
      }

      const now = String(Date.now());

      // Write dispute event (append-only)
      await db.insert(compassDisputeEvents).values({
        coaching_id: input.coachingId,
        dispute_level: currentLevel,
        action: input.action,
        actor_ohr: ctx.employee.ohr_id,
        actor_name: ctx.employee.full_name ?? "",
        actor_role: actorRole,
        comments: input.comments || null,
        attachments: input.attachments || null,
        created_at: now,
      });

      // Update coaching log status
      await db
        .update(t)
        .set({
          status: newStatus,
          updated_at: now,
        })
        .where(eq(t.coaching_id, input.coachingId));

      return { ok: true, newStatus, level: currentLevel, action: input.action };
    }),

  // =========================================================================
  // DISPUTES — Kanban board data (grouped by status)
  // =========================================================================
  disputeKanban: scopedProcedure
    .input(
      z.object({
        planningGroup: z.string().optional(),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const t = compassCoachingLogs;
      const conditions: any[] = [eq(t.coaching_type, "qa_feedback")];

      const disputeStatusValues = [
        DISPUTE_STATUSES.PENDING_SME_REVIEW,
        DISPUTE_STATUSES.MARKDOWN_DISPUTED,
        DISPUTE_STATUSES.MARKDOWN_RETAINED_QA,
        DISPUTE_STATUSES.QA_DECISION_REJECTED,
        DISPUTE_STATUSES.MARKDOWN_RETAINED_TRAINER,
        DISPUTE_STATUSES.TRAINER_DECISION_REJECTED,
        DISPUTE_STATUSES.PENDING_ACK,
      ];
      conditions.push(inArray(t.status, disputeStatusValues));

      const scopeWhere = scopeCoachingWhere(ctx.scope);
      if (scopeWhere) conditions.push(scopeWhere);

      if (input.planningGroup) conditions.push(eq(t.coachee_pg, input.planningGroup));
      if (input.search) {
        conditions.push(
          or(
            like(t.coachee_name, `%${input.search}%`),
            like(t.coaching_id, `%${input.search}%`),
            like(t.job_id, `%${input.search}%`)
          )
        );
      }

      const where = and(...conditions);
      const items = await db
        .select()
        .from(t)
        .where(where)
        .orderBy(desc(t.coaching_date));

      const columns: Record<string, typeof items> = {};
      for (const status of disputeStatusValues) {
        columns[status] = [];
      }
      for (const item of items) {
        if (item.status && columns[item.status]) {
          columns[item.status].push(item);
        }
      }

      return { columns, total: items.length };
    }),

  // =========================================================================
  // REFERENCE DATA — RCA catalog, ZTP catalog, violation catalog, employees
  // =========================================================================
  rcaCatalog: scopedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    return db.select().from(ioCoachingRca);
  }),

  ztpCatalog: scopedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    return db.select().from(ioCoachingZtp);
  }),

  violationCatalog: scopedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    return db
      .select()
      .from(compassViolationCatalog)
      .orderBy(asc(compassViolationCatalog.category_number), asc(compassViolationCatalog.subsection));
  }),

  employeeList: scopedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        role: z.string().optional(),
        limit: z.number().int().max(500).default(50),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const conditions: any[] = [];
      if (input.search) {
        conditions.push(
          or(
            like(ioEmployees.full_name, `%${input.search}%`),
            like(ioEmployees.ohr_id, `%${input.search}%`)
          )
        );
      }
      if (input.role) conditions.push(eq(ioEmployees.actual_role, input.role));

      const where = conditions.length > 0 ? and(...conditions) : undefined;
      return db
        .select({
          ohr_id: ioEmployees.ohr_id,
          full_name: ioEmployees.full_name,
          actual_role: ioEmployees.actual_role,
          supervisor_name: ioEmployees.supervisor_name,
          planning_group: ioEmployees.planning_group,
          meta_email: ioEmployees.meta_email,
          employement_status: ioEmployees.employement_status,
        })
        .from(ioEmployees)
        .where(where)
        .limit(input.limit);
    }),

  // =========================================================================
  // CURRENT USER — resolve the logged-in user's employee profile
  // =========================================================================
  currentEmployee: scopedProcedure.query(async ({ ctx }) => {
    return {
      ohr_id: ctx.employee.ohr_id,
      full_name: ctx.employee.full_name,
      actual_role: ctx.employee.actual_role,
      supervisor_name: ctx.employee.supervisor_name,
      planning_group: ctx.employee.planning_group,
      meta_email: ctx.employee.meta_email,
      scope: ctx.scope.type,
      isAdmin: ctx.isAdmin,
    };
  }),

  // =========================================================================
  // COACHING — Employee history (for employee profile page)
  // =========================================================================
  employeeHistory: scopedProcedure
    .input(
      z.object({
        employeeOhr: z.string(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const t = compassCoachingLogs;

      // Verify the viewer has access to this employee's records
      const scope = ctx.scope;
      if (scope.type === "self_only" && input.employeeOhr !== scope.selfOhr) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      if (scope.type === "self_filed") {
        const check = await db
          .select({ id: t.id })
          .from(t)
          .where(
            and(
              eq(t.coachee_ohr, input.employeeOhr),
              eq(t.coach_ohr, scope.selfOhr)
            )
          )
          .limit(1);
        if (check.length === 0) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
      }
      if (
        scope.type === "team" &&
        !scope.ohrs.includes(input.employeeOhr)
      ) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      const where = eq(t.coachee_ohr, input.employeeOhr);

      const [{ total }] = await db
        .select({ total: count() })
        .from(t)
        .where(where);

      const items = await db
        .select()
        .from(t)
        .where(where)
        .orderBy(desc(t.coaching_date))
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
  // ANALYTICS — Summary stats (role-scoped)
  // =========================================================================
  analyticsSummary: scopedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const t = compassCoachingLogs;
    const scopeWhere = scopeCoachingWhere(ctx.scope);

    const [{ total }] = await db
      .select({ total: count() })
      .from(t)
      .where(scopeWhere);

    const qaConditions: any[] = [eq(t.coaching_type, "qa_feedback")];
    if (scopeWhere) qaConditions.push(scopeWhere);
    const [{ qaTotal }] = await db
      .select({ qaTotal: count() })
      .from(t)
      .where(and(...qaConditions));

    const disputeConditions: any[] = [
      eq(t.coaching_type, "qa_feedback"),
      inArray(t.status, [
        DISPUTE_STATUSES.PENDING_SME_REVIEW,
        DISPUTE_STATUSES.MARKDOWN_DISPUTED,
        DISPUTE_STATUSES.MARKDOWN_RETAINED_QA,
        DISPUTE_STATUSES.QA_DECISION_REJECTED,
        DISPUTE_STATUSES.MARKDOWN_RETAINED_TRAINER,
        DISPUTE_STATUSES.TRAINER_DECISION_REJECTED,
      ]),
    ];
    if (scopeWhere) disputeConditions.push(scopeWhere);
    const [{ activeDisputes }] = await db
      .select({ activeDisputes: count() })
      .from(t)
      .where(and(...disputeConditions));

    const ackConditions: any[] = [eq(t.status, DISPUTE_STATUSES.ACKNOWLEDGED)];
    if (scopeWhere) ackConditions.push(scopeWhere);
    const [{ acknowledged }] = await db
      .select({ acknowledged: count() })
      .from(t)
      .where(and(...ackConditions));

    return {
      totalLogs: total,
      qaFeedbackLogs: qaTotal,
      activeDisputes,
      acknowledged,
      pendingAck: total - acknowledged - activeDisputes,
    };
  }),
});
