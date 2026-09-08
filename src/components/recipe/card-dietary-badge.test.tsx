import { cleanup, render as rtlRender, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type * as React from 'react';

import { CardDietaryBadge, type CardDietaryMember } from './card-dietary-badge';
import { useActiveMemberStore } from '~/lib/active-member-store';
import { IntlWrapper } from '~/test/intl';
import type { DietaryAssessmentView } from '~/lib/dietary-presentation';

function render(ui: React.ReactElement) {
  return rtlRender(<IntlWrapper>{ui}</IntlWrapper>);
}

afterEach(cleanup);

const MEMBERS: CardDietaryMember[] = [
  { id: 'm1', name: 'Ada', allergens: ['dairy'] },
  { id: 'm2', name: 'Bo', allergens: [] },
];
const DIETARY = {
  ingredients: [
    { id: 'milk', name: 'milk' },
    { id: 'salt', name: 'salt' },
  ],
  assessments: [
    {
      ruleId: 'allergen:dairy',
      source: 'deterministic' as const,
      verdict: 'meets' as const,
      confidence: 'high' as const,
      recognizedIngredients: 2,
      totalIngredients: 2,
      attentionIngredients: [],
    },
  ],
};

function assessment(overrides: Partial<DietaryAssessmentView> = {}): DietaryAssessmentView {
  return {
    ruleId: 'allergen:dairy',
    scope: 'canonical',
    profileId: null,
    source: 'deterministic',
    verdict: 'meets',
    confidence: 'high',
    recognizedIngredients: 2,
    totalIngredients: 2,
    evidence: [],
    ...overrides,
  };
}

describe('CardDietaryBadge', () => {
  beforeEach(() => {
    useActiveMemberStore.setState({ activeMemberId: null });
  });

  it('renders nothing when no member is active', () => {
    const { container } = render(<CardDietaryBadge members={MEMBERS} dietary={DIETARY} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the active member has no recorded allergies', () => {
    useActiveMemberStore.setState({ activeMemberId: 'm2' });
    const { container } = render(<CardDietaryBadge members={MEMBERS} dietary={DIETARY} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the aggregate active-profile assessment with its details count', () => {
    useActiveMemberStore.setState({ activeMemberId: 'm1' });
    render(<CardDietaryBadge members={MEMBERS} dietary={DIETARY} />);
    expect(
      screen.getByRole('button', { name: /Ada: 1 dietary check.*Suitable/i }),
    ).toBeInTheDocument();
  });

  it('fails closed when a required assessment is missing', () => {
    useActiveMemberStore.setState({ activeMemberId: 'm1' });
    render(
      <CardDietaryBadge
        members={MEMBERS}
        dietary={{ ingredients: DIETARY.ingredients, assessments: [] }}
      />,
    );
    expect(screen.getByRole('button', { name: /Status: Needs review/i })).toBeInTheDocument();
  });

  it('keeps deterministic conflict precedence', () => {
    useActiveMemberStore.setState({ activeMemberId: 'm1' });
    render(
      <CardDietaryBadge
        members={MEMBERS}
        dietary={{
          ...DIETARY,
          assessments: [
            ...DIETARY.assessments,
            {
              ...DIETARY.assessments[0]!,
              verdict: 'conflicts',
              attentionIngredients: [{ ingredientId: 'milk', name: 'milk', kind: 'conflict' }],
            },
          ],
        }}
      />,
    );
    expect(screen.getByRole('button', { name: /Status: Conflict/i })).toBeInTheDocument();
  });

  it('uses canonical assessments when no member profile is active', () => {
    render(
      <CardDietaryBadge members={MEMBERS} assessments={[assessment()]} declared={[]} signedIn />,
    );

    expect(screen.getByRole('button', { name: /dairy-free/i })).toBeInTheDocument();
  });

  it('uses real auth context when deciding whether a review assessment is visible', () => {
    const review = assessment({
      verdict: 'unknown',
      confidence: 'needs-review',
      evidence: [
        {
          ingredientId: 'seasoning',
          ingredient: 'seasoning blend',
          finding: 'unresolved',
        },
      ],
    });
    const { rerender } = render(
      <CardDietaryBadge members={[]} assessments={[review]} declared={[]} signedIn={false} />,
    );
    expect(screen.queryByRole('button', { name: /needs review/i })).not.toBeInTheDocument();

    rerender(
      <IntlWrapper>
        <CardDietaryBadge members={[]} assessments={[review]} declared={[]} signedIn />
      </IntlWrapper>,
    );
    expect(screen.getByRole('button', { name: /needs review/i })).toBeInTheDocument();
  });
});
