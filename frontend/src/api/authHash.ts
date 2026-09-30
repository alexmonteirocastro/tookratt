export const PENDING_PASSWORD_TYPE_KEY = "tookratt_pending_password_type";
export const PENDING_TOKEN_HASH_KEY = "tookratt_pending_token_hash";

export type PasswordLinkType = "invite" | "recovery";

export interface AuthRedirect {
  type: PasswordLinkType | null;
  errorCode: string | null;
}

export interface PendingToken {
  tokenHash: string;
  type: PasswordLinkType;
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

export function readPendingToken(): PendingToken | null {
  try {
    const raw = sessionStorage.getItem(PENDING_TOKEN_HASH_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    const tokenHash = "tokenHash" in parsed ? parsed.tokenHash : null;
    const type = "type" in parsed ? parsed.type : null;
    if (typeof tokenHash !== "string" || !tokenHash) {
      return null;
    }
    if (type !== "invite" && type !== "recovery") {
      return null;
    }
    return { tokenHash, type };
  } catch {
    return null;
  }
}

export function writePendingToken(token: PendingToken): void {
  try {
    sessionStorage.setItem(PENDING_TOKEN_HASH_KEY, JSON.stringify(token));
  } catch {
    // Unavailable storage. This load can still submit from the in-memory copy.
  }
}

export function clearPendingToken(): void {
  try {
    sessionStorage.removeItem(PENDING_TOKEN_HASH_KEY);
  } catch {
    // Best-effort, same as a missing token.
  }
}

export function parsePasswordTokenHash(hash: string): PendingToken | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  if (params.get("error") || params.get("error_code") || params.get("error_description")) {
    return null;
  }
  const tokenHash = params.get("token_hash");
  const typeParam = params.get("type");
  if (!tokenHash || (typeParam !== "invite" && typeParam !== "recovery")) {
    return null;
  }
  return { tokenHash, type: typeParam };
}

/**
 * Copy the fragment before `createClient`. supabase-js clears a successful
 * implicit hash inside `_getSessionFromURL`, so a later read of `type` is lost.
 * Error fragments are not cleared by the client, so this removes them.
 */
function stripHash(): void {
  const url = new URL(window.location.href);
  url.hash = "";
  const next = `${url.pathname}${url.search}`;
  window.history.replaceState(window.history.state, "", next);
}

export function captureAuthRedirect(hash: string): AuthRedirect {
  const pending = parsePasswordTokenHash(hash);
  if (pending) {
    writePendingToken(pending);
    if (typeof window !== "undefined") {
      stripHash();
    }
    return { type: null, errorCode: null };
  }
  const parsed = parseAuthHash(hash);
  if (parsed.type) {
    writePendingPasswordType(parsed.type);
  }
  if (parsed.errorCode && typeof window !== "undefined") {
    stripHash();
  }
  return parsed;
}
