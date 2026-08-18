import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_KEY_STORAGE_KEY, setStoredApiKey } from "./api/authStorage";
import { CHAT_HISTORY_MAX_TURNS } from "./api/client";
import App from "./App";

const chatSuccessBody = {
  question: "hello",
  answer: "Here are some roles.",
  sources: [],
  generated: true,
  session_id: "session-from-server",
};

function requestBody(call: unknown): Record<string, unknown> {
  const init = (call as [string, RequestInit])[1];
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

describe("App auth wiring", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("reopens the modal on a 401 from postChat without showing a chat error", async () => {
    setStoredApiKey("stored-key");
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      json: () =>
        Promise.resolve({
          detail: { message: "API key is not authorized.", code: "invalid_api_key" },
        }),
    } as Response);
    const user = userEvent.setup();

    render(<App />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/ask a question about jobs/i), "hello");
    await user.click(screen.getByRole("button", { name: /ask/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
    expect(screen.queryByText(/api key is not authorized/i)).not.toBeInTheDocument();
    expect(sessionStorage.getItem(API_KEY_STORAGE_KEY)).toBeNull();
  });
});

describe("App conversation memory", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    sessionStorage.clear();
    setStoredApiKey("stored-key");
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(chatSuccessBody),
    } as Response);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("describes bounded session memory instead of no-memory copy", () => {
    render(<App />);

    const banner = screen.getByRole("note");
    expect(banner).toHaveTextContent(/remembers this conversation/i);
    expect(banner).toHaveTextContent(new RegExp(`last ${CHAT_HISTORY_MAX_TURNS} turns`, "i"));
    expect(banner).toHaveTextContent(/resets if you refresh or start a new conversation/i);
    expect(
      screen.queryByText(/doesn't remember previous messages/i),
    ).not.toBeInTheDocument();
  });

  it("clears messages and omits session_id after New conversation", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText(/ask a question about jobs/i), "hello");
    await user.click(screen.getByRole("button", { name: /ask/i }));
    expect(await screen.findByText(chatSuccessBody.answer)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/ask a question about jobs/i), "any others?");
    await user.click(screen.getByRole("button", { name: /ask/i }));
    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls).toHaveLength(2);
    });

    expect(requestBody(vi.mocked(fetch).mock.calls[0])).toEqual({ question: "hello" });
    expect(requestBody(vi.mocked(fetch).mock.calls[1])).toEqual({
      question: "any others?",
      session_id: "session-from-server",
    });

    await user.click(screen.getByRole("button", { name: /new conversation/i }));

    expect(screen.queryByText(chatSuccessBody.answer)).not.toBeInTheDocument();
    expect(screen.queryByText("any others?")).not.toBeInTheDocument();
    expect(
      screen.getByText(/ask about nordic and european startup jobs/i),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/ask a question about jobs/i), "fresh start");
    await user.click(screen.getByRole("button", { name: /ask/i }));
    expect(await screen.findByText("fresh start")).toBeInTheDocument();

    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls).toHaveLength(3);
    });
    expect(requestBody(vi.mocked(fetch).mock.calls[2])).toEqual({
      question: "fresh start",
    });
    expect(requestBody(vi.mocked(fetch).mock.calls[2])).not.toHaveProperty("session_id");
  });
});
