import { type Metadata } from "next";
import { notFound } from "next/navigation";

import { brand } from "~/config/brand";
import { getRecipeByShareToken } from "~/server/recipes/queries";
import { parseTokenParams, type TokenRouteParams } from "~/lib/route-params";
import RecipePage from "../../recipes/[id]/page";

const sharedRecipeRobots = { index: false, follow: false };

// A share link is a private, unguessable URL (issue #204). It must never be
// indexed or followed by crawlers.
export async function generateMetadata({
  params,
}: {
  params: Promise<TokenRouteParams>;
}): Promise<Metadata> {
  const { token } = await parseTokenParams(params);
  const recipe = await getRecipeByShareToken(token);
  if (!recipe) {
    return {
      title: "Shared recipe not found",
      description: `This shared recipe link is not available on ${brand.name}.`,
      robots: sharedRecipeRobots,
    };
  }

  return {
    title: `Shared · ${recipe.title}`,
    description:
      recipe.description ??
      `Open a private family recipe shared with you on ${brand.name}.`,
    robots: sharedRecipeRobots,
  };
}

/**
 * Share-token entry point for an `unlisted` recipe (issues #204/#207).
 *
 * This is the *only* anonymous path to an unlisted recipe: the token is resolved
 * server-side, and a disabled/rotated/unknown token 404s. On success we delegate
 * to the canonical recipe detail view, threading the token through so the loader
 * grants access and the share UI keeps handing out the token URL (not the slug).
 */
export default async function SharedRecipePage({
  params,
}: {
  params: Promise<TokenRouteParams>;
}) {
  const { token } = await parseTokenParams(params);
  const recipe = await getRecipeByShareToken(token);
  if (!recipe) notFound();

  return (
    <RecipePage
      params={Promise.resolve({ id: recipe.slug })}
      shareToken={token}
    />
  );
}
