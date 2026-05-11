/**
 * Import WO/PL entries from roster into io_attendance (batch mode).
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { execSync } from 'child_process';
dotenv.config();

// Step 1: Parse roster
console.log("Step 1: Parsing roster...");
const py = `
import openpyxl, json
from datetime import datetime
wb = openpyxl.load_workbook("/home/ubuntu/upload/M4_ManilaGRO,IO,IQA,i18nfinalcutRosterforApril'26-WE10thApr'26.xlsx", data_only=True)
ws = wb['Roster']
dc = {}
for c in range(7, ws.max_column + 1):
    v = ws.cell(row=1, column=c).value
    if v and isinstance(v, datetime):
        dc[c] = v.strftime('%Y-%m-%d')
recs = []
for r in range(2, ws.max_row + 1):
    o = ws.cell(row=r, column=6).value
    if not o: continue
    oid = str(o).strip()
    for c, d in dc.items():
        val = ws.cell(row=r, column=c).value
        if val and str(val).strip().upper() in ('WO','PL'):
            recs.append({'o': oid, 'd': d, 't': str(val).strip().upper()})
print(json.dumps(recs))
`;
const rosterData = JSON.parse(execSync(`python3 -c '${py.replace(/'/g, "'\\''")}'`, { maxBuffer: 50*1024*1024 }).toString());
console.log(`  ${rosterData.length} WO/PL records (WO: ${rosterData.filter(r=>r.t==='WO').length}, PL: ${rosterData.filter(r=>r.t==='PL').length})`);

// Step 2: Connect
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Step 3: Load employees
const [empRows] = await conn.execute(
  "SELECT ohr_id, full_name, supervisor_name, planning_group, shift_time, actual_role, billing_name, srt_status FROM io_employees"
);
const emps = new Map();
for (const e of empRows) emps.set(String(e.ohr_id), e);
console.log(`  ${emps.size} employees loaded`);

// Step 4: Load existing records
const [existingRows] = await conn.execute(
  "SELECT CONCAT(ohr_id, '_', log_date) as k FROM io_attendance WHERE log_date >= '2026-04-04' AND log_date <= '2026-04-24'"
);
const existingKeys = new Set(existingRows.map(r => r.k));
console.log(`  ${existingKeys.size} existing records`);

// Step 5: Generate ID
function makeId(d, o) {
  const dt = new Date(d + 'T00:00:00Z');
  const yy = String(dt.getUTCFullYear()).slice(-2);
  const start = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const doy = Math.floor((dt - start) / 86400000) + 1;
  return `${yy}${String(doy).padStart(3,'0')}${o}`;
}

// Step 6: Separate into inserts and updates
const now = new Date().toISOString();
const toInsert = [];
const toUpdate = [];
let skipped = 0;

for (const r of rosterData) {
  const emp = emps.get(r.o);
  if (!emp) { skipped++; continue; }
  const key = `${r.o}_${r.d}`;
  if (existingKeys.has(key)) {
    toUpdate.push(r);
  } else {
    toInsert.push({ ...r, emp });
  }
}
console.log(`\n  To insert: ${toInsert.length}, To update: ${toUpdate.length}, Skipped (no emp): ${skipped}`);

// Step 7: Batch UPDATE - update in chunks using CASE statements
console.log("\nStep 7: Batch updating existing records...");
const CHUNK = 200;
for (let i = 0; i < toUpdate.length; i += CHUNK) {
  const chunk = toUpdate.slice(i, i + CHUNK);
  // Build a multi-row update using WHERE IN
  const conditions = chunk.map(r => `(ohr_id = '${r.o}' AND log_date = '${r.d}')`).join(' OR ');
  
  // Group by tag for efficient updates
  const woItems = chunk.filter(r => r.t === 'WO');
  const plItems = chunk.filter(r => r.t === 'PL');
  
  if (woItems.length > 0) {
    const woConds = woItems.map(r => `(ohr_id = '${r.o}' AND log_date = '${r.d}')`).join(' OR ');
    await conn.execute(`UPDATE io_attendance SET tag = 'WO', is_locked = 1, locked_at = ? WHERE ${woConds}`, [now]);
  }
  if (plItems.length > 0) {
    const plConds = plItems.map(r => `(ohr_id = '${r.o}' AND log_date = '${r.d}')`).join(' OR ');
    await conn.execute(`UPDATE io_attendance SET tag = 'PL', is_locked = 1, locked_at = ? WHERE ${plConds}`, [now]);
  }
  
  if ((i + CHUNK) % 1000 === 0 || i + CHUNK >= toUpdate.length) {
    console.log(`  Updated ${Math.min(i + CHUNK, toUpdate.length)}/${toUpdate.length}`);
  }
}

// Step 8: Batch INSERT - use multi-row INSERT
console.log("\nStep 8: Batch inserting new records...");
for (let i = 0; i < toInsert.length; i += CHUNK) {
  const chunk = toInsert.slice(i, i + CHUNK);
  const values = chunk.map(r => {
    const id = makeId(r.d, r.o);
    const e = r.emp;
    return `('${id}', '${r.o}', '${r.d}', '${r.t}', 'RM', '${now}', 
      ${e.full_name ? `'${e.full_name.replace(/'/g,"''")}'` : 'NULL'},
      ${e.supervisor_name ? `'${e.supervisor_name.replace(/'/g,"''")}'` : 'NULL'},
      ${e.planning_group ? `'${e.planning_group.replace(/'/g,"''")}'` : 'NULL'},
      ${e.shift_time ? `'${e.shift_time.replace(/'/g,"''")}'` : 'NULL'},
      ${e.actual_role ? `'${e.actual_role.replace(/'/g,"''")}'` : 'NULL'},
      ${e.billing_name ? `'${e.billing_name.replace(/'/g,"''")}'` : 'NULL'},
      ${e.srt_status ? `'${e.srt_status.replace(/'/g,"''")}'` : 'NULL'},
      1, '${now}')`;
  });
  
  if (values.length > 0) {
    const sql = `INSERT INTO io_attendance 
      (id, ohr_id, log_date, tag, billing_code, created_at,
       snap_full_name, snap_supervisor, snap_planning_group,
       snap_shift_time, snap_actual_role, snap_billing_name,
       snap_status, is_locked, locked_at)
      VALUES ${values.join(',\n')}
      ON DUPLICATE KEY UPDATE tag = VALUES(tag), is_locked = 1, locked_at = VALUES(locked_at)`;
    await conn.execute(sql);
  }
  
  if ((i + CHUNK) % 1000 === 0 || i + CHUNK >= toInsert.length) {
    console.log(`  Inserted ${Math.min(i + CHUNK, toInsert.length)}/${toInsert.length}`);
  }
}

// Step 9: Verify
console.log("\n=== VERIFICATION ===");
const [verify] = await conn.execute(
  `SELECT tag, COUNT(*) as cnt, SUM(is_locked) as locked_cnt
   FROM io_attendance 
   WHERE log_date >= '2026-04-04' AND log_date <= '2026-04-24'
     AND tag IN ('WO', 'PL')
   GROUP BY tag`
);
for (const row of verify) {
  console.log(`  ${row.tag}: ${row.cnt} records (${row.locked_cnt} locked)`);
}

const [total] = await conn.execute(
  "SELECT COUNT(*) as total FROM io_attendance WHERE log_date >= '2026-04-04' AND log_date <= '2026-04-24'"
);
console.log(`  Total records in Apr 4-24: ${total[0].total}`);

await conn.end();
console.log("\nDone!");
