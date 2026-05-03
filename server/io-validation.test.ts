/**
 * Vitest tests for Zod validation schemas (server/io/validation.ts)
 * Covers: coaching, leaves, attendance schemas + validate middleware
 */
import { describe, it, expect, vi } from "vitest";
import {
  validate,
  setValidationLogger,
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
      leave_ids: [1, 2, 3],
      action: "approve",
      tier: "tl",
      reviewer_name: "TL Arvin",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid reject payload with reason", () => {
    const result = leavesBulkActionSchema.safeParse({
      leave_ids: [5],
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
      leave_ids: [1],
      action: "cancel",
      tier: "tl",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid tier value", () => {
    const result = leavesBulkActionSchema.safeParse({
      leave_ids: [1],
      action: "approve",
      tier: "admin",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer leave_ids", () => {
    const result = leavesBulkActionSchema.safeParse({
      leave_ids: ["abc"],
      action: "approve",
      tier: "tl",
    });
    expect(result.success).toBe(false);
  });

  it("rejects extra unknown fields (strict mode)", () => {
    const result = leavesBulkActionSchema.safeParse({
      leave_ids: [1],
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
