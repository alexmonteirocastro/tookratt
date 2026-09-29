import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Session } from "@supabase/supabase-js";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PENDING_PASSWORD_TYPE_KEY } from "./api/authHash";
import { disarmSessionEndedNote, resetUserAskedToLeave } from "./api/authSession";
import { CHAT_HISTORY_MAX_TURNS } from "./api/client";
import App from "./App";

const auth = vi.hoisted(() => {
  const listeners = new Set<(event: string, session: Session | null) => void>();
  const state: { session: Session | null } = { session: null };
  return {
    listeners,
    state,
    getSession: vi.fn(async () => ({ data: { session: state.session }, error: null })),
    signOut: vi.fn(async () => {
      state.session = null;
      for (const listener of listeners) {
        listener("SIGNED_OUT", null);
      }
      return { error: null };
    }),
    signInWithPassword: vi.fn(),
    updateUser: vi.fn(),
    getUser: vi.fn(),
  };
});

vi.mock("./api/supabase", () => ({
  supabase: {
    auth: {
      getSession: auth.getSession,
      signOut: auth.signOut,
      signInWithPassword: auth.signInWithPassword,
      updateUser: auth.updateUser,
      getUser: auth.getUser,
      onAuthStateChange: (callback: (event: string, session: Session | null) => void) => {
        auth.listeners.add(callback);
        callback("INITIAL_SESSION", auth.state.session);
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                auth.listeners.delete(callback);
              },
            },
          },
        };
      },
    },
  },
  initialAuthRedirect: { type: null, errorCode: null as string | null },
  AUTH_STORAGE_KEY: "sb-example-auth-token",
}));

function sessionFor(role: "admin" | "member" | null): Session {
  return {
    access_token: "session-token",
    refresh_token: "refresh-token",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: {
      id: "user-1",
      aud: "authenticated",
      role: "authenticated",
      email: "alex@example.com",
      app_metadata: role ? { role } : {},
      user_metadata: {},
      created_at: "2026-01-01T00:00:00.000Z",
    },
  } as Session;
}

const chatSuccessBody = {
  question: "hello",
  answer: "Here are some roles.",
  sources: [],
  generated: true,
  session_id: "session-from-server",
};

const statsSuccessBody = {
  total_jobs: 8,
  number_of_pages: 1,
  jobs_per_page: 20,
  remote_jobs: 3,
  paid_jobs: 7,
  unpaid_jobs: 1,
  jobs_per_role: { backend_developer: 5, legal: 0 },
};

function renderApp(path: string | { pathname: string; state?: unknown } = "/chat") {
  const entry = typeof path === "string" ? path : path;
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <App />
    </MemoryRouter>,
  );
}

