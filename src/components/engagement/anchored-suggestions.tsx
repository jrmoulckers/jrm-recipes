'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Lightbulb, Check, Sparkles, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { addCommentAction } from '~/server/engagement/actions';
import type { AnchoredSuggestion } from '~/server/engagement/queries';
import { friendlyError } from '~/lib/error-copy';
import { cn } from '~/lib/utils';
import { useFocusOnAttach } from '~/lib/use-initial-focus';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';

function authorName(author: AnchoredSuggestion['author']) {
  return author?.name ?? author?.handle ?? 'A family cook';
}

/**
 * "Suggest an edit" affordance + inline suggestion list for a single ingredient
 * row or method step (issue #346). Filing a suggestion here persists an anchor
 * (type + id + a snapshot label) so the recipe owner can tell exactly what the
 * suggestion refers to. Existing anchored suggestions render inline at the
 * target. The owner resolves/applies them from the discussion suggestions list.
 */
export type AnchoredSuggestionsProps = {
  recipeId: string;
  recipeSlug: string;
  anchorType: 'ingredient' | 'step';
  anchorId: string;
  anchorLabel: string;
  canInteract: boolean;
  suggestions: AnchoredSuggestion[];
};

export function AnchoredSuggestions({
  recipeId,
  recipeSlug,
  anchorType,
  anchorId,
  anchorLabel,
  canInteract,
  suggestions,
}: AnchoredSuggestionsProps) {
  const router = useRouter();
  const t = useTranslations('engagement.anchoredSuggestions');
  const [open, setOpen] = React.useState(false);
  const [body, setBody] = React.useState('');
  // The composer is revealed by a button, so moving focus into it is the
  // response to a user action rather than an unrequested context change.
  const focusOnAttach = useFocusOnAttach<HTMLTextAreaElement>();
  const [pending, startTransition] = React.useTransition();

  const openSuggestions = suggestions.filter(
    (suggestion) => !suggestion.resolvedAt && !suggestion.appliedAt,
  );

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const result = await addCommentAction({
        recipeId,
        recipeSlug,
        kind: 'suggestion',
        body: trimmed,
        anchorType,
        anchorId,
        anchorLabel,
      });
      if (result.ok) {
        toast.success(t('toast.sent'));
        setBody('');
        setOpen(false);
        router.refresh();
        return;
      }
      toast.error(friendlyError(result.error));
    });
  };

  const hasSuggestions = suggestions.length > 0;
  if (!canInteract && !hasSuggestions) return null;

  return (
    <div className="mt-1.5">
      {hasSuggestions ? (
        <ul className="mb-1.5 flex flex-col gap-1.5">
          {suggestions.map((suggestion) => {
            const applied = Boolean(suggestion.appliedAt);
            const resolved = Boolean(suggestion.resolvedAt);
            return (
              <li
                key={suggestion.id}
                className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs"
              >
                <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
                  <Lightbulb className="size-3.5 shrink-0" aria-hidden />
                  <span className="font-medium">
                    {t('authorSuggests', {
                      name: authorName(suggestion.author),
                    })}
                  </span>
                  {applied ? (
                    <span className="inline-flex items-center gap-0.5 text-success">
                      <Sparkles className="size-3" aria-hidden /> {t('applied')}
                    </span>
                  ) : resolved ? (
                    <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                      <Check className="size-3" aria-hidden /> {t('resolved')}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-foreground">
                  {suggestion.body}
                </p>
              </li>
            );
          })}
        </ul>
      ) : null}

      {canInteract ? (
        open ? (
          <form onSubmit={submit} className="flex flex-col gap-2">
            <Textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={2}
              maxLength={4000}
              ref={focusOnAttach}
              placeholder={t('placeholder', { label: anchorLabel })}
              disabled={pending}
            />
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" disabled={pending || !body.trim()}>
                {pending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Lightbulb className="size-4" />
                )}
                {t('send')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setOpen(false);
                  setBody('');
                }}
              >
                {t('cancel')}
              </Button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={cn(
              'inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary',
              openSuggestions.length > 0 && 'text-primary',
            )}
          >
            <Lightbulb className="size-3.5" aria-hidden />
            {t('trigger')}
          </button>
        )
      ) : null}
    </div>
  );
}
