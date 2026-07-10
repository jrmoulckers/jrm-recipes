import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Pins the analytics wiring of the group actions (#317): the invite funnel
 * (`invite_sent` → `invite_accepted`) and group lifecycle events. Mutations,
 * auth and the analytics client are mocked so we exercise only the action's
 * event emission — never a real backend or database.
 */

const {
  revalidatePathMock,
  requireUserMock,
  captureServerMock,
  createGroupMock,
  addMemberMock,
  updateMemberRoleMock,
  leaveGroupMock,
  deleteGroupMock,
} = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  requireUserMock: vi.fn(),
  captureServerMock: vi.fn(),
  createGroupMock: vi.fn(),
  addMemberMock: vi.fn(),
  updateMemberRoleMock: vi.fn(),
  leaveGroupMock: vi.fn(),
  deleteGroupMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("~/server/auth", () => ({ requireUser: requireUserMock }));
vi.mock("~/server/db", () => ({ isDbConfigured: () => true }));
vi.mock("~/lib/analytics/server", () => ({ captureServer: captureServerMock }));
vi.mock("./mutations", () => ({
  createGroup: createGroupMock,
  addMember: addMemberMock,
  updateMemberRole: updateMemberRoleMock,
  leaveGroup: leaveGroupMock,
  deleteGroup: deleteGroupMock,
  removeMember: vi.fn(),
  transferOwnership: vi.fn(),
  updateGroup: vi.fn(),
}));

import {
  addMemberAction,
  createGroupAction,
  deleteGroupAction,
  leaveGroupAction,
} from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue({ id: "user_1" });
});

describe("addMemberAction invite funnel", () => {
  it("emits invite_sent for the inviter and invite_accepted for the invitee", async () => {
    addMemberMock.mockResolvedValue({
      id: "gm_1",
      groupId: "group_1",
      userId: "target_1",
      role: "member",
      memberCount: 3,
    });

    const res = await addMemberAction("family", {
      identifier: "aunt-mary",
      role: "member",
    });

    expect(res).toEqual({ ok: true });
    // Inviter's event carries the bucketed size (3 → "2-5"), never a raw count.
    expect(captureServerMock).toHaveBeenCalledWith("user_1", "invite_sent", {
      groupId: "group_1",
      role: "member",
      sizeBucket: "2-5",
    });
    // Acceptance is attributed to the invited user's internal id — no PII.
    expect(captureServerMock).toHaveBeenCalledWith(
      "target_1",
      "invite_accepted",
      {
        groupId: "group_1",
        role: "member",
      },
    );
  });

  it("does not emit when validation fails", async () => {
    const res = await addMemberAction("family", {
      identifier: "",
      role: "member",
    });

    expect(res.ok).toBe(false);
    expect(addMemberMock).not.toHaveBeenCalled();
    expect(captureServerMock).not.toHaveBeenCalled();
  });
});

describe("group lifecycle events", () => {
  it("emits group_created with the solo size bucket", async () => {
    createGroupMock.mockResolvedValue({ id: "group_1", slug: "family" });

    await createGroupAction({ name: "Family" });

    expect(captureServerMock).toHaveBeenCalledWith("user_1", "group_created", {
      groupId: "group_1",
      sizeBucket: "1",
    });
  });

  it("emits group_left with the group id", async () => {
    leaveGroupMock.mockResolvedValue({ slug: "family", groupId: "group_1" });

    await leaveGroupAction("family");

    expect(captureServerMock).toHaveBeenCalledWith("user_1", "group_left", {
      groupId: "group_1",
    });
  });

  it("emits group_deleted with the group id", async () => {
    deleteGroupMock.mockResolvedValue({ slug: "family", groupId: "group_1" });

    await deleteGroupAction("family");

    expect(captureServerMock).toHaveBeenCalledWith("user_1", "group_deleted", {
      groupId: "group_1",
    });
  });
});
