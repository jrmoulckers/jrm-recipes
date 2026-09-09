import { cleanup, render as rtlRender, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type * as React from 'react';

import { CardDietaryBadge, type CardDietaryMember } from './card-dietary-badge';
import { useActiveMemberStore } from '~/lib/active-member-store';
import { IntlWrapper } from '~/test/intl';

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

describe('CardDietaryBadge', () => {
  beforeEach(() => {
    useActiveMemberStore.setState({ activeMemberId: null });
  });

  it('shows canonical high-confidence results when no member is active', () => {
    render(<CardDietaryBadge members={MEMBERS} dietary={DIETARY} />);
    expect(screen.getByRole('button', { name: /Dairy-free.*Suitable/i })).toBeInTheDocument();
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

  it('withholds medium-confidence results from signed-out cards', () => {
    const { container } = render(
      <CardDietaryBadge
        members={[]}
        dietary={{
          ...DIETARY,
          assessments: [{ ...DIETARY.assessments[0]!, confidence: 'medium' as const }],
        }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('announces medium-confidence signed-in results as needing review', () => {
    render(
      <CardDietaryBadge
        members={[]}
        signedIn
        dietary={{
          ...DIETARY,
          assessments: [{ ...DIETARY.assessments[0]!, confidence: 'medium' as const }],
        }}
      />,
    );
    expect(screen.getByRole('button', { name: /Status: Needs review/i })).toBeInTheDocument();
  });

  it('prioritizes conflicts before limiting profile-less cards to three badges', () => {
    render(
      <CardDietaryBadge
        members={[]}
        dietary={{
          ...DIETARY,
          assessments: [
            ...Array.from({ length: 3 }, (_, index) => ({
              ...DIETARY.assessments[0]!,
              ruleId: `rule:${index}`,
            })),
            {
              ...DIETARY.assessments[0]!,
              verdict: 'conflicts' as const,
              attentionIngredients: [
                { ingredientId: 'milk', name: 'milk', kind: 'conflict' as const },
              ],
            },
          ],
        }}
      />,
    );
    expect(
      screen.getByRole('button', { name: /Dairy-free.*Status: Conflict/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });
});
