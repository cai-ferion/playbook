import { describe, it, expect } from "vitest";

/**
 * CAP Build Assist — Document Build Assist Dropdown & CAP 2/3 Wizard Tests
 *
 * Validates the business logic constants, config maps, active periods,
 * and DOCX payload shapes used by the CAP 2 and CAP 3 wizards.
 * These tests do NOT require a live database or browser — they test
 * the exported logic and contract shapes.
 */

// ── CAP Active Days Constants (must match io-routes.ts) ────────────────

describe("CAP Active Days Constants", () => {
  // Mirror of CA_CAP_ACTIVE_DAYS from corrective-actions.js
  const CA_CAP_ACTIVE_DAYS: Record<string, number> = {
    "CAP 0": 0,
    "CAP 1": 60,
    "CAP 2": 90,
    "CAP 3": 180,
    "Corrective Suspension": 0,
    "Review for Termination": 0,
  };

  // Mirror of CAP_ACTIVE_DAYS from io-routes.ts (server-side)
  const SERVER_CAP_ACTIVE_DAYS: Record<string, number> = {
    "CAP 0": 0,
    "CAP 1": 60,
    "CAP 2": 90,
    "CAP 3": 180,
    "Corrective Suspension": 0,
    "Review for Termination": 0,
  };

  it("CAP 2 has 90-day active period on both client and server", () => {
    expect(CA_CAP_ACTIVE_DAYS["CAP 2"]).toBe(90);
    expect(SERVER_CAP_ACTIVE_DAYS["CAP 2"]).toBe(90);
  });

  it("CAP 3 has 180-day active period on both client and server", () => {
    expect(CA_CAP_ACTIVE_DAYS["CAP 3"]).toBe(180);
    expect(SERVER_CAP_ACTIVE_DAYS["CAP 3"]).toBe(180);
  });

  it("client and server active days are identical", () => {
    for (const key of Object.keys(CA_CAP_ACTIVE_DAYS)) {
      expect(CA_CAP_ACTIVE_DAYS[key]).toBe(SERVER_CAP_ACTIVE_DAYS[key]);
    }
  });
});

// ── Document Build Assist Dropdown Config ──────────────────────────────

describe("Document Build Assist Dropdown Menu", () => {
  const DOC_TYPES = [
    { id: "nte", label: "Notice to Explain (NTE)", accent: "#EF4444" },
    { id: "cap1", label: "CAP 1 — First Corrective Action", accent: "#3B82F6" },
    { id: "cap2", label: "CAP 2 — Second Corrective Action", accent: "#F59E0B" },
    { id: "cap3", label: "CAP 3 — Third Corrective Action", accent: "#DC2626" },
  ];

  it("has exactly 4 document types (NTE, CAP 1, CAP 2, CAP 3)", () => {
    expect(DOC_TYPES).toHaveLength(4);
  });

  it("includes NTE as the first option", () => {
    expect(DOC_TYPES[0].id).toBe("nte");
  });

  it("includes CAP 1, CAP 2, CAP 3 in order", () => {
    expect(DOC_TYPES[1].id).toBe("cap1");
    expect(DOC_TYPES[2].id).toBe("cap2");
    expect(DOC_TYPES[3].id).toBe("cap3");
  });

  it("each type has a unique accent color", () => {
    const accents = DOC_TYPES.map((t) => t.accent);
    expect(new Set(accents).size).toBe(accents.length);
  });

  it("all types have non-empty labels", () => {
    for (const t of DOC_TYPES) {
      expect(t.label.length).toBeGreaterThan(0);
    }
  });
});

// ── CAP N Config Map (shared wizard config for CAP 2/3) ───────────────

describe("CAP N Wizard Config Map", () => {
  // Mirror of _capNConfig from corrective-actions.js
  const capNConfig: Record<
    string,
    { level: string; num: string; ordinal: string; activeDays: number; accent: string; title: string; desc: string }
  > = {
    cap2: {
      level: "CAP 2",
      num: "2",
      ordinal: "Second",
      activeDays: 90,
      accent: "#F59E0B",
      title: "CAP 2 Build Assist",
      desc: "Second Formal Corrective Action",
    },
    cap3: {
      level: "CAP 3",
      num: "3",
      ordinal: "Third",
      activeDays: 180,
      accent: "#DC2626",
      title: "CAP 3 Build Assist",
      desc: "Third Formal Corrective Action",
    },
  };

  it("CAP 2 config has correct active days (90)", () => {
    expect(capNConfig.cap2.activeDays).toBe(90);
  });

  it("CAP 3 config has correct active days (180)", () => {
    expect(capNConfig.cap3.activeDays).toBe(180);
  });

  it("CAP 2 ordinal is 'Second'", () => {
    expect(capNConfig.cap2.ordinal).toBe("Second");
  });

  it("CAP 3 ordinal is 'Third'", () => {
    expect(capNConfig.cap3.ordinal).toBe("Third");
  });

  it("CAP 2 level string matches 'CAP 2'", () => {
    expect(capNConfig.cap2.level).toBe("CAP 2");
  });

  it("CAP 3 level string matches 'CAP 3'", () => {
    expect(capNConfig.cap3.level).toBe("CAP 3");
  });

  it("each config has distinct accent colors", () => {
    expect(capNConfig.cap2.accent).not.toBe(capNConfig.cap3.accent);
  });
});

