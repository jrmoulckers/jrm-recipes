import { describe, expect, it } from "vitest";

import type { User } from "~/server/db/schema";
import { canListInGroupCookbook } from "./queries";

const author = { id: "author_1" } as User;
const otherMember = { id: "member_2" } as User;

function recipe(overrides: {
  visibility: string;
  status?: string;
  authorId?: string;
  deletedAt?: Date | null;
}) {
  return {
    authorId: overrides.authorId ?? author.id,
    visibility: overrides.visibility,
    status: overrides.status ?? "published",
    deletedAt: overrides.deletedAt ?? null,
  };
}

describe("canListInGroupCookbook", () => {
  it("never lists a soft-deleted recipe, even to its author", () => {
    const tombstoned = recipe({ visibility: "group", deletedAt: new Date() });
    expect(canListInGroupCookbook(tombstoned, author, true)).toBe(false);
    expect(canListInGroupCookbook(tombstoned, otherMember, true)).toBe(false);
    expect(canListInGroupCookbook(tombstoned, null, false)).toBe(false);
  });

  it("lets the author see their own recipe regardless of visibility", () => {
    for (const visibility of ["private", "unlisted", "group", "public"]) {
      const own = recipe({ visibility, status: "draft" });
      expect(canListInGroupCookbook(own, author, true)).toBe(true);
    }
  });

  it("does NOT leak a member's private recipe to other members", () => {
    const priv = recipe({ visibility: "private" });
    expect(canListInGroupCookbook(priv, otherMember, true)).toBe(false);
  });

  it("does NOT list an unlisted recipe to non-authors (issue #204)", () => {
    const unlisted = recipe({ visibility: "unlisted" });
    expect(canListInGroupCookbook(unlisted, otherMember, true)).toBe(false);
    expect(canListInGroupCookbook(unlisted, null, false)).toBe(false);
  });

  it("shows group and public recipes to members", () => {
    expect(
      canListInGroupCookbook(
        recipe({ visibility: "group" }),
        otherMember,
        true,
      ),
    ).toBe(true);
    expect(
      canListInGroupCookbook(
        recipe({ visibility: "public" }),
        otherMember,
        true,
      ),
    ).toBe(true);
  });

  it("only shows published public recipes to non-members", () => {
    // A public draft must not leak to the public cookbook view.
    expect(
      canListInGroupCookbook(
        recipe({ visibility: "public", status: "draft" }),
        null,
        false,
      ),
    ).toBe(false);
    expect(
      canListInGroupCookbook(
        recipe({ visibility: "public", status: "published" }),
        null,
        false,
      ),
    ).toBe(true);
    // Group-visibility recipes are never shown to non-members.
    expect(
      canListInGroupCookbook(recipe({ visibility: "group" }), null, false),
    ).toBe(false);
  });
});
