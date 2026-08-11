import { type Metadata } from 'next';
import Link from 'next/link';
import { Compass, SearchX } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { getCurrentUser } from '~/server/auth';
import { isDbConfigured } from '~/server/db';
import { listPublicRecipes } from '~/server/recipes/queries';
import { getFavoriteRecipeIds } from '~/server/collections/queries';
import { brand } from '~/config/brand';
import { absoluteUrl } from '~/lib/utils';
import { DiscoverFeed } from '~/components/recipe/discover-feed';
import { Button } from '~/components/ui/button';
import { withRouteMessages } from '~/components/i18n/route-messages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata');
  const title = t('discover.title');
  const description = t('discover.description', { brand: brand.name });

  return {
    title,
    description,
    alternates: { canonical: absoluteUrl('/discover') },
    robots: { index: true, follow: true },
    openGraph: {
      title: `${title} · ${brand.name}`,
      description,
      url: absoluteUrl('/discover'),
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

/** First row of the widest grid (lg:grid-cols-3) rendered with LCP priority. */
const LCP_PRIORITY_COUNT = 3;

/**
 * Public, indexable discover feed (issue #330). Works fully signed-out: the
 * public recipe list and the "Load more" action both degrade gracefully without
 * a viewer, and no auth-only call sits on the critical path.
 */
async function DiscoverPage() {
  const dbReady = isDbConfigured();
  const user = await getCurrentUser();
  const [discover, favoriteIds] = await Promise.all([
    listPublicRecipes(),
    getFavoriteRecipeIds(user?.id),
  ]);
  const t = await getTranslations('recipe.discover');
  const tMeta = await getTranslations('metadata');

  return (
    <div className="container flex flex-col gap-8 py-10">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-primary">
          <Compass className="size-6" />
          <span className="text-sm font-medium uppercase tracking-wide">{t('kicker')}</span>
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {t('heading', { brand: brand.name })}
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          {tMeta('discover.description', { brand: brand.name })}
        </p>
      </header>

      {!dbReady || discover.items.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-surface/50 py-16 text-center">
          <span className="inline-flex size-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <SearchX className="size-7" />
          </span>
          <div>
            <h2 className="font-display text-xl font-semibold">{t('empty.title')}</h2>
            <p className="mt-1 max-w-sm text-muted-foreground">{t('empty.body')}</p>
          </div>
          <Button asChild size="lg">
            <Link href="/recipes/new">{t('empty.cta')}</Link>
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

export default withRouteMessages(DiscoverPage);
