import { cache } from 'react';
import { type Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, BookMarked, Globe, Link2, Lock, Users, UtensilsCrossed } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getCurrentUser } from '~/server/auth';
import { getSharedCollection, listShareTargetsForCollection } from '~/server/collections/queries';
import { Button } from '~/components/ui/button';
import { RecipeCard } from '~/components/recipe/recipe-card';
import { CollectionActions } from '~/components/collections/collection-actions';
import { RemoveFromCollectionButton } from '~/components/collections/remove-from-collection-button';
import { ShareCollectionControl } from '~/components/collections/share-collection-control';
import { ShareWithGroupControl } from '~/components/collections/share-with-group-control';
import { PrintCookbookButton } from '~/components/collections/print-cookbook-button';
import { parseCollectionParams, type CollectionRouteParams } from '~/lib/route-params';
import { brand } from '~/config/brand';
import { withRouteMessages } from '~/components/i18n/route-messages';

const load = cache(async (id: string) => {
  const user = await getCurrentUser();
  const collection = await getSharedCollection(id, user);
  return { user, collection };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<CollectionRouteParams>;
}): Promise<Metadata> {
  const { id } = await parseCollectionParams(params);
  const { collection } = await load(id);
  const tMeta = await getTranslations('metadata');
  if (!collection) return { title: tMeta('collection.notFound') };
  const description =
    collection.description ?? tMeta('collection.description', { brand: brand.name });
  return {
    title: collection.name,
    description,
    openGraph: {
      type: 'website',
      title: `${collection.name} · ${brand.name}`,
      description,
    },
    twitter: {
      card: 'summary_large_image',
      title: collection.name,
      description,
    },
  };
}

async function CollectionPage({ params }: { params: Promise<CollectionRouteParams> }) {
  const { id } = await parseCollectionParams(params);
  const { user, collection } = await load(id);
  if (!collection) notFound();

  const shareTargets =
    collection.isOwner && user ? await listShareTargetsForCollection(collection.id, user) : [];

  const t = await getTranslations('collections.detail');
  const tCard = await getTranslations('collections.card');
  const tShare = await getTranslations('collections.share.visibility.options');

  const visibilityBadge =
    collection.visibility === 'public'
      ? { icon: Globe, label: tShare('public.label') }
      : collection.visibility === 'unlisted'
        ? { icon: Link2, label: tShare('unlisted.label') }
        : { icon: Lock, label: tShare('private.label') };
  const VisibilityIcon = visibilityBadge.icon;

  return (
    <div className="container flex flex-col gap-8 py-10">
      <div>
        <Button asChild size="sm" variant="ghost" className="-ms-2">
          <Link href="/collections">
            <ArrowLeft /> {t('backToSaved')}
          </Link>
        </Button>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-primary">
            <BookMarked className="size-5" />
            <span className="text-sm font-semibold uppercase tracking-wide">{t('kicker')}</span>
            {collection.isOwner && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                <VisibilityIcon className="size-3" />
                {visibilityBadge.label}
              </span>
            )}
            {!collection.isOwner && collection.sharedWithGroups.length > 0 && (
              <span className="bg-primary/12 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-primary">
                <Users className="size-3" />
                {tCard('sharedWith', {
                  group: collection.sharedWithGroups[0]!.name,
                })}
              </span>
            )}
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {collection.name}
          </h1>
          {collection.description && (
            <p className="max-w-2xl text-muted-foreground">{collection.description}</p>
          )}
          <p className="text-sm text-muted-foreground">
            {!collection.isOwner && collection.ownerName
              ? t('byOwnerWithCount', {
                  name: collection.ownerName,
                  count: collection.recipes.length,
                })
              : tCard('recipeCount', { count: collection.recipes.length })}
          </p>
        </div>
        {collection.isOwner && (
          <div className="flex items-center gap-2">
            {collection.recipes.length > 0 && <PrintCookbookButton collectionId={collection.id} />}
            <ShareWithGroupControl collectionId={collection.id} groups={shareTargets} />
            <ShareCollectionControl
              collectionId={collection.id}
              visibility={collection.visibility}
              shareToken={collection.shareToken}
            />
            <CollectionActions
              collection={{
                id: collection.id,
                name: collection.name,
                description: collection.description,
                coverImageUrl: collection.coverImageUrl,
              }}
            />
          </div>
        )}
      </header>

      {collection.recipes.length > 0 ? (
        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {collection.recipes.map((recipe) => (
            <div key={recipe.id} className="relative">
              {collection.isOwner && (
                <RemoveFromCollectionButton
                  collectionId={collection.id}
                  recipeId={recipe.id}
                  className="absolute end-2 top-2 z-10"
                />
              )}
              <RecipeCard recipe={recipe} />
            </div>
          ))}
        </section>
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-surface/50 px-6 py-16 text-center">
          <span className="bg-primary/12 inline-flex size-16 items-center justify-center rounded-2xl text-primary">
            <UtensilsCrossed className="size-7" />
          </span>
          <div>
            <h2 className="font-display text-xl font-semibold">
              {collection.isOwner ? t('empty.ownerTitle') : t('empty.viewerTitle')}
            </h2>
            <p className="mt-1 max-w-md text-muted-foreground">
              {collection.isOwner ? t('empty.ownerBody') : t('empty.viewerBody')}
            </p>
          </div>
          <Button asChild size="lg">
            <Link href="/recipes">{t('browseRecipes')}</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

export default withRouteMessages(CollectionPage);
