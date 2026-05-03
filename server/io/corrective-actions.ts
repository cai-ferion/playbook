/**
 * Corrective Actions Domain Module
 * Extracted from io-routes.ts — handles NTE Build Assist (AI narrative + DOCX),
 * Corrective Actions CRUD + CAP lifecycle, CAP Build Assist (AI + DOCX)
 */
import { Router, Request, Response } from "express";
import { getDb } from "../db.js";
import { ioCorrectiveActions, ioEmployees, ioNotifications } from "../../drizzle/schema.js";
import { eq, and, gte, lte, desc, or } from "drizzle-orm";
import { invokeLLM } from "../_core/llm.js";
import crypto from "crypto";
import {
  validate,
  correctiveActionCreateSchema,
  correctiveActionUpdateSchema,
  nteBuildAssistGenerateSchema,
  nteBuildAssistDocxSchema,
  capBuildAssistGenerateSchema,
  capBuildAssistDocxSchema,
} from "./validation.js";
import { emitChange } from "./emit-change.js";
import { optimisticUpdate, sendConflict, getClientVersion } from "./optimistic-lock.js";

const router = Router();

// CAP level → active period in days (from GPHR Policy v3.0)
const CAP_ACTIVE_DAYS: Record<string, number> = {
  'CAP 0': 0,
  'CAP 1': 60,
  'CAP 2': 90,
  'CAP 3': 180,
  'Corrective Suspension': 0,
  'Review for Termination': 0,
};

// ============================================================
// NTE BUILD ASSIST — AI Narrative Generation
// ============================================================

