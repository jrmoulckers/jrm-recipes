import { cleanup, render as rtlRender, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';

import { IntlWrapper } from '~/test/intl';
import { useActiveMemberStore } from '~/lib/active-member-store';
import {
  readRecipeCookingSelection,
  saveRecipeCookingSelection,
} from '~/lib/recipe-cooking-selection';
import {
  IngredientsPanel,
  type IngredientsPanelControls,
  type IngredientSuggestions,
} from './ingredients-panel';

const { refreshMock, saveCorrectionMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  saveCorrectionMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock('~/server/dietary/actions', () => ({
  saveDietaryIngredientCorrectionAction: saveCorrectionMock,
}));

vi.mock('~/server/dietary/substitution-actions', () => ({
  applyIngredientSubstitutionAction: vi.fn(),
}));

// Stub the lazy anchored-suggestions client bundle so we can assert the panel
// renders it itself from serializable data. The fix for the production RSC
// crash where a `renderSuggestions` function prop was passed across the
// Server -> Client boundary ("Functions cannot be passed directly to Client
// Components", digest 2500096145).
vi.mock('~/components/engagement/anchored-suggestions-lazy', () => ({
  AnchoredSuggestions: (props: {
    anchorId: string;
    anchorLabel: string;
    canInteract: boolean;
    suggestions: unknown[];
    compactTrigger?: boolean;
  }) => (
    <div
      data-testid="anchored-suggestions"
      data-anchor-id={props.anchorId}
      data-anchor-label={props.anchorLabel}
      data-can-interact={String(props.canInteract)}
      data-suggestion-count={String(props.suggestions.length)}
      data-compact-trigger={String(props.compactTrigger)}
    />
  ),
}));

function render(ui: ReactElement) {
  return rtlRender(<IntlWrapper>{ui}</IntlWrapper>);
}

beforeEach(() => {
  useActiveMemberStore.setState({ activeMemberId: null });
});

afterEach(cleanup);

const ingredients = [
  {
    id: 'flour',
    section: null,
    quantity: 200,
    quantityMax: null,
    unit: 'g',
    item: 'flour',
    note: null,
    optional: false,
  },
  {
    id: 'sugar',
    section: null,
    quantity: 100,
    quantityMax: null,
    unit: 'g',
    item: 'sugar',
    note: null,
    optional: false,
  },
];

describe('IngredientsPanel selection readiness', () => {
  afterEach(() => {
    sessionStorage.removeItem('heirloom:recipe-cooking-selection:hydration-recipe');
  });

  it('disables server-rendered selections until restoration, then retains keyboard changes', async () => {
    const user = userEvent.setup();
    saveRecipeCookingSelection('hydration-recipe', { servings: 6, system: 'us' });
    const panel = (
      <IntlWrapper>
        <IngredientsPanel
          ingredients={ingredients}
          baseServings={4}
          servingsNoun={null}
          recipeContext={{
            recipeId: 'hydration-recipe',
            updatedAt: '2026-11-04T00:00:00.000Z',
            canEdit: false,
          }}
        />
      </IntlWrapper>
    );
    const container = document.createElement('div');
    container.innerHTML = renderToString(panel);
    document.body.appendChild(container);
    const view = within(container);

    for (const name of ['Fewer servings', 'More servings', 'Original', 'US', 'Metric', 'Grams']) {
      expect(view.getByRole('button', { name })).toBeDisabled();
    }

    rtlRender(panel, { container, hydrate: true });

    expect(view.getByRole('button', { name: 'US' })).toHaveAttribute('aria-pressed', 'true');
    const metric = view.getByRole('button', { name: 'Metric' });
    expect(metric).toBeEnabled();
    metric.focus();
    await user.keyboard('{Enter}');
    expect(metric).toHaveAttribute('aria-pressed', 'true');
    expect(view.getByRole('button', { name: /300 g\s*flour/ })).toBeInTheDocument();
    const more = view.getByRole('button', { name: 'More servings' });
    expect(more).toBeEnabled();
    more.focus();
    await user.keyboard('{Enter}');
    expect(view.getByRole('button', { name: /350 g\s*flour/ })).toBeInTheDocument();
    expect(metric).toHaveAttribute('aria-pressed', 'true');
    expect(readRecipeCookingSelection('hydration-recipe')).toEqual({
      servings: 7,
      system: 'metric',
    });
  });
});

describe('IngredientsPanel fractional egg scaling', () => {
  it('keeps yolks distinct from whole eggs when increasing four servings to five', async () => {
    const user = userEvent.setup();
    render(
      <IngredientsPanel
        ingredients={[
          { ...ingredients[0]!, id: 'eggs', quantity: 4, unit: null, item: 'large eggs' },
          { ...ingredients[0]!, id: 'yolks', quantity: 2, unit: null, item: 'egg yolks' },
        ]}
        baseServings={4}
        servingsNoun={null}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'More servings' }));

    expect(screen.getByRole('button', { name: /5\s*large eggs/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /2½\s*egg yolks/ })).toBeInTheDocument();
    expect(screen.queryByText(/Round (?:up )?to/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Whisk and measure/)).not.toBeInTheDocument();

    screen.getByRole('button', { name: 'More servings' }).focus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('button', { name: /6\s*large eggs/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /3\s*egg yolks/ })).toBeInTheDocument();
    expect(screen.queryByText(/Whisk and measure|Round (?:up )?to/)).not.toBeInTheDocument();
  });

  const scalingIngredients = [
    { ...ingredients[0]!, id: 'eggs', quantity: 2, unit: null, item: 'large eggs' },
    { ...ingredients[0]!, id: 'whites', quantity: 2, unit: null, item: 'egg whites' },
    { ...ingredients[0]!, id: 'noodles', quantity: 2, unit: null, item: 'egg noodles' },
    { ...ingredients[0]!, id: 'cubes', quantity: 2, unit: null, item: 'bouillon cubes' },
    { ...ingredients[0]!, id: 'note', quantity: 2, unit: null, item: 'eggs', note: 'yolks only' },
    { ...ingredients[0]!, id: 'prep', quantity: 2, unit: null, item: 'eggs', prep: 'whites only' },
    {
      ...ingredients[0]!,
      id: 'range',
      quantity: 2,
      quantityMax: 3,
      unit: null,
      item: 'whole eggs',
    },
    { ...ingredients[0]!, id: 'measured', quantity: 200, unit: 'g', item: 'liquid eggs' },
  ];

  function ScalingPanel({ controlled }: { controlled: boolean }) {
    const [servings, onServingsChange] = useState(4);
    const [system, onSystemChange] = useState<IngredientsPanelControls['system']>('original');
    return (
      <IngredientsPanel
        ingredients={scalingIngredients}
        baseServings={4}
        servingsNoun={null}
        controls={
          controlled
            ? {
                servings,
                onServingsChange,
                system,
                onSystemChange,
                checked: new Set(),
                onToggleChecked: vi.fn(),
              }
            : undefined
        }
      />
    );
  }

  it.each([false, true])(
    'preserves exact amounts through scale, unit selection and reset (cook controls: %s)',
    async (controlled) => {
      const user = userEvent.setup();
      render(<ScalingPanel controlled={controlled} />);
      await user.click(screen.getByRole('button', { name: 'More servings' }));

      const tip = 'About 2½ eggs. Whisk and measure 7½ tbsp (1 egg ≈ 3 tbsp).';
      expect(screen.getAllByText(tip)).toHaveLength(1);
      for (const item of ['large eggs', 'egg whites', 'egg noodles', 'bouillon cubes']) {
        expect(
          screen.getByRole('button', { name: new RegExp(`2½\\s*${item}`) }),
        ).toBeInTheDocument();
      }
      expect(screen.getByRole('button', { name: /2½.*3¾\s*whole eggs/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /2½\s*eggs.*yolks only/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /2½\s*eggs.*whites only/ })).toBeInTheDocument();
      expect(screen.queryByText(/Round (?:up )?to/)).not.toBeInTheDocument();

      for (const name of ['US', 'Metric', 'Grams', 'Original']) {
        await user.click(screen.getByRole('button', { name }));
        expect(screen.getAllByText(tip)).toHaveLength(1);
        expect(screen.getByRole('button', { name: /2½\s*egg whites/ })).toBeInTheDocument();
        expect(screen.queryByText(/Round (?:up )?to/)).not.toBeInTheDocument();
      }

      await user.click(screen.getByRole('button', { name: 'Fewer servings' }));
      await user.click(screen.getByRole('button', { name: 'Fewer servings' }));
      expect(screen.getByRole('button', { name: /1½\s*egg whites/ })).toBeInTheDocument();
      expect(
        screen.getByText('About 1½ eggs. Whisk and measure 4½ tbsp (1 egg ≈ 3 tbsp).'),
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Reset' }));
      expect(screen.getByRole('button', { name: /2\s*egg whites/ })).toBeInTheDocument();
      expect(screen.queryByText(/Whisk and measure|Round (?:up )?to/)).not.toBeInTheDocument();
    },
  );
});

