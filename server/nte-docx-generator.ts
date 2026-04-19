/**
 * NTE DOCX Generator — Matches the exact Genpact NTE template format.
 *
 * Structure:
 *   Pages 1-2: NTE letter (header, narrative, mandate, policy, Art 282, boilerplate, signatures)
 *   Page 3:    Annexure A (blank — user attaches evidence after generation)
 *   Page 4:    CWD acknowledgment (optional)
 *
 * Every page carries:
 *   - Genpact logo in the top-right header
 *   - "Classification: Genpact Confidential" centered footer
 */
import {
  Document,
  Paragraph,
  TextRun,
  AlignmentType,
  BorderStyle,
  Packer,
  UnderlineType,
  Header,
  Footer,
  ImageRun,
  TabStopPosition,
  TabStopType,
  Tab,
} from "docx";
import * as fs from "fs";
import * as path from "path";

// ── Interfaces ──────────────────────────────────────────────────
interface NTEInput {
  date: string;               // e.g. "April 13, 2026"
  employee: {
    full_name: string;
    last_name: string;
    ohr_id: string;
    actual_role?: string;
    department?: string;      // for "Supervisor, {Department}"
    supervisor_name?: string;
    gender?: string;          // "Male" | "Female"
  };
  narrative: string;          // AI-generated incident paragraph (plain text or HTML)
  policy_sections: string[];  // Each entry is one policy citation block (may contain newlines)
  cap_level: string;          // e.g. "CAP 1"
  violation: {
    code: string;
    type: string;
    category: string;
    subtype?: string;
  };
  flm_name?: string;
  hr_name?: string;
  include_cwd_page?: boolean;
}

// ── CAP display labels ──────────────────────────────────────────
const CAP_DISPLAY: Record<string, string> = {
  "CAP 0": "Verbal Warning / Coaching (CAP 0)",
  "CAP 1": "First Formal Corrective Action (CAP 1)",
  "CAP 2": "Second Formal Corrective Action (CAP 2)",
  "CAP 3": "Third Formal Corrective Action (CAP 3)",
  "Termination": "Review for Termination (RFT)",
};

// ── Helpers ─────────────────────────────────────────────────────
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

const SIZE = 22;          // 11pt in half-points
const FONT = "Calibri";

function txt(text: string, opts: Partial<{ bold: boolean; italic: boolean; underline: boolean; allCaps: boolean; size: number }> = {}): TextRun {
  return new TextRun({
    text,
    font: FONT,
    size: opts.size ?? SIZE,
    bold: opts.bold,
    italics: opts.italic,
    underline: opts.underline ? { type: UnderlineType.SINGLE } : undefined,
    allCaps: opts.allCaps,
  });
}

function para(children: TextRun[], opts: Partial<{ after: number; before: number; align: (typeof AlignmentType)[keyof typeof AlignmentType]; indent: number }> = {}): Paragraph {
  return new Paragraph({
    children,
    alignment: opts.align,
    spacing: { after: opts.after ?? 0, before: opts.before ?? 0 },
    indent: opts.indent ? { left: opts.indent } : undefined,
  });
}

function emptyLine(): Paragraph {
  return new Paragraph({ children: [txt("")], spacing: { after: 0 } });
}

// ── Build shared header (Genpact logo top-right) ────────────────
function buildHeader(): Header {
  const logoPath = path.resolve(__dirname, "genpact-logo.png");
  let logoBuffer: Buffer;
  try {
    logoBuffer = fs.readFileSync(logoPath);
  } catch {
    // Fallback: no logo if file missing
    return new Header({
      children: [emptyLine()],
    });
  }

  // Logo: 507×236 px → scale to ~1.2in wide (86400 EMU = 1.2in)
  // 1 inch = 914400 EMU; 1.2in = 1097280 EMU
  const logoWidthEMU = 1097280;
  const logoHeightEMU = Math.round(logoWidthEMU * (236 / 507));

  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new ImageRun({
            data: logoBuffer,
            transformation: {
              width: Math.round(logoWidthEMU / 914400 * 96),  // px at 96 dpi
              height: Math.round(logoHeightEMU / 914400 * 96),
            },
            type: "png",
          }),
        ],
      }),
    ],
  });
}

