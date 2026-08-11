import { Suspense } from 'react';
import { type Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { getTranslations, getLocale } from 'next-intl/server';
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
  Sparkles,
  Thermometer,
  Timer,
  Users,
  Wrench,
} from 'lucide-react';

import { isDbConfigured } from '~/server/db';
import {
  getRecipeLineage,
  getRecipeFamilyTree,
  listSimilarRecipes,
  recordRecipeView,
  excludeOwnerRatings,
  ratingSummary,
} from '~/server/recipes/queries';
import { getRecipeIngredientAllergens } from '~/server/recipes/allergens';
import {
  getCollectionsForRecipe,
  getFavoriteRecipeIds,
  isFavorited,
} from '~/server/collections/queries';
import { absoluteUrl, formatMinutes } from '~/lib/utils';
import { brand } from '~/config/brand';
import { pickNutrition, hasNutrition } from '~/lib/nutrition';
import { isAllergen, type Allergen } from '~/lib/allergens';
import { isDietaryTag } from '~/lib/substitutions';
import { groupRecipeClassifications } from '~/lib/recipe-classifications';
import { listMemberProfiles } from '~/server/dietary/queries';
import { getUnitSettings } from '~/server/units/queries';
import { toUnitPrefs, toCustomUnitDefs } from '~/lib/unit-prefs';
import { buildRecipeJsonLd, buildBreadcrumbJsonLd, serializeJsonLd } from '~/lib/recipe-seo';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { Breadcrumbs } from '~/components/layout/breadcrumbs';
import { RecipeImage } from '~/components/recipe/recipe-image';
import { RecipeClassificationBadges } from '~/components/recipe/recipe-classification-badges';
import { Separator } from '~/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { IngredientsPanel } from '~/components/recipe/ingredients-panel';
import { AnchoredSuggestions } from '~/components/engagement/anchored-suggestions-lazy';
import { AllergenSummary } from '~/components/recipe/allergen-summary';
import { ShareButton } from '~/components/recipe/share-button';
import { CreateReelButton } from '~/components/recipe/reel-button';
import { mapRecipeToReel } from '~/lib/reel/scenes';
import { DeleteRecipeButton } from '~/components/recipe/delete-recipe-button';
import { RecipeActionsMenu } from '~/components/recipe/recipe-actions-menu';
import { ReadAloudButton } from '~/components/recipe/read-aloud-button-lazy';
import { AdaptButton } from '~/components/recipe/adapt-button';
import { GrownUpControls } from '~/components/recipe/grown-up-controls';
import { AddToShoppingList } from '~/components/shopping/add-to-shopping-list';
import { RecipeLineage } from '~/components/recipe/lineage';
import { RecipeFamilyTree } from '~/components/recipe/family-tree';
import { TechniqueChips } from '~/components/cook/technique-chips';
import { CookBundleWarmer } from '~/components/cook/cook-bundle-warmer';
import { FavoriteButton } from '~/components/collections/favorite-button';
import { SaveToCollectionButton } from '~/components/collections/save-to-collection-button';
import { QuickPlanButton } from '~/components/recipe/quick-plan-button';
import { RecipeCard } from '~/components/recipe/recipe-card';
import { RecipeTimelineSection } from '~/components/recipe/sections/recipe-timeline-section';
import { RecipeCookedSection } from '~/components/recipe/sections/recipe-cooked-section';
import { RecipeDiscussionSection } from '~/components/recipe/sections/recipe-discussion-section';
import { RecipeReviewsSection } from '~/components/recipe/sections/recipe-reviews-section';
import { TabSectionSkeleton } from '~/components/recipe/sections/section-skeleton';
import { getNamespacedRecipeForViewer } from '~/server/recipes/loaders';
import { listRecipeCreators } from '~/server/recipes/creators';
import { RecipeCreatorManager } from '~/components/recipe/creator-manager';
import { LeaveRecipeButton } from '~/components/recipe/leave-recipe-button';
import { computeRecipeNutrition } from '~/server/recipes/nutrition';
import { getMembership } from '~/server/groups/queries';
import { isKid } from '~/server/groups/kid-safe';
import { buildTwoWeekPlanContext } from '~/server/planner/quick-plan';
import { getAnchoredSuggestions } from '~/server/engagement/queries';
import { parseRecipeParams, type RecipeRouteParams } from '~/lib/route-params';
import {
  recipeCookPath,
  recipeDetailPath,
  recipeEditPath,
  recipeKeepsakePath,
  recipePrintPath,
} from '~/lib/recipe-path';
import type { Route } from 'next';
import { withRouteMessages } from '~/components/i18n/route-messages';

