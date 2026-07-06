import { describe, expect, it } from "vitest";

import {
  REEL_LIMITS,
  REEL_SITE_URL,
  buildReelScenes,
  coverByline,
  evenlySpacedIndices,
  formatIngredientLine,
  formatMinutesShort,
  mapRecipeToReel,
  metaChips,
  reelExportMode,
  reelImageUrl,
  sceneAtTime,
  selectKeyIngredients,
  selectKeySteps,
  totalDurationMs,
  type ReelRecipe,
  type ReelScene,
} from "./scenes";

function makeRecipe(overrides: Partial<ReelRecipe> = {}): ReelRecipe {
  return {
    title: "Buttermilk Pancakes",
    description: "Fluffy weekend pancakes.",
    coverImageUrl: "https://res.cloudinary.com/demo/image/upload/v1/pancakes.jpg",
    author: "Grandma Jo",
    group: "The Moulckers",
    totalMinutes: 25,
    servings: 4,
    servingsNoun: "servings",
    difficulty: "easy",
    cuisine: "American",
    ingredients: [
      { quantity: 2, unit: "cup", item: "all-purpose flour" },
      { quantity: 2, unit: "tbsp", item: "sugar" },
      { quantity: 2, unit: "tsp", item: "baking powder" },
      { quantity: 2, unit: "cup", item: "buttermilk" },
      { quantity: 2, item: "large eggs" },
      { item: "maple syrup", optional: true },
    ],
    steps: [
      { instruction: "Whisk the dry ingredients." },
      { instruction: "Whisk the wet ingredients." },
      { instruction: "Fold wet into dry until just combined." },
      { instruction: "Cook on a buttered griddle until bubbles pop." },
      { instruction: "Serve hot with butter and maple syrup." },
    ],
    ...overrides,
  };
}

describe("formatIngredientLine", () => {
  it("combines quantity, unit and item", () => {
    expect(
      formatIngredientLine({ quantity: 2, unit: "cup", item: "flour" }),
    ).toBe("2 cup flour");
  });

  it("drops trailing zeros from fractional quantities", () => {
    expect(
      formatIngredientLine({ quantity: 0.5, unit: "tsp", item: "salt" }),
    ).toBe("0.5 tsp salt");
  });

  it("renders a range when quantityMax is larger", () => {
    expect(
      formatIngredientLine({ quantity: 2, quantityMax: 3, unit: "cup", item: "stock" }),
    ).toBe("2\u20133 cup stock");
  });

  it("omits quantity and unit when absent", () => {
    expect(formatIngredientLine({ item: "basil" })).toBe("basil");
    expect(formatIngredientLine({ quantity: 0, item: "water" })).toBe("water");
  });
});

describe("formatMinutesShort", () => {
  it("formats sub-hour and hour durations", () => {
    expect(formatMinutesShort(45)).toBe("45 min");
    expect(formatMinutesShort(60)).toBe("1 hr");
    expect(formatMinutesShort(90)).toBe("1 hr 30 min");
  });
});

describe("metaChips", () => {
  it("builds chips for time, servings, difficulty and cuisine", () => {
    const chips = metaChips(makeRecipe());
    expect(chips.map((c) => c.label)).toEqual([
      "25 min",
      "Serves 4",
      "Easy",
      "American",
    ]);
    // difficulty chip carries a colored dot
    expect(chips.find((c) => c.label === "Easy")?.dot).toBeTruthy();
  });

  it("skips fields that are missing or non-positive", () => {
    const chips = metaChips(
      makeRecipe({
        totalMinutes: 0,
        servings: null,
        difficulty: null,
        cuisine: null,
      }),
    );
    expect(chips).toEqual([]);
  });
});

describe("coverByline", () => {
  it("joins author and group", () => {
    expect(coverByline(makeRecipe())).toBe("by Grandma Jo  \u00b7  The Moulckers");
  });

  it("returns null when neither is present", () => {
    expect(coverByline(makeRecipe({ author: null, group: null }))).toBeNull();
  });
});

