import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * `src/app/sw.ts` is compiled by Serwist's webpack loader against the WebWorker
 * lib and runs service-worker globals at module load, so it can't be imported
 * into the jsdom test environment. We assert on its source instead to lock in
 * the recipe-page caching strategy.
 *
 * This guards a real cross-user privacy regression: recipe detail + Cook Mode
 * pages are server-rendered per viewer and access-controlled (a private/group
 * recipe 404s for a viewer who can't see it, and the HTML embeds personalized
 * state + owner-only controls). The recipe-page runtime cache is keyed only by
 * URL, so a StaleWhileRevalidate (cache-then-network) strategy could serve one
 * user's authorized private page to another user on a shared browser profile.
 * It must stay NetworkFirst — fresh, correctly-authorized content whenever
 * there's a network, cache only as an offline fallback.
 */
const swSource = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "sw.ts"),
  "utf8",
);

function recipePageCacheBlock(source: string): string {
  const match = /const recipePageCache:[\s\S]*?\n};/.exec(source);
  if (!match) {
    throw new Error("recipePageCache declaration not found in src/app/sw.ts");
  }
  return match[0];
}

describe("recipe-page runtime cache strategy", () => {
  it("uses NetworkFirst, never StaleWhileRevalidate, for per-viewer recipe pages", () => {
    const block = recipePageCacheBlock(swSource);
    expect(block).toContain("new NetworkFirst(");
    expect(block).not.toContain("StaleWhileRevalidate");
  });

  it("still stores only successful responses and bounds the cache", () => {
    const block = recipePageCacheBlock(swSource);
    expect(block).toContain("CacheableResponsePlugin");
    expect(block).toContain("ExpirationPlugin");
  });
});
