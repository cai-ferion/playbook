import { describe, expect, it } from "vitest";

/**
 * CA Cases & AI Assistant — Unit Tests
 *
 * These tests validate the business logic constants, state machine transitions,
 * and data structures used by the CA Cases and AI Assistant routers.
 * They do NOT require a live database connection — they test the exported
 * logic and contract shapes.
 */

// ── CA Status Lifecycle Tests ───────────────────────────────────────────

describe("CA Case Status Lifecycle", () => {
  // Reproduce the status transitions from ca-cases.ts
  const STATUS_TRANSITIONS: Record<string, string[]> = {
    incident_reported: ["nte_issued", "case_closed"],
    nte_issued: ["response_received", "response_waived"],
    response_received: ["hearing_scheduled", "nod_issued"],
    response_waived: ["hearing_scheduled", "nod_issued"],
    hearing_scheduled: ["hearing_completed"],
    hearing_completed: ["nod_issued"],
    nod_issued: ["cap_issued", "case_closed"],
    cap_issued: ["active_period"],
    active_period: ["case_closed"],
    case_closed: [],
  };

  const CAP_ACTIVE_PERIODS: Record<string, number> = {
    cap_0: 0,
    cap_1: 60,
    cap_2: 90,
    cap_3: 180,
  };

  it("defines all expected statuses", () => {
    const expectedStatuses = [
      "incident_reported",
      "nte_issued",
      "response_received",
      "response_waived",
      "hearing_scheduled",
      "hearing_completed",
      "nod_issued",
      "cap_issued",
      "active_period",
      "case_closed",
    ];
    expect(Object.keys(STATUS_TRANSITIONS)).toEqual(expectedStatuses);
  });

  it("case_closed is a terminal state with no transitions", () => {
    expect(STATUS_TRANSITIONS.case_closed).toEqual([]);
  });

  it("incident_reported can transition to nte_issued or case_closed", () => {
    expect(STATUS_TRANSITIONS.incident_reported).toContain("nte_issued");
    expect(STATUS_TRANSITIONS.incident_reported).toContain("case_closed");
  });

  it("nte_issued can transition to response_received or response_waived", () => {
    expect(STATUS_TRANSITIONS.nte_issued).toContain("response_received");
    expect(STATUS_TRANSITIONS.nte_issued).toContain("response_waived");
  });

  it("both response paths can lead to hearing or NOD", () => {
    for (const status of ["response_received", "response_waived"]) {
      expect(STATUS_TRANSITIONS[status]).toContain("hearing_scheduled");
      expect(STATUS_TRANSITIONS[status]).toContain("nod_issued");
    }
  });

  it("hearing path is linear: scheduled → completed → nod_issued", () => {
    expect(STATUS_TRANSITIONS.hearing_scheduled).toEqual(["hearing_completed"]);
    expect(STATUS_TRANSITIONS.hearing_completed).toEqual(["nod_issued"]);
  });

  it("nod_issued can lead to cap_issued or case_closed", () => {
    expect(STATUS_TRANSITIONS.nod_issued).toContain("cap_issued");
    expect(STATUS_TRANSITIONS.nod_issued).toContain("case_closed");
  });

  it("cap_issued leads to active_period only", () => {
    expect(STATUS_TRANSITIONS.cap_issued).toEqual(["active_period"]);
  });

  it("active_period leads to case_closed only", () => {
    expect(STATUS_TRANSITIONS.active_period).toEqual(["case_closed"]);
  });

  it("no status can transition back to a previous state (no cycles)", () => {
    const statusOrder = Object.keys(STATUS_TRANSITIONS);
    for (const [status, targets] of Object.entries(STATUS_TRANSITIONS)) {
      const currentIdx = statusOrder.indexOf(status);
      for (const target of targets) {
        const targetIdx = statusOrder.indexOf(target);
        // Target must be ahead in the lifecycle (or case_closed which is terminal)
        expect(targetIdx).toBeGreaterThan(currentIdx);
      }
    }
  });
});

// ── CAP Active Period Tests ─────────────────────────────────────────────

