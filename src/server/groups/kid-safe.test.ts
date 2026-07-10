import { describe, expect, it } from "vitest";

import { DomainError } from "~/server/errors";
import type { MemberRole } from "~/server/db/schema";
import {
  assertKidAllowed,
  isKid,
  roleCan,
  type KidRestrictedCapability,
} from "./kid-safe";

const ALL_CAPABILITIES: KidRestrictedCapability[] = [
  "delete_recipe",
  "delete_comment",
  "make_recipe_public",
  "manage_members",
  "moderate_content",
  "see_moderated_content",
];

const NON_KID_ROLES: MemberRole[] = ["owner", "admin", "member"];

describe("kid-safe capabilities (issue #345)", () => {
  it("identifies the kid role", () => {
    expect(isKid("kid")).toBe(true);
    for (const role of NON_KID_ROLES) expect(isKid(role)).toBe(false);
    expect(isKid(null)).toBe(false);
    expect(isKid(undefined)).toBe(false);
  });

  it("denies every restricted capability to the kid role", () => {
    for (const capability of ALL_CAPABILITIES) {
      expect(roleCan("kid", capability)).toBe(false);
    }
  });

  it("allows every restricted capability to non-kid roles", () => {
    for (const role of NON_KID_ROLES) {
      for (const capability of ALL_CAPABILITIES) {
        expect(roleCan(role, capability)).toBe(true);
      }
    }
  });

  it("leaves a missing role (non-member) to surrounding access control", () => {
    // Only the kid role is constrained here; non-members are gated elsewhere.
    for (const capability of ALL_CAPABILITIES) {
      expect(roleCan(null, capability)).toBe(true);
      expect(roleCan(undefined, capability)).toBe(true);
    }
  });

  it("assertKidAllowed throws FORBIDDEN for a kid and passes for others", () => {
    expect(() => assertKidAllowed("kid", "delete_recipe")).toThrow(DomainError);
    try {
      assertKidAllowed("kid", "delete_recipe");
    } catch (error) {
      expect((error as DomainError).code).toBe("FORBIDDEN");
    }
    expect(() => assertKidAllowed("owner", "delete_recipe")).not.toThrow();
    expect(() =>
      assertKidAllowed("member", "make_recipe_public"),
    ).not.toThrow();
  });
});