export async function generateMetadata({
  params,
}: {
  params: Promise<RecipeRouteParams>;
}): Promise<Metadata> {
  const { cook, recipe: recipeSegment } = await parseRecipeParams(params);
  const { recipe } = await getNamespacedRecipeForViewer(cook, recipeSegment);
  if (!recipe) return { title: 'Recipe not found' };
  const description = recipe.description ?? `A family recipe on ${brand.name}.`;
  const canonical = absoluteUrl(
    recipeDetailPath({
      id: recipe.id,
      slug: recipe.slug,
      cook: recipe.author.slug,
    }),
  );
  const isPublic = recipe.visibility === 'public';
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
              'application/json+oembed': `${absoluteUrl(
                '/api/oembed',
              )}?url=${encodeURIComponent(canonical)}&format=json`,
            },
          }
        : {}),
    },
    // Keep private/group/unlisted recipes out of search indexes. Only public
    // recipes should be crawlable.
    ...(recipe.visibility !== 'public' ? { robots: { index: false, follow: false } } : {}),
    // The image itself is supplied automatically from the sibling
    // `opengraph-image` route (Next injects it into og:image + twitter:image).
    openGraph: {
      title: recipe.title,
      description,
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
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

async function RecipePage({
  params,
  searchParams,
  shareToken,
}: {
  params: Promise<RecipeRouteParams>;
  // Present on a real route render; omitted when the share route renders this
  // component directly. Only used to carry a legacy sub-route link's query
  // (a keepsake's `?from`/`?note`/`?t`) across the redirect (#666).
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
  // Set only when this render is reached through the `/r/<token>` share route
  // (issue #204). It both grants access to the unlisted recipe and is echoed
  // back to the share UI so "Copy link" hands out the token URL, not the slug.
  shareToken?: string;
}) {
  const { cook, recipe: recipeSegment } = await parseRecipeParams(params);
  const { user, recipe, disposition, legacySubRoute } = await getNamespacedRecipeForViewer(
    cook,
    recipeSegment,
    shareToken,
  );
  if (!recipe) notFound();
  // Only redirect once the viewer has passed `canView` above, so an alias can
  // never confirm that a recipe exists to somebody who may not see it (#666).
  // Skipped for share-token renders, which are served under `/r/<token>`.
  //
  // `mirror` — a co-creator's namespace (#668) — deliberately does not redirect.
  // It renders here, and `generateMetadata` already points `rel=canonical` at
  // the owner's path, so the creator keeps their own URL while search engines
  // still see one indexable address.
  if (disposition === 'alias' && !shareToken) {
    const ref = {
      id: recipe.id,
      slug: recipe.slug,
      cook: recipe.author.slug,
    };
    // A pre-cutover sub-route link (`/recipes/<slug>/cook`) keeps its sub-route
    // and its query, so a shared keepsake link still arrives with its note.
    const target =
      legacySubRoute === 'cook'
        ? recipeCookPath(ref)
        : legacySubRoute === 'print'
          ? recipePrintPath(ref)
          : legacySubRoute === 'keepsake'
            ? recipeKeepsakePath(ref)
            : legacySubRoute === 'edit'
              ? recipeEditPath(ref)
              : recipeDetailPath(ref);
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries((await searchParams) ?? {})) {
      if (typeof value === 'string') query.set(key, value);
      else if (Array.isArray(value) && value[0] != null) query.set(key, value[0]);
    }
    const suffix = query.toString();
    permanentRedirect(suffix ? (`${target}?${suffix}` as Route) : target);
  }

  const t = await getTranslations('recipeDetail');
  const tCreators = await getTranslations('recipeCreators');
  const tNav = await getTranslations('nav');
  // Every in-page link to this recipe's own sub-routes is built from the one
  // canonical reference, so the namespaced segments can't drift apart (#666).
  const pathRef = {
    id: recipe.id,
    slug: recipe.slug,
    cook: recipe.author.slug,
  };
  const classifications = groupRecipeClassifications(recipe.tags, recipe.cuisine);
  const declaredDietary = (recipe.dietaryFlags ?? []).filter(isDietaryTag);

  // Unlisted recipes are shared by token, never by their guessable slug, so the
  // share UI must copy `/r/<token>` (issue #204). Falls back to the page URL for
  // public/group recipes, where the address itself is the shareable link.
  const shareUrl =
    recipe.visibility === 'unlisted' && recipe.shareToken && recipe.shareLinkEnabled
      ? absoluteUrl(`/r/${recipe.shareToken}`)
      : undefined;

  const isOwner = Boolean(user?.id === recipe.authorId);
  const dbEnabled = isDbConfigured();
  // Co-creators (#668). Previously read only for the owner's management panel,
  // but the byline names them to *every* reader — attribution is the visible
  // point of a multi-creator recipe — so the roster is now loaded for all
  // viewers. It is one indexed lookup, and it also answers "may this viewer
  // edit, and may they leave?" without the separate `isRecipeCreator` probe
  // this replaces.
  const creatorRows = dbEnabled ? await listRecipeCreators(recipe.id) : [];
  const creators = creatorRows.map((entry) => ({
    userId: entry.userId,
    status: entry.status,
    slug: entry.slug,
    name: entry.user?.name ?? null,
    handle: null,
    cook: entry.user?.slug ?? null,
  }));
  const acceptedCreators = creatorRows.filter((entry) => entry.status === 'accepted');
  // An accepted co-creator may rewrite the recipe body, but not delete it or
  // change who can see it (#668), so edit and owner affordances are separate.
  const viewerIsCreator = Boolean(
    user && acceptedCreators.some((entry) => entry.userId === user.id),
  );
  const canEdit = isOwner || viewerIsCreator;
  // Kid-safe UI (issue #367): a kid-role member of the recipe's group must never
  // see the Delete control. The server rejects the delete regardless (see
  // `deleteRecipe`), but hiding it here keeps a child from hitting a dead button.
  // Only owners ever see Delete, so this matters when a kid authored the recipe.
  const viewerRole =
    isOwner && recipe.groupId && user
      ? ((await getMembership(recipe.groupId, user.id))?.role ?? null)
      : null;
  const viewerIsKid = isKid(viewerRole);
  // Two-week add-to-plan picker for signed-in viewers (#362), reusing the quick
  // planner action so a cook can plan a recipe the moment they decide to make it.
  const addToPlanContext = user && dbEnabled ? buildTwoWeekPlanContext() : null;
  // Exclude any owner self-rating so the shown average matches the JSON-LD
  // aggregateRating (authors can't rate their own recipe).
  const { average, count } = ratingSummary(excludeOwnerRatings(recipe.ratings, recipe.authorId));

  // Fire the "recently viewed" write concurrently with the reads below. A
  // signed-out viewer records nothing.
  const recordView = user ? recordRecipeView(user.id, recipe.id) : Promise.resolve();

  // Secondary reads that still gate first paint are kept lean: lineage sits
  // above the tabs, favorite / saved / similar power the action bar and the
  // "you might also like" rail, and member profiles feed the ingredient panel.
  // The heavier below-the-fold tab sections (timeline, cook log, discussion)
  // now stream in via <Suspense> instead of blocking here (#176).
  // Prefer the cook's stored per-serving nutrition. When they entered none, roll
  // an estimate up from the ingredient list via the food graph (resolved by each
  // line's foodId → curated per-100 g facts + density). Compute-on-read only.
  const manualNutrition = pickNutrition(recipe);
  const needsNutritionEstimate = dbEnabled && !hasNutrition(manualNutrition);
  const [
    lineage,
    familyTree,
    favorited,
    savedCollections,
    similar,
    favoriteIds,
    memberProfiles,
    anchoredSuggestions,
    unitSettings,
    nutritionEstimate,
    ingredientAllergenMap,
  ] = await Promise.all([
    getRecipeLineage(recipe.id, user),
    getRecipeFamilyTree(recipe.id, user),
    isFavorited(recipe.id, user?.id ?? null),
    user ? getCollectionsForRecipe(user.id, recipe.id) : Promise.resolve([]),
    listSimilarRecipes(user, recipe.id),
    getFavoriteRecipeIds(user?.id),
    user && dbEnabled ? listMemberProfiles(user.id) : Promise.resolve([]),
    dbEnabled ? getAnchoredSuggestions(recipe.id) : Promise.resolve([]),
    user && dbEnabled ? getUnitSettings(user.id) : Promise.resolve(null),
    needsNutritionEstimate ? computeRecipeNutrition(recipe.id) : Promise.resolve(null),
    dbEnabled
      ? getRecipeIngredientAllergens(recipe.id)
      : Promise.resolve(new Map<string, Allergen[]>()),
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
  // and the ingredient conflict flags (#429). Narrow the stored string arrays
  // back to the canonical unions here so the client gets typed data.
  const calorieMembers = memberProfiles.map((m) => ({
    id: m.id,
    name: m.name,
    calorieGoal: m.calorieGoal,
    allergens: (m.allergens ?? []).filter(isAllergen),
    diets: (m.diets ?? []).filter(isDietaryTag),
  }));

  // Attach the structured food-graph allergens to each ingredient line so the
  // panel can flag them (#: structured allergens). Falls back to text detection
  // inside the panel for any line the map doesn't cover.
  const panelIngredients = recipe.ingredients.map((ing) => ({
    ...ing,
    allergens: ingredientAllergenMap.get(ing.id) ?? null,
  }));

  // Viewer's unit preferences drive display-time auto-conversion (#…): a signed-in
  // cook sees amounts in their saved system + per-dimension defaults + custom
  // units. Signed-out viewers get the author's original units untouched.
  const locale = await getLocale();
  const viewerUnitPrefs = user ? toUnitPrefs(unitSettings?.preferences, locale) : undefined;
  const viewerCustomUnits = user ? toCustomUnitDefs(unitSettings?.customUnits) : undefined;

  // schema.org structured data. Public recipes only, so we never expose the
  // details of private/group/unlisted recipes to crawlers.
  const isPublic = recipe.visibility === 'public';
  const jsonLd = isPublic ? buildRecipeJsonLd(recipe) : null;
  const breadcrumbJsonLd = isPublic ? buildBreadcrumbJsonLd(recipe) : null;

  const meta = [
    recipe.totalMinutes != null && {
      icon: Clock3,
      label: formatMinutes(recipe.totalMinutes),
    },
    recipe.prepMinutes != null && {
      icon: Timer,
      label: t('meta.prep', { time: formatMinutes(recipe.prepMinutes) }),
    },
    recipe.restMinutes != null && {
      icon: Hourglass,
      label: t('meta.resting', { time: formatMinutes(recipe.restMinutes) }),
    },
    recipe.servings != null && {
      icon: Users,
      label: `${recipe.servings} ${recipe.servingsNoun ?? t('servingsNoun')}`,
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
        {/* Decorative unless the author described it: the hero cover sits
            directly above the recipe title, so an empty alt stays correct when
            there is nothing extra to say about the photo itself. */}
        <div className="relative aspect-[21/9] max-h-[420px] w-full overflow-hidden">
          <RecipeImage
            alt={recipe.coverImageAlt ?? ''}
            src={recipe.coverImageUrl}
            fallbackKey={recipe.id}
            fallbackContext={{
              title: recipe.title,
              cuisine: recipe.cuisine,
              tags: recipe.tags.flatMap(({ tag }) => (tag ? [tag.name] : [])),
            }}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        </div>
      </div>

      <div className="container relative z-10 -mt-16 flex flex-col gap-8">
        <header className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Breadcrumbs
              className="-ms-0.5"
              items={[{ label: tNav('recipes'), href: '/recipes' }, { label: recipe.title }]}
            />
            {recipe.visibility !== 'public' && (
              <Badge variant="muted">{t(`visibility.${recipe.visibility}`)}</Badge>
            )}
            <RecipeClassificationBadges
              items={[...classifications.meal, ...classifications.cuisine]}
              dietary={declaredDietary}
            />
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
            <p className="max-w-2xl text-lg text-muted-foreground">{recipe.description}</p>
          )}
          {(recipe.handedDownFrom ?? recipe.originYear ?? recipe.originPlace) && (
            <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-secondary-foreground">
              <Sparkles className="size-4 text-secondary" aria-hidden="true" />
              {[
                recipe.handedDownFrom ? `Handed down from ${recipe.handedDownFrom}` : null,
                recipe.originYear ? `since ${recipe.originYear}` : null,
                recipe.originPlace,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {recipe.author?.name && (
              <span>
                {t('by')}{' '}
                {recipe.author.handle ? (
                  <Link
                    href={`/cooks/${recipe.author.handle}`}
                    className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
                  >
                    {recipe.author.name}
                  </Link>
                ) : (
                  <span className="font-medium text-foreground">{recipe.author.name}</span>
                )}
                {/* Co-creators are named next to the owner rather than in a
                    separate block (#668): they wrote part of this recipe, and
                    the byline is where a reader looks to find out who did. The
                    owner stays first — theirs is the canonical namespace. */}
                {acceptedCreators.length > 0 && (
                  <>
                    {' '}
                    {tCreators('byline.with', {
                      names: acceptedCreators
                        .map((entry) => entry.user?.name ?? tCreators('unknownCook'))
                        .join(', '),
                    })}
                  </>
                )}
              </span>
            )}
            {meta.map((m, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 capitalize">
                <m.icon className="size-4" /> {m.label}
              </span>
            ))}
            {count > 0 && (
              <span
                className="inline-flex items-center gap-1.5"
                aria-label={t('ratingLabel', {
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

          {/* Action bar (#81): Cook is the single primary CTA. Every secondary
              action is tucked into the overflow "…" menu so the hierarchy stays
              unambiguous without dropping any action. */}
          <div className="flex flex-wrap gap-2 pt-1">
            {/* Best-effort: warm the offline Cook Mode bundle for this recipe. */}
            <CookBundleWarmer
              recipePath={recipeDetailPath(pathRef)}
              imageSrcs={[
                recipe.coverImageUrl,
                ...recipe.steps.map((step) => step.imageUrl),
              ].filter((src): src is string => Boolean(src))}
            />
            <Button asChild size="lg">
              <Link href={recipeCookPath(pathRef)}>
                <Play /> {t('actions.cook')}
              </Link>
            </Button>
            <RecipeActionsMenu>
              <Button asChild size="lg" variant="outline">
                <Link href={recipePrintPath(pathRef)}>
                  <Printer /> {t('actions.print')}
                </Link>
              </Button>
              <GrownUpControls>
                <ShareButton
                  title={recipe.title}
                  author={recipe.author?.name}
                  recipePath={recipeDetailPath(pathRef)}
                  shareUrl={shareUrl}
                  recipeId={recipe.id}
                  manageable={isOwner && recipe.visibility === 'unlisted'}
                  shareEnabled={recipe.shareLinkEnabled}
                  defaultFrom={user?.name ?? recipe.author?.name}
                  keepsakeToken={shareUrl ? recipe.shareToken : undefined}
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
                    foodId: ing.foodId,
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
              {canEdit && (
                <GrownUpControls>
                  <Button asChild size="lg" variant="outline">
                    <Link href={recipeEditPath(pathRef)}>
                      <Pencil /> {t('actions.edit')}
                    </Link>
                  </Button>
                  {!isOwner ? null : viewerIsKid ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">
                      {t('kidSafe.deleteHidden')}
                    </p>
                  ) : (
                    <DeleteRecipeButton id={recipe.id} slug={recipe.slug} title={recipe.title} />
                  )}
                  {/* A co-creator's counterpart to Delete: removal is otherwise
                      entirely the owner's call, so this is their only way to end
                      an attachment that is public under their own name (#668). */}
                  {viewerIsCreator && <LeaveRecipeButton recipeId={recipe.id} />}
                </GrownUpControls>
              )}
            </RecipeActionsMenu>
          </div>
        </header>

        <Separator />

        {familyTree?.multiGeneration ? (
          <RecipeFamilyTree tree={familyTree} />
        ) : (
          <RecipeLineage parent={lineage.parent} adaptations={lineage.adaptations} />
        )}

        <Tabs defaultValue="recipe" className="flex flex-col gap-2">
          <TabsList className="self-start">
            <TabsTrigger value="recipe">
              <BookOpen className="size-4" /> {t('tabs.recipe')}
            </TabsTrigger>
            <TabsTrigger value="timeline">
              <History className="size-4" /> {t('tabs.timeline')}
            </TabsTrigger>
            <TabsTrigger value="cooked">
              <CookingPot className="size-4" /> {t('tabs.cooked')}
            </TabsTrigger>
            <TabsTrigger value="discussion">
              <MessageCircle className="size-4" /> {t('tabs.discussion')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="recipe" className="mt-6">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
              {/* Ingredients */}
              <div className="lg:sticky lg:top-20 lg:self-start">
                <h2 className="mb-4 font-display text-2xl font-bold tracking-tight">
                  {t('ingredients.heading')}
                </h2>
                {recipe.ingredients.length > 0 && (
                  <AllergenSummary
                    items={recipe.ingredients.map((ing) => ing.item)}
                    className="mb-4"
                  />
                )}
                {recipe.ingredients.length > 0 ? (
                  <IngredientsPanel
                    ingredients={panelIngredients}
                    baseServings={recipe.servings}
                    servingsNoun={recipe.servingsNoun}
                    nutrition={manualNutrition}
                    estimatedNutrition={
                      nutritionEstimate && hasNutrition(nutritionEstimate.perServing)
                        ? {
                            perServing: nutritionEstimate.perServing,
                            sourced: nutritionEstimate.sourcedLines,
                            total: nutritionEstimate.totalLines,
                          }
                        : null
                    }
                    members={calorieMembers}
                    unitPrefs={viewerUnitPrefs}
                    customUnits={viewerCustomUnits}
                    ingredientSuggestions={{
                      recipeId: recipe.id,
                      recipeSlug: recipe.slug,
                      canInteract: canSuggest,
                      byIngredientId: Object.fromEntries(
                        recipe.ingredients.map((ing) => [
                          ing.id,
                          suggestionsByAnchor.get(`ingredient:${ing.id}`) ?? [],
                        ]),
                      ),
                    }}
                  />
                ) : (
                  <p className="text-muted-foreground">{t('ingredients.empty')}</p>
                )}

                {recipe.makeAheadNote && (
                  <div className="mt-6 rounded-xl border border-border bg-muted/40 p-4">
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                      <Hourglass className="size-4 text-primary" />
                      {t('ingredients.makeAhead')}
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
                      {t('ingredients.equipment')}
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
                    {t('method.heading')}
                  </h2>
                  <Button asChild variant="ghost" size="sm">
                    <Link href={recipeCookPath(pathRef)}>
                      <ChefHat /> {t('actions.cookMode')}
                    </Link>
                  </Button>
                </div>

                {recipe.steps.length > 0 ? (
                  <>
                    <ReadAloudButton
                      anchorPrefix="recipe-step-"
                      steps={recipe.steps.map(
                        (step, i) =>
                          `Step ${i + 1}. ${
                            step.section ? `${step.section}. ` : ''
                          }${step.instruction}`,
                      )}
                    />
                    <ol className="flex flex-col gap-5">
                      {recipe.steps.map((step, i) => (
                        <li key={step.id} id={`recipe-step-${i}`} className="flex gap-4">
                          <span className="bg-primary/12 flex size-9 shrink-0 items-center justify-center rounded-full font-display text-lg font-semibold text-primary">
                            {i + 1}
                          </span>
                          <div className="flex flex-1 flex-col gap-2 pt-1">
                            {step.section && (
                              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {step.section}
                              </span>
                            )}
                            {step.title && (
                              <h3 className="font-display text-lg font-semibold leading-snug">
                                {step.title}
                              </h3>
                            )}
                            <p className="text-[1.02rem] leading-relaxed">{step.instruction}</p>
                            {step.imageUrl && (
                              <div className="relative mt-1 aspect-video max-w-md overflow-hidden rounded-lg border border-border empty:hidden">
                                <RecipeImage
                                  src={step.imageUrl}
                                  fallbackKey={`${recipe.id}-step-${step.id}`}
                                  fallbackMode="hide"
                                  alt={
                                    step.imageAlt ??
                                    t('method.stepImageAlt', {
                                      title: recipe.title,
                                      position: i + 1,
                                    })
                                  }
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
                                  {t('method.targetTemp', {
                                    value: step.targetTempC,
                                  })}
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
                              anchorLabel={t('method.stepLabel', {
                                position: i + 1,
                              })}
                              canInteract={canSuggest}
                              suggestions={suggestionsByAnchor.get(`step:${step.id}`) ?? []}
                            />
                          </div>
                        </li>
                      ))}
                    </ol>
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed border-border bg-surface/50 px-4 py-8 text-center">
                    <p className="font-medium">{t('method.emptyTitle')}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {canEdit ? t('method.emptyOwner') : t('method.emptyViewer')}
                    </p>
                    {canEdit && (
                      <Button asChild variant="outline" size="sm" className="mt-3">
                        <Link href={recipeEditPath(pathRef)}>
                          <Pencil /> {t('method.editRecipe')}
                        </Link>
                      </Button>
                    )}
                  </div>
                )}

                {recipe.story && (
                  <>
                    <Separator />
                    <div className="flex flex-col gap-2">
                      <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
                        <Sparkles className="size-4 text-secondary" aria-hidden="true" />
                        {t('storyMemories')}
                      </h3>
                      <p className="whitespace-pre-line leading-relaxed text-foreground/90">
                        {recipe.story}
                      </p>
                    </div>
                  </>
                )}

                {(recipe.notes ?? recipe.sourceName ?? recipe.sourceUrl) && (
                  <>
                    <Separator />
                    <div className="flex flex-col gap-3">
                      {recipe.notes && (
                        <div>
                          <h3 className="font-display text-lg font-semibold">{t('notes')}</h3>
                          <p className="mt-1 whitespace-pre-line text-muted-foreground">
                            {recipe.notes}
                          </p>
                        </div>
                      )}
                      {(recipe.sourceName ?? recipe.sourceUrl) && (
                        <p className="text-sm text-muted-foreground">
                          {t('source')}{' '}
                          {recipe.sourceUrl ? (
                            <a
                              href={recipe.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                            >
                              {recipe.sourceName ?? recipe.sourceUrl}
                              <ExternalLink className="size-3.5" aria-hidden="true" />
                              <span className="sr-only">({t('opensInNewTab')})</span>
                            </a>
                          ) : (
                            recipe.sourceName
                          )}
                        </p>
                      )}
                    </div>
                  </>
                )}

                <RecipeClassificationBadges
                  items={[...classifications.general, ...classifications.dietary]}
                  className="pt-2"
                />

                {/* Co-creator management (#668). Owner-only in the UI, and
                    owner-only again in every action it calls — this render
                    condition is a convenience, never the gate. */}
                {isOwner && <RecipeCreatorManager recipeId={recipe.id} creators={creators} />}
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
              <h2 className="font-display text-2xl font-bold tracking-tight">{t('similar')}</h2>
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

export default withRouteMessages(RecipePage);
