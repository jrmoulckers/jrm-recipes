import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import {
  WELCOME_DISMISS_KEY,
  WelcomeChecklist,
  welcomeDismissed,
} from "./welcome-checklist";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("WelcomeChecklist (issue #147)", () => {
  it("presents the create → cook → share loop as three steps with a primary CTA", () => {
    render(<WelcomeChecklist />);

    expect(
      screen.getByRole("heading", { name: /welcome to heirloom/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Add a recipe")).toBeInTheDocument();
    expect(screen.getByText("Cook it hands-free")).toBeInTheDocument();
    expect(screen.getByText("Share with family")).toBeInTheDocument();

    const cta = screen.getByRole("link", { name: /create your first recipe/i });
    expect(cta).toHaveAttribute("href", "/recipes/new");
  });

  it("persists dismissal so it never reappears", () => {
    render(<WelcomeChecklist />);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss welcome" }));

    expect(window.localStorage.getItem(WELCOME_DISMISS_KEY)).toBe("1");
    expect(welcomeDismissed()).toBe(true);
    expect(screen.queryByRole("heading", { name: /welcome to heirloom/i })).toBeNull();
  });

  it("stays hidden when already dismissed", () => {
    window.localStorage.setItem(WELCOME_DISMISS_KEY, "1");
    render(<WelcomeChecklist />);

    expect(
      screen.queryByRole("heading", { name: /welcome to heirloom/i }),
    ).toBeNull();
  });
});
