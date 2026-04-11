import 'dotenv/config';
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { sql } from 'drizzle-orm';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('No DATABASE_URL'); process.exit(1); }

const conn = await mysql.createConnection(DATABASE_URL);
const db = drizzle(conn);

// Delete test rows from io_billing_targets_v2
const result = await db.execute(
  sql`DELETE FROM io_billing_targets_v2 WHERE planning_group IN ('TEST', 'TEST_DEL')`
);
console.log('Deleted test rows:', result);

// Verify no rows remain for 2026-04-17
const check = await db.execute(
  sql`SELECT * FROM io_billing_targets_v2 WHERE week_ending = '2026-04-17'`
);
const rows = Array.isArray(check[0]) ? check[0] : check;
console.log('Remaining rows for 2026-04-17:', rows.length);

await conn.end();
console.log('Done');
