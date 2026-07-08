import { type Metadata } from "next";
import { notFound } from "next/navigation";

import { getRecipeForViewer } from "~/server/recipes/loaders";
import { toPrintRecipe } from "~/server/recipes/serialize";
import { PrintView } from "~/components/print/print-view";
import { parseRecipeParams, type RecipeRouteParams } from "~/lib/route-params";

export async function generateMetadata({
  params,
}: {
  params: Promise<RecipeRouteParams>;
}): Promise<Metadata> {
  const { id } = await parseRecipeParams(params);
  const { recipe } = await getRecipeForViewer(id);
  return { title: recipe ? `Print · ${recipe.title}` : "Print recipe" };
}

export default async function PrintPage({
  params,
}: {
  params: Promise<RecipeRouteParams>;
}) {
  const { id } = await parseRecipeParams(params);
  const { recipe } = await getRecipeForViewer(id);
  if (!recipe) notFound();

  return <PrintView recipe={toPrintRecipe(recipe)} />;
}
