import { cleanup, fireEvent, render as rtlRender, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState, type ComponentProps, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';

import { IntlWrapper } from '~/test/intl';
import deMessages from '~/messages/de.json';
import ar from '~/messages/ar.json';
import en from '~/messages/en.json';
import es from '~/messages/es.json';
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

describe('IngredientsPanel piece-count drafts', () => {
  const pieceIngredients = [
    { ...ingredients[0]!, quantity: 400 },
    { ...ingredients[1]!, quantity: 256 },
  ];
  it.each(['1.5', '0', '-2'])(
    'suppresses the target for invalid draft %s and recovers without changing batch weight',
    async (draft) => {
      const user = userEvent.setup();
      render(
        <IngredientsPanel ingredients={pieceIngredients} baseServings={4} servingsNoun="pieces" />,
      );
      const count = screen.getByRole('spinbutton', { name: 'Number of pieces' });

      expect(screen.getByText('= 164 g each')).toBeInTheDocument();
      await user.type(count, '8');
      expect(screen.getByText('= 82 g each')).toBeInTheDocument();
      await user.clear(count);
      await user.type(count, draft);

      expect(screen.queryByText(/= .+ each/)).not.toBeInTheDocument();
      expect(count).toHaveValue(Number(draft));
      expect(count).toHaveAttribute('aria-invalid', 'true');
      expect(count).toHaveAccessibleDescription('Enter a whole number of pieces, at least 1.');
      expect(screen.getByText('Enter a whole number of pieces, at least 1.')).toBeVisible();
      expect(screen.getByText('656 g')).toBeInTheDocument();

      await user.clear(count);
      await user.type(count, '3');
      expect(screen.getByText('= 219 g each')).toBeInTheDocument();
      expect(count).not.toHaveAttribute('aria-invalid', 'true');
      expect(count).not.toHaveAttribute('aria-describedby');

      await user.clear(count);
      expect(screen.getByText('= 164 g each')).toBeInTheDocument();
      expect(
        screen.queryByText('Enter a whole number of pieces, at least 1.'),
      ).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'More servings' }));
      expect(screen.getByText('820 g')).toBeInTheDocument();
      expect(screen.getByText('= 164 g each')).toBeInTheDocument();
    },
  );

  it('distinguishes native badInput from a deliberately blank default and recovers', async () => {
    const user = userEvent.setup();
    render(
      <IngredientsPanel ingredients={pieceIngredients} baseServings={4} servingsNoun="pieces" />,
    );
    const count = screen.getByRole('spinbutton', { name: 'Number of pieces' });
    const badInput = vi.spyOn((count as HTMLInputElement).validity, 'badInput', 'get');
    badInput.mockReturnValue(true);
    fireEvent.input(count);

    expect(screen.queryByText(/= .+ each/)).not.toBeInTheDocument();
    expect(count).toHaveAttribute('aria-invalid', 'true');
    expect(count).toHaveAccessibleDescription('Enter a whole number of pieces, at least 1.');
    expect(screen.getByText('Enter a whole number of pieces, at least 1.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Metric' }));
    expect(screen.queryByText(/= .+ each/)).not.toBeInTheDocument();

    badInput.mockRestore();
    fireEvent.input(count);
    expect(screen.getByText('= 164 g each')).toBeInTheDocument();
    expect(count).not.toHaveAttribute('aria-invalid', 'true');
    await user.type(count, '8');
    expect(screen.getByText('= 82 g each')).toBeInTheDocument();
  });

  it('keeps an uncountable yield blank until a valid explicit piece count is supplied', async () => {
    const user = userEvent.setup();
    render(<IngredientsPanel ingredients={ingredients} baseServings={4} servingsNoun={null} />);
    const count = screen.getByRole('spinbutton', { name: 'Number of pieces' });

    expect(screen.queryByText(/= .+ each/)).not.toBeInTheDocument();
    expect(count).not.toHaveAttribute('aria-invalid', 'true');
    await user.type(count, '1');
    expect(screen.getByText('= 300 g each')).toBeInTheDocument();
    await user.clear(count);
    expect(screen.queryByText(/= .+ each/)).not.toBeInTheDocument();
    expect(count).not.toHaveAttribute('aria-invalid', 'true');
  });
});