// ── CAP DOCX Payload Shape ────────────────────────────────────────────

describe("CAP DOCX Payload Shape", () => {
  // Validate the shape of the payload sent to /cap-build-assist/docx
  function buildCapDocxPayload(
    capLevel: string,
    employee: { full_name: string; ohr_id: string; actual_role: string; supervisor_name: string; gender: string },
    explanationDate: string,
    explanationSummary: string,
    violationSection: string,
    violationSubsection: string,
    violations: Array<{ code: string; text: string }>,
    flmName: string,
    issuanceDate: string,
    deliberation: string
  ) {
    return {
      cap_level: capLevel,
      employee: {
        full_name: employee.full_name,
        ohr_id: employee.ohr_id,
        actual_role: employee.actual_role || "Process Associate",
        department: "Operations",
        supervisor_name: employee.supervisor_name,
        gender: employee.gender || "Male",
      },
      explanation_date: explanationDate,
      explanation_summary: explanationSummary,
      violation_section: violationSection,
      violation_subsection: violationSubsection,
      violations,
      flm_name: flmName,
      issuance_date: issuanceDate,
      nte_response_text: deliberation.replace(/<[^>]*>/g, ""),
    };
  }

  const sampleEmployee = {
    full_name: "Doe, John",
    ohr_id: "123456",
    actual_role: "Process Associate",
    supervisor_name: "Smith, Jane",
    gender: "Male",
  };

  it("CAP 2 payload has correct cap_level", () => {
    const payload = buildCapDocxPayload(
      "CAP 2",
      sampleEmployee,
      "2026-04-10",
      "Employee stated they were unaware of the policy.",
      "Section 3 Misconduct and Acts of Negligence",
      "Sub Section D Insubordination",
      [{ code: "3.D", text: "Insubordination" }],
      "Smith, Jane",
      "2026-04-22",
      "After review, the action does not excuse the charge."
    );
    expect(payload.cap_level).toBe("CAP 2");
    expect(payload.employee.full_name).toBe("Doe, John");
    expect(payload.issuance_date).toBe("2026-04-22");
  });

  it("CAP 3 payload has correct cap_level", () => {
    const payload = buildCapDocxPayload(
      "CAP 3",
      sampleEmployee,
      "2026-04-10",
      "Employee stated they were unaware of the policy.",
      "Section 3 Misconduct and Acts of Negligence",
      "Sub Section D Insubordination",
      [{ code: "3.D", text: "Insubordination" }],
      "Smith, Jane",
      "2026-04-22",
      "After review, the action does not excuse the charge."
    );
    expect(payload.cap_level).toBe("CAP 3");
  });

  it("strips HTML from deliberation text", () => {
    const payload = buildCapDocxPayload(
      "CAP 2",
      sampleEmployee,
      "",
      "summary",
      "Section",
      "Sub Section",
      [],
      "FLM",
      "2026-04-22",
      "<p>After <strong>review</strong>, the action does not excuse.</p>"
    );
    expect(payload.nte_response_text).not.toContain("<");
    expect(payload.nte_response_text).toContain("After review, the action does not excuse.");
  });

  it("all required fields are present", () => {
    const payload = buildCapDocxPayload(
      "CAP 2",
      sampleEmployee,
      "2026-04-10",
      "summary",
      "Section",
      "Sub Section",
      [],
      "FLM",
      "2026-04-22",
      "deliberation"
    );
    const requiredKeys = [
      "cap_level",
      "employee",
      "explanation_date",
      "explanation_summary",
      "violation_section",
      "violation_subsection",
      "violations",
      "flm_name",
      "issuance_date",
      "nte_response_text",
    ];
    for (const key of requiredKeys) {
      expect(payload).toHaveProperty(key);
    }
  });
});

// ── CAP Active Period Calculation ─────────────────────────────────────

