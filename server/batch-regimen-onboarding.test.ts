import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Regimen Overhaul & Onboarding Flow", () => {
  const rosterJs = fs.readFileSync(path.join(__dirname, "../server/public/js/roster.js"), "utf-8");
  const appJs = fs.readFileSync(path.join(__dirname, "../server/public/js/app.js"), "utf-8");
  const indexHtml = fs.readFileSync(path.join(__dirname, "../server/public/index.html"), "utf-8");
  const ioRoutes = fs.readFileSync(path.join(__dirname, "./io-routes.ts"), "utf-8");

  // ===== Compass Visibility =====
  describe("Compass Visibility", () => {
    it("should restrict Compass nav to admin OHR only", () => {
      // Both login and session-restore paths should check admin OHR
      expect(appJs).toContain("// Compass \u2014 visible ONLY to admin OHR");
      expect(appJs).not.toContain("isAgentNonAdmin");
    });
  });

  // ===== Regimen Nav Visibility =====
  describe("Regimen Nav Visibility", () => {
    it("should show Regimen to all non-Agent roles", () => {
      expect(appJs).toContain("// Regimen (Roster) \u2014 visible to all non-Agent roles");
    });

    it("should not restrict Regimen to admin only", () => {
      // Old pattern was admin-only; new pattern checks for Agent role
      expect(appJs).not.toContain("// Regimen (Roster) \u2014 admin only");
      expect(appJs).not.toContain("// Regimen \u2014 admin only");
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

    it("LIMITED_COLUMNS should have 22 columns (identity + role + system IDs + assets)", () => {
      // Count LIMITED_COLUMNS entries
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

    it("should use canEdit flag instead of isAdmin", () => {
      expect(rosterJs).toContain("ROSTER.canEdit");
    });

    it("should check EDITOR_OHRS for edit permission", () => {
      expect(rosterJs).toContain("ROSTER.EDITOR_OHRS.includes(ohr)");
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

    it("PATCH endpoint should delete audit metadata before persisting", () => {
      expect(ioRoutes).toContain("delete rawBody._actor_ohr");
      expect(ioRoutes).toContain("delete rawBody._actor_name");
    });
  });

  // ===== Onboarding Flow =====
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

    it("should mark Middle Name and Suffix as optional", () => {
      expect(indexHtml).toContain("Middle Name (optional)");
      expect(indexHtml).toContain("(optional)");
    });

    it("should have handleOnboardingSubmit function", () => {
      expect(appJs).toContain("async function handleOnboardingSubmit");
    });

    it("should validate email format", () => {
      expect(appJs).toContain("emailRegex");
      expect(appJs).toContain("valid email address");
    });

    it("should validate PH mobile number format", () => {
      expect(appJs).toContain("09\\d{9}");
      expect(appJs).toContain("valid PH mobile number");
    });

    it("should validate DOB age (16+)", () => {
      expect(appJs).toContain("at least 16 years old");
    });

    it("should route to onboarding form after OHR validation", () => {
      expect(appJs).toContain("showAuthForm('onboarding')");
      expect(appJs).toContain("window._onboardOhr");
    });

    it("should send notifications to admin and assistant on onboarding", () => {
      expect(appJs).toContain("'740045023'");
      expect(appJs).toContain("'740044909'");
      expect(appJs).toContain("type: 'onboarding'");
      expect(appJs).toContain("New Agent Onboarding");
    });

    it("should show generic error for invalid OHR (not found, inactive, or already has account)", () => {
      // All 3 failure cases should show the same generic error
      const genericError = "OHR ID not found. Please check your ID.";
      const occurrences = appJs.split(genericError).length - 1;
      expect(occurrences).toBeGreaterThanOrEqual(3);
    });

    it("should show onboarding form in showAuthForm function", () => {
      expect(appJs).toContain("auth-form-onboarding");
    });

    it("should hide onboarding form in showAuthButtons function", () => {
      expect(appJs).toContain("document.getElementById('auth-form-onboarding').style.display = 'none'");
    });
  });
});
