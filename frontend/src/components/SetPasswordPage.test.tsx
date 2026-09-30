import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PENDING_PASSWORD_TYPE_KEY, PENDING_TOKEN_HASH_KEY, writePendingToken } from "../api/authHash";
import { SetPasswordPage } from "./SetPasswordPage";

const updateUser = vi.hoisted(() => vi.fn());
const verifyOtp = vi.hoisted(() => vi.fn());

vi.mock("../api/supabase", () => ({
  supabase: { auth: { updateUser, verifyOtp } },
}));

function renderPage(type: "invite" | "recovery" = "invite", email = "sara@example.com") {
  const onDone = vi.fn();
  render(
    <MemoryRouter>
      <SetPasswordPage type={type} email={email} onDone={onDone} />
    </MemoryRouter>,
  );
  return onDone;
}

describe("SetPasswordPage", () => {
  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    updateUser.mockReset();
    verifyOtp.mockReset();
  });

  it("shows the invite and recovery headings from the stored type", () => {
    renderPage("invite");
    expect(screen.getByRole("heading", { name: "Welcome to Töökratt" })).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    cleanup();
    renderPage("recovery");
    expect(screen.getByRole("heading", { name: "Set a new password" })).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
  });

  it("rejects a short password and a mismatch", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Password"), "short");
    await user.type(screen.getByLabelText("Type it again"), "short");
    await user.click(screen.getByRole("button", { name: "Set password and continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Use at least 8 characters.");
    expect(updateUser).not.toHaveBeenCalled();
    expect(verifyOtp).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("Password"));
    await user.type(screen.getByLabelText("Password"), "long-enough");
    await user.clear(screen.getByLabelText("Type it again"));
    await user.type(screen.getByLabelText("Type it again"), "different");
    await user.click(screen.getByRole("button", { name: "Set password and continue" }));
    expect(await screen.findByText("The two passwords don't match.")).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("clears the pending flag only after updateUser succeeds", async () => {
    sessionStorage.setItem(PENDING_PASSWORD_TYPE_KEY, "invite");
    updateUser.mockResolvedValue({ data: { user: {} }, error: null });
    const user = userEvent.setup();
    const onDone = renderPage();

    await user.type(screen.getByLabelText("Password"), "long-enough");
    await user.type(screen.getByLabelText("Type it again"), "long-enough");
    await user.click(screen.getByRole("button", { name: "Set password and continue" }));

    expect(updateUser).toHaveBeenCalledWith({ password: "long-enough" });
    expect(sessionStorage.getItem(PENDING_PASSWORD_TYPE_KEY)).toBeNull();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("keeps the pending flag when updateUser fails", async () => {
    sessionStorage.setItem(PENDING_PASSWORD_TYPE_KEY, "invite");
    updateUser.mockResolvedValue({
      data: { user: null },
      error: { status: 500, message: "unavailable" },
    });
    const user = userEvent.setup();
    const onDone = renderPage();

    await user.type(screen.getByLabelText("Password"), "long-enough");
    await user.type(screen.getByLabelText("Type it again"), "long-enough");
    await user.click(screen.getByRole("button", { name: "Set password and continue" }));

    expect(await screen.findByRole("heading", { name: "Paused right now" })).toBeInTheDocument();
    expect(sessionStorage.getItem(PENDING_PASSWORD_TYPE_KEY)).toBe("invite");
    expect(onDone).not.toHaveBeenCalled();
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("omits the address until a session email is known", () => {
    renderPage("invite", "");
    expect(screen.getByText(/Set a password\. You'll log in/)).toBeInTheDocument();
    expect(screen.queryByText(/sara@example.com/)).not.toBeInTheDocument();
  });

  it("verifies a stored token before updateUser, even when an email is already shown", async () => {
    writePendingToken({ tokenHash: "hash-1", type: "invite" });
    verifyOtp.mockResolvedValue({
      data: { user: { email: "friend@example.com" }, session: {} },
      error: null,
    });
    updateUser.mockResolvedValue({ data: { user: {} }, error: null });
    const user = userEvent.setup();
    const onDone = renderPage("invite", "admin@example.com");

    await user.type(screen.getByLabelText("Password"), "long-enough");
    await user.type(screen.getByLabelText("Type it again"), "long-enough");
    await user.click(screen.getByRole("button", { name: "Set password and continue" }));

    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "hash-1", type: "invite" });
    expect(updateUser).toHaveBeenCalledWith({ password: "long-enough" });
    expect(verifyOtp.mock.invocationCallOrder[0]).toBeLessThan(updateUser.mock.invocationCallOrder[0]);
    expect(sessionStorage.getItem(PENDING_TOKEN_HASH_KEY)).toBeNull();
    expect(sessionStorage.getItem(PENDING_PASSWORD_TYPE_KEY)).toBeNull();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("retries updateUser without a second verify after the token was accepted", async () => {
    writePendingToken({ tokenHash: "hash-1", type: "invite" });
    verifyOtp.mockResolvedValue({
      data: { user: { email: "friend@example.com" }, session: {} },
      error: null,
    });
    updateUser.mockResolvedValue({
      data: { user: null },
      error: { status: 422, code: "weak_password", message: "too short" },
    });
    const user = userEvent.setup();
    renderPage("invite", "");

    await user.type(screen.getByLabelText("Password"), "long-enough");
    await user.type(screen.getByLabelText("Type it again"), "long-enough");
    await user.click(screen.getByRole("button", { name: "Set password and continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong/i);
    expect(sessionStorage.getItem(PENDING_TOKEN_HASH_KEY)).toBeNull();
    expect(sessionStorage.getItem(PENDING_PASSWORD_TYPE_KEY)).toBe("invite");
    expect(verifyOtp).toHaveBeenCalledTimes(1);

    updateUser.mockResolvedValue({ data: { user: {} }, error: null });
    await user.click(screen.getByRole("button", { name: "Set password and continue" }));

    expect(verifyOtp).toHaveBeenCalledTimes(1);
    expect(updateUser).toHaveBeenCalledTimes(2);
  });

  it("shows the expired card and drops the token when verify fails", async () => {
    writePendingToken({ tokenHash: "hash-1", type: "recovery" });
    verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: "otp_expired", message: "expired" },
    });
    const user = userEvent.setup();
    renderPage("recovery", "");

    await user.type(screen.getByLabelText("New password"), "long-enough");
    await user.type(screen.getByLabelText("Type it again"), "long-enough");
    await user.click(screen.getByRole("button", { name: "Save new password" }));

    expect(await screen.findByRole("heading", { name: "This link has expired" })).toBeInTheDocument();
    expect(screen.getByText(/already used, or it is older than 24 hours/i)).toBeInTheDocument();
    expect(sessionStorage.getItem(PENDING_TOKEN_HASH_KEY)).toBeNull();
    expect(updateUser).not.toHaveBeenCalled();
  });
});
