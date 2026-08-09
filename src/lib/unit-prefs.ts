/**
 * Pure adapters from the persisted `user_unit_preferences` / `custom_units`
 * rows to the plain shapes the conversion library ({@link ./units}) consumes.
 * Kept dependency-free so both server components and client components can map
 * without pulling in Drizzle or `server-only`.
 */

import {
  DEFAULT_UNIT_PREFS,
  defaultSystemForLocale,
  type CustomUnitDef,
  type Dimension,
  type UnitPrefs,
} from "./units";

/** The subset of a `user_unit_preferences` row display needs. */
export type UnitPreferencesRow = {
  defaultSystem: "us" | "metric";
  volumeUnit: string | null;
  liquidVolumeUnit: string | null;
  dryVolumeUnit: string | null;
  smallVolumeUnit: string | null;
  massUnit: string | null;
  temperatureUnit: string | null;
  autoConvert: boolean;
  packageRounding?: boolean;
};

/** The subset of a `custom_units` row conversion needs. */
export type CustomUnitRow = {
  name: string;
  dimension: Dimension;
  baseUnit: string | null;
  baseAmount: number | null;
  abbreviation: string | null;
  displayAsTrue: boolean;
};

/**
 * Resolve the effective {@link UnitPrefs} for a viewer. A saved row wins. With
 * no row we default to auto-converting into the locale's likely system so a
 * brand-new user still sees friendly units, then they can refine per dimension.
 */
export function toUnitPrefs(
  row: UnitPreferencesRow | null | undefined,
  locale?: string,
): UnitPrefs {
  if (!row) {
    return {
      ...DEFAULT_UNIT_PREFS,
      defaultSystem: locale
        ? defaultSystemForLocale(locale)
        : DEFAULT_UNIT_PREFS.defaultSystem,
    };
  }
  return {
    defaultSystem: row.defaultSystem,
    volumeUnit: row.volumeUnit,
    liquidVolumeUnit: row.liquidVolumeUnit,
    dryVolumeUnit: row.dryVolumeUnit,
    smallVolumeUnit: row.smallVolumeUnit,
    massUnit: row.massUnit,
    temperatureUnit: row.temperatureUnit,
    autoConvert: row.autoConvert,
  };
}

/** Map persisted custom-unit rows to the conversion library's def shape. */
export function toCustomUnitDefs(
  rows: readonly CustomUnitRow[] | null | undefined,
): CustomUnitDef[] {
  if (!rows) return [];
  return rows.map((r) => ({
    name: r.name,
    dimension: r.dimension,
    baseUnit: r.baseUnit,
    baseAmount: r.baseAmount,
    abbreviation: r.abbreviation,
    displayAsTrue: r.displayAsTrue,
  }));
}
