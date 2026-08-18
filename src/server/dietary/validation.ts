import { z } from 'zod';

import { ALLERGENS } from '~/lib/allergens';
import type { NutritionKey } from '~/lib/nutrients';
import { isIsoDate, sanitizeTargets, TARGET_NUTRIENTS, todayIso } from '~/lib/nutrition-targets';
import { DIETARY_TAGS } from '~/lib/substitutions';

/**
 * Validation contract for per-family-member dietary profiles (issue #396).
 * Shared by the settings UI and the server actions so the shape is guaranteed
 * end to end. Allergen and diet values reuse the shared unions so a profile can
 * never drift from `src/lib/allergens.ts` or the substitutions `DietaryTag`.
 */

const dedupe = <T>(values: T[]): T[] => [...new Set(values)];

export const memberProfileInput = z.object({
  name: z.string().trim().min(1, 'Add a name').max(80),
  allergens: z.array(z.enum(ALLERGENS)).max(ALLERGENS.length).default([]).transform(dedupe),
  diets: z.array(z.enum(DIETARY_TAGS)).max(DIETARY_TAGS.length).default([]).transform(dedupe),
  // A sensible daily-energy range: high enough for athletes, low enough to
  // reject typos. Optional. Many members won't track calories.
  calorieGoal: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === '' || v === null) return undefined;
      const n = typeof v === 'number' ? v : Number(v);
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
/** Pre-transform shape accepted by the schema. What the client/UI sends. */
export type MemberProfileInputRaw = z.input<typeof memberProfileInput>;

/**
 * Macro targets (issue #1046).
 *
 * Each field is optional and accepts the empty string the form sends for "no
 * target", so clearing one nutrient is expressible without clearing the rest.
 * Bounds come from {@link TARGET_NUTRIENTS}, which is projected from the
 * nutrient registry — adding a nutrient there makes it targetable and bounded
 * here without touching this file.
 *
 * Values are rounded to the nutrient's display precision on the way in, so a
 * stored target reads back exactly as it was typed.
 */
const targetValue = (max: number, decimals: number) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === null) return undefined;
      // `Number('   ')` is 0, so an untrimmed blank would land as a real target
      // of zero rather than as "no target set".
      const raw = typeof v === 'number' ? v : v.trim();
      if (raw === '') return undefined;
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n)) return NaN;
      return Number(n.toFixed(decimals));
    })
    .pipe(z.number().min(0).max(max).optional());

type TargetsShape = {
  [K in NutritionKey]: ReturnType<typeof targetValue>;
};

const targetsShape = Object.fromEntries(
  TARGET_NUTRIENTS.map((n) => [n.key, targetValue(n.max, n.decimals)]),
) as TargetsShape;

export const nutritionTargetInput = z.object({
  profileId: z.string().trim().min(1).max(24),
  // A plain calendar date. Rejecting `2025-02-31` here keeps an impossible
  // effective date out of a column whose ordering decides which target scores a
  // past week.
  effectiveFrom: z
    .string()
    .trim()
    .refine(isIsoDate, 'Choose a real date')
    .default(() => todayIso()),
  targets: z.object(targetsShape).transform((values) => sanitizeTargets(values)),
});

export type NutritionTargetInput = z.infer<typeof nutritionTargetInput>;
/** Pre-transform shape accepted by the schema. What the client/UI sends. */
export type NutritionTargetInputRaw = z.input<typeof nutritionTargetInput>;
