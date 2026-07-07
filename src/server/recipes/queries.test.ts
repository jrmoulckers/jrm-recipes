import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Fake Drizzle query surface so the visibility-gating logic can be exercised
// without a real database. Each read the queries make is an independent mock.
const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    query: {
      recipes: { findFirst: vi.fn(), findMany: vi.fn() },
      recipeEvents: { findMany: vi.fn() },
      groupMembers: { findMany: vi.fn() },
    },
  },
}));

vi.mock("~/server/db", () => ({
  db: dbMock,
  isDbConfigured: () => true,
}));

import type { User } from "~/server/db/schema";
import { getRecipeLineage, getRecipeTimeline } from "./queries";

const owner = { id: "owner_1" } as User;
const member = { id: "member_1" } as User;

// Three forks of the same source, one per visibility class.
const publicFork = {
  id: "f_pub",
  slug: "pub-fork",
  title: "Public Fork",
  visibility: "public",
  authorId: "chef_x",
  groupId: null,
  author: { name: "Chef X" },
};
const privateFork = {
  id: "f_priv",
  slug: "priv-fork",
  title: "Private Fork",
  visibility: "private",
  authorId: owner.id,
  groupId: null,
  author: { name: "Owner One" },
};
const groupFork = {
  id: "f_grp",
  slug: "grp-fork",
  title: "Group Fork",
  visibility: "group",
  authorId: "chef_y",
  groupId: "group_1",
  author: { name: "Chef Y" },
};

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.query.groupMembers.findMany.mockResolvedValue([]);
});

describe("getRecipeLineage visibility", () => {
  beforeEach(() => {
    // Source recipe has no parent, so only the adaptations list is exercised.
    dbMock.query.recipes.findFirst.mockResolvedValue({ forkedFromId: null });
    dbMock.query.recipes.findMany.mockResolvedValue([
      publicFork,
      privateFork,
      groupFork,
    ]);
  });

  it("shows only public/unlisted forks to an anonymous viewer", async () => {
    const { adaptations } = await getRecipeLineage("src_1", null);
    expect(adaptations.map((a) => a.slug)).toEqual(["pub-fork"]);
  });

  it("shows the viewer their own private fork", async () => {
    const { adaptations } = await getRecipeLineage("src_1", owner);
    expect(adaptations.map((a) => a.slug)).toEqual(["pub-fork", "priv-fork"]);
  });

  it("shows a group member the group's fork", async () => {
    dbMock.query.groupMembers.findMany.mockResolvedValue([
      { groupId: "group_1" },
    ]);
    const { adaptations } = await getRecipeLineage("src_1", member);
    expect(adaptations.map((a) => a.slug)).toEqual(["pub-fork", "grp-fork"]);
  });
});

describe("getRecipeTimeline visibility", () => {
  const createdEvent = {
    id: "e_created",
    type: "created",
    relatedRecipeId: null,
    note: null,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    actor: { name: "Owner One", handle: "owner", avatarUrl: null },
    related: null,
  };
  // Source-side `adapted` event: forward link to a *private* fork, carrying the
  // forker's free-text note.
  const forkEvent = {
    id: "e_adapt",
    type: "adapted",
    relatedRecipeId: privateFork.id,
    note: "secret family tweak",
    createdAt: new Date("2024-02-01T00:00:00Z"),
    actor: { name: "Owner One", handle: "owner", avatarUrl: null },
    related: {
      slug: privateFork.slug,
      title: privateFork.title,
      authorId: privateFork.authorId,
      visibility: privateFork.visibility,
      groupId: privateFork.groupId,
    },
  };
  const privateChild = {
    id: privateFork.id,
    slug: privateFork.slug,
    title: privateFork.title,
    createdAt: new Date("2024-02-01T00:00:00Z"),
    authorId: privateFork.authorId,
    visibility: privateFork.visibility,
    groupId: privateFork.groupId,
    author: { name: "Owner One", handle: "owner", avatarUrl: null },
  };

  beforeEach(() => {
    dbMock.query.recipes.findFirst.mockResolvedValue({
      id: "src_1",
      forkedFromId: null,
      createdAt: new Date("2024-01-01T00:00:00Z"),
    });
    dbMock.query.recipeEvents.findMany.mockResolvedValue([
      createdEvent,
      forkEvent,
    ]);
    dbMock.query.recipes.findMany.mockResolvedValue([privateChild]);
  });

  it("hides a private fork and its note from an anonymous viewer", async () => {
    const { entries } = await getRecipeTimeline("src_1", null);

    expect(entries.some((e) => e.kind === "adaptation")).toBe(false);
    expect(entries.some((e) => e.related?.title === "Private Fork")).toBe(false);
    expect(JSON.stringify(entries)).not.toContain("secret family tweak");
  });

  it("shows the fork owner the adaptation and its note", async () => {
    const { entries } = await getRecipeTimeline("src_1", owner);

    const adaptation = entries.find((e) => e.kind === "adaptation");
    expect(adaptation?.related?.title).toBe("Private Fork");
    expect(adaptation?.note).toBe("secret family tweak");
  });
});
