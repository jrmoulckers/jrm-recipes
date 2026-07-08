import { type Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowUpRight, ChefHat, Clock3, Flame, Users } from "lucide-react";

import { brand } from "~/config/brand";
import { absoluteUrl, formatMinutes } from "~/lib/utils";
import { getPublicRecipeCard } from "~/server/recipes/queries";
import { parseRecipeParams, type RecipeRouteParams } from "~/lib/route-params";

// A recipe can be unpublished/made private at any time, so never cache the
// public/private decision at build time.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<RecipeRouteParams>;
}): Promise<Metadata> {
  const { id } = await parseRecipeParams(params);
  const recipe = await getPublicRecipeCard(id);
  return {
    title: recipe ? `${recipe.title} · Embed` : "Recipe",
    // The canonical recipe page carries the indexable metadata; the embed is a
    // widget, so keep it out of search results.
    robots: { index: false, follow: false },
  };
}

/**
 * Compact, iframe-safe recipe card (issue #347). Rendered outside the `(main)`
 * app chrome so it embeds cleanly on foreign sites, and served *only* for
 * `public` + `published` recipes — anything else 404s, never leaking private
 * data. Every embed carries the brand mark + a "View full recipe" backlink.
 */
export default async function EmbedRecipePage({
  params,
}: {
  params: Promise<RecipeRouteParams>;
}) {
  const { id } = await parseRecipeParams(params);
  const recipe = await getPublicRecipeCard(id);
  if (!recipe) notFound();

  const href = absoluteUrl(`/recipes/${recipe.slug}`);
  const authorName = recipe.author?.name?.trim();
  const facts = [
    recipe.totalMinutes != null && recipe.totalMinutes > 0
      ? { icon: Clock3, label: formatMinutes(recipe.totalMinutes) }
      : null,
    recipe.servings != null
      ? {
          icon: Users,
          label: `${recipe.servings} ${recipe.servingsNoun ?? "servings"}`,
        }
      : null,
    recipe.difficulty
      ? { icon: Flame, label: recipe.difficulty }
      : null,
  ].filter(Boolean) as { icon: typeof Clock3; label: string }[];

  return (
    <main className="flex min-h-dvh items-stretch bg-background p-3 text-foreground">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex w-full overflow-hidden rounded-2xl border border-border bg-card shadow-token transition-shadow hover:shadow-token-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="relative hidden w-2/5 shrink-0 bg-primary/10 sm:block">
          {recipe.coverImageUrl ? (
            <Image
              src={recipe.coverImageUrl}
              alt=""
              fill
              sizes="200px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-primary">
              <ChefHat className="size-10" aria-hidden="true" />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
              <ChefHat className="size-3.5" aria-hidden="true" />
              {brand.name}
            </div>
            <h1 className="line-clamp-2 font-display text-xl font-bold leading-tight tracking-tight">
              {recipe.title}
            </h1>
            {authorName ? (
              <p className="mt-1 truncate text-sm text-muted-foreground">
                by {authorName}
              </p>
            ) : null}
            {recipe.description ? (
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                {recipe.description}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            {facts.length > 0 ? (
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {facts.map((fact) => (
                  <li key={fact.label} className="flex items-center gap-1">
                    <fact.icon className="size-3.5" aria-hidden="true" />
                    {fact.label}
                  </li>
                ))}
              </ul>
            ) : null}
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
              View full recipe
              <ArrowUpRight
                className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                aria-hidden="true"
              />
            </span>
          </div>
        </div>
      </a>
    </main>
  );
}
