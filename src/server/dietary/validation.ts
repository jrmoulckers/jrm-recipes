import { z } from "zod";

import { ALLERGENS } from "~/lib/allergens";
import { DIETARY_TAGS } from "~/lib/substitutions";

/**
 * Validation contract for per-family-member dietary profiles (issue #396).
 * Shared by the settings UI and the server actions so the shape is guaranteed
 * end to end. Allergen and diet values reuse the shared unions so a profile can
 * never drift from `src/lib/allergens.ts` or the substitutions `DietaryTag`.
 */

const dedupe = <T>(values: T[]): T[] => [...new Set(values)];

export const memberProfileInput = z.object({
  name: z.string().trim().min(1, "Add a name").max(80),
  allergens: z
    .array(z.enum(ALLERGENS))
    .max(ALLERGENS.length)
    .default([])
    .transform(dedupe),
  diets: z
    .array(z.enum(DIETARY_TAGS))
    .max(DIETARY_TAGS.length)
    .default([])
    .transform(dedupe),
  // A sensible daily-energy range: high enough for athletes, low enough to
  // reject typos. Optional — many members won't track calories.
  calorieGoal: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === "" || v === null) return undefined;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : NaN;
    })
    .pipe(z.number().int().min(0).max(20000).optional()),
  groupId: z
    .string()
    .trim()
    .max(24)
    .optional()
    .transform((v) => (v == null || v.length === 0 ? undefined : v)),
});

export type MemberProfileInput = z.infer<typeof memberProfileInput>;
/** Pre-transform shape accepted by the schema — what the client/UI sends. */
export type MemberProfileInputRaw = z.input<typeof memberProfileInput>;