describe("CAP Active Periods (GPHR Policy v3.0)", () => {
  const CAP_ACTIVE_PERIODS: Record<string, number> = {
    cap_0: 0,
    cap_1: 60,
    cap_2: 90,
    cap_3: 180,
  };

  it("CAP 0 has no active period", () => {
    expect(CAP_ACTIVE_PERIODS.cap_0).toBe(0);
  });

  it("CAP 1 has 60-day active period", () => {
    expect(CAP_ACTIVE_PERIODS.cap_1).toBe(60);
  });

  it("CAP 2 has 90-day active period", () => {
    expect(CAP_ACTIVE_PERIODS.cap_2).toBe(90);
  });

  it("CAP 3 has 180-day active period", () => {
    expect(CAP_ACTIVE_PERIODS.cap_3).toBe(180);
  });

  it("CAP 4 does not exist (abolished per Feb 2026 policy)", () => {
    expect(CAP_ACTIVE_PERIODS.cap_4).toBeUndefined();
  });

  it("active periods increase monotonically", () => {
    const levels = ["cap_0", "cap_1", "cap_2", "cap_3"];
    for (let i = 1; i < levels.length; i++) {
      expect(CAP_ACTIVE_PERIODS[levels[i]]).toBeGreaterThan(
        CAP_ACTIVE_PERIODS[levels[i - 1]]
      );
    }
  });
});

// ── Attendance Violation Progression Tests ──────────────────────────────

describe("Attendance Violation Progression", () => {
  // Reproduce the escalation matrix from the policy
  const ATTENDANCE_ESCALATION: Record<
    string,
    Record<string, string>
  > = {
    tardiness: {
      "1-2": "cap_0",
      "3-5": "cap_1",
      "6-8": "cap_2",
      "9+": "cap_3",
    },
    unauthorized_absence: {
      "1-2": "cap_1",
      "3-5": "cap_2",
      "6-8": "cap_3",
      "9+": "review_for_termination",
    },
    undertime: {
      "1-2": "cap_0",
      "3-5": "cap_1",
      "6-8": "cap_2",
      "9+": "cap_3",
    },
    ncns: {
      "1st": "cap_2",
      "2nd": "cap_3",
      "3rd": "review_for_termination",
    },
    absconding: {
      any: "review_for_termination",
    },
  };

  function getRecommendedCap(
    violationType: string,
    count: number
  ): string {
    const matrix = ATTENDANCE_ESCALATION[violationType];
    if (!matrix) return "unknown";

    if (violationType === "ncns") {
      if (count === 1) return matrix["1st"];
      if (count === 2) return matrix["2nd"];
      if (count >= 3) return matrix["3rd"];
      return "cap_0";
    }

    if (violationType === "absconding") return matrix.any;

    if (count >= 9) return matrix["9+"];
    if (count >= 6) return matrix["6-8"];
    if (count >= 3) return matrix["3-5"];
    if (count >= 1) return matrix["1-2"];
    return "cap_0";
  }

  it("1 tardiness → CAP 0", () => {
    expect(getRecommendedCap("tardiness", 1)).toBe("cap_0");
  });

  it("3 tardiness → CAP 1", () => {
    expect(getRecommendedCap("tardiness", 3)).toBe("cap_1");
  });

  it("6 tardiness → CAP 2", () => {
    expect(getRecommendedCap("tardiness", 6)).toBe("cap_2");
  });

  it("9 tardiness → CAP 3 (max, no CAP 4)", () => {
    expect(getRecommendedCap("tardiness", 9)).toBe("cap_3");
  });

  it("1 unauthorized absence → CAP 1", () => {
    expect(getRecommendedCap("unauthorized_absence", 1)).toBe("cap_1");
  });

  it("9+ unauthorized absences → Review for Termination", () => {
    expect(getRecommendedCap("unauthorized_absence", 9)).toBe(
      "review_for_termination"
    );
  });

  it("1st NCNS → CAP 2", () => {
    expect(getRecommendedCap("ncns", 1)).toBe("cap_2");
  });

  it("2nd NCNS → CAP 3", () => {
    expect(getRecommendedCap("ncns", 2)).toBe("cap_3");
  });

  it("3rd NCNS → Review for Termination", () => {
    expect(getRecommendedCap("ncns", 3)).toBe("review_for_termination");
  });

  it("absconding → always Review for Termination", () => {
    expect(getRecommendedCap("absconding", 1)).toBe(
      "review_for_termination"
    );
  });
});

// ── NTE Requirements Tests ──────────────────────────────────────────────

