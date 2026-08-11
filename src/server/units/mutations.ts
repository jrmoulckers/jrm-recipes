import 'server-only';

import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';

import { mergeShoppingItems, type ShoppingItemInput } from '~/lib/shopping-list';
import { toCustomUnitDefs, toUnitPrefs } from '~/lib/unit-prefs';
import { isKnownUnit, normalizeUnit } from '~/lib/units';
import { db } from '~/server/db';
import {
  customUnits,
  shoppingIngredientRoutes,
  shoppingListItems,
  shoppingLists,
  userUnitPreferences,
  type User,
} from '~/server/db/schema';
import { type CustomUnitInput, type UnitPreferencesInput } from './validation';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ShoppingRow = typeof shoppingListItems.$inferSelect;

/** Postgres unique-violation code, raised when a custom-unit name repeats. */
const PG_UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error != null &&
    'code' in error &&
    (error as { code?: string }).code === PG_UNIQUE_VIOLATION
  );
}

function prefFields(input: UnitPreferencesInput) {
  return {
    defaultSystem: input.defaultSystem,
    volumeUnit: input.volumeUnit ?? null,
    liquidVolumeUnit: input.liquidVolumeUnit ?? null,
    dryVolumeUnit: input.dryVolumeUnit ?? null,
    smallVolumeUnit: input.smallVolumeUnit ?? null,
    massUnit: input.massUnit ?? null,
    temperatureUnit: input.temperatureUnit ?? null,
    autoConvert: input.autoConvert,
    packageRounding: input.packageRounding,
  };
}

/**
 * Upsert a user's unit preferences. There's at most one row per user (the
 * unique `user_id`), so an insert that collides updates the existing row in
 * place. The settings form always sends the full desired state.
 */
export async function saveUnitPreferences(input: UnitPreferencesInput, user: User) {
  const [row] = await db
    .insert(userUnitPreferences)
    .values({ ...prefFields(input), userId: user.id })
    .onConflictDoUpdate({
      target: userUnitPreferences.userId,
      set: prefFields(input),
    })
    .returning({ id: userUnitPreferences.id });
  if (!row) throw new Error('CONFLICT');
  return row;
}

function customFields(input: CustomUnitInput) {
  return {
    name: input.name,
    abbreviation: input.abbreviation ?? null,
    dimension: input.dimension,
    baseUnit: input.baseUnit ?? null,
    baseAmount: input.baseAmount ?? null,
    displayAsTrue: input.displayAsTrue,
  };
}

/** Load a custom unit the user owns, or throw NOT_FOUND. */
async function requireOwnedCustomUnit(tx: Tx, id: string, user: User) {
  const unit = await tx.query.customUnits.findFirst({
    where: and(eq(customUnits.id, id), eq(customUnits.userId, user.id)),
  });
  if (!unit) throw new Error('NOT_FOUND');
  return unit;
}

function shoppingInput(
  item: Pick<
    ShoppingRow,
    | 'item'
    | 'foodId'
    | 'quantity'
    | 'quantityMax'
    | 'unit'
    | 'requiredBaseQuantity'
    | 'requiredBaseQuantityMax'
    | 'requiredBaseUnit'
    | 'optional'
    | 'recipeId'
  >,
): ShoppingItemInput {
  return item;
}

