'use client';

import { useTranslations } from 'next-intl';

import {
  summarizeCardDietaryProfile,
  type CardDietaryData,
  type CustomRestrictionView,
  type DietaryAssessmentView,
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

const RULE_LABEL_KEYS: Record<string, string> = {
  'allergen:dairy': 'allergenDairy',
  'allergen:egg': 'allergenEgg',
  'allergen:fish': 'allergenFish',
  'allergen:peanut': 'allergenPeanut',
  'allergen:sesame': 'allergenSesame',
  'allergen:shellfish': 'allergenShellfish',
  'allergen:soy': 'allergenSoy',
  'allergen:tree-nut': 'allergenTreeNut',
  'allergen:wheat': 'allergenWheat',
  'composition:vegan': 'vegan',
  'composition:vegetarian': 'vegetarian',
  'composition:pescatarian': 'pescatarian',
  'confirmation:celiac-safe': 'celiacSafe',
  'confirmation:halal': 'halal',
  'confirmation:kosher': 'kosher',
};

function statusFor(assessment: DietaryAssessmentView) {
  if (assessment.verdict === 'conflicts') return 'conflict' as const;
  if (
    assessment.verdict === 'unknown' ||
    assessment.confidence === 'medium' ||
    assessment.confidence === 'needs-review'
  ) {
    return 'review' as const;
  }
  return 'suitability' as const;
}

function publicCardAssessments(assessments: DietaryAssessmentView[], signedIn: boolean) {
  const byRule = new Map<string, DietaryAssessmentView>();
  for (const assessment of assessments) {
    if (
      !signedIn &&
      assessment.source !== 'author-confirmed' &&
      (assessment.confidence !== 'high' || assessment.verdict === 'unknown')
    ) {
      continue;
    }
    const current = byRule.get(assessment.ruleId);
    if (
      !current ||
      assessment.verdict === 'conflicts' ||
      (assessment.source === 'author-confirmed' && current.verdict !== 'conflicts')
    ) {
      byRule.set(assessment.ruleId, assessment);
    }
  }
  return [...byRule.values()]
    .sort((left, right) => {
      const statusRank = { conflict: 0, review: 1, suitability: 2 } as const;
      return (
        statusRank[statusFor(left)] - statusRank[statusFor(right)] ||
        left.ruleId.localeCompare(right.ruleId)
      );
    })
    .slice(0, 3);
}

/**
 * One compact, active-profile result for a recipe card. The summary is derived
 * from current assessment facts and exact custom terms; it is never persisted
 * as a new verdict.
 */
export function CardDietaryBadge({
  members,
  dietary,
  signedIn = false,
}: {
  members: CardDietaryMember[];
  dietary: CardDietaryData;
  signedIn?: boolean;
}) {
  const activeMemberId = useActiveMemberStore((s) => s.activeMemberId);
  const member = members.find((m) => m.id === activeMemberId);
  const t = useTranslations('dietary.cardAssessment');
  const tAssessments = useTranslations('dietary.assessments');
  if (!member) {
    const assessments = publicCardAssessments(dietary.assessments, signedIn);
    if (assessments.length === 0) return null;
    return (
      <div className="flex max-w-full flex-wrap gap-1.5">
        {assessments.map((assessment) => {
          const labelKey = RULE_LABEL_KEYS[assessment.ruleId];
          const label =
            labelKey && tAssessments.has(`rules.${labelKey}`)
              ? tAssessments(`rules.${labelKey}`)
              : assessment.ruleId;
          return (
            <DietaryAssessmentBadge
              key={assessment.ruleId}
              label={label}
              status={statusFor(assessment)}
              provenance={
                assessment.source === 'author-confirmed'
                  ? {
                      kind: 'author-confirmed',
                      source: tAssessments('authorSource'),
                    }
                  : {
                      kind: 'ingredient-analyzed',
                      confidence: assessment.confidence ?? 'needs-review',
                    }
              }
              recognizedIngredients={assessment.recognizedIngredients}
              totalIngredients={assessment.totalIngredients}
              attentionIngredients={assessment.attentionIngredients}
            />
          );
        })}
      </div>
    );
  }
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
