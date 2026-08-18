import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ApiHttpError, ApiNetworkError } from "../api/client";
import type { ChatResponse } from "../api/types";
import { Chat } from "./Chat";

vi.mock("../api/client", () => ({
  postChat: vi.fn(),
  CHAT_QUESTION_MAX_LENGTH: 500,
  ApiNetworkError: class ApiNetworkError extends Error {
    constructor(message = "Unable to reach the API. Check your connection and try again.") {
      super(message);
      this.name = "ApiNetworkError";
    }
  },
  ApiHttpError: class ApiHttpError extends Error {
    readonly status: number;
    constructor(status: number, message?: string) {
      const defaultMessage =
        status === 429
          ? "The service is rate-limited. Please wait a moment and try again."
          : status >= 500
            ? "The server encountered an error. Please try again later."
            : `Request failed with status ${status}.`;
      super(message ?? defaultMessage);
      this.name = "ApiHttpError";
      this.status = status;
    }
  },
}));

import { postChat } from "../api/client";

const mockPostChat = vi.mocked(postChat);

const successResponse: ChatResponse = {
  question: "backend roles in Denmark",
  answer: "Here are some backend roles in Denmark.",
  generated: true,
  session_id: "session-aaa",
  sources: [
    {
      score: 0.91,
      job_id: "job-1",
      job_url: "https://thehub.io/jobs/job-1",
      job_role: "Backend Developer",
      job_title: "Senior Backend Developer",
      company: "Acme",
      country: "Denmark",
      location: "Copenhagen",
      document_text: "Job details…",
    },
  ],
};

const noMatchResponse: ChatResponse = {
  question: "underwater basket weaving",
  answer: "No matching jobs found for your question. Try broadening your search terms.",
  generated: false,
  session_id: "session-bbb",
  sources: [],
};

const declinedWithSourcesResponse: ChatResponse = {
  question: "frontend roles in Sweden",
  answer:
    "I cannot find matching frontend roles in Sweden based on the listings provided.",
  generated: false,
  session_id: "session-ccc",
  sources: [
    {
      score: 0.42,
      job_id: "job-wrong",
      job_url: "https://thehub.io/jobs/job-wrong",
      job_role: "Backend Developer",
      job_title: "Backend Developer",
      company: "Wrong Co",
      country: "Denmark",
      location: "Copenhagen",
      document_text: "Backend role in Denmark",
    },
  ],
};

