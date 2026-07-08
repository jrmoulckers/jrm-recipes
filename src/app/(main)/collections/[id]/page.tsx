import { cache } from "react";
import { type Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BookMarked, Globe, Link2, Lock, UtensilsCrossed } from "lucide-react";
import { notFound } from "next/navigation";

import { getCurrentUser } from "~/server/auth";
import { getSharedCollection } from "~/server/collections/queries";
import { Button } from "~/components/ui/button";
import { RecipeCard } from "~/components/recipe/recipe-card";
import { CollectionActions } from "~/components/collections/collection-actions";
import { RemoveFromCollectionButton } from "~/components/collections/remove-from-collection-button";
import { ShareCollectionControl } from "~/components/collections/share-collection-control";

const load = cache(async (id: string) => {
  const user = await getCurrentUser();
  const collection = await getSharedCollection(id, user);
  return { user, collection };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { collection } = await load(id);
  if (!collection) return { title: "Collection not found" };
  return {
    title: collection.name,
    description: collection.description ?? undefined,
  };
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { collection } = await load(id);
  if (!collection) notFound();

  const visibilityBadge =
    collection.visibility === "public"
      ? { icon: Globe, label: "Public" }
      : collection.visibility === "unlisted"
        ? { icon: Link2, label: "Unlisted" }
        : { icon: Lock, label: "Private" };
  const VisibilityIcon = visibilityBadge.icon;

  return (
    <div className="container flex flex-col gap-8 py-10">
      <div>
        <Button asChild size="sm" variant="ghost" className="-ml-2">
          <Link href="/collections">
            <ArrowLeft /> Saved
          </Link>
        </Button>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-primary">
            <BookMarked className="size-5" />
            <span className="text-sm font-semibold uppercase tracking-wide">
              Collection
            </span>
            {collection.isOwner && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                <VisibilityIcon className="size-3" />
                {visibilityBadge.label}
              </span>
            )}
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {collection.name}
          </h1>
          {collection.description && (
            <p className="max-w-2xl text-muted-foreground">
              {collection.description}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            {!collection.isOwner && collection.ownerName ? (
              <>A collection by {collection.ownerName} · </>
            ) : null}
            {collection.recipes.length}{" "}
            {collection.recipes.length === 1 ? "recipe" : "recipes"}
          </p>
        </div>
        {collection.isOwner && (
          <div className="flex items-center gap-2">
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
                  className="absolute right-2 top-2 z-10"
                />
              )}
              <RecipeCard recipe={recipe} />
            </div>
          ))}
        </section>
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-surface/50 px-6 py-16 text-center">
          <span className="inline-flex size-16 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <UtensilsCrossed className="size-7" />
          </span>
          <div>
            <h2 className="font-display text-xl font-semibold">
              {collection.isOwner
                ? "This collection is empty"
                : "Nothing to see here yet"}
            </h2>
            <p className="mt-1 max-w-md text-muted-foreground">
              {collection.isOwner
                ? "Open any recipe and use “Save to collection” to add it here."
                : "This collection doesn’t have any recipes you can view right now."}
            </p>
          </div>
          <Button asChild size="lg">
            <Link href="/recipes">Browse recipes</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
