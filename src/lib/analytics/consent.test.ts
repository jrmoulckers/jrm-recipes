import { afterEach, describe, expect, it, vi } from "vitest";

import {
  configureConsent,
  detectPrivacySignal,
  getConsentState,
  isCaptureAllowed,
  resetConsent,
} from "./consent";
import { track } from "./index";
import {
  clearClientBackend,
  setClientBackend,
  type AnalyticsBackend,
} from "./backend";

afterEach(() => {
  resetConsent();
  clearClientBackend();
  vi.restoreAllMocks();
});

describe("detectPrivacySignal", () => {
  it("returns false with no navigator", () => {
    expect(detectPrivacySignal(undefined)).toBe(false);
  });

  it("detects Global Privacy Control", () => {
    expect(detectPrivacySignal({ globalPrivacyControl: true })).toBe(true);
  });

  it("detects Do Not Track across its spellings", () => {
    expect(detectPrivacySignal({ doNotTrack: "1" })).toBe(true);
    expect(detectPrivacySignal({ doNotTrack: "yes" })).toBe(true);
    expect(detectPrivacySignal({ msDoNotTrack: "1" })).toBe(true);
    expect(detectPrivacySignal({ doNotTrack: null }, { doNotTrack: "1" })).toBe(
      true,
    );
  });

  it("returns false when nothing is set", () => {
    expect(detectPrivacySignal({ doNotTrack: "0" })).toBe(false);
    expect(
      detectPrivacySignal({ doNotTrack: null }, { doNotTrack: null }),
    ).toBe(false);
  });
});

describe("isCaptureAllowed", () => {
  it("allows capture by default (opt-out model, no signal)", () => {
    expect(isCaptureAllowed()).toBe(true);
  });

  it("always blocks when a privacy signal is present, even if granted", () => {
    configureConsent({ status: "granted", privacySignal: true });
    expect(isCaptureAllowed()).toBe(false);
  });

  it("blocks an explicit denial in either model", () => {
    configureConsent({ status: "denied" });
    expect(isCaptureAllowed()).toBe(false);

    configureConsent({ requireConsent: true, status: "denied" });
    expect(isCaptureAllowed()).toBe(false);
  });

  it("requires an explicit grant in opt-in mode", () => {
    configureConsent({ requireConsent: true, status: "unset" });
    expect(isCaptureAllowed()).toBe(false);

    configureConsent({ requireConsent: true, status: "granted" });
    expect(isCaptureAllowed()).toBe(true);
  });

  it("configureConsent merges without clobbering unrelated fields", () => {
    configureConsent({ requireConsent: true });
    configureConsent({ status: "granted" });
    expect(getConsentState()).toEqual({
      requireConsent: true,
      status: "granted",
      privacySignal: false,
    });
  });
});

describe("client gate honors consent", () => {
  function fakeBackend() {
    const capture = vi.fn();
    const backend = {
      capture,
      identify: vi.fn(),
      alias: vi.fn(),
      reset: vi.fn(),
      optIn: vi.fn(),
      optOut: vi.fn(),
      hasOptedOut: vi.fn(() => false),
      isFeatureEnabled: vi.fn(() => undefined),
      getFeatureFlag: vi.fn(() => undefined),
      onFeatureFlags: vi.fn(),
    } satisfies AnalyticsBackend;
    return { backend, capture };
  }

  it("sends no events before consent is granted in opt-in mode", () => {
    const { backend, capture } = fakeBackend();
    setClientBackend(backend);
    configureConsent({ requireConsent: true, status: "unset" });

    track("share_link_copied", {});
    expect(capture).not.toHaveBeenCalled();

    configureConsent({ requireConsent: true, status: "granted" });
    track("share_link_copied", {});
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("stops sending events after an explicit opt-out", () => {
    const { backend, capture } = fakeBackend();
    setClientBackend(backend);

    track("share_link_copied", {});
    expect(capture).toHaveBeenCalledTimes(1);

    configureConsent({ status: "denied" });
    track("share_link_copied", {});
    expect(capture).toHaveBeenCalledTimes(1);
  });
});
