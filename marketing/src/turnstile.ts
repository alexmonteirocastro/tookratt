import { getTurnstileSiteKey } from "./config";

const TURNSTILE_SCRIPT_ID = "cf-turnstile-api";
const TURNSTILE_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback";

const pending: Array<() => void> = [];
let scriptRequested = false;

function flushPending(): void {
  if (!window.turnstile) {
    return;
  }
  while (pending.length > 0) {
    pending.shift()?.();
  }
}

function ensureTurnstileScript(): void {
  if (window.turnstile || scriptRequested) {
    return;
  }
  scriptRequested = true;
  window.onloadTurnstileCallback = flushPending;

  if (document.getElementById(TURNSTILE_SCRIPT_ID)) {
    return;
  }

  const script = document.createElement("script");
  script.id = TURNSTILE_SCRIPT_ID;
  script.src = TURNSTILE_SRC;
  script.async = true;
  document.head.appendChild(script);
}

/** Resolve once Turnstile api.js is available. Loads the script on first call. */
export function whenTurnstileReady(callback: () => void): void {
  if (window.turnstile) {
    callback();
    return;
  }
  pending.push(callback);
  ensureTurnstileScript();
}

export function renderTurnstile(
  container: HTMLElement,
  onToken: (token: string) => void,
): string | null {
  const siteKey = getTurnstileSiteKey();
  if (!siteKey || !window.turnstile) {
    container.innerHTML =
      '<p class="form-status" data-kind="info">Turnstile site key not configured yet.</p>';
    return null;
  }

  container.replaceChildren();
  return window.turnstile.render(container, {
    sitekey: siteKey,
    theme: "light",
    callback: onToken,
    "expired-callback": () => onToken(""),
    "error-callback": () => onToken(""),
  });
}

export function resetTurnstile(widgetId: string | null): void {
  if (widgetId && window.turnstile) {
    window.turnstile.reset(widgetId);
  }
}
