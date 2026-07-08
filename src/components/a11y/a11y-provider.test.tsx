import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { A11Y_COOKIE, type A11yPrefs } from "~/config/a11y";
import { A11yProvider, useA11y } from "./a11y-provider";

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const CONTRAST_QUERY = "(prefers-contrast: more)";

function mockMatchMedia(matches: Record<string, boolean>) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: matches[query] ?? false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function Probe() {
  const { effective, prefs, update } = useA11y();
  return (
    <div>
      <span data-testid="motion">{String(effective.motion)}</span>
      <span data-testid="contrast">{String(effective.contrast)}</span>
      <span data-testid="pref-motion">{String(prefs.motion)}</span>
      <button type="button" onClick={() => update({ motion: "off" })}>
        force-off
      </button>
    </div>
  );
}

function renderProvider(initialPrefs?: A11yPrefs) {
  return render(
    <A11yProvider initialPrefs={initialPrefs}>
      <Probe />
    </A11yProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  document.cookie = `${A11Y_COOKIE}=;max-age=0;path=/`;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("A11yProvider OS reflection (issue #130)", () => {
  it("reflects the OS reduced-motion signal when the pref is unset", async () => {
    mockMatchMedia({ [MOTION_QUERY]: true, [CONTRAST_QUERY]: false });
    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("motion")).toHaveTextContent("true"),
    );
    // Contrast has no OS signal here, so it stays off.
    expect(screen.getByTestId("contrast")).toHaveTextContent("false");
  });

  it("lets an explicit off override an OS reduced-motion signal and persists it", async () => {
    const user = userEvent.setup();
    mockMatchMedia({ [MOTION_QUERY]: true, [CONTRAST_QUERY]: false });
    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("motion")).toHaveTextContent("true"),
    );

    await user.click(screen.getByRole("button", { name: /force-off/i }));

    expect(screen.getByTestId("motion")).toHaveTextContent("false");
    expect(screen.getByTestId("pref-motion")).toHaveTextContent("off");
    // Persisted so the choice survives reloads.
    expect(localStorage.getItem(A11Y_COOKIE)).toContain('"motion":"off"');
  });

  it("honors an explicit on even when the OS signal is off", async () => {
    mockMatchMedia({ [MOTION_QUERY]: false, [CONTRAST_QUERY]: false });
    renderProvider({ textSize: "default", motion: "on", reading: false });

    await waitFor(() =>
      expect(screen.getByTestId("motion")).toHaveTextContent("true"),
    );
  });
});
