import { describe, expect, it } from "vitest";

import { shouldShowIosInstallTip } from "./install-prompt";

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
