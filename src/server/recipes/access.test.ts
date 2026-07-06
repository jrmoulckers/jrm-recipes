import { describe, expect, it } from "vitest";

import type { User } from "~/server/db/schema";
import { canView } from "./queries";

const author = { id: "author_1" } as User;
const stranger = { id: "stranger_1" } as User;
const member = { id: "member_1" } as User;

describe("canView", () => {
  it("allows anyone to view public and unlisted recipes", () => {
    const publicRecipe = {
      authorId: author.id,
      visibility: "public",
      groupId: null,
    };
    const unlisted = {
      authorId: author.id,
      visibility: "unlisted",
      groupId: null,
    };

    expect(canView(publicRecipe, null, [])).toBe(true);
    expect(canView(publicRecipe, stranger, [])).toBe(true);
    expect(canView(unlisted, null, [])).toBe(true);
  });

  it("only lets the author view a private recipe", () => {
    const priv = { authorId: author.id, visibility: "private", groupId: null };

    expect(canView(priv, author, [])).toBe(true);
    expect(canView(priv, stranger, [])).toBe(false);
    expect(canView(priv, null, [])).toBe(false);
  });

  it("rejects a non-member from a group recipe", () => {
    const groupRecipe = {
      authorId: author.id,
      visibility: "group",
      groupId: "group_1",
    };

    // Member of the recipe's group can view.
    expect(canView(groupRecipe, member, ["group_1"])).toBe(true);
    // Author always can.
    expect(canView(groupRecipe, author, [])).toBe(true);
    // A viewer in *other* groups is still rejected.
    expect(canView(groupRecipe, stranger, ["group_2", "group_3"])).toBe(false);
    // Signed-out viewer is rejected.
    expect(canView(groupRecipe, null, [])).toBe(false);
  });

  it("rejects a group recipe with no group assigned", () => {
    const orphan = { authorId: author.id, visibility: "group", groupId: null };
    expect(canView(orphan, member, ["group_1"])).toBe(false);
  });
});
