import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { AppNav } from "./AppNav";

function renderNav(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppNav />
    </MemoryRouter>,
  );
}

describe("AppNav", () => {
  afterEach(() => {
    cleanup();
  });

  it("marks Chat as the current page and points Stats at /stats", () => {
    renderNav("/chat");

    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav).toBeInTheDocument();

    const chat = screen.getByRole("link", { name: "Chat" });
    const stats = screen.getByRole("link", { name: "Stats" });
    expect(chat).toHaveAttribute("href", "/chat");
    expect(chat).toHaveAttribute("aria-current", "page");
    expect(stats).toHaveAttribute("href", "/stats");
    expect(stats).not.toHaveAttribute("aria-current");
  });

  it("marks Stats as the current page", () => {
    renderNav("/stats");

    expect(screen.getByRole("link", { name: "Stats" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Chat" })).not.toHaveAttribute("aria-current");
  });
});
