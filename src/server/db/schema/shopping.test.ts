import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  shoppingIngredientRouteAlternatives,
  shoppingIngredientRoutes,
  shoppingListItems,
  shoppingListRestorePointItems,
  shoppingListRestorePoints,
  shoppingLists,
} from "./shopping";
import { customUnits, userUnitPreferences } from "./preferences";
import { recipeIngredients } from "./recipes";

const indexColumns = (index: { config: { columns: unknown[] } }): string[] =>
  index.config.columns.map((column) => (column as { name: string }).name);

const drizzleDir = join(process.cwd(), "drizzle");
const routingMigration = readdirSync(drizzleDir)
  .filter((file) => file.endsWith(".sql"))
  .map((file) => readFileSync(join(drizzleDir, file), "utf8"))
  .find((body) =>
    body.includes('CREATE TABLE IF NOT EXISTS "shopping_ingredient_routes"'),
  );
const restorePointMigration = readdirSync(drizzleDir)
  .filter((file) => file.endsWith(".sql"))
  .map((file) => readFileSync(join(drizzleDir, file), "utf8"))
  .find((body) => body.includes('CREATE TABLE "shopping_list_restore_points"'));
const packageMigration = readdirSync(drizzleDir)
  .filter((file) => file.endsWith(".sql"))
  .map((file) => readFileSync(join(drizzleDir, file), "utf8"))
  .find((body) => body.includes('"purchase_quantity" double precision'));

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

  describe("shopping restore-point schema (issue #628)", () => {
    it("scopes restore points to both list and owner with deterministic history ordering", () => {
      const { columns, foreignKeys, indexes, checks } = getTableConfig(
        shoppingListRestorePoints,
      );
      const foreignKey = (name: string) =>
        foreignKeys.find((item) =>
          item.reference().columns.some((candidate) => candidate.name === name),
        );

      expect(columns.find((column) => column.name === "listId")?.notNull).toBe(
        true,
      );
      expect(columns.find((column) => column.name === "userId")?.notNull).toBe(
        true,
      );
      expect(
        columns.find((column) => column.name === "operationGroupId")?.notNull,
      ).toBe(false);
      expect(foreignKey("listId")?.onDelete).toBe("cascade");
      expect(foreignKey("userId")?.onDelete).toBe("cascade");
      expect(checks.map((item) => item.name)).toContain(
        "shopping_list_restore_points_operation_check",
      );
      const history = indexes.find(
        (item) =>
          item.config.name === "shopping_list_restore_points_list_created_idx",
      );
      expect(history && indexColumns(history)).toEqual([
        "listId",
        "createdAt",
        "id",
      ]);
      const grouped = indexes.find(
        (item) =>
          item.config.name === "shopping_list_restore_points_user_group_idx",
      );
      expect(grouped && indexColumns(grouped)).toEqual([
        "userId",
        "operationGroupId",
      ]);
    });

    describe("shopping restore-point migration (issue #628)", () => {
      it("adds valid, reversible restore tables without destructive DDL", () => {
        expect(restorePointMigration).toBeDefined();
        expect(restorePointMigration).toContain(
          "'remove_completed', 'clear_all', 'bulk_move_source'",
        );
        expect(restorePointMigration).not.toMatch(/\$\d+/);
        expect(restorePointMigration).not.toMatch(
          /\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i,
        );
      });
    });

    it("captures complete item previews with stable positions and cascading cleanup", () => {
      const { columns, foreignKeys, indexes, checks } = getTableConfig(
        shoppingListRestorePointItems,
      );
      const pointFk = foreignKeys.find((item) =>
        item
          .reference()
          .columns.some((candidate) => candidate.name === "restorePointId"),
      );

      expect(pointFk?.onDelete).toBe("cascade");
      expect(columns.map((column) => column.name)).toEqual([
        "id",
        "restorePointId",
        "item",
        "quantity",
        "quantityMax",
        "unit",
        "requiredBaseQuantity",
        "requiredBaseQuantityMax",
        "requiredBaseUnit",
        "purchaseQuantity",
        "purchaseUnit",
        "packageCount",
        "packageAmount",
        "packageUnit",
        "packageLabel",
        "category",
        "note",
        "optional",
        "checked",
        "recipeId",
        "foodId",
        "position",
      ]);
      expect(checks.map((item) => item.name)).toContain(
        "shopping_list_restore_point_items_position_check",
      );
      expect(checks.map((item) => item.name)).toEqual(
        expect.arrayContaining([
          "shopping_list_restore_point_items_required_base_quantity_check",
          "shopping_list_restore_point_items_required_base_quantity_range_check",
          "shopping_list_restore_point_items_purchase_quantity_check",
          "shopping_list_restore_point_items_package_count_check",
          "shopping_list_restore_point_items_package_result_check",
        ]),
      );
      const orderedItems = indexes.find(
        (item) =>
          item.config.name ===
          "shopping_list_restore_point_items_point_position_idx",
      );
      expect(orderedItems && indexColumns(orderedItems)).toEqual([
        "restorePointId",
        "position",
        "id",
      ]);
    });
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

  it("stores exact requirements separately from package purchase results", () => {
    const { checks, columns } = getTableConfig(shoppingListItems);
    const column = (name: string) => columns.find((item) => item.name === name);

    expect(column("quantity")?.notNull).toBe(false);
    expect(column("quantityMax")?.notNull).toBe(false);
    expect(column("quantity")?.getSQLType()).toBe("double precision");
    expect(column("quantityMax")?.getSQLType()).toBe("double precision");
    expect(column("requiredBaseQuantity")?.getSQLType()).toBe(
      "double precision",
    );
    expect(column("requiredBaseQuantityMax")?.getSQLType()).toBe(
      "double precision",
    );
    expect(column("requiredBaseUnit")?.getSQLType()).toBe("varchar(40)");
    expect(column("purchaseQuantity")?.getSQLType()).toBe("double precision");
    expect(column("purchaseUnit")?.getSQLType()).toBe("varchar(40)");
    expect(column("packageCount")?.getSQLType()).toBe("integer");
    expect(column("packageAmount")?.getSQLType()).toBe("double precision");
    expect(checks.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        "shopping_list_items_purchase_quantity_check",
        "shopping_list_items_package_count_check",
        "shopping_list_items_package_result_check",
        "shopping_list_items_required_base_quantity_check",
        "shopping_list_items_required_base_quantity_range_check",
      ]),
    );
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
      "packageAmount",
      "packageUnit",
      "packageLabel",
      "packageRounding",
      "createdAt",
      "updatedAt",
    ]);
    expect(column("foodId")?.notNull).toBe(false);
    expect(column("normalizedItem")?.getSQLType()).toBe("text");
    expect(column("normalizedItem")?.notNull).toBe(true);
    expect(column("displayItem")?.notNull).toBe(true);
    expect(column("preferredListId")?.notNull).toBe(true);
    expect(column("packageAmount")?.getSQLType()).toBe("double precision");
    expect(column("packageUnit")?.getSQLType()).toBe("varchar(40)");
    expect(column("packageRounding")?.notNull).toBe(false);
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

  describe("shopping package migration (issue #629)", () => {
    it("defaults global rounding off and keeps existing rows exact", () => {
      const preferences = getTableConfig(userUnitPreferences);
      const packageRounding = preferences.columns.find(
        (column) => column.name === "packageRounding",
      );

      expect(packageRounding?.notNull).toBe(true);
      expect(packageRounding?.default).toBe(false);
      expect(packageMigration).toContain(
        'ADD COLUMN IF NOT EXISTS "package_rounding" boolean DEFAULT false NOT NULL',
      );
      expect(packageMigration).toContain(
        'ADD COLUMN IF NOT EXISTS "purchase_quantity" double precision',
      );
      expect(
        getTableConfig(recipeIngredients)
          .columns.find((column) => column.name === "quantity")
          ?.getSQLType(),
      ).toBe("double precision");
      expect(
        getTableConfig(recipeIngredients)
          .columns.find((column) => column.name === "quantityMax")
          ?.getSQLType(),
      ).toBe("double precision");
      expect(
        getTableConfig(customUnits)
          .columns.find((column) => column.name === "baseAmount")
          ?.getSQLType(),
      ).toBe("double precision");
      expect(packageMigration).toContain(
        'ALTER TABLE IF EXISTS "recipe_ingredients" ALTER COLUMN "quantity" TYPE double precision USING "quantity"::double precision',
      );
      expect(packageMigration).toContain(
        'ALTER TABLE IF EXISTS "recipe_ingredients" ALTER COLUMN "quantity_max" TYPE double precision USING "quantity_max"::double precision',
      );
      expect(packageMigration).toContain(
        'ALTER TABLE IF EXISTS "custom_units" ALTER COLUMN "base_amount" TYPE double precision USING "base_amount"::double precision',
      );
      expect(packageMigration).toContain(
        'ALTER TABLE IF EXISTS "shopping_list_items" ALTER COLUMN "quantity" TYPE double precision USING "quantity"::double precision',
      );
      expect(packageMigration).toContain(
        'ALTER TABLE IF EXISTS "shopping_list_items" ALTER COLUMN "quantity_max" TYPE double precision USING "quantity_max"::double precision',
      );
      expect(packageMigration).toContain(
        'ADD COLUMN IF NOT EXISTS "required_base_quantity" double precision',
      );
      expect(packageMigration).toContain(
        'ADD COLUMN IF NOT EXISTS "required_base_quantity_max" double precision',
      );
      expect(packageMigration).toContain(
        'ALTER TABLE IF EXISTS "shopping_ingredient_routes" ADD COLUMN IF NOT EXISTS "package_amount" double precision',
      );
      expect(packageMigration).toContain(
        'ALTER TABLE IF EXISTS "shopping_list_items" ADD COLUMN IF NOT EXISTS "package_amount" double precision',
      );
      expect(packageMigration).not.toMatch(
        /"(?:required_base_quantity(?:_max)?|purchase_quantity|package_amount)" real/,
      );
      expect(packageMigration).toContain("NOT VALID");
      expect(packageMigration).toContain(
        'VALIDATE CONSTRAINT "shopping_list_items_package_result_check"',
      );
      const additiveColumns =
        packageMigration?.match(/^ALTER TABLE .* ADD COLUMN .*$/gm) ?? [];
      expect(additiveColumns).toHaveLength(23);
      expect(
        additiveColumns.every(
          (line) =>
            line.includes("ALTER TABLE IF EXISTS") &&
            line.includes("ADD COLUMN IF NOT EXISTS"),
        ),
      ).toBe(true);
      expect(
        packageMigration?.match(/EXCEPTION WHEN duplicate_object/g),
      ).toHaveLength(16);
      expect(packageMigration?.match(/VALIDATE CONSTRAINT/g)).toHaveLength(16);
      expect(packageMigration).not.toMatch(
        /\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i,
      );
    });
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
