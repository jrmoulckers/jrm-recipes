import { z } from "zod";

import { slugify } from "~/lib/utils";
import { DIETARY_TAGS } from "~/lib/substitutions";
import { ALLOWED_MEDIA_HOSTS } from "~/config/media-hosts";

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

const optionalString = (max: number, message?: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .transform((v) => (v == null || v.length === 0 ? undefined : v));

const optionalUrl = z
  .string()
  .trim()
  .url()
  .max(2048)
  .optional()
  .or(z.literal("").transform(() => undefined));

/**
 * Stored recipe media (cover/step image + step video) is rendered on every
 * recipe view, so a URL on an arbitrary host would leak viewers' IPs to
 * attacker-controlled servers (tracking/CSRF beacon, issue #216). Restrict such
 * URLs to the media-host allowlist that also backs `next/image`
 * `remotePatterns`, so what we store and what we render agree.
 *
 * Escape hatch: when Cloudinary isn't configured (the local "paste an image
 * URL" dev flow, where there's no uploader) any valid host is allowed, so the
 * app still runs with zero config. In a Cloudinary-configured deploy the
 * allowlist is enforced.
 */
const cloudinaryConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
);

const MEDIA_HOST_MESSAGE =
  "Upload photos and videos to Heirloom — links to other sites aren't allowed.";

function mediaHostAllowed(url: string): boolean {
  if (!cloudinaryConfigured) return true;
  try {
    return ALLOWED_MEDIA_HOSTS.includes(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

const mediaUrl = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine(mediaHostAllowed, { message: MEDIA_HOST_MESSAGE })
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
  item: z
    .string()
    .trim()
    .min(1, "Add an ingredient")
    .max(300, "Keep each ingredient under 300 characters"),
  note: optionalString(300),
  // Structured prep state, separate from free-text note (#401).
  prep: optionalString(200),
  // Optional link to the step that uses this ingredient, by ordinal (#425).
  stepPosition: optionalNumber.pipe(z.number().int().min(0).max(999).optional()),
  optional: z.boolean().optional().default(false),
});

export const stepInput = z.object({
  section: optionalString(120),
  instruction: z
    .string()
    .trim()
    .min(1, "Add step text")
    .max(5000, "Keep each step under 5,000 characters"),
  imageUrl: mediaUrl,
  videoUrl: mediaUrl,
  timerSeconds: optionalNumber.pipe(z.number().int().min(0).max(86400).optional()),
  // Target internal/doneness temperature in °C + a short doneness cue (#417).
  // Bounds cover freezer (-50) through a very hot oven (400 °C); NULL passes.
  targetTempC: optionalNumber.pipe(
    z.number().int().min(-50).max(400).optional(),
  ),
  doneness: optionalString(200),
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

/** A single structured dietary self-declaration (issue #404). */
export const dietaryTag = z.enum(DIETARY_TAGS);

export const recipeInput = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Give your recipe a title")
      .max(200, "Keep the title under 200 characters"),
    description: optionalString(
      2000,
      "Keep the description under 2,000 characters",
    ),
    coverImageUrl: mediaUrl,
    servings: optionalNumber.pipe(z.number().int().min(1).max(1000).optional()),
    servingsNoun: optionalString(40),
    prepMinutes: optionalNumber.pipe(z.number().int().min(0).max(100000).optional()),
    cookMinutes: optionalNumber.pipe(z.number().int().min(0).max(100000).optional()),
    totalMinutes: optionalNumber.pipe(z.number().int().min(0).max(100000).optional()),
    // Inactive/rest time + make-ahead callout (#409).
    restMinutes: optionalNumber.pipe(z.number().int().min(0).max(100000).optional()),
    makeAheadNote: optionalString(500),
    difficulty: recipeDifficulty.optional(),
    cuisine: optionalString(80),
    sourceName: optionalString(200),
    sourceUrl: optionalUrl,
    notes: optionalString(4000, "Keep notes under 4,000 characters"),
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
    // Required tools/equipment (#410); deduped, trimmed, order-preserving.
    equipment: z
      .array(z.string().trim().min(1).max(120))
      .max(50)
      .default([])
      .transform((items) => [...new Set(items)]),
    // Structured dietary self-declaration (issue #404), aligned to the
    // canonical DietaryTag set. Deduped; order-insensitive.
    dietaryFlags: z
      .array(dietaryTag)
      .max(DIETARY_TAGS.length)
      .default([])
      .transform((tags) => [...new Set(tags)]),
  })
  .superRefine((val, ctx) => {
    // "Group" visibility only makes sense with a group; without one the recipe
    // is hidden from everyone but its author. Require a group so the form
    // surfaces a clear error instead of silently orphaning the recipe.
    if (val.visibility === "group" && !val.groupId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["groupId"],
        message: "Choose a group for this group recipe",
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
