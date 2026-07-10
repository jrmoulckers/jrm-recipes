import { beforeEach, describe, expect, it, vi } from "vitest";

const { applyClerkUserUpdate, applyClerkUserDeletion } = vi.hoisted(() => ({
  applyClerkUserUpdate: vi.fn(),
  applyClerkUserDeletion: vi.fn(),
}));

vi.mock("~/server/auth", () => ({
  applyClerkUserUpdate,
  applyClerkUserDeletion,
}));

import { extractProfile, handleClerkEvent } from "~/server/auth/clerk-webhook";

beforeEach(() => {
  applyClerkUserUpdate.mockReset();
  applyClerkUserDeletion.mockReset();
});

describe("extractProfile", () => {
  it("prefers the primary email and joins first + last name", () => {
    expect(
      extractProfile({
        id: "u1",
        primary_email_address_id: "e2",
        email_addresses: [
          { id: "e1", email_address: "old@example.com" },
          { id: "e2", email_address: "primary@example.com" },
        ],
        first_name: "Ada",
        last_name: "Lovelace",
        username: "ada",
        image_url: "https://img/x.png",
      }),
    ).toEqual({
      email: "primary@example.com",
      name: "Ada Lovelace",
      handle: "ada",
      avatarUrl: "https://img/x.png",
    });
  });

  it("falls back to the first email and username when name is absent", () => {
    expect(
      extractProfile({
        id: "u1",
        email_addresses: [{ id: "e1", email_address: "only@example.com" }],
        username: "solo",
      }),
    ).toEqual({
      email: "only@example.com",
      name: "solo",
      handle: "solo",
      avatarUrl: null,
    });
  });

  it("returns nulls when no identifying fields are present", () => {
    expect(extractProfile({ id: "u1" })).toEqual({
      email: null,
      name: null,
      handle: null,
      avatarUrl: null,
    });
  });
});

describe("handleClerkEvent", () => {
  it("syncs a profile on user.updated", async () => {
    await handleClerkEvent({
      type: "user.updated",
      data: {
        id: "clerk_1",
        email_addresses: [{ id: "e1", email_address: "a@b.com" }],
        primary_email_address_id: "e1",
        first_name: "Grace",
        last_name: "Hopper",
        username: "grace",
        image_url: "https://img/g.png",
      },
    });

    expect(applyClerkUserUpdate).toHaveBeenCalledWith("clerk_1", {
      email: "a@b.com",
      name: "Grace Hopper",
      handle: "grace",
      avatarUrl: "https://img/g.png",
    });
    expect(applyClerkUserDeletion).not.toHaveBeenCalled();
  });

  it("anonymizes on user.deleted", async () => {
    await handleClerkEvent({ type: "user.deleted", data: { id: "clerk_2" } });

    expect(applyClerkUserDeletion).toHaveBeenCalledWith("clerk_2");
    expect(applyClerkUserUpdate).not.toHaveBeenCalled();
  });

  it("ignores unknown event types", async () => {
    await handleClerkEvent({ type: "user.created", data: { id: "clerk_3" } });

    expect(applyClerkUserUpdate).not.toHaveBeenCalled();
    expect(applyClerkUserDeletion).not.toHaveBeenCalled();
  });

  it("ignores events with no user id", async () => {
    await handleClerkEvent({ type: "user.deleted", data: {} });

    expect(applyClerkUserUpdate).not.toHaveBeenCalled();
    expect(applyClerkUserDeletion).not.toHaveBeenCalled();
  });
});
