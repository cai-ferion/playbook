/**
 * Vitest tests for Zod validation schemas (server/io/validation.ts)
 * Covers: coaching, leaves, attendance schemas + validate middleware
 */
import { describe, it, expect, vi } from "vitest";
import {
  validate,
  coachingCreateSchema,
  coachingUpdateSchema,
  coachingRcaCreateSchema,
  leaveCreateSchema,
  leavesBulkActionSchema,
  leaveCancelSchema,
  attendanceBulkImportSchema,
  attendanceBulkTagSchema,
} from "./io/validation";

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
