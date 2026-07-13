import { getCurrentUser } from "~/server/auth";
import { searchRecipes } from "~/server/recipes/queries";
import { parseRecipeSearch } from "~/server/recipes/search";

// Resolves visibility per-request against the signed-in viewer (a recipe can be
// made private at any time), and reuses the pooled Postgres query, so keep it on
// the Node runtime and never cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Top matches surfaced inline in the ⌘K command palette. */
const PALETTE_LIMIT = 6;

export type CommandRecipeResult = {
  id: string;
  title: string;
  slug: string;
  imageUrl: string | null;
};

/**
 * Lightweight recipe search for the global command palette (issue #74). Returns
 * the top few visible matches for `q`, shaped down to just what the palette
 * renders. Reuses the same querystring contract and ranking as the `/recipes`
 * page via `parseRecipeSearch` + `searchRecipes`, so palette hits and the full
 * results page stay consistent. Visibility is scoped to the viewer, so it never
 * leaks private recipes to signed-out or non-owner users.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length === 0) {
    return Response.json({ items: [] as CommandRecipeResult[] });
  }

  const user = await getCurrentUser();
  const search = parseRecipeSearch({ q });
  const { items } = await searchRecipes(user, search, { limit: PALETTE_LIMIT });

  const results: CommandRecipeResult[] = items.map((recipe) => ({
    id: recipe.id,
    title: recipe.title,
    slug: recipe.slug,
    imageUrl: recipe.coverImageUrl ?? null,
  }));

  return Response.json(
    { items: results },
    { headers: { "cache-control": "no-store" } },
  );
}
