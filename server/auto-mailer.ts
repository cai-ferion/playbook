/**
 * Auto-Notifier Module
 * Creates in-app notifications AND queues GChat rich cards for UPL/LATE attendance tags.
 * 
 * Schedule: 2:30 AM and 11:30 AM Philippine Time (UTC+8) daily for UPL/LATE.
 */

import { Express } from "express";
import cron from "node-cron";
import { drizzle } from "drizzle-orm/mysql2";
import { eq, and, inArray, sql, gte, lte, asc } from "drizzle-orm";
import { ioAttendance, ioEmployees, ioNotifications, ioGchatQueue, ioOtRequests, ioLeaves, ioAuditLog } from "../drizzle/schema";

// Philippine Time is UTC+8
const PHT_OFFSET_HOURS = 8;
const ADMIN_OHR = "740045023";

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

/**
 * Build the GChat rich card JSON for a UPL or LATE notice.
 * Template matches the user-approved design (4th image from Batch 26).
 */
function buildUplLateGchatCard(params: {
  tag: string;
  agentName: string;
  readableDate: string;
  reason: string;
  remarks: string;
  supervisorName: string;
  refId: string;
}): string {
  const { tag, agentName, readableDate, reason, remarks, supervisorName, refId } = params;
  const isUpl = tag === "UPL";
  const tagTitle = isUpl ? "UPL Notice" : "LATE Notice";
  const tagLabel = isUpl ? "UPL — Unplanned Leave" : "LATE — Late Attendance";
  const iconUrl = isUpl
    ? "https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/warning/default/48px.svg"
    : "https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/schedule/default/48px.svg";

  const card = [{
    cardId: `${tag.toLowerCase()}_${refId}`,
    card: {
      header: {
        title: `⚠ ${tagTitle}`,
        subtitle: agentName,
        imageUrl: iconUrl,
        imageType: "CIRCLE"
      },
      sections: [
        {
          header: "Notification",
          widgets: [
            {
              textParagraph: {
                text: `Hi <b>${agentName}</b>,\n\nThis is to inform you that your attendance for <b>${readableDate}</b> has been tagged as <b>${tagLabel}</b>.`
              }
            }
          ]
        },
        {
          header: "📋 Attendance Details",
          widgets: [
            { decoratedText: { topLabel: "ATTENDANCE TAG", text: `<font color=\"#dc2626\">${tagLabel}</font>`, icon: { knownIcon: "BOOKMARK" } } },
            { decoratedText: { topLabel: "DATE", text: readableDate, icon: { knownIcon: "INVITE" } } },
            ...(reason && reason !== "Not specified" ? [{ decoratedText: { topLabel: "REASON", text: reason, icon: { knownIcon: "DESCRIPTION" } } }] : []),
            ...(remarks && remarks !== "No additional remarks" ? [{ decoratedText: { topLabel: "REMARKS", text: remarks, icon: { knownIcon: "DESCRIPTION" } } }] : [])
          ]
        },
        {
          header: "⚠ Action Required",
          widgets: [
            {
              textParagraph: {
                text: `Please coordinate with your supervisor, <b>${supervisorName}</b>, regarding this attendance record. If you believe this tag was applied in error, you may request for your supervisor to change this.`
              }
            }
          ]
        },
        {
          widgets: [
            {
              textParagraph: {
                text: `<i>Playbook Reporting — Automated Attendance Notification System</i>\nRef: ${refId}`
              }
            }
          ]
        }
      ]
    }
  }];

  return JSON.stringify(card);
}

