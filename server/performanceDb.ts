/**
 * Performance Dashboard — Database Helpers
 * CRUD operations for performance dashboard data using raw SQL via the db connection.
 */
import { getDb } from "./db";
import { sql } from "drizzle-orm";

async function db() {
  const d = await getDb();
  if (!d) throw new Error("Database not available");
  return d;
}

// ---- Sync History ----

export async function createSyncRecord(data: { syncedBy?: string; syncedByName?: string }) {
  const result: any = await (await db()).execute(sql`
    INSERT INTO perf_sync_history (synced_by, synced_by_name, status)
    VALUES (${data.syncedBy || null}, ${data.syncedByName || null}, 'processing')
  `);
  const rows = Array.isArray(result) ? result[0] : result;
  return rows.insertId;
}

export async function updateSyncRecord(
  id: number,
  data: { status?: string; totalEmployees?: number; filesUploaded?: number; errorMessage?: string }
) {
  await (await db()).execute(sql`
    UPDATE perf_sync_history SET
      status = COALESCE(${data.status || null}, status),
      total_employees = COALESCE(${data.totalEmployees ?? null}, total_employees),
      files_uploaded = COALESCE(${data.filesUploaded ?? null}, files_uploaded),
      error_message = COALESCE(${data.errorMessage || null}, error_message),
      completed_at = ${data.status === "completed" || data.status === "failed" ? sql`NOW()` : sql`completed_at`}
    WHERE id = ${id}
  `);
}

export async function getSyncHistory(limit = 20) {
  const result: any = await (await db()).execute(sql`
    SELECT * FROM perf_sync_history ORDER BY created_at DESC LIMIT ${limit}
  `);
  return Array.isArray(result) ? result[0] : result;
}

export async function getLatestSync() {
  const result: any = await (await db()).execute(sql`
    SELECT * FROM perf_sync_history WHERE status = 'completed' ORDER BY created_at DESC LIMIT 1
  `);
  const rows = Array.isArray(result) ? result[0] : result;
  return rows[0] || null;
}

export async function getSyncStatus(syncId: number) {
  const result: any = await (await db()).execute(sql`
    SELECT * FROM perf_sync_history WHERE id = ${syncId}
  `);
  const rows = Array.isArray(result) ? result[0] : result;
  return rows[0] || null;
}

// ---- Source Files ----

export async function upsertSourceFile(data: {
  fileKey: string;
  originalName: string;
  s3Key: string;
  s3Url: string;
  fileSize: number;
}) {
  await (await db()).execute(sql`
    INSERT INTO perf_source_files (file_key, original_name, s3_key, s3_url, file_size, updated_at)
    VALUES (${data.fileKey}, ${data.originalName}, ${data.s3Key}, ${data.s3Url}, ${data.fileSize}, NOW())
    ON DUPLICATE KEY UPDATE
      original_name = VALUES(original_name),
      s3_key = VALUES(s3_key),
      s3_url = VALUES(s3_url),
      file_size = VALUES(file_size),
      updated_at = NOW()
  `);
}

export async function getSourceFile() {
  const result: any = await (await db()).execute(sql`
    SELECT * FROM perf_source_files ORDER BY updated_at DESC LIMIT 1
  `);
  const rows = Array.isArray(result) ? result[0] : result;
  return rows[0] || null;
}

// ---- Dashboard Data Sync ----

