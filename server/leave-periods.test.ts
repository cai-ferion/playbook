/**
 * Leave Period Configuration Tests
 * Validates: CRUD endpoints, admin gating, filing validation integration, frontend UI
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
const leavesTs = readFileSync(join(__dirname, "io/leaves.ts"), "utf-8");
const eventBusTs = readFileSync(join(__dirname, "io/event-bus.ts"), "utf-8");
const schemaTs = readFileSync(join(ROOT, "drizzle/schema.ts"), "utf-8");
const havenJs = readFileSync(join(ROOT, "server/public/js/haven.js"), "utf-8");
const indexHtml = readFileSync(join(ROOT, "server/public/index.html"), "utf-8");

// ============================================================
// Schema: io_leave_periods table
// ============================================================
describe("Schema — io_leave_periods table", () => {
  it("defines ioLeavePeriods table in schema.ts", () => {
    expect(schemaTs).toContain('export const ioLeavePeriods = mysqlTable("io_leave_periods"');
  });
  it("has month column (int, notNull)", () => {
    expect(schemaTs).toContain('month: int("month").notNull()');
  });
  it("has year column (int, notNull)", () => {
    expect(schemaTs).toContain('year: int("year").notNull()');
  });
  it("has start_week_ending column (varchar)", () => {
    expect(schemaTs).toContain('start_week_ending: varchar("start_week_ending"');
  });
  it("has created_by and created_by_ohr columns", () => {
    expect(schemaTs).toContain('created_by: varchar("created_by"');
    expect(schemaTs).toContain('created_by_ohr: varchar("created_by_ohr"');
  });
  it("exports IoLeavePeriod and InsertIoLeavePeriod types", () => {
    expect(schemaTs).toContain("export type IoLeavePeriod");
    expect(schemaTs).toContain("export type InsertIoLeavePeriod");
  });
});

// ============================================================
// Server: Leave Periods CRUD Endpoints
// ============================================================
describe("Server — Leave Periods GET /leave-periods", () => {
  it("has a GET /leave-periods route", () => {
    expect(leavesTs).toContain('router.get("/leave-periods"');
  });
  it("queries ioLeavePeriods table", () => {
    const idx = leavesTs.indexOf('router.get("/leave-periods"');
    const section = leavesTs.slice(idx, idx + 400);
    expect(section).toContain("ioLeavePeriods");
  });
  it("orders by year and month descending", () => {
    const idx = leavesTs.indexOf('router.get("/leave-periods"');
    const section = leavesTs.slice(idx, idx + 400);
    expect(section).toContain("desc(ioLeavePeriods.year)");
    expect(section).toContain("desc(ioLeavePeriods.month)");
  });
});

describe("Server — Leave Periods GET /leave-periods/current", () => {
  it("has a GET /leave-periods/current route", () => {
    expect(leavesTs).toContain('router.get("/leave-periods/current"');
  });
  it("uses Asia/Manila timezone for current month detection", () => {
    const idx = leavesTs.indexOf('router.get("/leave-periods/current"');
    const section = leavesTs.slice(idx, idx + 600);
    expect(section).toContain("Asia/Manila");
  });
  it("returns configured: false when no period exists", () => {
    const idx = leavesTs.indexOf('router.get("/leave-periods/current"');
    const section = leavesTs.slice(idx, idx + 600);
    expect(section).toContain("configured: false");
  });
  it("returns configured: true with period data when exists", () => {
    const idx = leavesTs.indexOf('router.get("/leave-periods/current"');
    const section = leavesTs.slice(idx, idx + 800);
    expect(section).toContain("configured: true");
  });
});

describe("Server — Leave Periods POST /leave-periods (admin-only)", () => {
  it("has a POST /leave-periods route", () => {
    expect(leavesTs).toContain('router.post("/leave-periods"');
  });
  it("gates access with isAdminOhr", () => {
    const idx = leavesTs.indexOf('router.post("/leave-periods"');
    const section = leavesTs.slice(idx, idx + 800);
    expect(section).toContain("isAdminOhr(actorOhr)");
  });
  it("returns 403 for non-admin users", () => {
    const idx = leavesTs.indexOf('router.post("/leave-periods"');
    const section = leavesTs.slice(idx, idx + 800);
    expect(section).toContain("res.status(403)");
    expect(section).toContain("Only admins can configure leave periods");
  });
  it("validates required fields (month, year, start_week_ending)", () => {
    const idx = leavesTs.indexOf('router.post("/leave-periods"');
    const section = leavesTs.slice(idx, idx + 800);
    expect(section).toContain("month, year, and start_week_ending are required");
  });
  it("validates start_week_ending is a Friday", () => {
    const idx = leavesTs.indexOf('router.post("/leave-periods"');
    const section = leavesTs.slice(idx, idx + 800);
    expect(section).toContain("getDay() !== 5");
    expect(section).toContain("start_week_ending must be a Friday");
  });
  it("performs upsert (update if month+year exists, insert otherwise)", () => {
    const idx = leavesTs.indexOf('router.post("/leave-periods"');
    const section = leavesTs.slice(idx, idx + 1800);
    expect(section).toContain("existing.length > 0");
    expect(section).toContain("db.update(ioLeavePeriods)");
    expect(section).toContain("db.insert(ioLeavePeriods)");
  });
  it("emits SSE change event on success", () => {
    const idx = leavesTs.indexOf('router.post("/leave-periods"');
    const section = leavesTs.slice(idx, idx + 1800);
    expect(section).toContain('emitChange(req, "leave-periods"');
  });
});

describe("Server — Leave Periods DELETE /leave-periods/:id (admin-only)", () => {
  it("has a DELETE /leave-periods/:id route", () => {
    expect(leavesTs).toContain('router.delete("/leave-periods/:id"');
  });
  it("gates access with isAdminOhr", () => {
    const idx = leavesTs.indexOf('router.delete("/leave-periods/:id"');
    const section = leavesTs.slice(idx, idx + 600);
    expect(section).toContain("isAdminOhr(actorOhr)");
  });
  it("returns 403 for non-admin users", () => {
    const idx = leavesTs.indexOf('router.delete("/leave-periods/:id"');
    const section = leavesTs.slice(idx, idx + 600);
    expect(section).toContain("res.status(403)");
    expect(section).toContain("Only admins can delete leave periods");
  });
  it("deletes by id parameter", () => {
    const idx = leavesTs.indexOf('router.delete("/leave-periods/:id"');
    const section = leavesTs.slice(idx, idx + 600);
    expect(section).toContain("req.params.id");
    expect(section).toContain("db.delete(ioLeavePeriods)");
  });
  it("emits SSE change event on success", () => {
    const idx = leavesTs.indexOf('router.delete("/leave-periods/:id"');
    const section = leavesTs.slice(idx, idx + 600);
    expect(section).toContain('emitChange(req, "leave-periods"');
  });
});

// ============================================================
// SSE Module Registration
// ============================================================
describe("SSE — leave-periods module type", () => {
  it("includes leave-periods in SSEModule type", () => {
    expect(eventBusTs).toContain('"leave-periods"');
  });
});

// ============================================================
// Filing Validation Integration
// ============================================================
describe("Server — Leave Filing Period Validation", () => {
  it("checks ioLeavePeriods in POST /leaves handler", () => {
    const idx = leavesTs.indexOf('router.post("/leaves"');
    const section = leavesTs.slice(idx, idx + 2500);
    expect(section).toContain("ioLeavePeriods");
  });
  it("blocks filing for current month if no period configured", () => {
    const idx = leavesTs.indexOf('router.post("/leaves"');
    const section = leavesTs.slice(idx, idx + 2500);
    expect(section).toContain("has not been opened yet by your admin");
  });
  it("enforces start_week_ending constraint for current month", () => {
    const idx = leavesTs.indexOf('router.post("/leaves"');
    const section = leavesTs.slice(idx, idx + 3000);
    expect(section).toContain("must be on or after the configured start date");
  });
  it("only enforces for current month (future months always open)", () => {
    const idx = leavesTs.indexOf('router.post("/leaves"');
    const section = leavesTs.slice(idx, idx + 2500);
    expect(section).toContain("leaveMonth === currentMonth && leaveYear === currentYear");
  });
  it("computes Saturday from week ending (Friday - 6 days)", () => {
    const idx = leavesTs.indexOf('router.post("/leaves"');
    const section = leavesTs.slice(idx, idx + 3000);
    expect(section).toContain("weDate.getDate() - 6");
  });
});

// ============================================================
// Frontend: Haven Admin UI
// ============================================================
describe("Frontend — Haven Leave Period Config Button", () => {
  it("has a Config button in the Haven header (hidden by default)", () => {
    expect(indexHtml).toContain('id="haven-config-btn"');
    expect(indexHtml).toContain('onclick="havenShowPeriodConfig()"');
  });
  it("button is hidden by default (display:none)", () => {
    const idx = indexHtml.indexOf('haven-config-btn');
    const section = indexHtml.slice(idx, idx + 200);
    expect(section).toContain("display:none");
  });
});

describe("Frontend — Haven Period Config Panel", () => {
  it("defines havenShowPeriodConfig function", () => {
    expect(havenJs).toContain("function havenShowPeriodConfig()");
  });
  it("fetches /leave-periods to show existing configs", () => {
    expect(havenJs).toContain("fetch(`${IO_API_BASE}/leave-periods`)");
  });
  it("provides month selector with current + next 3 months", () => {
    expect(havenJs).toContain("haven-period-month");
    expect(havenJs).toContain("havenPeriodMonthChanged");
  });
  it("provides Friday selector", () => {
    expect(havenJs).toContain("haven-period-friday");
    expect(havenJs).toContain("havenGetFridaysForMonth");
  });
  it("has save and delete functionality", () => {
    expect(havenJs).toContain("function havenSavePeriodConfig()");
    expect(havenJs).toContain("function havenDeletePeriod(id)");
  });
  it("shows configured periods in a table with delete option", () => {
    expect(havenJs).toContain("Configured Periods");
    expect(havenJs).toContain("havenDeletePeriod");
  });
  it("shows config button only for admin OHRs", () => {
    // The havenRenderContinuous function checks ADMIN_OHRS for config button visibility
    expect(havenJs).toContain("haven-config-btn");
    expect(havenJs).toContain("ADMIN_OHRS");
  });
});

describe("Frontend — Haven Period Status in File Leave Form", () => {
  it("defines havenCheckPeriodStatus function", () => {
    expect(havenJs).toContain("function havenCheckPeriodStatus()");
  });
  it("fetches /leave-periods/current for status", () => {
    expect(havenJs).toContain("fetch(`${IO_API_BASE}/leave-periods/current`)");
  });
  it("shows warning when period not configured", () => {
    expect(havenJs).toContain("has not been opened yet");
  });
  it("shows success message when period is configured", () => {
    expect(havenJs).toContain("Leave filing is open for this month");
  });
  it("is called from havenShowFileForm", () => {
    // Find the havenShowFileForm function and check it calls havenCheckPeriodStatus
    const idx = havenJs.indexOf("function havenShowFileForm");
    const section = havenJs.slice(idx, idx + 2500);
    expect(section).toContain("havenCheckPeriodStatus()");
  });
});

// ============================================================
// Import Verification
// ============================================================
describe("Server — leaves.ts imports", () => {
  it("imports ioLeavePeriods from schema", () => {
    expect(leavesTs).toContain("ioLeavePeriods");
    expect(leavesTs).toMatch(/import.*ioLeavePeriods.*from.*schema/);
  });
  it("imports isAdminOhr from shared", () => {
    expect(leavesTs).toContain("isAdminOhr");
    expect(leavesTs).toMatch(/import.*isAdminOhr.*from.*shared/);
  });
});
