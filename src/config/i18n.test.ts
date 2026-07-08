import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  isLocale,
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

describe("isLocale", () => {
  it("accepts every supported locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(isLocale(locale)).toBe(true);
    }
  });

  it("rejects unsupported or non-string values", () => {
    expect(isLocale("en-US")).toBe(false);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(42)).toBe(false);
  });
});

describe("resolveLocale", () => {
  it("resolves to the configured default locale with no request", () => {
    expect(resolveLocale()).toBe(DEFAULT_LOCALE);
  });

  it("returns a supported requested locale unchanged", () => {
    expect(resolveLocale("de")).toBe("de");
    expect(resolveLocale("ar")).toBe("ar");
  });

  it("falls back to the default for unsupported or missing requests", () => {
    expect(resolveLocale("fr")).toBe(DEFAULT_LOCALE);
    expect(resolveLocale(null)).toBe(DEFAULT_LOCALE);
    expect(resolveLocale(undefined)).toBe(DEFAULT_LOCALE);
  });
});
