import { getTurnstileSiteKey } from "./config";

const pending: Array<() => void> = [];

function flushPending(): void {
  if (!window.turnstile) {
    return;
  }
  while (pending.length > 0) {
    pending.shift()?.();
  }
}

export function whenTurnstileReady(callback: () => void): void {
  if (window.turnstile) {
    callback();
    return;
  }
  pending.push(callback);
  window.onloadTurnstileCallback = flushPending;
  // api.js may already be loaded without an explicit callback name.
  const poll = window.setInterval(() => {
    if (window.turnstile) {
      window.clearInterval(poll);
      flushPending();
    }
  }, 100);
  window.setTimeout(() => window.clearInterval(poll), 10_000);
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