async function sendUplLateNotifications(db: ReturnType<typeof drizzle>): Promise<{ sent: number; errors: number; gchatQueued: number }> {
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
    return { sent: 0, errors: 0, gchatQueued: 0 };
  }

  console.log(`[AutoNotifier] Found ${records.length} UPL/LATE records for ${today}.`);

  const ohrIds = Array.from(new Set(records.map((r) => r.ohr_id).filter((x): x is string => x !== null)));

  const employees = await db
    .select({
      ohr_id: ioEmployees.ohr_id,
      full_name: ioEmployees.full_name,
      supervisor_name: ioEmployees.supervisor_name,
      gchat_space_id: ioEmployees.gchat_space_id,
    })
    .from(ioEmployees)
    .where(inArray(ioEmployees.ohr_id, ohrIds));

  const employeeMap = new Map<string, { ohr_id: string; full_name: string | null; supervisor_name: string | null; gchat_space_id: string | null }>();
  for (const emp of employees) {
    if (emp.ohr_id) employeeMap.set(emp.ohr_id, emp);
  }

  let sent = 0;
  let errors = 0;
  let gchatQueued = 0;

  for (const record of records) {
    try {
      const employee = record.ohr_id ? employeeMap.get(record.ohr_id) : null;
      const agentName = record.snap_full_name || employee?.full_name || "Team Member";
      const readableDate = formatDateReadable(record.log_date || today);
      const tagLabel = record.tag === "UPL" ? "Unplanned Leave (UPL)" : "Late Attendance (LATE)";
      const supervisorName = employee?.supervisor_name || "your supervisor";

      // In-app notification for the tagged employee
      await createNotification(db, {
        type: record.tag === "UPL" ? "upl_notice" : "late_notice",
        title: `${record.tag} Notice — ${readableDate}`,
        message: `You have been tagged as ${tagLabel} for ${readableDate}.\n\nReason: ${record.reason || "Not specified"}\nRemarks: ${record.remarks || "No additional remarks"}\n\nPlease coordinate with your supervisor, ${supervisorName}, regarding this attendance record. If you believe this tag was applied in error, you may request for your supervisor to change this.`,
        actor_name: "Playbook System",
        target_ohr: record.ohr_id || undefined,
        metadata: JSON.stringify({ attendance_id: record.id, tag: record.tag, date: record.log_date }),
      });

      sent++;

      // Queue GChat rich card notification if employee has a gchat_space_id
      if (employee?.gchat_space_id) {
        const refId = `${record.id}${record.ohr_id || ''}`;
        const cardJson = buildUplLateGchatCard({
          tag: record.tag || "UPL",
          agentName,
          readableDate,
          reason: record.reason || "Not specified",
          remarks: record.remarks || "No additional remarks",
          supervisorName,
          refId,
        });

        const fallbackText = `⚠ ${record.tag} Notice\nHi ${agentName},\nYour attendance for ${readableDate} has been tagged as ${tagLabel}.\nPlease coordinate with your supervisor, ${supervisorName}, regarding this attendance record.`;

        await db.insert(ioGchatQueue).values({
          type: `${(record.tag || "upl").toLowerCase()}_notice`,
          target_space_id: employee.gchat_space_id,
          target_name: agentName,
          card_json: cardJson,
          fallback_text: fallbackText,
          status: "pending",
          metadata: JSON.stringify({ attendance_id: record.id, tag: record.tag, date: record.log_date, ohr_id: record.ohr_id }),
          created_at: getNowPHT(),
        });

        gchatQueued++;
      }
    } catch (err: any) {
      console.error(`[AutoNotifier] Error creating notification for OHR ${record.ohr_id}: ${err.message}`);
      errors++;
    }
  }

  console.log(`[AutoNotifier] Completed: ${sent} in-app notifications, ${gchatQueued} GChat cards queued, ${errors} errors.`);
  return { sent, errors, gchatQueued };
}

// ============================================================
// OT Forfeiture Cascade
// Runs daily after 11 AM PHT. Checks approved OT records where the agent's
// attendance tag on the applied_date is NOT 'P' or 'LATE'. Forfeits the OT
// and cascades to the next waitlisted agent (same week, skip past days).
// Exception: if applied_date is a Friday, no cascade — truly forfeited.
// ============================================================

function parseWorkOffDays(workOff: string | null | undefined): number[] {
  if (!workOff) return [];
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return workOff.split(/\s*-\s*/).map(d => dayMap[d.trim()]).filter(d => d !== undefined);
}

function isOnLeave(dateStr: string, leaves: any[]): boolean {
  for (const lv of leaves) {
    if (lv.status !== 'approved' && lv.status !== 'Approved') continue;
    const start = lv.start_date || '';
    const end = lv.end_date || '';
    if (start && end && dateStr >= start && dateStr <= end) return true;
    if (start && !end && dateStr === start) return true;
  }
  return false;
}

