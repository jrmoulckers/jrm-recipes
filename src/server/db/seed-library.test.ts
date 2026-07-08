import { describe, expect, it } from "vitest";

import {
  buildCollectionRecipeRows,
  buildCollectionRows,
  buildCookLogRows,
  buildFavoriteRows,
  buildMealPlanRows,
  buildShoppingListItemRows,
  buildShoppingListRow,
  SEED_COLLECTION_IDS,
  SEED_SHOPPING_LIST_ID,
  toDateStr,
  type LibraryIds,
  type SeedClock,
} from "./seed-library";

const IDS: LibraryIds = {
  ownerId: "owner_1",
  groupId: "grp_1",
  users: { gran: "u_gran", rosa: "u_rosa", mateo: "u_mateo" },
  recipes: { gravy: "r_gravy", marinara: "r_marinara", focaccia: "r_focaccia" },
};

// Deterministic clock anchored at a fixed midnight so date assertions are stable.
const DAY_MS = 24 * 60 * 60 * 1000;
const ANCHOR = new Date(2024, 5, 15, 0, 0, 0, 0).getTime();
const clock: SeedClock = (daysAgo, extraMinutes = 0) =>
  new Date(ANCHOR - daysAgo * DAY_MS + extraMinutes * 60_000);

const KNOWN_USERS = new Set([
  IDS.ownerId,
  IDS.users.gran,
  IDS.users.rosa,
  IDS.users.mateo,
]);
const KNOWN_RECIPES = new Set([
  IDS.recipes.gravy,
  IDS.recipes.marinara,
  IDS.recipes.focaccia,
]);

/** Every id emitted by the builders, to prove they never collide. */
function allIds(): string[] {
  return [
    ...buildCookLogRows(IDS, clock).map((r) => r.id!),
    ...buildCollectionRows(IDS).map((r) => r.id!),
    ...buildCollectionRecipeRows(IDS).map((r) => r.id!),
    ...buildFavoriteRows(IDS).map((r) => r.id!),
    buildShoppingListRow(IDS).id!,
    ...buildShoppingListItemRows(IDS).map((r) => r.id!),
    ...buildMealPlanRows(IDS, clock).map((r) => r.id!),
  ];
}

