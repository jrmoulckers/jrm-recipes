import { type Metadata } from "next";
import Link from "next/link";
import { BookOpen, CookingPot, UtensilsCrossed } from "lucide-react";
import { getLocale } from "next-intl/server";

import { getCurrentUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import { getMyRecentCooks } from "~/server/cooklog/queries";
import { cookedTimesLabel, formatServingsMade } from "~/server/cooklog/summary";
import { formatDate, formatRelativeTime } from "~/lib/dates";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";

export const metadata: Metadata = {
  title: "Cook journal",
  description: "A log of every dish you've cooked, with your notes and photos.",
};

export default async function JournalPage() {
  const user = await getCurrentUser();
  const locale = await getLocale();
  const cooks =
    isDbConfigured() && user ? await getMyRecentCooks(user.id) : [];

  return (
    <div className="container flex flex-col gap-8 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Cooking journal
          </h1>
          <p className="mt-1 text-muted-foreground">
            Every time you&apos;ve made something — history, kept alive.
          </p>
        </div>
        {cooks.length > 0 && (
          <Badge variant="secondary" className="gap-1.5">
            <CookingPot className="size-3.5" aria-hidden="true" />
            {cookedTimesLabel(cooks.length)}
          </Badge>
        )}
      </div>

      {!isDbConfigured() ? (
        <ConnectDbNotice />
      ) : cooks.length > 0 ? (
        <ol className="flex flex-col gap-4">
          {cooks.map((cook) => (
            <JournalEntry key={cook.id} cook={cook} locale={locale} />
          ))}
        </ol>
      ) : (
        <EmptyJournal />
      )}
    </div>
  );
}

type Cook = Awaited<ReturnType<typeof getMyRecentCooks>>[number];

function JournalEntry({ cook, locale }: { cook: Cook; locale: string }) {
  const cookedAt = new Date(cook.cookedAt);
  const valid = !Number.isNaN(cookedAt.getTime());
  const servings = formatServingsMade(cook.servingsMade);
  const title = cook.recipe?.title ?? "A recipe";

  const body = (
    <article className="flex gap-4 rounded-xl border border-border bg-card p-4 shadow-token transition-[transform,box-shadow] duration-200 group-hover:-translate-y-0.5 group-hover:shadow-token-lg">
      <div className="relative size-20 shrink-0 overflow-hidden rounded-lg border border-border bg-gradient-to-br from-primary/20 to-accent/15">
        {cook.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- cook photos may be arbitrary user-pasted URLs (Cloudinary optional) that can't be pre-allowlisted for next/image
          <img
            src={cook.photoUrl}
            alt=""
            className="size-full object-cover"
          />
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
          {servings && (
            <Badge variant="muted" className="gap-1">
              <UtensilsCrossed className="size-3" aria-hidden="true" />
              {servings}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {valid
            ? `${formatDate(cookedAt, "PPP", locale)} · ${formatRelativeTime(
                cookedAt,
                locale,
              )}`
            : "Logged earlier"}
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

function EmptyJournal() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-surface/50 py-16 text-center">
      <span className="inline-flex size-16 items-center justify-center rounded-2xl bg-primary/12 text-primary">
        <CookingPot className="size-7" />
      </span>
      <div>
        <h2 className="font-display text-xl font-semibold">
          No cooks logged yet
        </h2>
        <p className="mt-1 max-w-sm text-muted-foreground">
          Open a recipe and tap &ldquo;I cooked this&rdquo; to start your
          journal. Notes and photos build a history you&apos;ll love looking
          back on.
        </p>
      </div>
      <Button asChild size="lg">
        <Link href="/recipes">
          <BookOpen /> Browse recipes
        </Link>
      </Button>
    </div>
  );
}

function ConnectDbNotice() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface/50 p-8 text-center text-muted-foreground">
      <p className="mx-auto max-w-md">
        Connect a database to start keeping a cooking journal. Set{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
          DATABASE_URL
        </code>{" "}
        (see <code className="font-mono text-sm">.env.example</code>) or run{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
          docker compose up -d
        </code>
        .
      </p>
    </div>
  );
}
