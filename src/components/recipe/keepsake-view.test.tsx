import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { PrintRecipe } from '~/components/print/types';
import { IntlWrapper } from '~/test/intl';
import { KeepsakeView } from './keepsake-view';

afterEach(cleanup);

const longToken = '0123456789abcdef'.repeat(4);
const note = `Family notes: https://example.com/${longToken}\nKeep this line.\n\nWith love.`;
const from = 'W'.repeat(80);
const recipe: PrintRecipe = {
  id: 'keepsake-wrap',
  slug: 'keepsake-wrap',
  title: longToken,
  description: `Description: ${longToken}`,
  coverImageUrl: null,
  coverImageAlt: null,
  visibility: 'public',
  servings: null,
  servingsNoun: null,
  prepMinutes: null,
  cookMinutes: null,
  totalMinutes: null,
  difficulty: null,
  cuisine: null,
  cuisines: [],
  sourceName: null,
  sourceUrl: null,
  notes: `Recipe notes: ${longToken}\nKeep the recipe notes.`,
  story: `Story: ${longToken}`,
  handedDownFrom: longToken,
  author: null,
  ingredients: [
    {
      id: 'ingredient',
      section: longToken,
      quantity: null,
      quantityMax: null,
      unit: null,
      item: `Ingredient: ${longToken}`,
      note: null,
      optional: false,
    },
  ],
  steps: [
    {
      id: 'step',
      section: longToken,
      instruction: `Method: ${longToken}`,
      timerSeconds: null,
      techniques: null,
    },
  ],
  tags: [],
};

describe('KeepsakeView wrapping (#1203)', () => {
  it('scopes inherited long-token wrapping to the card while preserving complete text and line breaks', () => {
    const { container } = render(
      <IntlWrapper>
        <KeepsakeView recipe={recipe} from={from} note={note} />
      </IntlWrapper>,
    );
    const article = container.querySelector('article')!;
    expect(article).toHaveClass('wrap-anywhere');
    expect(article.parentElement).not.toHaveClass('wrap-anywhere');
    const personalNote = article.querySelector('header p.whitespace-pre-line')!;
    expect(personalNote.textContent).toBe(note);
    expect(personalNote).toHaveClass('whitespace-pre-line');
    expect(article.querySelector('header p.italic')!.textContent).toContain(from);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(recipe.title);
    for (const text of [
      recipe.description,
      recipe.notes,
      recipe.story,
      recipe.ingredients[0]!.item,
      recipe.steps[0]!.instruction,
      `Handed down from ${longToken}`,
    ]) {
      expect(article.textContent).toContain(text);
    }
    expect(article.querySelectorAll('h3')).toHaveLength(2);
    for (const heading of article.querySelectorAll('h3')) {
      expect(heading.textContent).toBe(longToken);
    }
  });

  it('keeps the optional personal message absent when not provided', () => {
    const { container } = render(
      <IntlWrapper>
        <KeepsakeView recipe={recipe} from={null} note={null} />
      </IntlWrapper>,
    );
    expect(container.querySelector('header p.whitespace-pre-line')).toBeNull();
    expect(container.querySelector('header p.italic')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
