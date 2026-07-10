import { describe, expect, it, vi } from "vitest";

import { notify, notifyMany, type NotifyExecutor } from "./notify";

/** A fake db/tx executor capturing the values passed to a single insert. */
function fakeExec() {
  const values = vi.fn((_v: unknown) => Promise.resolve());
  const insert = vi.fn(() => ({ values }));
  return { exec: { insert } as unknown as NotifyExecutor, insert, values };
}

describe("notify() (issue #348)", () => {
  it("inserts a notification for a recipient", async () => {
    const { exec, insert, values } = fakeExec();
    await notify(exec, {
      recipientId: "user_recipient",
      actorId: "user_actor",
      type: "mention",
      recipeId: "recipe_1",
      context: "Sunday Ragù",
    });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: "user_recipient",
        actorId: "user_actor",
        type: "mention",
        recipeId: "recipe_1",
        groupId: null,
        entityId: null,
        context: "Sunday Ragù",
      }),
    );
  });

  it("never notifies yourself about your own action", async () => {
    const { exec, insert } = fakeExec();
    await notify(exec, {
      recipientId: "user_same",
      actorId: "user_same",
      type: "reaction",
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("truncates an over-long context to 500 chars", async () => {
    const { exec, values } = fakeExec();
    await notify(exec, {
      recipientId: "r",
      actorId: "a",
      type: "review",
      context: "x".repeat(900),
    });
    const arg = values.mock.calls[0]![0] as { context: string };
    expect(arg.context).toHaveLength(500);
  });
});

describe("notifyMany() (issue #348)", () => {
  it("de-dupes recipients and skips the actor", async () => {
    const { exec, values } = fakeExec();
    await notifyMany(exec, ["a", "b", "b", "actor", "c"], {
      actorId: "actor",
      type: "cook_along_invite",
      groupId: "group_1",
    });
    const rows = values.mock.calls[0]![0] as Array<{ recipientId: string }>;
    expect(rows.map((r) => r.recipientId).sort()).toEqual(["a", "b", "c"]);
  });

  it("does nothing when there are no recipients left", async () => {
    const { exec, insert } = fakeExec();
    await notifyMany(exec, ["actor"], { actorId: "actor", type: "cook" });
    expect(insert).not.toHaveBeenCalled();
  });
});
