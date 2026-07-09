import { beforeEach, describe, expect, it, vi } from "vitest";

const { groupMembersFindFirst, cookAlongsFindMany, userBlocksFindMany } =
  vi.hoisted(() => ({
    groupMembersFindFirst: vi.fn(),
    cookAlongsFindMany: vi.fn(),
    userBlocksFindMany: vi.fn(),
  }));

vi.mock("~/server/db", () => ({
  db: {
    query: {
      groupMembers: { findFirst: groupMembersFindFirst },
      cookAlongs: { findMany: cookAlongsFindMany },
      userBlocks: { findMany: userBlocksFindMany },
    },
  },
  isDbConfigured: () => true,
}));

import { getUpcomingCookAlongs } from "./queries";

function eventRow() {
  return {
    id: "ca1",
    title: "Sunday sauce",
    note: null,
    scheduledFor: new Date("2999-01-01"),
    recipe: { id: "r1", slug: "sauce", title: "Sauce" },
    host: { id: "host_1", name: "Host", handle: "host", avatarUrl: null },
    rsvps: [
      {
        userId: "blocked_1",
        status: "going",
        user: { id: "blocked_1", name: "Bob", handle: "bob", avatarUrl: null },
      },
      {
        userId: "friend_1",
        status: "going",
        user: { id: "friend_1", name: "Amy", handle: "amy", avatarUrl: null },
      },
      {
        userId: "viewer_1",
        status: "maybe",
        user: { id: "viewer_1", name: "Me", handle: "me", avatarUrl: null },
      },
    ],
  };
}

describe("getUpcomingCookAlongs block filtering (#355)", () => {
  beforeEach(() => {
    groupMembersFindFirst.mockReset().mockResolvedValue({ id: "m1" });
    cookAlongsFindMany.mockReset().mockResolvedValue([eventRow()]);
    userBlocksFindMany.mockReset().mockResolvedValue([]);
  });

  it("keeps every attendee and count when nothing is blocked", async () => {
    const [event] = await getUpcomingCookAlongs("group_1", "viewer_1");
    expect(event!.attendees).toHaveLength(3);
    expect(event!.goingCount).toBe(2);
    expect(event!.viewerStatus).toBe("maybe");
  });

  it("drops a blocked member from both the roster and the going count", async () => {
    userBlocksFindMany.mockResolvedValue([
      { blockerId: "viewer_1", blockedId: "blocked_1" },
    ]);
    const [event] = await getUpcomingCookAlongs("group_1", "viewer_1");
    expect(event!.attendees.map((a) => a.userId)).toEqual([
      "friend_1",
      "viewer_1",
    ]);
    expect(event!.goingCount).toBe(1);
    // The viewer's own RSVP always survives.
    expect(event!.viewerStatus).toBe("maybe");
  });
});
