/**
 * Tardiness Validator — Integration Test Suite
 * Tests: schema, routes, notifications, UI wiring, view switching, CSV upload, filters, shift renames, auto-invalidation.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
const ROOT = path.resolve(__dirname, "..");
const readFile = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf-8");
// ── Source files ──────────────────────────────────────────────────
const schema = readFile("drizzle/schema.ts");
const tardinessRoutes = readFile("server/io-tardiness-routes.ts");
const tardinessJs = readFile("server/public/js/tardiness.js");
const notificationsJs = readFile("server/public/js/notifications.js");
const appJs = readFile("server/public/js/app.js");
const indexHtml = readFile("server/public/index.html");
const serverEntry = readFile("server/_core/index.ts");
// ── 1. Database Schema ──────────────────────────────────────────
describe("Tardiness — Database Schema", () => {
  it("defines io_tardiness table", () => {
    expect(schema).toContain("export const ioTardiness");
    expect(schema).toContain("io_tardiness");
  });
  it("has all required columns", () => {
    const requiredCols = [
      "ohr_id", "employee_name", "supervisor_name", "planning_group",
      "actual_role", "shift_time", "date", "roster_login", "roster_logout",
      "actual_login", "actual_logout", "tardiness_minutes", "shift_type",
      "week_ending", "validation_status", "validated_by", "validated_by_ohr",
      "validated_at", "remarks", "upload_batch"
    ];
    for (const col of requiredCols) {
      expect(schema).toContain(col);
    }
  });
  it("validation_status defaults to Pending", () => {
    expect(schema).toMatch(/validation_status.*default.*Pending/i);
  });
});
// ── 2. Server Routes ────────────────────────────────────────────
describe("Tardiness — Server Routes", () => {
  it("registers routes under /api/io", () => {
    expect(tardinessRoutes).toContain('app.use("/api/io", router)');
  });
  it("has upload endpoint", () => {
    expect(tardinessRoutes).toContain('router.post("/tardiness/upload"');
  });
  it("has list endpoint with team scoping", () => {
    expect(tardinessRoutes).toContain('router.get("/tardiness"');
    expect(tardinessRoutes).toContain("supervisor_name LIKE");
  });
  it("has single validate endpoint with lock-in", () => {
    expect(tardinessRoutes).toContain('router.patch("/tardiness/:id"');
    expect(tardinessRoutes).toContain("locked after validation");
  });
  it("has bulk validate endpoint", () => {
    expect(tardinessRoutes).toContain('router.patch("/tardiness/bulk-validate"');
  });
  it("has export endpoint", () => {
    expect(tardinessRoutes).toContain('router.get("/tardiness/export"');
  });
  it("analytics route has been removed", () => {
    expect(tardinessRoutes).not.toContain('router.get("/tardiness/analytics"');
  });
  it("escalation-check route has been removed", () => {
    expect(tardinessRoutes).not.toContain('router.get("/tardiness/escalation-check"');
  });
  it("returns filter metadata (weeks, planning_groups, supervisors, shift_types)", () => {
    expect(tardinessRoutes).toContain("SELECT DISTINCT week_ending FROM io_tardiness");
    expect(tardinessRoutes).toContain("SELECT DISTINCT e.planning_group FROM io_tardiness");
    expect(tardinessRoutes).toContain("SELECT DISTINCT e.supervisor_name FROM io_tardiness");
    expect(tardinessRoutes).toContain("SELECT DISTINCT shift_type FROM io_tardiness");
  });
  it("uses LEFT JOIN io_employees for progressive-cascade supervisor", () => {
    expect(tardinessRoutes).toContain("LEFT JOIN io_employees e ON t.ohr_id = e.ohr_id");
    expect(tardinessRoutes).toContain("live_supervisor");
    expect(tardinessRoutes).toContain("live_full_name");
    expect(tardinessRoutes).toContain("live_planning_group");
  });
  it("supports supervisor filter parameter (via live employee data)", () => {
    expect(tardinessRoutes).toContain("supervisor");
    expect(tardinessRoutes).toContain("e.supervisor_name = ?");
  });
  it("supports shift_type filter parameter", () => {
    expect(tardinessRoutes).toContain("shift_type");
    expect(tardinessRoutes).toContain("t.shift_type = ?");
  });
  it("supports scope=team for TL My Team toggle", () => {
    expect(tardinessRoutes).toContain('scope === "team"');
    expect(tardinessRoutes).toContain("e.supervisor_name LIKE ?");
  });
  it("PG filter metadata uses live io_employees data (not stale io_tardiness snapshot)", () => {
    expect(tardinessRoutes).toContain("SELECT DISTINCT e.planning_group FROM io_tardiness t LEFT JOIN io_employees");
  });
  it("is registered in server entry", () => {
    expect(serverEntry).toContain("registerTardinessRoutes");
  });
});
// ── 3. Upload Logic ─────────────────────────────────────────────
describe("Tardiness — Upload Logic", () => {
  it("auto-calculates tardiness minutes", () => {
    expect(tardinessRoutes).toContain("calcTardinessMinutes");
  });
  it("auto-computes week ending (Sat-Fri)", () => {
    expect(tardinessRoutes).toContain("computeWeekEnding");
  });
  it("derives shift type from roster login", () => {
    expect(tardinessRoutes).toContain("deriveShiftType");
  });
  it("enriches from io_employees", () => {
    expect(tardinessRoutes).toContain("io_employees");
    expect(tardinessRoutes).toContain("empMap");
  });
  it("detects duplicates (same OHR + date)", () => {
    expect(tardinessRoutes).toContain("ohr_id = ");
    expect(tardinessRoutes).toContain("date = ");
    expect(tardinessRoutes).toContain("LIMIT 1");
  });
  it("skips non-late records (tardiness <= 0)", () => {
    expect(tardinessRoutes).toContain("tardMins <= 0");
  });
  it("filters by business unit (COMMUNITY_OPS, INTEGRITY_OPS)", () => {
    expect(tardinessRoutes).toContain("ALLOWED_BUS");
    expect(tardinessRoutes).toContain("COMMUNITY_OPS");
    expect(tardinessRoutes).toContain("INTEGRITY_OPS");
  });
  it("auto-invalidates records with <5 min tardiness on upload", () => {
    expect(tardinessRoutes).toContain("autoInvalid");
    expect(tardinessRoutes).toContain("tardMins < 5");
    expect(tardinessRoutes).toContain("Auto-invalidated: within 5-minute grace period");
  });
});
// ── 4. Validation Lock-in ───────────────────────────────────────
describe("Tardiness — Lock-in Mechanism", () => {
  it("prevents editing after validation unless admin", () => {
    expect(tardinessRoutes).toContain('validation_status !== "Pending"');
    expect(tardinessRoutes).toContain("!unlock");
    expect(tardinessRoutes).toContain("locked after validation");
  });
  it("admin can unlock items", () => {
    expect(tardinessRoutes).toContain("unlock && isAdmin");
    expect(tardinessRoutes).toContain("validation_status = 'Pending'");
  });
  it("only updates Pending items in bulk validate", () => {
    expect(tardinessRoutes).toContain("validation_status = 'Pending'");
  });
});
// ── 5. Client-side JS ───────────────────────────────────────────
describe("Tardiness — Client JS (tardiness.js)", () => {
  it("defines TARD_STATE", () => {
    expect(tardinessJs).toContain("TARD_STATE");
  });
  it("has upload function", () => {
    expect(tardinessJs).toContain("tardinessUploadCSV");
  });
  it("has data loading function", () => {
    expect(tardinessJs).toContain("tardLoadData");
  });
  it("has single validate function", () => {
    expect(tardinessJs).toContain("tardValidateItem");
  });
  it("has bulk validate function", () => {
    expect(tardinessJs).toContain("tardBulkValidate");
  });
  it("has unlock function", () => {
    expect(tardinessJs).toContain("tardUnlockItem");
  });
  it("analytics functions have been removed", () => {
    expect(tardinessJs).not.toContain("tardaLoadAnalytics");
    expect(tardinessJs).not.toContain("initTardinessAnalytics");
    expect(tardinessJs).not.toContain("tardaRenderWeeklyChart");
    expect(tardinessJs).not.toContain("chartWeekly");
  });
  it("has CSV export function", () => {
    expect(tardinessJs).toContain("tardExportCSV");
  });
  it("sends supervisor filter param", () => {
    expect(tardinessJs).toContain("tard-supervisor-filter");
    expect(tardinessJs).toContain('params.set("supervisor"');
  });
  it("sends shift_type filter param", () => {
    expect(tardinessJs).toContain("tard-shift-filter");
    expect(tardinessJs).toContain('params.set("shift_type"');
  });
  it("populates supervisor dropdown from server filters", () => {
    expect(tardinessJs).toContain("data.filters.supervisors");
  });
  it("populates shift_types dropdown from server filters", () => {
    expect(tardinessJs).toContain("data.filters.shift_types");
  });
  it("uses modal instead of browser prompt() for validation", () => {
    expect(tardinessJs).toContain("tardOpenModal");
    expect(tardinessJs).toContain("tardCloseModal");
    expect(tardinessJs).toContain("tardConfirmModal");
    expect(tardinessJs).toContain("tard-validation-modal");
    // Should NOT use prompt() for validation actions
    expect(tardinessJs).not.toMatch(/prompt\(`Remarks for marking/);
    expect(tardinessJs).not.toMatch(/prompt\(`Bulk remarks/);
  });
  it("uses progressive cascade for supervisor (live_supervisor fallback)", () => {
    expect(tardinessJs).toContain("live_supervisor");
    expect(tardinessJs).toContain("live_planning_group");
  });
  it("renders new column order: OHR, Full Name, Date, Minutes Late, Supervisor, Shift Type, PG, Roster Login, Actual Login, Status, Remarks, Validated By, Actions", () => {
    // OHR should come before employee_name in the row template
    const ohrIdx = tardinessJs.indexOf("item.ohr_id");
    const nameIdx = tardinessJs.indexOf("item.employee_name", ohrIdx);
    expect(ohrIdx).toBeLessThan(nameIdx);
  });
  it("has bulk modal functions", () => {
    expect(tardinessJs).toContain("tardOpenBulkModal");
  });
  it("has My Team toggle function", () => {
    expect(tardinessJs).toContain("tardToggleMyTeam");
    expect(tardinessJs).toContain("myTeamOnly");
    expect(tardinessJs).toContain('params.set("scope", "team")');
  });
  it("uses action icon instead of text buttons in table rows", () => {
    // Pencil icon SVG for pending items
    expect(tardinessJs).toContain('tardOpenModal(${item.id})');
    expect(tardinessJs).toContain('<svg width="14"');
    // Should NOT have old text-based Valid/Invalid buttons in row
    expect(tardinessJs).not.toContain("tardOpenModal(${item.id},'Valid')");
    expect(tardinessJs).not.toContain("tardOpenModal(${item.id},'Invalid')");
  });
  it("modal requires remarks before confirming", () => {
    expect(tardinessJs).toContain('if (!remarks)');
    expect(tardinessJs).toContain('errorEl');
  });
  it("center-aligns Minutes Late column", () => {
    expect(tardinessJs).toContain('text-align:center;font-weight:700');
  });
  it("renders grace period indicator for auto-invalidated <5min records", () => {
    expect(tardinessJs).toContain("isGracePeriod");
    expect(tardinessJs).toContain("Grace Period");
    expect(tardinessJs).toContain("grace period");
  });
});
// ── 6. Notification Integration ─────────────────────────────────
describe("Tardiness — Notifications", () => {
  const TARD_NOTIF_TYPES = ["tardiness_escalation", "tardiness_validated", "tardiness_uploaded"];
  it("has icons for all tardiness notification types", () => {
    for (const t of TARD_NOTIF_TYPES) {
      expect(notificationsJs).toContain(`${t}:`);
    }
  });
  it("has labels for all tardiness notification types", () => {
    expect(notificationsJs).toContain("tardiness_escalation: 'Escalation'");
    expect(notificationsJs).toContain("tardiness_validated: 'Validated'");
    expect(notificationsJs).toContain("tardiness_uploaded: 'Uploaded'");
  });
  it("has colors for all tardiness notification types", () => {
    expect(notificationsJs).toContain("tardiness_escalation: '#ef4444'");
    expect(notificationsJs).toContain("tardiness_validated: '#22c55e'");
    expect(notificationsJs).toContain("tardiness_uploaded: '#3b82f6'");
  });
  it("has brief rendering for all tardiness types", () => {
    expect(notificationsJs).toContain("case 'tardiness_escalation':");
    expect(notificationsJs).toContain("case 'tardiness_validated':");
    expect(notificationsJs).toContain("case 'tardiness_uploaded':");
  });
  it("has detail card rendering for all tardiness types", () => {
    for (const t of TARD_NOTIF_TYPES) {
      expect(notificationsJs).toContain(`case '${t}':`);
    }
  });
  it("tardiness.js triggers createNotification on upload", () => {
    expect(tardinessJs).toContain("type: 'tardiness_uploaded'");
  });
  it("tardiness.js triggers createNotification on validate", () => {
    expect(tardinessJs).toContain("type: 'tardiness_validated'");
  });
});
// ── 7. View Switching & Navigation ──────────────────────────────
describe("Tardiness — View Switching & Navigation", () => {
  it("allViews includes tardiness-validator", () => {
    expect(appJs).toContain("'tardiness-validator'");
  });
  it("allViews does NOT include tardiness-analytics (removed)", () => {
    expect(appJs).not.toContain("'tardiness-analytics'");
  });
  it("horizonViews includes tardiness-validator only", () => {
    const horizonMatch = appJs.match(/horizonViews\s*=\s*\[([^\]]+)\]/);
    expect(horizonMatch).toBeTruthy();
    expect(horizonMatch![1]).toContain("tardiness-validator");
    expect(horizonMatch![1]).not.toContain("tardiness-analytics");
  });
  it("titles map includes tardiness-validator only", () => {
    expect(appJs).toContain("'tardiness-validator': 'Tardiness Validator'");
    expect(appJs).not.toContain("'tardiness-analytics'");
  });
});
// ── 8. HTML Structure ───────────────────────────────────────────
describe("Tardiness — HTML Structure", () => {
  it("has nav item for tardiness-validator", () => {
    expect(indexHtml).toContain('data-view="tardiness-validator"');
  });
  it("does NOT have nav item for tardiness-analytics (removed)", () => {
    expect(indexHtml).not.toContain('data-view="tardiness-analytics"');
  });
  it("has view container for tardiness-validator", () => {
    expect(indexHtml).toContain('id="view-tardiness-validator"');
  });
  it("does NOT have view container for tardiness-analytics (removed)", () => {
    expect(indexHtml).not.toContain('id="view-tardiness-analytics"');
  });
  it("has admin upload card for tardiness", () => {
    expect(indexHtml).toContain("tardiness-csv-input");
    expect(indexHtml).toContain("tardiness-upload-btn");
  });
  it("includes tardiness.js script", () => {
    expect(indexHtml).toContain("tardiness.js");
  });
  it("has Supervisor filter dropdown", () => {
    expect(indexHtml).toContain('id="tard-supervisor-filter"');
  });
  it("has Shift Type filter dropdown", () => {
    expect(indexHtml).toContain('id="tard-shift-filter"');
    expect(indexHtml).toContain("Mid-Shift");
    expect(indexHtml).toContain("GY Shift");
    expect(indexHtml).toContain("Morning");
  });
  it("has validation modal with Mark Valid, Mark Invalid, Cancel buttons", () => {
    expect(indexHtml).toContain('id="tard-validation-modal"');
    expect(indexHtml).toContain('id="tard-modal-title"');
    expect(indexHtml).toContain('id="tard-modal-remarks"');
    expect(indexHtml).toContain('id="tard-modal-agent"');
    expect(indexHtml).toContain('id="tard-modal-error"');
    expect(indexHtml).toContain('tardCloseModal()');
    expect(indexHtml).toContain("tardConfirmModal('Valid')");
    expect(indexHtml).toContain("tardConfirmModal('Invalid')");
    expect(indexHtml).toContain('Mark Invalid');
    expect(indexHtml).toContain('Mark Valid');
    expect(indexHtml).toContain('Cancel');
  });
  it("remarks are marked as required in modal", () => {
    expect(indexHtml).toContain('required');
    expect(indexHtml).toContain('Remarks are required');
  });
  it("table header has correct column order", () => {
    // Search within the tardiness table section specifically
    const tardTableStart = indexHtml.indexOf('id="tard-table"');
    const tardSection = indexHtml.slice(tardTableStart, tardTableStart + 1000);
    const ohrThIdx = tardSection.indexOf('<th>OHR</th>');
    const nameThIdx = tardSection.indexOf('Full Name</th>');
    const supervisorThIdx = tardSection.indexOf('<th>Supervisor</th>');
    const pgThIdx = tardSection.indexOf('<th>Planning Group</th>');
    const validatedByThIdx = tardSection.indexOf('<th>Validated By</th>');
    expect(ohrThIdx).toBeGreaterThan(-1);
    expect(ohrThIdx).toBeLessThan(nameThIdx);
    expect(nameThIdx).toBeLessThan(supervisorThIdx);
    expect(supervisorThIdx).toBeLessThan(pgThIdx);
    expect(pgThIdx).toBeLessThan(validatedByThIdx);
  });
  it("bulk buttons use modal functions", () => {
    expect(indexHtml).toContain("tardOpenBulkModal('Valid')");
    expect(indexHtml).toContain("tardOpenBulkModal('Invalid')");
  });
  it("date range pickers have been removed", () => {
    expect(indexHtml).not.toContain('id="tard-date-from"');
    expect(indexHtml).not.toContain('id="tard-date-to"');
    expect(indexHtml).not.toContain('tardClearDateRange()');
  });
  it("has My Team toggle button", () => {
    expect(indexHtml).toContain('id="tard-my-team-btn"');
    expect(indexHtml).toContain('tardToggleMyTeam()');
  });
  it("PG filter label says Planning Group (not PG)", () => {
    // The label before the PG select should say "Planning Group:"
    const pgLabelIdx = indexHtml.indexOf('Planning Group:</span>');
    const pgSelectIdx = indexHtml.indexOf('id="tard-pg-filter"');
    expect(pgLabelIdx).toBeGreaterThan(-1);
    expect(pgLabelIdx).toBeLessThan(pgSelectIdx);
  });
  it("Minutes Late header is center-aligned", () => {
    expect(indexHtml).toContain('text-align:center;">Minutes Late</th>');
  });
  it("nav item is under Horizon group", () => {
    const horizonGroupIdx = indexHtml.indexOf('id="nav-group-horizon"');
    const tardValidatorIdx = indexHtml.indexOf('data-view="tardiness-validator"');
    expect(horizonGroupIdx).toBeLessThan(tardValidatorIdx);
  });
});
// ── 9. Auto-calculation Helpers ─────────────────────────────────
describe("Tardiness — Auto-calculation Helpers", () => {
  it("computeWeekEnding handles Saturday start", () => {
    expect(tardinessRoutes).toContain("day === 6 ? 6");
  });
  it("deriveShiftType uses renamed shift types (Mid-Shift, GY Shift)", () => {
    expect(tardinessRoutes).toContain("Morning");
    expect(tardinessRoutes).toContain("Mid-Shift");
    expect(tardinessRoutes).toContain("GY Shift");
    // Afternoon and Graveyard should no longer be used as shift type values
    expect(tardinessRoutes).not.toContain('return "Afternoon"');
    expect(tardinessRoutes).not.toContain('return "Graveyard"');
  });
  it("parseFlexibleDatetime handles M/D/YYYY and ISO formats", () => {
    expect(tardinessRoutes).toContain("parseFlexibleDatetime");
    expect(tardinessRoutes).toContain("M/D/YYYY");
  });
  it("normalizeDate handles multiple date formats", () => {
    expect(tardinessRoutes).toContain("normalizeDate");
  });
});
// ── 10. Cache Version Consistency ───────────────────────────────
describe("Tardiness — Cache Versions", () => {
  it("notifications.js cache version is current", () => {
    expect(indexHtml).toContain("notifications.js?v=106");
  });
  it("tardiness.js is included in index.html with version", () => {
    expect(indexHtml).toMatch(/tardiness\.js\?v=\d+/);
  });
  it("app.js cache version is current", () => {
    expect(indexHtml).toContain("app.js?v=125");
  });
});
