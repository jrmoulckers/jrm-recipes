import { cache } from "react";
import { type Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  ChefHat,
  Clock3,
  CookingPot,
  Flame,
  History,
  MessageCircle,
  Pencil,
  Play,
  Printer,
  Timer,
  Users,
} from "lucide-react";

import { getCurrentUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import {
  getRecipe,
  getRecipeLineage,
  getRecipeTimeline,
  getRecipeVersions,
  listSimilarRecipes,
  recordRecipeView,
  excludeOwnerRatings,
  ratingSummary,
} from "~/server/recipes/queries";
import {
  getRecipeComments,
  getViewerRating,
  type ThreadedComment,
} from "~/server/engagement/queries";
import { getCookCount, getRecipeCookLog } from "~/server/cooklog/queries";
import {
  getCollectionsForRecipe,
  getFavoriteRecipeIds,
  isFavorited,
} from "~/server/collections/queries";
import { absoluteUrl, formatMinutes } from "~/lib/utils";
import { pickNutrition } from "~/lib/nutrition";
import { isAllergen } from "~/lib/allergens";
import { isDietaryTag } from "~/lib/substitutions";
import { listMemberProfiles } from "~/server/dietary/queries";
import { buildRecipeJsonLd, buildBreadcrumbJsonLd, serializeJsonLd } from "~/lib/recipe-seo";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Separator } from "~/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { IngredientsPanel } from "~/components/recipe/ingredients-panel";
import { AllergenSummary } from "~/components/recipe/allergen-summary";
import { ShareButton } from "~/components/recipe/share-button";
import { CreateReelButton } from "~/components/recipe/reel-button";
import { mapRecipeToReel } from "~/lib/reel/scenes";
import { DeleteRecipeButton } from "~/components/recipe/delete-recipe-button";
import { AdaptButton } from "~/components/recipe/adapt-button";
import { AddToShoppingList } from "~/components/shopping/add-to-shopping-list";
import { RecipeLineage } from "~/components/recipe/lineage";
import { RecipeStory } from "~/components/recipe/story";
import { RecipeTimeline } from "~/components/recipe/timeline";
import { RatingControl } from "~/components/engagement/rating-control";
import { CommentsSection } from "~/components/engagement/comments-section";
import { CookLogSection } from "~/components/cooklog/cook-log-section";
import { TechniqueChips } from "~/components/cook/technique-chips";
import { FavoriteButton } from "~/components/collections/favorite-button";
import { SaveToCollectionButton } from "~/components/collections/save-to-collection-button";
import { RecipeCard } from "~/components/recipe/recipe-card";

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
  const description = recipe.description ?? undefined;
  const canonical = absoluteUrl(`/recipes/${recipe.slug}`);
  const isPublic = recipe.visibility === "public";
  return {
    title: recipe.title,
    description,
    alternates: {
      canonical,
      // oEmbed discovery (issue #347): let consumers auto-resolve an embeddable
      // card. Only advertised for public recipes (the embed route 404s others).
      ...(isPublic
        ? {
            types: {
              "application/json+oembed": `${absoluteUrl(
                "/api/oembed",
              )}?url=${encodeURIComponent(canonical)}&format=json`,
            },
          }
        : {}),
    },
    // Keep private/group/unlisted recipes out of search indexes; only public
    // recipes should be crawlable.
    ...(recipe.visibility !== "public"
      ? { robots: { index: false, follow: false } }
      : {}),
    // The image itself is supplied automatically from the sibling
    // `opengraph-image` route (Next injects it into og:image + twitter:image).
    openGraph: {
      title: recipe.title,
      description,
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: recipe.title,
      description,
    },
  };
}

function formatTimer(seconds: number): string {
  if (seconds >= 60) {
    const m = Math.round(seconds / 60);
    return `${m} min`;
  }
  return `${seconds}s`;
}

