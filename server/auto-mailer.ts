/**
 * Auto-Mailer Module (Brevo / Sendinblue)
 * Sends automated email notifications for UPL and LATE attendance tags.
 * 
 * Schedule: 2:30 AM and 11:30 AM Philippine Time (UTC+8) daily.
 * 
 * Email recipients:
 * - TO: The tagged agent (meta_email from io_employees)
 * - CC: Agent's supervisor (supervisor_email from io_employees) + Senior Manager (Polimetla, Ravi Kiran)
 * - BCC: banarvinmaurice@meta.com
 * 
 * From: "Playbook Reporting" <banarvinmaurice@meta.com>
 */

import { Express } from "express";
import cron from "node-cron";
import { drizzle } from "drizzle-orm/mysql2";
import { eq, and, inArray } from "drizzle-orm";
import { ioAttendance, ioEmployees } from "../drizzle/schema";

const SENIOR_MANAGER_EMAIL = "kiranravi@meta.com";
const BCC_EMAIL = "banarvinmaurice@meta.com";
const SENDER_EMAIL = "banarvinmaurice@meta.com";
const SENDER_NAME = "Playbook Reporting";

// Philippine Time is UTC+8
const PHT_OFFSET_HOURS = 8;

function getTodayPHT(): string {
  const now = new Date();
  const pht = new Date(now.getTime() + PHT_OFFSET_HOURS * 60 * 60 * 1000);
  return pht.toISOString().slice(0, 10); // YYYY-MM-DD
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

function buildEmailContent(params: {
  agentName: string;
  tag: string;
  date: string;
  reason: string;
  remarks: string;
}): string {
  const { agentName, tag, date, reason, remarks } = params;
  const readableDate = formatDateReadable(date);
  const tagLabel = tag === "UPL" ? "Unplanned Leave (UPL)" : "Late Attendance (LATE)";

  return `Dear ${agentName},

This is to formally notify you that you have been tagged as ${tagLabel} for ${readableDate}.

Tag: ${tag}
Date: ${readableDate}
Reason: ${reason || "Not specified"}
Remarks: ${remarks || "No additional remarks"}

Please coordinate with your supervisor regarding this matter. If you believe this tagging was made in error, kindly reach out to your immediate supervisor for clarification and resolution.

This is an automated notification from the Playbook Attendance Management System. Please do not reply directly to this email.

Playbook Reporting`;
}

function buildEmailSubject(tag: string, date: string, agentName: string): string {
  const readableDate = formatDateReadable(date);
  const tagLabel = tag === "UPL" ? "Unplanned Leave" : "Late Attendance";
  return `[Playbook] ${tagLabel} Notice — ${agentName} — ${readableDate}`;
}

interface AttendanceRecord {
  id: string;
  ohr_id: string | null;
  log_date: string | null;
  tag: string | null;
  reason: string | null;
  remarks: string | null;
  snap_full_name: string | null;
}

interface EmployeeRecord {
  ohr_id: string;
  full_name: string | null;
  meta_email: string | null;
  supervisor_email: string | null;
}

// Brevo send email via HTTP API
async function brevoSendEmail(params: {
  apiKey: string;
  to: { email: string; name?: string }[];
  cc?: { email: string; name?: string }[];
  bcc?: { email: string; name?: string }[];
  subject: string;
  textContent?: string;
  htmlContent?: string;
  attachment?: { name: string; content: string }[];
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const body: any = {
      sender: { name: SENDER_NAME, email: SENDER_EMAIL },
      to: params.to,
      subject: params.subject,
    };
    if (params.cc && params.cc.length > 0) body.cc = params.cc;
    if (params.bcc && params.bcc.length > 0) body.bcc = params.bcc;
    if (params.htmlContent) body.htmlContent = params.htmlContent;
    if (params.textContent) body.textContent = params.textContent;
    if (params.attachment && params.attachment.length > 0) body.attachment = params.attachment;

    const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": params.apiKey,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await resp.json();
    if (resp.ok) {
      return { success: true, messageId: data.messageId };
    } else {
      return { success: false, error: data.message || JSON.stringify(data) };
    }
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function sendNotifications(db: ReturnType<typeof drizzle>, apiKey: string): Promise<{ sent: number; errors: number }> {
  const today = getTodayPHT();
  console.log(`[AutoMailer] Running notification check for date: ${today}`);

  // Query today's UPL and LATE records
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
    console.log(`[AutoMailer] No UPL/LATE records found for ${today}. No emails to send.`);
    return { sent: 0, errors: 0 };
  }

  console.log(`[AutoMailer] Found ${records.length} UPL/LATE records for ${today}.`);

  // Get unique OHR IDs to look up employee emails
  const ohrIds = Array.from(new Set(records.map((r) => r.ohr_id).filter((x): x is string => x !== null && x !== undefined)));

  const employees = await db
    .select({
      ohr_id: ioEmployees.ohr_id,
      full_name: ioEmployees.full_name,
      meta_email: ioEmployees.meta_email,
      supervisor_email: ioEmployees.supervisor_email,
    })
    .from(ioEmployees)
    .where(inArray(ioEmployees.ohr_id, ohrIds));

  const employeeMap = new Map<string, EmployeeRecord>();
  for (const emp of employees) {
    if (emp.ohr_id) {
      employeeMap.set(emp.ohr_id, emp);
    }
  }

  let sent = 0;
  let errors = 0;

  for (const record of records) {
    const employee = record.ohr_id ? employeeMap.get(record.ohr_id) : null;
    const agentEmail = employee?.meta_email;
    const agentName = record.snap_full_name || employee?.full_name || "Team Member";
    const supervisorEmail = employee?.supervisor_email;

    if (!agentEmail) {
      console.warn(`[AutoMailer] No meta_email found for OHR ${record.ohr_id} (${agentName}). Skipping.`);
      errors++;
      continue;
    }

    const subject = buildEmailSubject(record.tag || "UPL", record.log_date || today, agentName);
    const content = buildEmailContent({
      agentName,
      tag: record.tag || "UPL",
      date: record.log_date || today,
      reason: record.reason || "",
      remarks: record.remarks || "",
    });

    // Build CC list: supervisor + senior manager
    const ccList: { email: string }[] = [];
    if (supervisorEmail) ccList.push({ email: supervisorEmail });
    if (SENIOR_MANAGER_EMAIL && !ccList.some(c => c.email === SENIOR_MANAGER_EMAIL)) {
      ccList.push({ email: SENIOR_MANAGER_EMAIL });
    }

    const result = await brevoSendEmail({
      apiKey,
      to: [{ email: agentEmail, name: agentName }],
      cc: ccList.length > 0 ? ccList : undefined,
      bcc: [{ email: BCC_EMAIL }],
      subject,
      textContent: content,
    });

    if (result.success) {
      console.log(`[AutoMailer] Sent ${record.tag} notification to ${agentEmail} (msgId: ${result.messageId})`);
      sent++;
    } else {
      console.error(`[AutoMailer] Failed to send to ${agentEmail}: ${result.error}`);
      errors++;
    }

    // Small delay between emails to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.log(`[AutoMailer] Completed: ${sent} sent, ${errors} errors.`);
  return { sent, errors };
}

export function registerAutoMailer(app: Express): void {
  const apiKey = process.env.BREVO_API_KEY;
  const dbUrl = process.env.DATABASE_URL;

  if (!apiKey) {
    console.warn("[AutoMailer] BREVO_API_KEY not set. Auto-mailer disabled.");
    return;
  }

  if (!dbUrl) {
    console.warn("[AutoMailer] DATABASE_URL not set. Auto-mailer disabled.");
    return;
  }

  const db = drizzle(dbUrl);

  // Schedule: 2:30 AM PHT = 18:30 UTC (previous day)
  // Schedule: 11:30 AM PHT = 03:30 UTC
  cron.schedule("30 18 * * *", async () => {
    console.log("[AutoMailer] Triggered: 2:30 AM PHT shift check");
    try {
      await sendNotifications(db, apiKey);
    } catch (err) {
      console.error("[AutoMailer] Cron job error (2:30 AM PHT):", err);
    }
  });

  cron.schedule("30 3 * * *", async () => {
    console.log("[AutoMailer] Triggered: 11:30 AM PHT shift check");
    try {
      await sendNotifications(db, apiKey);
    } catch (err) {
      console.error("[AutoMailer] Cron job error (11:30 AM PHT):", err);
    }
  });

  console.log("[AutoMailer] Scheduled: 2:30 AM PHT (18:30 UTC) and 11:30 AM PHT (03:30 UTC)");

  // Manual trigger endpoint
  app.post("/api/io/send-notifications", async (req, res) => {
    try {
      const result = await sendNotifications(db, apiKey);
      res.json({
        success: true,
        message: `Notifications sent: ${result.sent}, errors: ${result.errors}`,
        ...result,
      });
    } catch (err: any) {
      console.error("[AutoMailer] Manual trigger error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Test endpoint to preview what would be sent (no actual emails)
  app.get("/api/io/preview-notifications", async (req, res) => {
    const today = getTodayPHT();
    try {
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

      const ohrIds = Array.from(new Set(records.map((r) => r.ohr_id).filter((x): x is string => x !== null && x !== undefined)));
      let employeeMap = new Map<string, EmployeeRecord>();

      if (ohrIds.length > 0) {
        const employees = await db
          .select({
            ohr_id: ioEmployees.ohr_id,
            full_name: ioEmployees.full_name,
            meta_email: ioEmployees.meta_email,
            supervisor_email: ioEmployees.supervisor_email,
          })
          .from(ioEmployees)
          .where(inArray(ioEmployees.ohr_id, ohrIds));

        for (const emp of employees) {
          if (emp.ohr_id) employeeMap.set(emp.ohr_id, emp);
        }
      }

      const preview = records.map((record) => {
        const employee = record.ohr_id ? employeeMap.get(record.ohr_id) : null;
        return {
          agent: record.snap_full_name || employee?.full_name || "Unknown",
          agentEmail: employee?.meta_email || "N/A",
          supervisorEmail: employee?.supervisor_email || "N/A",
          tag: record.tag,
          date: record.log_date,
          reason: record.reason || "",
          remarks: record.remarks || "",
          subject: buildEmailSubject(record.tag || "UPL", record.log_date || today, record.snap_full_name || employee?.full_name || "Team Member"),
        };
      });

      res.json({
        date: today,
        totalRecords: preview.length,
        records: preview,
      });
    } catch (err: any) {
      console.error("[AutoMailer] Preview error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  console.log("[AutoMailer] Manual trigger: POST /api/io/send-notifications");
  console.log("[AutoMailer] Preview: GET /api/io/preview-notifications");

  // ============================================================
  // Daily Attendance CSV Email
  // Sends current day's attendance as CSV attachment daily
  // Recipients: ge-co-miswfmteam@meta.com, wfm-ctr-php@meta.com, io-teamleadsmla@meta.com
  // Schedule: 11:00 PM PHT = 15:00 UTC
  // ============================================================

  const CSV_RECIPIENTS = [
    "ge-co-miswfmteam@meta.com",
    "wfm-ctr-php@meta.com",
    "io-teamleadsmla@meta.com",
  ];

  async function sendDailyAttendanceCsv(): Promise<void> {
    const today = getTodayPHT();
    console.log(`[AutoMailer-CSV] Generating daily attendance CSV for ${today}`);

    try {
      // Query today's attendance records
      const records = await db
        .select()
        .from(ioAttendance)
        .where(eq(ioAttendance.log_date, today));

      if (records.length === 0) {
        console.log(`[AutoMailer-CSV] No attendance records found for ${today}. Skipping.`);
        return;
      }

      // Build CSV
      const columns = [
        "id", "ohr_id", "log_date", "tag", "billing_code", "upl_reason",
        "remarks", "ot_hours", "snap_full_name", "snap_supervisor",
        "snap_planning_group", "snap_shift_time", "snap_actual_role",
        "snap_billing_name", "snap_status"
      ];

      const escapeCsv = (val: any): string => {
        if (val === null || val === undefined) return "";
        const str = String(val);
        if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      };

      let csv = columns.join(",") + "\n";
      for (const row of records) {
        csv += columns.map(col => escapeCsv((row as any)[col])).join(",") + "\n";
      }

      const readableDate = formatDateReadable(today);
      const subject = `[Playbook] Daily Attendance Report — ${readableDate}`;
      const textContent = `Daily Attendance Report for ${readableDate}\n\nTotal Records: ${records.length}\n\nPlease find the attached CSV file containing today's attendance data.\n\nPlaybook Reporting`;

      // Convert CSV to base64 for Brevo attachment
      const csvBase64 = Buffer.from(csv, 'utf-8').toString('base64');

      const result = await brevoSendEmail({
        apiKey: apiKey!,
        to: CSV_RECIPIENTS.map(email => ({ email })),
        subject,
        textContent,
        attachment: [
          {
            name: `attendance_${today}.csv`,
            content: csvBase64,
          },
        ],
      });

      if (result.success) {
        console.log(`[AutoMailer-CSV] Daily CSV sent to ${CSV_RECIPIENTS.join(', ')} (${records.length} records, msgId: ${result.messageId})`);
      } else {
        console.error(`[AutoMailer-CSV] Failed to send daily CSV: ${result.error}`);
      }
    } catch (err: any) {
      console.error("[AutoMailer-CSV] Error sending daily CSV:", err.message);
    }
  }

  // Schedule: 11:00 PM PHT = 15:00 UTC
  cron.schedule("0 15 * * *", async () => {
    console.log("[AutoMailer-CSV] Triggered: 11:00 PM PHT daily attendance CSV");
    try {
      await sendDailyAttendanceCsv();
    } catch (err) {
      console.error("[AutoMailer-CSV] Cron job error:", err);
    }
  });

  console.log("[AutoMailer-CSV] Scheduled: 11:00 PM PHT (15:00 UTC) daily attendance CSV");

  // Manual trigger for daily CSV
  app.post("/api/io/send-daily-csv", async (req, res) => {
    try {
      await sendDailyAttendanceCsv();
      res.json({ success: true, message: "Daily attendance CSV sent" });
    } catch (err: any) {
      console.error("[AutoMailer-CSV] Manual trigger error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  console.log("[AutoMailer-CSV] Manual trigger: POST /api/io/send-daily-csv");
}
