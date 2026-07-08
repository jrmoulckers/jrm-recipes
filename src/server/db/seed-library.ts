/**
 * Pure demo-data builders for the "library" surfaces of the seed (#185): cook
 * log, collections + favorites, shopping list, and the weekly meal planner.
 *
 * Kept free of `db`, `postgres`, and `server-only` so the shapes + invariants
 * can be unit-tested without a database (seed.ts self-executes on import, so it
 * can't be imported from a test). seed.ts feeds these rows straight into
 * idempotent upserts / scoped rebuilds.
 *
 * Every row carries a stable, deterministic id so re-running `pnpm db:seed`
 * updates in place and row counts stay constant.
 */
import type { NewCollection, NewCollectionRecipe, NewFavorite } from "./schema";
import type { NewCookLogEntry } from "./schema";
import type { NewMealPlanEntry } from "./schema";
import type { NewShoppingList, NewShoppingListItem } from "./schema";

/** A clock that resolves an offset (days in the past) to a concrete Date. */
export type SeedClock = (daysAgo: number, extraMinutes?: number) => Date;

/** The already-resolved ids the library rows reference. */
export type LibraryIds = {
  ownerId: string;
  groupId: string;
  users: { gran: string; rosa: string; mateo: string };
  recipes: { gravy: string; marinara: string; focaccia: string };
};

/** Stable id of the single owner shopping list (so its items rebuild cleanly). */
export const SEED_SHOPPING_LIST_ID = "seed_shl_owner";

/** Stable ids of the seeded collections (so their memberships rebuild cleanly). */
export const SEED_COLLECTION_IDS = [
  "seed_col_weeknight",
  "seed_col_baking",
  "seed_col_sunday",
] as const;

/** Format a Date as a timezone-stable `YYYY-MM-DD` for `date`-typed columns. */
export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * A believable "recent cooks" trail: the owner and a few relatives actually
 * making the seeded dishes, dated across the last few months, some with a note,
 * a photo, or a servings count.
 */
export function buildCookLogRows(
  ids: LibraryIds,
  clock: SeedClock,
): NewCookLogEntry[] {
  const { ownerId, users, recipes } = ids;
  return [
    {
      id: "seed_clog_gravy_owner_recent",
      recipeId: recipes.gravy,
      userId: ownerId,
      cookedAt: clock(6, 18 * 60),
      note: "Doubled the batch and froze half — the ribs fell right off the bone.",
      servingsMade: 8,
    },
    {
      id: "seed_clog_gravy_rosa",
      recipeId: recipes.gravy,
      userId: users.rosa,
      cookedAt: clock(34, 17 * 60),
      note: "Added a parmesan rind like Mateo suggested. Worth it.",
      servingsMade: 6,
    },
    {
      id: "seed_clog_gravy_owner_old",
      recipeId: recipes.gravy,
      userId: ownerId,
      cookedAt: clock(88),
      servingsMade: 8,
    },
    {
      id: "seed_clog_marinara_owner",
      recipeId: recipes.marinara,
      userId: ownerId,
      cookedAt: clock(3, 19 * 60),
      note: "Tuesday-night rescue — on the table in 25 minutes.",
      servingsMade: 4,
    },
    {
      id: "seed_clog_marinara_mateo",
      recipeId: recipes.marinara,
      userId: users.mateo,
      cookedAt: clock(12),
      servingsMade: 4,
    },
    {
      id: "seed_clog_focaccia_owner",
      recipeId: recipes.focaccia,
      userId: ownerId,
      cookedAt: clock(20, 15 * 60),
      note: "Overnight ferment gave the biggest crumb yet.",
      photoUrl: "https://images.heirloom.local/seed/focaccia-crumb.jpg",
      servingsMade: 12,
    },
    {
      id: "seed_clog_focaccia_gran",
      recipeId: recipes.focaccia,
      userId: users.gran,
      cookedAt: clock(46),
      note: "Made it for Sunday lunch. Everyone went back for seconds.",
      servingsMade: 12,
    },
  ];
}

/** A couple of personal cookbooks for the owner, plus one of Gran's. */
export function buildCollectionRows(ids: LibraryIds): NewCollection[] {
  const { ownerId, users } = ids;
  return [
    {
      id: "seed_col_weeknight",
      userId: ownerId,
      name: "Weeknight Winners",
      description: "Fast, forgiving dinners for the middle of the week.",
    },
    {
      id: "seed_col_baking",
      userId: ownerId,
      name: "Baking Projects",
      description: "Weekend bakes worth the wait.",
    },
    {
      id: "seed_col_sunday",
      userId: users.gran,
      name: "Sunday Traditions",
      description: "The slow, saucy classics we grew up on.",
    },
  ];
}

/** Recipe memberships for the seeded collections, ordered by `position`. */
export function buildCollectionRecipeRows(
  ids: LibraryIds,
): NewCollectionRecipe[] {
  const { recipes } = ids;
  return [
    {
      id: "seed_colr_weeknight_marinara",
      collectionId: "seed_col_weeknight",
      recipeId: recipes.marinara,
      position: 0,
    },
    {
      id: "seed_colr_weeknight_focaccia",
      collectionId: "seed_col_weeknight",
      recipeId: recipes.focaccia,
      position: 1,
    },
    {
      id: "seed_colr_baking_focaccia",
      collectionId: "seed_col_baking",
      recipeId: recipes.focaccia,
      position: 0,
    },
    {
      id: "seed_colr_sunday_gravy",
      collectionId: "seed_col_sunday",
      recipeId: recipes.gravy,
      position: 0,
    },
    {
      id: "seed_colr_sunday_marinara",
      collectionId: "seed_col_sunday",
      recipeId: recipes.marinara,
      position: 1,
    },
  ];
}

