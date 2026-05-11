/**
 * Performance Dashboard — .xlsb Parser
 * Reads "UOT Raw" and "AHT Raw" sheets from .xlsb files and extracts KPI data.
 */
// Lazy-loaded xlsx — 211ms import time, only needed when parsing uploaded files.
let _xlsx: typeof import("xlsx") | null = null;
async function getXLSX() {
  if (!_xlsx) {
    _xlsx = await import("xlsx");
  }
  return _xlsx;
}

// Planning group mapping
const PLANNING_GROUP_MAP: Record<string, string> = {
  MASA_MAFSA_CTR_SCALED_REVIEW: "S-ABF",
  CEI_TASKFORCE_CTR: "CS-ABF",
  CSO_CTR: "CSO_CTR",
  FAD_CTR: "FAD_CTR",
};

const ALLOWED_PLANNING_GROUPS = new Set(Object.keys(PLANNING_GROUP_MAP));

interface RosterEntry {
  ohr: number;
  name: string;
  planningGroup: string;
  supervisorName: string;
  shiftTime: string;
}

interface DailyRaw {
  ohr: number;
  weDate: string; // YYYY-MM-DD
  production_sec: number;
  production_work_sec: number;
  srt_billable_sec: number;
  decisioned_count: number;
  ticket_count: number;
  ht_sec: number;
  nht_sec: number;
  tht_sec: number;
  skip_count: number;
  volume: number;
}

interface MetricValues {
  utilization: number | null;
  occupancy: number | null;
  throughput: number | null;
  aht: number | null;
  nht: number | null;
  closures: number | null;
}

interface TimeframeInfo {
  key: string;
  label: string;
  type: "weekly" | "monthly";
}

interface EmployeeResult {
  ohr: number;
  name: string;
  planning_group: string;
  sup_name: string;
  shift_time: string;
  metrics: Record<string, MetricValues>;
}

export interface ParsedResult {
  employees: EmployeeResult[];
  timeframes: TimeframeInfo[];
  metrics: { key: string; label: string; format: string }[];
  planningGroups: string[];
  supervisors: string[];
  shiftTimes: string[];
  dailyRaw: DailyRaw[];
  teamAverages: Record<string, Record<string, number | null>>;
}

/** Convert Excel serial date to JS Date */
function excelDateToJS(serial: number): Date {
  const utcDays = Math.floor(serial - 25569);
  return new Date(utcDays * 86400 * 1000);
}

