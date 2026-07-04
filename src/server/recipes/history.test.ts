import { describe, expect, it, vi } from "vitest";

import { recipeInput } from "./validation";

vi.mock("server-only", () => ({}));

import { parseSnapshot } from "./queries";

describe("parseSnapshot", () => {
  it("round-trips a valid recipe input snapshot", () => {
    const input = recipeInput.parse({
      title: "Aunt May's Peach Cobbler",
      description: "Bubbling fruit under a craggy biscuit top.",
      servings: 8,
      servingsNoun: "squares",
      prepMinutes: 20,
      cookMinutes: 45,
      visibility: "public",
      status: "published",
      ingredients: [
        { item: "Peaches", quantity: 6, unit: "cups", optional: false },
        { item: "Brown sugar", quantity: 0.5, unit: "cup", optional: false },
      ],
      steps: [
        {
          instruction: "Bake until the fruit bubbles at the edges.",
          timerSeconds: 2700,
          techniques: ["baking"],
        },
      ],
      tags: ["dessert", "summer"],
    });

    expect(parseSnapshot(JSON.stringify(input))).toEqual(input);
  });

  it("returns null for junk or invalid snapshots", () => {
    expect(parseSnapshot("not json")).toBeNull();
    expect(parseSnapshot(JSON.stringify({ title: "" }))).toBeNull();
  });
});
