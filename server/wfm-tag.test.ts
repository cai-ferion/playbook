import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Tests for the WFM Tag feature:
 * 1. DB schema — io_wfm_schedules table + wfm_tag column on io_attendance
 * 2. Server — WFM upload endpoint, filter conditions, clear endpoint
 * 3. Frontend — TABLE_COLUMNS, normalizeRecord, filter bar, column width CSS
 */

const schemaPath = path.resolve(__dirname, "../drizzle/schema.ts");
const schemaContent = fs.readFileSync(schemaPath, "utf-8");

const ioRoutesPath = path.resolve(__dirname, "io-routes.ts");
const ioRoutesContent = fs.readFileSync(ioRoutesPath, "utf-8");

const dataJsPath = path.resolve(__dirname, "public/js/data.js");
const dataJsContent = fs.readFileSync(dataJsPath, "utf-8");

const appJsPath = path.resolve(__dirname, "public/js/app.js");
const appJsContent = fs.readFileSync(appJsPath, "utf-8");

const inputPortalPath = path.resolve(__dirname, "public/js/input-portal.js");
const inputPortalContent = fs.readFileSync(inputPortalPath, "utf-8");

const stylesPath = path.resolve(__dirname, "public/css/styles.css");
const stylesContent = fs.readFileSync(stylesPath, "utf-8");

const indexHtmlPath = path.resolve(__dirname, "public/index.html");
const indexHtmlContent = fs.readFileSync(indexHtmlPath, "utf-8");

const adminJsPath = path.resolve(__dirname, "public/js/admin.js");
const adminJsContent = fs.readFileSync(adminJsPath, "utf-8");

const compactJsPath = path.resolve(__dirname, "public/js/input-compact.js");
const compactJsContent = fs.readFileSync(compactJsPath, "utf-8");

const redesignCssPath = path.resolve(__dirname, "public/css/input-redesign.css");
const redesignCssContent = fs.readFileSync(redesignCssPath, "utf-8");

// ============================================================
// 1. DB Schema
// ============================================================
describe("WFM Tag — DB Schema", () => {
  it("defines io_wfm_schedules table in schema.ts", () => {
    expect(schemaContent).toContain('ioWfmSchedules = mysqlTable("io_wfm_schedules"');
  });

  it("io_wfm_schedules has required columns (ohr_id, schedule_date, wfm_value)", () => {
    expect(schemaContent).toContain('ohr_id: varchar("ohr_id"');
    expect(schemaContent).toContain('schedule_date: varchar("schedule_date"');
    expect(schemaContent).toContain('wfm_value: varchar("wfm_value"');
  });

  it("io_wfm_schedules has upload tracking columns", () => {
    expect(schemaContent).toContain('uploaded_at: varchar("uploaded_at"');
    expect(schemaContent).toContain('uploaded_by: varchar("uploaded_by"');
  });

  it("io_attendance has wfm_tag column", () => {
    expect(schemaContent).toContain('wfm_tag: varchar("wfm_tag"');
  });

  it("exports IoWfmSchedule types", () => {
    expect(schemaContent).toContain("type IoWfmSchedule");
    expect(schemaContent).toContain("type InsertIoWfmSchedule");
  });
});

// ============================================================
// 2. Server — WFM Upload Endpoint
// ============================================================
describe("WFM Tag — Upload Endpoint", () => {
  it("POST /wfm-schedule-upload route exists", () => {
    expect(ioRoutesContent).toContain('router.post("/wfm-schedule-upload"');
  });

  it("validates rows array with minimum 2 entries (header + data)", () => {
    expect(ioRoutesContent).toContain("rows.length < 2");
    expect(ioRoutesContent).toContain("rows array with header + data is required");
  });

  it("parses date columns from header row (ISO dates and Excel serial numbers)", () => {
    // ISO date parsing
    expect(ioRoutesContent).toContain("/^\\d{4}-\\d{2}-\\d{2}/.test(raw)");
    // Excel serial number parsing
    expect(ioRoutesContent).toContain("/^\\d+$/.test(raw)");
    expect(ioRoutesContent).toContain("excelEpoch");
  });

  it("rejects upload when no valid date columns found", () => {
    expect(ioRoutesContent).toContain("No valid date columns found in header");
  });

  it("deletes existing WFM data for upload dates (upsert behavior)", () => {
    expect(ioRoutesContent).toContain("DELETE FROM io_wfm_schedules WHERE schedule_date");
  });

  it("uses bulk insert with chunk size of 500", () => {
    expect(ioRoutesContent).toContain("BULK_SIZE = 500");
    expect(ioRoutesContent).toContain("flushWfmRecords");
  });

  it("backfills io_attendance.wfm_tag from io_wfm_schedules via JOIN", () => {
    expect(ioRoutesContent).toContain("UPDATE io_attendance a");
    expect(ioRoutesContent).toContain("INNER JOIN io_wfm_schedules w");
    expect(ioRoutesContent).toContain("SET a.wfm_tag = w.wfm_value");
  });

  it("returns success response with totalInserted, datesProcessed, attendanceBackfilled", () => {
    expect(ioRoutesContent).toContain("totalInserted");
    expect(ioRoutesContent).toContain("datesProcessed");
    expect(ioRoutesContent).toContain("attendanceBackfilled");
  });
});

