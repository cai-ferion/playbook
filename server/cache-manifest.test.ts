/**
 * Vitest tests for Cache Manifest — Phase 7.1 Automated Cache Busting
 */
import { describe, it, expect, beforeAll } from "vitest";
import path from "path";
import fs from "fs";
import { buildCacheManifest, injectCacheHashes, type CacheManifest } from "./cache-manifest";

const PUBLIC_DIR = path.join(__dirname, "public");

describe("Cache Manifest — Phase 7.1", () => {
  let manifest: CacheManifest;

  beforeAll(() => {
    manifest = buildCacheManifest(PUBLIC_DIR);
  });

  describe("buildCacheManifest()", () => {
    it("generates entries for all JS files in public/js", () => {
      const jsFiles = fs.readdirSync(path.join(PUBLIC_DIR, "js")).filter(f => f.endsWith(".js"));
      const manifestJsKeys = Object.keys(manifest.entries).filter(k => k.startsWith("js/"));
      expect(manifestJsKeys.length).toBe(jsFiles.length);
    });

    it("generates entries for all CSS files in public/css", () => {
      const cssFiles = fs.readdirSync(path.join(PUBLIC_DIR, "css")).filter(f => f.endsWith(".css"));
      const manifestCssKeys = Object.keys(manifest.entries).filter(k => k.startsWith("css/"));
      expect(manifestCssKeys.length).toBe(cssFiles.length);
    });

    it("hashes are 8-character hex strings", () => {
      for (const [_key, hash] of Object.entries(manifest.entries)) {
        expect(hash).toMatch(/^[0-9a-f]{8}$/);
      }
    });

    it("different files produce different hashes", () => {
      const hashes = Object.values(manifest.entries);
      const uniqueHashes = new Set(hashes);
      // Allow some collisions in theory, but with 54 files and 8 hex chars (4B possibilities), expect all unique
      expect(uniqueHashes.size).toBe(hashes.length);
    });

    it("includes generatedAt timestamp", () => {
      expect(manifest.generatedAt).toBeGreaterThan(0);
      expect(manifest.generatedAt).toBeLessThanOrEqual(Date.now());
    });

    it("produces deterministic hashes for unchanged files", () => {
      const manifest2 = buildCacheManifest(PUBLIC_DIR);
      expect(manifest2.entries).toEqual(manifest.entries);
    });
  });

  describe("injectCacheHashes()", () => {
    it("replaces href ?v=N with content hash", () => {
      const html = '<link rel="stylesheet" href="css/styles.css?v=143">';
      const result = injectCacheHashes(html, manifest);
      const expectedHash = manifest.entries["css/styles.css"];
      expect(result).toBe(`<link rel="stylesheet" href="css/styles.css?v=${expectedHash}">`);
    });

    it("replaces src ?v=N with content hash", () => {
      const html = '<script src="js/app.js?v=131"></script>';
      const result = injectCacheHashes(html, manifest);
      const expectedHash = manifest.entries["js/app.js"];
      expect(result).toBe(`<script src="js/app.js?v=${expectedHash}"></script>`);
    });

    it("handles ?v= with alphanumeric values (e.g., ?v=102g)", () => {
      const html = '<script src="js/performance.js?v=102g" defer></script>';
      const result = injectCacheHashes(html, manifest);
      const expectedHash = manifest.entries["js/performance.js"];
      expect(result).toBe(`<script src="js/performance.js?v=${expectedHash}" defer></script>`);
    });

    it("handles single-quoted attributes", () => {
      const html = "<link rel='stylesheet' href='css/haven.css?v=217'>";
      const result = injectCacheHashes(html, manifest);
      const expectedHash = manifest.entries["css/haven.css"];
      expect(result).toBe(`<link rel='stylesheet' href='css/haven.css?v=${expectedHash}'>`);
    });

    it("does not modify paths outside css/ and js/", () => {
      const html = '<img src="assets/logo.png?v=1">';
      const result = injectCacheHashes(html, manifest);
      expect(result).toBe(html); // unchanged
    });

    it("does not modify URLs without ?v=", () => {
      const html = '<script src="js/app.js"></script>';
      const result = injectCacheHashes(html, manifest);
      expect(result).toBe(html); // unchanged
    });

    it("handles multiple replacements in one HTML string", () => {
      const html = `<link href="css/styles.css?v=1"><script src="js/app.js?v=2"></script>`;
      const result = injectCacheHashes(html, manifest);
      expect(result).toContain(`css/styles.css?v=${manifest.entries["css/styles.css"]}`);
      expect(result).toContain(`js/app.js?v=${manifest.entries["js/app.js"]}`);
    });

    it("falls back to ?v=unknown for files not in manifest", () => {
      const emptyManifest: CacheManifest = { entries: {}, generatedAt: Date.now() };
      const html = '<script src="js/app.js?v=1"></script>';
      const result = injectCacheHashes(html, emptyManifest);
      expect(result).toBe('<script src="js/app.js?v=unknown"></script>');
    });
  });

  describe("Integration: index.html injection", () => {
    it("all ?v= references in served HTML are valid 8-char hashes or 'unknown'", () => {
      const htmlPath = path.join(PUBLIC_DIR, "index.html");
      let html = fs.readFileSync(htmlPath, "utf-8");
      html = injectCacheHashes(html, manifest);

      const versionMatches = html.matchAll(/\?v=([^"']+)/g);
      for (const match of versionMatches) {
        const hash = match[1];
        expect(hash).toMatch(/^[0-9a-f]{8}$|^unknown$/);
      }
    });

    it("no old manual version numbers remain after injection", () => {
      const htmlPath = path.join(PUBLIC_DIR, "index.html");
      let html = fs.readFileSync(htmlPath, "utf-8");
      html = injectCacheHashes(html, manifest);

      // Old versions were like ?v=143, ?v=121d, ?v=102g — not 8-char hex
      const oldVersionPattern = /\?v=\d{1,3}[a-z]?"/g;
      const oldMatches = html.match(oldVersionPattern);
      expect(oldMatches).toBeNull();
    });
  });

  describe("Module Loader integration", () => {
    it("module-loader.js fetches from /api/site/cache-manifest.json", () => {
      const loaderPath = path.join(PUBLIC_DIR, "js/module-loader.js");
      const content = fs.readFileSync(loaderPath, "utf-8");
      expect(content).toContain("/api/site/cache-manifest.json");
    });

    it("module-loader.js exposes hashes on window._cacheHashes", () => {
      const loaderPath = path.join(PUBLIC_DIR, "js/module-loader.js");
      const content = fs.readFileSync(loaderPath, "utf-8");
      expect(content).toContain("window._cacheHashes = manifest");
    });

    it("module-loader.js uses hash from manifest for script src with Date.now() fallback", () => {
      const loaderPath = path.join(PUBLIC_DIR, "js/module-loader.js");
      const content = fs.readFileSync(loaderPath, "utf-8");
      expect(content).toContain("_cacheHashes && _cacheHashes[src]");
      // Date.now() remains as fallback when manifest hasn't loaded yet
      expect(content).toContain("Date.now()");
    });

    it("compass.js uses window._cacheHashes for lazy-loaded violations", () => {
      const compassPath = path.join(PUBLIC_DIR, "js/compass.js");
      const content = fs.readFileSync(compassPath, "utf-8");
      expect(content).toContain("window._cacheHashes && window._cacheHashes['js/compass-violations.js']");
      expect(content).not.toContain("?v=102g");
    });

    it("corrective-actions.js uses window._cacheHashes for lazy-loaded violations", () => {
      const caPath = path.join(PUBLIC_DIR, "js/corrective-actions.js");
      const content = fs.readFileSync(caPath, "utf-8");
      expect(content).toContain("window._cacheHashes && window._cacheHashes['js/compass-violations.js']");
      expect(content).not.toContain("?v=102g");
    });
  });

  describe("Static serving headers", () => {
    it("static middleware uses 7-day maxAge with immutable", () => {
      const indexTs = fs.readFileSync(path.join(__dirname, "_core/index.ts"), "utf-8");
      expect(indexTs).toContain("maxAge: '7d'");
      expect(indexTs).toContain("immutable: true");
    });

    it("index.html is served with no-cache", () => {
      const indexTs = fs.readFileSync(path.join(__dirname, "_core/index.ts"), "utf-8");
      expect(indexTs).toContain("no-cache, no-store, must-revalidate");
    });
  });
});
