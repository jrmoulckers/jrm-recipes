'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';

import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import {
  facetMatchModeValues,
  type FacetMatchMode,
  type RecipeFacetParam,
} from '~/server/recipes/search';

export type RecipeMatchRule = {
  facet: RecipeFacetParam;
  label: string;
  mode: FacetMatchMode;
  count: number;
};

export function RecipeMatchRules({
  rules,
  open,
  onOpenChange,
  onModeChange,
}: {
  rules: RecipeMatchRule[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onModeChange: (facet: RecipeFacetParam, mode: FacetMatchMode) => void;
}) {
  const t = useTranslations('recipeSearch');
  const contentId = React.useId();

  return (
    <div className="basis-full border-t border-border pt-3">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-controls={contentId}
        className="inline-flex items-center gap-2 rounded-md text-sm font-medium text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
      >
        {t('advancedMatchRules')}
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <div id={contentId} className="mt-3 flex flex-col gap-3">
          <p className="max-w-2xl text-sm text-muted-foreground">{t('matchRulesHelp')}</p>
          {rules.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {rules.map((rule) => (
                <div
                  key={rule.facet}
                  className="flex min-w-52 items-center justify-between gap-3 rounded-lg border border-border bg-card p-2"
                >
                  <span className="text-sm font-medium">{rule.label}</span>
                  <MatchModeControl
                    value={rule.mode}
                    onValueChange={(mode) => onModeChange(rule.facet, mode)}
                    label={t('matchRuleAria', { label: rule.label })}
                    anyLabel={t('matchAny')}
                    allLabel={t('matchAll')}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('matchRulesEmpty')}</p>
          )}
        </div>
      )}
    </div>
  );
}

function MatchModeControl({
  value,
  onValueChange,
  label,
  anyLabel,
  allLabel,
}: {
  value: FacetMatchMode;
  onValueChange: (value: FacetMatchMode) => void;
  label: string;
  anyLabel: string;
  allLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex items-center gap-1 rounded-lg bg-muted p-1"
    >
      {facetMatchModeValues.map((mode) => (
        <Button
          key={mode}
          type="button"
          size="sm"
          variant={value === mode ? 'secondary' : 'ghost'}
          aria-pressed={value === mode}
          onClick={() => onValueChange(mode)}
          className="h-7 px-2.5"
        >
          {mode === 'any' ? anyLabel : allLabel}
        </Button>
      ))}
    </div>
  );
}