router.post("/nte-build-assist/generate", validate(nteBuildAssistGenerateSchema), async (req: Request, res: Response) => {
  try {
    const { employee, violation, violations, cap_level, date_range, attendance, previous_ntes } = req.body;
    const allViolations = (violations && violations.length > 0) ? violations : (violation ? [violation] : []);

    if (!employee || allViolations.length === 0) {
      return res.status(400).json({ error: "Employee and at least one violation are required" });
    }

    // Build attendance summary for the AI
    const attSummary = (attendance || []).map((a: any) => {
      const tag = (a.tag || '\u2014').toUpperCase();
      return `${a.log_date}: ${tag}${a.upl_reason ? ' (' + a.upl_reason + ')' : ''}`;
    }).join('\n');

    // Build previous NTE context
    const prevNteSummary = (previous_ntes || []).length > 0
      ? (previous_ntes || []).map((n: any) => `- ${n.cap_level} on ${n.date_of_incident || 'unknown date'}: ${n.incident_description || 'No description'}`).join('\n')
      : 'None on record.';

    // Identify violation dates (UPL, NCNS, LATE)
    const violationTags = ['UPL', 'NCNS', 'LATE', 'AWOL'];
    const violationDates = (attendance || []).filter((a: any) => violationTags.includes((a.tag || '').toUpperCase())).map((a: any) => {
      const d = new Date(a.log_date + 'T00:00:00');
      return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    });

    const systemPrompt = `You are a professional HR document writer for Genpact Philippines. You write Notice to Explain (NTE) letters that are formal, precise, and legally compliant with Philippine labor law (Article 282 of the Labor Code). Your tone is firm but fair, using third-person formal language.

IMPORTANT RULES:
- Use formal business English
- Reference specific dates and facts from the attendance data
- Cite the exact policy section and subsection from GP HR Procedures & Policy 3.0
- Do NOT fabricate dates or facts not in the provided data
- Keep the narrative concise (2-3 paragraphs)
- Use the employee's last name with appropriate honorific (Mr./Ms.)`;

    const userPrompt = `Generate two sections for an NTE letter:

**EMPLOYEE:**
- Name: ${employee.full_name}
- OHR ID: ${employee.ohr_id}
- Role: ${employee.actual_role || 'Process Associate'}
- Planning Group: ${employee.planning_group || 'N/A'}
- Supervisor: ${employee.supervisor_name || 'N/A'}

**VIOLATION(S):**
${allViolations.map((v: any, i: number) => `Violation ${i + 1}:\n- Code: ${v.code}\n- Description: ${v.type || v.text || 'N/A'}\n- Section: ${v.category || 'N/A'}\n- Subsection: ${v.subsection || (v.subsectionCode ? (v.subsectionCode + ' ' + (v.subsectionTitle || '')) : 'N/A')}\n- Standard Penalty: ${v.penalty}`).join('\n\n')}
- Recommended CAP Level: ${cap_level}

**DATE RANGE:** ${date_range?.start || 'N/A'} to ${date_range?.end || 'N/A'}

**ATTENDANCE DATA:**
${attSummary || 'No attendance data provided.'}

**VIOLATION DATES:** ${violationDates.length > 0 ? violationDates.join(', ') : 'See attendance data above'}

**PREVIOUS NTEs:**
${prevNteSummary}

Please generate:

1. **INCIDENT NARRATIVE** (2-3 paragraphs): A formal description of the incident(s) referencing specific dates from the attendance data. Start with "This serves to formally notify..." or similar formal opening. Reference the specific dates of violation. If this is a repeat offense, mention the previous NTEs.

2. **POLICY VIOLATED**: For each violation, cite the specific sections of GP HR Procedures & Policy 3.0 that were violated. Format as a hierarchical list with each level on its own line:
   - For each violation, output: section title, subsection code+title, sub-subsection code+description
   - If multiple violations share the same section, do NOT repeat the section header
   - If multiple violations share the same section AND subsection, do NOT repeat either
   - Use the EXACT section, subsection, and sub-subsection from the violation data provided above
   - Do NOT include any intro text, Article 282 references, or outro text
   - ONLY output the hierarchical lines, nothing else

Format your response as JSON with two keys: "narrative" (HTML string) and "policy_text" (HTML string with each line separated by <br> tags, NO bullet points or list markers).`;

    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "nte_narrative",
          strict: true,
          schema: {
            type: "object",
            properties: {
              narrative: { type: "string", description: "HTML-formatted incident narrative (2-3 paragraphs)" },
              policy_text: { type: "string", description: "HTML-formatted policy citations with bullet points" }
            },
            required: ["narrative", "policy_text"],
            additionalProperties: false
          }
        }
      }
    });

    const rawContent = response?.choices?.[0]?.message?.content || '{}';
    const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      // If JSON parsing fails, use the raw content
      parsed = { narrative: content, policy_text: '' };
    }

    res.json({
      narrative: parsed.narrative || '',
      policy_text: parsed.policy_text || ''
    });
  } catch (err: any) {
    console.error("[IO API] NTE Build Assist generate error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// NTE BUILD ASSIST — DOCX Document Generation
// ============================================================

router.post("/nte-build-assist/docx", validate(nteBuildAssistDocxSchema), async (req: Request, res: Response) => {
  try {
    const { generateNTEDocx } = await import("../nte-docx-generator.js");
    const {
      date, employee, narrative, policy_sections, cap_level,
      violation, violations, flm_name, hr_name,
      include_cwd_page
    } = req.body;

    if (!employee || !narrative) {
      return res.status(400).json({ error: "Employee and narrative are required" });
    }

    // Extract last name from full_name ("Last, First Middle" format)
    const nameParts = (employee.full_name || "").split(",");
    const lastName = nameParts[0]?.trim() || employee.full_name;

    const buffer = await generateNTEDocx({
      date: date || new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
      employee: {
        full_name: employee.full_name,
        last_name: lastName,
        ohr_id: employee.ohr_id || "",
        actual_role: employee.actual_role || "Process Associate",
        department: employee.department || "Operations",
        supervisor_name: employee.supervisor_name || "",
        gender: employee.gender || "Male",
        sex: employee.sex || "",
      },
      narrative: narrative || "",
      policy_sections: Array.isArray(policy_sections) ? policy_sections : (policy_sections ? [policy_sections] : []),
      cap_level: cap_level || "CAP 0",
      violation: violation || (violations && violations[0]) || { code: "", type: "", category: "", penalty: "" },
      violations: violations || (violation ? [violation] : []),
      flm_name: flm_name || employee.supervisor_name || "",
      hr_name: hr_name || "Jocelyn Ramos",
      include_cwd_page: include_cwd_page || false,
    });

    // Sanitize filename
    const safeName = (employee.full_name || "Employee").replace(/[^a-zA-Z0-9 ,]/g, "").replace(/\s+/g, "_");
    const filename = `NTE_${safeName}_${new Date().toISOString().slice(0, 10)}.docx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err: any) {
    console.error("[IO API] NTE DOCX generation error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Corrective Actions (NTE → CAP Lifecycle)
// ============================================================

// Server-side role enforcement: only TLs and Managers can create/modify CAs
async function caEnforceRole(req: Request, res: Response): Promise<boolean> {
  const actorOhr = req.body?.created_by_ohr || req.body?.decision_by_ohr || '';
  if (!actorOhr) { res.status(403).json({ error: 'Actor OHR required' }); return false; }
  // Admin bypass
  if (actorOhr === '740045023') return true;
  const db = await getDb();
  if (!db) { res.status(500).json({ error: 'DB unavailable' }); return false; }
  const [emp] = await db.select({ role: ioEmployees.actual_role }).from(ioEmployees).where(eq(ioEmployees.ohr_id, actorOhr)).limit(1);
  const role = emp?.role || '';
  if (role !== 'Team Lead' && role !== 'Manager') {
    console.warn(`[CA RBAC] Blocked ${actorOhr} (role=${role}) from CA write operation`);
    res.status(403).json({ error: 'Only Team Leads and Managers can perform this action' });
    return false;
  }
  return true;
}

// GET /api/io/corrective-actions — list with filters
router.get("/corrective-actions", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { ohr_id, status, nte_type, planning_group, supervisor_ohr, start_date, end_date, limit: lim, offset: off } = req.query;
    const conditions: any[] = [];

    if (ohr_id) conditions.push(eq(ioCorrectiveActions.ohr_id, String(ohr_id)));
    if (status) conditions.push(eq(ioCorrectiveActions.status, String(status)));
    if (nte_type) conditions.push(eq(ioCorrectiveActions.nte_type, String(nte_type)));
    if (planning_group) conditions.push(eq(ioCorrectiveActions.planning_group, String(planning_group)));
    if (supervisor_ohr) conditions.push(eq(ioCorrectiveActions.supervisor_ohr, String(supervisor_ohr)));
    if (start_date) conditions.push(gte(ioCorrectiveActions.date_of_incident, String(start_date)));
    if (end_date) conditions.push(lte(ioCorrectiveActions.date_of_incident, String(end_date)));

    let q = db.select().from(ioCorrectiveActions);
    if (conditions.length > 0) q = q.where(and(...conditions)) as any;
    q = q.orderBy(desc(ioCorrectiveActions.created_at)) as any;
    if (lim) q = q.limit(Number(lim)) as any;
    if (off) q = q.offset(Number(off)) as any;

    const rows = await q;
    res.json(rows);
  } catch (err: any) {
    console.error("[IO API] corrective-actions GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/io/corrective-actions/stats — summary card counts
router.get("/corrective-actions/stats", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const all = await db.select().from(ioCorrectiveActions);
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);

    // Auto-expire CAPs past their expiry date
    const toExpire = all.filter(r => r.status === 'CAP Issued' && r.cap_expiry_date && r.cap_expiry_date < today);
    for (const r of toExpire) {
      await db.update(ioCorrectiveActions)
        .set({ status: 'Expired', updated_at: now.toISOString() })
        .where(eq(ioCorrectiveActions.id, r.id));
      r.status = 'Expired'; // update in-memory too
    }

    const pending = all.filter(r => r.status === 'Served').length;
    const activeCaps = all.filter(r => r.status === 'CAP Issued').length;
    const expiringSoon = all.filter(r => r.status === 'CAP Issued' && r.cap_expiry_date && r.cap_expiry_date >= today && r.cap_expiry_date <= thirtyDaysFromNow).length;
    // Dismissed this quarter
    const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).toISOString().slice(0, 10);
    const dismissed = all.filter(r => r.status === 'Dismissed' && r.cap_decision_date && r.cap_decision_date >= qStart).length;

    res.json({ pending, activeCaps, expiringSoon, dismissed });
  } catch (err: any) {
    console.error("[IO API] corrective-actions/stats GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/io/corrective-actions/employee/:ohr_id/history — CAP history for an employee
router.get("/corrective-actions/employee/:ohr_id/history", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const rows = await db.select().from(ioCorrectiveActions)
      .where(eq(ioCorrectiveActions.ohr_id, req.params.ohr_id))
      .orderBy(desc(ioCorrectiveActions.created_at));
    res.json(rows);
  } catch (err: any) {
    console.error("[IO API] corrective-actions/history GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/io/corrective-actions/:id — single record
router.get("/corrective-actions/:id", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const [row] = await db.select().from(ioCorrectiveActions)
      .where(eq(ioCorrectiveActions.id, req.params.id));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err: any) {
    console.error("[IO API] corrective-actions/:id GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/corrective-actions — create new NTE
router.post("/corrective-actions", validate(correctiveActionCreateSchema), async (req: Request, res: Response) => {
  try {
    if (!(await caEnforceRole(req, res))) return;
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const body = req.body;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // Calculate response deadline: 48hrs for CAP ≤ 2, 5 days for CAP 3+
    let deadlineHours = 48;
    const indicatedCap = body.indicated_cap_level || '';
    if (['CAP 3', 'Corrective Suspension', 'Review for Termination'].includes(indicatedCap)) {
      deadlineHours = 120; // 5 days
    }
    const deadlineDate = new Date(Date.now() + deadlineHours * 3600000).toISOString();

    const record = {
      id,
      employee_name: body.employee_name,
      ohr_id: body.ohr_id,
      employee_email: body.employee_email || null,
      supervisor_name: body.supervisor_name || null,
      supervisor_ohr: body.supervisor_ohr || null,
      supervisor_email: body.supervisor_email || null,
      planning_group: body.planning_group || null,
      actual_role: body.actual_role || null,
      nte_type: body.nte_type || null,
      date_of_incident: body.date_of_incident || null,
      incident_description: body.incident_description || null,
      policy_violated: body.policy_violated || null,
      violations: body.violations ? JSON.stringify(body.violations) : null,
      response_deadline: deadlineDate,
      status: 'Served',
      served_date: now,
      linked_coaching_id: body.linked_coaching_id || null,
      attachments: body.attachments ? JSON.stringify(body.attachments) : null,
      created_by: body.created_by || null,
      created_by_ohr: body.created_by_ohr || null,
      created_at: now,
      updated_at: now,
    };

    await db.insert(ioCorrectiveActions).values(record);

    // Create notification for the agent
    try {
      await db.insert(ioNotifications).values({
        type: 'nte_issued',
        title: 'Notice to Explain Issued',
        message: `An NTE has been issued to you regarding: ${body.nte_type || 'Policy Violation'}. Please respond within ${deadlineHours} hours.`,
        actor_ohr: body.created_by_ohr || null,
        actor_name: body.created_by || 'System',
        target_ohr: body.ohr_id,
        target_role: 'agent',
        metadata: JSON.stringify({ ca_id: id, nte_type: body.nte_type }),
        is_read: false,
        created_at: now,
      });
    } catch (notifErr: any) {
      console.error('[IO API] NTE notification error:', notifErr.message);
    }

    // Notification: NTE Served — notify the issuing TL/creator
    try {
      if (body.created_by_ohr && body.created_by_ohr !== body.ohr_id) {
        await db.insert(ioNotifications).values({
          type: 'nte_served',
          title: `NTE Served \u2014 ${body.employee_name || body.ohr_id}`,
          message: `NTE for ${body.employee_name || body.ohr_id} regarding ${body.nte_type || 'Policy Violation'} has been served. Deadline: ${deadlineHours} hours.`,
          actor_ohr: body.ohr_id,
          actor_name: body.employee_name || 'Employee',
          target_ohr: body.created_by_ohr,
          metadata: JSON.stringify({ ca_id: id, nte_type: body.nte_type, employee_name: body.employee_name }),
          is_read: false,
          created_at: now,
        });
      }
    } catch (notifErr: any) {
      console.error('[IO API] NTE served notification error:', notifErr.message);
    }

    // Notification: Repeat Offender — if agent has 2+ NTEs in last 90 days
    try {
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const recentNtes = await db.select({ id: ioCorrectiveActions.id })
        .from(ioCorrectiveActions)
        .where(and(
          eq(ioCorrectiveActions.ohr_id, body.ohr_id),
          gte(ioCorrectiveActions.created_at, ninetyDaysAgo)
        ));
      if (recentNtes.length >= 2 && body.created_by_ohr) {
        await db.insert(ioNotifications).values({
          type: 'repeat_offender',
          title: `Repeat Offender \u2014 ${body.employee_name || body.ohr_id}`,
          message: `${body.employee_name || body.ohr_id} has received ${recentNtes.length} NTEs in the last 90 days. Consider escalation.`,
          actor_ohr: 'SYSTEM',
          actor_name: 'Playbook System',
          target_ohr: body.created_by_ohr,
          metadata: JSON.stringify({ ca_id: id, total_ntes_90d: recentNtes.length, employee_name: body.employee_name, ohr_id: body.ohr_id }),
          is_read: false,
          created_at: now,
        });
        // Also notify the supervisor if different from creator
        if (body.supervisor_ohr && body.supervisor_ohr !== body.created_by_ohr) {
          await db.insert(ioNotifications).values({
            type: 'repeat_offender',
            title: `Repeat Offender \u2014 ${body.employee_name || body.ohr_id}`,
            message: `${body.employee_name || body.ohr_id} has received ${recentNtes.length} NTEs in the last 90 days. Consider escalation.`,
            actor_ohr: 'SYSTEM',
            actor_name: 'Playbook System',
            target_ohr: body.supervisor_ohr,
            metadata: JSON.stringify({ ca_id: id, total_ntes_90d: recentNtes.length, employee_name: body.employee_name, ohr_id: body.ohr_id }),
            is_read: false,
            created_at: now,
          });
        }
      }
    } catch (notifErr: any) {
      console.error('[IO API] Repeat offender notification error:', notifErr.message);
    }

    res.status(201).json({ ...record, id });
  } catch (err: any) {
    console.error("[IO API] corrective-actions POST error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/io/corrective-actions/:id — update (assign CAP, dismiss)
router.patch("/corrective-actions/:id", validate(correctiveActionUpdateSchema), async (req: Request, res: Response) => {
  try {
    if (!(await caEnforceRole(req, res))) return;
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { id } = req.params;
    const body = req.body;
    const now = new Date().toISOString();

    const [existing] = await db.select().from(ioCorrectiveActions)
      .where(eq(ioCorrectiveActions.id, id));
    if (!existing) return res.status(404).json({ error: "Not found" });

    const updates: any = { updated_at: now };

    // Assign CAP
    if (body.action === 'assign_cap') {
      if (existing.status !== 'Served') {
        return res.status(400).json({ error: "Can only assign CAP to NTEs with 'Served' status" });
      }
      updates.status = 'CAP Issued';
      updates.cap_level = body.cap_level;
      updates.cap_active_days = CAP_ACTIVE_DAYS[body.cap_level] ?? 0;
      updates.cap_decision_date = now;
      updates.cap_decision_by = body.decision_by || null;
      updates.cap_decision_by_ohr = body.decision_by_ohr || null;
      updates.cap_remarks = body.remarks || null;
      updates.cap_start_date = body.cap_start_date || now.slice(0, 10);
      const activeDays = updates.cap_active_days;
      if (activeDays > 0) {
        const start = new Date(updates.cap_start_date + 'T00:00:00Z');
        start.setUTCDate(start.getUTCDate() + activeDays);
        updates.cap_expiry_date = start.toISOString().slice(0, 10);
      }
      updates.suspension_days = body.suspension_days || null;
      if (body.nod_issued) {
        updates.nod_issued = true;
        updates.nod_date = now;
        updates.nod_summary = body.nod_summary || null;
      }

      // Notification: CAP Issued
      try {
        await db.insert(ioNotifications).values({
          type: 'cap_issued',
          title: `Corrective Action Issued \u2014 ${body.cap_level}`,
          message: `A ${body.cap_level} corrective action has been issued to you. ${activeDays > 0 ? `Active period: ${activeDays} days.` : ''}`,
          actor_ohr: body.decision_by_ohr || null,
          actor_name: body.decision_by || 'System',
          target_ohr: existing.ohr_id,
          target_role: 'agent',
          metadata: JSON.stringify({ ca_id: id, cap_level: body.cap_level }),
          is_read: false,
          created_at: now,
        });
      } catch (notifErr: any) {
        console.error('[IO API] CAP notification error:', notifErr.message);
      }

      // Notification: CAP Issued — Supervisor Copy
      try {
        if (existing.supervisor_ohr && existing.supervisor_ohr !== body.decision_by_ohr) {
          await db.insert(ioNotifications).values({
            type: 'cap_issued',
            title: `CAP Issued to ${existing.employee_name || existing.ohr_id} \u2014 ${body.cap_level}`,
            message: `A ${body.cap_level} corrective action has been issued to ${existing.employee_name || existing.ohr_id}. ${activeDays > 0 ? `Active period: ${activeDays} days.` : ''}`,
            actor_ohr: body.decision_by_ohr || null,
            actor_name: body.decision_by || 'System',
            target_ohr: existing.supervisor_ohr,
            metadata: JSON.stringify({ ca_id: id, cap_level: body.cap_level, employee_name: existing.employee_name, ohr_id: existing.ohr_id }),
            is_read: false,
            created_at: now,
          });
        }
      } catch (notifErr: any) {
        console.error('[IO API] CAP supervisor notification error:', notifErr.message);
      }

      // Notification: CAP Escalation Path — if agent moves from CAP 1→2 or CAP 2→3
      try {
        const capNum = parseInt((body.cap_level || '').replace(/\D/g, ''), 10);
        if (capNum >= 2) {
          const prevCapLevel = `CAP ${capNum - 1}`;
          const prevCaps = await db.select({ id: ioCorrectiveActions.id })
            .from(ioCorrectiveActions)
            .where(and(
              eq(ioCorrectiveActions.ohr_id, existing.ohr_id),
              eq(ioCorrectiveActions.cap_level, prevCapLevel)
            ));
          if (prevCaps.length > 0) {
            // Notify the decision-maker (TL)
            if (body.decision_by_ohr) {
              await db.insert(ioNotifications).values({
                type: 'cap_escalated',
                title: `CAP Escalation \u2014 ${existing.employee_name || existing.ohr_id}`,
                message: `${existing.employee_name || existing.ohr_id} has been escalated from ${prevCapLevel} to ${body.cap_level}. Review corrective action history.`,
                actor_ohr: 'SYSTEM',
                actor_name: 'Playbook System',
                target_ohr: body.decision_by_ohr,
                metadata: JSON.stringify({ ca_id: id, from_level: prevCapLevel, to_level: body.cap_level, employee_name: existing.employee_name }),
                is_read: false,
                created_at: now,
              });
            }
            // Notify the supervisor if different
            if (existing.supervisor_ohr && existing.supervisor_ohr !== body.decision_by_ohr) {
              await db.insert(ioNotifications).values({
                type: 'cap_escalated',
                title: `CAP Escalation \u2014 ${existing.employee_name || existing.ohr_id}`,
                message: `${existing.employee_name || existing.ohr_id} has been escalated from ${prevCapLevel} to ${body.cap_level}. Review corrective action history.`,
                actor_ohr: 'SYSTEM',
                actor_name: 'Playbook System',
                target_ohr: existing.supervisor_ohr,
                metadata: JSON.stringify({ ca_id: id, from_level: prevCapLevel, to_level: body.cap_level, employee_name: existing.employee_name }),
                is_read: false,
                created_at: now,
              });
            }
          }
        }
      } catch (notifErr: any) {
        console.error('[IO API] CAP escalation notification error:', notifErr.message);
      }
    }

    // Dismiss
    if (body.action === 'dismiss') {
      if (existing.status !== 'Served') {
        return res.status(400).json({ error: "Can only dismiss NTEs with 'Served' status" });
      }
      updates.status = 'Dismissed';
      updates.cap_decision_date = now;
      updates.cap_decision_by = body.decision_by || null;
      updates.cap_decision_by_ohr = body.decision_by_ohr || null;
      updates.cap_remarks = body.remarks || null;
      if (body.nod_issued) {
        updates.nod_issued = true;
        updates.nod_date = now;
        updates.nod_summary = body.nod_summary || null;
      }

      // Notification: NTE Dismissed
      try {
        await db.insert(ioNotifications).values({
          type: 'nte_dismissed',
          title: 'NTE Dismissed \u2014 No Further Action',
          message: 'Your Notice to Explain has been reviewed and dismissed. No further action is required.',
          actor_ohr: body.decision_by_ohr || null,
          actor_name: body.decision_by || 'System',
          target_ohr: existing.ohr_id,
          target_role: 'agent',
          metadata: JSON.stringify({ ca_id: id }),
          is_read: false,
          created_at: now,
        });
      } catch (notifErr: any) {
        console.error('[IO API] Dismiss notification error:', notifErr.message);
      }
    }

    // Generic field updates (for editing NTE details before CAP decision)
    if (!body.action) {
      const allowedFields = ['nte_type', 'date_of_incident', 'incident_description', 'policy_violated', 'violations', 'attachments'];
      for (const f of allowedFields) {
        if (body[f] !== undefined) {
          updates[f] = f === 'violations' || f === 'attachments' ? JSON.stringify(body[f]) : body[f];
        }
      }
    }

    const clientVersion = getClientVersion(req.body);
    if (clientVersion !== null) {
      const { version: _v, ...updateFields } = updates;
      const lockResult = await optimisticUpdate(db, ioCorrectiveActions, ioCorrectiveActions.id, id, clientVersion, updateFields);
      if (!lockResult.ok) {
        if (lockResult.reason === "not_found") return res.status(404).json({ error: "Not found" });
        return sendConflict(res, clientVersion, lockResult.serverState);
      }
    } else {
      await db.update(ioCorrectiveActions).set(updates).where(eq(ioCorrectiveActions.id, id));
    }

    const [updated] = await db.select().from(ioCorrectiveActions)
      .where(eq(ioCorrectiveActions.id, id));
    emitChange(req, "corrective-actions", "record_updated", { id: req.params.id });
    emitChange(req, "corrective-actions", "record_updated", { id: req.params.id });
    res.json(updated);
  } catch (err: any) {
    console.error("[IO API] corrective-actions PATCH error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// CAP BUILD ASSIST — DOCX Document Generation
// ============================================================

router.post("/cap-build-assist/docx", validate(capBuildAssistDocxSchema), async (req: Request, res: Response) => {
  try {
    const {
      cap_level, employee, explanation_date, explanation_summary,
      violation_section, violation_subsection, violations,
      flm_name, issuance_date, nte_response_text
    } = req.body;

    if (!employee || !cap_level) {
      return res.status(400).json({ error: "Employee and CAP level are required" });
    }

    const TEMPLATE_URLS: Record<string, string> = {
      'CAP 1': 'https://d2xsxph8kpxj0f.cloudfront.net/310519663445219651/5AVfpygNb7cNbPRpHCcCdp/Template-CAP1_bfdc8261.docx',
      'CAP 2': 'https://d2xsxph8kpxj0f.cloudfront.net/310519663445219651/5AVfpygNb7cNbPRpHCcCdp/Template-CAP2_fbec4ea4.docx',
      'CAP 3': 'https://d2xsxph8kpxj0f.cloudfront.net/310519663445219651/5AVfpygNb7cNbPRpHCcCdp/Template-CAP3_bbb57f1f.docx',
    };

    const templateUrl = TEMPLATE_URLS[cap_level];
    if (!templateUrl) {
      return res.status(400).json({ error: `No template available for ${cap_level}` });
    }

    const templateResp = await fetch(templateUrl);
    if (!templateResp.ok) throw new Error(`Failed to fetch template: ${templateResp.status}`);
    const templateBuffer = Buffer.from(await templateResp.arrayBuffer());

    const PizZip = (await import("pizzip")).default;
    const zip = new PizZip(templateBuffer);

    const activeDays = CAP_ACTIVE_DAYS[cap_level] || 60;
    const startDate = issuance_date ? new Date(issuance_date) : new Date();
    const endDate = new Date(startDate.getTime() + activeDays * 24 * 60 * 60 * 1000);
    const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const issuanceDateStr = fmtDate(startDate);
    const activeEndDateStr = fmtDate(endDate);

    const employeeName = employee.full_name || 'Employee';
    const lastName = employeeName.split(',')[0]?.trim() || employeeName.split(' ').pop() || 'Employee';
    const supervisorName = flm_name || employee.supervisor_name || 'Supervisor';
    const violSection = violation_section || 'Section';
    const violSubsection = violation_subsection || 'Sub Section';
    const deliberationText = nte_response_text || explanation_summary || 'the administrative charge leveled against you has been reviewed.';

    const capNum = cap_level.replace('CAP ', '');
    const replacements: Record<string, string> = {
      'December 22, 2023': issuanceDateStr,
      'Name of Employee': employeeName,
      'Dear Mr./Ms. Last Name,': `Dear Mr./Ms. ${lastName},`,
      'This is to inform you that after due deliberation on the administrative charge leveled against you, you have stated in your explanation letter dated 12th Dec 2023 that you waited in the zoom session for your M and G , but , did not receive any explanation for the M and G with and the declined post for.': `This is to inform you that after due deliberation on the administrative charge leveled against you, ${deliberationText}`,
      'Section 3 Misconduct and Acts of Negligence': violSection,
      'Sub Section D Insubordination or serious misconduct or willful disobedience by the employee of the lawful orders of his employer or representative in connection with his work.': violSubsection,
      'Name of FLM': supervisorName,
    };

    if (capNum === '1') {
      replacements['This violation merits First Formal Corrective Action (CAP 1) which will remain active for one (1) month  = 30 days and shall become effective until 19th Feb 2024.'] =
        `This violation merits First Formal Corrective Action (CAP 1) which will remain active for ${activeDays} days and shall become effective until ${activeEndDateStr}.`;
    } else if (capNum === '2') {
      replacements['This violation merits Second Formal Corrective Action (CAP 2) which will remain active for two (2) month2  = 60 days and shall become effective until <60 days from issuance date>'] =
        `This violation merits Second Formal Corrective Action (CAP 2) which will remain active for ${activeDays} days and shall become effective until ${activeEndDateStr}.`;
    } else if (capNum === '3') {
      replacements['This violation merits Third Formal Corrective Action (CAP 3) which will remain active for three (3) months = 90 days and shall become effective until <90 days from issuance date>'] =
        `This violation merits Third Formal Corrective Action (CAP 3) which will remain active for ${activeDays} days and shall become effective until ${activeEndDateStr}.`;
    }

    const xmlFiles = Object.keys(zip.files).filter(f => f.endsWith('.xml') && !f.startsWith('_rels/'));
    for (const xmlFile of xmlFiles) {
      let content = zip.file(xmlFile)?.asText();
      if (!content) continue;
      for (const [search, replace] of Object.entries(replacements)) {
        content = content.split(search).join(replace);
      }
      zip.file(xmlFile, content);
    }

    const docxBuffer = Buffer.from(zip.generate({ type: 'nodebuffer' }));
    const safeName = employeeName.replace(/[^a-zA-Z0-9 ,]/g, '').replace(/\s+/g, '_');
    const filename = `${cap_level.replace(' ', '')}_${safeName}_${new Date().toISOString().slice(0, 10)}.docx`;

    // Notification: Document Generated
    try {
      const db = await getDb();
      if (db) {
        const creatorOhr = req.body.created_by_ohr || null;
        if (creatorOhr) {
          await db.insert(ioNotifications).values({
            type: 'docx_generated',
            title: `${cap_level} Document Generated`,
            message: `${cap_level} document for ${employeeName} has been generated and downloaded successfully.`,
            actor_ohr: creatorOhr,
            actor_name: req.body.created_by || 'System',
            target_ohr: creatorOhr,
            metadata: JSON.stringify({ cap_level, employee_name: employeeName, filename }),
            is_read: false,
            created_at: new Date().toISOString(),
          });
        }
      }
    } catch (notifErr: any) {
      console.error('[IO API] DOCX generated notification error:', notifErr.message);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(docxBuffer);
  } catch (err: any) {
    console.error('[IO API] CAP DOCX generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// CAP BUILD ASSIST — AI Narrative Generation
// ============================================================

router.post("/cap-build-assist/generate", validate(capBuildAssistGenerateSchema), async (req: Request, res: Response) => {
  try {
    const { employee, violation, violations, cap_level, explanation_date, explanation_summary, nte_narrative, previous_caps } = req.body;

    if (!employee || !cap_level) {
      return res.status(400).json({ error: 'Employee and CAP level are required' });
    }

    const violationsList = (violations || (violation ? [violation] : [])).map((v: any) =>
      `${v.code || ''}: ${v.text || ''} (${v.category || ''} \u2014 ${v.subsection || ''})`
    ).join('\n');

    const previousCapsText = (previous_caps || []).map((ca: any) =>
      `- ${ca.cap_level}: ${ca.date_of_incident || 'N/A'} \u2014 ${(ca.incident_description || '').replace(/<[^>]*>/g, '').substring(0, 150)}`
    ).join('\n');

    const capNum = cap_level.replace('CAP ', '');
    const capLabels: Record<string, string> = { '1': 'First', '2': 'Second', '3': 'Third' };

    const systemPrompt = `You are an HR document specialist for Genpact Philippines. Generate a formal Corrective Action deliberation paragraph for a ${cap_level} (${capLabels[capNum] || capNum} Formal Corrective Action).

The paragraph should:
1. Reference the employee's explanation (date: ${explanation_date || 'N/A'}, summary: ${explanation_summary || 'N/A'})
2. State that after due deliberation, the explanation does not excuse the charge
3. Be written in formal HR language, third person
4. Be 2-3 sentences maximum
5. NOT include the violation section or CAP level \u2014 those are in separate template sections

Return JSON with:
- "deliberation": the deliberation paragraph text
- "violation_section": the primary policy section violated
- "violation_subsection": the specific sub-section`;

    const userPrompt = `Employee: ${employee.full_name} (${employee.ohr_id})
Role: ${employee.actual_role || 'Process Associate'}
CAP Level: ${cap_level}

Violation(s):
${violationsList}

Explanation Letter Date: ${explanation_date || 'Not provided'}
Explanation Summary: ${explanation_summary || 'Not provided'}

Original NTE Narrative:
${(nte_narrative || '').replace(/<[^>]*>/g, '').substring(0, 500)}

Previous Corrective Actions:
${previousCapsText || 'None'}`;

    const llmResp = await invokeLLM({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'cap_deliberation',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              deliberation: { type: 'string', description: 'The deliberation paragraph for the CAP letter' },
              violation_section: { type: 'string', description: 'Primary policy section violated' },
              violation_subsection: { type: 'string', description: 'Specific sub-section violated' },
            },
            required: ['deliberation', 'violation_section', 'violation_subsection'],
            additionalProperties: false,
          },
        },
      },
    });

    const content = llmResp?.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(String(content));

    res.json({
      deliberation: parsed.deliberation || '',
      violation_section: parsed.violation_section || '',
      violation_subsection: parsed.violation_subsection || '',
    });
  } catch (err: any) {
    console.error('[IO API] CAP AI generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
