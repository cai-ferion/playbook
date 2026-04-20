import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  uri: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true },
  connectTimeout: 10000,
});

async function tryDDL(sql, label) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await conn.query(sql);
      console.log(`OK: ${label}`);
      return true;
    } catch (e) {
      console.log(`Attempt ${attempt}/3 FAIL (${label}): ${e.message.substring(0, 80)}`);
      if (attempt < 3) {
        console.log('Waiting 10s before retry...');
        await new Promise(r => setTimeout(r, 10000));
      }
    }
  }
  return false;
}

// Check if table already exists
const [tables] = await conn.query(`SHOW TABLES LIKE 'io_corrective_actions'`);
if (tables.length > 0) {
  console.log('Table already exists, checking columns...');
} else {
  // Create minimal table first
  const created = await tryDDL(
    `CREATE TABLE io_corrective_actions (id varchar(36) NOT NULL PRIMARY KEY)`,
    'CREATE TABLE (minimal)'
  );
  if (!created) {
    console.log('FATAL: Cannot create table. PD server still down.');
    await conn.end();
    process.exit(1);
  }
}

// Add columns one at a time (idempotent)
const columns = [
  ['employee_name', "varchar(255) NOT NULL DEFAULT ''"],
  ['ohr_id', "varchar(20) NOT NULL DEFAULT ''"],
  ['employee_email', 'varchar(320)'],
  ['supervisor_name', 'varchar(255)'],
  ['supervisor_ohr', 'varchar(20)'],
  ['supervisor_email', 'varchar(320)'],
  ['planning_group', 'varchar(100)'],
  ['actual_role', 'varchar(100)'],
  ['nte_type', 'varchar(100)'],
  ['date_of_incident', 'varchar(64)'],
  ['incident_description', 'text'],
  ['policy_violated', 'text'],
  ['violations', 'text'],
  ['response_deadline', 'varchar(64)'],
  ['status', "varchar(50) NOT NULL DEFAULT 'Served'"],
  ['served_date', 'varchar(64)'],
  ['cap_level', 'varchar(50)'],
  ['cap_active_days', 'int'],
  ['cap_decision_date', 'varchar(64)'],
  ['cap_decision_by', 'varchar(255)'],
  ['cap_decision_by_ohr', 'varchar(20)'],
  ['cap_remarks', 'text'],
  ['cap_start_date', 'varchar(64)'],
  ['cap_expiry_date', 'varchar(64)'],
  ['suspension_days', 'int'],
  ['nod_issued', 'boolean DEFAULT false'],
  ['nod_date', 'varchar(64)'],
  ['nod_summary', 'text'],
  ['linked_coaching_id', 'varchar(36)'],
  ['attachments', 'text'],
  ['created_by', 'varchar(255)'],
  ['created_by_ohr', 'varchar(20)'],
  ['created_at', 'varchar(64)'],
  ['updated_at', 'varchar(64)'],
];

for (const [name, def] of columns) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'io_corrective_actions' AND COLUMN_NAME = ?`,
    [name]
  );
  if (rows.length > 0) {
    console.log(`SKIP: ${name} (exists)`);
    continue;
  }
  await tryDDL(`ALTER TABLE io_corrective_actions ADD COLUMN ${name} ${def}`, `ADD ${name}`);
}

console.log('MIGRATION COMPLETE');
await conn.end();
