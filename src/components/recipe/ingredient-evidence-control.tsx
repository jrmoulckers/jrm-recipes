'use client';

import * as React from 'react';
import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { Badge } from '~/components/ui/badge';
import {
  DIETARY_EVIDENCE_FINDINGS,
  type DietaryEvidenceFinding,
  type DietaryEvidenceSource,
} from '~/lib/dietary-contracts';
import { cn } from '~/lib/utils';
import { saveDietaryIngredientCorrectionAction } from '~/server/dietary/actions';

export type IngredientDietaryEvidence = {
  ingredientId: string;
  ruleId: string;
  finding: DietaryEvidenceFinding;
  source: DietaryEvidenceSource;
};

const EVIDENCE_FINDING_LABEL: Record<DietaryEvidenceFinding, string> = {
  present: 'present',
  absent: 'absent',
  possible: 'possible',
  unresolved: 'unresolved',
};

const DIETARY_RULE_LABEL_KEY: Readonly<Record<string, string>> = {
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

function dietaryRuleLabel(ruleId: string): string {
  const label = ruleId.split(':').at(-1)?.replaceAll('-', ' ') ?? ruleId;
  return label.replace(/\b\w/g, (character) => character.toUpperCase());
}

export function IngredientEvidenceReview({
  items,
  canCorrect,
}: {
  items: {
    ingredient: { id: string; item: string };
    evidence: IngredientDietaryEvidence[];
  }[];
  canCorrect: boolean;
}) {
  const router = useRouter();
  const t = useTranslations('ingredientsPanel.dietaryEvidence');
  const rulesT = useTranslations('dietary.assessments');
  const [message, setMessage] = React.useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);
  const [isPending, startTransition] = React.useTransition();

  if (items.length === 0) return null;

  function ruleLabel(ruleId: string) {
    const key = DIETARY_RULE_LABEL_KEY[ruleId];
    return key && rulesT.has(`rules.${key}`) ? rulesT(`rules.${key}`) : dietaryRuleLabel(ruleId);
  }

  function saveCorrection(ingredientId: string, ruleId: string, finding: DietaryEvidenceFinding) {
    if (isPending) return;
    setMessage(null);
    startTransition(async () => {
      const result = await saveDietaryIngredientCorrectionAction({
        ingredientId,
        ruleId,
        customRestrictionId: null,
        finding,
        correctedFoodId: null,
      });
      if (!result.ok) {
        setMessage({ kind: 'error', text: t('saveError') });
        return;
      }
      setMessage({ kind: 'success', text: t('saved') });
      router.refresh();
    });
  }

  return (
    <details id="dietary-evidence-review" className="group mt-3 rounded-lg border border-border">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:outline-hidden [&::-webkit-details-marker]:hidden">
        <Info className="size-3.5" />
        <span>{t('review', { count: items.length })}</span>
      </summary>
      <div className="border-t border-border px-4 pt-3 pb-4 text-sm">
        <p className="max-w-prose text-xs leading-relaxed text-muted-foreground">
          {t(canCorrect ? 'sharedScope' : 'readOnlyScope')}
        </p>
        <ul className="mt-4 divide-y divide-border">
          {items.map(({ ingredient, evidence }) => (
            <li
              id={`dietary-correction-${ingredient.id}`}
              key={ingredient.id}
              tabIndex={-1}
              className="scroll-mt-24 py-4 first:pt-0 last:pb-0 focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
            >
              <h4 className="font-display text-sm font-semibold wrap-anywhere">
                {ingredient.item}
              </h4>
              <ul className="mt-3 space-y-4">
                {evidence.map((entry) => (
                  <li
                    key={`${entry.ruleId}-${entry.finding}-${entry.source}`}
                    className="space-y-2"
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <span className="font-medium">{ruleLabel(entry.ruleId)}</span>
                      <Badge
                        variant={entry.finding === 'present' ? 'warning' : 'muted'}
                        className="capitalize"
                      >
                        {t(`finding.${EVIDENCE_FINDING_LABEL[entry.finding]}`)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('sourceLabel', { source: t(`source.${entry.source}`) })}
                    </p>
                    {canCorrect && (
                      <div
                        data-dietary-rule={entry.ruleId}
                        role="radiogroup"
                        aria-busy={isPending}
                        aria-label={t('correctionGroup', {
                          rule: ruleLabel(entry.ruleId),
                        })}
                        className="flex flex-wrap gap-1"
                      >
                        {DIETARY_EVIDENCE_FINDINGS.map((finding) => (
                          <label
                            key={finding}
                            className={cn(
                              'inline-flex min-h-11 cursor-pointer items-center rounded-md px-3 text-xs font-medium transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background',
                              entry.finding === finding
                                ? 'bg-secondary text-secondary-foreground'
                                : 'hover:bg-accent hover:text-accent-foreground',
                              isPending && 'pointer-events-none opacity-50',
                            )}
                          >
                            <input
                              className="sr-only"
                              type="radio"
                              name={`dietary-correction-${ingredient.id}-${entry.ruleId}`}
                              value={finding}
                              checked={entry.finding === finding}
                              disabled={isPending}
                              onChange={() => saveCorrection(ingredient.id, entry.ruleId, finding)}
                            />
                            {t(`correction.${EVIDENCE_FINDING_LABEL[finding]}`)}
                          </label>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        {message && (
          <p
            role={message.kind === 'error' ? 'alert' : 'status'}
            className={cn(
              'mt-3 text-xs',
              message.kind === 'success' ? 'text-muted-foreground' : 'text-destructive',
            )}
          >
            {message.text}
          </p>
        )}
      </div>
    </details>
  );
}
