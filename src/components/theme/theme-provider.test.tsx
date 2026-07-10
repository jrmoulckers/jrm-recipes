import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { ThemeProvider, useTheme } from "./theme-provider";
import {
  THEME_COOKIE,
  THEME_PREVIOUS_COOKIE,
  type UITheme,
} from "~/config/themes";

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
  for (const name of [THEME_COOKIE, THEME_PREVIOUS_COOKIE]) {
    document.cookie = `${name}=;path=/;max-age=0`;
  }
});

afterEach(cleanup);

/** Minimal consumer that drives the theme context the way the real UI does. */
function Harness() {
  const { theme, setKidsMode, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={() => setKidsMode(true)}>kids-on</button>
      <button onClick={() => setKidsMode(false)}>kids-off</button>
      <button onClick={() => setTheme("kids")}>pick-kids</button>
      <button onClick={() => setTheme("professional")}>
        pick-professional
      </button>
    </div>
  );
}

function renderHarness(initialTheme: UITheme) {
  render(
    <ThemeProvider initialTheme={initialTheme} initialScheme="light">
      <Harness />
    </ThemeProvider>,
  );
  return userEvent.setup();
}

const theme = () => screen.getByTestId("theme").textContent;

describe("ThemeProvider Kids mode", () => {
  it("records the active mode when Kids mode is enabled", async () => {
    const user = renderHarness("whimsy");

    await user.click(screen.getByText("kids-on"));

    expect(theme()).toBe("kids");
    expect(localStorage.getItem(THEME_PREVIOUS_COOKIE)).toBe("whimsy");
  });

  it("restores the previous mode when Kids mode is disabled (whimsy → kids → whimsy)", async () => {
    const user = renderHarness("whimsy");

    await user.click(screen.getByText("kids-on"));
    await user.click(screen.getByText("kids-off"));

    expect(theme()).toBe("whimsy");
    // The remembered mode is cleared once it has been restored.
    expect(localStorage.getItem(THEME_PREVIOUS_COOKIE)).toBeNull();
  });

  it("falls back to the default theme when there is no remembered mode", async () => {
    // Kids picked straight from the picker never records a previous mode.
    const user = renderHarness("whimsy");

    await user.click(screen.getByText("pick-kids"));
    await user.click(screen.getByText("kids-off"));

    expect(theme()).toBe("kitchen");
  });

  it("does not clobber the remembered mode when kids is chosen from the mode picker", async () => {
    const user = renderHarness("whimsy");

    await user.click(screen.getByText("kids-on")); // remembers whimsy
    await user.click(screen.getByText("pick-professional")); // just a theme change
    await user.click(screen.getByText("pick-kids")); // must not overwrite memory

    expect(localStorage.getItem(THEME_PREVIOUS_COOKIE)).toBe("whimsy");

    await user.click(screen.getByText("kids-off"));
    expect(theme()).toBe("whimsy");
  });

  it("persists the restored theme so there is no flash on the next load", async () => {
    const user = renderHarness("whimsy");

    await user.click(screen.getByText("kids-on"));
    await user.click(screen.getByText("kids-off"));

    // ThemeScript reads these before first paint to avoid a flash.
    expect(localStorage.getItem(THEME_COOKIE)).toBe("whimsy");
    expect(document.cookie).toContain(`${THEME_COOKIE}=whimsy`);
  });

  it("does not record kids as the previous mode when already in Kids mode", async () => {
    const user = renderHarness("kids");

    await user.click(screen.getByText("kids-on")); // no-op enable while already kids
    expect(localStorage.getItem(THEME_PREVIOUS_COOKIE)).toBeNull();

    await user.click(screen.getByText("kids-off"));
    expect(theme()).toBe("kitchen");
  });
});
