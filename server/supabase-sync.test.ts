import { describe, it, expect } from "vitest";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? "";

describe("Supabase sync credentials and connectivity", () => {
  it("should have SUPABASE_URL configured", () => {
    expect(SUPABASE_URL).toBeTruthy();
    expect(SUPABASE_URL).toContain("supabase.co");
  });

  it("should have SUPABASE_SERVICE_KEY configured", () => {
    expect(SUPABASE_SERVICE_KEY).toBeTruthy();
    expect(SUPABASE_SERVICE_KEY.length).toBeGreaterThan(50);
  });

  it("should connect to Supabase and read io_employees", async () => {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/io_employees?select=ohr_id&limit=1`, {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    });
    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it("should be able to upsert a test row and read it back", async () => {
    const testOhr = "TEST_SYNC_001";
    const headers = {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    };

    // Upsert a test row
    const upsertResp = await fetch(`${SUPABASE_URL}/rest/v1/io_employees`, {
      method: "POST",
      headers,
      body: JSON.stringify([{
        ohr_id: testOhr,
        full_name: "Test Sync Employee",
        employement_status: "Inactive",
        srt_status: "Exit",
      }]),
    });
    expect(upsertResp.status).toBeLessThan(300);

    // Read it back
    const readResp = await fetch(
      `${SUPABASE_URL}/rest/v1/io_employees?ohr_id=eq.${testOhr}&select=ohr_id,full_name`,
      { headers },
    );
    expect(readResp.status).toBe(200);
    const rows = await readResp.json();
    expect(rows.length).toBe(1);
    expect(rows[0].full_name).toBe("Test Sync Employee");

    // Clean up
    const deleteResp = await fetch(
      `${SUPABASE_URL}/rest/v1/io_employees?ohr_id=eq.${testOhr}`,
      { method: "DELETE", headers },
    );
    expect(deleteResp.status).toBeLessThan(300);
  });
});