function requestBody(call: unknown): Record<string, unknown> {
  const init = (call as [string, RequestInit])[1];
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

function installFetch() {
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/jobs/stats")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(statsSuccessBody),
      } as Response);
    }
    if (url.includes("/admin/users")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ users: [], page: 1 }),
      } as Response);
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(chatSuccessBody),
    } as Response);
  });
}

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    sessionStorage.clear();
    resetUserAskedToLeave();
    disarmSessionEndedNote();
    auth.listeners.clear();
    auth.signOut.mockClear();
    auth.signInWithPassword.mockReset();
    auth.getUser.mockClear();
    auth.state.session = sessionFor("member");
    installFetch();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("sends a logged-out person to login without the session note", async () => {
    auth.state.session = null;
    renderApp("/chat");

    expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument();
    expect(screen.queryByText(/you've been logged out/i)).not.toBeInTheDocument();
    expect(sessionStorage.getItem("tookratt_api_key")).toBeNull();
  });

  it("leaves the session-ended login screen after a successful login", async () => {
    auth.state.session = null;
    auth.signInWithPassword.mockImplementation(async () => {
      const next = sessionFor("member");
      auth.state.session = next;
      for (const listener of auth.listeners) {
        listener("SIGNED_IN", next);
      }
      return { data: { session: next, user: next.user }, error: null };
    });
    const user = userEvent.setup();
    renderApp({ pathname: "/login", state: { sessionEnded: true } });
    expect(await screen.findByRole("status")).toHaveTextContent(/you've been logged out/i);

    await user.type(screen.getByLabelText("Email"), "alex@example.com");
    await user.type(screen.getByLabelText("Password"), "long-enough");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("link", { name: "Job market" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Log in" })).not.toBeInTheDocument();
  });

  it("drops a pending password on sign-out so the next login reaches the app", async () => {
    sessionStorage.setItem(PENDING_PASSWORD_TYPE_KEY, "invite");
    renderApp("/");
    expect(await screen.findByRole("heading", { name: "Welcome to Töökratt" })).toBeInTheDocument();

    auth.state.session = null;
    for (const listener of auth.listeners) {
      listener("SIGNED_OUT", null);
    }

    expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument();
    expect(sessionStorage.getItem(PENDING_PASSWORD_TYPE_KEY)).toBeNull();

    const next = sessionFor("member");
    next.user.email = "sara@example.com";
    auth.state.session = next;
    for (const listener of auth.listeners) {
      listener("SIGNED_IN", next);
    }

    expect(await screen.findByRole("link", { name: "Job market" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Welcome to Töökratt" })).not.toBeInTheDocument();
    expect(screen.getByText("sara@example.com")).toBeInTheDocument();
  });

  it("shows the session note from router state and not after a plain visit", async () => {
    auth.state.session = null;
    renderApp({ pathname: "/login", state: { sessionEnded: true } });

    expect(await screen.findByRole("status")).toHaveTextContent(
      /you've been logged out\. log in again to keep going/i,
    );
  });

  it("redirects /chat, /market, and /admin when there is no session", async () => {
    auth.state.session = null;
    renderApp("/market");
    expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument();
    cleanup();

    renderApp("/admin");
    expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument();
  });

  it("hides Admin from a member and shows Admins only on /admin", async () => {
    auth.state.session = sessionFor(null);
    renderApp("/admin");

    expect(await screen.findByRole("heading", { name: "Admins only" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it("shows People and the Admin tab for an admin without calling getUser", async () => {
    auth.state.session = sessionFor("admin");
    renderApp("/admin");

    expect(await screen.findByRole("heading", { name: "People" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Admin" })).toBeInTheDocument();
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it("keeps the set-password card after a reload with no hash", async () => {
    sessionStorage.setItem(PENDING_PASSWORD_TYPE_KEY, "invite");
    window.history.replaceState(null, "", "/");
    renderApp("/");

    expect(await screen.findByRole("heading", { name: "Welcome to Töökratt" })).toBeInTheDocument();
    expect(window.location.hash).toBe("");
  });

  it("uses the stored recovery type for the heading", async () => {
    sessionStorage.setItem(PENDING_PASSWORD_TYPE_KEY, "recovery");
    renderApp("/");

    expect(await screen.findByRole("heading", { name: "Set a new password" })).toBeInTheDocument();
  });

  it("navigates once with the note on a spontaneous SIGNED_OUT and does not call signOut", async () => {
    renderApp("/market");
    expect(await screen.findByRole("link", { name: "Job market" })).toBeInTheDocument();
    auth.signOut.mockClear();
    auth.state.session = null;

    for (const listener of auth.listeners) {
      listener("SIGNED_OUT", null);
    }

    expect(await screen.findByText(/you've been logged out/i)).toBeInTheDocument();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("logs out locally without the session note", async () => {
    const user = userEvent.setup();
    renderApp("/market");
    await screen.findByRole("link", { name: "Job market" });

    await user.click(screen.getByRole("button", { name: "Log out" }));

    expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument();
    expect(screen.queryByText(/you've been logged out/i)).not.toBeInTheDocument();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("goes to login with the note after a 401 and signs out locally", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ detail: { message: "Your session has ended." } }),
    } as Response);
    const user = userEvent.setup();
    renderApp("/chat");

    await user.type(screen.getByLabelText(/ask a question about the job market/i), "hello");
    await user.click(screen.getByRole("button", { name: /ask/i }));

    expect(await screen.findByText(/you've been logged out/i)).toBeInTheDocument();
    expect(screen.queryByText(/your session has ended/i)).not.toBeInTheDocument();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(sessionStorage.getItem("tookratt_api_key")).toBeNull();
  });

  it("describes bounded session memory instead of no-memory copy", async () => {
    renderApp();

    const banner = await screen.findByRole("note");
    expect(banner).toHaveTextContent(/remembers this conversation/i);
    expect(banner).toHaveTextContent(new RegExp(`last ${CHAT_HISTORY_MAX_TURNS} turns`, "i"));
    expect(banner).toHaveTextContent(/resets when you refresh or start a new conversation/i);
    expect(banner).toHaveTextContent(/refreshing starts over/i);
    expect(screen.getByText("Job market research for Nordic and European startups")).toBeInTheDocument();
  });

  it("clears messages and omits session_id after New conversation", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText(/ask a question about the job market/i), "hello");
    await user.click(screen.getByRole("button", { name: /ask/i }));
    expect(await screen.findByText(chatSuccessBody.answer)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/ask a question about the job market/i), "any others?");
    await user.click(screen.getByRole("button", { name: /ask/i }));
    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    const chatCalls = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes("/chat"));
    expect(requestBody(chatCalls[0])).toEqual({ question: "hello" });
    expect(requestBody(chatCalls[1])).toEqual({
      question: "any others?",
      session_id: "session-from-server",
    });

    await user.click(screen.getByRole("button", { name: /new conversation/i }));

    expect(screen.queryByText(chatSuccessBody.answer)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/ask a question about the job market/i), "fresh start");
    await user.click(screen.getByRole("button", { name: /ask/i }));
    expect(await screen.findByText("fresh start")).toBeInTheDocument();

    await waitFor(() => {
      const calls = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes("/chat"));
      expect(calls.length).toBeGreaterThanOrEqual(3);
      expect(requestBody(calls[2])).toEqual({ question: "fresh start" });
    });
  });

  it("redirects / to /market without chat chrome", async () => {
    renderApp("/");

    expect(await screen.findByRole("rowheader", { name: "Backend developer" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Job market" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByLabelText(/ask a question about the job market/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("redirects /stats to /market", async () => {
    renderApp("/stats");

    expect(await screen.findByRole("link", { name: "Job market" })).toHaveAttribute("aria-current", "page");
  });
});