async function canonicalizeMatchingRows(
  tx: Tx,
  userId: string,
  unit: typeof customUnits.$inferSelect,
) {
  const names = [
    ...new Set(
      [unit.name, unit.abbreviation]
        .filter((name): name is string => Boolean(name?.trim()))
        .map((name) => name.trim().toLowerCase()),
    ),
  ];
  if (names.length === 0) return [];

  const rows = await tx
    .select({ item: shoppingListItems })
    .from(shoppingListItems)
    .innerJoin(
      shoppingLists,
      and(eq(shoppingLists.id, shoppingListItems.listId), eq(shoppingLists.userId, userId)),
    )
    .where(
      or(
        inArray(sql<string>`lower(trim(${shoppingListItems.requiredBaseUnit}))`, names),
        inArray(sql<string>`lower(trim(${shoppingListItems.unit}))`, names),
      ),
    );
  const oldDefinition = toCustomUnitDefs([unit]);
  const canonicalized: ShoppingRow[] = [];

  for (const { item } of rows) {
    const [canonical] = mergeShoppingItems([shoppingInput(item)], {
      customUnits: oldDefinition,
    });
    if (canonical?.requiredBaseQuantity == null) continue;
    const next = {
      ...item,
      requiredBaseQuantity: canonical.requiredBaseQuantity,
      requiredBaseQuantityMax: canonical.requiredBaseQuantityMax,
      requiredBaseUnit: canonical.requiredBaseUnit,
    };
    await tx
      .update(shoppingListItems)
      .set({
        requiredBaseQuantity: next.requiredBaseQuantity,
        requiredBaseQuantityMax: next.requiredBaseQuantityMax,
        requiredBaseUnit: next.requiredBaseUnit,
      })
      .where(eq(shoppingListItems.id, item.id));
    canonicalized.push(next);
  }
  return canonicalized;
}

async function canonicalizeMatchingPackageRoutes(
  tx: Tx,
  userId: string,
  unit: typeof customUnits.$inferSelect,
): Promise<boolean> {
  const names = new Set(
    [unit.name, unit.abbreviation]
      .filter((name): name is string => Boolean(name?.trim()))
      .map((name) => name.trim().toLowerCase()),
  );
  const baseUnit = normalizeUnit(unit.baseUnit);
  const baseAmount = unit.baseAmount;
  if (
    names.size === 0 ||
    !baseUnit ||
    !isKnownUnit(baseUnit) ||
    baseAmount == null ||
    !Number.isFinite(baseAmount) ||
    baseAmount <= 0
  ) {
    return false;
  }

  const routes = await tx.query.shoppingIngredientRoutes.findMany({
    where: eq(shoppingIngredientRoutes.userId, userId),
  });
  const matching = routes.filter(
    (route) =>
      route.packageAmount != null &&
      route.packageUnit != null &&
      names.has(route.packageUnit.trim().toLowerCase()),
  );
  for (const route of matching) {
    await tx
      .update(shoppingIngredientRoutes)
      .set({
        packageAmount: route.packageAmount! * baseAmount,
        packageUnit: baseUnit,
        updatedAt: new Date(),
      })
      .where(
        and(eq(shoppingIngredientRoutes.id, route.id), eq(shoppingIngredientRoutes.userId, userId)),
      );
  }
  return matching.length > 0;
}

async function loadOwnedShoppingRows(tx: Tx, userId: string) {
  const rows = await tx
    .select({ item: shoppingListItems })
    .from(shoppingListItems)
    .innerJoin(
      shoppingLists,
      and(eq(shoppingLists.id, shoppingListItems.listId), eq(shoppingLists.userId, userId)),
    )
    .where(eq(shoppingLists.userId, userId));
  return rows.map(({ item }) => item);
}

