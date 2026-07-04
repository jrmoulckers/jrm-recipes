import { describe, expect, it } from "vitest";

import { addMemberInput, groupInput, updateRoleInput } from "./validation";

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
