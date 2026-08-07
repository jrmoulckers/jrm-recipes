"use client";

import { useState } from "react";
import { type ImageProps } from "next/image";

import {
  recipeFallbackImage,
  type RecipeFallbackContext,
} from "~/lib/recipe-image-fallback";
import { cn } from "~/lib/utils";
import { CloudinaryImage } from "~/components/ui/cloudinary-image";

type RecipeImageProps = Omit<ImageProps, "src"> & {
  src?: string | null;
  fallbackKey: string;
  fallbackContext?: RecipeFallbackContext;
  fallbackMode?: "editorial" | "hide";
};

/**
 * Recipe image that supplies a stable local cover default or hides unavailable
 * instructional media, depending on its visual role.
 */
export function RecipeImage({
  src,
  fallbackKey,
  fallbackContext,
  fallbackMode = "editorial",
  className,
  onError,
  unoptimized,
  ...props
}: RecipeImageProps) {
  const candidateSrc = src?.trim() ?? "";
  const normalizedSrc = isRenderableImageSrc(candidateSrc)
    ? candidateSrc
    : null;
  const fallbackSrc = recipeFallbackImage(fallbackKey, fallbackContext);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const unavailable = !normalizedSrc || normalizedSrc === failedSrc;
  if (unavailable && fallbackMode === "hide") return null;

  const resolvedSrc = unavailable ? fallbackSrc : normalizedSrc;
  const isFallback = unavailable;

  return (
    <CloudinaryImage
      {...props}
      src={resolvedSrc}
      className={cn(className, isFallback && "scale-[1.02] blur-[1px]")}
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
