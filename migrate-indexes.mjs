// One-time migration script to apply performance indexes
// Run via: node migrate-indexes.mjs
import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const db = drizzle(DATABASE_URL);

const indexes = [
  // io_attendance
  "CREATE INDEX IF NOT EXISTS idx_attendance_log_date ON io_attendance (log_date)",
  "CREATE INDEX IF NOT EXISTS idx_attendance_ohr_date ON io_attendance (ohr_id, log_date)",
  "CREATE INDEX IF NOT EXISTS idx_attendance_tag_date ON io_attendance (tag, log_date)",
  // io_employees
  "CREATE INDEX IF NOT EXISTS idx_employees_supervisor ON io_employees (supervisor_name)",
  "CREATE INDEX IF NOT EXISTS idx_employees_pg_role ON io_employees (planning_group, actual_role)",
  "CREATE INDEX IF NOT EXISTS idx_employees_status ON io_employees (employement_status)",
  // io_leaves
  "CREATE INDEX IF NOT EXISTS idx_leaves_status ON io_leaves (status)",
  "CREATE INDEX IF NOT EXISTS idx_leaves_ohr_start ON io_leaves (ohr_id, start_date)",
  "CREATE INDEX IF NOT EXISTS idx_leaves_start_status ON io_leaves (start_date, status)",
  // io_coaching
  "CREATE INDEX IF NOT EXISTS idx_coaching_coachee_ohr ON io_coaching (coachee_ohr)",
  "CREATE INDEX IF NOT EXISTS idx_coaching_date ON io_coaching (coaching_date)",
  // io_notifications
  "CREATE INDEX IF NOT EXISTS idx_notifications_target_read ON io_notifications (target_ohr, is_read)",
  "CREATE INDEX IF NOT EXISTS idx_notifications_created ON io_notifications (created_at)",
  // io_shift_extensions
  "CREATE INDEX IF NOT EXISTS idx_shift_ext_date ON io_shift_extensions (shift_date)",
  "CREATE INDEX IF NOT EXISTS idx_shift_ext_status ON io_shift_extensions (overall_status)",
  // io_productivity_hours
  "CREATE INDEX IF NOT EXISTS idx_prod_hours_ohr_date ON io_productivity_hours (ohr, date)",
  // io_tardiness
  "CREATE INDEX IF NOT EXISTS idx_tardiness_ohr_date ON io_tardiness (ohr_id, date)",
  "CREATE INDEX IF NOT EXISTS idx_tardiness_week ON io_tardiness (week_ending)",
  // io_srt_bill
  "CREATE INDEX IF NOT EXISTS idx_srt_bill_date ON io_srt_bill (date)",
  "CREATE INDEX IF NOT EXISTS idx_srt_bill_ohr ON io_srt_bill (ohr_id)",
];

let success = 0;
let skipped = 0;

for (const ddl of indexes) {
  try {
    await db.execute(sql.raw(ddl));
    success++;
    console.log(`✓ ${ddl.split(" ON ")[1]}`);
  } catch (err) {
    if (err.message?.includes("Duplicate") || err.message?.includes("already exists")) {
      skipped++;
      console.log(`⊘ Already exists: ${ddl.split(" ON ")[1]}`);
    } else {
      console.error(`✗ FAILED: ${ddl.split(" ON ")[1]} — ${err.message}`);
    }
  }
}

console.log(`\nDone: ${success} created, ${skipped} already existed.`);
process.exit(0);