function countComments(list: ThreadedComment[]): number {
  return list.reduce((total, c) => total + 1 + countComments(c.replies), 0);
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
  const dbEnabled = isDbConfigured();
  // Exclude any owner self-rating so the shown average matches the JSON-LD
  // aggregateRating (authors can't rate their own recipe).
  const { average, count } = ratingSummary(
    excludeOwnerRatings(recipe.ratings, recipe.authorId),
  );

  // Fire the "recently viewed" write concurrently with the reads below; a
  // signed-out viewer records nothing.
  const recordView = user
    ? recordRecipeView(user.id, recipe.id)
    : Promise.resolve();

  const [
    versions,
    lineage,
    timeline,
    comments,
    viewerRating,
    cookLog,
    cookCount,
    favorited,
    savedCollections,
    similar,
    favoriteIds,
    memberProfiles,
  ] =
    await Promise.all([
      getRecipeVersions(recipe.id),
      getRecipeLineage(recipe.id, user),
      getRecipeTimeline(recipe.id, user),
      getRecipeComments(recipe.id),
      getViewerRating(recipe.id, user?.id ?? null),
      getRecipeCookLog(recipe.id, user?.id ?? null),
      getCookCount(recipe.id, user?.id ?? null),
      isFavorited(recipe.id, user?.id ?? null),
      user ? getCollectionsForRecipe(user.id, recipe.id) : Promise.resolve([]),
      listSimilarRecipes(user, recipe.id),
      getFavoriteRecipeIds(user?.id),
      user && dbEnabled
        ? listMemberProfiles(user.id)
        : Promise.resolve([]),
    ]);
  await recordView;
  const commentCount = countComments(comments);
  // Family members drive the nutrition panel's calorie-goal indicator (#430)
  // and the ingredient conflict flags (#429); narrow the stored string arrays
  // back to the canonical unions here so the client gets typed data.
  const calorieMembers = memberProfiles.map((m) => ({
    id: m.id,
    name: m.name,
    calorieGoal: m.calorieGoal,
    allergens: (m.allergens ?? []).filter(isAllergen),
    diets: (m.diets ?? []).filter(isDietaryTag),
  }));

  // schema.org structured data — public recipes only, so we never expose the
  // details of private/group/unlisted recipes to crawlers.
  const isPublic = recipe.visibility === "public";
  const jsonLd = isPublic ? buildRecipeJsonLd(recipe) : null;
  const breadcrumbJsonLd = isPublic ? buildBreadcrumbJsonLd(recipe) : null;

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
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
      )}
      {breadcrumbJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializeJsonLd(breadcrumbJsonLd),
          }}
        />
      )}
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
            {recipe.cuisine && (
              <Badge variant="outline">{recipe.cuisine}</Badge>
            )}
            {recipe.group && (
              <Link
                href={`/groups/${recipe.group.slug}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-secondary/15 px-2.5 py-0.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Users className="size-3.5" /> {recipe.group.name}
              </Link>
            )}
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
                {recipe.author.handle ? (
                  <Link
                    href={`/cooks/${recipe.author.handle}`}
                    className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
                  >
                    {recipe.author.name}
                  </Link>
                ) : (
                  <span className="font-medium text-foreground">
                    {recipe.author.name}
                  </span>
                )}
              </span>
            )}
            {meta.map((m, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 capitalize"
              >
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
            <CreateReelButton reel={mapRecipeToReel(recipe)} />
            <AddToShoppingList
              dbEnabled={dbEnabled}
              recipe={{
                id: recipe.id,
                title: recipe.title,
                servings: recipe.servings,
                servingsNoun: recipe.servingsNoun,
                ingredients: recipe.ingredients.map((ing) => ({
                  item: ing.item,
                  quantity: ing.quantity,
                  quantityMax: ing.quantityMax,
                  unit: ing.unit,
                  optional: ing.optional,
                })),
              }}
            />
            <AdaptButton
              sourceId={recipe.id}
              sourceTitle={recipe.title}
              canAdapt={Boolean(user)}
            />
            <FavoriteButton
              recipeId={recipe.id}
              recipeSlug={recipe.slug}
              initialFavorited={favorited}
              variant="button"
              canFavorite={Boolean(user)}
            />
            <SaveToCollectionButton
              recipeId={recipe.id}
              collections={savedCollections}
              canSave={Boolean(user)}
            />
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

        <RecipeLineage
          parent={lineage.parent}
          adaptations={lineage.adaptations}
        />

        <Tabs defaultValue="recipe" className="flex flex-col gap-2">
          <TabsList className="self-start">
            <TabsTrigger value="recipe">
              <BookOpen className="size-4" /> Recipe
            </TabsTrigger>
            <TabsTrigger value="timeline">
              <History className="size-4" /> Timeline
              {versions.items.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {versions.items.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="cooked">
              <CookingPot className="size-4" /> Cooked it
              {cookCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  {cookCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="discussion">
              <MessageCircle className="size-4" /> Discussion
              {commentCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  {commentCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="recipe" className="mt-6">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
              {/* Ingredients */}
              <div className="lg:sticky lg:top-20 lg:self-start">
                <h2 className="mb-4 font-display text-2xl font-bold tracking-tight">
                  Ingredients
                </h2>
                {recipe.ingredients.length > 0 && (
                  <AllergenSummary
                    items={recipe.ingredients.map((ing) => ing.item)}
                    className="mb-4"
                  />
                )}
                {recipe.ingredients.length > 0 ? (
                  <IngredientsPanel
                    ingredients={recipe.ingredients}
                    baseServings={recipe.servings}
                    servingsNoun={recipe.servingsNoun}
                    nutrition={pickNutrition(recipe)}
                    members={calorieMembers}
                  />
                ) : (
                  <p className="text-muted-foreground">
                    No ingredients listed.
                  </p>
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
                        <span className="bg-primary/12 flex size-9 shrink-0 items-center justify-center rounded-full font-display text-lg font-semibold text-primary">
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
                            <TechniqueChips techniques={step.techniques} />
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
          </TabsContent>

          <TabsContent value="timeline" className="mt-6">
            <div className="mx-auto flex max-w-3xl flex-col gap-8">
              <RecipeStory
                entries={timeline.entries}
                recipeTitle={recipe.title}
              />
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <History className="size-4" aria-hidden="true" />
                  Saved versions
                </div>
                <RecipeTimeline
                  versions={versions.items}
                  recipeSlug={recipe.slug}
                  recipeId={recipe.id}
                  canRevert={isOwner}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="cooked" className="mt-6">
            <div className="mx-auto max-w-3xl">
              <CookLogSection
                recipeId={recipe.id}
                recipeSlug={recipe.slug}
                recipeTitle={recipe.title}
                entries={cookLog}
                cookCount={cookCount}
                canLog={Boolean(user)}
                dbConfigured={isDbConfigured()}
              />
            </div>
          </TabsContent>

          <TabsContent value="discussion" className="mt-6">
            <div className="mx-auto flex max-w-3xl flex-col gap-6">
              <RatingControl
                recipeId={recipe.id}
                recipeSlug={recipe.slug}
                summary={{ average, count }}
                viewerRating={viewerRating}
                canRate={Boolean(user)}
              />
              <CommentsSection
                recipeId={recipe.id}
                recipeSlug={recipe.slug}
                initialComments={comments}
                currentUserId={user?.id ?? null}
                isRecipeOwner={isOwner}
                canPost={Boolean(user)}
              />
            </div>
          </TabsContent>
        </Tabs>

        {similar.length > 0 && (
          <section className="flex flex-col gap-5 border-t border-border pt-8">
            <div className="flex items-center gap-2">
              <CookingPot className="size-5 text-primary" />
              <h2 className="font-display text-2xl font-bold tracking-tight">
                You might also like
              </h2>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {similar.map((related) => (
                <RecipeCard
                  key={related.id}
                  recipe={related}
                  canFavorite={Boolean(user)}
                  favorited={favoriteIds.has(related.id)}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </article>
  );
}