/** Format date as YYYY-MM-DD */
function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Format date as MM/DD for week ending labels */
function formatWE(d: Date): string {
  return `WE ${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

/** Get month label like "JAN", "FEB", etc. */
function getMonthLabel(d: Date): string {
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  return months[d.getMonth()];
}

function safeNum(v: any): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

/**
 * Parse the .xlsb buffer and return structured dashboard data.
 */
export async function parseMainMetrics(
  buffer: Buffer,
  rosterMap: Map<number, RosterEntry>
): Promise<ParsedResult> {
  const XLSX = await getXLSX();
  const wb = XLSX.read(buffer, { type: "buffer" });

  // --- Parse UOT Raw sheet ---
  const uotSheet = wb.Sheets["UOT Raw"];
  if (!uotSheet) throw new Error('Sheet "UOT Raw" not found in file');
  const uotRows: any[] = XLSX.utils.sheet_to_json(uotSheet);

  // --- Parse AHT Raw sheet ---
  const ahtSheet = wb.Sheets["AHT Raw"];
  if (!ahtSheet) throw new Error('Sheet "AHT Raw" not found in file');
  const ahtRows: any[] = XLSX.utils.sheet_to_json(ahtSheet);

  // Collect daily raw data keyed by ohr+weDate
  const dailyMap = new Map<string, DailyRaw>();
  const weSet = new Set<string>(); // YYYY-MM-DD week ending dates

  // Process UOT Raw
  for (const row of uotRows) {
    const pg = String(row.planning_group || "").trim();
    if (!ALLOWED_PLANNING_GROUPS.has(pg)) continue;
    if (String(row.tenure_state || "").trim() !== "Production") continue;

    const ohr = parseInt(row.actor_id);
    if (!ohr || isNaN(ohr)) continue;

    const weSerial = safeNum(row.WE);
    if (!weSerial) continue;
    const weDate = formatDate(excelDateToJS(weSerial));
    weSet.add(weDate);

    const key = `${ohr}_${weDate}`;
    if (!dailyMap.has(key)) {
      dailyMap.set(key, {
        ohr,
        weDate,
        production_sec: 0,
        production_work_sec: 0,
        srt_billable_sec: 0,
        decisioned_count: 0,
        ticket_count: 0,
        ht_sec: 0,
        nht_sec: 0,
        tht_sec: 0,
        skip_count: 0,
        volume: 0,
      });
    }
    const d = dailyMap.get(key)!;
    d.production_sec += safeNum(row.time_in_available_status_sec);
    d.production_work_sec += safeNum(row.time_job_assigned_in_available_status_sec);
    // Note: "SRT Billable " has a trailing space in the Excel column
    d.srt_billable_sec += safeNum(row["SRT Billable "] || row["SRT Billable"] || row.srt_billable_sec);
    d.decisioned_count += safeNum(row.num_decision);
  }

  // Process AHT Raw
  for (const row of ahtRows) {
    const pg = String(row.planning_group || "").trim();
    if (!ALLOWED_PLANNING_GROUPS.has(pg)) continue;
    if (String(row.tenure_state || "").trim() !== "Production") continue;

    const ohr = parseInt(row.actor_id);
    if (!ohr || isNaN(ohr)) continue;

    const weSerial = safeNum(row.WE);
    if (!weSerial) continue;
    const weDate = formatDate(excelDateToJS(weSerial));
    weSet.add(weDate);

    const key = `${ohr}_${weDate}`;
    if (!dailyMap.has(key)) {
      dailyMap.set(key, {
        ohr,
        weDate,
        production_sec: 0,
        production_work_sec: 0,
        srt_billable_sec: 0,
        decisioned_count: 0,
        ticket_count: 0,
        ht_sec: 0,
        nht_sec: 0,
        tht_sec: 0,
        skip_count: 0,
        volume: 0,
      });
    }
    const d = dailyMap.get(key)!;
    d.ticket_count += safeNum(row.SUM_rep_touches);
    d.ht_sec += safeNum(row.SUM_handle_time_in_sec);
    d.nht_sec += safeNum(row.SUM_nohandle_time_sec);
    d.tht_sec += safeNum(row["Total Handle Time (New)"]);
    d.skip_count += safeNum(row.SUM_NUM_SKIP);
    d.volume += safeNum(row.Volume);
  }

  const dailyRaw = Array.from(dailyMap.values());

  // Sort week ending dates
  const sortedWEs = Array.from(weSet).sort();

  // Build timeframes: weekly + monthly
  const timeframes: TimeframeInfo[] = [];
  const monthSet = new Set<string>();

  for (const weStr of sortedWEs) {
    const d = new Date(weStr + "T00:00:00");
    const weLabel = formatWE(d);
    timeframes.push({ key: weLabel, label: weLabel, type: "weekly" });
    monthSet.add(getMonthLabel(d));
  }

  for (const m of Array.from(monthSet)) {
    timeframes.push({ key: m, label: m, type: "monthly" });
  }

  // Build per-employee metrics
  // Group daily raw by OHR
  const ohrDailyMap = new Map<number, DailyRaw[]>();
  for (const d of dailyRaw) {
    if (!ohrDailyMap.has(d.ohr)) ohrDailyMap.set(d.ohr, []);
    ohrDailyMap.get(d.ohr)!.push(d);
  }

  // Compute KPIs per employee per timeframe
  const employees: EmployeeResult[] = [];
  const allOhrs = Array.from(ohrDailyMap.keys());

  // Build a mapping from weDate to weLabel and monthLabel
  const weDateToLabel = new Map<string, string>();
  const weDateToMonth = new Map<string, string>();
  for (const weStr of sortedWEs) {
    const d = new Date(weStr + "T00:00:00");
    weDateToLabel.set(weStr, formatWE(d));
    weDateToMonth.set(weStr, getMonthLabel(d));
  }

  for (const ohr of allOhrs) {
    const rows = ohrDailyMap.get(ohr)!;
    const roster = rosterMap.get(ohr);

    const metrics: Record<string, MetricValues> = {};

    // Weekly metrics
    for (const weStr of sortedWEs) {
      const weLabel = weDateToLabel.get(weStr)!;
      const weekRows = rows.filter((r) => r.weDate === weStr);
      metrics[weLabel] = computeKPI(weekRows);
    }

    // Monthly metrics
    for (const month of Array.from(monthSet)) {
      const monthRows = rows.filter((r) => weDateToMonth.get(r.weDate) === month);
      metrics[month] = computeKPI(monthRows);
    }

    employees.push({
      ohr,
      name: roster?.name || String(ohr),
      planning_group: roster?.planningGroup || "",
      sup_name: roster?.supervisorName || "",
      shift_time: roster?.shiftTime || "",
      metrics,
    });
  }

  // Compute team averages per timeframe
  const teamAverages: Record<string, Record<string, number | null>> = {};
  const allTfKeys = timeframes.map((t) => t.key);

  for (const tfKey of allTfKeys) {
    const vals = employees.map((e) => e.metrics[tfKey]).filter(Boolean);
    teamAverages[tfKey] = computeTeamAverage(vals);
  }

  // Collect unique values for filters
  const planningGroups = Array.from(new Set(employees.map((e) => e.planning_group).filter(Boolean))).sort();
  const supervisors = Array.from(new Set(employees.map((e) => e.sup_name).filter(Boolean))).sort();
  const shiftTimes = Array.from(new Set(employees.map((e) => e.shift_time).filter(Boolean))).sort();

  const metricDefs = [
    { key: "utilization", label: "UTILIZATION", format: "percentage" },
    { key: "occupancy", label: "OCCUPANCY", format: "percentage" },
    { key: "throughput", label: "THROUGHPUT", format: "decimal" },
    { key: "aht", label: "AHT", format: "decimal" },
    { key: "nht", label: "NHT", format: "percentage" },
    { key: "closures", label: "CLOSURES", format: "integer" },
  ];

  return {
    employees,
    timeframes,
    metrics: metricDefs,
    planningGroups,
    supervisors,
    shiftTimes,
    dailyRaw,
    teamAverages,
  };
}

/** Compute KPIs from a set of daily raw rows using sum-before-divide */
function computeKPI(rows: DailyRaw[]): MetricValues {
  if (rows.length === 0) {
    return { utilization: null, occupancy: null, throughput: null, aht: null, nht: null, closures: null };
  }

  let totalProdSec = 0,
    totalProdWorkSec = 0,
    totalSrtBillable = 0,
    totalDecisioned = 0,
    totalTicket = 0,
    totalTht = 0,
    totalNht = 0;

  for (const r of rows) {
    totalProdSec += r.production_sec;
    totalProdWorkSec += r.production_work_sec;
    totalSrtBillable += r.srt_billable_sec;
    totalDecisioned += r.decisioned_count;
    totalTicket += r.ticket_count;
    totalTht += r.tht_sec;
    totalNht += r.nht_sec;
  }

  const utilization = totalSrtBillable > 0 ? totalProdSec / totalSrtBillable : null;
  const occupancy = totalProdSec > 0 ? totalProdWorkSec / totalProdSec : null;
  const prodWorkHrs = totalProdWorkSec / 3600;
  const throughput = prodWorkHrs > 0 ? totalDecisioned / prodWorkHrs : null;
  const totalHandleNonHandle = totalTht + totalNht;
  const ahtVal = totalTicket > 0 ? totalHandleNonHandle / totalTicket : null;
  const nhtVal = totalHandleNonHandle > 0 ? totalNht / totalHandleNonHandle : null;
  const closures = totalTicket > 0 ? totalTicket : null;

  return { utilization, occupancy, throughput, aht: ahtVal, nht: nhtVal, closures };
}

/** Compute team average for a set of metric values */
function computeTeamAverage(vals: MetricValues[]): Record<string, number | null> {
  const keys: (keyof MetricValues)[] = ["utilization", "occupancy", "throughput", "aht", "nht", "closures"];
  const result: Record<string, number | null> = {};

  for (const k of keys) {
    const valid = vals.map((v) => v[k]).filter((x) => x !== null && x !== undefined) as number[];
    if (valid.length === 0) {
      result[k] = null;
    } else if (k === "closures") {
      result[k] = valid.reduce((a, b) => a + b, 0);
    } else {
      result[k] = valid.reduce((a, b) => a + b, 0) / valid.length;
    }
  }

  return result;
}