describe("WFM Tag — Schedule Management Endpoints", () => {
  it("GET /wfm-schedule/dates endpoint exists", () => {
    expect(ioRoutesContent).toContain('router.get("/wfm-schedule/dates"');
  });

  it("returns distinct dates with count and upload metadata", () => {
    expect(ioRoutesContent).toContain("DISTINCT schedule_date");
    expect(ioRoutesContent).toContain("COUNT(*)");
    expect(ioRoutesContent).toContain("MAX(uploaded_at)");
    expect(ioRoutesContent).toContain("MAX(uploaded_by)");
  });

  it("DELETE /wfm-schedule endpoint exists", () => {
    expect(ioRoutesContent).toContain('router.delete("/wfm-schedule"');
  });

  it("DELETE clears both io_wfm_schedules and io_attendance.wfm_tag", () => {
    expect(ioRoutesContent).toContain("DELETE FROM io_wfm_schedules");
    expect(ioRoutesContent).toContain("UPDATE io_attendance SET wfm_tag = NULL");
  });
});

// ============================================================
// 3. Server — WFM Tag Filter Conditions
// ============================================================
describe("WFM Tag — Server-side Filter Conditions", () => {
  it("accepts wfm_tag_in query parameter in GET /attendance", () => {
    expect(ioRoutesContent).toContain("wfm_tag_in");
  });

  it("applies inArray filter on ioAttendance.wfm_tag for wfm_tag_in", () => {
    expect(ioRoutesContent).toContain('inArray(ioAttendance.wfm_tag, String(wfm_tag_in).split("|"))');
  });

  it("wfm_tag_in filter is applied in all 3 attendance query blocks", () => {
    // Count occurrences of the wfm_tag_in filter application
    const matches = ioRoutesContent.match(/if \(wfm_tag_in\) conditions\.push/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(3);
  });
});

// ============================================================
// 4. Frontend — TABLE_COLUMNS & normalizeRecord
// ============================================================
describe("WFM Tag — Frontend Data Layer (data.js)", () => {
  it("TABLE_COLUMNS includes wfm_tag entry", () => {
    expect(dataJsContent).toContain("key: 'wfm_tag'");
    expect(dataJsContent).toContain("label: 'WFM Tag'");
  });

  it("wfm_tag is marked as non-editable", () => {
    expect(dataJsContent).toContain("{ key: 'wfm_tag', label: 'WFM Tag', editable: false }");
  });

  it("normalizeRecord maps wfm_tag from attendance data", () => {
    expect(dataJsContent).toContain("wfm_tag: (att.wfm_tag ||");
  });
});

// ============================================================
// 5. Frontend — Omnibar Filter (input-portal.js)
// ============================================================
describe("WFM Tag — Omnibar Filter (input-portal.js)", () => {
  it("OMNIBAR_FILTER_FIELDS includes wfm_tag entry", () => {
    expect(inputPortalContent).toContain("key: 'wfm_tag'");
    expect(inputPortalContent).toContain("label: 'WFM Tag'");
    expect(inputPortalContent).toContain("type: 'multi'");
  });

  it("wfm_tag is not searchable (small set of known tags)", () => {
    // The wfm_tag field should have searchable: false
    const wfmField = inputPortalContent.match(/\{[^}]*key:\s*'wfm_tag'[^}]*\}/);
    expect(wfmField).not.toBeNull();
    expect(wfmField![0]).toContain("searchable: false");
  });

  it("keyMap maps wfm_tag to wfm_tag_in for server-side filtering", () => {
    expect(inputPortalContent).toContain("wfm_tag: 'wfm_tag_in'");
  });
});

