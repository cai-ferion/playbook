/**
 * Auto-Notifier Module
 * Creates in-app notifications for UPL/LATE attendance tags.
 * 
 * Schedule: 2:30 AM and 11:30 AM Philippine Time (UTC+8) daily for UPL/LATE.
 */

import { Express } from "express";
import cron from "node-cron";
import { drizzle } from "drizzle-orm/mysql2";
import { eq, and, inArray, sql, gte, lte, asc, ne, isNotNull } from "drizzle-orm";
import { ioAttendance, ioEmployees, ioNotifications, ioOtRequests, ioLeaves, ioAuditLog, ioOtConfig, ioCoaching, ioCorrectiveActions, ioInsights } from "../drizzle/schema";

// Philippine Time is UTC+8
const PHT_OFFSET_HOURS = 8;
const ADMIN_OHR = "740045023";

function getTodayPHT(): string {
  const now = new Date();
  const pht = new Date(now.getTime() + PHT_OFFSET_HOURS * 60 * 60 * 1000);
  return pht.toISOString().slice(0, 10); // YYYY-MM-DD
}

function getNowPHT(): string {
  const now = new Date();
  const pht = new Date(now.getTime() + PHT_OFFSET_HOURS * 60 * 60 * 1000);
  return pht.toISOString().slice(0, 19).replace("T", " ");
}

function formatDateReadable(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  return d.toLocaleDateString("en-US", options);
}

// Helper to create a notification in the database
async function createNotification(
  db: ReturnType<typeof drizzle>,
  params: {
    type: string;
    title: string;
    message: string;
    actor_ohr?: string;
    actor_name?: string;
    target_role?: string;
    target_ohr?: string;
    metadata?: string;
  }
): Promise<void> {
  await db.insert(ioNotifications).values({
    type: params.type,
    title: params.title,
    message: params.message,
    actor_ohr: params.actor_ohr || null,
    actor_name: params.actor_name || "Playbook System",
    target_role: params.target_role || null,
    target_ohr: params.target_ohr || null,
    metadata: params.metadata || null,
    is_read: false,
    created_at: getNowPHT(),
  });
}


async function sendUplLateNotifications(db: ReturnType<typeof drizzle>): Promise<{ sent: number; errors: number }> {
  const today = getTodayPHT();
  console.log(`[AutoNotifier] Running UPL/LATE check for date: ${today}`);

  const records = await db
    .select({
      id: ioAttendance.id,
      ohr_id: ioAttendance.ohr_id,
      log_date: ioAttendance.log_date,
      tag: ioAttendance.tag,
      reason: ioAttendance.upl_reason,
      remarks: ioAttendance.remarks,
      snap_full_name: ioAttendance.snap_full_name,
    })
    .from(ioAttendance)
    .where(
      and(
        eq(ioAttendance.log_date, today),
        inArray(ioAttendance.tag, ["UPL", "LATE"])
      )
    );

  if (records.length === 0) {
    console.log(`[AutoNotifier] No UPL/LATE records found for ${today}.`);
    return { sent: 0, errors: 0 };
  }

  console.log(`[AutoNotifier] Found ${records.length} UPL/LATE records for ${today}.`);

  const ohrIds = Array.from(new Set(records.map((r) => r.ohr_id).filter((x): x is string => x !== null)));

  const employees = await db
    .select({
      ohr_id: ioEmployees.ohr_id,
      full_name: ioEmployees.full_name,
      supervisor_name: ioEmployees.supervisor_name,
    })
    .from(ioEmployees)
    .where(inArray(ioEmployees.ohr_id, ohrIds));

  const employeeMap = new Map<string, { ohr_id: string; full_name: string | null; supervisor_name: string | null }>();
  for (const emp of employees) {
    if (emp.ohr_id) employeeMap.set(emp.ohr_id, emp);
  }

  // Build supervisor name → OHR lookup for sending supervisor notifications
  const allEmployees = await db
    .select({ ohr_id: ioEmployees.ohr_id, full_name: ioEmployees.full_name })
    .from(ioEmployees);
  const nameToOhr = new Map<string, string>();
  for (const e of allEmployees) {
    if (e.full_name && e.ohr_id) nameToOhr.set(e.full_name, e.ohr_id);
  }

  let sent = 0;
  let errors = 0;

  for (const record of records) {
    try {
      const employee = record.ohr_id ? employeeMap.get(record.ohr_id) : null;
      const agentName = record.snap_full_name || employee?.full_name || "Team Member";
      const readableDate = formatDateReadable(record.log_date || today);
      const tagLabel = record.tag === "UPL" ? "Unplanned Leave (UPL)" : "Late Attendance (LATE)";
      const supervisorName = employee?.supervisor_name || "your supervisor";

      const notifType = record.tag === "UPL" ? "upl_notice" : "late_notice";
      const reason = record.reason || "Not specified";
      const remarks = record.remarks || "No additional remarks";
      const metaObj = {
        attendance_id: record.id,
        tag: record.tag,
        date: record.log_date,
        agentName,
        reason,
        remarks,
      };

      // 1) In-app notification for the tagged employee (sent first)
      await createNotification(db, {
        type: notifType,
        title: `${record.tag} Notice — ${readableDate}`,
        message: `You have been tagged as ${tagLabel} for ${readableDate}.\n\nReason: ${reason}\nRemarks: ${remarks}\n\nPlease coordinate with your supervisor, ${supervisorName}, regarding this attendance record. If you believe this tag was applied in error, you may request for your supervisor to change this.`,
        actor_name: "Playbook System",
        target_ohr: record.ohr_id || undefined,
        metadata: JSON.stringify(metaObj),
      });

      sent++;

      // 2) In-app notification for the supervisor (sent second)
      const supervisorOhr = employee?.supervisor_name ? nameToOhr.get(employee.supervisor_name) : null;
      if (supervisorOhr) {
        await createNotification(db, {
          type: notifType,
          title: `${record.tag} Notice — ${agentName}`,
          message: `${agentName} has been tagged as ${tagLabel} for ${readableDate}.\n\nReason: ${reason}\nRemarks: ${remarks}`,
          actor_name: "Playbook System",
          target_ohr: supervisorOhr,
          metadata: JSON.stringify(metaObj),
        });
        sent++;
      }

    } catch (err: any) {
      console.error(`[AutoNotifier] Error creating notification for OHR ${record.ohr_id}: ${err.message}`);
      errors++;
    }
  }

  console.log(`[AutoNotifier] Completed: ${sent} in-app notifications, ${errors} errors.`);
  return { sent, errors };
}

// ============================================================
// OT Forfeiture Cascade
// Runs daily after 11 AM PHT. Checks approved OT records where the agent's
// attendance tag on the applied_date is NOT 'P' or 'LATE'. Forfeits the OT
// and cascades to the next waitlisted agent (same week, skip past days).
// Exception: if applied_date is a Friday, no cascade — truly forfeited.
// ============================================================

function parseWorkOffDays(workOff: string | null | undefined): number[] {
  if (!workOff) return [];
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return workOff.split(/\s*-\s*/).map(d => dayMap[d.trim()]).filter(d => d !== undefined);
}

