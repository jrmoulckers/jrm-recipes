import { type Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import { getNamespacedRecipeForViewer } from '~/server/recipes/loaders';
import { toPrintRecipe } from '~/server/recipes/serialize';
import { PrintView } from '~/components/print/print-view';
import { parseRecipeParams, type RecipeRouteParams } from '~/lib/route-params';
import { withRouteMessages } from '~/components/i18n/route-messages';
import { recipePrintPath } from '~/lib/recipe-path';

export async function generateMetadata({
  params,
}: {
  params: Promise<RecipeRouteParams>;
}): Promise<Metadata> {
  const { cook, recipe: recipeSegment } = await parseRecipeParams(params);
  const { recipe } = await getNamespacedRecipeForViewer(cook, recipeSegment);
  return {
    title: recipe ? `Print · ${recipe.title}` : 'Print recipe',
    robots: { index: false, follow: false },
  };
}

async function PrintPage({ params }: { params: Promise<RecipeRouteParams> }) {
  const { cook, recipe: recipeSegment } = await parseRecipeParams(params);
  const { recipe, disposition } = await getNamespacedRecipeForViewer(cook, recipeSegment);
  if (!recipe) notFound();
  if (disposition === 'alias') {
    permanentRedirect(
      recipePrintPath({
        id: recipe.id,
        slug: recipe.slug,
        cook: recipe.author?.slug,
        authorId: recipe.authorId,
      }),
    );
  }

  return <PrintView recipe={toPrintRecipe(recipe)} />;
}

export default withRouteMessages(PrintPage);