/** One-tap favorites spread across the owner and relatives. */
export function buildFavoriteRows(ids: LibraryIds): NewFavorite[] {
  const { ownerId, users, recipes } = ids;
  return [
    { id: "seed_fav_owner_gravy", userId: ownerId, recipeId: recipes.gravy },
    { id: "seed_fav_rosa_gravy", userId: users.rosa, recipeId: recipes.gravy },
    {
      id: "seed_fav_rosa_focaccia",
      userId: users.rosa,
      recipeId: recipes.focaccia,
    },
    {
      id: "seed_fav_mateo_marinara",
      userId: users.mateo,
      recipeId: recipes.marinara,
    },
    {
      id: "seed_fav_gran_focaccia",
      userId: users.gran,
      recipeId: recipes.focaccia,
    },
  ];
}

/** The owner's single working shopping list. */
export function buildShoppingListRow(ids: LibraryIds): NewShoppingList {
  return {
    id: SEED_SHOPPING_LIST_ID,
    userId: ids.ownerId,
    name: "This week's shop",
  };
}

/**
 * Consolidated grocery lines: some pulled from a recipe (soft-linked), some
 * added by hand, with a mix of checked state. Quantities stay within the
 * shopping_list_items CHECK constraints (>= 0, and max >= min when both set).
 */
export function buildShoppingListItemRows(
  ids: LibraryIds,
): NewShoppingListItem[] {
  const { recipes } = ids;
  const listId = SEED_SHOPPING_LIST_ID;
  return [
    {
      id: "seed_sli_tomatoes",
      listId,
      item: "Canned San Marzano tomatoes",
      quantity: 84,
      unit: "oz",
      category: "Pantry",
      note: "Gravy + marinara combined",
      checked: false,
      recipeId: recipes.gravy,
      position: 0,
    },
    {
      id: "seed_sli_garlic",
      listId,
      item: "Garlic",
      quantity: 10,
      quantityMax: 12,
      unit: "cloves",
      category: "Produce",
      checked: false,
      recipeId: recipes.marinara,
      position: 1,
    },
    {
      id: "seed_sli_ribs",
      listId,
      item: "Pork spare ribs",
      quantity: 1,
      unit: "lb",
      category: "Butcher",
      checked: true,
      recipeId: recipes.gravy,
      position: 2,
    },
    {
      id: "seed_sli_oil",
      listId,
      item: "Extra-virgin olive oil",
      quantity: 1,
      unit: "bottle",
      category: "Pantry",
      checked: false,
      recipeId: recipes.focaccia,
      position: 3,
    },
    {
      id: "seed_sli_parmesan",
      listId,
      item: "Parmesan wedge",
      category: "Dairy",
      note: "For grating + a rind for the gravy",
      checked: false,
      position: 4,
    },
    {
      id: "seed_sli_towels",
      listId,
      item: "Paper towels",
      category: "Household",
      checked: true,
      position: 5,
    },
  ];
}

/**
 * A week of meals across slots: several recipe-linked dinners plus free-form
 * notes ("Leftovers", "Eat out"). Dates run from today forward so the planner
 * shows an upcoming week. Some entries are scoped to the family group.
 */
export function buildMealPlanRows(
  ids: LibraryIds,
  clock: SeedClock,
): NewMealPlanEntry[] {
  const { ownerId, groupId, recipes } = ids;
  const day = (aheadDays: number) => toDateStr(clock(-aheadDays));
  return [
    {
      id: "seed_mpe_d0_dinner",
      userId: ownerId,
      groupId,
      date: day(0),
      slot: "dinner",
      recipeId: recipes.gravy,
      position: 0,
    },
    {
      id: "seed_mpe_d1_dinner",
      userId: ownerId,
      groupId,
      date: day(1),
      slot: "dinner",
      recipeId: recipes.marinara,
      position: 0,
    },
    {
      id: "seed_mpe_d2_dinner",
      userId: ownerId,
      groupId,
      date: day(2),
      slot: "dinner",
      note: "Leftovers night",
      position: 0,
    },
    {
      id: "seed_mpe_d3_lunch",
      userId: ownerId,
      date: day(3),
      slot: "lunch",
      recipeId: recipes.marinara,
      position: 0,
    },
    {
      id: "seed_mpe_d3_dinner",
      userId: ownerId,
      groupId,
      date: day(3),
      slot: "dinner",
      recipeId: recipes.focaccia,
      note: "As a side with soup",
      position: 1,
    },
    {
      id: "seed_mpe_d4_dinner",
      userId: ownerId,
      date: day(4),
      slot: "dinner",
      note: "Eat out",
      position: 0,
    },
    {
      id: "seed_mpe_d5_breakfast",
      userId: ownerId,
      date: day(5),
      slot: "breakfast",
      recipeId: recipes.focaccia,
      note: "Focaccia toast",
      position: 0,
    },
    {
      id: "seed_mpe_d6_dinner",
      userId: ownerId,
      groupId,
      date: day(6),
      slot: "dinner",
      recipeId: recipes.gravy,
      position: 0,
    },
  ];
}
