import { type Metadata } from "next";
import { type ReactNode } from "react";
import Link from "next/link";
import { BookMarked, Heart, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { getCurrentUser, isAuthConfigured } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import {
  listMyCollections,
  listCollectionsSharedWithViewer,
  listMyFavorites,
  type ViewerSharedCollection,
} from "~/server/collections/queries";
import { Button } from "~/components/ui/button";
import { RecipeCard } from "~/components/recipe/recipe-card";
import { CollectionCard } from "~/components/collections/collection-card";
import { CloudinaryImage } from "~/components/ui/cloudinary-image";
import { CreateCollectionDialog } from "~/components/collections/create-collection-dialog";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    title: t("saved.title"),
    description: t("saved.description"),
  };
}

export default async function CollectionsPage() {
  const user = await getCurrentUser();
  const authConfigured = isAuthConfigured();
  const dbConfigured = isDbConfigured();
  const t = await getTranslations("collections.page");

  if (authConfigured && dbConfigured && !user) return <SignInNudge />;

  const [collections, favorites] = user
    ? await Promise.all([listMyCollections(user.id), listMyFavorites(user.id)])
    : [[], []];
  const sharedWithMe = user
    ? await listCollectionsSharedWithViewer(user.id)
    : [];

  return (
    <div className="container flex flex-col gap-10 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            {t("title")}
          </h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            {t("description")}
          </p>
        </div>
        {user && dbConfigured ? (
          <CreateCollectionDialog />
        ) : (
          <Button size="lg" disabled>
            {t("newCollection")}
          </Button>
        )}
      </header>

      {!dbConfigured ? (
        <ConnectDbNotice />
      ) : (
        <>
          <section className="flex flex-col gap-5">
            <div className="flex items-center gap-2">
              <Heart className="size-5 text-primary" />
              <h2 className="font-display text-2xl font-bold tracking-tight">
                {t("favorites.heading")}
              </h2>
            </div>
            {favorites.length > 0 ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {favorites.map((recipe) => (
                  <RecipeCard
                    key={recipe.id}
                    recipe={recipe}
                    favorited
                    canFavorite
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Heart className="size-7" />}
                title={t("favorites.emptyTitle")}
                description={t("favorites.emptyBody")}
              />
            )}
          </section>

          <section className="flex flex-col gap-5">
            <div className="flex items-center gap-2">
              <BookMarked className="size-5 text-primary" />
              <h2 className="font-display text-2xl font-bold tracking-tight">
                {t("collections.heading")}
              </h2>
            </div>
            {collections.length > 0 ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {collections.map((collection) => (
                  <CollectionCard key={collection.id} collection={collection} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<BookMarked className="size-7" />}
                title={t("collections.emptyTitle")}
                description={t("collections.emptyBody")}
                action={<CreateCollectionDialog />}
              />
            )}
          </section>

          {sharedWithMe.length > 0 ? (
            <section className="flex flex-col gap-5">
              <div className="flex items-center gap-2">
                <Users className="size-5 text-primary" />
                <h2 className="font-display text-2xl font-bold tracking-tight">
                  {t("sharedWithYou")}
                </h2>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {sharedWithMe.map((collection) => (
                  <SharedWithYouCard
                    key={collection.id}
                    collection={collection}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

async function SharedWithYouCard({
  collection,
}: {
  collection: ViewerSharedCollection;
}) {
  const tCard = await getTranslations("collections.card");
  return (
    <Link
      href={`/collections/${collection.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-token transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-token-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div className="bg-primary/12 relative aspect-[16/10] overflow-hidden">
        {collection.coverImageUrl ? (
          <CloudinaryImage
            src={collection.coverImageUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-primary/25">
            <BookMarked className="size-10" />
          </div>
        )}
        {collection.groupName ? (
          <div className="absolute start-2 top-2 inline-flex items-center gap-1 rounded-full bg-card/90 px-2 py-0.5 text-xs font-medium text-primary backdrop-blur">
            <Users className="size-3" aria-hidden="true" />
            {tCard("sharedWith", { group: collection.groupName })}
          </div>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-1 font-display text-lg font-semibold leading-tight">
          {collection.name}
        </h3>
        {collection.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {collection.description}
          </p>
        )}
        <div className="mt-auto pt-1 text-xs text-muted-foreground">
          {collection.ownerName
            ? tCard("recipeCountByOwner", {
                count: collection.recipeCount,
                name: collection.ownerName,
              })
            : tCard("recipeCount", { count: collection.recipeCount })}
        </div>
      </div>
    </Link>
  );
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-surface/50 px-6 py-16 text-center">
      <span className="bg-primary/12 inline-flex size-16 items-center justify-center rounded-2xl text-primary">
        {icon}
      </span>
      <div>
        <h3 className="font-display text-xl font-semibold">{title}</h3>
        <p className="mt-1 max-w-md text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

async function SignInNudge() {
  const t = await getTranslations("collections.page.signIn");
  return (
    <div className="container py-16">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 text-center shadow-token">
        <span className="bg-primary/12 inline-flex size-16 items-center justify-center rounded-2xl text-primary">
          <Heart className="size-7" aria-hidden="true" />
        </span>
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            {t("title")}
          </h1>
          <p className="mt-2 text-muted-foreground">{t("body")}</p>
        </div>
      </div>
    </div>
  );
}

async function ConnectDbNotice() {
  const t = await getTranslations("dbNotice");
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-8 text-center text-muted-foreground">
      <p className="mx-auto max-w-md">
        {t.rich("collections", {
          code: (chunks: ReactNode) => (
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
              {chunks}
            </code>
          ),
        })}
      </p>
    </div>
  );
}
