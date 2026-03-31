import { describe, it, expect } from "vitest";

describe("Brevo API Key Validation", () => {
  it("should have BREVO_API_KEY set", () => {
    const key = process.env.BREVO_API_KEY;
    expect(key).toBeDefined();
    expect(key!.length).toBeGreaterThan(10);
    expect(key!.startsWith("xkeysib-")).toBe(true);
  });

  it("should be able to call Brevo account endpoint", async () => {
    const key = process.env.BREVO_API_KEY;
    const resp = await fetch("https://api.brevo.com/v3/account", {
      headers: { "api-key": key! },
    });
    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(data.email).toBeDefined();
  });
});
