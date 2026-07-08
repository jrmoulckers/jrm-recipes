"use client";

import Image, { type ImageProps } from "next/image";

import { cloudinaryLoader, isCloudinaryUrl } from "~/lib/cloudinary-loader";

/**
 * `next/image` that routes Cloudinary-hosted sources through the Cloudinary edge
 * loader (issue #192) while leaving everything else on the default optimizer.
 *
 * When `src` is a `res.cloudinary.com/.../image/upload/` URL we bind the
 * {@link cloudinaryLoader}, so the browser fetches `f_auto,q_auto,c_limit,w_<width>`
 * straight from Cloudinary's CDN instead of proxying an already-optimizable asset
 * through Vercel's `/_next/image`. For any other source (relative asset, pasted
 * URL, Clerk avatar, or a static import) we render a plain `<Image>` so it keeps
 * using the built-in optimizer exactly as before — no behavior change and no
 * "loader does not implement width" warning for the pass-through case.
 *
 * It's a thin Client Component because next/image needs the function `loader`
 * prop bound on the client; the underlying `<img>` still server-renders and still
 * emits the LCP preload when `priority` is set.
 */
export function CloudinaryImage({ src, alt, ...rest }: ImageProps) {
  if (typeof src === "string" && isCloudinaryUrl(src)) {
    return <Image loader={cloudinaryLoader} src={src} alt={alt} {...rest} />;
  }
  return <Image src={src} alt={alt} {...rest} />;
}
