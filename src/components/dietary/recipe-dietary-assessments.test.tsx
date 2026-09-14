import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { IntlWrapper } from '~/test/intl';
import { RecipeDietaryAssessments } from './recipe-dietary-assessments';

afterEach(cleanup);

describe('RecipeDietaryAssessments', () => {
  it('shows confirmed results first and keeps automated findings secondary', () => {
    render(
      <IntlWrapper>
        <RecipeDietaryAssessments
          assessments={[
            {
              ruleId: 'composition:vegetarian',
              source: 'author-confirmed',
              verdict: 'meets',
              confidence: null,
              recognizedIngredients: 2,
              totalIngredients: 2,
              attentionIngredients: [],
            },
            {
              ruleId: 'allergen:dairy',
              source: 'deterministic',
              verdict: 'conflicts',
              confidence: 'high',
              recognizedIngredients: 2,
              totalIngredients: 2,
              attentionIngredients: [{ ingredientId: 'milk', name: 'milk', kind: 'conflict' }],
            },
            ...Array.from({ length: 6 }, (_, index) => ({
              ruleId: index === 0 ? 'composition:vegan' : `rule:${index}`,
              source: 'deterministic' as const,
              verdict: 'meets' as const,
              confidence: 'high' as const,
              recognizedIngredients: 2,
              totalIngredients: 2,
              attentionIngredients: [],
            })),
          ]}
        />
      </IntlWrapper>,
    );

    expect(screen.getByRole('heading', { name: 'Dietary fit' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Vegetarian\. Status: Suitable/ }),
    ).toBeInTheDocument();
    const automated = screen.getByText('Review 7 automated findings').closest('details');
    expect(automated).not.toBeNull();
    expect(
      within(automated!).getByRole('button', { name: /Dairy-free\. Status: Review suggested/ }),
    ).toBeInTheDocument();
  });

  it('keeps public inferred results in one qualified disclosure', () => {
    render(
      <IntlWrapper>
        <RecipeDietaryAssessments
          limitPublicInferred
          assessments={Array.from({ length: 4 }, (_, index) => ({
            ruleId: `rule:${index}`,
            source: 'deterministic' as const,
            verdict: 'meets' as const,
            confidence: 'high' as const,
            recognizedIngredients: 2,
            totalIngredients: 2,
            attentionIngredients: [],
          }))}
        />
      </IntlWrapper>,
    );

    const disclosure = screen.getByText('Review 4 automated findings').closest('details');
    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(disclosure).not.toBeNull();
    expect(within(disclosure!).getAllByRole('button')).toHaveLength(4);
  });

  it('withholds medium and needs-review assessments from public viewers', () => {
    const { container } = render(
      <IntlWrapper>
        <RecipeDietaryAssessments
          limitPublicInferred
          assessments={[
            {
              ruleId: 'composition:vegan',
              source: 'deterministic',
              verdict: 'meets',
              confidence: 'medium',
              recognizedIngredients: 1,
              totalIngredients: 2,
              attentionIngredients: [],
            },
            {
              ruleId: 'allergen:dairy',
              source: 'deterministic',
              verdict: 'unknown',
              confidence: 'needs-review',
              recognizedIngredients: 1,
              totalIngredients: 2,
              attentionIngredients: [{ ingredientId: 'milk', name: 'milk', kind: 'unresolved' }],
            },
          ]}
        />
      </IntlWrapper>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('offers Family analysis for signed-in review results without the entitlement', async () => {
    const user = userEvent.setup();
    render(
      <IntlWrapper>
        <RecipeDietaryAssessments
          signedIn
          assessments={[
            {
              ruleId: 'allergen:dairy',
              source: 'deterministic',
              verdict: 'unknown',
              confidence: 'needs-review',
              recognizedIngredients: 0,
              totalIngredients: 1,
              attentionIngredients: [
                { ingredientId: 'milk', name: 'milk substitute', kind: 'unresolved' },
              ],
            },
          ]}
        />
      </IntlWrapper>,
    );

    await user.click(screen.getByRole('button', { name: /Dairy-free\. Status: Review suggested/ }));
    expect(screen.getByRole('link', { name: 'Resolve with Family' })).toHaveAttribute(
      'href',
      '/pricing',
    );
  });

  it('moves authorized correction actions to the matching ingredient control', async () => {
    const user = userEvent.setup();
    render(
      <IntlWrapper>
        <RecipeDietaryAssessments
          canReview
          assessments={[
            {
              ruleId: 'allergen:dairy',
              source: 'deterministic',
              verdict: 'conflicts',
              confidence: 'high',
              recognizedIngredients: 1,
              totalIngredients: 1,
              attentionIngredients: [{ ingredientId: 'milk', name: 'milk', kind: 'conflict' }],
            },
          ]}
        />
        <details>
          <summary>Review ingredient analysis</summary>
          <section id="dietary-correction-milk" tabIndex={-1}>
            Review milk
          </section>
        </details>
      </IntlWrapper>,
    );

    await user.click(screen.getByRole('button', { name: /Dairy-free\. Status: Review suggested/ }));
    await user.click(screen.getByRole('button', { name: 'Correct assessment' }));
    expect(screen.getByText('Review ingredient analysis').closest('details')).toHaveAttribute(
      'open',
    );
    expect(screen.getByText('Review milk')).toHaveFocus();
  });
});
