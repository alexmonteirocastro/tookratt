import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_FALLBACK_MESSAGE, CREDENTIALS_MESSAGE, classifyAuthError } from "./authErrors";
import { handleAuthChange } from "./authEvents";
import {
  PENDING_PASSWORD_TYPE_KEY,
  PENDING_TOKEN_HASH_KEY,
  captureAuthRedirect,
  clearPendingPasswordType,
  clearPendingToken,
  parseAuthHash,
  parsePasswordTokenHash,
  readPendingPasswordType,
  readPendingToken,
} from "./authHash";

describe("parseAuthHash", () => {
  it("reads invite, recovery, expired, banned, and an empty hash", () => {
    expect(parseAuthHash("#access_token=abc&type=invite")).toEqual({
      type: "invite",
      errorCode: null,
    });
    expect(parseAuthHash("#type=recovery&access_token=abc")).toEqual({
      type: "recovery",
      errorCode: null,
    });
    expect(parseAuthHash("#error=access_denied&error_code=otp_expired")).toEqual({
      type: null,
      errorCode: "otp_expired",
    });
    expect(parseAuthHash("#error=access_denied&error_code=user_banned")).toEqual({
      type: null,
      errorCode: "user_banned",
    });
    expect(parseAuthHash("")).toEqual({ type: null, errorCode: null });
  });
});

describe("parsePasswordTokenHash", () => {
  it("reads invite and recovery token hashes and ignores other fragments", () => {
    expect(parsePasswordTokenHash("#token_hash=abc&type=invite")).toEqual({
      tokenHash: "abc",
      type: "invite",
    });
    expect(parsePasswordTokenHash("#type=recovery&token_hash=xyz")).toEqual({
      tokenHash: "xyz",
      type: "recovery",
    });
    expect(parsePasswordTokenHash("#access_token=abc&type=invite")).toBeNull();
    expect(parsePasswordTokenHash("#token_hash=abc&type=magiclink")).toBeNull();
    expect(parsePasswordTokenHash("#error=access_denied&error_code=otp_expired&token_hash=abc")).toBeNull();
  });
});

describe("captureAuthRedirect", () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    sessionStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("stores invite and recovery types and leaves a success hash for the client", () => {
    window.history.replaceState(null, "", "/#access_token=abc&type=invite");
    expect(captureAuthRedirect(window.location.hash).type).toBe("invite");
    expect(readPendingPasswordType()).toBe("invite");
    expect(window.location.hash).toContain("type=invite");

    clearPendingPasswordType();
    window.history.replaceState(null, "", "/#type=recovery&access_token=abc");
    expect(captureAuthRedirect(window.location.hash).type).toBe("recovery");
    expect(readPendingPasswordType()).toBe("recovery");
  });

  it("stores a token hash, strips the fragment, and does not set the pending type", () => {
    window.history.replaceState(null, "", "/set-password#token_hash=abc&type=invite");
    expect(captureAuthRedirect(window.location.hash)).toEqual({ type: null, errorCode: null });
    expect(readPendingToken()).toEqual({ tokenHash: "abc", type: "invite" });
    expect(readPendingPasswordType()).toBeNull();
    expect(window.location.hash).toBe("");

    clearPendingToken();
    window.history.replaceState(null, "", "/set-password#type=recovery&token_hash=xyz");
    captureAuthRedirect(window.location.hash);
    expect(readPendingToken()).toEqual({ tokenHash: "xyz", type: "recovery" });
    expect(sessionStorage.getItem(PENDING_PASSWORD_TYPE_KEY)).toBeNull();
    expect(window.location.hash).toBe("");
  });

  it("clears an error fragment and does not set the pending flag", () => {
    window.history.replaceState(null, "", "/#error=access_denied&error_code=otp_expired");
    expect(captureAuthRedirect(window.location.hash)).toEqual({
      type: null,
      errorCode: "otp_expired",
    });
    expect(window.location.hash).toBe("");
    expect(sessionStorage.getItem(PENDING_PASSWORD_TYPE_KEY)).toBeNull();
    expect(sessionStorage.getItem(PENDING_TOKEN_HASH_KEY)).toBeNull();

    window.history.replaceState(null, "", "/#error=access_denied&error_code=user_banned");
    expect(captureAuthRedirect(window.location.hash).errorCode).toBe("user_banned");
    expect(window.location.hash).toBe("");
    expect(readPendingPasswordType()).toBeNull();
  });
});

describe("classifyAuthError", () => {
  it("maps credentials, bans, pauses, and everything else", () => {
    expect(classifyAuthError({ code: "invalid_credentials" })).toBe("credentials");
    expect(classifyAuthError({ code: "user_banned" })).toBe("credentials");
    expect(classifyAuthError({ name: "AuthRetryableFetchError", message: "Failed to fetch", status: 0 })).toBe(
      "paused",
    );
    expect(classifyAuthError({ status: 503, message: "Project is paused" })).toBe("paused");
    expect(classifyAuthError({ status: 429, code: "over_request_rate_limit", message: "slow down" })).toBe(
      "other",
    );
    expect(AUTH_FALLBACK_MESSAGE).toBe("Something went wrong. Wait a moment and try again.");
    expect(CREDENTIALS_MESSAGE).toMatch(/don't match/);
  });
});

describe("handleAuthChange", () => {
  it("navigates once on a spontaneous SIGNED_OUT", () => {
    const navigateToSessionEnded = vi.fn();
    handleAuthChange("SIGNED_OUT", {
      userAskedToLeave: false,
      navigateToSessionEnded,
      resetLeaveFlag: vi.fn(),
    });
    expect(navigateToSessionEnded).toHaveBeenCalledTimes(1);
  });

  it("does not navigate when the user already asked to leave", () => {
    const navigateToSessionEnded = vi.fn();
    handleAuthChange("SIGNED_OUT", {
      userAskedToLeave: true,
      navigateToSessionEnded,
      resetLeaveFlag: vi.fn(),
    });
    expect(navigateToSessionEnded).not.toHaveBeenCalled();
  });

  it("resets the leave flag on SIGNED_IN", () => {
    const resetLeaveFlag = vi.fn();
    handleAuthChange("SIGNED_IN", {
      userAskedToLeave: true,
      navigateToSessionEnded: vi.fn(),
      resetLeaveFlag,
    });
    expect(resetLeaveFlag).toHaveBeenCalledTimes(1);
  });
});
