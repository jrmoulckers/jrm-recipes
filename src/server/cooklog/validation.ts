import { z } from "zod";

/**
 * Validation contract for the "Cooked it" journal. The log dialog (client) and
 * the server actions share these schemas so the shape is guaranteed end to end.
 */

const idInput = z.string().trim().min(1);

/** Max length for a cook-journal note. Imported by the UI counter (#144). */
export const COOK_NOTE_MAX_LENGTH = 2000;
/** Over-limit message — kept in sync with the field counter. */
export const COOK_NOTE_TOO_LONG_MESSAGE =
  "Keep your note under 2,000 characters";

/** A trimmed, optional string that collapses empty input to `undefined`. */
const optionalNote = z
  .string()
  .trim()
  .max(COOK_NOTE_MAX_LENGTH, COOK_NOTE_TOO_LONG_MESSAGE)
  .optional()
  .transform((v) => (v == null || v.length === 0 ? undefined : v));

/** Optional photo URL — empty string becomes `undefined` (photo is optional). */
const optionalPhotoUrl = z
  .string()
  .trim()
  .url()
  .max(2048)
  .optional()
  .or(z.literal("").transform(() => undefined));

/** A nullable, coercible positive integer from a possibly-empty form field. */
const optionalServings = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === "" || v === null) return undefined;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  })
  .pipe(z.number().int().min(1).max(100000).optional());

/**
 * Earliest cook date we accept — guards against epoch/typo dates (e.g. a
 * mis-keyed year) that would otherwise sort a cook to the very bottom.
 */
const COOK_DATE_MIN_MS = Date.UTC(2000, 0, 1);
/** Out-of-range message — kept friendly for the log dialog. */
export const COOK_DATE_OUT_OF_RANGE_MESSAGE =
  "Enter a cook date between 2000 and today";

/**
 * Optional cook date — accepts a Date or parseable string, else `undefined`.
 * Clamped to `[2000-01-01, now]` so a client can't store a cook dated in the
 * future (which would jump to the top of the journal) or absurdly far in the
 * past. `now` is read per-parse via `Date.now()`, not frozen at module load.
 */
const optionalCookedAt = z
  .union([z.string(), z.date()])
  .optional()
  .transform((v) => {
    if (v == null || v === "") return undefined;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  })
  .refine(
    (d) =>
      d === undefined ||
      (d.getTime() >= COOK_DATE_MIN_MS && d.getTime() <= Date.now()),
    { message: COOK_DATE_OUT_OF_RANGE_MESSAGE },
  );

export const logCookInput = z.object({
  recipeId: idInput,
  recipeSlug: idInput,
  note: optionalNote,
  photoUrl: optionalPhotoUrl,
  servingsMade: optionalServings,
  cookedAt: optionalCookedAt,
  /** Share this cook to the recipe's family group activity feed (#352). */
  shareWithFamily: z.boolean().optional(),
});

export const deleteCookLogInput = z.object({
  entryId: idInput,
  recipeSlug: idInput,
});

export type LogCookInput = z.infer<typeof logCookInput>;
/** Raw shape the client dialog sends before server-side coercion. */
export type LogCookFormInput = z.input<typeof logCookInput>;
export type DeleteCookLogInput = z.infer<typeof deleteCookLogInput>;
