import { cleanup, fireEvent, render as rtlRender, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';

import { IntlWrapper } from '~/test/intl';
import esMessages from '~/messages/es.json';
import { NutritionPanel, type CalorieMember } from './nutrition-panel';
import { useActiveMemberStore } from '~/lib/active-member-store';
import { type Nutrition } from '~/lib/nutrition';

afterEach(cleanup);

function render(ui: ReactElement) {
  return rtlRender(<IntlWrapper>{ui}</IntlWrapper>);
}

const PER_SERVING: Nutrition = {
  calories: 500,
  proteinGrams: 20,
  sodiumMg: 300,
};

describe('NutritionPanel', () => {
  it('renders per-serving values by default', () => {
    render(<NutritionPanel nutrition={PER_SERVING} servings={4} servingsNoun="servings" />);
    const region = screen.getByRole('region', { name: /nutrition facts/i });
    expect(within(region).getByText(/amounts are per serving/i)).toBeInTheDocument();
    expect(within(region).getByText('500')).toBeInTheDocument();
  });

  it('shows the scaled whole-recipe total alongside per-serving figures', () => {
    render(<NutritionPanel nutrition={PER_SERVING} servings={4} servingsNoun="servings" />);
    const region = screen.getByRole('region', { name: /nutrition facts/i });
    // Still per-serving first…
    expect(within(region).getByText(/amounts are per serving/i)).toBeInTheDocument();
    // …with the whole-recipe total shown alongside: 500 × 4 = 2,000 kcal.
    expect(within(region).getByText(/whole recipe \(4 servings\):/i)).toBeInTheDocument();
    expect(within(region).getByText('2,000')).toBeInTheDocument();
  });

  it('multiplies to whole-recipe totals when toggled, using current servings', () => {
    render(<NutritionPanel nutrition={PER_SERVING} servings={4} />);
    fireEvent.click(screen.getByRole('button', { name: /whole recipe/i }));

    const region = screen.getByRole('region', { name: /nutrition facts/i });
    // 500 × 4 servings = 2,000 calories for the whole recipe.
    expect(within(region).getByText('2,000')).toBeInTheDocument();
    expect(within(region).getByText(/whole recipe ·/i)).toBeInTheDocument();
  });

  it('renders nothing when there is no nutrition data', () => {
    const { container } = render(<NutritionPanel nutrition={{ calories: null }} servings={4} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('flags high sodium with a %DV badge', () => {
    render(<NutritionPanel nutrition={{ sodiumMg: 874 }} servings={4} />);
    const flags = screen.getByRole('list', { name: /dietary flags/i });
    expect(within(flags).getByText(/high sodium · 38% dv/i)).toBeInTheDocument();
  });

  it('flags low sugar distinctly from high sodium', () => {
    render(<NutritionPanel nutrition={{ sodiumMg: 900, sugarGrams: 2 }} servings={4} />);
    const flags = screen.getByRole('list', { name: /dietary flags/i });
    expect(within(flags).getByText(/sodium ·/i)).toBeInTheDocument();
    expect(within(flags).getByText(/low sugars · 4% dv/i)).toBeInTheDocument();
  });

  it('labels cook-entered numbers by default', () => {
    render(<NutritionPanel nutrition={PER_SERVING} servings={4} />);
    expect(screen.getByText(/as entered by the cook/i)).toBeInTheDocument();
  });

  it('labels an estimate and cites full coverage without a caveat', () => {
    render(<NutritionPanel nutrition={PER_SERVING} servings={4} estimated sourced={3} total={3} />);
    expect(screen.getByText(/estimated from the ingredient list\./i)).toBeInTheDocument();
    expect(screen.queryByText(/of 3 ingredients/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/as entered by the cook/i)).not.toBeInTheDocument();
  });

  it("adds a coverage caveat when some ingredients weren't matched", () => {
    render(<NutritionPanel nutrition={PER_SERVING} servings={4} estimated sourced={2} total={5} />);
    expect(
      screen.getByText(/estimated from the ingredient list \(2 of 5 ingredients\)/i),
    ).toBeInTheDocument();
  });

  it('names the lines it could not weigh rather than only counting them (#1027)', () => {
    // A cook told *which* ingredient is missing can fix it by editing one unit.
    // A cook shown "2 of 5" cannot.
    render(
      <NutritionPanel
        nutrition={PER_SERVING}
        servings={4}
        estimated
        sourced={1}
        total={3}
        unresolved={[
          { label: '6 eggs', reason: 'weight' },
          { label: 'mystery powder', reason: 'facts' },
          // No text to show: counted in the estimate, but not listable.
          { label: '   ', reason: 'weight' },
        ]}
      />,
    );
    expect(screen.getByText(/couldn't weigh: 6 eggs\./i)).toBeInTheDocument();
    expect(screen.getByText(/no nutrition data for: mystery powder\./i)).toBeInTheDocument();
  });

  it('shows no unresolved caveat when every line resolved', () => {
    render(
      <NutritionPanel
        nutrition={PER_SERVING}
        servings={4}
        estimated
        sourced={3}
        total={3}
        unresolved={[]}
      />,
    );
    expect(screen.queryByText(/couldn't weigh/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no nutrition data for/i)).not.toBeInTheDocument();
  });

  it('resolves its copy from the Spanish catalog', () => {
    rtlRender(
      <IntlWrapper locale="es" messages={esMessages}>
        <NutritionPanel nutrition={PER_SERVING} servings={4} servingsNoun="raciones" />
      </IntlWrapper>,
    );
    const region = screen.getByRole('region', {
      name: /información nutricional/i,
    });
    expect(within(region).getByText(/las cantidades son por ración/i)).toBeInTheDocument();
    expect(
      screen.getByText(/valores estimados según los introdujo quien cocina/i),
    ).toBeInTheDocument();
  });
});

describe('NutritionPanel calorie goal (issue #430)', () => {
  const MEMBERS: CalorieMember[] = [
    { id: 'mom', name: 'Mom', calorieGoal: 2000 },
    { id: 'kid', name: 'Kid', calorieGoal: 1000 },
  ];

  beforeEach(() => {
    // The active-member selection is a persisted singleton. Reset between tests.
    useActiveMemberStore.setState({ activeMemberId: null });
  });

  it("frames a serving against the first member's goal by default", () => {
    render(<NutritionPanel nutrition={PER_SERVING} servings={4} members={MEMBERS} />);
    // 500 / 2000 = 25% of Mom's daily calories.
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText(/daily calories/i)).toBeInTheDocument();
  });

  it('updates the percentage when a different member is selected', () => {
    render(<NutritionPanel nutrition={PER_SERVING} servings={4} members={MEMBERS} />);
    fireEvent.change(screen.getByRole('combobox', { name: /family member for calorie goal/i }), {
      target: { value: 'kid' },
    });
    // 500 / 1000 = 50% of Kid's daily calories.
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('recomputes against whole-recipe calories when the basis is toggled', () => {
    render(<NutritionPanel nutrition={PER_SERVING} servings={4} members={MEMBERS} />);
    fireEvent.click(screen.getByRole('button', { name: /whole recipe/i }));
    // 500 × 4 = 2000 calories = 100% of Mom's 2000 goal.
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('shows no indicator when no members are provided', () => {
    render(<NutritionPanel nutrition={PER_SERVING} servings={4} />);
    expect(screen.queryByText(/daily calories/i)).not.toBeInTheDocument();
  });

  it('shows no indicator when no member has a calorie goal', () => {
    render(
      <NutritionPanel
        nutrition={PER_SERVING}
        servings={4}
        members={[{ id: 'dad', name: 'Dad', calorieGoal: null }]}
      />,
    );
    expect(screen.queryByText(/daily calories/i)).not.toBeInTheDocument();
  });
});
