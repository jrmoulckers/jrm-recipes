"use client";

import Image, { type ImageProps } from "next/image";

import { isAllowedMediaUrl } from "~/config/media-hosts";
import { cloudinaryLoader, isCloudinaryUrl } from "~/lib/cloudinary-loader";

/**
 * True when `src` is an absolute `http(s)://` URL, i.e. a remote host the
 * optimizer would have to fetch and validate against `remotePatterns`. Relative
 * asset paths (`/img/…`), data URIs, and blob URLs return `false` so they keep
 * flowing through the built-in optimizer unchanged.
 */
function isRemoteHttpUrl(src: string): boolean {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return false;
  }
  return url.protocol === "https:" || url.protocol === "http:";
}

/**
 * `next/image` that routes Cloudinary-hosted sources through the Cloudinary edge
 * loader (issue #192) while leaving everything else on the default optimizer.
 *
 * When `src` is a `res.cloudinary.com/.../image/upload/` URL we bind the
 * {@link cloudinaryLoader}, so the browser fetches `f_auto,q_auto,c_limit,w_<width>`
 * straight from Cloudinary's CDN instead of proxying an already-optimizable asset
 * through Vercel's `/_next/image`.
 *
 * When `src` is some *other* remote `http(s)` host that is NOT on the media-host
 * allowlist, e.g. a cover/step image imported straight from a recipe's source
 * website via the zero-config paste/import flow, we render `<Image unoptimized>`.
 * `unoptimized` makes next/image skip both the optimizer and its `remotePatterns`
 * validation, so the pasted image *displays* instead of throwing at render time
 * and toppling the recipe page into its `error.tsx` boundary (issue: imported
 * off-allowlist cover image crashes the recipe view).
 *
 * For any remaining source (relative asset, allowlisted host like Clerk avatars,
 * or a static import) we render a plain optimized `<Image>` so it keeps using the
 * built-in optimizer exactly as before. No behavior change and no "loader does
 * not implement width" warning for the pass-through case.
 *
 * It's a thin Client Component because next/image needs the function `loader`
 * prop bound on the client. The underlying `<img>` still server-renders and still
 * emits the LCP preload when `priority` is set.
 */
export function CloudinaryImage({ src, alt, ...rest }: ImageProps) {
  if (typeof src === "string") {
    if (isCloudinaryUrl(src)) {
      return <Image loader={cloudinaryLoader} src={src} alt={alt} {...rest} />;
    }
    if (isRemoteHttpUrl(src) && !isAllowedMediaUrl(src)) {
      return <Image unoptimized src={src} alt={alt} {...rest} />;
    }
  }
  return <Image src={src} alt={alt} {...rest} />;
}
