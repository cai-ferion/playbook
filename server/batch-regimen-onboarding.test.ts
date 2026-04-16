import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Regimen Overhaul, Filter System, Onboarding Dashboard & CSV Export", () => {
  const rosterJs = fs.readFileSync(path.join(__dirname, "../server/public/js/roster.js"), "utf-8");
  const appJs = fs.readFileSync(path.join(__dirname, "../server/public/js/app.js"), "utf-8");
  const indexHtml = fs.readFileSync(path.join(__dirname, "../server/public/index.html"), "utf-8");
  const ioRoutes = fs.readFileSync(path.join(__dirname, "./io-routes.ts"), "utf-8");

  // ===== Compass Visibility =====
  describe("Compass Visibility", () => {
    it("should restrict Compass nav to admin OHR only", () => {
      // Now RBAC-driven via applyNavPermissions
      expect(appJs).toContain("applyNavPermissions");
      expect(appJs).toContain("vis('nav-group-compass', 'nav.compass')");
    });
  });

  // ===== Regimen Nav Visibility =====
  describe("Regimen Nav Visibility", () => {
    it("should show Regimen to all non-Agent roles", () => {
      // Now RBAC-driven via applyNavPermissions
      expect(appJs).toContain("vis('nav-regimen', 'nav.regimen')");
    });
  });

  // ===== Pill-based Filter System =====
  describe("Pill-based Filter System (Anchor/Compass pattern)", () => {
    it("should have rosterFilterState object with filters, sort, openPill", () => {
      expect(rosterJs).toContain("rosterFilterState");
      expect(rosterJs).toContain("filters: {}");
      expect(rosterJs).toContain("sort: null");
      expect(rosterJs).toContain("openPill: null");
    });

    it("should have rosterRenderFilterBar function", () => {
      expect(rosterJs).toContain("function rosterRenderFilterBar()");
    });

    it("should have rosterTogglePill function", () => {
      expect(rosterJs).toContain("rosterTogglePill");
    });

    it("should have Select All / Deselect All buttons", () => {
      expect(rosterJs).toContain("rosterSelectAll");
      expect(rosterJs).toContain("rosterDeselectAll");
      expect(rosterJs).toContain("Select All");
      expect(rosterJs).toContain("Deselect All");
    });

    it("should have debounced apply for instant filter updates", () => {
      expect(rosterJs).toContain("rosterDebouncedApply");
      expect(rosterJs).toContain("setTimeout(rosterApplyNow, 200)");
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

    it("should have search text filter", () => {
      expect(rosterJs).toContain("roster-search-input");
      expect(rosterJs).toContain("rosterRenderTextDropdown");
    });

    it("should have multi-select dropdown with checkboxes", () => {
      expect(rosterJs).toContain("rosterRenderMultiDropdown");
      expect(rosterJs).toContain("rosterOnCheckboxChange");
    });

    it("should have sort buttons in sortable dropdowns", () => {
      expect(rosterJs).toContain("rosterSetSort");
      expect(rosterJs).toContain("filter-sort-btn");
    });

    it("should have outside click handler", () => {
      expect(rosterJs).toContain("_attachRosterOutsideClick");
      expect(rosterJs).toContain("_detachRosterOutsideClick");
    });

    it("should have Clear Filters button", () => {
      expect(rosterJs).toContain("rosterClearAllFilters");
      expect(rosterJs).toContain("Clear Filters");
    });

    it("should default all multi-select filters to 'All' (all selected)", () => {
      // Default: no entry in filters = all selected
      expect(rosterJs).toContain("var selectedSet = new Set(f ? f.values : values)");
    });

    it("should have dropdown search for searchable fields", () => {
      expect(rosterJs).toContain("rosterFilterDropdownSearch");
      expect(rosterJs).toContain("roster-dd-search-");
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

    it("should have visibilityTier property", () => {
      expect(rosterJs).toContain("visibilityTier");
    });

    it("should determine visibility based on role", () => {
      expect(rosterJs).toContain("rosterDeterminePermissions");
    });

    it("LIMITED_COLUMNS should have 22 columns", () => {
      const limitedMatch = rosterJs.match(/LIMITED_COLUMNS:\s*\[([\s\S]*?)\],/);
      expect(limitedMatch).toBeTruthy();
      const entries = limitedMatch![1].match(/\{ key:/g);
      expect(entries).toBeTruthy();
      expect(entries!.length).toBe(22);
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
    it("should have EDITOR_OHRS array with 3 OHRs", () => {
      expect(rosterJs).toContain("EDITOR_OHRS");
      expect(rosterJs).toContain("'740045023'");
      expect(rosterJs).toContain("'740044909'");
      expect(rosterJs).toContain("'703212987'");
    });

    it("should use canEdit flag", () => {
      expect(rosterJs).toContain("ROSTER.canEdit");
    });

    it("should check DB permission for edit access", () => {
      expect(rosterJs).toContain("regimen.edit_employee");
    });
  });

  // ===== Column Grouping =====
  describe("Regimen Column Grouping", () => {
    it("should have Identity group", () => {
      expect(rosterJs).toContain("group: 'Identity'");
    });

    it("should have Role & Assignment group", () => {
      expect(rosterJs).toContain("group: 'Role & Assignment'");
    });

    it("should have System IDs group", () => {
      expect(rosterJs).toContain("group: 'System IDs'");
    });

    it("should have Dates group", () => {
      expect(rosterJs).toContain("group: 'Dates'");
    });

    it("should have Attrition group", () => {
      expect(rosterJs).toContain("group: 'Attrition'");
    });

    it("should have Asset & Logistics group", () => {
      expect(rosterJs).toContain("group: 'Asset & Logistics'");
    });
  });

  // ===== Audit Trail =====
  describe("Audit Trail", () => {
    it("should pass _actor_ohr and _actor_name in PATCH requests", () => {
      expect(rosterJs).toContain("_actor_ohr");
      expect(rosterJs).toContain("_actor_name");
    });

    it("should have rosterViewAuditTrail function", () => {
      expect(rosterJs).toContain("function rosterViewAuditTrail");
    });

    it("should have Audit Trail button in detail footer", () => {
      expect(rosterJs).toContain("Audit Trail");
    });

    it("PATCH endpoint should extract _actor_ohr and _actor_name", () => {
      expect(ioRoutes).toContain("rawBody._actor_ohr");
      expect(ioRoutes).toContain("rawBody._actor_name");
    });

    it("PATCH endpoint should log field-level changes to io_audit_log", () => {
      expect(ioRoutes).toContain("record_type: 'io_employees'");
      expect(ioRoutes).toContain("action: 'UPDATE'");
      expect(ioRoutes).toContain("field_name: key");
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
      expect(rosterJs).toContain("regimen-roster-${today}.csv");
    });

    it("should have Export CSV button in HTML", () => {
      expect(indexHtml).toContain("roster-export-btn");
      expect(indexHtml).toContain("Export CSV");
    });

    it("should properly escape CSV values", () => {
      expect(rosterJs).toContain("escCSV");
      expect(rosterJs).toContain('s.replace(/"/g, \'""\'');
    });

    it("should create blob and trigger download", () => {
      expect(rosterJs).toContain("new Blob([csv]");
      expect(rosterJs).toContain("URL.createObjectURL");
      expect(rosterJs).toContain("link.download = filename");
    });
  });

  // ===== Onboarding Dashboard =====
  describe("Onboarding Completion Dashboard", () => {
    it("should have tab bar in HTML", () => {
      expect(indexHtml).toContain("regimen-tabs");
      expect(indexHtml).toContain("regimen-tab-roster");
      expect(indexHtml).toContain("regimen-tab-onboarding");
    });

    it("should have onboarding panel in HTML", () => {
      expect(indexHtml).toContain("regimen-panel-onboarding");
      expect(indexHtml).toContain("onboarding-summary");
      expect(indexHtml).toContain("onboarding-table");
    });

    it("should have rosterSwitchTab function", () => {
      expect(rosterJs).toContain("rosterSwitchTab");
    });

    it("should show onboarding tab only for admin OHR", () => {
      expect(rosterJs).toContain("regimen.onboarding_tab");
    });

    it("should have ONBOARDING_REQUIRED_FIELDS array", () => {
      expect(rosterJs).toContain("ONBOARDING_REQUIRED_FIELDS");
      expect(rosterJs).toContain("'last_name'");
      expect(rosterJs).toContain("'given_name'");
      expect(rosterJs).toContain("'personal_email'");
      expect(rosterJs).toContain("'contact_number'");
      expect(rosterJs).toContain("'badge_id'");
    });

    it("should have onboardingGetData function that computes completion status", () => {
      expect(rosterJs).toContain("function onboardingGetData()");
      expect(rosterJs).toContain("hasPassword");
      expect(rosterJs).toContain("missingFields");
      expect(rosterJs).toContain("isComplete");
    });

    it("should render summary cards with total, completed, pending, no account, rate", () => {
      expect(rosterJs).toContain("Total Employees");
      expect(rosterJs).toContain("Completed");
      expect(rosterJs).toContain("Pending");
      expect(rosterJs).toContain("No Account");
      expect(rosterJs).toContain("Completion Rate");
    });

    it("should render table with missing field indicators", () => {
      expect(rosterJs).toContain("Missing Fields");
      expect(rosterJs).toContain("ONBOARDING_FIELD_LABELS");
      expect(rosterJs).toContain("All fields complete");
    });

    it("should have search functionality in onboarding tab", () => {
      expect(indexHtml).toContain("onboarding-search");
      expect(rosterJs).toContain("onboardingRenderTable");
    });

    it("should have pagination in onboarding tab", () => {
      expect(rosterJs).toContain("onboardingRenderPagination");
      expect(rosterJs).toContain("_onboardingPage");
    });

    it("should sort pending employees first", () => {
      expect(rosterJs).toContain("if (a.isComplete !== b.isComplete) return a.isComplete ? 1 : -1");
    });
  });

  // ===== Onboarding Signup Flow =====
  describe("Onboarding Signup Flow", () => {
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

    it("should send notifications to admin and assistant on onboarding", () => {
      expect(appJs).toContain("type: 'onboarding'");
      expect(appJs).toContain("New Agent Onboarding");
    });
  });
});
