import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import { getLocale } from 'next-intl/server';

import { getNamespacedRecipeForViewer } from '~/server/recipes/loaders';
import { toCookRecipe } from '~/server/recipes/serialize';
import { CookExperience } from '~/components/cook/cook-experience';
import { UnitPrefsProvider } from '~/components/recipe/unit-prefs-context';
import { getUnitSettings } from '~/server/units/queries';
import { isDbConfigured } from '~/server/db';
import { toUnitPrefs, toCustomUnitDefs } from '~/lib/unit-prefs';
import { parseRecipeParams, type RecipeRouteParams } from '~/lib/route-params';
import { withRouteMessages } from '~/components/i18n/route-messages';
import { recipeCookPath } from '~/lib/recipe-path';

export async function generateMetadata({
  params,
}: {
  params: Promise<RecipeRouteParams>;
}): Promise<Metadata> {
  const { cook, recipe: recipeSegment } = await parseRecipeParams(params);
  const { recipe } = await getNamespacedRecipeForViewer(cook, recipeSegment);
  return {
    title: recipe ? `Cook · ${recipe.title}` : 'Cook mode',
    robots: { index: false, follow: false },
  };
}

async function CookPage({ params }: { params: Promise<RecipeRouteParams> }) {
  const { cook, recipe: recipeSegment } = await parseRecipeParams(params);
  const { user, recipe, disposition } = await getNamespacedRecipeForViewer(cook, recipeSegment);
  if (!recipe) notFound();
  if (disposition === 'alias') {
    permanentRedirect(
      recipeCookPath({
        id: recipe.id,
        slug: recipe.slug,
        cook: recipe.author?.slug,
        authorId: recipe.authorId,
      }),
    );
  }

  // Auto-convert amounts to the cook's saved units while they cook (#…). Fetched
  // here and made ambient so Cook Mode's nested ingredient panels pick them up.
  const dbEnabled = isDbConfigured();
  const unitSettings = user && dbEnabled ? await getUnitSettings(user.id) : null;
  const locale = await getLocale();
  const unitPrefs = user ? toUnitPrefs(unitSettings?.preferences, locale) : undefined;
  const customUnits = user ? toCustomUnitDefs(unitSettings?.customUnits) : undefined;

  return (
    <UnitPrefsProvider prefs={unitPrefs} customs={customUnits}>
      <CookExperience
        recipe={toCookRecipe(recipe)}
        feedback={{
          canRate: Boolean(user),
          isOwner: user?.id === recipe.authorId,
        }}
      />
    </UnitPrefsProvider>
  );
}

export default withRouteMessages(CookPage);
