import { describe, expect, it } from "vitest";

import { formatList } from "./i18n-format";

describe("formatList", () => {
  it("uses the locale's conjunction grammar (Oxford comma vs. connective word)", () => {
    expect(formatList(["a", "b", "c"], "en")).toBe("a, b, and c");
    expect(formatList(["a", "b", "c"], "es")).toBe("a, b y c");
    expect(formatList(["a", "b", "c"], "de")).toBe("a, b und c");
    expect(formatList(["a", "b", "c"], "ar")).toBe("a وb وc");
  });

  it("uses the locale's disjunction grammar when asked", () => {
    expect(formatList(["a", "b", "c"], "en", "disjunction")).toBe("a, b, or c");
    expect(formatList(["a", "b", "c"], "es", "disjunction")).toBe("a, b o c");
  });

  it("defaults to English conjunction", () => {
    expect(formatList(["a", "b"])).toBe("a and b");
  });

  it("returns the sole item for a one-element list and '' for an empty one", () => {
    expect(formatList(["solo"], "es")).toBe("solo");
    expect(formatList([], "es")).toBe("");
  });

  it("accepts any iterable, not just arrays", () => {
    expect(formatList(new Set(["a", "b"]), "en")).toBe("a and b");
  });

  it("falls back to the default locale instead of throwing on a bad tag", () => {
    expect(formatList(["a", "b", "c"], "not-a-locale!!")).toBe("a, b, and c");
  });
});
