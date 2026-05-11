/**
 * emitChange — Convenience wrapper for emitting SSE change events from route handlers.
 *
 * Usage in any IO module:
 *   import { emitChange } from "./emit-change.js";
 *   // After successful DB write:
 *   emitChange(req, "attendance", "record_updated", { date: "2026-05-01", ohr_id: "740045023" });
 *
 * Design decisions:
 * - Actor identity extracted from req.user (session-verified) or x-actor-* headers
 * - Fire-and-forget: never throws, never awaits, never blocks the response
 * - Payload should contain ONLY the identifiers needed for client-side cache invalidation
 *   (e.g., date, ohr_id, record_id) — NOT the full record (bandwidth + security)
 */
import { Request } from "express";
import { eventBus, SSEModule, SSEEventType, SSEChangeEvent } from "./event-bus.js";

export function emitChange(
  req: Request,
  module: SSEModule,
  type: SSEEventType,
  payload: Record<string, unknown> = {}
): void {
  try {
    const actorOhr = (req.user?.openId as string)
      || (req.headers["x-actor-ohr"] as string)
      || "system";
    const actorName = (req.user?.name as string)
      || (req.headers["x-actor-name"] as string)
      || "System";

    const event: SSEChangeEvent = {
      type,
      module,
      payload,
      actor: { ohr: actorOhr, name: actorName },
      timestamp: Date.now(),
    };

    eventBus.emitChange(event);
  } catch {
    // Swallow — SSE emission must never break request flow
  }
}
