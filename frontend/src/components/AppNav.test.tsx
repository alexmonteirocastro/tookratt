import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AppNav } from "./AppNav";

describe("AppNav", () => {
  afterEach(() => {
    cleanup();
  });

  it("marks Chat as the current page and points Stats at /stats", () => {
    render(<AppNav current="chat" />);

    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav).toBeInTheDocument();

    const chat = screen.getByRole("link", { name: "Chat" });
    const stats = screen.getByRole("link", { name: "Stats" });
    expect(chat).toHaveAttribute("href", "/");
    expect(chat).toHaveAttribute("aria-current", "page");
    expect(stats).toHaveAttribute("href", "/stats");
    expect(stats).not.toHaveAttribute("aria-current");
  });

  it("marks Stats as the current page", () => {
    render(<AppNav current="stats" />);

    expect(screen.getByRole("link", { name: "Stats" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Chat" })).not.toHaveAttribute("aria-current");
  });
});
