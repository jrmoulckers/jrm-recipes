import { cleanup, render, screen, within } from '@testing-library/react';
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
});
