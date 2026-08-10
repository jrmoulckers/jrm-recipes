import "server-only";

import { eq, inArray } from "drizzle-orm";
import { v2 as cloudinary } from "cloudinary";

import { env } from "~/env";
import { db } from "~/server/db";
import {
  collections,
  cookLogEntries,
  mediaAssets,
  recipeSteps,
  recipes,
  reviews,
  users,
} from "~/server/db/schema";
import { cloudinaryRefFromUrl, type CloudinaryRef } from "./public-id";

/**
 * Bulk media purge for account erasure (issue #678).
 *
 * `deleteAsset` destroys one asset a user explicitly asked to remove. Erasure
 * needs the opposite shape: destroy *everything* a departing user's bytes are
 * reachable from, before the rows that name those bytes are deleted. Once the
 * DB rows are gone the CDN copies are unreachable and unattributable — live
 * forever with nothing left pointing at them — which is why
 * `media_assets.userId` and `recipes.authorId` are `restrict` rather than
 * `cascade` and why this runs *first*.
 *
 * Two sources, because neither alone is complete:
 *
 * - `media_assets`, which has an exact `publicId` but is deliberately additive
 *   and so misses pre-existing photos and failed bookkeeping calls.
 * - The URL columns, which are authoritative for rendering and therefore the
 *   real inventory, but only yield a public id by re-derivation.
 *
 * Ids are de-duplicated across both, so the overlap costs nothing.
 */

/** Cloudinary's documented ceiling for `api.delete_resources`. */
const DESTROY_BATCH = 100;

/** Attempts per asset before it is reported as failed. */
const MAX_ATTEMPTS = 3;

export type MediaPurgeResult = {
  /** Assets Cloudinary confirmed as destroyed (or already absent). */
  purged: number;
  /**
   * Public ids that could not be destroyed. A non-empty list means erasure is
   * incomplete: the caller must record it on the tombstone and retry rather
   * than proceed to delete the rows that name them.
   */
  failed: string[];
  /**
   * URLs that are not destroyable Cloudinary assets (pasted external images).
   * Not a failure — we have no delete authority over them — but counted so the
   * tombstone can show they were seen and consciously skipped.
   */
  skippedExternal: number;
};

function cloudinaryConfigured(): boolean {
  return Boolean(
    env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME &&
    env.NEXT_PUBLIC_CLOUDINARY_API_KEY &&
    env.CLOUDINARY_API_SECRET,
  );
}

/**
 * Every Cloudinary asset reachable from a user's own rows.
 *
 * Scoped to content the user *owns*. Group avatars are deliberately excluded:
 * a group survives its departing member, and destroying its avatar would
 * damage other people's data in the name of erasing this user's.
 */
