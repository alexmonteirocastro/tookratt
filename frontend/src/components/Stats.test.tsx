import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiHttpError, ApiNetworkError } from "../api/client";
import type { JobOpenings } from "../api/types";
import { Stats } from "./Stats";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return {
    ...actual,
    getJobsStats: vi.fn(),
  };
});

import { getJobsStats } from "../api/client";

const mockGetJobsStats = vi.mocked(getJobsStats);

const sampleStats: JobOpenings = {
  total_jobs: 100,
  number_of_pages: 5,
  jobs_per_page: 20,
  remote_jobs: 40,
  paid_jobs: 90,
  unpaid_jobs: 11,
  jobs_per_role: {
    backend_developer: 20,
    frontend_developer: 10,
    legal: 0,
  },
};

describe("Stats", () => {
  beforeEach(() => {
    mockGetJobsStats.mockReset();
    mockGetJobsStats.mockResolvedValue(sampleStats);
  });

  afterEach(() => {
    cleanup();
  });

  it("loads default DK stats and shows KPI tiles plus the role chart", async () => {
    render(<Stats enabled />);

    expect(screen.getByRole("status")).toHaveTextContent(/loading job stats/i);
    expect(await screen.findByText("100")).toBeInTheDocument();
    expect(screen.getByText("Total jobs")).toBeInTheDocument();
    expect(screen.getByText("Remote")).toBeInTheDocument();
    expect(screen.getByText("40")).toBeInTheDocument();
    expect(screen.getByText("On-site")).toBeInTheDocument();
    expect(screen.getByText("60")).toBeInTheDocument();
    expect(screen.getByText("Paid")).toBeInTheDocument();
    expect(screen.getByText("90")).toBeInTheDocument();
    expect(screen.getByText("Unpaid")).toBeInTheDocument();
    expect(screen.getByText("11")).toBeInTheDocument();
    expect(screen.getByText("Jobs per role")).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Backend developer" })).toBeInTheDocument();
    expect(screen.queryByText("Legal")).not.toBeInTheDocument();
    expect(mockGetJobsStats).toHaveBeenCalledWith("DK");
  });

  it("refetches when the country selector changes", async () => {
    const user = userEvent.setup();
    mockGetJobsStats.mockResolvedValue(sampleStats);
    render(<Stats enabled />);
    await screen.findByText("100");

    mockGetJobsStats.mockResolvedValue({ ...sampleStats, total_jobs: 12 });
    await user.click(screen.getByRole("radio", { name: "Sweden" }));

    await waitFor(() => {
      expect(mockGetJobsStats).toHaveBeenLastCalledWith("SE");
    });
    expect(await screen.findByText("12")).toBeInTheDocument();
  });

  it("shows a network error without opening a chat-style bubble", async () => {
    mockGetJobsStats.mockRejectedValue(new ApiNetworkError());
    render(<Stats enabled />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/unable to reach the api/i);
    expect(screen.queryByText("Jobs per role")).not.toBeInTheDocument();
  });

  it("swallows 401 so the auth modal can take over", async () => {
    mockGetJobsStats.mockRejectedValue(new ApiHttpError(401, "API key is not authorized."));
    render(<Stats enabled />);

    await waitFor(() => {
      expect(mockGetJobsStats).toHaveBeenCalled();
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Jobs per role")).not.toBeInTheDocument();
  });

  it("does not fetch while auth is disabled", () => {
    render(<Stats enabled={false} />);

    expect(mockGetJobsStats).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Denmark" })).toBeDisabled();
  });
});
