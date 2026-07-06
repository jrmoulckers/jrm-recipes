import { z } from "zod";

/**
 * Validation contracts for favorites & collections. Shared by the client UI and
 * the server actions so the shape is guaranteed end to end.
 */

const idInput = z.string().trim().min(1);

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

export const collectionInput = z.object({
  name: z.string().trim().min(1, "Name your collection").max(120),
  description: optionalString(500),
  coverImageUrl: optionalUrl,
});

export const toggleFavoriteInput = z.object({
  recipeId: idInput,
  /** Slug of the page the toggle happened on, so we can revalidate it. */
  recipeSlug: idInput.optional(),
});

export const collectionRecipeInput = z.object({
  collectionId: idInput,
  recipeId: idInput,
});

export type CollectionInput = z.infer<typeof collectionInput>;
export type ToggleFavoriteInput = z.infer<typeof toggleFavoriteInput>;
export type CollectionRecipeInput = z.infer<typeof collectionRecipeInput>;
