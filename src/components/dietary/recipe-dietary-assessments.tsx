'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import {
  DietaryAssessmentBadge,
  type DietaryAttentionIngredient,
} from './dietary-assessment-badge';
import {
  dietaryAssessmentStatus,
  effectiveDietaryAssessmentViews,
  type DietaryAssessmentView,
} from '~/lib/dietary-presentation';
import { dietaryRuleIdsForTag } from '~/lib/dietary-projection';
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
  canUseAdvancedAnalysis = false,
  className,
}: {
  assessments: DietaryAssessmentView[];
  declared?: DietaryTag[];
  signedIn: boolean;
  canReview?: boolean;
  canUseAdvancedAnalysis?: boolean;
  className?: string;
}) {
  const t = useTranslations('dietary.assessments');
  const tNames = useTranslations('classificationNames');
  const activeProfileId = useActiveMemberStore((state) => state.activeMemberId);
  const [expanded, setExpanded] = React.useState(false);

  const inferred = React.useMemo(() => {
    const activeAssessments = assessments.filter((assessment) =>
      activeProfileId
        ? assessment.scope === 'canonical' ||
          (assessment.scope === 'profile' && assessment.profileId === activeProfileId)
        : assessment.scope === 'canonical',
    );
    return effectiveDietaryAssessmentViews(activeAssessments)
      .filter(
        (assessment) =>
          signedIn ||
          (assessment.scope === 'canonical' &&
            assessment.confidence === 'high' &&
            assessment.verdict !== 'unknown'),
      )
      .sort((left, right) => {
        const verdictPriority =
          Number(right.verdict === 'conflicts') - Number(left.verdict === 'conflicts');
        const leftPriority = left.profileId === activeProfileId ? 0 : 1;
        const rightPriority = right.profileId === activeProfileId ? 0 : 1;
        return (
          verdictPriority || leftPriority - rightPriority || left.ruleId.localeCompare(right.ruleId)
        );
      });
  }, [activeProfileId, assessments, signedIn]);

  const conflictingRuleIds = React.useMemo(
    () =>
      new Set(
        inferred
          .filter((assessment) => assessment.verdict === 'conflicts')
          .map((assessment) => assessment.ruleId),
      ),
    [inferred],
  );
  const visibleDeclarations = React.useMemo(
    () =>
      declared.filter((tag) =>
        dietaryRuleIdsForTag(tag).every((ruleId) => !conflictingRuleIds.has(ruleId)),
      ),
    [conflictingRuleIds, declared],
  );
  const declaredConflictingRuleIds = React.useMemo(
    () =>
      new Set(
        declared.flatMap((tag) =>
          dietaryRuleIdsForTag(tag).filter((ruleId) => conflictingRuleIds.has(ruleId)),
        ),
      ),
    [conflictingRuleIds, declared],
  );
  const declaredRuleIds = React.useMemo(
    () => new Set(visibleDeclarations.flatMap((tag) => [...dietaryRuleIdsForTag(tag)])),
    [visibleDeclarations],
  );
  const mergedAssessments = React.useMemo(
    () =>
      inferred.filter(
        (assessment) =>
          !declaredRuleIds.has(assessment.ruleId) &&
          (!declaredConflictingRuleIds.has(assessment.ruleId) ||
            assessment.verdict === 'conflicts'),
      ),
    [declaredConflictingRuleIds, declaredRuleIds, inferred],
  );
  const visibleInferred = expanded ? mergedAssessments : mergedAssessments.slice(0, 3);
  const hiddenCount = mergedAssessments.length - visibleInferred.length;
  if (visibleDeclarations.length === 0 && mergedAssessments.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {visibleDeclarations.map((tag) => (
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
              firstAttention && canReview
                ? {
                    kind: status === 'conflict' ? 'correct' : 'review',
                    restoreFocus: false,
                    onSelect: () => {
                      const openAndFocusCorrection = () => {
                        const target = document.getElementById(
                          `dietary-correction-${firstAttention.ingredientId}`,
                        );
                        if (!(target instanceof HTMLDetailsElement)) return false;
                        target.open = true;
                        target.scrollIntoView({
                          block: 'center',
                          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                            ? 'auto'
                            : 'smooth',
                        });
                        const ruleControl = Array.from(
                          target.querySelectorAll<HTMLElement>('[data-dietary-rule]'),
                        ).find((control) => control.dataset.dietaryRule === assessment.ruleId);
                        window.setTimeout(() =>
                          (ruleControl ?? target.querySelector<HTMLElement>('summary'))?.focus({
                            preventScroll: true,
                          }),
                        );
                        return true;
                      };

                      if (openAndFocusCorrection()) return true;

                      const recipeTab = document.getElementById('recipe-tab-trigger');
                      if (!(recipeTab instanceof HTMLButtonElement)) return false;
                      recipeTab.click();
                      window.setTimeout(() => {
                        if (!openAndFocusCorrection()) recipeTab.focus();
                      });
                      return true;
                    },
                  }
                : firstAttention && status === 'review' && signedIn && !canUseAdvancedAnalysis
                  ? {
                      kind: 'upgrade',
                      href: '/pricing',
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
      ) : expanded && mergedAssessments.length > 3 ? (
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
