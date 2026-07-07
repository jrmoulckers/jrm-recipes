import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const pathnameMock = vi.fn(() => "/plan");
vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock(),
}));

import { BottomNav, MainNav } from "./main-nav";

afterEach(cleanup);

describe("MainNav", () => {
  it("labels the primary nav landmark", () => {
    pathnameMock.mockReturnValue("/plan");
    render(<MainNav />);

    expect(
      screen.getByRole("navigation", { name: "Primary" }),
    ).toBeInTheDocument();
  });

  it("marks the active link with aria-current and a non-color indicator", () => {
    pathnameMock.mockReturnValue("/plan");
    render(<MainNav />);

    const active = screen.getByRole("link", { name: "Plan" });
    expect(active).toHaveAttribute("aria-current", "page");
    // Non-color cue (WCAG 1.4.1): active weight differs from inactive.
    expect(active.className).toContain("font-semibold");

    const inactive = screen.getByRole("link", { name: "Home" });
    expect(inactive).not.toHaveAttribute("aria-current");
    expect(inactive.className).not.toContain("font-semibold");
  });
});

describe("BottomNav", () => {
  it("labels the mobile nav landmark and marks the active tab", () => {
    pathnameMock.mockReturnValue("/plan");
    render(<BottomNav />);

    expect(
      screen.getByRole("navigation", { name: "Primary mobile" }),
    ).toBeInTheDocument();

    const active = screen.getByRole("link", { name: "Plan" });
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active.className).toContain("font-semibold");
  });

  it("hides itself on immersive routes", () => {
    pathnameMock.mockReturnValue("/recipes/sunday-sauce/cook");
    const { container } = render(<BottomNav />);

    expect(container).toBeEmptyDOMElement();
  });
});