// ── Build shared footer ─────────────────────────────────────────
function buildFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [txt("Classification: Genpact Confidential", { size: 18 })],
      }),
    ],
  });
}

// ── Shared page properties ──────────────────────────────────────
function pageProps() {
  return {
    page: {
      margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
    },
  };
}

// ════════════════════════════════════════════════════════════════
//  MAIN GENERATOR
// ════════════════════════════════════════════════════════════════
export async function generateNTEDocx(input: NTEInput): Promise<Buffer> {
  const honorific = input.employee.gender === "Female" ? "Ms." : "Mr.";
  const hrName = input.hr_name || "Jocelyn Ramos";
  const flmName = input.flm_name || input.employee.supervisor_name || "[Supervisor Name]";
  const department = input.employee.department || "Operations";
  const role = input.employee.actual_role || "Process Associate";
  const capDisplay = CAP_DISPLAY[input.cap_level] || input.cap_level;

  const header = buildHeader();
  const footer = buildFooter();

  // ── Section 1: NTE Letter (pages 1-2) ─────────────────────────
  const children: Paragraph[] = [];

  // Title: "Notice to Explain" — bold, centered
  children.push(para(
    [txt("Notice to Explain", { bold: true, size: 28 })],
    { align: AlignmentType.CENTER, after: 40 },
  ));

  // Horizontal rule
  children.push(new Paragraph({
    children: [],
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 1 } },
    spacing: { after: 300 },
  }));

  // Date — bold, left
  children.push(para([txt(input.date, { bold: true })], { after: 300 }));

  // Employee block
  children.push(para([txt(input.employee.full_name, { bold: true })]));
  children.push(para([txt(role)]));
  children.push(para([txt("Genpact")], { after: 300 }));

  // Salutation
  children.push(para(
    [txt(`Dear ${honorific} ${input.employee.last_name}`)],
    { after: 200 },
  ));

  // Incident narrative — AI-generated, may be multi-paragraph
  const narrativeClean = stripHtml(input.narrative);
  const narrativeParas = narrativeClean.split(/\n\n+/).filter(p => p.trim());
  for (const p of narrativeParas) {
    children.push(para([txt(p.trim())], { after: 200 }));
  }

  // ── Mandate paragraph ──
  // "IN VIEW THEREOF" bold, "MANDATED" bold, "within one hundred-twenty (120) hours" bold+italic
  children.push(new Paragraph({
    children: [
      txt("IN VIEW THEREOF", { bold: true }),
      txt(", you are hereby "),
      txt("MANDATED", { bold: true }),
      txt(" to submit an explanation in writing to HR, "),
      txt(`${hrName} through jocelyn.ramos@genpact.com`),
      txt(", "),
      txt("within one hundred-twenty (120) hours from receipt of this Notice", { bold: true, italic: true }),
      txt(", stating your position why you should not be administratively held liable in reference to your alleged violation/s of:"),
    ],
    spacing: { after: 200 },
  }));

  // ── Policy section header ──
  children.push(para(
    [txt("GENPACT's Corrective Action Policy particularly:", { bold: true })],
    { after: 200 },
  ));

  // Policy citations — each entry from the wizard
  // The AI generates these as structured text; render with proper formatting
  for (const section of input.policy_sections) {
    const lines = stripHtml(section).split("\n").filter(l => l.trim());
    for (const line of lines) {
      const trimmed = line.trim();
      // Detect "Possible Penalty:" lines → underline
      if (/^possible penalty/i.test(trimmed)) {
        children.push(para(
          [txt(trimmed, { underline: true })],
          { after: 120 },
        ));
      }
      // Detect section headers (e.g., "1. Attendance" or "4. Misconduct") → bold+underline
      else if (/^\d+\.?\s+\w/.test(trimmed) && trimmed.length < 120) {
        children.push(para(
          [txt(trimmed, { bold: true, underline: true })],
          { after: 80 },
        ));
      }
      // Detect sub-sections (e.g., "1.1 Absenteeism") → bold
      else if (/^\d+\.\d+/.test(trimmed) && trimmed.length < 120) {
        children.push(para(
          [txt(trimmed, { bold: true })],
          { after: 80 },
        ));
      }
      // Normal text
      else {
        children.push(para([txt(trimmed)], { after: 80 }));
      }
    }
  }

  // Possible penalty line (overall)
  children.push(emptyLine());
  children.push(para(
    [txt(`Possible Penalty: ${capDisplay}`, { underline: true })],
    { after: 200 },
  ));

  // ── Article 282 ──
  children.push(new Paragraph({
    children: [
      txt("and, "),
      txt("Article 282 of the Labor Code of the Philippines", { bold: true }),
      txt(", particularly:"),
    ],
    spacing: { after: 80 },
  }));
  children.push(para(
    [txt("a. Serious misconduct or willful disobedience by the employee of the lawful orders of his employer or representative in connection with his work.")],
    { after: 80 },
  ));
  children.push(para(
    [txt("b. Gross and habitual neglect by the employee of his duties.")],
    { after: 80 },
  ));
  children.push(para(
    [txt("e. Other causes analogous to the foregoing: violation to company policies.")],
    { after: 200 },
  ));

  // ── Boilerplate: evidence submission ──
  children.push(para(
    [txt("Within the same period, you may submit such evidence (documentary information or written deposition of your witness/es) that may support your explanation. Any witness/es you will identify will be required to confirm and verify the declarations stated in their disposition.")],
    { after: 200 },
  ));

  // ── Failure to submit — ALL CAPS, ALL BOLD ──
  children.push(para(
    [txt("YOUR FAILURE TO SUBMIT SAID EXPLANATION AND DOCUMENTS WITHIN THE PRESCRIBED PERIOD SHALL BE DEEMED A WAIVER ON YOUR PART TO PRESENT THE SAME. IN SUCH EVENT, THE MATTER WILL BE DECIDED BASED ON THE RECORDS AND EVIDENCE AVAILABLE. MANAGEMENT RESERVES THE RIGHT TO INCREASE THE PENALTY UP TO TERMINATION DEPENDING ON THE CIRCUMSTANCES OF THE CASE.", { bold: true })],
    { after: 200 },
  ));

  // ── Remaining boilerplate ──
  children.push(para(
    [txt("If the company would be requiring further clarification based on your duly submitted written explanation, it hereby reserves the right to invite you to an administrative hearing, which will be confirmed and arranged by your aligned HR. The company, likewise, reserves the right to invite you on other dates as it may deem proper.")],
    { after: 80 },
  ));
  children.push(para(
    [txt("You may retain the assistance and services of private counsel during the proceedings. Should you wish to be represented by a preferred counsel, please notify us at least two (2) days in advance so we can arrange attendance of our internal counsel.")],
    { after: 200 },
  ));
  children.push(para(
    [txt("Should the grounds for above alleged violation/s be established, the appropriate disciplinary action will be imposed as prescribed under the applicable laws, rules and policies governing the alleged offense/s.")],
    { after: 200 },
  ));
  children.push(para(
    [txt("Please note that Genpact adheres to a no-retaliation policy, violation of which will result in strict and prompt imposition of appropriate penalties.")],
    { after: 300 },
  ));

  // ── Sincerely ──
  children.push(para([txt("Sincerely,")], { after: 600 }));

  // Supervisor signature block
  children.push(para([txt(flmName, { bold: true })]));
  children.push(para([txt(`Supervisor, ${department}`)], { after: 600 }));

  // HR signature block (space for signature)
  children.push(emptyLine());
  children.push(para([txt(hrName, { bold: true })]));
  children.push(para([txt("Employee Relations Manager, HR")], { after: 400 }));

  // Received by
  children.push(emptyLine());
  children.push(para([txt("Received by:", { bold: true })], { after: 200 }));
  children.push(para([txt(input.employee.full_name, { bold: true })]));
  children.push(para([txt(role)]));
  children.push(para([txt("Date Received:")]));

  // ── Section 2: Annexure A (blank page) ────────────────────────
  const annexureChildren: Paragraph[] = [];
  annexureChildren.push(para(
    [txt("Annexure A:", { bold: true, size: 24 })],
    { after: 400 },
  ));
  // Blank — user attaches evidence after generation
  annexureChildren.push(emptyLine());

  // ── Build sections array ──────────────────────────────────────
  const sections: any[] = [];

  // Section 1: NTE letter
  sections.push({
    properties: pageProps(),
    headers: { default: header },
    footers: { default: footer },
    children,
  });

  // Section 2: Annexure A
  sections.push({
    properties: pageProps(),
    headers: { default: buildHeader() },
    footers: { default: buildFooter() },
    children: annexureChildren,
  });

  // ── Optional Section 3: CWD acknowledgment ───────────────────
  if (input.include_cwd_page) {
    const cwdChildren: Paragraph[] = [];

    cwdChildren.push(para(
      [txt("CRITICAL WORKDAY POLICY ACKNOWLEDGMENT AND CONSENT", { bold: true, size: 24 })],
      { align: AlignmentType.CENTER, after: 100 },
    ));
    cwdChildren.push(para(
      [txt("Employee Sign-off Sheet", { bold: true })],
      { align: AlignmentType.CENTER, after: 400 },
    ));
    cwdChildren.push(para(
      [txt("I, the undersigned employee, hereby acknowledge the following:")],
      { after: 200 },
    ));

    // Acknowledgment of Policy
    cwdChildren.push(para([txt("Acknowledgment of Policy", { bold: true, underline: true })], { after: 100 }));
    const ackItems = [
      "I have been duly informed of, and have read and fully understood all pertinent information, details, instructions and implications concerning the company's Critical Workday (CWD) Policy, as detailed in the accompanying memorandum.",
      "I understand that CWDs are essential to meeting Client Service Level Agreements (SLAs) and maintaining operational success.",
      "I pledge my commitment to full compliance with all requirements, schedules, and policies set forth regarding Critical Workdays.",
    ];
    ackItems.forEach((item, i) => {
      cwdChildren.push(para([txt(`${i + 1}. ${item}`)], { indent: 360, after: 80 }));
    });

    // Understanding of Disciplinary Consequences
    cwdChildren.push(para([txt("Understanding of Disciplinary Consequences", { bold: true, underline: true })], { before: 200, after: 100 }));
    const discItems = [
      "I understand that any violation of the established CWD Policy, including but not limited to any instance of Absence, Unscheduled Leave, or Unapproved Leave during a declared Critical Workday, may result in disciplinary action.",
      "I acknowledge that disciplinary action can have consequences up to and including removal from the Program and termination of my employment, as determined and initiated by Genpact.",
      "I agree and understand that Management reserves the right of discretion to impose the necessary penalty than the standard disciplinary action (e.g., CAP 2), depending upon the existence of any aggravating or mitigating circumstance(s) specific to each case.",
    ];
    discItems.forEach((item, i) => {
      cwdChildren.push(para([txt(`${i + 1}. ${item}`)], { indent: 360, after: 80 }));
    });

    // Policy Changes and Reporting Obligation
    cwdChildren.push(para([txt("Policy Changes and Reporting Obligation", { bold: true, underline: true })], { before: 200, after: 100 }));
    const polItems = [
      "I further agree that Genpact management may amend or revise the CWD Policy, or the associated memorandum, at any time upon notice to all concerned employees. I likewise pledge compliance with any revised rules or policies that may be promulgated henceforth.",
      "I understand that if I have a concern about a possible violation of this Policy by myself or others, I will promptly report the concern to my line Manager, Human Resources representative, the Legal & Compliance Team, or the Ombudsman.",
    ];
    polItems.forEach((item, i) => {
      cwdChildren.push(para([txt(`${i + 1}. ${item}`)], { indent: 360, after: 80 }));
    });

    // Signed by
    cwdChildren.push(para([txt("Signed by:")], { before: 400, after: 400 }));
    cwdChildren.push(para([txt("Name of Employee | Date")], { after: 200 }));

    sections.push({
      properties: pageProps(),
      headers: { default: buildHeader() },
      footers: { default: buildFooter() },
      children: cwdChildren,
    });
  }

  // ── Create document ───────────────────────────────────────────
  const doc = new Document({
    creator: "Playbook - NTE Build Assist",
    title: `NTE - ${input.employee.full_name}`,
    description: `Notice to Explain for ${input.employee.full_name}`,
    sections,
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer as Buffer;
}
