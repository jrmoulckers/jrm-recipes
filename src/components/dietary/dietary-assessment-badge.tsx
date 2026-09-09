'use client';

import { useId, useRef } from 'react';
import { AlertTriangle, HelpCircle, Info, Search, ShieldCheck, UserCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

import { badgeVariants } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { cn } from '~/lib/utils';

export type DietaryAssessmentStatus = 'suitability' | 'conflict' | 'review';
export type DietaryAssessmentConfidence = 'high' | 'medium' | 'needs-review';
export type DietaryAttentionKind = 'conflict' | 'unresolved';

export type DietaryAssessmentProvenance =
  | {
      kind: 'author-confirmed';
      source: string;
    }
  | {
      kind: 'ingredient-analyzed';
      confidence: DietaryAssessmentConfidence;
    };

export type DietaryAssessmentAction =
  | {
      kind: 'review' | 'correct';
      /** Return true only when focus is transferred to an action destination. */
      onSelect: () => boolean | void;
      /** Set false when the action deliberately transfers focus outside the popover. */
      restoreFocus?: boolean;
    }
  | {
      kind: 'upgrade';
      href: '/pricing';
    };

export type DietaryAttentionIngredient = {
  name: string;
  kind: DietaryAttentionKind;
};

export interface DietaryAssessmentBadgeProps {
  /** A short, already-localized rule result such as "Gluten-free". */
  label: string;
  status: DietaryAssessmentStatus;
  provenance: DietaryAssessmentProvenance;
  recognizedIngredients: number;
  totalIngredients: number;
  attentionIngredients?: readonly DietaryAttentionIngredient[];
  limitation?: 'brands-and-cross-contact' | 'cross-contact';
  /** Pass only when the current viewer is authorized to take this action. */
  action?: DietaryAssessmentAction;
  className?: string;
}

const STATUS_DETAILS = {
  suitability: {
    Icon: ShieldCheck,
    variant: 'success',
  },
  conflict: {
    Icon: AlertTriangle,
    variant: 'destructive',
  },
  review: {
    Icon: HelpCircle,
    variant: 'warning',
  },
} as const;

const PROVENANCE_ICONS = {
  'author-confirmed': UserCheck,
  'ingredient-analyzed': Search,
} as const;

export function DietaryAssessmentBadge({
  label,
  status,
  provenance,
  recognizedIngredients,
  totalIngredients,
  attentionIngredients = [],
  limitation = 'brands-and-cross-contact',
  action,
  className,
}: DietaryAssessmentBadgeProps) {
  const t = useTranslations('dietary.assessmentBadge');
  const headingId = useId();
  const limitationId = useId();
  const keepActionFocus = useRef(false);
  const { Icon: StatusIcon, variant } = STATUS_DETAILS[status];
  const ProvenanceIcon = PROVENANCE_ICONS[provenance.kind];
  const statusLabel = t(`status.${status}`);
  const provenanceLabel =
    provenance.kind === 'author-confirmed'
      ? t('provenance.authorConfirmed', { source: provenance.source })
      : t('provenance.ingredientAnalyzedWithConfidence', {
          confidence: t(`confidence.${provenance.confidence}`),
        });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('triggerLabel', {
            label,
            status: statusLabel,
            provenance: provenanceLabel,
          })}
          className={cn(
            badgeVariants({ variant }),
            'min-h-11 max-w-full cursor-pointer whitespace-normal px-3 py-2 text-start leading-snug',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            className,
          )}
          data-assessment-status={status}
          data-assessment-provenance={provenance.kind}
        >
          <StatusIcon className="size-4 shrink-0" aria-hidden="true" data-status-icon={status} />
          <span className="min-w-0 break-words">{label}</span>
          <ProvenanceIcon
            className="size-3.5 shrink-0 opacity-80"
            aria-hidden="true"
            data-provenance-icon={provenance.kind}
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="max-h-[calc(var(--radix-popover-content-available-height)-1rem)] w-80 space-y-3 overflow-y-auto overscroll-contain break-words text-sm"
        aria-labelledby={headingId}
        aria-describedby={limitationId}
        onCloseAutoFocus={(event) => {
          if (keepActionFocus.current) {
            event.preventDefault();
            keepActionFocus.current = false;
          }
        }}
      >
        <div className="flex items-start gap-2">
          <StatusIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <h2 id={headingId} className="font-display text-sm font-semibold text-foreground">
              {t('detailsTitle', { label })}
            </h2>
            <p className="text-xs font-medium text-muted-foreground">{statusLabel}</p>
          </div>
        </div>

        <dl className="space-y-2">
          <div className="flex items-start gap-2">
            <ProvenanceIcon
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <dt className="sr-only">{t('provenance.label')}</dt>
            <dd className="min-w-0 break-words" data-provenance={provenance.kind}>
              {provenance.kind === 'author-confirmed' ? (
                provenanceLabel
              ) : (
                <>
                  <span>{t('provenance.ingredientAnalyzed')}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t('confidenceLine', {
                      confidence: t(`confidence.${provenance.confidence}`),
                    })}
                  </span>
                </>
              )}
            </dd>
          </div>
          <div>
            <dt className="sr-only">{t('coverageLabel')}</dt>
            <dd className="text-muted-foreground">
              {t('recognized', {
                recognized: recognizedIngredients,
                total: totalIngredients,
              })}
            </dd>
          </div>
        </dl>

        {attentionIngredients.length > 0 && (
          <section aria-labelledby={`${headingId}-attention`}>
            <h3
              id={`${headingId}-attention`}
              className="mb-1.5 text-xs font-semibold text-foreground"
            >
              {t('attentionTitle')}
            </h3>
            <ul className="space-y-1.5">
              {attentionIngredients.map((ingredient, index) => {
                const AttentionIcon = ingredient.kind === 'conflict' ? AlertTriangle : HelpCircle;
                return (
                  <li
                    key={`${ingredient.kind}-${ingredient.name}-${index}`}
                    className="flex items-start gap-2 text-muted-foreground"
                  >
                    <AttentionIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 break-words">
                      {t('ingredientFinding', {
                        ingredient: ingredient.name,
                        finding: t(`finding.${ingredient.kind}`),
                      })}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <p id={limitationId} className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-words">{t(`limitation.${limitation}`)}</span>
        </p>

        {action &&
          (action.kind === 'upgrade' ? (
            <PopoverClose asChild>
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link href={action.href}>{t('action.upgrade')}</Link>
              </Button>
            </PopoverClose>
          ) : (
            <PopoverClose asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  const transfersFocus = action.onSelect() === true;
                  keepActionFocus.current = action.restoreFocus === false && transfersFocus;
                }}
              >
                {t(`action.${action.kind}`)}
              </Button>
            </PopoverClose>
          ))}
      </PopoverContent>
    </Popover>
  );
}
