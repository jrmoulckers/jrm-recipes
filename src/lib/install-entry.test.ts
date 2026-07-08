import { describe, expect, it } from "vitest";

import { installEntryMode } from "./install-entry";

describe("installEntryMode", () => {
  const base = {
    standalone: false,
    installed: false,
    hasDeferredPrompt: false,
    iosEligible: false,
  };

  it("hides when already installed or standalone", () => {
    expect(installEntryMode({ ...base, standalone: true, hasDeferredPrompt: true })).toBe(
      "hidden",
    );
    expect(installEntryMode({ ...base, installed: true, iosEligible: true })).toBe(
      "hidden",
    );
  });

  it("prefers the native prompt when one is captured", () => {
    expect(
      installEntryMode({ ...base, hasDeferredPrompt: true, iosEligible: true }),
    ).toBe("native");
  });

  it("falls back to the iOS tip on iOS Safari", () => {
    expect(installEntryMode({ ...base, iosEligible: true })).toBe("ios");
  });

  it("hides when there is no way to install", () => {
    expect(installEntryMode(base)).toBe("hidden");
  });
});
