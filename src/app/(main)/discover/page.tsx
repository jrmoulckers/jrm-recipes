import { type Metadata } from "next";
import Link from "next/link";
import { Compass, SearchX } from "lucide-react";

import { getCurrentUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import { listPublicRecipes } from "~/server/recipes/queries";
import { getFavoriteRecipeIds } from "~/server/collections/queries";
import { brand } from "~/config/brand";
import { absoluteUrl } from "~/lib/utils";
import { DiscoverFeed } from "~/components/recipe/discover-feed";
import { Button } from "~/components/ui/button";

const title = "Discover recipes";
const description = `Browse public family recipes shared by the ${brand.name} community — no account needed.`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: absoluteUrl("/discover") },
  robots: { index: true, follow: true },
  openGraph: {
    title: `${title} · ${brand.name}`,
    description,
    url: absoluteUrl("/discover"),
  },
  twitter: { card: "summary_large_image", title, description },
};

/** First row of the widest grid (lg:grid-cols-3) rendered with LCP priority. */
const LCP_PRIORITY_COUNT = 3;

/**
 * Public, indexable discover feed (issue #330). Works fully signed-out: the
 * public recipe list and the "Load more" action both degrade gracefully without
 * a viewer, and no auth-only call sits on the critical path.
 */
export default async function DiscoverPage() {
  const dbReady = isDbConfigured();
  const user = await getCurrentUser();
  const [discover, favoriteIds] = await Promise.all([
    listPublicRecipes(),
    getFavoriteRecipeIds(user?.id),
  ]);

  return (
    <div className="container flex flex-col gap-8 py-10">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-primary">
          <Compass className="size-6" />
          <span className="text-sm font-medium uppercase tracking-wide">
            Discover
          </span>
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Public recipes from the {brand.name} community
        </h1>
        <p className="max-w-2xl text-muted-foreground">{description}</p>
      </header>

      {!dbReady || discover.items.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-surface/50 py-16 text-center">
          <span className="inline-flex size-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <SearchX className="size-7" />
          </span>
          <div>
            <h2 className="font-display text-xl font-semibold">
              No public recipes yet
            </h2>
            <p className="mt-1 max-w-sm text-muted-foreground">
              Be the first to share one with the world.
            </p>
          </div>
          <Button asChild size="lg">
            <Link href="/recipes/new">Create a recipe</Link>
          </Button>
        </div>
      ) : (
        <DiscoverFeed
          initialItems={discover.items}
          initialNextOffset={discover.nextOffset}
          canFavorite={Boolean(user)}
          favoritedIds={[...favoriteIds]}
          priorityCount={LCP_PRIORITY_COUNT}
        />
      )}
    </div>
  );
}
