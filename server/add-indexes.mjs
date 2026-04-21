/**
 * One-time migration: Add performance indexes to hot query paths.
 * Run with: node server/add-indexes.mjs
 * 
 * MySQL/TiDB does not support IF NOT EXISTS on CREATE INDEX,
 * so we check information_schema first to avoid duplicate index errors.
 */
import mysql from 'mysql2/promise';
import 'dotenv/config';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const indexes = [
  // io_attendance: most queried table (60K+ rows)
  { table: 'io_attendance', name: 'idx_attendance_ohr_id', columns: '(ohr_id)' },
  { table: 'io_attendance', name: 'idx_attendance_log_date', columns: '(log_date)' },
  { table: 'io_attendance', name: 'idx_attendance_tag', columns: '(tag)' },
  { table: 'io_attendance', name: 'idx_attendance_date_ohr', columns: '(log_date, ohr_id)' },
  { table: 'io_attendance', name: 'idx_attendance_snap_supervisor', columns: '(snap_supervisor)' },
  
  // io_employees: used in subqueries and lookups
  { table: 'io_employees', name: 'idx_employees_ohr_id', columns: '(ohr_id)' },
  { table: 'io_employees', name: 'idx_employees_actual_role', columns: '(actual_role)' },
  { table: 'io_employees', name: 'idx_employees_supervisor', columns: '(supervisor_name)' },
  
  // io_coaching_nte: queried by ohr_id for corrective actions
  { table: 'io_coaching_nte', name: 'idx_coaching_nte_ohr', columns: '(ohr_id)' },
  { table: 'io_coaching_nte', name: 'idx_coaching_nte_status', columns: '(status)' },
  
  // io_notifications: queried by target_ohr and sorted by created_at
  { table: 'io_notifications', name: 'idx_notifications_target', columns: '(target_ohr)' },
  { table: 'io_notifications', name: 'idx_notifications_created', columns: '(created_at)' },
  
  // io_coaching: queried by coach/coachee
  { table: 'io_coaching', name: 'idx_coaching_coach', columns: '(coach_ohr)' },
  { table: 'io_coaching', name: 'idx_coaching_coachee', columns: '(coachee_ohr)' },
  
  // io_tasks: queried by assignee and status
  { table: 'io_tasks', name: 'idx_tasks_assignee', columns: '(assignee_ohr)' },
  { table: 'io_tasks', name: 'idx_tasks_status', columns: '(status)' },
];

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  
  // Get the database name from the connection
  const [dbResult] = await conn.query('SELECT DATABASE() as db');
  const dbName = dbResult[0].db;
  console.log(`Connected to database: ${dbName}`);
  
  for (const idx of indexes) {
    // Check if index already exists
    const [existing] = await conn.query(
      `SELECT COUNT(*) as cnt FROM information_schema.statistics 
       WHERE table_schema = ? AND table_name = ? AND index_name = ?`,
      [dbName, idx.table, idx.name]
    );
    
    if (existing[0].cnt > 0) {
      console.log(`  SKIP  ${idx.name} (already exists)`);
      continue;
    }
    
    try {
      await conn.query(`CREATE INDEX ${idx.name} ON ${idx.table} ${idx.columns}`);
      console.log(`  OK    ${idx.name} ON ${idx.table}${idx.columns}`);
    } catch (err) {
      console.error(`  FAIL  ${idx.name}: ${err.message}`);
    }
  }
  
  await conn.end();
  console.log('Done.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