function uniqueRows(rows: readonly ShoppingRow[]): ShoppingRow[] {
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

async function rerenderRows(tx: Tx, userId: string, rows: readonly ShoppingRow[]) {
  if (rows.length === 0) return;
  const [preferenceRow, customUnitRows, routeRows] = await Promise.all([
    tx.query.userUnitPreferences.findFirst({
      where: eq(userUnitPreferences.userId, userId),
    }),
    tx.query.customUnits.findMany({
      where: eq(customUnits.userId, userId),
      orderBy: [asc(customUnits.createdAt), asc(customUnits.id)],
    }),
    tx.query.shoppingIngredientRoutes.findMany({
      where: eq(shoppingIngredientRoutes.userId, userId),
    }),
  ]);
  const options = {
    unitPreferences: toUnitPrefs(preferenceRow),
    customUnits: toCustomUnitDefs(customUnitRows),
    packageRules: routeRows.map((route) => ({
      foodId: route.foodId,
      normalizedItem: route.normalizedItem,
      packageAmount: route.packageAmount,
      packageUnit: route.packageUnit,
      packageLabel: route.packageLabel,
      packageRoundBehavior:
        route.packageRounding == null
          ? ('inherit' as const)
          : route.packageRounding
            ? ('enable' as const)
            : ('disable' as const),
    })),
    packageRounding: preferenceRow?.packageRounding ?? false,
  };

  for (const item of rows) {
    const [rendered] = mergeShoppingItems([shoppingInput(item)], options);
    if (!rendered) continue;
    await tx
      .update(shoppingListItems)
      .set({
        quantity: rendered.quantity,
        quantityMax: rendered.quantityMax,
        unit: rendered.unit,
        requiredBaseQuantity: rendered.requiredBaseQuantity,
        requiredBaseQuantityMax: rendered.requiredBaseQuantityMax,
        requiredBaseUnit: rendered.requiredBaseUnit,
        purchaseQuantity: rendered.purchaseQuantity,
        purchaseUnit: rendered.purchaseUnit,
        packageCount: rendered.packageCount,
        packageAmount: rendered.packageAmount,
        packageUnit: rendered.packageUnit,
        packageLabel: rendered.packageLabel,
        updatedAt: new Date(),
      })
      .where(eq(shoppingListItems.id, item.id));
  }
}

export async function createCustomUnit(input: CustomUnitInput, user: User) {
  try {
    return await db.transaction(async (tx) => {
      const [unit] = await tx
        .insert(customUnits)
        .values({ ...customFields(input), userId: user.id })
        .returning();
      if (!unit) throw new Error('CONFLICT');
      const affected = await canonicalizeMatchingRows(tx, user.id, unit);
      const routesChanged = await canonicalizeMatchingPackageRoutes(tx, user.id, unit);
      const rerender = routesChanged
        ? uniqueRows([...affected, ...(await loadOwnedShoppingRows(tx, user.id))])
        : affected;
      await rerenderRows(tx, user.id, rerender);
      return { id: unit.id };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error('DUPLICATE', { cause: error });
    throw error;
  }
}

export async function updateCustomUnit(id: string, input: CustomUnitInput, user: User) {
  try {
    return await db.transaction(async (tx) => {
      const oldUnit = await requireOwnedCustomUnit(tx, id, user);
      const affected = await canonicalizeMatchingRows(tx, user.id, oldUnit);
      const routesChanged = await canonicalizeMatchingPackageRoutes(tx, user.id, oldUnit);
      const rerender = routesChanged
        ? uniqueRows([...affected, ...(await loadOwnedShoppingRows(tx, user.id))])
        : affected;
      const [row] = await tx
        .update(customUnits)
        .set(customFields(input))
        .where(and(eq(customUnits.id, id), eq(customUnits.userId, user.id)))
        .returning({ id: customUnits.id });
      if (!row) throw new Error('NOT_FOUND');
      await rerenderRows(tx, user.id, rerender);
      return row;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error('DUPLICATE', { cause: error });
    throw error;
  }
}

export async function deleteCustomUnit(id: string, user: User) {
  return db.transaction(async (tx) => {
    const oldUnit = await requireOwnedCustomUnit(tx, id, user);
    const affected = await canonicalizeMatchingRows(tx, user.id, oldUnit);
    const routesChanged = await canonicalizeMatchingPackageRoutes(tx, user.id, oldUnit);
    const rerender = routesChanged
      ? uniqueRows([...affected, ...(await loadOwnedShoppingRows(tx, user.id))])
      : affected;
    const [row] = await tx
      .delete(customUnits)
      .where(and(eq(customUnits.id, id), eq(customUnits.userId, user.id)))
      .returning({ id: customUnits.id });
    if (!row) throw new Error('NOT_FOUND');
    await rerenderRows(tx, user.id, rerender);
    return row;
  });
}
