import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Batch 48 — Filter fix, Session Goals, CAP system, NTE", () => {
  const compassJs = fs.readFileSync(
    path.resolve(__dirname, "public/js/compass.js"),
    "utf-8"
  );
  const omnibarJs = fs.readFileSync(
    path.resolve(__dirname, "public/js/compass-omnibar.js"),
    "utf-8"
  );
  const ioRoutes = [__dirname + "/io/shared.ts", __dirname + "/io/attendance-ops.ts", __dirname + "/io/attendance.ts", __dirname + "/io/audit-log.ts", __dirname + "/io/billing.ts", __dirname + "/io/coaching.ts", __dirname + "/io/corrective-actions.ts", __dirname + "/io/employees.ts", __dirname + "/io/insights.ts", __dirname + "/io/leaves.ts", __dirname + "/io/notifications.ts", __dirname + "/io/permissions.ts", __dirname + "/io/tasks.ts", __dirname + "/io/wfm.ts"].map(f => require("fs").readFileSync(f, "utf-8")).join("\n");
  const schema = fs.readFileSync(
    path.resolve(__dirname, "../drizzle/schema.ts"),
    "utf-8"
  );

  // ===== Filter Dropdown Fix =====
  describe("Filter dropdown fix", () => {
    it("omnibar uses COMPASS (not window.COMPASS) for getAllValues", () => {
      // The IIFE should reference COMPASS directly since it's const-scoped
      expect(omnibarJs).not.toContain("window.COMPASS");
      expect(omnibarJs).toContain("COMPASS.logs");
    });
  });

  // ===== Session Goals =====
  describe("Session Goals reduced to 8", () => {
    const goals = [
      "AES/Scorecard Discussion",
      "Attendance & Tardiness",
      "Compliance & Behavior",
      "Escalation",
      "Internal Discussion",
      "Performance & Metrics",
      "Performance Improvement Plan",
      "Professional & Personal Development",
    ];

    it("contains all 8 new session goal options", () => {
      for (const goal of goals) {
        expect(compassJs).toContain(`value="${goal}"`);
      }
    });

    it("has color mappings for all 8 new goals", () => {
      for (const goal of goals) {
        expect(compassJs).toContain(`'${goal}':`);
      }
    });

    it("does not contain old goals as form options (only in legacy color map)", () => {
      // Old goals should NOT appear as checkbox options
      const formSection = compassJs.match(
        /compass-goal-dropdown[\s\S]*?<\/div>/
      );
      expect(formSection).toBeTruthy();
      const formHtml = formSection![0];
      expect(formHtml).not.toContain('value="AHT Performance Findings"');
      expect(formHtml).not.toContain('value="PKT Result"');
      expect(formHtml).not.toContain('value="Leave & Work Offset"');
    });
  });

  // ===== CAP Level =====
  describe("CAP Level system", () => {
    it("has cap_level column in ioCoaching schema", () => {
      expect(schema).toContain('cap_level: varchar("cap_level"');
    });

    it("has ioCoachingNte table in schema", () => {
      expect(schema).toContain('ioCoachingNte = mysqlTable("io_coaching_nte"');
    });

    it("NTE schema has all required fields", () => {
      expect(schema).toContain('coaching_id: varchar("coaching_id"');
      expect(schema).toContain('employee_name: varchar("employee_name"');
      expect(schema).toContain('ohr_id: varchar("ohr_id"');
      expect(schema).toContain('date_of_incident: varchar("date_of_incident"');
      expect(schema).toContain('incident_description: text("incident_description"');
      expect(schema).toContain('policy_violated: text("policy_violated"');
      expect(schema).toContain('expected_behavior: text("expected_behavior"');
      expect(schema).toContain('deadline_for_improvement: varchar("deadline_for_improvement"');
      expect(schema).toContain('issued_by: varchar("issued_by"');
    });

    it("CAP section HTML and functions fully removed (CAP will be dedicated page)", () => {
      // CAP level section HTML, compassOnCapLevelChange, and compassGetSelectedCapLevel all removed
      expect(compassJs).not.toContain('function compassOnCapLevelChange()');
      expect(compassJs).not.toContain('function compassGetSelectedCapLevel()');
      // Comment marker remains
      expect(compassJs).toContain('CAP removed');
    });

    it("cap_level is included in the coaching record payload", () => {
      expect(compassJs).toContain("cap_level: capLevel || null");
    });

    it("NTE flow is disabled in Add form (CAP will be dedicated page)", () => {
      // shouldOpenNte is always false now — NTE flow disabled
      expect(compassJs).toContain("const shouldOpenNte = false");
      // compassOpenNteForm still exists for viewing existing NTEs
      expect(compassJs).toContain("compassOpenNteForm");
    });
  });

  // ===== NTE Form =====
  describe("NTE Form", () => {
    it("compassOpenNteForm function exists", () => {
      expect(compassJs).toContain("function compassOpenNteForm(params)");
    });

    it("compassSubmitNte function exists", () => {
      expect(compassJs).toContain("async function compassSubmitNte()");
    });

    it("compassViewNte function exists for detail view", () => {
      expect(compassJs).toContain("async function compassViewNte(coachingId)");
    });

    it("compassOpenNteDetail function exists", () => {
      expect(compassJs).toContain("function compassOpenNteDetail(nte)");
    });

    it("NTE form has all required input fields", () => {
      expect(compassJs).toContain("nte-employee-name");
      expect(compassJs).toContain("nte-ohr-id");
      expect(compassJs).toContain("nte-cap-level");
      expect(compassJs).toContain("nte-date-of-incident");
      expect(compassJs).toContain("nte-incident-desc");
      expect(compassJs).toContain("nte-policy-violated");
      // Expected behavior and deadline fields removed from NTE form
    });

    it("NTE form validates required fields", () => {
      expect(compassJs).toContain("Please enter the date and time of incident");
      expect(compassJs).toContain("Please describe the incident");
      expect(compassJs).toContain("Please specify the policy violated");
      // Expected behavior validation removed — field no longer in form
    });

    it("NTE form fetches previous warnings for the employee", () => {
      expect(compassJs).toContain("coaching-nte?ohr_id=");
    });
  });

  // ===== NTE API Routes =====
  describe("NTE API Routes", () => {
    it("io-routes imports ioCoachingNte", () => {
      expect(ioRoutes).toContain("ioCoachingNte");
    });

    it("has GET /coaching-nte route", () => {
      expect(ioRoutes).toContain('"/coaching-nte"');
      expect(ioRoutes).toContain("coaching-nte GET error");
    });

    it("has POST /coaching-nte route", () => {
      expect(ioRoutes).toContain("coaching-nte POST error");
    });

    it("has PATCH /coaching-nte/:id route", () => {
      expect(ioRoutes).toContain('"/coaching-nte/:id"');
      expect(ioRoutes).toContain("coaching-nte PATCH error");
    });

    it("GET supports filtering by coaching_id and ohr_id", () => {
      expect(ioRoutes).toContain("coaching_id, ohr_id");
    });
  });

  // ===== Detail View CAP Badge =====
  describe("Detail view CAP badge", () => {
    it("shows CAP level badge in detail view when cap_level is set", () => {
      expect(compassJs).toContain("log.cap_level");
      expect(compassJs).toContain("View NTE");
    });
  });

  // ===== General Coaching renamed =====
  describe("General Coaching renamed to CAP 0 Coaching", () => {
    it("does not contain General Coaching in COACHING_TYPES", () => {
      const typesMatch = compassJs.match(/COACHING_TYPES\s*=\s*\[([^\]]+)\]/);
      if (typesMatch) {
        expect(typesMatch[1]).not.toContain("General Coaching");
        expect(typesMatch[1]).toContain("CAP 0 Coaching");
      }
    });
  });
});
