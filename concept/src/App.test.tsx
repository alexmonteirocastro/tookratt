import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { ANALYZING_MS, MATCH_STAGGER_MS } from "./data/persona";

describe("snapshot conversation", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the concept banner and plays insights → upload → profile → matches", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);

    expect(
      screen.getByText("Concept Preview — not live functionality"),
    ).toBeInTheDocument();

    expect(await screen.findByText(/Denmark/i)).toBeInTheDocument();
    expect(screen.getByText("Jobs per role")).toBeInTheDocument();
    expect(
      screen.getByText(/Illustrative — not derived from listing text or corpus aggregation/i),
    ).toBeInTheDocument();

    const file = new File(["not-a-cv"], "resume.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText(/Upload a CV to continue/i), file);

    expect(screen.getByText("Uploaded resume.pdf")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ANALYZING_MS);
    });
    expect(screen.getByText(/not parsed from the file/i)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(MATCH_STAGGER_MS * 5);
    });
    expect(screen.getByText(/94% match/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Founding Engineer/i })).toHaveAttribute(
      "href",
      "https://thehub.io/jobs/concept-job-1",
    );
    expect(screen.getAllByText(/Nordic Ledger/).length).toBeGreaterThan(0);
  });
});
