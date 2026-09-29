import { clearPendingPasswordType } from "./authHash";
import { AUTH_STORAGE_KEY, supabase } from "./supabase";

let userAskedToLeave = false;
let sessionEndedNote = false;

/** The next guest redirect to /login should show the session-ended note. */
export function armSessionEndedNote(): void {
  sessionEndedNote = true;
}

export function sessionEndedNoteArmed(): boolean {
  return sessionEndedNote;
}

export function disarmSessionEndedNote(): void {
  sessionEndedNote = false;
}

export function markUserAskedToLeave(): void {
  userAskedToLeave = true;
}

export function resetUserAskedToLeave(): void {
  userAskedToLeave = false;
}

export function didUserAskToLeave(): boolean {
  return userAskedToLeave;
}

export function clearAuthStorage(): void {
  try {
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // Storage can throw. The caller still navigates away.
  }
}

/** Local scope only. Never call this from `onAuthStateChange`. */
export async function signOutLocal(): Promise<void> {
  clearPendingPasswordType();
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    clearAuthStorage();
  }
}
