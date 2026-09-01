import 'server-only';

import { and, asc, eq, isNull, ne, or } from 'drizzle-orm';

import { db, isDbConfigured } from '~/server/db';
import { mediaAssets, recipeCreators, recipeVersions, recipes } from '~/server/db/schema';
import type { RecipeInput } from '~/server/recipes/validation';

export type SharedRecipeContribution = {
  recipeId: string;
  recipeTitle: string;
  versions: {
    versionNumber: number;
    label: string | null;
    summary: string | null;
    snapshot: RecipeInput;
    createdAt: string;
  }[];
  mediaUrls: string[];
};

function snapshotMediaUrls(snapshot: RecipeInput): string[] {
  return [
    snapshot.coverImageUrl,
    ...snapshot.steps.flatMap((step) => [step.imageUrl, step.videoUrl]),
  ].filter((url): url is string => Boolean(url));
}

/**
 * Export contributions only while the user still has accepted access to the
 * shared recipe. A version snapshot contains the whole collaborative document,
 * so returning snapshots after access was revoked would expose someone else's
 * private recipe in the name of data portability.
 */
export async function listSharedRecipeContributionsForExport(
  userId: string,
): Promise<SharedRecipeContribution[]> {
  if (!isDbConfigured()) return [];

  const [versions, assets] = await Promise.all([
    db
      .select({
        recipeId: recipeVersions.recipeId,
        recipeTitle: recipes.title,
        versionNumber: recipeVersions.versionNumber,
        label: recipeVersions.label,
        summary: recipeVersions.summary,
        snapshot: recipeVersions.snapshot,
        createdAt: recipeVersions.createdAt,
      })
      .from(recipeVersions)
      .innerJoin(recipes, eq(recipes.id, recipeVersions.recipeId))
      .innerJoin(
        recipeCreators,
        and(
          eq(recipeCreators.recipeId, recipes.id),
          eq(recipeCreators.userId, userId),
          eq(recipeCreators.status, 'accepted'),
        ),
      )
      .where(
        and(
          eq(recipeVersions.authorId, userId),
          or(isNull(recipes.authorId), ne(recipes.authorId, userId)),
          isNull(recipes.deletedAt),
        ),
      )
      .orderBy(asc(recipes.title), asc(recipeVersions.versionNumber)),
    db
      .select({ url: mediaAssets.url })
      .from(mediaAssets)
      .where(and(eq(mediaAssets.userId, userId), isNull(mediaAssets.deletedAt))),
  ]);

  const ownedMediaUrls = new Set(assets.map((asset) => asset.url));
  const grouped = new Map<string, SharedRecipeContribution>();

  for (const version of versions) {
    const contribution = grouped.get(version.recipeId) ?? {
      recipeId: version.recipeId,
      recipeTitle: version.recipeTitle,
      versions: [],
      mediaUrls: [],
    };
    contribution.versions.push({
      versionNumber: version.versionNumber,
      label: version.label,
      summary: version.summary,
      snapshot: version.snapshot,
      createdAt: version.createdAt.toISOString(),
    });
    contribution.mediaUrls.push(
      ...snapshotMediaUrls(version.snapshot).filter((url) => ownedMediaUrls.has(url)),
    );
    grouped.set(version.recipeId, contribution);
  }

  return [...grouped.values()].map((contribution) => ({
    ...contribution,
    mediaUrls: [...new Set(contribution.mediaUrls)],
  }));
}
