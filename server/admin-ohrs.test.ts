/**
 * Admin OHR Management — Unit Tests
 * Tests: DB table schema, CRUD endpoints, config.ts DB-backed cache, frontend UI
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const schemaPath = path.join(__dirname, "../drizzle/schema.ts");
const configPath = path.join(__dirname, "config.ts");
const permissionsPath = path.join(__dirname, "io/permissions.ts");
const adminJsPath = path.join(__dirname, "public/js/admin.js");
const indexHtmlPath = path.join(__dirname, "public/index.html");

const schema = fs.readFileSync(schemaPath, "utf-8");
const config = fs.readFileSync(configPath, "utf-8");
const permissions = fs.readFileSync(permissionsPath, "utf-8");
const adminJs = fs.readFileSync(adminJsPath, "utf-8");
const indexHtml = fs.readFileSync(indexHtmlPath, "utf-8");

describe("Admin OHR Management — Schema", () => {
  it("defines io_admin_ohrs table with required columns", () => {
    expect(schema).toContain("ioAdminOhrs");
    expect(schema).toContain("io_admin_ohrs");
    expect(schema).toContain("ohr_id");
    expect(schema).toContain("full_name");
    expect(schema).toContain("added_by");
    expect(schema).toContain("added_by_ohr");
    expect(schema).toContain("added_at");
  });

  it("exports type IoAdminOhr", () => {
    expect(schema).toContain("export type IoAdminOhr");
    expect(schema).toContain("export type InsertIoAdminOhr");
  });
});

describe("Admin OHR Management — Config (DB-backed cache)", () => {
  it("imports getDb and ioAdminOhrs", () => {
    expect(config).toContain('import { getDb } from "./db.js"');
    expect(config).toContain('import { ioAdminOhrs } from "../drizzle/schema.js"');
  });

  it("exports ADMIN_OHRS as let (mutable for cache refresh)", () => {
    expect(config).toContain("export let ADMIN_OHRS");
  });

  it("exports refreshAdminOhrs async function", () => {
    expect(config).toContain("export async function refreshAdminOhrs");
  });

  it("ensures OWNER_OHR is always included in cache", () => {
    expect(config).toContain('if (!ohrList.includes(OWNER_OHR)) ohrList.unshift(OWNER_OHR)');
  });

  it("exports isAdminOhr that checks the cached list", () => {
    expect(config).toContain("export function isAdminOhr");
    expect(config).toContain("ADMIN_OHRS.includes(ohr)");
  });

  it("defines OWNER_OHR as 740045023", () => {
    expect(config).toContain('export const OWNER_OHR = "740045023"');
  });
});

describe("Admin OHR Management — CRUD Endpoints (permissions.ts)", () => {
  it("imports ioAdminOhrs from schema", () => {
    expect(permissions).toContain("ioAdminOhrs");
  });

  it("imports refreshAdminOhrs from config", () => {
    expect(permissions).toContain("refreshAdminOhrs");
  });

  it("has GET /admin-ohrs endpoint", () => {
    expect(permissions).toContain('router.get("/admin-ohrs"');
  });

  it("has POST /admin-ohrs endpoint with admin gate", () => {
    expect(permissions).toContain('router.post("/admin-ohrs"');
    expect(permissions).toContain("Only admins can manage the admin list");
  });

  it("has DELETE /admin-ohrs/:ohr_id endpoint", () => {
    expect(permissions).toContain('router.delete("/admin-ohrs/:ohr_id"');
  });

  it("prevents removing OWNER_OHR", () => {
    expect(permissions).toContain("Cannot remove the system owner from admin list");
  });

  it("calls refreshAdminOhrs after add", () => {
    const postSection = permissions.slice(
      permissions.indexOf('router.post("/admin-ohrs"'),
      permissions.indexOf('router.delete("/admin-ohrs')
    );
    expect(postSection).toContain("await refreshAdminOhrs()");
  });

  it("calls refreshAdminOhrs after delete", () => {
    const deleteSection = permissions.slice(
      permissions.indexOf('router.delete("/admin-ohrs')
    );
    expect(deleteSection).toContain("await refreshAdminOhrs()");
  });

  it("checks for duplicate before adding", () => {
    expect(permissions).toContain("OHR is already an admin");
  });

  it("emits SSE change events", () => {
    expect(permissions).toContain('emitChange(req, "admin-ohrs"');
  });
});

describe("Admin OHR Management — Frontend UI (admin.js)", () => {
  it("has adminOhrLoadList function", () => {
    expect(adminJs).toContain("async function adminOhrLoadList");
  });

  it("has adminOhrRenderList function", () => {
    expect(adminJs).toContain("function adminOhrRenderList");
  });

  it("has adminOhrAdd function", () => {
    expect(adminJs).toContain("async function adminOhrAdd");
  });

  it("has adminOhrRemove function", () => {
    expect(adminJs).toContain("async function adminOhrRemove");
  });

  it("shows OWNER badge for protected admin", () => {
    expect(adminJs).toContain("OWNER");
    expect(adminJs).toContain("Protected");
  });

  it("updates window.ADMIN_OHRS after mutations", () => {
    expect(adminJs).toContain("window.ADMIN_OHRS = result.admin_ohrs");
  });

  it("fetches from /api/io/admin-ohrs", () => {
    expect(adminJs).toContain("fetch('/api/io/admin-ohrs'");
  });
});

describe("Admin OHR Management — HTML Structure", () => {
  it("has admin-tab-admins button", () => {
    expect(indexHtml).toContain('id="admin-tab-admins"');
  });

  it("has admin-panel-admins container", () => {
    expect(indexHtml).toContain('id="admin-panel-admins"');
  });

  it("has admin-ohr-list-container", () => {
    expect(indexHtml).toContain('id="admin-ohr-list-container"');
  });

  it("has admin-ohr-add-form", () => {
    expect(indexHtml).toContain('id="admin-ohr-add-form"');
  });

  it("has add admin button", () => {
    expect(indexHtml).toContain("adminOhrShowAddForm()");
  });
});

describe("Admin OHR Management — Tab Switching", () => {
  it("adminSwitchTab handles 'admins' tab", () => {
    expect(adminJs).toContain("} else if (tab === 'admins')");
    expect(adminJs).toContain("adminOhrLoadList()");
  });

  it("references admin-panel-admins in tab logic", () => {
    expect(adminJs).toContain("admin-panel-admins");
  });
});

describe("Admin OHR Management — Server Startup", () => {
  const indexTs = fs.readFileSync(path.join(__dirname, "_core/index.ts"), "utf-8");

  it("imports refreshAdminOhrs", () => {
    expect(indexTs).toContain('import { refreshAdminOhrs } from "../config.js"');
  });

  it("calls refreshAdminOhrs on startup", () => {
    expect(indexTs).toContain("refreshAdminOhrs()");
  });
});
