import 'server-only';

import { and, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';

import { db } from '~/server/db';
import {
  mediaAssets,
  recipeSourceImages,
  recipeSteps,
  recipeVersions,
  recipes,
  usageCounters,
  type MediaAsset,
} from '~/server/db/schema';
import { cloudinaryRefFromUrl, type CloudinaryRef } from './public-id';
import { recipeSnapshotMediaUrls, type RecipeMediaSnapshot } from './recipe-references';

const BYTES_PER_MB = 1024 * 1024;
const LIFETIME_PERIOD = new Date(0);

export type RetainedRecipeMediaClassification = {
  recipeId: string;
  /** The owner after erasure; null means the retained recipe is unclaimed. */
  ownerId: string | null;
  createdAt: Date;
  /**
   * True only when this recipe was owned by the departing user before erasure.
   * This permits legacy URL-only media to acquire bookkeeping. A co-creator's
   * deletion must never claim an owner's unbookkept image merely because the
   * departing contributor authored a snapshot that references it.
   */
  wasOwnedByDepartingUser: boolean;
};

export type MediaCustodyDestination =
  { kind: 'user'; userId: string } | { kind: 'recipe'; recipeId: string };

export type MediaCustodyTransfer = {
  assetId: string | null;
  /** Present when this is a recipe-claim transfer rather than erasure. */
  sourceCustodianRecipeId?: string;
  url: string;
  publicId: string | null;
  resourceType: CloudinaryRef['resourceType'];
  destination: MediaCustodyDestination;
};

export type RetainedMediaTransferPlan = {
  departingUserId: string;
  transfers: MediaCustodyTransfer[];
  /** Useful for deletion evidence; these are plans, not yet completed writes. */
  toUsers: number;
  toRecipes: number;
};

export type RetainedMediaTransferResult = {
  transferredToUsers: number;
  transferredToRecipes: number;
  convergedDuplicates: number;
  meteredMb: number;
};

export type MediaCustodyTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type RecipeReference = {
  recipeId: string;
  url: string;
};

type PlannableAsset = Pick<MediaAsset, 'id' | 'url' | 'publicId' | 'resourceType'>;
type MediaIdentity = Pick<MediaAsset, 'url' | 'publicId' | 'resourceType'>;

function referenceKey(url: string, publicId?: string | null, resourceType?: string): string {
  const parsed = cloudinaryRefFromUrl(url);
  const ref = publicId
    ? {
        publicId,
        resourceType:
          resourceType === 'video' || resourceType === 'raw'
            ? resourceType
            : (parsed?.resourceType ?? 'image'),
      }
    : parsed;
  return ref ? `cloudinary:${ref.resourceType}:${ref.publicId}` : `url:${url}`;
}

function snapshotReferences(recipeId: string, snapshot: RecipeMediaSnapshot): RecipeReference[] {
  return recipeSnapshotMediaUrls(snapshot).map((url) => ({ recipeId, url }));
}

function oldestFirst(
  a: RetainedRecipeMediaClassification,
  b: RetainedRecipeMediaClassification,
): number {
  return a.createdAt.getTime() - b.createdAt.getTime() || a.recipeId.localeCompare(b.recipeId);
}

/**
 * Classify the departing user's media before erasure.
 *
 * The caller supplies the recipes known to survive and their post-erasure
 * owners plus all recipes they own. Current media and user-authored snapshots
 * establish the departing user's inventory. Every live recipe and historical
 * version that references that inventory is then eligible to receive custody,
 * including an independently owned fork.
 */
export async function planRetainedMediaTransfers(
  departingUserId: string,
  retainedRecipes: readonly RetainedRecipeMediaClassification[],
  executor: typeof db = db,
  departingOwnedRecipeIds: readonly string[] = [],
): Promise<RetainedMediaTransferPlan> {
  const retainedRecipeIds = retainedRecipes.map(({ recipeId }) => recipeId);
  const inventoryRecipeIds = [...new Set([...retainedRecipeIds, ...departingOwnedRecipeIds])];
  const ownedRecipeIds = new Set(departingOwnedRecipeIds);
  const emptyRows = Promise.resolve([]);
  const [currentRecipes, sourceImages, steps, versions, assets] = await Promise.all([
    inventoryRecipeIds.length > 0
      ? executor
          .select({ id: recipes.id, coverImageUrl: recipes.coverImageUrl })
          .from(recipes)
          .where(inArray(recipes.id, inventoryRecipeIds))
      : emptyRows,
    inventoryRecipeIds.length > 0
      ? executor
          .select({
            recipeId: recipeSourceImages.recipeId,
            imageUrl: recipeSourceImages.imageUrl,
          })
          .from(recipeSourceImages)
          .where(inArray(recipeSourceImages.recipeId, inventoryRecipeIds))
      : emptyRows,
    inventoryRecipeIds.length > 0
      ? executor
          .select({
            recipeId: recipeSteps.recipeId,
            imageUrl: recipeSteps.imageUrl,
            videoUrl: recipeSteps.videoUrl,
            captionUrl: recipeSteps.captionUrl,
          })
          .from(recipeSteps)
          .where(inArray(recipeSteps.recipeId, inventoryRecipeIds))
      : emptyRows,
    inventoryRecipeIds.length > 0
      ? executor
          .select({ recipeId: recipeVersions.recipeId, snapshot: recipeVersions.snapshot })
          .from(recipeVersions)
          .where(
            and(
              inArray(recipeVersions.recipeId, inventoryRecipeIds),
              ownedRecipeIds.size > 0
                ? or(
                    inArray(recipeVersions.recipeId, [...ownedRecipeIds]),
                    eq(recipeVersions.authorId, departingUserId),
                  )
                : eq(recipeVersions.authorId, departingUserId),
            ),
          )
      : emptyRows,
    executor.query.mediaAssets.findMany({
      where: and(eq(mediaAssets.userId, departingUserId), isNull(mediaAssets.deletedAt)),
    }),
  ]);

  const references: RecipeReference[] = [];
  const legacyOwnedUrls = new Set<string>();
  const addReference = (recipeId: string, url: string | null | undefined) => {
    if (!url) return;
    references.push({ recipeId, url });
    if (ownedRecipeIds.has(recipeId)) legacyOwnedUrls.add(url);
  };
  for (const recipe of currentRecipes) addReference(recipe.id, recipe.coverImageUrl);
  for (const image of sourceImages) addReference(image.recipeId, image.imageUrl);
  for (const step of steps) {
    for (const url of [step.imageUrl, step.videoUrl, step.captionUrl]) {
      addReference(step.recipeId, url);
    }
  }
  for (const version of versions) {
    for (const reference of snapshotReferences(version.recipeId, version.snapshot)) {
      addReference(reference.recipeId, reference.url);
    }
  }

  const candidateUrls = [...new Set([...assets.map((asset) => asset.url), ...legacyOwnedUrls])];
  const recipeClassifications = new Map(
    retainedRecipes.map((recipe) => [recipe.recipeId, recipe] as const),
  );
  let foreignOwnedAssets: MediaIdentity[] = [];

  if (candidateUrls.length > 0) {
    const survivesDeparture = and(
      isNull(recipes.deletedAt),
      or(isNull(recipes.authorId), ne(recipes.authorId, departingUserId)),
    );
    const versionUrlPredicates = candidateUrls.map(
      (url) =>
        sql`${recipeVersions.snapshot}::text like ${`%${JSON.stringify(url).replace(/[\\%_]/g, '\\$&')}%`} escape '\'`,
    );
    const candidatePublicIds = [
      ...new Set(
        candidateUrls
          .map((url) => cloudinaryRefFromUrl(url)?.publicId)
          .filter((publicId): publicId is string => Boolean(publicId)),
      ),
    ];
    const [coverRefs, sourceRefs, stepRefs, versionRefs, foreignAssets] = await Promise.all([
      executor
        .select({
          recipeId: recipes.id,
          ownerId: recipes.authorId,
          createdAt: recipes.createdAt,
          url: recipes.coverImageUrl,
        })
        .from(recipes)
        .where(and(survivesDeparture, inArray(recipes.coverImageUrl, candidateUrls))),
      executor
        .select({
          recipeId: recipes.id,
          ownerId: recipes.authorId,
          createdAt: recipes.createdAt,
          url: recipeSourceImages.imageUrl,
        })
        .from(recipeSourceImages)
        .innerJoin(recipes, eq(recipes.id, recipeSourceImages.recipeId))
        .where(and(survivesDeparture, inArray(recipeSourceImages.imageUrl, candidateUrls))),
      executor
        .select({
          recipeId: recipes.id,
          ownerId: recipes.authorId,
          createdAt: recipes.createdAt,
          imageUrl: recipeSteps.imageUrl,
          videoUrl: recipeSteps.videoUrl,
          captionUrl: recipeSteps.captionUrl,
        })
        .from(recipeSteps)
        .innerJoin(recipes, eq(recipes.id, recipeSteps.recipeId))
        .where(
          and(
            survivesDeparture,
            or(
              inArray(recipeSteps.imageUrl, candidateUrls),
              inArray(recipeSteps.videoUrl, candidateUrls),
              inArray(recipeSteps.captionUrl, candidateUrls),
            ),
          ),
        ),
      executor
        .select({
          recipeId: recipes.id,
          ownerId: recipes.authorId,
          createdAt: recipes.createdAt,
          snapshot: recipeVersions.snapshot,
        })
        .from(recipeVersions)
        .innerJoin(recipes, eq(recipes.id, recipeVersions.recipeId))
        .where(and(survivesDeparture, or(...versionUrlPredicates))),
      executor.query.mediaAssets.findMany({
        where: and(
          eq(mediaAssets.provider, 'cloudinary'),
          isNull(mediaAssets.deletedAt),
          or(isNull(mediaAssets.userId), ne(mediaAssets.userId, departingUserId)),
          or(
            candidatePublicIds.length > 0
              ? inArray(mediaAssets.publicId, candidatePublicIds)
              : undefined,
            inArray(mediaAssets.url, candidateUrls),
          ),
        ),
        columns: { url: true, publicId: true, resourceType: true },
      }),
    ]);
    foreignOwnedAssets = foreignAssets;

    const classify = (row: { recipeId: string; ownerId: string | null; createdAt: Date }) => {
      if (!recipeClassifications.has(row.recipeId)) {
        recipeClassifications.set(row.recipeId, {
          recipeId: row.recipeId,
          ownerId: row.ownerId,
          createdAt: row.createdAt,
          wasOwnedByDepartingUser: false,
        });
      }
    };
    for (const row of coverRefs) {
      classify(row);
      addReference(row.recipeId, row.url);
    }
    for (const row of sourceRefs) {
      classify(row);
      addReference(row.recipeId, row.url);
    }
    for (const row of stepRefs) {
      classify(row);
      for (const url of [row.imageUrl, row.videoUrl, row.captionUrl]) {
        if (url && candidateUrls.includes(url)) addReference(row.recipeId, url);
      }
    }
    const candidateKeys = new Set(candidateUrls.map((url) => referenceKey(url)));
    for (const row of versionRefs) {
      classify(row);
      for (const reference of snapshotReferences(row.recipeId, row.snapshot)) {
        if (candidateKeys.has(referenceKey(reference.url))) references.push(reference);
      }
    }
  }

  const classifications = [...recipeClassifications.values()];
  if (classifications.length === 0) {
    return { departingUserId, transfers: [], toUsers: 0, toRecipes: 0 };
  }

  return buildRetainedMediaTransferPlan(
    departingUserId,
    classifications,
    references,
    assets,
    [...legacyOwnedUrls],
    foreignOwnedAssets,
  );
}

/**
 * Pure planning core, exported so orchestration can plan from an inventory it
 * already queried and so custody selection remains straightforward to test.
 */
export function buildRetainedMediaTransferPlan(
  departingUserId: string,
  retainedRecipes: readonly RetainedRecipeMediaClassification[],
  references: readonly RecipeReference[],
  assets: readonly PlannableAsset[],
  legacyOwnedUrls: readonly string[] = [],
  foreignOwnedAssets: readonly MediaIdentity[] = [],
): RetainedMediaTransferPlan {
  const recipesById = new Map(retainedRecipes.map((recipe) => [recipe.recipeId, recipe]));
  const referencesByAsset = new Map<string, RecipeReference[]>();
  for (const reference of references) {
    const key = referenceKey(reference.url);
    const existing = referencesByAsset.get(key) ?? [];
    existing.push(reference);
    referencesByAsset.set(key, existing);
  }

  const assetsByKey = new Map(
    assets.map((asset) => [referenceKey(asset.url, asset.publicId, asset.resourceType), asset]),
  );
  const legacyOwnedKeys = new Set(legacyOwnedUrls.map((url) => referenceKey(url)));
  const foreignOwnedKeys = new Set(
    foreignOwnedAssets.map((asset) => referenceKey(asset.url, asset.publicId, asset.resourceType)),
  );
  const transfers: MediaCustodyTransfer[] = [];
  for (const [key, matchingReferences] of referencesByAsset) {
    const candidates = matchingReferences
      .map(({ recipeId }) => recipesById.get(recipeId))
      .filter((recipe): recipe is RetainedRecipeMediaClassification => Boolean(recipe));
    const owned = candidates
      .filter(
        (recipe): recipe is RetainedRecipeMediaClassification & { ownerId: string } =>
          recipe.ownerId !== null,
      )
      .sort(oldestFirst);
    const ownerless = candidates.filter((recipe) => recipe.ownerId === null).sort(oldestFirst);
    const selected = owned[0] ?? ownerless[0];
    if (!selected) continue;

    const asset = assetsByKey.get(key);
    const parsedRef = cloudinaryRefFromUrl(asset?.url ?? matchingReferences[0]!.url);
    if (!asset && foreignOwnedKeys.has(key)) continue;
    if (
      !asset &&
      !legacyOwnedKeys.has(key) &&
      !matchingReferences.some(
        ({ recipeId }) => recipesById.get(recipeId)?.wasOwnedByDepartingUser === true,
      )
    ) {
      continue;
    }
    const firstReference = matchingReferences[0]!;
    transfers.push({
      assetId: asset?.id ?? null,
      url: asset?.url ?? firstReference.url,
      publicId: asset?.publicId ?? parsedRef?.publicId ?? null,
      resourceType:
        asset?.resourceType === 'video' || asset?.resourceType === 'raw'
          ? asset.resourceType
          : (parsedRef?.resourceType ?? 'image'),
      destination: selected.ownerId
        ? { kind: 'user', userId: selected.ownerId }
        : { kind: 'recipe', recipeId: selected.recipeId },
    });
  }

  return {
    departingUserId,
    transfers,
    toUsers: transfers.filter(({ destination }) => destination.kind === 'user').length,
    toRecipes: transfers.filter(({ destination }) => destination.kind === 'recipe').length,
  };
}

async function meterStorage(
  tx: MediaCustodyTransaction,
  userId: string,
  asset: Pick<MediaAsset, 'provider' | 'bytes'>,
): Promise<number> {
  if (asset.provider !== 'cloudinary' || !asset.bytes || asset.bytes <= 0) return 0;
  const amount = Math.ceil(asset.bytes / BYTES_PER_MB);
  await tx
    .insert(usageCounters)
    .values({
      ownerId: userId,
      ownerType: 'user',
      metric: 'storage_mb',
      periodStart: LIFETIME_PERIOD,
      value: amount,
    })
    .onConflictDoUpdate({
      target: [usageCounters.ownerId, usageCounters.metric, usageCounters.periodStart],
      set: {
        value: sql`${usageCounters.value} + ${amount}`,
        updatedAt: new Date(),
      },
    });
  return amount;
}

/**
 * Execute a plan atomically. Ownership predicates make retries no-ops. If the
 * destination already has the same public id, its row wins and the departing
 * duplicate is removed without touching Cloudinary or metering twice.
 */
export async function executeRetainedMediaTransfers(
  plan: RetainedMediaTransferPlan,
): Promise<RetainedMediaTransferResult> {
  return db.transaction((tx) => executeRetainedMediaTransfersInTransaction(tx, plan));
}

/**
 * Transaction-aware execution for erasure orchestrators that need recipe and
 * media ownership changes to commit together.
 */
export async function executeRetainedMediaTransfersInTransaction(
  tx: MediaCustodyTransaction,
  plan: RetainedMediaTransferPlan,
): Promise<RetainedMediaTransferResult> {
  const result: RetainedMediaTransferResult = {
    transferredToUsers: 0,
    transferredToRecipes: 0,
    convergedDuplicates: 0,
    meteredMb: 0,
  };

  for (const transfer of plan.transfers) {
    const sourceCustody = transfer.sourceCustodianRecipeId
      ? eq(mediaAssets.custodianRecipeId, transfer.sourceCustodianRecipeId)
      : eq(mediaAssets.userId, plan.departingUserId);
    let source = transfer.assetId
      ? await tx.query.mediaAssets.findFirst({
          where: and(
            eq(mediaAssets.id, transfer.assetId),
            sourceCustody,
            isNull(mediaAssets.deletedAt),
          ),
        })
      : undefined;

    if (!source) {
      const alreadyCustodied = await tx.query.mediaAssets.findFirst({
        where: and(
          transfer.destination.kind === 'user'
            ? eq(mediaAssets.userId, transfer.destination.userId)
            : eq(mediaAssets.custodianRecipeId, transfer.destination.recipeId),
          transfer.publicId
            ? and(
                eq(mediaAssets.publicId, transfer.publicId),
                eq(mediaAssets.resourceType, transfer.resourceType),
              )
            : eq(mediaAssets.url, transfer.url),
          isNull(mediaAssets.deletedAt),
        ),
      });
      if (alreadyCustodied) continue;

      // A rendering URL can predate media bookkeeping. Materialize custody so
      // purge can see that the retained bytes belong elsewhere. Planning only
      // permits this for recipes formerly owned by the departing user.
      const [inserted] = await tx
        .insert(mediaAssets)
        .values({
          userId: transfer.destination.kind === 'user' ? transfer.destination.userId : null,
          custodianRecipeId:
            transfer.destination.kind === 'recipe' ? transfer.destination.recipeId : null,
          provider: transfer.publicId ? 'cloudinary' : 'external',
          publicId: transfer.publicId,
          resourceType: transfer.resourceType,
          url: transfer.url,
        })
        .onConflictDoNothing()
        .returning();
      if (inserted) {
        if (transfer.destination.kind === 'user') result.transferredToUsers += 1;
        else result.transferredToRecipes += 1;
      }
      continue;
    }

    if (source.publicId) {
      const duplicate = await tx.query.mediaAssets.findFirst({
        where: and(
          transfer.destination.kind === 'user'
            ? eq(mediaAssets.userId, transfer.destination.userId)
            : eq(mediaAssets.custodianRecipeId, transfer.destination.recipeId),
          eq(mediaAssets.publicId, source.publicId),
          eq(mediaAssets.resourceType, transfer.resourceType),
          isNull(mediaAssets.deletedAt),
        ),
      });
      if (duplicate?.id === source.id) continue;
      if (duplicate) {
        await tx.delete(mediaAssets).where(eq(mediaAssets.id, source.id));
        result.convergedDuplicates += 1;
        continue;
      }
    }

    const [moved] = await tx
      .update(mediaAssets)
      .set(
        transfer.destination.kind === 'user'
          ? { userId: transfer.destination.userId, custodianRecipeId: null }
          : { userId: null, custodianRecipeId: transfer.destination.recipeId },
      )
      .where(and(eq(mediaAssets.id, source.id), sourceCustody))
      .returning();
    if (!moved) continue;
    source = moved;
    if (transfer.destination.kind === 'user') {
      result.transferredToUsers += 1;
      result.meteredMb += await meterStorage(tx, transfer.destination.userId, source);
    } else {
      result.transferredToRecipes += 1;
    }
  }
  return result;
}

/**
 * Transaction-aware claim integration. The caller can update recipe ownership
 * and transfer custody on the same transaction, eliminating a partial claim.
 */
export async function transferCustodiedMediaToClaimantInTransaction(
  tx: MediaCustodyTransaction,
  recipeId: string,
  claimantId: string,
): Promise<RetainedMediaTransferResult> {
  const assets = await tx.query.mediaAssets.findMany({
    where: and(eq(mediaAssets.custodianRecipeId, recipeId), isNull(mediaAssets.deletedAt)),
  });
  return executeRetainedMediaTransfersInTransaction(tx, {
    departingUserId: claimantId,
    transfers: assets.map((asset) => ({
      assetId: asset.id,
      sourceCustodianRecipeId: recipeId,
      url: asset.url,
      publicId: asset.publicId,
      resourceType:
        asset.resourceType === 'video' || asset.resourceType === 'raw'
          ? asset.resourceType
          : 'image',
      destination: { kind: 'user', userId: claimantId },
    })),
    toUsers: assets.length,
    toRecipes: 0,
  });
}

/**
 * Claim integration. Call after winning the recipe claim. It is safe to retry:
 * only rows still custodied by the recipe move and therefore meter.
 */
export async function transferCustodiedMediaToClaimant(
  recipeId: string,
  claimantId: string,
): Promise<RetainedMediaTransferResult> {
  return db.transaction((tx) =>
    transferCustodiedMediaToClaimantInTransaction(tx, recipeId, claimantId),
  );
}
