/**
 * Auto-Notifier Module
 * Creates in-app notifications AND queues GChat rich cards for UPL/LATE attendance tags.
 * 
 * Schedule: 2:30 AM and 11:30 AM Philippine Time (UTC+8) daily for UPL/LATE.
 */

import { Express } from "express";
import cron from "node-cron";
import { drizzle } from "drizzle-orm/mysql2";
import { eq, and, inArray, sql } from "drizzle-orm";
import { ioAttendance, ioEmployees, ioNotifications, ioGchatQueue } from "../drizzle/schema";

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

  console.log("[AutoNotifier] Manual triggers: POST /api/io/send-notifications");
}
