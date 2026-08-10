/** Mirrors marketing/src/forms.ts bounds — kept separate per ALE-177 (not a shared module). */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_EMAIL = 254;
export const MAX_NAME = 120;
export const MAX_MESSAGE = 2000;

export type FormKind = "waitlist" | "contact";

export type CapturePayload = {
  type: FormKind;
  email: string;
  name?: string;
  message?: string;
  turnstileToken: string;
};

export function parseCapturePayload(raw: unknown): CapturePayload | string {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return "Request body must be a JSON object.";
  }

  const body = raw as Record<string, unknown>;
  const type = body.type;
  if (type !== "waitlist" && type !== "contact") {
    return 'Field "type" must be "waitlist" or "contact".';
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email || !EMAIL_RE.test(email) || email.length > MAX_EMAIL) {
    return "Please provide a valid email address.";
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length > MAX_NAME) {
    return `Name must be at most ${MAX_NAME} characters.`;
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (message.length > MAX_MESSAGE) {
    return `Message must be at most ${MAX_MESSAGE} characters.`;
  }

  if (type === "contact") {
    if (!name) {
      return "Please enter your name.";
    }
    if (!message) {
      return "Please enter a message.";
    }
  }

  const turnstileToken =
    typeof body.turnstileToken === "string" ? body.turnstileToken.trim() : "";
  if (!turnstileToken) {
    return "Turnstile token is required.";
  }

  const payload: CapturePayload = {
    type,
    email,
    turnstileToken,
  };
  if (name) {
    payload.name = name;
  }
  if (type === "contact") {
    payload.message = message;
  }
  return payload;
}

export function buildEmail(payload: CapturePayload): {
  subject: string;
  text: string;
} {
  if (payload.type === "waitlist") {
    return {
      subject: `Waitlist: ${payload.email}`,
      text: [
        "New waitlist signup from tookratt.com",
        "",
        `Email: ${payload.email}`,
        `Name: ${payload.name ?? "(not provided)"}`,
      ].join("\n"),
    };
  }

  return {
    subject: `Contact: ${payload.name ?? "inquiry"} <${payload.email}>`,
    text: [
      "New contact message from tookratt.com",
      "",
      `Name: ${payload.name}`,
      `Email: ${payload.email}`,
      "",
      payload.message ?? "",
    ].join("\n"),
  };
}
