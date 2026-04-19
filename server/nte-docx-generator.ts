/**
 * NTE DOCX Generator
 * Produces a Notice to Explain document matching the Genpact NTE template format.
 * Structure: Page 1-2 (NTE letter + signatures), Page 3 (Annexure A), Page 4 (CWD acknowledgment, optional).
 */
import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  PageBreak,
  HeadingLevel,
  ShadingType,
  VerticalAlign,
  Packer,
  UnderlineType,
  Header,
  Footer,
  ImageRun,
} from "docx";

// ── Tag color mapping (matching the attendance color scheme) ──
const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  P:    { bg: "2E7D32", text: "FFFFFF" },
  LATE: { bg: "F9A825", text: "000000" },
  UPL:  { bg: "C62828", text: "FFFFFF" },
  PL:   { bg: "1565C0", text: "FFFFFF" },
  ML:   { bg: "6A1B9A", text: "FFFFFF" },
  WO:   { bg: "424242", text: "FFFFFF" },
  NYO:  { bg: "78909C", text: "FFFFFF" },
  EXIT: { bg: "37474F", text: "FFFFFF" },
  NCNS: { bg: "B71C1C", text: "FFFFFF" },
  AWOL: { bg: "880E4F", text: "FFFFFF" },
  SL:   { bg: "00838F", text: "FFFFFF" },
  VL:   { bg: "00695C", text: "FFFFFF" },
};

const DEFAULT_TAG_COLOR = { bg: "E0E0E0", text: "000000" };

// ── CAP level display mapping ──
const CAP_DISPLAY: Record<string, string> = {
  "CAP 0": "Verbal Warning / Coaching (CAP 0)",
  "CAP 1": "First Formal Corrective Action (CAP 1)",
  "CAP 2": "Second Formal Corrective Action (CAP 2)",
  "CAP 3": "Third Formal Corrective Action (CAP 3)",
  "Termination": "Termination of Employment",
};

// ── Interfaces ──
interface NTEInput {
  date: string;           // NTE date (e.g., "April 20, 2026")
  employee: {
    full_name: string;
    last_name: string;
    ohr_id: string;
    actual_role?: string;
    planning_group?: string;
    supervisor_name?: string;
    supervisor_email?: string;
    gender?: string;       // "Male" or "Female" for Mr./Ms.
  };
  narrative: string;       // AI-generated incident narrative (plain text)
  policy_text: string;     // Policy section citations (plain text or HTML)
  cap_level: string;       // e.g., "CAP 3"
  violation: {
    code: string;
    type: string;
    category: string;
    subtype?: string;
  };
  attendance: Array<{
    log_date: string;
    tag: string;
  }>;
  flm_name?: string;
  flm_email?: string;
  hr_name?: string;
  include_cwd_page?: boolean;  // Include Critical Workday acknowledgment page
}

// ── Helper: strip HTML tags for plain text ──
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

// ── Helper: parse narrative into paragraphs ──
function narrativeToParagraphs(narrative: string): Paragraph[] {
  const clean = stripHtml(narrative);
  const paragraphs = clean.split(/\n\n+/).filter(p => p.trim());
  return paragraphs.map(p => new Paragraph({
    children: [new TextRun({ text: p.trim(), size: 22, font: "Calibri" })],
    spacing: { after: 200 },
  }));
}

// ── Helper: parse policy text into paragraphs ──
function policyToParagraphs(policyText: string): Paragraph[] {
  const clean = stripHtml(policyText);
  const lines = clean.split(/\n/).filter(l => l.trim());
  return lines.map(line => {
    const isBullet = line.startsWith("•") || line.startsWith("-");
    const text = isBullet ? line.replace(/^[•\-]\s*/, "") : line;
    const isSectionHeader = /^section\s/i.test(text) || /^sub\s*section/i.test(text);
    return new Paragraph({
      children: [new TextRun({
        text: text.trim(),
        size: 22,
        font: "Calibri",
        bold: isSectionHeader,
      })],
      indent: isBullet ? { left: 360 } : undefined,
      spacing: { after: 80 },
    });
  });
}

