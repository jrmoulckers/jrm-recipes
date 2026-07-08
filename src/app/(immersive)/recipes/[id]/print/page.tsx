import { cache } from "react";
import { type Metadata } from "next";
import { notFound } from "next/navigation";

import { getCurrentUser } from "~/server/auth";
import { getRecipe } from "~/server/recipes/queries";
import { PrintView } from "~/components/print/print-view";
import type { PrintRecipe } from "~/components/print/types";

const load = cache(async (idOrSlug: string) => {
  const user = await getCurrentUser();
  return getRecipe(idOrSlug, user);
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const recipe = await load(id);
  return { title: recipe ? `Print · ${recipe.title}` : "Print recipe" };
}

export default async function PrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recipe = await load(id);
  if (!recipe) notFound();

  const serializableRecipe: PrintRecipe = {
    id: recipe.id,
    slug: recipe.slug,
    title: recipe.title,
    description: recipe.description,
    coverImageUrl: recipe.coverImageUrl,
    visibility: recipe.visibility,
    servings: recipe.servings,
    servingsNoun: recipe.servingsNoun,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    totalMinutes: recipe.totalMinutes,
    difficulty: recipe.difficulty,
    cuisine: recipe.cuisine,
    sourceName: recipe.sourceName,
    sourceUrl: recipe.sourceUrl,
    notes: recipe.notes,
    author: recipe.author ? { name: recipe.author.name } : null,
    ingredients: recipe.ingredients.map((ingredient) => ({
      id: ingredient.id,
      section: ingredient.section,
      quantity: ingredient.quantity,
      quantityMax: ingredient.quantityMax,
      unit: ingredient.unit,
      item: ingredient.item,
      note: ingredient.note,
      optional: ingredient.optional,
    })),
    steps: recipe.steps.map((step) => ({
      id: step.id,
      section: step.section,
      instruction: step.instruction,
      timerSeconds: step.timerSeconds,
      techniques: step.techniques,
    })),
    tags: recipe.tags.map(({ tag }) => ({
      tag: {
        name: tag.name,
      },
    })),
  };

  return <PrintView recipe={serializableRecipe} />;
}
