import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadDemoData } from "./api/loadDemoData";
import type { DemoPayload } from "./api/types";
import App from "./App";
import snapshot from "./data/snapshot.json";
import { ANALYZING_MS, MATCH_STAGGER_MS } from "./data/persona";

vi.mock("./api/loadDemoData", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api/loadDemoData")>();
  return {
    ...actual,
    loadDemoData: vi.fn(),
  };
});

function snapshotPayload(): DemoPayload {
  return {
    stats: snapshot.stats,
    search: snapshot.search,
  };
}

describe("snapshot conversation", () => {
  beforeEach(() => {
    vi.mocked(loadDemoData).mockResolvedValue(snapshotPayload());
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
    expect(screen.getByText(/Seniority/i)).toBeInTheDocument();

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

describe("empty live search", () => {
  beforeEach(() => {
    vi.mocked(loadDemoData).mockResolvedValue({
      stats: snapshot.stats,
      search: { query: "founding engineer", results: [] },
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("finishes after upload instead of stalling on matching", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);

    expect(await screen.findByLabelText(/Upload a CV to continue/i)).toBeInTheDocument();

    const file = new File(["not-a-cv"], "resume.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText(/Upload a CV to continue/i), file);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ANALYZING_MS);
    });

    expect(screen.getByText(/Seniority/i)).toBeInTheDocument();
    expect(screen.getByText(/no live matches right now/i)).toBeInTheDocument();
    expect(screen.queryByText(/Finding matching roles/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/94% match/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Replay demo/i })).toBeInTheDocument();
  });
});
