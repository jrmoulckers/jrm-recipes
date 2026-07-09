import { describe, expect, it, vi } from "vitest";

import {
  ingredientInput,
  recipeInput,
  recipeSlug,
  stepInput,
} from "./validation";

describe("recipeInput", () => {
  it("trims titles and fills recipe defaults", () => {
    expect(recipeInput.parse({ title: "  Sunday Sauce  " })).toMatchObject({
      title: "Sunday Sauce",
      visibility: "private",
      status: "draft",
      ingredients: [],
      steps: [],
      tags: [],
    });
  });

  it("coerces numeric form strings", () => {
    expect(
      recipeInput.parse({
        title: "Pancakes",
        servings: "4",
        prepMinutes: "10",
        cookMinutes: "20",
        totalMinutes: "30",
        ingredients: [{ item: "Flour", quantity: "1.5", quantityMax: "2" }],
        steps: [{ instruction: "Rest batter", timerSeconds: "120" }],
      }),
    ).toMatchObject({
      servings: 4,
      prepMinutes: 10,
      cookMinutes: 20,
      totalMinutes: 30,
      ingredients: [{ item: "Flour", quantity: 1.5, quantityMax: 2 }],
      steps: [{ instruction: "Rest batter", timerSeconds: 120 }],
    });
  });

  it("coerces empty optional form fields to undefined", () => {
    expect(
      recipeInput.parse({
        title: "Pie",
        description: "",
        coverImageUrl: "",
        servingsNoun: "",
        sourceUrl: "",
        groupId: "",
        ingredients: [
          {
            section: "",
            quantity: "",
            unit: "",
            item: " Apples ",
            note: "",
          },
        ],
        steps: [
          {
            section: "",
            instruction: " Mix filling ",
            imageUrl: "",
            videoUrl: "",
            timerSeconds: "",
          },
        ],
      }),
    ).toMatchObject({
      title: "Pie",
      description: undefined,
      coverImageUrl: undefined,
      servingsNoun: undefined,
      sourceUrl: undefined,
      groupId: undefined,
      ingredients: [
        {
          section: undefined,
          quantity: undefined,
          unit: undefined,
          item: "Apples",
          note: undefined,
          optional: false,
        },
      ],
      steps: [
        {
          section: undefined,
          instruction: "Mix filling",
          imageUrl: undefined,
          videoUrl: undefined,
          timerSeconds: undefined,
          techniques: [],
        },
      ],
    });
  });

  it("rejects empty titles and out-of-range numbers", () => {
    expect(() => recipeInput.parse({ title: " " })).toThrow(
      /Give your recipe a title/,
    );
    expect(() =>
      recipeInput.parse({ title: "Too Much", servings: "1001" }),
    ).toThrow();
  });

  it("surfaces human max-length messages for long text fields", () => {
    const overTitle = recipeInput.safeParse({ title: "x".repeat(201) });
    expect(overTitle.success).toBe(false);
    if (!overTitle.success) {
      expect(overTitle.error.flatten().fieldErrors.title?.[0]).toBe(
        "Keep the title under 200 characters",
      );
    }

    const overDescription = recipeInput.safeParse({
      title: "Fine",
      description: "x".repeat(2001),
    });
    expect(overDescription.success).toBe(false);
    if (!overDescription.success) {
      expect(overDescription.error.flatten().fieldErrors.description?.[0]).toBe(
        "Keep the description under 2,000 characters",
      );
    }
  });

  describe("group visibility requires a group (rc09)", () => {
    it("rejects visibility=group with no groupId and flags the field", () => {
      const res = recipeInput.safeParse({
        title: "Family Stew",
        visibility: "group",
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.flatten().fieldErrors.groupId).toBeDefined();
      }
    });

    it("rejects visibility=group with an empty groupId", () => {
      expect(
        recipeInput.safeParse({
          title: "Family Stew",
          visibility: "group",
          groupId: "",
        }).success,
      ).toBe(false);
    });

    it("accepts visibility=group when a groupId is provided", () => {
      expect(
        recipeInput.safeParse({
          title: "Family Stew",
          visibility: "group",
          groupId: "grp_123",
        }).success,
      ).toBe(true);
    });
  });

  describe("per-serving nutrition (i414)", () => {
    it("coerces nutrition form strings to numbers", () => {
      expect(
        recipeInput.parse({
          title: "Roast Chicken",
          calories: "540",
          proteinGrams: "42.5",
          carbsGrams: "3",
          fatGrams: "38",
          saturatedFatGrams: "11.2",
          sodiumMg: "620",
          sugarGrams: "1.5",
          fiberGrams: "0.5",
        }),
      ).toMatchObject({
        calories: 540,
        proteinGrams: 42.5,
        carbsGrams: 3,
        fatGrams: 38,
        saturatedFatGrams: 11.2,
        sodiumMg: 620,
        sugarGrams: 1.5,
        fiberGrams: 0.5,
      });
    });

    it("leaves blank nutrition fields undefined", () => {
      const parsed = recipeInput.parse({
        title: "No Numbers",
        calories: "",
        proteinGrams: "",
        sodiumMg: "",
      });
      expect(parsed.calories).toBeUndefined();
      expect(parsed.proteinGrams).toBeUndefined();
      expect(parsed.sodiumMg).toBeUndefined();
    });

    it("rejects negative and non-integer energy/sodium values", () => {
      expect(() =>
        recipeInput.parse({ title: "Bad", calories: "-1" }),
      ).toThrow();
      expect(() =>
        recipeInput.parse({ title: "Bad", sodiumMg: "-5" }),
      ).toThrow();
      expect(() =>
        recipeInput.parse({ title: "Bad", calories: "12.5" }),
      ).toThrow();
    });

    it("rejects out-of-range macronutrients", () => {
      expect(() =>
        recipeInput.parse({ title: "Bad", proteinGrams: "-2" }),
      ).toThrow();
      expect(() =>
        recipeInput.parse({ title: "Bad", fatGrams: "100001" }),
      ).toThrow();
    });
  });

  describe("structured dietary flags (i404)", () => {
    it("defaults to an empty list when omitted", () => {
      expect(recipeInput.parse({ title: "Plain" }).dietaryFlags).toEqual([]);
    });

    it("accepts the canonical dietary tags", () => {
      const parsed = recipeInput.parse({
        title: "Vegan Chili",
        dietaryFlags: ["vegan", "gluten-free"],
      });
      expect(parsed.dietaryFlags).toEqual(["vegan", "gluten-free"]);
    });

    it("dedupes repeated flags", () => {
      const parsed = recipeInput.parse({
        title: "Dupes",
        dietaryFlags: ["vegan", "vegan", "egg-free"],
      });
      expect(parsed.dietaryFlags).toEqual(["vegan", "egg-free"]);
    });

    it("rejects unknown dietary tags", () => {
      expect(() =>
        recipeInput.parse({ title: "Bad", dietaryFlags: ["keto"] }),
      ).toThrow();
    });
  });
});

