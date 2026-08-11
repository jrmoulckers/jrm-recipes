'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { MoreHorizontal } from 'lucide-react';

import { cn } from '~/lib/utils';
import { Button } from '~/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';

/**
 * Overflow ("…") menu for the recipe action bar (#81). Keeps **Cook** the single
 * primary call-to-action by tucking every secondary action (Print, Share, Hand
 * down, Add to plan, Adapt, Favorite, Save, Edit, Delete, …) behind one tidy
 * trigger instead of a long wrapping row of equally-weighted buttons.
 *
 * It is intentionally additive and content-agnostic: callers pass the existing
 * action components as children and this wrapper only relocates + restyles them
 * into a vertical, full-width, left-aligned stack so they read as menu rows. No
 * action is dropped or reimplemented, so each child keeps its own dialog/popover
 * behavior. The trigger mirrors the bar's secondary buttons (`outline`, `lg`) so
 * it stays consistent across all five UI modes, light and dark.
 */
export function RecipeActionsMenu({
  children,
  label,
}: {
  children: React.ReactNode;
  label?: string;
}) {
  const t = useTranslations('recipe');
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="lg"
          aria-label={label ?? t('actions.moreActions')}
        >
          <MoreHorizontal aria-hidden="true" />
          {t('actions.more')}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className={cn(
          'flex w-60 flex-col gap-1 p-1.5',
          // Normalize the heterogeneous child buttons/links into consistent,
          // full-width menu rows without touching the child components. The
          // deep selectors reach the <button>/<a> each action renders, even
          // when wrapped (e.g. GrownUpControls fragments, QuickPlan wrapper).
          '[&_a]:h-11 [&_a]:w-full [&_a]:justify-start [&_button]:h-11 [&_button]:w-full [&_button]:justify-start',
          // The children arrive with mismatched Button `size` variants (sm/
          // default/lg) and hand-rolled icon sizes, which made every row start
          // its icon and label at a different x. Pin padding, gap, type scale
          // and icon box so the icons and labels line up in a single column.
          '[&_a]:gap-3 [&_a]:px-3 [&_a]:text-base [&_button]:gap-3 [&_button]:px-3 [&_button]:text-base',
          '[&_a_svg]:size-5 [&_button_svg]:size-5',
        )}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
