/**
 * Bulk Field Change & Inline Supervisor Tests
 * Validates: backend endpoint, permission gating, frontend UI elements, inline expansion fields
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
const ROOT = join(__dirname, "..");
const attendanceTs = readFileSync(join(__dirname, "io/attendance.ts"), "utf-8");
const inputCompactJs = readFileSync(join(ROOT, "server/public/js/input-compact.js"), "utf-8");
const indexHtml = readFileSync(join(ROOT, "server/public/index.html"), "utf-8");
const inputRedesignCss = readFileSync(join(ROOT, "server/public/css/input-redesign.css"), "utf-8");
const dataJs = readFileSync(join(ROOT, "server/public/js/data.js"), "utf-8");
const appJs = readFileSync(join(ROOT, "server/public/js/app.js"), "utf-8");

// ============================================================
// Backend: POST /attendance/bulk-field-filtered endpoint
// ============================================================
describe("Backend — bulk-field-filtered endpoint", () => {
  it("defines POST /attendance/bulk-field-filtered route", () => {
    expect(attendanceTs).toContain('router.post("/attendance/bulk-field-filtered"');
  });

  it("requires field and value in request body", () => {
    const section = attendanceTs.slice(
      attendanceTs.indexOf('router.post("/attendance/bulk-field-filtered"'),
      attendanceTs.indexOf('router.post("/attendance/bulk-field-filtered"') + 3000
    );
    expect(section).toContain("field");
    expect(section).toContain("value");
    expect(section).toContain("filters");
  });

  it("enforces Manager/Admin role gate", () => {
    const section = attendanceTs.slice(
      attendanceTs.indexOf('router.post("/attendance/bulk-field-filtered"'),
      attendanceTs.indexOf('router.post("/attendance/bulk-field-filtered"') + 2000
    );
    expect(section).toContain("ADMIN_OHRS.includes(actor_ohr)");
    expect(section).toContain('actor.role !== "Manager"');
    expect(section).toContain("Only Managers and Admins can bulk-edit fields");
  });

  it("validates field against ALLOWED_FIELDS whitelist", () => {
    const section = attendanceTs.slice(
      attendanceTs.indexOf('router.post("/attendance/bulk-field-filtered"'),
      attendanceTs.indexOf('router.post("/attendance/bulk-field-filtered"') + 2000
    );
    expect(section).toContain("ALLOWED_FIELDS");
    expect(section).toContain("Invalid field");
  });

  it("ALLOWED_FIELDS includes only the 5 permitted fields", () => {
    const section = attendanceTs.slice(
      attendanceTs.indexOf("const ALLOWED_FIELDS"),
      attendanceTs.indexOf("const ALLOWED_FIELDS") + 600
    );
    expect(section).toContain("snap_supervisor");
    expect(section).toContain("role");
    expect(section).toContain("planning_group");
    expect(section).toContain("snap_shift_time");
    expect(section).toContain("snap_status");
    // These fields were removed from bulk field change
    expect(section).not.toContain("remarks");
    expect(section).not.toContain("ot_hours");
    expect(section).not.toContain("upl_reason");
  });

  it("writes to ioAuditLog for each change", () => {
    const section = attendanceTs.slice(
      attendanceTs.indexOf('router.post("/attendance/bulk-field-filtered"'),
      attendanceTs.indexOf('router.post("/attendance/bulk-field-filtered"') + 6000
    );
    expect(section).toContain("ioAuditLog");
    expect(section).toContain("bulk_field_change");
    expect(section).toContain("record_type");
    expect(section).toContain("actor_ohr");
  });

  it("returns ok, updated, and skipped counts", () => {
    const section = attendanceTs.slice(
      attendanceTs.indexOf('router.post("/attendance/bulk-field-filtered"'),
      attendanceTs.indexOf('router.post("/attendance/bulk-field-filtered"') + 6000
    );
    expect(section).toContain("ok: true");
    expect(section).toContain("updated");
    expect(section).toContain("skipped");
  });

  it("supports date range filters (log_date_gte, log_date_lte)", () => {
    const section = attendanceTs.slice(
      attendanceTs.indexOf('router.post("/attendance/bulk-field-filtered"'),
      attendanceTs.indexOf('router.post("/attendance/bulk-field-filtered"') + 3000
    );
    expect(section).toContain("log_date_gte");
    expect(section).toContain("log_date_lte");
  });
});

// ============================================================
// Frontend: Bulk Field Change UI in FCB
// ============================================================
describe("Frontend — Bulk Field Change UI", () => {
  it("has fcb-field-select dropdown in index.html", () => {
    expect(indexHtml).toContain('id="fcb-field-select"');
  });

  it("has fcb-field-value input in index.html", () => {
    expect(indexHtml).toContain('id="fcb-field-value"');
  });

  it("has fcb-apply-field-btn button in index.html", () => {
    expect(indexHtml).toContain('id="fcb-apply-field-btn"');
  });

  it("field dropdown includes only the 5 permitted fields", () => {
    expect(indexHtml).toContain('value="snap_supervisor"');
    expect(indexHtml).toContain('value="role"');
    expect(indexHtml).toContain('value="planning_group"');
    expect(indexHtml).toContain('value="snap_shift_time"');
    expect(indexHtml).toContain('value="snap_status"');
    // These fields were removed from the dropdown
    expect(indexHtml).not.toContain('value="remarks"');
    expect(indexHtml).not.toContain('value="ot_hours"');
    expect(indexHtml).not.toContain('value="upl_reason"');
  });

  it("all bulk field elements have fcb-status-only class (admin/manager only)", () => {
    // Field select
    const fieldSelectLine = indexHtml.slice(
      indexHtml.indexOf('id="fcb-field-select"') - 100,
      indexHtml.indexOf('id="fcb-field-select"') + 30
    );
    expect(fieldSelectLine).toContain("fcb-status-only");
    // Field value input
    const fieldValueLine = indexHtml.slice(
      indexHtml.indexOf('id="fcb-field-value"') - 100,
      indexHtml.indexOf('id="fcb-field-value"') + 30
    );
    expect(fieldValueLine).toContain("fcb-status-only");
    // Apply button
    const applyBtnLine = indexHtml.slice(
      indexHtml.indexOf('id="fcb-apply-field-btn"') - 100,
      indexHtml.indexOf('id="fcb-apply-field-btn"') + 30
    );
    expect(applyBtnLine).toContain("fcb-status-only");
  });

  it("fcbApplyField function is defined in input-compact.js", () => {
    expect(inputCompactJs).toContain("window.fcbApplyField");
  });

  it("fcbApplyField sends POST to /attendance/bulk-field-filtered", () => {
    expect(inputCompactJs).toContain("/attendance/bulk-field-filtered");
  });

  it("fcbApplyField passes field, value, actor_ohr, actor_name, and filters", () => {
    const section = inputCompactJs.slice(
      inputCompactJs.indexOf("window.fcbApplyField"),
      inputCompactJs.indexOf("window.fcbApplyField") + 3000
    );
    expect(section).toContain("field:");
    expect(section).toContain("value:");
    expect(section).toContain("actor_ohr:");
    expect(section).toContain("actor_name:");
    expect(section).toContain("filters:");
  });

  it("fcbApplyField shows confirmation dialog before applying", () => {
    const section = inputCompactJs.slice(
      inputCompactJs.indexOf("window.fcbApplyField"),
      inputCompactJs.indexOf("window.fcbApplyField") + 1500
    );
    expect(section).toContain("confirmation");
  });
});

// ============================================================
// Frontend: Inline Expansion — Supervisor Field
// ============================================================
describe("Frontend — Inline Expansion Supervisor Field", () => {
  it("renderDetailPanel includes supervisor label", () => {
    expect(inputCompactJs).toContain("Supervisor");
  });

  it("renders supervisor as editable input for admin/manager", () => {
    // The detail panel should have a text input with data-key='flm' for admin/manager
    const idx = inputCompactJs.indexOf("function renderDetailPanel");
    const section = inputCompactJs.slice(idx, idx + 18000);
    expect(section).toContain('data-key="flm"');
  });

  it("renders supervisor as read-only for non-admin/non-manager", () => {
    const idx = inputCompactJs.indexOf("function renderDetailPanel");
    const section = inputCompactJs.slice(idx, idx + 18000);
    // Should have an else branch showing read-only span
    expect(section).toContain("escapeHtml(r.flm");
  });

  it("supervisor-datalist element exists in index.html", () => {
    expect(indexHtml).toContain('id="supervisor-datalist"');
  });

  it("supervisor datalist is populated from flmList in app.js", () => {
    expect(appJs).toContain("supervisor-datalist");
  });
});

// ============================================================
// Frontend: Inline Expansion — Shift Time Field
// ============================================================
describe("Frontend — Inline Expansion Shift Time Field", () => {
  it("renderDetailPanel includes shift time field", () => {
    const idx = inputCompactJs.indexOf("function renderDetailPanel");
    const section = inputCompactJs.slice(idx, idx + 18000);
    expect(section).toContain("Shift Time");
    expect(section).toContain('data-key="shiftTime"');
  });

  it("shift time is a select with GY Shift and Mid-Shift options", () => {
    const idx = inputCompactJs.indexOf("function renderDetailPanel");
    const section = inputCompactJs.slice(idx, idx + 18000);
    expect(section).toContain("GY Shift");
    expect(section).toContain("Mid-Shift");
  });
});

// ============================================================
// Backend: PATCH fieldMap includes new fields
// ============================================================
describe("Backend — PATCH fieldMap includes supervisor and shift time", () => {
  it("fieldMap includes snap_supervisor", () => {
    const section = attendanceTs.slice(
      attendanceTs.indexOf("const fieldMap"),
      attendanceTs.indexOf("const fieldMap") + 500
    );
    expect(section).toContain("snap_supervisor");
  });

  it("fieldMap includes snap_shift_time", () => {
    const section = attendanceTs.slice(
      attendanceTs.indexOf("const fieldMap"),
      attendanceTs.indexOf("const fieldMap") + 500
    );
    expect(section).toContain("snap_shift_time");
  });
});

// ============================================================
// Frontend: saveRecords payload includes new fields
// ============================================================
describe("Frontend — saveRecords payload includes new fields", () => {
  it("saveRecords sends snap_supervisor in payload", () => {
    const section = dataJs.slice(
      dataJs.indexOf("function saveRecords"),
      dataJs.indexOf("function saveRecords") + 1500
    );
    expect(section).toContain("snap_supervisor");
  });

  it("saveRecords sends snap_shift_time in payload", () => {
    const section = dataJs.slice(
      dataJs.indexOf("function saveRecords"),
      dataJs.indexOf("function saveRecords") + 1500
    );
    expect(section).toContain("snap_shift_time");
  });

  it("saveRecords sends snap_status in payload (bug fix)", () => {
    const section = dataJs.slice(
      dataJs.indexOf("function saveRecords"),
      dataJs.indexOf("function saveRecords") + 1500
    );
    expect(section).toContain("snap_status");
  });
});

// ============================================================
// Frontend: isStatusEditor restricts to Manager + Admin only
// ============================================================
describe("Frontend — isStatusEditor permission gate", () => {
  it("isStatusEditor checks actual_role === Manager", () => {
    expect(inputCompactJs).toContain("cu.actual_role === 'Manager'");
  });

  it("isStatusEditor does NOT check anchor.edit_attendance permission", () => {
    // The old check was: cu.permissions && cu.permissions['anchor.edit_attendance']
    // It should NOT be in the isStatusEditor line anymore
    const line = inputCompactJs.split("\n").find(l => l.includes("isStatusEditor") && l.includes("var "));
    expect(line).toBeDefined();
    expect(line).not.toContain("anchor.edit_attendance");
  });
});

// ============================================================
// CSS: .fcb-input style exists
// ============================================================
describe("CSS — .fcb-input style", () => {
  it("defines .fcb-input base styles", () => {
    expect(inputRedesignCss).toContain(".fcb-input {");
    expect(inputRedesignCss).toContain(".fcb-input:hover");
    expect(inputRedesignCss).toContain(".fcb-input:focus");
    expect(inputRedesignCss).toContain(".fcb-input::placeholder");
  });
});
