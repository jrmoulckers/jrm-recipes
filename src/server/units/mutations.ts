import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "~/server/db";
import { customUnits, userUnitPreferences, type User } from "~/server/db/schema";
import {
  type CustomUnitInput,
  type UnitPreferencesInput,
} from "./validation";

/** Postgres unique-violation code, raised when a custom-unit name repeats. */
const PG_UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error != null &&
    "code" in error &&
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
  };
}

/**
 * Upsert a user's unit preferences. There's at most one row per user (the
 * unique `user_id`), so an insert that collides updates the existing row in
 * place — the settings form always sends the full desired state.
 */
export async function saveUnitPreferences(
  input: UnitPreferencesInput,
  user: User,
) {
  const [row] = await db
    .insert(userUnitPreferences)
    .values({ ...prefFields(input), userId: user.id })
    .onConflictDoUpdate({
      target: userUnitPreferences.userId,
      set: prefFields(input),
    })
    .returning({ id: userUnitPreferences.id });
  if (!row) throw new Error("CONFLICT");
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
async function requireOwnedCustomUnit(id: string, user: User) {
  const unit = await db.query.customUnits.findFirst({
    where: and(eq(customUnits.id, id), eq(customUnits.userId, user.id)),
    columns: { id: true },
  });
  if (!unit) throw new Error("NOT_FOUND");
  return unit;
}

export async function createCustomUnit(input: CustomUnitInput, user: User) {
  try {
    const [row] = await db
      .insert(customUnits)
      .values({ ...customFields(input), userId: user.id })
      .returning({ id: customUnits.id });
    if (!row) throw new Error("CONFLICT");
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error("DUPLICATE");
    throw error;
  }
}

export async function updateCustomUnit(
  id: string,
  input: CustomUnitInput,
  user: User,
) {
  await requireOwnedCustomUnit(id, user);
  try {
    const [row] = await db
      .update(customUnits)
      .set(customFields(input))
      .where(and(eq(customUnits.id, id), eq(customUnits.userId, user.id)))
      .returning({ id: customUnits.id });
    if (!row) throw new Error("NOT_FOUND");
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error("DUPLICATE");
    throw error;
  }
}

export async function deleteCustomUnit(id: string, user: User) {
  const [row] = await db
    .delete(customUnits)
    .where(and(eq(customUnits.id, id), eq(customUnits.userId, user.id)))
    .returning({ id: customUnits.id });
  if (!row) throw new Error("NOT_FOUND");
  return row;
}
