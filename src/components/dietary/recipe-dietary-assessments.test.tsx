import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { IntlWrapper } from '~/test/intl';
import { RecipeDietaryAssessments } from './recipe-dietary-assessments';

afterEach(cleanup);

describe('RecipeDietaryAssessments', () => {
  it('prioritizes attention results and keeps additional rules available', () => {
    render(
      <IntlWrapper>
        <RecipeDietaryAssessments
          assessments={[
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

    expect(screen.getByRole('heading', { name: 'Dietary assessments' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Dairy-free\. Status: Conflict/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('Show 1 more assessments')).toBeInTheDocument();
  });

  it('keeps public inferred results beyond the first three in the disclosure', () => {
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

    const disclosure = screen.getByText('Show 1 more assessments').closest('details');
    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(disclosure).not.toBeNull();
    expect(within(disclosure!).getAllByRole('button')).toHaveLength(1);
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

    await user.click(screen.getByRole('button', { name: /Dairy-free\. Status: Needs review/ }));
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
        <details id="dietary-correction-milk">
          <summary>Review milk</summary>
        </details>
      </IntlWrapper>,
    );

    await user.click(screen.getByRole('button', { name: /Dairy-free\. Status: Conflict/ }));
    await user.click(screen.getByRole('button', { name: 'Correct assessment' }));
    expect(screen.getByText('Review milk').closest('details')).toHaveAttribute('open');
    expect(screen.getByText('Review milk')).toHaveFocus();
  });
});
