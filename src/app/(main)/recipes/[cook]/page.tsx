import { notFound, permanentRedirect } from 'next/navigation';

import { recipeDetailPath } from '~/lib/recipe-path';
import { parseFlatRecipeParams, type FlatRecipeRouteParams } from '~/lib/route-params';
import { getFlatRecipeForViewer } from '~/server/recipes/loaders';
import { withRouteMessages } from '~/components/i18n/route-messages';

/**
 * Legacy flat recipe URL: `/recipes/<slug>` or `/recipes/<id>` (#666).
 *
 * Before recipe slugs were namespaced per cook, this *was* the canonical URL,
 * so these links are everywhere — shared in messages, indexed by search
 * engines, saved as bookmarks, printed on keepsake cards. They resolve forever
 * and 308 to `/recipes/<cook>/<slug>`.
 *
 * The redirect is only issued after the recipe has been loaded *for this
 * viewer*, so it inherits the normal `canView` rule: somebody who may not see
 * the recipe gets a plain 404 and learns nothing about who owns it or what it
 * is now called.
 *
 * Static siblings (`/recipes/new`, `/recipes/tags`, `/recipes/cook-with`) are
 * matched by Next ahead of this dynamic segment, and both the user-slug and
 * recipe-slug allocators reserve those words, so this route can never shadow
 * them.
 */
async function LegacyRecipePage({ params }: { params: Promise<FlatRecipeRouteParams> }) {
  const { cook } = await parseFlatRecipeParams(params);
  const { recipe } = await getFlatRecipeForViewer(cook);
  if (!recipe) notFound();

  permanentRedirect(
    recipeDetailPath({
      id: recipe.id,
      slug: recipe.slug,
      cook: recipe.author?.slug,
      authorId: recipe.authorId,
    }),
  );
}

export default withRouteMessages(LegacyRecipePage);