describe('IngredientsPanel batch-weight coverage (#1187)', () => {
  const knownWeights = [
    { ...ingredients[0]!, id: 'flour', item: 'bread flour', quantity: 500 },
    { ...ingredients[0]!, id: 'water', item: 'water', quantity: 350 },
    { ...ingredients[0]!, id: 'salt', item: 'salt', quantity: 10 },
    { ...ingredients[0]!, id: 'levain', item: 'levain', quantity: 100 },
  ];
  const unknownWeights = [
    { ...ingredients[0]!, id: 'eggs', item: 'large eggs', quantity: 4, unit: null },
    { ...ingredients[0]!, id: 'yolks', item: 'egg yolks', quantity: 2, unit: null },
    {
      ...ingredients[0]!,
      id: 'seasoning',
      item: 'unresolved seasoning',
      quantity: 1,
      unit: 'tsp',
    },
  ];

  it('qualifies both carbonara subtotal outputs and preserves scaling and division', async () => {
    const user = userEvent.setup();
    render(
      <IngredientsPanel
        ingredients={[
          { ...ingredients[0]!, item: 'spaghetti', quantity: 400 },
          { ...ingredients[1]!, item: 'guanciale', quantity: 156 },
          { ...ingredients[0]!, id: 'cheese', item: 'pecorino', quantity: 100 },
          ...unknownWeights,
        ]}
        baseServings={4}
        servingsNoun={null}
      />,
    );
    await user.click(screen.getByRole('button', { name: /^Grams$/ }));
    await user.type(screen.getByRole('spinbutton', { name: 'Number of pieces' }), '8');
    const batch = screen.getByText('Known-ingredient subtotal (partial)');
    expect(batch).toHaveTextContent('656 g');
    expect(screen.getByText('= 82 g each (partial, known ingredients only)')).toBeVisible();
    expect(
      screen.getByText(
        'Weight not included for: large eggs, egg yolks, and unresolved seasoning. These are not the complete batch or portion weights.',
      ),
    ).toBeVisible();
    await user.clear(screen.getByRole('spinbutton', { name: 'Number of pieces' }));
    await user.type(screen.getByRole('spinbutton', { name: 'Number of pieces' }), '4');
    expect(screen.getByText('= 164 g each (partial, known ingredients only)')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'More servings' }));
    expect(batch).toHaveTextContent('820 g');
    expect(screen.getByText('= 205 g each (partial, known ingredients only)')).toBeVisible();
  });

  it.each([
    ['en', en],
    ['es', es],
    ['de', deMessages],
    ['ar', ar],
  ] as const)(
    'discloses both partial values only when weights are omitted (%s)',
    async (locale, messages) => {
      const user = userEvent.setup();
      const panel = (rows: ComponentProps<typeof IngredientsPanel>['ingredients']) => (
        <IntlWrapper locale={locale} messages={messages}>
          <IngredientsPanel ingredients={rows} baseServings={4} servingsNoun={null} />
        </IntlWrapper>
      );
      const view = rtlRender(panel([...knownWeights, ...unknownWeights]));
      const copy = messages.ingredientsPanel;
      const weight = (grams: number) => `${new Intl.NumberFormat(locale).format(grams)} g`;
      const omittedPrefix = copy.omittedBatchWeights.split('{ingredients}')[0]!;
      await user.type(screen.getByRole('spinbutton', { name: copy.pieceCountAria }), '12');
      expect(screen.getByText(copy.partialBatchWeight)).toBeVisible();
      expect(screen.getByText(copy.partialEach.replace('{weight}', weight(80)))).toBeVisible();
      const explanation = screen.getByText((text) => text.startsWith(omittedPrefix));
      for (const item of unknownWeights) {
        expect(explanation).toHaveTextContent(item.item);
      }

      view.rerender(panel(knownWeights));
      expect(screen.getByText(copy.batchWeight)).toHaveTextContent(weight(960));
      expect(screen.getByText(copy.each.replace('{weight}', weight(80)))).toBeVisible();
      expect(screen.queryByText(copy.partialBatchWeight)).not.toBeInTheDocument();
      expect(screen.queryByText((text) => text.startsWith(omittedPrefix))).not.toBeInTheDocument();

      view.rerender(panel(unknownWeights));
      expect(
        screen.queryByRole('spinbutton', { name: copy.pieceCountAria }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(copy.batchWeight)).not.toBeInTheDocument();
      expect(screen.queryByText(copy.partialBatchWeight)).not.toBeInTheDocument();
    },
  );
});

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

describe('IngredientsPanel allergen display', () => {
  it('localizes German badges and titles while preserving author ingredient prose (#1210)', () => {
    rtlRender(
      <IntlWrapper locale="de" messages={deMessages}>
        <IngredientsPanel
          ingredients={[
            { ...ingredients[0]!, item: 'flour', note: 'Family flour note' },
            { ...ingredients[0]!, id: 'egg', item: 'large eggs' },
            { ...ingredients[0]!, id: 'milk', item: 'whole milk' },
          ]}
          baseServings={4}
          servingsNoun={null}
        />
      </IntlWrapper>,
    );

    for (const label of ['Weizen/Gluten', 'Eier', 'Milchprodukte']) {
      expect(screen.getByTitle(`Enthält ${label}`)).toHaveTextContent(`Enthält ${label}`);
    }
    expect(screen.queryAllByTitle(/Dairy|Eggs|Wheat\/gluten/)).toHaveLength(0);
    expect(screen.getByRole('button', { name: /flour.*Family flour note/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /large eggs/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /whole milk/ })).toBeInTheDocument();
  });
});

