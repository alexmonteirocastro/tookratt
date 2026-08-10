import { describe, expect, it } from "vitest";
import { buildEmail, parseCapturePayload } from "./validate";

describe("parseCapturePayload", () => {
  it("accepts a minimal waitlist payload", () => {
    const result = parseCapturePayload({
      type: "waitlist",
      email: "alex@example.com",
      turnstileToken: "token",
    });
    expect(result).toEqual({
      type: "waitlist",
      email: "alex@example.com",
      turnstileToken: "token",
    });
  });

  it("requires name and message for contact", () => {
    expect(
      parseCapturePayload({
        type: "contact",
        email: "alex@example.com",
        turnstileToken: "token",
      }),
    ).toBe("Please enter your name.");

    expect(
      parseCapturePayload({
        type: "contact",
        email: "alex@example.com",
        name: "Alex",
        turnstileToken: "token",
      }),
    ).toBe("Please enter a message.");
  });

  it("rejects invalid email and missing turnstile", () => {
    expect(
      parseCapturePayload({
        type: "waitlist",
        email: "not-an-email",
        turnstileToken: "token",
      }),
    ).toBe("Please provide a valid email address.");

    expect(
      parseCapturePayload({
        type: "waitlist",
        email: "alex@example.com",
      }),
    ).toBe("Turnstile token is required.");
  });
});

describe("buildEmail", () => {
  it("formats waitlist and contact subjects", () => {
    expect(
      buildEmail({
        type: "waitlist",
        email: "a@b.co",
        turnstileToken: "t",
      }).subject,
    ).toBe("Waitlist: a@b.co");

    expect(
      buildEmail({
        type: "contact",
        email: "a@b.co",
        name: "Alex",
        message: "Hello",
        turnstileToken: "t",
      }).subject,
    ).toContain("Alex");
  });
});
