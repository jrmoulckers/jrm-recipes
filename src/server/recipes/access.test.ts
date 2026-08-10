import { describe, expect, it } from "vitest";

import type { User } from "~/server/db/schema";
import { canView } from "./queries";

const author = { id: "author_1" } as User;
const stranger = { id: "stranger_1" } as User;
const member = { id: "member_1" } as User;
const creator = { id: "creator_1" } as User;

describe("canView", () => {
  it("allows anyone to view public recipes", () => {
    const publicRecipe = {
      authorId: author.id,
      visibility: "public",
      groupId: null,
    };

    expect(canView(publicRecipe, null, [])).toBe(true);
    expect(canView(publicRecipe, stranger, [])).toBe(true);
  });

  it("does NOT grant slug/id access to an unlisted recipe (issue #204)", () => {
    // Unlisted is the share-link visibility: reachable only via the unguessable
    // share token, never by the guessable slug/id this predicate is scoped to.
    const unlisted = {
      authorId: author.id,
      visibility: "unlisted",
      groupId: null,
    };

    expect(canView(unlisted, null, [])).toBe(false);
    expect(canView(unlisted, stranger, [])).toBe(false);
    // The owner still reaches their own unlisted recipe.
    expect(canView(unlisted, author, [])).toBe(true);
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

describe("canView co-creators (issue #668)", () => {
  const priv = { authorId: author.id, visibility: "private", groupId: null };

  it("lets an accepted co-creator view a private recipe", () => {
    expect(canView(priv, creator, [], [creator.id])).toBe(true);
  });

  it("still rejects someone who is not on the creator list", () => {
    expect(canView(priv, stranger, [], [creator.id])).toBe(false);
  });

  it("never grants access to a signed-out viewer", () => {
    // Guards against a null viewer matching an unexpected entry in the list.
    expect(canView(priv, null, [], [creator.id])).toBe(false);
  });

  it("defaults to no creators, i.e. fail-closed", () => {
    // A call site that can't cheaply resolve co-creators must deny a creator who
    // would otherwise be allowed, never allow someone who should be denied.
    expect(canView(priv, creator, [])).toBe(false);
  });

  it("does not widen an unlisted recipe beyond its creator list", () => {
    const unlisted = {
      authorId: author.id,
      visibility: "unlisted",
      groupId: null,
    };
    expect(canView(unlisted, creator, [], [creator.id])).toBe(true);
    expect(canView(unlisted, stranger, [], [creator.id])).toBe(false);
    expect(canView(unlisted, null, [], [creator.id])).toBe(false);
  });
});
