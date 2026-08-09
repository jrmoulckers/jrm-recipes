import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { v2 as cloudinary } from "cloudinary";

import { env } from "~/env";
import { db, isDbConfigured } from "~/server/db";
import { decrementUsage, incrementUsage } from "~/server/billing/usage";
import { mediaAssets, type MediaAsset, type User } from "~/server/db/schema";
import { type RecordUploadInput } from "./validation";

/**
 * Write side of the media library (issue #657, epic #655).
 *
 * Ownership is enforced here rather than in the actions layer so every caller —
 * action, route handler, or future job — inherits it. A missing row and a row
 * owned by someone else both surface as `NOT_FOUND`, so this module never acts
 * as an existence oracle for another user's assets.
 */

/** One mebibyte, matching the unit of the `storage_mb` usage metric. */
const BYTES_PER_MB = 1024 * 1024;

/** Whether server-side Cloudinary admin calls (i.e. destroy) are possible. */
function cloudinaryConfigured(): boolean {
  return Boolean(
    env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME &&
    env.NEXT_PUBLIC_CLOUDINARY_API_KEY &&
    env.CLOUDINARY_API_SECRET,
  );
}

/**
 * Record a completed upload against its owner.
 *
 * The upload goes browser→Cloudinary directly, so the success callback is the
 * only moment we learn the asset's public id and byte size. That callback can
 * fire more than once (widget retries, a remount replaying the result), so this
 * upserts on `(userId, publicId)` and only meters storage on a genuinely new
 * row. Without that guard a replayed callback would bill the same bytes twice.
 */
export async function recordUpload(
  input: RecordUploadInput,
  user: User,
): Promise<MediaAsset | null> {
  if (!isDbConfigured()) return null;

  if (input.publicId) {
    const existing = await db.query.mediaAssets.findFirst({
      where: and(
        eq(mediaAssets.userId, user.id),
        eq(mediaAssets.publicId, input.publicId),
        isNull(mediaAssets.deletedAt),
      ),
    });

    if (existing) {
      // Same asset, seen again. Refresh the describable/renderable fields but
      // deliberately do NOT re-meter storage.
      const [updated] = await db
        .update(mediaAssets)
        .set({
          url: input.url,
          altText: input.altText ?? existing.altText,
          width: input.width ?? existing.width,
          height: input.height ?? existing.height,
          bytes: input.bytes ?? existing.bytes,
          format: input.format ?? existing.format,
          folder: input.folder ?? existing.folder,
        })
        .where(eq(mediaAssets.id, existing.id))
        .returning();
      return updated ?? existing;
    }
  }

  const [created] = await db
    .insert(mediaAssets)
    .values({
      userId: user.id,
      provider: input.publicId ? "cloudinary" : "external",
      publicId: input.publicId ?? null,
      url: input.url,
      altText: input.altText ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
      bytes: input.bytes ?? null,
      format: input.format ?? null,
      folder: input.folder ?? null,
    })
    .returning();

  // Only our own uploads consume our Cloudinary quota. A pasted external URL
  // costs us nothing, so it must not count against the user's storage cap.
  if (created && input.publicId && input.bytes && input.bytes > 0) {
    await incrementUsage(
      user,
      "storage_mb",
      Math.ceil(input.bytes / BYTES_PER_MB),
    );
  }

  return created ?? null;
}

/** Load an asset the user owns, or throw `NOT_FOUND`. */
async function requireOwnedAsset(id: string, user: User): Promise<MediaAsset> {
  const asset = await db.query.mediaAssets.findFirst({
    where: and(
      eq(mediaAssets.id, id),
      eq(mediaAssets.userId, user.id),
      isNull(mediaAssets.deletedAt),
    ),
  });
  if (!asset) throw new Error("NOT_FOUND");
  return asset;
}

/** Set or clear an asset's screen-reader description (#125). */
export async function updateAltText(
  id: string,
  altText: string | undefined,
  user: User,
): Promise<MediaAsset> {
  if (!isDbConfigured()) throw new Error("NOT_FOUND");

  const asset = await requireOwnedAsset(id, user);
  const [updated] = await db
    .update(mediaAssets)
    .set({ altText: altText ?? null })
    .where(eq(mediaAssets.id, asset.id))
    .returning();

  return updated ?? asset;
}

/**
 * Delete an asset: destroy the bytes at Cloudinary, tombstone the row, and give
 * the storage allowance back.
 *
 * Rows that still reference the URL are intentionally left alone. A recipe cover
 * keeps rendering from the CDN until that copy expires, and the tag-aware
 * fallback imagery (#594) covers it afterwards — which is a far better outcome
 * than cascading a delete through a user's recipes.
 */
export async function deleteAsset(id: string, user: User): Promise<void> {
  if (!isDbConfigured()) throw new Error("NOT_FOUND");

  const asset = await requireOwnedAsset(id, user);

  if (asset.provider === "cloudinary" && asset.publicId) {
    if (!cloudinaryConfigured()) {
      // We can't destroy the bytes, so refuse rather than tombstone the only
      // record of an asset that still exists and still costs storage.
      throw new Error("NOT_CONFIGURED");
    }

    cloudinary.config({
      cloud_name: env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
      api_key: env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });

    const result = (await cloudinary.uploader.destroy(asset.publicId, {
      invalidate: true,
      resource_type: "image",
    })) as { result?: string };

    // `not found` means the asset is already gone (a prior half-completed
    // delete, or removal in the Cloudinary console). That is the desired end
    // state, so tombstone the row instead of stranding it forever.
    if (result.result !== "ok" && result.result !== "not found") {
      throw new Error("PROVIDER_ERROR");
    }
  }

  await db
    .update(mediaAssets)
    .set({ deletedAt: new Date(), deletedBy: user.id })
    .where(eq(mediaAssets.id, asset.id));

  // Reclaim the allowance. Only metered (Cloudinary) uploads ever incremented
  // it, so only they give anything back.
  if (asset.provider === "cloudinary" && asset.bytes && asset.bytes > 0) {
    await decrementUsage(
      user,
      "storage_mb",
      Math.ceil(asset.bytes / BYTES_PER_MB),
    );
  }
}
