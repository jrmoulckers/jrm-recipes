import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { IntlWrapper } from '~/test/intl';
import { recipeUrl } from './export';
import { PrintView } from './print-view';
import type { PrintRecipe } from './types';

afterEach(cleanup);

const recipe: PrintRecipe = {
  id: 'print-wrap',
  slug: `recipe-${'longslug'.repeat(20)}`,
  title: 'Print wrapping recipe',
  description: null,
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
  notes: null,
  author: null,
  ingredients: [],
  steps: [],
  tags: [],
};

describe('PrintView footer wrapping (#1174)', () => {
  it.each(['Full page', 'Two-column', '4×6 card', '3×5 card'])(
    '%s preserves full URLs with wrapping attribution and a fixed QR',
    (format) => {
      const sourceUrl = `https://example.com/${'source'.repeat(40)}`;
      for (const source of [
        { sourceName: null, sourceUrl: null },
        { sourceName: null, sourceUrl },
        { sourceName: 'Family cookbook', sourceUrl },
      ]) {
        const current = { ...recipe, ...source };
        const { container, unmount } = render(
          <IntlWrapper>
            <PrintView recipe={current} />
          </IntlWrapper>,
        );
        fireEvent.click(screen.getByRole('button', { name: format }));
        const footer = container.querySelector('.heirloom-print-document footer')!;
        const attribution = footer.firstElementChild!;
        expect(attribution).toHaveClass('min-w-0', 'flex-1', 'wrap-anywhere');
        expect(attribution.textContent).toContain(recipeUrl(current));
        if (source.sourceUrl && !format.includes('card')) {
          expect(attribution.querySelector('a')).toHaveAttribute('href', sourceUrl);
          expect(attribution.textContent).toContain(source.sourceName ?? sourceUrl);
        }
        expect(footer.querySelector('figure')).toHaveClass('shrink-0');
        const size = format.includes('card') ? '64' : '84';
        expect(footer.querySelector('svg')).toHaveAttribute('width', size);
        expect(footer.querySelector('svg')).toHaveAttribute('height', size);
        fireEvent.click(screen.getByRole('button', { name: 'Large print' }));
        expect(attribution).toHaveClass('wrap-anywhere');
        expect(attribution.textContent).toContain(recipeUrl(current));
        unmount();
      }
    },
  );

  it.each(['private', 'unlisted'])('preserves %s QR visibility', (visibility) => {
    const { container } = render(
      <IntlWrapper>
        <PrintView recipe={{ ...recipe, visibility }} />
      </IntlWrapper>,
    );
    const footer = container.querySelector('.heirloom-print-document footer')!;
    expect(footer.textContent).toContain(recipeUrl(recipe));
    expect(footer.querySelector('figure') !== null).toBe(visibility === 'unlisted');
  });
});
