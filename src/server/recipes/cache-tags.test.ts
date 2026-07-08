import { describe, expect, it } from "vitest";

import {
  PUBLIC_RECIPES_TAG,
  recipeMutationTags,
  recipeTag,
} from "./cache-tags";

describe("recipe cache tags (#160)", () => {
  it("namespaces a single recipe entity by id", () => {
    expect(recipeTag("rec_1")).toBe("recipe:rec_1");
  });

  it("produces the entity + public list tag set for a mutation", () => {
    // This is the exact set recipe create/update/delete/fork/revert/restore
    // invalidate via revalidateTag — the entity itself and the public feed.
    expect(recipeMutationTags("rec_1")).toEqual(["recipe:rec_1", PUBLIC_RECIPES_TAG]);
  });

  it("keeps the public list tag stable", () => {
    expect(PUBLIC_RECIPES_TAG).toBe("recipes:public");
  });
});
