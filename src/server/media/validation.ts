import { z } from "zod";

import { isAllowedMediaUrl } from "~/config/media-hosts";

/**
 * Validation contracts for the media library (issue #657). Shared by the client
 * picker and the server actions so the shape is guaranteed end to end.
 */

const idInput = z.string().trim().min(1).max(24);

/**
 * A stored media URL. Restricted to the delivery-host allowlist (#216) for the
 * same reason recipe media is: these URLs are rendered back to other viewers, so
 * an arbitrary host would let a user beacon viewer IPs to a server they control.
 */
export const mediaUrl = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine(isAllowedMediaUrl, "That image host isn't supported.");

/**
 * Cloudinary public id. Mirrors the sign route's folder charset plus `/` for
 * nesting, so a caller can't smuggle path traversal or a foreign namespace into
 * the id we later hand to `uploader.destroy`. `.` is excluded, so `..` can never
 * appear.
 */
export const mediaPublicId = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(
    /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/,
    "Unsupported image reference.",
  );

/** Alt text. Empty collapses to `undefined`, which clears the column. */
export const mediaAltText = z
  .string()
  .trim()
  .max(300, "Keep the description under 300 characters.")
  .optional()
  .transform((v) => (v == null || v.length === 0 ? undefined : v));

const positiveInt = z.number().int().positive().max(2_000_000_000).optional();

export const recordUploadInput = z.object({
  url: mediaUrl,
  publicId: mediaPublicId.optional(),
  altText: mediaAltText,
  width: positiveInt,
  height: positiveInt,
  bytes: positiveInt,
  format: z
    .string()
    .trim()
    .max(16)
    .regex(/^[a-z0-9]+$/i)
    .optional(),
  folder: z
    .string()
    .trim()
    .max(200)
    .regex(/^heirloom(?:\/[a-zA-Z0-9_-]+)*$/, "Unsupported upload folder.")
    .optional(),
});

export const updateAltTextInput = z.object({
  id: idInput,
  altText: mediaAltText,
});

export const deleteAssetInput = z.object({ id: idInput });

/** Page size for the library grid. Bounded so a caller can't ask for the world. */
export const MEDIA_PAGE_SIZE = 24;
export const MEDIA_MAX_PAGE_SIZE = 60;

export const listAssetsInput = z.object({
  /** `createdAt` of the last row on the previous page, ISO-encoded. */
  cursor: z.string().datetime().optional(),
  limit: z.number().int().positive().max(MEDIA_MAX_PAGE_SIZE).optional(),
});

export type RecordUploadInput = z.infer<typeof recordUploadInput>;
export type UpdateAltTextInput = z.infer<typeof updateAltTextInput>;
export type DeleteAssetInput = z.infer<typeof deleteAssetInput>;
export type ListAssetsInput = z.infer<typeof listAssetsInput>;
