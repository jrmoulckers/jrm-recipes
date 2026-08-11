/**
 * The surfaces a media asset can still be referenced from (issue #658).
 *
 * Shared by `queries.ts` (which counts them) and the settings grid (which names
 * them in the delete confirm dialog), so the two can never drift. Kept in its
 * own module — like `validation.ts` — because `queries.ts` is `server-only` and
 * importing it from a client component would pull that marker into the browser
 * bundle.
 */
export const ASSET_USAGE_SURFACES = [
  'recipes',
  'steps',
  'collections',
  'groups',
  'cookLog',
  'reviews',
] as const;

export type AssetUsageSurface = (typeof ASSET_USAGE_SURFACES)[number];

export type AssetUsage = {
  /** Total live references across every surface the caller can see. */
  total: number;
  /** Per-surface counts, so the dialog can name what it found. */
  bySurface: Record<AssetUsageSurface, number>;
};
