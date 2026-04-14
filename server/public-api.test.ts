import { describe, it, expect } from "vitest";

const BASE = "http://localhost:3000";
const API_KEY = process.env.PUBLIC_API_KEY || "";

describe("GET /api/public/data", () => {
  it("should have PUBLIC_API_KEY env var set", () => {
    expect(API_KEY).toBeTruthy();
    expect(API_KEY.length).toBe(64);
  });

  it("should return 401 without API key", async () => {
    const res = await fetch(`${BASE}/api/public/data?limit=1`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("Invalid or missing API key");
  });

  it("should return 401 with wrong API key", async () => {
    const res = await fetch(`${BASE}/api/public/data?limit=1`, {
      headers: { "X-API-Key": "wrong-key" },
    });
    expect(res.status).toBe(401);
  });

  it("should return 200 with correct API key", async () => {
    const res = await fetch(`${BASE}/api/public/data?limit=2`, {
      headers: { "X-API-Key": API_KEY },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("items");
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("categories");
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);
  });

  it("should return items matching the expected schema", async () => {
    const res = await fetch(`${BASE}/api/public/data?category=employee&limit=1`, {
      headers: { "X-API-Key": API_KEY },
    });
    const body = await res.json();
    const item = body.items[0];
    expect(item).toHaveProperty("id");
    expect(item).toHaveProperty("title");
    expect(item).toHaveProperty("category", "employee");
    expect(item).toHaveProperty("description");
    expect(item).toHaveProperty("url");
    expect(item).toHaveProperty("updatedAt");
    expect(item).toHaveProperty("meta");
  });

  it("should support CORS preflight", async () => {
    const res = await fetch(`${BASE}/api/public/data`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://external-site.example.com",
        "Access-Control-Request-Headers": "X-API-Key",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-headers")).toContain("X-API-Key");
  });
});
