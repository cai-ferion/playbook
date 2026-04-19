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
  ShadingType,
} from "docx";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Interfaces ──────────────────────────────────────────────────
interface ViolationEntry {
  code: string;             // e.g. "4.1.3"
  type: string;             // sub-subsection text
  text?: string;            // alias for type
  penalty: string;          // e.g. "CAP 1"
  category: string;         // section name, e.g. "4. Misconduct- IT Infrastructure..."
  subsection?: string;      // full subsection, e.g. "4.1 IT Security, Information Security..."
  subsectionCode?: string;  // e.g. "4.1"
  subsectionTitle?: string; // e.g. "IT Security, Information Security, Data Privacy Violation:"
  subtype?: string;
}

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
    sex?: string;             // "M" | "F" — preferred over gender
  };
  narrative: string;          // AI-generated incident paragraph (plain text or HTML)
  policy_sections: string[];  // Legacy: each entry is one policy citation block (may contain newlines)
  cap_level: string;          // e.g. "CAP 1"
  violation: ViolationEntry;  // Primary (first) violation for backward compat
  violations?: ViolationEntry[]; // Multi-violation support
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

// Determine if employee is female based on sex column or gender field
function isFemale(emp: NTEInput["employee"]): boolean {
  if (emp.sex === "F") return true;
  if (emp.sex === "M") return false;
  if (emp.gender === "Female") return true;
  return false; // default male
}

const SIZE = 22;          // 11pt in half-points
const FONT = "Calibri";
// Consistent line spacing: 200 half-points after each paragraph (≈10pt)
const PARA_AFTER = 200;

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

