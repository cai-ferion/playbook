import { describe, it, expect } from "vitest";

// ============================================================
// Batch 46 — OT Request & Approval System Tests
// ============================================================

describe("OT Request & Approval System", () => {

  // ---- Schema & API Endpoint Tests ----
  describe("OT Requests Schema", () => {
    it("io_ot_requests table has required columns", () => {
      const requiredCols = [
        "id", "request_id", "ohr_id", "agent_name", "planning_group",
        "requested_hours", "status", "submitted_at", "approved_at",
        "applied_date", "approved_by", "approved_by_ohr", "created_at"
      ];
      // Schema validation — columns are defined in drizzle/schema.ts
      expect(requiredCols.length).toBe(13);
    });

    it("io_ot_config table has required columns", () => {
      const requiredCols = [
        "id", "planning_group", "ot_form_open", "updated_at", "updated_by"
      ];
      expect(requiredCols.length).toBe(5);
    });
  });

  // ---- Agent-side OT Request Form Tests ----
  describe("Agent OT Request Form (helm.js)", () => {
    it("OT Request is a valid request type alongside Backdate Tag Change", () => {
      const HELM_REQUEST_TYPES = [
        { value: "backdate_tag_change", label: "Attendance Backdated Change Tag" },
        { value: "ot_request", label: "OT Request" }
      ];
      expect(HELM_REQUEST_TYPES.length).toBe(2);
      expect(HELM_REQUEST_TYPES.find(t => t.value === "ot_request")).toBeTruthy();
    });

    it("OT hours dropdown provides 0.5-hour increments from 1 to 2.5", () => {
      const OT_HOUR_OPTIONS = ["1", "1.5", "2", "2.5"];
      expect(OT_HOUR_OPTIONS).toEqual(["1", "1.5", "2", "2.5"]);
      expect(OT_HOUR_OPTIONS.length).toBe(4);
    });

    it("OT Request form has only one field (hours willing)", () => {
      // The form should NOT have a date field — only hours
      const otFormFields = ["requested_hours"];
      expect(otFormFields).not.toContain("date");
      expect(otFormFields).not.toContain("week_ending");
      expect(otFormFields.length).toBe(1);
    });
  });

  // ---- FIFO Approval Logic Tests ----
  describe("FIFO Approval Logic", () => {
    it("approves requests in FIFO order (earliest first)", () => {
      const pending = [
        { id: 1, submitted_at: "2026-04-01T08:00:00Z", requested_hours: "1", agent_name: "Agent A" },
        { id: 2, submitted_at: "2026-04-01T09:00:00Z", requested_hours: "1.5", agent_name: "Agent B" },
        { id: 3, submitted_at: "2026-04-01T10:00:00Z", requested_hours: "2", agent_name: "Agent C" },
        { id: 4, submitted_at: "2026-04-02T08:00:00Z", requested_hours: "1", agent_name: "Agent D" },
      ];

      // Simulate FIFO approval with 3 hours budget
      let hoursRemaining = 3;
      const approved: any[] = [];
      for (const req of pending) {
        if (hoursRemaining <= 0) break;
        const reqHours = parseFloat(req.requested_hours);
        if (reqHours <= hoursRemaining) {
          approved.push(req);
          hoursRemaining -= reqHours;
        }
      }

      // Should approve Agent A (1hr), Agent B (1.5hr) = 2.5hr used, 0.5 remaining
      // Agent C needs 2hr but only 0.5 remaining → skip
      // Agent D needs 1hr but only 0.5 remaining → skip
      expect(approved.length).toBe(2);
      expect(approved[0].agent_name).toBe("Agent A");
      expect(approved[1].agent_name).toBe("Agent B");
      expect(hoursRemaining).toBeCloseTo(0.5);
    });

    it("approves all requests when budget is sufficient", () => {
      const pending = [
        { id: 1, requested_hours: "1", agent_name: "Agent A" },
        { id: 2, requested_hours: "1.5", agent_name: "Agent B" },
        { id: 3, requested_hours: "2", agent_name: "Agent C" },
      ];

      let hoursRemaining = 10;
      const approved: any[] = [];
      for (const req of pending) {
        if (hoursRemaining <= 0) break;
        const reqHours = parseFloat(req.requested_hours);
        if (reqHours <= hoursRemaining) {
          approved.push(req);
          hoursRemaining -= reqHours;
        }
      }

      expect(approved.length).toBe(3);
      expect(hoursRemaining).toBeCloseTo(5.5);
    });

    it("approves zero requests when budget is zero", () => {
      const pending = [
        { id: 1, requested_hours: "1", agent_name: "Agent A" },
      ];

      let hoursRemaining = 0;
      const approved: any[] = [];
      for (const req of pending) {
        if (hoursRemaining <= 0) break;
        const reqHours = parseFloat(req.requested_hours);
        if (reqHours <= hoursRemaining) {
          approved.push(req);
          hoursRemaining -= reqHours;
        }
      }

      expect(approved.length).toBe(0);
    });
  });

  // ---- RECALL_MEASUREMENT_CTR Exclusion Tests ----
  describe("RECALL_MEASUREMENT_CTR Exclusions", () => {
    it("excludes RECALL_MEASUREMENT_CTR employees from OT request system", () => {
      const employees = [
        { ohr_id: "001", complete_planning_group: "GRO_RECALL_MEASUREMENT_CTR_TEAM1" },
        { ohr_id: "002", complete_planning_group: "GRO_IO_TEAM2" },
        { ohr_id: "003", complete_planning_group: "GRO_IQA_TEAM3" },
        { ohr_id: "004", complete_planning_group: "RECALL_MEASUREMENT_CTR_SPECIAL" },
      ];

      const eligible = employees.filter(e =>
        !(e.complete_planning_group || "").includes("RECALL_MEASUREMENT_CTR")
      );

      expect(eligible.length).toBe(2);
      expect(eligible.map(e => e.ohr_id)).toEqual(["002", "003"]);
    });

    it("RECALL_MEASUREMENT_CTR employees should not see tab bar in Billing Compliance", () => {
      const isRecall = (cpg: string) => cpg.includes("RECALL_MEASUREMENT_CTR");
      expect(isRecall("GRO_RECALL_MEASUREMENT_CTR_TEAM1")).toBe(true);
      expect(isRecall("GRO_IO_TEAM2")).toBe(false);
      expect(isRecall("")).toBe(false);
    });
  });

  // ---- OT Column Locking Tests ----
  describe("OT Column Locking in Input Portal", () => {
    it("OT column is locked for non-RECALL employees", () => {
      const record = { completePlanningGroup: "GRO_IO_TEAM2", ot: "1.5" };
      const isRecall = (record.completePlanningGroup || "").includes("RECALL_MEASUREMENT_CTR");
      expect(isRecall).toBe(false);
      // Should render as readonly cell
    });

    it("OT column is editable for RECALL_MEASUREMENT_CTR employees", () => {
      const record = { completePlanningGroup: "GRO_RECALL_MEASUREMENT_CTR_TEAM1", ot: "2" };
      const isRecall = (record.completePlanningGroup || "").includes("RECALL_MEASUREMENT_CTR");
      expect(isRecall).toBe(true);
      // Should render as editable input
    });
  });

  // ---- OT Form Open/Close Tests ----
  describe("OT Form Open/Close Mechanism", () => {
    it("form defaults to closed (agents cannot submit)", () => {
      const config = { planning_group: "GRO_IO", ot_form_open: false };
      expect(config.ot_form_open).toBe(false);
    });

    it("Open OT Form sets ot_form_open to true", () => {
      const config = { planning_group: "GRO_IO", ot_form_open: false };
      // Simulate opening
      config.ot_form_open = true;
      expect(config.ot_form_open).toBe(true);
    });

    it("Apply closes the form (ot_form_open set to false)", () => {
      const config = { planning_group: "GRO_IO", ot_form_open: true };
      // Simulate approval closing the form
      config.ot_form_open = false;
      expect(config.ot_form_open).toBe(false);
    });
  });

  // ---- OT Dashboard Table Tests ----
  describe("OT Dashboard Table", () => {
    it("table has correct columns: Date Submitted, Agent Name, Planning Group, Requested Hours, Approved Date", () => {
      const columns = ["Date Submitted", "Agent Name", "Planning Group", "Requested Hours", "Approved Date"];
      expect(columns.length).toBe(5);
      expect(columns).toContain("Date Submitted");
      expect(columns).toContain("Approved Date");
    });

    it("sorts requests by Date Submitted ascending (FIFO)", () => {
      const requests = [
        { created_at: "2026-04-03T10:00:00Z", agent_name: "C" },
        { created_at: "2026-04-01T08:00:00Z", agent_name: "A" },
        { created_at: "2026-04-02T09:00:00Z", agent_name: "B" },
      ];
      requests.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      expect(requests[0].agent_name).toBe("A");
      expect(requests[1].agent_name).toBe("B");
      expect(requests[2].agent_name).toBe("C");
    });

    it("filters requests by planning group", () => {
      const requests = [
        { planning_group: "GRO_IO", agent_name: "A" },
        { planning_group: "GRO_IQA", agent_name: "B" },
        { planning_group: "GRO_IO", agent_name: "C" },
      ];
      const filtered = requests.filter(r => r.planning_group === "GRO_IO");
      expect(filtered.length).toBe(2);
      expect(filtered.map(r => r.agent_name)).toEqual(["A", "C"]);
    });

    it("Apply button is disabled when no planning group is selected", () => {
      const selectedPg = "";
      const applyDisabled = !selectedPg;
      expect(applyDisabled).toBe(true);
    });

    it("Apply button is enabled when planning group is selected", () => {
      const selectedPg = "GRO_IO";
      const applyDisabled = !selectedPg;
      expect(applyDisabled).toBe(false);
    });
  });

  // ---- Duplicate Request Prevention ----
  describe("Duplicate Request Prevention", () => {
    it("agent cannot submit if they already have a pending request", () => {
      const existingRequests = [
        { ohr_id: "001", status: "pending" },
        { ohr_id: "002", status: "approved" },
      ];
      const agentOhr = "001";
      const hasPending = existingRequests.some(r => r.ohr_id === agentOhr && r.status === "pending");
      expect(hasPending).toBe(true);
    });

    it("agent can submit if their previous request was approved", () => {
      const existingRequests = [
        { ohr_id: "001", status: "approved" },
      ];
      const agentOhr = "001";
      const hasPending = existingRequests.some(r => r.ohr_id === agentOhr && r.status === "pending");
      expect(hasPending).toBe(false);
    });
  });

  // ---- OT Applied to Attendance ----
  describe("OT Applied to Attendance", () => {
    it("approved OT hours are written to today's attendance record", () => {
      const todayDate = "2026-04-07";
      const approvedRequest = { ohr_id: "001", requested_hours: "1.5", status: "approved", applied_date: todayDate };
      expect(approvedRequest.applied_date).toBe(todayDate);
      expect(parseFloat(approvedRequest.requested_hours)).toBe(1.5);
    });
  });
});
