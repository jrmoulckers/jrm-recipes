'use client';

import { useTranslations } from 'next-intl';

import {
  summarizeCardDietaryProfile,
  type CardDietaryData,
  type CustomRestrictionView,
  type DietaryProfileView,
} from '~/lib/dietary-presentation';
import type { Allergen } from '~/lib/allergens';
import type { DietaryTag } from '~/lib/substitutions';
import { useActiveMemberStore } from '~/lib/active-member-store';
import { DietaryAssessmentBadge } from '~/components/dietary/dietary-assessment-badge';

/** The active-member data a card needs to render its safe-for badge. */
export type CardDietaryMember = {
  id: string;
  name: string;
  allergens: Allergen[];
  diets?: DietaryTag[];
  customRestrictions?: CustomRestrictionView[];
};

/**
 * One compact, active-profile result for a recipe card. The summary is derived
 * from current assessment facts and exact custom terms; it is never persisted
 * as a new verdict.
 */
export function CardDietaryBadge({
  members,
  dietary,
}: {
  members: CardDietaryMember[];
  dietary: CardDietaryData;
}) {
  const activeMemberId = useActiveMemberStore((s) => s.activeMemberId);
  const member = members.find((m) => m.id === activeMemberId);
  const t = useTranslations('dietary.cardAssessment');
  const tAssessments = useTranslations('dietary.assessments');
  if (!member) return null;
  const profile: DietaryProfileView = {
    ...member,
    diets: member.diets ?? [],
    customRestrictions: member.customRestrictions ?? [],
  };
  const summary = summarizeCardDietaryProfile(profile, dietary);
  if (!summary) return null;

  return (
    <DietaryAssessmentBadge
      label={t('label', { name: member.name, count: summary.detailsCount })}
      status={summary.status}
      provenance={
        summary.provenance === 'author-confirmed'
          ? {
              kind: 'author-confirmed',
              source: tAssessments('authorSource'),
            }
          : {
              kind: 'ingredient-analyzed',
              confidence: summary.confidence,
            }
      }
      recognizedIngredients={summary.recognizedIngredients}
      totalIngredients={summary.totalIngredients}
      attentionIngredients={summary.attentionIngredients}
    />
  );
}
