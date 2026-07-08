import type { ImageLoaderProps } from "next/image";

const CLOUDINARY_HOST = "res.cloudinary.com";
const UPLOAD_SEGMENT = "/image/upload/";

/**
 * True when `src` is a Cloudinary image-delivery URL we can rewrite. We only
 * touch the `/image/upload/` delivery type; anything else (other hosts, other
 * delivery types, relative/pasted URLs) is left for the default optimizer.
 */
export function isCloudinaryUrl(src: string): boolean {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return false;
  }
  return (
    url.hostname === CLOUDINARY_HOST && url.pathname.includes(UPLOAD_SEGMENT)
  );
}

/**
 * A `next/image` loader that offloads format/quality/width negotiation to
 * Cloudinary's edge — `f_auto,q_auto,c_limit,w_<width>` — instead of proxying
 * the (already-optimizable) asset through Vercel's `/_next/image` optimizer.
 * This removes a proxy hop in front of the LCP image and stops burning image
 * optimization quota on assets Cloudinary can serve more cheaply.
 *
 * `c_limit` never upscales past the source; `w_<width>` threads next/image's
 * responsive width in so the `srcset` stays correct. Non-Cloudinary URLs are
 * returned untouched so Clerk avatars and pasted image URLs are unaffected.
 */
export function cloudinaryLoader({
  src,
  width,
  quality,
}: ImageLoaderProps): string {
  if (!isCloudinaryUrl(src)) return src;

  const url = new URL(src);
  // Insert transforms right after the first `/image/upload/` segment, preserving
  // any version (`v123…`) and the full public-id path (which may contain `/`).
  const idx = url.pathname.indexOf(UPLOAD_SEGMENT);
  const head = url.pathname.slice(0, idx);
  const tail = url.pathname.slice(idx + UPLOAD_SEGMENT.length);
  const transforms = `f_auto,q_${quality ?? "auto"},c_limit,w_${width}`;
  url.pathname = `${head}${UPLOAD_SEGMENT}${transforms}/${tail}`;
  return url.toString();
}
