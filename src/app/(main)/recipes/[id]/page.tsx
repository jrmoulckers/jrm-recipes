import { Suspense } from "react";
import { type Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  BookOpen,
  ChefHat,
  Clock3,
  CookingPot,
  ExternalLink,
  Flame,
  History,
  Hourglass,
  MessageCircle,
  Pencil,
  Play,
  Printer,
  Thermometer,
  Timer,
  Users,
  Wrench,
} from "lucide-react";

import { isDbConfigured } from "~/server/db";
import {
  getRecipeLineage,
  listSimilarRecipes,
  recordRecipeView,
  excludeOwnerRatings,
  ratingSummary,
} from "~/server/recipes/queries";
import {
  getCollectionsForRecipe,
  getFavoriteRecipeIds,
  isFavorited,
} from "~/server/collections/queries";
import { absoluteUrl, cn, formatMinutes } from "~/lib/utils";
import { brand } from "~/config/brand";
import { pickNutrition } from "~/lib/nutrition";
import { isAllergen } from "~/lib/allergens";
import { isDietaryTag } from "~/lib/substitutions";
import { listMemberProfiles } from "~/server/dietary/queries";
import { buildRecipeJsonLd, buildBreadcrumbJsonLd, serializeJsonLd } from "~/lib/recipe-seo";
import { Button } from "~/components/ui/button";
import { Badge, badgeVariants } from "~/components/ui/badge";
import { Breadcrumbs } from "~/components/layout/breadcrumbs";
import { CloudinaryImage } from "~/components/ui/cloudinary-image";
import { Separator } from "~/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { IngredientsPanel } from "~/components/recipe/ingredients-panel";
import { AnchoredSuggestions } from "~/components/engagement/anchored-suggestions-lazy";
import { AllergenSummary } from "~/components/recipe/allergen-summary";
import { ShareButton } from "~/components/recipe/share-button";
import { CreateReelButton } from "~/components/recipe/reel-button";
import { mapRecipeToReel } from "~/lib/reel/scenes";
import { DeleteRecipeButton } from "~/components/recipe/delete-recipe-button";
import { AdaptButton } from "~/components/recipe/adapt-button";
import { GrownUpControls } from "~/components/recipe/grown-up-controls";
import { AddToShoppingList } from "~/components/shopping/add-to-shopping-list";
import { RecipeLineage } from "~/components/recipe/lineage";
import { TechniqueChips } from "~/components/cook/technique-chips";
import { CookBundleWarmer } from "~/components/cook/cook-bundle-warmer";
import { FavoriteButton } from "~/components/collections/favorite-button";
import { SaveToCollectionButton } from "~/components/collections/save-to-collection-button";
import { QuickPlanButton } from "~/components/recipe/quick-plan-button";
import { RecipeCard } from "~/components/recipe/recipe-card";
import { RecipeTimelineSection } from "~/components/recipe/sections/recipe-timeline-section";
import { RecipeCookedSection } from "~/components/recipe/sections/recipe-cooked-section";
import { RecipeDiscussionSection } from "~/components/recipe/sections/recipe-discussion-section";
import { RecipeReviewsSection } from "~/components/recipe/sections/recipe-reviews-section";
import { TabSectionSkeleton } from "~/components/recipe/sections/section-skeleton";
import { getRecipeForViewer } from "~/server/recipes/loaders";
import { buildTwoWeekPlanContext } from "~/server/planner/quick-plan";
import { getAnchoredSuggestions } from "~/server/engagement/queries";
import { parseRecipeParams, type RecipeRouteParams } from "~/lib/route-params";

