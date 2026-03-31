import { describe, expect, it } from "vitest";

describe("Resend API Key Validation", () => {
  it("should have a valid Resend API key that can reach the API", async () => {
    const apiKey = process.env.RESEND_API_KEY;
    expect(apiKey).toBeDefined();
    expect(apiKey).toBeTruthy();
    expect(apiKey!.startsWith("re_")).toBe(true);

    // Test the key by calling the Resend API domains endpoint (lightweight, no email sent)
    const response = await fetch("https://api.resend.com/domains", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    // A valid key returns 200, an invalid key returns 401/403
    expect(response.status).toBe(200);
  });
});
