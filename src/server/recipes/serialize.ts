import { pickNutrition } from "~/lib/nutrition";
import type { FullRecipe } from "~/server/recipes/queries";
import type { CookRecipe } from "~/components/cook/types";
import type { PrintRecipe } from "~/components/print/types";

/**
 * `FullRecipe` → client DTO serialization for the immersive surfaces (#203).
 *
 * Cook Mode and Print each hand-mapped the server `FullRecipe` onto their own
 * client-safe DTO inside the page file, so the two maps drifted and a new
 * recipe field had to be added in several places. These mappers are now the
 * single place that mapping happens; each surface's DTO type stays co-located
 * with its component. Only serializable, client-needed fields cross the
 * boundary — no server-only fields leak.
 *
 * `FullRecipe` is imported as a type only, so this stays a client-safe pure
 * module (mirroring `src/lib/reel/scenes.ts`).
 */

/** Map an authorized recipe onto the Cook Mode DTO. */
export function toCookRecipe(recipe: FullRecipe): CookRecipe {
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
    restMinutes: recipe.restMinutes,
    makeAheadNote: recipe.makeAheadNote,
    equipment: recipe.equipment,
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
      prep: ingredient.prep,
      stepPosition: ingredient.stepPosition,
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
      targetTempC: step.targetTempC,
      doneness: step.doneness,
      techniques: step.techniques,
    })),
  };
}

/** Map an authorized recipe onto the Print DTO. */
export function toPrintRecipe(recipe: FullRecipe): PrintRecipe {
  return {
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
}
