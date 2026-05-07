/**
 * AI CAP Assistant — Advisory Mode
 *
 * Analyzes employee's full history (coaching logs, CA cases, attendance)
 * against GPHR Policy v3.0 and returns a structured recommendation.
 * The coach makes the final call — this is advisory only.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc.js";
import { invokeLLM } from "../_core/llm.js";
import { getDb } from "../db.js";
import {
  compassCoachingLogs,
  compassCaCases,
  compassCaTimeline,
  compassViolationCatalog,
  ioAttendance,
  ioEmployees,
} from "../../drizzle/schema.js";
import { eq, desc, and, inArray, gte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

// ── GPHR Policy v3.0 Rules (embedded for LLM context) ──────────────────
const POLICY_RULES = `
## GPHR Corrective Action Policy v3.0 (February 2026)

### Progressive Discipline System
Sanctions may be mitigated or escalated based on severity, frequency, coaching progress, and impact.

### Factors for Determining Sanction
1. Nature and gravity of behavior/performance issue
2. Relationship to employee's duties
3. Employee's work record
4. Circumstances surrounding the issue
5. Frequency and history
6. Coaching progress
7. Impact on client/company operations

### CAP Levels and Active Periods
| Level | Active Period | Description |
|-------|-------------|-------------|
| CAP 0 | None | Coaching & Counseling. Documented verbal warning. Minor violations. No NTE required. |
| CAP 1 | 60 days | First Formal. Minor breach. Progression from CAP 0. |
| CAP 2 | 90 days | Second Formal. Stern reminder and cautionary advice. |
| CAP 3 | 180 days | Third Formal / Accelerated CAP. Documented admonition. |
| Review for Termination | N/A | For grave violations or escalation from CAP 3. |

NOTE: CAP 4 has been abolished. CAP 3 is the highest CAP level.

### NTE Requirements
- CAP 2 or below: 48-hour response timeframe
- CAP 3 or above: 5-day response timeframe
- Failure to respond = waiver of right to explain

### Administrative Hearing
- Required for CAP 3 and above only
- Employee failure to appear: HRBP makes report, hearing adjourned

### Attendance Escalation Matrix (Progression System — No Cut-Off Periods)
Violations accumulate continuously. Slate resets ONLY when CAP 1+ is served.
If a new violation occurs during an active CAP, the CAP escalates one level.

| Instances | Unauthorized Absence | Tardiness | Undertime/Extended Break | NCNS/Critical Day | Absconding |
|-----------|---------------------|-----------|-------------------------|-------------------|------------|
| 1-2 | CAP 1 | CAP 0 | CAP 0 | 1st: CAP 2 | RT |
| 3-5 | CAP 2 | CAP 1 | CAP 1 | 2nd: CAP 3 | — |
| 6-8 | CAP 3 | CAP 2 | CAP 2 | 3rd: RT | — |
| 9+ | RT | CAP 3 | CAP 3 | — | — |

### Attendance Violation Codes
| Code | Violation | Base Sanction |
|------|-----------|--------------|
| 7.1 | Tardiness | CAP 0 |
| 7.2 | Unauthorized undertime or extended break | CAP 0 |
| 7.3 | Unauthorized Absence (no prior approval or no notification 2-4 hrs before shift) | CAP 1 |
| 7.4 | No Call No Show | CAP 2 |
| 7.5 | Absence on critical workdays | CAP 2 |
| 7.6 | Absconding (3+ consecutive days) | Review for Termination |

### Key Rules
- Multiple violations in one instance → highest indicated penalty applies
- Violation during active CAP → escalate one level higher
- NTE must be issued within 72 hours of violation
- Only one NTE at a time; subsequent NTEs only after current case resolved
- UPL adjacent to PL or work-off days = unauthorized (pattern absenteeism)
- Medical cert required for 2+ consecutive days absence

### Violation Categories (7 Main Categories)
1. Misconduct - Basic Discipline (CAP 0 to CAP 1)
2. Misconduct - Facilities and Workplace Standards (CAP 1 to RT)
3. Misconduct - Performance and Work Code Standards (CAP 1 to RT)
4. Misconduct - IT Infrastructure, Data Privacy and Controllership (CAP 1 to RT)
5. Misconduct - Improper Actions, Ethics and Activity (CAP 2 to RT)
6. Misconduct - Fraud/Deception/Dishonesty (ALL Review for Termination)
7. Attendance Discipline (CAP 0 to RT, per escalation matrix)
`;

// ── Helpers ─────────────────────────────────────────────────────────────

async function resolveEmployeeOhr(
  db: any,
  userEmail: string
): Promise<string | null> {
  const emp = await db
    .select({ ohr_id: ioEmployees.ohr_id })
    .from(ioEmployees)
    .where(eq(ioEmployees.meta_email, userEmail))
    .limit(1);
  return emp.length > 0 ? emp[0].ohr_id : null;
}

async function getEmployeeRole(
  db: any,
  ohr: string
): Promise<string | null> {
  const emp = await db
    .select({ actual_role: ioEmployees.actual_role })
    .from(ioEmployees)
    .where(eq(ioEmployees.ohr_id, ohr))
    .limit(1);
  return emp.length > 0 ? emp[0].actual_role : null;
}

async function buildEmployeeContext(db: any, employeeOhr: string) {
  // 1. Employee profile
  const empRows = await db
    .select()
    .from(ioEmployees)
    .where(eq(ioEmployees.ohr_id, employeeOhr))
    .limit(1);
  const emp = empRows[0] || null;

  // 2. Coaching history
  const coachingLogs = await db
    .select()
    .from(compassCoachingLogs)
    .where(eq(compassCoachingLogs.coachee_ohr, employeeOhr))
    .orderBy(desc(compassCoachingLogs.created_at))
    .limit(50);

  // 3. CA history
  const caCases = await db
    .select()
    .from(compassCaCases)
    .where(eq(compassCaCases.employee_ohr, employeeOhr))
    .orderBy(desc(compassCaCases.created_at))
    .limit(20);

  // 4. Attendance — find reset point (last served CAP 1+)
  const lastCap = await db
    .select()
    .from(compassCaCases)
    .where(
      and(
        eq(compassCaCases.employee_ohr, employeeOhr),
        inArray(compassCaCases.final_cap_level, ["cap_1", "cap_2", "cap_3"]),
        inArray(compassCaCases.case_status, [
          "active_period",
          "case_closed",
          "cap_issued",
        ])
      )
    )
    .orderBy(desc(compassCaCases.created_at))
    .limit(1);

  let resetDate: string | null = null;
  if (lastCap.length > 0 && lastCap[0].active_period_start) {
    resetDate = lastCap[0].active_period_start;
  }

  const attendanceConditions: any[] = [
    eq(ioAttendance.ohr_id, employeeOhr),
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
  let undertime = 0;

  for (const row of attendance) {
    const tag = (row.tag || "").toUpperCase();
    const reason = (row.upl_reason || "").toUpperCase();

    if (tag === "LATE") tardiness++;
    else if (tag === "UPL" || tag === "NCNS" || tag === "NYO") {
      if (reason === "NCNS" || tag === "NCNS") ncns++;
      else unauthorizedAbsence++;
    } else if (tag === "EXIT") undertime++;
  }

  // 5. Active CAP
  const activeCap = caCases.find(
    (c: any) =>
      c.case_status === "active_period" || c.case_status === "cap_issued"
  );

  return {
    employee: emp
      ? {
          name: emp.full_name,
          ohr: emp.ohr_id,
          role: emp.actual_role,
          supervisor: emp.supervisor_name,
          planningGroup: emp.planning_group,
          status: emp.employement_status,
        }
      : null,
    coachingHistory: coachingLogs.map((l: any) => ({
      id: l.log_id,
      type: l.coaching_type,
      date: l.coaching_date,
      sessionGoals: l.session_goals,
      status: l.status,
      acknowledged: l.ack_status,
    })),
    caHistory: caCases.map((c: any) => ({
      id: c.case_id,
      violationType: c.violation_type,
      violationCategory: c.violation_category_name,
      recommendedCapLevel: c.recommended_cap_level,
      finalCapLevel: c.final_cap_level,
      status: c.case_status,
      incidentDate: c.incident_date,
      activePeriodStart: c.active_period_start,
      activePeriodEnd: c.active_period_end,
    })),
    attendanceSummary: {
      sinceDate: resetDate || "All time (no prior CAP 1+ served)",
      tardiness,
      ncns,
      unauthorizedAbsence,
      undertime,
      totalViolations: tardiness + ncns + unauthorizedAbsence + undertime,
    },
    activeCap: activeCap
      ? {
          caseId: activeCap.case_id,
          capLevel: activeCap.final_cap_level || activeCap.recommended_cap_level,
          status: activeCap.case_status,
          activePeriodEnd: activeCap.active_period_end,
        }
      : null,
  };
}

// ── AI Response Schema ──────────────────────────────────────────────────
const AI_RESPONSE_SCHEMA = {
  name: "cap_recommendation",
  strict: true,
  schema: {
    type: "object" as const,
    properties: {
      recommended_cap_level: {
        type: "string",
        description:
          "The recommended CAP level: cap_0, cap_1, cap_2, cap_3, or review_for_termination",
      },
      reasoning: {
        type: "string",
        description:
          "Detailed reasoning for the recommendation, referencing specific policy sections, employee history, and aggravating/mitigating factors",
      },
      applicable_violations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "Policy violation code (e.g., 7.1, 3.1.1)",
            },
            text: {
              type: "string",
              description: "Violation description",
            },
            base_sanction: {
              type: "string",
              description: "Base sanction per policy",
            },
          },
          required: ["code", "text", "base_sanction"],
          additionalProperties: false,
        },
        description: "List of applicable violations from the GPHR policy",
      },
      aggravating_factors: {
        type: "array",
        items: { type: "string" },
        description: "Factors that support a higher sanction",
      },
      mitigating_factors: {
        type: "array",
        items: { type: "string" },
        description: "Factors that support a lower sanction",
      },
      requires_nte: {
        type: "boolean",
        description: "Whether an NTE is required (false for CAP 0)",
      },
      requires_hearing: {
        type: "boolean",
        description: "Whether an administrative hearing is required (true for CAP 3+)",
      },
      active_period_days: {
        type: "number",
        description:
          "Active period in days: 0 for CAP 0, 60 for CAP 1, 90 for CAP 2, 180 for CAP 3",
      },
      response_timeframe: {
        type: "string",
        description:
          "Employee response timeframe: '48 hours' for CAP 2 or below, '5 days' for CAP 3+",
      },
      disclaimer: {
        type: "string",
        description: "Standard advisory disclaimer",
      },
    },
    required: [
      "recommended_cap_level",
      "reasoning",
      "applicable_violations",
      "aggravating_factors",
      "mitigating_factors",
      "requires_nte",
      "requires_hearing",
      "active_period_days",
      "response_timeframe",
      "disclaimer",
    ],
    additionalProperties: false,
  },
};

// ── Router ──────────────────────────────────────────────────────────────
export const aiAssistantRouter = router({
  /**
   * Get a structured CAP recommendation for a specific employee + violation.
   * Used inline in the CA Case creation form.
   */
  recommend: protectedProcedure
    .input(
      z.object({
        employeeOhr: z.string(),
        violationDescription: z.string(),
        violationCategoryName: z.string().optional(),
        violationSubsection: z.string().optional(),
        additionalContext: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database unavailable",
        });

      // Verify caller has a role that can file cases
      const callerOhr = await resolveEmployeeOhr(
        db,
        ctx.user?.email || ""
      );
      if (callerOhr) {
        const role = await getEmployeeRole(db, callerOhr);
        if (role === "Agent") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Agents cannot use the AI assistant",
          });
        }
      }

      // Build full employee context
      const empContext = await buildEmployeeContext(db, input.employeeOhr);

      if (!empContext.employee) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Employee not found",
        });
      }

      // Build the LLM prompt
      const systemPrompt = `You are the Compass AI CAP Assistant, an expert in the Genpact Philippines HR Corrective Action Policy v3.0. Your role is to analyze employee history and recommend the appropriate CAP level for a given violation.

You MUST follow the policy rules exactly. Do not invent rules or deviate from the policy.

${POLICY_RULES}

IMPORTANT RULES:
1. Always reference specific policy sections in your reasoning.
2. Consider the employee's full history — coaching logs, prior CA cases, attendance record.
3. If the employee has an active CAP and commits a new violation, recommend escalation (one level higher).
4. For attendance violations, use the escalation matrix based on accumulated instances since last CAP reset.
5. The slate resets ONLY when a CAP 1+ is served. CAP 0 does NOT reset the slate.
6. CAP 4 has been abolished. CAP 3 is the maximum. If escalation would go beyond CAP 3, recommend Review for Termination.
7. Always include the disclaimer that this is advisory only.`;

      const userPrompt = `Analyze this case and provide a CAP recommendation:

## Employee Profile
- Name: ${empContext.employee.name}
- OHR: ${empContext.employee.ohr}
- Role: ${empContext.employee.role}
- Supervisor: ${empContext.employee.supervisor}
- Planning Group: ${empContext.employee.planningGroup}

## Current Violation
- Description: ${input.violationDescription}
${input.violationCategoryName ? `- Category: ${input.violationCategoryName}` : ""}
${input.violationSubsection ? `- Subsection: ${input.violationSubsection}` : ""}
${input.additionalContext ? `- Additional Context: ${input.additionalContext}` : ""}

## Coaching History (${empContext.coachingHistory.length} logs)
${
  empContext.coachingHistory.length > 0
    ? empContext.coachingHistory
        .map(
          (l: any) =>
            `- [${l.date}] ${l.type} | Goals: ${l.sessionGoals || "—"} | Status: ${l.status} | Ack: ${l.acknowledged}`
        )
        .join("\n")
    : "No coaching logs on record."
}

## CA History (${empContext.caHistory.length} cases)
${
  empContext.caHistory.length > 0
    ? empContext.caHistory
        .map(
          (c: any) =>
            `- [${c.incidentDate}] ${c.violationType || c.violationCategory || "—"} | CAP: ${c.finalCapLevel || c.recommendedCapLevel || "—"} | Status: ${c.status} | Active: ${c.activePeriodStart || "—"} to ${c.activePeriodEnd || "—"}`
        )
        .join("\n")
    : "No prior CA cases on record."
}

## Attendance Summary (since: ${empContext.attendanceSummary.sinceDate})
- Tardiness instances: ${empContext.attendanceSummary.tardiness}
- NCNS instances: ${empContext.attendanceSummary.ncns}
- Unauthorized Absence instances: ${empContext.attendanceSummary.unauthorizedAbsence}
- Undertime instances: ${empContext.attendanceSummary.undertime}
- Total violations: ${empContext.attendanceSummary.totalViolations}

## Active CAP
${
  empContext.activeCap
    ? `- Case: ${empContext.activeCap.caseId} | Level: ${empContext.activeCap.capLevel} | Status: ${empContext.activeCap.status} | Expires: ${empContext.activeCap.activePeriodEnd || "—"}`
    : "No active CAP."
}

Provide your structured recommendation.`;

      const llmResponse = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: AI_RESPONSE_SCHEMA,
        },
      });

      const content = llmResponse.choices?.[0]?.message?.content;
      if (!content || typeof content !== "string") {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "AI assistant returned an empty response",
        });
      }

      try {
        const recommendation = JSON.parse(content);

        // Log the recommendation in the CA timeline if a case exists
        // (for audit purposes — event_type: ai_recommendation_requested)

        return {
          recommendation,
          employeeContext: {
            name: empContext.employee.name,
            ohr: empContext.employee.ohr,
            coachingCount: empContext.coachingHistory.length,
            caCount: empContext.caHistory.length,
            attendanceSummary: empContext.attendanceSummary,
            activeCap: empContext.activeCap,
          },
        };
      } catch (e) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to parse AI recommendation",
        });
      }
    }),

  /**
   * Conversational AI assistant — free-form question about an employee.
   * Used on the standalone AI Assistant page.
   */
  chat: protectedProcedure
    .input(
      z.object({
        employeeOhr: z.string().optional(),
        message: z.string(),
        conversationHistory: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string(),
            })
          )
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database unavailable",
        });

      // Verify caller role
      const callerOhr = await resolveEmployeeOhr(
        db,
        ctx.user?.email || ""
      );
      if (callerOhr) {
        const role = await getEmployeeRole(db, callerOhr);
        if (role === "Agent") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Agents cannot use the AI assistant",
          });
        }
      }

      // Build employee context if OHR provided
      let empContextStr = "";
      if (input.employeeOhr) {
        const empContext = await buildEmployeeContext(
          db,
          input.employeeOhr
        );
        if (empContext.employee) {
          empContextStr = `
## Employee Context for ${empContext.employee.name} (${empContext.employee.ohr})
- Role: ${empContext.employee.role} | Supervisor: ${empContext.employee.supervisor} | PG: ${empContext.employee.planningGroup}
- Coaching Logs: ${empContext.coachingHistory.length} total
${empContext.coachingHistory.slice(0, 10).map((l: any) => `  - [${l.date}] ${l.type} | ${l.sessionGoals || "—"} | Ack: ${l.acknowledged}`).join("\n")}
- CA Cases: ${empContext.caHistory.length} total
${empContext.caHistory.map((c: any) => `  - [${c.incidentDate}] ${c.violationType || c.violationCategory || "—"} | ${c.finalCapLevel || c.recommendedCapLevel || "—"} | ${c.status}`).join("\n")}
- Attendance (since ${empContext.attendanceSummary.sinceDate}): Tardiness=${empContext.attendanceSummary.tardiness}, NCNS=${empContext.attendanceSummary.ncns}, UA=${empContext.attendanceSummary.unauthorizedAbsence}, Undertime=${empContext.attendanceSummary.undertime}
${empContext.activeCap ? `- ACTIVE CAP: ${empContext.activeCap.capLevel} (${empContext.activeCap.status}), expires ${empContext.activeCap.activePeriodEnd || "—"}` : "- No active CAP"}`;
        }
      }

      const systemPrompt = `You are the Compass AI CAP Assistant, an expert advisor on the Genpact Philippines HR Corrective Action Policy v3.0. You help team leaders and supervisors make informed decisions about corrective actions.

${POLICY_RULES}

${empContextStr}

GUIDELINES:
- Always reference specific policy sections when giving advice.
- If asked about a specific employee, use the employee context provided above.
- If no employee is selected, give general policy guidance.
- Be concise but thorough. Use bullet points for clarity.
- Always remind the user that your recommendations are advisory — the final decision rests with the issuing supervisor.
- If you don't have enough information, ask clarifying questions.
- Never auto-create cases or auto-issue CAPs.`;

      // Build conversation messages
      const messages: any[] = [
        { role: "system", content: systemPrompt },
      ];

      // Add conversation history
      if (input.conversationHistory) {
        for (const msg of input.conversationHistory) {
          messages.push({ role: msg.role, content: msg.content });
        }
      }

      // Add current message
      messages.push({ role: "user", content: input.message });

      const llmResponse = await invokeLLM({ messages });

      const content = llmResponse.choices?.[0]?.message?.content;
      if (!content || typeof content !== "string") {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "AI assistant returned an empty response",
        });
      }

      return { reply: content };
    }),
});
