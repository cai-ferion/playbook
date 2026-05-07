/**
 * Auto-Notifier Module
 * Creates in-app notifications for UPL/LATE attendance tags.
 * 
 * Schedule: 2:30 AM and 11:30 AM Philippine Time (UTC+8) daily for UPL/LATE.
 */

import { Express } from "express";
import cron from "node-cron";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and, inArray, sql, gte, lte, asc, ne, isNotNull } from "drizzle-orm";
import { ioAttendance, ioEmployees, ioNotifications, ioLeaves, ioAuditLog, ioCoaching, ioCorrectiveActions, ioInsights } from "../drizzle/schema.js";
import { OWNER_OHR as ADMIN_OHR, ADMIN_OHRS } from "./config.js";

// Philippine Time is UTC+8
const PHT_OFFSET_HOURS = 8;

function getTodayPHT(): string {
  const now = new Date();
  const pht = new Date(now.getTime() + PHT_OFFSET_HOURS * 60 * 60 * 1000);
  return pht.toISOString().slice(0, 10); // YYYY-MM-DD
}

function getNowPHT(): string {
  const now = new Date();
  const pht = new Date(now.getTime() + PHT_OFFSET_HOURS * 60 * 60 * 1000);
  return pht.toISOString().slice(0, 19).replace("T", " ");
}

function formatDateReadable(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  return d.toLocaleDateString("en-US", options);
}

// Helper to create a notification in the database
async function createNotification(
  db: ReturnType<typeof drizzle>,
  params: {
    type: string;
    title: string;
    message: string;
    actor_ohr?: string;
    actor_name?: string;
    target_role?: string;
    target_ohr?: string;
    metadata?: string;
  }
): Promise<void> {
  await db.insert(ioNotifications).values({
    type: params.type,
    title: params.title,
    message: params.message,
    actor_ohr: params.actor_ohr || null,
    actor_name: params.actor_name || "Playbook System",
    target_role: params.target_role || null,
    target_ohr: params.target_ohr || null,
    metadata: params.metadata || null,
    is_read: false,
    created_at: getNowPHT(),
  });
}


async function sendUplLateNotifications(db: ReturnType<typeof drizzle>): Promise<{ sent: number; errors: number }> {
  const today = getTodayPHT();
  console.log(`[AutoNotifier] Running UPL/LATE check for date: ${today}`);

  const records = await db
    .select({
      id: ioAttendance.id,
      ohr_id: ioAttendance.ohr_id,
      log_date: ioAttendance.log_date,
      tag: ioAttendance.tag,
      reason: ioAttendance.upl_reason,
      remarks: ioAttendance.remarks,
      snap_full_name: ioAttendance.snap_full_name,
    })
    .from(ioAttendance)
    .where(
      and(
        eq(ioAttendance.log_date, today),
        inArray(ioAttendance.tag, ["UPL", "LATE"])
      )
    );

  if (records.length === 0) {
    console.log(`[AutoNotifier] No UPL/LATE records found for ${today}.`);
    return { sent: 0, errors: 0 };
  }

  console.log(`[AutoNotifier] Found ${records.length} UPL/LATE records for ${today}.`);

  const ohrIds = Array.from(new Set(records.map((r) => r.ohr_id).filter((x): x is string => x !== null)));

  const employees = await db
    .select({
      ohr_id: ioEmployees.ohr_id,
      full_name: ioEmployees.full_name,
      supervisor_name: ioEmployees.supervisor_name,
    })
    .from(ioEmployees)
    .where(inArray(ioEmployees.ohr_id, ohrIds));

  const employeeMap = new Map<string, { ohr_id: string; full_name: string | null; supervisor_name: string | null }>();
  for (const emp of employees) {
    if (emp.ohr_id) employeeMap.set(emp.ohr_id, emp);
  }

  // Build supervisor name → OHR lookup for sending supervisor notifications
  const allEmployees = await db
    .select({ ohr_id: ioEmployees.ohr_id, full_name: ioEmployees.full_name })
    .from(ioEmployees);
  const nameToOhr = new Map<string, string>();
  for (const e of allEmployees) {
    if (e.full_name && e.ohr_id) nameToOhr.set(e.full_name, e.ohr_id);
  }

  let sent = 0;
  let errors = 0;

  for (const record of records) {
    try {
      const employee = record.ohr_id ? employeeMap.get(record.ohr_id) : null;
      const agentName = record.snap_full_name || employee?.full_name || "Team Member";
      const readableDate = formatDateReadable(record.log_date || today);
      const tagLabel = record.tag === "UPL" ? "Unplanned Leave (UPL)" : "Late Attendance (LATE)";
      const supervisorName = employee?.supervisor_name || "your supervisor";

      const notifType = record.tag === "UPL" ? "upl_notice" : "late_notice";
      const reason = record.reason || "Not specified";
      const remarks = record.remarks || "No additional remarks";
      const metaObj = {
        attendance_id: record.id,
        tag: record.tag,
        date: record.log_date,
        agentName,
        reason,
        remarks,
      };

      // 1) In-app notification for the tagged employee (sent first)
      await createNotification(db, {
        type: notifType,
        title: `${record.tag} Notice — ${readableDate}`,
        message: `You have been tagged as ${tagLabel} for ${readableDate}.\n\nReason: ${reason}\nRemarks: ${remarks}\n\nPlease coordinate with your supervisor, ${supervisorName}, regarding this attendance record. If you believe this tag was applied in error, you may request for your supervisor to change this.`,
        actor_name: "Playbook System",
        target_ohr: record.ohr_id || undefined,
        metadata: JSON.stringify(metaObj),
      });

      sent++;

      // 2) In-app notification for the supervisor (sent second)
      const supervisorOhr = employee?.supervisor_name ? nameToOhr.get(employee.supervisor_name) : null;
      if (supervisorOhr) {
        await createNotification(db, {
          type: notifType,
          title: `${record.tag} Notice — ${agentName}`,
          message: `${agentName} has been tagged as ${tagLabel} for ${readableDate}.\n\nReason: ${reason}\nRemarks: ${remarks}`,
          actor_name: "Playbook System",
          target_ohr: supervisorOhr,
          metadata: JSON.stringify(metaObj),
        });
        sent++;
      }

    } catch (err: any) {
      console.error(`[AutoNotifier] Error creating notification for OHR ${record.ohr_id}: ${err.message}`);
      errors++;
    }
  }

  console.log(`[AutoNotifier] Completed: ${sent} in-app notifications, ${errors} errors.`);
  return { sent, errors };
}

