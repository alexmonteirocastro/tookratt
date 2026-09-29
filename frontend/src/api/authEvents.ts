/**
 * `onAuthStateChange` runs under the auth client's session coordination.
 * Calling `signOut` (or any other `supabase.auth` method) from that callback
 * can deadlock, and `signOut` emits `SIGNED_OUT` again.
 */
export function handleAuthChange(
  event: string,
  ctx: {
    userAskedToLeave: boolean;
    navigateToSessionEnded: () => void;
    resetLeaveFlag: () => void;
  },
): void {
  if (event === "SIGNED_IN") {
    ctx.resetLeaveFlag();
    return;
  }
  if (event === "SIGNED_OUT" && !ctx.userAskedToLeave) {
    ctx.navigateToSessionEnded();
  }
}
