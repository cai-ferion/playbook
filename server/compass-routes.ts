/**
 * Compass REST API Routes
 * Express REST endpoints bridging the new Compass module (coaching logs, CA cases,
 * AI assistant) for consumption by the legacy Anchor vanilla JS frontend.
 * These endpoints mirror the tRPC procedures but use OHR-based auth from the legacy session.
 */
import { Router, Request, Response } from "express";
import { getDb } from "./db.js";
import {
  compassCoachingLogs,
  compassDisputeEvents,
  compassCaCases,
  compassCaTimeline,
  compassViolationCatalog,
  ioEmployees,
  ioAttendance,
  ioCoachingRca,
  ioCoachingZtp,
} from "../drizzle/schema.js";
import { eq, and, or, inArray, like, desc, asc, sql, gte, lte, count } from "drizzle-orm";
import crypto from "crypto";
import { storagePut } from "./storage.js";
import { invokeLLM } from "./_core/llm.js";

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const ADMIN_OHR = "740045023";

/** Resolve team members for a TL/SME based on supervisor chain */
async function getTeamOhrs(db: any, userOhr: string, role: string): Promise<string[]> {
  if (role === "Manager") return []; // managers see all — no filter needed
  if (role === "Team Lead") {
    const emp = await db.select({ full_name: ioEmployees.full_name }).from(ioEmployees).where(eq(ioEmployees.ohr_id, userOhr)).limit(1);
    if (!emp.length) return [userOhr];
    const teamMembers = await db.select({ ohr_id: ioEmployees.ohr_id }).from(ioEmployees).where(eq(ioEmployees.supervisor_name, emp[0].full_name));
    return [userOhr, ...teamMembers.map((m: any) => m.ohr_id)];
  }
  if (role === "Operational SME") {
    // SME sees their supervisor's team
    const sme = await db.select({ supervisor_name: ioEmployees.supervisor_name }).from(ioEmployees).where(eq(ioEmployees.ohr_id, userOhr)).limit(1);
    if (!sme.length) return [userOhr];
    const teamMembers = await db.select({ ohr_id: ioEmployees.ohr_id }).from(ioEmployees).where(eq(ioEmployees.supervisor_name, sme[0].supervisor_name));
    return [userOhr, ...teamMembers.map((m: any) => m.ohr_id)];
  }
  return [userOhr]; // QA, Trainer — see only own filings
}

/** Apply visibility filter to coaching logs query */
function buildCoachingVisibility(userOhr: string, role: string, teamOhrs: string[]) {
  if (role === "Manager" || userOhr === ADMIN_OHR) return undefined; // no filter
  if (role === "Team Lead" || role === "Operational SME") {
    return or(
      inArray(compassCoachingLogs.coachee_ohr, teamOhrs),
      eq(compassCoachingLogs.coach_ohr, userOhr)
    );
  }
  if (role === "Agent") {
    return eq(compassCoachingLogs.coachee_ohr, userOhr);
  }
  // QA, Trainer — see only logs they filed
  return eq(compassCoachingLogs.coach_ohr, userOhr);
}

/** Apply visibility filter to CA cases */
function buildCaVisibility(userOhr: string, role: string, teamOhrs: string[]) {
  if (role === "Manager" || userOhr === ADMIN_OHR) return undefined;
  if (role === "Team Lead" || role === "Operational SME") {
    return or(
      inArray(compassCaCases.employee_ohr, teamOhrs),
      eq(compassCaCases.created_by_ohr, userOhr)
    );
  }
  if (role === "Agent") {
    return eq(compassCaCases.employee_ohr, userOhr);
  }
  return eq(compassCaCases.created_by_ohr, userOhr);
}

function generateCoachingId(): string {
  return "CL-" + crypto.randomBytes(4).toString("hex");
}
function generateCaseId(): string {
  return "CA-" + crypto.randomBytes(4).toString("hex");
}

// ---------------------------------------------------------------------------
// COACHING LOGS
// ---------------------------------------------------------------------------

