import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  signOut: vi.fn(),
  refreshSession: vi.fn(),
}));

vi.mock("./supabase", () => ({
  supabase: { auth },
  AUTH_STORAGE_KEY: "sb-example-auth-token",
}));

import { resetUserAskedToLeave } from "./authSession";
import {
  ApiHttpError,
  ApiNetworkError,
  ApiTimeoutError,
  createInvite,
  createResetLink,
  getJobsStats,
  listAdminUsers,
  postChat,
  setUnauthorizedHandler,
} from "./client";

describe("postChat", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    sessionStorage.clear();
    setUnauthorizedHandler(null);
    resetUserAskedToLeave();
    auth.getSession.mockResolvedValue({
      data: { session: { access_token: "session-token" } },
      error: null,
    });
    auth.signOut.mockResolvedValue({ error: null });
    auth.refreshSession.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    setUnauthorizedHandler(null);
    resetUserAskedToLeave();
  });

  it("returns parsed response on success", async () => {
    const body = {
      question: "backend roles?",
      answer: "Here are some roles.",
      sources: [],
      generated: true,
    };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    } as Response);

    await expect(postChat({ question: "backend roles?" })).resolves.toEqual(body);
    expect(fetch).toHaveBeenCalledWith(
      "/api/chat",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ question: "backend roles?" }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("sends the access token from getSession and does not call refreshSession", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          question: "hello",
          answer: "ok",
          sources: [],
          generated: true,
        }),
    } as Response);

    await postChat({ question: "hello" });

    expect(auth.getSession).toHaveBeenCalled();
    expect(auth.refreshSession).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      "/api/chat",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer session-token",
        }),
      }),
    );
    expect(sessionStorage.getItem("tookratt_api_key")).toBeNull();
  });

  it("throws ApiNetworkError when fetch fails", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(postChat({ question: "hello" })).rejects.toBeInstanceOf(ApiNetworkError);
  });

  it("throws ApiTimeoutError when the request is aborted", async () => {
    vi.mocked(fetch).mockRejectedValue(new DOMException("Aborted", "AbortError"));

    await expect(postChat({ question: "hello" })).rejects.toBeInstanceOf(ApiTimeoutError);
  });

  it("throws ApiHttpError with a rate-limit message on 429", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.resolve({}),
    } as Response);

    await expect(postChat({ question: "hello" })).rejects.toMatchObject({
      status: 429,
      message: "The service is rate-limited. Please wait a moment and try again.",
    });
  });

  it("throws ApiHttpError with a generic server message on 5xx without detail", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.resolve({}),
    } as Response);

    await expect(postChat({ question: "hello" })).rejects.toMatchObject({
      status: 502,
      message: "The server encountered an error. Please try again later.",
    });
  });

  it("parses Pydantic-style 422 validation detail arrays", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 422,
      json: () =>
        Promise.resolve({
          detail: [
            {
              type: "string_too_long",
              loc: ["body", "question"],
              msg: "String should have at most 5 characters",
              input: "toolong",
              ctx: { max_length: 5 },
            },
          ],
        }),
    } as Response);

    await expect(postChat({ question: "toolong" })).rejects.toMatchObject({
      status: 422,
      message: "String should have at most 5 characters",
    });
  });

  it("prefers API error detail over the default message on 429", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 429,
      json: () =>
        Promise.resolve({
          detail: "The generation service is rate-limited. Please try again shortly.",
        }),
    } as Response);

    await expect(postChat({ question: "hello" })).rejects.toMatchObject({
      status: 429,
      message: "The generation service is rate-limited. Please try again shortly.",
    });
  });

  it("signs out locally and invokes the unauthorized handler once on 401", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      json: () =>
        Promise.resolve({
          detail: { message: "Your session has ended.", code: "expired" },
        }),
    } as Response);

    await expect(postChat({ question: "hello" })).rejects.toBeInstanceOf(ApiHttpError);
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("tookratt_api_key")).toBeNull();
  });

  it("still invokes the unauthorized handler when signOut throws", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    auth.signOut.mockRejectedValue(new Error("network"));
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({}),
    } as Response);

    await expect(postChat({ question: "hello" })).rejects.toMatchObject({
      status: 401,
      message: "Your session has ended.",
    });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});

describe("getJobsStats", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    sessionStorage.clear();
    setUnauthorizedHandler(null);
    auth.getSession.mockResolvedValue({
      data: { session: { access_token: "session-token" } },
      error: null,
    });
    auth.signOut.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    setUnauthorizedHandler(null);
  });

  it("requests /jobs/stats for the given country with the session token", async () => {
    const body = {
      total_jobs: 8,
      remote_jobs: 3,
      paid_jobs: 7,
      unpaid_jobs: 1,
      jobs_per_role: { backend_developer: 5 },
    };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    } as Response);

    await expect(getJobsStats("DK")).resolves.toEqual(body);
    expect(fetch).toHaveBeenCalledWith(
      "/api/jobs/stats?country=DK",
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "application/json",
          Authorization: "Bearer session-token",
        }),
      }),
    );
  });

  it("signs out locally and invokes the unauthorized handler on 401", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({}),
    } as Response);

    await expect(getJobsStats("SE")).rejects.toBeInstanceOf(ApiHttpError);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});

describe("admin client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    auth.getSession.mockResolvedValue({
      data: { session: { access_token: "session-token" } },
      error: null,
    });
    auth.signOut.mockResolvedValue({ error: null });
    setUnauthorizedHandler(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setUnauthorizedHandler(null);
  });

  it("maps the users list", async () => {
    const body = {
      users: [
        {
          id: "user-2",
          email: "sara@example.com",
          status: "invited",
          created_at: "2026-01-15T00:00:00Z",
          last_sign_in_at: null,
          role: null,
        },
      ],
      page: 2,
    };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    } as Response);

    await expect(listAdminUsers(2)).resolves.toEqual(body);
    expect(fetch).toHaveBeenCalledWith(
      "/api/admin/users?page=2",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer session-token" }),
      }),
    );
  });

  it("returns the account-exists message on invite 409", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 409,
      json: () =>
        Promise.resolve({
          detail: { message: "That person already has an account.", code: "account_exists" },
        }),
    } as Response);

    await expect(createInvite("person@example.com")).rejects.toMatchObject({
      status: 409,
      code: "account_exists",
      message: "That person already has an account.",
    });
  });

  it("returns only the reset action link", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ action_link: "https://example.test/recover" }),
    } as Response);

    await expect(createResetLink("user-2")).resolves.toBe("https://example.test/recover");
    expect(fetch).toHaveBeenCalledWith(
      "/api/admin/users/user-2/reset-link",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
