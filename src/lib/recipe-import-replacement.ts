import type { ImportedRecipe } from '~/server/recipes/import';

type ExistingIngredient = {
  section: string;
  quantity: string;
  quantityMax: string;
  unit: string;
  item: string;
  note: string;
  prep: string;
  stepPosition: string;
  optional: boolean;
};

type ExistingStep = {
  section: string;
  title: string;
  instruction: string;
  imageUrl: string;
  imageAlt: string;
  videoUrl: string;
  captionUrl: string;
  captionLanguage: string;
  timerMinutes: string;
  targetTempC: string;
  doneness: string;
  techniques: string;
};

function hasText(values: string[]): boolean {
  return values.some((value) => value.trim().length > 0);
}

export function scannedRecipeWouldReplaceRows(
  incoming: Pick<ImportedRecipe, 'ingredients' | 'steps'>,
  ingredients: ExistingIngredient[],
  steps: ExistingStep[],
): boolean {
  const replacesIngredients =
    incoming.ingredients.length > 0 &&
    ingredients.some(
      (ingredient) =>
        ingredient.optional ||
        hasText([
          ingredient.section,
          ingredient.quantity,
          ingredient.quantityMax,
          ingredient.unit,
          ingredient.item,
          ingredient.note,
          ingredient.prep,
          ingredient.stepPosition,
        ]),
    );
  const replacesSteps =
    incoming.steps.length > 0 &&
    steps.some((step) =>
      hasText([
        step.section,
        step.title,
        step.instruction,
        step.imageUrl,
        step.imageAlt,
        step.videoUrl,
        step.captionUrl,
        step.captionLanguage,
        step.timerMinutes,
        step.targetTempC,
        step.doneness,
        step.techniques,
      ]),
    );

  return replacesIngredients || replacesSteps;
}