function makeControls(checked: string[]): IngredientsPanelControls {
  return {
    servings: 4,
    onServingsChange: vi.fn(),
    system: 'original',
    onSystemChange: vi.fn(),
    checked: new Set(checked),
    onToggleChecked: vi.fn(),
  };
}

const CHECK_ANIM = ['animate-check-box-pop', 'animate-check-pop', 'animate-strike-in'] as const;

function hasCheckAnim(container: HTMLElement) {
  return CHECK_ANIM.some((name) => container.querySelector(`[class*="${name}"]`) !== null);
}

describe('IngredientsPanel check-off animation gating', () => {
  it('does not replay check-off motion for rows already checked on first paint', () => {
    // A resumed cook session hands the panel a pre-checked set on its very first
    // render (issue #88 regression).
    const { container } = render(
      <IngredientsPanel
        ingredients={ingredients}
        baseServings={4}
        servingsNoun={null}
        controls={makeControls(['flour'])}
      />,
    );

    // The flour row renders in its checked state...
    const pressed = Array.from(container.querySelectorAll('button[aria-pressed="true"]')).find(
      (button) => button.textContent?.includes('flour'),
    );
    expect(pressed).toBeDefined();

    // ...but none of the one-shot pop/strike animations fire on load.
    expect(hasCheckAnim(container)).toBe(false);
  });

  it('animates a row that actually flips checked after mount', () => {
    const { container, rerender } = rtlRender(
      <IntlWrapper>
        <IngredientsPanel
          ingredients={ingredients}
          baseServings={4}
          servingsNoun={null}
          controls={makeControls([])}
        />
      </IntlWrapper>,
    );

    // Nothing checked on first paint -> no animation.
    expect(hasCheckAnim(container)).toBe(false);

    // The user taps "flour": a live unchecked -> checked transition should animate.
    rerender(
      <IntlWrapper>
        <IngredientsPanel
          ingredients={ingredients}
          baseServings={4}
          servingsNoun={null}
          controls={makeControls(['flour'])}
        />
      </IntlWrapper>,
    );

    expect(hasCheckAnim(container)).toBe(true);
  });
});

