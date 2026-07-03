import { cache } from "react";
import { type Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { getCurrentUser } from "~/server/auth";
import { getRecipe } from "~/server/recipes/queries";
import { formatQuantity } from "~/lib/units";
import { formatMinutes } from "~/lib/utils";

const load = cache(async (idOrSlug: string) => {
  const user = await getCurrentUser();
  return getRecipe(idOrSlug, user);
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const recipe = await load(id);
  return { title: recipe ? `Print · ${recipe.title}` : "Print recipe" };
}

/**
 * Minimal print-friendly view. The print/share agent expands this into
 * multiple recipe formats and a print/PDF trigger. Functional now: renders a
 * clean single-column recipe that prints well via the browser (Ctrl/Cmd+P).
 */
export default async function PrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recipe = await load(id);
  if (!recipe) notFound();

  const meta = [
    recipe.servings != null &&
      `${recipe.servings} ${recipe.servingsNoun ?? "servings"}`,
    recipe.prepMinutes != null && `Prep ${formatMinutes(recipe.prepMinutes)}`,
    recipe.cookMinutes != null && `Cook ${formatMinutes(recipe.cookMinutes)}`,
  ].filter(Boolean) as string[];

  return (
    <article className="mx-auto max-w-2xl px-6 py-10 text-foreground print:py-0">
      <Link
        href={`/recipes/${recipe.slug}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground print:hidden"
      >
        <ArrowLeft className="size-4" /> Back to recipe
      </Link>

      <header className="border-b border-border pb-4">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {recipe.title}
        </h1>
        {recipe.description && (
          <p className="mt-2 text-muted-foreground">{recipe.description}</p>
        )}
        {meta.length > 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            {meta.join("  ·  ")}
          </p>
        )}
      </header>

      <section className="mt-6">
        <h2 className="font-display text-xl font-semibold">Ingredients</h2>
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {recipe.ingredients.map((ing) => (
            <li key={ing.id} className="flex gap-2">
              <span className="font-medium">
                {ing.quantity != null ? formatQuantity(ing.quantity) : ""}
                {ing.unit ? ` ${ing.unit}` : ""}
              </span>
              <span>{ing.item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-xl font-semibold">Method</h2>
        <ol className="mt-3 flex flex-col gap-3">
          {recipe.steps.map((step, i) => (
            <li key={step.id} className="flex gap-3">
              <span className="font-display font-bold text-primary">
                {i + 1}.
              </span>
              <p className="leading-relaxed">{step.instruction}</p>
            </li>
          ))}
        </ol>
      </section>

      {recipe.notes && (
        <section className="mt-8">
          <h2 className="font-display text-xl font-semibold">Notes</h2>
          <p className="mt-2 whitespace-pre-line text-muted-foreground">
            {recipe.notes}
          </p>
        </section>
      )}
    </article>
  );
}
