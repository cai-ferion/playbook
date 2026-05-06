/**
 * Vitest tests for Zod validation schemas (server/io/validation.ts)
 * Covers: coaching, leaves, attendance schemas + validate middleware
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import {
  validate,
  setValidationLogger,
  _resetVolumeCap,
  coachingCreateSchema,
  coachingUpdateSchema,
  coachingRcaCreateSchema,
  leaveCreateSchema,
  leavesBulkActionSchema,
  leaveCancelSchema,
  attendanceBulkImportSchema,
  attendanceBulkTagSchema,
} from "./io/validation";
import type { ValidationRejection } from "./io/validation";

// ── Helper: mock Express req/res/next for middleware tests ───────
function mockReqResNext(body: any, source: "body" | "query" = "body") {
  const req: any = { body: {}, query: {} };
  req[source] = body;
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const next = vi.fn();
  return { req, res, next };
}

// ================================================================
// validate() middleware
// ================================================================
describe("validate() middleware", () => {
  it("calls next() on valid input", () => {
    const schema = coachingCreateSchema;
    const { req, res, next } = mockReqResNext({
      coaching_type: "General Coaching",
      coach_ohr: "12345",
      coaching_date: "2025-06-15T10:30:00",
      coachee_ohr: "67890",
    });
    validate(schema)(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 400 with error details on invalid input", () => {
    const schema = coachingCreateSchema;
    const { req, res, next } = mockReqResNext({
      // missing coaching_type, coach_ohr, coaching_date, coachee_ohr
    });
    validate(schema)(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.any(String),
        details: expect.any(Array),
        fieldErrors: expect.any(Object),
      })
    );
  });

  it("replaces req.body with parsed data (coerced + defaults)", () => {
    const schema = attendanceBulkImportSchema;
    const { req, res, next } = mockReqResNext({
      creates: [{ id: "A1", ohr_id: "123", log_date: "2025-06-15" }],
    });
    validate(schema)(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    // updates should be defaulted to []
    expect(req.body.updates).toEqual([]);
  });
});

// ================================================================
// Coaching schemas
// ================================================================
describe("coachingCreateSchema", () => {
  const valid = {
    coaching_type: "General Coaching",
    coach_ohr: "12345",
    coaching_date: "2025-06-15T10:30:00",
    coachee_ohr: "67890",
  };

  it("accepts valid minimal payload", () => {
    expect(coachingCreateSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts payload with coachee_list as array", () => {
    const result = coachingCreateSchema.safeParse({
      ...valid,
      coachee_list: ["Agent A", "Agent B"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts payload with coachee_list as null", () => {
    const result = coachingCreateSchema.safeParse({
      ...valid,
      coachee_list: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing coaching_type", () => {
    const { coaching_type, ...rest } = valid;
    const result = coachingCreateSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing coach_ohr", () => {
    const { coach_ohr, ...rest } = valid;
    const result = coachingCreateSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects invalid date format", () => {
    const result = coachingCreateSchema.safeParse({
      ...valid,
      coaching_date: "June 15 2025",
    });
    expect(result.success).toBe(false);
  });

  it("passes through unknown fields (backward compat)", () => {
    const result = coachingCreateSchema.safeParse({
      ...valid,
      custom_field: "hello",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).custom_field).toBe("hello");
    }
  });
});

describe("coachingUpdateSchema", () => {
  it("accepts empty object (all fields optional)", () => {
    expect(coachingUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("accepts partial update with coaching_type only", () => {
    const result = coachingUpdateSchema.safeParse({ coaching_type: "Triad Coaching" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid date format", () => {
    const result = coachingUpdateSchema.safeParse({ coaching_date: "not-a-date" });
    expect(result.success).toBe(false);
  });
});

describe("coachingRcaCreateSchema", () => {
  it("accepts valid RCA payload", () => {
    const result = coachingRcaCreateSchema.safeParse({
      coaching_id: "CL-abc123def456",
      level_1_category: "Performance",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing coaching_id", () => {
    const result = coachingRcaCreateSchema.safeParse({
      level_1_category: "Performance",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty coaching_id", () => {
    const result = coachingRcaCreateSchema.safeParse({
      coaching_id: "",
    });
    expect(result.success).toBe(false);
  });
});

// ================================================================
// Leaves schemas
// ================================================================
describe("leaveCreateSchema", () => {
  const valid = {
    leave_type: "Vacation Leave",
    ohr_id: "12345",
    full_name: "John Doe",
    start_date: "2025-07-01",
  };

  it("accepts valid minimal payload", () => {
    expect(leaveCreateSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts payload with all optional fields", () => {
    const result = leaveCreateSchema.safeParse({
      ...valid,
      end_date: "2025-07-03",
      supervisor: "Jane Smith",
      reason: "Family vacation",
      planning_group: "PG-Alpha",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing leave_type", () => {
    const { leave_type, ...rest } = valid;
    expect(leaveCreateSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing ohr_id", () => {
    const { ohr_id, ...rest } = valid;
    expect(leaveCreateSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing full_name", () => {
    const { full_name, ...rest } = valid;
    expect(leaveCreateSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects invalid start_date format", () => {
    const result = leaveCreateSchema.safeParse({
      ...valid,
      start_date: "July 1",
    });
    expect(result.success).toBe(false);
  });
});

describe("leavesBulkActionSchema", () => {
  it("accepts valid approve payload", () => {
    const result = leavesBulkActionSchema.safeParse({
      leave_ids: ["LV-1777643694240-5E7X", "LV-1777645057625-47VB", "LV-MOMZ1Z7B"],
      action: "approve",
      tier: "tl",
      reviewer_name: "TL Arvin",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid reject payload with reason", () => {
    const result = leavesBulkActionSchema.safeParse({
      leave_ids: ["LV-1777645084141-P4GJ"],
      action: "reject",
      tier: "om",
      rejection_reason: "Insufficient staffing",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty leave_ids array", () => {
    const result = leavesBulkActionSchema.safeParse({
      leave_ids: [],
      action: "approve",
      tier: "tl",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid action value", () => {
    const result = leavesBulkActionSchema.safeParse({
      leave_ids: ["LV-123"],
      action: "cancel",
      tier: "tl",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid tier value", () => {
    const result = leavesBulkActionSchema.safeParse({
      leave_ids: ["LV-123"],
      action: "approve",
      tier: "admin",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty string leave_ids", () => {
    const result = leavesBulkActionSchema.safeParse({
      leave_ids: [""],
      action: "approve",
      tier: "tl",
    });
    expect(result.success).toBe(false);
  });

  it("rejects extra unknown fields (strict mode)", () => {
    const result = leavesBulkActionSchema.safeParse({
      leave_ids: ["LV-123"],
      action: "approve",
      tier: "tl",
      hacker_field: "injection",
    });
    expect(result.success).toBe(false);
  });
});

describe("leaveCancelSchema", () => {
  it("accepts valid cancel payload", () => {
    expect(leaveCancelSchema.safeParse({ leave_id: 42 }).success).toBe(true);
  });

  it("rejects negative leave_id", () => {
    expect(leaveCancelSchema.safeParse({ leave_id: -1 }).success).toBe(false);
  });

  it("rejects string leave_id", () => {
    expect(leaveCancelSchema.safeParse({ leave_id: "abc" }).success).toBe(false);
  });
});

// ================================================================
// Attendance schemas
// ================================================================
describe("attendanceBulkImportSchema", () => {
  it("accepts valid creates-only payload", () => {
    const result = attendanceBulkImportSchema.safeParse({
      creates: [
        { id: "12345_2025-06-15", ohr_id: "12345", log_date: "2025-06-15" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid updates-only payload", () => {
    const result = attendanceBulkImportSchema.safeParse({
      updates: [
        { id: 1, tag: "Present" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts mixed creates + updates payload", () => {
    const result = attendanceBulkImportSchema.safeParse({
      creates: [
        { id: "12345_2025-06-15", ohr_id: "12345", log_date: "2025-06-15" },
      ],
      updates: [
        { id: 1, tag: "Absent" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("defaults updates to empty array when omitted", () => {
    const result = attendanceBulkImportSchema.safeParse({
      creates: [
        { id: "A1", ohr_id: "123", log_date: "2025-06-15" },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.updates).toEqual([]);
    }
  });

  it("rejects empty payload (no creates or updates)", () => {
    const result = attendanceBulkImportSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects create row missing ohr_id", () => {
    const result = attendanceBulkImportSchema.safeParse({
      creates: [
        { id: "A1", log_date: "2025-06-15" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects create row with invalid log_date", () => {
    const result = attendanceBulkImportSchema.safeParse({
      creates: [
        { id: "A1", ohr_id: "123", log_date: "not-a-date" },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("attendanceBulkTagSchema", () => {
  it("accepts valid payload", () => {
    const result = attendanceBulkTagSchema.safeParse({
      ids: ["A1", "A2", "A3"],
      tag: "Present",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty ids array", () => {
    const result = attendanceBulkTagSchema.safeParse({
      ids: [],
      tag: "Present",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing tag", () => {
    const result = attendanceBulkTagSchema.safeParse({
      ids: ["A1"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects tag exceeding 50 chars", () => {
    const result = attendanceBulkTagSchema.safeParse({
      ids: ["A1"],
      tag: "A".repeat(51),
    });
    expect(result.success).toBe(false);
  });

  it("rejects extra unknown fields (strict mode)", () => {
    const result = attendanceBulkTagSchema.safeParse({
      ids: ["A1"],
      tag: "Present",
      extra: "bad",
    });
    expect(result.success).toBe(false);
  });
});

// ================================================================
// Permissions schemas
// ================================================================
import {
  permissionsUpdateSchema,
  permissionsSeedSchema,
  permissionsBulkKeyUpdateSchema,
  roleChangeGenerateSchema,
  correctiveActionCreateSchema,
  correctiveActionUpdateSchema,
  nteBuildAssistGenerateSchema,
  nteBuildAssistDocxSchema,
  capBuildAssistGenerateSchema,
  capBuildAssistDocxSchema,
} from "./io/validation";

describe("permissionsUpdateSchema", () => {
  it("accepts valid permissions payload", () => {
    const result = permissionsUpdateSchema.safeParse({
      permissions: { can_view_coaching: true, can_edit_attendance: false },
      actor_ohr: "12345",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty permissions object", () => {
    const result = permissionsUpdateSchema.safeParse({
      permissions: {},
      actor_ohr: "12345",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-boolean permission values", () => {
    const result = permissionsUpdateSchema.safeParse({
      permissions: { can_view_coaching: "yes" },
    });
    expect(result.success).toBe(false);
  });

  it("passes through unknown fields (passthrough mode)", () => {
    const result = permissionsUpdateSchema.safeParse({
      permissions: { can_view_coaching: true },
      extra_field: "allowed",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).extra_field).toBe("allowed");
    }
  });
});

describe("permissionsSeedSchema", () => {
  it("accepts valid seed payload", () => {
    expect(permissionsSeedSchema.safeParse({ role: "Agent" }).success).toBe(true);
  });

  it("rejects missing role", () => {
    expect(permissionsSeedSchema.safeParse({}).success).toBe(false);
  });

  it("rejects empty role", () => {
    expect(permissionsSeedSchema.safeParse({ role: "" }).success).toBe(false);
  });

  it("rejects extra unknown fields (strict mode)", () => {
    const result = permissionsSeedSchema.safeParse({ role: "Agent", extra: "bad" });
    expect(result.success).toBe(false);
  });
});

describe("permissionsBulkKeyUpdateSchema", () => {
  it("accepts valid bulk key update", () => {
    const result = permissionsBulkKeyUpdateSchema.safeParse({
      permission_key: "can_view_coaching",
      granted: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing permission_key", () => {
    const result = permissionsBulkKeyUpdateSchema.safeParse({ granted: true });
    expect(result.success).toBe(false);
  });

  it("rejects non-boolean granted", () => {
    const result = permissionsBulkKeyUpdateSchema.safeParse({
      permission_key: "can_view_coaching",
      granted: "yes",
    });
    expect(result.success).toBe(false);
  });

  it("rejects extra unknown fields (strict mode)", () => {
    const result = permissionsBulkKeyUpdateSchema.safeParse({
      permission_key: "can_view_coaching",
      granted: true,
      extra: "bad",
    });
    expect(result.success).toBe(false);
  });
});

// ================================================================
// Role Change schemas
// ================================================================
describe("roleChangeGenerateSchema", () => {
  const validAssignment = {
    ohr_id: "12345",
    new_role: "Agent",
    new_pg: "S-ABF",
    date_from: "2025-07-01",
    date_to: "2025-07-04",
  };

  it("accepts valid generate payload", () => {
    const result = roleChangeGenerateSchema.safeParse({
      week_ending: "2025-07-04",
      assignments: [validAssignment],
    });
    expect(result.success).toBe(true);
  });

  it("accepts multiple assignments", () => {
    const result = roleChangeGenerateSchema.safeParse({
      week_ending: "2025-07-04",
      assignments: [
        validAssignment,
        { ...validAssignment, ohr_id: "67890", new_role: "Operational SME" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty assignments array", () => {
    const result = roleChangeGenerateSchema.safeParse({
      week_ending: "2025-07-04",
      assignments: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing week_ending", () => {
    const result = roleChangeGenerateSchema.safeParse({
      assignments: [validAssignment],
    });
    expect(result.success).toBe(false);
  });

  it("rejects assignment missing ohr_id", () => {
    const { ohr_id, ...rest } = validAssignment;
    const result = roleChangeGenerateSchema.safeParse({
      week_ending: "2025-07-04",
      assignments: [rest],
    });
    expect(result.success).toBe(false);
  });

  it("rejects assignment with invalid date_from format", () => {
    const result = roleChangeGenerateSchema.safeParse({
      week_ending: "2025-07-04",
      assignments: [{ ...validAssignment, date_from: "July 1" }],
    });
    expect(result.success).toBe(false);
  });

  it("passes through unknown fields on assignments (passthrough)", () => {
    const result = roleChangeGenerateSchema.safeParse({
      week_ending: "2025-07-04",
      assignments: [{ ...validAssignment, employee_name: "John Doe" }],
    });
    expect(result.success).toBe(true);
  });
});

// ================================================================
// Corrective Actions schemas
// ================================================================
describe("correctiveActionCreateSchema", () => {
  const valid = {
    employee_name: "John Doe",
    ohr_id: "12345",
  };

  it("accepts valid minimal payload", () => {
    expect(correctiveActionCreateSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts payload with all optional fields", () => {
    const result = correctiveActionCreateSchema.safeParse({
      ...valid,
      employee_email: "john@example.com",
      supervisor_name: "Jane Smith",
      supervisor_ohr: "67890",
      planning_group: "S-ABF",
      nte_type: "Attendance",
      date_of_incident: "2025-06-15",
      incident_description: "Absent without notice",
      policy_violated: "Section 4.2",
      violations: ["V001", "V002"],
      indicated_cap_level: "CAP 1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing employee_name", () => {
    const { employee_name, ...rest } = valid;
    expect(correctiveActionCreateSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing ohr_id", () => {
    const { ohr_id, ...rest } = valid;
    expect(correctiveActionCreateSchema.safeParse(rest).success).toBe(false);
  });

  it("accepts violations as JSON string (backward compat)", () => {
    const result = correctiveActionCreateSchema.safeParse({
      ...valid,
      violations: JSON.stringify(["V001"]),
    });
    expect(result.success).toBe(true);
  });

  it("accepts violations as null", () => {
    const result = correctiveActionCreateSchema.safeParse({
      ...valid,
      violations: null,
    });
    expect(result.success).toBe(true);
  });

  it("passes through unknown fields (passthrough)", () => {
    const result = correctiveActionCreateSchema.safeParse({
      ...valid,
      custom_field: "extra",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).custom_field).toBe("extra");
    }
  });
});

describe("correctiveActionUpdateSchema", () => {
  it("accepts empty object (all fields optional)", () => {
    expect(correctiveActionUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("accepts status update", () => {
    const result = correctiveActionUpdateSchema.safeParse({
      status: "CAP Assigned",
      cap_level: "CAP 1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative suspension_days", () => {
    const result = correctiveActionUpdateSchema.safeParse({
      suspension_days: -5,
    });
    expect(result.success).toBe(false);
  });

  it("accepts nod_issued as boolean", () => {
    const result = correctiveActionUpdateSchema.safeParse({
      nod_issued: true,
      nod_summary: "Notice of decision issued",
    });
    expect(result.success).toBe(true);
  });
});

// ================================================================
// NTE Build Assist schemas
// ================================================================
describe("nteBuildAssistGenerateSchema", () => {
  const validEmployee = {
    full_name: "John Doe",
    ohr_id: "12345",
  };

  it("accepts valid minimal payload", () => {
    const result = nteBuildAssistGenerateSchema.safeParse({
      employee: validEmployee,
    });
    expect(result.success).toBe(true);
  });

  it("accepts payload with violations array", () => {
    const result = nteBuildAssistGenerateSchema.safeParse({
      employee: validEmployee,
      violations: [{ code: "V001", description: "Attendance violation" }],
      attendance: [{ date: "2025-06-15", tag: "A" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing employee.full_name", () => {
    const result = nteBuildAssistGenerateSchema.safeParse({
      employee: { ohr_id: "12345" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing employee.ohr_id", () => {
    const result = nteBuildAssistGenerateSchema.safeParse({
      employee: { full_name: "John Doe" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing employee object entirely", () => {
    const result = nteBuildAssistGenerateSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("nteBuildAssistDocxSchema", () => {
  it("accepts valid DOCX payload", () => {
    const result = nteBuildAssistDocxSchema.safeParse({
      employee: { full_name: "John Doe" },
      narrative: "The employee was found to have violated...",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing narrative", () => {
    const result = nteBuildAssistDocxSchema.safeParse({
      employee: { full_name: "John Doe" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty narrative", () => {
    const result = nteBuildAssistDocxSchema.safeParse({
      employee: { full_name: "John Doe" },
      narrative: "",
    });
    expect(result.success).toBe(false);
  });
});

// ================================================================
// CAP Build Assist schemas
// ================================================================
describe("capBuildAssistGenerateSchema", () => {
  it("accepts valid minimal payload", () => {
    const result = capBuildAssistGenerateSchema.safeParse({
      employee: { full_name: "John Doe", ohr_id: "12345" },
      cap_level: "CAP 1",
    });
    expect(result.success).toBe(true);
  });

  it("accepts payload with all optional fields", () => {
    const result = capBuildAssistGenerateSchema.safeParse({
      employee: { full_name: "John Doe", ohr_id: "12345", actual_role: "Agent" },
      cap_level: "CAP 2",
      explanation_date: "2025-06-20",
      explanation_summary: "Employee explained...",
      nte_narrative: "The employee was found...",
      previous_caps: [{ level: "CAP 1", date: "2025-01-15" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing cap_level", () => {
    const result = capBuildAssistGenerateSchema.safeParse({
      employee: { full_name: "John Doe", ohr_id: "12345" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty cap_level", () => {
    const result = capBuildAssistGenerateSchema.safeParse({
      employee: { full_name: "John Doe", ohr_id: "12345" },
      cap_level: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("capBuildAssistDocxSchema", () => {
  it("accepts valid DOCX payload", () => {
    const result = capBuildAssistDocxSchema.safeParse({
      employee: { full_name: "John Doe" },
      cap_level: "CAP 1",
    });
    expect(result.success).toBe(true);
  });

  it("accepts payload with all optional fields", () => {
    const result = capBuildAssistDocxSchema.safeParse({
      employee: { full_name: "John Doe", ohr_id: "12345", actual_role: "Agent" },
      cap_level: "CAP 2",
      explanation_date: "2025-06-20",
      explanation_summary: "Employee explained...",
      violation_section: "Section 4.2",
      violation_subsection: "4.2.1",
      violations: [{ code: "V001" }],
      flm_name: "Jane Smith",
      issuance_date: "2025-06-25",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing cap_level", () => {
    const result = capBuildAssistDocxSchema.safeParse({
      employee: { full_name: "John Doe" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing employee", () => {
    const result = capBuildAssistDocxSchema.safeParse({
      cap_level: "CAP 1",
    });
    expect(result.success).toBe(false);
  });
});

// ================================================================
// Observability: validation rejection logging
// ================================================================
describe("validate() observability logging", () => {
  it("calls the injected logger on validation failure", () => {
    const logSpy = vi.fn();
    // Save the current logger, inject spy, then restore
    setValidationLogger(logSpy);

    const { req, res, next } = mockReqResNext({
      // missing required fields for coaching
    });
    // Add user context to req
    req.user = { ohr_id: "99999", openId: "oid-abc" };
    req.originalUrl = "/api/io/coaching";
    req.method = "POST";

    validate(coachingCreateSchema)(req, res, next);

    expect(logSpy).toHaveBeenCalledOnce();
    const entry: ValidationRejection = logSpy.mock.calls[0][0];
    expect(entry.endpoint).toBe("/api/io/coaching");
    expect(entry.method).toBe("POST");
    expect(entry.actor_ohr).toBe("99999");
    expect(entry.failed_fields).toBeInstanceOf(Array);
    expect(entry.failed_fields.length).toBeGreaterThan(0);
    expect(entry.error_summary).toBeTruthy();
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // Cleanup: remove logger
    setValidationLogger(null as any);
  });

  it("does NOT call logger on successful validation", () => {
    const logSpy = vi.fn();
    setValidationLogger(logSpy);

    const { req, res, next } = mockReqResNext({
      coaching_type: "General Coaching",
      coach_ohr: "12345",
      coaching_date: "2025-06-15T10:30:00",
      coachee_ohr: "67890",
    });

    validate(coachingCreateSchema)(req, res, next);

    expect(logSpy).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();

    setValidationLogger(null as any);
  });

  it("falls back to openId when ohr_id is missing", () => {
    const logSpy = vi.fn();
    setValidationLogger(logSpy);

    const { req, res, next } = mockReqResNext({});
    req.user = { openId: "oid-fallback" };
    req.originalUrl = "/api/io/leaves";
    req.method = "POST";

    validate(leaveCreateSchema)(req, res, next);

    const entry: ValidationRejection = logSpy.mock.calls[0][0];
    expect(entry.actor_ohr).toBe("oid-fallback");

    setValidationLogger(null as any);
  });

  it("uses 'unknown' when no user context exists", () => {
    const logSpy = vi.fn();
    setValidationLogger(logSpy);

    const { req, res, next } = mockReqResNext({});
    req.originalUrl = "/api/io/attendance/bulk-import";
    req.method = "POST";
    // No req.user at all

    validate(attendanceBulkImportSchema)(req, res, next);

    const entry: ValidationRejection = logSpy.mock.calls[0][0];
    expect(entry.actor_ohr).toBe("unknown");

    setValidationLogger(null as any);
  });

  it("deduplicates failed field names", () => {
    const logSpy = vi.fn();
    setValidationLogger(logSpy);

    // leavesBulkActionSchema is strict — multiple missing fields
    const { req, res, next } = mockReqResNext({
      leave_ids: "not-an-array",
      action: "invalid",
      tier: "invalid",
    });
    req.originalUrl = "/api/io/leaves/bulk-action";
    req.method = "POST";

    validate(leavesBulkActionSchema)(req, res, next);

    const entry: ValidationRejection = logSpy.mock.calls[0][0];
    // Ensure no duplicates
    const unique = [...new Set(entry.failed_fields)];
    expect(entry.failed_fields).toEqual(unique);

    setValidationLogger(null as any);
  });

  it("does not throw when logger itself throws", () => {
    const throwingLogger = vi.fn(() => { throw new Error("logger crashed"); });
    setValidationLogger(throwingLogger);

    const { req, res, next } = mockReqResNext({});
    req.originalUrl = "/api/io/coaching";
    req.method = "POST";

    // Should NOT throw — the try/catch in validate() protects the request
    expect(() => {
      validate(coachingCreateSchema)(req, res, next);
    }).not.toThrow();

    // Response should still be sent
    expect(res.status).toHaveBeenCalledWith(400);

    setValidationLogger(null as any);
  });
});

// ================================================================
// Volume Cap Tests
// ================================================================
describe("Validation rejection volume cap", () => {
  let logger: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    _resetVolumeCap();
    logger = vi.fn();
    setValidationLogger(logger);
  });

  afterEach(() => {
    setValidationLogger(null as any);
    _resetVolumeCap();
  });

  function fireInvalidRequest(endpoint: string) {
    const { req, res, next } = mockReqResNext({});
    req.originalUrl = endpoint;
    req.method = "POST";
    validate(coachingCreateSchema)(req, res, next);
    return { req, res, next };
  }

  it("logs the first 10 rejections for the same endpoint", () => {
    for (let i = 0; i < 10; i++) {
      fireInvalidRequest("/api/io/coaching");
    }
    expect(logger).toHaveBeenCalledTimes(10);
  });

  it("suppresses the 11th rejection for the same endpoint", () => {
    for (let i = 0; i < 15; i++) {
      fireInvalidRequest("/api/io/coaching");
    }
    // Only the first 10 should be logged
    expect(logger).toHaveBeenCalledTimes(10);
  });

  it("still returns 400 even when log is suppressed", () => {
    for (let i = 0; i < 12; i++) {
      const { res } = fireInvalidRequest("/api/io/coaching");
      expect(res.status).toHaveBeenCalledWith(400);
    }
    // All 12 requests got 400, but only 10 were logged
    expect(logger).toHaveBeenCalledTimes(10);
  });

  it("tracks endpoints independently", () => {
    for (let i = 0; i < 10; i++) {
      fireInvalidRequest("/api/io/coaching");
    }
    // Coaching is now at cap
    fireInvalidRequest("/api/io/coaching");
    expect(logger).toHaveBeenCalledTimes(10); // suppressed

    // Leaves should still be under cap
    const { req, res, next } = mockReqResNext({});
    req.originalUrl = "/api/io/leaves";
    req.method = "POST";
    validate(leaveCreateSchema)(req, res, next);
    expect(logger).toHaveBeenCalledTimes(11); // leaves logged
  });

  it("resets after _resetVolumeCap is called", () => {
    for (let i = 0; i < 10; i++) {
      fireInvalidRequest("/api/io/coaching");
    }
    expect(logger).toHaveBeenCalledTimes(10);

    // At cap — next one suppressed
    fireInvalidRequest("/api/io/coaching");
    expect(logger).toHaveBeenCalledTimes(10);

    // Reset and try again
    _resetVolumeCap();
    fireInvalidRequest("/api/io/coaching");
    expect(logger).toHaveBeenCalledTimes(11); // logged again
  });
});

// ══════════════════════════════════════════════════════════════════
// Tardiness schemas
// ══════════════════════════════════════════════════════════════════

describe("tardinessUploadSchema", () => {
  let tardinessUploadSchema: any;
  beforeAll(async () => {
    const mod = await import("./io/validation.js");
    tardinessUploadSchema = mod.tardinessUploadSchema;
  });

  it("accepts valid records array with ohr field", () => {
    const result = tardinessUploadSchema.safeParse({
      records: [{ ohr: "12345", date: "2025-01-15", minutes: 10 }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts records with OHR (uppercase) field", () => {
    const result = tardinessUploadSchema.safeParse({
      records: [{ OHR: "67890", date: "2025-01-15", tardiness_minutes: "5" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts records with ohr_id field", () => {
    const result = tardinessUploadSchema.safeParse({
      records: [{ ohr_id: "11111", date: "2025-01-15" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty records array", () => {
    const result = tardinessUploadSchema.safeParse({ records: [] });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toContain("records array must not be empty");
  });

  it("rejects missing records field", () => {
    const result = tardinessUploadSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects row without any OHR identifier", () => {
    const result = tardinessUploadSchema.safeParse({
      records: [{ date: "2025-01-15", minutes: 5 }],
    });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toContain("OHR identifier");
  });

  it("passes through extra fields (backward compat)", () => {
    const result = tardinessUploadSchema.safeParse({
      records: [{ ohr: "12345", date: "2025-01-15", extra_field: "hello" }],
      batch_label: "test",
    });
    expect(result.success).toBe(true);
    expect(result.data.batch_label).toBe("test");
  });
});

describe("tardinessUpdateSchema", () => {
  let tardinessUpdateSchema: any;
  beforeAll(async () => {
    const mod = await import("./io/validation.js");
    tardinessUpdateSchema = mod.tardinessUpdateSchema;
  });

  it("accepts valid validation_status", () => {
    const result = tardinessUpdateSchema.safeParse({ validation_status: "Valid" });
    expect(result.success).toBe(true);
  });

  it("accepts Pending status", () => {
    const result = tardinessUpdateSchema.safeParse({ validation_status: "Pending" });
    expect(result.success).toBe(true);
  });

  it("accepts unlock boolean", () => {
    const result = tardinessUpdateSchema.safeParse({ unlock: true });
    expect(result.success).toBe(true);
  });

  it("accepts remarks only", () => {
    const result = tardinessUpdateSchema.safeParse({ remarks: "Checked with agent" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid validation_status enum", () => {
    const result = tardinessUpdateSchema.safeParse({ validation_status: "Cancelled" });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toContain("'Valid', 'Invalid', or 'Pending'");
  });

  it("passes through extra fields", () => {
    const result = tardinessUpdateSchema.safeParse({ validation_status: "Valid", extra: 1 });
    expect(result.success).toBe(true);
    expect(result.data.extra).toBe(1);
  });
});

describe("tardinessBulkValidateSchema", () => {
  let tardinessBulkValidateSchema: any;
  beforeAll(async () => {
    const mod = await import("./io/validation.js");
    tardinessBulkValidateSchema = mod.tardinessBulkValidateSchema;
  });

  it("accepts valid ids array with Valid status", () => {
    const result = tardinessBulkValidateSchema.safeParse({
      ids: [1, 2, 3],
      validation_status: "Valid",
    });
    expect(result.success).toBe(true);
  });

  it("accepts string ids", () => {
    const result = tardinessBulkValidateSchema.safeParse({
      ids: ["1", "2"],
      validation_status: "Invalid",
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional remarks", () => {
    const result = tardinessBulkValidateSchema.safeParse({
      ids: [1],
      validation_status: "Valid",
      remarks: "Batch approved",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty ids array", () => {
    const result = tardinessBulkValidateSchema.safeParse({
      ids: [],
      validation_status: "Valid",
    });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toContain("ids array must not be empty");
  });

  it("rejects invalid validation_status", () => {
    const result = tardinessBulkValidateSchema.safeParse({
      ids: [1],
      validation_status: "Pending",
    });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toContain("'Valid' or 'Invalid'");
  });

  it("rejects unknown extra fields (strict mode)", () => {
    const result = tardinessBulkValidateSchema.safeParse({
      ids: [1],
      validation_status: "Valid",
      extra: true,
    });
    expect(result.success).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// Group Tasks schemas
// ══════════════════════════════════════════════════════════════════

describe("groupTaskCreateSchema", () => {
  let groupTaskCreateSchema: any;
  beforeAll(async () => {
    const mod = await import("./io/validation.js");
    groupTaskCreateSchema = mod.groupTaskCreateSchema;
  });

  const validPayload = {
    title: "Complete Q1 Training Module",
    created_by_ohr: "12345",
  };

  it("accepts minimal valid payload", () => {
    const result = groupTaskCreateSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("accepts full payload with all optional fields", () => {
    const result = groupTaskCreateSchema.safeParse({
      ...validPayload,
      description: "Complete the module by EOD",
      category: "Training",
      planning_groups: ["GY Shift"],
      departments: ["COMMUNITY_OPS"],
      roles: ["Agent"],
      excluded_ohrs: ["99999"],
      due_date: "2025-02-01",
      created_by_name: "TL Arvin",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing title", () => {
    const result = groupTaskCreateSchema.safeParse({ created_by_ohr: "12345" });
    expect(result.success).toBe(false);
  });

  it("rejects missing created_by_ohr", () => {
    const result = groupTaskCreateSchema.safeParse({ title: "Test Task" });
    expect(result.success).toBe(false);
  });

  it("accepts null for array fields", () => {
    const result = groupTaskCreateSchema.safeParse({
      ...validPayload,
      planning_groups: null,
      departments: null,
    });
    expect(result.success).toBe(true);
  });

  it("passes through extra fields", () => {
    const result = groupTaskCreateSchema.safeParse({ ...validPayload, priority: "high" });
    expect(result.success).toBe(true);
    expect(result.data.priority).toBe("high");
  });
});

describe("groupTaskPreviewSchema", () => {
  let groupTaskPreviewSchema: any;
  beforeAll(async () => {
    const mod = await import("./io/validation.js");
    groupTaskPreviewSchema = mod.groupTaskPreviewSchema;
  });

  it("accepts empty body (all filters optional)", () => {
    const result = groupTaskPreviewSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts planning_groups filter", () => {
    const result = groupTaskPreviewSchema.safeParse({ planning_groups: ["GY Shift"] });
    expect(result.success).toBe(true);
  });

  it("accepts null values for filters", () => {
    const result = groupTaskPreviewSchema.safeParse({
      planning_groups: null,
      departments: null,
      roles: null,
      excluded_ohrs: null,
    });
    expect(result.success).toBe(true);
  });

  it("passes through extra fields", () => {
    const result = groupTaskPreviewSchema.safeParse({ planning_groups: ["GY Shift"], custom: 1 });
    expect(result.success).toBe(true);
    expect(result.data.custom).toBe(1);
  });
});

describe("groupTaskCompleteSchema", () => {
  let groupTaskCompleteSchema: any;
  beforeAll(async () => {
    const mod = await import("./io/validation.js");
    groupTaskCompleteSchema = mod.groupTaskCompleteSchema;
  });

  it("accepts valid ohr", () => {
    const result = groupTaskCompleteSchema.safeParse({ ohr: "12345" });
    expect(result.success).toBe(true);
  });

  it("accepts ohr with attachment_url", () => {
    const result = groupTaskCompleteSchema.safeParse({
      ohr: "12345",
      attachment_url: "https://example.com/file.pdf",
    });
    expect(result.success).toBe(true);
  });

  it("accepts ohr with attachment_urls array", () => {
    const result = groupTaskCompleteSchema.safeParse({
      ohr: "12345",
      attachment_urls: [{ name: "doc.pdf", url: "https://example.com/doc.pdf" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing ohr", () => {
    const result = groupTaskCompleteSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("passes through extra fields", () => {
    const result = groupTaskCompleteSchema.safeParse({ ohr: "12345", notes: "done" });
    expect(result.success).toBe(true);
    expect(result.data.notes).toBe("done");
  });
});

describe("groupTaskExcludeSchema", () => {
  let groupTaskExcludeSchema: any;
  beforeAll(async () => {
    const mod = await import("./io/validation.js");
    groupTaskExcludeSchema = mod.groupTaskExcludeSchema;
  });

  it("accepts valid ohrs array", () => {
    const result = groupTaskExcludeSchema.safeParse({ ohrs: ["12345", "67890"] });
    expect(result.success).toBe(true);
  });

  it("rejects empty ohrs array", () => {
    const result = groupTaskExcludeSchema.safeParse({ ohrs: [] });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toContain("ohrs array must not be empty");
  });

  it("rejects missing ohrs field", () => {
    const result = groupTaskExcludeSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects unknown extra fields (strict mode)", () => {
    const result = groupTaskExcludeSchema.safeParse({ ohrs: ["12345"], reason: "test" });
    expect(result.success).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// Shift Extension schemas
// ══════════════════════════════════════════════════════════════════

describe("shiftExtensionCreateSchema", () => {
  let shiftExtensionCreateSchema: any;
  beforeAll(async () => {
    const mod = await import("./io/validation.js");
    shiftExtensionCreateSchema = mod.shiftExtensionCreateSchema;
  });

  const validPayload = {
    agent_ohr: "12345",
    shift_date: "2025-01-20",
    extension_minutes: 30,
    reason_details: "Need to complete production hours",
  };

  it("accepts valid minimal payload", () => {
    const result = shiftExtensionCreateSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("accepts full payload with optional fields", () => {
    const result = shiftExtensionCreateSchema.safeParse({
      ...validPayload,
      agent_name: "Juan Dela Cruz",
      supervisor_ohr: "99999",
      supervisor_name: "TL Arvin",
      planning_group: "GY Shift",
    });
    expect(result.success).toBe(true);
  });

  it("accepts extension_minutes as string", () => {
    const result = shiftExtensionCreateSchema.safeParse({
      ...validPayload,
      extension_minutes: "45",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing agent_ohr", () => {
    const { agent_ohr, ...rest } = validPayload;
    const result = shiftExtensionCreateSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing shift_date", () => {
    const { shift_date, ...rest } = validPayload;
    const result = shiftExtensionCreateSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing reason_details", () => {
    const { reason_details, ...rest } = validPayload;
    const result = shiftExtensionCreateSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects invalid shift_date format", () => {
    const result = shiftExtensionCreateSchema.safeParse({
      ...validPayload,
      shift_date: "Jan 20 2025",
    });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toContain("YYYY-MM-DD");
  });

  it("passes through extra fields", () => {
    const result = shiftExtensionCreateSchema.safeParse({ ...validPayload, urgency: "high" });
    expect(result.success).toBe(true);
    expect(result.data.urgency).toBe("high");
  });
});

describe("shiftExtensionActionSchema", () => {
  let shiftExtensionActionSchema: any;
  beforeAll(async () => {
    const mod = await import("./io/validation.js");
    shiftExtensionActionSchema = mod.shiftExtensionActionSchema;
  });

  it("accepts Approved action", () => {
    const result = shiftExtensionActionSchema.safeParse({ action: "Approved" });
    expect(result.success).toBe(true);
  });

  it("accepts Rejected action with comments", () => {
    const result = shiftExtensionActionSchema.safeParse({
      action: "Rejected",
      comments: "Not enough justification",
      actioned_by: "TL Arvin",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid action value", () => {
    const result = shiftExtensionActionSchema.safeParse({ action: "Pending" });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toContain("'Approved' or 'Rejected'");
  });

  it("rejects missing action field", () => {
    const result = shiftExtensionActionSchema.safeParse({ comments: "test" });
    expect(result.success).toBe(false);
  });

  it("passes through extra fields", () => {
    const result = shiftExtensionActionSchema.safeParse({ action: "Approved", extra: true });
    expect(result.success).toBe(true);
    expect(result.data.extra).toBe(true);
  });
});
