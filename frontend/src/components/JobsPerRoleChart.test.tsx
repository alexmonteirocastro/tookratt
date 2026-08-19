import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { JobsPerRoleChart } from "./JobsPerRoleChart";

describe("JobsPerRoleChart", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a table of non-zero roles with bars sized to the max", () => {
    const { container } = render(
      <JobsPerRoleChart
        jobsPerRole={{
          backend_developer: 20,
          frontend_developer: 10,
          legal: 0,
        }}
      />,
    );

    expect(screen.getByText("Jobs per role")).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Backend developer" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Frontend developer" })).toBeInTheDocument();
    expect(screen.queryByText("Legal")).not.toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();

    const bars = [...container.querySelectorAll<HTMLElement>("[aria-hidden] > *")];
    expect(bars).toHaveLength(2);
    expect(bars[0]).toHaveStyle({ width: "100%" });
    expect(bars[1]).toHaveStyle({ width: "50%" });
  });

  it("shows an empty state when every role is zero", () => {
    render(<JobsPerRoleChart jobsPerRole={{ legal: 0, other: 0 }} />);

    expect(screen.getByText(/no roles to show/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