describe("seed-library builders (#185)", () => {
  it("assigns a unique, stable id to every row", () => {
    const ids = allIds();
    expect(new Set(ids).size).toBe(ids.length);
    // Stable across calls, so re-seeding upserts in place.
    expect(allIds()).toEqual(ids);
  });

  it("keeps every id within the varchar(24) pk/fk bound", () => {
    // pk()/fk() columns are varchar(24) (cuid2 length); a hard-coded seed id
    // longer than 24 chars fails the insert with Postgres 22001 at db:seed.
    for (const id of allIds()) {
      expect(id.length).toBeLessThanOrEqual(24);
    }
  });

  it("populates every library surface with at least a few rows", () => {
    expect(buildCookLogRows(IDS, clock).length).toBeGreaterThanOrEqual(3);
    expect(buildCollectionRows(IDS).length).toBeGreaterThanOrEqual(2);
    expect(buildCollectionRecipeRows(IDS).length).toBeGreaterThanOrEqual(3);
    expect(buildFavoriteRows(IDS).length).toBeGreaterThanOrEqual(3);
    expect(buildShoppingListItemRows(IDS).length).toBeGreaterThanOrEqual(4);
    expect(buildMealPlanRows(IDS, clock).length).toBeGreaterThanOrEqual(5);
  });

  it("references only known user, recipe, and group ids (valid FKs)", () => {
    for (const row of buildCookLogRows(IDS, clock)) {
      expect(KNOWN_USERS.has(row.userId)).toBe(true);
      expect(KNOWN_RECIPES.has(row.recipeId)).toBe(true);
    }
    for (const row of buildFavoriteRows(IDS)) {
      expect(KNOWN_USERS.has(row.userId)).toBe(true);
      expect(KNOWN_RECIPES.has(row.recipeId)).toBe(true);
    }
    for (const row of buildCollectionRows(IDS)) {
      expect(KNOWN_USERS.has(row.userId)).toBe(true);
    }
    for (const row of buildCollectionRecipeRows(IDS)) {
      expect(SEED_COLLECTION_IDS).toContain(row.collectionId);
      expect(KNOWN_RECIPES.has(row.recipeId)).toBe(true);
    }
    for (const row of buildMealPlanRows(IDS, clock)) {
      expect(row.userId).toBe(IDS.ownerId);
      if (row.recipeId) expect(KNOWN_RECIPES.has(row.recipeId)).toBe(true);
      if (row.groupId) expect(row.groupId).toBe(IDS.groupId);
    }
  });

  it("keeps favorites unique per (user, recipe)", () => {
    const keys = buildFavoriteRows(IDS).map((r) => `${r.userId}:${r.recipeId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps collection memberships unique per (collection, recipe)", () => {
    const keys = buildCollectionRecipeRows(IDS).map(
      (r) => `${r.collectionId}:${r.recipeId}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("hangs every shopping-list item off the seeded list", () => {
    expect(buildShoppingListRow(IDS).id).toBe(SEED_SHOPPING_LIST_ID);
    for (const row of buildShoppingListItemRows(IDS)) {
      expect(row.listId).toBe(SEED_SHOPPING_LIST_ID);
    }
  });

  it("respects the shopping_list_items quantity CHECK constraints", () => {
    for (const row of buildShoppingListItemRows(IDS)) {
      if (row.quantity != null) expect(row.quantity).toBeGreaterThanOrEqual(0);
      if (row.quantityMax != null) {
        expect(row.quantityMax).toBeGreaterThanOrEqual(0);
      }
      if (row.quantity != null && row.quantityMax != null) {
        expect(row.quantityMax).toBeGreaterThanOrEqual(row.quantity);
      }
      // A soft recipe link, when present, must point at a real seeded recipe.
      if (row.recipeId) expect(KNOWN_RECIPES.has(row.recipeId)).toBe(true);
    }
  });

  it("has a mix of checked and unchecked shopping-list items", () => {
    const items = buildShoppingListItemRows(IDS);
    expect(items.some((r) => r.checked === true)).toBe(true);
    expect(items.some((r) => !r.checked)).toBe(true);
  });

  it("uses only valid meal slots and ISO date strings", () => {
    const slots = new Set(["breakfast", "lunch", "dinner", "snack"]);
    for (const row of buildMealPlanRows(IDS, clock)) {
      expect(slots.has(row.slot)).toBe(true);
      expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("plans an upcoming week and mixes recipe-linked with free-form entries", () => {
    const rows = buildMealPlanRows(IDS, clock);
    // Dates are today-or-later relative to the anchor midnight.
    const anchorDay = toDateStr(new Date(ANCHOR));
    expect(rows.every((r) => r.date >= anchorDay)).toBe(true);
    expect(rows.some((r) => r.recipeId != null)).toBe(true);
    expect(rows.some((r) => r.recipeId == null && r.note != null)).toBe(true);
  });

  it("gives the cook log believable metadata (notes, a photo, servings)", () => {
    const rows = buildCookLogRows(IDS, clock);
    expect(rows.some((r) => r.note != null)).toBe(true);
    expect(rows.some((r) => r.photoUrl != null)).toBe(true);
    expect(
      rows.every((r) => r.servingsMade == null || r.servingsMade > 0),
    ).toBe(true);
  });
});

describe("toDateStr", () => {
  it("formats a Date as a zero-padded YYYY-MM-DD", () => {
    expect(toDateStr(new Date(2024, 0, 5))).toBe("2024-01-05");
    expect(toDateStr(new Date(2024, 11, 31))).toBe("2024-12-31");
  });
});