describe('IngredientsPanel anchored suggestions (RSC boundary regression)', () => {
  it('renders AnchoredSuggestions per ingredient from serializable data', () => {
    const ingredientSuggestions: IngredientSuggestions = {
      recipeId: 'rcp_1',
      recipeSlug: 'test-recipe',
      canInteract: true,
      byIngredientId: {
        flour: [
          {
            id: 'sug_1',
            anchorType: 'ingredient',
            anchorId: 'flour',
            anchorLabel: 'flour',
            body: 'Try bread flour',
            resolvedAt: null,
            appliedAt: null,
            createdAt: new Date(0),
            author: null,
          },
        ],
      },
    };

    // The payload must be JSON-serializable: this is exactly the invariant that
    // was violated when a render-prop function was passed across the boundary.
    expect(() => JSON.stringify(ingredientSuggestions)).not.toThrow();

    const { getAllByTestId } = render(
      <IngredientsPanel
        ingredients={ingredients}
        baseServings={4}
        servingsNoun={null}
        ingredientSuggestions={ingredientSuggestions}
      />,
    );

    const slots = getAllByTestId('anchored-suggestions');
    expect(slots).toHaveLength(ingredients.length);

    const flour = slots.find((el) => el.dataset.anchorId === 'flour');
    expect(flour?.dataset.anchorLabel).toBe('flour');
    expect(flour?.dataset.canInteract).toBe('true');
    expect(flour?.dataset.suggestionCount).toBe('1');
    expect(flour?.dataset.compactTrigger).toBe('true');

    // Ingredients with no anchored suggestions still render the slot with an
    // empty list (preserves the "suggest an edit" affordance).
    const sugar = slots.find((el) => el.dataset.anchorId === 'sugar');
    expect(sugar?.dataset.suggestionCount).toBe('0');
  });

  it('omits the suggestion slot entirely when no data is provided', () => {
    const { queryAllByTestId } = render(
      <IngredientsPanel ingredients={ingredients} baseServings={4} servingsNoun={null} />,
    );

    expect(queryAllByTestId('anchored-suggestions')).toHaveLength(0);
  });
});

