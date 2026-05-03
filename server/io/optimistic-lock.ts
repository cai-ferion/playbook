/**
 * server/io/optimistic-lock.ts
 * Optimistic Locking Helper — Version-aware UPDATE with conflict detection.
 *
 * Architecture:
 * - Every editable record carries a `version` INT column (starts at 1).
 * - On UPDATE, the WHERE clause includes `AND version = :expectedVersion`.
 * - If affectedRows === 0, the record was modified by another user → 409 Conflict.
 * - The response includes the current server state so the client can show a merge dialog.
 *
 * Trade-off: This is row-level locking, not field-level. If User A edits field X
 * and User B edits field Y on the same record, it still triggers a conflict.
 * This is intentional — field-level merge is complex and error-prone for operational data.
 * The merge dialog lets users resolve it manually.
 *
 * Backward Compatibility:
 * - If the client does NOT send `version` in the body, the update proceeds without
 *   version checking (legacy behavior). This ensures old clients still work.
 * - Once the frontend is updated to send version, conflict detection activates.
 */
import { Response } from "express";
import { sql, and, eq } from "drizzle-orm";

// ── Types ────────────────────────────────────────────────────────────
export interface ConflictResponse {
  error: "VERSION_CONFLICT";
  message: string;
  conflict: {
    your_version: number;
    server_version: number;
    server_state: Record<string, unknown>;
  };
}

/**
 * Attempt a version-aware update using raw SQL for maximum control.
 *
 * @param db - Drizzle database instance
 * @param tableName - The raw SQL table name (e.g., "io_attendance")
 * @param idColumn - The column name for the primary key (e.g., "id")
 * @param idValue - The primary key value
 * @param expectedVersion - The version the client last read
 * @param setClauses - SQL SET clause string (e.g., "`tag` = 'WFH', `remarks` = 'test'")
 * @param setParams - Parameterized values for the SET clause
 *
 * Returns affectedRows count. If 0, caller should check if record exists to distinguish
 * "not found" from "version conflict".
 */
export async function versionedUpdateRaw(
  db: any,
  tableName: string,
  idColumn: string,
  idValue: string | number,
  expectedVersion: number,
  setClauses: string,
  setParams: unknown[],
): Promise<{ affectedRows: number; newVersion: number }> {
  const newVersion = expectedVersion + 1;
  const fullSet = `${setClauses}, \`version\` = ?`;
  const allParams = [...setParams, newVersion, idValue, expectedVersion];

  const result = await db.execute(
    sql.raw(
      `UPDATE \`${tableName}\` SET ${fullSet} WHERE \`${idColumn}\` = ? AND \`version\` = ?`
    ).append(sql`${sql.raw("")}`),
  );

  // TiDB/MySQL returns ResultSetHeader as first element
  const affectedRows = (result as any)?.[0]?.affectedRows ?? (result as any)?.affectedRows ?? 0;
  return { affectedRows, newVersion };
}

/**
 * Higher-level helper: performs version-aware update using Drizzle's query builder.
 * Simpler API — pass the Drizzle table, column reference, and update object.
 *
 * Returns:
 * - { ok: true, newVersion } on success
 * - { ok: false, reason: "conflict", serverState } on version mismatch
 * - { ok: false, reason: "not_found" } if record doesn't exist
 */
export async function optimisticUpdate(
  db: any,
  table: any,
  idCol: any,
  idValue: string | number,
  expectedVersion: number,
  updateFields: Record<string, unknown>,
): Promise<
  | { ok: true; newVersion: number }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "conflict"; serverState: Record<string, unknown> }
> {
  const newVersion = expectedVersion + 1;

  // Include version increment in the update
  const updateWithVersion = { ...updateFields, version: newVersion };

  // Execute update with version constraint
  const result = await db
    .update(table)
    .set(updateWithVersion)
    .where(and(eq(idCol, idValue), eq(table.version, expectedVersion)));

  const affectedRows = (result as any)?.[0]?.affectedRows ?? (result as any)?.affectedRows ?? 0;

  if (affectedRows > 0) {
    return { ok: true, newVersion };
  }

  // Distinguish "not found" from "conflict"
  const existing = await db.select().from(table).where(eq(idCol, idValue)).limit(1);
  if (existing.length === 0) {
    return { ok: false, reason: "not_found" };
  }

  return { ok: false, reason: "conflict", serverState: existing[0] as Record<string, unknown> };
}

/**
 * Send a 409 Conflict response with the server's current state.
 * The client uses this to display the merge dialog.
 */
export function sendConflict(
  res: Response,
  yourVersion: number,
  serverState: Record<string, unknown>,
): void {
  const response: ConflictResponse = {
    error: "VERSION_CONFLICT",
    message: "This record was modified by another user. Please review the changes and try again.",
    conflict: {
      your_version: yourVersion,
      server_version: (serverState.version as number) || 0,
      server_state: serverState,
    },
  };
  res.status(409).json(response);
}

/**
 * Check if the client provided a version in the request body.
 * If yes, return the version number. If no, return null (skip locking).
 */
export function getClientVersion(body: Record<string, unknown>): number | null {
  if (body && typeof body.version === "number" && body.version > 0) {
    return body.version;
  }
  return null;
}
