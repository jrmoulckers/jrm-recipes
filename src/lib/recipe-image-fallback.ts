/**
 * Locally bundled Unsplash photos used under the Unsplash License. Keeping the
 * source photo ids here preserves provenance without adding runtime requests.
 *
 * - photo-1504674900247-0877df9cc836
 * - photo-1498837167922-ddd27525d352
 * - photo-1414235077428-338989a2e8c0
 * - photo-1473093295043-cdd812d0e601
 */
export const RECIPE_FALLBACK_IMAGES = [
  "/img/recipe-fallbacks/shared-table.webp",
  "/img/recipe-fallbacks/kitchen-prep.webp",
  "/img/recipe-fallbacks/plated-supper.webp",
  "/img/recipe-fallbacks/pasta-table.webp",
] as const;

/** Pick a stable fallback so a recipe keeps the same visual identity. */
export function recipeFallbackImage(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return RECIPE_FALLBACK_IMAGES[hash % RECIPE_FALLBACK_IMAGES.length]!;
}
