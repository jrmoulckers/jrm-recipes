import { describe, expect, it } from "vitest";

import {
  adaptationTitle,
  assembleTimeline,
  buildAdaptationInput,
  type AdaptationSource,
  type TimelineEntry,
} from "./timeline";

function sourceRecipe(
  overrides: Partial<AdaptationSource> = {},
): AdaptationSource {
  return {
    title: "Grandma's Sunday Sauce",
    description: "A slow simmered gravy.",
    coverImageUrl: "https://img.example/sauce.jpg",
    servings: 8,
    servingsNoun: "bowls",
    prepMinutes: 20,
    cookMinutes: 180,
    totalMinutes: 200,
    difficulty: "medium",
    cuisine: "Italian",
    sourceName: "Nonna",
    sourceUrl: "https://example.com/sauce",
    notes: "Stir often.",
    ingredients: [
      {
        section: "Base",
        quantity: 2,
        quantityMax: 3,
        unit: "cans",
        item: "San Marzano tomatoes",
        note: "crushed",
        optional: false,
      },
      { item: "Basil", quantity: null, unit: null, optional: true },
    ],
    steps: [
      {
        section: "Simmer",
        instruction: "Simmer for three hours.",
        imageUrl: "https://img.example/step1.jpg",
        videoUrl: null,
        timerSeconds: 10800,
        techniques: ["braising"],
      },
      { instruction: "Season to taste.", techniques: null },
    ],
    tags: [{ tag: { name: "sauce" } }, { tag: { name: "sunday" } }],
    ...overrides,
  };
}

describe("adaptationTitle", () => {
  it("appends an adaptation marker", () => {
    expect(adaptationTitle("Sunday Sauce")).toBe("Sunday Sauce (Adaptation)");
  });

  it("is idempotent — never stacks the marker", () => {
    const once = adaptationTitle("Sunday Sauce");
    expect(adaptationTitle(once)).toBe(once);
  });

  it("keeps the title within the 200 char column limit", () => {
    const long = "x".repeat(250);
    const result = adaptationTitle(long);
    expect(result.length).toBeLessThanOrEqual(200);
    expect(result.endsWith("(Adaptation)")).toBe(true);
  });
});

describe("buildAdaptationInput", () => {
  it("deep-clones every ingredient, step, and tag from the source", () => {
    const input = buildAdaptationInput(sourceRecipe());

    expect(input.ingredients).toHaveLength(2);
    expect(input.ingredients[0]).toMatchObject({
      section: "Base",
      quantity: 2,
      quantityMax: 3,
      unit: "cans",
      item: "San Marzano tomatoes",
      note: "crushed",
      optional: false,
    });
    // nulls collapse to undefined so the RecipeInput contract holds
    expect(input.ingredients[1]).toMatchObject({
      item: "Basil",
      quantity: undefined,
      unit: undefined,
      optional: true,
    });

    expect(input.steps).toHaveLength(2);
    expect(input.steps[0]).toMatchObject({
      section: "Simmer",
      instruction: "Simmer for three hours.",
      imageUrl: "https://img.example/step1.jpg",
      timerSeconds: 10800,
      techniques: ["braising"],
    });
    // a null techniques array becomes an empty array, never undefined
    expect(input.steps[1]?.techniques).toEqual([]);

    expect(input.tags).toEqual(["sauce", "sunday"]);
  });

  it("copies the scalar fields but resets ownership + publication state", () => {
    const input = buildAdaptationInput(sourceRecipe());

    expect(input).toMatchObject({
      description: "A slow simmered gravy.",
      coverImageUrl: "https://img.example/sauce.jpg",
      servings: 8,
      servingsNoun: "bowls",
      cuisine: "Italian",
      difficulty: "medium",
    });
    // A fresh fork always starts as a private draft with no group.
    expect(input.visibility).toBe("private");
    expect(input.status).toBe("draft");
    expect(input.groupId).toBeUndefined();
    expect(input.title).toBe("Grandma's Sunday Sauce (Adaptation)");
  });

  it("tolerates a source with no ingredients, steps, or tags", () => {
    const input = buildAdaptationInput(
      sourceRecipe({ ingredients: [], steps: [], tags: [] }),
    );
    expect(input.ingredients).toEqual([]);
    expect(input.steps).toEqual([]);
    expect(input.tags).toEqual([]);
  });
});

describe("assembleTimeline", () => {
  function entry(
    id: string,
    kind: TimelineEntry["kind"],
    iso: string,
  ): TimelineEntry {
    return {
      id,
      kind,
      note: null,
      createdAt: new Date(iso),
      actor: null,
      related: null,
    };
  }

  it("orders milestones oldest-first (chronological)", () => {
    const ordered = assembleTimeline([
      entry("c", "published", "2024-03-01T00:00:00Z"),
      entry("a", "created", "2024-01-01T00:00:00Z"),
      entry("b", "updated", "2024-02-01T00:00:00Z"),
      entry("d", "adaptation", "2024-04-01T00:00:00Z"),
    ]);
    expect(ordered.map((e) => e.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("breaks ties on identical timestamps with a stable milestone order", () => {
    const sameTime = "2024-01-01T00:00:00Z";
    const ordered = assembleTimeline([
      entry("adaptation", "adaptation", sameTime),
      entry("published", "published", sameTime),
      entry("created", "created", sameTime),
      entry("updated", "updated", sameTime),
    ]);
    expect(ordered.map((e) => e.kind)).toEqual([
      "created",
      "updated",
      "published",
      "adaptation",
    ]);
  });

  it("does not mutate the input array", () => {
    const input = [
      entry("b", "updated", "2024-02-01T00:00:00Z"),
      entry("a", "created", "2024-01-01T00:00:00Z"),
    ];
    const snapshot = input.map((e) => e.id);
    assembleTimeline(input);
    expect(input.map((e) => e.id)).toEqual(snapshot);
  });
});
