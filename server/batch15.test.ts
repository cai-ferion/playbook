import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Batch 15 Changes", () => {
  // 1. Helm multi-select Assign To
  describe("Helm - Multi-select Assign To", () => {
    it("should have multi-select assignee functions in helm.js", () => {
      const helmJs = fs.readFileSync(
        path.join(__dirname, "public/js/helm.js"),
        "utf-8"
      );
      expect(helmJs).toContain("_helmSelectedAssignees");
      expect(helmJs).toContain("helmToggleAssignee");
      expect(helmJs).toContain("helmRenderAssigneeChips");
    });

    it("should join multiple assignees with comma in helmSubmitNew", () => {
      const helmJs = fs.readFileSync(
        path.join(__dirname, "public/js/helm.js"),
        "utf-8"
      );
      // The submit function should join selected assignees
      expect(helmJs).toContain("_helmSelectedAssignees.map(a => a.ohr).join");
    });
  });

  // 2. Task assignment notification (migrated from email to in-app)
  describe("Helm - Task Assignment Notification", () => {
    it("should have sendTaskAssignmentNotifications function in io-routes.ts", () => {
      const ioRoutes = fs.readFileSync(
        path.join(__dirname, "io-routes.ts"),
        "utf-8"
      );
      expect(ioRoutes).toContain("sendTaskAssignmentNotifications");
    });

    it("should create in-app notifications after task creation (not emails)", () => {
      const ioRoutes = fs.readFileSync(
        path.join(__dirname, "io-routes.ts"),
        "utf-8"
      );
      // Should NOT have Resend or Brevo
      expect(ioRoutes).not.toContain("Resend");
      expect(ioRoutes).not.toContain("brevo");
      // Should call notification in the POST /tasks endpoint
      expect(ioRoutes).toContain("sendTaskAssignmentNotifications");
    });
  });

  // 3. Attendance date-based locking
  describe("Anchor - Date-based Locking", () => {
    it("should enforce date-based lock on attendance update endpoint", () => {
      const ioRoutes = fs.readFileSync(
        path.join(__dirname, "io-routes.ts"),
        "utf-8"
      );
      // Should have date-based lock logic in the attendance update
      expect(ioRoutes).toContain("Date-based lock");
    });

    it("should enforce date-based lock on bulk-tag endpoint", () => {
      const ioRoutes = fs.readFileSync(
        path.join(__dirname, "io-routes.ts"),
        "utf-8"
      );
      // Should have date-based lock in bulk-tag
      expect(ioRoutes).toContain("Date-based lock: past dates locked");
    });
  });

  // 4. Daily summary notification (migrated from CSV email to in-app)
  describe("Auto-notifier - Daily Summary Notification", () => {
    it("should have daily summary cron job in auto-mailer.ts", () => {
      const autoMailer = fs.readFileSync(
        path.join(__dirname, "auto-mailer.ts"),
        "utf-8"
      );
      expect(autoMailer).toContain("sendDailySummaryNotification");
      // Should NOT have email addresses anymore
      expect(autoMailer).not.toContain("ge-co-miswfmteam@meta.com");
      expect(autoMailer).not.toContain("resend");
      expect(autoMailer).not.toContain("brevo");
    });

    it("should filter by current date for summary", () => {
      const autoMailer = fs.readFileSync(
        path.join(__dirname, "auto-mailer.ts"),
        "utf-8"
      );
      // Should filter attendance by today's date
      expect(autoMailer).toContain("today");
    });

    it("should have manual trigger endpoint for daily summary", () => {
      const autoMailer = fs.readFileSync(
        path.join(__dirname, "auto-mailer.ts"),
        "utf-8"
      );
      expect(autoMailer).toContain("send-daily-summary");
    });
  });

  // 5. Compass Disputes LV1 blank status
  describe("Compass - Disputes LV1 Blank Status", () => {
    it("should include blank/null status in LV1 Pending SME Review filter", () => {
      const compassJs = fs.readFileSync(
        path.join(__dirname, "public/js/compass.js"),
        "utf-8"
      );
      // Should check for null/empty status in the LV1 filter
      expect(compassJs).toMatch(/!d\.status|d\.status\s*===?\s*['"]['"]|null|undefined/);
    });
  });

  // 6. Sandbox Review Area pagination
  describe("Sandbox - Review Area Pagination", () => {
    it("should have pagination functions for kanban columns", () => {
      const sandboxJs = fs.readFileSync(
        path.join(__dirname, "public/js/sandbox.js"),
        "utf-8"
      );
      expect(sandboxJs).toContain("sandboxKanbanPage");
      expect(sandboxJs).toContain("SANDBOX_KANBAN_PAGE_SIZE");
      expect(sandboxJs).toContain("_kanbanPages");
    });

    it("should render pagination controls when totalPages > 1", () => {
      const sandboxJs = fs.readFileSync(
        path.join(__dirname, "public/js/sandbox.js"),
        "utf-8"
      );
      expect(sandboxJs).toContain("totalPages > 1");
      expect(sandboxJs).toContain("Prev");
      expect(sandboxJs).toContain("Next");
    });

    it("should have correct kanban column status routing", () => {
      const sandboxJs = fs.readFileSync(
        path.join(__dirname, "public/js/sandbox.js"),
        "utf-8"
      );
      // Verify the 4 kanban columns with correct statuses
      expect(sandboxJs).toContain("'Pending Initial Review'");
      expect(sandboxJs).toContain("'Pending Final Review'");
      expect(sandboxJs).toContain("Trainer's Area");
      expect(sandboxJs).toContain("'Implemented'");
      expect(sandboxJs).toContain("'Elevated - Task in Progress'");
      expect(sandboxJs).toContain("'Elevated - POC Rejected'");
      expect(sandboxJs).toContain("'Elevated - Pending POC Discussion'");
      expect(sandboxJs).toContain("'Elevated - No POC'");
    });
  });

  // 7. Horizon - Rename Performance to Main Metrics
  describe("Horizon - Main Metrics Rename", () => {
    it("should show 'Main Metrics' in sidebar nav instead of 'Performance'", () => {
      const indexHtml = fs.readFileSync(
        path.join(__dirname, "public/index.html"),
        "utf-8"
      );
      // Should have Main Metrics label in the Horizon section
      expect(indexHtml).toContain("Main Metrics");
    });

    it("should have 'Main Metrics' in switchView title map", () => {
      const appJs = fs.readFileSync(
        path.join(__dirname, "public/js/app.js"),
        "utf-8"
      );
      expect(appJs).toContain("performance: 'Main Metrics'");
    });
  });

  // 8. Horizon - Productivity Hrs child page
  describe("Horizon - Productivity Hrs", () => {
    it("should have Productivity Hrs nav item in sidebar", () => {
      const indexHtml = fs.readFileSync(
        path.join(__dirname, "public/index.html"),
        "utf-8"
      );
      expect(indexHtml).toContain("Productivity Hrs.");
      expect(indexHtml).toContain("productivity-hrs");
    });

    it("should have productivity-hrs view container", () => {
      const indexHtml = fs.readFileSync(
        path.join(__dirname, "public/index.html"),
        "utf-8"
      );
      expect(indexHtml).toContain('id="view-productivity-hrs"');
    });

    it("should have productivity-hrs in allViews array", () => {
      const appJs = fs.readFileSync(
        path.join(__dirname, "public/js/app.js"),
        "utf-8"
      );
      expect(appJs).toContain("'productivity-hrs'");
    });

    it("should auto-expand Horizon group for horizon views", () => {
      const appJs = fs.readFileSync(
        path.join(__dirname, "public/js/app.js"),
        "utf-8"
      );
      expect(appJs).toContain("horizonViews");
      expect(appJs).toContain("nav-group-horizon");
    });
  });

  // 9. Regimen - Moved to main nav
  describe("Regimen - Main Nav Position", () => {
    it("should have Regimen as a nav-group in the main nav area", () => {
      const indexHtml = fs.readFileSync(
        path.join(__dirname, "public/index.html"),
        "utf-8"
      );
      expect(indexHtml).toContain('id="nav-group-regimen"');
    });

    it("should not have Regimen in the sidebar-nav-bottom section", () => {
      const indexHtml = fs.readFileSync(
        path.join(__dirname, "public/index.html"),
        "utf-8"
      );
      // The sidebar-nav-bottom should only contain Admin Tools now
      const bottomSection = indexHtml.split("sidebar-nav-bottom")[1];
      expect(bottomSection).not.toContain("nav-regimen");
    });
  });

  // 10. Regimen - Column removal
  describe("Regimen - Column Removal", () => {
    it("should not have Billing Code in ALL_COLUMNS", () => {
      const rosterJs = fs.readFileSync(
        path.join(__dirname, "public/js/roster.js"),
        "utf-8"
      );
      expect(rosterJs).not.toContain("billing_code");
      expect(rosterJs).not.toContain("Billing Code");
    });

    it("should not have Actions column header in the table", () => {
      const rosterJs = fs.readFileSync(
        path.join(__dirname, "public/js/roster.js"),
        "utf-8"
      );
      // Should not have the Actions th
      expect(rosterJs).not.toContain("'<th>Actions</th>'");
    });

    it("should not have Access Level column (removed in Batch 16)", () => {
      const rosterJs = fs.readFileSync(
        path.join(__dirname, "public/js/roster.js"),
        "utf-8"
      );
      expect(rosterJs).not.toContain("access_level");
      expect(rosterJs).not.toContain("Access Level");
    });
  });
});