export async function generateMetadata({
  params,
}: {
  params: Promise<RecipeRouteParams>;
}): Promise<Metadata> {
  const { id } = await parseRecipeParams(params);
  const { recipe } = await getRecipeForViewer(id);
  if (!recipe) return { title: "Recipe not found" };
  const description =
    recipe.description ?? `A family recipe on ${brand.name}.`;
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

export default async function RecipePage({
  params,
  shareToken,
}: {
  params: Promise<RecipeRouteParams>;
  // Set only when this render is reached through the `/r/<token>` share route
  // (issue #204); it both grants access to the unlisted recipe and is echoed
  // back to the share UI so "Copy link" hands out the token URL, not the slug.
  shareToken?: string;
}) {
  const { id } = await parseRecipeParams(params);
  const { user, recipe } = await getRecipeForViewer(id, shareToken);
  if (!recipe) notFound();

  const t = await getTranslations("recipeDetail");
  const tNav = await getTranslations("nav");

  // Unlisted recipes are shared by token, never by their guessable slug, so the
  // share UI must copy `/r/<token>` (issue #204). Falls back to the page URL for
  // public/group recipes, where the address itself is the shareable link.
  const shareUrl =
    recipe.visibility === "unlisted" &&
    recipe.shareToken &&
    recipe.shareLinkEnabled
      ? absoluteUrl(`/r/${recipe.shareToken}`)
      : undefined;

  const isOwner = Boolean(user?.id === recipe.authorId);
  const dbEnabled = isDbConfigured();
  // Two-week add-to-plan picker for signed-in viewers (#362); reuses the quick
  // planner action so a cook can plan a recipe the moment they decide to make it.
  const addToPlanContext =
    user && dbEnabled ? buildTwoWeekPlanContext() : null;
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

  // Secondary reads that still gate first paint are kept lean: lineage sits
  // above the tabs, favorite / saved / similar power the action bar and the
  // "you might also like" rail, and member profiles feed the ingredient panel.
  // The heavier below-the-fold tab sections (timeline, cook log, discussion)
  // now stream in via <Suspense> instead of blocking here (#176).
  const [
    lineage,
    favorited,
    savedCollections,
    similar,
    favoriteIds,
    memberProfiles,
    anchoredSuggestions,
  ] = await Promise.all([
    getRecipeLineage(recipe.id, user),
    isFavorited(recipe.id, user?.id ?? null),
    user ? getCollectionsForRecipe(user.id, recipe.id) : Promise.resolve([]),
    listSimilarRecipes(user, recipe.id),
    getFavoriteRecipeIds(user?.id),
    user && dbEnabled ? listMemberProfiles(user.id) : Promise.resolve([]),
    dbEnabled ? getAnchoredSuggestions(recipe.id) : Promise.resolve([]),
  ]);
  await recordView;
  // Group anchored suggestions (#346) by their target so each ingredient row and
  // method step can render the ones that point at it.
  const suggestionsByAnchor = new Map<string, typeof anchoredSuggestions>();
  for (const suggestion of anchoredSuggestions) {
    const key = `${suggestion.anchorType}:${suggestion.anchorId}`;
    const bucket = suggestionsByAnchor.get(key);
    if (bucket) bucket.push(suggestion);
    else suggestionsByAnchor.set(key, [suggestion]);
  }
  const canSuggest = Boolean(user);
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
      label: t("meta.prep", { time: formatMinutes(recipe.prepMinutes) }),
    },
    recipe.restMinutes != null && {
      icon: Hourglass,
      label: t("meta.resting", { time: formatMinutes(recipe.restMinutes) }),
    },
    recipe.servings != null && {
      icon: Users,
      label: `${recipe.servings} ${recipe.servingsNoun ?? t("servingsNoun")}`,
    },
    recipe.difficulty && {
      icon: Flame,
      label: t(`difficulty.${recipe.difficulty}`),
    },
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
            <CloudinaryImage
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
            <Breadcrumbs
              className="-ms-0.5"
              items={[
                { label: tNav("recipes"), href: "/recipes" },
                { label: recipe.title },
              ]}
            />
            {recipe.visibility !== "public" && (
              <Badge variant="muted">
                {t(`visibility.${recipe.visibility}`)}
              </Badge>
            )}
            {recipe.cuisine && (
              <Link
                href={`/recipes?cuisine=${encodeURIComponent(recipe.cuisine)}`}
                className={cn(
                  badgeVariants({ variant: "outline" }),
                  "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                )}
              >
                {recipe.cuisine}
              </Link>
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
                {t("by")}{" "}
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
              <span
                className="inline-flex items-center gap-1.5"
                aria-label={t("ratingLabel", {
                  average: average.toFixed(1),
                  count,
                })}
              >
                <span aria-hidden="true">
                  ⭐ {average.toFixed(1)} ({count})
                </span>
              </span>
            )}
          </div>

          {/* Action bar */}
          <div className="flex flex-wrap gap-2 pt-1">
            {/* Best-effort: warm the offline Cook Mode bundle for this recipe. */}
            <CookBundleWarmer
              slug={recipe.slug}
              imageSrcs={[
                recipe.coverImageUrl,
                ...recipe.steps.map((step) => step.imageUrl),
              ].filter((src): src is string => Boolean(src))}
            />
            <Button asChild size="lg">
              <Link href={`/recipes/${recipe.slug}/cook`}>
                <Play /> {t("actions.cook")}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={`/recipes/${recipe.slug}/print`}>
                <Printer /> {t("actions.print")}
              </Link>
            </Button>
            <GrownUpControls>
              <ShareButton
                title={recipe.title}
                author={recipe.author?.name}
                shareUrl={shareUrl}
                recipeId={recipe.id}
                manageable={isOwner && recipe.visibility === "unlisted"}
                shareEnabled={recipe.shareLinkEnabled}
              />
              <CreateReelButton reel={mapRecipeToReel(recipe)} />
            </GrownUpControls>
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
            {addToPlanContext && (
              <QuickPlanButton
                recipeId={recipe.id}
                recipeTitle={recipe.title}
                days={addToPlanContext.days}
                defaultDate={addToPlanContext.defaultDate}
                variant="button"
                heading="Add to a meal plan"
              />
            )}
            <GrownUpControls>
              <AdaptButton
                sourceId={recipe.id}
                sourceTitle={recipe.title}
                canAdapt={Boolean(user)}
              />
            </GrownUpControls>
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
              <GrownUpControls>
                <Button asChild size="lg" variant="outline">
                  <Link href={`/recipes/${recipe.slug}/edit`}>
                    <Pencil /> {t("actions.edit")}
                  </Link>
                </Button>
                <DeleteRecipeButton id={recipe.id} />
              </GrownUpControls>
            )}
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
              <BookOpen className="size-4" /> {t("tabs.recipe")}
            </TabsTrigger>
            <TabsTrigger value="timeline">
              <History className="size-4" /> {t("tabs.timeline")}
            </TabsTrigger>
            <TabsTrigger value="cooked">
              <CookingPot className="size-4" /> {t("tabs.cooked")}
            </TabsTrigger>
            <TabsTrigger value="discussion">
              <MessageCircle className="size-4" /> {t("tabs.discussion")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="recipe" className="mt-6">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
              {/* Ingredients */}
              <div className="lg:sticky lg:top-20 lg:self-start">
                <h2 className="mb-4 font-display text-2xl font-bold tracking-tight">
                  {t("ingredients.heading")}
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
                    renderSuggestions={(ingredientId, label) => (
                      <AnchoredSuggestions
                        recipeId={recipe.id}
                        recipeSlug={recipe.slug}
                        anchorType="ingredient"
                        anchorId={ingredientId}
                        anchorLabel={label}
                        canInteract={canSuggest}
                        suggestions={
                          suggestionsByAnchor.get(
                            `ingredient:${ingredientId}`,
                          ) ?? []
                        }
                      />
                    )}
                  />
                ) : (
                  <p className="text-muted-foreground">
                    {t("ingredients.empty")}
                  </p>
                )}

                {recipe.makeAheadNote && (
                  <div className="mt-6 rounded-xl border border-border bg-muted/40 p-4">
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                      <Hourglass className="size-4 text-primary" />
                      {t("ingredients.makeAhead")}
                    </h3>
                    <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                      {recipe.makeAheadNote}
                    </p>
                  </div>
                )}

                {recipe.equipment && recipe.equipment.length > 0 && (
                  <div className="mt-6">
                    <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
                      <Wrench className="size-4 text-primary" />
                      {t("ingredients.equipment")}
                    </h3>
                    <ul className="flex flex-col gap-1.5 text-sm">
                      {recipe.equipment.map((tool) => (
                        <li key={tool} className="flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="size-1.5 shrink-0 rounded-full bg-primary/60"
                          />
                          {tool}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Steps */}
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-2xl font-bold tracking-tight">
                    {t("method.heading")}
                  </h2>
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/recipes/${recipe.slug}/cook`}>
                      <ChefHat /> {t("actions.cookMode")}
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
                              <CloudinaryImage
                                src={step.imageUrl}
                                alt={t("method.stepImageAlt", {
                                  title: recipe.title,
                                  position: i + 1,
                                })}
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
                            {step.targetTempC != null && (
                              <Badge variant="secondary" className="gap-1">
                                <Thermometer className="size-3" />
                                {step.targetTempC}°C
                              </Badge>
                            )}
                            {step.doneness && (
                              <Badge variant="muted" className="gap-1">
                                {step.doneness}
                              </Badge>
                            )}
                            <TechniqueChips techniques={step.techniques} />
                          </div>
                          <AnchoredSuggestions
                            recipeId={recipe.id}
                            recipeSlug={recipe.slug}
                            anchorType="step"
                            anchorId={step.id}
                            anchorLabel={t("method.stepLabel", {
                              position: i + 1,
                            })}
                            canInteract={canSuggest}
                            suggestions={
                              suggestionsByAnchor.get(`step:${step.id}`) ?? []
                            }
                          />
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="rounded-xl border border-dashed border-border bg-surface/50 px-4 py-8 text-center">
                    <p className="font-medium">{t("method.emptyTitle")}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {isOwner
                        ? t("method.emptyOwner")
                        : t("method.emptyViewer")}
                    </p>
                    {isOwner && (
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="mt-3"
                      >
                        <Link href={`/recipes/${recipe.slug}/edit`}>
                          <Pencil /> {t("method.editRecipe")}
                        </Link>
                      </Button>
                    )}
                  </div>
                )}

                {(recipe.notes ?? recipe.sourceName ?? recipe.sourceUrl) && (
                  <>
                    <Separator />
                    <div className="flex flex-col gap-3">
                      {recipe.notes && (
                        <div>
                          <h3 className="font-display text-lg font-semibold">
                            {t("notes")}
                          </h3>
                          <p className="mt-1 whitespace-pre-line text-muted-foreground">
                            {recipe.notes}
                          </p>
                        </div>
                      )}
                      {(recipe.sourceName ?? recipe.sourceUrl) && (
                        <p className="text-sm text-muted-foreground">
                          {t("source")}{" "}
                          {recipe.sourceUrl ? (
                            <a
                              href={recipe.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                            >
                              {recipe.sourceName ?? recipe.sourceUrl}
                              <ExternalLink className="size-3.5" aria-hidden="true" />
                              <span className="sr-only">
                                ({t("opensInNewTab")})
                              </span>
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
                      <Link
                        key={tag.id}
                        href={`/recipes?tag=${encodeURIComponent(tag.name)}`}
                        className={cn(
                          badgeVariants({ variant: "muted" }),
                          "hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        )}
                      >
                        #{tag.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="timeline" className="mt-6">
            <Suspense fallback={<TabSectionSkeleton />}>
              <RecipeTimelineSection
                recipeId={recipe.id}
                recipeSlug={recipe.slug}
                recipeTitle={recipe.title}
                canRevert={isOwner}
                user={user}
              />
            </Suspense>
          </TabsContent>

          <TabsContent value="cooked" className="mt-6">
            <Suspense fallback={<TabSectionSkeleton />}>
              <RecipeCookedSection
                recipeId={recipe.id}
                recipeSlug={recipe.slug}
                recipeTitle={recipe.title}
                userId={user?.id ?? null}
                canLog={Boolean(user)}
              />
            </Suspense>
          </TabsContent>

          <TabsContent value="discussion" className="mt-6">
            <div className="mx-auto flex max-w-3xl flex-col gap-6">
              <Suspense fallback={<TabSectionSkeleton />}>
                <RecipeReviewsSection
                  recipeId={recipe.id}
                  recipeSlug={recipe.slug}
                  currentUserId={user?.id ?? null}
                  isRecipeOwner={isOwner}
                  canInteract={Boolean(user)}
                />
              </Suspense>
              <Suspense fallback={<TabSectionSkeleton />}>
                <RecipeDiscussionSection
                  recipeId={recipe.id}
                  recipeSlug={recipe.slug}
                  summary={{ average, count }}
                  viewer={user ?? null}
                  currentUserId={user?.id ?? null}
                  isRecipeOwner={isOwner}
                  canInteract={Boolean(user)}
                />
              </Suspense>
            </div>
          </TabsContent>
        </Tabs>

        {similar.length > 0 && (
          <section className="flex flex-col gap-5 border-t border-border pt-8">
            <div className="flex items-center gap-2">
              <CookingPot className="size-5 text-primary" />
              <h2 className="font-display text-2xl font-bold tracking-tight">
                {t("similar")}
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
