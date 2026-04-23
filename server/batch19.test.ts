/**
 * batch19.test.ts — Corrective Actions: NTE Type removal, logo fix, Manual CA Log
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// ─── Read source files ───────────────────────────────────────
const caJs = fs.readFileSync(
  path.resolve(__dirname, "public/js/corrective-actions.js"),
  "utf-8"
);
const caCSS = fs.readFileSync(
  path.resolve(__dirname, "public/css/corrective-actions.css"),
  "utf-8"
);
const indexHtml = fs.readFileSync(
  path.resolve(__dirname, "public/index.html"),
  "utf-8"
);
const nteDocxGen = fs.readFileSync(
  path.resolve(__dirname, "nte-docx-generator.ts"),
  "utf-8"
);

// ═══════════════════════════════════════════════════════════════
//  1. NTE Type Removal
// ═══════════════════════════════════════════════════════════════
describe("NTE Type Removal from UI", () => {
  it("table header does NOT contain NTE Type column", () => {
    // The <th>NTE Type</th> should have been removed
    expect(caJs).not.toMatch(/<th>NTE Type<\/th>/);
  });

  it("table row does NOT render nte_type cell", () => {
    // The old pattern: <td>${escapeHtml(r.nte_type || '—')}</td>
    expect(caJs).not.toMatch(/escapeHtml\(r\.nte_type/);
  });

  it("detail panel NTE section does NOT have NTE Type field", () => {
    // The old pattern: cdp-field-label">NTE Type
    expect(caJs).not.toMatch(/cdp-field-label">NTE Type/);
  });

  it("header subtitle does NOT show nte_type", () => {
    // The old pattern: ${escapeHtml(record.nte_type || 'NTE')} &middot;
    expect(caJs).not.toMatch(/escapeHtml\(record\.nte_type/);
  });

  it("history items show static 'NTE' instead of nte_type", () => {
    // Should have: ca-history-title">NTE ${h.cap_level
    expect(caJs).toMatch(/ca-history-title">NTE \$\{h\.cap_level/);
  });

  it("table detail row uses colspan=6 (not 7)", () => {
    expect(caJs).toMatch(/colspan="6"/);
    expect(caJs).not.toMatch(/colspan="7"/);
  });
});

// ═══════════════════════════════════════════════════════════════
//  2. NTE DOCX Logo Fix
// ═══════════════════════════════════════════════════════════════
describe("NTE DOCX Logo Path Resolution", () => {
  it("uses multiple candidate paths for logo resolution", () => {
    expect(nteDocxGen).toContain("candidates");
    expect(nteDocxGen).toContain("genpact-logo.png");
  });

  it("includes fallback to process.cwd()/server/ path", () => {
    expect(nteDocxGen).toMatch(/process\.cwd\(\)/);
    expect(nteDocxGen).toMatch(/server.*genpact-logo\.png/);
  });

  it("tries __dirname/../server/ for production dist/ context", () => {
    expect(nteDocxGen).toMatch(/__dirname.*\.\..*server.*genpact-logo/);
  });

  it("genpact-logo.png file exists in server directory", () => {
    const logoPath = path.resolve(__dirname, "genpact-logo.png");
    expect(fs.existsSync(logoPath)).toBe(true);
    const stat = fs.statSync(logoPath);
    expect(stat.size).toBeGreaterThan(1000); // Not an empty file
  });
});

// ═══════════════════════════════════════════════════════════════
//  3. Manual CA Log Feature
// ═══════════════════════════════════════════════════════════════
describe("Manual CA Log Feature", () => {
  it("has caOpenManualLog function defined", () => {
    expect(caJs).toContain("function caOpenManualLog()");
  });

  it("has caSubmitManualLog function defined", () => {
    expect(caJs).toContain("async function caSubmitManualLog()");
  });

  it("has caCloseManualLog function defined", () => {
    expect(caJs).toContain("function caCloseManualLog()");
  });

  it("has _caManualLogRender function defined", () => {
    expect(caJs).toContain("function _caManualLogRender()");
  });

  it("has CA_MANUAL_LOG state object", () => {
    expect(caJs).toContain("var CA_MANUAL_LOG");
    expect(caJs).toMatch(/CA_MANUAL_LOG\s*=\s*\{/);
  });

  it("Manual CA Log state has required fields", () => {
    expect(caJs).toContain("employee:");
    expect(caJs).toContain("caType:");
    expect(caJs).toContain("dateOfIncident:");
    expect(caJs).toContain("servedDate:");
    expect(caJs).toContain("description:");
    expect(caJs).toContain("capStartDate:");
    expect(caJs).toContain("capExpiryDate:");
  });

  it("filter bar renders Manual CA Log button for authorized users", () => {
    expect(caJs).toContain('ca-btn-manual-log');
    expect(caJs).toContain('caOpenManualLog()');
    expect(caJs).toContain("Manual CA Log");
  });

  it("Manual CA Log button only shows when canCreate is true", () => {
    // The button is inside the ${canCreate ? ... : ''} block
    const canCreateBlock = caJs.match(/canCreate\s*\?\s*`[\s\S]*?Manual CA Log[\s\S]*?`\s*:\s*''/);
    expect(canCreateBlock).not.toBeNull();
  });

  it("supports NTE, CAP 1, CAP 2, CAP 3 types", () => {
    // In the _caManualLogRender function
    expect(caJs).toMatch(/id:\s*'NTE'/);
    expect(caJs).toMatch(/id:\s*'CAP 1'/);
    expect(caJs).toMatch(/id:\s*'CAP 2'/);
    expect(caJs).toMatch(/id:\s*'CAP 3'/);
  });

  it("validates required fields before submission", () => {
    expect(caJs).toContain("!CA_MANUAL_LOG.employee");
    expect(caJs).toContain("!CA_MANUAL_LOG.caType");
    expect(caJs).toContain("!CA_MANUAL_LOG.dateOfIncident");
    expect(caJs).toContain("!CA_MANUAL_LOG.description.trim()");
  });

  it("posts to corrective-actions endpoint", () => {
    expect(caJs).toContain("IO_API_BASE + '/corrective-actions'");
    expect(caJs).toContain("method: 'POST'");
  });

  it("patches CAP details for non-NTE types", () => {
    expect(caJs).toContain("CA_MANUAL_LOG.caType !== 'NTE' && created.id");
    expect(caJs).toContain("method: 'PATCH'");
    expect(caJs).toContain("cap_level:");
    expect(caJs).toContain("cap_start_date:");
    expect(caJs).toContain("cap_expiry_date:");
  });

  it("sets nte_type to 'Manual Log' for tracking", () => {
    expect(caJs).toContain("nte_type: 'Manual Log'");
  });

  it("auto-calculates CAP expiry from active days", () => {
    expect(caJs).toContain("function _caManualLogAutoExpiry()");
    expect(caJs).toContain("CA_CAP_ACTIVE_DAYS[CA_MANUAL_LOG.caType]");
  });

  it("has employee search with debounce", () => {
    expect(caJs).toContain("function _caManualLogEmpSearch(query)");
    expect(caJs).toContain("_caManualLogEmpTimer");
    expect(caJs).toContain("setTimeout");
  });

  it("has employee selection function", () => {
    expect(caJs).toContain("function caManualLogSelectEmp(ohrId)");
  });
});

// ═══════════════════════════════════════════════════════════════
//  4. CSS Styles
// ═══════════════════════════════════════════════════════════════
describe("Manual CA Log CSS", () => {
  it("has .ca-btn-manual-log style defined", () => {
    expect(caCSS).toContain(".ca-btn-manual-log");
  });

  it("uses green gradient for the button", () => {
    expect(caCSS).toMatch(/ca-btn-manual-log[\s\S]*?background:\s*linear-gradient.*?#059669/);
  });

  it("has hover state for the button", () => {
    expect(caCSS).toContain(".ca-btn-manual-log:hover");
  });
});

// ═══════════════════════════════════════════════════════════════
//  5. Cache Versions
// ═══════════════════════════════════════════════════════════════
describe("Cache Version Bumps", () => {
  it("corrective-actions.css version is bumped to v7", () => {
    expect(indexHtml).toContain("corrective-actions.css?v=7");
  });

  it("corrective-actions.js version is bumped to v13", () => {
    expect(indexHtml).toContain("corrective-actions.js?v=13");
  });
});
