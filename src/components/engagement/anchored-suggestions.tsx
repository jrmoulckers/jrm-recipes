"use client";

import * as React from "react";
import { Lightbulb, Check, Sparkles, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { addCommentAction } from "~/server/engagement/actions";
import type { AnchoredSuggestion } from "~/server/engagement/queries";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";

function authorName(author: AnchoredSuggestion["author"]) {
  return author?.name ?? author?.handle ?? "A family cook";
}

/**
 * "Suggest an edit" affordance + inline suggestion list for a single ingredient
 * row or method step (issue #346). Filing a suggestion here persists an anchor
 * (type + id + a snapshot label) so the recipe owner can tell exactly what the
 * suggestion refers to. Existing anchored suggestions render inline at the
 * target; the owner resolves/applies them from the discussion suggestions list.
 */
export function AnchoredSuggestions({
  recipeId,
  recipeSlug,
  anchorType,
  anchorId,
  anchorLabel,
  canInteract,
  suggestions,
}: {
  recipeId: string;
  recipeSlug: string;
  anchorType: "ingredient" | "step";
  anchorId: string;
  anchorLabel: string;
  canInteract: boolean;
  suggestions: AnchoredSuggestion[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [body, setBody] = React.useState("");
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
        kind: "suggestion",
        body: trimmed,
        anchorType,
        anchorId,
        anchorLabel,
      });
      if (result.ok) {
        toast.success("Suggestion sent to the recipe owner");
        setBody("");
        setOpen(false);
        router.refresh();
        return;
      }
      toast.error(result.error);
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
                    {authorName(suggestion.author)} suggests
                  </span>
                  {applied ? (
                    <span className="inline-flex items-center gap-0.5 text-success">
                      <Sparkles className="size-3" aria-hidden /> applied
                    </span>
                  ) : resolved ? (
                    <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                      <Check className="size-3" aria-hidden /> resolved
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
              autoFocus
              placeholder={`Suggest an edit for ${anchorLabel}…`}
              disabled={pending}
            />
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" disabled={pending || !body.trim()}>
                {pending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Lightbulb className="size-4" />
                )}
                Send suggestion
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setOpen(false);
                  setBody("");
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={cn(
              "inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary",
              openSuggestions.length > 0 && "text-primary",
            )}
          >
            <Lightbulb className="size-3.5" aria-hidden />
            Suggest an edit
          </button>
        )
      ) : null}
    </div>
  );
}
