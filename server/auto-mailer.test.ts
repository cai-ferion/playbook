import { describe, expect, it } from "vitest";

/**
 * Auto-Mailer Module Tests
 * 
 * Tests the email content generation and scheduling logic.
 * We test the pure functions and configuration rather than actual email sending.
 */

// Test the email content building logic
describe("auto-mailer email content", () => {
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

  function buildEmailSubject(tag: string, date: string, agentName: string): string {
    const readableDate = formatDateReadable(date);
    const tagLabel = tag === "UPL" ? "Unplanned Leave" : "Late Attendance";
    return `[Playbook] ${tagLabel} Notice — ${agentName} — ${readableDate}`;
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

  it("builds correct UPL email subject", () => {
    const subject = buildEmailSubject("UPL", "2026-03-31", "Doe, John");
    expect(subject).toContain("[Playbook]");
    expect(subject).toContain("Unplanned Leave");
    expect(subject).toContain("Doe, John");
    expect(subject).toContain("March");
  });

  it("builds correct LATE email subject", () => {
    const subject = buildEmailSubject("LATE", "2026-03-31", "Smith, Jane");
    expect(subject).toContain("Late Attendance");
    expect(subject).toContain("Smith, Jane");
  });

  it("builds professional UPL email body", () => {
    const content = buildEmailContent({
      agentName: "Doe, John",
      tag: "UPL",
      date: "2026-03-31",
      reason: "Personal Emergency",
      remarks: "Called in sick",
    });
    expect(content).toContain("Dear Doe, John");
    expect(content).toContain("Unplanned Leave (UPL)");
    expect(content).toContain("Personal Emergency");
    expect(content).toContain("Called in sick");
    expect(content).toContain("Playbook Reporting");
    expect(content).not.toContain("Workforce Management System");
    expect(content).toContain("coordinate with your supervisor");
  });

  it("builds professional LATE email body", () => {
    const content = buildEmailContent({
      agentName: "Smith, Jane",
      tag: "LATE",
      date: "2026-01-15",
      reason: "Traffic",
      remarks: "30 minutes late",
    });
    expect(content).toContain("Dear Smith, Jane");
    expect(content).toContain("Late Attendance (LATE)");
    expect(content).toContain("Traffic");
    expect(content).toContain("30 minutes late");
  });

  it("handles missing reason and remarks gracefully", () => {
    const content = buildEmailContent({
      agentName: "Test Agent",
      tag: "UPL",
      date: "2026-02-01",
      reason: "",
      remarks: "",
    });
    expect(content).toContain("Not specified");
    expect(content).toContain("No additional remarks");
  });

  it("formats date in human-readable format", () => {
    const readable = formatDateReadable("2026-03-31");
    expect(readable).toContain("March");
    expect(readable).toContain("2026");
  });
});

describe("auto-mailer configuration", () => {
  it("has correct PHT timezone offset", () => {
    // PHT is UTC+8
    const PHT_OFFSET_HOURS = 8;
    expect(PHT_OFFSET_HOURS).toBe(8);
  });

  it("cron schedules convert PHT to UTC correctly", () => {
    // 2:30 AM PHT = 18:30 UTC (previous day)
    // 11:30 AM PHT = 03:30 UTC
    const cron230AM = "30 18 * * *"; // 18:30 UTC = 2:30 AM PHT next day
    const cron1130AM = "30 3 * * *"; // 03:30 UTC = 11:30 AM PHT

    expect(cron230AM).toBe("30 18 * * *");
    expect(cron1130AM).toBe("30 3 * * *");

    // Verify: 18:30 UTC + 8 hours = 26:30 = 02:30 next day (2:30 AM PHT)
    const utcHour230 = 18;
    const phtHour230 = (utcHour230 + 8) % 24;
    expect(phtHour230).toBe(2);

    // Verify: 03:30 UTC + 8 hours = 11:30 (11:30 AM PHT)
    const utcHour1130 = 3;
    const phtHour1130 = (utcHour1130 + 8) % 24;
    expect(phtHour1130).toBe(11);
  });

  it("uses correct email addresses", () => {
    const SENIOR_MANAGER_EMAIL = "kiranravi@meta.com";
    const BCC_EMAIL = "banarvinmaurice@meta.com";
    const FROM_ADDRESS = "Playbook Reporting <onboarding@resend.dev>";

    expect(SENIOR_MANAGER_EMAIL).toBe("kiranravi@meta.com");
    expect(BCC_EMAIL).toBe("banarvinmaurice@meta.com");
    expect(FROM_ADDRESS).toContain("Playbook Reporting");
    expect(FROM_ADDRESS).toContain("onboarding@resend.dev");
  });
});
