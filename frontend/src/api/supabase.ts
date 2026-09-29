import { createClient } from "@supabase/supabase-js";
import { captureAuthRedirect, type AuthRedirect } from "./authHash";

const configuredUrl = import.meta.env.VITE_SUPABASE_URL;
const configuredKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * Production must name the real project. A missing var used to fall through to
 * a dummy host, and the failed login was shown as "Paused right now".
 * Dev and unit tests keep the dummy host. Playwright sets its own values.
 */
function publicAuthEnv(name: string, value: string | undefined, fallback: string): string {
  if (value) {
    return value;
  }
  if (import.meta.env.PROD) {
    throw new Error(`${name} is required`);
  }
  return fallback;
}

export const SUPABASE_URL = publicAuthEnv(
  "VITE_SUPABASE_URL",
  configuredUrl,
  "https://example.supabase.co",
);
export const SUPABASE_PUBLISHABLE_KEY = publicAuthEnv(
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  configuredKey,
  "test-publishable-key",
);

export const AUTH_STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;

function sessionStorageAdapter(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  return {
    getItem(key: string) {
      try {
        return sessionStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key: string, value: string) {
      try {
        sessionStorage.setItem(key, value);
      } catch {
        // Unavailable storage. The session lives only until the next navigation.
      }
    },
    removeItem(key: string) {
      try {
        sessionStorage.removeItem(key);
      } catch {
        // Best-effort clear.
      }
    },
  };
}

/**
 * Captured before `createClient`. @supabase/auth-js 2.117 (supabase-js 2.117)
 * clears `window.location.hash` in `_getSessionFromURL` after a successful
 * implicit grant, which drops `type=invite` / `type=recovery` before React
 * renders. Error fragments are not cleared there, so `captureAuthRedirect`
 * removes those with `history.replaceState`.
 *
 * This package's default `flowType` is already `implicit`. It is set again
 * so a later default of `pkce` cannot reject the fragment session.
 */
export const initialAuthRedirect: AuthRedirect = captureAuthRedirect(
  typeof window === "undefined" ? "" : window.location.hash,
);

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "implicit",
    storage: sessionStorageAdapter(),
  },
});
