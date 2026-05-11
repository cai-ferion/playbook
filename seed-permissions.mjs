/**
 * Seed io_permissions table with role-based defaults — batch insert for performance.
 */
import mysql from 'mysql2/promise';

const ALL_KEYS = [
  'nav.anchor', 'nav.compass', 'nav.haven', 'nav.sandbox', 'nav.horizon',
  'nav.helm', 'nav.regimen', 'nav.admin',
  'anchor.input_portal', 'anchor.dashboard', 'anchor.billing_compliance',
  'anchor.risk_intelligence', 'anchor.sync_history',
  'anchor.edit_attendance', 'anchor.download_csv', 'anchor.sync_roster',
  'regimen.onboarding_tab', 'regimen.permissions_tab', 'regimen.edit_employee', 'regimen.export_csv',
];

function getDefaults(role, ohrId) {
  if (ohrId === '740045023') return Object.fromEntries(ALL_KEYS.map(k => [k, true]));

  const b = Object.fromEntries(ALL_KEYS.map(k => [k, false]));
  if (role === 'Agent') { b['nav.helm'] = true; return b; }

  // All non-agents
  b['nav.anchor'] = true;
  b['anchor.input_portal'] = true;
  b['anchor.dashboard'] = true;
  b['anchor.billing_compliance'] = true;
  b['anchor.risk_intelligence'] = true;
  b['anchor.download_csv'] = true;
  b['nav.helm'] = true;
  b['nav.regimen'] = true;
  b['regimen.export_csv'] = true;

  if (role === 'Team Lead') b['anchor.edit_attendance'] = true;
  if (role === 'Manager') {
    b['anchor.edit_attendance'] = true;
    b['nav.compass'] = true;
  }
  if (ohrId === '740044909') {
    b['anchor.edit_attendance'] = true;
    b['nav.compass'] = true;
    b['regimen.edit_employee'] = true;
  }
  if (ohrId === '703212987') b['regimen.edit_employee'] = true;
  return b;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('No DATABASE_URL'); process.exit(1); }
  const conn = await mysql.createConnection(url);

  const [employees] = await conn.execute('SELECT ohr_id, actual_role FROM io_employees WHERE employement_status = ?', ['Active']);
  console.log(`Found ${employees.length} active employees`);

  // Build all rows
  const rows = [];
  for (const emp of employees) {
    const defaults = getDefaults(emp.actual_role, emp.ohr_id);
    for (const [key, granted] of Object.entries(defaults)) {
      rows.push([emp.ohr_id, key, granted ? 1 : 0, 'SYSTEM']);
    }
  }

  // Batch insert in chunks of 500
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '(?, ?, ?, ?)').join(', ');
    const flat = chunk.flat();
    await conn.execute(
      `INSERT INTO io_permissions (ohr_id, permission_key, granted, updated_by) VALUES ${placeholders} ON DUPLICATE KEY UPDATE id=id`,
      flat
    );
    console.log(`  Inserted ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
  }

  console.log(`Done. Total rows: ${rows.length}`);
  await conn.end();
}

main().catch(e => { console.error(e); process.exit(1); });
