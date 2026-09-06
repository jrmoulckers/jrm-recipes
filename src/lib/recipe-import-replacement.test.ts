import { describe, expect, it } from 'vitest';

import { scannedRecipeWouldReplaceRows } from './recipe-import-replacement';

const incoming = {
  ingredients: [
    {
      section: '',
      quantity: '1',
      quantityMax: '',
      unit: 'cup',
      item: 'flour',
      note: '',
      optional: false,
    },
  ],
  steps: [
    {
      section: '',
      instruction: 'Mix.',
      imageUrl: '',
      videoUrl: '',
      timerMinutes: '',
      techniques: '',
    },
  ],
};

const emptyIngredient = {
  section: '',
  quantity: '',
  quantityMax: '',
  unit: '',
  item: '',
  note: '',
  prep: '',
  stepPosition: '',
  optional: false,
};

const emptyStep = {
  section: '',
  title: '',
  instruction: '',
  imageUrl: '',
  imageAlt: '',
  videoUrl: '',
  captionUrl: '',
  captionLanguage: '',
  timerMinutes: '',
  targetTempC: '',
  doneness: '',
  techniques: '',
};

describe('scannedRecipeWouldReplaceRows', () => {
  it('does not prompt for untouched placeholder rows', () => {
    expect(scannedRecipeWouldReplaceRows(incoming, [emptyIngredient], [emptyStep])).toBe(false);
  });

  it('detects advanced ingredient and step data that a scan would replace', () => {
    expect(
      scannedRecipeWouldReplaceRows(
        incoming,
        [{ ...emptyIngredient, optional: true }],
        [emptyStep],
      ),
    ).toBe(true);
    expect(
      scannedRecipeWouldReplaceRows(
        incoming,
        [emptyIngredient],
        [{ ...emptyStep, imageUrl: 'https://example.com/step.jpg' }],
      ),
    ).toBe(true);
    expect(
      scannedRecipeWouldReplaceRows(
        incoming,
        [emptyIngredient],
        [{ ...emptyStep, targetTempC: '74' }],
      ),
    ).toBe(true);
  });
});