/** GET /compass/coaching — List coaching logs with pagination, filtering, visibility */
router.get("/coaching", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const userOhr = req.query.user_ohr as string;
    const userRole = req.query.user_role as string;
    if (!userOhr || !userRole) return res.status(400).json({ error: "user_ohr and user_role required" });

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;
    const teamOhrs = await getTeamOhrs(db, userOhr, userRole);
    const visFilter = buildCoachingVisibility(userOhr, userRole, teamOhrs);

    const conditions: any[] = [];
    if (visFilter) conditions.push(visFilter);
    if (req.query.coaching_type) conditions.push(eq(compassCoachingLogs.coaching_type, req.query.coaching_type as string));
    if (req.query.status) conditions.push(eq(compassCoachingLogs.status, req.query.status as string));
    if (req.query.coach_ohr) conditions.push(eq(compassCoachingLogs.coach_ohr, req.query.coach_ohr as string));
    if (req.query.coachee_ohr) conditions.push(eq(compassCoachingLogs.coachee_ohr, req.query.coachee_ohr as string));
    if (req.query.search) {
      const s = `%${req.query.search}%`;
      conditions.push(or(
        like(compassCoachingLogs.coachee_name, s),
        like(compassCoachingLogs.coach_name, s),
        like(compassCoachingLogs.coaching_id, s),
        like(compassCoachingLogs.session_goals, s)
      ));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [rows, totalResult] = await Promise.all([
      db.select().from(compassCoachingLogs).where(where).orderBy(desc(compassCoachingLogs.created_at)).limit(limit).offset(offset),
      db.select({ count: count() }).from(compassCoachingLogs).where(where),
    ]);
    const total = totalResult[0]?.count || 0;
    res.json({ data: rows, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err: any) {
    console.error("[Compass] coaching list error:", err);
    res.status(500).json({ error: err.message });
  }
});

/** GET /compass/coaching/:id — Get single coaching log with dispute events */
router.get("/coaching/:id", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const rows = await db.select().from(compassCoachingLogs).where(eq(compassCoachingLogs.coaching_id, req.params.id)).limit(1);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    const log = rows[0];
    const disputes = await db.select().from(compassDisputeEvents).where(eq(compassDisputeEvents.coaching_id, log.coaching_id)).orderBy(asc(compassDisputeEvents.created_at));
    res.json({ ...log, dispute_events: disputes });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /compass/coaching — Create new coaching log */
router.post("/coaching", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const body = req.body;
    const coaching_id = generateCoachingId();
    const now = new Date().toISOString();
    await db.insert(compassCoachingLogs).values({
      coaching_id,
      coaching_type: body.coaching_type,
      coaching_date: body.coaching_date || now.split("T")[0],
      session_goals: body.session_goals,
      coaching_details: body.coaching_details,
      status: body.coaching_type === "QA Feedback" ? "QA Dispute - LV1" : "Pending Acknowledgement",
      coach_ohr: body.coach_ohr,
      coach_name: body.coach_name,
      coach_email: body.coach_email,
      coach_supervisor: body.coach_supervisor,
      coach_supervisor_email: body.coach_supervisor_email,
      coach_pg: body.coach_pg,
      coachee_ohr: body.coachee_ohr,
      coachee_name: body.coachee_name,
      coachee_email: body.coachee_email,
      coachee_supervisor: body.coachee_supervisor,
      coachee_supervisor_email: body.coachee_supervisor_email,
      coachee_pg: body.coachee_pg,
      sme_joiner_name: body.sme_joiner_name,
      sme_joiner_email: body.sme_joiner_email,
      job_id: body.job_id,
      rca_level_1: body.rca_level_1,
      rca_level_2: body.rca_level_2,
      rca_level_3: body.rca_level_3,
      rca_level_4: body.rca_level_4,
      rca_level_5: body.rca_level_5,
      rca_description: body.rca_description,
      infraction_category: body.infraction_category,
      infraction: body.infraction,
      infraction_description: body.infraction_description,
      severity: body.severity,
      parent_coaching_id: body.parent_coaching_id,
      group_session_id: body.group_session_id,
      coachee_list: body.coachee_list,
      attachments: body.attachments,
      week_ending: body.week_ending,
      month: body.month,
      created_at: now,
      updated_at: now,
    });
    res.json({ success: true, coaching_id });
  } catch (err: any) {
    console.error("[Compass] coaching create error:", err);
    res.status(500).json({ error: err.message });
  }
});

