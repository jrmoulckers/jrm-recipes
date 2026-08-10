import { ImageResponse } from "next/og";

import { getRecipe } from "~/server/recipes/queries";
import { resolveNamespacedRecipe } from "~/server/recipes/resolve";
import { RecipeCard, SIZE, ALT, type CardData } from "../../_assets/card";
import { loadFonts, mapRecipeToCard } from "../../_assets/og";

// Uses the Node runtime so it can reuse the pooled Postgres query and embed
// the cover image via Buffer. Rendered on demand (never at build time).
export const runtime = "nodejs";

export const alt = ALT;
export const size = SIZE;
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ cook: string; recipe: string }>;
}) {
  const { cook, recipe: recipeSegment } = await params;

  // Null viewer => only public / unlisted recipes resolve. Private and
  // group-only recipes fall through to a neutral brand card, so an
  // unauthenticated crawler can never surface their details.
  let data: CardData | null = null;
  try {
    const resolved = await resolveNamespacedRecipe(cook, recipeSegment);
    const recipe = resolved ? await getRecipe(resolved.recipeId, null) : null;
    if (recipe) data = await mapRecipeToCard(recipe);
  } catch {
    data = null;
  }

  const fonts = loadFonts();

  return new ImageResponse(<RecipeCard data={data} />, { ...size, fonts });
}
