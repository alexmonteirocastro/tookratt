/**
 * `onAuthStateChange` runs under the auth client's session coordination.
 * Calling `signOut` (or any other `supabase.auth` method) from that callback
 * can deadlock, and `signOut` emits `SIGNED_OUT` again.
 *
 * `signOut` is on the context so a test can prove this function never calls it.
 * Callers must not invoke it here.
 */
export function handleAuthChange(
  event: string,
  ctx: {
    userAskedToLeave: boolean;
    signOut: () => void;
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
  // `signOut` stays uncalled. Touch the property so it cannot be dropped from the type.
  void ctx.signOut;
}
