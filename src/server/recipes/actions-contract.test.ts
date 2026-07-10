import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Functional-contract tests for the recipe Server Action layer (issue #227):
 * the DB-configured guard, Zod field-error mapping, friendly error-message
 * translation (incl. BAD_SNAPSHOT), the createAdaptation → fork delegation, and
 * deleteRecipe's swallow-NOT_FOUND → revalidate → redirect. Cross-tenant authz
 * is out of scope here (owned by #219). Everything below the action seam is
 * mocked so we exercise only the action's own branching.
 */

const {
  isDbConfiguredMock,
  requireUserMock,
  redirectMock,
  revalidatePathMock,
  revalidateTagMock,
  checkRateLimitMock,
  getLimitStatusMock,
  isAnalyticsConfiguredMock,
  createRecipeMock,
  updateRecipeMock,
  forkRecipeMock,
  revertRecipeMock,
  deleteRecipeMock,
  importRecipeFromUrlMock,
} = vi.hoisted(() => ({
  isDbConfiguredMock: vi.fn(),
  requireUserMock: vi.fn(),
  redirectMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  revalidateTagMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  getLimitStatusMock: vi.fn(),
  isAnalyticsConfiguredMock: vi.fn(),
  createRecipeMock: vi.fn(),
  updateRecipeMock: vi.fn(),
  forkRecipeMock: vi.fn(),
  revertRecipeMock: vi.fn(),
  deleteRecipeMock: vi.fn(),
  importRecipeFromUrlMock: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
  revalidateTag: revalidateTagMock,
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("~/server/auth", () => ({ requireUser: requireUserMock }));
vi.mock("~/server/db", () => ({
  isDbConfigured: isDbConfiguredMock,
  db: { $count: vi.fn().mockResolvedValue(2) },
}));
vi.mock("~/server/db/schema", () => ({ recipes: { authorId: {} } }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(() => ({})) }));
vi.mock("~/lib/analytics/config", () => ({
  isAnalyticsConfigured: isAnalyticsConfiguredMock,
}));
vi.mock("~/lib/analytics/server", () => ({ captureServer: vi.fn() }));
vi.mock("~/server/billing/entitlements", () => ({
  getLimitStatus: getLimitStatusMock,
}));
vi.mock("~/server/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  RATE_LIMITED_MESSAGE: "Too many requests. Please slow down.",
}));
vi.mock("./import", () => ({ importRecipeFromUrl: importRecipeFromUrlMock }));
vi.mock("./mutations", () => ({
  createRecipe: createRecipeMock,
  updateRecipe: updateRecipeMock,
  forkRecipe: forkRecipeMock,
  revertRecipe: revertRecipeMock,
  deleteRecipe: deleteRecipeMock,
  restoreRecipe: vi.fn(),
  setShareLinkState: vi.fn(),
}));
vi.mock("./queries", () => ({
  getRecipeVersion: vi.fn(),
  parseSnapshot: vi.fn(),
}));
vi.mock("./loaders", () => ({ getRecipeForViewer: vi.fn() }));

import {
  createAdaptationAction,
  createRecipeAction,
  deleteRecipeAction,
  forkRecipeAction,
  importRecipeFromUrlAction,
  revertRecipeAction,
} from "./actions";
import { NEEDS_DATABASE } from "~/server/action";
import { DomainError } from "~/server/errors";
import { recipeInput } from "./validation";

const validInput = recipeInput.parse({ title: "Apple Pie" });

beforeEach(() => {
  vi.clearAllMocks();
  isDbConfiguredMock.mockReturnValue(true);
  requireUserMock.mockResolvedValue({ id: "user_1" });
  checkRateLimitMock.mockReturnValue({ ok: true });
  isAnalyticsConfiguredMock.mockReturnValue(false);
  getLimitStatusMock.mockResolvedValue({ state: "ok", limit: 50 });
});

describe("DB-not-configured guard (NO_DB)", () => {
  it("createRecipeAction returns NEEDS_DATABASE and never touches mutations", async () => {
    isDbConfiguredMock.mockReturnValue(false);

    const res = await createRecipeAction(validInput);

    expect(res).toEqual({ ok: false, error: NEEDS_DATABASE });
    expect(createRecipeMock).not.toHaveBeenCalled();
    expect(requireUserMock).not.toHaveBeenCalled();
  });

  it("forkRecipeAction and revertRecipeAction short-circuit with NEEDS_DATABASE", async () => {
    isDbConfiguredMock.mockReturnValue(false);

    expect(await forkRecipeAction("r1")).toEqual({
      ok: false,
      error: NEEDS_DATABASE,
    });
    expect(await revertRecipeAction("r1", 1)).toEqual({
      ok: false,
      error: NEEDS_DATABASE,
    });
    expect(forkRecipeMock).not.toHaveBeenCalled();
    expect(revertRecipeMock).not.toHaveBeenCalled();
  });

  it("deleteRecipeAction is a no-op (no redirect) with no database", async () => {
    isDbConfiguredMock.mockReturnValue(false);

    await deleteRecipeAction("r1");

    expect(deleteRecipeMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe("invalid input → field errors", () => {
  it("maps a Zod failure to the standard message + fieldErrors, skipping the mutation", async () => {
    const res = await createRecipeAction({ title: "" } as never);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("Please fix the highlighted fields.");
      expect(res.fieldErrors?.title).toBeDefined();
    }
    expect(createRecipeMock).not.toHaveBeenCalled();
    expect(requireUserMock).not.toHaveBeenCalled();
  });
});

describe("error-message mapping", () => {
  it("maps BAD_SNAPSHOT to the restore-specific copy", async () => {
    revertRecipeMock.mockRejectedValue(new DomainError("BAD_SNAPSHOT"));

    const res = await revertRecipeAction("r1", 2);

    expect(res).toEqual({
      ok: false,
      error: "That saved version can't be restored.",
    });
  });

  it("falls back to a generic restore message for an unknown error", async () => {
    revertRecipeMock.mockRejectedValue(new Error("boom"));

    const res = await revertRecipeAction("r1", 2);

    expect(res).toEqual({
      ok: false,
      error: "We couldn't restore that recipe version.",
    });
  });

  it("maps a fork failure to the adapt-not-found message", async () => {
    forkRecipeMock.mockRejectedValue(new DomainError("NOT_FOUND"));

    const res = await forkRecipeAction("r1");

    expect(res).toEqual({
      ok: false,
      error: "We couldn't find that recipe to adapt.",
    });
  });
});

describe("createAdaptationAction delegation", () => {
  it("delegates to the fork path with the source id and note", async () => {
    forkRecipeMock.mockResolvedValue({
      id: "fork_1",
      slug: "apple-pie-adaptation",
      source: { id: "r1", slug: "apple-pie" },
    });

    const res = await createAdaptationAction("r1", "riffed on Nana's");

    expect(forkRecipeMock).toHaveBeenCalledWith(
      "r1",
      { id: "user_1" },
      "riffed on Nana's",
    );
    expect(res).toEqual({
      ok: true,
      id: "fork_1",
      slug: "apple-pie-adaptation",
    });
  });
});

describe("deleteRecipeAction", () => {
  it("swallows a NOT_FOUND, still revalidates, and redirects to /recipes", async () => {
    deleteRecipeMock.mockRejectedValue(new DomainError("NOT_FOUND"));

    await deleteRecipeAction("r1");

    expect(revalidatePathMock).toHaveBeenCalledWith("/recipes");
    expect(redirectMock).toHaveBeenCalledWith("/recipes");
  });

  it("redirects to /recipes on a successful delete", async () => {
    deleteRecipeMock.mockResolvedValue({ id: "r1" });

    await deleteRecipeAction("r1");

    expect(deleteRecipeMock).toHaveBeenCalledWith("r1", { id: "user_1" });
    expect(redirectMock).toHaveBeenCalledWith("/recipes");
  });
});

describe("importRecipeFromUrlAction", () => {
  it("requires a user and delegates to importRecipeFromUrl", async () => {
    importRecipeFromUrlMock.mockResolvedValue({ ok: true, data: {} });

    const res = await importRecipeFromUrlAction("https://example.com/r");

    expect(requireUserMock).toHaveBeenCalled();
    expect(importRecipeFromUrlMock).toHaveBeenCalledWith(
      "https://example.com/r",
    );
    expect(res).toEqual({ ok: true, data: {} });
  });

  it("is rate-limited before fetching", async () => {
    checkRateLimitMock.mockReturnValue({ ok: false });

    const res = await importRecipeFromUrlAction("https://example.com/r");

    expect(res.ok).toBe(false);
    expect(importRecipeFromUrlMock).not.toHaveBeenCalled();
  });
});