// OT Forfeiture Cascade — REMOVED (OT mechanism removed)

export function registerAutoMailer(app: Express): void {
  const dbUrl = process.env.SUPABASE_URL || process.env.DATABASE_URL;

  if (!dbUrl) {
    console.warn("[AutoNotifier] DATABASE_URL not set. Auto-notifier disabled.");
    return;
  }

  const client = postgres(dbUrl, { prepare: false });
  const db = drizzle(client);

  // Schedule: 2:30 AM PHT = 18:30 UTC (previous day)
  cron.schedule("30 18 * * *", async () => {
    console.log("[AutoNotifier] Triggered: 2:30 AM PHT shift check");
    try {
      await sendUplLateNotifications(db);
    } catch (err) {
      console.error("[AutoNotifier] Cron error (2:30 AM PHT):", err);
    }
  });

  // Schedule: 11:30 AM PHT = 03:30 UTC
  cron.schedule("30 3 * * *", async () => {
    console.log("[AutoNotifier] Triggered: 11:30 AM PHT shift check");
    try {
      await sendUplLateNotifications(db);
    } catch (err) {
      console.error("[AutoNotifier] Cron error (11:30 AM PHT):", err);
    }
  });

  console.log("[AutoNotifier] Scheduled: 2:30 AM PHT, 11:30 AM PHT (UPL/LATE)");

  // OT Forfeiture + Auto-Open cron jobs — REMOVED (OT mechanism removed)

  // Manual trigger for UPL/LATE notifications
  app.post("/api/io/send-notifications", async (req, res) => {
    try {
      const result = await sendUplLateNotifications(db);
      res.json({
        success: true,
        message: `In-app: ${result.sent}, errors: ${result.errors}`,
        ...result,
      });
    } catch (err: any) {
      console.error("[AutoNotifier] Manual trigger error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // OT manual triggers (forfeiture-check, auto-open) — REMOVED

  // ============================================================
  // Dispute Aging Alert
  // Runs every 4 hours PHT. Checks active disputes that have been
  // sitting at their current level beyond the SLA threshold:
  //   - Standard disputes: 48 hours
  //   - ZTP Infraction / Incident Report: 24 hours (compliance-critical)
  // Sends dispute_overdue notification to the person who needs to act next.
  // ============================================================

  async function checkDisputeAging(db: ReturnType<typeof drizzle>): Promise<{ alerts: number; errors: number }> {
    let alerts = 0, errors = 0;
    const now = new Date();

    // Active dispute statuses and who needs to act next
    const DISPUTE_STATUS_MAP: Record<string, { level: string; nextActorField: 'coach_ohr' | 'sme_joiner' | 'sme_joiner_2' | 'coachee_ohr' }> = {
      'Markdown Disputed - SME': { level: 'LV1', nextActorField: 'coach_ohr' },
      'Pending Support Review': { level: 'LV2', nextActorField: 'sme_joiner' },
      'Markdown Retained - SME': { level: 'LV3', nextActorField: 'sme_joiner' },
      'QA Decision Rejected': { level: 'LV4', nextActorField: 'sme_joiner_2' },
      'Markdown Retained - Trainer': { level: 'LV5', nextActorField: 'sme_joiner' },
      'Trainer Decision Rejected - SME': { level: 'LV6', nextActorField: 'coach_ohr' },
    };

    const activeStatuses = Object.keys(DISPUTE_STATUS_MAP);

    try {
      const disputes = await db.select({
        id: ioCoaching.id,
        coaching_id: ioCoaching.coaching_id,
        coaching_type: ioCoaching.coaching_type,
        status: ioCoaching.status,
        coach_ohr: ioCoaching.coach_ohr,
        coachee_ohr: ioCoaching.coachee_ohr,
        coachee: ioCoaching.coachee,
        sme_joiner: ioCoaching.sme_joiner,
        sme_joiner_2: ioCoaching.sme_joiner_2,
        updated_at: ioCoaching.updated_at,
        created_at: ioCoaching.created_at,
      }).from(ioCoaching)
        .where(inArray(ioCoaching.status, activeStatuses));

      if (disputes.length === 0) {
        console.log('[Dispute-Aging] No active disputes found.');
        return { alerts: 0, errors: 0 };
      }

      console.log(`[Dispute-Aging] Found ${disputes.length} active disputes to check.`);

      // Build name → OHR lookup for sme_joiner fields (stored as names)
      const allEmployees = await db.select({ ohr_id: ioEmployees.ohr_id, full_name: ioEmployees.full_name }).from(ioEmployees);
      const nameToOhr = new Map<string, string>();
      for (const e of allEmployees) {
        if (e.full_name && e.ohr_id) nameToOhr.set(e.full_name, e.ohr_id);
      }

      // Check for existing overdue notifications to avoid duplicates (within last 12 hours)
      const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();
      const recentOverdueNotifs = await db.select({
        metadata: ioNotifications.metadata,
      }).from(ioNotifications)
        .where(and(
          eq(ioNotifications.type, 'dispute_overdue'),
          gte(ioNotifications.created_at, twelveHoursAgo)
        ));

      const recentlyNotifiedIds = new Set<string>();
      for (const n of recentOverdueNotifs) {
        try {
          const meta = JSON.parse(n.metadata || '{}');
          if (meta.coaching_id) recentlyNotifiedIds.add(meta.coaching_id);
        } catch { /* skip */ }
      }

      for (const dispute of disputes) {
        try {
          const cid = dispute.coaching_id || String(dispute.id);
          if (recentlyNotifiedIds.has(cid)) continue; // Already notified recently

          const statusInfo = DISPUTE_STATUS_MAP[dispute.status || ''];
          if (!statusInfo) continue;

          // Determine timestamp of last status change
          const lastChangeStr = dispute.updated_at || dispute.created_at;
          if (!lastChangeStr) continue;
          const lastChange = new Date(lastChangeStr);
          const hoursElapsed = (now.getTime() - lastChange.getTime()) / (1000 * 60 * 60);

          // Determine SLA threshold based on coaching type
          const isHighPriority = ['ZTP Infraction', 'Incident Report'].includes(dispute.coaching_type || '');
          const slaHours = isHighPriority ? 24 : 48;

          if (hoursElapsed < slaHours) continue; // Not overdue yet

          // Resolve the next actor's OHR
          let targetOhr: string | null = null;
          const field = statusInfo.nextActorField;
          if (field === 'coach_ohr' || field === 'coachee_ohr') {
            targetOhr = (dispute as any)[field] || null;
          } else {
            // sme_joiner / sme_joiner_2 are stored as names
            const joinerName = (dispute as any)[field] || '';
            targetOhr = nameToOhr.get(joinerName) || null;
          }

          if (!targetOhr) continue;

          const priorityTag = isHighPriority ? '[HIGH PRIORITY] ' : '';
          const hoursStr = Math.round(hoursElapsed);

          await createNotification(db, {
            type: 'dispute_overdue',
            title: `${priorityTag}Dispute Overdue — ${statusInfo.level}`,
            message: `Dispute ${cid} (${dispute.coachee || 'Unknown'}) has been pending your action at ${statusInfo.level} for ${hoursStr} hours. SLA is ${slaHours} hours.`,
            actor_name: 'Playbook System',
            target_ohr: targetOhr,
            metadata: JSON.stringify({
              coaching_id: cid,
              level: statusInfo.level,
              hours_elapsed: hoursStr,
              sla_hours: slaHours,
              coaching_type: dispute.coaching_type,
              is_high_priority: isHighPriority,
            }),
          });

          alerts++;
          console.log(`[Dispute-Aging] Alert sent for ${cid} at ${statusInfo.level} (${hoursStr}h elapsed, SLA ${slaHours}h) → ${targetOhr}`);
        } catch (err: any) {
          console.error(`[Dispute-Aging] Error processing dispute ${dispute.coaching_id}: ${err.message}`);
          errors++;
        }
      }
    } catch (err: any) {
      console.error('[Dispute-Aging] Fatal error:', err.message);
      errors++;
    }

    console.log(`[Dispute-Aging] Completed: ${alerts} alerts sent, ${errors} errors.`);
    return { alerts, errors };
  }

  // Schedule: every 4 hours PHT (0:00, 4:00, 8:00, 12:00, 16:00, 20:00)
  cron.schedule("0 */4 * * *", async () => {
    try {
      await checkDisputeAging(db);
    } catch (err) {
      console.error("[Dispute-Aging] Cron error:", err);
    }
  });

  console.log("[AutoNotifier] Scheduled: Every 4 hours (Dispute Aging Alert)");

  // Manual trigger for dispute aging check
  app.post("/api/io/dispute-aging-check", async (req, res) => {
    try {
      const result = await checkDisputeAging(db);
      res.json({
        success: true,
        message: `Alerts: ${result.alerts}, Errors: ${result.errors}`,
        ...result,
      });
    } catch (err: any) {
      console.error("[Dispute-Aging] Manual trigger error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  console.log("[AutoNotifier] Manual triggers: POST /api/io/send-notifications, POST /api/io/ot-forfeiture-check, POST /api/io/ot-auto-open, POST /api/io/dispute-aging-check");

  // ═══════════════════════════════════════════════════════════════════
  // CAP Expiry Warning — daily at 9:00 AM PHT (01:00 UTC)
  // Alerts agents + supervisors when a CAP expires within 7 days
  // ═══════════════════════════════════════════════════════════════════
  async function checkCapExpiry(db: ReturnType<typeof drizzle>): Promise<{ alerts: number; errors: number }> {
    let alerts = 0, errors = 0;
    try {
      const today = getTodayPHT();
      const sevenDaysOut = new Date(new Date(today + 'T00:00:00Z').getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const now = new Date().toISOString();
      // Find CAPs expiring within 7 days that haven't been notified yet for this window
      const expiringCaps = await db.select()
        .from(ioCorrectiveActions)
        .where(and(
          eq(ioCorrectiveActions.status, 'CAP Issued'),
          gte(ioCorrectiveActions.cap_expiry_date, today),
          lte(ioCorrectiveActions.cap_expiry_date, sevenDaysOut)
        ));
      for (const cap of expiringCaps) {
        try {
          const daysLeft = Math.ceil((new Date((cap.cap_expiry_date || today) + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime()) / (24 * 60 * 60 * 1000));
          // Check if we already sent a cap_expiring notification for this CA today
          const existingNotifs = await db.select({ id: ioNotifications.id })
            .from(ioNotifications)
            .where(and(
              eq(ioNotifications.type, 'cap_expiring'),
              eq(ioNotifications.target_ohr, cap.ohr_id),
              gte(ioNotifications.created_at, today + 'T00:00:00.000Z')
            ))
            .limit(1);
          if (existingNotifs.length > 0) continue; // Already notified today
          // Notify the agent
          await db.insert(ioNotifications).values({
            type: 'cap_expiring',
            title: `${cap.cap_level} Expiring in ${daysLeft} Day${daysLeft !== 1 ? 's' : ''}`,
            message: `Your ${cap.cap_level} corrective action expires on ${formatDateReadable(cap.cap_expiry_date || today)}. Ensure compliance during the remaining active period.`,
            actor_ohr: 'SYSTEM',
            actor_name: 'Playbook System',
            target_ohr: cap.ohr_id,
            metadata: JSON.stringify({ ca_id: cap.id, cap_level: cap.cap_level, expiry_date: cap.cap_expiry_date, days_left: daysLeft }),
            is_read: false,
            created_at: now,
          });
          alerts++;
          // Notify the supervisor
          if (cap.supervisor_ohr) {
            await db.insert(ioNotifications).values({
              type: 'cap_expiring',
              title: `${cap.cap_level} Expiring — ${cap.employee_name || cap.ohr_id}`,
              message: `${cap.employee_name || cap.ohr_id}'s ${cap.cap_level} expires on ${formatDateReadable(cap.cap_expiry_date || today)} (${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining).`,
              actor_ohr: 'SYSTEM',
              actor_name: 'Playbook System',
              target_ohr: cap.supervisor_ohr,
              metadata: JSON.stringify({ ca_id: cap.id, cap_level: cap.cap_level, expiry_date: cap.cap_expiry_date, days_left: daysLeft, employee_name: cap.employee_name }),
              is_read: false,
              created_at: now,
            });
            alerts++;
          }
        } catch (err) {
          errors++;
          console.error('[CAP-Expiry] Error processing:', cap.id, err);
        }
      }
      console.log(`[CAP-Expiry] Completed: ${alerts} alerts sent, ${errors} errors.`);
    } catch (err) {
      console.error('[CAP-Expiry] Fatal error:', err);
    }
    return { alerts, errors };
  }
  // Schedule: 9:00 AM PHT = 01:00 UTC daily
  cron.schedule("0 1 * * *", async () => {
    try { await checkCapExpiry(db); } catch (err) { console.error('[CAP-Expiry] Cron error:', err); }
  });
  console.log("[AutoNotifier] Scheduled: 9:00 AM PHT daily (CAP Expiry Warning)");
  // Manual trigger
  app.post("/api/io/cap-expiry-check", async (req, res) => {
    try {
      const result = await checkCapExpiry(db);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // NTE Deadline Reminder — every 4 hours
  // Nudges agents when their NTE response deadline is within 12 hours
  // ═══════════════════════════════════════════════════════════════════
  async function checkNteDeadlines(db: ReturnType<typeof drizzle>): Promise<{ alerts: number; errors: number }> {
    let alerts = 0, errors = 0;
    try {
      const now = new Date();
      const nowIso = now.toISOString();
      const twelveHoursOut = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();
      // Find NTEs with status 'Served' and deadline within 12 hours
      const urgentNtes = await db.select()
        .from(ioCorrectiveActions)
        .where(and(
          eq(ioCorrectiveActions.status, 'Served'),
          gte(ioCorrectiveActions.response_deadline, nowIso),
          lte(ioCorrectiveActions.response_deadline, twelveHoursOut)
        ));
      for (const nte of urgentNtes) {
        try {
          // Check if we already sent a deadline reminder for this NTE today
          const today = getTodayPHT();
          const existingReminder = await db.select({ id: ioNotifications.id })
            .from(ioNotifications)
            .where(and(
              eq(ioNotifications.type, 'nte_deadline_reminder'),
              eq(ioNotifications.target_ohr, nte.ohr_id),
              gte(ioNotifications.created_at, today + 'T00:00:00.000Z')
            ))
            .limit(1);
          if (existingReminder.length > 0) continue;
          const hoursLeft = Math.ceil((new Date(nte.response_deadline!).getTime() - now.getTime()) / (60 * 60 * 1000));
          await db.insert(ioNotifications).values({
            type: 'nte_deadline_reminder',
            title: `NTE Deadline — ${hoursLeft} Hour${hoursLeft !== 1 ? 's' : ''} Remaining`,
            message: `Your NTE regarding ${nte.nte_type || 'Policy Violation'} has a response deadline in approximately ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''}. Please respond promptly.`,
            actor_ohr: 'SYSTEM',
            actor_name: 'Playbook System',
            target_ohr: nte.ohr_id,
            metadata: JSON.stringify({ ca_id: nte.id, nte_type: nte.nte_type, deadline: nte.response_deadline, hours_left: hoursLeft }),
            is_read: false,
            created_at: nowIso,
          });
          alerts++;
        } catch (err) {
          errors++;
          console.error('[NTE-Deadline] Error processing:', nte.id, err);
        }
      }
      console.log(`[NTE-Deadline] Completed: ${alerts} reminders sent, ${errors} errors.`);
    } catch (err) {
      console.error('[NTE-Deadline] Fatal error:', err);
    }
    return { alerts, errors };
  }
  // Schedule: every 4 hours (same cadence as dispute aging)
  cron.schedule("30 */4 * * *", async () => {
    try { await checkNteDeadlines(db); } catch (err) { console.error('[NTE-Deadline] Cron error:', err); }
  });
  console.log("[AutoNotifier] Scheduled: Every 4 hours (NTE Deadline Reminder)");
  app.post("/api/io/nte-deadline-check", async (req, res) => {
    try {
      const result = await checkNteDeadlines(db);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // Coaching Acknowledgement Overdue — daily at 10:00 AM PHT (02:00 UTC)
  // Alerts coach + TL when coaching not acknowledged within 48 hours
  // ═══════════════════════════════════════════════════════════════════
  async function checkCoachingAckOverdue(db: ReturnType<typeof drizzle>): Promise<{ alerts: number; errors: number }> {
    let alerts = 0, errors = 0;
    try {
      const now = new Date();
      const nowIso = now.toISOString();
      const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
      const today = getTodayPHT();
      // Find coaching logs created >48h ago that are not yet acknowledged
      const overdueLogs = await db.select()
        .from(ioCoaching)
        .where(and(
          lte(ioCoaching.created_at, fortyEightHoursAgo),
          sql`${ioCoaching.ack_date} IS NULL`
        ));
      for (const log of overdueLogs) {
        try {
          // Deduplicate: only one alert per coaching log per day
          const existingAlert = await db.select({ id: ioNotifications.id })
            .from(ioNotifications)
            .where(and(
              eq(ioNotifications.type, 'coaching_ack_overdue'),
              eq(ioNotifications.target_ohr, log.coach_ohr || ''),
              gte(ioNotifications.created_at, today + 'T00:00:00.000Z')
            ))
            .limit(1);
          if (existingAlert.length > 0) continue;
          const coacheeName = log.coachee || 'Coachee';
          const cid = log.coaching_id || log.id;
          const hoursOverdue = Math.floor((now.getTime() - new Date(log.created_at!).getTime()) / (60 * 60 * 1000));
          // Notify the coach
          if (log.coach_ohr) {
            await db.insert(ioNotifications).values({
              type: 'coaching_ack_overdue',
              title: `Coaching Acknowledgement Overdue — ${coacheeName}`,
              message: `${coacheeName} has not acknowledged coaching log ${cid} after ${hoursOverdue} hours. Please follow up.`,
              actor_ohr: 'SYSTEM',
              actor_name: 'Playbook System',
              target_ohr: log.coach_ohr,
              metadata: JSON.stringify({ coaching_id: cid, coachee: coacheeName, hours_overdue: hoursOverdue }),
              is_read: false,
              created_at: nowIso,
            });
            alerts++;
          }
          // Notify the coach's supervisor (TL)
          if (log.coach_sup) {
            const supEmp = await db.select({ ohr_id: ioEmployees.ohr_id })
              .from(ioEmployees)
              .where(eq(ioEmployees.full_name, log.coach_sup))
              .limit(1);
            if (supEmp.length > 0 && supEmp[0].ohr_id) {
              await db.insert(ioNotifications).values({
                type: 'coaching_ack_overdue',
                title: `Coaching Ack Overdue — ${coacheeName} (Coach: ${log.coach || 'Unknown'})`,
                message: `Coaching log ${cid} by ${log.coach || 'Coach'} for ${coacheeName} has not been acknowledged after ${hoursOverdue} hours.`,
                actor_ohr: 'SYSTEM',
                actor_name: 'Playbook System',
                target_ohr: supEmp[0].ohr_id,
                metadata: JSON.stringify({ coaching_id: cid, coachee: coacheeName, coach: log.coach, hours_overdue: hoursOverdue }),
                is_read: false,
                created_at: nowIso,
              });
              alerts++;
            }
          }
        } catch (err) {
          errors++;
          console.error('[Coaching-Ack-Overdue] Error processing:', log.id, err);
        }
      }
      console.log(`[Coaching-Ack-Overdue] Completed: ${alerts} alerts sent, ${errors} errors.`);
    } catch (err) {
      console.error('[Coaching-Ack-Overdue] Fatal error:', err);
    }
    return { alerts, errors };
  }
  // Schedule: 10:00 AM PHT = 02:00 UTC daily
  cron.schedule("0 2 * * *", async () => {
    try { await checkCoachingAckOverdue(db); } catch (err) { console.error('[Coaching-Ack-Overdue] Cron error:', err); }
  });
  console.log("[AutoNotifier] Scheduled: 10:00 AM PHT daily (Coaching Ack Overdue)");
  app.post("/api/io/coaching-ack-overdue-check", async (req, res) => {
    try {
      const result = await checkCoachingAckOverdue(db);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // Weekly Compass Digest — Monday 8:00 AM PHT (00:00 UTC Monday)
  // Summary of coaching/CA activity for TLs and Managers
  // ═══════════════════════════════════════════════════════════════════
  async function sendWeeklyDigest(db: ReturnType<typeof drizzle>): Promise<{ sent: number; errors: number }> {
    let sent = 0, errors = 0;
    try {
      const now = new Date();
      const nowIso = now.toISOString();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      // Count coaching logs created in the last 7 days
      const [coachingCount] = await db.select({ cnt: sql<number>`COUNT(*)` })
        .from(ioCoaching)
        .where(gte(ioCoaching.created_at, sevenDaysAgo));
      // Count NTEs created in the last 7 days
      const [nteCount] = await db.select({ cnt: sql<number>`COUNT(*)` })
        .from(ioCorrectiveActions)
        .where(gte(ioCorrectiveActions.created_at, sevenDaysAgo));
      // Count unacknowledged coaching logs
      const [unackCount] = await db.select({ cnt: sql<number>`COUNT(*)` })
        .from(ioCoaching)
        .where(sql`${ioCoaching.ack_date} IS NULL`);
      // Count active CAPs
      const [activeCaps] = await db.select({ cnt: sql<number>`COUNT(*)` })
        .from(ioCorrectiveActions)
        .where(eq(ioCorrectiveActions.status, 'CAP Issued'));
      const digestMsg = `Weekly Compass Summary:\n• ${coachingCount.cnt} coaching sessions this week\n• ${nteCount.cnt} NTEs issued this week\n• ${unackCount.cnt} coaching logs pending acknowledgement\n• ${activeCaps.cnt} active CAPs currently enforced`;
      // Send to all TLs and Managers
      const supervisors = await db.selectDistinct({ ohr_id: ioEmployees.ohr_id, full_name: ioEmployees.full_name })
        .from(ioEmployees)
        .where(inArray(ioEmployees.actual_role, ['Team Lead', 'Manager', 'Operational SME']));
      for (const sup of supervisors) {
        try {
          if (!sup.ohr_id) continue;
          await db.insert(ioNotifications).values({
            type: 'weekly_digest',
            title: 'Weekly Compass Digest',
            message: digestMsg,
            actor_ohr: 'SYSTEM',
            actor_name: 'Playbook System',
            target_ohr: sup.ohr_id,
            metadata: JSON.stringify({ coaching_count: coachingCount.cnt, nte_count: nteCount.cnt, unack_count: unackCount.cnt, active_caps: activeCaps.cnt }),
            is_read: false,
            created_at: nowIso,
          });
          sent++;
        } catch (err) {
          errors++;
        }
      }
      console.log(`[Weekly-Digest] Completed: ${sent} digests sent, ${errors} errors.`);
    } catch (err) {
      console.error('[Weekly-Digest] Fatal error:', err);
    }
    return { sent, errors };
  }
  // Schedule: Monday 8:00 AM PHT = 00:00 UTC Monday
  cron.schedule("0 0 * * 1", async () => {
    try { await sendWeeklyDigest(db); } catch (err) { console.error('[Weekly-Digest] Cron error:', err); }
  });
  console.log("[AutoNotifier] Scheduled: Monday 8:00 AM PHT (Weekly Compass Digest)");
  app.post("/api/io/weekly-digest", async (req, res) => {
    try {
      const result = await sendWeeklyDigest(db);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // Insight Review Pending — Every 12h (06:00 UTC + 18:00 UTC)
  // Nudges SMEs/Trainers when insights sit pending > 48h (initial) or > 72h (final)
  // ═══════════════════════════════════════════════════════════════════
  async function checkInsightReviewPending(db: ReturnType<typeof drizzle>): Promise<{ alerts: number; errors: number }> {
    let alerts = 0, errors = 0;
    try {
      const now = new Date();
      const nowIso = now.toISOString();
      const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
      const seventyTwoHoursAgo = new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

      // Find insights pending initial review > 48h
      const pendingInitial = await db.select()
        .from(ioInsights)
        .where(and(
          eq(ioInsights.status, 'Pending - Initial Review'),
          lte(ioInsights.created_at, fortyEightHoursAgo)
        ));

      // Find insights pending final review > 72h (use initial_review_date as the start)
      const pendingFinal = await db.select()
        .from(ioInsights)
        .where(and(
          eq(ioInsights.status, 'Pending - Final Review'),
          lte(ioInsights.initial_review_date, seventyTwoHoursAgo)
        ));

      // Group initial by planning_group for SME targeting
      const pgGroups: Record<string, typeof pendingInitial> = {};
      for (const ins of pendingInitial) {
        const pg = ins.planning_group || 'Unknown';
        if (!pgGroups[pg]) pgGroups[pg] = [];
        pgGroups[pg].push(ins);
      }

      // Get all employees for role-based targeting
      const allEmps = await db.select({
        ohr_id: ioEmployees.ohr_id,
        full_name: ioEmployees.full_name,
        actual_role: ioEmployees.actual_role,
        planning_group: ioEmployees.planning_group,
      }).from(ioEmployees);

      // Notify SMEs/Content Reviewers for pending initial insights
      for (const [pg, insights] of Object.entries(pgGroups)) {
        const reviewers = allEmps.filter(e =>
          (e.actual_role === 'Operational SME' || e.actual_role === 'Content Reviewer') &&
          e.planning_group === pg
        );
        for (const reviewer of reviewers) {
          if (!reviewer.ohr_id) continue;
          // Dedup: skip if already notified within 24h for same PG
          const existing = await db.select({ id: ioNotifications.id })
            .from(ioNotifications)
            .where(and(
              eq(ioNotifications.type, 'insight_review_pending'),
              eq(ioNotifications.target_ohr, reviewer.ohr_id),
              gte(ioNotifications.created_at, twentyFourHoursAgo)
            ))
            .limit(1);
          if (existing.length > 0) continue;

          const insightIds = insights.map(i => i.insight_id).filter(Boolean);
          await db.insert(ioNotifications).values({
            type: 'insight_review_pending',
            title: `Insight Awaiting Review — ${insights.length} pending`,
            message: `${insights.length} insight(s) pending your initial review for 48+ hours.`,
            actor_ohr: 'SYSTEM',
            actor_name: 'Playbook System',
            target_ohr: reviewer.ohr_id,
            metadata: JSON.stringify({ insight_ids: insightIds, count: insights.length, review_tier: 'initial', planning_group: pg }),
            is_read: false,
            created_at: nowIso,
          });
          alerts++;
        }
      }

      // Notify Trainers for pending final insights
      if (pendingFinal.length > 0) {
        const trainers = allEmps.filter(e => e.actual_role === 'Trainer');
        for (const trainer of trainers) {
          if (!trainer.ohr_id) continue;
          // Dedup
          const existing = await db.select({ id: ioNotifications.id })
            .from(ioNotifications)
            .where(and(
              eq(ioNotifications.type, 'insight_review_pending'),
              eq(ioNotifications.target_ohr, trainer.ohr_id),
              gte(ioNotifications.created_at, twentyFourHoursAgo)
            ))
            .limit(1);
          if (existing.length > 0) continue;

          const insightIds = pendingFinal.map(i => i.insight_id).filter(Boolean);
          await db.insert(ioNotifications).values({
            type: 'insight_review_pending',
            title: `Insight Awaiting Review — ${pendingFinal.length} pending`,
            message: `${pendingFinal.length} insight(s) pending your final review for 72+ hours.`,
            actor_ohr: 'SYSTEM',
            actor_name: 'Playbook System',
            target_ohr: trainer.ohr_id,
            metadata: JSON.stringify({ insight_ids: insightIds, count: pendingFinal.length, review_tier: 'final' }),
            is_read: false,
            created_at: nowIso,
          });
          alerts++;
        }
      }

      console.log(`[Insight-Review-Pending] Completed: ${alerts} reminders sent, ${errors} errors.`);
    } catch (err) {
      console.error('[Insight-Review-Pending] Fatal error:', err);
    }
    return { alerts, errors };
  }
  // Schedule: Every 12h at 06:00 UTC (2:00 PM PHT) and 18:00 UTC (2:00 AM PHT)
  cron.schedule("0 6,18 * * *", async () => {
    try { await checkInsightReviewPending(db); } catch (err) { console.error('[Insight-Review-Pending] Cron error:', err); }
  });
  console.log("[AutoNotifier] Scheduled: Every 12h (Insight Review Pending Reminder)");
  app.post("/api/io/insight-review-pending-check", async (req, res) => {
    try {
      const result = await checkInsightReviewPending(db);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── Group Task Deadline Reminders ──
  // Notifies supervisors and assignees when a group task is due within 3 days
  async function checkGroupTaskDeadlines(db: ReturnType<typeof drizzle>): Promise<{ alerts: number; errors: number }> {
    let alerts = 0, errors = 0;
    const today = getTodayPHT();
    // 3 days from now
    const d = new Date(today + 'T00:00:00Z');
    d.setDate(d.getDate() + 3);
    const threeDaysOut = d.toISOString().slice(0, 10);

    try {
      // Find open group tasks with due_date between today and 3 days out
      const [tasks] = await db.execute(sql`
        SELECT gt.id, gt.task_id, gt.title, gt.due_date, gt.created_by_ohr, gt.created_by_name,
          COUNT(ta.id) AS total,
          SUM(CASE WHEN ta.status = 'Completed' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN ta.status = 'Pending' THEN 1 ELSE 0 END) AS pending
        FROM io_group_tasks gt
        LEFT JOIN io_task_assignments ta ON ta.group_task_id = gt.id
        WHERE gt.status = 'Open'
          AND gt.due_date IS NOT NULL
          AND gt.due_date >= ${today}
          AND gt.due_date <= ${threeDaysOut}
        GROUP BY gt.id
      `) as any;

      for (const task of tasks as any[]) {
        if (Number(task.pending) === 0) continue; // All done, skip

        const dueDate = formatDateReadable(typeof task.due_date === 'string' ? task.due_date.slice(0, 10) : task.due_date);
        const pct = Number(task.total) > 0 ? Math.round((Number(task.completed) / Number(task.total)) * 100) : 0;

        // Notify the task creator (TL/Manager)
        await createNotification(db, {
          type: 'group_task_deadline',
          title: `⏰ Group Task Due Soon: ${task.title}`,
          message: `"${task.title}" is due on ${dueDate}. Progress: ${pct}% (${task.pending} pending). Please follow up with your team.`,
          actor_ohr: 'SYSTEM',
          actor_name: 'Playbook System',
          target_ohr: task.created_by_ohr,
        });
        alerts++;

        // Notify each pending assignee
        const [pendingAssignees] = await db.execute(sql`
          SELECT ta.employee_ohr
          FROM io_task_assignments ta
          WHERE ta.group_task_id = ${task.id} AND ta.status = 'Pending'
        `) as any;

        for (const assignee of pendingAssignees as any[]) {
          await createNotification(db, {
            type: 'group_task_deadline',
            title: `⏰ Task Due Soon: ${task.title}`,
            message: `"${task.title}" is due on ${dueDate}. Please complete it before the deadline.`,
            actor_ohr: 'SYSTEM',
            actor_name: 'Playbook System',
            target_ohr: assignee.employee_ohr,
          });
          alerts++;
        }
      }
    } catch (err) {
      console.error('[GroupTaskDeadline] Error:', err);
      errors++;
    }

    console.log(`[GroupTaskDeadline] Sent ${alerts} reminders, ${errors} errors`);
    return { alerts, errors };
  }

  // Schedule: 9:00 AM PHT = 01:00 UTC daily
  cron.schedule("0 1 * * *", async () => {
    try { await checkGroupTaskDeadlines(db); } catch (err) { console.error('[GroupTaskDeadline] Cron error:', err); }
  });
  console.log("[AutoNotifier] Scheduled: 9:00 AM PHT daily (Group Task Deadline Reminders)");
  app.post("/api/io/group-task-deadline-check", async (req, res) => {
    try {
      const result = await checkGroupTaskDeadlines(db);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  console.log("[AutoNotifier] All cron jobs and manual triggers initialized.");
}
