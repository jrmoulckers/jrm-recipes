import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  GitFork,
  Globe,
  Pencil,
  Sparkles,
  Sprout,
  Utensils,
} from "lucide-react";

import { cn } from "~/lib/utils";
import type { TimelineEntry } from "~/server/recipes/timeline";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";

type EntryStyle = {
  icon: typeof Sprout;
  title: string;
  /** Whether the linked recipe (if any) should render as a link. */
  linked: boolean;
};

function entryStyle(entry: TimelineEntry): EntryStyle {
  switch (entry.kind) {
    case "created":
      return { icon: Sprout, title: "Recipe started", linked: false };
    case "adapted":
      return {
        icon: GitFork,
        title: entry.related ? "Adapted from" : "Adapted",
        linked: true,
      };
    case "adaptation":
      return {
        icon: Utensils,
        title: entry.related ? "New adaptation" : "Adapted by the family",
        linked: true,
      };
    case "published":
      return { icon: Globe, title: "Shared with the family", linked: false };
    case "updated":
    default:
      return { icon: Pencil, title: "Updated", linked: false };
  }
}

function initials(name: string | null, handle: string | null): string {
  const source = name ?? handle ?? "";
  const parts = source.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "🍲";
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/**
 * The "family history" timeline: a warm vertical trail of a recipe's
 * milestones — when it was started, edited, shared, and every adaptation it
 * inspired — each with who did it and when. Purely presentational (server
 * component); no motion, so nothing to gate behind prefers-reduced-motion.
 */
export function RecipeStory({
  entries,
  recipeTitle,
}: {
  entries: TimelineEntry[];
  recipeTitle: string;
}) {
  if (entries.length === 0) {
    return (
      <section
        className="rounded-xl border border-dashed border-border bg-card p-6 text-center"
        aria-label={`Timeline for ${recipeTitle}`}
      >
        <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="size-5" aria-hidden="true" />
        </div>
        <h2 className="font-display text-lg font-semibold">
          The story starts here
        </h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          As this recipe is edited, shared, and adapted, its family history will
          gather here — a trail of every hand that shaped it.
        </p>
      </section>
    );
  }

  return (
    <section
      className="rounded-xl border border-border bg-card p-5 shadow-token"
      aria-label={`Timeline for ${recipeTitle}`}
    >
      <div className="mb-5 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sprout className="size-5" aria-hidden="true" />
        </div>
        <div>
          <h2 className="font-display text-xl font-semibold">Family history</h2>
          <p className="text-sm text-muted-foreground">
            How this recipe has grown and branched over time.
          </p>
        </div>
      </div>

      <ol className="relative space-y-4 before:absolute before:bottom-4 before:left-[1.15rem] before:top-4 before:w-px before:bg-border">
        {entries.map((entry) => {
          const style = entryStyle(entry);
          const Icon = style.icon;
          const isFork = entry.kind === "adapted" || entry.kind === "adaptation";
          const author = entry.actor?.name ?? entry.actor?.handle ?? null;
          const when = entry.createdAt;
          const validWhen = !Number.isNaN(when.getTime());

          return (
            <li key={entry.id} className="relative flex gap-4">
              <div
                className={cn(
                  "relative z-10 mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full border bg-card",
                  isFork
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground",
                )}
                aria-hidden="true"
              >
                <Icon className="size-4" />
              </div>

              <div className="min-w-0 flex-1 rounded-lg border border-border/70 bg-background p-4">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <h3 className="font-display text-base font-semibold leading-tight">
                    {style.title}
                  </h3>
                  {style.linked && entry.related && (
                    <Link
                      href={`/recipes/${entry.related.slug}`}
                      className="min-w-0 truncate font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      {entry.related.title}
                    </Link>
                  )}
                </div>

                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                  {author && (
                    <span className="inline-flex items-center gap-1.5">
                      <Avatar className="size-5">
                        {entry.actor?.avatarUrl && (
                          <AvatarImage
                            src={entry.actor.avatarUrl}
                            alt=""
                          />
                        )}
                        <AvatarFallback className="text-[0.6rem]">
                          {initials(
                            entry.actor?.name ?? null,
                            entry.actor?.handle ?? null,
                          )}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-foreground">
                        {author}
                      </span>
                    </span>
                  )}
                  {validWhen && (
                    <time dateTime={when.toISOString()}>
                      {formatDistanceToNow(when, { addSuffix: true })}
                    </time>
                  )}
                </p>

                {entry.note && (
                  <p className="mt-3 rounded-md bg-muted/60 px-3 py-2 text-sm italic text-muted-foreground">
                    “{entry.note}”
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
