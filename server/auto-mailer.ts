/**
 * Auto-Notifier Module
 * Creates in-app notifications for UPL/LATE attendance tags and daily summaries.
 * 
 * Schedule: 2:30 AM and 11:30 AM Philippine Time (UTC+8) daily for UPL/LATE.
 * Schedule: 11:00 PM PHT daily for attendance summary.
 */

import { Express } from "express";
import cron from "node-cron";
import { drizzle } from "drizzle-orm/mysql2";
import { eq, and, inArray, sql } from "drizzle-orm";
import { ioAttendance, ioEmployees, ioNotifications } from "../drizzle/schema";

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

  let sent = 0;
  let errors = 0;

  for (const record of records) {
    try {
      const employee = record.ohr_id ? employeeMap.get(record.ohr_id) : null;
      const agentName = record.snap_full_name || employee?.full_name || "Team Member";
      const readableDate = formatDateReadable(record.log_date || today);
      const tagLabel = record.tag === "UPL" ? "Unplanned Leave (UPL)" : "Late Attendance (LATE)";

      // Notification for the tagged employee
      await createNotification(db, {
        type: record.tag === "UPL" ? "upl_notice" : "late_notice",
        title: `${record.tag} Notice — ${readableDate}`,
        message: `You have been tagged as ${tagLabel} for ${readableDate}.\n\nReason: ${record.reason || "Not specified"}\nRemarks: ${record.remarks || "No additional remarks"}\n\nPlease coordinate with your supervisor regarding this matter.`,
        actor_name: "Playbook System",
        target_ohr: record.ohr_id || undefined,
        metadata: JSON.stringify({ attendance_id: record.id, tag: record.tag, date: record.log_date }),
      });

      // Also notify admin
      await createNotification(db, {
        type: record.tag === "UPL" ? "upl_admin" : "late_admin",
        title: `${record.tag}: ${agentName} — ${readableDate}`,
        message: `${agentName} has been tagged as ${tagLabel} for ${readableDate}.\n\nReason: ${record.reason || "Not specified"}\nRemarks: ${record.remarks || "No additional remarks"}`,
        actor_name: "Playbook System",
        target_ohr: ADMIN_OHR,
        metadata: JSON.stringify({ attendance_id: record.id, tag: record.tag, date: record.log_date, agent_ohr: record.ohr_id }),
      });

      sent++;
    } catch (err: any) {
      console.error(`[AutoNotifier] Error creating notification for OHR ${record.ohr_id}: ${err.message}`);
      errors++;
    }
  }

  console.log(`[AutoNotifier] Completed: ${sent} notifications created, ${errors} errors.`);
  return { sent, errors };
}

async function sendDailySummaryNotification(db: ReturnType<typeof drizzle>): Promise<void> {
  const today = getTodayPHT();
  console.log(`[AutoNotifier] Generating daily attendance summary for ${today}`);

  try {
    const records = await db
      .select()
      .from(ioAttendance)
      .where(eq(ioAttendance.log_date, today));

    const readableDate = formatDateReadable(today);

    if (records.length === 0) {
      await createNotification(db, {
        type: "daily_summary",
        title: `Daily Attendance Summary — ${readableDate}`,
        message: `No attendance records found for ${readableDate}.`,
        actor_name: "Playbook System",
        target_ohr: ADMIN_OHR,
      });
      return;
    }

    // Build summary stats
    const tagCounts: Record<string, number> = {};
    for (const r of records) {
      const tag = (r as any).tag || "Unknown";
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }

    const breakdown = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => `${tag}: ${count}`)
      .join("\n");

    await createNotification(db, {
      type: "daily_summary",
      title: `Daily Attendance Summary — ${readableDate}`,
      message: `Total Records: ${records.length}\n\nBreakdown:\n${breakdown}`,
      actor_name: "Playbook System",
      target_ohr: ADMIN_OHR,
      metadata: JSON.stringify({ date: today, total: records.length, breakdown: tagCounts }),
    });

    console.log(`[AutoNotifier] Daily summary notification created (${records.length} records)`);
  } catch (err: any) {
    console.error("[AutoNotifier] Error creating daily summary:", err.message);
  }
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

  // Schedule: 11:00 PM PHT = 15:00 UTC — daily summary
  cron.schedule("0 15 * * *", async () => {
    console.log("[AutoNotifier] Triggered: 11:00 PM PHT daily summary");
    try {
      await sendDailySummaryNotification(db);
    } catch (err) {
      console.error("[AutoNotifier] Cron error (daily summary):", err);
    }
  });

  console.log("[AutoNotifier] Scheduled: 2:30 AM PHT, 11:30 AM PHT (UPL/LATE), 11:00 PM PHT (daily summary)");

  // Manual trigger for UPL/LATE notifications
  app.post("/api/io/send-notifications", async (req, res) => {
    try {
      const result = await sendUplLateNotifications(db);
      res.json({
        success: true,
        message: `Notifications created: ${result.sent}, errors: ${result.errors}`,
        ...result,
      });
    } catch (err: any) {
      console.error("[AutoNotifier] Manual trigger error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Manual trigger for daily summary
  app.post("/api/io/send-daily-summary", async (req, res) => {
    try {
      await sendDailySummaryNotification(db);
      res.json({ success: true, message: "Daily summary notification created" });
    } catch (err: any) {
      console.error("[AutoNotifier] Daily summary trigger error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  console.log("[AutoNotifier] Manual triggers: POST /api/io/send-notifications, POST /api/io/send-daily-summary");
}
