import { env } from "~/env";

/**
 * The tiny part of the media picker (#656) that callers need *before* deciding
 * whether to load the picker at all. Kept in its own module so importing it
 * never drags in the dialog, the photo grid, or the Cloudinary widget — those
 * must stay in the lazily-loaded chunk (#201).
 */

/** A photo chosen in the picker. `assetId` is null for a pasted link. */
export type MediaSelection = { url: string; assetId: string | null };

/**
 * Cloudinary is optional. When it isn't configured there is nothing to upload
 * and nothing to store, so image fields degrade to a plain URL input (mirrors
 * the optional-auth / optional-db design elsewhere in the app).
 */
export const cloudinaryConfigured = Boolean(
  env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME && env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
);
