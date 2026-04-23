/**
 * Compass Module — Unit Tests
 *
 * Tests the core business logic: visibility scoping, dispute level transitions,
 * role validation, and status lifecycle.
 */
import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Constants (mirrored from compass router for isolated testing)
// ---------------------------------------------------------------------------

const DISPUTE_STATUSES = {
  PENDING_SME_REVIEW: "Pending Support Review",
  MARKDOWN_DISPUTED: "Markdown Disputed",
  MARKDOWN_RETAINED_QA: "Markdown Retained - QA",
  QA_DECISION_REJECTED: "QA Decision Rejected",
  MARKDOWN_RETAINED_TRAINER: "Markdown Retained - Trainer",
  TRAINER_DECISION_REJECTED: "Trainer Decision Rejected",
  PENDING_ACK: "Pending Acknowledgement",
  ACKNOWLEDGED: "Acknowledged",
} as const;

const DISPUTE_LEVEL_CONFIG: Record<
  number,
  {
    entryStatus: string;
    requiredRole: string[];
    actions: string[];
    resultStatuses: Record<string, string>;
  }
> = {
  1: {
    entryStatus: DISPUTE_STATUSES.PENDING_SME_REVIEW,
    requiredRole: ["Operational SME"],
    actions: ["accept_markdown", "dispute_markdown"],
    resultStatuses: {
      accept_markdown: DISPUTE_STATUSES.PENDING_ACK,
      dispute_markdown: DISPUTE_STATUSES.MARKDOWN_DISPUTED,
    },
  },
  2: {
    entryStatus: DISPUTE_STATUSES.MARKDOWN_DISPUTED,
    requiredRole: ["Quality & Policy Expert"],
    actions: ["reverse_markdown", "retain_markdown"],
    resultStatuses: {
      reverse_markdown: DISPUTE_STATUSES.PENDING_ACK,
      retain_markdown: DISPUTE_STATUSES.MARKDOWN_RETAINED_QA,
    },
  },
  3: {
    entryStatus: DISPUTE_STATUSES.MARKDOWN_RETAINED_QA,
    requiredRole: ["Operational SME"],
    actions: ["accept_decision", "reject_decision"],
    resultStatuses: {
      accept_decision: DISPUTE_STATUSES.PENDING_ACK,
      reject_decision: DISPUTE_STATUSES.QA_DECISION_REJECTED,
    },
  },
  4: {
    entryStatus: DISPUTE_STATUSES.QA_DECISION_REJECTED,
    requiredRole: ["Trainer"],
    actions: ["reverse_markdown", "retain_markdown"],
    resultStatuses: {
      reverse_markdown: DISPUTE_STATUSES.PENDING_ACK,
      retain_markdown: DISPUTE_STATUSES.MARKDOWN_RETAINED_TRAINER,
    },
  },
  5: {
    entryStatus: DISPUTE_STATUSES.MARKDOWN_RETAINED_TRAINER,
    requiredRole: ["Operational SME"],
    actions: ["accept_decision", "reject_decision"],
    resultStatuses: {
      accept_decision: DISPUTE_STATUSES.PENDING_ACK,
      reject_decision: DISPUTE_STATUSES.TRAINER_DECISION_REJECTED,
    },
  },
  6: {
    entryStatus: DISPUTE_STATUSES.TRAINER_DECISION_REJECTED,
    requiredRole: ["Manager"],
    actions: ["reverse_markdown", "retain_markdown"],
    resultStatuses: {
      reverse_markdown: DISPUTE_STATUSES.PENDING_ACK,
      retain_markdown: DISPUTE_STATUSES.PENDING_ACK,
    },
  },
};

