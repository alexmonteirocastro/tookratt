import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:email", () => ({
  EmailMessage: class EmailMessage {
    constructor(
      public readonly from: string,
      public readonly to: string,
      public readonly raw: string,
    ) {}
  },
}));

import type { Env } from "./index";
import worker from "./index";

const ALLOWED = "https://tookratt.com";

function post(
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request("https://tookratt-capture.example/capture", {
    method: "POST",
    headers: {
      Origin: ALLOWED,
      "Content-Type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function waitlistBody(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    type: "waitlist",
    email: "alex@example.com",
    turnstileToken: "token",
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("capture fetch handler", () => {
  let env: Env;
  let send: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    send = vi.fn().mockResolvedValue(undefined);
    env = {
      TURNSTILE_SECRET_KEY: "secret",
      EMAIL: { send },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      ),
    );
  });

  it("returns 403 for OPTIONS from a disallowed origin", async () => {
    const request = new Request("https://tookratt-capture.example/", {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example" },
    });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(403);
  });

  it("returns 204 for OPTIONS from an allowed origin", async () => {
    const request = new Request("https://tookratt-capture.example/", {
      method: "OPTIONS",
      headers: { Origin: ALLOWED },
    });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED);
  });

  it("returns 403 when Origin is not allow-listed", async () => {
    const request = post(waitlistBody(), {
      Origin: "https://evil.example",
    });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Origin not allowed.",
    });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("returns 500 when TURNSTILE_SECRET_KEY is missing", async () => {
    env.TURNSTILE_SECRET_KEY = "";
    const response = await worker.fetch(post(waitlistBody()), env);
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Capture is misconfigured.",
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("returns 403 when Turnstile verification fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: false }), { status: 200 }),
      ),
    );
    const response = await worker.fetch(post(waitlistBody()), env);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Turnstile verification failed.",
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("returns 502 when email send fails", async () => {
    send.mockRejectedValueOnce(new Error("smtp down"));
    const response = await worker.fetch(post(waitlistBody()), env);
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Could not send email. Please try again later.",
    });
  });

  it("returns 200 and sends email on success", async () => {
    const response = await worker.fetch(
      post(waitlistBody({ name: "Alex" })),
      env,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(send).toHaveBeenCalledOnce();
    const message = send.mock.calls[0]?.[0] as {
      from: string;
      to: string;
      raw: string;
    };
    expect(message.from).toBe("noreply@tookratt.com");
    expect(message.to).toBe("hello@tookratt.com");
    expect(message.raw).toContain("Reply-To: <alex@example.com>");
    expect(message.raw).toContain("From: <noreply@tookratt.com>");
    expect(message.raw).not.toMatch(/From:.*[Tt]öökratt/);
  });
});
