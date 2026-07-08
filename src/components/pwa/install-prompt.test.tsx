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

describe("InstallPrompt keyboard & dialog semantics", () => {
  beforeEach(() => {
    window.localStorage.clear();
    stubMatchMedia(false);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("announces as a labelled, polite live region — never a dialog", async () => {
    render(<InstallPrompt />);
    fireBeforeInstallPrompt();

    const region = await screen.findByRole("region", { name: /install heirloom/i });
    // Role now matches behavior: a passive notification, not a dialog (4.1.2).
    expect(region).not.toHaveAttribute("role", "dialog");
    expect(screen.queryByRole("dialog")).toBeNull();
    // Appearance is announced politely (4.1.3 Status Messages).
    expect(region).toHaveAttribute("aria-live", "polite");
  });

  it("does not hijack focus when it appears", async () => {
    render(<InstallPrompt />);
    fireBeforeInstallPrompt();
    await screen.findByRole("region", { name: /install heirloom/i });

    // Non-modal: focus stays where it was (4.1.3), not pulled into the prompt.
    expect(document.activeElement).toBe(document.body);
  });

  it("keeps the Install and Dismiss actions keyboard-reachable", async () => {
    render(<InstallPrompt />);
    fireBeforeInstallPrompt();
    await screen.findByRole("region", { name: /install heirloom/i });

    // Real <button>s are in the tab order (2.1.1 Keyboard).
    expect(screen.getByRole("button", { name: /^install$/i })).toBeEnabled();
    const dismiss = screen.getByRole("button", { name: /dismiss install prompt/i });
    expect(dismiss).toBeEnabled();
    expect(dismiss).toHaveAttribute("aria-label", "Dismiss install prompt");
  });

  it("dismisses on Escape without trapping focus (2.1.2)", async () => {
    render(<InstallPrompt />);
    fireBeforeInstallPrompt();
    const region = await screen.findByRole("region", { name: /install heirloom/i });

    // Escape from within the prompt closes it, like the X button.
    fireEvent.keyDown(screen.getByRole("button", { name: /^install$/i }), {
      key: "Escape",
    });

    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: /install heirloom/i }),
      ).toBeNull(),
    );
    expect(region).not.toBeInTheDocument();
    // Escape is a real dismissal — it's remembered like clicking the X.
    expect(window.localStorage.getItem(DISMISS_KEY)).not.toBeNull();
  });

  it("makes the iOS tip equally operable and dismissible", async () => {
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      get: () => IPHONE_SAFARI,
    });
    try {
      render(<InstallPrompt />);

      const region = await screen.findByRole("region", {
        name: /install heirloom/i,
      });
      expect(region).toHaveAttribute("aria-live", "polite");
      // iOS has no programmatic install, so no Install button — only the tip…
      expect(screen.queryByRole("button", { name: /^install$/i })).toBeNull();
      // …but it must still be dismissible by keyboard.
      expect(
        screen.getByRole("button", { name: /dismiss install prompt/i }),
      ).toBeEnabled();

      fireEvent.keyDown(region, { key: "Escape" });
      await waitFor(() =>
        expect(
          screen.queryByRole("region", { name: /install heirloom/i }),
        ).toBeNull(),
      );
    } finally {
      delete (window.navigator as { userAgent?: unknown }).userAgent;
    }
  });
});
