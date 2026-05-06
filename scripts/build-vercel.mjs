/**
 * Vercel Build Script
 *
 * Produces the following output structure:
 *   public/
 *     index.html          ← React SPA entry (Vite build)
 *     assets/             ← Vite-built JS/CSS chunks
 *     api/
 *       site/
 *         index.html      ← Static site with injected cache hashes
 *         js/             ← Static site JS modules
 *         css/            ← Static site CSS
 *         images/         ← Static site images
 *         assets/         ← Static site assets
 *         cache-manifest.json ← Pre-computed file hashes
 *
 * Vercel serves public/ as static CDN assets.
 * The index.ts file is bundled by Vercel as a serverless function.
 *
 * IMPORTANT: express.static() is ignored on Vercel.
 * Static site files go in public/api/site/ so Vercel CDN serves them
 * at the /api/site/* URL path (preserving existing bookmarks).
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = process.cwd();
const PUBLIC_OUT = path.join(ROOT, "public");
const STATIC_SITE_SRC = path.join(ROOT, "server", "public");
const STATIC_SITE_DEST = path.join(PUBLIC_OUT, "api", "site");
const VITE_OUT_DIR = path.join(ROOT, "dist", "public");

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: ROOT });
}

function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function hashFile(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("md5").update(content).digest("hex").slice(0, 8);
}

/**
 * Build cache manifest for the static site (mirrors server/cache-manifest.ts)
 */
function buildCacheManifest(publicDir) {
  const entries = {};
  const dirs = ["js", "css"];
  for (const dir of dirs) {
    const dirPath = path.join(publicDir, dir);
    if (!fs.existsSync(dirPath)) continue;
    const files = fs.readdirSync(dirPath).filter(
      (f) => f.endsWith(".js") || f.endsWith(".css")
    );
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) continue;
      entries[`${dir}/${file}`] = hashFile(filePath);
    }
  }
  return { entries, generatedAt: Date.now() };
}

/**
 * Inject content hashes into HTML (replaces ?v=N with ?v=<hash>)
 */
function injectCacheHashes(html, manifest) {
  return html.replace(
    /((?:href|src)=["'])((?:css|js)\/[^"'?]+)\?v=[^"']*?(["'])/g,
    (_match, prefix, filePath, suffix) => {
      const hash = manifest.entries[filePath];
      return hash
        ? `${prefix}${filePath}?v=${hash}${suffix}`
        : `${prefix}${filePath}?v=unknown${suffix}`;
    }
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Clean previous build artifacts
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n=== Cleaning previous build output ===\n");

// Remove Vite dist output
if (fs.existsSync(VITE_OUT_DIR)) {
  fs.rmSync(VITE_OUT_DIR, { recursive: true });
}

// Remove previous public/ build artifacts (but not client/public/ source)
if (fs.existsSync(PUBLIC_OUT)) {
  // Remove static site copy
  const apiDir = path.join(PUBLIC_OUT, "api");
  if (fs.existsSync(apiDir)) fs.rmSync(apiDir, { recursive: true });
  // Remove Vite output
  const assetsDir = path.join(PUBLIC_OUT, "assets");
  if (fs.existsSync(assetsDir)) fs.rmSync(assetsDir, { recursive: true });
  const indexHtml = path.join(PUBLIC_OUT, "index.html");
  if (fs.existsSync(indexHtml)) fs.unlinkSync(indexHtml);
}

// ══════════════════════════════════════════════════════════════════════════════
// Step 1: Build React SPA with Vite → dist/public/ → public/
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n=== Step 1: Building React SPA (Vite) ===\n");
run("npx vite build");

// Vite outputs to dist/public/ (per vite.config.ts outDir). Copy to public/.
if (fs.existsSync(VITE_OUT_DIR)) {
  fs.mkdirSync(PUBLIC_OUT, { recursive: true });
  for (const entry of fs.readdirSync(VITE_OUT_DIR, { withFileTypes: true })) {
    const src = path.join(VITE_OUT_DIR, entry.name);
    const dest = path.join(PUBLIC_OUT, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(src, dest);
    } else {
      fs.copyFileSync(src, dest);
    }
  }
  console.log("  ✓ Moved Vite output from dist/public/ → public/");
} else {
  console.error("  ✗ ERROR: Vite build output not found at dist/public/");
  process.exit(1);
}

// ══════════════════════════════════════════════════════════════════════════════
// Step 2: Copy static site → public/api/site/
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n=== Step 2: Copying static site to public/api/site/ ===\n");
copyDirSync(STATIC_SITE_SRC, STATIC_SITE_DEST);
console.log(`  ✓ Copied server/public/ → public/api/site/`);

// ══════════════════════════════════════════════════════════════════════════════
// Step 3: Generate cache manifest and inject hashes into index.html
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n=== Step 3: Generating cache manifest & injecting hashes ===\n");
const manifest = buildCacheManifest(STATIC_SITE_DEST);
const manifestPath = path.join(STATIC_SITE_DEST, "cache-manifest.json");
fs.writeFileSync(manifestPath, JSON.stringify(manifest.entries, null, 2));
console.log(`  ✓ Cache manifest: ${Object.keys(manifest.entries).length} files hashed`);

// Inject hashes into static site index.html
const indexHtmlPath = path.join(STATIC_SITE_DEST, "index.html");
if (fs.existsSync(indexHtmlPath)) {
  let html = fs.readFileSync(indexHtmlPath, "utf-8");
  html = injectCacheHashes(html, manifest);
  fs.writeFileSync(indexHtmlPath, html);
  console.log("  ✓ Injected content hashes into static site index.html");
}

// ══════════════════════════════════════════════════════════════════════════════
// Done
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n=== ✓ Build complete ===\n");
console.log("Output structure:");
console.log("  public/index.html              → React SPA");
console.log("  public/assets/                 → Vite JS/CSS chunks");
console.log("  public/api/site/               → Static site (Playbook desktop)");
console.log("  public/api/site/cache-manifest.json");
console.log("  api/index.ts               → Serverless function (bundled by Vercel)");
console.log("");
console.log("Vercel routing:");
console.log("  /api/site/*  → CDN (public/api/site/*)");
console.log("  /api/*       → Serverless function (api/index.ts)");
console.log("  /*           → SPA fallback (public/index.html)");
