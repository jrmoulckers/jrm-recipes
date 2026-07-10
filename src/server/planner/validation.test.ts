import { describe, expect, it } from "vitest";

import {
  MEAL_SLOTS,
  MEAL_SLOT_LABELS,
  addEntryInput,
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
      }),
    ).toMatchObject({
      date: "2026-07-06",
      slot: "dinner",
      recipeId: "recipe123",
      note: "double batch",
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
