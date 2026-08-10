import {
  getCaptureUrl,
  getContactEmail,
  usesMailtoFallback,
} from "./config";
import { renderTurnstile, resetTurnstile, whenTurnstileReady } from "./turnstile";

export type FormKind = "waitlist" | "contact";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL = 254;
const MAX_NAME = 120;
const MAX_MESSAGE = 2000;

function setStatus(
  el: HTMLElement,
  kind: "error" | "success" | "info",
  message: string,
): void {
  el.dataset.kind = kind;
  el.textContent = message;
}

function openMailto(kind: FormKind, fields: Record<string, string>): void {
  const email = getContactEmail();
  const subject =
    kind === "waitlist"
      ? "Töökratt waitlist"
      : `Töökratt contact — ${fields.name || "inquiry"}`;
  const body =
    kind === "waitlist"
      ? `Please add me to the waitlist.\n\nEmail: ${fields.email}\nName: ${fields.name || "(not provided)"}`
      : `Name: ${fields.name}\nEmail: ${fields.email}\n\n${fields.message}`;
  const href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = href;
}

async function postCapture(
  kind: FormKind,
  fields: Record<string, string>,
  turnstileToken: string,
): Promise<void> {
  const url = getCaptureUrl();
  if (!url) {
    throw new Error("Capture URL is not configured");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: kind,
      ...fields,
      turnstileToken,
    }),
  });

  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) {
        detail = data.error;
      }
    } catch {
      // keep status fallback
    }
    throw new Error(detail);
  }
}

function readFields(form: HTMLFormElement): Record<string, string> {
  const data = new FormData(form);
  const fields: Record<string, string> = {};
  for (const [key, value] of data.entries()) {
    if (typeof value === "string") {
      fields[key] = value.trim();
    }
  }
  return fields;
}

function validate(kind: FormKind, fields: Record<string, string>): string | null {
  if (!fields.email || !EMAIL_RE.test(fields.email) || fields.email.length > MAX_EMAIL) {
    return "Please enter a valid email address.";
  }
  if (fields.name && fields.name.length > MAX_NAME) {
    return `Name must be at most ${MAX_NAME} characters.`;
  }
  if (kind === "contact") {
    if (!fields.name) {
      return "Please enter your name.";
    }
    if (!fields.message) {
      return "Please enter a message.";
    }
    if (fields.message.length > MAX_MESSAGE) {
      return `Message must be at most ${MAX_MESSAGE} characters.`;
    }
  }
  return null;
}

export function bindForm(form: HTMLFormElement, kind: FormKind): void {
  const status = form.querySelector<HTMLElement>("[data-form-status]");
  const turnstileSlot = form.querySelector<HTMLElement>("[data-turnstile]");
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!status || !turnstileSlot || !submit) {
    return;
  }

  let token = "";
  let widgetId: string | null = null;
  const mailtoMode = usesMailtoFallback();

  if (mailtoMode) {
    turnstileSlot.innerHTML =
      '<p class="form-status" data-kind="info">Capture Worker not configured yet — submit opens your email client.</p>';
  } else {
    whenTurnstileReady(() => {
      widgetId = renderTurnstile(turnstileSlot, (next) => {
        token = next;
      });
    });
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const fields = readFields(form);
    const validationError = validate(kind, fields);
    if (validationError) {
      setStatus(status, "error", validationError);
      return;
    }

    if (mailtoMode) {
      setStatus(
        status,
        "info",
        "Opening your email client… If nothing opens, write to hello@tookratt.com.",
      );
      openMailto(kind, fields);
      return;
    }

    if (!token) {
      setStatus(status, "error", "Please complete the Turnstile check.");
      return;
    }

    submit.disabled = true;
    setStatus(status, "info", "Sending…");

    void postCapture(kind, fields, token)
      .then(() => {
        form.reset();
        token = "";
        resetTurnstile(widgetId);
        setStatus(
          status,
          "success",
          kind === "waitlist"
            ? "You're on the list — thanks for your interest."
            : "Message sent — we'll get back to you.",
        );
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : "Something went wrong.";
        setStatus(status, "error", message);
        resetTurnstile(widgetId);
        token = "";
      })
      .finally(() => {
        submit.disabled = false;
      });
  });
}
