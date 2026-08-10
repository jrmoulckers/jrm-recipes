import { type Metadata } from "next";
import { notFound } from "next/navigation";

import { getNamespacedRecipeForViewer } from "~/server/recipes/loaders";
import { toPrintRecipe } from "~/server/recipes/serialize";
import { KeepsakeView } from "~/components/recipe/keepsake-view";
import { parseKeepsakeMessage } from "~/lib/keepsake";
import { parseRecipeParams, type RecipeRouteParams } from "~/lib/route-params";

type KeepsakeSearchParams = {
  from?: string | string[];
  note?: string | string[];
  t?: string | string[];
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<RecipeRouteParams>;
  searchParams: Promise<KeepsakeSearchParams>;
}): Promise<Metadata> {
  const { cook, recipe: recipeSegment } = await parseRecipeParams(params);
  const token = firstParam((await searchParams).t);
  const { recipe } = await getNamespacedRecipeForViewer(
    cook,
    recipeSegment,
    token,
  );
  return {
    title: recipe ? `A keepsake · ${recipe.title}` : "A keepsake recipe",
    // Personal keepsakes are private gifts, not content to index.
    robots: { index: false, follow: false },
  };
}

/**
 * Keepsake "hand-down" view (issue #407). Access is delegated entirely to
 * {@link getNamespacedRecipeForViewer}, so the recipe's normal visibility rules (public /
 * group / owner / unlisted-by-token via `t`) are enforced here exactly as on the
 * recipe page. A private recipe can never leak through a keepsake link. The
 * personal note + sender are read straight from the URL.
 */
export default async function KeepsakePage({
  params,
  searchParams,
}: {
  params: Promise<RecipeRouteParams>;
  searchParams: Promise<KeepsakeSearchParams>;
}) {
  const { cook, recipe: recipeSegment } = await parseRecipeParams(params);
  const sp = await searchParams;
  const token = firstParam(sp.t);
  const { recipe } = await getNamespacedRecipeForViewer(
    cook,
    recipeSegment,
    token,
  );
  if (!recipe) notFound();

  const { from, note } = parseKeepsakeMessage({ from: sp.from, note: sp.note });

  return (
    <KeepsakeView recipe={toPrintRecipe(recipe)} from={from} note={note} />
  );
}