describe("selectKeyIngredients", () => {
  it("caps to the limit and puts core ingredients before optional ones", () => {
    const many = makeRecipe({
      ingredients: [
        { item: "a" },
        { item: "b", optional: true },
        { item: "c" },
        { item: "d" },
        { item: "e" },
        { item: "f" },
        { item: "g" },
        { item: "h" },
      ],
    });
    const picked = selectKeyIngredients(many);
    expect(picked).toHaveLength(REEL_LIMITS.maxIngredients);
    // optional "b" should be pushed to the back, so it is dropped by the cap
    expect(picked.map((p) => p.text)).not.toContain("b");
    expect(picked.every((p, i) => i === 0 || !picked[i - 1]!.optional || p.optional)).toBe(
      true,
    );
  });

  it("ignores blank items", () => {
    const picked = selectKeyIngredients(
      makeRecipe({ ingredients: [{ item: "  " }, { item: "sugar" }] }),
    );
    expect(picked.map((p) => p.text)).toEqual(["sugar"]);
  });
});

describe("evenlySpacedIndices", () => {
  it("returns all indices when count >= length", () => {
    expect(evenlySpacedIndices(3, 5)).toEqual([0, 1, 2]);
  });

  it("always includes first and last and spreads the middle", () => {
    const idx = evenlySpacedIndices(10, 5);
    expect(idx[0]).toBe(0);
    expect(idx[idx.length - 1]).toBe(9);
    expect(idx).toHaveLength(5);
    // strictly increasing, distinct
    expect([...new Set(idx)]).toHaveLength(5);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });

  it("handles degenerate inputs", () => {
    expect(evenlySpacedIndices(0, 3)).toEqual([]);
    expect(evenlySpacedIndices(5, 0)).toEqual([]);
    expect(evenlySpacedIndices(5, 1)).toEqual([0]);
  });
});

describe("selectKeySteps", () => {
  it("keeps original step numbers and caps the count", () => {
    const recipe = makeRecipe({
      steps: Array.from({ length: 9 }, (_, i) => ({
        instruction: `Step ${i + 1}`,
      })),
    });
    const steps = selectKeySteps(recipe);
    expect(steps).toHaveLength(REEL_LIMITS.maxSteps);
    expect(steps[0]!.number).toBe(1);
    expect(steps[steps.length - 1]!.number).toBe(9);
    expect(steps.every((s) => s.totalSteps === 9)).toBe(true);
  });

  it("returns an empty list when there are no usable steps", () => {
    expect(selectKeySteps(makeRecipe({ steps: [] }))).toEqual([]);
    expect(selectKeySteps(makeRecipe({ steps: [{ instruction: "   " }] }))).toEqual([]);
  });

  it("preserves a step image url", () => {
    const steps = selectKeySteps(
      makeRecipe({ steps: [{ instruction: "Sear", imageUrl: "http://x/i.jpg" }] }),
    );
    expect(steps[0]!.imageUrl).toBe("http://x/i.jpg");
  });
});

describe("buildReelScenes", () => {
  it("orders scenes cover -> ingredients -> steps -> outro", () => {
    const scenes = buildReelScenes(makeRecipe());
    const kinds = scenes.map((s) => s.kind);
    expect(kinds[0]).toBe("cover");
    expect(kinds[1]).toBe("ingredients");
    expect(kinds[kinds.length - 1]).toBe("outro");
    expect(kinds.filter((k) => k === "step").length).toBe(5);
  });

  it("still produces a valid reel for an empty recipe", () => {
    const scenes = buildReelScenes({
      title: "",
      ingredients: [],
      steps: [],
    });
    expect(scenes.map((s) => s.kind)).toEqual(["cover", "outro"]);
    const cover = scenes[0] as Extract<ReelScene, { kind: "cover" }>;
    expect(cover.title).toBe("Untitled recipe");
  });

  it("omits the ingredients scene when there are no ingredients", () => {
    const scenes = buildReelScenes(makeRecipe({ ingredients: [] }));
    expect(scenes.some((s) => s.kind === "ingredients")).toBe(false);
  });

  it("puts the site url on the outro", () => {
    const scenes = buildReelScenes(makeRecipe());
    const outro = scenes.at(-1) as Extract<ReelScene, { kind: "outro" }>;
    expect(outro.siteUrl).toBe(REEL_SITE_URL);
  });
});

