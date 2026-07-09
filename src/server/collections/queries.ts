import "server-only";

import { and, asc, desc, eq, inArray, max, or } from "drizzle-orm";

import { db, isDbConfigured } from "~/server/db";
import {
  collectionGroups,
  collectionRecipes,
  collections,
  cookLogEntries,
  favorites,
  groupMembers,
  type User,
} from "~/server/db/schema";
import { canView } from "~/server/recipes/queries";
import {
  ROTATION_MIN,
  ROTATION_WINDOW_DAYS,
  selectBackInRotation,
} from "~/lib/rotation";

const recipeCardWith = {
  author: true,
  tags: { with: { tag: true } },
  ratings: true,
} as const;

/** Group ids the viewer belongs to — for per-recipe visibility scoping. */
async function viewerGroupIds(viewer: User | null): Promise<string[]> {
  if (!viewer) return [];
  const rows = await db.query.groupMembers.findMany({
    where: eq(groupMembers.userId, viewer.id),
    columns: { groupId: true },
  });
  return rows.map((r) => r.groupId);
}

export type CollectionSummary = Awaited<
  ReturnType<typeof listMyCollections>
>[number];
export type FavoriteRecipe = Awaited<
  ReturnType<typeof listMyFavorites>
>[number];
export type FullCollection = NonNullable<
  Awaited<ReturnType<typeof getCollection>>
>;
export type CollectionMembership = Awaited<
  ReturnType<typeof getCollectionsForRecipe>
>[number];

/** The user's collections, newest first, with a recipe count + cover fallback. */
export async function listMyCollections(userId: string) {
  if (!isDbConfigured()) return [];

  const rows = await db.query.collections.findMany({
    where: eq(collections.userId, userId),
    orderBy: [desc(collections.updatedAt)],
    with: {
      sharedWithGroups: {
        with: { group: { columns: { id: true, name: true, slug: true } } },
      },
      recipes: {
        columns: { recipeId: true },
        orderBy: [asc(collectionRecipes.position), asc(collectionRecipes.addedAt)],
        with: { recipe: { columns: { coverImageUrl: true } } },
      },
    },
  });

  return rows.map((collection) => {
    const cover =
      collection.coverImageUrl ??
      collection.recipes.find((r) => r.recipe?.coverImageUrl)?.recipe
        ?.coverImageUrl ??
      null;
    return {
      id: collection.id,
      name: collection.name,
      description: collection.description,
      coverImageUrl: cover,
      recipeCount: collection.recipes.length,
      updatedAt: collection.updatedAt,
      sharedGroups: (collection.sharedWithGroups ?? [])
        .map((link) => link.group)
        .filter((group): group is NonNullable<typeof group> => group != null)
        .map((group) => ({ id: group.id, name: group.name, slug: group.slug })),
    };
  });
}

/** A single collection the viewer owns, with its recipes in saved order. */
export async function getCollection(id: string, viewer: User | null) {
  if (!isDbConfigured() || !viewer) return null;

  const collection = await db.query.collections.findFirst({
    where: and(eq(collections.id, id), eq(collections.userId, viewer.id)),
    with: {
      recipes: {
        orderBy: [asc(collectionRecipes.position), asc(collectionRecipes.addedAt)],
        with: { recipe: { with: recipeCardWith } },
      },
    },
  });
  if (!collection) return null;

  const recipes = collection.recipes
    .map((entry) => entry.recipe)
    .filter((recipe): recipe is NonNullable<typeof recipe> => recipe != null);

  return {
    id: collection.id,
    name: collection.name,
    description: collection.description,
    coverImageUrl: collection.coverImageUrl,
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
    recipes,
  };
}

/**
 * Fetch a collection by its id *or* share token, enforcing collection-level
 * visibility for the viewer:
 *  - the owner always sees it (any visibility);
 *  - `public` collections are visible to anyone;
 *  - `unlisted` collections are visible only when reached via their share token.
 *
 * Recipes inside are additionally filtered by each recipe's own visibility, so a
 * shared cookbook never leaks a private recipe. Returns `null` when missing or
 * forbidden (callers should `notFound()`).
 */
