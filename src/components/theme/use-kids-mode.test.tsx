import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { KidsModeToggle } from "./kids-mode-toggle";
import { ThemeProvider } from "./theme-provider";
import { A11yProvider } from "~/components/a11y/a11y-provider";
import {
  type A11yPrefs,
  A11Y_COOKIE,
  A11Y_PREVIOUS_COOKIE,
  DEFAULT_A11Y,
} from "~/config/a11y";
import { THEME_COOKIE, THEME_PREVIOUS_COOKIE, type UITheme } from "~/config/themes";

// ThemeProvider + A11yProvider effects lean on matchMedia (not in jsdom).
beforeAll(() => {
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

beforeEach(() => {
  localStorage.clear();
  for (const name of [
    THEME_COOKIE,
    THEME_PREVIOUS_COOKIE,
    A11Y_COOKIE,
    A11Y_PREVIOUS_COOKIE,
  ]) {
    document.cookie = `${name}=;path=/;max-age=0`;
  }
  // Reset the <html> attributes the a11y provider manages between tests.
  for (const attr of ["data-text", "data-reading"]) {
    document.documentElement.removeAttribute(attr);
  }
});

afterEach(cleanup);

function renderCoupled(theme: UITheme, prefs: A11yPrefs = DEFAULT_A11Y) {
  return render(
    <ThemeProvider initialTheme={theme}>
      <A11yProvider initialPrefs={prefs}>
        <KidsModeToggle />
      </A11yProvider>
    </ThemeProvider>,
  );
}

const html = () => document.documentElement;

describe("Kids mode a11y coupling (issue #445)", () => {
  it("bumps unset comfort defaults to larger, easy-reading text when turned on", async () => {
    const user = userEvent.setup();
    renderCoupled("kitchen");

    await user.click(screen.getByRole("button", { name: "Turn on Kids mode" }));

    expect(html()).toHaveAttribute("data-text", "large");
    expect(html()).toHaveAttribute("data-reading", "readable");
    // Persisted so a reload paints large text with no flash.
    expect(document.cookie).toContain(A11Y_COOKIE);
  });

  it("does not overwrite a grown-up's explicit text-size choice", async () => {
    const user = userEvent.setup();
    renderCoupled("kitchen", { textSize: "xl", reading: false });

    await user.click(screen.getByRole("button", { name: "Turn on Kids mode" }));

    // Explicit XL is preserved; only the unset easy-reading default is enabled.
    expect(html()).toHaveAttribute("data-text", "xl");
    expect(html()).toHaveAttribute("data-reading", "readable");
  });

  it("restores the previous a11y prefs when turned off", async () => {
    const user = userEvent.setup();
    // Grown-up had no comfort prefs before Kids mode was switched on.
    renderCoupled("kitchen");

    await user.click(screen.getByRole("button", { name: "Turn on Kids mode" }));
    expect(html()).toHaveAttribute("data-text", "large");

    await user.click(screen.getByRole("button", { name: "Turn off Kids mode" }));

    // Back to the pre-Kids defaults: no forced large text / easy-reading.
    expect(html()).not.toHaveAttribute("data-text");
    expect(html()).not.toHaveAttribute("data-reading");
  });
});
