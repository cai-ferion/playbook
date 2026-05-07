/**
 * Vitest tests for Optimistic Locking (server/io/optimistic-lock.ts)
 * Tests the helper functions: getClientVersion, sendConflict, optimisticUpdate
 */
import { describe, it, expect, vi, beforeAll } from "vitest";

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  sql: { raw: (s: string) => s },
  eq: (col: any, val: any) => ({ col, val, type: "eq" }),
  and: (...args: any[]) => ({ args, type: "and" }),
}));

// Dynamic import after mocks
let getClientVersion: any;
let sendConflict: any;
let optimisticUpdate: any;

beforeAll(async () => {
  const mod = await import("./io/optimistic-lock.js");
  getClientVersion = mod.getClientVersion;
  sendConflict = mod.sendConflict;
  optimisticUpdate = mod.optimisticUpdate;
});

describe("getClientVersion", () => {
  it("returns version number when present and positive", () => {
    expect(getClientVersion({ tag: "P", version: 3 })).toBe(3);
  });

  it("returns null when version is undefined", () => {
    expect(getClientVersion({ tag: "P" })).toBeNull();
  });

  it("returns null when version is 0", () => {
    expect(getClientVersion({ version: 0 })).toBeNull();
  });

  it("returns null when version is negative", () => {
    expect(getClientVersion({ version: -1 })).toBeNull();
  });

  it("returns null when version is a string", () => {
    expect(getClientVersion({ version: "3" })).toBeNull();
  });

  it("returns null when body is empty", () => {
    expect(getClientVersion({})).toBeNull();
  });

  it("returns version 1 (minimum valid)", () => {
    expect(getClientVersion({ version: 1 })).toBe(1);
  });
});

describe("sendConflict", () => {
  it("sends 409 with VERSION_CONFLICT error structure", () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const res = { status } as any;

    const serverState = { id: "abc", tag: "UPL", version: 5 };
    sendConflict(res, 3, serverState);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      error: "VERSION_CONFLICT",
      message: "This record was modified by another user. Please review the changes and try again.",
      conflict: {
        your_version: 3,
        server_version: 5,
        server_state: serverState,
      },
    });
  });

  it("handles server state without version field gracefully", () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const res = { status } as any;

    sendConflict(res, 2, { id: "xyz", tag: "P" });

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        conflict: expect.objectContaining({
          server_version: 0,
        }),
      })
    );
  });
});

describe("optimisticUpdate", () => {
  it("returns ok:true with newVersion on successful update", async () => {
    const mockDb = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => [{ id: "rec-1" }]),
        })),
      })),
    };

    const table = { version: "version_col" };
    const idCol = "id_col";
    const result = await optimisticUpdate(mockDb, table, idCol, "rec-1", 2, { tag: "P" });

    expect(result).toEqual({ ok: true, newVersion: 3 });
  });

  it("returns conflict with serverState when version mismatch", async () => {
    const serverRecord = { id: "rec-1", tag: "UPL", version: 5 };
    const mockDb = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => []),
        })),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => [serverRecord]),
          })),
        })),
      })),
    };

    const table = { version: "version_col" };
    const idCol = "id_col";
    const result = await optimisticUpdate(mockDb, table, idCol, "rec-1", 2, { tag: "P" });

    expect(result).toEqual({ ok: false, reason: "conflict", serverState: serverRecord });
  });

  it("returns not_found when record does not exist", async () => {
    const mockDb = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => []),
        })),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => []),
          })),
        })),
      })),
    };

    const table = { version: "version_col" };
    const idCol = "id_col";
    const result = await optimisticUpdate(mockDb, table, idCol, "nonexistent", 1, { tag: "P" });

    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("increments version by 1 in the update payload", async () => {
    let capturedSet: any = null;
    const mockDb = {
      update: vi.fn(() => ({
        set: vi.fn((data: any) => {
          capturedSet = data;
          return { where: vi.fn(() => [{ id: "rec-1" }]) };
        }),
      })),
    };

    const table = { version: "version_col" };
    const idCol = "id_col";
    await optimisticUpdate(mockDb, table, idCol, "rec-1", 7, { tag: "LATE" });

    expect(capturedSet).toEqual({ tag: "LATE", version: 8 });
  });

  it("passes all update fields through to the set call", async () => {
    let capturedSet: any = null;
    const mockDb = {
      update: vi.fn(() => ({
        set: vi.fn((data: any) => {
          capturedSet = data;
          return { where: vi.fn(() => [{ id: "rec-1" }]) };
        }),
      })),
    };

    const table = { version: "version_col" };
    const idCol = "id_col";
    await optimisticUpdate(mockDb, table, idCol, "rec-1", 1, {
      tag: "UPL",
      upl_reason: "Medical",
      remarks: "Sick leave",
    });

    expect(capturedSet).toEqual({
      tag: "UPL",
      upl_reason: "Medical",
      remarks: "Sick leave",
      version: 2,
    });
  });
});
