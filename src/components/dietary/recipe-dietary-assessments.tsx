'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import {
  DietaryAssessmentBadge,
  type DietaryAttentionIngredient,
} from './dietary-assessment-badge';
import { dietaryAssessmentStatus, type DietaryAssessmentView } from '~/lib/dietary-presentation';
import { useActiveMemberStore } from '~/lib/active-member-store';
import { type DietaryTag } from '~/lib/substitutions';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';

function ruleLabelKey(ruleId: string): string {
  return ruleId.replace(':', '.');
}

export function RecipeDietaryAssessments({
  assessments,
  declared = [],
  signedIn,
  canReview = false,
  className,
}: {
  assessments: DietaryAssessmentView[];
  declared?: DietaryTag[];
  signedIn: boolean;
  canReview?: boolean;
  className?: string;
}) {
  const t = useTranslations('dietary.assessments');
  const tNames = useTranslations('classificationNames');
  const activeProfileId = useActiveMemberStore((state) => state.activeMemberId);
  const [expanded, setExpanded] = React.useState(false);

  const inferred = React.useMemo(
    () =>
      assessments
        .filter(
          (assessment) =>
            signedIn ||
            (assessment.scope === 'canonical' &&
              assessment.confidence === 'high' &&
              assessment.verdict !== 'unknown'),
        )
        .sort((left, right) => {
          const leftPriority = left.profileId === activeProfileId ? 0 : 1;
          const rightPriority = right.profileId === activeProfileId ? 0 : 1;
          return leftPriority - rightPriority || left.ruleId.localeCompare(right.ruleId);
        }),
    [activeProfileId, assessments, signedIn],
  );

  const visibleInferred = expanded ? inferred : inferred.slice(0, 3);
  const hiddenCount = inferred.length - visibleInferred.length;
  if (declared.length === 0 && inferred.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {declared.map((tag) => (
        <DietaryAssessmentBadge
          key={`declared:${tag}`}
          label={tNames(tag)}
          status="suitability"
          provenance={{ kind: 'author-confirmed', source: t('recipeAuthor') }}
          recognizedIngredients={0}
          totalIngredients={0}
          limitation="cross-contact"
        />
      ))}
      {visibleInferred.map((assessment) => {
        const status = dietaryAssessmentStatus(assessment);
        const baseLabel = t(`rules.${ruleLabelKey(assessment.ruleId)}`);
        const label = assessment.ruleId.startsWith('allergen:')
          ? status === 'suitability'
            ? t('labels.allergenMeets', { rule: baseLabel })
            : status === 'conflict'
              ? t('labels.conflicts', { rule: baseLabel })
              : t('labels.review', { rule: baseLabel })
          : status === 'suitability'
            ? baseLabel
            : status === 'conflict'
              ? t('labels.notSuitable', { rule: baseLabel })
              : t('labels.review', { rule: baseLabel });
        const attentionIngredients: DietaryAttentionIngredient[] = [];
        for (const item of assessment.evidence) {
          if (item.finding === 'present') {
            attentionIngredients.push({ name: item.ingredient, kind: 'conflict' });
          } else if (item.finding === 'possible' || item.finding === 'unresolved') {
            attentionIngredients.push({ name: item.ingredient, kind: 'unresolved' });
          }
        }
        const firstAttention = assessment.evidence.find(
          (item) =>
            item.finding === 'present' ||
            item.finding === 'possible' ||
            item.finding === 'unresolved',
        );
        return (
          <DietaryAssessmentBadge
            key={`${assessment.scope}:${assessment.profileId ?? ''}:${assessment.ruleId}`}
            label={label}
            status={status}
            provenance={
              assessment.source === 'author-confirmed'
                ? { kind: 'author-confirmed', source: t('recipeAuthor') }
                : {
                    kind: 'ingredient-analyzed',
                    confidence: assessment.confidence ?? 'needs-review',
                  }
            }
            recognizedIngredients={assessment.recognizedIngredients}
            totalIngredients={assessment.totalIngredients}
            attentionIngredients={attentionIngredients}
            action={
              canReview && firstAttention
                ? {
                    kind: status === 'conflict' ? 'correct' : 'review',
                    onSelect: () => {
                      const target = document.getElementById(
                        `ingredient-${firstAttention.ingredientId}`,
                      );
                      target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                      target?.focus({ preventScroll: true });
                    },
                  }
                : undefined
            }
          />
        );
      })}
      {hiddenCount > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11 rounded-full"
          onClick={() => setExpanded(true)}
        >
          <Plus className="size-3.5" aria-hidden="true" />
          {t('more', { count: hiddenCount })}
        </Button>
      ) : expanded && inferred.length > 3 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11 rounded-full"
          onClick={() => setExpanded(false)}
        >
          {t('less')}
        </Button>
      ) : null}
    </div>
  );
}
