import Link from "next/link";
import { Heart } from "lucide-react";

import {
  formatIngredientLine,
  formatRecipeMeta,
  formatStepLine,
  groupIngredients,
  groupSteps,
  provenanceLines,
} from "~/components/print/export";
import type { PrintRecipe } from "~/components/print/types";
import { buttonVariants } from "~/components/ui/button";
import { KeepsakePrintButton } from "~/components/recipe/keepsake-print-button";

/**
 * A recipe presented as a warm keepsake (issue #407): a personal note "from"
 * someone, shown prominently above the recipe, so handing a recipe down feels
 * like a gift rather than a copied link. Presentational only — the calling
 * route resolves the recipe through the normal visibility-checked loader, so
 * this never sees a recipe the viewer isn't allowed to read.
 */
export function KeepsakeView({
  recipe,
  from,
  note,
}: {
  recipe: PrintRecipe;
  from: string | null;
  note: string | null;
}) {
  const meta = formatRecipeMeta(recipe);
  const provenance = provenanceLines(recipe);
  let stepNumber = 0;

  return (
    <div className="mx-auto max-w-2xl px-5 py-10 print:py-0">
      <div className="mb-8 flex items-center justify-between gap-4 print:hidden">
        <Link
          href={`/recipes/${recipe.slug}`}
          className={buttonVariants({ variant: "ghost" })}
        >
          View recipe
        </Link>
        <KeepsakePrintButton />
      </div>

      <article className="rounded-3xl border border-border bg-card p-8 shadow-token print:rounded-none print:border-0 print:p-0 print:shadow-none">
        {/* Keepsake header: the personal note comes first, warmly framed. */}
        <header className="mb-8 border-b border-border pb-8 text-center">
          <span className="inline-flex size-12 items-center justify-center rounded-full bg-primary/12 text-primary">
            <Heart className="size-6" aria-hidden="true" />
          </span>
          <p className="mt-4 font-display text-sm uppercase tracking-[0.2em] text-muted-foreground">
            A recipe handed down to you
          </p>
          {note ? (
            <p className="mx-auto mt-4 max-w-lg whitespace-pre-line font-display text-xl leading-relaxed text-foreground">
              {note}
            </p>
          ) : null}
          {from ? (
            <p className="mt-4 font-display text-lg italic text-muted-foreground">
              With love, {from}
            </p>
          ) : null}
        </header>

        <h1 className="font-display text-3xl font-bold tracking-tight">
          {recipe.title}
        </h1>
        {recipe.description ? (
          <p className="mt-2 text-muted-foreground">{recipe.description}</p>
        ) : null}
        {meta.length > 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {meta.join(" · ")}
          </p>
        ) : null}

        <section className="mt-8">
          <h2 className="font-display text-xl font-semibold">Ingredients</h2>
          {recipe.ingredients.length === 0 ? (
            <p className="mt-2 text-muted-foreground">No ingredients listed.</p>
          ) : (
            groupIngredients(recipe.ingredients).map((group, groupIndex) => (
              <div key={group.section ?? `ing-${groupIndex}`} className="mt-3">
                {group.section ? (
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.section}
                  </h3>
                ) : null}
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {group.items.map((ingredient) => (
                    <li key={ingredient.id}>{formatIngredientLine(ingredient)}</li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>

        <section className="mt-8">
          <h2 className="font-display text-xl font-semibold">Method</h2>
          {recipe.steps.length === 0 ? (
            <p className="mt-2 text-muted-foreground">No steps listed.</p>
          ) : (
            groupSteps(recipe.steps).map((group, groupIndex) => (
              <div key={group.section ?? `step-${groupIndex}`} className="mt-3">
                {group.section ? (
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.section}
                  </h3>
                ) : null}
                <ol className="mt-1 space-y-3">
                  {group.items.map((step) => {
                    stepNumber += 1;
                    return (
                      <li key={step.id} className="flex gap-3">
                        <span className="font-display font-semibold text-primary">
                          {stepNumber}.
                        </span>
                        <span>{formatStepLine(step)}</span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))
          )}
        </section>

        {recipe.notes ? (
          <section className="mt-8">
            <h2 className="font-display text-xl font-semibold">Notes</h2>
            <p className="mt-2 whitespace-pre-line text-muted-foreground">
              {recipe.notes.trim()}
            </p>
          </section>
        ) : null}

        {recipe.story || provenance.length > 0 ? (
          <section className="mt-8">
            <h2 className="font-display text-xl font-semibold">Story</h2>
            {provenance.map((line) => (
              <p key={line} className="mt-1 text-sm italic text-muted-foreground">
                {line}
              </p>
            ))}
            {recipe.story ? (
              <p className="mt-2 whitespace-pre-line text-muted-foreground">
                {recipe.story.trim()}
              </p>
            ) : null}
          </section>
        ) : null}
      </article>
    </div>
  );
}