export async function syncDashboardData(
  parsed: {
    employees: any[];
    timeframes: any[];
    metrics: any[];
    planningGroups: string[];
    supervisors: string[];
    shiftTimes: string[];
    dailyRaw: any[];
    teamAverages: any;
  },
  syncId: number
) {
  // Clear old data
  await (await db()).execute(sql`DELETE FROM perf_employee_metrics`);
  await (await db()).execute(sql`DELETE FROM perf_daily_raw_metrics`);
  await (await db()).execute(sql`DELETE FROM perf_employees`);
  await (await db()).execute(sql`DELETE FROM perf_dashboard_meta`);

  // Insert employees
  for (const emp of parsed.employees) {
    await (await db()).execute(sql`
      INSERT INTO perf_employees (ohr, name, planning_group, sup_name, shift_time, updated_at)
      VALUES (${emp.ohr}, ${emp.name}, ${emp.planning_group}, ${emp.sup_name}, ${emp.shift_time}, NOW())
      ON DUPLICATE KEY UPDATE
        name = VALUES(name), planning_group = VALUES(planning_group),
        sup_name = VALUES(sup_name), shift_time = VALUES(shift_time), updated_at = NOW()
    `);

    // Insert metrics per timeframe
    for (const [tfKey, mv] of Object.entries(emp.metrics)) {
      const m = mv as any;
      if (!m) continue;
      const tf = parsed.timeframes.find((t: any) => t.key === tfKey);
      if (!tf) continue;
      await (await db()).execute(sql`
        INSERT INTO perf_employee_metrics (ohr, timeframe_key, timeframe_label, timeframe_type,
          utilization, occupancy, throughput, aht, nht, closures, sync_id, updated_at)
        VALUES (${emp.ohr}, ${tfKey}, ${tf.label}, ${tf.type},
          ${m.utilization}, ${m.occupancy}, ${m.throughput}, ${m.aht}, ${m.nht}, ${m.closures},
          ${syncId}, NOW())
        ON DUPLICATE KEY UPDATE
          timeframe_label = VALUES(timeframe_label), timeframe_type = VALUES(timeframe_type),
          utilization = VALUES(utilization), occupancy = VALUES(occupancy), throughput = VALUES(throughput),
          aht = VALUES(aht), nht = VALUES(nht), closures = VALUES(closures),
          sync_id = VALUES(sync_id), updated_at = NOW()
      `);
    }
  }

  // Insert daily raw metrics (batch)
  for (const d of parsed.dailyRaw) {
    await (await db()).execute(sql`
      INSERT INTO perf_daily_raw_metrics (ohr, we_date, production_sec, production_work_sec,
        srt_billable_sec, decisioned_count, ticket_count, ht_sec, nht_sec, tht_sec,
        skip_count, volume, sync_id, updated_at)
      VALUES (${d.ohr}, ${d.weDate}, ${d.production_sec}, ${d.production_work_sec},
        ${d.srt_billable_sec}, ${d.decisioned_count}, ${d.ticket_count}, ${d.ht_sec},
        ${d.nht_sec}, ${d.tht_sec}, ${d.skip_count}, ${d.volume}, ${syncId}, NOW())
      ON DUPLICATE KEY UPDATE
        production_sec = VALUES(production_sec), production_work_sec = VALUES(production_work_sec),
        srt_billable_sec = VALUES(srt_billable_sec), decisioned_count = VALUES(decisioned_count),
        ticket_count = VALUES(ticket_count), ht_sec = VALUES(ht_sec), nht_sec = VALUES(nht_sec),
        tht_sec = VALUES(tht_sec), skip_count = VALUES(skip_count), volume = VALUES(volume),
        sync_id = VALUES(sync_id), updated_at = NOW()
    `);
  }

  // Insert metadata
  const metaEntries = [
    { key: "timeframes", value: JSON.stringify(parsed.timeframes) },
    { key: "metrics", value: JSON.stringify(parsed.metrics) },
    { key: "planning_groups", value: JSON.stringify(parsed.planningGroups) },
    { key: "supervisors", value: JSON.stringify(parsed.supervisors) },
    { key: "shift_times", value: JSON.stringify(parsed.shiftTimes) },
    { key: "team_averages", value: JSON.stringify(parsed.teamAverages) },
  ];

  for (const entry of metaEntries) {
    await (await db()).execute(sql`
      INSERT INTO perf_dashboard_meta (meta_key, meta_value, updated_at)
      VALUES (${entry.key}, ${entry.value}, NOW())
      ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value), updated_at = NOW()
    `);
  }
}

// ---- Dashboard Data Read ----

