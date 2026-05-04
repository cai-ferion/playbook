/**
 * SSE Event Bus — Typed EventEmitter for broadcasting data change events.
 *
 * Architecture:
 * - Singleton in-process event bus (Node.js is single-threaded, no IPC needed for single-instance)
 * - All IO write operations emit events AFTER successful DB commit
 * - SSE connection manager subscribes to this bus and fans out to connected clients
 * - Events are typed by module to enable targeted client-side refresh
 *
 * Trade-off: In-process EventEmitter means events are lost if no SSE clients are connected.
 * This is acceptable — SSE is a best-effort notification, not a durable queue.
 * If Cloud Run scales to multiple instances, upgrade to Redis Pub/Sub.
 */
import { EventEmitter } from "events";

// ── Event Types ──────────────────────────────────────────────────────
export type SSEModule =
  | "attendance"
  | "coaching"
  | "leaves"
  | "tasks"
  | "billing"
  | "permissions"
  | "corrective-actions"
  | "wfm"
  | "attendance-ops"
  | "tardiness"
  | "role-change"
  | "managers-nook"
  | "group-tasks"
  | "shift-extensions"
  | "performance"
  | "insights"
  | "notifications"
  | "employees"
  | "audit-log"
  | "leave-periods"
  | "admin-ohrs";

export type SSEEventType =
  | "record_created"
  | "record_updated"
  | "record_deleted"
  | "bulk_update"
  | "presence_join"
  | "presence_leave";

export interface SSEChangeEvent {
  type: SSEEventType;
  module: SSEModule;
  payload: Record<string, unknown>;
  actor: { ohr: string; name: string };
  timestamp: number;
}

// ── Singleton Bus ────────────────────────────────────────────────────
class IOEventBus extends EventEmitter {
  constructor() {
    super();
    // Prevent memory leak warnings — we may have 200+ SSE listeners
    this.setMaxListeners(500);
  }

  /**
   * Emit a data change event. Call this AFTER successful DB write.
   * Fire-and-forget — never throws, never blocks the request.
   */
  emitChange(event: SSEChangeEvent): void {
    try {
      this.emit("change", event);
    } catch {
      // Swallow — observability bus must never break request flow
    }
  }

  /**
   * Subscribe to all change events.
   * Returns unsubscribe function for cleanup.
   */
  onChange(handler: (event: SSEChangeEvent) => void): () => void {
    this.on("change", handler);
    return () => this.off("change", handler);
  }
}

// Export singleton instance
export const eventBus = new IOEventBus();
