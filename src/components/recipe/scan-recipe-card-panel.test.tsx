import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IntlWrapper } from '~/test/intl';
import { importRecipeTextAction } from '~/server/recipes/actions';
import type { ImportedRecipe } from '~/server/recipes/import';
import { recognizeRecipeCard } from '~/lib/recipe-card-ocr';
import { ScanRecipeCardPanel } from './scan-recipe-card-panel';

vi.mock('~/server/recipes/actions', () => ({
  importRecipeTextAction: vi.fn(),
}));

vi.mock('~/lib/recipe-card-ocr', () => ({
  RECIPE_CARD_OCR_LANGUAGES: ['eng', 'spa', 'deu', 'ara'],
  recognizeRecipeCard: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const importedRecipe: ImportedRecipe = {
  title: "Grandma's Biscuits",
  description: '',
  coverImageUrl: '',
  servings: '',
  servingsNoun: '',
  prepMinutes: '',
  cookMinutes: '',
  cuisine: '',
  cuisines: '',
  mealTypes: '',
  sourceName: '',
  sourceUrl: '',
  tags: '',
  ingredients: [
    {
      section: '',
      quantity: '2',
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
      instruction: 'Mix and bake.',
      imageUrl: '',
      videoUrl: '',
      timerMinutes: '',
      techniques: '',
    },
  ],
};

const mockedRecognize = vi.mocked(recognizeRecipeCard);
const mockedImportText = vi.mocked(importRecipeTextAction);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:recipe-card'),
    revokeObjectURL: vi.fn(),
  });
});

describe('ScanRecipeCardPanel', () => {
  it('reads a local photo and waits for explicit approval before filling the editor', async () => {
    let finishRecognition: (value: { confidence: number; text: string }) => void = () => undefined;
    mockedRecognize.mockReturnValue(
      new Promise((resolve) => {
        finishRecognition = resolve;
      }),
    );
    mockedImportText.mockResolvedValue({ ok: true, recipe: importedRecipe });
    const onImported = vi.fn();
    const user = userEvent.setup();

    render(
      <IntlWrapper>
        <ScanRecipeCardPanel onImported={onImported} />
      </IntlWrapper>,
    );

    expect(screen.getByLabelText('Take a photo')).toHaveAttribute('capture', 'environment');
    const file = new File(['card'], 'recipe.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Choose a photo'), {
      target: { files: [file] },
    });
    await user.click(screen.getByRole('button', { name: 'Read this card' }));

    expect(
      await screen.findByRole('heading', {
        name: 'Reading the recipe card…',
      }),
    ).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Reading the recipe card…');

    finishRecognition({
      confidence: 72,
      text: "Grandma's Biscuits\nIngredients\n2 cups flour\nSteps\nMix and bake.",
    });

    expect(
      await screen.findByRole('heading', {
        name: 'Please check what I read',
      }),
    ).toHaveFocus();
    expect(onImported).not.toHaveBeenCalled();
    expect(mockedRecognize).toHaveBeenCalledWith(
      file,
      'eng',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mockedImportText).toHaveBeenCalledWith(
      expect.stringContaining("Grandma's Biscuits"),
      'eng',
    );

    await user.click(screen.getByRole('button', { name: 'Use recipe draft' }));
    expect(onImported).toHaveBeenCalledWith(importedRecipe);
    expect(
      screen.queryByRole('heading', { name: 'Please check what I read' }),
    ).not.toBeInTheDocument();
  });

  it('cancels promptly while the recognized text is being parsed', async () => {
    mockedRecognize.mockResolvedValue({
      confidence: 72,
      text: "Grandma's Biscuits\nIngredients\n2 cups flour",
    });
    let finishParsing: (value: Awaited<ReturnType<typeof importRecipeTextAction>>) => void = () =>
      undefined;
    mockedImportText.mockReturnValue(
      new Promise((resolve) => {
        finishParsing = resolve;
      }),
    );
    const user = userEvent.setup();

    render(
      <IntlWrapper>
        <ScanRecipeCardPanel onImported={vi.fn()} />
      </IntlWrapper>,
    );

    fireEvent.change(screen.getByLabelText('Choose a photo'), {
      target: {
        files: [new File(['card'], 'recipe.png', { type: 'image/png' })],
      },
    });
    await user.click(screen.getByRole('button', { name: 'Read this card' }));
    await waitFor(() => expect(mockedImportText).toHaveBeenCalledOnce());
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Reading stopped.');
    expect(screen.getByRole('button', { name: 'Read this card' })).toHaveFocus();
    expect(
      screen.queryByRole('heading', { name: 'Please check what I read' }),
    ).not.toBeInTheDocument();

    finishParsing({ ok: true, recipe: importedRecipe });
  });

  it('shows a plain-language error when no text can be read', async () => {
    mockedRecognize.mockResolvedValue({ confidence: 0, text: '   ' });
    const user = userEvent.setup();

    render(
      <IntlWrapper>
        <ScanRecipeCardPanel onImported={vi.fn()} />
      </IntlWrapper>,
    );

    fireEvent.change(screen.getByLabelText('Choose a photo'), {
      target: {
        files: [new File(['blank'], 'blank.webp', { type: 'image/webp' })],
      },
    });
    await user.click(screen.getByRole('button', { name: 'Read this card' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "I couldn't find readable text in that photo.",
    );
    expect(mockedImportText).not.toHaveBeenCalled();
  });

  it('rejects oversized files before starting OCR', async () => {
    render(
      <IntlWrapper>
        <ScanRecipeCardPanel onImported={vi.fn()} />
      </IntlWrapper>,
    );

    const oversized = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.jpg', {
      type: 'image/jpeg',
    });
    fireEvent.change(screen.getByLabelText('Choose a photo'), {
      target: { files: [oversized] },
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Choose one smaller than 10 MB.');
    });
    expect(mockedRecognize).not.toHaveBeenCalled();
  });
});