// All body paragraphs default to JUSTIFIED alignment and consistent spacing
function para(children: TextRun[], opts: Partial<{ after: number; before: number; align: (typeof AlignmentType)[keyof typeof AlignmentType]; indent: number }> = {}): Paragraph {
  return new Paragraph({
    children,
    alignment: opts.align ?? AlignmentType.JUSTIFIED,
    spacing: { after: opts.after ?? PARA_AFTER, before: opts.before ?? 0 },
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
    return new Header({ children: [emptyLine()] });
  }

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
              width: Math.round(logoWidthEMU / 914400 * 96),
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
  const female = isFemale(input.employee);
  const honorific = female ? "Ms." : "Mr.";
  const pronoun = female ? "she" : "he";
  const possessive = female ? "her" : "his";
  const objective = female ? "her" : "him";

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

  // Date — bold, left-aligned (exception to justified)
  children.push(para([txt(input.date, { bold: true })], { align: AlignmentType.LEFT, after: 300 }));

  // Employee block — left-aligned
  children.push(para([txt(input.employee.full_name, { bold: true })], { align: AlignmentType.LEFT, after: 0 }));
  children.push(para([txt(role)], { align: AlignmentType.LEFT, after: 0 }));
  children.push(para([txt("Genpact")], { align: AlignmentType.LEFT, after: 300 }));

  // Salutation — left-aligned
  children.push(para(
    [txt(`Dear ${honorific} ${input.employee.last_name}`)],
    { align: AlignmentType.LEFT, after: PARA_AFTER },
  ));

  // Incident narrative — AI-generated, may be multi-paragraph
  const narrativeClean = stripHtml(input.narrative);
  const narrativeParas = narrativeClean.split(/\n\n+/).filter(p => p.trim());
  for (const p of narrativeParas) {
    children.push(para([txt(p.trim())], { after: PARA_AFTER }));
  }

  // ── Mandate paragraph ──
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
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: PARA_AFTER },
  }));

  // ── Policy section header ──
  children.push(para(
    [txt("GENPACT's Corrective Action Policy particularly:", { bold: true })],
    { after: PARA_AFTER },
  ));

  // ── Deterministic multi-violation policy citations with smart deduplication ──
  // Uses the violations array if available, falls back to legacy policy_sections parsing
  const allViolations: ViolationEntry[] = (input.violations && input.violations.length > 0)
    ? input.violations
    : (input.violation ? [input.violation] : []);

  if (allViolations.length > 0) {
    let prevSection = "";
    let prevSubsection = "";

    for (let vi = 0; vi < allViolations.length; vi++) {
      const v = allViolations[vi];
      const sectionName = v.category || "";
      const subsectionFull = v.subsection || (v.subsectionCode ? v.subsectionCode + " " + (v.subsectionTitle || "") : "");
      const subSubText = v.code + " " + (v.text || v.type || "");
      const penaltyLabel = CAP_DISPLAY[v.penalty] || v.penalty || "";

      // (1) If section differs from previous → show section + subsection + sub-subsection
      if (sectionName !== prevSection) {
        children.push(new Paragraph({
          children: [txt(sectionName, { bold: true })],
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 80 },
          shading: { type: ShadingType.CLEAR, fill: "D9D9D9" },
        }));
        if (subsectionFull) {
          children.push(para([txt(subsectionFull, { bold: true })], { after: 80 }));
        }
        children.push(para([txt(subSubText)], { after: 80 }));
      }
      // (2) Same section, different subsection → show subsection + sub-subsection only
      else if (subsectionFull !== prevSubsection) {
        if (subsectionFull) {
          children.push(para([txt(subsectionFull, { bold: true })], { after: 80 }));
        }
        children.push(para([txt(subSubText)], { after: 80 }));
      }
      // (3) Same section AND same subsection → show only sub-subsection
      else {
        children.push(para([txt(subSubText)], { after: 80 }));
      }

      // Possible penalty for this violation
      children.push(emptyLine());
      children.push(para(
        [txt(`Possible Penalty: ${penaltyLabel}`, { underline: true })],
        { after: PARA_AFTER },
      ));

      prevSection = sectionName;
      prevSubsection = subsectionFull;
    }
  } else {
    // Legacy fallback: parse policy_sections strings
    for (const section of input.policy_sections) {
      const lines = stripHtml(section).split("\n").filter(l => l.trim());
      for (const line of lines) {
        const trimmed = line.trim();
        const clean = trimmed.replace(/^[•\-]\s*/, "");
        if (/^possible penalty/i.test(clean)) continue;
        if (/^\d+\.?\s+\w/.test(clean) && !/^\d+\.\d+/.test(clean) && clean.length < 120) {
          children.push(new Paragraph({
            children: [txt(clean, { bold: true })],
            alignment: AlignmentType.JUSTIFIED,
            spacing: { after: 80 },
            shading: { type: ShadingType.CLEAR, fill: "D9D9D9" },
          }));
        } else if (/^\d+\.\d+\s/.test(clean) && !/^\d+\.\d+\.\d+/.test(clean) && clean.length < 120) {
          children.push(para([txt(clean, { bold: true })], { after: 80 }));
        } else if (/^\d+\.\d+\.\d+/.test(clean) && clean.length < 150) {
          children.push(para([txt(clean)], { after: 80 }));
        } else {
          children.push(para([txt(clean)], { after: 80 }));
        }
      }
    }
    // Single overall penalty line for legacy path
    children.push(emptyLine());
    children.push(para(
      [txt(`Possible Penalty: ${capDisplay}`, { underline: true })],
      { after: PARA_AFTER },
    ));
  }

  // ── Article 282 of the Labor Code of the Philippines (NON-NEGOTIABLE) ──
  children.push(new Paragraph({
    children: [
      txt("and, "),
      txt("Article 282 of the Labor Code of the Philippines", { bold: true }),
      txt(", particularly:"),
    ],
    alignment: AlignmentType.JUSTIFIED,
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
    { after: PARA_AFTER },
  ));

  // ── Boilerplate: evidence submission ──
  children.push(para(
    [txt("Within the same period, you may submit such evidence (documentary information or written deposition of your witness/es) that may support your explanation. Any witness/es you will identify will be required to confirm and verify the declarations stated in their disposition.")],
    { after: PARA_AFTER },
  ));

  // ── Failure to submit — ALL CAPS, ALL BOLD ──
  children.push(para(
    [txt("YOUR FAILURE TO SUBMIT SAID EXPLANATION AND DOCUMENTS WITHIN THE PRESCRIBED PERIOD SHALL BE DEEMED A WAIVER ON YOUR PART TO PRESENT THE SAME. IN SUCH EVENT, THE MATTER WILL BE DECIDED BASED ON THE RECORDS AND EVIDENCE AVAILABLE. MANAGEMENT RESERVES THE RIGHT TO INCREASE THE PENALTY UP TO TERMINATION DEPENDING ON THE CIRCUMSTANCES OF THE CASE.", { bold: true })],
    { after: PARA_AFTER },
  ));

  // ── Remaining boilerplate — all with consistent PARA_AFTER spacing ──
  children.push(para(
    [txt("If the company would be requiring further clarification based on your duly submitted written explanation, it hereby reserves the right to invite you to an administrative hearing, which will be confirmed and arranged by your aligned HR. The company, likewise, reserves the right to invite you on other dates as it may deem proper.")],
    { after: PARA_AFTER },
  ));
  children.push(para(
    [txt("You may retain the assistance and services of private counsel during the proceedings. Should you wish to be represented by a preferred counsel, please notify us at least two (2) days in advance so we can arrange attendance of our internal counsel.")],
    { after: PARA_AFTER },
  ));
  children.push(para(
    [txt(`Should the grounds for above alleged violation/s be established, the appropriate disciplinary action will be imposed as prescribed under the applicable laws, rules and policies governing the alleged offense/s.`)],
    { after: PARA_AFTER },
  ));
  children.push(para(
    [txt("Please note that Genpact adheres to a no-retaliation policy, violation of which will result in strict and prompt imposition of appropriate penalties.")],
    { after: 300 },
  ));

  // ── Sincerely — left-aligned ──
  children.push(para([txt("Sincerely,")], { align: AlignmentType.LEFT, after: 600 }));

  // Supervisor signature block — NO underlines/lines
  children.push(para([txt(flmName, { bold: true })], { align: AlignmentType.LEFT, after: 0 }));
  children.push(para([txt(`Supervisor, ${department}`)], { align: AlignmentType.LEFT, after: 600 }));

  // HR signature block — NO underlines/lines
  children.push(emptyLine());
  children.push(para([txt(hrName, { bold: true })], { align: AlignmentType.LEFT, after: 0 }));
  children.push(para([txt("Employee Relations Manager, HR")], { align: AlignmentType.LEFT, after: 400 }));

  // Received by — NO underlines/lines
  children.push(emptyLine());
  children.push(para([txt("Received by:", { bold: true })], { align: AlignmentType.LEFT, after: PARA_AFTER }));
  children.push(para([txt(input.employee.full_name, { bold: true })], { align: AlignmentType.LEFT, after: 0 }));
  children.push(para([txt(role)], { align: AlignmentType.LEFT, after: 0 }));
  children.push(para([txt("Date Received:")], { align: AlignmentType.LEFT }));

  // ── Section 2: Annexure A (blank page) ────────────────────────
  const annexureChildren: Paragraph[] = [];
  annexureChildren.push(para(
    [txt("Annexure A:", { bold: true, size: 24 })],
    { after: 400 },
  ));
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
      { after: PARA_AFTER },
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
      `I acknowledge that disciplinary action can have consequences up to and including removal from the Program and termination of my employment, as determined and initiated by Genpact.`,
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
    cwdChildren.push(para([txt("Name of Employee | Date")], { after: PARA_AFTER }));

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
