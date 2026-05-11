/**
 * Bulk-update 44 blank-tag attendance records per WFM schedule.
 * Rule: if WFM schedule contains a time pattern (e.g., 22:30-07:30), tag as P.
 *       Otherwise use the schedule value directly (WO, PL, NH Training→P, etc.)
 */
import mysql from 'mysql2/promise';

const updates = [
  // Category 1: CONFIRMED_BLANK — 44 records
  // Format: [ohr_id, log_date, wfm_schedule]
  ['740035003', '2026-03-30', '13:30-22:30'],
  ['740032326', '2026-03-30', 'PL'],
  ['740044292', '2026-03-30', '22:30-07:30'],
  ['740044715', '2026-03-30', '22:30-07:30'],
  ['740044590', '2026-03-30', '22:30-07:30'],
  ['740044227', '2026-03-30', 'PL'],
  ['740054053', '2026-03-31', '13:30-22:30'],
  ['740053907', '2026-04-01', '13:30-22:30'],
  ['740032326', '2026-04-02', '22:30-07:30'],
  ['740041868', '2026-04-02', 'NH Training'],
  ['740052326', '2026-04-02', 'NH Training'],
  ['740053907', '2026-04-02', '13:30-22:30'],
  ['740053907', '2026-04-03', '13:30-22:30'],
  ['740041868', '2026-04-04', 'WO'],
  ['740052326', '2026-04-04', 'WO'],
  ['740053907', '2026-04-04', 'WO'],
  ['740041868', '2026-04-05', 'WO'],
  ['740052326', '2026-04-05', 'WO'],
  ['740053907', '2026-04-05', 'WO'],
  ['740053907', '2026-04-06', '13:30-22:30'],
  ['740041868', '2026-04-07', '22:30-07:30'],
  ['740052326', '2026-04-07', '22:30-07:30'],
  ['740053907', '2026-04-07', '13:30-22:30'],
  ['740041868', '2026-04-08', '22:30-07:30'],
  ['740052326', '2026-04-08', '22:30-07:30'],
  ['740053907', '2026-04-08', '13:30-22:30'],
  ['740032326', '2026-04-09', 'NH-Training'],
  ['740041868', '2026-04-09', '22:30-07:30'],
  ['740052326', '2026-04-09', '22:30-07:30'],
  ['740053907', '2026-04-09', '13:30-22:30'],
  ['740044795', '2026-04-09', 'NH Training'],
  ['740041876', '2026-04-09', 'NH Training'],
  ['740031642', '2026-04-09', 'NH Training'],
  ['740032326', '2026-04-10', 'NH Training'],
  ['740044795', '2026-04-10', 'NH Training'],
  ['740041876', '2026-04-10', 'NH Training'],
  ['740031582', '2026-04-10', '11:00-20:00'],
  ['740031981', '2026-04-10', '20:00-05:00'],
  ['740031965', '2026-04-10', '14:00-23:00'],
  ['740031960', '2026-04-10', '19:00-04:00'],
  ['740032345', '2026-04-10', '16:30-01:30'],
  ['740036851', '2026-04-10', '21:00-06:00'],
  ['740040374', '2026-04-10', '14:00-23:00'],
  ['740044280', '2026-04-10', '15:00-00:00'],
];

function determineTag(wfmSchedule) {
  const s = wfmSchedule.trim();
  // Time patterns: HH:MM-HH:MM
  if (/^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(s)) return 'P';
  // NH Training variants → P (they were scheduled for training, so present)
  if (s.toLowerCase().includes('nh training') || s.toLowerCase().includes('nh-training')) return 'P';
  // Direct tag mappings
  if (s === 'WO') return 'WO';
  if (s === 'PL') return 'PL';
  if (s === 'EXIT' || s === 'Exit') return 'EXIT';
  if (s === 'LOA') return 'LOA';
  if (s === 'ML') return 'ML';
  // Fallback: if it looks like a schedule, mark P
  return 'P';
}

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  let updated = 0;
  let skipped = 0;
  let notFound = 0;
  
  for (const [ohr, date, wfmSched] of updates) {
    const tag = determineTag(wfmSched);
    
    // First check if the record exists and is still blank
    const [rows] = await conn.execute(
      'SELECT id, tag FROM io_attendance WHERE ohr_id = ? AND log_date = ?',
      [ohr, date]
    );
    
    if (rows.length === 0) {
      console.log(`NOT FOUND: ${ohr} on ${date} — no record exists`);
      notFound++;
      continue;
    }
    
    const rec = rows[0];
    if (rec.tag && rec.tag !== '' && rec.tag !== '-' && rec.tag !== '_') {
      console.log(`SKIPPED: ${ohr} on ${date} — already has tag '${rec.tag}'`);
      skipped++;
      continue;
    }
    
    // Update the tag
    await conn.execute(
      'UPDATE io_attendance SET tag = ? WHERE id = ?',
      [tag, rec.id]
    );
    console.log(`UPDATED: ${ohr} on ${date} — WFM '${wfmSched}' → tag '${tag}'`);
    updated++;
  }
  
  console.log(`\n=== SUMMARY ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (already has tag): ${skipped}`);
  console.log(`Not found: ${notFound}`);
  console.log(`Total processed: ${updates.length}`);
  
  await conn.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
