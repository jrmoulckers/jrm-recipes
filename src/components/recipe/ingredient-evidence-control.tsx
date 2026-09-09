'use client';

import * as React from 'react';
import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
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

export function IngredientEvidenceControl({
  ingredient,
  evidence,
  canCorrect,
}: {
  ingredient: { id: string; item: string };
  evidence: IngredientDietaryEvidence[];
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

  if (evidence.length === 0) return null;

  function ruleLabel(ruleId: string) {
    const key = DIETARY_RULE_LABEL_KEY[ruleId];
    return key && rulesT.has(`rules.${key}`) ? rulesT(`rules.${key}`) : dietaryRuleLabel(ruleId);
  }

  function saveCorrection(ruleId: string, finding: DietaryEvidenceFinding) {
    if (isPending) return;
    setMessage(null);
    startTransition(async () => {
      const result = await saveDietaryIngredientCorrectionAction({
        ingredientId: ingredient.id,
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
    <details id={`dietary-correction-${ingredient.id}`} className="group relative">
      <summary
        role="button"
        aria-label={t('ariaLabel', { ingredient: ingredient.item })}
        className="inline-flex min-h-11 cursor-pointer list-none items-center justify-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background [&::-webkit-details-marker]:hidden"
      >
        <Info className="size-3.5" />
        <span>{t('review')}</span>
      </summary>
      <div className="absolute end-0 z-30 mt-1 max-h-[min(28rem,80vh)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-md border border-border bg-popover p-4 text-sm text-popover-foreground shadow-md">
        <h4 className="font-display text-sm font-semibold [overflow-wrap:anywhere]">
          {ingredient.item}
        </h4>
        <ul className="mt-3 space-y-3">
          {evidence.map((entry) => (
            <li key={`${entry.ruleId}-${entry.finding}-${entry.source}`} className="space-y-2">
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
                  role="group"
                  aria-label={t('correctionGroup', {
                    rule: ruleLabel(entry.ruleId),
                  })}
                  className="flex flex-wrap gap-1"
                >
                  {DIETARY_EVIDENCE_FINDINGS.map((finding) => (
                    <Button
                      key={finding}
                      type="button"
                      size="sm"
                      variant={entry.finding === finding ? 'secondary' : 'ghost'}
                      className="min-h-11 px-3 text-xs"
                      disabled={isPending}
                      onClick={() => saveCorrection(entry.ruleId, finding)}
                    >
                      {t(`finding.${EVIDENCE_FINDING_LABEL[finding]}`)}
                    </Button>
                  ))}
                </div>
              )}
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
