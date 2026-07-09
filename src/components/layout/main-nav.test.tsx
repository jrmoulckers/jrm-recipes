import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IntlWrapper } from "~/test/intl";

const pathnameMock = vi.fn(() => "/plan");
vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock(),
}));

import { BottomNav, MainNav } from "./main-nav";

afterEach(cleanup);

function renderNav(ui: React.ReactElement) {
  return render(<IntlWrapper>{ui}</IntlWrapper>);
}

describe("MainNav", () => {
  it("labels the primary nav landmark from the message catalog", () => {
    pathnameMock.mockReturnValue("/plan");
    renderNav(<MainNav />);

    expect(
      screen.getByRole("navigation", { name: "Primary" }),
    ).toBeInTheDocument();
  });

  it("marks the active link with aria-current and a non-color indicator", () => {
    pathnameMock.mockReturnValue("/plan");
    renderNav(<MainNav />);

    const active = screen.getByRole("link", { name: "Plan" });
    expect(active).toHaveAttribute("aria-current", "page");
    // Non-color cue (WCAG 1.4.1): active weight differs from inactive.
    expect(active.className).toContain("font-semibold");

    const inactive = screen.getByRole("link", { name: "Home" });
    expect(inactive).not.toHaveAttribute("aria-current");
    expect(inactive.className).not.toContain("font-semibold");
  });

  it("does not mark Recipes active on the create route", () => {
    pathnameMock.mockReturnValue("/recipes/new");
    renderNav(<MainNav />);

    expect(screen.getByRole("link", { name: "Recipes" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.getByRole("link", { name: "Create" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

describe("BottomNav", () => {
  it("labels the mobile nav landmark and marks the active tab", () => {
    pathnameMock.mockReturnValue("/plan");
    renderNav(<BottomNav />);

    expect(
      screen.getByRole("navigation", { name: "Primary mobile" }),
    ).toBeInTheDocument();

    const active = screen.getByRole("link", { name: "Plan" });
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active.className).toContain("font-semibold");
  });

  it("surfaces overflow destinations behind a More menu instead of as tabs", () => {
    pathnameMock.mockReturnValue("/plan");
    renderNav(<BottomNav />);

    // Journal is an overflow destination, so it is not a top-level tab link.
    expect(
      screen.queryByRole("link", { name: "Journal" }),
    ).not.toBeInTheDocument();
    // The More trigger is present to reach it.
    expect(screen.getByRole("button", { name: "More" })).toBeInTheDocument();
  });

  it("marks the More trigger active when the route lives in the overflow set", () => {
    pathnameMock.mockReturnValue("/journal");
    renderNav(<BottomNav />);

    expect(screen.getByRole("button", { name: "More" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("hides itself on immersive routes", () => {
    pathnameMock.mockReturnValue("/recipes/sunday-sauce/cook");
    const { container } = renderNav(<BottomNav />);

    expect(container).toBeEmptyDOMElement();
  });
});
