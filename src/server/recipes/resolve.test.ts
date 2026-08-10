import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ReactModule from "react";

vi.mock("server-only", () => ({}));

const { dbMock, resolveUserSlugMock } = vi.hoisted(() => ({
  dbMock: {
    query: {
      recipes: { findFirst: vi.fn() },
      recipeSlugAliases: { findFirst: vi.fn() },
      recipeCreators: { findFirst: vi.fn() },
    },
  },
  resolveUserSlugMock: vi.fn(),
}));

vi.mock("~/server/db", () => ({ db: dbMock, isDbConfigured: () => true }));
vi.mock("~/server/users/slug", () => ({
  resolveUserSlug: resolveUserSlugMock,
}));
// `cache()` memoizes per-request; outside a request it would leak state across
// these cases, so it is reduced to a pass-through here.
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof ReactModule>("react");
  return { ...actual, cache: <T>(fn: T) => fn };
});

import { resolveFlatRecipe, resolveNamespacedRecipe } from "./resolve";

const owner = { userId: "usr_ada", redirect: false };

beforeEach(() => {
  vi.clearAllMocks();
  resolveUserSlugMock.mockResolvedValue(owner);
  dbMock.query.recipes.findFirst.mockResolvedValue(undefined);
  dbMock.query.recipeSlugAliases.findFirst.mockResolvedValue(undefined);
  dbMock.query.recipeCreators.findFirst.mockResolvedValue(undefined);
});

