import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PENDING_PASSWORD_TYPE_KEY } from "../api/authHash";
import { SetPasswordPage } from "./SetPasswordPage";

const updateUser = vi.hoisted(() => vi.fn());

vi.mock("../api/supabase", () => ({
  supabase: { auth: { updateUser } },
}));

function renderPage(type: "invite" | "recovery" = "invite") {
  const onDone = vi.fn();
  render(
    <MemoryRouter>
      <SetPasswordPage type={type} email="sara@example.com" onDone={onDone} />
    </MemoryRouter>,
  );
  return onDone;
}

describe("SetPasswordPage", () => {
  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    updateUser.mockReset();
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
  });
});
