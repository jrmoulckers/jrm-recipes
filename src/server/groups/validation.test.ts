import { describe, expect, it } from "vitest";

import {
  addMemberInput,
  createInviteLinkInput,
  groupInput,
  updateRoleInput,
} from "./validation";

describe("groupInput", () => {
  it("trims names and optional text", () => {
    expect(
      groupInput.parse({
        name: "  Sunday Supper Club  ",
        description: "  Everyone who brings dessert  ",
      }),
    ).toMatchObject({
      name: "Sunday Supper Club",
      description: "Everyone who brings dessert",
    });
  });

  it("coerces empty optional fields to undefined", () => {
    expect(
      groupInput.parse({
        name: "Family",
        description: "",
        avatarUrl: "",
      }),
    ).toMatchObject({
      description: undefined,
      avatarUrl: undefined,
    });
  });

  it("requires a name", () => {
    expect(() => groupInput.parse({ name: " " })).toThrow(
      /Give your group a name/,
    );
  });
});

describe("addMemberInput", () => {
  it("trims identifiers and defaults to member role", () => {
    expect(addMemberInput.parse({ identifier: "  aunt-mary  " })).toMatchObject({
      identifier: "aunt-mary",
      role: "member",
    });
  });

  it("rejects empty identifiers", () => {
    expect(() => addMemberInput.parse({ identifier: " " })).toThrow(
      /Enter a handle or email/,
    );
  });
});

describe("updateRoleInput", () => {
  it("accepts manageable roles only", () => {
    expect(updateRoleInput.parse({ role: "kid" })).toMatchObject({
      role: "kid",
    });
    expect(() => updateRoleInput.parse({ role: "owner" })).toThrow();
  });
});

describe("createInviteLinkInput (issue #343)", () => {
  it("defaults to an evergreen member link", () => {
    expect(createInviteLinkInput.parse({})).toMatchObject({ role: "member" });
    const parsed = createInviteLinkInput.parse({});
    expect(parsed.expiresInDays).toBeUndefined();
    expect(parsed.maxUses).toBeUndefined();
  });

  it("limits the role to the non-privileged set", () => {
    expect(createInviteLinkInput.parse({ role: "kid" })).toMatchObject({
      role: "kid",
    });
    expect(() => createInviteLinkInput.parse({ role: "admin" })).toThrow();
    expect(() => createInviteLinkInput.parse({ role: "owner" })).toThrow();
  });

  it("coerces and bounds expiry and max uses", () => {
    expect(
      createInviteLinkInput.parse({ expiresInDays: "30", maxUses: "10" }),
    ).toMatchObject({ expiresInDays: 30, maxUses: 10 });
    expect(() => createInviteLinkInput.parse({ expiresInDays: 0 })).toThrow();
    expect(() => createInviteLinkInput.parse({ maxUses: 0 })).toThrow();
  });
});