/** PATCH /compass/coaching/:id — Update coaching log (acknowledge, dispute, etc.) */
router.patch("/coaching/:id", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const body = req.body;
    const now = new Date().toISOString();
    await db.update(compassCoachingLogs).set({ ...body, updated_at: now }).where(eq(compassCoachingLogs.coaching_id, req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /compass/coaching/:id/acknowledge — Acknowledge a coaching log */
router.post("/coaching/:id/acknowledge", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const body = req.body;
    const now = new Date().toISOString();
    await db.update(compassCoachingLogs).set({
      coachee_ack: true,
      coachee_commitments: body.commitments,
      coaching_rating: body.rating,
      coachee_sentiments: body.sentiments,
      ack_date: now,
      status: "Acknowledged",
      updated_at: now,
    }).where(eq(compassCoachingLogs.coaching_id, req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /compass/coaching/:id/dispute — Add a dispute event */
router.post("/coaching/:id/dispute", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const body = req.body;
    const now = new Date().toISOString();
    // Insert dispute event
    await db.insert(compassDisputeEvents).values({
      coaching_id: req.params.id,
      dispute_level: body.dispute_level,
      action: body.action,
      actor_ohr: body.actor_ohr,
      actor_name: body.actor_name,
      actor_role: body.actor_role,
      comments: body.comments,
      attachments: body.attachments,
      created_at: now,
    });
    // Update coaching log status
    if (body.new_status) {
      await db.update(compassCoachingLogs).set({
        status: body.new_status,
        updated_at: now,
      }).where(eq(compassCoachingLogs.coaching_id, req.params.id));
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /compass/disputes — Get all QA dispute coaching logs for kanban board */
router.get("/disputes", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const userOhr = req.query.user_ohr as string;
    const userRole = req.query.user_role as string;
    if (!userOhr || !userRole) return res.status(400).json({ error: "user_ohr and user_role required" });

    const teamOhrs = await getTeamOhrs(db, userOhr, userRole);
    const visFilter = buildCoachingVisibility(userOhr, userRole, teamOhrs);
    const conditions: any[] = [eq(compassCoachingLogs.coaching_type, "QA Feedback")];
    if (visFilter) conditions.push(visFilter);

    const rows = await db.select().from(compassCoachingLogs).where(and(...conditions)).orderBy(desc(compassCoachingLogs.created_at));
    res.json({ data: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// CA CASES
// ---------------------------------------------------------------------------

/** GET /compass/ca-cases — List CA cases with pagination and visibility */
router.get("/ca-cases", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const userOhr = req.query.user_ohr as string;
    const userRole = req.query.user_role as string;
    if (!userOhr || !userRole) return res.status(400).json({ error: "user_ohr and user_role required" });

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;
    const teamOhrs = await getTeamOhrs(db, userOhr, userRole);
    const visFilter = buildCaVisibility(userOhr, userRole, teamOhrs);

    const conditions: any[] = [];
    if (visFilter) conditions.push(visFilter);
    if (req.query.case_status) conditions.push(eq(compassCaCases.case_status, req.query.case_status as string));
    if (req.query.employee_ohr) conditions.push(eq(compassCaCases.employee_ohr, req.query.employee_ohr as string));
    if (req.query.search) {
      const s = `%${req.query.search}%`;
      conditions.push(or(
        like(compassCaCases.employee_name, s),
        like(compassCaCases.case_id, s),
        like(compassCaCases.violation_text, s)
      ));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [rows, totalResult] = await Promise.all([
      db.select().from(compassCaCases).where(where).orderBy(desc(compassCaCases.created_at)).limit(limit).offset(offset),
      db.select({ count: count() }).from(compassCaCases).where(where),
    ]);
    const total = totalResult[0]?.count || 0;
    res.json({ data: rows, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /compass/ca-cases/:id — Get single CA case with timeline */
router.get("/ca-cases/:id", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const rows = await db.select().from(compassCaCases).where(eq(compassCaCases.case_id, req.params.id)).limit(1);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    const timeline = await db.select().from(compassCaTimeline).where(eq(compassCaTimeline.case_id, req.params.id)).orderBy(asc(compassCaTimeline.created_at));
    res.json({ ...rows[0], timeline });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /compass/ca-cases — Create new CA case */
router.post("/ca-cases", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const body = req.body;
    const case_id = generateCaseId();
    const now = new Date().toISOString();
    await db.insert(compassCaCases).values({
      case_id,
      case_status: "incident_reported",
      employee_ohr: body.employee_ohr,
      employee_name: body.employee_name,
      employee_pg: body.employee_pg,
      employee_supervisor: body.employee_supervisor,
      violation_category_number: body.violation_category_number,
      violation_category_name: body.violation_category_name,
      violation_subsection: body.violation_subsection,
      violation_text: body.violation_text,
      violation_type: body.violation_type,
      incident_date: body.incident_date,
      incident_details: body.incident_details,
      evidence_attachments: body.evidence_attachments,
      ai_recommended_cap_level: body.ai_recommended_cap_level,
      ai_recommendation_reasoning: body.ai_recommendation_reasoning,
      recommended_cap_level: body.recommended_cap_level,
      final_cap_level: body.final_cap_level,
      nte_required: body.nte_required !== false,
      hearing_required: body.hearing_required || false,
      linked_coaching_ids: body.linked_coaching_ids,
      linked_prior_case_id: body.linked_prior_case_id,
      created_by_ohr: body.created_by_ohr,
      created_by_name: body.created_by_name,
      notes: body.notes,
      created_at: now,
      updated_at: now,
    });
    // Insert initial timeline event
    await db.insert(compassCaTimeline).values({
      case_id,
      event_type: "case_created",
      event_date: now,
      actor_ohr: body.created_by_ohr,
      actor_name: body.created_by_name,
      details: `CA case created for ${body.employee_name}. Violation: ${body.violation_text || "N/A"}`,
      created_at: now,
    });
    res.json({ success: true, case_id });
  } catch (err: any) {
    console.error("[Compass] CA case create error:", err);
    res.status(500).json({ error: err.message });
  }
});

/** Valid CA status transitions */
const CA_STATUS_TRANSITIONS: Record<string, string[]> = {
  incident_reported: ["nte_issued", "cap_issued", "case_dismissed"],
  nte_issued: ["awaiting_response"],
  awaiting_response: ["response_received", "response_waived"],
  response_received: ["hearing_scheduled", "nod_issued", "cap_issued", "case_dismissed"],
  response_waived: ["hearing_scheduled", "nod_issued", "cap_issued"],
  hearing_scheduled: ["hearing_conducted"],
  hearing_conducted: ["nod_issued", "cap_issued", "case_dismissed"],
  nod_issued: ["cap_issued", "case_dismissed"],
  cap_issued: ["active_period"],
  active_period: ["case_closed"],
  case_closed: [],
  case_dismissed: [],
};

const CAP_ACTIVE_PERIODS: Record<string, number> = {
  cap_0: 0,
  cap_1: 60,
  cap_2: 90,
  cap_3: 180,
};

/** POST /compass/ca-cases/:id/transition — Advance CA case status */
router.post("/ca-cases/:id/transition", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const body = req.body;
    const rows = await db.select().from(compassCaCases).where(eq(compassCaCases.case_id, req.params.id)).limit(1);
    if (!rows.length) return res.status(404).json({ error: "Case not found" });
    const ca = rows[0];
    const currentStatus = ca.case_status;
    const newStatus = body.new_status;
    const allowed = CA_STATUS_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      return res.status(400).json({ error: `Cannot transition from ${currentStatus} to ${newStatus}` });
    }
    // Check signed document requirement before active_period
    if (newStatus === "active_period" && !ca.cap_signed_url && !ca.employee_signed) {
      return res.status(400).json({ error: "Signed CAP document must be uploaded before entering active period." });
    }

    const updates: any = { case_status: newStatus, updated_at: new Date().toISOString() };
    // Apply status-specific updates
    if (newStatus === "nte_issued") {
      updates.nte_issued_date = body.nte_issued_date || new Date().toISOString();
      updates.nte_response_deadline = body.nte_response_deadline;
    }
    if (newStatus === "response_received") {
      updates.nte_response_date = new Date().toISOString();
      updates.nte_response_text = body.nte_response_text;
    }
    if (newStatus === "hearing_scheduled") {
      updates.hearing_scheduled_date = body.hearing_scheduled_date;
    }
    if (newStatus === "hearing_conducted") {
      updates.hearing_conducted = true;
      updates.hearing_notes = body.hearing_notes;
    }
    if (newStatus === "nod_issued") {
      updates.nod_issued_date = new Date().toISOString();
      updates.nod_decision = body.nod_decision;
    }
    if (newStatus === "cap_issued") {
      updates.final_cap_level = body.final_cap_level || ca.recommended_cap_level;
      updates.active_period_days = CAP_ACTIVE_PERIODS[updates.final_cap_level] || 0;
    }
    if (newStatus === "active_period") {
      const start = new Date().toISOString();
      const days = ca.active_period_days || 0;
      const end = new Date(Date.now() + days * 86400000).toISOString();
      updates.active_period_start = start;
      updates.active_period_end = end;
    }
    if (body.notes) updates.notes = body.notes;
    if (body.cap_override_reason) updates.cap_override_reason = body.cap_override_reason;

    await db.update(compassCaCases).set(updates).where(eq(compassCaCases.case_id, req.params.id));
    // Timeline event
    const now = new Date().toISOString();
    await db.insert(compassCaTimeline).values({
      case_id: req.params.id,
      event_type: `status_${newStatus}`,
      event_date: now,
      actor_ohr: body.actor_ohr,
      actor_name: body.actor_name,
      details: body.details || `Status changed to ${newStatus}`,
      created_at: now,
    });
    res.json({ success: true, new_status: newStatus });
  } catch (err: any) {
    console.error("[Compass] CA transition error:", err);
    res.status(500).json({ error: err.message });
  }
});

/** POST /compass/ca-cases/:id/upload-signed — Upload signed document */
router.post("/ca-cases/:id/upload-signed", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const body = req.body;
    const field = body.document_type === "nte" ? "nte_signed_url" : "cap_signed_url";
    const updates: any = { [field]: body.url, updated_at: new Date().toISOString() };
    if (body.document_type !== "nte") {
      updates.employee_signed = true;
      updates.employee_signed_date = new Date().toISOString();
    }
    await db.update(compassCaCases).set(updates).where(eq(compassCaCases.case_id, req.params.id));
    const now = new Date().toISOString();
    await db.insert(compassCaTimeline).values({
      case_id: req.params.id,
      event_type: `signed_${body.document_type}_uploaded`,
      event_date: now,
      actor_ohr: body.actor_ohr,
      actor_name: body.actor_name,
      details: `Signed ${body.document_type.toUpperCase()} document uploaded.`,
      created_at: now,
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// DOCX GENERATION
// ---------------------------------------------------------------------------
const TEMPLATE_URLS: Record<string, string> = {
  nte: "https://d2xsxph8kpxj0f.cloudfront.net/310519663445219651/5AVfpygNb7cNbPRpHCcCdp/Template-NTE_849823ad.docx",
  cap_0: "https://d2xsxph8kpxj0f.cloudfront.net/310519663445219651/5AVfpygNb7cNbPRpHCcCdp/Template-CAP0_350fbeae.docx",
  cap_1: "https://d2xsxph8kpxj0f.cloudfront.net/310519663445219651/5AVfpygNb7cNbPRpHCcCdp/Template-CAP1_a6e6e3b1.docx",
  cap_2: "https://d2xsxph8kpxj0f.cloudfront.net/310519663445219651/5AVfpygNb7cNbPRpHCcCdp/Template-CAP2_a3e2b6ef.docx",
  cap_3: "https://d2xsxph8kpxj0f.cloudfront.net/310519663445219651/5AVfpygNb7cNbPRpHCcCdp/Template-CAP3_3e8b1c5d.docx",
  cap_waived: "https://d2xsxph8kpxj0f.cloudfront.net/310519663445219651/5AVfpygNb7cNbPRpHCcCdp/Template-CAPw_oExplanationLetter_7c8a2d4e.docx",
};

/** POST /compass/ca-cases/:id/generate-document — Generate DOCX from template */
router.post("/ca-cases/:id/generate-document", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const body = req.body;
    const docType = body.document_type as string;
    const templateUrl = TEMPLATE_URLS[docType];
    if (!templateUrl) return res.status(400).json({ error: `Unknown document type: ${docType}` });

    const rows = await db.select().from(compassCaCases).where(eq(compassCaCases.case_id, req.params.id)).limit(1);
    if (!rows.length) return res.status(404).json({ error: "Case not found" });
    const ca = rows[0];

    // Fetch template
    const templateResp = await fetch(templateUrl);
    if (!templateResp.ok) return res.status(500).json({ error: "Failed to fetch template" });
    const templateBuffer = Buffer.from(await templateResp.arrayBuffer());

    // Generate DOCX using docxtemplater
    const PizZip = (await import("pizzip")).default;
    const Docxtemplater = (await import("docxtemplater")).default;
    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: "{{", end: "}}" },
    });

    const today = new Date();
    const formatDate = (d: Date) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const data: Record<string, string> = {
      employee_name: ca.employee_name || "",
      employee_ohr: ca.employee_ohr || "",
      supervisor_name: ca.employee_supervisor || "",
      date: formatDate(today),
      violation: ca.violation_text || "",
      violation_category: ca.violation_category_name || "",
      violation_subsection: ca.violation_subsection || "",
      incident_date: ca.incident_date || "",
      incident_details: ca.incident_details || "",
      cap_level: ca.final_cap_level || ca.recommended_cap_level || "",
      active_period_days: String(ca.active_period_days || ""),
      response_deadline: ca.nte_response_deadline || "",
      ...body.extra_data,
    };
    doc.render(data);
    const outputBuffer = Buffer.from(zip.generate({ type: "nodebuffer" }));

    // Upload to S3
    const suffix = crypto.randomBytes(4).toString("hex");
    const fileKey = `compass/documents/${req.params.id}/${docType}_${suffix}.docx`;
    const { url } = await storagePut(fileKey, outputBuffer, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

    // Update case with document URL
    const urlField = docType === "nte" ? "nte_document_url" : "cap_document_url";
    await db.update(compassCaCases).set({ [urlField]: url, updated_at: new Date().toISOString() }).where(eq(compassCaCases.case_id, req.params.id));

    // Timeline event
    const now = new Date().toISOString();
    await db.insert(compassCaTimeline).values({
      case_id: req.params.id,
      event_type: `document_generated_${docType}`,
      event_date: now,
      actor_ohr: body.actor_ohr,
      actor_name: body.actor_name,
      details: `${docType.toUpperCase()} document generated.`,
      created_at: now,
    });
    res.json({ success: true, url });
  } catch (err: any) {
    console.error("[Compass] DOCX generation error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// ATTENDANCE SUMMARY
// ---------------------------------------------------------------------------

/** GET /compass/attendance-summary/:ohr — Get attendance violation summary for an employee */
router.get("/attendance-summary/:ohr", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const empOhr = req.params.ohr;

    // Find the most recent CAP 1+ case to determine reset date
    const priorCaps = await db.select().from(compassCaCases)
      .where(and(
        eq(compassCaCases.employee_ohr, empOhr),
        or(
          eq(compassCaCases.case_status, "active_period"),
          eq(compassCaCases.case_status, "case_closed")
        )
      ))
      .orderBy(desc(compassCaCases.created_at))
      .limit(1);

    let resetDate: string | null = null;
    if (priorCaps.length && priorCaps[0].final_cap_level && priorCaps[0].final_cap_level !== "cap_0") {
      resetDate = priorCaps[0].active_period_start || priorCaps[0].created_at || null;
    }

    const conditions: any[] = [eq(ioAttendance.ohr_id, empOhr)];
    if (resetDate) conditions.push(gte(ioAttendance.created_at, resetDate));

    const attendance = await db.select().from(ioAttendance).where(and(...conditions));

    let lateCount = 0;
    let uplCount = 0;
    let ncnsCount = 0;
    const lateDates: string[] = [];
    const uplDates: string[] = [];
    const ncnsDates: string[] = [];

    for (const record of attendance) {
      const tag = (record.tag || "").toUpperCase();
      const reason = (record.upl_reason || "").toUpperCase();
      if (tag === "LATE") {
        lateCount++;
        lateDates.push(record.log_date || "");
      } else if (tag === "UPL") {
        if (reason === "NCNS" || reason === "NO CALL NO SHOW") {
          ncnsCount++;
          ncnsDates.push(record.log_date || "");
        } else {
          uplCount++;
          uplDates.push(record.log_date || "");
        }
      }
    }

    // Recommend CAP level based on progression
    let recommendedCap = "none";
    const totalViolations = lateCount + uplCount + ncnsCount;
    if (ncnsCount >= 1) recommendedCap = "cap_1";
    if (totalViolations >= 3) recommendedCap = "cap_0";
    if (totalViolations >= 5) recommendedCap = "cap_1";
    if (totalViolations >= 8) recommendedCap = "cap_2";
    if (totalViolations >= 12) recommendedCap = "cap_3";

    res.json({
      employee_ohr: empOhr,
      reset_date: resetDate,
      late: { count: lateCount, dates: lateDates },
      upl: { count: uplCount, dates: uplDates },
      ncns: { count: ncnsCount, dates: ncnsDates },
      total_violations: totalViolations,
      recommended_cap: recommendedCap,
      total_records: attendance.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// VIOLATION CATALOG
// ---------------------------------------------------------------------------

/** GET /compass/violations — Get violation catalog */
router.get("/violations", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const rows = await db.select().from(compassViolationCatalog).orderBy(asc(compassViolationCatalog.category_number), asc(compassViolationCatalog.subsection));
    res.json({ data: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// ANALYTICS SUMMARY
// ---------------------------------------------------------------------------

/** GET /compass/analytics — Get dashboard analytics summary */
router.get("/analytics", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const userOhr = req.query.user_ohr as string;
    const userRole = req.query.user_role as string;
    if (!userOhr || !userRole) return res.status(400).json({ error: "user_ohr and user_role required" });

    const teamOhrs = await getTeamOhrs(db, userOhr, userRole);
    const visFilter = buildCoachingVisibility(userOhr, userRole, teamOhrs);
    const caVisFilter = buildCaVisibility(userOhr, userRole, teamOhrs);

    // Coaching stats
    const coachingConditions: any[] = [];
    if (visFilter) coachingConditions.push(visFilter);
    const coachingWhere = coachingConditions.length ? and(...coachingConditions) : undefined;

    const [totalCoaching] = await db.select({ count: count() }).from(compassCoachingLogs).where(coachingWhere);
    const [pendingAck] = await db.select({ count: count() }).from(compassCoachingLogs).where(
      coachingWhere ? and(coachingWhere, eq(compassCoachingLogs.status, "Pending Acknowledgement")) : eq(compassCoachingLogs.status, "Pending Acknowledgement")
    );
    const [activeDisputes] = await db.select({ count: count() }).from(compassCoachingLogs).where(
      coachingWhere ? and(coachingWhere, like(compassCoachingLogs.status, "QA Dispute%")) : like(compassCoachingLogs.status, "QA Dispute%")
    );

    // CA stats
    const caConditions: any[] = [];
    if (caVisFilter) caConditions.push(caVisFilter);
    const caWhere = caConditions.length ? and(...caConditions) : undefined;

    const [totalCases] = await db.select({ count: count() }).from(compassCaCases).where(caWhere);
    const [activeCases] = await db.select({ count: count() }).from(compassCaCases).where(
      caWhere ? and(caWhere, sql`${compassCaCases.case_status} NOT IN ('case_closed', 'case_dismissed')`) : sql`${compassCaCases.case_status} NOT IN ('case_closed', 'case_dismissed')`
    );

    res.json({
      coaching: {
        total: totalCoaching?.count || 0,
        pending_ack: pendingAck?.count || 0,
        active_disputes: activeDisputes?.count || 0,
      },
      ca: {
        total: totalCases?.count || 0,
        active: activeCases?.count || 0,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// EMPLOYEE CA HISTORY
// ---------------------------------------------------------------------------

/** GET /compass/employee-history/:ohr — Get employee's CA and coaching history */
router.get("/employee-history/:ohr", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const empOhr = req.params.ohr;
    const [cases, coaching] = await Promise.all([
      db.select().from(compassCaCases).where(eq(compassCaCases.employee_ohr, empOhr)).orderBy(desc(compassCaCases.created_at)),
      db.select().from(compassCoachingLogs).where(eq(compassCoachingLogs.coachee_ohr, empOhr)).orderBy(desc(compassCoachingLogs.created_at)),
    ]);
    res.json({ cases, coaching });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// AI CAP ASSISTANT
// ---------------------------------------------------------------------------

/** POST /compass/ai/recommend — Get AI CAP recommendation */
router.post("/ai/recommend", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const body = req.body;
    const empOhr = body.employee_ohr;

    // Gather employee history
    const [empRows, cases, coaching, attendance] = await Promise.all([
      db.select().from(ioEmployees).where(eq(ioEmployees.ohr_id, empOhr)).limit(1),
      db.select().from(compassCaCases).where(eq(compassCaCases.employee_ohr, empOhr)).orderBy(desc(compassCaCases.created_at)),
      db.select().from(compassCoachingLogs).where(eq(compassCoachingLogs.coachee_ohr, empOhr)).orderBy(desc(compassCoachingLogs.created_at)).limit(50),
      db.select().from(ioAttendance).where(eq(ioAttendance.ohr_id, empOhr)),
    ]);

    const emp = empRows[0];
    let lateCount = 0, uplCount = 0, ncnsCount = 0;
    for (const r of attendance) {
      const tag = (r.tag || "").toUpperCase();
      const reason = (r.upl_reason || "").toUpperCase();
      if (tag === "LATE") lateCount++;
      else if (tag === "UPL") {
        if (reason === "NCNS" || reason === "NO CALL NO SHOW") ncnsCount++;
        else uplCount++;
      }
    }

    const systemPrompt = `You are a Corrective Action advisory assistant for a BPO content moderation team.
You analyze employee history and recommend appropriate disciplinary action based on GPHR Policy v3.0 (Feb 2026).

POLICY RULES:
- CAP Levels: CAP 0 (coaching/counseling, no active period), CAP 1 (60 days active), CAP 2 (90 days active), CAP 3 (180 days active, highest level)
- Attendance progression: continuous (no cut-off periods), resets only when CAP 1+ is served
- Admin hearings required for CAP 3 only
- NTE required for CAP 1 and above; CAP 0 does not require NTE
- Employee has 48 hours to respond to NTE

VIOLATION CATEGORIES:
1. Attendance & Punctuality
2. Work Performance & Quality
3. Workplace Conduct & Behavior
4. Safety, Security & Compliance
5. Company Property & Resources
6. Confidentiality & Data Privacy
7. Gross Misconduct

Respond with JSON: { "recommended_cap_level": "cap_0|cap_1|cap_2|cap_3", "reasoning": "...", "aggravating_factors": ["..."], "mitigating_factors": ["..."], "violations_applicable": ["..."], "confidence": "high|medium|low" }`;

    const userPrompt = `Employee: ${emp?.full_name || "Unknown"} (OHR: ${empOhr})
Role: ${emp?.actual_role || "Unknown"}
Tenure: ${emp?.hire_date || "Unknown"}

CURRENT VIOLATION: ${body.violation_description}
${body.violation_category_name ? `Category: ${body.violation_category_name}` : ""}
${body.violation_subsection ? `Subsection: ${body.violation_subsection}` : ""}
${body.additional_context ? `Additional Context: ${body.additional_context}` : ""}

PRIOR CA CASES (${cases.length}):
${cases.map(c => `- ${c.case_id}: ${c.violation_text} → ${c.final_cap_level || c.recommended_cap_level || "pending"} (${c.case_status})`).join("\n") || "None"}

COACHING HISTORY (last 50, total ${coaching.length}):
${coaching.slice(0, 10).map(c => `- ${c.coaching_type}: ${c.session_goals || "N/A"} (${c.status})`).join("\n") || "None"}

ATTENDANCE: ${lateCount} late, ${uplCount} UPL, ${ncnsCount} NCNS (since last CAP reset)

Analyze and recommend the appropriate CAP level.`;

    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "cap_recommendation",
          strict: true,
          schema: {
            type: "object",
            properties: {
              recommended_cap_level: { type: "string" },
              reasoning: { type: "string" },
              aggravating_factors: { type: "array", items: { type: "string" } },
              mitigating_factors: { type: "array", items: { type: "string" } },
              violations_applicable: { type: "array", items: { type: "string" } },
              confidence: { type: "string" },
            },
            required: ["recommended_cap_level", "reasoning", "aggravating_factors", "mitigating_factors", "violations_applicable", "confidence"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content as string | undefined;
    const recommendation = content ? JSON.parse(content) : null;
    res.json({ recommendation, employee: emp ? { full_name: emp.full_name, actual_role: emp.actual_role, hire_date: emp.hire_date } : null });
  } catch (err: any) {
    console.error("[Compass AI] recommend error:", err);
    res.status(500).json({ error: err.message });
  }
});

/** POST /compass/ai/chat — Conversational AI assistant */
router.post("/ai/chat", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const body = req.body;

    let contextBlock = "";
    if (body.employee_ohr) {
      const [empRows, cases, coaching] = await Promise.all([
        db.select().from(ioEmployees).where(eq(ioEmployees.ohr_id, body.employee_ohr)).limit(1),
        db.select().from(compassCaCases).where(eq(compassCaCases.employee_ohr, body.employee_ohr)).orderBy(desc(compassCaCases.created_at)).limit(10),
        db.select().from(compassCoachingLogs).where(eq(compassCoachingLogs.coachee_ohr, body.employee_ohr)).orderBy(desc(compassCoachingLogs.created_at)).limit(20),
      ]);
      const emp = empRows[0];
      contextBlock = `\n\nEMPLOYEE CONTEXT:
Name: ${emp?.full_name || "Unknown"} (OHR: ${body.employee_ohr})
Role: ${emp?.actual_role || "Unknown"}
Prior CA Cases: ${cases.length} (${cases.map(c => `${c.final_cap_level || "pending"}: ${c.violation_text}`).join("; ") || "None"})
Recent Coaching: ${coaching.length} logs`;
    }

    const messages: any[] = [
      {
        role: "system",
        content: `You are a Corrective Action advisory assistant for a BPO content moderation team. You help leaders understand the GPHR Policy v3.0 (Feb 2026), recommend appropriate disciplinary actions, and guide them through the CA process. Be concise and practical.${contextBlock}`,
      },
    ];

    if (body.conversation_history) {
      for (const msg of body.conversation_history) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    messages.push({ role: "user", content: body.message });

    const response = await invokeLLM({ messages });
    const reply = (response.choices?.[0]?.message?.content as string) || "I'm unable to provide a response at this time.";
    res.json({ reply });
  } catch (err: any) {
    console.error("[Compass AI] chat error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// RCA & ZTP CATALOGS (for coaching form)
// ---------------------------------------------------------------------------

/** GET /compass/rca-catalog — Get RCA catalog */
router.get("/rca-catalog", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const rows = await db.select().from(ioCoachingRca).orderBy(asc(ioCoachingRca.level_1_category));
    res.json({ data: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /compass/ztp-catalog — Get ZTP catalog */
router.get("/ztp-catalog", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });
    const rows = await db.select().from(ioCoachingZtp);
    res.json({ data: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
export function registerCompassRoutes(app: import("express").Express) {
  app.use("/api/io/compass", router);
  console.log("[Compass API] Routes registered under /api/io/compass/*");
}
