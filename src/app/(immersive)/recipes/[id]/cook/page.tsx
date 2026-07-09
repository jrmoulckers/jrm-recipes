import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getRecipeForViewer } from "~/server/recipes/loaders";
import { toCookRecipe } from "~/server/recipes/serialize";
import { CookExperience } from "~/components/cook/cook-experience";
import { parseRecipeParams, type RecipeRouteParams } from "~/lib/route-params";

export async function generateMetadata({
  params,
}: {
  params: Promise<RecipeRouteParams>;
}): Promise<Metadata> {
  const { id } = await parseRecipeParams(params);
  const { recipe } = await getRecipeForViewer(id);
  return { title: recipe ? `Cook · ${recipe.title}` : "Cook mode" };
}

export default async function CookPage({
  params,
}: {
  params: Promise<RecipeRouteParams>;
}) {
  const { id } = await parseRecipeParams(params);
  const { user, recipe } = await getRecipeForViewer(id);
  if (!recipe) notFound();

  return (
    <CookExperience
      recipe={toCookRecipe(recipe)}
      feedback={{
        canRate: Boolean(user),
        isOwner: user?.id === recipe.authorId,
      }}
    />
  );
}
