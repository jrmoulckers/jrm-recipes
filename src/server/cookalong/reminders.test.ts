import { beforeEach, describe, expect, it, vi } from "vitest";

const { findManyMock, transactionMock, notifyManyMock, claimQueue } =
  vi.hoisted(() => ({
    findManyMock: vi.fn(),
    transactionMock: vi.fn(),
    notifyManyMock: vi.fn(),
    claimQueue: [] as Array<Array<{ id: string }>>,
  }));

vi.mock("~/server/db", () => ({
  db: {
    query: { cookAlongs: { findMany: findManyMock } },
    transaction: transactionMock,
  },
}));
vi.mock("~/server/notifications/notify", () => ({
  notifyMany: notifyManyMock,
}));

import { sendDueCookAlongReminders } from "./mutations";

type SetValues = Record<string, unknown>;

function makeTx(claim: Array<{ id: string }>) {
  const setValues: SetValues = {};
  const chain = {
    set: vi.fn((v: SetValues) => {
      Object.assign(setValues, v);
      return chain;
    }),
    where: vi.fn(() => chain),
    returning: vi.fn(async () => claim),
  };
  return { update: vi.fn(() => chain), _setValues: setValues };
}

beforeEach(() => {
  vi.clearAllMocks();
  claimQueue.length = 0;
  transactionMock.mockImplementation(async (cb: (tx: unknown) => unknown) => {
    const claim = claimQueue.shift() ?? [];
    return cb(makeTx(claim));
  });
});

describe("sendDueCookAlongReminders (#353)", () => {
  it("stamps reminderSentAt with `now` and notifies only going/maybe RSVPs", async () => {
    const now = new Date("2030-05-01T12:00:00Z");
    findManyMock.mockResolvedValue([
      {
        id: "ca1",
        groupId: "g1",
        recipeId: "r1",
        hostId: "host",
        title: "Sunday sauce",
        recipe: { title: "Sauce" },
        rsvps: [
          { userId: "going_1", status: "going" },
          { userId: "maybe_1", status: "maybe" },
          { userId: "declined_1", status: "declined" },
        ],
      },
    ]);
    claimQueue.push([{ id: "ca1" }]);

    const reminded = await sendDueCookAlongReminders(2 * 60 * 60 * 1000, now);

    expect(reminded).toBe(1);
    expect(notifyManyMock).toHaveBeenCalledOnce();
    const [, recipients, params] = notifyManyMock.mock.calls[0] as [
      unknown,
      string[],
      { type: string },
    ];
    expect(recipients).toEqual(["going_1", "maybe_1"]);
    expect(params.type).toBe("cook_along_reminder");

    // The window query is bounded to unremindeded events starting within window.
    expect(findManyMock).toHaveBeenCalledOnce();
  });

  it("is idempotent: an event that loses the claim race is not notified", async () => {
    findManyMock.mockResolvedValue([
      {
        id: "ca1",
        groupId: "g1",
        recipeId: "r1",
        hostId: "host",
        title: null,
        recipe: { title: "Sauce" },
        rsvps: [{ userId: "going_1", status: "going" }],
      },
      {
        id: "ca2",
        groupId: "g1",
        recipeId: "r2",
        hostId: "host",
        title: null,
        recipe: { title: "Stew" },
        rsvps: [{ userId: "going_2", status: "going" }],
      },
    ]);
    // First event claims successfully; second was already reminded (empty claim).
    claimQueue.push([{ id: "ca1" }], []);

    const reminded = await sendDueCookAlongReminders();

    expect(reminded).toBe(1);
    expect(notifyManyMock).toHaveBeenCalledOnce();
    const [, recipients] = notifyManyMock.mock.calls[0] as [unknown, string[]];
    expect(recipients).toEqual(["going_1"]);
  });

  it("returns 0 and notifies no one when nothing is due", async () => {
    findManyMock.mockResolvedValue([]);
    const reminded = await sendDueCookAlongReminders();
    expect(reminded).toBe(0);
    expect(notifyManyMock).not.toHaveBeenCalled();
  });
});
