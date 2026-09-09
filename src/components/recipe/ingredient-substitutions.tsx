'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeftRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { cn } from '~/lib/utils';
import {
  getSubstitutions,
  isDietaryTag,
  matchIngredientDetailed,
  type DietaryTag,
} from '~/lib/substitutions';
import { safeSubstitutions } from '~/lib/dietary-match';
import { type Allergen } from '~/lib/allergens';
import {
  assessIngredientsDeterministically,
  deterministicEvidenceForIngredient,
  type AggregatedDietaryAssessment,
} from '~/lib/dietary-evidence';
import {
  type CustomRestrictionSeverity,
  type DietaryEvidenceFinding,
  type DietaryIngredientInput,
} from '~/lib/dietary-assessment';
import { BUILT_IN_DIETARY_RULES, type BuiltInDietaryRuleId } from '~/lib/dietary-rules';
import { matchesCustomRestriction } from '~/lib/custom-restriction-match';
import { Badge, type BadgeProps } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { applyIngredientSubstitutionAction } from '~/server/dietary/substitution-actions';

const TAG_VARIANT: Record<DietaryTag, NonNullable<BadgeProps['variant']>> = {
  vegan: 'success',
  vegetarian: 'secondary',
  'dairy-free': 'accent',
  'gluten-free': 'warning',
  'egg-free': 'muted',
  'nut-free': 'warning',
  'soy-free': 'muted',
  'shellfish-free': 'secondary',
  'fish-free': 'accent',
  'sesame-free': 'muted',
};

const FILTER_TAGS = [
  'vegan',
  'vegetarian',
  'dairy-free',
  'gluten-free',
  'egg-free',
] as const satisfies readonly DietaryTag[];

const FILTER_LABEL_KEY: Record<(typeof FILTER_TAGS)[number], string> = {
  vegan: 'vegan',
  vegetarian: 'vegetarian',
  'dairy-free': 'dairyFree',
  'gluten-free': 'glutenFree',
  'egg-free': 'eggFree',
};

const RULE_LABEL_KEY: Readonly<Partial<Record<BuiltInDietaryRuleId, string>>> = {
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
};

const PREVIEW_RULE_IDS = BUILT_IN_DIETARY_RULES.filter(
  (rule) => rule.kind !== 'confirmation-only',
).map((rule) => rule.id);

export type SubstitutionRecipePreview = {
  recipeId: string;
  updatedAt: string;
  ingredientId: string;
  ingredients: DietaryIngredientInput[];
  canApply: boolean;
};

export type SubstitutionDietaryImpact = {
  ruleId: BuiltInDietaryRuleId;
  before: Pick<AggregatedDietaryAssessment, 'verdict' | 'confidence'>;
  after: Pick<AggregatedDietaryAssessment, 'verdict' | 'confidence'>;
};

export type SubstitutionDietaryRule = {
  ruleId: BuiltInDietaryRuleId;
  dietaryTag: DietaryTag;
  currentFinding: DietaryEvidenceFinding;
};

export type SubstitutionCustomRestriction = {
  id: string;
  name: string;
  severity: CustomRestrictionSeverity;
  terms: readonly string[];
};

function candidateFinding(
  item: string,
  dietaryTags: readonly DietaryTag[],
  rule: SubstitutionDietaryRule,
): DietaryEvidenceFinding {
  const input: DietaryIngredientInput = {
    ingredientId: 'substitution-preview',
    item,
    amount: null,
    amountMax: null,
    unit: null,
    prep: null,
    linkedFood: null,
  };
  const evidence = deterministicEvidenceForIngredient(input, rule.ruleId);
  if (evidence.some((entry) => entry.finding === 'present')) return 'present';
  if (dietaryTags.includes(rule.dietaryTag)) return 'absent';
  if (evidence.some((entry) => entry.finding === 'possible')) return 'possible';
  if (evidence.some((entry) => entry.finding === 'unresolved')) return 'unresolved';
  return 'absent';
}