describe("ingredientInput", () => {
  it("fills ingredient defaults", () => {
    expect(ingredientInput.parse({ item: " Salt " })).toMatchObject({
      item: "Salt",
      optional: false,
    });
  });

  it("rejects empty item text and invalid quantities", () => {
    expect(() => ingredientInput.parse({ item: " " })).toThrow(
      /Add an ingredient/,
    );
    expect(() => ingredientInput.parse({ item: "Salt", quantity: "100001" })).toThrow();
  });
});

describe("stepInput", () => {
  it("trims instructions and defaults techniques", () => {
    expect(stepInput.parse({ instruction: " Fold gently " })).toMatchObject({
      instruction: "Fold gently",
      techniques: [],
    });
  });

  it("rejects empty instructions and out-of-range timers", () => {
    expect(() => stepInput.parse({ instruction: " " })).toThrow(
      /Add step text/,
    );
    expect(() =>
      stepInput.parse({ instruction: "Wait", timerSeconds: "86401" }),
    ).toThrow();
  });
});

describe("recipeSlug", () => {
  it("builds a sensible recipe slug", () => {
    expect(recipeSlug("Grandma's Pie!")).toBe("grandmas-pie");
    expect(recipeSlug("!!!")).toBe("recipe");
  });
});

describe("media URL host allowlist (i216)", () => {
  it("allows any host when Cloudinary is unconfigured (dev URL-paste)", () => {
    // The suite runs with no NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME, so the escape
    // hatch is active and a pasted external image URL still validates.
    expect(
      recipeInput.parse({
        title: "Pasted",
        coverImageUrl: "https://example.com/photo.jpg",
      }).coverImageUrl,
    ).toBe("https://example.com/photo.jpg");
  });

  it("enforces the allowlist once Cloudinary is configured", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "demo");
    try {
      const { recipeInput: configured } = await import("./validation");

      // Off-allowlist cover/step image/video are rejected.
      expect(
        configured.safeParse({
          title: "Beacon",
          coverImageUrl: "https://evil.example/pixel.gif",
        }).success,
      ).toBe(false);
      expect(
        configured.safeParse({
          title: "Beacon",
          steps: [
            { instruction: "Watch", videoUrl: "https://evil.example/v.mp4" },
          ],
        }).success,
      ).toBe(false);

      // Cloudinary-hosted media still validates unchanged.
      expect(
        configured.safeParse({
          title: "Uploaded",
          coverImageUrl:
            "https://res.cloudinary.com/demo/image/upload/heirloom/x.jpg",
          steps: [
            {
              instruction: "Sear",
              imageUrl:
                "https://res.cloudinary.com/demo/image/upload/heirloom/s.jpg",
            },
          ],
        }).success,
      ).toBe(true);

      // A non-media source link is unaffected by the media allowlist.
      expect(
        configured.safeParse({
          title: "Sourced",
          sourceUrl: "https://cooking.example/recipe",
        }).success,
      ).toBe(true);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
