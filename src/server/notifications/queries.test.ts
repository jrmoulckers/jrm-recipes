import { beforeEach, describe, expect, it, vi } from "vitest";

const { notificationsFindMany, userBlocksFindMany, selectWhere } = vi.hoisted(
  () => ({
    notificationsFindMany: vi.fn(),
    userBlocksFindMany: vi.fn(),
    selectWhere: vi.fn(),
  }),
);

vi.mock("~/server/db", () => ({
  db: {
    query: {
      notifications: { findMany: notificationsFindMany },
      userBlocks: { findMany: userBlocksFindMany },
    },
    select: () => ({ from: () => ({ where: selectWhere }) }),
  },
  isDbConfigured: () => true,
}));

import { getUnreadCount, listNotifications } from "./queries";

const notifRows = [
  {
    id: "n1",
    type: "mention",
    context: "Soup",
    readAt: null,
    createdAt: new Date("2026-01-03"),
    actorId: "blocked_1",
    actor: { id: "blocked_1", name: "Bob", handle: "bob", avatarUrl: null },
    recipe: null,
    group: null,
  },
  {
    id: "n2",
    type: "comment_reply",
    context: "Soup",
    readAt: null,
    createdAt: new Date("2026-01-02"),
    actorId: "friend_1",
    actor: { id: "friend_1", name: "Amy", handle: "amy", avatarUrl: null },
    recipe: null,
    group: null,
  },
  {
    id: "n3",
    type: "report",
    context: null,
    readAt: null,
    createdAt: new Date("2026-01-01"),
    actorId: null,
    actor: null,
    recipe: null,
    group: null,
  },
];

describe("notification block filtering (#355)", () => {
  beforeEach(() => {
    notificationsFindMany.mockReset().mockResolvedValue(notifRows);
    userBlocksFindMany.mockReset().mockResolvedValue([]);
    selectWhere.mockReset().mockResolvedValue(
      notifRows.map((r) => ({ id: r.id, actorId: r.actorId })),
    );
  });

  it("lists every notification when nothing is blocked", async () => {
    const { items } = await listNotifications("viewer_1");
    expect(items.map((i) => i.id)).toEqual(["n1", "n2", "n3"]);
  });

  it("drops notifications from a blocked actor but keeps system (null actor) ones", async () => {
    userBlocksFindMany.mockResolvedValue([
      { blockerId: "viewer_1", blockedId: "blocked_1" },
    ]);
    const { items } = await listNotifications("viewer_1");
    expect(items.map((i) => i.id)).toEqual(["n2", "n3"]);
    expect(items.some((i) => i.actor?.id === "blocked_1")).toBe(false);
  });

  it("excludes blocked actors from the unread badge count", async () => {
    userBlocksFindMany.mockResolvedValue([
      { blockerId: "viewer_1", blockedId: "blocked_1" },
    ]);
    expect(await getUnreadCount("viewer_1")).toBe(2);
  });
});
