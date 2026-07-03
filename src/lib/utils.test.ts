import { afterEach, describe, expect, it, vi } from "vitest";

import { absoluteUrl, cn, formatMinutes, slugify } from "./utils";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("cn", () => {
  it("merges conditional classes and resolves Tailwind conflicts", () => {
    expect(cn("px-2 py-1", false && "hidden", "px-4")).toBe("py-1 px-4");
  });
});

describe("absoluteUrl", () => {
  it("joins paths to the configured public app URL", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://recipes.example.com/");

    expect(absoluteUrl("recipes/grandmas-pie")).toBe(
      "https://recipes.example.com/recipes/grandmas-pie",
    );
    expect(absoluteUrl("/recipes")).toBe("https://recipes.example.com/recipes");
  });
});

describe("formatMinutes", () => {
  it("formats durations as hours and minutes", () => {
    expect(formatMinutes(90)).toBe("1 hr 30 min");
    expect(formatMinutes(60)).toBe("1 hr");
    expect(formatMinutes(15)).toBe("15 min");
  });

  it("uses an em dash for empty or non-positive durations", () => {
    expect(formatMinutes()).toBe("—");
    expect(formatMinutes(null)).toBe("—");
    expect(formatMinutes(0)).toBe("—");
  });
});

describe("slugify", () => {
  it("creates deterministic URL slugs", () => {
    expect(slugify(" Grandma's Pie! ")).toBe("grandmas-pie");
    expect(slugify("A & B / C")).toBe("a-b-c");
  });

  it("limits slugs to 80 characters", () => {
    expect(slugify("a".repeat(90))).toHaveLength(80);
  });
});
