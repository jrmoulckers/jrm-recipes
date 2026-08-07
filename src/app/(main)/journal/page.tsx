import { type Metadata } from "next";
import { type ReactNode } from "react";
import Link from "next/link";
import {
  BookOpen,
  CalendarClock,
  CookingPot,
  Database,
  Flame,
  UtensilsCrossed,
} from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { getCurrentUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import {
  getCookedRecipeOptions,
  getFilteredCooks,
  getJournalInsights,
  type JournalInsights,
} from "~/server/cooklog/queries";
import { formatDate, formatRelativeTime } from "~/lib/dates";
import { journalRangeSince, parseJournalRange } from "~/lib/journal-range";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { EmptyState } from "~/components/ui/empty-state";
import { JournalFilters } from "~/components/cooklog/journal-filters";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return { title: t("journal.title") };
}

/** A recorded servings count, or `null` when nothing usable was saved. */
function normalizeServings(servingsMade?: number | null): number | null {
  if (servingsMade == null || !Number.isFinite(servingsMade)) return null;
  const n = Math.max(0, Math.floor(servingsMade));
  return n > 0 ? n : null;
}

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ recipe?: string; range?: string }>;
}) {
  const { recipe: recipeParam, range: rangeParam } = await searchParams;
  const user = await getCurrentUser();
  const locale = await getLocale();
  const dbReady = isDbConfigured();

  const range = parseJournalRange(rangeParam);
  const recipeOptions =
    dbReady && user ? await getCookedRecipeOptions(user.id) : [];
  // Only honor a recipe filter the viewer actually has cooks for, so a stale or
  // hand-edited ?recipe= can't wedge the page into a permanently empty state.
  const selectedRecipeId =
    recipeParam && recipeOptions.some((option) => option.id === recipeParam)
      ? recipeParam
      : null;

  const filter = {
    recipeId: selectedRecipeId,
    since: journalRangeSince(range),
  };

  const [cooks, insights] =
    dbReady && user
      ? await Promise.all([
          getFilteredCooks(user.id, filter),
          getJournalInsights(user.id, filter),
        ])
      : [
          [],
          {
            totalCooks: 0,
            mostRecent: null,
            topRecipes: [],
          } as JournalInsights,
        ];

  const hasAnyCooks = recipeOptions.length > 0;
  const filtersActive = selectedRecipeId !== null || range !== "all";
  const t = await getTranslations("cookLog.journal");
  const tSection = await getTranslations("cookLog.section");

  return (
    <div className="container flex flex-col gap-8 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            {t("title")}
          </h1>
          <p className="mt-1 text-muted-foreground">{t("description")}</p>
        </div>
        {insights.totalCooks > 0 && (
          <Badge variant="secondary" className="gap-1.5">
            <CookingPot className="size-3.5" aria-hidden="true" />
            {tSection("cookedTimes", { count: insights.totalCooks })}
          </Badge>
        )}
      </div>

      {!dbReady ? (
        <ConnectDbNotice />
      ) : !hasAnyCooks ? (
        <EmptyJournal />
      ) : (
        <div className="flex flex-col gap-6">
          <JournalFilters
            recipes={recipeOptions}
            selectedRecipeId={selectedRecipeId}
            selectedRange={range}
          />

          {insights.totalCooks > 0 && (
            <InsightsStrip insights={insights} locale={locale} />
          )}

          {cooks.length > 0 ? (
            <ol className="flex flex-col gap-4">
              {cooks.map((cook) => (
                <JournalEntry key={cook.id} cook={cook} locale={locale} />
              ))}
            </ol>
          ) : (
            <NoMatches filtersActive={filtersActive} />
          )}
        </div>
      )}
    </div>
  );
}

type Cook = Awaited<ReturnType<typeof getFilteredCooks>>[number];