// ============================================================
// 6. Frontend — Column Width & Filter Options (app.js)
// ============================================================
describe("WFM Tag — Column Width & Filter Options (app.js)", () => {
  it("getColumnWidthClass maps wfm_tag to col-wfm-tag", () => {
    expect(appJsContent).toContain("wfm_tag: 'col-wfm-tag'");
  });

  it("populateInputFilterDropdowns collects unique wfm_tag values", () => {
    expect(appJsContent).toContain("r.wfm_tag");
    expect(appJsContent).toContain("wfmTags");
  });

  it("populateInputFilterDropdowns wires wfm_tag multiselect", () => {
    expect(appJsContent).toContain("appState.multiSelects.wfm_tag");
    expect(appJsContent).toContain("wfm_tag) appState.multiSelects.wfm_tag.setOptions(wfmTags)");
  });
});

// ============================================================
// 7. CSS — Column Width
// ============================================================
describe("WFM Tag — CSS Column Width", () => {
  it(".col-wfm-tag CSS class exists in styles.css", () => {
    expect(stylesContent).toContain(".col-wfm-tag");
  });

  it(".col-wfm-tag has min-width set", () => {
    const match = stylesContent.match(/\.col-wfm-tag\s*\{[^}]*min-width/);
    expect(match).not.toBeNull();
  });
});

// ============================================================
// 8. Admin Tools — WFM Upload UI
// ============================================================
describe("WFM Tag — Admin Tools Upload UI", () => {
  it("index.html contains WFM Schedule upload card", () => {
    expect(indexHtmlContent.toLowerCase()).toContain("wfm schedule");
  });

  it("admin.js contains WFM upload function", () => {
    expect(adminJsContent).toContain("wfmUploadSchedule");
  });

  it("admin.js contains WFM clear function", () => {
    expect(adminJsContent).toContain("wfmClearAllSchedules");
  });

  it("admin.js calls the correct upload endpoint", () => {
    expect(adminJsContent).toContain("wfm-schedule-upload");
  });
});

// ============================================================
// 9. Cache Busting
// ============================================================
describe("WFM Tag — Cache Busting", () => {
  it("data.js cache version is bumped", () => {
    expect(indexHtmlContent).toContain("data.js?v=106");
  });

  it("app.js cache version is bumped", () => {
    expect(indexHtmlContent).toContain("app.js?v=123");
  });

  it("input-portal.js cache version is bumped", () => {
    expect(indexHtmlContent).toContain("input-portal.js?v=121");
  });

  it("admin.js cache version is bumped", () => {
    expect(indexHtmlContent).toContain("admin.js?v=104");
  });

  it("styles.css cache version is bumped", () => {
    expect(indexHtmlContent).toContain("styles.css?v=133");
  });
});

// ============================================================
// 10. Slim Attendance Endpoint (Field Projection)
// ============================================================
describe("Slim Attendance Endpoint — Field Projection", () => {
  it("accepts 'slim' query parameter in GET /attendance", () => {
    expect(ioRoutesContent).toContain("slim");
  });

  it("defines slimSelect projection with exactly the columns normalizeRecord needs", () => {
    expect(ioRoutesContent).toContain('const slimSelect = slim === "true"');
    // Verify all 19 projected columns are present
    const slimColumns = [
      'ioAttendance.id', 'ioAttendance.ohr_id', 'ioAttendance.log_date',
      'ioAttendance.tag', 'ioAttendance.upl_reason', 'ioAttendance.remarks',
      'ioAttendance.ot_hours', 'ioAttendance.snap_full_name', 'ioAttendance.snap_supervisor',
      'ioAttendance.snap_planning_group', 'ioAttendance.snap_shift_time',
      'ioAttendance.snap_actual_role', 'ioAttendance.snap_status',
      'ioAttendance.is_locked', 'ioAttendance.role', 'ioAttendance.planning_group',
      'ioAttendance.internal_role', 'ioAttendance.internal_planning_group',
      'ioAttendance.wfm_tag',
    ];
    for (const col of slimColumns) {
      expect(ioRoutesContent).toContain(col);
    }
  });

  it("excludes created_at, locked_at, snap_billing_name, actual_vs_projection from slim projection", () => {
    // Extract the slimSelect block
    const slimBlock = ioRoutesContent.match(/const slimSelect = slim[\s\S]*?\} : undefined;/);
    expect(slimBlock).not.toBeNull();
    const block = slimBlock![0];
    expect(block).not.toContain('created_at');
    expect(block).not.toContain('locked_at');
    expect(block).not.toContain('snap_billing_name');
    expect(block).not.toContain('actual_vs_projection');
  });

  it("uses slimSelect when slim=true, falls back to full select otherwise", () => {
    expect(ioRoutesContent).toContain('db.select(slimSelect).from(ioAttendance)');
    expect(ioRoutesContent).toContain('db.select().from(ioAttendance)');
  });

  it("frontend fetchPaginatedAttendance passes slim=true", () => {
    expect(dataJsContent).toContain("slim: 'true'");
  });
});

