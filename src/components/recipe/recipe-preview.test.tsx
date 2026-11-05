import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { IntlWrapper } from '~/test/intl';
import { recipeInput } from '~/server/recipes/validation';
import { RecipePreview } from './recipe-preview';

vi.mock('~/components/recipe/recipe-image', () => ({
  RecipeImage: () => null,
}));

afterEach(cleanup);

const description =
  'Family notes: https://example.com/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('RecipePreview authored text containment (#1207)', () => {
  for (const mode of ['create', 'edit'] as const) {
    it(`wraps shared authored content without rewriting it in ${mode} mode`, () => {
      const token = '0123456789abcdef'.repeat(5);
      const recipe = recipeInput.parse({
        title: `Title ${token}`,
        description,
        ingredients: [
          {
            quantity: 2,
            unit: 'cups',
            item: `Ingredient ${token}`,
            prep: `Preparation ${token}`,
            note: `Ingredient note ${token}`,
          },
        ],
        steps: [{ title: `Method ${token}`, instruction: `Instruction ${token}` }],
        notes: `First note\nSecond note ${token}`,
        story: `First memory\nSecond memory ${token}`,
        makeAheadNote: `Before cooking\nMake ahead ${token}`,
        sourceUrl: `https://example.com/${token}`,
      });
      const { container } = render(
        <IntlWrapper>
          <RecipePreview recipe={recipe} mode={mode} fallbackKey="preview-test" />
        </IntlWrapper>,
      );
      const preview = container.firstElementChild;
      expect(preview).toHaveClass('min-w-0', 'wrap-anywhere');
      expect(preview).not.toHaveClass('overflow-hidden', 'overflow-x-hidden', 'truncate');
      expect(screen.getByText(description).textContent).toBe(description);
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(recipe.title);
      const ingredient = screen.getByText(`Ingredient ${token}`, { exact: false });
      expect(ingredient).toHaveClass('min-w-0', 'flex-1');
      expect(ingredient.textContent).toContain(`Ingredient ${token}`);
      expect(screen.getByText(`Preparation ${token}`, { exact: false })).toBeInTheDocument();
      expect(screen.getByText(`Ingredient note ${token}`)).toBeInTheDocument();
      const instruction = screen.getByText(`Instruction ${token}`);
      expect(instruction.parentElement).toHaveClass('min-w-0', 'flex-1');
      expect(instruction.textContent).toBe(`Instruction ${token}`);
      for (const text of [recipe.notes!, recipe.story!, recipe.makeAheadNote!]) {
        const paragraph = screen.getByText(text, {
          normalizer: (value) => value,
        });
        expect(paragraph.textContent).toBe(text);
        expect(paragraph).toHaveClass('whitespace-pre-line');
        expect(preview).toContainElement(paragraph);
      }
      const source = screen.getByRole('link', { name: recipe.sourceUrl });
      expect(source).toHaveAttribute('href', recipe.sourceUrl);
      expect(source).toHaveAttribute('target', '_blank');
      expect(source).toHaveAttribute('rel', 'noreferrer');
      expect(preview).toContainElement(source);
    });

    it(`preserves ordinary description text in ${mode} mode`, () => {
      const recipe = recipeInput.parse({
        title: 'Family soup',
        description: 'A familiar family soup, served with bread.',
      });
      render(
        <IntlWrapper>
          <RecipePreview recipe={recipe} mode={mode} fallbackKey="preview-test" />
        </IntlWrapper>,
      );
      expect(screen.getByText(recipe.description!).textContent).toBe(recipe.description);
    });
  }
});
