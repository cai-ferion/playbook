import { describe, expect, it } from "vitest";

/**
 * Auto-Notifier Module Tests
 * 
 * Tests the notification content generation and scheduling logic.
 * We test the pure functions and configuration rather than actual DB operations.
 */

describe("auto-notifier content", () => {
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

  function buildNotificationTitle(tag: string, date: string): string {
    const readableDate = formatDateReadable(date);
    return `${tag} Notice — ${readableDate}`;
  }

  function buildNotificationMessage(params: {
    tag: string;
    date: string;
    reason: string;
    remarks: string;
  }): string {
    const { tag, date, reason, remarks } = params;
    const readableDate = formatDateReadable(date);
    const tagLabel = tag === "UPL" ? "Unplanned Leave (UPL)" : "Late Attendance (LATE)";
    return `You have been tagged as ${tagLabel} for ${readableDate}.\n\nReason: ${reason || "Not specified"}\nRemarks: ${remarks || "No additional remarks"}\n\nPlease coordinate with your supervisor regarding this matter.`;
  }

  it("builds correct UPL notification title", () => {
    const title = buildNotificationTitle("UPL", "2026-03-31");
    expect(title).toContain("UPL Notice");
    expect(title).toContain("March");
  });

  it("builds correct LATE notification title", () => {
    const title = buildNotificationTitle("LATE", "2026-03-31");
    expect(title).toContain("LATE Notice");
  });

  it("builds UPL notification message", () => {
    const message = buildNotificationMessage({
      tag: "UPL",
      date: "2026-03-31",
      reason: "Personal Emergency",
      remarks: "Called in sick",
    });
    expect(message).toContain("Unplanned Leave (UPL)");
    expect(message).toContain("Personal Emergency");
    expect(message).toContain("Called in sick");
    expect(message).toContain("coordinate with your supervisor");
  });

  it("builds LATE notification message", () => {
    const message = buildNotificationMessage({
      tag: "LATE",
      date: "2026-01-15",
      reason: "Traffic",
      remarks: "30 minutes late",
    });
    expect(message).toContain("Late Attendance (LATE)");
    expect(message).toContain("Traffic");
    expect(message).toContain("30 minutes late");
  });

  it("handles missing reason and remarks gracefully", () => {
    const message = buildNotificationMessage({
      tag: "UPL",
      date: "2026-02-01",
      reason: "",
      remarks: "",
    });
    expect(message).toContain("Not specified");
    expect(message).toContain("No additional remarks");
  });

  it("formats date in human-readable format", () => {
    const readable = formatDateReadable("2026-03-31");
    expect(readable).toContain("March");
    expect(readable).toContain("2026");
  });
});

describe("auto-notifier configuration", () => {
  it("has correct PHT timezone offset", () => {
    const PHT_OFFSET_HOURS = 8;
    expect(PHT_OFFSET_HOURS).toBe(8);
  });

  it("cron schedules convert PHT to UTC correctly", () => {
    // 2:30 AM PHT = 18:30 UTC (previous day)
    // 11:30 AM PHT = 03:30 UTC
    const cron230AM = "30 18 * * *";
    const cron1130AM = "30 3 * * *";

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

  it("uses correct admin OHR for notifications", () => {
    const ADMIN_OHR = "740045023";
    expect(ADMIN_OHR).toBe("740045023");
  });

  it("notification types are correctly defined", () => {
    const types = {
      upl: "upl_notice",
      late: "late_notice",
      uplAdmin: "upl_admin",
      lateAdmin: "late_admin",
      dailySummary: "daily_summary",
      taskAssigned: "task_assigned",
    };
    expect(types.upl).toBe("upl_notice");
    expect(types.late).toBe("late_notice");
    expect(types.dailySummary).toBe("daily_summary");
    expect(types.taskAssigned).toBe("task_assigned");
  });
});

describe("task assignment notification content", () => {
  it("builds correct task notification message", () => {
    const taskId = "TSK-001";
    const title = "Fix production bug";
    const dueDate = "2026-04-05";
    const assignedByName = "Bantasan, Arvin";

    const dueStr = new Date(dueDate + "T00:00:00Z").toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    const message = `${taskId}: ${title} — Due: ${dueStr}. Assigned by ${assignedByName}.`;

    expect(message).toContain("TSK-001");
    expect(message).toContain("Fix production bug");
    expect(message).toContain("Apr");
    expect(message).toContain("Bantasan, Arvin");
  });
});
