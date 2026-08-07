import { describe, expect, it } from "vitest";

import {
  MEAL_SLOTS,
  MEAL_SLOT_LABELS,
  addEntryInput,
  mealWithLeftoversInput,
  moveEntryInput,
  removeEntryInput,
} from "./validation";

describe("addEntryInput", () => {
  it("accepts a recipe assignment and trims the note", () => {
    expect(
      addEntryInput.parse({
        date: "2026-07-06",
        slot: "dinner",
        recipeId: "recipe123",
        note: "  double batch  ",
        servings: 4,
      }),
    ).toMatchObject({
      date: "2026-07-06",
      slot: "dinner",
      recipeId: "recipe123",
      note: "double batch",
      servings: 4,
    });
  });

  it("accepts a note-only entry", () => {
    const parsed = addEntryInput.parse({
      date: "2026-07-06",
      slot: "lunch",
      note: "Leftovers",
    });
    expect(parsed.note).toBe("Leftovers");
    expect(parsed.recipeId).toBeUndefined();
  });

  it("coerces an empty note to undefined", () => {
    expect(
      addEntryInput.parse({
        date: "2026-07-06",
        slot: "breakfast",
        recipeId: "r1",
        note: "   ",
      }).note,
    ).toBeUndefined();
  });

  it("requires either a recipe or a note", () => {
    const result = addEntryInput.safeParse({
      date: "2026-07-06",
      slot: "dinner",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.recipeId).toContain(
        "Pick a recipe or add a note",
      );
    }
  });

  it("only accepts servings for recipe entries", () => {
    expect(
      addEntryInput.safeParse({
        date: "2026-07-06",
        slot: "dinner",
        note: "Order pizza",
        servings: 4,
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown slot", () => {
    expect(
      addEntryInput.safeParse({
        date: "2026-07-06",
        slot: "brunch",
        note: "x",
      }).success,
    ).toBe(false);
  });

  it("rejects malformed or impossible dates", () => {
    expect(
      addEntryInput.safeParse({ date: "07/06/2026", slot: "dinner", note: "x" })
        .success,
    ).toBe(false);
    expect(
      addEntryInput.safeParse({ date: "2026-13-01", slot: "dinner", note: "x" })
        .success,
    ).toBe(false);
  });
});

describe("moveEntryInput", () => {
  it("accepts a valid move with an optional position", () => {
    expect(
      moveEntryInput.parse({
        entryId: "entry1",
        date: "2026-07-08",
        slot: "snack",
        position: 2,
      }),
    ).toMatchObject({
      entryId: "entry1",
      date: "2026-07-08",
      slot: "snack",
      position: 2,
    });
  });

  it("requires an entry id and a valid date", () => {
    expect(
      moveEntryInput.safeParse({
        entryId: "",
        date: "2026-07-08",
        slot: "snack",
      }).success,
    ).toBe(false);
    expect(
      moveEntryInput.safeParse({
        entryId: "entry1",
        date: "nope",
        slot: "snack",
      }).success,
    ).toBe(false);
  });
});

describe("removeEntryInput", () => {
  it("requires an entry id", () => {
    expect(removeEntryInput.parse({ entryId: "entry1" })).toEqual({
      entryId: "entry1",
    });
    expect(removeEntryInput.safeParse({ entryId: " " }).success).toBe(false);
    expect(
      removeEntryInput.parse({
        entryId: "entry1",
        removeAllocations: true,
      }),
    ).toEqual({ entryId: "entry1", removeAllocations: true });
  });
});

describe("mealWithLeftoversInput", () => {
  it("accepts exact servings across multiple dates and meal slots", () => {
    expect(
      mealWithLeftoversInput.parse({
        date: "2026-07-06",
        slot: "dinner",
        recipeId: "recipe123",
        mealServings: 3,
        leftovers: [
          { date: "2026-07-07", slot: "lunch", servings: 1 },
          { date: "2026-07-09", slot: "dinner", servings: 2 },
        ],
      }),
    ).toMatchObject({
      mealServings: 3,
      leftovers: [
        { slot: "lunch", servings: 1 },
        { slot: "dinner", servings: 2 },
      ],
    });
  });

  it("allows leftovers before the source date and later the same day", () => {
    expect(
      mealWithLeftoversInput.safeParse({
        date: "2026-07-06",
        slot: "dinner",
        recipeId: "recipe123",
        mealServings: 2,
        leftovers: [
          { date: "2026-07-05", slot: "breakfast", servings: 1 },
          { date: "2026-07-06", slot: "snack", servings: 1 },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects the source meal, duplicate destinations, and invalid servings", () => {
    const base = {
      date: "2026-07-06",
      slot: "dinner" as const,
      recipeId: "recipe123",
      mealServings: 3,
    };
    expect(
      mealWithLeftoversInput.safeParse({
        ...base,
        leftovers: [{ date: "2026-07-06", slot: "dinner", servings: 1 }],
      }).success,
    ).toBe(false);
    expect(
      mealWithLeftoversInput.safeParse({
        ...base,
        leftovers: [
          { date: "2026-07-07", slot: "lunch", servings: 1 },
          { date: "2026-07-07", slot: "lunch", servings: 2 },
        ],
      }).success,
    ).toBe(false);
    expect(
      mealWithLeftoversInput.safeParse({
        ...base,
        leftovers: [{ date: "2026-07-07", slot: "lunch", servings: 0 }],
      }).success,
    ).toBe(false);
  });
});

describe("meal slot metadata", () => {
  it("has a label for every slot", () => {
    expect(MEAL_SLOTS).toEqual(["breakfast", "lunch", "dinner", "snack"]);
    for (const slot of MEAL_SLOTS) {
      expect(MEAL_SLOT_LABELS[slot]).toBeTruthy();
    }
  });
});
