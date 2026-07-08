import { describe, expect, it } from "vitest";

import { buildIdentityTraits } from "./identity";

describe("buildIdentityTraits", () => {
  it("maps counts and flags to non-PII person properties", () => {
    const traits = buildIdentityTraits({
      createdAt: new Date("2024-03-01T12:34:56.000Z"),
      groupCount: 3,
      hasRecipes: true,
      isDev: false,
    });

    expect(traits).toEqual({
      created_at: "2024-03-01",
      group_count: 3,
      has_recipes: true,
      is_dev: false,
    });
  });

  it("only ever emits allow-listed, non-PII keys", () => {
    const traits = buildIdentityTraits({
      createdAt: "2024-01-01",
      groupCount: 1,
      hasRecipes: false,
    });

    expect(Object.keys(traits).sort()).toEqual([
      "created_at",
      "group_count",
      "has_recipes",
      "is_dev",
    ]);
  });

  it("defaults is_dev to false and records dev users when flagged", () => {
    expect(
      buildIdentityTraits({ groupCount: 0, hasRecipes: false }).is_dev,
    ).toBe(false);
    expect(
      buildIdentityTraits({ groupCount: 0, hasRecipes: false, isDev: true })
        .is_dev,
    ).toBe(true);
  });

  it("coerces group_count to a non-negative integer", () => {
    expect(
      buildIdentityTraits({ groupCount: 2.9, hasRecipes: false }).group_count,
    ).toBe(2);
    expect(
      buildIdentityTraits({ groupCount: -5, hasRecipes: false }).group_count,
    ).toBe(0);
    expect(
      buildIdentityTraits({ groupCount: Number.NaN, hasRecipes: false })
        .group_count,
    ).toBe(0);
  });

  it("omits created_at when missing or invalid", () => {
    expect(
      buildIdentityTraits({ groupCount: 0, hasRecipes: false }),
    ).not.toHaveProperty("created_at");
    expect(
      buildIdentityTraits({
        createdAt: "not-a-date",
        groupCount: 0,
        hasRecipes: false,
      }),
    ).not.toHaveProperty("created_at");
    expect(
      buildIdentityTraits({
        createdAt: null,
        groupCount: 0,
        hasRecipes: false,
      }),
    ).not.toHaveProperty("created_at");
  });
});
