"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { cloudinaryLoader } from "~/lib/cloudinary-loader";
import {
  buildWarmCookBundleMessage,
  cookImageUrlsToWarm,
  cookPagePath,
} from "~/lib/cook-warm";

/**
 * Invisible, best-effort warmer for the offline Cook Mode bundle (issue #166).
 *
 * Mounted on the recipe detail page. Once the browser is idle it:
 *  1. prefetches the Cook route's RSC data into the Next router cache, and
 *  2. asks the active service worker to precache the Cook document + the exact
 *     step-image URLs THIS device will request (computed with the same
 *     Cloudinary loader the UI uses) into the existing named caches.
 *
 * So opening a recipe, dropping offline, then tapping "Cook" still works end to
 * end. Everything is wrapped so it never blocks navigation or surfaces an error
 * (offline, no service worker, or an unsupported API).
 */
export function CookBundleWarmer({
  slug,
  imageSrcs,
}: {
  slug: string;
  imageSrcs: string[];
}) {
  const router = useRouter();

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    const run = () => {
      if (cancelled) return;

      try {
        router.prefetch(cookPagePath(slug));
      } catch {
        // Prefetch is a bonus; ignore failures.
      }

      try {
        const controller = navigator.serviceWorker?.controller;
        if (!controller) return;
        const imageUrls = cookImageUrlsToWarm(
          imageSrcs,
          window.innerWidth,
          window.devicePixelRatio,
          (src, width) => cloudinaryLoader({ src, width }),
        );
        controller.postMessage(buildWarmCookBundleMessage({ slug, imageUrls }));
      } catch {
        // Warming is best-effort; never surface an error to the cook.
      }
    };

    const idleHandle =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(run)
        : undefined;
    const timeoutHandle =
      idleHandle === undefined ? setTimeout(run, 1200) : undefined;

    return () => {
      cancelled = true;
      if (
        idleHandle !== undefined &&
        typeof window.cancelIdleCallback === "function"
      ) {
        window.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    };
  }, [router, slug, imageSrcs]);

  return null;
}