export async function collectUserAssets(
  userId: string,
): Promise<{ refs: CloudinaryRef[]; skippedExternal: number }> {
  const byId = new Map<string, CloudinaryRef>();
  let skippedExternal = 0;

  const add = (url: string | null | undefined) => {
    if (!url) return;
    const ref = cloudinaryRefFromUrl(url);
    if (!ref) {
      skippedExternal += 1;
      return;
    }
    byId.set(`${ref.resourceType}:${ref.publicId}`, ref);
  };

  // 1. Bookkept assets. `provider: "external"` rows are URLs the user pasted;
  //    we can describe them but must never issue a destroy against someone
  //    else's host, so the local row is dropped without a remote call.
  const assets = await db.query.mediaAssets.findMany({
    where: eq(mediaAssets.userId, userId),
    columns: { provider: true, publicId: true, url: true },
  });
  for (const asset of assets) {
    if (asset.provider !== "cloudinary") {
      skippedExternal += 1;
      continue;
    }
    if (asset.publicId) {
      byId.set(`image:${asset.publicId}`, {
        publicId: asset.publicId,
        resourceType: "image",
      });
      continue;
    }
    // Bookkeeping without a public id (an older row). Fall back to the URL.
    add(asset.url);
  }

  // 2. The URL columns, which are the real inventory.
  const owned = await db.query.recipes.findMany({
    where: eq(recipes.authorId, userId),
    columns: { id: true, coverImageUrl: true },
  });
  for (const recipe of owned) add(recipe.coverImageUrl);

  const recipeIds = owned.map((r) => r.id);
  if (recipeIds.length > 0) {
    const steps = await db.query.recipeSteps.findMany({
      where: inArray(recipeSteps.recipeId, recipeIds),
      columns: { imageUrl: true, videoUrl: true },
    });
    for (const step of steps) {
      add(step.imageUrl);
      add(step.videoUrl);
    }
  }

  const logs = await db.query.cookLogEntries.findMany({
    where: eq(cookLogEntries.userId, userId),
    columns: { photoUrl: true },
  });
  for (const log of logs) add(log.photoUrl);

  const userReviews = await db.query.reviews.findMany({
    where: eq(reviews.userId, userId),
    columns: { photoUrl: true },
  });
  for (const review of userReviews) add(review.photoUrl);

  const userCollections = await db.query.collections.findMany({
    where: eq(collections.userId, userId),
    columns: { coverImageUrl: true },
  });
  for (const collection of userCollections) add(collection.coverImageUrl);

  const [user] = await db
    .select({ avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  add(user?.avatarUrl);

  return { refs: [...byId.values()], skippedExternal };
}

/** Destroy one asset, tolerating "already gone" and retrying transient errors. */
async function destroyWithRetry(ref: CloudinaryRef): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = (await cloudinary.uploader.destroy(ref.publicId, {
        invalidate: true,
        resource_type: ref.resourceType,
      })) as { result?: string };

      // `not found` is the desired end state, reached by a prior partial run or
      // a console deletion. Treat it as success so a retried erasure converges
      // instead of stalling forever on assets that are already gone.
      if (result.result === "ok" || result.result === "not found") return true;
    } catch {
      // Fall through to retry. A network blip must not silently abandon bytes.
    }
  }
  return false;
}

/**
 * Destroy every Cloudinary asset owned by a user.
 *
 * Refuses (rather than partially succeeding) when Cloudinary is unconfigured
 * *and* the user has destroyable assets: proceeding would delete the only
 * records of images that are still live and publicly addressable, which is a
 * worse outcome than a failed deletion the operator can retry.
 */
export async function purgeUserMedia(
  userId: string,
): Promise<MediaPurgeResult> {
  const { refs, skippedExternal } = await collectUserAssets(userId);
  if (refs.length === 0) return { purged: 0, failed: [], skippedExternal };

  if (!cloudinaryConfigured()) throw new Error("MEDIA_PURGE_NOT_CONFIGURED");

  cloudinary.config({
    cloud_name: env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    api_key: env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });

  let purged = 0;
  const failed: string[] = [];

  for (let i = 0; i < refs.length; i += DESTROY_BATCH) {
    const batch = refs.slice(i, i + DESTROY_BATCH);
    const results = await Promise.all(batch.map(destroyWithRetry));
    results.forEach((ok, idx) => {
      if (ok) purged += 1;
      else failed.push(batch[idx]!.publicId);
    });
  }

  return { purged, failed, skippedExternal };
}

/** True when a purge left nothing behind, i.e. the DB delete may proceed. */
export function isPurgeComplete(result: MediaPurgeResult): boolean {
  return result.failed.length === 0;
}

/** Rows whose only remaining purpose was to name now-destroyed bytes. */
export async function deleteUserMediaRows(userId: string): Promise<number> {
  const deleted = await db
    .delete(mediaAssets)
    .where(eq(mediaAssets.userId, userId))
    .returning({ id: mediaAssets.id });
  return deleted.length;
}

/** Exported for the erasure verification assertion. */
export async function countRemainingAssets(userId: string): Promise<number> {
  const rows = await db
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(eq(mediaAssets.userId, userId));
  return rows.length;
}
