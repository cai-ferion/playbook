/**
 * Attendance Operations Module (Admin/Owner-only)
 * Extracted from io-routes.ts — handles attendance purge, bulk insert, undo, last-batch
 */
import { Router, Request, Response } from "express";
import { getDb } from "../db.js";
import { ioAttendance, ioAuditLog, ioEmployees } from "../../drizzle/schema.js";
import { sql, eq, and, inArray } from "drizzle-orm";
import { ADMIN_OHRS, OWNER_OHR } from "./shared.js";

const router = Router();

// ============================================================
// Attendance Purge — owner-only (740045023)
// ============================================================

// GET /api/io/attendance-purge-preview?ohr_id=X&from_date=YYYY-MM-DD
// Returns a summary of rows that would be deleted + first 20 rows for preview
router.get("/attendance-purge-preview", async (req: Request, res: Response) => {
  try {
    const actor = String(req.query.actor_ohr || '');
    if (actor !== OWNER_OHR) return res.status(403).json({ error: "Owner-only operation" });

    const ohrId = String(req.query.ohr_id || '').trim();
    const fromDate = String(req.query.from_date || '').trim();
    const toDate = String(req.query.to_date || '').trim();
    if (!ohrId) return res.status(400).json({ error: "ohr_id is required" });
    if (!fromDate || !/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) return res.status(400).json({ error: "from_date is required (YYYY-MM-DD)" });
    if (toDate && !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) return res.status(400).json({ error: "to_date must be YYYY-MM-DD format" });
    const hasToDate = !!toDate;

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    // Check if employee exists in employees table
    const empRows: any = await db.execute(
      sql`SELECT ohr_id, full_name, actual_role, planning_group FROM io_employees WHERE ohr_id = ${ohrId} LIMIT 1`
    );
    const empArr = Array.isArray(empRows[0]) ? empRows[0] : empRows;
    if (!empArr || empArr.length === 0) {
      return res.json({ found: false, error: "employee_not_found", message: `Employee with OHR ${ohrId} not found in the employee database.` });
    }
    const employee = empArr[0];

    // Count matching attendance rows (within date range or open-ended)
    const countResult: any = await db.execute(
      hasToDate
        ? sql`SELECT COUNT(*) as cnt FROM io_attendance WHERE ohr_id = ${ohrId} AND log_date >= ${fromDate} AND log_date <= ${toDate}`
        : sql`SELECT COUNT(*) as cnt FROM io_attendance WHERE ohr_id = ${ohrId} AND log_date >= ${fromDate}`
    );
    const countArr = Array.isArray(countResult[0]) ? countResult[0] : countResult;
    const totalRows = Number(countArr[0]?.cnt || 0);

    if (totalRows === 0) {
      return res.json({
        found: true,
        employee: { ohr_id: employee.ohr_id, full_name: employee.full_name, actual_role: employee.actual_role, planning_group: employee.planning_group },
        total_rows: 0,
        error: "no_attendance_rows",
        message: `No attendance records found for ${employee.full_name} (${ohrId}) from ${fromDate}${hasToDate ? ` to ${toDate}` : ' onwards'}.`
      });
    }

    // Get date range
    const rangeResult: any = await db.execute(
      hasToDate
        ? sql`SELECT MIN(log_date) as min_date, MAX(log_date) as max_date FROM io_attendance WHERE ohr_id = ${ohrId} AND log_date >= ${fromDate} AND log_date <= ${toDate}`
        : sql`SELECT MIN(log_date) as min_date, MAX(log_date) as max_date FROM io_attendance WHERE ohr_id = ${ohrId} AND log_date >= ${fromDate}`
    );
    const rangeArr = Array.isArray(rangeResult[0]) ? rangeResult[0] : rangeResult;
    const { min_date, max_date } = rangeArr[0] || {};

    // Get first 20 rows for preview
    const previewRows: any = await db.execute(
      hasToDate
        ? sql`SELECT id, log_date, tag, ot_hours, remarks, snap_planning_group, snap_shift_time, wfm_tag
            FROM io_attendance WHERE ohr_id = ${ohrId} AND log_date >= ${fromDate} AND log_date <= ${toDate}
            ORDER BY log_date ASC LIMIT 20`
        : sql`SELECT id, log_date, tag, ot_hours, remarks, snap_planning_group, snap_shift_time, wfm_tag
            FROM io_attendance WHERE ohr_id = ${ohrId} AND log_date >= ${fromDate}
            ORDER BY log_date ASC LIMIT 20`
    );
    const preview = Array.isArray(previewRows[0]) ? previewRows[0] : previewRows;

    // Tag distribution
    const tagResult: any = await db.execute(
      hasToDate
        ? sql`SELECT COALESCE(tag, '(empty)') as tag_name, COUNT(*) as cnt
            FROM io_attendance WHERE ohr_id = ${ohrId} AND log_date >= ${fromDate} AND log_date <= ${toDate}
            GROUP BY tag ORDER BY cnt DESC`
        : sql`SELECT COALESCE(tag, '(empty)') as tag_name, COUNT(*) as cnt
            FROM io_attendance WHERE ohr_id = ${ohrId} AND log_date >= ${fromDate}
            GROUP BY tag ORDER BY cnt DESC`
    );
    const tagDist = Array.isArray(tagResult[0]) ? tagResult[0] : tagResult;

    res.json({
      found: true,
      employee: { ohr_id: employee.ohr_id, full_name: employee.full_name, actual_role: employee.actual_role, planning_group: employee.planning_group },
      total_rows: totalRows,
      date_range: { from: min_date, to: max_date },
      tag_distribution: tagDist,
      preview: preview,
    });
  } catch (err: any) {
    console.error("[IO API] attendance-purge-preview error:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/io/attendance-purge - hard delete attendance rows (owner-only)
router.delete("/attendance-purge", async (req: Request, res: Response) => {
  try {
    const { actor_ohr, ohr_id, from_date, to_date } = req.body;
    if (String(actor_ohr) !== OWNER_OHR) return res.status(403).json({ error: "Owner-only operation" });
    if (!ohr_id) return res.status(400).json({ error: "ohr_id is required" });
    if (!from_date || !/^\d{4}-\d{2}-\d{2}$/.test(from_date)) return res.status(400).json({ error: "from_date is required (YYYY-MM-DD)" });
    if (to_date && !/^\d{4}-\d{2}-\d{2}$/.test(to_date)) return res.status(400).json({ error: "to_date must be YYYY-MM-DD format" });
    const hasToDate = !!to_date;

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    // Count before delete for confirmation
    const countResult: any = await db.execute(
      hasToDate
        ? sql`SELECT COUNT(*) as cnt FROM io_attendance WHERE ohr_id = ${ohr_id} AND log_date >= ${from_date} AND log_date <= ${to_date}`
        : sql`SELECT COUNT(*) as cnt FROM io_attendance WHERE ohr_id = ${ohr_id} AND log_date >= ${from_date}`
    );
    const countArr = Array.isArray(countResult[0]) ? countResult[0] : countResult;
    const totalRows = Number(countArr[0]?.cnt || 0);

    if (totalRows === 0) {
      return res.json({ success: true, deleted: 0, message: "No rows matched the criteria." });
    }

    // Log the purge action to audit log
    await db.insert(ioAuditLog).values({
      record_type: "attendance_purge",
      record_id: `${ohr_id}_${from_date}_to_${hasToDate ? to_date : 'onwards'}`,
      action: "purge",
      field_name: "bulk_delete",
      old_value: `${totalRows} rows`,
      new_value: null,
      actor_ohr: String(actor_ohr),
      actor_name: "Owner",
    });

    // Execute the delete
    await db.execute(
      hasToDate
        ? sql`DELETE FROM io_attendance WHERE ohr_id = ${ohr_id} AND log_date >= ${from_date} AND log_date <= ${to_date}`
        : sql`DELETE FROM io_attendance WHERE ohr_id = ${ohr_id} AND log_date >= ${from_date}`
    );

    console.log(`[IO API] PURGE: Deleted ${totalRows} attendance rows for ${ohr_id} from ${from_date}${hasToDate ? ` to ${to_date}` : ' onwards'} (actor: ${actor_ohr})`);
    res.json({ success: true, deleted: totalRows });
  } catch (err: any) {
    console.error("[IO API] attendance-purge error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Bulk Insert Attendance Rows into Input Portal (Admin-only)
// ============================================================

// POST /api/io/attendance-bulk-insert-preview
router.post("/attendance-bulk-insert-preview", async (req: Request, res: Response) => {
  try {
    const { actor_ohr, dates, employee_filters } = req.body;
    if (!actor_ohr || !ADMIN_OHRS.includes(String(actor_ohr))) {
      return res.status(403).json({ error: "Admin-only operation" });
    }
    if (!Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({ error: "At least one date is required" });
    }

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    // Fetch employees with optional filters
    const conditions: any[] = [];
    if (employee_filters?.status) {
      conditions.push(eq(ioEmployees.employement_status, employee_filters.status));
    }
    if (employee_filters?.planning_group) {
      conditions.push(eq(ioEmployees.planning_group, employee_filters.planning_group));
    }
    if (employee_filters?.role) {
      conditions.push(eq(ioEmployees.actual_role, employee_filters.role));
    }
    if (employee_filters?.supervisor) {
      conditions.push(eq(ioEmployees.supervisor_name, employee_filters.supervisor));
    }
    // Always exclude Managers from attendance tracking
    conditions.push(sql`${ioEmployees.actual_role} != 'Manager'`);

    const employees = await db.select({
      ohr_id: ioEmployees.ohr_id,
      full_name: ioEmployees.full_name,
      actual_role: ioEmployees.actual_role,
      planning_group: ioEmployees.planning_group,
      supervisor_name: ioEmployees.supervisor_name,
    }).from(ioEmployees).where(and(...conditions));

    // Check for existing attendance rows (duplicates) — match on ohr_id + log_date
    const existingRows = await db.select({
      ohr_id: ioAttendance.ohr_id,
      log_date: ioAttendance.log_date,
    }).from(ioAttendance)
      .where(inArray(ioAttendance.log_date, dates.map(d => d.slice(0, 10))));

    const existingSet = new Set(
      existingRows.map(r => `${r.ohr_id}||${String(r.log_date || '').slice(0, 10)}`)
    );

    // Build employee list with duplicate status per date
    let totalNew = 0;
    let totalDuplicate = 0;
    const employeeList: { ohr_id: string; full_name: string; supervisor: string; is_duplicate: boolean }[] = [];

    for (const emp of employees) {
      let dupCount = 0;
      for (const date of dates) {
        const key = `${emp.ohr_id}||${date.slice(0, 10)}`;
        if (existingSet.has(key)) dupCount++;
      }
      const isDuplicate = dupCount === dates.length;
      if (isDuplicate) {
        totalDuplicate++;
      } else {
        totalNew++;
      }
      employeeList.push({
        ohr_id: emp.ohr_id,
        full_name: emp.full_name || '',
        supervisor: emp.supervisor_name || '',
        is_duplicate: isDuplicate,
      });
    }

    // Sort: non-duplicates first, then alphabetically by name
    employeeList.sort((a, b) => {
      if (a.is_duplicate !== b.is_duplicate) return a.is_duplicate ? 1 : -1;
      return (a.full_name || '').localeCompare(b.full_name || '');
    });

    res.json({
      total_new: totalNew,
      total_duplicate: totalDuplicate,
      total_employees: employees.length,
      total_dates: dates.length,
      employees: employeeList,
    });
  } catch (err: any) {
    console.error("[IO API] attendance-bulk-insert-preview error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/attendance-bulk-insert
router.post("/attendance-bulk-insert", async (req: Request, res: Response) => {
  try {
    const { actor_ohr, dates, selected_ohrs } = req.body;
    if (!actor_ohr || !ADMIN_OHRS.includes(String(actor_ohr))) {
      return res.status(403).json({ error: "Admin-only operation" });
    }
    if (!Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({ error: "At least one date is required" });
    }
    if (!Array.isArray(selected_ohrs) || selected_ohrs.length === 0) {
      return res.status(400).json({ error: "At least one employee must be selected" });
    }

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    // Fetch employee details for selected OHRs
    const employees = await db.select({
      ohr_id: ioEmployees.ohr_id,
      full_name: ioEmployees.full_name,
      actual_role: ioEmployees.actual_role,
      planning_group: ioEmployees.planning_group,
      supervisor_name: ioEmployees.supervisor_name,
      shift_time: ioEmployees.shift_time,
      employement_status: ioEmployees.employement_status,
      billing_name: ioEmployees.billing_name,
    }).from(ioEmployees)
      .where(inArray(ioEmployees.ohr_id, selected_ohrs));

    // Check for existing attendance rows to skip true duplicates
    const existingRows = await db.select({
      ohr_id: ioAttendance.ohr_id,
      log_date: ioAttendance.log_date,
    }).from(ioAttendance)
      .where(inArray(ioAttendance.log_date, dates.map(d => d.slice(0, 10))));

    const existingSet = new Set(
      existingRows.map(r => `${r.ohr_id}||${String(r.log_date || '').slice(0, 10)}`)
    );

    // Generate batch_id for tracking/undo
    const batchId = `BULK-${Date.now().toString(36).toUpperCase()}`;
    const now = new Date().toISOString();
    const rows: any[] = [];
    let skipped = 0;

    for (const emp of employees) {
      for (const date of dates) {
        const dateStr = date.slice(0, 10);
        const key = `${emp.ohr_id}||${dateStr}`;
        if (existingSet.has(key)) {
          skipped++;
          continue;
        }
        // ID format: YYYYMMDD + ohr_id (matches existing pattern)
        const id = dateStr.replace(/-/g, '') + emp.ohr_id;
        rows.push({
          id,
          ohr_id: emp.ohr_id,
          log_date: dateStr,
          tag: null,
          created_at: now,
          snap_full_name: emp.full_name || '',
          snap_supervisor: emp.supervisor_name || '',
          snap_planning_group: emp.planning_group || '',
          snap_shift_time: emp.shift_time || '',
          snap_actual_role: emp.actual_role || '',
          snap_billing_name: emp.billing_name || '',
          snap_status: emp.employement_status || '',
          internal_role: emp.actual_role || '',
          internal_planning_group: emp.planning_group || '',
          batch_id: batchId,
        });
      }
    }

    // Insert in batches of 100
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      await db.insert(ioAttendance).values(batch);
      inserted += batch.length;
    }

    // Audit log
    await db.insert(ioAuditLog).values({
      record_type: "attendance_bulk_insert",
      record_id: batchId,
      action: "bulk_insert",
      field_name: "attendance_rows",
      old_value: null,
      new_value: `${inserted} rows inserted, ${skipped} duplicates skipped`,
      actor_ohr: String(actor_ohr),
      actor_name: "Admin",
    });

    console.log(`[IO API] BULK INSERT: ${inserted} attendance rows inserted, ${skipped} duplicates skipped, batch: ${batchId} (actor: ${actor_ohr})`);
    res.json({ success: true, inserted, skipped, batch_id: batchId });
  } catch (err: any) {
    console.error("[IO API] attendance-bulk-insert error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Undo last bulk insert batch (deletes from io_attendance)
router.post("/attendance-bulk-undo", async (req: Request, res: Response) => {
  try {
    const { actor_ohr, batch_id } = req.body;
    if (!actor_ohr || !ADMIN_OHRS.includes(String(actor_ohr))) {
      return res.status(403).json({ error: "Admin-only operation" });
    }
    if (!batch_id) {
      return res.status(400).json({ error: "batch_id is required" });
    }

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    // Count rows in this batch
    const [countResult] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(ioAttendance)
      .where(eq(ioAttendance.batch_id, batch_id));
    const rowCount = Number(countResult?.count || 0);

    if (rowCount === 0) {
      return res.status(404).json({ error: "No rows found for this batch" });
    }

    // Delete all rows with this batch_id
    await db.delete(ioAttendance).where(eq(ioAttendance.batch_id, batch_id));

    // Audit log
    await db.insert(ioAuditLog).values({
      record_type: "attendance_bulk_undo",
      record_id: batch_id,
      action: "bulk_undo",
      field_name: "attendance_rows",
      old_value: `${rowCount} rows`,
      new_value: "deleted",
      actor_ohr: String(actor_ohr),
      actor_name: "Admin",
    });

    console.log(`[IO API] BULK UNDO: ${rowCount} attendance rows deleted for batch ${batch_id} (actor: ${actor_ohr})`);
    res.json({ success: true, deleted: rowCount, batch_id });
  } catch (err: any) {
    console.error("[IO API] attendance-bulk-undo error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get last attendance bulk insert batch info (for undo button)
router.get("/attendance-last-batch", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    // Find the most recent batch_id in io_attendance
    const [lastBatch] = await db.select({
      batch_id: ioAttendance.batch_id,
      count: sql<number>`COUNT(*)`,
      min_date: sql<string>`MIN(${ioAttendance.log_date})`,
      max_date: sql<string>`MAX(${ioAttendance.log_date})`,
    })
      .from(ioAttendance)
      .where(sql`${ioAttendance.batch_id} IS NOT NULL AND ${ioAttendance.batch_id} != ''`)
      .groupBy(ioAttendance.batch_id)
      .orderBy(sql`MAX(${ioAttendance.created_at}) DESC`)
      .limit(1);

    if (!lastBatch || !lastBatch.batch_id) {
      return res.json({ has_batch: false });
    }

    res.json({
      has_batch: true,
      batch_id: lastBatch.batch_id,
      row_count: Number(lastBatch.count),
      date_range: `${lastBatch.min_date?.slice(0, 10) || ''} to ${lastBatch.max_date?.slice(0, 10) || ''}`,
    });
  } catch (err: any) {
    console.error("[IO API] attendance-last-batch error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
