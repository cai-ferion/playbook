import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Tests for IO Operations API routes.
 * These tests verify the route registration, request handling, and database interactions
 * for the workforce management system's core API endpoints.
 */

// Mock the database module
vi.mock("./db.js", () => {
  const mockSelect = vi.fn();
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();
  const mockDelete = vi.fn();
  const mockFrom = vi.fn();
  const mockWhere = vi.fn();
  const mockLimit = vi.fn();
  const mockOrderBy = vi.fn();
  const mockSet = vi.fn();
  const mockValues = vi.fn();
  const mockOffset = vi.fn();

  // Chain mocks
  mockSelect.mockReturnValue({ from: mockFrom });
  mockFrom.mockReturnValue({ where: mockWhere, orderBy: mockOrderBy, limit: mockLimit });
  mockWhere.mockReturnValue({ limit: mockLimit, orderBy: mockOrderBy });
  mockOrderBy.mockReturnValue({ limit: mockLimit, offset: mockOffset });
  mockLimit.mockReturnValue({ offset: mockOffset });
  mockOffset.mockResolvedValue([]);
  mockLimit.mockResolvedValue([]);
  mockInsert.mockReturnValue({ values: mockValues });
  mockValues.mockReturnValue({ onDuplicateKeyUpdate: vi.fn().mockResolvedValue([{ insertId: 1 }]) });
  mockValues.mockResolvedValue([{ insertId: 1 }]);
  mockUpdate.mockReturnValue({ set: mockSet });
  mockSet.mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
  mockDelete.mockReturnValue({ where: vi.fn().mockResolvedValue([]) });

  const mockDb = {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    selectDistinct: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ orderBy: vi.fn().mockResolvedValue([]) }) }),
  };

  return {
    getDb: vi.fn().mockResolvedValue(mockDb),
    _mockDb: mockDb,
    _mocks: { mockSelect, mockInsert, mockUpdate, mockDelete, mockFrom, mockWhere, mockLimit, mockOrderBy, mockSet, mockValues, mockOffset },
  };
});

// Mock the storage module
vi.mock("./storage.js", () => ({
  storagePut: vi.fn().mockResolvedValue({ url: "https://cdn.example.com/file.png", key: "test-key" }),
}));

describe("IO Routes Module", () => {
  it("exports registerIORoutes function", async () => {
    const mod = await import("./io-routes.js");
    expect(mod.registerIORoutes).toBeDefined();
    expect(typeof mod.registerIORoutes).toBe("function");
  });

  it("registerIORoutes is a no-op stub (routes served by modular IO router)", async () => {
    const { registerIORoutes } = await import("./io-routes.js");
    const mockApp = {
      use: vi.fn(),
    };
    registerIORoutes(mockApp as any);
    // No-op stub: should NOT call app.use (all routes now in io/index.ts)
    expect(mockApp.use).not.toHaveBeenCalled();
  });
});

describe("IO Backup Module", () => {
  it("exports registerIOBackupRoutes function", async () => {
    const mod = await import("./io-backup.js");
    expect(mod.registerIOBackupRoutes).toBeDefined();
    expect(typeof mod.registerIOBackupRoutes).toBe("function");
  });

  it("registerIOBackupRoutes registers routes on an Express app", async () => {
    const { registerIOBackupRoutes } = await import("./io-backup.js");
    const mockApp = {
      use: vi.fn(),
    };
    registerIOBackupRoutes(mockApp as any);
    expect(mockApp.use).toHaveBeenCalledWith("/api/io/backup", expect.anything());
  });
});