/**
 * Compare the complete recipe before and after a hypothetical swap. This is a
 * pure preview: it creates a replacement array and never writes or mutates the
 * caller's ingredient data.
 */
export function assessSubstitutionImpact(
  ingredients: readonly DietaryIngredientInput[],
  ingredientId: string,
  substitute: string,
): SubstitutionDietaryImpact[] {
  const previewIngredients = ingredients.map((ingredient) =>
    ingredient.ingredientId === ingredientId
      ? { ...ingredient, item: substitute, linkedFood: null }
      : ingredient,
  );

  return PREVIEW_RULE_IDS.flatMap((ruleId) => {
    const before = assessIngredientsDeterministically(ingredients, ruleId);
    const after = assessIngredientsDeterministically(previewIngredients, ruleId);
    if (before.verdict === after.verdict && before.confidence === after.confidence) return [];
    return [
      {
        ruleId,
        before: { verdict: before.verdict, confidence: before.confidence },
        after: { verdict: after.verdict, confidence: after.confidence },
      },
    ];
  });
}

/**
 * Subtle "swap" affordance shown only when an ingredient has known
 * substitutions. Opens a popover listing options with dietary tags. Renders
 * nothing when the ingredient has no match, so the list stays uncluttered.
 *
 * When the active family member can't have this ingredient (issue #429) the
 * trigger is `flagged` (warning-styled, with an explicit accessible label) and
 * the swap list is pre-filtered to `presetTags` so the safe option is the first
 * thing the cook sees.
 */
