'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { UserMinus, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

import { friendlyError } from '~/lib/error-copy';
import {
  inviteRecipeCreatorAction,
  removeRecipeCreatorAction,
} from '~/server/recipes/creators-actions';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import type { Route } from 'next';

/** One row of the owner's co-creator list. */
export type RecipeCreatorEntry = {
  userId: string;
  status: 'pending' | 'accepted';
  /** The slug the recipe answers on in this creator's namespace, once accepted. */
  slug: string | null;
  name: string | null;
  handle: string | null;
  cook: string | null;
};

/**
 * The owner's co-creator panel (issue #668).
 *
 * Rendered only for the recipe's owner, and every action it calls re-checks
 * that server-side: this component is a convenience, never the gate.
 *
 * A pending row is shown as clearly *not yet* a co-creator, because the
 * distinction is load-bearing — a pending invitation grants no access and
 * publishes no URL, and an owner who believed otherwise would misjudge who can
 * currently see the recipe.
 */
export function RecipeCreatorManager({
  recipeId,
  creators,
}: {
  recipeId: string;
  creators: RecipeCreatorEntry[];
}) {
  const t = useTranslations('recipeCreators');
  const router = useRouter();
  const identifierId = React.useId();
  const [identifier, setIdentifier] = React.useState('');
  const [isPending, startTransition] = React.useTransition();

  function onInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(() => {
      void inviteRecipeCreatorAction({ recipeId, identifier }).then((result) => {
        if (!result.ok) {
          toast.error(friendlyError(result.error));
          return;
        }
        toast.success(t('toast.invited'));
        setIdentifier('');
        router.refresh();
      });
    });
  }

  function onRemove(userId: string) {
    startTransition(() => {
      void removeRecipeCreatorAction({ recipeId, userId }).then((result) => {
        if (!result.ok) {
          toast.error(friendlyError(result.error));
          return;
        }
        toast.success(t('toast.removed'));
        router.refresh();
      });
    });
  }

  return (
    <section
      aria-labelledby={`${identifierId}-heading`}
      className="rounded-2xl border border-border bg-surface/40 p-4"
    >
      <h2 id={`${identifierId}-heading`} className="text-base font-semibold text-foreground">
        {t('title')}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>

      {creators.length > 0 ? (
        <ul className="mt-4 grid gap-2">
          {creators.map((creator) => (
            <li
              key={creator.userId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {creator.name ?? creator.handle ?? t('unknownCook')}
                </p>
                {creator.status === 'accepted' && creator.cook && creator.slug ? (
                  <Link
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                    href={`/recipes/${creator.cook}/${creator.slug}` as Route}
                  >
                    {/* The path itself, not copy: it is the same string in
                        every locale, so translating it would be nonsense. */}
                    {`/recipes/${creator.cook}/${creator.slug}`}
                  </Link>
                ) : (
                  <p className="text-xs text-muted-foreground">{t('pendingHint')}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={creator.status === 'accepted' ? 'secondary' : 'outline'}>
                  {creator.status === 'accepted' ? t('status.accepted') : t('status.pending')}
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  onClick={() => onRemove(creator.userId)}
                >
                  <UserMinus aria-hidden />
                  {creator.status === 'accepted' ? t('actions.remove') : t('actions.rescind')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">{t('empty')}</p>
      )}

      <form onSubmit={onInvite} className="mt-4 grid gap-2 sm:flex sm:items-end">
        <div className="grid flex-1 gap-2">
          <Label htmlFor={identifierId}>{t('invite.label')}</Label>
          <Input
            id={identifierId}
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder={t('invite.placeholder')}
          />
        </div>
        <Button type="submit" disabled={isPending || identifier.trim() === ''}>
          <UserPlus aria-hidden />
          {isPending ? t('actions.inviting') : t('actions.invite')}
        </Button>
      </form>
    </section>
  );
}