// ---------------------------------------------------------------------------
// Pure helper: determine dispute level from status
// ---------------------------------------------------------------------------
function getDisputeLevel(status: string): number {
  for (const [level, config] of Object.entries(DISPUTE_LEVEL_CONFIG)) {
    if (config.entryStatus === status) return parseInt(level);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Pure helper: validate action for a given level and role
// ---------------------------------------------------------------------------
function validateDisputeAction(
  status: string,
  action: string,
  role: string,
  isAdmin: boolean
): { valid: boolean; newStatus?: string; error?: string } {
  const level = getDisputeLevel(status);
  if (level === 0) return { valid: false, error: `Status "${status}" is not disputable` };

  const config = DISPUTE_LEVEL_CONFIG[level];
  if (!config.actions.includes(action)) {
    return { valid: false, error: `Invalid action "${action}" for level ${level}` };
  }
  if (!isAdmin && !config.requiredRole.includes(role)) {
    return { valid: false, error: `Role "${role}" not authorized for level ${level}` };
  }
  return { valid: true, newStatus: config.resultStatuses[action] };
}

// ---------------------------------------------------------------------------
// Pure helper: build visibility scope type from role
// ---------------------------------------------------------------------------
function getScopeType(role: string, isAdmin: boolean): string {
  if (role === "Manager" || isAdmin) return "all";
  if (role === "Team Lead") return "team";
  if (role === "Operational SME") return "team";
  if (role === "Quality & Policy Expert" || role === "Trainer") return "self_filed";
  return "self_only";
}

// ===========================================================================
// Tests
// ===========================================================================

describe("Compass — Dispute Level Resolution", () => {
  it("resolves Pending Support Review to level 1", () => {
    expect(getDisputeLevel("Pending Support Review")).toBe(1);
  });

  it("resolves Markdown Disputed to level 2", () => {
    expect(getDisputeLevel("Markdown Disputed")).toBe(2);
  });

  it("resolves Markdown Retained - QA to level 3", () => {
    expect(getDisputeLevel("Markdown Retained - QA")).toBe(3);
  });

  it("resolves QA Decision Rejected to level 4", () => {
    expect(getDisputeLevel("QA Decision Rejected")).toBe(4);
  });

  it("resolves Markdown Retained - Trainer to level 5", () => {
    expect(getDisputeLevel("Markdown Retained - Trainer")).toBe(5);
  });

  it("resolves Trainer Decision Rejected to level 6", () => {
    expect(getDisputeLevel("Trainer Decision Rejected")).toBe(6);
  });

  it("returns 0 for non-disputable statuses", () => {
    expect(getDisputeLevel("Pending Acknowledgement")).toBe(0);
    expect(getDisputeLevel("Acknowledged")).toBe(0);
    expect(getDisputeLevel("Unknown Status")).toBe(0);
  });
});

describe("Compass — Dispute Action Validation", () => {
  it("LV1: SME accepts markdown → Pending Ack", () => {
    const result = validateDisputeAction(
      "Pending Support Review",
      "accept_markdown",
      "Operational SME",
      false
    );
    expect(result.valid).toBe(true);
    expect(result.newStatus).toBe("Pending Acknowledgement");
  });

  it("LV1: SME disputes markdown → Markdown Disputed", () => {
    const result = validateDisputeAction(
      "Pending Support Review",
      "dispute_markdown",
      "Operational SME",
      false
    );
    expect(result.valid).toBe(true);
    expect(result.newStatus).toBe("Markdown Disputed");
  });

  it("LV1: QA cannot act at level 1", () => {
    const result = validateDisputeAction(
      "Pending Support Review",
      "accept_markdown",
      "Quality & Policy Expert",
      false
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not authorized");
  });

  it("LV2: QA retains markdown → Markdown Retained - QA", () => {
    const result = validateDisputeAction(
      "Markdown Disputed",
      "retain_markdown",
      "Quality & Policy Expert",
      false
    );
    expect(result.valid).toBe(true);
    expect(result.newStatus).toBe("Markdown Retained - QA");
  });

  it("LV2: QA reverses markdown → Pending Ack", () => {
    const result = validateDisputeAction(
      "Markdown Disputed",
      "reverse_markdown",
      "Quality & Policy Expert",
      false
    );
    expect(result.valid).toBe(true);
    expect(result.newStatus).toBe("Pending Acknowledgement");
  });

  it("LV3: SME rejects QA decision → QA Decision Rejected", () => {
    const result = validateDisputeAction(
      "Markdown Retained - QA",
      "reject_decision",
      "Operational SME",
      false
    );
    expect(result.valid).toBe(true);
    expect(result.newStatus).toBe("QA Decision Rejected");
  });

  it("LV4: Trainer retains → Markdown Retained - Trainer", () => {
    const result = validateDisputeAction(
      "QA Decision Rejected",
      "retain_markdown",
      "Trainer",
      false
    );
    expect(result.valid).toBe(true);
    expect(result.newStatus).toBe("Markdown Retained - Trainer");
  });

  it("LV5: SME rejects trainer decision → Trainer Decision Rejected", () => {
    const result = validateDisputeAction(
      "Markdown Retained - Trainer",
      "reject_decision",
      "Operational SME",
      false
    );
    expect(result.valid).toBe(true);
    expect(result.newStatus).toBe("Trainer Decision Rejected");
  });

  it("LV6: Manager retains → Pending Ack (final)", () => {
    const result = validateDisputeAction(
      "Trainer Decision Rejected",
      "retain_markdown",
      "Manager",
      false
    );
    expect(result.valid).toBe(true);
    expect(result.newStatus).toBe("Pending Acknowledgement");
  });

  it("LV6: Manager reverses → Pending Ack (final)", () => {
    const result = validateDisputeAction(
      "Trainer Decision Rejected",
      "reverse_markdown",
      "Manager",
      false
    );
    expect(result.valid).toBe(true);
    expect(result.newStatus).toBe("Pending Acknowledgement");
  });

  it("Admin can override any level", () => {
    const result = validateDisputeAction(
      "Markdown Disputed",
      "retain_markdown",
      "Agent",
      true
    );
    expect(result.valid).toBe(true);
    expect(result.newStatus).toBe("Markdown Retained - QA");
  });

  it("Invalid action for level is rejected", () => {
    const result = validateDisputeAction(
      "Pending Support Review",
      "retain_markdown",
      "Operational SME",
      false
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid action");
  });

  it("Non-disputable status is rejected", () => {
    const result = validateDisputeAction(
      "Acknowledged",
      "accept_markdown",
      "Operational SME",
      false
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not disputable");
  });
});

describe("Compass — Full Dispute Escalation Path", () => {
  it("traces the worst-case 6-level escalation to manager final decision", () => {
    let status = "Pending Support Review";

    // LV1: SME disputes
    let r = validateDisputeAction(status, "dispute_markdown", "Operational SME", false);
    expect(r.valid).toBe(true);
    status = r.newStatus!;
    expect(status).toBe("Markdown Disputed");

    // LV2: QA retains
    r = validateDisputeAction(status, "retain_markdown", "Quality & Policy Expert", false);
    expect(r.valid).toBe(true);
    status = r.newStatus!;
    expect(status).toBe("Markdown Retained - QA");

    // LV3: SME rejects
    r = validateDisputeAction(status, "reject_decision", "Operational SME", false);
    expect(r.valid).toBe(true);
    status = r.newStatus!;
    expect(status).toBe("QA Decision Rejected");

    // LV4: Trainer retains
    r = validateDisputeAction(status, "retain_markdown", "Trainer", false);
    expect(r.valid).toBe(true);
    status = r.newStatus!;
    expect(status).toBe("Markdown Retained - Trainer");

    // LV5: SME rejects
    r = validateDisputeAction(status, "reject_decision", "Operational SME", false);
    expect(r.valid).toBe(true);
    status = r.newStatus!;
    expect(status).toBe("Trainer Decision Rejected");

    // LV6: Manager retains (final)
    r = validateDisputeAction(status, "retain_markdown", "Manager", false);
    expect(r.valid).toBe(true);
    status = r.newStatus!;
    expect(status).toBe("Pending Acknowledgement");
  });

  it("early resolution at LV1 (SME accepts) goes directly to Pending Ack", () => {
    const r = validateDisputeAction(
      "Pending Support Review",
      "accept_markdown",
      "Operational SME",
      false
    );
    expect(r.valid).toBe(true);
    expect(r.newStatus).toBe("Pending Acknowledgement");
  });

  it("early resolution at LV2 (QA reverses) goes directly to Pending Ack", () => {
    const r = validateDisputeAction(
      "Markdown Disputed",
      "reverse_markdown",
      "Quality & Policy Expert",
      false
    );
    expect(r.valid).toBe(true);
    expect(r.newStatus).toBe("Pending Acknowledgement");
  });
});

describe("Compass — Visibility Scope Resolution", () => {
  it("Manager gets 'all' scope", () => {
    expect(getScopeType("Manager", false)).toBe("all");
  });

  it("Admin override gets 'all' scope regardless of role", () => {
    expect(getScopeType("Agent", true)).toBe("all");
  });

  it("Team Lead gets 'team' scope", () => {
    expect(getScopeType("Team Lead", false)).toBe("team");
  });

  it("Operational SME gets 'team' scope", () => {
    expect(getScopeType("Operational SME", false)).toBe("team");
  });

  it("Quality & Policy Expert gets 'self_filed' scope", () => {
    expect(getScopeType("Quality & Policy Expert", false)).toBe("self_filed");
  });

  it("Trainer gets 'self_filed' scope", () => {
    expect(getScopeType("Trainer", false)).toBe("self_filed");
  });

  it("Agent gets 'self_only' scope", () => {
    expect(getScopeType("Agent", false)).toBe("self_only");
  });

  it("Unknown role defaults to 'self_only' scope", () => {
    expect(getScopeType("Intern", false)).toBe("self_only");
  });
});

describe("Compass — Status Constants Integrity", () => {
  it("all dispute statuses are unique", () => {
    const values = Object.values(DISPUTE_STATUSES);
    expect(new Set(values).size).toBe(values.length);
  });

  it("every level has exactly one entry status", () => {
    for (let level = 1; level <= 6; level++) {
      const config = DISPUTE_LEVEL_CONFIG[level];
      expect(config).toBeDefined();
      expect(typeof config.entryStatus).toBe("string");
    }
  });

  it("every action in every level maps to a result status", () => {
    for (let level = 1; level <= 6; level++) {
      const config = DISPUTE_LEVEL_CONFIG[level];
      for (const action of config.actions) {
        expect(config.resultStatuses[action]).toBeDefined();
      }
    }
  });

  it("all result statuses are valid DISPUTE_STATUSES values", () => {
    const validStatuses = new Set(Object.values(DISPUTE_STATUSES));
    for (let level = 1; level <= 6; level++) {
      const config = DISPUTE_LEVEL_CONFIG[level];
      for (const resultStatus of Object.values(config.resultStatuses)) {
        expect(validStatuses.has(resultStatus as any)).toBe(true);
      }
    }
  });
});
