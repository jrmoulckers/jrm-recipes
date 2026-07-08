import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getRecipeForViewer } from "~/server/recipes/loaders";
import { type FullRecipe } from "~/server/recipes/queries";
import { pickNutrition } from "~/lib/nutrition";
import { CookExperience } from "~/components/cook/cook-experience";
import type { CookRecipe } from "~/components/cook/types";

function serializeRecipe(recipe: FullRecipe): CookRecipe {
  return {
    id: recipe.id,
    slug: recipe.slug,
    title: recipe.title,
    description: recipe.description,
    coverImageUrl: recipe.coverImageUrl,
    servings: recipe.servings,
    servingsNoun: recipe.servingsNoun,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    totalMinutes: recipe.totalMinutes,
    notes: recipe.notes,
    householdId: recipe.groupId,
    nutrition: pickNutrition(recipe),
    ingredients: recipe.ingredients.map((ingredient) => ({
      id: ingredient.id,
      position: ingredient.position,
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
      position: step.position,
      section: step.section,
      instruction: step.instruction,
      imageUrl: step.imageUrl,
      videoUrl: step.videoUrl,
      timerSeconds: step.timerSeconds,
      techniques: step.techniques,
    })),
  };
}

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

  return <CookExperience recipe={serializeRecipe(recipe)} />;
}
