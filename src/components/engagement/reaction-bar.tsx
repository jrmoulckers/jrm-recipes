"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { SmilePlus } from "lucide-react";

import { toggleReactionAction } from "~/server/engagement/actions";
import type { ReactionTargetType } from "~/server/engagement/reactions";
import {
  REACTION_EMOJI,
  reactionGlyph,
  toggleReactionState,
  type ReactionCount,
  type ReactionEmojiKey,
} from "~/lib/reactions";
import { cn } from "~/lib/utils";
import { useServerAction } from "~/lib/use-server-action";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";

/**
 * The lightweight emoji reaction bar (#342). Reusable across comments, reviews,
 * and cook-log posts. Toggling is optimistic: the tally updates immediately and
 * rolls back if the server action fails. A picker popover offers the fixed emoji
 * set. Each active pill reveals who reacted on hover/focus.
 */
export function ReactionBar({
  targetType,
  targetId,
  recipeSlug,
  initialCounts,
  initialReactors = {},
  canReact,
}: {
  targetType: ReactionTargetType;
  targetId: string;
  recipeSlug: string;
  initialCounts: ReactionCount[];
  initialReactors?: Partial<Record<ReactionEmojiKey, string[]>>;
  canReact: boolean;
}) {
  const [counts, setCounts] = React.useState<ReactionCount[]>(initialCounts);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const t = useTranslations("engagement.reactions");

  React.useEffect(() => {
    setCounts(initialCounts);
  }, [initialCounts]);

  const action = useServerAction(toggleReactionAction, {
    errorToast: true,
    onError: (_failure, input) => {
      // Roll back the optimistic toggle for that emoji.
      setCounts((current) => toggleReactionState(current, input.emoji));
    },
  });

  const toggle = (emoji: ReactionEmojiKey) => {
    if (!canReact) return;
    setCounts((current) => toggleReactionState(current, emoji));
    setPickerOpen(false);
    action.run({ targetType, targetId, emoji, recipeSlug });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {counts.map((entry) => {
        const names = initialReactors[entry.emoji] ?? [];
        const label = t(`emoji.${entry.emoji}`);
        const title =
          names.length > 0
            ? t("titleWithNames", { label, names: names.join(", ") })
            : label;
        return (
          <button
            key={entry.emoji}
            type="button"
            disabled={!canReact || action.pending}
            onClick={() => toggle(entry.emoji)}
            title={title}
            aria-label={t("a11y.count", {
              label,
              count: entry.count,
              reacted: entry.reacted ? t("a11y.youReacted") : "",
            })}
            aria-pressed={entry.reacted}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
              entry.reacted
                ? "bg-primary/12 border-primary/40 text-primary"
                : "border-border bg-muted/40 text-foreground hover:bg-muted",
              (!canReact || action.pending) && "cursor-default opacity-70",
            )}
          >
            <span aria-hidden>{reactionGlyph(entry.emoji)}</span>
            <span className="tabular-nums">{entry.count}</span>
          </button>
        );
      })}

      {canReact ? (
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t("a11y.add")}
              className="inline-flex items-center rounded-full border border-dashed border-border p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <SmilePlus className="size-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-1.5" align="start">
            <div className="flex items-center gap-1">
              {REACTION_EMOJI.map((emoji) => (
                <button
                  key={emoji.key}
                  type="button"
                  onClick={() => toggle(emoji.key)}
                  aria-label={t(`emoji.${emoji.key}`)}
                  title={t(`emoji.${emoji.key}`)}
                  className="rounded-md p-1 text-lg transition-transform hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span aria-hidden>{emoji.glyph}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
