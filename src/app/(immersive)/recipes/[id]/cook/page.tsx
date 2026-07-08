import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getRecipeForViewer } from "~/server/recipes/loaders";
import { toCookRecipe } from "~/server/recipes/serialize";
import { CookExperience } from "~/components/cook/cook-experience";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { recipe } = await getRecipeForViewer(id);
  return { title: recipe ? `Cook · ${recipe.title}` : "Cook mode" };
}

export default async function CookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { recipe } = await getRecipeForViewer(id);
  if (!recipe) notFound();

  return <CookExperience recipe={toCookRecipe(recipe)} />;
}