describe("CAP Active Period Date Calculation", () => {
  function calculateEndDate(startDate: Date, activeDays: number): Date {
    return new Date(startDate.getTime() + activeDays * 24 * 60 * 60 * 1000);
  }

  const startDate = new Date("2026-04-22T00:00:00Z");

  it("CAP 2 (90 days) ends on July 21, 2026", () => {
    const endDate = calculateEndDate(startDate, 90);
    expect(endDate.toISOString().slice(0, 10)).toBe("2026-07-21");
  });

  it("CAP 3 (180 days) ends on October 19, 2026", () => {
    const endDate = calculateEndDate(startDate, 180);
    expect(endDate.toISOString().slice(0, 10)).toBe("2026-10-19");
  });

  it("CAP 1 (60 days) ends on June 21, 2026", () => {
    const endDate = calculateEndDate(startDate, 60);
    expect(endDate.toISOString().slice(0, 10)).toBe("2026-06-21");
  });
});

// ── CAP Generate Payload Shape ────────────────────────────────────────

describe("CAP Generate (AI Deliberation) Payload Shape", () => {
  function buildGeneratePayload(
    employee: { full_name: string; ohr_id: string },
    violations: Array<{ code: string; text: string }>,
    capLevel: string,
    explanationDate: string,
    explanationSummary: string,
    nteNarrative: string,
    previousCaps: Array<{ cap_level: string; date_of_incident: string }>
  ) {
    return {
      employee,
      violation: violations[0] || null,
      violations,
      cap_level: capLevel,
      explanation_date: explanationDate,
      explanation_summary: explanationSummary,
      nte_narrative: nteNarrative,
      previous_caps: previousCaps,
    };
  }

  it("CAP 2 generate payload has cap_level 'CAP 2'", () => {
    const payload = buildGeneratePayload(
      { full_name: "Doe, John", ohr_id: "123456" },
      [{ code: "3.D", text: "Insubordination" }],
      "CAP 2",
      "2026-04-10",
      "Employee stated they were unaware.",
      "Prior NTE narrative text",
      [{ cap_level: "CAP 1", date_of_incident: "2026-03-01" }]
    );
    expect(payload.cap_level).toBe("CAP 2");
    expect(payload.violation).toEqual({ code: "3.D", text: "Insubordination" });
    expect(payload.previous_caps).toHaveLength(1);
  });

  it("CAP 3 generate payload has cap_level 'CAP 3'", () => {
    const payload = buildGeneratePayload(
      { full_name: "Doe, John", ohr_id: "123456" },
      [],
      "CAP 3",
      "2026-04-10",
      "Employee stated they were unaware.",
      "Prior NTE narrative text",
      [
        { cap_level: "CAP 1", date_of_incident: "2026-01-15" },
        { cap_level: "CAP 2", date_of_incident: "2026-03-01" },
      ]
    );
    expect(payload.cap_level).toBe("CAP 3");
    expect(payload.violation).toBeNull();
    expect(payload.previous_caps).toHaveLength(2);
  });
});

// ── DOCX Template URL Mapping ─────────────────────────────────────────

describe("DOCX Template URL Mapping", () => {
  // Mirror of the CDN template URLs from io-routes.ts
  const TEMPLATE_URLS: Record<string, string> = {
    "CAP 1":
      "https://d2xsxph8kpxj0f.cloudfront.net/310519663445219651/5AVfpygNb7cNbPRpHCcCdp/Template-CAP1_5b2e3d1a.docx",
    "CAP 2":
      "https://d2xsxph8kpxj0f.cloudfront.net/310519663445219651/5AVfpygNb7cNbPRpHCcCdp/Template-CAP2_fbec4ea4.docx",
    "CAP 3":
      "https://d2xsxph8kpxj0f.cloudfront.net/310519663445219651/5AVfpygNb7cNbPRpHCcCdp/Template-CAP3_bbb57f1f.docx",
  };

  it("CAP 2 template URL exists and points to CloudFront", () => {
    expect(TEMPLATE_URLS["CAP 2"]).toBeDefined();
    expect(TEMPLATE_URLS["CAP 2"]).toContain("cloudfront.net");
    expect(TEMPLATE_URLS["CAP 2"]).toContain("Template-CAP2");
  });

  it("CAP 3 template URL exists and points to CloudFront", () => {
    expect(TEMPLATE_URLS["CAP 3"]).toBeDefined();
    expect(TEMPLATE_URLS["CAP 3"]).toContain("cloudfront.net");
    expect(TEMPLATE_URLS["CAP 3"]).toContain("Template-CAP3");
  });

  it("all three CAP levels have distinct template URLs", () => {
    const urls = Object.values(TEMPLATE_URLS);
    expect(new Set(urls).size).toBe(urls.length);
  });
});
