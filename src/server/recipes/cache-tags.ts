/**
 * Typed cache tags for recipe read models (#160).
 *
 * Single source of truth for the Next data-cache tag strings shared between the
 * query layer (`unstable_cache`'s `tags`) and the mutation actions
 * (`revalidateTag`). Tagging lets a write invalidate exactly the affected
 * surfaces — the recipe entity plus the public list feed — instead of scattering
 * coarse, easy-to-forget `revalidatePath` strings that can't target an entity.
 *
 * Dependency-light and intentionally NOT `server-only`, so both the
 * `server-only` query layer and the `"use server"` actions can import the same
 * strings without pulling one into the other (mirrors `./cache`).
 */

/** Tag applied to every cached public recipe list entry (discover + library). */
export const PUBLIC_RECIPES_TAG = "recipes:public";

/** Everything cached about a single recipe entity. */
export function recipeTag(id: string): `recipe:${string}` {
  return `recipe:${id}`;
}

/**
 * Tags to invalidate after a recipe create / update / delete / fork / revert /
 * restore: the recipe entity itself plus the public list feed that may include
 * it. Actions call this instead of hand-listing tags so the set stays in one
 * place.
 */
export function recipeMutationTags(id: string): string[] {
  return [recipeTag(id), PUBLIC_RECIPES_TAG];
}
