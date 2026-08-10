import { beforeEach, describe, expect, it, vi } from 'vitest';

const { notificationsFindMany, userBlocksFindMany, selectWhere } = vi.hoisted(() => ({
  notificationsFindMany: vi.fn(),
  userBlocksFindMany: vi.fn(),
  selectWhere: vi.fn(),
}));

vi.mock('~/server/db', () => ({
  db: {
    query: {
      notifications: { findMany: notificationsFindMany },
      userBlocks: { findMany: userBlocksFindMany },
    },
    select: () => ({ from: () => ({ where: selectWhere }) }),
  },
  isDbConfigured: () => true,
}));

import { getUnreadCount, listNotifications } from './queries';

const notifRows = [
  {
    id: 'n1',
    type: 'mention',
    context: 'Soup',
    readAt: null,
    createdAt: new Date('2026-01-03'),
    actorId: 'blocked_1',
    actor: { id: 'blocked_1', name: 'Bob', handle: 'bob', avatarUrl: null },
    recipe: null,
    group: null,
  },
  {
    id: 'n2',
    type: 'comment_reply',
    context: 'Soup',
    readAt: null,
    createdAt: new Date('2026-01-02'),
    actorId: 'friend_1',
    actor: { id: 'friend_1', name: 'Amy', handle: 'amy', avatarUrl: null },
    recipe: null,
    group: null,
  },
  {
    id: 'n3',
    type: 'report',
    context: null,
    readAt: null,
    createdAt: new Date('2026-01-01'),
    actorId: null,
    actor: null,
    recipe: null,
    group: null,
  },
];

describe('notification block filtering (#355)', () => {
  beforeEach(() => {
    notificationsFindMany.mockReset().mockResolvedValue(notifRows);
    userBlocksFindMany.mockReset().mockResolvedValue([]);
    selectWhere
      .mockReset()
      .mockResolvedValue(notifRows.map((r) => ({ id: r.id, actorId: r.actorId })));
  });

  it('lists every notification when nothing is blocked', async () => {
    const { items } = await listNotifications('viewer_1');
    expect(items.map((i) => i.id)).toEqual(['n1', 'n2', 'n3']);
  });

  it('drops notifications from a blocked actor but keeps system (null actor) ones', async () => {
    userBlocksFindMany.mockResolvedValue([{ blockerId: 'viewer_1', blockedId: 'blocked_1' }]);
    const { items } = await listNotifications('viewer_1');
    expect(items.map((i) => i.id)).toEqual(['n2', 'n3']);
    expect(items.some((i) => i.actor?.id === 'blocked_1')).toBe(false);
  });

  it('excludes blocked actors from the unread badge count', async () => {
    userBlocksFindMany.mockResolvedValue([{ blockerId: 'viewer_1', blockedId: 'blocked_1' }]);
    expect(await getUnreadCount('viewer_1')).toBe(2);
  });
});

describe("co-creator invite deep link (#668)", () => {
  const inviteRow = {
    id: "n4",
    type: "recipe_creator_invite",
    context: "Apple pie",
    readAt: null,
    createdAt: new Date("2026-02-01"),
    actorId: "owner_1",
    actor: { id: "owner_1", name: "Ana", handle: "ana", avatarUrl: null },
    recipe: { slug: "apple-pie" },
    group: null,
  };

  beforeEach(() => {
    notificationsFindMany.mockReset().mockResolvedValue([inviteRow]);
    userBlocksFindMany.mockReset().mockResolvedValue([]);
    selectWhere.mockReset().mockResolvedValue([]);
  });

  it("links where the invite can be answered, not to a recipe that 404s", async () => {
    // A pending invitation grants no access whatsoever, so deep-linking to the
    // recipe would 404 on the very notification asking them to accept it.
    const { items } = await listNotifications("invitee_1");
    expect(items[0]!.href).toBe("/notifications");
  });

  it("still deep-links other recipe notifications to the recipe", async () => {
    notificationsFindMany.mockResolvedValue([
      { ...inviteRow, id: "n5", type: "review" },
    ]);
    const { items } = await listNotifications("viewer_1");
    expect(items[0]!.href).toBe("/recipes/apple-pie");
  });
});
