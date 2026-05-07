/**
 * Supabase Sync Module
 * ---------------------
 * Mirrors io_employees mutations to the user's personal Supabase instance.
 *
 * Design: fire-and-forget with retry. Every mutation path that touches
 * io_employees calls one of the exported helpers. Failures are logged
 * but never block the primary DB write — Supabase is a secondary mirror.
 */

import { ENV } from "./_core/env.js";

// ── Config ──────────────────────────────────────────────────────────────────

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;
const BATCH_SIZE = 50;

function getHeaders() {
  return {
    apikey: ENV.supabaseServiceKey,
    Authorization: `Bearer ${ENV.supabaseServiceKey}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates",
  };
}

function isConfigured(): boolean {
  return Boolean(ENV.supabaseUrl && ENV.supabaseServiceKey);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Clean a DB row for Supabase JSON serialisation.
 * Converts non-primitive values to strings, preserves nulls.
 */
function cleanRow(row: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) {
      cleaned[k] = null;
    } else if (typeof v === "number" || typeof v === "boolean") {
      cleaned[k] = v;
    } else {
      cleaned[k] = String(v);
    }
  }
  return cleaned;
}

async function supabaseRequest(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<{ ok: boolean; status: number; text: string }> {
  const url = `${ENV.supabaseUrl}${path}`;
  const headers = { ...getHeaders(), ...(extraHeaders || {}) };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await resp.text();
      if (resp.ok || resp.status === 201) {
        return { ok: true, status: resp.status, text };
      }
      // Retry on 5xx or 429
      if ((resp.status >= 500 || resp.status === 429) && attempt < MAX_RETRIES) {
        console.warn(`[SUPABASE-SYNC] Retry ${attempt + 1}/${MAX_RETRIES} (${resp.status})`);
        await sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
      return { ok: false, status: resp.status, text };
    } catch (err: any) {
      if (attempt < MAX_RETRIES) {
        console.warn(`[SUPABASE-SYNC] Network error, retry ${attempt + 1}: ${err.message}`);
        await sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
      return { ok: false, status: 0, text: err.message };
    }
  }
  return { ok: false, status: 0, text: "Max retries exceeded" };
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Upsert one or more employee rows to Supabase.
 * Call after any INSERT or UPDATE on io_employees.
 * Fire-and-forget: errors are logged, never thrown.
 */
export async function syncEmployeesToSupabase(
  rows: Record<string, unknown>[],
): Promise<void> {
  if (!isConfigured()) {
    console.warn("[SUPABASE-SYNC] Not configured — skipping");
    return;
  }
  if (!rows.length) return;

  const cleaned = rows.map(cleanRow);

  try {
    // Batch upsert
    for (let i = 0; i < cleaned.length; i += BATCH_SIZE) {
      const batch = cleaned.slice(i, i + BATCH_SIZE);
      const result = await supabaseRequest(
        "POST",
        "/rest/v1/io_employees",
        batch,
      );
      if (!result.ok) {
        console.error(
          `[SUPABASE-SYNC] Upsert failed (batch ${i / BATCH_SIZE + 1}): ${result.status} ${result.text.substring(0, 200)}`,
        );
      }
    }
    console.log(`[SUPABASE-SYNC] Upserted ${cleaned.length} employee(s)`);
  } catch (err: any) {
    console.error(`[SUPABASE-SYNC] Unexpected error: ${err.message}`);
  }
}

/**
 * Delete one or more employees from Supabase by ohr_id.
 * Call after any DELETE on io_employees.
 */
export async function deleteEmployeesFromSupabase(
  ohrIds: string[],
): Promise<void> {
  if (!isConfigured()) return;
  if (!ohrIds.length) return;

  try {
    // Supabase REST API: DELETE with filter
    const filter = ohrIds.map((id) => `ohr_id.eq.${id}`).join(",");
    const result = await supabaseRequest(
      "DELETE",
      `/rest/v1/io_employees?or=(${filter})`,
    );
    if (!result.ok) {
      console.error(`[SUPABASE-SYNC] Delete failed: ${result.status} ${result.text.substring(0, 200)}`);
    } else {
      console.log(`[SUPABASE-SYNC] Deleted ${ohrIds.length} employee(s)`);
    }
  } catch (err: any) {
    console.error(`[SUPABASE-SYNC] Delete error: ${err.message}`);
  }
}

/**
 * Full sync: read all io_employees from the primary DB and upsert to Supabase.
 * Useful for manual reconciliation or initial setup.
 */
export async function fullSyncToSupabase(
  getAllEmployees: () => Promise<Record<string, unknown>[]>,
): Promise<{ ok: boolean; count: number; error?: string }> {
  if (!isConfigured()) {
    return { ok: false, count: 0, error: "Supabase not configured" };
  }

  try {
    const allRows = await getAllEmployees();
    const cleaned = allRows.map(cleanRow);

    let upserted = 0;
    for (let i = 0; i < cleaned.length; i += BATCH_SIZE) {
      const batch = cleaned.slice(i, i + BATCH_SIZE);
      const result = await supabaseRequest("POST", "/rest/v1/io_employees", batch);
      if (result.ok) {
        upserted += batch.length;
      } else {
        console.error(`[SUPABASE-SYNC] Full sync batch error: ${result.status} ${result.text.substring(0, 200)}`);
        return { ok: false, count: upserted, error: result.text.substring(0, 200) };
      }
    }

    console.log(`[SUPABASE-SYNC] Full sync complete: ${upserted}/${allRows.length} rows`);
    return { ok: true, count: upserted };
  } catch (err: any) {
    console.error(`[SUPABASE-SYNC] Full sync error: ${err.message}`);
    return { ok: false, count: 0, error: err.message };
  }
}

/**
 * Health check: verify Supabase connectivity by counting rows.
 */
export async function checkSupabaseHealth(): Promise<{
  ok: boolean;
  rowCount?: number;
  error?: string;
}> {
  if (!isConfigured()) {
    return { ok: false, error: "Supabase not configured" };
  }

  const result = await supabaseRequest(
    "GET",
    "/rest/v1/io_employees?select=ohr_id&limit=1",
    undefined,
    { Prefer: "count=exact", Range: "0-0" },
  );

  if (result.ok) {
    // Parse content-range header from response — not available via fetch text
    // Instead, just confirm connectivity
    return { ok: true };
  }
  return { ok: false, error: result.text.substring(0, 200) };
}
