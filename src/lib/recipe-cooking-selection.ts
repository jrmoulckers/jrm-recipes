import type { UnitSystem } from './cook-state';

export type RecipeCookingSelection = {
  servings?: number;
  system?: UnitSystem;
};

const storageKey = (recipeId: string) => `heirloom:recipe-cooking-selection:${recipeId}`;

export function readRecipeCookingSelection(recipeId: string): RecipeCookingSelection {
  try {
    const raw = window.sessionStorage.getItem(storageKey(recipeId));
    if (!raw) return {};
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') throw new Error('Invalid cooking selection');
    const selection: RecipeCookingSelection = {};
    if ('servings' in value) {
      if (
        typeof value.servings !== 'number' ||
        !Number.isFinite(value.servings) ||
        value.servings < 1 ||
        value.servings > 1000
      ) {
        throw new Error('Invalid selected servings');
      }
      selection.servings = value.servings;
    }
    if ('system' in value) {
      if (
        value.system !== 'original' &&
        value.system !== 'us' &&
        value.system !== 'metric' &&
        value.system !== 'grams'
      ) {
        throw new Error('Invalid selected measurement mode');
      }
      selection.system = value.system;
    }
    return selection;
  } catch (error) {
    console.warn('Unable to read recipe cooking selection', error);
    return {};
  }
}

export function saveRecipeCookingSelection(
  recipeId: string,
  selection: RecipeCookingSelection,
): void {
  try {
    window.sessionStorage.setItem(
      storageKey(recipeId),
      JSON.stringify({ ...readRecipeCookingSelection(recipeId), ...selection }),
    );
  } catch (error) {
    console.warn('Unable to save recipe cooking selection', error);
  }
}
