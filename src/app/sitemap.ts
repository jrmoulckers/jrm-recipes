import type { MetadataRoute } from "next";

import { absoluteUrl } from "~/lib/utils";
import { listPublicRecipeSlugs } from "~/server/recipes/queries";
import { listPublicCookHandles } from "~/server/users/queries";

/**
 * Dynamic sitemap (issue #323): the static entry points plus every public,
 * published recipe with an accurate `lastModified`, and every public cook
 * profile (issue #327). Rendered per-request (`force-dynamic`) so newly
 * published recipes appear without a rebuild; when the DB is unconfigured the
 * queries return nothing and only the static routes are emitted.
 * Private/group/unlisted/draft recipes are never listed —
 * `listPublicRecipeSlugs` filters to `public` + `published` only.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/discover"), changeFrequency: "daily", priority: 0.9 },
    { url: absoluteUrl("/recipes"), changeFrequency: "daily", priority: 0.8 },
  ];

  const [recipes, handles] = await Promise.all([
    listPublicRecipeSlugs(),
    listPublicCookHandles(),
  ]);

  const recipeRoutes: MetadataRoute.Sitemap = recipes.map((recipe) => ({
    url: absoluteUrl(`/recipes/${recipe.slug}`),
    lastModified: recipe.updatedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const cookRoutes: MetadataRoute.Sitemap = handles.map((handle) => ({
    url: absoluteUrl(`/cooks/${handle}`),
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  return [...staticRoutes, ...recipeRoutes, ...cookRoutes];
}
