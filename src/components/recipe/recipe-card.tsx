import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { Clock3, Star, UtensilsCrossed, Users } from "lucide-react";

import { cn, formatMinutes } from "~/lib/utils";
import { ratingDisplay, ratingSummary } from "~/lib/ratings";
import { Badge } from "~/components/ui/badge";
import { FavoriteButton } from "~/components/collections/favorite-button";

export type CardRecipe = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  totalMinutes: number | null;
  servings: number | null;
  difficulty: "easy" | "medium" | "hard" | null;
  visibility: string;
  author?: { name: string | null } | null;
  tags?: { tag: { name: string } }[];
  ratings?: { value: number }[];
};

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

export function RecipeCard({
  recipe,
  favorited = false,
  canFavorite = false,
  priority = false,
}: {
  recipe: CardRecipe;
  /** Initial favorited state for the heart overlay. */
  favorited?: boolean;
  /** Show the favorite (heart) toggle over the cover image. */
  canFavorite?: boolean;
  /**
   * Prioritize the cover image for LCP: render it eagerly with
   * `fetchpriority="high"` and a preload hint instead of lazy-loading. Only set
   * this for genuinely above-the-fold cards (e.g. the first row of the grid).
   */
  priority?: boolean;
}) {
  const rating = ratingDisplay(ratingSummary(recipe.ratings ?? []));
  const gradient = GRADIENTS[hashIndex(recipe.id, GRADIENTS.length)]!;

  return (
    <div className="relative">
      {canFavorite && (
        <FavoriteButton
          recipeId={recipe.id}
          recipeSlug={recipe.slug}
          initialFavorited={favorited}
          className="absolute right-2 top-2 z-10"
        />
      )}
      <Link
        href={`/recipes/${recipe.slug}`}
        className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-token transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-token-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
      <div className="relative aspect-[16/10] overflow-hidden">
        {recipe.coverImageUrl ? (
          <Image
            src={recipe.coverImageUrl}
            alt=""
            fill
            priority={priority}
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
            <UtensilsCrossed className="size-10 text-foreground/25" />
          </div>
        )}
        {recipe.visibility !== "public" && (
          <span className="absolute left-2 top-2">
            <Badge variant="muted" className="capitalize backdrop-blur">
              {recipe.visibility}
            </Badge>
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-1 font-display text-lg font-semibold leading-tight">
          {recipe.title}
        </h3>
        {recipe.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {recipe.description}
          </p>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
          {recipe.totalMinutes != null && (
            <span className="inline-flex items-center gap-1">
              <Clock3 className="size-3.5" /> {formatMinutes(recipe.totalMinutes)}
            </span>
          )}
          {recipe.servings != null && (
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5" /> {recipe.servings}
            </span>
          )}
          {rating.unrated ? (
            <span className="text-muted-foreground/70">Unrated</span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <StarRating filled={rating.filled} label={rating.label} />
              <span className="tabular-nums">
                {rating.average.toFixed(1)}
                <span className="text-muted-foreground/70">
                  {" "}
                  ({rating.count})
                </span>
              </span>
            </span>
          )}
          {recipe.difficulty && (
            <span className="capitalize">{recipe.difficulty}</span>
          )}
        </div>
      </div>
    </Link>
    </div>
  );
}

/** Compact, read-only 5-star row summarising a recipe's average rating. */
function StarRating({ filled, label }: { filled: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden
          className={cn(
            "size-3.5",
            n <= filled
              ? "fill-warning text-warning"
              : "fill-transparent text-muted-foreground/40",
          )}
        />
      ))}
    </span>
  );
}
