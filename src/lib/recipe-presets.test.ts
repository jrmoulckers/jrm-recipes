import { describe, expect, it } from "vitest";

import { RECIPE_PRESETS, isPresetActive, togglePreset } from "./recipe-presets";

function preset(id: string) {
  const found = RECIPE_PRESETS.find((p) => p.id === id);
  if (!found) throw new Error(`missing preset ${id}`);
  return found;
}

describe("recipe presets", () => {
  it("defines the weeknight headline preset composing maxTime/difficulty/sort", () => {
    expect(preset("weeknight").params).toEqual([
      { key: "maxTime", value: "30" },
      { key: "difficulty", value: "easy" },
      { key: "sort", value: "quickest" },
    ]);
  });

  it("provides at least one additional quick preset", () => {
    expect(RECIPE_PRESETS.length).toBeGreaterThanOrEqual(2);
    expect(preset("quick-15")).toBeTruthy();
  });

  describe("isPresetActive", () => {
    it("is false when no params match", () => {
      expect(isPresetActive(new URLSearchParams(""), preset("weeknight"))).toBe(
        false,
      );
    });

    it("requires every owned param to be present", () => {
      const partial = new URLSearchParams("maxTime=30&difficulty=easy");
      expect(isPresetActive(partial, preset("weeknight"))).toBe(false);
      const full = new URLSearchParams(
        "maxTime=30&difficulty=easy&sort=quickest",
      );
      expect(isPresetActive(full, preset("weeknight"))).toBe(true);
    });

    it("matches multi-value tag membership case-insensitively", () => {
      const params = new URLSearchParams("tag=vegan&tag=Kid-Friendly");
      expect(isPresetActive(params, preset("kid-friendly"))).toBe(true);
    });
  });

  describe("togglePreset", () => {
    it("applies all params when inactive", () => {
      const next = togglePreset(new URLSearchParams(""), preset("weeknight"));
      expect(next.get("maxTime")).toBe("30");
      expect(next.get("difficulty")).toBe("easy");
      expect(next.get("sort")).toBe("quickest");
    });

    it("clears all owned params when already active", () => {
      const active = new URLSearchParams(
        "maxTime=30&difficulty=easy&sort=quickest&q=pasta",
      );
      const next = togglePreset(active, preset("weeknight"));
      expect(next.has("maxTime")).toBe(false);
      expect(next.has("difficulty")).toBe(false);
      expect(next.has("sort")).toBe(false);
      // Unrelated params are preserved.
      expect(next.get("q")).toBe("pasta");
    });

    it("adds a tag without clobbering existing tags", () => {
      const params = new URLSearchParams("tag=vegan");
      const next = togglePreset(params, preset("kid-friendly"));
      expect(next.getAll("tag").sort()).toEqual(["kid-friendly", "vegan"]);
    });

    it("removes only its own tag when toggled off", () => {
      const params = new URLSearchParams("tag=vegan&tag=kid-friendly");
      const next = togglePreset(params, preset("kid-friendly"));
      expect(next.getAll("tag")).toEqual(["vegan"]);
    });
  });
});
