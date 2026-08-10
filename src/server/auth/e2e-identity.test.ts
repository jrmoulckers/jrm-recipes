import { describe, expect, it } from "vitest";

import {
  DEV_USER,
  E2E_IDENTITIES,
  E2E_IDENTITY_COOKIE,
  E2E_IDENTITY_FLAG,
  resolveE2EIdentity,
} from "~/server/auth/dev-user";

/**
 * The E2E identity selector (issue #698) exists so two browser contexts can be
 * two different people. The review question that matters is not "does it work"
 * but "could this cookie be used to assume another user on a real deploy". The
 * answer is four independent barriers, and these tests pin the two that live in
 * this module — the server-only flag and the closed allowlist. The other two
 * (an unreachable branch, and `assertDevBypassAllowed` running first) are
 * pinned by `dev-bypass-guard.test.ts`.
 */

const ON = { [E2E_IDENTITY_FLAG]: "1" };

describe("E2E identity selector (#698)", () => {
  describe("the server-only flag gates everything", () => {
    it("resolves nothing when the flag is absent", () => {
      expect(resolveE2EIdentity("owner", {})).toBeNull();
    });

    it("resolves nothing for any value of the flag other than exactly '1'", () => {
      for (const value of ["0", "true", "yes", "", " 1", "1 "]) {
        expect(
          resolveE2EIdentity("owner", { [E2E_IDENTITY_FLAG]: value }),
          `flag=${JSON.stringify(value)} must not enable the selector`,
        ).toBeNull();
      }
    });

    it("is not a NEXT_PUBLIC_ variable, so it can never reach a client bundle", () => {
      expect(E2E_IDENTITY_FLAG.startsWith("NEXT_PUBLIC_")).toBe(false);
    });
  });

  describe("the allowlist is closed", () => {
    it("resolves the seeded fixtures when explicitly enabled", () => {
      expect(resolveE2EIdentity("owner", ON)).toBe(E2E_IDENTITIES.owner);
      expect(resolveE2EIdentity("cocreator", ON)).toBe(
        E2E_IDENTITIES.cocreator,
      );
    });

    it("refuses an unknown label", () => {
      expect(resolveE2EIdentity("admin", ON)).toBeNull();
      expect(resolveE2EIdentity("root", ON)).toBeNull();
    });

    it("refuses a raw user id, so it cannot be pointed at a real account", () => {
      expect(resolveE2EIdentity(DEV_USER.id, ON)).toBeNull();
      expect(resolveE2EIdentity(E2E_IDENTITIES.owner.id, ON)).toBeNull();
    });

    it("refuses a slug, handle, or email", () => {
      for (const value of [
        DEV_USER.slug,
        DEV_USER.handle,
        DEV_USER.email,
        E2E_IDENTITIES.owner.slug,
        E2E_IDENTITIES.cocreator.email,
      ]) {
        expect(resolveE2EIdentity(value, ON)).toBeNull();
      }
    });

    it("refuses an absent or empty cookie", () => {
      expect(resolveE2EIdentity(undefined, ON)).toBeNull();
      expect(resolveE2EIdentity(null, ON)).toBeNull();
      expect(resolveE2EIdentity("", ON)).toBeNull();
    });

    // A bare `key in obj` or `obj[key]` lookup would answer to inherited
    // Object.prototype members, turning the allowlist into a way to reach a
    // non-fixture value. The lookup uses hasOwnProperty for exactly this.
    it("refuses inherited Object.prototype keys", () => {
      for (const value of [
        "constructor",
        "__proto__",
        "toString",
        "hasOwnProperty",
        "valueOf",
      ]) {
        expect(
          resolveE2EIdentity(value, ON),
          `${value} must not resolve to an identity`,
        ).toBeNull();
      }
    });

    it("cannot be extended at runtime", () => {
      expect(Object.isFrozen(E2E_IDENTITIES)).toBe(true);
    });
  });

  describe("the fixtures are distinct and non-production", () => {
    it("gives each fixture a distinct users.slug, which co-creation needs", () => {
      const slugs = Object.values(E2E_IDENTITIES).map((user) => user.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
      expect(slugs).not.toContain(DEV_USER.slug);
    });

    it("keeps every fixture distinct from the shared dev user", () => {
      for (const user of Object.values(E2E_IDENTITIES)) {
        expect(user.id).not.toBe(DEV_USER.id);
        expect(user.email).not.toBe(DEV_USER.email);
      }
    });

    // A fixture that carried a clerkId could collide with, or shadow, a real
    // Clerk-backed account during `syncClerkUser`'s lookup.
    it("never carries a Clerk identity", () => {
      for (const user of Object.values(E2E_IDENTITIES)) {
        expect(user.clerkId).toBeNull();
      }
    });

    it("uses a reserved .test email domain", () => {
      for (const user of Object.values(E2E_IDENTITIES)) {
        expect(user.email).toMatch(/@heirloom\.test$/);
      }
    });
  });

  it("names the cookie without a NEXT_PUBLIC-style client contract", () => {
    expect(E2E_IDENTITY_COOKIE).toBe("heirloom_e2e_identity");
  });
});
