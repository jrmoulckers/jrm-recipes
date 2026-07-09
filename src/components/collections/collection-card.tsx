import Link from "next/link";
import { BookMarked, Users } from "lucide-react";

import { cn } from "~/lib/utils";
import { CloudinaryImage } from "~/components/ui/cloudinary-image";
import { type CollectionSummary } from "~/server/collections/queries";

const GRADIENTS = [
  "from-primary/25 to-accent/20",
  "from-accent/25 to-primary/15",
  "from-secondary/30 to-primary/15",
  "from-primary/20 to-secondary/25",
];

function hashIndex(s: string, mod: number) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % mod;
}

export function CollectionCard({
  collection,
}: {
  collection: CollectionSummary;
}) {
  const gradient = GRADIENTS[hashIndex(collection.id, GRADIENTS.length)]!;

  return (
    <Link
      href={`/collections/${collection.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-token transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-token-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        {collection.coverImageUrl ? (
          <CloudinaryImage
            src={collection.coverImageUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div
            className={cn(
              "flex size-full items-center justify-center bg-gradient-to-br",
              gradient,
            )}
          >
            <BookMarked className="size-10 text-foreground/25" />
          </div>
        )}
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
        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-xs text-muted-foreground">
          <span>
            {collection.recipeCount}{" "}
            {collection.recipeCount === 1 ? "recipe" : "recipes"}
          </span>
          {collection.sharedGroups.length > 0 ? (
            <span className="inline-flex items-center gap-1 text-primary">
              <Users className="size-3" aria-hidden="true" />
              Shared with {collection.sharedGroups[0]!.name}
              {collection.sharedGroups.length > 1
                ? ` +${collection.sharedGroups.length - 1}`
                : ""}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
