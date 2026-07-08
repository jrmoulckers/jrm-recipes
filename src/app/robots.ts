import type { MetadataRoute } from "next";

import { absoluteUrl } from "~/lib/utils";

/**
 * robots.txt (issue #323): let crawlers reach public content (recipes, discover,
 * cook profiles) while keeping app-only, immersive, editor and private-action
 * routes out of the index, and point crawlers at the dynamic sitemap. Private
 * recipes already 404 for anonymous visitors and the sitemap only lists public
 * ones, so this is defense in depth rather than the sole guard.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/import",
        "/~offline",
        "/design",
        "/recipes/new",
        "/recipes/cook-with",
        "/recipes/*/edit",
        "/recipes/*/cook",
        "/recipes/*/print",
        "/settings",
        "/plan",
        "/shopping",
        "/journal",
      ],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/"),
  };
}
