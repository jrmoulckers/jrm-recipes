import { z } from "zod";

import { getUnitInfo, type Dimension } from "~/lib/units";

/**
 * Validation contract for a user's unit preferences and custom units
 * (interchangeable units). Shared by the settings UI and the server actions so
 * the shape is guaranteed end to end. Unit strings are validated against the
 * built-in catalog in `src/lib/units.ts`. Per-dimension overrides may also name
 * a user's custom unit (any non-empty ≤40-char string that isn't a built-in of
 * the wrong dimension).
 */

export const MEASUREMENT_SYSTEMS = ["us", "metric"] as const;
export type MeasurementSystemValue = (typeof MEASUREMENT_SYSTEMS)[number];

/** Dimensions a user can define a custom unit for (temperature is affine). */
export const CUSTOM_UNIT_DIMENSIONS = ["volume", "mass", "count"] as const;
export type CustomUnitDimension = (typeof CUSTOM_UNIT_DIMENSIONS)[number];

const optionalUnit = z
  .string()
  .trim()
  .max(40)
  .optional()
  .transform((v) => (v == null || v.length === 0 ? undefined : v));

/**
 * A per-dimension override is valid when it's empty, a built-in unit of the
 * expected dimension, or an unknown string (treated as a custom unit name). It's
 * invalid only when it names a built-in unit of the *wrong* dimension (e.g. "g"
 * offered as a volume default).
 */
function overrideMatchesDimension(
  value: string | undefined,
  dimension: Dimension,
): boolean {
  if (!value) return true;
  const info = getUnitInfo(value);
  return info == null || info.dimension === dimension;
}

export const unitPreferencesInput = z
  .object({
    defaultSystem: z.enum(MEASUREMENT_SYSTEMS).default("metric"),
    volumeUnit: optionalUnit,
    liquidVolumeUnit: optionalUnit,
    dryVolumeUnit: optionalUnit,
    smallVolumeUnit: optionalUnit,
    massUnit: optionalUnit,
    temperatureUnit: optionalUnit,
    autoConvert: z.boolean().default(true),
    packageRounding: z.boolean().default(false),
  })
  .superRefine((val, ctx) => {
    for (const key of [
      "volumeUnit",
      "liquidVolumeUnit",
      "dryVolumeUnit",
      "smallVolumeUnit",
    ] as const) {
      if (!overrideMatchesDimension(val[key], "volume")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: "Pick a volume unit.",
        });
      }
    }
    if (!overrideMatchesDimension(val.massUnit, "mass")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["massUnit"],
        message: "Pick a weight unit.",
      });
    }
    // Temperature has no custom units, so an override must be a real temp unit.
    if (val.temperatureUnit) {
      const info = getUnitInfo(val.temperatureUnit);
      if (info?.dimension !== "temperature") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["temperatureUnit"],
          message: "Pick a temperature unit.",
        });
      }
    }
  });

export type UnitPreferencesInput = z.infer<typeof unitPreferencesInput>;
export type UnitPreferencesInputRaw = z.input<typeof unitPreferencesInput>;

const optionalPositive = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === "" || v === null) return undefined;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : NaN;
  })
  .pipe(z.number().positive().max(1_000_000).optional());

export const customUnitInput = z
  .object({
    name: z.string().trim().min(1, "Name your unit").max(40),
    abbreviation: z
      .string()
      .trim()
      .max(20)
      .optional()
      .transform((v) => (v == null || v.length === 0 ? undefined : v)),
    dimension: z.enum(CUSTOM_UNIT_DIMENSIONS),
    baseUnit: optionalUnit,
    baseAmount: optionalPositive,
    displayAsTrue: z.boolean().default(false),
  })
  .superRefine((val, ctx) => {
    const hasUnit = Boolean(val.baseUnit);
    const hasAmount = val.baseAmount != null;
    // An equivalence needs both halves, or neither (a display-only unit).
    if (hasUnit !== hasAmount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: hasUnit ? ["baseAmount"] : ["baseUnit"],
        message: "Add both a unit and an amount, or leave both blank.",
      });
    }
    if (val.baseUnit) {
      const info = getUnitInfo(val.baseUnit);
      if (!info) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["baseUnit"],
          message: "Pick a known unit to convert against.",
        });
      } else if (info.dimension !== val.dimension) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["baseUnit"],
          message: "The equivalent unit must match this unit's type.",
        });
      }
    }
  });

export type CustomUnitInput = z.infer<typeof customUnitInput>;
export type CustomUnitInputRaw = z.input<typeof customUnitInput>;
