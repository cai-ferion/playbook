/**
 * Attendance Domain Module
 * Extracted from io-routes.ts — handles GET, bulk-import, bulk-update, PATCH, bulk-tag, bulk-tag-filtered, bulk-status, bulk-status-filtered
 */
import { Router, Request, Response } from "express";
import { getDb } from "../db.js";
import { notifyOwner } from "../_core/notification.js";
import { ioAttendance, ioAuditLog, ioEmployees } from "../../drizzle/schema.js";
import { eq, and, gte, lte, sql, desc, asc, inArray, or } from "drizzle-orm";
import { ADMIN_OHRS } from "../config.js";
import { getManagerOhrSet, buildFlmCondition } from "./shared.js";
import { validate, attendanceBulkImportSchema, attendanceBulkTagSchema } from "./validation.js";
import { emitChange } from "./emit-change.js";
import { optimisticUpdate, sendConflict, getClientVersion } from "./optimistic-lock.js";

const router = Router();

// GET /api/io/attendance - list attendance with filters
router.get("/attendance", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { limit, offset, log_date_gte, log_date_lte, log_date, ohr_id, tag, tag_in, count_only,
            attendance_date_gte, attendance_date_lte, date_gte, date_lte,
            agent_in, flm_in, planning_group_in,
            status_in, shift_time_in, role_in, wfm_tag_in, blanks_only,
            sort_by, sort_dir, paginated, exclude_managers, slim } = req.query;

    const conditions: any[] = [];
    if (exclude_managers === 'true') {
      const mgrSet = await getManagerOhrSet();
      if (mgrSet.size > 0) {
        const mgrArr = Array.from(mgrSet);
        conditions.push(sql`${ioAttendance.ohr_id} NOT IN (${sql.join(mgrArr.map(o => sql`${o}`), sql`, `)})`);
      }
    }
    if (ohr_id) conditions.push(eq(ioAttendance.ohr_id, String(ohr_id)));
    if (log_date) conditions.push(eq(ioAttendance.log_date, String(log_date)));
    const gteDate = log_date_gte || attendance_date_gte || date_gte;
    const lteDate = log_date_lte || attendance_date_lte || date_lte;
    if (gteDate) conditions.push(gte(ioAttendance.log_date, String(gteDate)));
    if (lteDate) conditions.push(lte(ioAttendance.log_date, String(lteDate)));
    if (tag) {
      const tagList = String(tag).split(",");
      if (tagList.length > 1) conditions.push(inArray(ioAttendance.tag, tagList));
      else conditions.push(eq(ioAttendance.tag, String(tag)));
    }
    if (tag_in) {
      const tags = String(tag_in).split("|");
      conditions.push(inArray(ioAttendance.tag, tags));
    }
    if (agent_in) conditions.push(inArray(ioAttendance.snap_full_name, String(agent_in).split("|")));
    if (flm_in) conditions.push(await buildFlmCondition(db, String(flm_in).split("|"), gteDate ? String(gteDate) : undefined));
    if (planning_group_in) conditions.push(inArray(ioAttendance.snap_planning_group, String(planning_group_in).split("|")));
    if (status_in) conditions.push(inArray(ioAttendance.snap_status, String(status_in).split("|")));
    if (shift_time_in) conditions.push(inArray(ioAttendance.snap_shift_time, String(shift_time_in).split("|")));
    if (role_in) conditions.push(inArray(ioAttendance.snap_actual_role, String(role_in).split("|")));
    if (wfm_tag_in) conditions.push(inArray(ioAttendance.wfm_tag, String(wfm_tag_in).split("|")));
    if (blanks_only === "true") {
      conditions.push(or(
        sql`${ioAttendance.tag} IS NULL`,
        eq(ioAttendance.tag, ""),
        eq(ioAttendance.tag, "\u2014")
      ));
    }

    // Count-only mode for progress bar
    if (count_only === "true") {
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const result = await db.select({ count: sql<number>`COUNT(*)` }).from(ioAttendance).where(where);
      return res.json({ count: Number(result[0]?.count || 0) });
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Server-side paginated mode: returns { rows, total }
    if (paginated === "true") {
      const countResult = await db.select({ count: sql<number>`COUNT(*)` }).from(ioAttendance).where(where);
      const total = Number(countResult[0]?.count || 0);

      const sortColMap: Record<string, any> = {
        date: ioAttendance.log_date, log_date: ioAttendance.log_date,
        agent: ioAttendance.snap_full_name, flm: ioAttendance.snap_supervisor,
        tag: ioAttendance.tag,
        actualPlanningGroup: ioAttendance.snap_planning_group,
        shiftTime: ioAttendance.snap_shift_time, role: ioAttendance.snap_actual_role,
        status: ioAttendance.snap_status,
      };
      const col = sortColMap[String(sort_by || 'log_date')] || ioAttendance.log_date;
      const dir = String(sort_dir || 'asc').toLowerCase() === 'desc' ? desc : asc;

      const slimSelect = slim === "true" ? {
        id: ioAttendance.id,
        ohr_id: ioAttendance.ohr_id,
        log_date: ioAttendance.log_date,
        tag: ioAttendance.tag,
        upl_reason: ioAttendance.upl_reason,
        remarks: ioAttendance.remarks,
        ot_hours: ioAttendance.ot_hours,
        snap_full_name: ioAttendance.snap_full_name,
        snap_supervisor: ioAttendance.snap_supervisor,
        snap_planning_group: ioAttendance.snap_planning_group,
        snap_shift_time: ioAttendance.snap_shift_time,
        snap_actual_role: ioAttendance.snap_actual_role,
        snap_status: ioAttendance.snap_status,
        is_locked: ioAttendance.is_locked,
        role: ioAttendance.role,
        planning_group: ioAttendance.planning_group,
        internal_role: ioAttendance.internal_role,
        internal_planning_group: ioAttendance.internal_planning_group,
        wfm_tag: ioAttendance.wfm_tag,
      } : undefined;

      let q = slimSelect
        ? db.select(slimSelect).from(ioAttendance)
        : db.select().from(ioAttendance);
      if (where) q = q.where(where) as any;
      const rows = await (q as any)
        .orderBy(dir(col), asc(ioAttendance.ohr_id))
        .limit(Number(limit) || 50)
        .offset(Number(offset) || 0);

      return res.json({ rows, total });
    }

    // Legacy flat-array mode
    let query = db.select().from(ioAttendance);
    const q = where ? query.where(where) : query;
    const ordered = q.orderBy(asc(ioAttendance.log_date), asc(ioAttendance.ohr_id));
    const limited = limit ? ordered.limit(Number(limit)) : ordered.limit(1000);
    const offsetQ = offset ? limited.offset(Number(offset)) : limited;

    const rows = await offsetQ;
    res.json(rows);
  } catch (err: any) {
    console.error("[IO API] attendance GET error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/attendance/bulk-import - bulk create/update attendance records (admin only)
router.post("/attendance/bulk-import", validate(attendanceBulkImportSchema), async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const actorOhr = req.headers["x-actor-ohr"] as string || "";
    if (!ADMIN_OHRS.includes(actorOhr)) {
      return res.status(403).json({ error: "Admin only" });
    }

    const { updates, creates } = req.body;
    let updatedCount = 0;
    let createdCount = 0;
    const errors: string[] = [];
    const now = new Date().toISOString();

    if (updates && Array.isArray(updates)) {
      for (const u of updates) {
        try {
          const setObj: any = {};
          if (u.tag !== undefined) setObj.tag = u.tag;
          if (u.is_locked !== undefined) setObj.is_locked = u.is_locked;
          if (u.locked_at !== undefined) setObj.locked_at = u.locked_at;
          await db.update(ioAttendance).set(setObj).where(eq(ioAttendance.id, u.id));
          updatedCount++;
        } catch (e: any) {
          errors.push(`update ${u.id}: ${e.message}`);
        }
      }
    }

    if (creates && Array.isArray(creates)) {
      for (const c of creates) {
        try {
          await db.insert(ioAttendance).values(c);
          createdCount++;
        } catch (e: any) {
          errors.push(`create ${c.ohr_id}_${c.log_date}: ${e.message}`);
        }
      }
    }

    emitChange(req, "attendance", "bulk_update", { updatedCount, createdCount });
    res.json({ ok: true, updatedCount, createdCount, errors: errors.slice(0, 20), totalErrors: errors.length });
  } catch (err: any) {
    console.error("[IO API] attendance bulk-import error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/io/attendance/bulk-update - update multiple attendance records matching filters
router.patch("/attendance/bulk-update", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { ohr_id, log_date_gte, log_date_lte } = req.query;
    const updates = req.body;

    const conditions: any[] = [];
    if (ohr_id) conditions.push(eq(ioAttendance.ohr_id, String(ohr_id)));
    if (log_date_gte) conditions.push(gte(ioAttendance.log_date, String(log_date_gte)));
    if (log_date_lte) conditions.push(lte(ioAttendance.log_date, String(log_date_lte)));

    if (conditions.length === 0) {
      return res.status(400).json({ error: "At least one filter is required for bulk update" });
    }

    await db.update(ioAttendance).set(updates).where(and(...conditions));
    emitChange(req, "attendance", "bulk_update", { ohr_id, log_date_gte, log_date_lte });
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[IO API] attendance bulk-update error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/io/attendance/:id - update an attendance record (with audit logging + lock check)
router.patch("/attendance/:id", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const recordId = req.params.id;
    const updates = req.body;
    const actorOhr = req.headers["x-actor-ohr"] as string || "";
    const actorName = req.headers["x-actor-name"] as string || "";

    // Fetch current record for audit comparison
    const [current] = await db.select().from(ioAttendance).where(eq(ioAttendance.id, recordId)).limit(1);
    if (!current) return res.status(404).json({ error: "Record not found" });

    // Date-based lock enforcement: yesterday and earlier locked after 11 AM PHT (except admin)
    if (!ADMIN_OHRS.includes(actorOhr)) {
      const now = new Date();
      const phtTime = new Date(now.getTime() + 8 * 60 * 60000);
      const phtHour = phtTime.getUTCHours();
      const todayPHT = phtTime.toISOString().slice(0, 10);
      const yesterdayD = new Date(phtTime);
      yesterdayD.setUTCDate(yesterdayD.getUTCDate() - 1);
      const yesterdayPHT = yesterdayD.toISOString().slice(0, 10);
      const recordDate = current.log_date || '';

      // Check if this is an OT-only edit within the current operational week
      const isOtOnlyEdit = Object.keys(updates).length === 1 && updates.ot_hours !== undefined;
      const phtDay = phtTime.getUTCDay();
      const daysToFri = (5 - phtDay + 7) % 7;
      const weFri = new Date(phtTime);
      weFri.setUTCDate(weFri.getUTCDate() + daysToFri);
      const weStart = new Date(weFri);
      weStart.setUTCDate(weStart.getUTCDate() - 6);
      const weStartStr = weStart.toISOString().slice(0, 10);
      const weEndStr = weFri.toISOString().slice(0, 10);
      const inCurrentWeek = recordDate >= weStartStr && recordDate <= weEndStr;

      const bypassDateLock = isOtOnlyEdit && inCurrentWeek;

      if (!bypassDateLock) {
        if (recordDate < yesterdayPHT) {
          return res.status(403).json({ error: "Date-based lock: past dates locked for editing" });
        }
        if (recordDate === yesterdayPHT && phtHour >= 11) {
          return res.status(403).json({ error: "Date-based lock: previous day locked after 11 AM PHT" });
        }
      }
    }

    // Build audit entries for each changed field
    const now = new Date().toISOString();
    const fieldMap: Record<string, string> = {
      tag: "tag", upl_reason: "upl_reason", remarks: "remarks",
      ot_hours: "ot_hours",
      role: "role", planning_group: "planning_group",
      snap_status: "snap_status",
      snap_supervisor: "snap_supervisor", snap_shift_time: "snap_shift_time"
    };

    const auditEntries: any[] = [];
    for (const [field, dbCol] of Object.entries(fieldMap)) {
      if (updates[field] !== undefined || updates[dbCol] !== undefined) {
        const newVal = updates[field] ?? updates[dbCol] ?? "";
        const oldVal = (current as any)[dbCol] || "";
        if (String(newVal) !== String(oldVal)) {
          auditEntries.push({
            record_type: "attendance",
            record_id: recordId,
            action: "edit",
            field_name: dbCol,
            old_value: String(oldVal),
            new_value: String(newVal),
            actor_ohr: actorOhr,
            actor_name: actorName,
            timestamp: now,
          });
        }
      }
    }
    // Audit lock/unlock events
    if (updates.is_locked !== undefined) {
      const oldLocked = current.is_locked ? "true" : "false";
      const newLocked = updates.is_locked ? "true" : "false";
      if (oldLocked !== newLocked) {
        auditEntries.push({
          record_type: "attendance",
          record_id: recordId,
          action: updates.is_locked ? "lock" : "unlock",
          field_name: "is_locked",
          old_value: oldLocked,
          new_value: newLocked,
          actor_ohr: actorOhr,
          actor_name: actorName,
          timestamp: now,
        });
      }
    }

     // Apply update (with optimistic locking if client sends version)
    const clientVersion = getClientVersion(req.body);
    if (clientVersion !== null) {
      // Remove version from updates to avoid double-set
      const { version: _v, ...updateFields } = updates;
      const lockResult = await optimisticUpdate(db, ioAttendance, ioAttendance.id, recordId, clientVersion, updateFields);
      if (!lockResult.ok) {
        if (lockResult.reason === "not_found") return res.status(404).json({ error: "Record not found" });
        return sendConflict(res, clientVersion, lockResult.serverState);
      }
    } else {
      await db.update(ioAttendance).set(updates).where(eq(ioAttendance.id, recordId));
    }
    // Insert audit log entries
    if (auditEntries.length > 0) {
      for (const entry of auditEntries) {
        await db.insert(ioAuditLog).values(entry);
      }
    }

    // Notify owner when status is changed (fire-and-forget)
    const statusAudit = auditEntries.find(e => e.field_name === "snap_status");
    if (statusAudit) {
      const empName = current.snap_full_name || current.ohr_id || recordId;
      const logDate = current.log_date || "unknown date";
      notifyOwner({
        title: `Status Change: ${empName}`,
        content: `${actorName || actorOhr} changed status of ${empName} (${logDate}) from "${statusAudit.old_value || '—'}" to "${statusAudit.new_value}".`,
      }).catch(err => console.warn("[StatusNotify] Failed:", err.message));
    }

    emitChange(req, "attendance", "record_updated", { id: Number(req.params.id) });
    res.json({ ok: true, audited: auditEntries.length });
  } catch (err: any) {
    console.error("[IO API] attendance PATCH error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/attendance/bulk-tag - bulk tag multiple records with audit logging
router.post("/attendance/bulk-tag", validate(attendanceBulkTagSchema), async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { ids, tag, actor_ohr, actor_name } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids array is required" });
    }
    if (tag === undefined || tag === null) return res.status(400).json({ error: "tag is required" });

    const now = new Date().toISOString();
    let updated = 0;
    let locked = 0;

    for (const id of ids) {
      const [record] = await db.select().from(ioAttendance).where(eq(ioAttendance.id, id)).limit(1);
      if (!record) continue;

      // Date-based lock (except admin)
      if (!ADMIN_OHRS.includes(actor_ohr)) {
        const nowD = new Date();
        const phtD = new Date(nowD.getTime() + 8 * 60 * 60000);
        const phtHourD = phtD.getUTCHours();
        const yesterdayBulk = new Date(phtD);
        yesterdayBulk.setUTCDate(yesterdayBulk.getUTCDate() - 1);
        const yesterdayStr = yesterdayBulk.toISOString().slice(0, 10);
        const recDate = record.log_date || '';
        if (recDate < yesterdayStr) { locked++; continue; }
        if (recDate === yesterdayStr && phtHourD >= 11) { locked++; continue; }
      }

      const oldTag = record.tag || "";
      if (oldTag === tag) continue;

      await db.update(ioAttendance).set({ tag }).where(eq(ioAttendance.id, id));

      await db.insert(ioAuditLog).values({
        record_type: "attendance",
        record_id: id,
        action: "bulk_tag",
        field_name: "tag",
        old_value: oldTag,
        new_value: tag,
        actor_ohr: actor_ohr || "",
        actor_name: actor_name || "",
        timestamp: now,
      });
      updated++;
    }

    emitChange(req, "attendance", "bulk_update", { tag, count: updated });
    res.json({ ok: true, updated, locked, total: ids.length });
  } catch (err: any) {
    console.error("[IO API] attendance bulk-tag error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/attendance/bulk-tag-filtered - bulk tag ALL records matching current filters
router.post("/attendance/bulk-tag-filtered", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { tag, actor_ohr, actor_name, filters } = req.body;
    if (tag === undefined || tag === null) return res.status(400).json({ error: "tag is required" });
    if (!filters) return res.status(400).json({ error: "filters object is required" });

    const { log_date_gte, log_date_lte, tag_in, agent_in, flm_in,
            planning_group_in, status_in, shift_time_in, role_in, wfm_tag_in, blanks_only } = filters;

    const conditions: any[] = [];
    const mgrSet2 = await getManagerOhrSet();
    if (mgrSet2.size > 0) {
      const mgrArr2 = Array.from(mgrSet2);
      conditions.push(sql`${ioAttendance.ohr_id} NOT IN (${sql.join(mgrArr2.map(o => sql`${o}`), sql`, `)})`);
    }
    if (log_date_gte) conditions.push(gte(ioAttendance.log_date, String(log_date_gte)));
    if (log_date_lte) conditions.push(lte(ioAttendance.log_date, String(log_date_lte)));
    if (tag_in) conditions.push(inArray(ioAttendance.tag, String(tag_in).split("|")));
    if (agent_in) conditions.push(inArray(ioAttendance.snap_full_name, String(agent_in).split("|")));
    if (flm_in) conditions.push(await buildFlmCondition(db, String(flm_in).split("|"), log_date_gte ? String(log_date_gte) : undefined));
    if (planning_group_in) conditions.push(inArray(ioAttendance.snap_planning_group, String(planning_group_in).split("|")));
    if (status_in) conditions.push(inArray(ioAttendance.snap_status, String(status_in).split("|")));
    if (shift_time_in) conditions.push(inArray(ioAttendance.snap_shift_time, String(shift_time_in).split("|")));
    if (role_in) conditions.push(inArray(ioAttendance.snap_actual_role, String(role_in).split("|")));
    if (wfm_tag_in) conditions.push(inArray(ioAttendance.wfm_tag, String(wfm_tag_in).split("|")));
    if (blanks_only) {
      conditions.push(or(
        sql`${ioAttendance.tag} IS NULL`,
        eq(ioAttendance.tag, ""),
        eq(ioAttendance.tag, "\u2014")
      ));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    let q = db.select({
      id: ioAttendance.id,
      tag: ioAttendance.tag,
      log_date: ioAttendance.log_date,
    }).from(ioAttendance);
    if (where) q = q.where(where) as any;
    const allRecords = await q;

    const now = new Date().toISOString();
    let updated = 0;
    let locked = 0;
    let skipped = 0;

    for (const record of allRecords) {
      if (!ADMIN_OHRS.includes(actor_ohr)) {
        const nowD = new Date();
        const phtD = new Date(nowD.getTime() + 8 * 60 * 60000);
        const phtHourD = phtD.getUTCHours();
        const yesterdayBulk = new Date(phtD);
        yesterdayBulk.setUTCDate(yesterdayBulk.getUTCDate() - 1);
        const yesterdayStr = yesterdayBulk.toISOString().slice(0, 10);
        const recDate = record.log_date || '';
        if (recDate < yesterdayStr) { locked++; continue; }
        if (recDate === yesterdayStr && phtHourD >= 11) { locked++; continue; }
      }

      const oldTag = record.tag || "";
      if (oldTag === tag) { skipped++; continue; }

      await db.update(ioAttendance).set({ tag }).where(eq(ioAttendance.id, record.id));

      await db.insert(ioAuditLog).values({
        record_type: "attendance",
        record_id: record.id,
        action: "bulk_tag_filtered",
        field_name: "tag",
        old_value: oldTag,
        new_value: tag,
        actor_ohr: actor_ohr || "",
        actor_name: actor_name || "",
        timestamp: now,
      });
      updated++;
    }

    emitChange(req, "attendance", "bulk_update", { tag, count: updated });
    res.json({ ok: true, updated, locked, skipped, total: allRecords.length });
  } catch (err: any) {
    console.error("[IO API] attendance bulk-tag-filtered error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/attendance/bulk-status - bulk update status for selected record IDs (Managers/Admins only)
router.post("/attendance/bulk-status", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { ids, status, actor_ohr, actor_name } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids array is required" });
    }
    if (!status) return res.status(400).json({ error: "status is required" });

    // Role gate: Managers and Admins only
    if (!ADMIN_OHRS.includes(actor_ohr)) {
      const [actor] = await db.select({ role: ioEmployees.actual_role })
        .from(ioEmployees).where(eq(ioEmployees.ohr_id, actor_ohr)).limit(1);
      if (!actor || actor.role !== "Manager") {
        return res.status(403).json({ error: "Only Managers and Admins can bulk-update status" });
      }
    }

    const now = new Date().toISOString();
    let updated = 0;
    let locked = 0;
    let skipped = 0;
    const changedNames: string[] = [];

    for (const id of ids) {
      const [record] = await db.select().from(ioAttendance).where(eq(ioAttendance.id, id)).limit(1);
      if (!record) continue;

      // Date-based lock (except admin)
      if (!ADMIN_OHRS.includes(actor_ohr)) {
        const nowD = new Date();
        const phtD = new Date(nowD.getTime() + 8 * 60 * 60000);
        const phtHourD = phtD.getUTCHours();
        const yesterdayBulk = new Date(phtD);
        yesterdayBulk.setUTCDate(yesterdayBulk.getUTCDate() - 1);
        const yesterdayStr = yesterdayBulk.toISOString().slice(0, 10);
        const recDate = record.log_date || '';
        if (recDate < yesterdayStr) { locked++; continue; }
        if (recDate === yesterdayStr && phtHourD >= 11) { locked++; continue; }
      }

      const oldStatus = record.snap_status || "";
      if (oldStatus === status) { skipped++; continue; }

      await db.update(ioAttendance).set({ snap_status: status }).where(eq(ioAttendance.id, id));

      await db.insert(ioAuditLog).values({
        record_type: "attendance",
        record_id: id,
        action: "bulk_status",
        field_name: "snap_status",
        old_value: oldStatus,
        new_value: status,
        actor_ohr: actor_ohr || "",
        actor_name: actor_name || "",
        timestamp: now,
      });
      if (changedNames.length < 5) changedNames.push(record.snap_full_name || record.ohr_id || id);
      updated++;
    }

    if (updated > 0) {
      const preview = changedNames.join(", ") + (updated > 5 ? ` and ${updated - 5} more` : "");
      notifyOwner({
        title: `Bulk Status Change: ${updated} record(s) → ${status}`,
        content: `${actor_name || actor_ohr} changed ${updated} record(s) to "${status}". Affected: ${preview}.${locked > 0 ? ` ${locked} locked rows skipped.` : ""}`,
      }).catch(err => console.warn("[BulkStatusNotify] Failed:", err.message));
    }

    emitChange(req, "attendance", "bulk_update", { status, count: updated });
    res.json({ ok: true, updated, locked, skipped, total: ids.length });
  } catch (err: any) {
    console.error("[IO API] attendance bulk-status error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/attendance/bulk-status-filtered - bulk update status for ALL records matching filters (Managers/Admins only)
router.post("/attendance/bulk-status-filtered", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { status, actor_ohr, actor_name, filters } = req.body;
    if (!status) return res.status(400).json({ error: "status is required" });
    if (!filters) return res.status(400).json({ error: "filters object is required" });

    // Role gate: Managers and Admins only
    if (!ADMIN_OHRS.includes(actor_ohr)) {
      const [actor] = await db.select({ role: ioEmployees.actual_role })
        .from(ioEmployees).where(eq(ioEmployees.ohr_id, actor_ohr)).limit(1);
      if (!actor || actor.role !== "Manager") {
        return res.status(403).json({ error: "Only Managers and Admins can bulk-update status" });
      }
    }

    const { log_date_gte, log_date_lte, tag_in, agent_in, flm_in,
            planning_group_in, status_in, shift_time_in, role_in, wfm_tag_in, blanks_only } = filters;

    const conditions: any[] = [];
    const mgrSet3 = await getManagerOhrSet();
    if (mgrSet3.size > 0) {
      const mgrArr3 = Array.from(mgrSet3);
      conditions.push(sql`${ioAttendance.ohr_id} NOT IN (${sql.join(mgrArr3.map(o => sql`${o}`), sql`, `)})`);
    }
    if (log_date_gte) conditions.push(gte(ioAttendance.log_date, String(log_date_gte)));
    if (log_date_lte) conditions.push(lte(ioAttendance.log_date, String(log_date_lte)));
    if (tag_in) conditions.push(inArray(ioAttendance.tag, String(tag_in).split("|")));
    if (agent_in) conditions.push(inArray(ioAttendance.snap_full_name, String(agent_in).split("|")));
    if (flm_in) conditions.push(await buildFlmCondition(db, String(flm_in).split("|"), log_date_gte ? String(log_date_gte) : undefined));
    if (planning_group_in) conditions.push(inArray(ioAttendance.snap_planning_group, String(planning_group_in).split("|")));
    if (status_in) conditions.push(inArray(ioAttendance.snap_status, String(status_in).split("|")));
    if (shift_time_in) conditions.push(inArray(ioAttendance.snap_shift_time, String(shift_time_in).split("|")));
    if (role_in) conditions.push(inArray(ioAttendance.snap_actual_role, String(role_in).split("|")));
    if (wfm_tag_in) conditions.push(inArray(ioAttendance.wfm_tag, String(wfm_tag_in).split("|")));
    if (blanks_only) {
      conditions.push(or(
        sql`${ioAttendance.tag} IS NULL`,
        eq(ioAttendance.tag, ""),
        eq(ioAttendance.tag, "\u2014")
      ));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    let q = db.select({
      id: ioAttendance.id,
      snap_status: ioAttendance.snap_status,
      snap_full_name: ioAttendance.snap_full_name,
      ohr_id: ioAttendance.ohr_id,
      log_date: ioAttendance.log_date,
    }).from(ioAttendance);
    if (where) q = q.where(where) as any;
    const allRecords = await q;

    const now = new Date().toISOString();
    let updated = 0;
    let locked = 0;
    let skipped = 0;
    const changedNames: string[] = [];

    for (const record of allRecords) {
      if (!ADMIN_OHRS.includes(actor_ohr)) {
        const nowD = new Date();
        const phtD = new Date(nowD.getTime() + 8 * 60 * 60000);
        const phtHourD = phtD.getUTCHours();
        const yesterdayBulk = new Date(phtD);
        yesterdayBulk.setUTCDate(yesterdayBulk.getUTCDate() - 1);
        const yesterdayStr = yesterdayBulk.toISOString().slice(0, 10);
        const recDate = record.log_date || '';
        if (recDate < yesterdayStr) { locked++; continue; }
        if (recDate === yesterdayStr && phtHourD >= 11) { locked++; continue; }
      }

      const oldStatus = record.snap_status || "";
      if (oldStatus === status) { skipped++; continue; }

      await db.update(ioAttendance).set({ snap_status: status }).where(eq(ioAttendance.id, record.id));

      await db.insert(ioAuditLog).values({
        record_type: "attendance",
        record_id: record.id,
        action: "bulk_status_filtered",
        field_name: "snap_status",
        old_value: oldStatus,
        new_value: status,
        actor_ohr: actor_ohr || "",
        actor_name: actor_name || "",
        timestamp: now,
      });
      if (changedNames.length < 5) changedNames.push(record.snap_full_name || record.ohr_id || record.id);
      updated++;
    }

    if (updated > 0) {
      const preview = changedNames.join(", ") + (updated > 5 ? ` and ${updated - 5} more` : "");
      notifyOwner({
        title: `Bulk Status Change: ${updated} record(s) → ${status}`,
        content: `${actor_name || actor_ohr} changed ${updated} record(s) to "${status}" (filtered). Affected: ${preview}.${locked > 0 ? ` ${locked} locked rows skipped.` : ""}`,
      }).catch(err => console.warn("[BulkStatusFilteredNotify] Failed:", err.message));
    }

    emitChange(req, "attendance", "bulk_update", { status, count: updated });
    res.json({ ok: true, updated, locked, skipped, total: allRecords.length });
  } catch (err: any) {
    console.error("[IO API] attendance bulk-status-filtered error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/io/attendance/bulk-field-filtered - bulk update any editable field for ALL records matching filters (Managers/Admins only)
router.post("/attendance/bulk-field-filtered", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });
    const { field, value, actor_ohr, actor_name, filters } = req.body;
    // Validate field is in the allowed set
    const ALLOWED_FIELDS: Record<string, any> = {
      snap_supervisor: ioAttendance.snap_supervisor,
      role: ioAttendance.snap_actual_role,
      planning_group: ioAttendance.snap_planning_group,
      snap_shift_time: ioAttendance.snap_shift_time,
      snap_status: ioAttendance.snap_status,
      internal_role: ioAttendance.internal_role,
      internal_planning_group: ioAttendance.internal_planning_group,
    };
    if (!field || !ALLOWED_FIELDS[field]) {
      return res.status(400).json({ error: `Invalid field. Allowed: ${Object.keys(ALLOWED_FIELDS).join(", ")}` });
    }
    if (value === undefined) return res.status(400).json({ error: "value is required (can be empty string)" });
    if (!filters) return res.status(400).json({ error: "filters object is required" });
    // Role gate: Managers and Admins only
    if (!ADMIN_OHRS.includes(actor_ohr)) {
      const [actor] = await db.select({ role: ioEmployees.actual_role })
        .from(ioEmployees).where(eq(ioEmployees.ohr_id, actor_ohr)).limit(1);
      if (!actor || actor.role !== "Manager") {
        return res.status(403).json({ error: "Only Managers and Admins can bulk-edit fields" });
      }
    }
    const { log_date_gte, log_date_lte, tag_in, agent_in, flm_in,
            planning_group_in, status_in, shift_time_in, role_in, wfm_tag_in, blanks_only } = filters;
    const conditions: any[] = [];
    // Exclude managers from attendance
    const mgrSet = await getManagerOhrSet();
    if (mgrSet.size > 0) {
      const mgrArr = Array.from(mgrSet);
      conditions.push(sql`${ioAttendance.ohr_id} NOT IN (${sql.join(mgrArr.map(o => sql`${o}`), sql`, `)})`);
    }
    if (log_date_gte) conditions.push(gte(ioAttendance.log_date, String(log_date_gte)));
    if (log_date_lte) conditions.push(lte(ioAttendance.log_date, String(log_date_lte)));
    if (tag_in) conditions.push(inArray(ioAttendance.tag, String(tag_in).split("|")));
    if (agent_in) conditions.push(inArray(ioAttendance.snap_full_name, String(agent_in).split("|")));
    if (flm_in) conditions.push(await buildFlmCondition(db, String(flm_in).split("|"), log_date_gte ? String(log_date_gte) : undefined));
    if (planning_group_in) conditions.push(inArray(ioAttendance.snap_planning_group, String(planning_group_in).split("|")));
    if (status_in) conditions.push(inArray(ioAttendance.snap_status, String(status_in).split("|")));
    if (shift_time_in) conditions.push(inArray(ioAttendance.snap_shift_time, String(shift_time_in).split("|")));
    if (role_in) conditions.push(inArray(ioAttendance.snap_actual_role, String(role_in).split("|")));
    if (wfm_tag_in) conditions.push(inArray(ioAttendance.wfm_tag, String(wfm_tag_in).split("|")));
    if (blanks_only) conditions.push(sql`(${ioAttendance.tag} IS NULL OR ${ioAttendance.tag} = '')`);
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const now = new Date().toISOString();
    // Human-readable field label for audit
    const FIELD_LABELS: Record<string, string> = {
      snap_supervisor: "Supervisor", role: "Role", planning_group: "Planning Group",
      snap_shift_time: "Shift Time", snap_status: "Status", remarks: "Remarks",
      ot_hours: "OT Hours", tag: "Tag", upl_reason: "UPL Reason",
      internal_role: "Internal Role", internal_planning_group: "Internal PG",
    };
    // Add condition to skip records already at target value
    const colRef = ALLOWED_FIELDS[field];
    const skipCondition = value
      ? sql`${colRef} IS DISTINCT FROM ${value}`
      : sql`(${colRef} IS NOT NULL AND ${colRef} != '')`;
    const updateConditions = whereClause ? and(whereClause, skipCondition) : skipCondition;
    // Count total matching (for reporting skipped)
    const [{ count: totalCount }] = await db.select({ count: sql<number>`count(*)` })
      .from(ioAttendance).where(whereClause);
    // Single UPDATE statement — fast regardless of record count
    const updateResult = await db.update(ioAttendance)
      .set({ [field]: value || null })
      .where(updateConditions);
    // Postgres returns rowCount via the result
    const updated = Number((updateResult as any)?.rowCount ?? (updateResult as any)?.count ?? 0);
    const skipped = Number(totalCount) - updated;
    // Single summary audit log entry (not per-record — prevents timeout)
    if (updated > 0) {
      await db.insert(ioAuditLog).values({
        record_type: "attendance",
        record_id: `bulk_${Date.now()}`,
        action: "bulk_field_change",
        field_name: FIELD_LABELS[field] || field,
        old_value: `(${updated} records changed)`,
        new_value: value || "",
        actor_ohr: actor_ohr || "",
        actor_name: actor_name || "",
        timestamp: now,
      });
    }
    // Notify owner
    if (updated > 0) {
      notifyOwner({
        title: `Bulk Field Change: ${updated} record(s) \u2192 ${FIELD_LABELS[field] || field} = "${value}"`,
        content: `${actor_name || actor_ohr} changed ${FIELD_LABELS[field] || field} to "${value}" for ${updated} record(s) (filtered).${skipped > 0 ? ` ${skipped} already had this value.` : ""}`,
      }).catch(err => console.warn("[BulkFieldFilteredNotify] Failed:", err.message));
    }
    emitChange(req, "attendance", "bulk_update", { field, value, count: updated });
    res.json({ ok: true, updated, skipped, total: Number(totalCount) });
  } catch (err: any) {
    console.error("[IO API] attendance bulk-field-filtered error:", err?.message, err?.stack?.split('\n').slice(0,3).join('\n'));
    const msg = err?.message || 'Unknown error';
    // Return a descriptive error instead of generic 'Internal server error'
    res.status(500).json({ error: `Bulk update failed: ${msg}` });
  }
});

// Preview endpoint: returns affected records WITHOUT changing them
router.post("/attendance/bulk-field-preview", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database unavailable" });
    const { field, value, filters } = req.body;
    if (!field || !value) return res.status(400).json({ error: "field and value are required" });
    if (!filters) return res.status(400).json({ error: "filters object is required" });
    const ALLOWED_FIELDS: Record<string, any> = {
      snap_supervisor: ioAttendance.snap_supervisor,
      role: ioAttendance.snap_actual_role,
      planning_group: ioAttendance.snap_planning_group,
      snap_shift_time: ioAttendance.snap_shift_time,
      snap_status: ioAttendance.snap_status,
      internal_role: ioAttendance.internal_role,
      internal_planning_group: ioAttendance.internal_planning_group,
    };
    if (!ALLOWED_FIELDS[field]) return res.status(400).json({ error: "Invalid field" });
    const { log_date_gte, log_date_lte, tag_in, agent_in, flm_in,
            planning_group_in, status_in, shift_time_in, role_in, wfm_tag_in, blanks_only } = filters;
    const conditions: any[] = [];
    const mgrSet = await getManagerOhrSet();
    if (mgrSet.size > 0) {
      const mgrArr = Array.from(mgrSet);
      conditions.push(sql`${ioAttendance.ohr_id} NOT IN (${sql.join(mgrArr.map(o => sql`${o}`), sql`, `)})`);
    }
    if (log_date_gte) conditions.push(gte(ioAttendance.log_date, String(log_date_gte)));
    if (log_date_lte) conditions.push(lte(ioAttendance.log_date, String(log_date_lte)));
    if (tag_in) conditions.push(inArray(ioAttendance.tag, String(tag_in).split("|")));
    if (agent_in) conditions.push(inArray(ioAttendance.snap_full_name, String(agent_in).split("|")));
    if (flm_in) conditions.push(await buildFlmCondition(db, String(flm_in).split("|"), log_date_gte ? String(log_date_gte) : undefined));
    if (planning_group_in) conditions.push(inArray(ioAttendance.snap_planning_group, String(planning_group_in).split("|")));
    if (status_in) conditions.push(inArray(ioAttendance.snap_status, String(status_in).split("|")));
    if (shift_time_in) conditions.push(inArray(ioAttendance.snap_shift_time, String(shift_time_in).split("|")));
    if (role_in) conditions.push(inArray(ioAttendance.snap_actual_role, String(role_in).split("|")));
    if (wfm_tag_in) conditions.push(inArray(ioAttendance.wfm_tag, String(wfm_tag_in).split("|")));
    if (blanks_only) conditions.push(sql`(${ioAttendance.tag} IS NULL OR ${ioAttendance.tag} = '')`);
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const colRef = ALLOWED_FIELDS[field];
    // Only count records that would actually change
    const skipCondition = value
      ? sql`${colRef} IS DISTINCT FROM ${value}`
      : sql`(${colRef} IS NOT NULL AND ${colRef} != '')`;
    const changeConditions = whereClause ? and(whereClause, skipCondition) : skipCondition;
    // Get total matching filter
    const [{ count: totalMatching }] = await db.select({ count: sql<number>`count(*)` })
      .from(ioAttendance).where(whereClause);
    // Get count that would actually change
    const [{ count: wouldChange }] = await db.select({ count: sql<number>`count(*)` })
      .from(ioAttendance).where(changeConditions);
    // Get sample of distinct employees that would be affected (up to 20)
    const affectedSample = await db.selectDistinct({
      name: ioAttendance.snap_full_name,
      currentValue: sql<string>`${colRef}`,
    }).from(ioAttendance).where(changeConditions).limit(20);
    // Get distinct employee count
    const [{ count: distinctEmployees }] = await db.select({ count: sql<number>`count(distinct ${ioAttendance.snap_full_name})` })
      .from(ioAttendance).where(changeConditions);
    const alreadyHasValue = Number(totalMatching) - Number(wouldChange);
    res.json({
      ok: true,
      totalMatching: Number(totalMatching),
      wouldChange: Number(wouldChange),
      alreadyHasValue,
      distinctEmployees: Number(distinctEmployees),
      sample: affectedSample.map((r: any) => ({ name: r.name, currentValue: r.currentValue })),
      filtersApplied: {
        dateRange: log_date_gte || log_date_lte ? `${log_date_gte || '...'} to ${log_date_lte || '...'}` : null,
        agent: agent_in || null,
        role: role_in || null,
      },
    });
  } catch (err: any) {
    console.error("[IO API] attendance bulk-field-preview error:", err?.message);
    res.status(500).json({ error: `Preview failed: ${err?.message}` });
  }
});

export default router;