function findOtDayForCascade(weekSaturday: Date, workOffDays: number[], agentLeaves: any[], attendanceRecords: any[]): string | null {
  // Get today's date in PHT
  const nowUtc = new Date();
  const phtNow = new Date(nowUtc.getTime() + PHT_OFFSET_HOURS * 60 * 60 * 1000);
  const todayStr = phtNow.toISOString().split('T')[0];

  for (let i = 0; i < 7; i++) {
    const d = new Date(weekSaturday);
    d.setUTCDate(d.getUTCDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const dow = d.getUTCDay();
    if (dateStr < todayStr) continue; // Skip past days
    if (workOffDays.includes(dow)) continue;
    if (isOnLeave(dateStr, agentLeaves)) continue;
    // Check if PL tag
    const rec = attendanceRecords.find((r: any) => r.log_date === dateStr);
    if (rec) {
      const tag = (rec.tag || '').toUpperCase().trim();
      if (tag === 'PL' || tag === 'ML') continue;
    }
    return dateStr;
  }
  return null;
}

import crypto from "crypto";

async function runOtForfeitureCheck(db: ReturnType<typeof drizzle>): Promise<{ forfeited: number; cascaded: number; trulyForfeited: number; errors: number }> {
  let forfeited = 0, cascaded = 0, trulyForfeited = 0, errors = 0;
  const now = new Date().toISOString();

  // Get yesterday's date in PHT (the day that just got locked at 11 AM)
  const phtNow = new Date(Date.now() + PHT_OFFSET_HOURS * 60 * 60 * 1000);
  const yesterday = new Date(phtNow);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  console.log(`[OT-Forfeiture] Checking approved OTs applied on ${yesterdayStr}`);

  // Find all approved OT requests where applied_date = yesterday
  const approvedOTs = await db.select().from(ioOtRequests)
    .where(and(
      eq(ioOtRequests.status, 'approved'),
      eq(ioOtRequests.applied_date, yesterdayStr)
    ));

  if (approvedOTs.length === 0) {
    console.log(`[OT-Forfeiture] No approved OTs found for ${yesterdayStr}`);
    return { forfeited, cascaded, trulyForfeited, errors };
  }

  console.log(`[OT-Forfeiture] Found ${approvedOTs.length} approved OTs for ${yesterdayStr}`);

  // Fetch attendance records for yesterday for these agents
  const agentOhrs = approvedOTs.map(r => r.ohr_id);
  const attendanceRecords = await db.select().from(ioAttendance)
    .where(and(
      eq(ioAttendance.log_date, yesterdayStr),
      inArray(ioAttendance.ohr_id, agentOhrs)
    ));

  for (const otReq of approvedOTs) {
    try {
      const attRec = attendanceRecords.find(a => a.ohr_id === otReq.ohr_id);
      const tag = (attRec?.tag || '').toUpperCase().trim();

      // If tag is P or LATE, the OT is valid — skip
      if (tag === 'P' || tag === 'LATE') continue;

      // OT is forfeited — agent was not P or LATE on the applied date
      forfeited++;
      console.log(`[OT-Forfeiture] Forfeiting OT ${otReq.request_id} for ${otReq.agent_name} (${otReq.ohr_id}) — tag was '${tag}' on ${yesterdayStr}`);

      // Mark as forfeited
      await db.update(ioOtRequests)
        .set({ status: 'forfeited' })
        .where(eq(ioOtRequests.id, otReq.id));

      // Clear OT hours from attendance
      if (attRec) {
        await db.update(ioAttendance)
          .set({ ot_hours: '0' })
          .where(eq(ioAttendance.id, attRec.id));
      }

      // Audit log
      await db.insert(ioAuditLog).values({
        record_type: 'ot_request',
        record_id: otReq.request_id,
        action: 'forfeited',
        field_name: 'status',
        old_value: 'approved',
        new_value: 'forfeited',
        actor_ohr: 'SYSTEM',
        actor_name: 'OT Forfeiture Check',
        timestamp: now,
        metadata: JSON.stringify({ reason: `Tag was '${tag}' (not P or LATE) on ${yesterdayStr}`, applied_date: yesterdayStr }),
      });

      // Notify the agent about forfeiture
      const forfeitDateFormatted = new Date(yesterdayStr + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
      await db.insert(ioNotifications).values({
        type: 'ot_forfeited',
        title: 'OT Forfeited',
        message: `Your OT commitment (${otReq.request_id}) for ${yesterdayStr} has been forfeited because your attendance tag was '${tag}' (not Present or Late).`,
        actor_ohr: 'SYSTEM',
        actor_name: 'OT Forfeiture Check',
        target_ohr: otReq.ohr_id,
        metadata: JSON.stringify({ request_id: otReq.request_id, applied_date: yesterdayStr, tag }),
        is_read: false,
        created_at: now,
      });

      // Check if applied_date is a Friday — if so, no cascade
      const appliedDow = new Date(yesterdayStr + 'T00:00:00Z').getUTCDay();
      if (appliedDow === 5) { // Friday
        trulyForfeited++;
        console.log(`[OT-Forfeiture] ${otReq.request_id} was on Friday — truly forfeited, no cascade`);
        continue;
      }

      // CASCADE: Find next waitlisted agent for the same planning group
      const pg = otReq.planning_group || '';
      if (!pg) {
        trulyForfeited++;
        continue;
      }

      // Get current week boundaries (Sat–Fri) for the applied_date's week
      const appliedDate = new Date(yesterdayStr + 'T00:00:00Z');
      const adDow = appliedDate.getUTCDay();
      const daysSinceSat = adDow === 6 ? 0 : (adDow + 1);
      const weekSaturday = new Date(appliedDate);
      weekSaturday.setUTCDate(weekSaturday.getUTCDate() - daysSinceSat);
      weekSaturday.setUTCHours(0, 0, 0, 0);
      const weekFriday = new Date(weekSaturday);
      weekFriday.setUTCDate(weekFriday.getUTCDate() + 6);
      const weekSatStr = weekSaturday.toISOString().split('T')[0];
      const weekFriStr = weekFriday.toISOString().split('T')[0];

      // Get all pending (waitlisted) requests for this PG, FIFO order
      const waitlisted = await db.select().from(ioOtRequests)
        .where(and(eq(ioOtRequests.planning_group, pg), eq(ioOtRequests.status, 'pending')))
        .orderBy(asc(ioOtRequests.submitted_at));

      if (waitlisted.length === 0) {
        trulyForfeited++;
        console.log(`[OT-Forfeiture] No waitlisted agents for PG '${pg}' — truly forfeited`);
        continue;
      }

      // Pre-fetch employees and leaves for cascade
      const allEmployees = await db.select().from(ioEmployees)
        .where(eq(ioEmployees.planning_group, pg));
      const empMap = new Map(allEmployees.map((e: any) => [e.ohr_id, e]));

      const allLeaves = await db.select().from(ioLeaves)
        .where(eq(ioLeaves.planning_group, pg));
      const weekLeaves = allLeaves.filter((lv: any) => {
        if (lv.status !== 'approved' && lv.status !== 'Approved') return false;
        const start = lv.start_date || '';
        const end = lv.end_date || start;
        return start <= weekFriStr && end >= weekSatStr;
      });

      let cascadeSuccess = false;
      for (const nextReq of waitlisted) {
        const emp = empMap.get(nextReq.ohr_id);
        const workOffDays = parseWorkOffDays(emp?.work_off || '');
        const agentLeaves = weekLeaves.filter((lv: any) => lv.ohr_id === nextReq.ohr_id);

        // Fetch attendance for this agent for the current week
        const agentAtt = await db.select().from(ioAttendance)
          .where(and(
            gte(ioAttendance.log_date, weekSatStr),
            lte(ioAttendance.log_date, weekFriStr),
            eq(ioAttendance.ohr_id, nextReq.ohr_id)
          ));

        const cascadeDate = findOtDayForCascade(weekSaturday, workOffDays, agentLeaves, agentAtt);
        if (!cascadeDate) continue; // No valid day for this agent, try next

        // Apply OT to this agent
        const OT_HOURS = 2.5;
        await db.update(ioOtRequests)
          .set({ status: 'approved', approved_at: now, applied_date: cascadeDate, approved_by: 'SYSTEM (Cascade)', approved_by_ohr: 'SYSTEM' })
          .where(eq(ioOtRequests.id, nextReq.id));

        // Write OT to attendance
        const attRows = await db.select().from(ioAttendance)
          .where(and(eq(ioAttendance.ohr_id, nextReq.ohr_id), eq(ioAttendance.log_date, cascadeDate)));
        if (attRows.length > 0) {
          await db.update(ioAttendance)
            .set({ ot_hours: String(OT_HOURS) })
            .where(eq(ioAttendance.id, attRows[0].id));
        } else {
          const attId = crypto.randomBytes(8).toString('hex');
          await db.insert(ioAttendance).values({
            id: attId,
            ohr_id: nextReq.ohr_id,
            log_date: cascadeDate,
            ot_hours: String(OT_HOURS),
            created_at: now,
            snap_full_name: emp?.full_name || nextReq.agent_name,
            snap_supervisor: emp?.supervisor_name || '',
            snap_planning_group: emp?.planning_group || '',
            snap_shift_time: emp?.shift_time || '',
            snap_actual_role: emp?.actual_role || '',
            snap_billing_name: emp?.billing_name || '',
            snap_status: emp?.srt_status || '',
          });
        }

        // Audit log for cascade
        await db.insert(ioAuditLog).values({
          record_type: 'ot_request',
          record_id: nextReq.request_id,
          action: 'cascade_approved',
          field_name: 'status',
          old_value: 'pending',
          new_value: 'approved',
          actor_ohr: 'SYSTEM',
          actor_name: 'OT Forfeiture Cascade',
          timestamp: now,
          metadata: JSON.stringify({ cascaded_from: otReq.request_id, original_agent: otReq.ohr_id, applied_date: cascadeDate }),
        });

        // Notify the cascade agent + supervisor
        const cascadeDateFormatted = new Date(cascadeDate + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
        const cascadeNotifs: any[] = [{
          type: 'ot_applied',
          title: 'OT Applied (Cascade)',
          message: `Your OT commitment (${nextReq.request_id}) for 2.5 hour(s) has been applied on ${cascadeDateFormatted} via cascade.`,
          actor_ohr: 'SYSTEM',
          actor_name: 'OT Forfeiture Cascade',
          target_ohr: nextReq.ohr_id,
          metadata: JSON.stringify({ request_id: nextReq.request_id, hours: OT_HOURS, applied_date: cascadeDate, cascaded_from: otReq.request_id }),
          is_read: false,
          created_at: now,
        }];
        if (emp?.supervisor_ohr) {
          cascadeNotifs.push({
            type: 'ot_applied',
            title: 'OT Applied (Cascade) — Agent Update',
            message: `OT for ${nextReq.agent_name} (2.5 hr) has been applied on ${cascadeDateFormatted} via cascade.`,
            actor_ohr: 'SYSTEM',
            actor_name: 'OT Forfeiture Cascade',
            target_ohr: emp.supervisor_ohr,
            metadata: JSON.stringify({ request_id: nextReq.request_id, agent_ohr: nextReq.ohr_id, agent_name: nextReq.agent_name, hours: OT_HOURS, applied_date: cascadeDate }),
            is_read: false,
            created_at: now,
          });
        }
        await db.insert(ioNotifications).values(cascadeNotifs);

        cascadeSuccess = true;
        cascaded++;
        console.log(`[OT-Forfeiture] Cascaded ${otReq.request_id} → ${nextReq.request_id} (${nextReq.agent_name}) on ${cascadeDate}`);
        break; // Only cascade to one agent per forfeited OT
      }

      if (!cascadeSuccess) {
        trulyForfeited++;
        console.log(`[OT-Forfeiture] No valid cascade target for ${otReq.request_id} — truly forfeited`);
      }
    } catch (err: any) {
      errors++;
      console.error(`[OT-Forfeiture] Error processing ${otReq.request_id}:`, err.message);
    }
  }

  console.log(`[OT-Forfeiture] Complete: ${forfeited} forfeited, ${cascaded} cascaded, ${trulyForfeited} truly forfeited, ${errors} errors`);
  return { forfeited, cascaded, trulyForfeited, errors };
}

export function registerAutoMailer(app: Express): void {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    console.warn("[AutoNotifier] DATABASE_URL not set. Auto-notifier disabled.");
    return;
  }

  const db = drizzle(dbUrl);

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

  console.log("[AutoNotifier] Scheduled: 2:30 AM PHT, 11:30 AM PHT (UPL/LATE + GChat)");

  // Schedule: OT Forfeiture check at 11:15 AM PHT = 03:15 UTC daily
  // Runs after the 11 AM PHT attendance lock so yesterday's tags are finalized
  cron.schedule("15 3 * * *", async () => {
    console.log("[OT-Forfeiture] Triggered: 11:15 AM PHT daily forfeiture check");
    try {
      await runOtForfeitureCheck(db);
    } catch (err) {
      console.error("[OT-Forfeiture] Cron error:", err);
    }
  });

  console.log("[AutoNotifier] Scheduled: 11:15 AM PHT (OT Forfeiture Cascade)");

  // Manual trigger for UPL/LATE notifications
  app.post("/api/io/send-notifications", async (req, res) => {
    try {
      const result = await sendUplLateNotifications(db);
      res.json({
        success: true,
        message: `In-app: ${result.sent}, GChat queued: ${result.gchatQueued}, errors: ${result.errors}`,
        ...result,
      });
    } catch (err: any) {
      console.error("[AutoNotifier] Manual trigger error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Manual trigger for OT forfeiture check
  app.post("/api/io/ot-forfeiture-check", async (req, res) => {
    try {
      const result = await runOtForfeitureCheck(db);
      res.json({
        success: true,
        message: `Forfeited: ${result.forfeited}, Cascaded: ${result.cascaded}, Truly forfeited: ${result.trulyForfeited}, Errors: ${result.errors}`,
        ...result,
      });
    } catch (err: any) {
      console.error("[OT-Forfeiture] Manual trigger error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  console.log("[AutoNotifier] Manual triggers: POST /api/io/send-notifications, POST /api/io/ot-forfeiture-check");
}
