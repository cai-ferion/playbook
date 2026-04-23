/**
 * Batch 43: Data Cleanup
 * 1) Update blank statuses to "Pending Support Review" for QA Feedback coaching logs
 * 2) Delete all 2025-dated records from all tables
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// ============================================================
// PART 1: Fix QA Feedback blank statuses
// ============================================================
console.log("=== PART 1: QA Feedback Status Fix ===\n");

// Audit first
const [qaAudit] = await conn.execute(
  "SELECT COUNT(*) as cnt FROM io_coaching WHERE coaching_type = 'QA Feedback' AND (status IS NULL OR status = '')"
);
console.log(`  QA Feedback logs with blank status: ${qaAudit[0].cnt}`);

if (qaAudit[0].cnt > 0) {
  const [updateResult] = await conn.execute(
    "UPDATE io_coaching SET status = 'Pending Support Review' WHERE coaching_type = 'QA Feedback' AND (status IS NULL OR status = '')"
  );
  console.log(`  Updated ${updateResult.affectedRows} rows to "Pending Support Review"`);
} else {
  console.log("  No rows to update.");
}

// Verify
const [qaVerify] = await conn.execute(
  "SELECT status, COUNT(*) as cnt FROM io_coaching WHERE coaching_type = 'QA Feedback' GROUP BY status"
);
console.log("  QA Feedback status distribution after fix:");
for (const r of qaVerify) console.log(`    ${r.status || '(blank)'}: ${r.cnt}`);

// ============================================================
// PART 2: Audit 2025 data across all tables
// ============================================================
console.log("\n=== PART 2: Audit 2025 Data ===\n");

// io_attendance — date column: log_date
const [att2025] = await conn.execute(
  "SELECT COUNT(*) as cnt FROM io_attendance WHERE log_date < '2026-01-01'"
);
console.log(`  io_attendance (log_date < 2026-01-01): ${att2025[0].cnt}`);

// io_coaching — date column: coaching_date
const [coach2025] = await conn.execute(
  "SELECT COUNT(*) as cnt FROM io_coaching WHERE coaching_date < '2026-01-01'"
);
console.log(`  io_coaching (coaching_date < 2026-01-01): ${coach2025[0].cnt}`);

// io_coaching_ztp — date column: created_at or infraction_date
const [ztp2025] = await conn.execute(
  "SELECT COUNT(*) as cnt FROM io_coaching_ztp WHERE created_at < '2026-01-01'"
);
console.log(`  io_coaching_ztp (created_at < 2026-01-01): ${ztp2025[0].cnt}`);

// io_insights — date column: created_at
const [ins2025] = await conn.execute(
  "SELECT COUNT(*) as cnt FROM io_insights WHERE created_at < '2026-01-01'"
);
console.log(`  io_insights (created_at < 2026-01-01): ${ins2025[0].cnt}`);

// io_tasks — date column: created_at
const [tasks2025] = await conn.execute(
  "SELECT COUNT(*) as cnt FROM io_tasks WHERE created_at < '2026-01-01'"
);
console.log(`  io_tasks (created_at < 2026-01-01): ${tasks2025[0].cnt}`);

// io_task_comments — date column: created_at
const [comments2025] = await conn.execute(
  "SELECT COUNT(*) as cnt FROM io_task_comments WHERE created_at < '2026-01-01'"
);
console.log(`  io_task_comments (created_at < 2026-01-01): ${comments2025[0].cnt}`);

// io_notifications — date column: created_at
const [notif2025] = await conn.execute(
  "SELECT COUNT(*) as cnt FROM io_notifications WHERE created_at < '2026-01-01'"
);
console.log(`  io_notifications (created_at < 2026-01-01): ${notif2025[0].cnt}`);

// io_audit_log — date column: timestamp
const [audit2025] = await conn.execute(
  "SELECT COUNT(*) as cnt FROM io_audit_log WHERE timestamp < '2026-01-01'"
);
console.log(`  io_audit_log (timestamp < 2026-01-01): ${audit2025[0].cnt}`);

// io_leaves — date column: start_date
const [leaves2025] = await conn.execute(
  "SELECT COUNT(*) as cnt FROM io_leaves WHERE start_date < '2026-01-01'"
);
console.log(`  io_leaves (start_date < 2026-01-01): ${leaves2025[0].cnt}`);

// io_gchat_queue — date column: created_at
const [gchat2025] = await conn.execute(
  "SELECT COUNT(*) as cnt FROM io_gchat_queue WHERE created_at < '2026-01-01'"
);
console.log(`  io_gchat_queue (created_at < 2026-01-01): ${gchat2025[0].cnt}`);

// ============================================================
// PART 3: Delete 2025 data
// ============================================================
console.log("\n=== PART 3: Deleting 2025 Data ===\n");

// Delete in dependency order (children first)
const deletes = [
  { table: 'io_task_comments', where: "created_at < '2026-01-01'" },
  { table: 'io_tasks', where: "created_at < '2026-01-01'" },
  { table: 'io_notifications', where: "created_at < '2026-01-01'" },
  { table: 'io_audit_log', where: "timestamp < '2026-01-01'" },
  { table: 'io_coaching_ztp', where: "created_at < '2026-01-01'" },
  { table: 'io_coaching', where: "coaching_date < '2026-01-01'" },
  { table: 'io_attendance', where: "log_date < '2026-01-01'" },
  { table: 'io_insights', where: "created_at < '2026-01-01'" },
  { table: 'io_leaves', where: "start_date < '2026-01-01'" },
  { table: 'io_gchat_queue', where: "created_at < '2026-01-01'" },
];

for (const d of deletes) {
  const [result] = await conn.execute(`DELETE FROM ${d.table} WHERE ${d.where}`);
  console.log(`  ${d.table}: deleted ${result.affectedRows} rows`);
}

// ============================================================
// PART 4: Verify
// ============================================================
console.log("\n=== PART 4: Verification ===\n");

const tables = [
  { table: 'io_attendance', col: 'log_date' },
  { table: 'io_coaching', col: 'coaching_date' },
  { table: 'io_coaching_ztp', col: 'created_at' },
  { table: 'io_insights', col: 'created_at' },
  { table: 'io_tasks', col: 'created_at' },
  { table: 'io_task_comments', col: 'created_at' },
  { table: 'io_notifications', col: 'created_at' },
  { table: 'io_audit_log', col: 'timestamp' },
  { table: 'io_leaves', col: 'start_date' },
  { table: 'io_gchat_queue', col: 'created_at' },
];

for (const t of tables) {
  const [remaining] = await conn.execute(`SELECT COUNT(*) as cnt FROM ${t.table} WHERE ${t.col} < '2026-01-01'`);
  const [total] = await conn.execute(`SELECT COUNT(*) as cnt FROM ${t.table}`);
  console.log(`  ${t.table}: ${remaining[0].cnt} pre-2026 rows remaining, ${total[0].cnt} total rows`);
}

await conn.end();
console.log("\nDone!");
