import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTH_FALLBACK_MESSAGE, CREDENTIALS_MESSAGE } from "../api/authErrors";
import { LoginPage } from "./LoginPage";

const signInWithPassword = vi.hoisted(() => vi.fn());

vi.mock("../api/supabase", () => ({
  supabase: { auth: { signInWithPassword } },
}));

describe("LoginPage", () => {
  afterEach(() => {
    cleanup();
    signInWithPassword.mockReset();
  });

  it("links out for access and for the privacy notice", () => {
    render(<LoginPage sessionEnded={false} />);

    expect(screen.getByRole("link", { name: "Request access at tookratt.com" })).toHaveAttribute(
      "href",
      "https://tookratt.com",
    );
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "https://tookratt.com/privacy",
    );
  });

  it("asks for a full email before calling Supabase", async () => {
    const user = userEvent.setup();
    render(<LoginPage sessionEnded={false} />);

    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a full email address.");
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("shows the shared credentials sentence", async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: { code: "invalid_credentials", message: "Invalid login credentials" },
    });
    const user = userEvent.setup();
    render(<LoginPage sessionEnded={false} />);

    await user.type(screen.getByLabelText("Email"), "sara@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(CREDENTIALS_MESSAGE);
  });

  it("replaces the form when the project is paused", async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: { name: "AuthRetryableFetchError", status: 0, message: "Failed to fetch" },
    });
    const user = userEvent.setup();
    render(<LoginPage sessionEnded={false} />);

    await user.type(screen.getByLabelText("Email"), "sara@example.com");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("heading", { name: "Paused right now" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "hello@tookratt.com" })).toHaveAttribute(
      "href",
      "mailto:hello@tookratt.com",
    );
  });

  it("shows the fallback sentence for a rate limit", async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: { status: 429, code: "over_request_rate_limit", message: "Request rate limit reached" },
    });
    const user = userEvent.setup();
    render(<LoginPage sessionEnded={false} />);

    await user.type(screen.getByLabelText("Email"), "sara@example.com");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(AUTH_FALLBACK_MESSAGE);
  });
});
