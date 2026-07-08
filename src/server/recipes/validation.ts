import { z } from "zod";

import { slugify } from "~/lib/utils";

/**
 * Validation contract for recipe input. The editor (client) and the server
 * actions both use these schemas so the shape is guaranteed end to end.
 *
 * These numeric bounds are mirrored by DB-level CHECK constraints (migration
 * 0010) so the same invariants hold for writes that bypass this path (seed,
 * imports, admin/raw SQL): servings >= 1; prep/cook/total minutes >= 0;
 * timerSeconds >= 0; ingredient quantity/quantityMax >= 0 with quantityMax >=
 * quantity. Keep the two in sync — loosening a bound here without updating the
 * constraint (or vice versa) will surface as a DB write error. The 1–5 rating
 * bound lives in src/server/engagement/validation.ts (`ratingInput`).
 */

const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v == null || v.length === 0 ? undefined : v));

const optionalUrl = z
  .string()
  .trim()
  .url()
  .max(2048)
  .optional()
  .or(z.literal("").transform(() => undefined));

/** A nullable, coercible non-negative number from a possibly-empty form field. */
const optionalNumber = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === "" || v === null) return undefined;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  });

export const ingredientInput = z.object({
  section: optionalString(120),
  quantity: optionalNumber.pipe(z.number().min(0).max(100000).optional()),
  quantityMax: optionalNumber.pipe(z.number().min(0).max(100000).optional()),
  unit: optionalString(40),
  item: z.string().trim().min(1, "Ingredient is required").max(300),
  note: optionalString(300),
  optional: z.boolean().optional().default(false),
});

export const stepInput = z.object({
  section: optionalString(120),
  instruction: z.string().trim().min(1, "Step text is required").max(5000),
  imageUrl: optionalUrl,
  videoUrl: optionalUrl,
  timerSeconds: optionalNumber.pipe(z.number().int().min(0).max(86400).optional()),
  techniques: z.array(z.string().trim().min(1).max(80)).optional().default([]),
});

export const recipeVisibility = z.enum([
  "private",
  "group",
  "unlisted",
  "public",
]);
export const recipeStatus = z.enum(["draft", "published"]);
export const recipeDifficulty = z.enum(["easy", "medium", "hard"]);

export const recipeInput = z
  .object({
    title: z.string().trim().min(1, "Give your recipe a title").max(200),
    description: optionalString(2000),
    coverImageUrl: optionalUrl,
    servings: optionalNumber.pipe(z.number().int().min(1).max(1000).optional()),
    servingsNoun: optionalString(40),
    prepMinutes: optionalNumber.pipe(z.number().int().min(0).max(100000).optional()),
    cookMinutes: optionalNumber.pipe(z.number().int().min(0).max(100000).optional()),
    totalMinutes: optionalNumber.pipe(z.number().int().min(0).max(100000).optional()),
    difficulty: recipeDifficulty.optional(),
    cuisine: optionalString(80),
    sourceName: optionalString(200),
    sourceUrl: optionalUrl,
    notes: optionalString(4000),
    // Optional per-serving nutrition (issue #414). Non-negative; energy (kcal)
    // and sodium (mg) are whole numbers, macronutrients are grams and may be
    // fractional. These bounds are mirrored by CHECK constraints on `recipes`.
    calories: optionalNumber.pipe(z.number().int().min(0).max(100000).optional()),
    proteinGrams: optionalNumber.pipe(z.number().min(0).max(100000).optional()),
    carbsGrams: optionalNumber.pipe(z.number().min(0).max(100000).optional()),
    fatGrams: optionalNumber.pipe(z.number().min(0).max(100000).optional()),
    saturatedFatGrams: optionalNumber.pipe(
      z.number().min(0).max(100000).optional(),
    ),
    sodiumMg: optionalNumber.pipe(z.number().int().min(0).max(1000000).optional()),
    sugarGrams: optionalNumber.pipe(z.number().min(0).max(100000).optional()),
    fiberGrams: optionalNumber.pipe(z.number().min(0).max(100000).optional()),
    visibility: recipeVisibility.default("private"),
    status: recipeStatus.default("draft"),
    groupId: optionalString(24),
    ingredients: z.array(ingredientInput).max(200).default([]),
    steps: z.array(stepInput).max(200).default([]),
    tags: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  })
  .superRefine((val, ctx) => {
    // "Group" visibility only makes sense with a group; without one the recipe
    // is hidden from everyone but its author. Require a group so the form
    // surfaces a clear error instead of silently orphaning the recipe.
    if (val.visibility === "group" && !val.groupId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["groupId"],
        message: "Choose a group for a group-visibility recipe",
      });
    }
  });

export type RecipeInput = z.infer<typeof recipeInput>;
export type IngredientInput = z.infer<typeof ingredientInput>;
export type StepInput = z.infer<typeof stepInput>;

/** Build a URL-friendly slug from a title (uniqueness handled at write time). */
export function recipeSlug(title: string): string {
  const base = slugify(title).slice(0, 80);
  return base || "recipe";
}
