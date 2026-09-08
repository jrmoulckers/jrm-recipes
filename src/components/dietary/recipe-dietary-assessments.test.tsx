import { cleanup, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useState, type ReactElement } from 'react';

import { RecipeDietaryAssessments } from './recipe-dietary-assessments';
import { IngredientsPanel } from '~/components/recipe/ingredients-panel';
import { type DietaryAssessmentView } from '~/lib/dietary-presentation';
import { IntlWrapper } from '~/test/intl';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

function render(ui: ReactElement) {
  return rtlRender(<IntlWrapper>{ui}</IntlWrapper>);
}

beforeAll(() => {
  const element = Element.prototype as unknown as Record<string, unknown>;
  element.hasPointerCapture ??= () => false;
  element.setPointerCapture ??= () => undefined;
  element.releasePointerCapture ??= () => undefined;
  element.scrollIntoView ??= () => undefined;
  window.matchMedia ??= () =>
    ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }) as unknown as MediaQueryList;
});

afterEach(cleanup);

const GLUTEN_CONFLICT: DietaryAssessmentView = {
  ruleId: 'allergen:wheat',
  scope: 'canonical',
  profileId: null,
  source: 'deterministic',
  verdict: 'conflicts',
  confidence: 'high',
  recognizedIngredients: 1,
  totalIngredients: 1,
  evidence: [{ ingredientId: 'flour', ingredient: 'wheat flour', finding: 'present' }],
};

function TabbedCorrectionFixture() {
  const [recipeTabOpen, setRecipeTabOpen] = useState(false);
  return (
    <>
      <RecipeDietaryAssessments assessments={[GLUTEN_CONFLICT]} signedIn canReview />
      <button
        id="recipe-tab-trigger"
        type="button"
        role="tab"
        aria-selected={recipeTabOpen}
        onClick={() => setRecipeTabOpen(true)}
      >
        Recipe
      </button>
      {!recipeTabOpen ? (
        <p>Timeline content</p>
      ) : (
        <details id="dietary-correction-flour">
          <summary>Review dietary evidence for wheat flour</summary>
          <select aria-label="Finding for gluten" data-dietary-rule="allergen:wheat">
            <option>Conflict</option>
          </select>
        </details>
      )}
    </>
  );
}

describe('RecipeDietaryAssessments', () => {
  it('lets a deterministic conflict replace a declaration for the same underlying rule', () => {
    render(
      <RecipeDietaryAssessments
        assessments={[GLUTEN_CONFLICT]}
        declared={['gluten-free']}
        signedIn
      />,
    );

    expect(
      screen.getByRole('button', { name: /contains gluten.*status: conflict/i }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', {
        name: /gluten-free.*confirmed by recipe author/i,
      }),
    ).not.toBeInTheDocument();
  });

  it('opens the correction disclosure and moves focus to the relevant rule control', async () => {
    const user = userEvent.setup();
    render(
      <>
        <RecipeDietaryAssessments assessments={[GLUTEN_CONFLICT]} signedIn canReview />
        <IngredientsPanel
          ingredients={[
            {
              id: 'flour',
              section: null,
              quantity: 1,
              quantityMax: null,
              unit: 'cup',
              item: 'wheat flour',
              note: null,
              optional: false,
            },
          ]}
          baseServings={1}
          servingsNoun={null}
          dietaryAssessments={[GLUTEN_CONFLICT]}
          canReviewDietary
        />
      </>,
    );

    await user.click(screen.getByRole('button', { name: /contains gluten.*status: conflict/i }));
    const assessment = await screen.findByRole('dialog');
    await user.click(within(assessment).getByRole('button', { name: /correct assessment/i }));

    const summary = screen.getByText('Review dietary evidence for wheat flour');
    const details = summary.closest('details');
    expect(details).toHaveAttribute('open');
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /finding for gluten/i })).toHaveFocus(),
    );
  }, 10_000);

  it('activates the Recipe tab before opening and focusing an unmounted correction', async () => {
    const user = userEvent.setup();
    render(<TabbedCorrectionFixture />);

    const recipeTab = screen.getByRole('tab', { name: 'Recipe' });
    expect(recipeTab).toHaveAttribute('aria-selected', 'false');
    expect(screen.queryByRole('combobox', { name: /finding for gluten/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /contains gluten.*status: conflict/i }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: /correct assessment/i,
      }),
    );

    expect(recipeTab).toHaveAttribute('aria-selected', 'true');
    const correction = await screen.findByRole('combobox', { name: /finding for gluten/i });
    await waitFor(() => expect(correction).toHaveFocus());
  });

  it('restores focus to the badge when no correction target or Recipe tab exists', async () => {
    const user = userEvent.setup();
    render(<RecipeDietaryAssessments assessments={[GLUTEN_CONFLICT]} signedIn canReview />);

    const trigger = screen.getByRole('button', {
      name: /contains gluten.*status: conflict/i,
    });
    await user.click(trigger);
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: /correct assessment/i,
      }),
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});
