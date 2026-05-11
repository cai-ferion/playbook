import { describe, it, expect } from "vitest";
import postgres from "postgres";

describe("Supabase Connection", () => {
  it("connects to Supabase via SUPABASE_URL and runs a basic query", async () => {
    const connStr = process.env.SUPABASE_URL;
    expect(connStr).toBeTruthy();
    
    const sql = postgres(connStr!, { prepare: false });
    const rows = await sql`SELECT 1 as test`;
    expect(rows).toHaveLength(1);
    expect(rows[0].test).toBe(1);
    await sql.end();
  });

  it("can query the io_employees table", async () => {
    const connStr = process.env.SUPABASE_URL;
    const sql = postgres(connStr!, { prepare: false });
    // Just verify the table exists and is queryable
    const rows = await sql`SELECT COUNT(*) as cnt FROM io_employees`;
    expect(Number(rows[0].cnt)).toBeGreaterThanOrEqual(0);
    await sql.end();
  });
});