describe("resolveNamespacedRecipe", () => {
  it("resolves a live slug in the owner's namespace as canonical", async () => {
    dbMock.query.recipes.findFirst.mockResolvedValueOnce({ id: "rec_1" });

    await expect(resolveNamespacedRecipe("ada", "apple-pie")).resolves.toEqual({
      recipeId: "rec_1",
      disposition: "canonical",
    });
    expect(dbMock.query.recipeSlugAliases.findFirst).not.toHaveBeenCalled();
  });

  it("marks a live slug reached through a retired user slug as non-canonical", async () => {
    resolveUserSlugMock.mockResolvedValue({ ...owner, redirect: true });
    dbMock.query.recipes.findFirst.mockResolvedValueOnce({ id: "rec_1" });

    await expect(
      resolveNamespacedRecipe("ada-old", "apple-pie"),
    ).resolves.toEqual({ recipeId: "rec_1", disposition: "alias" });
  });

  it("prefers a live slug over an alias holding the same segment", async () => {
    // A slug retired by one recipe and later re-issued to another must resolve
    // to the current holder, never silently redirect to the old content (#666).
    dbMock.query.recipes.findFirst.mockResolvedValueOnce({ id: "rec_live" });
    dbMock.query.recipeSlugAliases.findFirst.mockResolvedValue({
      recipeId: "rec_old",
    });

    await expect(resolveNamespacedRecipe("ada", "apple-pie")).resolves.toEqual({
      recipeId: "rec_live",
      disposition: "canonical",
    });
  });

  it("falls back to a retired recipe slug as a redirect", async () => {
    dbMock.query.recipeSlugAliases.findFirst.mockResolvedValueOnce({
      recipeId: "rec_1",
    });

    await expect(resolveNamespacedRecipe("ada", "apple-tart")).resolves.toEqual(
      {
        recipeId: "rec_1",
        disposition: "alias",
      },
    );
  });

  it("resolves an id in the recipe position, but never as canonical", async () => {
    dbMock.query.recipes.findFirst
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: "rec_1" });

    await expect(resolveNamespacedRecipe("ada", "rec_1")).resolves.toEqual({
      recipeId: "rec_1",
      disposition: "alias",
    });
  });

  it("resolves a co-creator's namespace as a mirror, not a redirect (#668)", async () => {
    // The recipe answers inside John's namespace because he accepted an
    // invitation. It renders in place with rel=canonical pointing at the
    // owner's path — a 308 here would take the creator off their own URL.
    dbMock.query.recipeCreators.findFirst.mockResolvedValueOnce({
      recipeId: "rec_1",
    });

    await expect(resolveNamespacedRecipe("john", "apple-pie")).resolves.toEqual(
      {
        recipeId: "rec_1",
        disposition: "mirror",
      },
    );
    // Mirrors are found before aliases are consulted.
    expect(dbMock.query.recipeSlugAliases.findFirst).not.toHaveBeenCalled();
  });

  it("prefers the namespace holder's own live recipe over a creator entry", async () => {
    // Allocation makes this state unreachable (both occupy one namespace under
    // one lock). If it ever occurred, the URL must stay with the recipe the
    // namespace holder actually owns.
    dbMock.query.recipes.findFirst.mockResolvedValueOnce({ id: "rec_own" });
    dbMock.query.recipeCreators.findFirst.mockResolvedValue({
      recipeId: "rec_other",
    });

    await expect(resolveNamespacedRecipe("john", "apple-pie")).resolves.toEqual(
      {
        recipeId: "rec_own",
        disposition: "canonical",
      },
    );
  });

  it("degrades a creator mirror reached through a retired user slug to a redirect", async () => {
    resolveUserSlugMock.mockResolvedValue({ ...owner, redirect: true });
    dbMock.query.recipeCreators.findFirst.mockResolvedValueOnce({
      recipeId: "rec_1",
    });

    await expect(
      resolveNamespacedRecipe("john-old", "apple-pie"),
    ).resolves.toEqual({ recipeId: "rec_1", disposition: "alias" });
  });

  it("filters creator lookups to accepted rows, so a pending invite resolves nothing", async () => {
    await expect(
      resolveNamespacedRecipe("john", "apple-pie"),
    ).resolves.toBeNull();

    const call = dbMock.query.recipeCreators.findFirst.mock.calls[0]?.[0] as {
      where: unknown;
    };
    // The predicate is a drizzle SQL tree (self-referential, so it can't be
    // serialized); collect the bound parameter values out of it instead.
    const params: unknown[] = [];
    const seen = new Set<unknown>();
    const walk = (node: unknown): void => {
      if (node === null || typeof node !== "object" || seen.has(node)) return;
      seen.add(node);
      const record = node as Record<string, unknown>;
      if ("value" in record && !("table" in record)) params.push(record.value);
      const chunks = record.queryChunks;
      if (Array.isArray(chunks)) chunks.forEach(walk);
    };
    walk(call.where);
    expect(params).toContain("accepted");
  });

  it("returns null for an unknown cook without querying recipes", async () => {
    resolveUserSlugMock.mockResolvedValue(null);

    await expect(
      resolveNamespacedRecipe("nobody", "apple-pie"),
    ).resolves.toBeNull();
    expect(dbMock.query.recipes.findFirst).not.toHaveBeenCalled();
  });

  it("rejects empty and oversized segments before touching the database", async () => {
    await expect(resolveNamespacedRecipe("", "apple-pie")).resolves.toBeNull();
    await expect(
      resolveNamespacedRecipe("ada", "x".repeat(129)),
    ).resolves.toBeNull();
    expect(resolveUserSlugMock).not.toHaveBeenCalled();
  });

  /**
   * Freed slugs after account erasure (#678).
   *
   * Erasure deletes the departing user's `users` row and every `user_slug_alias`
   * they held, so their namespace becomes claimable by anyone. The product owner
   * accepted that risk over reserving the slug forever. What is NOT accepted is
   * an old link *drifting* into somebody else's content by a fuzzy or global
   * fallback, so these pin the resolver's exact-match behaviour.
   */
  describe("after the namespace holder is erased", () => {
    it("404s an old link instead of falling back to a global slug lookup", async () => {
      // Nobody holds `nonna` any more: the row and its aliases are gone.
      resolveUserSlugMock.mockResolvedValue(null);

      await expect(
        resolveNamespacedRecipe("nonna", "blueberry-muffins"),
      ).resolves.toBeNull();

      // The critical part: it must not degrade to "find *any* recipe called
      // blueberry-muffins", which is exactly how a shared link would land on a
      // stranger's recipe.
      expect(dbMock.query.recipes.findFirst).not.toHaveBeenCalled();
      expect(dbMock.query.recipeSlugAliases.findFirst).not.toHaveBeenCalled();
      expect(dbMock.query.recipeCreators.findFirst).not.toHaveBeenCalled();
    });

    it("does not serve a same-named recipe from a different namespace", async () => {
      // A *different* cook still holds `blueberry-muffins`. The erased cook's
      // segment no longer resolves, so that must not help.
      resolveUserSlugMock.mockResolvedValue(null);
      dbMock.query.recipes.findFirst.mockResolvedValue({ id: "rec_someone" });

      await expect(
        resolveNamespacedRecipe("nonna", "blueberry-muffins"),
      ).resolves.toBeNull();
    });

    it("scopes every probe to the resolved namespace holder, never a bare slug", async () => {
      // The slug has been re-claimed by somebody else. Serving *their* recipe is
      // the accepted residual risk; serving it under the old owner's identity
      // would not be. Assert each probe carries the new holder's id, so the
      // result is unambiguously the new namespace and never a cross-namespace
      // match.
      resolveUserSlugMock.mockResolvedValue({
        userId: "usr_newholder",
        redirect: false,
      });
      dbMock.query.recipes.findFirst.mockResolvedValueOnce({ id: "rec_new" });

      await expect(
        resolveNamespacedRecipe("nonna", "blueberry-muffins"),
      ).resolves.toEqual({ recipeId: "rec_new", disposition: "canonical" });

      const params: unknown[] = [];
      const walk = (node: unknown) => {
        if (!node || typeof node !== "object") return;
        const record = node as Record<string, unknown>;
        if ("value" in record && !("table" in record))
          params.push(record.value);
        const chunks = record.queryChunks;
        if (Array.isArray(chunks)) chunks.forEach(walk);
      };
      const call = dbMock.query.recipes.findFirst.mock.calls[0]?.[0] as {
        where: unknown;
      };
      walk(call.where);
      expect(params).toContain("usr_newholder");
      expect(params).not.toContain("usr_ada");
    });
  });
});

describe("resolveFlatRecipe", () => {
  it("resolves a bare id", async () => {
    dbMock.query.recipes.findFirst.mockResolvedValueOnce({ id: "rec_1" });

    await expect(resolveFlatRecipe("rec_1")).resolves.toEqual({
      recipeId: "rec_1",
      disposition: "alias",
    });
  });

  it("resolves a pre-namespacing slug through its seeded legacy alias", async () => {
    dbMock.query.recipeSlugAliases.findFirst.mockResolvedValueOnce({
      recipeId: "rec_1",
    });

    await expect(resolveFlatRecipe("apple-pie")).resolves.toEqual({
      recipeId: "rec_1",
      disposition: "alias",
    });
  });

  it("falls back to the oldest live holder of the slug", async () => {
    dbMock.query.recipes.findFirst
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: "rec_2" });

    await expect(resolveFlatRecipe("apple-pie")).resolves.toEqual({
      recipeId: "rec_2",
      disposition: "alias",
    });
  });

  it("never reports a flat URL as canonical", async () => {
    dbMock.query.recipes.findFirst.mockResolvedValueOnce({ id: "rec_1" });

    const resolved = await resolveFlatRecipe("rec_1");
    expect(resolved?.disposition).toBe("alias");
  });

  it("returns null when nothing matches", async () => {
    await expect(resolveFlatRecipe("ghost")).resolves.toBeNull();
  });
});
