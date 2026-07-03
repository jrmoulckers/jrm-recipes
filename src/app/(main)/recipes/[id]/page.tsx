import { cache } from "react";
import { type Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ChefHat,
  Clock3,
  Flame,
  Pencil,
  Play,
  Printer,
  Timer,
  Users,
} from "lucide-react";

import { getCurrentUser } from "~/server/auth";
import { getRecipe, ratingSummary } from "~/server/recipes/queries";
import { formatMinutes } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Separator } from "~/components/ui/separator";
import { IngredientsPanel } from "~/components/recipe/ingredients-panel";
import { ShareButton } from "~/components/recipe/share-button";
import { DeleteRecipeButton } from "~/components/recipe/delete-recipe-button";

const load = cache(async (idOrSlug: string) => {
  const user = await getCurrentUser();
  const recipe = await getRecipe(idOrSlug, user);
  return { user, recipe };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { recipe } = await load(id);
  if (!recipe) return { title: "Recipe not found" };
  return {
    title: recipe.title,
    description: recipe.description ?? undefined,
  };
}

function formatTimer(seconds: number): string {
  if (seconds >= 60) {
    const m = Math.round(seconds / 60);
    return `${m} min`;
  }
  return `${seconds}s`;
}

export default async function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, recipe } = await load(id);
  if (!recipe) notFound();

  const isOwner = Boolean(user?.id === recipe.authorId);
  const { average, count } = ratingSummary(recipe.ratings);
  const meta = [
    recipe.totalMinutes != null && {
      icon: Clock3,
      label: formatMinutes(recipe.totalMinutes),
    },
    recipe.prepMinutes != null && {
      icon: Timer,
      label: `${formatMinutes(recipe.prepMinutes)} prep`,
    },
    recipe.servings != null && {
      icon: Users,
      label: `${recipe.servings} ${recipe.servingsNoun ?? "servings"}`,
    },
    recipe.difficulty && { icon: Flame, label: recipe.difficulty },
  ].filter(Boolean) as { icon: typeof Clock3; label: string }[];

  return (
    <article className="pb-16">
      {/* Hero */}
      <div className="relative">
        {recipe.coverImageUrl ? (
          <div className="relative aspect-[21/9] max-h-[420px] w-full overflow-hidden">
            <Image
              src={recipe.coverImageUrl}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
          </div>
        ) : (
          <div className="aspect-[21/9] max-h-72 w-full bg-gradient-to-br from-primary/20 via-accent/10 to-secondary/20" />
        )}
      </div>

      <div className="container -mt-16 flex flex-col gap-8">
        <header className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm" variant="ghost" className="-ml-2">
              <Link href="/recipes">
                <ArrowLeft /> Recipes
              </Link>
            </Button>
            {recipe.visibility !== "public" && (
              <Badge variant="muted" className="capitalize">
                {recipe.visibility}
              </Badge>
            )}
            {recipe.cuisine && <Badge variant="outline">{recipe.cuisine}</Badge>}
          </div>

          <h1 className="max-w-3xl font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            {recipe.title}
          </h1>
          {recipe.description && (
            <p className="max-w-2xl text-lg text-muted-foreground">
              {recipe.description}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {recipe.author?.name && (
              <span>
                By{" "}
                <span className="font-medium text-foreground">
                  {recipe.author.name}
                </span>
              </span>
            )}
            {meta.map((m, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 capitalize">
                <m.icon className="size-4" /> {m.label}
              </span>
            ))}
            {count > 0 && (
              <span className="inline-flex items-center gap-1.5">
                ⭐ {average.toFixed(1)} ({count})
              </span>
            )}
          </div>

          {/* Action bar */}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button asChild size="lg">
              <Link href={`/recipes/${recipe.slug}/cook`}>
                <Play /> Cook
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={`/recipes/${recipe.slug}/print`}>
                <Printer /> Print
              </Link>
            </Button>
            <ShareButton title={recipe.title} />
            {isOwner && (
              <Button asChild size="lg" variant="outline">
                <Link href={`/recipes/${recipe.slug}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
            )}
            {isOwner && <DeleteRecipeButton id={recipe.id} />}
          </div>
        </header>

        <Separator />

        <div className="grid gap-10 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          {/* Ingredients */}
          <div className="lg:sticky lg:top-20 lg:self-start">
            <h2 className="mb-4 font-display text-2xl font-bold tracking-tight">
              Ingredients
            </h2>
            {recipe.ingredients.length > 0 ? (
              <IngredientsPanel
                ingredients={recipe.ingredients}
                baseServings={recipe.servings}
                servingsNoun={recipe.servingsNoun}
              />
            ) : (
              <p className="text-muted-foreground">No ingredients listed.</p>
            )}
          </div>

          {/* Steps */}
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl font-bold tracking-tight">
                Method
              </h2>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/recipes/${recipe.slug}/cook`}>
                  <ChefHat /> Cook mode
                </Link>
              </Button>
            </div>

            {recipe.steps.length > 0 ? (
              <ol className="flex flex-col gap-5">
                {recipe.steps.map((step, i) => (
                  <li key={step.id} className="flex gap-4">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/12 font-display text-lg font-semibold text-primary">
                      {i + 1}
                    </span>
                    <div className="flex flex-1 flex-col gap-2 pt-1">
                      {step.section && (
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {step.section}
                        </span>
                      )}
                      <p className="text-[1.02rem] leading-relaxed">
                        {step.instruction}
                      </p>
                      {step.imageUrl && (
                        <div className="relative mt-1 aspect-video max-w-md overflow-hidden rounded-lg border border-border">
                          <Image
                            src={step.imageUrl}
                            alt={`Step ${i + 1}`}
                            fill
                            sizes="(max-width: 768px) 100vw, 28rem"
                            className="object-cover"
                          />
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {step.timerSeconds != null && (
                          <Badge variant="secondary" className="gap-1">
                            <Timer className="size-3" />
                            {formatTimer(step.timerSeconds)}
                          </Badge>
                        )}
                        {step.techniques?.map((t) => (
                          <Badge key={t} variant="outline">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-muted-foreground">No steps yet.</p>
            )}

            {(recipe.notes ?? recipe.sourceName ?? recipe.sourceUrl) && (
              <>
                <Separator />
                <div className="flex flex-col gap-3">
                  {recipe.notes && (
                    <div>
                      <h3 className="font-display text-lg font-semibold">
                        Notes
                      </h3>
                      <p className="mt-1 whitespace-pre-line text-muted-foreground">
                        {recipe.notes}
                      </p>
                    </div>
                  )}
                  {(recipe.sourceName ?? recipe.sourceUrl) && (
                    <p className="text-sm text-muted-foreground">
                      Source:{" "}
                      {recipe.sourceUrl ? (
                        <a
                          href={recipe.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {recipe.sourceName ?? recipe.sourceUrl}
                        </a>
                      ) : (
                        recipe.sourceName
                      )}
                    </p>
                  )}
                </div>
              </>
            )}

            {recipe.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {recipe.tags.map(({ tag }) => (
                  <Badge key={tag.id} variant="muted">
                    #{tag.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
