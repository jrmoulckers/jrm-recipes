import { cleanup, fireEvent, render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RecipeCard, type CardRecipe } from './recipe-card';
import { useActiveMemberStore } from '~/lib/active-member-store';
import type { ReactElement } from 'react';
import { IntlWrapper } from '~/test/intl';

function render(ui: ReactElement) {
  return rtlRender(<IntlWrapper>{ui}</IntlWrapper>);
}

// RecipeCard imports FavoriteButton, which pulls in a server action + router;
// stub the pieces so the card can render in jsdom.
vi.mock('~/server/collections/actions', () => ({
  toggleFavoriteAction: vi.fn().mockResolvedValue({ ok: true, favorited: true }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  useActiveMemberStore.setState({ activeMemberId: null });
  // A `priority` next/image injects a preload <link> into <head> via React's
  // resource system. Drop them between tests so each asserts a clean head.
  document.head.querySelectorAll('link[rel="preload"][as="image"]').forEach((el) => el.remove());
});

function makeRecipe(overrides: Partial<CardRecipe> = {}): CardRecipe {
  return {
    id: 'r1',
    slug: 'sourdough',
    title: 'Sourdough',
    description: 'Crusty loaf',
    coverImageUrl: 'https://img.test/default.jpg',
    totalMinutes: 120,
    servings: 2,
    difficulty: 'medium',
    visibility: 'public',
    ...overrides,
  };
}

/** Image preload hints (`<link rel="preload" as="image">`) currently in <head>. */
function preloadImageLinks() {
  return Array.from(
    document.head.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="image"]'),
  );
}

describe('RecipeCard interactions', () => {
  const quickPlan = {
    days: [{ value: '2026-09-08', label: 'Tue, Sep 8' }],
    defaultDate: '2026-09-08',
  };

  it('uses a named native link with the exact recipe target as the stretched hit area', () => {
    render(
      <RecipeCard
        recipe={makeRecipe({ author: { name: 'Julia', slug: 'julia' } })}
        matchReason={{ field: 'title', term: 'dough' }}
      />,
    );

    const heading = screen.getByRole('heading', { level: 3, name: 'Sourdough' });
    const detailLink = screen.getByRole('link', { name: 'Sourdough' });

    expect(detailLink).toHaveAttribute('href', '/recipes/julia/sourdough');
    expect(detailLink).toHaveAttribute('aria-labelledby', heading.id);
    expect(detailLink).toHaveClass('absolute', 'inset-0', 'focus-visible:ring-2');
    expect(detailLink).not.toContainElement(heading);
  });

  it('keeps links and buttons as siblings in a predictable keyboard order', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <RecipeCard
        recipe={makeRecipe({ author: { name: 'Julia', slug: 'julia' } })}
        canFavorite
        quickPlan={quickPlan}
      />,
    );

    const detailLink = screen.getByRole('link', { name: 'Sourdough' });
    const favoriteButton = screen.getByRole('button', { name: 'Save to favorites' });
    const quickPlanButton = screen.getByRole('button', { name: "Add to this week's plan" });
    const cookLink = screen.getByRole('link', { name: 'Cook Sourdough' });

    expect(container.querySelector('a a, a button, button a, button button')).toBeNull();

    await user.tab();
    expect(detailLink).toHaveFocus();
    await user.tab();
    expect(favoriteButton).toHaveFocus();
    await user.tab();
    expect(quickPlanButton).toHaveFocus();
    await user.tab();
    expect(cookLink).toHaveFocus();
  });

  it('does not activate the detail link when sibling controls are clicked', () => {
    render(
      <RecipeCard
        recipe={makeRecipe({ author: { name: 'Julia', slug: 'julia' } })}
        canFavorite
        quickPlan={quickPlan}
      />,
    );

    const detailLink = screen.getByRole('link', { name: 'Sourdough' });
    const onDetailClick = vi.fn((event: Event) => event.preventDefault());
    detailLink.addEventListener('click', onDetailClick);

    fireEvent.click(screen.getByRole('button', { name: 'Save to favorites' }));
    fireEvent.click(screen.getByRole('button', { name: "Add to this week's plan" }));

    const cookLink = screen.getByRole('link', { name: 'Cook Sourdough' });
    cookLink.addEventListener('click', (event) => event.preventDefault(), { once: true });
    fireEvent.click(cookLink);

    expect(onDetailClick).not.toHaveBeenCalled();
  });

  it('keeps the interactive assessment badge outside the recipe link', () => {
    useActiveMemberStore.setState({ activeMemberId: 'member_1' });
    const { container } = render(
      <RecipeCard
        recipe={makeRecipe({
          dietary: {
            ingredients: [{ id: 'ingredient_1', name: 'tofu' }],
            assessments: [
              {
                ruleId: 'composition:vegan',
                source: 'deterministic',
                verdict: 'meets',
                confidence: 'high',
                recognizedIngredients: 1,
                totalIngredients: 1,
                attentionIngredients: [],
              },
            ],
          },
        })}
        members={[
          {
            id: 'member_1',
            name: 'Ada',
            allergens: [],
            diets: ['vegan'],
            customRestrictions: [],
          },
        ]}
      />,
    );

    const assessment = screen.getByRole('button', { name: /Ada: 1 dietary check/ });
    expect(assessment.closest('a')).toBeNull();
    expect(container.querySelector('a button, button a')).toBeNull();
  });
});

describe('RecipeCard LCP priority', () => {
  it('lazy-loads the cover image by default (below-the-fold cards)', () => {
    const { container } = render(
      <RecipeCard recipe={makeRecipe({ coverImageUrl: 'https://img.test/lazy-card.jpg' })} />,
    );

    const img = container.querySelector('img');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(
      preloadImageLinks().some((l) => l.getAttribute('imagesrcset')?.includes('lazy-card.jpg')),
    ).toBe(false);
  });

  it('eagerly loads and preloads the cover image when priority is set (LCP)', () => {
    const { container } = render(
      <RecipeCard
        recipe={makeRecipe({
          coverImageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/lcp-card.jpg',
        })}
        priority
      />,
    );

    const img = container.querySelector('img');
    // next/image omits the loading attribute for priority images (eager).
    expect(img).not.toHaveAttribute('loading', 'lazy');
    // The prioritized image gets a preload hint so it isn't blocked by hydration.
    expect(
      preloadImageLinks().some((l) => l.getAttribute('imagesrcset')?.includes('lcp-card.jpg')),
    ).toBe(true);
  });

  it('eagerly loads a bundled fallback when the recipe has no cover', () => {
    const { container } = render(
      <RecipeCard
        recipe={makeRecipe({
          coverImageUrl: null,
          title: 'Blueberry Buttermilk Pancakes',
        })}
        priority
      />,
    );

    const img = container.querySelector('img');
    expect(decodeURIComponent(img?.getAttribute('src') ?? '')).toMatch(
      /\/img\/recipe-fallbacks\/breakfast-/,
    );
    expect(img).toHaveAttribute('data-fallback');
    expect(img).toHaveClass('scale-[1.02]');
    expect(preloadImageLinks()).toHaveLength(1);
  });
});
