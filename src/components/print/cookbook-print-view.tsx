import Link from "next/link";
import { BookMarked } from "lucide-react";

import { RecipePrintBody } from "~/components/print/recipe-print-body";
import { PrintNowButton } from "~/components/print/print-now-button";
import type { PrintRecipe } from "~/components/print/types";
import { buttonVariants } from "~/components/ui/button";

export type CookbookPrintData = {
  id: string;
  name: string;
  description: string | null;
  coverImageUrl: string | null;
  ownerName: string | null;
  recipes: PrintRecipe[];
};

/**
 * Lays a whole collection out as one printable booklet (issue #397): a cover
 * page, an optional dedication, a generated table of contents, then every
 * recipe — each starting on a fresh page via `break-before-page` so a browser
 * "Print → Save as PDF" produces a real family cookbook. Presentational only;
 * the route resolves recipes through the visibility-checked loaders.
 */
export function CookbookPrintView({
  collection,
  dedication,
}: {
  collection: CookbookPrintData;
  dedication: string | null;
}) {
  const { recipes } = collection;

  if (recipes.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-5 py-24 text-center">
        <span className="bg-primary/12 inline-flex size-14 items-center justify-center rounded-2xl text-primary">
          <BookMarked className="size-7" aria-hidden="true" />
        </span>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          This cookbook is still empty
        </h1>
        <p className="text-muted-foreground">
          Add a few recipes to “{collection.name}” and they’ll be bound together
          here — cover, contents, and all — ready to print.
        </p>
        <Link
          href={`/collections/${collection.id}`}
          className={buttonVariants({ variant: "outline" })}
        >
          Back to collection
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 print:px-0 print:py-0">
      <div className="mb-8 flex items-center justify-between gap-4 print:hidden">
        <Link
          href={`/collections/${collection.id}`}
          className={buttonVariants({ variant: "ghost" })}
        >
          Back to collection
        </Link>
        <PrintNowButton label="Print / Save as PDF" />
      </div>

      {/* Cover page */}
      <section className="flex min-h-[60vh] break-after-page flex-col items-center justify-center text-center print:min-h-screen">
        {collection.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- print reliability: avoid the optimizer in the print pipeline.
          <img
            src={collection.coverImageUrl}
            alt=""
            className="mb-8 h-48 w-48 rounded-2xl object-cover shadow-token"
          />
        ) : (
          <span className="bg-primary/12 mb-8 inline-flex size-16 items-center justify-center rounded-2xl text-primary">
            <BookMarked className="size-8" aria-hidden="true" />
          </span>
        )}
        <p className="font-display text-sm uppercase tracking-[0.25em] text-muted-foreground">
          A family cookbook
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
          {collection.name}
        </h1>
        {collection.description ? (
          <p className="mt-4 max-w-xl text-muted-foreground">
            {collection.description}
          </p>
        ) : null}
        {dedication ? (
          <p className="mx-auto mt-8 max-w-lg whitespace-pre-line font-display text-xl italic leading-relaxed">
            {dedication}
          </p>
        ) : null}
        {collection.ownerName ? (
          <p className="mt-8 text-sm text-muted-foreground">
            Collected by {collection.ownerName}
          </p>
        ) : null}
        <p className="mt-2 text-sm text-muted-foreground">
          {recipes.length} {recipes.length === 1 ? "recipe" : "recipes"}
        </p>
      </section>

      {/* Table of contents */}
      <section className="break-after-page">
        <h2 className="font-display text-2xl font-bold tracking-tight">
          Contents
        </h2>
        <ol className="mt-4 divide-y divide-border">
          {recipes.map((recipe, index) => (
            <li
              key={recipe.id}
              className="flex items-baseline justify-between gap-4 py-2"
            >
              <span>
                <span className="font-display font-semibold text-primary">
                  {index + 1}.
                </span>{" "}
                {recipe.title}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* Recipes, each on its own page */}
      {recipes.map((recipe) => (
        <article
          key={recipe.id}
          className="break-before-page pt-8 first:pt-0 print:pt-0"
        >
          <RecipePrintBody recipe={recipe} />
        </article>
      ))}
    </div>
  );
}