describe("totalDurationMs & sceneAtTime", () => {
  it("sums scene durations", () => {
    const scenes = buildReelScenes(makeRecipe());
    const total = totalDurationMs(scenes);
    expect(total).toBe(scenes.reduce((s, x) => s + x.durationMs, 0));
    expect(total).toBeGreaterThan(0);
  });

  it("locates the active scene and progress for a given time", () => {
    const scenes = buildReelScenes(makeRecipe());
    const first = sceneAtTime(scenes, 0);
    expect(first?.index).toBe(0);
    expect(first?.progress).toBeCloseTo(0, 5);

    const midFirst = sceneAtTime(scenes, scenes[0]!.durationMs / 2);
    expect(midFirst?.index).toBe(0);
    expect(midFirst?.progress).toBeCloseTo(0.5, 5);

    const intoSecond = sceneAtTime(scenes, scenes[0]!.durationMs + 10);
    expect(intoSecond?.index).toBe(1);
  });

  it("returns null past the end or before the start", () => {
    const scenes = buildReelScenes(makeRecipe());
    expect(sceneAtTime(scenes, totalDurationMs(scenes))).toBeNull();
    expect(sceneAtTime(scenes, -1)).toBeNull();
  });
});

describe("reelImageUrl", () => {
  it("injects a 9:16 fill transform for Cloudinary urls", () => {
    const out = reelImageUrl(
      "https://res.cloudinary.com/demo/image/upload/v123/pancakes.jpg",
    );
    expect(out).toContain("/upload/f_auto,q_auto,w_1080,h_1920,c_fill,g_auto/");
    expect(out).toContain("pancakes.jpg");
  });

  it("respects custom dimensions", () => {
    const out = reelImageUrl(
      "https://res.cloudinary.com/demo/image/upload/v1/a.jpg",
      540,
      960,
    );
    expect(out).toContain("w_540,h_960");
  });

  it("leaves non-Cloudinary urls untouched and passes through null", () => {
    expect(reelImageUrl("https://example.com/a.jpg")).toBe(
      "https://example.com/a.jpg",
    );
    expect(reelImageUrl(null)).toBeNull();
    expect(reelImageUrl(undefined)).toBeNull();
  });
});

describe("mapRecipeToReel", () => {
  it("flattens author/group and derives total minutes from prep+cook", () => {
    const reel = mapRecipeToReel({
      title: "Sauce",
      description: null,
      coverImageUrl: null,
      author: { name: "Dad" },
      group: { name: "Fam" },
      prepMinutes: 10,
      cookMinutes: 50,
      servings: 6,
      servingsNoun: "bowls",
      difficulty: "medium",
      cuisine: "Italian",
      ingredients: [{ item: "tomato", quantity: 3 }],
      steps: [{ instruction: "Simmer" }],
    });
    expect(reel.author).toBe("Dad");
    expect(reel.group).toBe("Fam");
    expect(reel.totalMinutes).toBe(60);
    expect(reel.difficulty).toBe("medium");
    expect(reel.ingredients[0]).toEqual({
      item: "tomato",
      quantity: 3,
      quantityMax: null,
      unit: null,
      optional: false,
    });
  });

  it("prefers an explicit totalMinutes and coerces bad difficulty to null", () => {
    const reel = mapRecipeToReel({
      title: "X",
      totalMinutes: 15,
      prepMinutes: 5,
      cookMinutes: 5,
      difficulty: "impossible",
      ingredients: [],
      steps: [],
    });
    expect(reel.totalMinutes).toBe(15);
    expect(reel.difficulty).toBeNull();
  });

  it("survives a fully missing recipe and can be turned into scenes", () => {
    const reel = mapRecipeToReel({ title: "Bare", ingredients: [], steps: [] });
    expect(reel.totalMinutes).toBeNull();
    const scenes = buildReelScenes(reel);
    expect(scenes.map((s) => s.kind)).toEqual(["cover", "outro"]);
  });
});

describe("reelExportMode", () => {
  const full = {
    canvasCapture: true,
    mediaRecorder: true,
    webmMimeType: true,
    canvasToBlob: true,
  };

  it("chooses video when capture + MediaRecorder + a real webm mime are present", () => {
    expect(reelExportMode(full)).toBe("video");
  });

  it("falls back to image on Safari/iOS (MediaRecorder but no webm encoding)", () => {
    expect(
      reelExportMode({ ...full, webmMimeType: false }),
    ).toBe("image");
  });

  it("falls back to image when canvas capture is unavailable", () => {
    expect(
      reelExportMode({ ...full, canvasCapture: false }),
    ).toBe("image");
  });

  it("falls back to image when MediaRecorder is missing", () => {
    expect(
      reelExportMode({ ...full, mediaRecorder: false }),
    ).toBe("image");
  });

  it("reports none when even a still image can't be produced", () => {
    expect(
      reelExportMode({
        canvasCapture: false,
        mediaRecorder: false,
        webmMimeType: false,
        canvasToBlob: false,
      }),
    ).toBe("none");
  });
});