async function InsightsStrip({
  insights,
  locale,
}: {
  insights: JournalInsights;
  locale: string;
}) {
  const t = await getTranslations("cookLog.journal.insights");
  const mostRecent = insights.mostRecent ? new Date(insights.mostRecent) : null;
  const mostRecentValid = mostRecent && !Number.isNaN(mostRecent.getTime());

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-token">
        <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CookingPot className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-2xl font-semibold leading-none">
            {insights.totalCooks}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("cooksLogged", { count: insights.totalCooks })}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-token">
        <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CalendarClock className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium leading-tight">
            {mostRecentValid ? formatRelativeTime(mostRecent, locale) : "—"}
          </p>
          <p className="text-sm text-muted-foreground">{t("mostRecent")}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 shadow-token">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Flame className="size-4 text-primary" aria-hidden="true" />
          {t("mostCooked")}
        </div>
        {insights.topRecipes.length > 0 ? (
          <ol className="flex flex-col gap-1">
            {insights.topRecipes.map((recipe) => (
              <li
                key={recipe.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <Link
                  href={`/recipes/${recipe.slug}`}
                  className="min-w-0 truncate font-medium hover:text-primary hover:underline"
                >
                  {recipe.title}
                </Link>
                <span className="shrink-0 text-muted-foreground">
                  ×{recipe.count}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">{t("nothingYet")}</p>
        )}
      </div>
    </div>
  );
}

async function NoMatches({ filtersActive }: { filtersActive: boolean }) {
  const t = await getTranslations("cookLog.journal.noMatches");
  return (
    <div className="rounded-xl border border-dashed border-border bg-background/60 p-8 text-center">
      <p className="font-medium">{t("title")}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {filtersActive ? t("withFilters") : t("withoutFilters")}
      </p>
      {filtersActive && (
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href="/journal">{t("clearFilters")}</Link>
        </Button>
      )}
    </div>
  );
}

async function JournalEntry({ cook, locale }: { cook: Cook; locale: string }) {
  const t = await getTranslations("cookLog.journal.entry");
  const tSection = await getTranslations("cookLog.section");
  const cookedAt = new Date(cook.cookedAt);
  const valid = !Number.isNaN(cookedAt.getTime());
  const servingsMade = normalizeServings(cook.servingsMade);
  const title = cook.recipe?.title ?? t("untitled");

  const body = (
    <article className="flex gap-4 rounded-xl border border-border bg-card p-4 shadow-token transition-[transform,box-shadow] duration-200 group-hover:-translate-y-0.5 group-hover:shadow-token-lg">
      <div className="relative size-20 shrink-0 overflow-hidden rounded-lg border border-border bg-gradient-to-br from-primary/20 to-accent/15">
        {cook.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- cook photos may be arbitrary user-pasted URLs (Cloudinary optional) that can't be pre-allowlisted for next/image
          <img src={cook.photoUrl} alt="" className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-primary/50">
            <CookingPot className="size-7" aria-hidden="true" />
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2 className="font-display text-lg font-semibold leading-tight">
            {title}
          </h2>
          {servingsMade != null && (
            <Badge variant="muted" className="gap-1">
              <UtensilsCrossed className="size-3" aria-hidden="true" />
              {tSection("servings", { count: servingsMade })}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {valid
            ? t("cookedOn", {
                date: formatDate(cookedAt, "PPP", locale),
                relative: formatRelativeTime(cookedAt, locale),
              })
            : t("loggedEarlier")}
        </p>
        {cook.note && (
          <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">
            {cook.note}
          </p>
        )}
      </div>
    </article>
  );

  if (!cook.recipe) {
    return <li>{body}</li>;
  }

  return (
    <li>
      <Link
        href={`/recipes/${cook.recipe.slug}`}
        className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {body}
      </Link>
    </li>
  );
}

async function EmptyJournal() {
  const t = await getTranslations("cookLog.journal.empty");
  return (
    <EmptyState
      icon={<CookingPot />}
      title={t("title")}
      description={t("body")}
      action={
        <Button asChild size="lg">
          <Link href="/recipes">
            <BookOpen /> {t("cta")}
          </Link>
        </Button>
      }
    />
  );
}

async function ConnectDbNotice() {
  const t = await getTranslations("dbNotice");
  return (
    <EmptyState
      icon={<Database />}
      title={t("title")}
      description={t.rich("journal", {
        code: (chunks: ReactNode) => (
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
            {chunks}
          </code>
        ),
        file: (chunks: ReactNode) => (
          <code className="font-mono text-sm">{chunks}</code>
        ),
      })}
    />
  );
}
