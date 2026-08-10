const DEFAULT_APP_URL = "https://app.tookratt.com";
const CONTACT_EMAIL = "hello@tookratt.com";

export function getAppUrl(): string {
  const raw = import.meta.env.VITE_APP_URL?.trim();
  return raw || DEFAULT_APP_URL;
}

export function getCaptureUrl(): string | null {
  const raw = import.meta.env.VITE_CAPTURE_URL?.trim();
  return raw || null;
}

export function getTurnstileSiteKey(): string | null {
  const raw = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim();
  return raw || null;
}

export function getContactEmail(): string {
  return CONTACT_EMAIL;
}

export function usesMailtoFallback(): boolean {
  return getCaptureUrl() === null;
}
