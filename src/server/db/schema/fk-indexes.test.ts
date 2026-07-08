import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { comments, ratings } from "./engagement";
import { recipeEvents, recipeVersions } from "./recipes";
import { shoppingListItems } from "./shopping";

/**
 * Issue #153 — every foreign-key column that reverse-lookups or cascades on it
 * must have a covering index, or Postgres falls back to a sequential scan and
 * escalates locks as the tables grow. We assert the invariant at its source of
 * truth: the Drizzle table config that `db:generate` compiles into DDL.
 */

interface Expectation {
  label: string;
  table: PgTable;
  index: string;
  /** Column property names the index must cover, in order. */
  columns: string[];
}

const expectations: Expectation[] = [
  {
    label: "comments.userId",
    table: comments,
    index: "comments_user_idx",
    columns: ["userId"],
  },
  {
    label: "ratings.userId",
    table: ratings,
    index: "ratings_user_idx",
    columns: ["userId"],
  },
  {
    label: "recipeVersions.authorId",
    table: recipeVersions,
    index: "recipe_versions_author_idx",
    columns: ["authorId"],
  },
  {
    label: "recipeEvents.actorId",
    table: recipeEvents,
    index: "recipe_events_actor_idx",
    columns: ["actorId"],
  },
  {
    label: "recipeEvents.relatedRecipeId",
    table: recipeEvents,
    index: "recipe_events_related_idx",
    columns: ["relatedRecipeId"],
  },
  {
    label: "shoppingListItems.recipeId",
    table: shoppingListItems,
    index: "shopping_list_items_recipe_idx",
    columns: ["recipeId"],
  },
];

describe("schema covers unindexed foreign keys (issue #153)", () => {
  it.each(expectations)(
    "declares $index on $label",
    ({ table, index, columns }) => {
      const found = getTableConfig(table).indexes.find(
        (i) => i.config.name === index,
      );
      expect(found, `expected index "${index}"`).toBeDefined();
      expect(found?.config.columns.map((c) => (c as { name: string }).name)).toEqual(
        columns,
      );
    },
  );
});