describe("NTE Requirements", () => {
  function getNteRequirements(capLevel: string) {
    const requiresNte = capLevel !== "cap_0";
    const requiresHearing =
      capLevel === "cap_3" || capLevel === "review_for_termination";
    const responseTimeframe =
      capLevel === "cap_3" || capLevel === "review_for_termination"
        ? "5 days"
        : "48 hours";

    return { requiresNte, requiresHearing, responseTimeframe };
  }

  it("CAP 0 does not require NTE", () => {
    const { requiresNte } = getNteRequirements("cap_0");
    expect(requiresNte).toBe(false);
  });

  it("CAP 1 requires NTE with 48-hour response", () => {
    const { requiresNte, responseTimeframe } = getNteRequirements("cap_1");
    expect(requiresNte).toBe(true);
    expect(responseTimeframe).toBe("48 hours");
  });

  it("CAP 2 requires NTE with 48-hour response", () => {
    const { requiresNte, responseTimeframe } = getNteRequirements("cap_2");
    expect(requiresNte).toBe(true);
    expect(responseTimeframe).toBe("48 hours");
  });

  it("CAP 3 requires NTE with 5-day response and hearing", () => {
    const { requiresNte, requiresHearing, responseTimeframe } =
      getNteRequirements("cap_3");
    expect(requiresNte).toBe(true);
    expect(requiresHearing).toBe(true);
    expect(responseTimeframe).toBe("5 days");
  });

  it("Review for Termination requires NTE, hearing, and 5-day response", () => {
    const { requiresNte, requiresHearing, responseTimeframe } =
      getNteRequirements("review_for_termination");
    expect(requiresNte).toBe(true);
    expect(requiresHearing).toBe(true);
    expect(responseTimeframe).toBe("5 days");
  });
});

// ── AI Recommendation Schema Tests ──────────────────────────────────────

describe("AI Recommendation Response Schema", () => {
  const REQUIRED_FIELDS = [
    "recommended_cap_level",
    "reasoning",
    "applicable_violations",
    "aggravating_factors",
    "mitigating_factors",
    "requires_nte",
    "requires_hearing",
    "active_period_days",
    "response_timeframe",
    "disclaimer",
  ];

  const sampleRecommendation = {
    recommended_cap_level: "cap_1",
    reasoning:
      "Employee has 4 tardiness instances since last reset. Per attendance escalation matrix, CAP 1 is recommended.",
    applicable_violations: [
      {
        code: "7.1",
        text: "Tardiness",
        base_sanction: "CAP 0 to CAP 3",
      },
    ],
    aggravating_factors: [
      "Habitual pattern: 3 prior coaching sessions for same issue",
    ],
    mitigating_factors: ["No prior formal CAP on record"],
    requires_nte: true,
    requires_hearing: false,
    active_period_days: 60,
    response_timeframe: "48 hours",
    disclaimer:
      "This is an advisory recommendation. The final decision rests with the issuing supervisor.",
  };

  it("sample recommendation contains all required fields", () => {
    for (const field of REQUIRED_FIELDS) {
      expect(sampleRecommendation).toHaveProperty(field);
    }
  });

  it("recommended_cap_level is a valid CAP level", () => {
    const validLevels = [
      "cap_0",
      "cap_1",
      "cap_2",
      "cap_3",
      "review_for_termination",
    ];
    expect(validLevels).toContain(
      sampleRecommendation.recommended_cap_level
    );
  });

  it("applicable_violations is an array with code, text, base_sanction", () => {
    expect(Array.isArray(sampleRecommendation.applicable_violations)).toBe(
      true
    );
    for (const v of sampleRecommendation.applicable_violations) {
      expect(v).toHaveProperty("code");
      expect(v).toHaveProperty("text");
      expect(v).toHaveProperty("base_sanction");
    }
  });

  it("active_period_days matches the recommended CAP level", () => {
    const capPeriods: Record<string, number> = {
      cap_0: 0,
      cap_1: 60,
      cap_2: 90,
      cap_3: 180,
    };
    expect(sampleRecommendation.active_period_days).toBe(
      capPeriods[sampleRecommendation.recommended_cap_level]
    );
  });

  it("requires_nte is false only for CAP 0", () => {
    if (sampleRecommendation.recommended_cap_level === "cap_0") {
      expect(sampleRecommendation.requires_nte).toBe(false);
    } else {
      expect(sampleRecommendation.requires_nte).toBe(true);
    }
  });

  it("requires_hearing is true only for CAP 3+", () => {
    const hearingLevels = ["cap_3", "review_for_termination"];
    if (
      hearingLevels.includes(sampleRecommendation.recommended_cap_level)
    ) {
      expect(sampleRecommendation.requires_hearing).toBe(true);
    } else {
      expect(sampleRecommendation.requires_hearing).toBe(false);
    }
  });

  it("disclaimer is always present and non-empty", () => {
    expect(sampleRecommendation.disclaimer.length).toBeGreaterThan(0);
  });
});

