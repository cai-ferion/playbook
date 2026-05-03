/**
 * Performance Dashboard — REST API Routes
 * Mount at /api/io/performance
 */
import { Router } from "express";
import {
  getDashboardData,
  getKpiForDateRange,
  getSyncHistory,
  getLatestSync,
  getSyncStatus,
  getSourceFile,
  createSyncRecord,
  updateSyncRecord,
  upsertSourceFile,
  syncDashboardData,
} from "../performanceDb";
import { parseMainMetrics } from "../performanceParser";
import { storagePut } from "../storage";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { emitChange } from "./emit-change.js";

const router = Router();

// Build roster lookup from io_employees table
async function buildRosterLookup(): Promise<Map<number, any>> {
  const d = await getDb();
  if (!d) return new Map();
  const result: any = await d.execute(sql`
    SELECT ohr_id, full_name, planning_group, supervisor_name, shift_time, actual_role
    FROM io_employees WHERE actual_role = 'Agent'
  `);
  const rows = Array.isArray(result) ? result[0] : result;
  const map = new Map();
  for (const row of rows) {
    const shiftTime = normalizeShiftTime(row.shift_time);
    if (!["GY Shift", "Mid Shift"].includes(shiftTime)) continue;
    const pgMap: Record<string, string> = {
      "S-ABF": "S-ABF",
      "CS-ABF": "CS-ABF",
      "CSO_CTR": "CSO_CTR",
      "FAD_CTR": "FAD_CTR",
    };
    const pg = pgMap[row.planning_group] || row.planning_group || "";
    map.set(Number(row.ohr_id), {
      ohr: Number(row.ohr_id),
      name: row.full_name || String(row.ohr_id),
      planningGroup: pg,
      supervisorName: row.supervisor_name || "",
      shiftTime,
    });
  }
  return map;
}

function normalizeShiftTime(raw: string | null): string {
  if (!raw) return "Unknown";
  if (raw === "Mid-Shift" || raw === "Mid Shift") return "Mid Shift";
  return raw;
}

// GET /data — Full dashboard data
router.get("/data", async (_req, res) => {
  try {
    const data = await getDashboardData();
    res.json(data);
  } catch (err: any) {
    console.error("[Performance] Error loading data:", err);
    res.status(500).json({ error: "Failed to load dashboard data" });
  }
});

// GET /kpi — KPI aggregation from raw daily data
router.get("/kpi", async (req, res) => {
  try {
    const { startDate, endDate, ohrList } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: "startDate and endDate are required" });
    }
    const ohrs = ohrList ? String(ohrList).split(",").map(Number).filter((n) => !isNaN(n)) : undefined;
    const kpi = await getKpiForDateRange(String(startDate), String(endDate), ohrs);
    res.json(kpi);
  } catch (err: any) {
    console.error("[Performance] Error computing KPI:", err);
    res.status(500).json({ error: "Failed to compute KPI" });
  }
});

// GET /sync-history — Recent sync events
router.get("/sync-history", async (_req, res) => {
  try {
    const history = await getSyncHistory();
    res.json(history);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load sync history" });
  }
});

// GET /sync-latest — Most recent completed sync
router.get("/sync-latest", async (_req, res) => {
  try {
    const latest = await getLatestSync();
    res.json(latest);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load latest sync" });
  }
});

// GET /sync-status/:syncId — Poll sync status
router.get("/sync-status/:syncId", async (req, res) => {
  try {
    const syncId = parseInt(req.params.syncId);
    if (isNaN(syncId)) return res.status(400).json({ error: "Invalid syncId" });
    const status = await getSyncStatus(syncId);
    res.json(status || { error: "Sync not found" });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load sync status" });
  }
});

// GET /source-file — Stored source file info
router.get("/source-file", async (_req, res) => {
  try {
    const file = await getSourceFile();
    res.json(file || { exists: false });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load source file" });
  }
});

// POST /upload — Upload .xlsb file (base64 body)
router.post("/upload", async (req, res) => {
  try {
    const { fileData, fileName, syncedBy, syncedByName } = req.body;
    if (!fileData || !fileName) {
      return res.status(400).json({ error: "fileData and fileName are required" });
    }

    // Create sync record
    const syncId = await createSyncRecord({ syncedBy, syncedByName });
    emitChange(req, "performance", "bulk_update", { action: "upload", syncId });
    emitChange(req, "performance", "bulk_update", { action: "upload", syncId });
    res.json({ syncId, status: "processing" });

    // Process in background
    processUpload(fileData, fileName, syncId).catch((err) => {
      console.error("[Performance] Background processing error:", err);
      updateSyncRecord(syncId, { status: "failed", errorMessage: err.message });
    });
  } catch (err: any) {
    console.error("[Performance] Upload error:", err);
    res.status(500).json({ error: "Failed to start upload" });
  }
});

// POST /resync — Re-process stored file
router.post("/resync", async (req, res) => {
  try {
    const { syncedBy, syncedByName } = req.body;
    const sourceFile = await getSourceFile();
    if (!sourceFile) {
      return res.status(404).json({ error: "No stored source file found" });
    }

    const syncId = await createSyncRecord({ syncedBy, syncedByName });
    emitChange(req, "performance", "bulk_update", { action: "resync", syncId });
    emitChange(req, "performance", "bulk_update", { action: "resync", syncId });
    res.json({ syncId, status: "processing" });

    // Download from S3 and re-process
    resyncFromS3(sourceFile.s3_url, syncId).catch((err) => {
      console.error("[Performance] Resync error:", err);
      updateSyncRecord(syncId, { status: "failed", errorMessage: err.message });
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to start resync" });
  }
});

// Background processing function
async function processUpload(base64Data: string, fileName: string, syncId: number) {
  try {
    const buffer = Buffer.from(base64Data, "base64");

    // Upload to S3
    const fileKey = `performance/${Date.now()}-${fileName}`;
    const { url: s3Url } = await storagePut(fileKey, buffer, "application/octet-stream");

    // Store file reference
    await upsertSourceFile({
      fileKey: "latest-xlsb",
      originalName: fileName,
      s3Key: fileKey,
      s3Url,
      fileSize: buffer.length,
    });

    // Build roster lookup
    const rosterMap = await buildRosterLookup();

    // Parse the file
    const parsed = await parseMainMetrics(buffer, rosterMap);

    // Sync to database
    await syncDashboardData(parsed, syncId);

    // Update sync record
    await updateSyncRecord(syncId, {
      status: "completed",
      totalEmployees: parsed.employees.length,
      filesUploaded: 1,
    });

    console.log(`[Performance] Sync ${syncId} completed: ${parsed.employees.length} employees`);
  } catch (err: any) {
    console.error("[Performance] Processing error:", err);
    await updateSyncRecord(syncId, { status: "failed", errorMessage: err.message });
  }
}

// Resync from S3 URL
async function resyncFromS3(s3Url: string, syncId: number) {
  try {
    const response = await fetch(s3Url);
    if (!response.ok) throw new Error(`Failed to download from S3: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const rosterMap = await buildRosterLookup();
    const parsed = await parseMainMetrics(buffer, rosterMap);
    await syncDashboardData(parsed, syncId);

    await updateSyncRecord(syncId, {
      status: "completed",
      totalEmployees: parsed.employees.length,
      filesUploaded: 1,
    });

    console.log(`[Performance] Resync ${syncId} completed: ${parsed.employees.length} employees`);
  } catch (err: any) {
    console.error("[Performance] Resync error:", err);
    await updateSyncRecord(syncId, { status: "failed", errorMessage: err.message });
  }
}

export default router;
