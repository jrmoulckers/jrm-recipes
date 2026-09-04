'use client';

import type { ReactNode } from 'react';
import * as React from 'react';
import Link from 'next/link';
import { BookOpenText, ListChecks } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { GuidedRecipeEntry } from './guided-recipe-entry';
import { useThemeBehavior } from '~/components/theme/theme-provider';
import { Button } from '~/components/ui/button';

export type RecipeCreationFlowName = 'guided' | 'full';
export type ResolvedRecipeCreationFlow = RecipeCreationFlowName | 'choice';

export function resolveRecipeCreationFlow({
  requestedFlow,
  hasPrefill,
  simplifiedChrome,
}: {
  requestedFlow?: RecipeCreationFlowName;
  hasPrefill: boolean;
  simplifiedChrome: boolean;
}): ResolvedRecipeCreationFlow {
  if (hasPrefill) return 'full';
  if (requestedFlow) return requestedFlow;
  return simplifiedChrome ? 'choice' : 'full';
}

export function RecipeCreationFlow({
  requestedFlow,
  hasPrefill,
  draftOwnerId,
  fullEditor,
}: {
  requestedFlow?: RecipeCreationFlowName;
  hasPrefill: boolean;
  draftOwnerId?: string;
  fullEditor: ReactNode;
}) {
  const t = useTranslations('guidedRecipe.entry');
  const { simplifiedChrome, largeTargets } = useThemeBehavior();
  const simplifiedOnEntry = React.useRef(simplifiedChrome).current;
  const flow = resolveRecipeCreationFlow({
    requestedFlow,
    hasPrefill,
    simplifiedChrome: simplifiedOnEntry,
  });

  if (flow === 'guided') {
    return <GuidedRecipeEntry draftOwnerId={draftOwnerId} />;
  }

  if (flow === 'choice') {
    return (
      <div className="container flex flex-col items-center py-10 sm:py-16">
        <div className="flex w-full max-w-3xl flex-col gap-6">
          <div className="text-center">
            <h1 className="font-display text-3xl font-bold tracking-tight">{t('heading')}</h1>
            <p className="mt-2 text-lg text-muted-foreground">{t('description')}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Button
              asChild
              size={largeTargets ? 'xl' : 'lg'}
              className="h-auto min-h-24 flex-col whitespace-normal px-6 py-5 text-center"
            >
              <Link href="/recipes/new?flow=guided">
                <ListChecks aria-hidden="true" />
                <span className="text-lg">{t('guidedTitle')}</span>
                <span className="text-sm font-normal opacity-90">{t('guidedDescription')}</span>
              </Link>
            </Button>
            <Button
              asChild
              size={largeTargets ? 'xl' : 'lg'}
              variant="outline"
              className="h-auto min-h-24 flex-col whitespace-normal px-6 py-5 text-center"
            >
              <Link href="/recipes/new?flow=full">
                <BookOpenText aria-hidden="true" />
                <span className="text-lg">{t('fullTitle')}</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {t('fullDescription')}
                </span>
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {!hasPrefill && requestedFlow === undefined ? (
        <aside className="container pt-6" aria-label={t('calloutAria')}>
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface/50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">{t('calloutTitle')}</p>
              <p className="text-sm text-muted-foreground">{t('calloutDescription')}</p>
            </div>
            <Button asChild variant="outline" className="shrink-0">
              <Link href="/recipes/new?flow=guided">
                <ListChecks aria-hidden="true" />
                {t('calloutAction')}
              </Link>
            </Button>
          </div>
        </aside>
      ) : null}
      {fullEditor}
    </>
  );
}
