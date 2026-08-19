import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COUNTRY_OPTIONS } from "../utils/statsLabels";
import { CountrySelector } from "./CountrySelector";

describe("CountrySelector", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders all six country codes as radios labelled by full name", () => {
    render(<CountrySelector value="DK" onChange={() => undefined} />);

    expect(screen.getByRole("group", { name: "Country" })).toBeInTheDocument();
    for (const option of COUNTRY_OPTIONS) {
      expect(screen.getByRole("radio", { name: option.name })).toBeInTheDocument();
      expect(screen.getByText(option.code)).toBeInTheDocument();
    }
    expect(screen.getByRole("radio", { name: "Denmark" })).toBeChecked();
  });

  it("notifies onChange with the selected country code", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CountrySelector value="DK" onChange={onChange} />);

    await user.click(screen.getByRole("radio", { name: "Sweden" }));
    expect(onChange).toHaveBeenCalledWith("SE");
  });
});
