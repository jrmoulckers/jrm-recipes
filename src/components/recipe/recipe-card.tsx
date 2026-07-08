import * as React from "react";
import Link from "next/link";
import { Clock3, Star, UtensilsCrossed, Users } from "lucide-react";

import { cn, formatMinutes } from "~/lib/utils";
import {
  ratingDisplay,
  ratingSummary,
  summaryFromAggregates,
} from "~/lib/ratings";
import { type Allergen } from "~/lib/allergens";
import {
  matchFieldLabel,
  splitHighlight,
  type RecipeMatchReason,
} from "~/lib/search-match";
import { Badge } from "~/components/ui/badge";
import { CloudinaryImage } from "~/components/ui/cloudinary-image";
import { FavoriteButton } from "~/components/collections/favorite-button";
import {
  CardDietaryBadge,
  type CardDietaryMember,
} from "~/components/recipe/card-dietary-badge";

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
  /** Denormalized, owner-excluded rating aggregates (issue #154). Preferred. */
  ratingCount?: number;
  ratingSum?: number;
  /** Legacy raw ratings, used only when aggregates aren't provided. */
  ratings?: { value: number }[];
  /**
   * Detected allergens rolled up from ingredients (conservative direct+hidden
   * union), for the safe-for badge. `null` = no structured ingredient data to
   * analyze (badge withholds the "safe" verdict); `[]` = analyzed, none found.
   */
  allergens?: Allergen[] | null;
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
  matchReason,
  members,
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
  /**
   * Optional "why this matched" hint for search results. When set, the matched
   * term is highlighted in the title and a subtle reason line is shown for
   * non-title matches. Omitted on browse/discover/collection cards.
   */
  matchReason?: RecipeMatchReason | null;
  /**
   * Family members to power the "safe for [name]" badge (#431). When supplied
   * and one is active, the card shows an allergen safety signal; omit it (the
   * default) and no badge renders.
   */
  members?: CardDietaryMember[];
}) {
  const summary =
    recipe.ratingCount != null && recipe.ratingSum != null
      ? summaryFromAggregates(recipe.ratingCount, recipe.ratingSum)
      : ratingSummary(recipe.ratings ?? []);
  const rating = ratingDisplay(summary);
  const gradient = GRADIENTS[hashIndex(recipe.id, GRADIENTS.length)]!;
  const titleSegments = matchReason
    ? splitHighlight(recipe.title, matchReason.term)
    : null;

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
          <CloudinaryImage
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
          {titleSegments
            ? titleSegments.map((seg, i) =>
                seg.hit ? (
                  <mark
                    key={i}
                    className="rounded bg-primary/15 px-0.5 text-foreground"
                  >
                    {seg.text}
                  </mark>
                ) : (
                  <React.Fragment key={i}>{seg.text}</React.Fragment>
                ),
              )
            : recipe.title}
        </h3>
        {matchReason && matchReason.field !== "title" && (
          <p className="text-xs text-muted-foreground">
            Matches {matchFieldLabel(matchReason.field)}:{" "}
            <span className="font-medium text-foreground/80">
              {matchReason.term}
            </span>
          </p>
        )}
        {recipe.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {recipe.description}
          </p>
        )}
        {members && members.length > 0 && (
          <CardDietaryBadge
            members={members}
            recipeAllergens={recipe.allergens ?? null}
          />
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