describe("Chat", () => {
  beforeEach(() => {
    mockPostChat.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  async function submitQuestion(question: string) {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/ask a question about jobs/i), question);
    await user.click(screen.getByRole("button", { name: /ask/i }));
    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
    return user;
  }

  it("renders user and assistant messages after a successful request", async () => {
    mockPostChat.mockResolvedValue(successResponse);
    const user = userEvent.setup();

    render(<Chat />);

    await user.type(
      screen.getByLabelText(/ask a question about jobs/i),
      "backend roles in Denmark",
    );
    await user.click(screen.getByRole("button", { name: /ask/i }));

    expect(await screen.findByText("backend roles in Denmark")).toBeInTheDocument();
    expect(screen.getByText(successResponse.answer)).toBeInTheDocument();
    const jobLink = screen.getByRole("link", { name: /senior backend developer/i });
    expect(jobLink).toHaveAttribute("href", "https://thehub.io/jobs/job-1");
    expect(jobLink).toHaveAttribute("target", "_blank");
    expect(jobLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("0.91")).toBeInTheDocument();
    expect(screen.getByText(/^sources$/i)).toBeInTheDocument();
    expect(mockPostChat).toHaveBeenCalledWith({ question: "backend roles in Denmark" });
    expect(mockPostChat.mock.calls[0][0]).not.toHaveProperty("session_id");
  });

  it("shows a loading state while waiting for the API", async () => {
    let resolve!: (value: ChatResponse) => void;
    mockPostChat.mockReturnValue(
      new Promise<ChatResponse>((res) => {
        resolve = res;
      }),
    );
    const user = userEvent.setup();

    render(<Chat />);

    await user.type(screen.getByLabelText(/ask a question about jobs/i), "hello");
    await user.click(screen.getByRole("button", { name: /ask/i }));

    expect(screen.getByRole("status")).toHaveTextContent(/searching jobs/i);
    expect(screen.getByRole("button", { name: /ask/i })).toBeDisabled();

    resolve(successResponse);

    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  it("shows a network error message on fetch failure", async () => {
    mockPostChat.mockRejectedValue(new ApiNetworkError());
    const user = userEvent.setup();

    render(<Chat />);

    await user.type(screen.getByLabelText(/ask a question about jobs/i), "hello");
    await user.click(screen.getByRole("button", { name: /ask/i }));

    expect(
      await screen.findByText(/unable to reach the api/i),
    ).toBeInTheDocument();
  });

  it("shows an error message on 5xx API responses", async () => {
    mockPostChat.mockRejectedValue(
      new ApiHttpError(502, "The generation service is unavailable."),
    );
    const user = userEvent.setup();

    render(<Chat />);

    await user.type(screen.getByLabelText(/ask a question about jobs/i), "hello");
    await user.click(screen.getByRole("button", { name: /ask/i }));

    expect(
      await screen.findByText(/unavailable/i),
    ).toBeInTheDocument();
  });

  it("shows an error message on 429 API responses", async () => {
    mockPostChat.mockRejectedValue(
      new ApiHttpError(429, "The generation service is rate-limited. Please try again shortly."),
    );
    const user = userEvent.setup();

    render(<Chat />);

    await user.type(screen.getByLabelText(/ask a question about jobs/i), "hello");
    await user.click(screen.getByRole("button", { name: /ask/i }));

    expect(
      await screen.findByText(/rate-limited/i),
    ).toBeInTheDocument();
  });

  it("does not show a chat error bubble on 401 responses", async () => {
    mockPostChat.mockRejectedValue(new ApiHttpError(401, "API key is not authorized."));
    const user = userEvent.setup();

    render(<Chat />);

    await user.type(screen.getByLabelText(/ask a question about jobs/i), "hello");
    await user.click(screen.getByRole("button", { name: /ask/i }));

    await waitFor(() => {
      expect(mockPostChat).toHaveBeenCalled();
    });
    expect(screen.queryByText(/api key is not authorized/i)).not.toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("renders the no-matching-jobs case when generated is false", async () => {
    mockPostChat.mockResolvedValue(noMatchResponse);
    const user = userEvent.setup();

    render(<Chat />);

    await user.type(
      screen.getByLabelText(/ask a question about jobs/i),
      "underwater basket weaving",
    );
    await user.click(screen.getByRole("button", { name: /ask/i }));

    expect(await screen.findByText(noMatchResponse.answer)).toBeInTheDocument();
    expect(
      screen.getByText(/no matching jobs — answer from search, not generated/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/retrieved sources/i)).not.toBeInTheDocument();
  });

  it("renders sources when generated is false without suppressing them (ADR-0004 Decision 4)", async () => {
    mockPostChat.mockResolvedValue(declinedWithSourcesResponse);
    const user = userEvent.setup();

    render(<Chat />);

    await user.type(
      screen.getByLabelText(/ask a question about jobs/i),
      "frontend roles in Sweden",
    );
    await user.click(screen.getByRole("button", { name: /ask/i }));

    expect(await screen.findByText(declinedWithSourcesResponse.answer)).toBeInTheDocument();
    expect(screen.getByText(/^sources$/i)).toBeInTheDocument();
    expect(screen.getByText(/backend developer/i)).toBeInTheDocument();
    expect(screen.getByText("0.42")).toBeInTheDocument();
    expect(
      screen.getByText(/no matching jobs — answer from search, not generated/i),
    ).toBeInTheDocument();
  });

  it("omits session_id on the first request and sends the returned id on the next", async () => {
    mockPostChat
      .mockResolvedValueOnce(successResponse)
      .mockResolvedValueOnce({ ...successResponse, session_id: "session-aaa" });

    render(<Chat />);

    await submitQuestion("backend roles in Denmark");
    expect(screen.getByText(successResponse.answer)).toBeInTheDocument();

    await submitQuestion("any others?");

    expect(mockPostChat).toHaveBeenNthCalledWith(1, {
      question: "backend roles in Denmark",
    });
    expect(mockPostChat).toHaveBeenNthCalledWith(2, {
      question: "any others?",
      session_id: "session-aaa",
    });
  });

  it("adopts a replacement session_id from the response without showing an error", async () => {
    mockPostChat
      .mockResolvedValueOnce({ ...successResponse, session_id: "session-old" })
      .mockResolvedValueOnce({ ...successResponse, session_id: "session-new" })
      .mockResolvedValueOnce({ ...successResponse, session_id: "session-new" });

    render(<Chat />);

    await submitQuestion("first");
    await submitQuestion("second");
    await submitQuestion("third");

    expect(mockPostChat).toHaveBeenNthCalledWith(1, { question: "first" });
    expect(mockPostChat).toHaveBeenNthCalledWith(2, {
      question: "second",
      session_id: "session-old",
    });
    expect(mockPostChat).toHaveBeenNthCalledWith(3, {
      question: "third",
      session_id: "session-new",
    });
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it("omits session_id after a remount, matching a page refresh", async () => {
    mockPostChat.mockResolvedValue(successResponse);

    const { unmount } = render(<Chat />);
    await submitQuestion("before refresh");
    expect(mockPostChat).toHaveBeenCalledWith({ question: "before refresh" });

    unmount();
    mockPostChat.mockClear();
    render(<Chat />);

    await submitQuestion("after refresh");
    expect(mockPostChat).toHaveBeenCalledWith({ question: "after refresh" });
    expect(mockPostChat.mock.calls[0][0]).not.toHaveProperty("session_id");
  });
});
