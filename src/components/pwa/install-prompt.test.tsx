import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InstallPrompt, shouldShowIosInstallTip } from "./install-prompt";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPAD_SAFARI =
  "Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1";
const IPHONE_FIREFOX =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/120.0 Mobile/15E148 Safari/605.1.15";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const DESKTOP_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

describe("shouldShowIosInstallTip", () => {
  it("returns true for iOS Safari that is not standalone", () => {
    expect(shouldShowIosInstallTip(IPHONE_SAFARI, false)).toBe(true);
    expect(shouldShowIosInstallTip(IPAD_SAFARI, false)).toBe(true);
  });

  it("returns false when already installed / standalone", () => {
    expect(shouldShowIosInstallTip(IPHONE_SAFARI, true)).toBe(false);
    expect(shouldShowIosInstallTip(IPAD_SAFARI, true)).toBe(false);
  });

  it("returns false for non-Safari iOS browsers", () => {
    expect(shouldShowIosInstallTip(IPHONE_CHROME, false)).toBe(false);
    expect(shouldShowIosInstallTip(IPHONE_FIREFOX, false)).toBe(false);
  });

  it("returns false for non-iOS platforms", () => {
    expect(shouldShowIosInstallTip(ANDROID_CHROME, false)).toBe(false);
    expect(shouldShowIosInstallTip(DESKTOP_CHROME, false)).toBe(false);
  });
});

const DISMISS_KEY = "heirloom:pwa-install-dismissed";

/** jsdom lacks `matchMedia`; the component probes it via `isStandalone()`. */
function stubMatchMedia(matches = false) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

/** Fire the browser's install signal so the Android/desktop prompt appears. */
function fireBeforeInstallPrompt() {
  const event = new Event("beforeinstallprompt") as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: string; platform: string }>;
  };
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome: "dismissed", platform: "web" });
  act(() => {
    window.dispatchEvent(event);
  });
}

describe("InstallPrompt modal dialog semantics", () => {
  beforeEach(() => {
    window.localStorage.clear();
    stubMatchMedia(false);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("is a labelled modal dialog wired to real title/description ids", async () => {
    render(<InstallPrompt />);
    fireBeforeInstallPrompt();

    const dialog = await screen.findByRole("dialog", {
      name: /install heirloom/i,
    });
    // Role matches behavior now: a real modal dialog (4.1.2 Name, Role, Value).
    expect(dialog).toHaveAttribute("aria-modal", "true");

    const labelledBy = dialog.getAttribute("aria-labelledby");
    const describedBy = dialog.getAttribute("aria-describedby");
    expect(labelledBy).toBeTruthy();
    expect(describedBy).toBeTruthy();
    // The ids point at elements that actually exist in the prompt.
    expect(document.getElementById(labelledBy!)).toHaveTextContent(
      /install heirloom/i,
    );
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      /home screen/i,
    );
  });

  it("moves focus to the Install button when it opens", async () => {
    render(
      <>
        <button data-testid="outside">outside</button>
        <InstallPrompt />
      </>,
    );
    const outside = screen.getByTestId("outside");
    act(() => outside.focus());
    expect(document.activeElement).toBe(outside);

    fireBeforeInstallPrompt();

    const install = await screen.findByRole("button", { name: /^install$/i });
    // Focus is pulled into the dialog's primary action (2.4.3 Focus Order).
    await waitFor(() => expect(document.activeElement).toBe(install));
  });

  it("traps Tab and Shift+Tab within the dialog (2.1.2 No Keyboard Trap)", async () => {
    render(<InstallPrompt />);
    fireBeforeInstallPrompt();
    const install = await screen.findByRole("button", { name: /^install$/i });
    const dismiss = screen.getByRole("button", {
      name: /dismiss install prompt/i,
    });

    // Tab off the last control cycles back to the first…
    act(() => dismiss.focus());
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(install);

    // …and Shift+Tab off the first cycles to the last. Focus never escapes.
    act(() => install.focus());
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(dismiss);
  });

  it("dismisses on Escape from anywhere in the document (2.1.1)", async () => {
    render(<InstallPrompt />);
    fireBeforeInstallPrompt();
    await screen.findByRole("dialog", { name: /install heirloom/i });

    // Blur into the page body to prove Escape isn't bound to the banner div —
    // it works even before the user has tabbed into the dialog.
    act(() => (document.activeElement as HTMLElement | null)?.blur());
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Escape is a real dismissal — remembered like clicking the X.
    expect(window.localStorage.getItem(DISMISS_KEY)).not.toBeNull();
  });

  it("restores focus to the previously focused element on close (2.4.3)", async () => {
    render(
      <>
        <button data-testid="outside">outside</button>
        <InstallPrompt />
      </>,
    );
    const outside = screen.getByTestId("outside");
    act(() => outside.focus());

    fireBeforeInstallPrompt();
    const install = await screen.findByRole("button", { name: /^install$/i });
    await waitFor(() => expect(document.activeElement).toBe(install));

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Focus lands back where it started, not lost to <body>.
    await waitFor(() => expect(document.activeElement).toBe(outside));
  });

  it("registers the Escape listener only while open and cleans it up (no leak)", async () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");

    render(<InstallPrompt />);
    // Nothing bound while the prompt is closed — Escape isn't swallowed.
    expect(addSpy.mock.calls.filter((c) => c[0] === "keydown")).toHaveLength(0);

    fireBeforeInstallPrompt();
    await screen.findByRole("dialog", { name: /install heirloom/i });

    const added = addSpy.mock.calls.filter((c) => c[0] === "keydown");
    // Exactly one registration — no double-binding.
    expect(added).toHaveLength(1);

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const removed = removeSpy.mock.calls.filter((c) => c[0] === "keydown");
    expect(removed).toHaveLength(1);
    // The same handler that was added is the one removed.
    expect(removed[0]![1]).toBe(added[0]![1]);
  });

  it("makes the iOS tip a dialog that focuses Dismiss and closes on Escape", async () => {
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      get: () => IPHONE_SAFARI,
    });
    try {
      render(<InstallPrompt />);

      const dialog = await screen.findByRole("dialog", {
        name: /install heirloom/i,
      });
      expect(dialog).toHaveAttribute("aria-modal", "true");
      // iOS has no programmatic install, so no Install button — only the tip…
      expect(screen.queryByRole("button", { name: /^install$/i })).toBeNull();
      const dismiss = screen.getByRole("button", {
        name: /dismiss install prompt/i,
      });
      // …so focus moves to the sole action, and Escape still dismisses.
      await waitFor(() => expect(document.activeElement).toBe(dismiss));

      fireEvent.keyDown(document, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    } finally {
      delete (window.navigator as { userAgent?: unknown }).userAgent;
    }
  });
});
