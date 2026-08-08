import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  shoppingIngredientRouteAlternatives,
  shoppingIngredientRoutes,
  shoppingListItems,
  shoppingLists,
} from "./shopping";

const indexColumns = (index: { config: { columns: unknown[] } }): string[] =>
  index.config.columns.map((column) => (column as { name: string }).name);

const drizzleDir = join(process.cwd(), "drizzle");
const routingMigration = readdirSync(drizzleDir)
  .filter((file) => file.endsWith(".sql"))
  .map((file) => readFileSync(join(drizzleDir, file), "utf8"))
  .find((body) =>
    body.includes('CREATE TABLE IF NOT EXISTS "shopping_ingredient_routes"'),
  );

describe("shopping routing schema (issue #630)", () => {
  it("models named, archivable store lists with one explicit default", () => {
    const { columns, indexes } = getTableConfig(shoppingLists);
    const column = (name: string) => columns.find((item) => item.name === name);

    expect(column("storeName")?.getSQLType()).toBe("varchar(120)");
    expect(column("storeName")?.notNull).toBe(false);
    expect(column("isDefault")?.notNull).toBe(true);
    expect(column("isDefault")?.default).toBe(false);
    expect(column("archivedAt")?.getSQLType()).toContain("timestamp");
    expect(column("archivedAt")?.notNull).toBe(false);

    const oneDefault = indexes.find(
      (item) => item.config.name === "shopping_lists_user_default_uq",
    );
    expect(oneDefault?.config.unique).toBe(true);
    expect(oneDefault?.config.where).toBeDefined();
    expect(oneDefault && indexColumns(oneDefault)).toEqual(["userId"]);

    const active = indexes.find(
      (item) => item.config.name === "shopping_lists_user_active_idx",
    );
    expect(active?.config.where).toBeDefined();
    expect(active && indexColumns(active)).toEqual(["userId", "updatedAt"]);
  });

  it("optionally links shopping lines to the canonical food graph", () => {
    const { columns, foreignKeys, indexes } = getTableConfig(shoppingListItems);
    const foodId = columns.find((column) => column.name === "foodId");
    const foodFk = foreignKeys.find((foreignKey) =>
      foreignKey.reference().columns.some((column) => column.name === "foodId"),
    );

    expect(foodId?.notNull).toBe(false);
    expect(foodFk?.onDelete).toBe("set null");
    expect(
      indexes.some(
        (index) => index.config.name === "shopping_list_items_food_idx",
      ),
    ).toBe(true);
  });

  it("stores canonical and normalized fallback routes with covering indexes", () => {
    const { columns, foreignKeys, indexes } = getTableConfig(
      shoppingIngredientRoutes,
    );
    const column = (name: string) => columns.find((item) => item.name === name);
    const foreignKey = (name: string) =>
      foreignKeys.find((item) =>
        item.reference().columns.some((candidate) => candidate.name === name),
      );

    expect(columns.map((item) => item.name)).toEqual([
      "id",
      "userId",
      "foodId",
      "normalizedItem",
      "displayItem",
      "preferredListId",
      "createdAt",
      "updatedAt",
    ]);
    expect(column("foodId")?.notNull).toBe(false);
    expect(column("normalizedItem")?.getSQLType()).toBe("text");
    expect(column("normalizedItem")?.notNull).toBe(true);
    expect(column("displayItem")?.notNull).toBe(true);
    expect(column("preferredListId")?.notNull).toBe(true);
    expect(foreignKey("userId")?.onDelete).toBe("cascade");
    expect(foreignKey("foodId")?.onDelete).toBe("set null");
    expect(foreignKey("preferredListId")?.onDelete).toBe("cascade");

    const canonical = indexes.find(
      (item) => item.config.name === "shopping_ingredient_routes_user_food_uq",
    );
    expect(canonical?.config.unique).toBe(true);
    expect(canonical?.config.where).toBeDefined();
    expect(canonical && indexColumns(canonical)).toEqual(["userId", "foodId"]);

    const fallback = indexes.find(
      (item) =>
        item.config.name ===
        "shopping_ingredient_routes_user_normalized_item_uq",
    );
    expect(fallback?.config.unique).toBe(true);
    expect(fallback?.config.where).toBeUndefined();
    expect(fallback && indexColumns(fallback)).toEqual([
      "userId",
      "normalizedItem",
    ]);
  });

  it("orders alternative lists and rejects negative positions", () => {
    const { checks, foreignKeys, indexes, primaryKeys } = getTableConfig(
      shoppingIngredientRouteAlternatives,
    );
    const foreignKey = (name: string) =>
      foreignKeys.find((item) =>
        item.reference().columns.some((candidate) => candidate.name === name),
      );

    expect(
      primaryKeys.map((key) => key.columns.map((column) => column.name)),
    ).toContainEqual(["routeId", "listId"]);
    expect(foreignKey("routeId")?.onDelete).toBe("cascade");
    expect(foreignKey("listId")?.onDelete).toBe("cascade");
    expect(checks.map((check) => check.name)).toContain(
      "shopping_ingredient_route_alternatives_position_check",
    );
    expect(
      indexes.some(
        (index) =>
          index.config.name ===
          "shopping_ingredient_route_alternatives_route_position_idx",
      ),
    ).toBe(true);
  });
});

describe("shopping routing migration (issue #630)", () => {
  it("backfills one deterministic implicit winner before enforcing uniqueness", () => {
    expect(routingMigration).toBeDefined();
    expect(routingMigration).toContain(
      'HAVING count(*) FILTER (WHERE "is_default") = 0',
    );
    expect(routingMigration).toContain(
      'ORDER BY "shopping_lists"."user_id", "shopping_lists"."updated_at" DESC, "shopping_lists"."id" DESC',
    );

    const update = routingMigration?.indexOf('UPDATE "shopping_lists"') ?? -1;
    const unique =
      routingMigration?.indexOf(
        'CREATE UNIQUE INDEX IF NOT EXISTS "shopping_lists_user_default_uq"',
      ) ?? -1;
    expect(update).toBeGreaterThan(-1);
    expect(unique).toBeGreaterThan(update);
  });

  it("keeps the additive DDL safe to re-run", () => {
    expect(routingMigration).toContain(
      'ALTER TABLE IF EXISTS "shopping_list_items" ADD COLUMN IF NOT EXISTS "food_id"',
    );
    expect(routingMigration).toContain(
      'ALTER TABLE IF EXISTS "shopping_lists" ADD COLUMN IF NOT EXISTS "is_default"',
    );
    expect(routingMigration).not.toMatch(
      /\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i,
    );
  });
});