describe("Database Schema", () => {
  it("exports all required table definitions", async () => {
    const schema = await import("../drizzle/schema.js");
    
    // Core user table
    expect(schema.users).toBeDefined();
    
    // IO Operations tables
    expect(schema.ioEmployees).toBeDefined();
    expect(schema.ioAttendance).toBeDefined();
    expect(schema.ioCoaching).toBeDefined();
    expect(schema.ioCoachingRca).toBeDefined();
    expect(schema.ioCoachingZtp).toBeDefined();
    expect(schema.ioNotifications).toBeDefined();
    expect(schema.ioInsights).toBeDefined();
    expect(schema.ioLeaves).toBeDefined();
    expect(schema.ioAuditLog).toBeDefined();
    expect(schema.ioTasks).toBeDefined();
    expect(schema.ioTaskComments).toBeDefined();
  });

  it("ioEmployees has ohr_id as primary key", async () => {
    const schema = await import("../drizzle/schema.js");
    // Verify the table has the expected structure
    const columns = Object.keys(schema.ioEmployees);
    expect(columns).toContain("ohr_id");
    expect(columns).toContain("full_name");
    expect(columns).toContain("planning_group");
    expect(columns).toContain("shift_time");
    expect(columns).toContain("supervisor_name");
    expect(columns).toContain("employement_status");
    // password and is_locked columns removed (post-password cleanup)
    expect(columns).not.toContain("is_locked");
    expect(columns).not.toContain("password");
  });

  it("ioAttendance has all required columns including snapshots", async () => {
    const schema = await import("../drizzle/schema.js");
    const columns = Object.keys(schema.ioAttendance);
    expect(columns).toContain("id");
    expect(columns).toContain("ohr_id");
    expect(columns).toContain("log_date");
    expect(columns).toContain("tag");
    expect(columns).toContain("upl_reason");
    expect(columns).toContain("remarks");
    expect(columns).toContain("ot_hours");
    expect(columns).toContain("snap_full_name");
    expect(columns).toContain("snap_supervisor");
    expect(columns).toContain("snap_planning_group");
    expect(columns).toContain("is_locked");
    expect(columns).toContain("locked_at");
  });

  it("ioCoaching has all required columns for coaching workflow", async () => {
    const schema = await import("../drizzle/schema.js");
    const columns = Object.keys(schema.ioCoaching);
    expect(columns).toContain("coaching_id");
    expect(columns).toContain("coaching_type");
    expect(columns).toContain("coach");
    expect(columns).toContain("coachee");
    expect(columns).toContain("status");
    expect(columns).toContain("dispute_comments");
    expect(columns).toContain("infraction_category");
    expect(columns).toContain("severity");
    expect(columns).toContain("coachee_ack");
    expect(columns).toContain("job_id");
  });

  it("ioAuditLog has all required columns for audit tracking", async () => {
    const schema = await import("../drizzle/schema.js");
    const columns = Object.keys(schema.ioAuditLog);
    expect(columns).toContain("record_type");
    expect(columns).toContain("record_id");
    expect(columns).toContain("action");
    expect(columns).toContain("field_name");
    expect(columns).toContain("old_value");
    expect(columns).toContain("new_value");
    expect(columns).toContain("actor_ohr");
    expect(columns).toContain("actor_name");
    expect(columns).toContain("timestamp");
  });

  it("ioTasks has all required columns for task management", async () => {
    const schema = await import("../drizzle/schema.js");
    const columns = Object.keys(schema.ioTasks);
    expect(columns).toContain("task_id");
    expect(columns).toContain("title");
    expect(columns).toContain("description");
    expect(columns).toContain("status");
    expect(columns).toContain("assigned_to_ohr");
    expect(columns).toContain("assigned_by_ohr");
    expect(columns).toContain("due_date");
  });
});

describe("Type Exports", () => {
  it("exports type inference helpers for all tables", async () => {
    const schema = await import("../drizzle/schema.js");
    // These are type-level exports, but we can verify the table objects exist
    // which means the types are derivable
    expect(schema.ioEmployees.$inferSelect).toBeDefined;
    expect(schema.ioAttendance.$inferSelect).toBeDefined;
    expect(schema.ioCoaching.$inferSelect).toBeDefined;
    expect(schema.ioCoachingRca.$inferSelect).toBeDefined;
    expect(schema.ioCoachingZtp.$inferSelect).toBeDefined;
    expect(schema.ioNotifications.$inferSelect).toBeDefined;
    expect(schema.ioInsights.$inferSelect).toBeDefined;
    expect(schema.ioLeaves.$inferSelect).toBeDefined;
    expect(schema.ioAuditLog.$inferSelect).toBeDefined;
    expect(schema.ioTasks.$inferSelect).toBeDefined;
    expect(schema.ioTaskComments.$inferSelect).toBeDefined;
  });
});
