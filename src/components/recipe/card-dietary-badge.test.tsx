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
  {
    id: 'm1',
    name: 'Ada',
    allergens: ['dairy'],
    diets: [],
    customRestrictions: [],
  },
  { id: 'm2', name: 'Bo', allergens: [], diets: [], customRestrictions: [] },
];

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

  it('renders author-confirmed declarations without an active profile', () => {
    render(
      <CardDietaryBadge members={MEMBERS} assessments={[]} declared={['vegetarian']} signedIn />,
    );
    expect(
      screen.getByRole('button', { name: /vegetarian.*confirmed by recipe author/i }),
    ).toBeInTheDocument();
  });

  it('renders only assessment rules relevant to the active profile', () => {
    useActiveMemberStore.setState({ activeMemberId: 'm1' });
    render(
      <CardDietaryBadge
        members={MEMBERS}
        assessments={[assessment(), assessment({ ruleId: 'allergen:soy', verdict: 'conflicts' })]}
        declared={[]}
        signedIn
      />,
    );
    expect(screen.getByRole('button', { name: /dairy-free/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /contains soy/i })).not.toBeInTheDocument();
  });

  it('never reassures from missing assessment coverage', () => {
    useActiveMemberStore.setState({ activeMemberId: 'm1' });
    const { container } = render(
      <CardDietaryBadge members={MEMBERS} assessments={[]} declared={[]} signedIn />,
    );
    expect(container).toBeEmptyDOMElement();
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
