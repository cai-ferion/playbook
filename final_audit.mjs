import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');
require('dotenv').config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Check: how many logs have status column = 'Pending Acknowledgement' but coachee_ack is filled?
// And vice versa: status = 'Acknowledged' but coachee_ack is NULL?
console.log('=== STATUS vs COACHEE_ACK CROSS-TAB ===');
const [crossTab] = await conn.query(`
  SELECT 
    COALESCE(status, '<NULL>') as status_val,
    CASE 
      WHEN coachee_ack IS NULL THEN 'NULL'
      WHEN coachee_ack = '' THEN 'EMPTY'
      ELSE 'FILLED'
    END as ack_state,
    COUNT(*) as cnt
  FROM io_coaching
  GROUP BY status_val, ack_state
  ORDER BY status_val, ack_state
`);
for (const r of crossTab) {
  console.log(`  status="${r.status_val}" | coachee_ack=${r.ack_state}: ${r.cnt}`);
}

// Check specifically for the admin user's team
console.log('\n=== ADMIN (740045023) TEAM LOGS ===');
const [adminTeam] = await conn.query(`
  SELECT e.ohr_id, e.full_name
  FROM io_employees e
  WHERE e.supervisor_ohr = '740045023'
`);
console.log(`Team members: ${adminTeam.length}`);
const teamOhrs = adminTeam.map(e => e.ohr_id);

if (teamOhrs.length > 0) {
  const placeholders = teamOhrs.map(() => '?').join(',');
  const [teamLogs] = await conn.query(`
    SELECT 
      COALESCE(status, '<NULL>') as status_val,
      CASE 
        WHEN coachee_ack IS NULL THEN 'NULL'
        ELSE 'FILLED'
      END as ack_state,
      COUNT(*) as cnt
    FROM io_coaching
    WHERE coachee_ohr IN (${placeholders})
    GROUP BY status_val, ack_state
    ORDER BY status_val, ack_state
  `, teamOhrs);
  
  console.log('Status vs Ack for admin team:');
  for (const r of teamLogs) {
    console.log(`  status="${r.status_val}" | coachee_ack=${r.ack_state}: ${r.cnt}`);
  }
  
  // Show specific unacknowledged logs for the admin's team
  const [unackTeam] = await conn.query(`
    SELECT coaching_id, coachee, coaching_type, status, coaching_date,
      coachee_ack, coachee_commitments, coaching_rating, coachee_sentiments
    FROM io_coaching
    WHERE coachee_ohr IN (${placeholders})
    AND (coachee_ack IS NULL OR coachee_ack = '')
    ORDER BY coaching_date DESC
    LIMIT 10
  `, teamOhrs);
  
  console.log(`\nSample unacknowledged logs for admin's team (${unackTeam.length} shown):`);
  for (const r of unackTeam) {
    console.log(`  ${r.coaching_id} | ${r.coachee} | type=${r.coaching_type} | status="${r.status}" | date=${r.coaching_date}`);
    console.log(`    ack=${r.coachee_ack} | commit=${r.coachee_commitments ? 'HAS' : 'NULL'} | rating=${r.coaching_rating} | sent=${r.coachee_sentiments ? 'HAS' : 'NULL'}`);
  }
}

// Check: are there logs where status='Pending Acknowledgement' AND all 4 ack fields are filled?
const [pendingButFilled] = await conn.query(`
  SELECT COUNT(*) as cnt FROM io_coaching
  WHERE status = 'Pending Acknowledgement'
  AND coachee_ack IS NOT NULL AND TRIM(coachee_ack) != ''
  AND coachee_commitments IS NOT NULL AND TRIM(coachee_commitments) != ''
  AND coaching_rating IS NOT NULL AND TRIM(coaching_rating) != ''
  AND coachee_sentiments IS NOT NULL AND TRIM(coachee_sentiments) != ''
`);
console.log(`\n=== STATUS='Pending Acknowledgement' BUT ALL 4 ACK FIELDS FILLED: ${pendingButFilled[0].cnt} ===`);

// Check: are there logs where status='Acknowledged' AND coachee_ack is NULL?
const [ackButNull] = await conn.query(`
  SELECT COUNT(*) as cnt FROM io_coaching
  WHERE status = 'Acknowledged'
  AND (coachee_ack IS NULL OR TRIM(coachee_ack) = '')
`);
console.log(`STATUS='Acknowledged' BUT COACHEE_ACK IS NULL: ${ackButNull[0].cnt}`);

// What coaching types are the unacknowledged ones?
const [unackTypes] = await conn.query(`
  SELECT coaching_type, COUNT(*) as cnt
  FROM io_coaching
  WHERE coachee_ack IS NULL OR coachee_ack = ''
  GROUP BY coaching_type
  ORDER BY cnt DESC
`);
console.log('\n=== UNACKNOWLEDGED LOGS BY TYPE ===');
for (const r of unackTypes) {
  console.log(`  ${r.coaching_type}: ${r.cnt}`);
}

// What statuses do the unacknowledged logs have?
const [unackStatuses] = await conn.query(`
  SELECT COALESCE(status, '<NULL>') as status_val, COUNT(*) as cnt
  FROM io_coaching
  WHERE coachee_ack IS NULL OR coachee_ack = ''
  GROUP BY status_val
  ORDER BY cnt DESC
`);
console.log('\n=== UNACKNOWLEDGED LOGS BY STATUS COLUMN ===');
for (const r of unackStatuses) {
  console.log(`  ${r.status_val}: ${r.cnt}`);
}

await conn.end();
