import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyTurnstileToken } from "./turnstile";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("verifyTurnstileToken", () => {
  it("returns true when siteverify reports success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      ),
    );

    await expect(
      verifyTurnstileToken("secret", "token", "1.2.3.4"),
    ).resolves.toBe(true);
  });

  it("returns false when siteverify reports failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: false }), { status: 200 }),
      ),
    );

    await expect(verifyTurnstileToken("secret", "token")).resolves.toBe(false);
  });

  it("returns false on network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );

    await expect(verifyTurnstileToken("secret", "token")).resolves.toBe(false);
  });

  it("returns false on non-OK HTTP or invalid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 500 })),
    );
    await expect(verifyTurnstileToken("secret", "token")).resolves.toBe(false);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{", { status: 200 })),
    );
    await expect(verifyTurnstileToken("secret", "token")).resolves.toBe(false);
  });
});
