import { describe, expect, it } from "vitest";

import { commentInput, ratingInput, reviewInput } from "./validation";

describe("commentInput", () => {
  it("defaults comments to kind comment and trims the body", () => {
    expect(
      commentInput.parse({
        recipeId: "recipe_1",
        recipeSlug: "sunday-sauce",
        body: "  Needs more basil.  ",
      }),
    ).toMatchObject({
      kind: "comment",
      body: "Needs more basil.",
    });
  });

  it("rejects empty comment bodies", () => {
    expect(() =>
      commentInput.parse({
        recipeId: "recipe_1",
        recipeSlug: "sunday-sauce",
        body: "   ",
      }),
    ).toThrow();
  });
});

describe("ratingInput", () => {
  it("rejects ratings outside the star range", () => {
    expect(() =>
      ratingInput.parse({
        recipeId: "recipe_1",
        recipeSlug: "sunday-sauce",
        value: 0,
      }),
    ).toThrow();
    expect(() =>
      ratingInput.parse({
        recipeId: "recipe_1",
        recipeSlug: "sunday-sauce",
        value: 6,
      }),
    ).toThrow();
  });

  it("accepts one through five stars", () => {
    for (const value of [1, 2, 3, 4, 5]) {
      expect(
        ratingInput.parse({
          recipeId: "recipe_1",
          recipeSlug: "sunday-sauce",
          value,
        }),
      ).toMatchObject({ value });
    }
  });
});

describe("reviewInput photoUrl (#341/#355)", () => {
  const base = { recipeId: "recipe_1", recipeSlug: "sunday-sauce", rating: 5 };
  const cloudinaryUrl =
    "https://res.cloudinary.com/heirloom/image/upload/v1/review.jpg";

  it("accepts an uploaded Cloudinary delivery URL", () => {
    expect(
      reviewInput.parse({ ...base, photoUrl: cloudinaryUrl }),
    ).toMatchObject({ photoUrl: cloudinaryUrl });
  });

  it("treats an empty photo field as no photo", () => {
    expect(
      reviewInput.parse({ ...base, photoUrl: "" }).photoUrl,
    ).toBeUndefined();
    expect(reviewInput.parse(base).photoUrl).toBeUndefined();
  });

  it("rejects an off-host URL that could be a tracking beacon", () => {
    expect(() =>
      reviewInput.parse({
        ...base,
        photoUrl: "https://evil.example/beacon.gif",
      }),
    ).toThrow();
  });

  it("rejects a non-URL string", () => {
    expect(() =>
      reviewInput.parse({ ...base, photoUrl: "not a url" }),
    ).toThrow();
  });
});
