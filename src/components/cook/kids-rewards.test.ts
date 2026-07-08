import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { awardForCompletion, readBadges } from "./kids-rewards";

describe("kids-rewards", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("awards a First Cook badge and a recipe sticker on the first completion", () => {
    const { newlyEarned, badges } = awardForCompletion("Banana Bread", "banana-bread");

    const ids = newlyEarned.map((b) => b.id);
    expect(ids).toContain("first-cook");
    expect(ids).toContain("recipe:banana-bread");
    expect(badges).toHaveLength(2);
    expect(newlyEarned.find((b) => b.id === "recipe:banana-bread")?.name).toBe(
      "I made Banana Bread",
    );
  });

  it("persists earned badges so they can be read back", () => {
    awardForCompletion("Banana Bread", "banana-bread");

    const stored = readBadges();
    expect(stored.map((b) => b.id).sort()).toEqual(
      ["first-cook", "recipe:banana-bread"].sort(),
    );
  });

  it("does not award First Cook again on later completions", () => {
    awardForCompletion("Banana Bread", "banana-bread");
    const { newlyEarned } = awardForCompletion("Pancakes", "pancakes");

    expect(newlyEarned.map((b) => b.id)).not.toContain("first-cook");
    expect(newlyEarned.map((b) => b.id)).toContain("recipe:pancakes");
  });

  it("does not duplicate a recipe sticker when the same recipe is finished twice", () => {
    awardForCompletion("Banana Bread", "banana-bread");
    const { newlyEarned, badges } = awardForCompletion("Banana Bread", "banana-bread");

    expect(newlyEarned).toHaveLength(0);
    expect(badges.filter((b) => b.id === "recipe:banana-bread")).toHaveLength(1);
  });

  it("grants a milestone badge after three cooks", () => {
    awardForCompletion("One", "one");
    awardForCompletion("Two", "two");
    const { newlyEarned } = awardForCompletion("Three", "three");

    expect(newlyEarned.map((b) => b.id)).toContain("cook-3");
  });

  it("returns an empty list when nothing has been earned yet", () => {
    expect(readBadges()).toEqual([]);
  });

  it("ignores corrupt stored data instead of throwing", () => {
    window.localStorage.setItem("heirloom-kids-badges", "{not json");
    expect(readBadges()).toEqual([]);
  });
});