export async function getSharedCollection(
  idOrToken: string,
  viewer: User | null,
) {
  if (!isDbConfigured()) return null;

  const collection = await db.query.collections.findFirst({
    where: or(
      eq(collections.id, idOrToken),
      eq(collections.shareToken, idOrToken),
    ),
    with: {
      owner: { columns: { id: true, name: true } },
      sharedWithGroups: {
        with: {
          group: { columns: { id: true, name: true, slug: true } },
        },
      },
      recipes: {
        orderBy: [asc(collectionRecipes.position), asc(collectionRecipes.addedAt)],
        with: { recipe: { with: recipeCardWith } },
      },
    },
  });
  if (!collection) return null;

  const groupIds = await viewerGroupIds(viewer);
  // Groups this collection is shared with that the viewer also belongs to —
  // read access is granted through any one of them (issue #365).
  const sharedToViewerGroups = (collection.sharedWithGroups ?? [])
    .map((link) => link.group)
    .filter((group): group is NonNullable<typeof group> => group != null)
    .filter((group) => groupIds.includes(group.id));

  const isOwner = viewer?.id === collection.userId;
  const matchedByToken =
    collection.shareToken != null && collection.shareToken === idOrToken;
  const permitted =
    isOwner ||
    collection.visibility === "public" ||
    (collection.visibility === "unlisted" && matchedByToken) ||
    sharedToViewerGroups.length > 0;
  if (!permitted) return null;

  const recipes = collection.recipes
    .map((entry) => entry.recipe)
    .filter((recipe): recipe is NonNullable<typeof recipe> => recipe != null)
    .filter((recipe) => canView(recipe, viewer, groupIds));

  return {
    id: collection.id,
    name: collection.name,
    description: collection.description,
    coverImageUrl: collection.coverImageUrl,
    visibility: collection.visibility,
    shareToken: collection.shareToken,
    isOwner,
    ownerName: collection.owner?.name ?? null,
    sharedWithGroups: sharedToViewerGroups,
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
    recipes,
  };
}

/** Whether a recipe is in the user's favorites. */
export async function isFavorited(
  recipeId: string,
  userId: string | null | undefined,
): Promise<boolean> {
  if (!isDbConfigured() || !userId) return false;
  const row = await db.query.favorites.findFirst({
    where: and(eq(favorites.userId, userId), eq(favorites.recipeId, recipeId)),
    columns: { id: true },
  });
  return Boolean(row);
}

/** The set of recipe ids the user has favorited (to mark cards in a list). */
export async function getFavoriteRecipeIds(
  userId: string | null | undefined,
): Promise<Set<string>> {
  if (!isDbConfigured() || !userId) return new Set();
  const rows = await db.query.favorites.findMany({
    where: eq(favorites.userId, userId),
    columns: { recipeId: true },
  });
  return new Set(rows.map((r) => r.recipeId));
}

/** The user's favorited recipes, most recently saved first. */
export async function listMyFavorites(userId: string) {
  if (!isDbConfigured()) return [];
  const rows = await db.query.favorites.findMany({
    where: eq(favorites.userId, userId),
    orderBy: [desc(favorites.createdAt)],
    with: { recipe: { with: recipeCardWith } },
  });
  return rows
    .map((row) => row.recipe)
    .filter((recipe): recipe is NonNullable<typeof recipe> => recipe != null);
}

/**
 * "Back in the rotation" tuning + selection logic lives in a pure, testable lib
 * (#426); re-exported here so existing import sites keep working.
 */
export { ROTATION_WINDOW_DAYS, ROTATION_MIN };

/**
 * "Back in the rotation" (#426): the viewer's favorites they haven't cooked
 * recently — favorites minus recipes cooked within `windowDays`, ordered so the
 * longest-neglected surface first (never-cooked, then oldest-cooked). Returns
 * recipe cards ready for the rail. Empty when no database is configured.
 */
export async function listBackInRotation(
  userId: string,
  { windowDays = ROTATION_WINDOW_DAYS, limit = 12 }: { windowDays?: number; limit?: number } = {},
) {
  if (!isDbConfigured()) return [];
  const favorited = await db.query.favorites.findMany({
    where: eq(favorites.userId, userId),
    // Oldest-favorited first breaks ties among never-cooked recipes.
    orderBy: [asc(favorites.createdAt)],
    with: { recipe: { with: recipeCardWith } },
  });
  const recipes = favorited
    .map((row) => row.recipe)
    .filter((recipe): recipe is NonNullable<typeof recipe> => recipe != null);
  if (recipes.length === 0) return [];

  const cookedRows = await db
    .select({
      recipeId: cookLogEntries.recipeId,
      last: max(cookLogEntries.cookedAt),
    })
    .from(cookLogEntries)
    .where(eq(cookLogEntries.userId, userId))
    .groupBy(cookLogEntries.recipeId);
  const lastCooked = new Map<string, number>();
  for (const row of cookedRows) {
    if (row.last != null) lastCooked.set(row.recipeId, new Date(row.last).getTime());
  }

  return selectBackInRotation(recipes, lastCooked, { windowDays, limit });
}

/**
 * The user's collections annotated with whether each already contains `recipeId`
 * — powers the "Save to collection" picker.
 */
export async function getCollectionsForRecipe(userId: string, recipeId: string) {
  if (!isDbConfigured()) return [];
  const rows = await db.query.collections.findMany({
    where: eq(collections.userId, userId),
    orderBy: [desc(collections.updatedAt)],
    columns: { id: true, name: true },
    with: {
      recipes: {
        where: eq(collectionRecipes.recipeId, recipeId),
        columns: { id: true },
      },
    },
  });
  return rows.map((collection) => ({
    id: collection.id,
    name: collection.name,
    contains: collection.recipes.length > 0,
  }));
}

