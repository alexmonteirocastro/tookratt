export const PENDING_PASSWORD_TYPE_KEY = "tookratt_pending_password_type";

export type PasswordLinkType = "invite" | "recovery";

export interface AuthRedirect {
  type: PasswordLinkType | null;
  errorCode: string | null;
}

export function parseAuthHash(hash: string): AuthRedirect {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  const errorCode = params.get("error_code");
  const hasError = Boolean(errorCode || params.get("error") || params.get("error_description"));
  if (hasError) {
    return { type: null, errorCode: errorCode ?? "unspecified_code" };
  }
  const typeParam = params.get("type");
  const type = typeParam === "invite" || typeParam === "recovery" ? typeParam : null;
  return { type, errorCode: null };
}

export function readPendingPasswordType(): PasswordLinkType | null {
  try {
    const value = sessionStorage.getItem(PENDING_PASSWORD_TYPE_KEY);
    if (value === "invite" || value === "recovery") {
      return value;
    }
    return null;
  } catch {
    return null;
  }
}

export function writePendingPasswordType(type: PasswordLinkType): void {
  try {
    sessionStorage.setItem(PENDING_PASSWORD_TYPE_KEY, type);
  } catch {
    // Unavailable storage (private mode). The in-memory redirect still routes this load.
  }
}

export function clearPendingPasswordType(): void {
  try {
    sessionStorage.removeItem(PENDING_PASSWORD_TYPE_KEY);
  } catch {
    // Best-effort, same as a missing flag.
  }
}

/**
 * Copy the fragment before `createClient`. supabase-js clears a successful
 * implicit hash inside `_getSessionFromURL`, so a later read of `type` is lost.
 * Error fragments are not cleared by the client, so this removes them.
 */
export function captureAuthRedirect(hash: string): AuthRedirect {
  const parsed = parseAuthHash(hash);
  if (parsed.type) {
    writePendingPasswordType(parsed.type);
  }
  if (parsed.errorCode && typeof window !== "undefined") {
    const url = new URL(window.location.href);
    url.hash = "";
    const next = `${url.pathname}${url.search}`;
    window.history.replaceState(window.history.state, "", next);
  }
  return parsed;
}
