'use client';

import { useActiveMemberStore } from '~/lib/active-member-store';
import { dietaryRuleIdsForTag } from '~/lib/dietary-projection';
import { type DietaryAssessmentView } from '~/lib/dietary-presentation';
import { type Allergen } from '~/lib/allergens';
import { type DietaryTag } from '~/lib/substitutions';
import { type CustomRestrictionSeverity } from '~/lib/dietary-assessment';
import { RecipeDietaryAssessments } from '~/components/dietary/recipe-dietary-assessments';

/** The active-member data a card needs to render its safe-for badge. */
export type CardDietaryMember = {
  id: string;
  name: string;
  allergens: Allergen[];
  diets: DietaryTag[];
  customRestrictions: {
    id: string;
    severity: CustomRestrictionSeverity;
  }[];
};

export function CardDietaryBadge({
  members,
  assessments,
  declared,
  signedIn,
}: {
  members: CardDietaryMember[];
  assessments: DietaryAssessmentView[];
  declared: DietaryTag[];
  signedIn: boolean;
}) {
  const activeMemberId = useActiveMemberStore((s) => s.activeMemberId);
  const member = members.find((m) => m.id === activeMemberId);
  const relevantRuleIds = new Set([
    ...(member?.allergens.map((allergen) => `allergen:${allergen}`) ?? []),
    ...(member?.diets.flatMap((diet) => dietaryRuleIdsForTag(diet)) ?? []),
  ]);
  const relevant = member
    ? assessments.filter(
        (assessment) =>
          (assessment.scope === 'canonical' && assessment.verdict === 'conflicts') ||
          assessment.profileId === member.id ||
          relevantRuleIds.has(assessment.ruleId),
      )
    : assessments.filter((assessment) => assessment.scope === 'canonical');
  if (relevant.length === 0 && declared.length === 0) return null;

  return (
    <RecipeDietaryAssessments
      assessments={relevant}
      declared={declared.slice(0, 1)}
      signedIn={signedIn}
      className="w-fit"
    />
  );
}
