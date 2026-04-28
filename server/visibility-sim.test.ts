/**
 * Visibility Simulation Tests
 * Verifies: Helm hidden for agents, Horizon restricted to TL/Manager/Admin,
 * Manager's Nook restricted to Manager/Admin.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const readFile = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf-8");

const ioRoutes = readFile("server/io-routes.ts");
const appJs = readFile("server/public/js/app.js");
const indexHtml = readFile("server/public/index.html");

// ── 1. Permission Defaults (server-side) ──
describe("Visibility — Permission Defaults", () => {
  it("Agent default does NOT include nav.helm", () => {
    // The Agent early return line should not set nav.helm
    const agentLine = ioRoutes.match(/if \(role === 'Agent'\) \{[^}]+\}/);
    expect(agentLine).toBeTruthy();
    expect(agentLine![0]).not.toContain("nav.helm");
  });

  it("Agent default does NOT include nav.horizon", () => {
    const agentLine = ioRoutes.match(/if \(role === 'Agent'\) \{[^}]+\}/);
    expect(agentLine).toBeTruthy();
    expect(agentLine![0]).not.toContain("nav.horizon");
  });

  it("Horizon is granted to Team Lead and Manager roles", () => {
    expect(ioRoutes).toContain("// Horizon: TL, Manager, Admin only");
    expect(ioRoutes).toContain("if (role === 'Team Lead' || role === 'Manager')");
    expect(ioRoutes).toContain("b['nav.horizon'] = true");
  });

  it("Non-agent roles get nav.helm by default", () => {
    // After the Agent early return, nav.helm is set for all other roles
    expect(ioRoutes).toContain("b['nav.helm'] = true");
  });

  it("SME/QA/Trainer do NOT get nav.horizon", () => {
    // Horizon is only set inside the TL/Manager block, not in the general non-agent section
    const horizonBlock = ioRoutes.match(/\/\/ Horizon: TL, Manager, Admin only[\s\S]*?b\['nav\.horizon'\] = true;[\s\S]*?\}/);
    expect(horizonBlock).toBeTruthy();
    // Should only be inside a TL/Manager conditional
    expect(horizonBlock![0]).toContain("Team Lead");
    expect(horizonBlock![0]).toContain("Manager");
  });
});

// ── 2. Manager's Nook (client-side) ──
describe("Visibility — Manager's Nook (client-side)", () => {
  it("Manager's Nook nav visibility is role-gated to Manager + Admin", () => {
    expect(appJs).toContain("nav-managers-nook");
    expect(appJs).toContain("user.actual_role === 'Manager'");
    expect(appJs).toContain("isManagerOrAdmin");
  });

  it("Manager's Nook nav item exists in index.html", () => {
    expect(indexHtml).toContain("nav-managers-nook");
  });
});

// ── 3. Helm Agent Simplification Removed ──
describe("Visibility — Helm hidden for agents", () => {
  it("Helm nav group uses permission-based visibility", () => {
    expect(appJs).toContain("vis('nav-group-helm', 'nav.helm')");
  });
});

// ── 4. Cache Versions ──
describe("Visibility — Cache Versions", () => {
  it("app.js cache version is bumped to v=126", () => {
    expect(indexHtml).toContain("app.js?v=126");
  });
});
