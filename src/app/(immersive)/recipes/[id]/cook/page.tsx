import { cache } from "react";
import { type Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { X } from "lucide-react";

import { getCurrentUser } from "~/server/auth";
import { getRecipe } from "~/server/recipes/queries";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";

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
  return { title: recipe ? `Cook · ${recipe.title}` : "Cook mode" };
}

/**
 * Minimal, working cook-mode surface. A dedicated agent expands this into the
 * full step-by-step experience (timers, scaling, wake-lock, media). Kept
 * functional now so the "Cook" action always resolves to real content.
 */
export default async function CookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recipe = await load(id);
  if (!recipe) notFound();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Cook mode
          </p>
          <h1 className="truncate font-display text-lg font-semibold">
            {recipe.title}
          </h1>
        </div>
        <Button asChild variant="ghost" size="icon" aria-label="Exit cook mode">
          <Link href={`/recipes/${recipe.slug}`}>
            <X />
          </Link>
        </Button>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-8">
        {recipe.steps.length > 0 ? (
          <ol className="flex flex-col gap-8">
            {recipe.steps.map((step, i) => (
              <li key={step.id} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/12 font-display text-xl font-bold text-primary">
                  {i + 1}
                </span>
                <div className="flex flex-col gap-2 pt-1">
                  <p className="text-xl leading-relaxed">{step.instruction}</p>
                  {step.timerSeconds != null && (
                    <Badge variant="secondary" className="w-fit">
                      {Math.round(step.timerSeconds / 60)} min timer
                    </Badge>
                  )}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted-foreground">This recipe has no steps yet.</p>
        )}
      </main>
    </div>
  );
}
