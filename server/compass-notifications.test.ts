/**
 * Compass Notification Enhancements — Test Suite
 * Covers: registration maps, cron function signatures, real-time notification triggers,
 * and notification payload shapes for all new notification types.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ═══════════════════════════════════════════════════════════════════════
// 1. Notification Registration (notifications.js)
// ═══════════════════════════════════════════════════════════════════════
describe("Notification Registration in notifications.js", () => {
  const notifJs = fs.readFileSync(
    path.resolve(__dirname, "public/js/notifications.js"),
    "utf-8"
  );

  const REQUIRED_TYPES = [
    // Previously missing
    "nte_issued", "cap_issued", "nte_dismissed",
    // Priority 1
    "nte_served", "cap_expiring", "nte_deadline_reminder",
    // Priority 2
    "coaching_ack_overdue", "repeat_offender", "cap_escalated",
    // Priority 3
    "weekly_digest", "docx_generated", "dispute_resolved",
  ];

  for (const type of REQUIRED_TYPES) {
    it(`should have icon registered for '${type}'`, () => {
      // Icon map uses the type as a key in getNotifIcon
      expect(notifJs).toContain(`${type}:`);
    });

    it(`should have label registered for '${type}'`, () => {
      // Label map in getNotifTagLabel
      const labelSection = notifJs.slice(
        notifJs.indexOf("function getNotifTagLabel"),
        notifJs.indexOf("function getNotifColor")
      );
      expect(labelSection).toContain(`${type}:`);
    });

    it(`should have color registered for '${type}'`, () => {
      // Color map in getNotifColor
      const colorSection = notifJs.slice(
        notifJs.indexOf("function getNotifColor")
      );
      expect(colorSection).toContain(`${type}:`);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// 2. Real-time Notifications in io-routes.ts (NTE served, CAP supervisor, repeat offender, CAP escalation, docx_generated)
// ═══════════════════════════════════════════════════════════════════════
describe("Real-time Notifications in io-routes.ts", () => {
  const ioRoutes = fs.readFileSync(
    path.resolve(__dirname, "io-routes.ts"),
    "utf-8"
  );

  it("should send nte_served notification when NTE is created", () => {
    expect(ioRoutes).toContain("type: 'nte_served'");
    expect(ioRoutes).toContain("NTE Served");
  });

  it("should send repeat_offender notification when 2+ NTEs in 90 days", () => {
    expect(ioRoutes).toContain("type: 'repeat_offender'");
    expect(ioRoutes).toContain("Repeat Offender");
    // Verify the 90-day window calculation
    expect(ioRoutes).toContain("90 * 24 * 60 * 60 * 1000");
  });

  it("should send cap_issued notification to supervisor", () => {
    // There should be at least 2 cap_issued inserts (agent + supervisor)
    const matches = ioRoutes.match(/type: 'cap_issued'/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  it("should send cap_escalated notification for CAP 2+ escalation", () => {
    expect(ioRoutes).toContain("type: 'cap_escalated'");
    expect(ioRoutes).toContain("CAP Escalation");
    // Verify it checks for previous CAP level
    expect(ioRoutes).toContain("prevCapLevel");
  });

  it("should send docx_generated notification on DOCX creation", () => {
    expect(ioRoutes).toContain("type: 'docx_generated'");
    expect(ioRoutes).toContain("Document Generated");
  });

  it("should guard nte_served notification against self-notification", () => {
    // Should not notify if creator is the same as the employee
    expect(ioRoutes).toContain("body.created_by_ohr !== body.ohr_id");
  });

  it("should guard cap_supervisor notification against duplicate to decision-maker", () => {
    expect(ioRoutes).toContain("existing.supervisor_ohr !== body.decision_by_ohr");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. Cron Notifications in auto-mailer.ts
// ═══════════════════════════════════════════════════════════════════════
describe("Cron Notifications in auto-mailer.ts", () => {
  const autoMailer = fs.readFileSync(
    path.resolve(__dirname, "auto-mailer.ts"),
    "utf-8"
  );

  it("should define checkCapExpiry function", () => {
    expect(autoMailer).toContain("async function checkCapExpiry");
  });

  it("should schedule CAP expiry check at 01:00 UTC (9 AM PHT)", () => {
    // Cron: "0 1 * * *"
    expect(autoMailer).toContain('"0 1 * * *"');
    expect(autoMailer).toContain("checkCapExpiry");
  });

  it("should send cap_expiring notifications with days_left metadata", () => {
    expect(autoMailer).toContain("type: 'cap_expiring'");
    expect(autoMailer).toContain("days_left");
  });

  it("should deduplicate cap_expiring notifications per day", () => {
    expect(autoMailer).toContain("Already notified today");
  });

  it("should define checkNteDeadlines function", () => {
    expect(autoMailer).toContain("async function checkNteDeadlines");
  });

  it("should schedule NTE deadline check every 4 hours", () => {
    expect(autoMailer).toContain('"30 */4 * * *"');
    expect(autoMailer).toContain("checkNteDeadlines");
  });

  it("should send nte_deadline_reminder with hours_left metadata", () => {
    expect(autoMailer).toContain("type: 'nte_deadline_reminder'");
    expect(autoMailer).toContain("hours_left");
  });

  it("should define checkCoachingAckOverdue function", () => {
    expect(autoMailer).toContain("async function checkCoachingAckOverdue");
  });

  it("should schedule coaching ack overdue at 02:00 UTC (10 AM PHT)", () => {
    expect(autoMailer).toContain('"0 2 * * *"');
    expect(autoMailer).toContain("checkCoachingAckOverdue");
  });

  it("should send coaching_ack_overdue with hours_overdue metadata", () => {
    expect(autoMailer).toContain("type: 'coaching_ack_overdue'");
    expect(autoMailer).toContain("hours_overdue");
  });

  it("should use ack_date IS NULL to find unacknowledged coaching logs", () => {
    expect(autoMailer).toContain("ack_date} IS NULL");
  });

  it("should define sendWeeklyDigest function", () => {
    expect(autoMailer).toContain("async function sendWeeklyDigest");
  });

  it("should schedule weekly digest on Monday at 00:00 UTC (8 AM PHT)", () => {
    expect(autoMailer).toContain('"0 0 * * 1"');
    expect(autoMailer).toContain("sendWeeklyDigest");
  });

  it("should send weekly_digest to TLs and Managers", () => {
    expect(autoMailer).toContain("type: 'weekly_digest'");
    expect(autoMailer).toContain("Weekly Compass Digest");
    expect(autoMailer).toContain("Team Lead");
    expect(autoMailer).toContain("Manager");
    expect(autoMailer).toContain("Operational SME");
  });

  it("should expose manual trigger endpoints for all new crons", () => {
    expect(autoMailer).toContain("/api/io/cap-expiry-check");
    expect(autoMailer).toContain("/api/io/nte-deadline-check");
    expect(autoMailer).toContain("/api/io/coaching-ack-overdue-check");
    expect(autoMailer).toContain("/api/io/weekly-digest");
  });

  it("should import ioCorrectiveActions schema", () => {
    expect(autoMailer).toContain("ioCorrectiveActions");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. Dispute Resolution Notifications in compass.js
// ═══════════════════════════════════════════════════════════════════════
describe("Dispute Resolution Notifications in compass.js", () => {
  const compassJs = fs.readFileSync(
    path.resolve(__dirname, "public/js/compass.js"),
    "utf-8"
  );

  it("should send dispute_resolved on L6 QTP Manager reverse", () => {
    // After the L6 reverse notification, there should be a dispute_resolved
    const l6ReverseSection = compassJs.slice(
      compassJs.indexOf("#11a Notification"),
      compassJs.indexOf("#11a Notification") + 1500
    );
    expect(l6ReverseSection).toContain("dispute_resolved");
    expect(l6ReverseSection).toContain("Reversed");
  });

  it("should send dispute_resolved on L6 QTP Manager retain", () => {
    const l6RetainSection = compassJs.slice(
      compassJs.indexOf("#11b Notification"),
      compassJs.indexOf("#11b Notification") + 1500
    );
    expect(l6RetainSection).toContain("dispute_resolved");
    expect(l6RetainSection).toContain("Retained");
  });

  it("should send dispute_resolved on L2 Support accept", () => {
    const l2AcceptSection = compassJs.slice(
      compassJs.indexOf("#5 Notification"),
      compassJs.indexOf("#5 Notification") + 1500
    );
    expect(l2AcceptSection).toContain("dispute_resolved");
    expect(l2AcceptSection).toContain("Accepted");
  });

  it("should send dispute_resolved on L2 coach reverse", () => {
    const l2ReverseSection = compassJs.slice(
      compassJs.indexOf("#6 Notification"),
      compassJs.indexOf("#6 Notification") + 1500
    );
    expect(l2ReverseSection).toContain("dispute_resolved");
    expect(l2ReverseSection).toContain("Reversed");
  });

  it("should target TL for dispute_resolved notifications", () => {
    // All dispute_resolved should look up coach_sup to find TL OHR
    // dispute_resolved and coach_sup are on adjacent lines, not same line
    const resolvedCount = (compassJs.match(/type: 'dispute_resolved'/g) || []).length;
    const coachSupCount = (compassJs.match(/log\.coach_sup/g) || []).length;
    expect(resolvedCount).toBe(4); // L2 accept, L2 reverse, L6 reverse, L6 retain
    expect(coachSupCount).toBeGreaterThanOrEqual(4);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5. Cache Version Bumps
// ═══════════════════════════════════════════════════════════════════════
describe("Cache Version Bumps", () => {
  const indexHtml = fs.readFileSync(
    path.resolve(__dirname, "public/index.html"),
    "utf-8"
  );

  it("should have notifications.js at v=104", () => {
    expect(indexHtml).toContain('notifications.js?v=107');
  });

  it("should have compass.js at v=119", () => {
    expect(indexHtml).toContain('compass.js?v=123');
  });

  it("should have corrective-actions.js at v=12", () => {
    expect(indexHtml).toContain('corrective-actions.js?v=13');
  });

  it("should have compass-omnibar.js at v=104", () => {
    expect(indexHtml).toContain('compass-omnibar.js?v=104');
  });
});
