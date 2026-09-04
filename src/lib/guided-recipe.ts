import type { RecipeInput } from '~/server/recipes/validation';

export const GUIDED_RECIPE_STEP_COUNT = 5;

export type GuidedRecipeDraft = {
  currentStep: number;
  title: string;
  ingredients: string[];
  steps: string[];
  handedDownFrom: string;
  story: string;
};

export function emptyGuidedRecipeDraft(): GuidedRecipeDraft {
  return {
    currentStep: 0,
    title: '',
    ingredients: [''],
    steps: [''],
    handedDownFrom: '',
    story: '',
  };
}

export function toGuidedRecipeInput(draft: GuidedRecipeDraft): RecipeInput {
  return {
    title: draft.title.trim(),
    handedDownFrom: draft.handedDownFrom.trim() || undefined,
    story: draft.story.trim() || undefined,
    visibility: 'private',
    status: 'published',
    ingredients: draft.ingredients
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => ({ item, optional: false })),
    steps: draft.steps
      .map((instruction) => instruction.trim())
      .filter(Boolean)
      .map((instruction) => ({ instruction, techniques: [] })),
    tags: [],
    cuisines: [],
    mealTypes: [],
    equipment: [],
    dietaryFlags: [],
  };
}