function collectionCover(collection: {
  coverImageUrl: string | null;
  recipes: { recipe: { coverImageUrl: string | null } | null }[];
}): string | null {
  return (
    collection.coverImageUrl ??
    collection.recipes.find((r) => r.recipe?.coverImageUrl)?.recipe
      ?.coverImageUrl ??
    null
  );
}

/**
 * The groups the owner can share a collection with — every group they belong to,
 * flagged with whether the collection is already shared there (issue #365).
 * Returns [] unless the caller owns the collection.
 */
export async function listShareTargetsForCollection(
  collectionId: string,
  user: User,
) {
  if (!isDbConfigured()) return [];

  const owned = await db.query.collections.findFirst({
    where: and(
      eq(collections.id, collectionId),
      eq(collections.userId, user.id),
    ),
    columns: { id: true },
  });
  if (!owned) return [];

  const [memberships, shared] = await Promise.all([
    db.query.groupMembers.findMany({
      where: eq(groupMembers.userId, user.id),
      orderBy: [desc(groupMembers.updatedAt)],
      with: {
        group: {
          columns: { id: true, name: true, slug: true, avatarUrl: true },
        },
      },
    }),
    db.query.collectionGroups.findMany({
      where: eq(collectionGroups.collectionId, collectionId),
      columns: { groupId: true },
    }),
  ]);

  const sharedIds = new Set(shared.map((row) => row.groupId));
  return memberships
    .map((m) => m.group)
    .filter((group): group is NonNullable<typeof group> => group != null)
    .map((group) => ({
      id: group.id,
      name: group.name,
      slug: group.slug,
      avatarUrl: group.avatarUrl,
      shared: sharedIds.has(group.id),
    }));
}

export type CollectionShareTarget = Awaited<
  ReturnType<typeof listShareTargetsForCollection>
>[number];

/**
 * Collections shared with a group, for the group page's "Shared collections"
 * shelf (issue #365). Returns [] unless the viewer is a member of the group.
 */
export async function listCollectionsSharedWithGroup(
  groupId: string,
  viewer: User | null,
) {
  if (!isDbConfigured() || !viewer) return [];

  const membership = await db.query.groupMembers.findFirst({
    where: and(
      eq(groupMembers.groupId, groupId),
      eq(groupMembers.userId, viewer.id),
    ),
    columns: { id: true },
  });
  if (!membership) return [];

  const links = await db.query.collectionGroups.findMany({
    where: eq(collectionGroups.groupId, groupId),
    orderBy: [desc(collectionGroups.createdAt)],
    with: {
      collection: {
        with: {
          owner: { columns: { id: true, name: true } },
          recipes: {
            columns: { recipeId: true },
            with: { recipe: { columns: { coverImageUrl: true } } },
          },
        },
      },
    },
  });

  return links
    .map((link) => link.collection)
    .filter((c): c is NonNullable<typeof c> => c != null)
    .map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      coverImageUrl: collectionCover(c),
      recipeCount: c.recipes.length,
      ownerName: c.owner?.name ?? null,
    }));
}

export type SharedGroupCollection = Awaited<
  ReturnType<typeof listCollectionsSharedWithGroup>
>[number];

/**
 * Collections other people have shared with any group the viewer belongs to —
 * powers the "Shared with you" shelf in the Saved view (issue #365). Excludes
 * the viewer's own collections and dedupes a collection shared with several of
 * the viewer's groups.
 */
export async function listCollectionsSharedWithViewer(userId: string) {
  if (!isDbConfigured()) return [];

  const memberships = await db.query.groupMembers.findMany({
    where: eq(groupMembers.userId, userId),
    columns: { groupId: true },
  });
  const groupIds = memberships.map((m) => m.groupId);
  if (groupIds.length === 0) return [];

  const links = await db.query.collectionGroups.findMany({
    where: inArray(collectionGroups.groupId, groupIds),
    orderBy: [desc(collectionGroups.createdAt)],
    with: {
      group: { columns: { id: true, name: true, slug: true } },
      collection: {
        with: {
          owner: { columns: { id: true, name: true } },
          recipes: {
            columns: { recipeId: true },
            with: { recipe: { columns: { coverImageUrl: true } } },
          },
        },
      },
    },
  });

  const seen = new Set<string>();
  const out: {
    id: string;
    name: string;
    description: string | null;
    coverImageUrl: string | null;
    recipeCount: number;
    ownerName: string | null;
    groupName: string | null;
    groupSlug: string | null;
  }[] = [];
  for (const link of links) {
    const c = link.collection;
    if (!c || c.userId === userId || seen.has(c.id)) continue;
    seen.add(c.id);
    out.push({
      id: c.id,
      name: c.name,
      description: c.description,
      coverImageUrl: collectionCover(c),
      recipeCount: c.recipes.length,
      ownerName: c.owner?.name ?? null,
      groupName: link.group?.name ?? null,
      groupSlug: link.group?.slug ?? null,
    });
  }
  return out;
}

export type ViewerSharedCollection = Awaited<
  ReturnType<typeof listCollectionsSharedWithViewer>
>[number];
