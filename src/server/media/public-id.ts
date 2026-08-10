/**
 * Recover a Cloudinary public id from a delivery URL (issue #678).
 *
 * `media_assets` is deliberately *additive* (see the header of
 * `~/server/db/schema/media`): the URL columns stay authoritative for rendering
 * and an asset row is best-effort bookkeeping. Pre-existing photos and uploads
 * whose bookkeeping call failed therefore have no `publicId` recorded anywhere.
 *
 * That is tolerable for storage accounting and intolerable for erasure: an
 * asset we cannot name is an asset we cannot destroy, and it would stay live on
 * the CDN forever after the account that owns it is gone. So erasure sweeps the
 * URL columns too and re-derives the public id from the URL itself.
 *
 * Deliberately pure and dependency-free so it can be unit-tested against the
 * real URL shapes without a Cloudinary account.
 */

const CLOUDINARY_HOST = 'res.cloudinary.com';

/** Delivery types whose bytes we may destroy. */
const RESOURCE_TYPES = new Set(['image', 'video', 'raw']);

/**
 * A transformation segment, e.g. `f_auto,q_auto,c_limit,w_640`. Cloudinary
 * transforms are comma-joined `key_value` pairs, which no real public id
 * segment of ours looks like (`mediaPublicId` allows `[A-Za-z0-9_/-]`, so a
 * public-id segment never contains a comma).
 */
function isTransformSegment(segment: string): boolean {
  return segment.includes(',') && /^[a-z]{1,3}_/.test(segment);
}

/** A version marker, e.g. `v1699999999`. Not part of the public id. */
function isVersionSegment(segment: string): boolean {
  return /^v\d+$/.test(segment);
}

export type CloudinaryRef = {
  publicId: string;
  resourceType: 'image' | 'video' | 'raw';
};

/**
 * Parse a Cloudinary delivery URL into the arguments `uploader.destroy` needs,
 * or null when the URL is not a destroyable Cloudinary asset.
 *
 * Returns null (rather than guessing) for anything we have no delete authority
 * over — other hosts, non-`upload` delivery types such as `fetch`/`twitter`
 * which are remote-sourced, and unrecognised shapes. Guessing here would mean
 * issuing a destroy against an id we invented, which at best no-ops and at
 * worst deletes an unrelated asset.
 */
export function cloudinaryRefFromUrl(raw: string): CloudinaryRef | null {
  // Check the *raw* string before parsing. `new URL` resolves `..` segments
  // away, so `…/upload/v1/heirloom/../other/a.jpg` would parse cleanly into the
  // public id `other/a` — a crafted stored URL silently retargeting a destroy at
  // a different folder. `mediaPublicId` rejects `..` on write for the same
  // reason; these URLs predate that validation, so re-check here. Percent-encoded
  // forms are caught by decoding first.
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (decoded.includes('..')) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.hostname !== CLOUDINARY_HOST) return null;

  // /<cloud>/<resourceType>/<deliveryType>/[transforms]/[vN]/<publicId>.<ext>
  const parts = url.pathname.split('/').filter(Boolean);
  const uploadIdx = parts.indexOf('upload');
  if (uploadIdx < 2) return null;

  const resourceType = parts[uploadIdx - 1];
  if (!resourceType || !RESOURCE_TYPES.has(resourceType)) return null;

  const rest = parts
    .slice(uploadIdx + 1)
    .filter((s) => !isTransformSegment(s) && !isVersionSegment(s));
  if (rest.length === 0) return null;

  const publicId = decodeURIComponent(rest.join('/')).replace(/\.[A-Za-z0-9]{1,8}$/, '');
  if (publicId.length === 0) return null;
  if (publicId.includes('..') || publicId.startsWith('/')) return null;

  return {
    publicId,
    resourceType: resourceType as CloudinaryRef['resourceType'],
  };
}
