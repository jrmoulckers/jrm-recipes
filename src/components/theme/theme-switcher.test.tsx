import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ThemeSwitcher } from "./theme-switcher";
import { ThemeProvider } from "~/components/theme/theme-provider";
import type { ColorScheme, UITheme } from "~/config/themes";

// Radix DropdownMenu + ThemeProvider lean on browser APIs jsdom lacks.
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

  vi.stubGlobal(
    "ResizeObserver",
    vi.fn(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    })),
  );

  const proto = window.HTMLElement.prototype;
  proto.scrollIntoView = vi.fn();
  proto.hasPointerCapture = vi.fn(() => false);
  proto.setPointerCapture = vi.fn();
  proto.releasePointerCapture = vi.fn();
});

afterEach(cleanup);

function renderSwitcher(theme: UITheme, scheme: ColorScheme) {
  return render(
    <ThemeProvider initialTheme={theme} initialScheme={scheme}>
      <ThemeSwitcher />
    </ThemeProvider>,
  );
}

async function openMenu() {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  await user.click(screen.getByRole("button", { name: "Change appearance" }));
}

describe("ThemeSwitcher", () => {
  it("exposes each UI theme as a radio option with the active one checked", async () => {
    renderSwitcher("whimsy", "light");
    await openMenu();

    const active = await screen.findByRole("menuitemradio", {
      name: /Whimsy/,
    });
    expect(active).toHaveAttribute("aria-checked", "true");

    expect(
      screen.getByRole("menuitemradio", { name: /Kitchen/ }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("exposes each lighting scheme as a radio option with the active one checked", async () => {
    renderSwitcher("kitchen", "dark");
    await openMenu();

    const active = await screen.findByRole("menuitemradio", {
      name: /^dark$/i,
    });
    expect(active).toHaveAttribute("aria-checked", "true");

    expect(
      screen.getByRole("menuitemradio", { name: /^light$/i }),
    ).toHaveAttribute("aria-checked", "false");
  });
});
