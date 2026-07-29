import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgEnum,
  pgTable,
  real,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

import { fk, pk, timestamps } from "./_shared";
import { users } from "./users";

/**
 * The measurement systems a user can batch-default to. Mirrors the `System`
 * split in src/lib/units.ts (`"us" | "metric"`); a user's per-dimension
 * overrides (below) refine this coarse default one dimension at a time.
 */
export const measurementSystem = pgEnum("measurement_system", ["us", "metric"]);

/**
 * The physical dimensions a unit can measure. Mirrors the `Dimension` type in
 * src/lib/units.ts. Custom units are restricted (in validation) to
 * volume/mass/count — temperature is affine and not user-definable.
 */
export const unitDimension = pgEnum("unit_dimension", [
  "volume",
  "mass",
  "count",
  "temperature",
]);

/**
 * Per-user unit preferences (one row per user). Drives display-time
 * auto-conversion: a viewer sees a recipe's amounts re-expressed in the units
 * they've chosen, while the recipe keeps the author's original amount+unit
 * (the source of truth). `defaultSystem` is the batch default ("make everything
 * metric"); the nullable per-dimension columns override it one dimension at a
 * time (e.g. keep everything metric but show volumes in `cup`). A NULL override
 * means "follow `defaultSystem` for this dimension". `autoConvert` lets a user
 * turn the whole behavior off and always see the author's original units.
 */
export const userUnitPreferences = pgTable(
  "user_unit_preferences",
  {
    id: pk(),
    userId: fk()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    defaultSystem: measurementSystem().notNull().default("metric"),
    // Canonical unit ids (from src/lib/units.ts UNIT_DEFS), or a user's custom
    // unit name. NULL = follow `defaultSystem` for that dimension. Validation
    // guarantees each references a real unit of the matching dimension.
    volumeUnit: varchar({ length: 40 }),
    massUnit: varchar({ length: 40 }),
    temperatureUnit: varchar({ length: 40 }),
    autoConvert: boolean().notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    // One preferences row per user; the unique constraint also backs the lookup.
    unique("user_unit_preferences_user_uq").on(t.userId),
  ],
);

/**
 * User-defined custom units (issue: interchangeable units). A cook can add a
 * unit their family uses — a "pinch", a "knob", a "splash" — and optionally tie
 * it to a real amount for conversion (a pinch = 1/16 tsp). `baseUnit` is the
 * canonical unit the equivalence is expressed in and `baseAmount` is how much of
 * it equals ONE custom unit (1/16 tsp → baseUnit "tsp", baseAmount 0.0625). When
 * `baseAmount` is NULL the unit is display-only (no conversion). `displayAsTrue`
 * flips whether the recipe view shows the custom unit ("1 pinch") or the true
 * converted amount ("1/16 tsp"). `dimension` matches `baseUnit`'s dimension so
 * conversions stay type-safe.
 */
export const customUnits = pgTable(
  "custom_units",
  {
    id: pk(),
    userId: fk()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar({ length: 40 }).notNull(),
    abbreviation: varchar({ length: 20 }),
    dimension: unitDimension().notNull(),
    // Canonical unit id the equivalence is measured in (e.g. "tsp", "g").
    baseUnit: varchar({ length: 40 }),
    // How much of `baseUnit` equals one of this custom unit. NULL = no
    // conversion (display-only unit). Must be > 0 when present.
    baseAmount: real(),
    displayAsTrue: boolean().notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    index("custom_units_user_idx").on(t.userId),
    // A user can't define the same-named unit twice. Case handling is done in
    // the app layer (names are stored trimmed); the constraint stops exact dups.
    unique("custom_units_user_name_uq").on(t.userId, t.name),
    // A conversion factor, when present, is strictly positive. NULL passes by
    // SQL semantics (a display-only unit with no equivalence).
    check(
      "custom_units_base_amount_check",
      sql`${t.baseAmount} is null or ${t.baseAmount} > 0`,
    ),
    // If there's an amount there must be a base unit to measure it in, and vice
    // versa — the two are meaningful only together.
    check(
      "custom_units_base_pair_check",
      sql`(${t.baseUnit} is null and ${t.baseAmount} is null) or (${t.baseUnit} is not null and ${t.baseAmount} is not null)`,
    ),
  ],
);

export const userUnitPreferencesRelations = relations(
  userUnitPreferences,
  ({ one }) => ({
    user: one(users, {
      fields: [userUnitPreferences.userId],
      references: [users.id],
    }),
  }),
);

export const customUnitsRelations = relations(customUnits, ({ one }) => ({
  user: one(users, {
    fields: [customUnits.userId],
    references: [users.id],
  }),
}));

export type UserUnitPreferences = typeof userUnitPreferences.$inferSelect;
export type NewUserUnitPreferences = typeof userUnitPreferences.$inferInsert;
export type CustomUnit = typeof customUnits.$inferSelect;
export type NewCustomUnit = typeof customUnits.$inferInsert;
export type MeasurementSystem = (typeof measurementSystem.enumValues)[number];
export type UnitDimensionValue = (typeof unitDimension.enumValues)[number];
