import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";

import { ThemeProvider } from "~/components/theme/theme-provider";
import { GrownUpControls } from "./grown-up-controls";

afterEach(cleanup);

// ThemeProvider effects read matchMedia, which jsdom does not implement.
beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});

function renderIn(theme: "kitchen" | "kids" | "barebones") {
  return render(
    <ThemeProvider initialTheme={theme}>
      <GrownUpControls>
        <button type="button">Delete</button>
      </GrownUpControls>
    </ThemeProvider>,
  );
}

describe("GrownUpControls (issue #443)", () => {
  it("hides grown-up controls in Kids mode", () => {
    renderIn("kids");
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("shows all controls in grown-up modes", () => {
    renderIn("kitchen");
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("keeps controls visible in Simple/barebones mode (adult accessibility, not childproofing)", () => {
    renderIn("barebones");
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("shows children by default outside a theme provider", () => {
    render(
      <GrownUpControls>
        <button type="button">Delete</button>
      </GrownUpControls>,
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });
});
