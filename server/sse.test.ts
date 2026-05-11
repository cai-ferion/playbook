/**
 * SSE Infrastructure Tests
 * Tests for: event-bus.ts, emit-change.ts, sse.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { eventBus, SSEChangeEvent, SSEModule } from "./io/event-bus.js";

describe("SSE Event Bus", () => {
  beforeEach(() => {
    eventBus.removeAllListeners();
  });

  it("emits change events to subscribers", () => {
    const handler = vi.fn();
    eventBus.onChange(handler);

    const event: SSEChangeEvent = {
      type: "record_created",
      module: "attendance",
      payload: { id: 1 },
      actor: { ohr: "TEST001", name: "Test User" },
      timestamp: Date.now(),
    };
    eventBus.emitChange(event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it("supports multiple subscribers", () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    eventBus.onChange(handler1);
    eventBus.onChange(handler2);

    const event: SSEChangeEvent = {
      type: "record_updated",
      module: "coaching",
      payload: { id: 5 },
      actor: { ohr: "TEST002", name: "User 2" },
      timestamp: Date.now(),
    };
    eventBus.emitChange(event);

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe function removes listener", () => {
    const handler = vi.fn();
    const unsubscribe = eventBus.onChange(handler);
    unsubscribe();

    eventBus.emitChange({
      type: "record_deleted",
      module: "leaves",
      payload: {},
      actor: { ohr: "TEST003", name: "User 3" },
      timestamp: Date.now(),
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it("emitChange never throws even if handler throws", () => {
    eventBus.onChange(() => {
      throw new Error("Handler crash");
    });

    // Should not throw
    expect(() => {
      eventBus.emitChange({
        type: "bulk_update",
        module: "billing",
        payload: { count: 10 },
        actor: { ohr: "TEST004", name: "User 4" },
        timestamp: Date.now(),
      });
    }).not.toThrow();
  });

  it("supports all defined module types", () => {
    const modules: SSEModule[] = [
      "attendance", "coaching", "leaves", "tasks", "billing",
      "permissions", "corrective-actions", "wfm", "attendance-ops",
      "tardiness", "role-change", "managers-nook", "group-tasks",
      "shift-extensions", "performance", "insights", "notifications",
      "employees", "audit-log",
    ];

    const handler = vi.fn();
    eventBus.onChange(handler);

    modules.forEach((mod) => {
      eventBus.emitChange({
        type: "record_created",
        module: mod,
        payload: {},
        actor: { ohr: "TEST", name: "Test" },
        timestamp: Date.now(),
      });
    });

    expect(handler).toHaveBeenCalledTimes(modules.length);
  });

  it("supports presence event types", () => {
    const handler = vi.fn();
    eventBus.onChange(handler);

    eventBus.emitChange({
      type: "presence_join",
      module: "attendance",
      payload: { ohr: "USER001", name: "John" },
      actor: { ohr: "USER001", name: "John" },
      timestamp: Date.now(),
    });

    eventBus.emitChange({
      type: "presence_leave",
      module: "attendance",
      payload: { ohr: "USER001", name: "John" },
      actor: { ohr: "USER001", name: "John" },
      timestamp: Date.now(),
    });

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[0][0].type).toBe("presence_join");
    expect(handler.mock.calls[1][0].type).toBe("presence_leave");
  });
});

describe("emitChange helper", () => {
  beforeEach(() => {
    eventBus.removeAllListeners();
  });

  it("constructs correct SSEChangeEvent from request context", async () => {
    // Import dynamically to avoid module resolution issues in test
    const { emitChange } = await import("./io/emit-change.js");

    const handler = vi.fn();
    eventBus.onChange(handler);

    // Mock Express request with user and headers
    const mockReq = {
      user: { openId: "OHR123", name: "Jane Doe" },
      headers: {},
    } as any;

    emitChange(mockReq, "attendance", "record_created", { id: 42 });

    expect(handler).toHaveBeenCalledTimes(1);
    const emitted = handler.mock.calls[0][0] as SSEChangeEvent;
    expect(emitted.type).toBe("record_created");
    expect(emitted.module).toBe("attendance");
    expect(emitted.payload).toEqual({ id: 42 });
    expect(emitted.actor.ohr).toBe("OHR123");
    expect(emitted.actor.name).toBe("Jane Doe");
    expect(emitted.timestamp).toBeGreaterThan(0);
  });

  it("falls back to x-actor-ohr header when no user on request", async () => {
    const { emitChange } = await import("./io/emit-change.js");

    const handler = vi.fn();
    eventBus.onChange(handler);

    const mockReq = {
      user: undefined,
      headers: { "x-actor-ohr": "HDR001", "x-actor-name": "Header User" },
    } as any;

    emitChange(mockReq, "billing", "bulk_update", { count: 5 });

    const emitted = handler.mock.calls[0][0] as SSEChangeEvent;
    expect(emitted.actor.ohr).toBe("HDR001");
    expect(emitted.actor.name).toBe("Header User");
  });

  it("uses 'unknown' when no identity available", async () => {
    const { emitChange } = await import("./io/emit-change.js");

    const handler = vi.fn();
    eventBus.onChange(handler);

    const mockReq = {
      user: undefined,
      headers: {},
    } as any;

    emitChange(mockReq, "tasks", "record_deleted", {});

    const emitted = handler.mock.calls[0][0] as SSEChangeEvent;
    expect(emitted.actor.ohr).toBe("system");
    expect(emitted.actor.name).toBe("System");
  });

  it("never throws even with malformed request", async () => {
    const { emitChange } = await import("./io/emit-change.js");

    expect(() => {
      emitChange(null as any, "attendance", "record_created", {});
    }).not.toThrow();

    expect(() => {
      emitChange(undefined as any, "coaching", "record_updated", {});
    }).not.toThrow();
  });

  it("handles all event types correctly", async () => {
    const { emitChange } = await import("./io/emit-change.js");

    const handler = vi.fn();
    eventBus.onChange(handler);

    const mockReq = { user: { openId: "T1", name: "T" }, headers: {} } as any;
    const types = ["record_created", "record_updated", "record_deleted", "bulk_update"] as const;

    types.forEach((t) => emitChange(mockReq, "attendance", t, {}));

    expect(handler).toHaveBeenCalledTimes(4);
    types.forEach((t, i) => {
      expect(handler.mock.calls[i][0].type).toBe(t);
    });
  });
});
