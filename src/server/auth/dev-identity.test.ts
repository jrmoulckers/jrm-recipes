import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEV_CO_COOK,
  DEV_IDENTITIES,
  DEV_IDENTITY_COOKIE,
  DEV_USER,
  resolveDevIdentity,
} from "~/server/auth/dev-user";

/**
 * The dev-bypass identity selector (issue #698).
 *
 * The selector exists so an e2e spec can be two different people, which is the
 * only way to assert the properties co-creation is actually made of. That makes
 * it a piece of *auth* machinery living in a test affordance, so the tests below
 * are about the boundary rather than the convenience.
 *
 * The security argument has two halves and both are asserted here:
 *
 * 1. The allowlist is closed. An attacker-supplied value can never resolve to
 *    an arbitrary account, because resolution is a lookup in a fixed array
 *    rather than a database query on a caller-supplied id.
 * 2. The selector is unreachable wherever the bypass is. That half is
 *    structural — `selectDevIdentity` is called only from the branch guarded by
 *    `assertDevBypassAllowed` — so it is asserted against the source, below.
 */

const ROOT = process.cwd();
const AUTH_SOURCE = readFileSync(
  join(ROOT, "src", "server", "auth", "index.ts"),
  "utf8",
);

describe("resolveDevIdentity", () => {
  it("defaults to the shared dev user when nothing is requested", () => {
    for (const nothing of [undefined, null, ""]) {
      expect(resolveDevIdentity(nothing)).toBe(DEV_USER);
    }
  });

  it("resolves each allowlisted identity by id", () => {
    // Non-vacuous by construction: an empty allowlist would make the loop
    // assert nothing, so the count is pinned first.
    expect(DEV_IDENTITIES.length).toBeGreaterThan(1);
    for (const identity of DEV_IDENTITIES) {
      expect(resolveDevIdentity(identity.id)).toBe(identity);
    }
  });

  it("refuses anything not on the allowlist, without erroring", () => {
    const attacks = [
      "dev_local_user_00000001",
      "seed_usr_gran",
      "' OR 1=1 --",
      "../dev_local_user_00000000",
      "DEV_LOCAL_USER_00000000",
      " dev_local_user_00000000 ",
    ];
    for (const attack of attacks) {
      expect(resolveDevIdentity(attack), attack).toBe(DEV_USER);
    }
  });

  it("never widens access: every resolution is an allowlisted identity", () => {
    const probes = ["", "seed_usr_rosa", "nope", DEV_USER.id, DEV_CO_COOK.id];
    for (const probe of probes) {
      expect(DEV_IDENTITIES).toContain(resolveDevIdentity(probe));
    }
  });

  it("gives the two identities distinct URL namespaces", () => {
    // The whole point of a second identity is a second `users.slug`. Equal
    // slugs would make every dual-namespace assertion in the e2e journey
    // trivially true.
    const slugs = DEV_IDENTITIES.map((identity) => identity.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(DEV_CO_COOK.slug).not.toBe(DEV_USER.slug);
    expect(DEV_CO_COOK.id).not.toBe(DEV_USER.id);
  });
});

describe("selector placement", () => {
  it("is reached only from the guarded dev-bypass branch", () => {
    // The bypass branch calls the guard and then the dev-user resolver. If the
    // selector were ever hoisted above `assertDevBypassAllowed`, or called from
    // the Clerk branch, it would become a second way in.
    expect(AUTH_SOURCE).toMatch(
      /assertDevBypassAllowed\(\);\s*\n\s*return getOrCreateDevUser\(\);/,
    );
    const callers = [...AUTH_SOURCE.matchAll(/selectDevIdentity\(/g)];
    // One definition, one call site, and nothing else.
    expect(callers.length).toBe(2);
    expect(AUTH_SOURCE).toContain(
      "const identity = await selectDevIdentity();",
    );
  });

  it("still fails closed in production, which the selector cannot bypass", async () => {
    const { assertDevBypassAllowed } = await import("~/server/auth");
    expect(() => assertDevBypassAllowed("production", false)).toThrow(
      /Refusing to serve the shared dev-bypass user in production/,
    );
  });

  it("names the cookie it reads, so the harness and the server agree", () => {
    expect(DEV_IDENTITY_COOKIE).toBe("heirloom_dev_identity");
    expect(AUTH_SOURCE).toContain("DEV_IDENTITY_COOKIE");
  });
});