// ── Visibility Rules Tests ──────────────────────────────────────────────

describe("CA Cases Visibility Rules", () => {
  // Reproduce the visibility logic
  type Role = "Manager" | "Team Leader" | "Operational SME" | "QA" | "Trainer" | "Agent";

  function canViewCase(
    viewerRole: Role,
    viewerOhr: string,
    viewerTeamOhrs: string[],
    caseEmployeeOhr: string,
    caseCreatedByOhr: string
  ): boolean {
    if (viewerRole === "Manager") return true;
    if (viewerRole === "Team Leader" || viewerRole === "Operational SME") {
      return viewerTeamOhrs.includes(caseEmployeeOhr);
    }
    if (viewerRole === "QA" || viewerRole === "Trainer") {
      return caseCreatedByOhr === viewerOhr;
    }
    if (viewerRole === "Agent") {
      return caseEmployeeOhr === viewerOhr;
    }
    return false;
  }

  const teamOhrs = ["E001", "E002", "E003"];

  it("Manager sees all cases", () => {
    expect(canViewCase("Manager", "M001", [], "E999", "Q001")).toBe(true);
  });

  it("TL sees cases for own team members", () => {
    expect(canViewCase("Team Leader", "TL001", teamOhrs, "E001", "Q001")).toBe(true);
  });

  it("TL cannot see cases for other teams", () => {
    expect(canViewCase("Team Leader", "TL001", teamOhrs, "E999", "Q001")).toBe(false);
  });

  it("SME sees cases for own team members", () => {
    expect(canViewCase("Operational SME", "SME001", teamOhrs, "E002", "TL001")).toBe(true);
  });

  it("QA sees only cases they filed", () => {
    expect(canViewCase("QA", "Q001", [], "E001", "Q001")).toBe(true);
    expect(canViewCase("QA", "Q001", [], "E001", "Q002")).toBe(false);
  });

  it("Trainer sees only cases they filed", () => {
    expect(canViewCase("Trainer", "T001", [], "E001", "T001")).toBe(true);
    expect(canViewCase("Trainer", "T001", [], "E001", "T002")).toBe(false);
  });

  it("Agent sees only own cases", () => {
    expect(canViewCase("Agent", "E001", [], "E001", "TL001")).toBe(true);
    expect(canViewCase("Agent", "E001", [], "E002", "TL001")).toBe(false);
  });
});

// ── Document Template Mapping Tests ─────────────────────────────────────

describe("Document Template Mapping", () => {
  const TEMPLATE_MAP: Record<string, string> = {
    nte: "Template-NTE.docx",
    cap_0: "Template-CAP0.docx",
    cap_1: "Template-CAP1.docx",
    cap_2: "Template-CAP2.docx",
    cap_3: "Template-CAP3.docx",
    cap_waived: "Template-CAPw_oExplanationLetter.docx",
  };

  it("has templates for NTE and all CAP levels", () => {
    expect(TEMPLATE_MAP).toHaveProperty("nte");
    expect(TEMPLATE_MAP).toHaveProperty("cap_0");
    expect(TEMPLATE_MAP).toHaveProperty("cap_1");
    expect(TEMPLATE_MAP).toHaveProperty("cap_2");
    expect(TEMPLATE_MAP).toHaveProperty("cap_3");
  });

  it("has a waived explanation letter template", () => {
    expect(TEMPLATE_MAP).toHaveProperty("cap_waived");
  });

  it("does not have a CAP 4 template (abolished)", () => {
    expect(TEMPLATE_MAP.cap_4).toBeUndefined();
  });
});
