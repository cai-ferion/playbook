import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Regimen Overhaul, Filter System, Incomplete Rostering & CSV Export", () => {
  const rosterJs = fs.readFileSync(path.join(__dirname, "../server/public/js/roster.js"), "utf-8");
  const appJs = fs.readFileSync(path.join(__dirname, "../server/public/js/app.js"), "utf-8");
  const indexHtml = fs.readFileSync(path.join(__dirname, "../server/public/index.html"), "utf-8");
  const ioRoutes = [__dirname + "/io/shared.ts", __dirname + "/io/attendance-ops.ts", __dirname + "/io/attendance.ts", __dirname + "/io/audit-log.ts", __dirname + "/io/billing.ts", __dirname + "/io/coaching.ts", __dirname + "/io/corrective-actions.ts", __dirname + "/io/employees.ts", __dirname + "/io/insights.ts", __dirname + "/io/leaves.ts", __dirname + "/io/notifications.ts", __dirname + "/io/permissions.ts", __dirname + "/io/tasks.ts", __dirname + "/io/wfm.ts", __dirname + "/io/tardiness.ts", __dirname + "/io/role-change.ts", __dirname + "/io/managers-nook.ts", __dirname + "/io/group-tasks.ts", __dirname + "/io/shift-extensions.ts", __dirname + "/io/performance.ts"].map(f => require("fs").readFileSync(f, "utf-8")).join("\n");
  const employeesModule = fs.readFileSync(path.join(__dirname, "./io/employees.ts"), "utf-8");

  // ===== Compass Visibility =====
  describe("Compass Visibility", () => {
    it("should restrict Compass nav via RBAC applyNavPermissions", () => {
      expect(appJs).toContain("applyNavPermissions");
      expect(appJs).toContain("vis('nav-group-compass', 'nav.compass')");
    });
  });

  // ===== Regimen Nav Visibility =====
  describe("Regimen Nav Visibility", () => {
    it("should show Regimen via RBAC permission", () => {
      expect(appJs).toContain("vis('nav-regimen', 'nav.regimen')");
    });
  });

  // ===== Pill-based Filter System =====
  describe("Pill-based Filter System (ROSTER namespace)", () => {
    it("should have ROSTER state object with filters, sortKey, sortDir", () => {
      expect(rosterJs).toContain("const ROSTER = {");
      expect(rosterJs).toContain("filters: {}");
      expect(rosterJs).toContain("sortKey: null");
      expect(rosterJs).toContain("sortDir: 'asc'");
    });

    it("should have rosterRenderFilterBar function", () => {
      expect(rosterJs).toContain("function rosterRenderFilterBar()");
    });

    it("should have rosterToggleDropdown function for pill interaction", () => {
      expect(rosterJs).toContain("rosterToggleDropdown");
    });

    it("should have Select All / Deselect All buttons", () => {
      expect(rosterJs).toContain("rosterSelectAll");
      expect(rosterJs).toContain("rosterDeselectAll");
      expect(rosterJs).toContain("Select All");
      expect(rosterJs).toContain("Deselect All");
    });

    it("should have debounced apply for instant filter updates", () => {
      expect(rosterJs).toContain("rosterDebouncedApply");
      expect(rosterJs).toContain("_rosterDebounceTimer");
    });

    it("should have filter-pill CSS classes", () => {
      expect(rosterJs).toContain("filter-pill");
      expect(rosterJs).toContain("filter-dropdown");
    });

    it("should have filter pill container in HTML", () => {
      expect(indexHtml).toContain("roster-filter-bar");
      expect(indexHtml).toContain("roster-filter-pills");
    });

    it("should NOT have old omnibar in HTML", () => {
      expect(indexHtml).not.toContain("roster-omnibar-chips");
      expect(indexHtml).not.toContain("roster-omnibar-menu");
    });

    it("should have search text filter via roster-search-input", () => {
      expect(rosterJs).toContain("roster-search-input");
      expect(rosterJs).toContain("ROSTER.searchQuery");
    });

    it("should have multi-select dropdown with checkboxes", () => {
      expect(rosterJs).toContain("rosterRenderMultiDropdown");
      expect(rosterJs).toContain("rosterOnCheckChange");
    });

    it("should have sort buttons in sortable dropdowns", () => {
      expect(rosterJs).toContain("rosterSetSort");
      expect(rosterJs).toContain("filter-sort-btn");
    });

    it("should have outside click handler to close dropdowns", () => {
      expect(rosterJs).toContain("document.addEventListener('click'");
      expect(rosterJs).toContain("filter-dropdown.open");
    });

    it("should have Clear button", () => {
      expect(rosterJs).toContain("rosterClearAllFilters");
      expect(rosterJs).toContain("Clear");
    });

    it("should have dropdown search for searchable fields", () => {
      expect(rosterJs).toContain("rosterFilterDropdownSearch");
      expect(rosterJs).toContain("filter-dropdown-search");
    });

    it("should have date-range filter type for date columns", () => {
      expect(rosterJs).toContain("date_range");
      expect(rosterJs).toContain("rosterRenderDateDropdown");
      expect(rosterJs).toContain("startDate");
      expect(rosterJs).toContain("endDate");
    });

    it("should build filter fields from ALL_COLUMNS dynamically", () => {
      expect(rosterJs).toContain("function buildFilterFields()");
      expect(rosterJs).toContain("col.isDate");
    });
  });

  // ===== Regimen Role-Based Visibility =====
  describe("Regimen Role-Based Column Visibility", () => {
    it("should have LIMITED_COLUMNS for non-Manager/non-admin users", () => {
      expect(rosterJs).toContain("LIMITED_COLUMNS");
    });

    it("should have ALL_COLUMNS for Managers and admin", () => {
      expect(rosterJs).toContain("ALL_COLUMNS");
    });

    it("should have tier property in ROSTER state", () => {
      expect(rosterJs).toContain("tier:");
    });

    it("should determine visibility based on RBAC permissions", () => {
      expect(rosterJs).toContain("regimen.full_columns");
    });

    it("ALL_COLUMNS should include attrition fields", () => {
      expect(rosterJs).toContain("'offboarding_date'");
      expect(rosterJs).toContain("'resignation_date'");
      expect(rosterJs).toContain("'relieving_date'");
      expect(rosterJs).toContain("'exit_date'");
      expect(rosterJs).toContain("'exit_reason'");
    });
  });

  // ===== Regimen Editability =====
  describe("Regimen Editability Rules", () => {
    it("should use RBAC permission for edit access", () => {
      expect(rosterJs).toContain("regimen.edit_employee");
      expect(rosterJs).toContain("ROSTER.canEdit");
    });

    it("should check DB permission for edit access", () => {
      expect(rosterJs).toContain("regimen.edit_employee");
    });
  });

  // ===== Column Grouping =====
  describe("Regimen Column Grouping", () => {
    it("should have identity group", () => {
      expect(rosterJs).toContain("group: 'identity'");
    });

    it("should have role group", () => {
      expect(rosterJs).toContain("group: 'role'");
    });

    it("should have system group", () => {
      expect(rosterJs).toContain("group: 'system'");
    });

    it("should have dates group", () => {
      expect(rosterJs).toContain("group: 'dates'");
    });

    it("should have attrition group", () => {
      expect(rosterJs).toContain("group: 'attrition'");
    });

    it("should have asset group", () => {
      expect(rosterJs).toContain("group: 'asset'");
    });
  });

  // ===== Audit Trail =====
  describe("Audit Trail", () => {
    it("should pass _actor_ohr and _actor_name in PATCH requests", () => {
      expect(rosterJs).toContain("_actor_ohr");
      expect(rosterJs).toContain("_actor_name");
    });

    it("should have inline audit trail in detail card", () => {
      expect(rosterJs).toContain("Audit Trail");
      expect(rosterJs).toContain("audit-log");
    });

    it("PATCH endpoint should extract _actor_ohr and _actor_name", () => {
      expect(employeesModule).toContain("rawBody._actor_ohr");
      expect(employeesModule).toContain("rawBody._actor_name");
    });

    it("PATCH endpoint should log field-level changes to io_audit_log", () => {
      expect(employeesModule).toContain("record_type: 'io_employees'");
      expect(employeesModule).toContain("action: 'UPDATE'");
      expect(employeesModule).toContain("field_name: key");
    });
  });

  // ===== CSV Export =====
  describe("CSV Export", () => {
    it("should have rosterExportCSV function", () => {
      expect(rosterJs).toContain("rosterExportCSV");
    });

    it("should export filtered data (not full dataset)", () => {
      expect(rosterJs).toContain("const data = ROSTER.filtered");
    });

    it("should respect role-based column visibility", () => {
      expect(rosterJs).toContain("const cols = ROSTER.getVisibleColumns()");
    });

    it("should include date stamp in filename", () => {
      expect(rosterJs).toContain("regimen-roster-");
      expect(rosterJs).toContain(".csv");
    });

    it("should have Export CSV button rendered dynamically in JS", () => {
      expect(rosterJs).toContain("roster-export-btn");
      expect(rosterJs).toContain("Export");
    });

    it("should properly escape CSV values", () => {
      expect(rosterJs).toContain("escCSV");
      expect(rosterJs).toContain('s.replace(/"/g, \'""\'');
    });

    it("should create blob and trigger download", () => {
      expect(rosterJs).toContain("new Blob([csv]");
      expect(rosterJs).toContain("URL.createObjectURL");
      expect(rosterJs).toContain("link.download");
    });
  });

  // ===== Incomplete Rostering =====
  describe("Incomplete Rostering Dashboard", () => {
    it("should have tab bar in HTML", () => {
      expect(indexHtml).toContain("regimen-tabs");
      expect(indexHtml).toContain("regimen-tab-roster");
      expect(indexHtml).toContain("regimen-tab-onboarding");
    });

    it("should have incomplete rostering panel in HTML", () => {
      expect(indexHtml).toContain("regimen-panel-onboarding");
      expect(indexHtml).toContain("onboarding-table");
    });

    it("should NOT have summary cards (removed per user request)", () => {
      expect(indexHtml).not.toContain("onboarding-summary");
    });

    it("should have rosterSwitchTab function", () => {
      expect(rosterJs).toContain("rosterSwitchTab");
    });

    it("should show onboarding tab only for admin OHR via RBAC", () => {
      expect(rosterJs).toContain("regimen.onboarding_tab");
    });

    it("should have IR_DISPLAY_COLUMNS covering all columns", () => {
      expect(rosterJs).toContain("IR_DISPLAY_COLUMNS");
      expect(rosterJs).toContain("IR_LABELS");
    });

    it("should have incompleteRosteringGetData function that computes missing fields", () => {
      expect(rosterJs).toContain("function incompleteRosteringGetData()");
      expect(rosterJs).toContain("missingFields");
      expect(rosterJs).toContain("isComplete");
    });

    it("should render table with Completion Rate, Missing Count, Missing Fields columns", () => {
      expect(rosterJs).toContain("Completion Rate");
      expect(rosterJs).toContain("Missing Count");
      expect(rosterJs).toContain("Missing Fields");
    });

    it("should render table with missing field indicators", () => {
      expect(rosterJs).toContain("IR_LABELS");
    });

    it("should have filter bar for Incomplete Rostering", () => {
      expect(indexHtml).toContain("ir-filter-bar");
      expect(indexHtml).toContain("ir-filter-pills");
      expect(rosterJs).toContain("irRenderFilterBar");
      expect(rosterJs).toContain("IR_STATE");
    });

    it("should have pagination in incomplete rostering tab", () => {
      expect(rosterJs).toContain("irRenderPagination");
      expect(rosterJs).toContain("_irPage");
    });

    it("should sort by most missing fields first", () => {
      expect(rosterJs).toContain("b.missingFields.length - a.missingFields.length");
    });
  });

  // ===== Regimen UI/UX Redesign =====
  describe("Regimen UI/UX Redesign (April 2026)", () => {
    const regimenCss = fs.readFileSync(path.join(__dirname, "../server/public/css/regimen-redesign.css"), "utf-8");

    it("should have regimen-redesign.css linked in HTML", () => {
      expect(indexHtml).toContain("regimen-redesign.css");
    });

    it("should scope all redesign CSS to #view-regimen", () => {
      expect(regimenCss).toContain("#view-regimen");
    });

    it("should use new regimen-table class instead of module-table", () => {
      expect(indexHtml).toContain('class="regimen-table"');
      expect(regimenCss).toContain(".regimen-table");
    });

    it("should use new regimen-table-wrapper class", () => {
      expect(indexHtml).toContain('class="regimen-table-wrapper"');
      expect(regimenCss).toContain(".regimen-table-wrapper");
    });

    it("should have sticky filter bar", () => {
      expect(regimenCss).toContain(".regimen-filter-bar");
      expect(regimenCss).toContain("position: sticky");
    });

    it("should have regimen-filter-toolbar for buttons + search + count", () => {
      expect(indexHtml).toContain("roster-filter-toolbar");
      expect(rosterJs).toContain("roster-filter-toolbar");
    });

    it("should have regimen-filter-pills container", () => {
      expect(indexHtml).toContain('class="regimen-filter-pills"');
      expect(rosterJs).toContain("roster-filter-pills");
    });

    it("should have status badges with active/inactive classes", () => {
      expect(regimenCss).toContain(".regimen-status-active");
      expect(regimenCss).toContain(".regimen-status-inactive");
      expect(rosterJs).toContain("regimen-status-badge");
    });

    it("should have inline detail panel with click-to-edit fields", () => {
      expect(regimenCss).toContain(".regimen-detail-panel");
      expect(regimenCss).toContain(".regimen-field-value.editable");
      expect(rosterJs).toContain("rosterStartFieldEdit");
    });

    it("should have expand indicator on rows", () => {
      expect(regimenCss).toContain(".regimen-expand-icon");
      expect(rosterJs).toContain("regimen-expand-icon");
    });

    it("should have detail section titles with accent bar", () => {
      expect(regimenCss).toContain(".regimen-detail-section-title");
      expect(regimenCss).toContain(".regimen-detail-section-title::before");
    });

    it("should have 3-column detail grid", () => {
      expect(regimenCss).toContain("grid-template-columns: repeat(3, 1fr)");
    });

    it("should have unsaved changes indicator", () => {
      expect(regimenCss).toContain(".regimen-unsaved-indicator");
      expect(rosterJs).toContain("roster-unsaved-");
    });

    it("should have redesigned pagination", () => {
      expect(regimenCss).toContain(".regimen-pagination");
      expect(regimenCss).toContain(".regimen-page-btn");
      expect(indexHtml).toContain('class="regimen-pagination"');
    });

    it("should have page size selector", () => {
      expect(regimenCss).toContain(".regimen-page-size-select");
      expect(rosterJs).toContain("regimen-page-size-select");
    });

    it("should have completion bar for IR tab", () => {
      expect(regimenCss).toContain(".ir-completion-bar");
      expect(regimenCss).toContain(".ir-bar-fill");
      expect(rosterJs).toContain("ir-completion-bar");
    });

    it("should have missing field tags for IR tab", () => {
      expect(regimenCss).toContain(".ir-missing-tag");
      expect(rosterJs).toContain("ir-missing-tag");
    });

    it("should have slide-down animation for detail panel", () => {
      expect(regimenCss).toContain("regimen-slide-down");
    });

    it("should track pending edits per employee", () => {
      expect(rosterJs).toContain("_pendingEdits");
    });

    it("should have tab styling in redesign CSS", () => {
      expect(regimenCss).toContain(".regimen-tab");
      expect(regimenCss).toContain(".regimen-tab.active");
    });
  });

  // ===== Onboarding Login Flow (Sign Up removed) =====
  describe("Onboarding Login Flow", () => {
    it("should NOT have a separate signup form — single login only", () => {
      expect(indexHtml).not.toContain("auth-form-signup");
      expect(indexHtml).not.toContain("signup-ohr");
      expect(indexHtml).not.toContain("handleSignUp()");
    });

    it("should have a single login form shown directly", () => {
      expect(indexHtml).toContain("auth-form-login");
      expect(indexHtml).toContain("login-ohr");
      expect(indexHtml).toContain("handleLogin()");
    });

    it("should NOT have old trainee/production choice screen", () => {
      expect(indexHtml).not.toContain("signup-choice");
      expect(indexHtml).not.toContain("I am a Trainee");
      expect(indexHtml).not.toContain("I am not a Trainee");
    });

    it("should have onboarding form in HTML", () => {
      expect(indexHtml).toContain("auth-form-onboarding");
      expect(indexHtml).toContain("Complete Your Profile");
    });

    it("should have all required onboarding fields", () => {
      expect(indexHtml).toContain("onboard-last-name");
      expect(indexHtml).toContain("onboard-given-name");
      expect(indexHtml).toContain("onboard-middle-name");
      expect(indexHtml).toContain("onboard-suffix");
      expect(indexHtml).toContain("onboard-chromebook");
      expect(indexHtml).toContain("onboard-hire-date");
      expect(indexHtml).toContain("onboard-dob");
      expect(indexHtml).toContain("onboard-personal-email");
      expect(indexHtml).toContain("onboard-contact");
      expect(indexHtml).toContain("onboard-address");
      expect(indexHtml).toContain("onboard-barangay");
      expect(indexHtml).toContain("onboard-city");
      expect(indexHtml).toContain("onboard-province");
      expect(indexHtml).toContain("onboard-badge-id");
      expect(indexHtml).toContain("onboard-badge-serial");
    });

    it("should have handleOnboardingSubmit function", () => {
      expect(appJs).toContain("async function handleOnboardingSubmit");
    });

    it("should validate email format", () => {
      expect(appJs).toContain("emailRegex");
    });

    it("should validate PH mobile number format", () => {
      expect(appJs).toContain("09\\d{9}");
    });

    it("should validate DOB age (16+)", () => {
      expect(appJs).toContain("at least 16 years old");
    });

    it("should send notifications to admin on onboarding", () => {
      expect(appJs).toContain("type: 'onboarding'");
      expect(appJs).toContain("New Agent Onboarding");
    });
  });
});