describe('IngredientsPanel Scale to target bounds (#1180)', () => {
  const spaghetti = [{ ...ingredients[0]!, id: 'spaghetti', item: 'spaghetti', quantity: 400 }];

  it.each(['50', '99.999', '100000.001', '100001', '1e308'])(
    'keeps unsupported target %s editable without applying clamped servings',
    async (target) => {
      const user = userEvent.setup();
      const onServingsChange = vi.fn();
      render(
        <IngredientsPanel
          ingredients={spaghetti}
          baseServings={4}
          servingsNoun="servings"
          controls={{
            servings: 4,
            onServingsChange,
            system: 'original',
            onSystemChange: vi.fn(),
            checked: new Set(),
            onToggleChecked: vi.fn(),
          }}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Scale to…' }));
      const amount = screen.getByRole('spinbutton', { name: 'Target amount' });
      fireEvent.change(amount, { target: { value: target } });

      expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
      expect(amount).toHaveAttribute('aria-invalid', 'true');
      expect(amount).toHaveAccessibleDescription(
        'This target needs fewer than 1 or more than 1000 servings. Change the amount to stay within that range.',
      );
      fireEvent.submit(amount.closest('form')!);
      expect(onServingsChange).not.toHaveBeenCalled();
      expect(screen.getByRole('spinbutton', { name: 'Target amount' })).toHaveValue(Number(target));
      expect(screen.getByRole('button', { name: /400\s*g\s*spaghetti/ })).toBeInTheDocument();

      await user.clear(amount);
      await user.type(amount, '150');
      expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
      expect(amount).not.toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByText('≈ ⅜× the recipe, 1½ servings')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Apply' }));
      expect(onServingsChange).toHaveBeenCalledExactlyOnceWith(1.5);
      expect(screen.queryByRole('spinbutton', { name: 'Target amount' })).not.toBeInTheDocument();
    },
  );

  it.each([
    ['100', 'g', 1, '100'],
    ['100000', 'g', 1000, '100000'],
    ['150', 'g', 1.5, '150'],
    ['123.456', 'g', 1.23456, '123'],
    ['0.15', 'kg', 1.5, '150'],
  ])(
    'applies valid target %s %s without rounding servings',
    async (target, unit, expected, amount) => {
      const user = userEvent.setup();
      let currentServings = 4;
      function Panel() {
        const [servings, setServings] = useState(4);
        currentServings = servings;
        return (
          <IngredientsPanel
            ingredients={spaghetti}
            baseServings={4}
            servingsNoun="servings"
            controls={{
              servings,
              onServingsChange: setServings,
              system: 'original',
              onSystemChange: vi.fn(),
              checked: new Set(),
              onToggleChecked: vi.fn(),
            }}
          />
        );
      }
      render(<Panel />);
      await user.click(screen.getByRole('button', { name: 'Scale to…' }));
      await user.type(screen.getByRole('spinbutton', { name: 'Target amount' }), target);
      const unitInput = screen.getByRole('textbox', { name: 'Unit' });
      await user.clear(unitInput);
      await user.type(unitInput, unit);
      expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
      screen.getByRole('button', { name: 'Apply' }).focus();
      await user.keyboard('{Enter}');
      expect(currentServings).toBeCloseTo(expected, 10);
      expect(
        screen.getByRole('button', { name: new RegExp(`${amount}\\s*g\\s*spaghetti`) }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('spinbutton', { name: 'Target amount' })).not.toBeInTheDocument();
    },
  );

  it('rejects incompatible units but accepts a valid fractional uncontrolled target', async () => {
    const user = userEvent.setup();
    render(<IngredientsPanel ingredients={spaghetti} baseServings={4} servingsNoun="servings" />);
    await user.click(screen.getByRole('button', { name: 'Scale to…' }));
    await user.type(screen.getByRole('spinbutton', { name: 'Target amount' }), '150');
    const unit = screen.getByRole('textbox', { name: 'Unit' });
    await user.clear(unit);
    await user.type(unit, 'cup');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    expect(
      screen.getByText("That amount can't be converted to this ingredient's unit."),
    ).toBeInTheDocument();
    await user.clear(unit);
    await user.type(unit, 'g');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByRole('button', { name: /150\s*g\s*spaghetti/ })).toBeInTheDocument();
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
