import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: '/home/ubuntu/playbook/.env' });

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get all attendance records for WE 04/24 joined with wfm_schedules
const [attendance] = await conn.execute(
  `SELECT a.ohr_id, a.log_date, a.tag, a.wfm_tag, a.snap_full_name, a.role,
          s.wfm_value as expected_wfm_tag
   FROM io_attendance a
   LEFT JOIN io_wfm_schedules s ON a.ohr_id = s.ohr_id AND a.log_date = s.schedule_date
   WHERE a.log_date >= '2026-04-18' AND a.log_date <= '2026-04-24'
   ORDER BY a.ohr_id, a.log_date`
);

console.log('Total attendance records for WE 04/24:', attendance.length);

let matchCount = 0;
let valueMismatchCount = 0;
let attNullSchedExists = 0;
let attExistsSchedNull = 0;
let bothNull = 0;

const valueMismatches = [];
const nullWfmRecords = [];
const noScheduleRecords = [];

for (const row of attendance) {
  const actual = row.wfm_tag;
  const expected = row.expected_wfm_tag;

  if (actual === null && expected === null) {
    bothNull++;
  } else if (actual === null && expected !== null) {
    attNullSchedExists++;
    nullWfmRecords.push(row);
  } else if (actual !== null && expected === null) {
    attExistsSchedNull++;
    noScheduleRecords.push(row);
  } else if (actual === expected) {
    matchCount++;
  } else {
    valueMismatchCount++;
    valueMismatches.push(row);
  }
}

console.log('\n=== SUMMARY ===');
console.log('Matching (wfm_tag = schedule):', matchCount);
console.log('Value mismatch (both non-null, different):', valueMismatchCount);
console.log('Attendance wfm_tag=NULL but schedule exists:', attNullSchedExists);
console.log('Attendance wfm_tag set but no schedule record:', attExistsSchedNull);
console.log('Both NULL:', bothNull);

console.log('\n=== VALUE MISMATCHES (actual != expected, both non-null) ===');
console.log('Count:', valueMismatches.length);
for (const r of valueMismatches.slice(0, 30)) {
  console.log(`  OHR ${r.ohr_id} | ${r.log_date} | actual="${r.wfm_tag}" | expected="${r.expected_wfm_tag}" | tag=${r.tag} | ${r.snap_full_name}`);
}

console.log('\n=== NULL WFM_TAG (should have value from schedule) ===');
console.log('Count:', attNullSchedExists);
for (const r of nullWfmRecords.slice(0, 20)) {
  console.log(`  OHR ${r.ohr_id} | ${r.log_date} | expected="${r.expected_wfm_tag}" | tag=${r.tag} | ${r.snap_full_name}`);
}

console.log('\n=== HAS WFM_TAG BUT NO SCHEDULE RECORD ===');
console.log('Count:', attExistsSchedNull);
for (const r of noScheduleRecords.slice(0, 20)) {
  console.log(`  OHR ${r.ohr_id} | ${r.log_date} | wfm_tag="${r.wfm_tag}" | tag=${r.tag} | ${r.snap_full_name}`);
}

// Mismatch breakdown
console.log('\n=== MISMATCH BREAKDOWN ===');
const mismatchTypes = {};
for (const r of valueMismatches) {
  const key = `"${r.wfm_tag}" → should be "${r.expected_wfm_tag}"`;
  mismatchTypes[key] = (mismatchTypes[key] || 0) + 1;
}
for (const [key, cnt] of Object.entries(mismatchTypes).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${key}: ${cnt}`);
}

// Save full report to JSON
const report = {
  summary: { matchCount, valueMismatchCount, attNullSchedExists, attExistsSchedNull, bothNull, total: attendance.length },
  valueMismatches: valueMismatches.map(r => ({ ohr_id: r.ohr_id, log_date: r.log_date, actual_wfm_tag: r.wfm_tag, expected_wfm_tag: r.expected_wfm_tag, tag: r.tag, name: r.snap_full_name })),
  nullWfmRecords: nullWfmRecords.map(r => ({ ohr_id: r.ohr_id, log_date: r.log_date, expected_wfm_tag: r.expected_wfm_tag, tag: r.tag, name: r.snap_full_name })),
  noScheduleRecords: noScheduleRecords.map(r => ({ ohr_id: r.ohr_id, log_date: r.log_date, wfm_tag: r.wfm_tag, tag: r.tag, name: r.snap_full_name })),
};
fs.writeFileSync('/home/ubuntu/wfm_audit_report.json', JSON.stringify(report, null, 2));
console.log('\nFull report saved to /home/ubuntu/wfm_audit_report.json');

await conn.end();
