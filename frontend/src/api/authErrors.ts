/** Spec does not define this. Used for rate limits and any other auth error. */
export const AUTH_FALLBACK_MESSAGE = "Something went wrong. Wait a moment and try again.";

export const CREDENTIALS_MESSAGE =
  "That email and password don't match. Try again, or ask us for a reset link.";

export type AuthFailure = "paused" | "credentials" | "other";

export interface AuthErrorLike {
  name?: string;
  status?: number;
  code?: string;
  message?: string;
}

export function classifyAuthError(error: AuthErrorLike | null | undefined): AuthFailure {
  if (!error) {
    return "other";
  }
  if (error.code === "invalid_credentials" || error.code === "user_banned") {
    return "credentials";
  }
  const message = error.message ?? "";
  const status = error.status;
  if (
    error.name === "AuthRetryableFetchError" ||
    status === 0 ||
    (typeof status === "number" && status >= 500) ||
    /paused|inactive/i.test(message) ||
    /failed to fetch|networkerror|network error|load failed/i.test(message)
  ) {
    return "paused";
  }
  return "other";
}
