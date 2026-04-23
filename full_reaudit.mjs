/**
 * Full WFM Tag Re-Audit
 * 
 * Parses ROSTER Block 4 as WE 04/24 (Sat Apr 18 - Fri Apr 24)
 * and cross-references against io_wfm_schedules and io_attendance.wfm_tag.
 * 
 * Block 4 day columns (65-71) map to: Sat=Apr18, Sun=Apr19, Mon=Apr20, Tue=Apr21, Wed=Apr22, Thu=Apr23, Fri=Apr24
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

dotenv.config({ path: '/home/ubuntu/playbook/.env' });

// Step 1: Parse ROSTER file using Python (openpyxl not available in Node)
const pythonScript = `
import openpyxl
import json
import re
from datetime import datetime

wb = openpyxl.load_workbook(
    "/home/ubuntu/upload/VMO_Manila_Staffing_Apr'26-MainFile_Finalcut-WE24thApr'26.xlsx",
    read_only=True, data_only=True
)
ws = wb['Roster']
rows = list(ws.iter_rows(values_only=True))
wb.close()

# Block 4 day columns: 65=Sat(Apr18), 66=Sun(Apr19), 67=Mon(Apr20), 68=Tue(Apr21), 69=Wed(Apr22), 70=Thu(Apr23), 71=Fri(Apr24)
day_cols = [65, 66, 67, 68, 69, 70, 71]
dates = ['2026-04-18', '2026-04-19', '2026-04-20', '2026-04-21', '2026-04-22', '2026-04-23', '2026-04-24']

def classify(val):
    if val is None:
        return None
    s = str(val).strip()
    if s == '' or s.upper() == 'NA' or s == '--' or s.upper() == 'FALSE':
        return None
    if s.upper() == 'WO':
        return 'WO'
    if s.upper() == 'PL':
        return 'PL'
    if s.upper() == 'ML':
        return 'ML'
    if s.upper() == 'BOJ':
        return 'Scheduled'
    if 'training' in s.lower():
        return 'Scheduled'
    if s.upper() == 'LOA':
        return 'LOA'
    if s.upper() == 'EXIT':
        return 'Exit'
    if re.match(r'\\d{1,2}:\\d{2}\\s*-\\s*\\d{1,2}:\\d{2}', s):
        return 'Scheduled'
    return s

results = {}
for row in rows[2:]:
    ohr = row[7]
    if ohr is None:
        continue
    ohr_str = str(int(ohr)) if isinstance(ohr, (int, float)) else str(ohr).strip()
    status = str(row[5]).strip() if row[5] else ''
    name = str(row[8]) if row[8] else ''
    
    # Skip inactive
    if status.lower() not in ('active', 'nesting'):
        continue
    
    schedule = {}
    for i, col in enumerate(day_cols):
        if col < len(row):
            raw = row[col]
            wfm = classify(raw)
            if wfm is not None:
                schedule[dates[i]] = {
                    'raw': str(raw) if raw else None,
                    'expected': wfm
                }
    
    if schedule:
        results[ohr_str] = {
            'name': name,
            'status': status,
            'schedule': schedule
        }

print(json.dumps(results))
`;

writeFileSync('/tmp/parse_roster.py', pythonScript);
const rosterJson = execSync('python3 /tmp/parse_roster.py', { maxBuffer: 50 * 1024 * 1024 }).toString();
const rosterData = JSON.parse(rosterJson);

console.log(`Parsed ${Object.keys(rosterData).length} active employees from ROSTER Block 4`);

// Step 2: Query DB for wfm_schedules and attendance
const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [schedRows] = await conn.execute(
  `SELECT ohr_id, schedule_date, wfm_value FROM io_wfm_schedules WHERE schedule_date >= '2026-04-18' AND schedule_date <= '2026-04-24'`
);

const [attRows] = await conn.execute(
  `SELECT ohr_id, log_date, tag, wfm_tag, snap_full_name FROM io_attendance WHERE log_date >= '2026-04-18' AND log_date <= '2026-04-24'`
);

// Index DB data
const schedMap = {};  // ohr_id -> date -> wfm_value
for (const r of schedRows) {
  const key = r.ohr_id;
  if (!schedMap[key]) schedMap[key] = {};
  schedMap[key][r.schedule_date] = r.wfm_value;
}

const attMap = {};  // ohr_id -> date -> { tag, wfm_tag, name }
for (const r of attRows) {
  const key = r.ohr_id;
  if (!attMap[key]) attMap[key] = {};
  attMap[key][r.log_date] = { tag: r.tag, wfm_tag: r.wfm_tag, name: r.snap_full_name };
}

console.log(`DB: ${schedRows.length} schedule records, ${attRows.length} attendance records`);

// Step 3: Cross-reference
const mismatches_sched = [];   // io_wfm_schedules mismatches
const mismatches_att = [];     // io_attendance.wfm_tag mismatches
const missing_sched = [];      // In ROSTER but no DB schedule
const missing_att = [];        // In ROSTER but no DB attendance
let matchCount = 0;
let totalChecked = 0;

for (const [ohr, data] of Object.entries(rosterData)) {
  for (const [date, info] of Object.entries(data.schedule)) {
    totalChecked++;
    const expected = info.expected;
    const raw = info.raw;
    
    // Check io_wfm_schedules
    const dbSched = schedMap[ohr]?.[date];
    const dbAtt = attMap[ohr]?.[date];
    
    if (dbSched === undefined) {
      missing_sched.push({ ohr, date, name: data.name, expected, raw });
    } else if (dbSched !== expected) {
      mismatches_sched.push({ ohr, date, name: data.name, raw, expected, db_value: dbSched });
    }
    
    if (dbAtt === undefined) {
      missing_att.push({ ohr, date, name: data.name, expected, raw });
    } else if (dbAtt.wfm_tag !== expected) {
      mismatches_att.push({ ohr, date, name: data.name, raw, expected, db_wfm_tag: dbAtt.wfm_tag, db_tag: dbAtt.tag });
    } else {
      matchCount++;
    }
  }
}

console.log('\n========================================');
console.log('       WFM TAG AUDIT REPORT');
console.log('       WE 04/24 (Apr 18-24, 2026)');
console.log('========================================\n');

console.log(`Total employee-date pairs checked: ${totalChecked}`);
console.log(`Matching (attendance wfm_tag = ROSTER): ${matchCount}`);
console.log(`\n--- io_wfm_schedules mismatches ---`);
console.log(`Count: ${mismatches_sched.length}`);
for (const r of mismatches_sched.slice(0, 50)) {
  console.log(`  OHR ${r.ohr} | ${r.date} | ROSTER="${r.expected}" (raw: ${r.raw}) | DB="${r.db_value}" | ${r.name}`);
}

console.log(`\n--- io_attendance.wfm_tag mismatches ---`);
console.log(`Count: ${mismatches_att.length}`);
for (const r of mismatches_att.slice(0, 50)) {
  console.log(`  OHR ${r.ohr} | ${r.date} | ROSTER="${r.expected}" (raw: ${r.raw}) | DB wfm_tag="${r.db_wfm_tag}" | tag=${r.db_tag} | ${r.name}`);
}

console.log(`\n--- Missing from io_wfm_schedules ---`);
console.log(`Count: ${missing_sched.length}`);
for (const r of missing_sched.slice(0, 20)) {
  console.log(`  OHR ${r.ohr} | ${r.date} | expected="${r.expected}" | ${r.name}`);
}

console.log(`\n--- Missing from io_attendance ---`);
console.log(`Count: ${missing_att.length}`);
for (const r of missing_att.slice(0, 20)) {
  console.log(`  OHR ${r.ohr} | ${r.date} | expected="${r.expected}" | ${r.name}`);
}

// Mismatch breakdown
console.log('\n--- Mismatch type breakdown (schedules) ---');
const schedBreakdown = {};
for (const r of mismatches_sched) {
  const key = `DB="${r.db_value}" → ROSTER="${r.expected}"`;
  schedBreakdown[key] = (schedBreakdown[key] || 0) + 1;
}
for (const [key, cnt] of Object.entries(schedBreakdown).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${key}: ${cnt}`);
}

console.log('\n--- Mismatch type breakdown (attendance) ---');
const attBreakdown = {};
for (const r of mismatches_att) {
  const key = `DB wfm_tag="${r.db_wfm_tag}" → ROSTER="${r.expected}"`;
  attBreakdown[key] = (attBreakdown[key] || 0) + 1;
}
for (const [key, cnt] of Object.entries(attBreakdown).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${key}: ${cnt}`);
}

// Save full report
const report = {
  summary: {
    totalChecked,
    matching: matchCount,
    schedMismatches: mismatches_sched.length,
    attMismatches: mismatches_att.length,
    missingSched: missing_sched.length,
    missingAtt: missing_att.length,
  },
  mismatches_sched,
  mismatches_att,
  missing_sched,
  missing_att,
};
writeFileSync('/home/ubuntu/wfm_reaudit_report.json', JSON.stringify(report, null, 2));
console.log('\nFull report saved to /home/ubuntu/wfm_reaudit_report.json');

await conn.end();
