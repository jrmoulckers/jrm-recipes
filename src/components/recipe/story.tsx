import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  GitFork,
  Globe,
  Lightbulb,
  Pencil,
  Sparkles,
  Sprout,
  Utensils,
} from "lucide-react";

import { cn } from "~/lib/utils";
import type { TimelineEntry } from "~/server/recipes/timeline";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { RelativeTime } from "./relative-time";

type EntryStyle = {
  icon: typeof Sprout;
  /** Key under the `recipe.story.kind` namespace for the entry's headline. */
  titleKey: string;
  /** Whether the linked recipe (if any) should render as a link. */
  linked: boolean;
};

function entryStyle(entry: TimelineEntry): EntryStyle {
  switch (entry.kind) {
    case "created":
      return { icon: Sprout, titleKey: "created", linked: false };
    case "adapted":
      return {
        icon: GitFork,
        titleKey: entry.related ? "adaptedFrom" : "adapted",
        linked: true,
      };
    case "adaptation":
      return {
        icon: Utensils,
        titleKey: entry.related ? "newAdaptation" : "adaptedByFamily",
        linked: true,
      };
    case "published":
      return { icon: Globe, titleKey: "published", linked: false };
    case "suggestion_applied":
      return { icon: Lightbulb, titleKey: "suggestionApplied", linked: false };
    case "updated":
    default:
      return { icon: Pencil, titleKey: "updated", linked: false };
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
 * milestones: when it was started, edited, shared, and every adaptation it
 * inspired, each with who did it and when. It is purely presentational (server
 * component). No motion, so nothing to gate behind prefers-reduced-motion.
 */
export function RecipeStory({
  entries,
  recipeTitle,
}: {
  entries: TimelineEntry[];
  recipeTitle: string;
}) {
  const t = useTranslations("recipe");
  if (entries.length === 0) {
    return (
      <section
        className="rounded-xl border border-dashed border-border bg-card p-6 text-center"
        aria-label={t("story.aria", { title: recipeTitle })}
      >
        <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="size-5" aria-hidden="true" />
        </div>
        <h2 className="font-display text-lg font-semibold">
          {t("story.emptyTitle")}
        </h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          {t("story.emptyBody")}
        </p>
      </section>
    );
  }

  return (
    <section
      className="rounded-xl border border-border bg-card p-5 shadow-token"
      aria-label={t("story.aria", { title: recipeTitle })}
    >
      <div className="mb-5 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sprout className="size-5" aria-hidden="true" />
        </div>
        <div>
          <h2 className="font-display text-xl font-semibold">
            {t("story.heading")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("story.description")}
          </p>
        </div>
      </div>

      <ol className="relative space-y-4 before:absolute before:bottom-4 before:start-[1.15rem] before:top-4 before:w-px before:bg-border">
        {entries.map((entry) => {
          const style = entryStyle(entry);
          const Icon = style.icon;
          const isFork =
            entry.kind === "adapted" || entry.kind === "adaptation";
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
                    {t(`story.kind.${style.titleKey}`)}
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
                        {/* Decorative: the avatar repeats the author name
                            rendered beside it. */}
                        {entry.actor?.avatarUrl && (
                          <AvatarImage src={entry.actor.avatarUrl} alt="" />
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
                  {validWhen && <RelativeTime value={when} />}
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
