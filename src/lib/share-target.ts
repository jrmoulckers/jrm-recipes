/**
 * Helpers for the PWA share target (see `share_target` in app/manifest.ts and
 * the `/import` route). Kept free of any Next/server imports so the URL-picking
 * logic stays easy to unit-test.
 */

function toHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    // Not a parseable URL — ignore.
  }
  return undefined;
}

/**
 * Pull the first usable http(s) URL out of a Web Share payload. Browsers place
 * the link in different fields depending on what was shared (a page → `url`, a
 * highlighted link → `text`, occasionally `title`), so we check each candidate
 * in order and also dig a bare URL out of free-form text. Only http/https is
 * accepted, so `javascript:`/`data:` URIs can't be smuggled into the importer.
 */
export function pickSharedUrl(
  ...candidates: (string | null | undefined)[]
): string | undefined {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;

    const direct = toHttpUrl(trimmed);
    if (direct) return direct;

    const match = /https?:\/\/\S+/i.exec(trimmed);
    const found = match?.[0];
    if (found) {
      const normalized = toHttpUrl(found);
      if (normalized) return normalized;
    }
  }
  return undefined;
}

/** Cloudinary host every uploaded recipe image is served from. */
const CLOUDINARY_HOST = "res.cloudinary.com";

/**
 * Cap on a shared photo we're willing to accept + upload (10 MB). Keeps a
 * hostile or accidental huge share from tying up the upload path; well above a
 * phone camera JPEG/HEIC.
 */
export const SHARED_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Whether a file shared into the POST share target is an image we'll accept.
 * Reads only the `type`/`size` a real `File` exposes so it's trivially
 * unit-testable. Any non-image MIME, empty file, or oversize payload is
 * rejected so the `/import` route degrades gracefully instead of uploading junk.
 */
export function isShareableImage(
  file: { type: string; size: number } | null | undefined,
): boolean {
  if (!file) return false;
  if (!file.type.toLowerCase().startsWith("image/")) return false;
  return file.size > 0 && file.size <= SHARED_IMAGE_MAX_BYTES;
}

/**
 * Validate a cover-image URL handed to the New Recipe editor via `?cover=`.
 * We only ever set it to a Cloudinary `secure_url` we just uploaded, so we
 * accept *only* an https URL on the Cloudinary host — this prevents the query
 * param from being abused to render an arbitrary attacker-chosen image.
 */
export function safeSharedImageUrl(
  value: string | null | undefined,
): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && url.hostname === CLOUDINARY_HOST) {
      return url.toString();
    }
  } catch {
    // Not a parseable URL — ignore.
  }
  return undefined;
}
