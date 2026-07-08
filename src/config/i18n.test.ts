import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  localeDirection,
  resolveLocale,
} from "./i18n";

describe("localeDirection", () => {
  it("returns ltr for representative LTR locales", () => {
    for (const locale of ["en", "en-US", "fr", "de-DE", "ja", "zh-Hans"]) {
      expect(localeDirection(locale)).toBe("ltr");
    }
  });

  it("returns rtl for representative RTL locales", () => {
    for (const locale of ["ar", "ar-EG", "he", "he-IL", "fa", "ur-PK", "ps"]) {
      expect(localeDirection(locale)).toBe("rtl");
    }
  });

  it("keys off the primary subtag regardless of case or separator", () => {
    expect(localeDirection("AR-eg")).toBe("rtl");
    expect(localeDirection("he_IL")).toBe("rtl");
    expect(localeDirection("EN-us")).toBe("ltr");
  });

  it("recognizes legacy language codes for Hebrew and Yiddish", () => {
    expect(localeDirection("iw")).toBe("rtl");
    expect(localeDirection("ji")).toBe("rtl");
  });

  it("falls back to ltr for empty or unknown locales", () => {
    expect(localeDirection("")).toBe("ltr");
    expect(localeDirection("xx-YY")).toBe("ltr");
  });
});

describe("resolveLocale", () => {
  it("resolves to the configured default locale", () => {
    expect(resolveLocale()).toBe(DEFAULT_LOCALE);
  });
});