export async function getDashboardData() {
  // Get employees
  const empResult: any = await (await db()).execute(sql`SELECT * FROM perf_employees ORDER BY name`);
  const empRows = Array.isArray(empResult) ? empResult[0] : empResult;

  // Get all metrics
  const metResult: any = await (await db()).execute(sql`SELECT * FROM perf_employee_metrics`);
  const metRows = Array.isArray(metResult) ? metResult[0] : metResult;

  // Get metadata
  const metaResult: any = await (await db()).execute(sql`SELECT * FROM perf_dashboard_meta`);
  const metaRows = Array.isArray(metaResult) ? metaResult[0] : metaResult;

  const meta: Record<string, any> = {};
  for (const row of metaRows) {
    const val = typeof row.meta_value === "string" ? JSON.parse(row.meta_value) : row.meta_value;
    meta[row.meta_key] = val;
  }

  // Build employee objects with metrics
  const metricsMap = new Map<number, Record<string, any>>();
  for (const m of metRows) {
    if (!metricsMap.has(m.ohr)) metricsMap.set(m.ohr, {});
    metricsMap.get(m.ohr)![m.timeframe_key] = {
      utilization: m.utilization,
      occupancy: m.occupancy,
      throughput: m.throughput,
      aht: m.aht,
      nht: m.nht,
      closures: m.closures,
    };
  }

  const employees = empRows.map((e: any) => ({
    ohr: e.ohr,
    name: e.name,
    planning_group: e.planning_group,
    sup_name: e.sup_name,
    shift_time: e.shift_time,
    metrics: metricsMap.get(e.ohr) || {},
  }));

  return {
    employees,
    timeframes: meta.timeframes || [],
    metrics: meta.metrics || [],
    planning_groups: meta.planning_groups || [],
    supervisors: meta.supervisors || [],
    shift_times: meta.shift_times || [],
    team_averages: meta.team_averages || {},
    total_employees: employees.length,
  };
}

// ---- KPI Aggregation ----

export async function getKpiForDateRange(startDate: string, endDate: string, ohrList?: number[]) {
  let result: any;
  if (ohrList && ohrList.length > 0) {
    const ohrPlaceholders = ohrList.join(",");
    result = await (await db()).execute(sql`
      SELECT
        SUM(production_sec) as total_production_sec,
        SUM(production_work_sec) as total_production_work_sec,
        SUM(srt_billable_sec) as total_srt_billable_sec,
        SUM(decisioned_count) as total_decisioned_count,
        SUM(ticket_count) as total_ticket_count,
        SUM(ht_sec) as total_ht_sec,
        SUM(nht_sec) as total_nht_sec,
        SUM(tht_sec) as total_tht_sec
      FROM perf_daily_raw_metrics
      WHERE we_date >= ${startDate} AND we_date <= ${endDate}
        AND ohr IN (${sql.raw(ohrPlaceholders)})
    `);
  } else {
    result = await (await db()).execute(sql`
      SELECT
        SUM(production_sec) as total_production_sec,
        SUM(production_work_sec) as total_production_work_sec,
        SUM(srt_billable_sec) as total_srt_billable_sec,
        SUM(decisioned_count) as total_decisioned_count,
        SUM(ticket_count) as total_ticket_count,
        SUM(ht_sec) as total_ht_sec,
        SUM(nht_sec) as total_nht_sec,
        SUM(tht_sec) as total_tht_sec
      FROM perf_daily_raw_metrics
      WHERE we_date >= ${startDate} AND we_date <= ${endDate}
    `);
  }

  const rows = Array.isArray(result) ? result[0] : result;
  const r = rows[0] || {};

  const totalProdSec = Number(r.total_production_sec) || 0;
  const totalProdWorkSec = Number(r.total_production_work_sec) || 0;
  const totalSrtBillable = Number(r.total_srt_billable_sec) || 0;
  const totalDecisioned = Number(r.total_decisioned_count) || 0;
  const totalTicket = Number(r.total_ticket_count) || 0;
  const totalTht = Number(r.total_tht_sec) || 0;
  const totalNht = Number(r.total_nht_sec) || 0;

  const utilization = totalSrtBillable > 0 ? totalProdSec / totalSrtBillable : null;
  const occupancy = totalProdSec > 0 ? totalProdWorkSec / totalProdSec : null;
  const prodWorkHrs = totalProdWorkSec / 3600;
  const throughput = prodWorkHrs > 0 ? totalDecisioned / prodWorkHrs : null;
  const totalHandleNonHandle = totalTht + totalNht;
  const aht = totalTicket > 0 ? totalHandleNonHandle / totalTicket : null;
  const nht = totalHandleNonHandle > 0 ? totalNht / totalHandleNonHandle : null;
  const closures = totalTicket > 0 ? totalTicket : null;

  return { utilization, occupancy, throughput, aht, nht, closures };
}