// ============================================================
// 11. WFM Tag Filter — Frontend Data Layer
// ============================================================
describe("WFM Tag — fetchPaginatedAttendance wfm_tag_in", () => {
  it("passes wfm_tag_in filter param to the server", () => {
    expect(dataJsContent).toContain("filters.wfm_tag_in");
    expect(dataJsContent).toContain("params.set('wfm_tag_in'");
  });
});

// ============================================================
// 12. WFM Tag Mapping Logic (Server-side)
// ============================================================
describe("WFM Tag — Upload Mapping Logic", () => {
  it("defines TIME_PATTERN regex for HH:MM-HH:MM shift times", () => {
    expect(ioRoutesContent).toContain('const TIME_PATTERN = /^\\d{1,2}:\\d{2}\\s*-\\s*\\d{1,2}:\\d{2}$/');
  });

  it("defines SCHEDULED_ALIASES set with BOJ", () => {
    expect(ioRoutesContent).toContain("const SCHEDULED_ALIASES = new Set(['BOJ'])");
  });

  it("defines mapWfmTag arrow function", () => {
    expect(ioRoutesContent).toContain('const mapWfmTag = (rawValue: string): string =>');
  });

  it("maps time patterns to 'Scheduled'", () => {
    expect(ioRoutesContent).toContain("if (TIME_PATTERN.test(rawValue)) return 'Scheduled'");
  });

  it("maps BOJ to 'Scheduled'", () => {
    expect(ioRoutesContent).toContain("if (SCHEDULED_ALIASES.has(rawValue.toUpperCase())) return 'Scheduled'");
  });

  it("passes through WO, PL, ML, LOA, Exit, NH Training unchanged", () => {
    // The function returns rawValue for non-time, non-BOJ values
    expect(ioRoutesContent).toContain('return rawValue; // WO, PL, ML, LOA, Exit, NH Training pass through');
  });

  it("applies mapWfmTag before inserting into scheduleRecords", () => {
    expect(ioRoutesContent).toContain('const mappedTag = mapWfmTag(rawValue)');
    expect(ioRoutesContent).toContain("scheduleRecords.push([ohr, dateStr, mappedTag, now, uploaderName])");
  });
});

// ============================================================
// 13. WFM Tag — Compact View Rendering
// ============================================================
describe("WFM Tag — Compact Table Rendering", () => {
  it("renders WFM Tag chip next to Tag chip in compact row", () => {
    expect(compactJsContent).toContain('wfm-tag-chip');
    expect(compactJsContent).toContain('r.wfm_tag');
  });

  it("renders WFM TAG field in the detail panel", () => {
    expect(compactJsContent).toContain('WFM TAG');
    expect(compactJsContent).toContain('wfm-tag-detail');
  });

  it("compactRefreshRow includes WFM Tag chip", () => {
    // The refresh function should also render the wfm chip
    const refreshBlock = compactJsContent.match(/compactRefreshRow[\s\S]*?^\};/m);
    expect(refreshBlock).not.toBeNull();
    expect(refreshBlock![0]).toContain('wfm-tag-chip');
  });

  it("has .wfm-tag-chip CSS styling in input-redesign.css", () => {
    expect(redesignCssContent).toContain('.wfm-tag-chip');
  });

  it("has .wfm-tag-detail CSS styling in input-redesign.css", () => {
    expect(redesignCssContent).toContain('.wfm-tag-detail');
  });

  it("detail-panel-grid uses 4-column layout", () => {
    expect(redesignCssContent).toContain('grid-template-columns: 1fr 1fr 1fr 1fr');
  });
});