describe('IngredientsPanel display-time unit conversion', () => {
  const water = [
    {
      id: 'water',
      section: null,
      quantity: 240,
      quantityMax: null,
      unit: 'ml',
      item: 'water',
      note: null,
      optional: false,
    },
  ];

  it("auto-converts to the viewer's saved system on first paint", () => {
    const { container } = render(
      <IngredientsPanel
        ingredients={water}
        baseServings={1}
        servingsNoun={null}
        unitPrefs={{
          defaultSystem: 'us',
          volumeUnit: null,
          massUnit: null,
          temperatureUnit: null,
          autoConvert: true,
        }}
      />,
    );
    // 240 ml ≈ 1 cup: the panel should open already in US units.
    expect(container.textContent).toMatch(/cup/i);
    expect(container.textContent).not.toMatch(/\bml\b/i);
  });

  describe('IngredientsPanel dietary evidence', () => {
    it('shows exact evidence wording from a sibling control, not inside check-off', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      render(
        <IngredientsPanel
          ingredients={ingredients}
          baseServings={4}
          servingsNoun={null}
          dietaryEvidence={[
            {
              ingredientId: 'flour',
              ruleId: 'allergen:wheat',
              finding: 'present',
              source: 'text-match',
            },
            {
              ingredientId: 'flour',
              ruleId: 'composition:vegan',
              finding: 'possible',
              source: 'on-device',
            },
            {
              ingredientId: 'flour',
              ruleId: 'confirmation:celiac-safe',
              finding: 'unresolved',
              source: 'text-match',
            },
            {
              ingredientId: 'sugar',
              ruleId: 'composition:vegan',
              finding: 'absent',
              source: 'text-match',
            },
          ]}
        />,
      );

      const evidenceTrigger = await screen.findByText('Review ingredient analysis (2)');
      const checkOff = screen
        .getAllByRole('button')
        .find((button) => button.textContent?.includes('flour'));
      expect(checkOff).toBeDefined();
      expect(checkOff?.contains(evidenceTrigger)).toBe(false);

      await user.click(evidenceTrigger);
      expect(await screen.findByText('Present')).toBeInTheDocument();
      expect(screen.getByText('Possible')).toBeInTheDocument();
      expect(screen.getByText('Unresolved')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'flour' })).toHaveAttribute(
        'id',
        'dietary-correction-flour',
      );
      expect(screen.getByRole('heading', { name: 'flour' })).toHaveAttribute('tabindex', '-1');
      expect(screen.getByRole('heading', { name: 'sugar' })).toBeInTheDocument();
      expect(
        screen.getByText(
          "This automated ingredient analysis supports the recipe's dietary suggestions. It does not change your personal dietary profile.",
        ),
      ).toBeInTheDocument();
    });

    it('sends authorized corrections through the canonical correction action', async () => {
      saveCorrectionMock.mockResolvedValueOnce({ ok: true });
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      render(
        <IngredientsPanel
          ingredients={ingredients}
          baseServings={4}
          servingsNoun={null}
          dietaryEvidence={[
            {
              ingredientId: 'flour',
              ruleId: 'allergen:wheat',
              finding: 'present',
              source: 'text-match',
            },
          ]}
          recipeContext={{
            recipeId: 'recipe_1',
            updatedAt: '2026-09-08T12:00:00.000Z',
            canEdit: true,
          }}
        />,
      );

      await user.click(await screen.findByText('Review ingredient analysis (1)'));
      expect(
        screen.getByText(
          "Editors can update this recipe's ingredient analysis. Changes apply to this recipe for everyone who can view it. They do not change this ingredient in other recipes or anyone's personal dietary profile.",
        ),
      ).toBeInTheDocument();
      const correctionGroup = await screen.findByRole('radiogroup', {
        name: 'Set the ingredient evidence for Wheat-free',
      });
      expect(within(correctionGroup).getAllByRole('radio')).toHaveLength(3);
      expect(within(correctionGroup).getByRole('radio', { name: 'Applies' })).toBeChecked();
      expect(within(correctionGroup).queryByRole('radio', { name: 'May apply' })).toBeNull();
      await user.click(within(correctionGroup).getByRole('radio', { name: 'Does not apply' }));

      expect(saveCorrectionMock).toHaveBeenCalledWith({
        ingredientId: 'flour',
        ruleId: 'allergen:wheat',
        customRestrictionId: null,
        finding: 'absent',
        correctedFoodId: null,
      });
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  it("keeps the author's original units when auto-convert is off", () => {
    const { container } = render(
      <IngredientsPanel
        ingredients={water}
        baseServings={1}
        servingsNoun={null}
        unitPrefs={{
          defaultSystem: 'us',
          volumeUnit: null,
          massUnit: null,
          temperatureUnit: null,
          autoConvert: false,
        }}
      />,
    );
    expect(container.textContent).toMatch(/\bml\b/i);
    expect(container.textContent).not.toMatch(/cup/i);
  });

  it('honors a per-dimension unit override', () => {
    const { container } = render(
      <IngredientsPanel
        ingredients={water}
        baseServings={1}
        servingsNoun={null}
        unitPrefs={{
          defaultSystem: 'metric',
          volumeUnit: 'cup',
          massUnit: null,
          temperatureUnit: null,
          autoConvert: true,
        }}
      />,
    );
    // Metric system, but volume is pinned to cups → cups win.
    expect(container.textContent).toMatch(/cup/i);
  });
});
