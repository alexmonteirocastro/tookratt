import { describe, expect, it } from "vitest";
import { corsHeaders, isAllowedOrigin } from "./cors";

describe("isAllowedOrigin", () => {
  it("allows apex and www only", () => {
    expect(isAllowedOrigin("https://tookratt.com")).toBe(true);
    expect(isAllowedOrigin("https://www.tookratt.com")).toBe(true);
    expect(isAllowedOrigin("https://app.tookratt.com")).toBe(false);
    expect(isAllowedOrigin("http://localhost:5173")).toBe(false);
    expect(isAllowedOrigin(null)).toBe(false);
  });
});

describe("corsHeaders", () => {
  it("sets Access-Control-Allow-Origin only for allowed origins", () => {
    const allowed = corsHeaders("https://tookratt.com") as Record<string, string>;
    expect(allowed["Access-Control-Allow-Origin"]).toBe("https://tookratt.com");

    const denied = corsHeaders("https://evil.example") as Record<string, string>;
    expect(denied["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(denied.Vary).toBe("Origin");
  });
});
