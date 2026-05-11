/**
 * WFM Tag Correction Script
 * 
 * Applies corrections based on the re-audit findings:
 * - "CEI taskforce" → "Scheduled" (leave DB as-is where already Scheduled, fix WO→Scheduled)
 * - "Trainer" / "SME" → "Scheduled"
 * - "Exit" → "Exit"
 * - Category 4 straightforward: PL, WO, Scheduled corrections
 * 
 * Updates both io_wfm_schedules.wfm_value and io_attendance.wfm_tag
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config({ path: '/home/ubuntu/playbook/.env' });

const report = JSON.parse(readFileSync('/home/ubuntu/wfm_reaudit_report.json', 'utf-8'));

// Decision mapping: ROSTER raw value → correct WFM tag
function resolveCorrectTag(rosterRaw, rosterExpected) {
  const raw = (rosterRaw || '').trim();
  const rawLower = raw.toLowerCase();
  
  if (rawLower === 'cei taskforce') return 'Scheduled';
  if (rawLower === 'trainer') return 'Scheduled';
  if (rawLower === 'sme') return 'Scheduled';
  if (rawLower === 'exit') return 'Exit';
  if (raw === 'WO') return 'WO';
  if (raw === 'PL') return 'PL';
  if (raw === 'ML') return 'ML';
  if (raw === 'LOA') return 'LOA';
  if (raw === 'BOJ') return 'Scheduled';
  if (rawLower.includes('training')) return 'Scheduled';
  if (/\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/.test(raw)) return 'Scheduled';
  
  // Fallback: use the expected value from the audit
  return rosterExpected;
}

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Collect all corrections
const schedCorrections = [];  // { ohr, date, correctTag, dbValue }
const attCorrections = [];    // { ohr, date, correctTag, dbWfmTag }

// Process io_wfm_schedules mismatches
for (const m of report.mismatches_sched) {
  const correctTag = resolveCorrectTag(m.raw, m.expected);
  if (correctTag !== m.db_value) {
    schedCorrections.push({
      ohr: m.ohr,
      date: m.date,
      name: m.name,
      correctTag,
      oldValue: m.db_value,
      raw: m.raw
    });
  }
}

// Process io_attendance.wfm_tag mismatches
for (const m of report.mismatches_att) {
  const correctTag = resolveCorrectTag(m.raw, m.expected);
  if (correctTag !== m.db_wfm_tag) {
    attCorrections.push({
      ohr: m.ohr,
      date: m.date,
      name: m.name,
      correctTag,
      oldValue: m.db_wfm_tag,
      raw: m.raw
    });
  }
}

console.log('========================================');
console.log('    WFM TAG CORRECTION PREVIEW');
console.log('========================================\n');

console.log(`io_wfm_schedules corrections: ${schedCorrections.length}`);
for (const c of schedCorrections) {
  console.log(`  ${c.ohr} | ${c.date} | "${c.oldValue}" → "${c.correctTag}" | raw: ${c.raw} | ${c.name}`);
}

console.log(`\nio_attendance corrections: ${attCorrections.length}`);
for (const c of attCorrections) {
  console.log(`  ${c.ohr} | ${c.date} | "${c.oldValue}" → "${c.correctTag}" | raw: ${c.raw} | ${c.name}`);
}

// Breakdown by correction type
console.log('\n--- Correction type breakdown (schedules) ---');
const schedBreakdown = {};
for (const c of schedCorrections) {
  const key = `"${c.oldValue}" → "${c.correctTag}"`;
  schedBreakdown[key] = (schedBreakdown[key] || 0) + 1;
}
for (const [key, cnt] of Object.entries(schedBreakdown).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${key}: ${cnt}`);
}

console.log('\n--- Correction type breakdown (attendance) ---');
const attBreakdown = {};
for (const c of attCorrections) {
  const key = `"${c.oldValue}" → "${c.correctTag}"`;
  attBreakdown[key] = (attBreakdown[key] || 0) + 1;
}
for (const [key, cnt] of Object.entries(attBreakdown).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${key}: ${cnt}`);
}

// Execute corrections
console.log('\n========================================');
console.log('    APPLYING CORRECTIONS...');
console.log('========================================\n');

let schedUpdated = 0;
let attUpdated = 0;
let schedErrors = 0;
let attErrors = 0;

// Update io_wfm_schedules
for (const c of schedCorrections) {
  try {
    const [result] = await conn.execute(
      'UPDATE io_wfm_schedules SET wfm_value = ? WHERE ohr_id = ? AND schedule_date = ?',
      [c.correctTag, c.ohr, c.date]
    );
    if (result.affectedRows > 0) {
      schedUpdated++;
    }
  } catch (err) {
    schedErrors++;
    console.error(`  ERROR updating schedule: ${c.ohr} ${c.date}: ${err.message}`);
  }
}

// Update io_attendance
for (const c of attCorrections) {
  try {
    const [result] = await conn.execute(
      'UPDATE io_attendance SET wfm_tag = ? WHERE ohr_id = ? AND log_date = ?',
      [c.correctTag, c.ohr, c.date]
    );
    if (result.affectedRows > 0) {
      attUpdated++;
    }
  } catch (err) {
    attErrors++;
    console.error(`  ERROR updating attendance: ${c.ohr} ${c.date}: ${err.message}`);
  }
}

console.log(`\n========================================`);
console.log(`    CORRECTION RESULTS`);
console.log(`========================================`);
console.log(`io_wfm_schedules: ${schedUpdated} updated, ${schedErrors} errors (of ${schedCorrections.length} planned)`);
console.log(`io_attendance:    ${attUpdated} updated, ${attErrors} errors (of ${attCorrections.length} planned)`);
console.log(`========================================\n`);

await conn.end();
