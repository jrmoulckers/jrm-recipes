import { cleanup, render as rtlRender, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

import { IntlWrapper } from '~/test/intl';
import { useActiveMemberStore } from '~/lib/active-member-store';
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
          ]}
        />,
      );

      const evidenceTrigger = await screen.findByRole('button', {
        name: 'Dietary evidence for flour',
      });
      const checkOff = screen
        .getAllByRole('button')
        .find((button) => button.textContent?.includes('flour'));
      expect(checkOff).toBeDefined();
      expect(checkOff?.contains(evidenceTrigger)).toBe(false);

      await user.click(evidenceTrigger);
      expect(await screen.findByText('Present')).toBeInTheDocument();
      expect(screen.getByText('Possible')).toBeInTheDocument();
      expect(screen.getByText('Unresolved')).toBeInTheDocument();
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

      await user.click(await screen.findByRole('button', { name: 'Dietary evidence for flour' }));
      const correctionGroup = await screen.findByRole('group', {
        name: 'Correct Wheat-free evidence',
      });
      await user.click(within(correctionGroup).getByRole('button', { name: 'Not present' }));

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
