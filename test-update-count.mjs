import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { ioAttendance } from './drizzle/schema.ts';
import { sql, and, gte, lte } from 'drizzle-orm';

const client = postgres(process.env.SUPABASE_URL);
const db = drizzle(client);

async function test() {
  try {
    // Test: update a field and check what's returned
    const result = await db.update(ioAttendance)
      .set({ internal_role: 'Team Lead' })
      .where(and(
        gte(ioAttendance.log_date, '2026-05-01'),
        lte(ioAttendance.log_date, '2026-05-01'),
        sql`${ioAttendance.internal_role} IS DISTINCT FROM 'Team Lead'`
      ));
    
    console.log('Result type:', typeof result);
    console.log('Result keys:', Object.keys(result));
    console.log('Result:', JSON.stringify(result).slice(0, 200));
    console.log('result.rowCount:', (result).rowCount);
    console.log('result.count:', (result).count);
    console.log('result.length:', result.length);
    // Check if it's an array
    if (Array.isArray(result)) {
      console.log('Is array, length:', result.length);
    }
  } catch (e) {
    console.error('ERROR:', e.message);
  }
  await client.end();
}
test();
