import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  isLocale,
  localeDirection,
  negotiateAcceptLanguage,
  openGraphLocale,
  resolveLocale,
  resolveRequestLocale,
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

describe("openGraphLocale", () => {
  it("maps each supported locale to a language_TERRITORY value", () => {
    expect(openGraphLocale("en")).toBe("en_US");
    expect(openGraphLocale("es")).toBe("es_ES");
    expect(openGraphLocale("de")).toBe("de_DE");
    expect(openGraphLocale("ar")).toBe("ar_AR");
  });

  it("falls back to the default locale's value for unsupported input", () => {
    expect(openGraphLocale("fr")).toBe(openGraphLocale(DEFAULT_LOCALE));
    expect(openGraphLocale(null)).toBe(openGraphLocale(DEFAULT_LOCALE));
    expect(openGraphLocale(undefined)).toBe(openGraphLocale(DEFAULT_LOCALE));
  });
});

describe("negotiateAcceptLanguage", () => {
  it("returns the default for an empty or missing header", () => {
    expect(negotiateAcceptLanguage("")).toBe(DEFAULT_LOCALE);
    expect(negotiateAcceptLanguage(null)).toBe(DEFAULT_LOCALE);
    expect(negotiateAcceptLanguage(undefined)).toBe(DEFAULT_LOCALE);
  });

  it("resolves a plain supported language tag", () => {
    expect(negotiateAcceptLanguage("de")).toBe("de");
    expect(negotiateAcceptLanguage("es")).toBe("es");
    expect(negotiateAcceptLanguage("ar")).toBe("ar");
  });

  it("matches on the primary subtag of a region-qualified tag", () => {
    expect(negotiateAcceptLanguage("de-DE")).toBe("de");
    expect(negotiateAcceptLanguage("en-GB")).toBe("en");
    expect(negotiateAcceptLanguage("es-419")).toBe("es");
  });

  it("falls back to the default for unsupported languages", () => {
    expect(negotiateAcceptLanguage("fr")).toBe(DEFAULT_LOCALE);
    expect(negotiateAcceptLanguage("fr-FR,pt;q=0.8")).toBe(DEFAULT_LOCALE);
  });

  it("honors quality weights, preferring the highest-weighted supported tag", () => {
    // fr is most-preferred but unsupported; de outranks es by weight.
    expect(negotiateAcceptLanguage("fr,de;q=0.8,es;q=0.7")).toBe("de");
    expect(negotiateAcceptLanguage("fr;q=1.0,es;q=0.9,de;q=0.8")).toBe("es");
  });

  it("skips ranges explicitly rejected with q=0", () => {
    expect(negotiateAcceptLanguage("de;q=0,es;q=0.5")).toBe("es");
  });

  it("treats a wildcard as the default locale", () => {
    expect(negotiateAcceptLanguage("*")).toBe(DEFAULT_LOCALE);
    expect(negotiateAcceptLanguage("fr;q=0.2,*;q=0.1")).toBe(DEFAULT_LOCALE);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(negotiateAcceptLanguage("DE-de")).toBe("de");
    expect(negotiateAcceptLanguage("  es-ES , de ; q=0.9 ")).toBe("es");
  });
});

describe("resolveRequestLocale", () => {
  it("negotiates the Accept-Language header when no cookie is present", () => {
    expect(resolveRequestLocale(undefined, "de")).toBe("de");
    expect(resolveRequestLocale(null, "de-DE,en;q=0.8")).toBe("de");
  });

  it("falls back to the default when the header has no supported match", () => {
    expect(resolveRequestLocale(undefined, "fr")).toBe(DEFAULT_LOCALE);
    expect(resolveRequestLocale(null, null)).toBe(DEFAULT_LOCALE);
  });

  it("lets a valid cookie win over the Accept-Language header", () => {
    expect(resolveRequestLocale("es", "de")).toBe("es");
    expect(resolveRequestLocale("ar", "en-US,en;q=0.9")).toBe("ar");
  });

  it("ignores an unsupported cookie and negotiates the header instead", () => {
    expect(resolveRequestLocale("fr", "de")).toBe("de");
    expect(resolveRequestLocale("xx", "fr")).toBe(DEFAULT_LOCALE);
  });
});
