import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// ============================================================
// GROUP 1: Tagged in Sheet, blank in DB — follow Sheet tag
// ============================================================
const group1 = [
  { ohr: '740044529', date: '2026-04-10', tag: 'LATE' },  // Gabrillo
  { ohr: '740044797', date: '2026-04-10', tag: 'LATE' },  // Fernandez
  { ohr: '740053897', date: '2026-04-10', tag: 'LATE' },  // Cabural
  { ohr: '740054050', date: '2026-04-10', tag: 'EXIT' },  // Amurao
];

console.log('=== GROUP 1: Follow Sheet tag (Sheet has value, DB blank) ===');
for (const r of group1) {
  const [result] = await conn.execute(
    `UPDATE io_attendance SET tag = ? WHERE ohr_id = ? AND log_date = ?`,
    [r.tag, r.ohr, r.date]
  );
  console.log(`  ${r.ohr} | ${r.date} -> ${r.tag} | Rows: ${result.affectedRows}`);
}

// ============================================================
// GROUP 2: Conflicting tags — follow Sheet tag (except blanks follow DB)
// ============================================================
const group2 = [
  { ohr: '740031605', date: '2026-04-09', tag: 'ML' },       // Amores — Sheet ML, DB P -> ML
  { ohr: '740044575', date: '2026-04-10', tag: 'P' },        // Reyes — Sheet P, DB WO -> P
  { ohr: '740044847', date: '2026-04-10', tag: 'P' },        // Dela Cruz — Sheet P, DB LATE -> P
  { ohr: '740044904', date: '2026-04-09', tag: 'PL' },       // Galula — Sheet PL, DB blank -> PL
  { ohr: '740046281', date: '2026-04-09', tag: 'PL' },       // Zapata — Sheet PL, DB P -> PL
  { ohr: '740047576', date: '2026-04-10', tag: 'P' },        // Calabroso — Sheet P, DB LATE -> P
  { ohr: '740048176', date: '2026-04-09', tag: 'EXIT' },     // Pesigan — Sheet EXIT, DB ML -> EXIT
  { ohr: '740048176', date: '2026-04-10', tag: 'P' },        // Pesigan — Sheet P, DB ML -> P
  { ohr: '740048286', date: '2026-04-09', tag: 'P' },        // Abay — Sheet P, DB WO -> P
  { ohr: '740048286', date: '2026-04-10', tag: 'WO' },       // Abay — Sheet WO, DB P -> WO
  { ohr: '740049633', date: '2026-04-10', tag: 'P' },        // Varandmal — Sheet P, DB PL -> P
  { ohr: '740049853', date: '2026-04-10', tag: 'P' },        // Adela — Sheet P, DB PL -> P
  { ohr: '740049946', date: '2026-04-10', tag: 'P' },        // Detalla — Sheet P, DB UPL -> P
  { ohr: '740050233', date: '2026-04-09', tag: 'P' },        // Escalante — Sheet P, DB PL -> P
  // 740050318 04/09 — Sheet blank, DB EXIT -> keep DB (EXIT)
  // 740050318 04/10 — Sheet blank, DB EXIT -> keep DB (EXIT)
  { ohr: '740050666', date: '2026-04-06', tag: 'PL' },       // Aragon — Sheet PL, DB blank -> PL
  { ohr: '740051410', date: '2026-04-09', tag: 'UPL' },      // Gariando — Sheet UPL, DB EXIT -> UPL
  { ohr: '740051783', date: '2026-04-09', tag: 'EXIT' },     // Perez — Sheet EXIT, DB UPL -> EXIT
  // 740052072 04/09 — Sheet blank, DB UPL -> keep DB (UPL)
  // 740052072 04/10 — Sheet blank, DB UPL -> keep DB (UPL)
  { ohr: '740054053', date: '2026-04-10', tag: 'P' },        // Jamiro — Sheet P, DB LATE -> P
  { ohr: '740054135', date: '2026-04-09', tag: 'UPL' },      // Nimer — Sheet UPL, DB P -> UPL
];

console.log('\n=== GROUP 2: Follow Sheet tag (conflicting, blanks keep DB) ===');
for (const r of group2) {
  const [result] = await conn.execute(
    `UPDATE io_attendance SET tag = ? WHERE ohr_id = ? AND log_date = ?`,
    [r.tag, r.ohr, r.date]
  );
  console.log(`  ${r.ohr} | ${r.date} -> ${r.tag} | Rows: ${result.affectedRows}`);
}

// ============================================================
// Poblete (740032326): Inactive -> Active
// ============================================================
console.log('\n=== Poblete (740032326): Inactive -> Active ===');
const [poblete] = await conn.execute(
  `UPDATE io_employees SET employement_status = 'Active' WHERE ohr_id = '740032326'`
);
console.log(`  Rows updated: ${poblete.affectedRows}`);

// ============================================================
// Reyes (740044575): role -> Trainer
// ============================================================
console.log('\n=== Reyes (740044575): role -> Trainer ===');
const [reyes] = await conn.execute(
  `UPDATE io_employees SET actual_role = 'Trainer' WHERE ohr_id = '740044575'`
);
console.log(`  Rows updated: ${reyes.affectedRows}`);

// Also update historical attendance snap_role for Reyes from today onward
const [reyesAttend] = await conn.execute(
  `UPDATE io_attendance SET role = 'Trainer' WHERE ohr_id = '740044575' AND log_date >= '2026-04-11'`
);
console.log(`  Attendance snap_role updated: ${reyesAttend.affectedRows} rows`);

await conn.end();
console.log('\nDone!');
