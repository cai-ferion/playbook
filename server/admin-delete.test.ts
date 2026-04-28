/**
 * Admin Delete Tests — Compass Coaching Logs & Sandbox Insights
 * Validates: server-side admin gating, client-side delete UI, cascade cleanup
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
const ioRoutes = readFileSync(join(ROOT, "server/io-routes.ts"), "utf-8");
const compassJs = readFileSync(join(ROOT, "server/public/js/compass.js"), "utf-8");
const sandboxJs = readFileSync(join(ROOT, "server/public/js/sandbox.js"), "utf-8");
const indexHtml = readFileSync(join(ROOT, "server/public/index.html"), "utf-8");

// ============================================================
// Server-Side: Compass Coaching DELETE
// ============================================================
describe("Server — Compass Coaching DELETE Endpoint", () => {
  it("has a DELETE /coaching/:id route", () => {
    expect(ioRoutes).toContain('router.delete("/coaching/:id"');
  });

  it("gates access to ADMIN_OHRS (centralized config)", () => {
    // Find the coaching DELETE handler section — now uses ADMIN_OHRS from config
    const idx = ioRoutes.indexOf('router.delete("/coaching/:id"');
    const section = ioRoutes.slice(idx, idx + 800);
    expect(section).toContain("ADMIN_OHRS");
    expect(section).toContain("Only admin users can delete coaching logs");
  });

  it("returns 403 for non-admin users", () => {
    const idx = ioRoutes.indexOf('router.delete("/coaching/:id"');
    const section = ioRoutes.slice(idx, idx + 800);
    expect(section).toContain("res.status(403)");
  });

  it("cascade-deletes RCA records", () => {
    const idx = ioRoutes.indexOf('router.delete("/coaching/:id"');
    const section = ioRoutes.slice(idx, idx + 1500);
    expect(section).toContain("ioCoachingRca");
  });

  it("cascade-deletes ZTP records", () => {
    const idx = ioRoutes.indexOf('router.delete("/coaching/:id"');
    const section = ioRoutes.slice(idx, idx + 1500);
    expect(section).toContain("ioCoachingZtp");
  });

  it("logs the deletion with actor OHR", () => {
    const idx = ioRoutes.indexOf('router.delete("/coaching/:id"');
    const section = ioRoutes.slice(idx, idx + 1500);
    expect(section).toContain("deleted by");
  });

  it("supports both numeric id and alphanumeric coaching_id", () => {
    const idx = ioRoutes.indexOf('router.delete("/coaching/:id"');
    const section = ioRoutes.slice(idx, idx + 800);
    expect(section).toContain("isNumericId");
  });
});

// ============================================================
// Server-Side: Sandbox Insights DELETE (admin-gated)
// ============================================================
describe("Server — Sandbox Insights DELETE Endpoint (admin-gated)", () => {
  it("has a DELETE /insights/:insight_id route", () => {
    expect(ioRoutes).toContain('router.delete("/insights/:insight_id"');
  });

  it("gates single-delete to ADMIN_OHRS (centralized config)", () => {
    const idx = ioRoutes.indexOf('router.delete("/insights/:insight_id"');
    const section = ioRoutes.slice(idx, idx + 500);
    expect(section).toContain("ADMIN_OHRS");
    expect(section).toContain("Admin-only operation");
  });

  it("gates bulk-delete to ADMIN_OHRS (centralized config)", () => {
    const idx = ioRoutes.indexOf('router.post("/insights-bulk-delete"');
    const section = ioRoutes.slice(idx, idx + 500);
    expect(section).toContain("ADMIN_OHRS");
    expect(section).toContain("Only admin users can delete insights");
  });

  it("returns 403 for non-admin on single delete", () => {
    const idx = ioRoutes.indexOf('router.delete("/insights/:insight_id"');
    const section = ioRoutes.slice(idx, idx + 500);
    expect(section).toContain("res.status(403)");
  });

  it("returns 403 for non-admin on bulk delete", () => {
    const idx = ioRoutes.indexOf('router.post("/insights-bulk-delete"');
    const section = ioRoutes.slice(idx, idx + 500);
    expect(section).toContain("res.status(403)");
  });
});

// ============================================================
// Client-Side: Compass Delete UI
// ============================================================
describe("Client — Compass Delete UI", () => {
  it("has compassDeleteLog function", () => {
    expect(compassJs).toContain("async function compassDeleteLog(coachingId)");
  });

  it("gates compassDeleteLog to admin OHRs (window.ADMIN_OHRS)", () => {
    const idx = compassJs.indexOf("async function compassDeleteLog(coachingId)");
    const section = compassJs.slice(idx, idx + 600);
    expect(section).toContain("ADMIN_OHRS");
  });

  it("shows styled confirmation modal before deletion", () => {
    const idx = compassJs.indexOf("async function compassDeleteLog(coachingId)");
    const section = compassJs.slice(idx, idx + 600);
    expect(section).toContain("showConfirmModal(");
  });

  it("sends DELETE request with actor_ohr in body", () => {
    const idx = compassJs.indexOf("async function compassDeleteLog(coachingId)");
    const section = compassJs.slice(idx, idx + 1200);
    expect(section).toContain("method: 'DELETE'");
    expect(section).toContain("actor_ohr");
  });

  it("removes deleted log from local cache", () => {
    const idx = compassJs.indexOf("async function compassDeleteLog(coachingId)");
    const section = compassJs.slice(idx, idx + 1800);
    expect(section).toContain("COMPASS.logs");
    expect(section).toContain(".filter");
  });

  it("shows Delete Log button in overlay detail footer for admin", () => {
    // The overlay detail footer section
    expect(compassJs).toContain("compassDeleteLog(");
    expect(compassJs).toContain("Delete Log</button>");
  });

  it("shows Delete Log button in inline detail footer for admin", () => {
    // The inline detail builder section should also have the delete button
    // It's in the footer section of the inline detail builder
    const allMatches = compassJs.match(/compassDeleteLog\(/g) || [];
    expect(allMatches.length).toBeGreaterThanOrEqual(2); // overlay + inline
    const allDeleteBtns = compassJs.match(/Delete Log<\/button>/g) || [];
    expect(allDeleteBtns.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================
// Client-Side: Sandbox Delete UI
// ============================================================
describe("Client — Sandbox Delete UI", () => {
  it("has sandboxDeleteInsight function", () => {
    expect(sandboxJs).toContain("async function sandboxDeleteInsight(insightId)");
  });

  it("gates sandboxDeleteInsight to admin OHRs (window.ADMIN_OHRS)", () => {
    const idx = sandboxJs.indexOf("async function sandboxDeleteInsight(insightId)");
    const section = sandboxJs.slice(idx, idx + 600);
    expect(section).toContain("ADMIN_OHRS");
  });

  it("shows styled confirmation modal before deletion", () => {
    const idx = sandboxJs.indexOf("async function sandboxDeleteInsight(insightId)");
    const section = sandboxJs.slice(idx, idx + 600);
    expect(section).toContain("showConfirmModal(");
  });

  it("sends DELETE request with actor_ohr in body", () => {
    const idx = sandboxJs.indexOf("async function sandboxDeleteInsight(insightId)");
    const section = sandboxJs.slice(idx, idx + 1200);
    expect(section).toContain("method: 'DELETE'");
    expect(section).toContain("actor_ohr");
  });

  it("removes deleted insight from local cache", () => {
    const idx = sandboxJs.indexOf("async function sandboxDeleteInsight(insightId)");
    const section = sandboxJs.slice(idx, idx + 1800);
    expect(section).toContain("SANDBOX_MOD.insights");
    expect(section).toContain("SANDBOX_MOD.filtered");
    expect(section).toContain(".filter");
  });

  it("re-renders table, stats, and kanban after deletion", () => {
    const idx = sandboxJs.indexOf("async function sandboxDeleteInsight(insightId)");
    const section = sandboxJs.slice(idx, idx + 1800);
    expect(section).toContain("sandboxRenderTable");
    expect(section).toContain("sandboxRenderStats");
    expect(section).toContain("sandboxRenderKanban");
  });

  it("shows Delete button in Review Area panel actions for admin", () => {
    expect(sandboxJs).toContain("sandboxDeleteInsight(");
    expect(sandboxJs).toContain(">Delete</button>");
  });

  it("shows Delete Insight button in Input Portal detail panel for admin", () => {
    expect(sandboxJs).toContain(">Delete Insight</button>");
  });

  it("isAdmin check uses centralized window.ADMIN_OHRS", () => {
    // All isAdmin declarations should reference window.ADMIN_OHRS
    const matches = sandboxJs.match(/window\.ADMIN_OHRS/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(4);
  });
});

// ============================================================
// Cache Versions
// ============================================================
describe("Cache Versions — Admin Delete", () => {
  it("compass.js bumped to v122", () => {
    expect(indexHtml).toContain("compass.js?v=124");
  });

  it("sandbox.js bumped to v116", () => {
    expect(indexHtml).toContain("sandbox.js?v=123");
  });
});