function isOnLeave(dateStr: string, leaves: any[]): boolean {
  for (const lv of leaves) {
    if (lv.status !== 'approved' && lv.status !== 'Approved') continue;
    const start = lv.start_date || '';
    const end = lv.end_date || '';
    if (start && end && dateStr >= start && dateStr <= end) return true;
    if (start && !end && dateStr === start) return true;
  }
  return false;
}

function findOtDayForCascade(weekSaturday: Date, workOffDays: number[], agentLeaves: any[], attendanceRecords: any[]): string | null {
  // Get today's date in PHT
  const nowUtc = new Date();
  const phtNow = new Date(nowUtc.getTime() + PHT_OFFSET_HOURS * 60 * 60 * 1000);
  const todayStr = phtNow.toISOString().split('T')[0];

  for (let i = 0; i < 7; i++) {
    const d = new Date(weekSaturday);
    d.setUTCDate(d.getUTCDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const dow = d.getUTCDay();
    if (dateStr < todayStr) continue; // Skip past days
    if (workOffDays.includes(dow)) continue;
    if (isOnLeave(dateStr, agentLeaves)) continue;
    // Check if PL tag
    const rec = attendanceRecords.find((r: any) => r.log_date === dateStr);
    if (rec) {
      const tag = (rec.tag || '').toUpperCase().trim();
      if (tag === 'PL' || tag === 'ML') continue;
    }
    return dateStr;
  }
  return null;
}

import crypto from "crypto";

async function runOtForfeitureCheck(db: ReturnType<typeof drizzle>): Promise<{ forfeited: number; cascaded: number; trulyForfeited: number; errors: number }> {
  let forfeited = 0, cascaded = 0, trulyForfeited = 0, errors = 0;
  const now = new Date().toISOString();

  // Get yesterday's date in PHT (the day that just got locked at 11 AM)
  const phtNow = new Date(Date.now() + PHT_OFFSET_HOURS * 60 * 60 * 1000);
  const yesterday = new Date(phtNow);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  console.log(`[OT-Forfeiture] Checking approved OTs applied on ${yesterdayStr}`);

  // Find all approved OT requests where applied_date = yesterday
  const approvedOTs = await db.select().from(ioOtRequests)
    .where(and(
      eq(ioOtRequests.status, 'approved'),
      eq(ioOtRequests.applied_date, yesterdayStr)
    ));

  if (approvedOTs.length === 0) {
    console.log(`[OT-Forfeiture] No approved OTs found for ${yesterdayStr}`);
    return { forfeited, cascaded, trulyForfeited, errors };
  }

  console.log(`[OT-Forfeiture] Found ${approvedOTs.length} approved OTs for ${yesterdayStr}`);

  // Fetch attendance records for yesterday for these agents
  const agentOhrs = approvedOTs.map(r => r.ohr_id);
  const attendanceRecords = await db.select().from(ioAttendance)
    .where(and(
      eq(ioAttendance.log_date, yesterdayStr),
      inArray(ioAttendance.ohr_id, agentOhrs)
    ));

  for (const otReq of approvedOTs) {
    try {
      const attRec = attendanceRecords.find(a => a.ohr_id === otReq.ohr_id);
      const tag = (attRec?.tag || '').toUpperCase().trim();

      // If tag is P or LATE, the OT is valid — skip
      if (tag === 'P' || tag === 'LATE') continue;

      // OT is forfeited — agent was not P or LATE on the applied date
      forfeited++;
      console.log(`[OT-Forfeiture] Forfeiting OT ${otReq.request_id} for ${otReq.agent_name} (${otReq.ohr_id}) — tag was '${tag}' on ${yesterdayStr}`);

      // Mark as forfeited
      await db.update(ioOtRequests)
        .set({ status: 'forfeited' })
        .where(eq(ioOtRequests.id, otReq.id));

      // Clear OT hours from attendance
      if (attRec) {
        await db.update(ioAttendance)
          .set({ ot_hours: '0' })
          .where(eq(ioAttendance.id, attRec.id));
      }

      // Audit log
      await db.insert(ioAuditLog).values({
        record_type: 'ot_request',
        record_id: otReq.request_id,
        action: 'forfeited',
        field_name: 'status',
        old_value: 'approved',
        new_value: 'forfeited',
        actor_ohr: 'SYSTEM',
        actor_name: 'OT Forfeiture Check',
        timestamp: now,
        metadata: JSON.stringify({ reason: `Tag was '${tag}' (not P or LATE) on ${yesterdayStr}`, applied_date: yesterdayStr }),
      });

      // Notify the agent about forfeiture
      const forfeitDateFormatted = new Date(yesterdayStr + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
      await db.insert(ioNotifications).values({
        type: 'ot_forfeited',
        title: 'OT Forfeited',
        message: `Your OT commitment (${otReq.request_id}) for ${forfeitDateFormatted} has been forfeited because your attendance tag was '${tag}' (not Present or Late).`,
        actor_ohr: 'SYSTEM',
        actor_name: 'OT Forfeiture Check',
        target_ohr: otReq.ohr_id,
        metadata: JSON.stringify({ request_id: otReq.request_id, applied_date: yesterdayStr, tag }),
        is_read: false,
        created_at: now,
      });

      // Notify the agent's supervisor about the forfeiture
      try {
        const [agentEmp] = await db.select().from(ioEmployees).where(eq(ioEmployees.ohr_id, otReq.ohr_id)).limit(1);
        if (agentEmp && agentEmp.supervisor_name) {
          // Look up supervisor by name to get their OHR
          const [supervisor] = await db.select().from(ioEmployees)
            .where(eq(ioEmployees.full_name, agentEmp.supervisor_name)).limit(1);
          if (supervisor) {
            await db.insert(ioNotifications).values({
              type: 'ot_forfeited',
              title: 'Agent OT Forfeited',
              message: `OT commitment for ${agentEmp.full_name || otReq.ohr_id} (${otReq.request_id}) on ${forfeitDateFormatted} has been forfeited. Attendance tag was '${tag}' (not Present or Late).`,
              actor_ohr: 'SYSTEM',
              actor_name: 'OT Forfeiture Check',
              target_ohr: supervisor.ohr_id,
              metadata: JSON.stringify({ request_id: otReq.request_id, applied_date: yesterdayStr, tag, agent_ohr: otReq.ohr_id, agent_name: agentEmp.full_name }),
              is_read: false,
              created_at: now,
            });
          }
        }
      } catch (supErr: any) {
        console.warn(`[OT-Forfeiture] Failed to notify supervisor for ${otReq.ohr_id}:`, supErr.message);
      }

      // Check if applied_date is a Friday — if so, no cascade
      const appliedDow = new Date(yesterdayStr + 'T00:00:00Z').getUTCDay();
      if (appliedDow === 5) { // Friday
        trulyForfeited++;
        console.log(`[OT-Forfeiture] ${otReq.request_id} was on Friday — truly forfeited, no cascade`);
        continue;
      }

      // CASCADE: Find next waitlisted agent for the same planning group
      const pg = otReq.planning_group || '';
      if (!pg) {
        trulyForfeited++;
        continue;
      }

      // Get current week boundaries (Sat–Fri) for the applied_date's week
      const appliedDate = new Date(yesterdayStr + 'T00:00:00Z');
      const adDow = appliedDate.getUTCDay();
      const daysSinceSat = adDow === 6 ? 0 : (adDow + 1);
      const weekSaturday = new Date(appliedDate);
      weekSaturday.setUTCDate(weekSaturday.getUTCDate() - daysSinceSat);
      weekSaturday.setUTCHours(0, 0, 0, 0);
      const weekFriday = new Date(weekSaturday);
      weekFriday.setUTCDate(weekFriday.getUTCDate() + 6);
      const weekSatStr = weekSaturday.toISOString().split('T')[0];
      const weekFriStr = weekFriday.toISOString().split('T')[0];

      // Get all pending (waitlisted) requests for this PG, FIFO order
      const waitlisted = await db.select().from(ioOtRequests)
        .where(and(eq(ioOtRequests.planning_group, pg), eq(ioOtRequests.status, 'pending')))
        .orderBy(asc(ioOtRequests.submitted_at));

      if (waitlisted.length === 0) {
        trulyForfeited++;
        console.log(`[OT-Forfeiture] No waitlisted agents for PG '${pg}' — truly forfeited`);
        continue;
      }

      // Pre-fetch employees and leaves for cascade
      const allEmployees = await db.select().from(ioEmployees)
        .where(eq(ioEmployees.planning_group, pg));
      const empMap = new Map(allEmployees.map((e: any) => [e.ohr_id, e]));

      const allLeaves = await db.select().from(ioLeaves)
        .where(eq(ioLeaves.planning_group, pg));
      const weekLeaves = allLeaves.filter((lv: any) => {
        if (lv.status !== 'approved' && lv.status !== 'Approved') return false;
        const start = lv.start_date || '';
        const end = lv.end_date || start;
        return start <= weekFriStr && end >= weekSatStr;
      });

      let cascadeSuccess = false;
      for (const nextReq of waitlisted) {
        const emp = empMap.get(nextReq.ohr_id);
        const workOffDays = parseWorkOffDays(emp?.work_off || '');
        const agentLeaves = weekLeaves.filter((lv: any) => lv.ohr_id === nextReq.ohr_id);

        // Fetch attendance for this agent for the current week
        const agentAtt = await db.select().from(ioAttendance)
          .where(and(
            gte(ioAttendance.log_date, weekSatStr),
            lte(ioAttendance.log_date, weekFriStr),
            eq(ioAttendance.ohr_id, nextReq.ohr_id)
          ));

        const cascadeDate = findOtDayForCascade(weekSaturday, workOffDays, agentLeaves, agentAtt);
        if (!cascadeDate) continue; // No valid day for this agent, try next

        // Apply OT to this agent
        const OT_HOURS = 2.5;
        await db.update(ioOtRequests)
          .set({ status: 'approved', approved_at: now, applied_date: cascadeDate, approved_by: 'SYSTEM (Cascade)', approved_by_ohr: 'SYSTEM' })
          .where(eq(ioOtRequests.id, nextReq.id));

        // Write OT to attendance
        const attRows = await db.select().from(ioAttendance)
          .where(and(eq(ioAttendance.ohr_id, nextReq.ohr_id), eq(ioAttendance.log_date, cascadeDate)));
        if (attRows.length > 0) {
          await db.update(ioAttendance)
            .set({ ot_hours: String(OT_HOURS) })
            .where(eq(ioAttendance.id, attRows[0].id));
        } else {
          const attId = crypto.randomBytes(8).toString('hex');
          await db.insert(ioAttendance).values({
            id: attId,
            ohr_id: nextReq.ohr_id,
            log_date: cascadeDate,
            ot_hours: String(OT_HOURS),
            created_at: now,
            snap_full_name: emp?.full_name || nextReq.agent_name,
            snap_supervisor: emp?.supervisor_name || '',
            snap_planning_group: emp?.planning_group || '',
            snap_shift_time: emp?.shift_time || '',
            snap_actual_role: emp?.actual_role || '',
            snap_billing_name: emp?.billing_name || '',
            snap_status: emp?.srt_status || '',
          });
        }

        // Audit log for cascade
        await db.insert(ioAuditLog).values({
          record_type: 'ot_request',
          record_id: nextReq.request_id,
          action: 'cascade_approved',
          field_name: 'status',
          old_value: 'pending',
          new_value: 'approved',
          actor_ohr: 'SYSTEM',
          actor_name: 'OT Forfeiture Cascade',
          timestamp: now,
          metadata: JSON.stringify({ cascaded_from: otReq.request_id, original_agent: otReq.ohr_id, applied_date: cascadeDate }),
        });

        // Notify the cascade agent + supervisor
        const cascadeDateFormatted = new Date(cascadeDate + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
        const cascadeNotifs: any[] = [{
          type: 'ot_applied',
          title: 'OT Applied (Cascade)',
          message: `Your OT commitment (${nextReq.request_id}) for 2.5 hour(s) has been applied on ${cascadeDateFormatted} via cascade.`,
          actor_ohr: 'SYSTEM',
          actor_name: 'OT Forfeiture Cascade',
          target_ohr: nextReq.ohr_id,
          metadata: JSON.stringify({ request_id: nextReq.request_id, hours: OT_HOURS, applied_date: cascadeDate, cascaded_from: otReq.request_id }),
          is_read: false,
          created_at: now,
        }];
        if (emp?.supervisor_ohr) {
          cascadeNotifs.push({
            type: 'ot_applied',
            title: 'OT Applied (Cascade) — Agent Update',
            message: `OT for ${nextReq.agent_name} (2.5 hr) has been applied on ${cascadeDateFormatted} via cascade.`,
            actor_ohr: 'SYSTEM',
            actor_name: 'OT Forfeiture Cascade',
            target_ohr: emp.supervisor_ohr,
            metadata: JSON.stringify({ request_id: nextReq.request_id, agent_ohr: nextReq.ohr_id, agent_name: nextReq.agent_name, hours: OT_HOURS, applied_date: cascadeDate }),
            is_read: false,
            created_at: now,
          });
        }
        await db.insert(ioNotifications).values(cascadeNotifs);

        cascadeSuccess = true;
        cascaded++;
        console.log(`[OT-Forfeiture] Cascaded ${otReq.request_id} → ${nextReq.request_id} (${nextReq.agent_name}) on ${cascadeDate}`);
        break; // Only cascade to one agent per forfeited OT
      }

      if (!cascadeSuccess) {
        trulyForfeited++;
        console.log(`[OT-Forfeiture] No valid cascade target for ${otReq.request_id} — truly forfeited`);
      }
    } catch (err: any) {
      errors++;
      console.error(`[OT-Forfeiture] Error processing ${otReq.request_id}:`, err.message);
    }
  }

  console.log(`[OT-Forfeiture] Complete: ${forfeited} forfeited, ${cascaded} cascaded, ${trulyForfeited} truly forfeited, ${errors} errors`);
  return { forfeited, cascaded, trulyForfeited, errors };
}

/**
 * Auto-open OT forms every Saturday 1:00 AM PHT for S-ABF & CS-ABF planning groups only.
 * Resets open_count to 1 for the new week and notifies all eligible agents.
 */
const OT_MECHANISM_PGS = ['S-ABF', 'CS-ABF'];

async function autoOpenOtForms(db: ReturnType<typeof drizzle>): Promise<{ opened: number; notified: number; errors: number }> {
  let opened = 0, notified = 0, errors = 0;
  const now = new Date();
  const pht = new Date(now.getTime() + PHT_OFFSET_HOURS * 60 * 60 * 1000);
  const nowISO = pht.toISOString();

  // Calculate current week start (Mon-Sun) in PHT
  const dayOfWeek = pht.getUTCDay(); // 0=Sun, 1=Mon, ...
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(pht);
  weekStart.setUTCDate(weekStart.getUTCDate() - diffToMonday);
  weekStart.setUTCHours(0, 0, 0, 0);
  const weekStartISO = weekStart.toISOString();

  try {
    // Get all distinct planning groups from active employees (S-ABF & CS-ABF only)
    const allEmployees = await db.select().from(ioEmployees);
    const pgSet = new Set<string>();
    for (const emp of allEmployees) {
      if (!emp.planning_group) continue;
      if (!OT_MECHANISM_PGS.includes(emp.planning_group)) continue;
      if (emp.actual_role !== 'Agent') continue;
      pgSet.add(emp.planning_group);
    }
    const planningGroups = Array.from(pgSet);
    console.log(`[OT-AutoOpen] Found ${planningGroups.length} OT-eligible planning groups (S-ABF/CS-ABF): ${planningGroups.join(', ')}`);

    for (const pg of planningGroups) {
      try {
        // Upsert config: reset open_count to 1 for new week
        const existing = await db.select().from(ioOtConfig).where(eq(ioOtConfig.planning_group, pg));
        if (existing.length > 0) {
          await db.update(ioOtConfig)
            .set({ ot_form_open: true, open_count: 1, week_start: weekStartISO, updated_at: nowISO, updated_by: 'SYSTEM_AUTO_OPEN' })
            .where(eq(ioOtConfig.planning_group, pg));
        } else {
          await db.insert(ioOtConfig).values({
            planning_group: pg,
            ot_form_open: true,
            open_count: 1,
            week_start: weekStartISO,
            updated_at: nowISO,
            updated_by: 'SYSTEM_AUTO_OPEN',
          });
        }
        opened++;

        // Get eligible agents for this PG (S-ABF & CS-ABF Agents only)
        const eligibleAgents = allEmployees.filter((a: any) =>
          a.planning_group === pg &&
          a.actual_role === 'Agent' &&
          OT_MECHANISM_PGS.includes(a.planning_group || '')
        );

        // Create in-app notifications
        const notifTitle = 'OT Request Form Open';
        const notifMsg = `OT commitments are now open for ${pg}. You may submit your 2.5-hour OT commitment.`;
        const notifValues = eligibleAgents.map((agent: any) => ({
          type: 'ot_form_open',
          title: notifTitle,
          message: notifMsg,
          actor_ohr: 'SYSTEM',
          actor_name: 'System Auto-Open',
          target_ohr: agent.ohr_id,
          metadata: JSON.stringify({ planning_group: pg, auto_open: true }),
          is_read: false,
          created_at: nowISO,
        }));
        if (notifValues.length > 0) {
          await db.insert(ioNotifications).values(notifValues);
          notified += notifValues.length;
        }

        console.log(`[OT-AutoOpen] Opened ${pg}: ${eligibleAgents.length} agents notified`);
      } catch (pgErr: any) {
        errors++;
        console.error(`[OT-AutoOpen] Error opening ${pg}:`, pgErr.message);
      }
    }
  } catch (err: any) {
    errors++;
    console.error('[OT-AutoOpen] Fatal error:', err.message);
  }

  console.log(`[OT-AutoOpen] Complete: ${opened} PGs opened, ${notified} agents notified, ${errors} errors`);
  return { opened, notified, errors };
}

export function registerAutoMailer(app: Express): void {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    console.warn("[AutoNotifier] DATABASE_URL not set. Auto-notifier disabled.");
    return;
  }

  const db = drizzle(dbUrl);

  // Schedule: 2:30 AM PHT = 18:30 UTC (previous day)
  cron.schedule("30 18 * * *", async () => {
    console.log("[AutoNotifier] Triggered: 2:30 AM PHT shift check");
    try {
      await sendUplLateNotifications(db);
    } catch (err) {
      console.error("[AutoNotifier] Cron error (2:30 AM PHT):", err);
    }
  });

  // Schedule: 11:30 AM PHT = 03:30 UTC
  cron.schedule("30 3 * * *", async () => {
    console.log("[AutoNotifier] Triggered: 11:30 AM PHT shift check");
    try {
      await sendUplLateNotifications(db);
    } catch (err) {
      console.error("[AutoNotifier] Cron error (11:30 AM PHT):", err);
    }
  });

  console.log("[AutoNotifier] Scheduled: 2:30 AM PHT, 11:30 AM PHT (UPL/LATE)");

  // Schedule: OT Forfeiture check at 11:15 AM PHT = 03:15 UTC daily
  // Runs after the 11 AM PHT attendance lock so yesterday's tags are finalized
  cron.schedule("15 3 * * *", async () => {
    console.log("[OT-Forfeiture] Triggered: 11:15 AM PHT daily forfeiture check");
    try {
      await runOtForfeitureCheck(db);
    } catch (err) {
      console.error("[OT-Forfeiture] Cron error:", err);
    }
  });

  console.log("[AutoNotifier] Scheduled: 11:15 AM PHT (OT Forfeiture Cascade)");

  // Schedule: OT Form Auto-Open at 1:00 AM PHT every Saturday = 17:00 UTC Friday
  // Opens OT form for all non-RECALL planning groups and notifies eligible agents
  cron.schedule("0 17 * * 5", async () => {
    console.log("[OT-AutoOpen] Triggered: 1:00 AM PHT Saturday auto-open");
    try {
      await autoOpenOtForms(db);
    } catch (err) {
      console.error("[OT-AutoOpen] Cron error:", err);
    }
  });

  console.log("[AutoNotifier] Scheduled: 1:00 AM PHT Saturday (OT Form Auto-Open)");

  // Manual trigger for UPL/LATE notifications
  app.post("/api/io/send-notifications", async (req, res) => {
    try {
      const result = await sendUplLateNotifications(db);
      res.json({
        success: true,
        message: `In-app: ${result.sent}, errors: ${result.errors}`,
        ...result,
      });
    } catch (err: any) {
      console.error("[AutoNotifier] Manual trigger error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Manual trigger for OT forfeiture check
  app.post("/api/io/ot-forfeiture-check", async (req, res) => {
    try {
      const result = await runOtForfeitureCheck(db);
      res.json({
        success: true,
        message: `Forfeited: ${result.forfeited}, Cascaded: ${result.cascaded}, Truly forfeited: ${result.trulyForfeited}, Errors: ${result.errors}`,
        ...result,
      });
    } catch (err: any) {
      console.error("[OT-Forfeiture] Manual trigger error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Manual trigger for OT auto-open
  app.post("/api/io/ot-auto-open", async (req, res) => {
    try {
      const result = await autoOpenOtForms(db);
      res.json({
        success: true,
        message: `Opened: ${result.opened} PGs, Notified: ${result.notified} agents, Errors: ${result.errors}`,
        ...result,
      });
    } catch (err: any) {
      console.error("[OT-AutoOpen] Manual trigger error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================================
  // Dispute Aging Alert
  // Runs every 4 hours PHT. Checks active disputes that have been
  // sitting at their current level beyond the SLA threshold:
  //   - Standard disputes: 48 hours
  //   - ZTP Infraction / Incident Report: 24 hours (compliance-critical)
  // Sends dispute_overdue notification to the person who needs to act next.
  // ============================================================

  async function checkDisputeAging(db: ReturnType<typeof drizzle>): Promise<{ alerts: number; errors: number }> {
    let alerts = 0, errors = 0;
    const now = new Date();

    // Active dispute statuses and who needs to act next
    const DISPUTE_STATUS_MAP: Record<string, { level: string; nextActorField: 'coach_ohr' | 'sme_joiner' | 'sme_joiner_2' | 'coachee_ohr' }> = {
      'Markdown Disputed - SME': { level: 'LV1', nextActorField: 'coach_ohr' },
      'Pending Support Review': { level: 'LV2', nextActorField: 'sme_joiner' },
      'Markdown Retained - SME': { level: 'LV3', nextActorField: 'sme_joiner' },
      'QA Decision Rejected': { level: 'LV4', nextActorField: 'sme_joiner_2' },
      'Markdown Retained - Trainer': { level: 'LV5', nextActorField: 'sme_joiner' },
      'Trainer Decision Rejected - SME': { level: 'LV6', nextActorField: 'coach_ohr' },
    };

    const activeStatuses = Object.keys(DISPUTE_STATUS_MAP);

    try {
      const disputes = await db.select({
        id: ioCoaching.id,
        coaching_id: ioCoaching.coaching_id,
        coaching_type: ioCoaching.coaching_type,
        status: ioCoaching.status,
        coach_ohr: ioCoaching.coach_ohr,
        coachee_ohr: ioCoaching.coachee_ohr,
        coachee: ioCoaching.coachee,
        sme_joiner: ioCoaching.sme_joiner,
        sme_joiner_2: ioCoaching.sme_joiner_2,
        updated_at: ioCoaching.updated_at,
        created_at: ioCoaching.created_at,
      }).from(ioCoaching)
        .where(inArray(ioCoaching.status, activeStatuses));

      if (disputes.length === 0) {
        console.log('[Dispute-Aging] No active disputes found.');
        return { alerts: 0, errors: 0 };
      }

      console.log(`[Dispute-Aging] Found ${disputes.length} active disputes to check.`);

      // Build name → OHR lookup for sme_joiner fields (stored as names)
      const allEmployees = await db.select({ ohr_id: ioEmployees.ohr_id, full_name: ioEmployees.full_name }).from(ioEmployees);
      const nameToOhr = new Map<string, string>();
      for (const e of allEmployees) {
        if (e.full_name && e.ohr_id) nameToOhr.set(e.full_name, e.ohr_id);
      }

      // Check for existing overdue notifications to avoid duplicates (within last 12 hours)
      const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();
      const recentOverdueNotifs = await db.select({
        metadata: ioNotifications.metadata,
      }).from(ioNotifications)
        .where(and(
          eq(ioNotifications.type, 'dispute_overdue'),
          gte(ioNotifications.created_at, twelveHoursAgo)
        ));

      const recentlyNotifiedIds = new Set<string>();
      for (const n of recentOverdueNotifs) {
        try {
          const meta = JSON.parse(n.metadata || '{}');
          if (meta.coaching_id) recentlyNotifiedIds.add(meta.coaching_id);
        } catch { /* skip */ }
      }

      for (const dispute of disputes) {
        try {
          const cid = dispute.coaching_id || String(dispute.id);
          if (recentlyNotifiedIds.has(cid)) continue; // Already notified recently

          const statusInfo = DISPUTE_STATUS_MAP[dispute.status || ''];
          if (!statusInfo) continue;

          // Determine timestamp of last status change
          const lastChangeStr = dispute.updated_at || dispute.created_at;
          if (!lastChangeStr) continue;
          const lastChange = new Date(lastChangeStr);
          const hoursElapsed = (now.getTime() - lastChange.getTime()) / (1000 * 60 * 60);

          // Determine SLA threshold based on coaching type
          const isHighPriority = ['ZTP Infraction', 'Incident Report'].includes(dispute.coaching_type || '');
          const slaHours = isHighPriority ? 24 : 48;

          if (hoursElapsed < slaHours) continue; // Not overdue yet

          // Resolve the next actor's OHR
          let targetOhr: string | null = null;
          const field = statusInfo.nextActorField;
          if (field === 'coach_ohr' || field === 'coachee_ohr') {
            targetOhr = (dispute as any)[field] || null;
          } else {
            // sme_joiner / sme_joiner_2 are stored as names
            const joinerName = (dispute as any)[field] || '';
            targetOhr = nameToOhr.get(joinerName) || null;
          }

          if (!targetOhr) continue;

          const priorityTag = isHighPriority ? '[HIGH PRIORITY] ' : '';
          const hoursStr = Math.round(hoursElapsed);

          await createNotification(db, {
            type: 'dispute_overdue',
            title: `${priorityTag}Dispute Overdue — ${statusInfo.level}`,
            message: `Dispute ${cid} (${dispute.coachee || 'Unknown'}) has been pending your action at ${statusInfo.level} for ${hoursStr} hours. SLA is ${slaHours} hours.`,
            actor_name: 'Playbook System',
            target_ohr: targetOhr,
            metadata: JSON.stringify({
              coaching_id: cid,
              level: statusInfo.level,
              hours_elapsed: hoursStr,
              sla_hours: slaHours,
              coaching_type: dispute.coaching_type,
              is_high_priority: isHighPriority,
            }),
          });

          alerts++;
          console.log(`[Dispute-Aging] Alert sent for ${cid} at ${statusInfo.level} (${hoursStr}h elapsed, SLA ${slaHours}h) → ${targetOhr}`);
        } catch (err: any) {
          console.error(`[Dispute-Aging] Error processing dispute ${dispute.coaching_id}: ${err.message}`);
          errors++;
        }
      }
    } catch (err: any) {
      console.error('[Dispute-Aging] Fatal error:', err.message);
      errors++;
    }

    console.log(`[Dispute-Aging] Completed: ${alerts} alerts sent, ${errors} errors.`);
    return { alerts, errors };
  }

  // Schedule: every 4 hours PHT (0:00, 4:00, 8:00, 12:00, 16:00, 20:00)
  cron.schedule("0 */4 * * *", async () => {
    try {
      await checkDisputeAging(db);
    } catch (err) {
      console.error("[Dispute-Aging] Cron error:", err);
    }
  });

  console.log("[AutoNotifier] Scheduled: Every 4 hours (Dispute Aging Alert)");

  // Manual trigger for dispute aging check
  app.post("/api/io/dispute-aging-check", async (req, res) => {
    try {
      const result = await checkDisputeAging(db);
      res.json({
        success: true,
        message: `Alerts: ${result.alerts}, Errors: ${result.errors}`,
        ...result,
      });
    } catch (err: any) {
      console.error("[Dispute-Aging] Manual trigger error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  console.log("[AutoNotifier] Manual triggers: POST /api/io/send-notifications, POST /api/io/ot-forfeiture-check, POST /api/io/ot-auto-open, POST /api/io/dispute-aging-check");

  // ═══════════════════════════════════════════════════════════════════
  // CAP Expiry Warning — daily at 9:00 AM PHT (01:00 UTC)
  // Alerts agents + supervisors when a CAP expires within 7 days
  // ═══════════════════════════════════════════════════════════════════
  async function checkCapExpiry(db: ReturnType<typeof drizzle>): Promise<{ alerts: number; errors: number }> {
    let alerts = 0, errors = 0;
    try {
      const today = getTodayPHT();
      const sevenDaysOut = new Date(new Date(today + 'T00:00:00Z').getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const now = new Date().toISOString();
      // Find CAPs expiring within 7 days that haven't been notified yet for this window
      const expiringCaps = await db.select()
        .from(ioCorrectiveActions)
        .where(and(
          eq(ioCorrectiveActions.status, 'CAP Issued'),
          gte(ioCorrectiveActions.cap_expiry_date, today),
          lte(ioCorrectiveActions.cap_expiry_date, sevenDaysOut)
        ));
      for (const cap of expiringCaps) {
        try {
          const daysLeft = Math.ceil((new Date((cap.cap_expiry_date || today) + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime()) / (24 * 60 * 60 * 1000));
          // Check if we already sent a cap_expiring notification for this CA today
          const existingNotifs = await db.select({ id: ioNotifications.id })
            .from(ioNotifications)
            .where(and(
              eq(ioNotifications.type, 'cap_expiring'),
              eq(ioNotifications.target_ohr, cap.ohr_id),
              gte(ioNotifications.created_at, today + 'T00:00:00.000Z')
            ))
            .limit(1);
          if (existingNotifs.length > 0) continue; // Already notified today
          // Notify the agent
          await db.insert(ioNotifications).values({
            type: 'cap_expiring',
            title: `${cap.cap_level} Expiring in ${daysLeft} Day${daysLeft !== 1 ? 's' : ''}`,
            message: `Your ${cap.cap_level} corrective action expires on ${formatDateReadable(cap.cap_expiry_date || today)}. Ensure compliance during the remaining active period.`,
            actor_ohr: 'SYSTEM',
            actor_name: 'Playbook System',
            target_ohr: cap.ohr_id,
            metadata: JSON.stringify({ ca_id: cap.id, cap_level: cap.cap_level, expiry_date: cap.cap_expiry_date, days_left: daysLeft }),
            is_read: false,
            created_at: now,
          });
          alerts++;
          // Notify the supervisor
          if (cap.supervisor_ohr) {
            await db.insert(ioNotifications).values({
              type: 'cap_expiring',
              title: `${cap.cap_level} Expiring — ${cap.employee_name || cap.ohr_id}`,
              message: `${cap.employee_name || cap.ohr_id}'s ${cap.cap_level} expires on ${formatDateReadable(cap.cap_expiry_date || today)} (${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining).`,
              actor_ohr: 'SYSTEM',
              actor_name: 'Playbook System',
              target_ohr: cap.supervisor_ohr,
              metadata: JSON.stringify({ ca_id: cap.id, cap_level: cap.cap_level, expiry_date: cap.cap_expiry_date, days_left: daysLeft, employee_name: cap.employee_name }),
              is_read: false,
              created_at: now,
            });
            alerts++;
          }
        } catch (err) {
          errors++;
          console.error('[CAP-Expiry] Error processing:', cap.id, err);
        }
      }
      console.log(`[CAP-Expiry] Completed: ${alerts} alerts sent, ${errors} errors.`);
    } catch (err) {
      console.error('[CAP-Expiry] Fatal error:', err);
    }
    return { alerts, errors };
  }
  // Schedule: 9:00 AM PHT = 01:00 UTC daily
  cron.schedule("0 1 * * *", async () => {
    try { await checkCapExpiry(db); } catch (err) { console.error('[CAP-Expiry] Cron error:', err); }
  });
  console.log("[AutoNotifier] Scheduled: 9:00 AM PHT daily (CAP Expiry Warning)");
  // Manual trigger
  app.post("/api/io/cap-expiry-check", async (req, res) => {
    try {
      const result = await checkCapExpiry(db);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // NTE Deadline Reminder — every 4 hours
  // Nudges agents when their NTE response deadline is within 12 hours
  // ═══════════════════════════════════════════════════════════════════
  async function checkNteDeadlines(db: ReturnType<typeof drizzle>): Promise<{ alerts: number; errors: number }> {
    let alerts = 0, errors = 0;
    try {
      const now = new Date();
      const nowIso = now.toISOString();
      const twelveHoursOut = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();
      // Find NTEs with status 'Served' and deadline within 12 hours
      const urgentNtes = await db.select()
        .from(ioCorrectiveActions)
        .where(and(
          eq(ioCorrectiveActions.status, 'Served'),
          gte(ioCorrectiveActions.response_deadline, nowIso),
          lte(ioCorrectiveActions.response_deadline, twelveHoursOut)
        ));
      for (const nte of urgentNtes) {
        try {
          // Check if we already sent a deadline reminder for this NTE today
          const today = getTodayPHT();
          const existingReminder = await db.select({ id: ioNotifications.id })
            .from(ioNotifications)
            .where(and(
              eq(ioNotifications.type, 'nte_deadline_reminder'),
              eq(ioNotifications.target_ohr, nte.ohr_id),
              gte(ioNotifications.created_at, today + 'T00:00:00.000Z')
            ))
            .limit(1);
          if (existingReminder.length > 0) continue;
          const hoursLeft = Math.ceil((new Date(nte.response_deadline!).getTime() - now.getTime()) / (60 * 60 * 1000));
          await db.insert(ioNotifications).values({
            type: 'nte_deadline_reminder',
            title: `NTE Deadline — ${hoursLeft} Hour${hoursLeft !== 1 ? 's' : ''} Remaining`,
            message: `Your NTE regarding ${nte.nte_type || 'Policy Violation'} has a response deadline in approximately ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''}. Please respond promptly.`,
            actor_ohr: 'SYSTEM',
            actor_name: 'Playbook System',
            target_ohr: nte.ohr_id,
            metadata: JSON.stringify({ ca_id: nte.id, nte_type: nte.nte_type, deadline: nte.response_deadline, hours_left: hoursLeft }),
            is_read: false,
            created_at: nowIso,
          });
          alerts++;
        } catch (err) {
          errors++;
          console.error('[NTE-Deadline] Error processing:', nte.id, err);
        }
      }
      console.log(`[NTE-Deadline] Completed: ${alerts} reminders sent, ${errors} errors.`);
    } catch (err) {
      console.error('[NTE-Deadline] Fatal error:', err);
    }
    return { alerts, errors };
  }
  // Schedule: every 4 hours (same cadence as dispute aging)
  cron.schedule("30 */4 * * *", async () => {
    try { await checkNteDeadlines(db); } catch (err) { console.error('[NTE-Deadline] Cron error:', err); }
  });
  console.log("[AutoNotifier] Scheduled: Every 4 hours (NTE Deadline Reminder)");
  app.post("/api/io/nte-deadline-check", async (req, res) => {
    try {
      const result = await checkNteDeadlines(db);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // Coaching Acknowledgement Overdue — daily at 10:00 AM PHT (02:00 UTC)
  // Alerts coach + TL when coaching not acknowledged within 48 hours
  // ═══════════════════════════════════════════════════════════════════
  async function checkCoachingAckOverdue(db: ReturnType<typeof drizzle>): Promise<{ alerts: number; errors: number }> {
    let alerts = 0, errors = 0;
    try {
      const now = new Date();
      const nowIso = now.toISOString();
      const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
      const today = getTodayPHT();
      // Find coaching logs created >48h ago that are not yet acknowledged
      const overdueLogs = await db.select()
        .from(ioCoaching)
        .where(and(
          lte(ioCoaching.created_at, fortyEightHoursAgo),
          sql`${ioCoaching.ack_date} IS NULL`
        ));
      for (const log of overdueLogs) {
        try {
          // Deduplicate: only one alert per coaching log per day
          const existingAlert = await db.select({ id: ioNotifications.id })
            .from(ioNotifications)
            .where(and(
              eq(ioNotifications.type, 'coaching_ack_overdue'),
              eq(ioNotifications.target_ohr, log.coach_ohr || ''),
              gte(ioNotifications.created_at, today + 'T00:00:00.000Z')
            ))
            .limit(1);
          if (existingAlert.length > 0) continue;
          const coacheeName = log.coachee || 'Coachee';
          const cid = log.coaching_id || log.id;
          const hoursOverdue = Math.floor((now.getTime() - new Date(log.created_at!).getTime()) / (60 * 60 * 1000));
          // Notify the coach
          if (log.coach_ohr) {
            await db.insert(ioNotifications).values({
              type: 'coaching_ack_overdue',
              title: `Coaching Acknowledgement Overdue — ${coacheeName}`,
              message: `${coacheeName} has not acknowledged coaching log ${cid} after ${hoursOverdue} hours. Please follow up.`,
              actor_ohr: 'SYSTEM',
              actor_name: 'Playbook System',
              target_ohr: log.coach_ohr,
              metadata: JSON.stringify({ coaching_id: cid, coachee: coacheeName, hours_overdue: hoursOverdue }),
              is_read: false,
              created_at: nowIso,
            });
            alerts++;
          }
          // Notify the coach's supervisor (TL)
          if (log.coach_sup) {
            const supEmp = await db.select({ ohr_id: ioEmployees.ohr_id })
              .from(ioEmployees)
              .where(eq(ioEmployees.full_name, log.coach_sup))
              .limit(1);
            if (supEmp.length > 0 && supEmp[0].ohr_id) {
              await db.insert(ioNotifications).values({
                type: 'coaching_ack_overdue',
                title: `Coaching Ack Overdue — ${coacheeName} (Coach: ${log.coach || 'Unknown'})`,
                message: `Coaching log ${cid} by ${log.coach || 'Coach'} for ${coacheeName} has not been acknowledged after ${hoursOverdue} hours.`,
                actor_ohr: 'SYSTEM',
                actor_name: 'Playbook System',
                target_ohr: supEmp[0].ohr_id,
                metadata: JSON.stringify({ coaching_id: cid, coachee: coacheeName, coach: log.coach, hours_overdue: hoursOverdue }),
                is_read: false,
                created_at: nowIso,
              });
              alerts++;
            }
          }
        } catch (err) {
          errors++;
          console.error('[Coaching-Ack-Overdue] Error processing:', log.id, err);
        }
      }
      console.log(`[Coaching-Ack-Overdue] Completed: ${alerts} alerts sent, ${errors} errors.`);
    } catch (err) {
      console.error('[Coaching-Ack-Overdue] Fatal error:', err);
    }
    return { alerts, errors };
  }
  // Schedule: 10:00 AM PHT = 02:00 UTC daily
  cron.schedule("0 2 * * *", async () => {
    try { await checkCoachingAckOverdue(db); } catch (err) { console.error('[Coaching-Ack-Overdue] Cron error:', err); }
  });
  console.log("[AutoNotifier] Scheduled: 10:00 AM PHT daily (Coaching Ack Overdue)");
  app.post("/api/io/coaching-ack-overdue-check", async (req, res) => {
    try {
      const result = await checkCoachingAckOverdue(db);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // Weekly Compass Digest — Monday 8:00 AM PHT (00:00 UTC Monday)
  // Summary of coaching/CA activity for TLs and Managers
  // ═══════════════════════════════════════════════════════════════════
  async function sendWeeklyDigest(db: ReturnType<typeof drizzle>): Promise<{ sent: number; errors: number }> {
    let sent = 0, errors = 0;
    try {
      const now = new Date();
      const nowIso = now.toISOString();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      // Count coaching logs created in the last 7 days
      const [coachingCount] = await db.select({ cnt: sql<number>`COUNT(*)` })
        .from(ioCoaching)
        .where(gte(ioCoaching.created_at, sevenDaysAgo));
      // Count NTEs created in the last 7 days
      const [nteCount] = await db.select({ cnt: sql<number>`COUNT(*)` })
        .from(ioCorrectiveActions)
        .where(gte(ioCorrectiveActions.created_at, sevenDaysAgo));
      // Count unacknowledged coaching logs
      const [unackCount] = await db.select({ cnt: sql<number>`COUNT(*)` })
        .from(ioCoaching)
        .where(sql`${ioCoaching.ack_date} IS NULL`);
      // Count active CAPs
      const [activeCaps] = await db.select({ cnt: sql<number>`COUNT(*)` })
        .from(ioCorrectiveActions)
        .where(eq(ioCorrectiveActions.status, 'CAP Issued'));
      const digestMsg = `Weekly Compass Summary:\n• ${coachingCount.cnt} coaching sessions this week\n• ${nteCount.cnt} NTEs issued this week\n• ${unackCount.cnt} coaching logs pending acknowledgement\n• ${activeCaps.cnt} active CAPs currently enforced`;
      // Send to all TLs and Managers
      const supervisors = await db.selectDistinct({ ohr_id: ioEmployees.ohr_id, full_name: ioEmployees.full_name })
        .from(ioEmployees)
        .where(inArray(ioEmployees.actual_role, ['Team Lead', 'Manager', 'Operational SME']));
      for (const sup of supervisors) {
        try {
          if (!sup.ohr_id) continue;
          await db.insert(ioNotifications).values({
            type: 'weekly_digest',
            title: 'Weekly Compass Digest',
            message: digestMsg,
            actor_ohr: 'SYSTEM',
            actor_name: 'Playbook System',
            target_ohr: sup.ohr_id,
            metadata: JSON.stringify({ coaching_count: coachingCount.cnt, nte_count: nteCount.cnt, unack_count: unackCount.cnt, active_caps: activeCaps.cnt }),
            is_read: false,
            created_at: nowIso,
          });
          sent++;
        } catch (err) {
          errors++;
        }
      }
      console.log(`[Weekly-Digest] Completed: ${sent} digests sent, ${errors} errors.`);
    } catch (err) {
      console.error('[Weekly-Digest] Fatal error:', err);
    }
    return { sent, errors };
  }
  // Schedule: Monday 8:00 AM PHT = 00:00 UTC Monday
  cron.schedule("0 0 * * 1", async () => {
    try { await sendWeeklyDigest(db); } catch (err) { console.error('[Weekly-Digest] Cron error:', err); }
  });
  console.log("[AutoNotifier] Scheduled: Monday 8:00 AM PHT (Weekly Compass Digest)");
  app.post("/api/io/weekly-digest", async (req, res) => {
    try {
      const result = await sendWeeklyDigest(db);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // Insight Review Pending — Every 12h (06:00 UTC + 18:00 UTC)
  // Nudges SMEs/Trainers when insights sit pending > 48h (initial) or > 72h (final)
  // ═══════════════════════════════════════════════════════════════════
  async function checkInsightReviewPending(db: ReturnType<typeof drizzle>): Promise<{ alerts: number; errors: number }> {
    let alerts = 0, errors = 0;
    try {
      const now = new Date();
      const nowIso = now.toISOString();
      const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
      const seventyTwoHoursAgo = new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

      // Find insights pending initial review > 48h
      const pendingInitial = await db.select()
        .from(ioInsights)
        .where(and(
          eq(ioInsights.status, 'Pending - Initial Review'),
          lte(ioInsights.created_at, fortyEightHoursAgo)
        ));

      // Find insights pending final review > 72h (use initial_review_date as the start)
      const pendingFinal = await db.select()
        .from(ioInsights)
        .where(and(
          eq(ioInsights.status, 'Pending - Final Review'),
          lte(ioInsights.initial_review_date, seventyTwoHoursAgo)
        ));

      // Group initial by planning_group for SME targeting
      const pgGroups: Record<string, typeof pendingInitial> = {};
      for (const ins of pendingInitial) {
        const pg = ins.planning_group || 'Unknown';
        if (!pgGroups[pg]) pgGroups[pg] = [];
        pgGroups[pg].push(ins);
      }

      // Get all employees for role-based targeting
      const allEmps = await db.select({
        ohr_id: ioEmployees.ohr_id,
        full_name: ioEmployees.full_name,
        actual_role: ioEmployees.actual_role,
        planning_group: ioEmployees.planning_group,
      }).from(ioEmployees);

      // Notify SMEs/Content Reviewers for pending initial insights
      for (const [pg, insights] of Object.entries(pgGroups)) {
        const reviewers = allEmps.filter(e =>
          (e.actual_role === 'Operational SME' || e.actual_role === 'Content Reviewer') &&
          e.planning_group === pg
        );
        for (const reviewer of reviewers) {
          if (!reviewer.ohr_id) continue;
          // Dedup: skip if already notified within 24h for same PG
          const existing = await db.select({ id: ioNotifications.id })
            .from(ioNotifications)
            .where(and(
              eq(ioNotifications.type, 'insight_review_pending'),
              eq(ioNotifications.target_ohr, reviewer.ohr_id),
              gte(ioNotifications.created_at, twentyFourHoursAgo)
            ))
            .limit(1);
          if (existing.length > 0) continue;

          const insightIds = insights.map(i => i.insight_id).filter(Boolean);
          await db.insert(ioNotifications).values({
            type: 'insight_review_pending',
            title: `Insight Awaiting Review — ${insights.length} pending`,
            message: `${insights.length} insight(s) pending your initial review for 48+ hours.`,
            actor_ohr: 'SYSTEM',
            actor_name: 'Playbook System',
            target_ohr: reviewer.ohr_id,
            metadata: JSON.stringify({ insight_ids: insightIds, count: insights.length, review_tier: 'initial', planning_group: pg }),
            is_read: false,
            created_at: nowIso,
          });
          alerts++;
        }
      }

      // Notify Trainers for pending final insights
      if (pendingFinal.length > 0) {
        const trainers = allEmps.filter(e => e.actual_role === 'Trainer');
        for (const trainer of trainers) {
          if (!trainer.ohr_id) continue;
          // Dedup
          const existing = await db.select({ id: ioNotifications.id })
            .from(ioNotifications)
            .where(and(
              eq(ioNotifications.type, 'insight_review_pending'),
              eq(ioNotifications.target_ohr, trainer.ohr_id),
              gte(ioNotifications.created_at, twentyFourHoursAgo)
            ))
            .limit(1);
          if (existing.length > 0) continue;

          const insightIds = pendingFinal.map(i => i.insight_id).filter(Boolean);
          await db.insert(ioNotifications).values({
            type: 'insight_review_pending',
            title: `Insight Awaiting Review — ${pendingFinal.length} pending`,
            message: `${pendingFinal.length} insight(s) pending your final review for 72+ hours.`,
            actor_ohr: 'SYSTEM',
            actor_name: 'Playbook System',
            target_ohr: trainer.ohr_id,
            metadata: JSON.stringify({ insight_ids: insightIds, count: pendingFinal.length, review_tier: 'final' }),
            is_read: false,
            created_at: nowIso,
          });
          alerts++;
        }
      }

      console.log(`[Insight-Review-Pending] Completed: ${alerts} reminders sent, ${errors} errors.`);
    } catch (err) {
      console.error('[Insight-Review-Pending] Fatal error:', err);
    }
    return { alerts, errors };
  }
  // Schedule: Every 12h at 06:00 UTC (2:00 PM PHT) and 18:00 UTC (2:00 AM PHT)
  cron.schedule("0 6,18 * * *", async () => {
    try { await checkInsightReviewPending(db); } catch (err) { console.error('[Insight-Review-Pending] Cron error:', err); }
  });
  console.log("[AutoNotifier] Scheduled: Every 12h (Insight Review Pending Reminder)");
  app.post("/api/io/insight-review-pending-check", async (req, res) => {
    try {
      const result = await checkInsightReviewPending(db);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  console.log("[AutoNotifier] All cron jobs and manual triggers initialized.");
}
