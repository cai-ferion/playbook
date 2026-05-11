/**
 * IO Operations Database Backup / Export
 * Exports all IO tables as CSV files in a ZIP archive.
 */
import { Router, Request, Response } from "express";
import { getDb } from "./db.js";
import {
  ioEmployees,
  ioAttendance,
  ioCoaching,
  ioCoachingRca,
  ioCoachingZtp,
  ioNotifications,
  ioInsights,
  ioLeaves,
} from "../drizzle/schema.js";
import { desc, asc, sql } from "drizzle-orm";

const router = Router();

/** Convert an array of objects to CSV string */
function toCSV(rows: Record<string, any>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    const values = headers.map((h) => {
      const val = row[h];
      if (val === null || val === undefined) return "";
      const str = String(val);
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    lines.push(values.join(","));
  }
  return lines.join("\n");
}

// GET /api/io/backup/tables - list available tables and row counts
router.get("/tables", async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const tables = [
      { name: "io_employees", table: ioEmployees },
      { name: "io_attendance", table: ioAttendance },
      { name: "io_coaching", table: ioCoaching },
      { name: "io_coaching_rca", table: ioCoachingRca },
      { name: "io_coaching_ztp", table: ioCoachingZtp },
      { name: "io_notifications", table: ioNotifications },
      { name: "io_insights", table: ioInsights },
      { name: "io_leaves", table: ioLeaves },
    ];

    const counts: { name: string; count: number }[] = [];
    for (const t of tables) {
      const result = await db.select({ count: sql<number>`COUNT(*)` }).from(t.table);
      counts.push({ name: t.name, count: Number(result[0]?.count || 0) });
    }

    res.json(counts);
  } catch (err: any) {
    console.error("[IO Backup] tables error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/io/backup/export/:table - export a single table as CSV
router.get("/export/:table", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const tableName = req.params.table;
    const tableMap: Record<string, any> = {
      io_employees: ioEmployees,
      io_attendance: ioAttendance,
      io_coaching: ioCoaching,
      io_coaching_rca: ioCoachingRca,
      io_coaching_ztp: ioCoachingZtp,
      io_notifications: ioNotifications,
      io_insights: ioInsights,
      io_leaves: ioLeaves,
    };

    const table = tableMap[tableName];
    if (!table) {
      return res.status(400).json({ error: `Unknown table: ${tableName}` });
    }

    // Fetch all rows (no limit for backup)
    const rows = await db.select().from(table);
    const csv = toCSV(rows);

    const timestamp = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${tableName}_${timestamp}.csv"`);
    res.send(csv);
  } catch (err: any) {
    console.error("[IO Backup] export error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/io/backup/export-all - export all tables as a combined JSON with CSVs
router.get("/export-all", async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const tables = [
      { name: "io_employees", table: ioEmployees },
      { name: "io_attendance", table: ioAttendance },
      { name: "io_coaching", table: ioCoaching },
      { name: "io_coaching_rca", table: ioCoachingRca },
      { name: "io_coaching_ztp", table: ioCoachingZtp },
      { name: "io_notifications", table: ioNotifications },
      { name: "io_insights", table: ioInsights },
      { name: "io_leaves", table: ioLeaves },
    ];

    const result: Record<string, { count: number; csv: string }> = {};
    for (const t of tables) {
      const rows = await db.select().from(t.table);
      result[t.name] = {
        count: rows.length,
        csv: toCSV(rows),
      };
    }

    const timestamp = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="io_backup_${timestamp}.json"`);
    res.json(result);
  } catch (err: any) {
    console.error("[IO Backup] export-all error:", err);
    res.status(500).json({ error: err.message });
  }
});

export function registerIOBackupRoutes(app: import("express").Express) {
  app.use("/api/io/backup", router);
  console.log("[IO Backup] Routes registered under /api/io/backup/*");
}
