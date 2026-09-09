'use client';

import { useTranslations } from 'next-intl';

import type { DietaryAssessmentView } from '~/lib/dietary-presentation';
import { DietaryAssessmentBadge } from './dietary-assessment-badge';

const RULE_LABEL_KEYS: Readonly<Record<string, string>> = {
  'allergen:peanut': 'allergenPeanut',
  'allergen:tree-nut': 'allergenTreeNut',
  'allergen:dairy': 'allergenDairy',
  'allergen:egg': 'allergenEgg',
  'allergen:soy': 'allergenSoy',
  'allergen:wheat': 'allergenWheat',
  'allergen:fish': 'allergenFish',
  'allergen:shellfish': 'allergenShellfish',
  'allergen:sesame': 'allergenSesame',
  'composition:vegan': 'vegan',
  'composition:vegetarian': 'vegetarian',
  'composition:pescatarian': 'pescatarian',
  'confirmation:celiac-safe': 'celiacSafe',
  'confirmation:kosher': 'kosher',
  'confirmation:halal': 'halal',
};

function badgeStatus(assessment: DietaryAssessmentView): 'suitability' | 'conflict' | 'review' {
  if (assessment.verdict === 'conflicts') return 'conflict';
  if (assessment.verdict === 'unknown' || assessment.confidence === 'medium') return 'review';
  return 'suitability';
}

function focusIngredientCorrection(ingredientId: string): boolean {
  const focusTarget = () => {
    const target = document.getElementById(`dietary-correction-${ingredientId}`);
    if (!(target instanceof HTMLDetailsElement)) return false;
    target.open = true;
    target.querySelector<HTMLElement>('summary')?.focus({ preventScroll: true });
    target.scrollIntoView?.({
      block: 'center',
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
    return true;
  };
  if (focusTarget()) return true;
  const recipeTab = document.getElementById('recipe-tab-trigger');
  if (!(recipeTab instanceof HTMLButtonElement)) return false;
  recipeTab.click();
  window.setTimeout(() => {
    if (!focusTarget()) recipeTab.focus();
  });
  return true;
}

function AssessmentBadge({
  assessment,
  canReview,
}: {
  assessment: DietaryAssessmentView;
  canReview: boolean;
}) {
  const t = useTranslations('dietary.assessments');
  const labelKey = RULE_LABEL_KEYS[assessment.ruleId];
  const label = labelKey && t.has(`rules.${labelKey}`) ? t(`rules.${labelKey}`) : assessment.ruleId;
  const provenance =
    assessment.source === 'author-confirmed'
      ? ({ kind: 'author-confirmed', source: t('authorSource') } as const)
      : ({
          kind: 'ingredient-analyzed',
          confidence: assessment.confidence ?? 'needs-review',
        } as const);

  return (
    <DietaryAssessmentBadge
      label={label}
      status={badgeStatus(assessment)}
      provenance={provenance}
      recognizedIngredients={assessment.recognizedIngredients}
      totalIngredients={assessment.totalIngredients}
      attentionIngredients={assessment.attentionIngredients}
      action={
        canReview && assessment.attentionIngredients[0]
          ? {
              kind: assessment.verdict === 'conflicts' ? 'correct' : 'review',
              restoreFocus: false,
              onSelect: () =>
                focusIngredientCorrection(assessment.attentionIngredients[0]!.ingredientId),
            }
          : undefined
      }
    />
  );
}

export function RecipeDietaryAssessments({
  assessments,
  limitPublicInferred = false,
  canReview = false,
}: {
  assessments: DietaryAssessmentView[];
  limitPublicInferred?: boolean;
  canReview?: boolean;
}) {
  const t = useTranslations('dietary.assessments');
  const visibleAssessments = limitPublicInferred
    ? assessments.filter(
        (assessment) =>
          assessment.source === 'author-confirmed' ||
          (assessment.confidence === 'high' && assessment.verdict !== 'unknown'),
      )
    : assessments;
  if (visibleAssessments.length === 0) return null;

  let inferredCount = 0;
  const [primary, remaining] = visibleAssessments.reduce<
    [DietaryAssessmentView[], DietaryAssessmentView[]]
  >(
    (groups, assessment) => {
      const inferred = assessment.source !== 'author-confirmed' && assessment.confidence === 'high';
      if (inferred) inferredCount += 1;
      const deferred = limitPublicInferred ? inferred && inferredCount > 3 : groups[0].length >= 6;
      groups[deferred ? 1 : 0].push(assessment);
      return groups;
    },
    [[], []],
  );
  return (
    <section className="flex flex-col gap-3" aria-labelledby="dietary-assessments-heading">
      <div>
        <h2 id="dietary-assessments-heading" className="font-display text-xl font-bold">
          {t('title')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {primary.map((assessment) => (
          <AssessmentBadge key={assessment.ruleId} assessment={assessment} canReview={canReview} />
        ))}
      </div>
      {remaining.length > 0 && (
        <details className="group">
          <summary className="min-h-11 w-fit cursor-pointer content-center rounded-md px-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {t('more', { count: remaining.length })}
          </summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {remaining.map((assessment) => (
              <AssessmentBadge
                key={assessment.ruleId}
                assessment={assessment}
                canReview={canReview}
              />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
