"use client";

import { useState } from "react";
import { type ImageProps } from "next/image";

import { recipeFallbackImage } from "~/lib/recipe-image-fallback";
import { CloudinaryImage } from "~/components/ui/cloudinary-image";

type RecipeImageProps = Omit<ImageProps, "src"> & {
  src?: string | null;
  fallbackKey: string;
  fallbackMode?: "editorial" | "hide";
};

/**
 * Recipe image that supplies a stable local cover default or hides unavailable
 * instructional media, depending on its visual role.
 */
export function RecipeImage({
  src,
  fallbackKey,
  fallbackMode = "editorial",
  onError,
  unoptimized,
  ...props
}: RecipeImageProps) {
  const candidateSrc = src?.trim() ?? "";
  const normalizedSrc = isRenderableImageSrc(candidateSrc)
    ? candidateSrc
    : null;
  const fallbackSrc = recipeFallbackImage(fallbackKey);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const unavailable = !normalizedSrc || normalizedSrc === failedSrc;
  if (unavailable && fallbackMode === "hide") return null;

  const resolvedSrc = unavailable ? fallbackSrc : normalizedSrc;
  const isFallback = resolvedSrc === fallbackSrc;

  return (
    <CloudinaryImage
      {...props}
      src={resolvedSrc}
      {...(isFallback || unoptimized ? { unoptimized: true } : {})}
      data-fallback={isFallback ? "" : undefined}
      onError={(event) => {
        onError?.(event);
        if (!isFallback && normalizedSrc) setFailedSrc(normalizedSrc);
      }}
    />
  );
}

function isRenderableImageSrc(src: string): boolean {
  if (src.startsWith("/")) return true;
  try {
    const url = new URL(src);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
