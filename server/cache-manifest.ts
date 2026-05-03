/**
 * Cache Manifest Generator — Phase 7.1 Automated Cache Busting
 *
 * Generates a JSON manifest mapping original filenames to content-hash suffixed filenames.
 * Runs at server startup (not build time) to avoid requiring a separate build step
 * for the static Playbook desktop site.
 *
 * Architecture decision:
 * - Compute hashes at startup rather than build time because server/public is deployed as-is
 *   (no bundler step for the legacy desktop site)
 * - Store manifest in memory for O(1) lookup during HTML injection
 * - Use first 8 chars of MD5 hash (sufficient for cache differentiation, short URLs)
 * - Manifest is regenerated on every server restart (deploy = restart = fresh hashes)
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface CacheManifest {
  /** Map of relative path (e.g., "js/app.js") to hash string (e.g., "a3f2b1c8") */
  entries: Record<string, string>;
  /** Timestamp when manifest was generated */
  generatedAt: number;
}

/**
 * Generate content hash for a file.
 * Uses MD5 (fast, not security-critical) truncated to 8 hex chars.
 */
function hashFile(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("md5").update(content).digest("hex").slice(0, 8);
}

/**
 * Build the cache manifest for all JS and CSS files in the public directory.
 */
export function buildCacheManifest(publicDir: string): CacheManifest {
  const entries: Record<string, string> = {};

  const dirs = ["js", "css"];
  for (const dir of dirs) {
    const dirPath = path.join(publicDir, dir);
    if (!fs.existsSync(dirPath)) continue;

    const files = fs.readdirSync(dirPath).filter((f) => {
      return f.endsWith(".js") || f.endsWith(".css");
    });

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) continue;

      const relativePath = `${dir}/${file}`;
      const hash = hashFile(filePath);
      entries[relativePath] = hash;
    }
  }

  return { entries, generatedAt: Date.now() };
}

/**
 * Replace all ?v=N query strings in HTML content with content-hash versions.
 * Handles both:
 *   - href="css/styles.css?v=143" → href="css/styles.css?v=a3f2b1c8"
 *   - src="js/app.js?v=131" → src="js/app.js?v=a3f2b1c8"
 *   - src="js/performance.js?v=102g" defer → src="js/performance.js?v=a3f2b1c8" defer
 */
export function injectCacheHashes(html: string, manifest: CacheManifest): string {
  // Match href="(css|js)/filename.ext?v=anything" or src="(css|js)/filename.ext?v=anything"
  return html.replace(
    /((?:href|src)=["'])((?:css|js)\/[^"'?]+)\?v=[^"']*?(["'])/g,
    (_match, prefix, filePath, suffix) => {
      const hash = manifest.entries[filePath];
      if (hash) {
        return `${prefix}${filePath}?v=${hash}${suffix}`;
      }
      // File not in manifest (shouldn't happen, but fail gracefully)
      return `${prefix}${filePath}?v=unknown${suffix}`;
    }
  );
}

// Singleton manifest — populated at server startup
let _manifest: CacheManifest | null = null;

/**
 * Initialize the cache manifest. Call once at server startup.
 */
export function initCacheManifest(publicDir: string): CacheManifest {
  _manifest = buildCacheManifest(publicDir);
  const count = Object.keys(_manifest.entries).length;
  console.log(`[CacheBust] Manifest built: ${count} files hashed`);
  return _manifest;
}

/**
 * Get the current cache manifest.
 */
export function getCacheManifest(): CacheManifest | null {
  return _manifest;
}

/**
 * Get the hash for a specific file path.
 * Used by module-loader endpoint to provide hashes for lazy-loaded scripts.
 */
export function getFileHash(relativePath: string): string | null {
  if (!_manifest) return null;
  return _manifest.entries[relativePath] || null;
}
