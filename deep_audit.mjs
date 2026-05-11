import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');
require('dotenv').config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Check the actual column names
const [cols] = await conn.query(`DESCRIBE io_coaching`);
console.log('=== ALL COLUMNS ===');
for (const c of cols) {
  if (c.Field.includes('ack') || c.Field.includes('commit') || c.Field.includes('rating') || c.Field.includes('sentiment') || c.Field.includes('status')) {
    console.log(`  ${c.Field}: ${c.Type} ${c.Null}`);
  }
}

// Check if there's a separate 'status' field that might be "Acknowledged"
const [statusCheck] = await conn.query(`
  SELECT DISTINCT dispute_status, COUNT(*) as cnt 
  FROM io_coaching 
  GROUP BY dispute_status
`);
console.log('\n=== DISPUTE_STATUS VALUES ===');
for (const r of statusCheck) {
  console.log(`  "${r.dispute_status}": ${r.cnt}`);
}

// Check the actual values in coachee_ack field
const [ackValues] = await conn.query(`
  SELECT DISTINCT coachee_ack, COUNT(*) as cnt 
  FROM io_coaching 
  WHERE coachee_ack IS NOT NULL AND coachee_ack != ''
  GROUP BY coachee_ack
  ORDER BY cnt DESC
  LIMIT 20
`);
console.log('\n=== COACHEE_ACK DISTINCT VALUES ===');
for (const r of ackValues) {
  console.log(`  "${r.coachee_ack}": ${r.cnt}`);
}

// Check coaching_rating values
const [ratingValues] = await conn.query(`
  SELECT DISTINCT coaching_rating, COUNT(*) as cnt 
  FROM io_coaching 
  WHERE coaching_rating IS NOT NULL AND coaching_rating != ''
  GROUP BY coaching_rating
  ORDER BY cnt DESC
  LIMIT 20
`);
console.log('\n=== COACHING_RATING DISTINCT VALUES ===');
for (const r of ratingValues) {
  console.log(`  "${r.coaching_rating}": ${r.cnt}`);
}

// Check: are there logs created in-app (not from spreadsheet) that have been acknowledged?
// These would be the 213 "no match in spreadsheet" logs
const [inAppLogs] = await conn.query(`
  SELECT coaching_id, coachee, coachee_ack, coachee_commitments, coaching_rating, coachee_sentiments, ack_date, coaching_date
  FROM io_coaching
  WHERE coachee_ack IS NOT NULL AND coachee_ack != ''
  ORDER BY coaching_date DESC
  LIMIT 10
`);
console.log('\n=== SAMPLE ACKNOWLEDGED LOGS ===');
for (const r of inAppLogs) {
  console.log(`  ${r.coaching_id} (${r.coachee}, ${r.coaching_date}):`);
  console.log(`    ack="${(r.coachee_ack || '').substring(0,60)}" | commit="${(r.coachee_commitments || '').substring(0,60)}"`);
  console.log(`    rating="${r.coaching_rating}" | sent="${(r.coachee_sentiments || '').substring(0,60)}"`);
}

// The real question: check if there are logs where the user SEES them as having content
// but the code doesn't. Check for whitespace-only values, special chars, etc.
const [edgeCases] = await conn.query(`
  SELECT coaching_id, coachee,
    HEX(coachee_ack) as ack_hex, LENGTH(coachee_ack) as ack_len,
    HEX(coachee_commitments) as commit_hex, LENGTH(coachee_commitments) as commit_len,
    HEX(coaching_rating) as rating_hex, LENGTH(coaching_rating) as rating_len,
    HEX(coachee_sentiments) as sent_hex, LENGTH(coachee_sentiments) as sent_len
  FROM io_coaching
  WHERE (coachee_ack IS NOT NULL AND coachee_ack != '' AND TRIM(coachee_ack) = '')
     OR (coachee_commitments IS NOT NULL AND coachee_commitments != '' AND TRIM(coachee_commitments) = '')
     OR (coaching_rating IS NOT NULL AND coaching_rating != '' AND TRIM(coaching_rating) = '')
     OR (coachee_sentiments IS NOT NULL AND coachee_sentiments != '' AND TRIM(coachee_sentiments) = '')
`);
console.log(`\n=== WHITESPACE-ONLY VALUES (non-empty but trim to empty) ===`);
console.log(`Count: ${edgeCases.length}`);
for (const r of edgeCases.slice(0, 5)) {
  console.log(`  ${r.coaching_id}: ack_len=${r.ack_len} commit_len=${r.commit_len} rating_len=${r.rating_len} sent_len=${r.sent_len}`);
}

// Final check: what does the user's view look like? 
// The user mentioned "Status, Commitments, Coaching Rating, Sentiments" are filled
// Maybe "Status" refers to a different field? Check if dispute_status or another field is being confused
const [withStatus] = await conn.query(`
  SELECT coaching_id, coachee, dispute_status, coachee_ack, coachee_commitments, coaching_rating, coachee_sentiments
  FROM io_coaching
  WHERE dispute_status IS NOT NULL AND dispute_status != ''
  AND (coachee_ack IS NULL OR coachee_ack = '')
  LIMIT 10
`);
console.log(`\n=== HAS DISPUTE_STATUS BUT NO COACHEE_ACK ===`);
console.log(`Count: ${withStatus.length}`);
for (const r of withStatus.slice(0, 5)) {
  console.log(`  ${r.coaching_id} (${r.coachee}): status="${r.dispute_status}" ack="${r.coachee_ack}"`);
}

await conn.end();
