import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { KidsModeToggle } from "./kids-mode-toggle";
import { ThemeProvider } from "./theme-provider";
import { A11yProvider } from "~/components/a11y/a11y-provider";
import { A11Y_COOKIE, A11Y_PREVIOUS_COOKIE } from "~/config/a11y";
import { THEME_COOKIE, THEME_PREVIOUS_COOKIE, type UITheme } from "~/config/themes";

// ThemeProvider effects lean on matchMedia, which jsdom does not implement.
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
});

afterEach(cleanup);

function renderToggle(theme: UITheme = "kitchen") {
  return render(
    <ThemeProvider initialTheme={theme}>
      <A11yProvider>
        <KidsModeToggle />
      </A11yProvider>
    </ThemeProvider>,
  );
}

describe("KidsModeToggle (issue #435)", () => {
  it("is visible with an off state outside Kids mode", () => {
    renderToggle("kitchen");
    const button = screen.getByRole("button", { name: "Turn on Kids mode" });
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("turns Kids mode on with one tap and reflects the active state", async () => {
    const user = userEvent.setup();
    renderToggle("kitchen");

    await user.click(screen.getByRole("button", { name: "Turn on Kids mode" }));

    const button = screen.getByRole("button", { name: "Turn off Kids mode" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    // Same source of truth as the a11y dialog toggle: the theme cookie flips.
    expect(document.cookie).toContain(`${THEME_COOKIE}=kids`);
  });

  it("restores the previous theme when switched off (no hardcoded theme)", async () => {
    const user = userEvent.setup();
    // Whimsy was active before Kids mode, recorded as the previous theme.
    document.cookie = `${THEME_PREVIOUS_COOKIE}=whimsy;path=/`;
    renderToggle("kids");

    await user.click(screen.getByRole("button", { name: "Turn off Kids mode" }));

    expect(
      screen.getByRole("button", { name: "Turn on Kids mode" }),
    ).toBeInTheDocument();
    expect(document.cookie).toContain(`${THEME_COOKIE}=whimsy`);
  });
});
