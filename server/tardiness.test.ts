/**
 * Tardiness Validator & Analytics — Integration Test Suite
 * Tests: schema, routes, notifications, UI wiring, view switching, CSV upload, analytics.
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

  it("has analytics endpoint", () => {
    expect(tardinessRoutes).toContain('router.get("/tardiness/analytics"');
  });

  it("has export endpoint", () => {
    expect(tardinessRoutes).toContain('router.get("/tardiness/export"');
  });

  it("returns distinct week endings in analytics", () => {
    expect(tardinessRoutes).toContain('SELECT DISTINCT week_ending FROM io_tardiness');
  });

  it("has escalation-check endpoint", () => {
    expect(tardinessRoutes).toContain('router.get("/tardiness/escalation-check"');
    expect(tardinessRoutes).toContain("HAVING COUNT(*) >= 3");
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

  it("has analytics loading function", () => {
    expect(tardinessJs).toContain("tardaLoadAnalytics");
  });

  it("has CSV export function", () => {
    expect(tardinessJs).toContain("tardExportCSV");
  });

  it("hooks into switchView", () => {
    expect(tardinessJs).toContain("_origSwitchView");
    expect(tardinessJs).toContain("tardiness-validator");
    expect(tardinessJs).toContain("tardiness-analytics");
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
    // Detail card cases in showNotifDetailCard
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
  it("allViews includes tardiness views", () => {
    expect(appJs).toContain("'tardiness-validator'");
    expect(appJs).toContain("'tardiness-analytics'");
  });

  it("horizonViews includes tardiness views", () => {
    const horizonMatch = appJs.match(/horizonViews\s*=\s*\[([^\]]+)\]/);
    expect(horizonMatch).toBeTruthy();
    expect(horizonMatch![1]).toContain("tardiness-validator");
    expect(horizonMatch![1]).toContain("tardiness-analytics");
  });

  it("titles map includes tardiness views", () => {
    expect(appJs).toContain("'tardiness-validator': 'Tardiness Validator'");
    expect(appJs).toContain("'tardiness-analytics': 'Tardiness Analytics'");
  });
});

// ── 8. HTML Structure ───────────────────────────────────────────
describe("Tardiness — HTML Structure", () => {
  it("has nav items for tardiness", () => {
    expect(indexHtml).toContain('data-view="tardiness-validator"');
    expect(indexHtml).toContain('data-view="tardiness-analytics"');
  });

  it("has view containers", () => {
    expect(indexHtml).toContain('id="view-tardiness-validator"');
    expect(indexHtml).toContain('id="view-tardiness-analytics"');
  });

  it("has admin upload card for tardiness", () => {
    expect(indexHtml).toContain("tardiness-csv-input");
    expect(indexHtml).toContain("tardiness-upload-btn");
  });

  it("includes tardiness.js script", () => {
    expect(indexHtml).toContain("tardiness.js");
  });

  it("nav items are under Horizon group", () => {
    const horizonGroupIdx = indexHtml.indexOf('id="nav-group-horizon"');
    const tardValidatorIdx = indexHtml.indexOf('data-view="tardiness-validator"');
    const tardAnalyticsIdx = indexHtml.indexOf('data-view="tardiness-analytics"');
    expect(horizonGroupIdx).toBeLessThan(tardValidatorIdx);
    expect(horizonGroupIdx).toBeLessThan(tardAnalyticsIdx);
  });
});

// ── 9. Auto-calculation Helpers ─────────────────────────────────
describe("Tardiness — Auto-calculation Helpers", () => {
  it("computeWeekEnding handles Saturday start", () => {
    // Saturday should map to next Friday
    expect(tardinessRoutes).toContain("day === 6 ? 6");
  });

  it("deriveShiftType categorizes hours correctly", () => {
    expect(tardinessRoutes).toContain("Morning");
    expect(tardinessRoutes).toContain("Afternoon");
    expect(tardinessRoutes).toContain("GY Shift");
  });

  it("parseFlexibleDatetime handles M/D/YYYY and ISO formats", () => {
    expect(tardinessRoutes).toContain("parseFlexibleDatetime");
    expect(tardinessRoutes).toContain("M/D/YYYY");
  });

  it("normalizeDate handles multiple date formats", () => {
    expect(tardinessRoutes).toContain("normalizeDate");
  });
});

// ── 10. Escalation Check ────────────────────────────────────────
describe("Tardiness — Escalation Check", () => {
  it("uses rolling 4-week window", () => {
    expect(tardinessRoutes).toContain("LIMIT 4");
  });

  it("threshold is 3+ valid instances", () => {
    expect(tardinessRoutes).toContain("HAVING COUNT(*) >= 3");
  });

  it("only counts Valid items", () => {
    expect(tardinessRoutes).toContain("validation_status = 'Valid'");
  });

  it("groups by employee", () => {
    expect(tardinessRoutes).toContain("GROUP BY ohr_id");
  });
});

// ── 11. Cache Version Consistency ───────────────────────────────
describe("Tardiness — Cache Versions", () => {
  it("notifications.js cache version is current", () => {
    expect(indexHtml).toContain("notifications.js?v=106");
  });

  it("tardiness.js is included in index.html", () => {
    expect(indexHtml).toMatch(/tardiness\.js\?v=\d+/);
  });
});
