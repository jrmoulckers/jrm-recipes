import { cleanup, render as rtlRender, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

import { IntlWrapper } from '~/test/intl';
import esMessages from '~/messages/es.json';
import { assessSubstitutionImpact, IngredientSubstitutions } from './ingredient-substitutions';

const { applyMock, refreshMock } = vi.hoisted(() => ({
  applyMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock('~/server/dietary/substitution-actions', () => ({
  applyIngredientSubstitutionAction: applyMock,
}));

afterEach(cleanup);

function render(ui: ReactElement) {
  return rtlRender(<IntlWrapper>{ui}</IntlWrapper>);
}

// "Mayonnaise" is a good fixture: two of its swaps are vegetarian and one
// ("Vegan mayo") is tagged egg-free/vegan/dairy-free, so dietary filters are
// observable in the rendered list.
async function openSubstitutions(item: string) {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  render(<IngredientSubstitutions item={item} />);
  await user.click(screen.getByRole('button', { name: /substitutions for/i }));
  return user;
}

describe('IngredientSubstitutions dietary filters', () => {
  it('offers all five dietary filters, including egg-free and vegetarian', async () => {
    await openSubstitutions('mayonnaise');

    const group = await screen.findByRole('group', {
      name: /filter substitutions by dietary need/i,
    });
    const chipLabels = within(group)
      .getAllByRole('button')
      .map((chip) => chip.textContent);

    expect(chipLabels).toEqual(['Vegan', 'Vegetarian', 'Dairy-free', 'Gluten-free', 'Egg-free']);
  });

  it('narrows swaps to egg-free options when Egg-free is selected', async () => {
    const user = await openSubstitutions('mayonnaise');

    // All three swaps show before filtering.
    expect(await screen.findByText('Vegan mayo')).toBeInTheDocument();
    expect(screen.getByText('Plain Greek yogurt')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Egg-free' }));

    // Only the egg-free swap survives. The egg-based ones drop out.
    expect(screen.getByText('Vegan mayo')).toBeInTheDocument();
    expect(screen.queryByText('Plain Greek yogurt')).not.toBeInTheDocument();
    expect(screen.queryByText('Sour cream')).not.toBeInTheDocument();
  });

  it('narrows swaps to vegetarian options when Vegetarian is selected', async () => {
    const user = await openSubstitutions('mayonnaise');

    await user.click(screen.getByRole('button', { name: 'Vegetarian' }));

    expect(screen.getByText('Plain Greek yogurt')).toBeInTheDocument();
    // "Vegan mayo" is not tagged vegetarian, so it is filtered out.
    expect(screen.queryByText('Vegan mayo')).not.toBeInTheDocument();
  });
});

describe('IngredientSubstitutions allergen safety (#429)', () => {
  it("hides swaps that carry one of the member's allergens", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    // Cooking for a dairy-allergic member: the dairy-based mayo swaps must not
    // be offered as safe alternatives, even though they're valid swaps.
    render(<IngredientSubstitutions item="mayonnaise" avoidAllergens={['dairy']} />);
    await user.click(screen.getByRole('button', { name: /substitutions for/i }));

    // The dairy-free swap survives. The dairy-carrying ones are filtered out.
    expect(await screen.findByText('Vegan mayo')).toBeInTheDocument();
    expect(screen.queryByText('Plain Greek yogurt')).not.toBeInTheDocument();
    expect(screen.queryByText('Sour cream')).not.toBeInTheDocument();
  });
});

describe('IngredientSubstitutions localization', () => {
  it('labels the trigger and dietary filters from the Spanish catalog', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    rtlRender(
      <IntlWrapper locale="es" messages={esMessages}>
        <IngredientSubstitutions item="mayonnaise" />
      </IntlWrapper>,
    );

    await user.click(screen.getByRole('button', { name: /sustituciones para/i }));

    const group = await screen.findByRole('group', {
      name: /filtrar sustituciones por necesidad dietética/i,
    });
    expect(
      within(group)
        .getAllByRole('button')
        .map((chip) => chip.textContent),
    ).toEqual(['Vegano', 'Vegetariano', 'Sin lácteos', 'Sin gluten', 'Sin huevo']);
  });
});

describe('IngredientSubstitutions dietary impact', () => {
  it('assesses a replacement in memory without mutating the recipe ingredients', () => {
    const ingredients = [
      {
        ingredientId: 'butter',
        item: 'butter',
        amount: 1,
        amountMax: null,
        unit: 'cup',
        prep: null,
        linkedFood: null,
      },
    ];
    const original = structuredClone(ingredients);

    const impact = assessSubstitutionImpact(ingredients, 'butter', 'Neutral or olive oil');

    expect(ingredients).toEqual(original);
    expect(impact).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'allergen:dairy',
          before: expect.objectContaining({ verdict: 'conflicts' }),
          after: expect.not.objectContaining({ verdict: 'conflicts' }),
        }),
      ]),
    );
  });

  it('does not persist while browsing and applies through the authorized action', async () => {
    applyMock.mockResolvedValueOnce({ ok: true, updatedItem: 'Neutral or olive oil' });
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(
      <IngredientSubstitutions
        item="butter"
        recipePreview={{
          recipeId: 'recipe_1',
          ingredientId: 'ingredient_1',
          updatedAt: '2026-09-08T12:00:00.000Z',
          canApply: true,
          ingredients: [
            {
              ingredientId: 'ingredient_1',
              item: 'butter',
              amount: 1,
              amountMax: null,
              unit: 'cup',
              prep: null,
              linkedFood: null,
            },
          ],
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: /substitutions for/i }));
    expect(applyMock).not.toHaveBeenCalled();
    expect(
      (await screen.findAllByLabelText('Neutral or olive oil dietary assessment')).length,
    ).toBeGreaterThan(0);

    await user.click(screen.getAllByRole('button', { name: 'Apply' })[0]!);
    expect(applyMock).toHaveBeenCalledWith({
      recipeId: 'recipe_1',
      ingredientId: 'ingredient_1',
      expectedItem: 'butter',
      expectedRecipeUpdatedAt: '2026-09-08T12:00:00.000Z',
      substitute: 'Neutral or olive oil',
    });
    expect(refreshMock).toHaveBeenCalled();
  });
});
