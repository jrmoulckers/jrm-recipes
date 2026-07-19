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

  it("surfaces a Profile tab in the fixed last slot instead of a More menu", () => {
    pathnameMock.mockReturnValue("/plan");
    renderNav(<BottomNav />);

    // Overflow destinations are no longer top-level tabs.
    expect(
      screen.queryByRole("link", { name: "Journal" }),
    ).not.toBeInTheDocument();
    // There is no longer a duplicate "More" menu.
    expect(
      screen.queryByRole("button", { name: "More" }),
    ).not.toBeInTheDocument();
    // The Profile tab links to the hub.
    const profile = screen.getByRole("link", { name: "Profile" });
    expect(profile).toHaveAttribute("href", "/profile");
  });

  it("marks the Profile tab active on profile routes", () => {
    pathnameMock.mockReturnValue("/profile");
    renderNav(<BottomNav />);

    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute(
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
