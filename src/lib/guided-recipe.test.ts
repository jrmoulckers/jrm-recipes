import { describe, expect, it } from 'vitest';

import { emptyGuidedRecipeDraft, toGuidedRecipeInput } from './guided-recipe';

describe('guided recipe mapping (#398)', () => {
  it('maps the focused guided fields into the existing recipe input', () => {
    const input = toGuidedRecipeInput({
      currentStep: 4,
      title: '  Sunday sauce  ',
      ingredients: [' 2 cans tomatoes ', '', ' basil '],
      steps: [' Simmer slowly. ', '  ', 'Add basil.'],
      handedDownFrom: ' Grandma Rosa ',
      story: ' Sunday dinner. ',
    });

    expect(input).toMatchObject({
      title: 'Sunday sauce',
      handedDownFrom: 'Grandma Rosa',
      story: 'Sunday dinner.',
      visibility: 'private',
      status: 'published',
      ingredients: [
        { item: '2 cans tomatoes', optional: false },
        { item: 'basil', optional: false },
      ],
      steps: [
        { instruction: 'Simmer slowly.', techniques: [] },
        { instruction: 'Add basil.', techniques: [] },
      ],
      tags: [],
      cuisines: [],
      mealTypes: [],
      equipment: [],
      dietaryFlags: [],
    });
  });

  it('creates a fresh editable row for ingredients and steps', () => {
    const first = emptyGuidedRecipeDraft();
    const second = emptyGuidedRecipeDraft();

    expect(first).toEqual({
      currentStep: 0,
      title: '',
      ingredients: [''],
      steps: [''],
      handedDownFrom: '',
      story: '',
    });
    expect(first.ingredients).not.toBe(second.ingredients);
    expect(first.steps).not.toBe(second.steps);
  });
});