export function IngredientSubstitutions({
  item,
  className,
  flagged = false,
  presetTags,
  avoidAllergens,
  dietaryRules = [],
  customRestrictions = [],
  recipePreview,
}: {
  item: string;
  className?: string;
  flagged?: boolean;
  presetTags?: DietaryTag[];
  /**
   * The active member's FULL allergen set (issue #429 safety fix). When
   * provided, any swap whose own name/notes carry one of these allergens is
   * dropped. So a swap can never be presented as "safe" while introducing a
   * *different* one of the member's allergens (e.g. a cashew-based dairy swap
   * for a member who is also allergic to tree nuts).
   */
  avoidAllergens?: Allergen[];
  dietaryRules?: readonly SubstitutionDietaryRule[];
  customRestrictions?: readonly SubstitutionCustomRestriction[];
  /** Complete recipe context enables an in-memory impact preview and authorized apply. */
  recipePreview?: SubstitutionRecipePreview;
}) {
  const t = useTranslations('ingredientSubstitutions');
  const assessmentT = useTranslations('dietary.assessmentBadge');
  const rulesT = useTranslations('dietary.assessments');
  const panelT = useTranslations('ingredientsPanel');
  const router = useRouter();
  const presetKey = (presetTags ?? []).join('|');
  const [selectedTags, setSelectedTags] = React.useState<DietaryTag[]>(presetTags ?? []);
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const match = React.useMemo(() => matchIngredientDetailed(item), [item]);
  const substitutions = React.useMemo(
    () => safeSubstitutions(getSubstitutions(item, selectedTags), avoidAllergens ?? []),
    [item, selectedTags, avoidAllergens],
  );
  const impacts = React.useMemo(
    () =>
      new Map(
        substitutions.map((substitution) => [
          substitution.substitute,
          recipePreview
            ? assessSubstitutionImpact(
                recipePreview.ingredients,
                recipePreview.ingredientId,
                substitution.substitute,
              )
            : [],
        ]),
      ),
    [recipePreview, substitutions],
  );

  // Re-seed the filter when the active restriction changes (e.g. the cook picks
  // a different family member). Keyed on the joined tags so a same-content array
  // identity change doesn't clobber a manual toggle.
  React.useEffect(() => {
    setSelectedTags(presetKey.length > 0 ? presetKey.split('|').filter(isDietaryTag) : []);
  }, [presetKey]);

  if (!match) return null;

  const { entry, confidence } = match;
  const confidenceLabel = t(`confidence.${confidence}`);

  function toggleTag(tag: DietaryTag) {
    setSelectedTags((current) =>
      current.includes(tag) ? current.filter((selected) => selected !== tag) : [...current, tag],
    );
  }

  function impactLabel(impact: SubstitutionDietaryImpact) {
    const key = RULE_LABEL_KEY[impact.ruleId];
    const rule = key && rulesT.has(`rules.${key}`) ? rulesT(`rules.${key}`) : impact.ruleId;
    const status =
      impact.after.verdict === 'conflicts'
        ? assessmentT('status.conflict')
        : impact.after.verdict === 'unknown'
          ? assessmentT('status.review')
          : assessmentT('status.suitability');
    return `${rule}: ${status}`;
  }

  function applySubstitution(substitute: string) {
    if (!recipePreview?.canApply || isPending) return;
    setError(null);
    setAnnouncement(null);
    startTransition(async () => {
      const result = await applyIngredientSubstitutionAction({
        recipeId: recipePreview.recipeId,
        ingredientId: recipePreview.ingredientId,
        expectedItem: item,
        expectedRecipeUpdatedAt: recipePreview.updatedAt,
        substitute,
      });
      if (!result.ok) {
        setError(t('applyError'));
        return;
      }
      setAnnouncement(t('applied', { substitute }));
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={
              flagged
                ? t('safeSwapsAria', { item: entry.name.toLowerCase() })
                : t('substitutionsAria', { item: entry.name.toLowerCase() })
            }
            title={flagged ? t('safeSwapsTitle') : t('substitutionsTitle')}
            className={cn(
              'inline-flex size-11 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
              flagged
                ? 'text-warning hover:bg-warning/10'
                : 'text-muted-foreground hover:bg-muted hover:text-primary',
              className,
            )}
          >
            <ArrowLeftRight className="size-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="text-sm">
          <div className="mb-3 space-y-1.5">
            <div className="flex items-center gap-1.5 font-display text-sm font-semibold">
              <ArrowLeftRight className="size-3.5 text-primary" />
              {t('outOf', { item: entry.name.toLowerCase() })}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('confidenceMatch', { level: confidenceLabel })}
            </p>
          </div>
          <div role="group" aria-label={t('filterAria')} className="mb-3 flex flex-wrap gap-1.5">
            {FILTER_TAGS.map((tag) => {
              const selected = selectedTags.includes(tag);
              return (
                <Button
                  key={tag}
                  type="button"
                  size="sm"
                  variant={selected ? 'secondary' : 'outline'}
                  aria-pressed={selected}
                  onClick={() => toggleTag(tag)}
                  className="h-7 rounded-full px-2 text-xs"
                >
                  {t(`filters.${FILTER_LABEL_KEY[tag]}`)}
                </Button>
              );
            })}
          </div>
          {substitutions.length > 0 ? (
            <ul className="flex flex-col gap-2.5">
              {substitutions.map((sub, i) => {
                const dietaryImpacts = impacts.get(sub.substitute) ?? [];
                return (
                  <li
                    key={`${sub.substitute}-${i}`}
                    className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-border/70 p-2.5"
                  >
                    <span className="font-medium [overflow-wrap:anywhere]">{sub.substitute}</span>
                    <span className="text-xs leading-relaxed text-muted-foreground">
                      {sub.ratioOrNotes}
                    </span>
                    <SubstitutionProfileImpact
                      currentItem={item}
                      dietaryRules={dietaryRules}
                      customRestrictions={customRestrictions}
                      substituteTags={sub.dietaryTags ?? []}
                      substitute={`${sub.substitute} ${sub.ratioOrNotes}`}
                      avoidAllergens={avoidAllergens ?? []}
                    />
                    {sub.dietaryTags && sub.dietaryTags.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {sub.dietaryTags.map((tag) => (
                          <Badge
                            key={tag}
                            variant={TAG_VARIANT[tag]}
                            className="px-1.5 py-0 text-[10px]"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {dietaryImpacts.length > 0 && (
                      <div
                        className="mt-1 flex flex-wrap gap-1"
                        aria-label={assessmentT('detailsTitle', { label: sub.substitute })}
                      >
                        {dietaryImpacts.slice(0, 4).map((impact) => (
                          <Badge
                            key={impact.ruleId}
                            variant={impact.after.verdict === 'conflicts' ? 'warning' : 'muted'}
                            className="max-w-full whitespace-normal px-1.5 py-0 text-[10px]"
                          >
                            {impactLabel(impact)}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {recipePreview?.canApply && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-1 min-h-11 w-fit"
                        disabled={isPending}
                        onClick={() => applySubstitution(sub.substitute)}
                      >
                        {isPending ? t('applying') : panelT('apply')}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-lg bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              {t('noMatches')}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-xs leading-relaxed text-destructive">
              {error}
            </p>
          )}
        </PopoverContent>
      </Popover>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </>
  );
}

function SubstitutionProfileImpact({
  currentItem,
  dietaryRules,
  customRestrictions,
  substituteTags,
  substitute,
  avoidAllergens,
}: {
  currentItem: string;
  dietaryRules: readonly SubstitutionDietaryRule[];
  customRestrictions: readonly SubstitutionCustomRestriction[];
  substituteTags: readonly DietaryTag[];
  substitute: string;
  avoidAllergens: readonly Allergen[];
}) {
  const t = useTranslations('ingredientSubstitutions.impact');
  const tNames = useTranslations('classificationNames');
  const introducedAllergens = safeSubstitutions(
    [{ substitute, ratioOrNotes: '', dietaryTags: [...substituteTags] }],
    avoidAllergens,
  ).length
    ? []
    : avoidAllergens;
  const currentFindings = new Map(
    dietaryRules.map((rule) => [`rule:${rule.ruleId}`, rule.currentFinding]),
  );
  const candidateFindings = new Map(
    dietaryRules.map((rule) => [
      `rule:${rule.ruleId}`,
      candidateFinding(substitute, substituteTags, rule),
    ]),
  );
  for (const restriction of customRestrictions) {
    currentFindings.set(
      `custom:${restriction.id}`,
      matchesCustomRestriction(currentItem, restriction.terms)
        ? restriction.severity === 'preference'
          ? 'possible'
          : 'present'
        : 'unresolved',
    );
    candidateFindings.set(
      `custom:${restriction.id}`,
      matchesCustomRestriction(substitute, restriction.terms)
        ? restriction.severity === 'preference'
          ? 'possible'
          : 'present'
        : 'unresolved',
    );
  }

  const currentConflicts = [...currentFindings].filter(([, finding]) => finding === 'present');
  const candidateConflicts = [...candidateFindings].filter(([, finding]) => finding === 'present');
  const addedConflict =
    introducedAllergens.length > 0 ||
    candidateConflicts.some(([key]) => currentFindings.get(key) !== 'present');
  const removedConflict = currentConflicts.find(([key]) => candidateFindings.get(key) === 'absent');
  const needsReview =
    [...candidateFindings.values()].some(
      (finding) => finding === 'possible' || finding === 'unresolved',
    ) || currentConflicts.some(([key]) => candidateFindings.get(key) !== 'absent');
  const removedLabel = removedConflict
    ? removedConflict[0].startsWith('custom:')
      ? customRestrictions.find((restriction) => `custom:${restriction.id}` === removedConflict[0])
          ?.name
      : tNames(
          dietaryRules.find((rule) => `rule:${rule.ruleId}` === removedConflict[0])!.dietaryTag,
        )
    : null;
  const message = addedConflict
    ? t('addsConflict')
    : removedLabel && candidateConflicts.length === 0 && !needsReview
      ? t('removes', { need: removedLabel })
      : needsReview
        ? t('review')
        : null;

  return message ? (
    <p className="text-xs font-medium text-foreground" role="status">
      {message}
    </p>
  ) : null;
}
