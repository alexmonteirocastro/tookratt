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

  it("marks Chat as the current page and points Job market at /market", () => {
    renderNav("/chat");

    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav).toBeInTheDocument();

    const market = screen.getByRole("link", { name: "Job market" });
    const chat = screen.getByRole("link", { name: "Chat" });
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Job market", "Chat"]);
    expect(market).toHaveAttribute("href", "/market");
    expect(market).not.toHaveAttribute("aria-current");
    expect(chat).toHaveAttribute("href", "/chat");
    expect(chat).toHaveAttribute("aria-current", "page");
  });

  it("marks Job market as the current page", () => {
    renderNav("/market");

    expect(screen.getByRole("link", { name: "Job market" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Chat" })).not.toHaveAttribute("aria-current");
  });
});