// ── Build the Annexure A attendance table ──
function buildAnnexureTable(employeeName: string, attendance: Array<{ log_date: string; tag: string }>): Table {
  // Sort attendance by date
  const sorted = [...attendance].sort((a, b) => a.log_date.localeCompare(b.log_date));

  // Build day headers
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Header row 1: Day names
  const headerRow1Cells = [
    new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text: "Name", bold: true, size: 18, font: "Calibri", color: "FFFFFF" })],
        alignment: AlignmentType.CENTER,
      })],
      shading: { type: ShadingType.SOLID, color: "2E5090", fill: "2E5090" },
      verticalAlign: VerticalAlign.CENTER,
      width: { size: 2400, type: WidthType.DXA },
    }),
    ...sorted.map(a => {
      const d = new Date(a.log_date + "T00:00:00");
      return new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text: dayNames[d.getDay()], size: 16, font: "Calibri" })],
          alignment: AlignmentType.CENTER,
        })],
        verticalAlign: VerticalAlign.CENTER,
        width: { size: 900, type: WidthType.DXA },
      });
    }),
  ];

  // Header row 2: Dates
  const headerRow2Cells = [
    new TableCell({
      children: [new Paragraph({ children: [] })],
      shading: { type: ShadingType.SOLID, color: "2E5090", fill: "2E5090" },
      verticalAlign: VerticalAlign.CENTER,
    }),
    ...sorted.map(a => {
      const d = new Date(a.log_date + "T00:00:00");
      const dateStr = `${d.getDate()}-${d.toLocaleString("en-US", { month: "short" })}`;
      return new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text: dateStr, size: 16, font: "Calibri", bold: true })],
          alignment: AlignmentType.CENTER,
        })],
        shading: { type: ShadingType.SOLID, color: "D6DCE4", fill: "D6DCE4" },
        verticalAlign: VerticalAlign.CENTER,
      });
    }),
  ];

  // Data row: Employee name + tags
  const dataRowCells = [
    new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text: employeeName, size: 16, font: "Calibri" })],
      })],
      verticalAlign: VerticalAlign.CENTER,
    }),
    ...sorted.map(a => {
      const tag = (a.tag || "—").toUpperCase();
      const colors = TAG_COLORS[tag] || DEFAULT_TAG_COLOR;
      return new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text: tag, size: 16, font: "Calibri", color: colors.text, bold: true })],
          alignment: AlignmentType.CENTER,
        })],
        shading: { type: ShadingType.SOLID, color: colors.bg, fill: colors.bg },
        verticalAlign: VerticalAlign.CENTER,
      });
    }),
  ];

  return new Table({
    rows: [
      new TableRow({ children: headerRow1Cells }),
      new TableRow({ children: headerRow2Cells }),
      new TableRow({ children: dataRowCells }),
    ],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

// ── Main: Generate NTE DOCX ──
export async function generateNTEDocx(input: NTEInput): Promise<Buffer> {
  const honorific = input.employee.gender === "Female" ? "Ms." : "Mr.";
  const flmName = input.flm_name || input.employee.supervisor_name || "[FLM Name]";
  const flmEmail = input.flm_email || input.employee.supervisor_email || "[flm@meta.com]";
  const hrName = input.hr_name || "Jocelyn Ramos";
  const capDisplay = CAP_DISPLAY[input.cap_level] || input.cap_level;
  const role = input.employee.actual_role || "Process Associate";

  // ── Page 1-2: NTE Letter ──
  const nteLetterChildren: Paragraph[] = [];

  // Title
  nteLetterChildren.push(new Paragraph({
    children: [new TextRun({ text: "Notice to Explain", bold: true, size: 32, font: "Calibri", underline: { type: UnderlineType.SINGLE } })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
  }));

  // Date
  nteLetterChildren.push(new Paragraph({
    children: [new TextRun({ text: input.date, bold: true, size: 22, font: "Calibri" })],
    spacing: { after: 400 },
  }));

  // Employee block
  nteLetterChildren.push(new Paragraph({
    children: [new TextRun({ text: input.employee.full_name, bold: true, size: 22, font: "Calibri" })],
  }));
  nteLetterChildren.push(new Paragraph({
    children: [new TextRun({ text: role, size: 22, font: "Calibri" })],
  }));
  nteLetterChildren.push(new Paragraph({
    children: [new TextRun({ text: "Genpact", size: 22, font: "Calibri" })],
    spacing: { after: 400 },
  }));

  // Salutation
  nteLetterChildren.push(new Paragraph({
    children: [new TextRun({ text: `Dear ${honorific} ${input.employee.last_name},`, size: 22, font: "Calibri" })],
    spacing: { after: 200 },
  }));

  // Incident narrative (AI-generated)
  nteLetterChildren.push(...narrativeToParagraphs(input.narrative));

  // Mandate paragraph
  nteLetterChildren.push(new Paragraph({
    children: [new TextRun({
      text: `IN VIEW THEREOF, you are hereby MANDATED to submit an Explanation in writing to Operations, ${flmName}, ${flmEmail} within (48) hours from receipt of this Notice, stating your position why you should not be administratively held liable in reference to your alleged violation/s of GENPACT's Corrective Action Policy and the Philippine Labor Code particularly:`,
      size: 22,
      font: "Calibri",
    })],
    spacing: { after: 300 },
  }));

  // Policy violated section header
  nteLetterChildren.push(...policyToParagraphs(input.policy_text));

  // Possible penalty
  nteLetterChildren.push(new Paragraph({
    children: [new TextRun({ text: `Possible Penalty: ${capDisplay}`, size: 22, font: "Calibri", underline: { type: UnderlineType.SINGLE } })],
    spacing: { before: 200, after: 200 },
  }));

  // Article 282
  nteLetterChildren.push(new Paragraph({
    children: [new TextRun({ text: "Article 282 of the Labor Code of the Philippines", size: 22, font: "Calibri" })],
    spacing: { after: 80 },
  }));
  nteLetterChildren.push(new Paragraph({
    children: [new TextRun({ text: "a. Serious Misconduct or willful disobedience by the employee of the lawful orders of his employer or representative in connection", size: 22, font: "Calibri" })],
    spacing: { after: 80 },
  }));
  nteLetterChildren.push(new Paragraph({
    children: [new TextRun({ text: "b. Gross and Habitual neglect by the employee of his duties", size: 22, font: "Calibri" })],
    spacing: { after: 300 },
  }));

  // Boilerplate paragraphs
  const boilerplates = [
    "Within the same period, you may submit such evidence (documentary information or written deposition of your witness/es) that may support your Explanation. Any witness/es you will identify will be required to confirm and verify the declarations stated in their disposition.",
    "Your failure to submit said explanation and documents within the prescribed period shall be deemed a waiver on your part to present the same. In such event, the matter will be decided based on the records and evidence available.",
    "If the company would be requiring further clarification based on your duly submitted written explanation, it hereby reserves the right to invite you to an administrative hearing, which will be confirmed and arranged by your aligned HR. The company, likewise, reserves the right to invite you on other dates as it may deem proper.",
    "You may retain the assistance and services of private counsel during the proceedings. Should you wish to be represented by a preferred counsel, please notify us at least two (2) days in advance so we can arrange attendance of our internal counsel.",
    "Should the grounds for above alleged violation/s be established, the appropriate disciplinary action will be imposed as prescribed under the applicable laws, Rules and Policies governing the alleged offense/s.",
    "Please note that Genpact adheres to a no-retaliation policy, violation of which will result in strict and prompt imposition of appropriate penalties.",
  ];

  boilerplates.forEach(text => {
    nteLetterChildren.push(new Paragraph({
      children: [new TextRun({ text, size: 22, font: "Calibri" })],
      spacing: { after: 200 },
    }));
  });

  // Sincerely
  nteLetterChildren.push(new Paragraph({
    children: [new TextRun({ text: "Sincerely,", size: 22, font: "Calibri" })],
    spacing: { before: 400, after: 600 },
  }));

  // Supervisor signature block
  nteLetterChildren.push(new Paragraph({
    children: [new TextRun({ text: "____________________________", size: 22, font: "Calibri" })],
  }));
  nteLetterChildren.push(new Paragraph({
    children: [new TextRun({ text: flmName, bold: true, size: 22, font: "Calibri" })],
  }));
  nteLetterChildren.push(new Paragraph({
    children: [new TextRun({ text: "Supervisor, Operations", size: 22, font: "Calibri" })],
    spacing: { after: 400 },
  }));

  // HR signature block
  nteLetterChildren.push(new Paragraph({
    children: [new TextRun({ text: "____________________________", size: 22, font: "Calibri" })],
  }));
  nteLetterChildren.push(new Paragraph({
    children: [new TextRun({ text: hrName, bold: true, size: 22, font: "Calibri" })],
  }));
  nteLetterChildren.push(new Paragraph({
    children: [new TextRun({ text: "Employee Relations Manager, HR", size: 22, font: "Calibri" })],
    spacing: { after: 600 },
  }));

  // Received by
  nteLetterChildren.push(new Paragraph({
    children: [new TextRun({ text: "Received by:", bold: true, size: 22, font: "Calibri" })],
    spacing: { after: 200 },
  }));
  nteLetterChildren.push(new Paragraph({
    children: [new TextRun({ text: input.employee.full_name, bold: true, size: 22, font: "Calibri" })],
  }));
  nteLetterChildren.push(new Paragraph({
    children: [new TextRun({ text: role, size: 22, font: "Calibri" })],
  }));
  nteLetterChildren.push(new Paragraph({
    children: [new TextRun({ text: "Date Received:", bold: true, size: 22, font: "Calibri" })],
    spacing: { after: 200 },
  }));

  // ── Page 3: Annexure A ──
  const annexureChildren: Paragraph[] = [];

  annexureChildren.push(new Paragraph({
    children: [new PageBreak()],
  }));
  annexureChildren.push(new Paragraph({
    children: [new TextRun({ text: "Annexure A:", bold: true, size: 24, font: "Calibri" })],
    spacing: { after: 300 },
  }));

  // Build the sections array
  const sections: any[] = [];

  // Section 1: NTE letter + Annexure A
  const section1Children: (Paragraph | Table)[] = [
    ...nteLetterChildren,
    ...annexureChildren,
  ];

  sections.push({
    properties: {
      page: {
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    children: section1Children,
  });

  // ── Conditionally add CWD acknowledgment page ──
  if (input.include_cwd_page) {
    const cwdChildren: Paragraph[] = [];

    cwdChildren.push(new Paragraph({
      children: [new TextRun({ text: "CRITICAL WORKDAY POLICY ACKNOWLEDGMENT AND CONSENT", bold: true, size: 24, font: "Calibri" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }));
    cwdChildren.push(new Paragraph({
      children: [new TextRun({ text: "Employee Sign-off Sheet", bold: true, size: 22, font: "Calibri" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }));

    cwdChildren.push(new Paragraph({
      children: [new TextRun({ text: "I, the undersigned employee, hereby acknowledge the following:", size: 22, font: "Calibri" })],
      spacing: { after: 200 },
    }));

    // Acknowledgment of Policy
    cwdChildren.push(new Paragraph({
      children: [new TextRun({ text: "Acknowledgment of Policy", bold: true, size: 22, font: "Calibri", underline: { type: UnderlineType.SINGLE } })],
      spacing: { after: 100 },
    }));

    const ackItems = [
      "I have been duly informed of, and have read and fully understood all pertinent information, details, instructions and implications concerning the company's Critical Workday (CWD) Policy, as detailed in the accompanying memorandum.",
      "I understand that CWDs are essential to meeting Client Service Level Agreements (SLAs) and maintaining operational success.",
      "I pledge my commitment to full compliance with all requirements, schedules, and policies set forth regarding Critical Workdays.",
    ];
    ackItems.forEach((item, i) => {
      cwdChildren.push(new Paragraph({
        children: [new TextRun({ text: `${i + 1}. ${item}`, size: 22, font: "Calibri" })],
        indent: { left: 360 },
        spacing: { after: 80 },
      }));
    });

    // Understanding of Disciplinary Consequences
    cwdChildren.push(new Paragraph({
      children: [new TextRun({ text: "Understanding of Disciplinary Consequences", bold: true, size: 22, font: "Calibri", underline: { type: UnderlineType.SINGLE } })],
      spacing: { before: 200, after: 100 },
    }));

    const discItems = [
      "I understand that any violation of the established CWD Policy, including but not limited to any instance of Absence, Unscheduled Leave, or Unapproved Leave during a declared Critical Workday, may result in disciplinary action.",
      "I acknowledge that disciplinary action can have consequences up to and including removal from the Program and termination of my employment, as determined and initiated by Genpact.",
      "I agree and understand that Management reserves the right of discretion to impose the necessary penalty than the standard disciplinary action (e.g., CAP 2), depending upon the existence of any aggravating or mitigating circumstance(s) specific to each case. These considerations may include performance-related issues that form part of my employee record, as well as whether I have previous offenses.",
    ];
    discItems.forEach((item, i) => {
      cwdChildren.push(new Paragraph({
        children: [new TextRun({ text: `${i + 1}. ${item}`, size: 22, font: "Calibri" })],
        indent: { left: 360 },
        spacing: { after: 80 },
      }));
    });

    // Policy Changes and Reporting Obligation
    cwdChildren.push(new Paragraph({
      children: [new TextRun({ text: "Policy Changes and Reporting Obligation", bold: true, size: 22, font: "Calibri", underline: { type: UnderlineType.SINGLE } })],
      spacing: { before: 200, after: 100 },
    }));

    const polItems = [
      "I further agree that Genpact management may amend or revise the CWD Policy, or the associated memorandum, at any time upon notice to all concerned employees. I likewise pledge compliance with any revised rules or policies that may be promulgated henceforth.",
      "I understand that if I have a concern about a possible violation of this Policy by myself or others, I will promptly report the concern to my line Manager, Human Resources representative, the Legal & Compliance Team, or the Ombudsman.",
    ];
    polItems.forEach((item, i) => {
      cwdChildren.push(new Paragraph({
        children: [new TextRun({ text: `${i + 1}. ${item}`, size: 22, font: "Calibri" })],
        indent: { left: 360 },
        spacing: { after: 80 },
      }));
    });

    // Signed by
    cwdChildren.push(new Paragraph({
      children: [new TextRun({ text: "Signed by:", size: 22, font: "Calibri" })],
      spacing: { before: 400, after: 400 },
    }));
    cwdChildren.push(new Paragraph({
      children: [new TextRun({ text: "Name of Employee | Date", size: 22, font: "Calibri" })],
      spacing: { after: 200 },
    }));

    sections.push({
      properties: {
        page: {
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children: cwdChildren,
    });
  }

  // ── Build the Annexure A table and insert before the page break ──
  // We need to add the table to section 1 children
  const annexureTable = buildAnnexureTable(input.employee.full_name, input.attendance);
  section1Children.push(annexureTable);

  // ── Create the document ──
  const doc = new Document({
    creator: "Playbook - NTE Build Assist",
    title: `NTE - ${input.employee.full_name}`,
    description: `Notice to Explain for ${input.employee.full_name}`,
    sections,
  });

  // ── Generate buffer ──
  const buffer = await Packer.toBuffer(doc);
  return buffer as Buffer;
}
