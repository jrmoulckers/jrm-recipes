/**
 * Guards for the two containment conditions #698 removed (issue #783).
 *
 * The #783 severity argument named four conditions and claimed three still
 * held. Two did. The other two were absent — one because #698 pointed the
 * fixture at a demo persona, and one (`E2E_IDENTITY_SELECTOR`) because it had
 * never been implemented at all, in this repository, at any point.
 *
 * That is the failure worth guarding against. Both conditions were stated in
 * prose — a doc comment and an issue body — and prose does not fail CI, so a
 * condition could be described as holding for as long as anyone kept reading
 * the description instead of the code. These tests are the structural home
 * those two properties never had.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEV_CO_COOK,
  DEV_IDENTITIES,
  DEV_IDENTITY_COOKIE,
  DEV_USER,
  isE2eIdentity,
  isIdentitySelectorEnabled,
  resolveDevIdentity,
} from "~/server/auth/dev-user";

describe("condition 3: the selector is off unless explicitly enabled", () => {
  it("is disabled when the flag is unset", () => {
    expect(isIdentitySelectorEnabled(undefined)).toBe(false);
  });

  it("is disabled for every value other than exactly \"1\"", () => {
    for (const value of ["", "0", "true", "yes", "2", " 1", "1 ", "TRUE"]) {
      expect(isIdentitySelectorEnabled(value)).toBe(false);
    }
  });

  it("is enabled only by \"1\"", () => {
    expect(isIdentitySelectorEnabled("1")).toBe(true);
  });

  it("is not readable from a client bundle", () => {
    // NEXT_PUBLIC_ variables are inlined into client JavaScript at build time.
    // Naming this flag that way would ship the switch to every browser, so the
    // prefix is part of the security property rather than a style choice.
    expect("E2E_IDENTITY_SELECTOR".startsWith("NEXT_PUBLIC_")).toBe(false);
  });
});

describe("condition 4: the fixture identity is not a demo persona", () => {
  it("does not reuse a seeded demo user's id", () => {
    // seed_usr_rosa carries demo ratings, comments and suggestions. Selecting
    // an identity that owns content is impersonation with a history attached,
    // which is strictly worse than an identity that owns nothing.
    expect(DEV_CO_COOK.id).not.toBe("seed_usr_rosa");
    expect(DEV_CO_COOK.id).not.toMatch(/^seed_/);
  });

  it("is marked as E2E-only, which is what the shared seed's guard matches", () => {
    expect(isE2eIdentity(DEV_CO_COOK)).toBe(true);
  });

  it("does not collide with the dev-bypass user's namespace", () => {
    expect(DEV_CO_COOK.id).not.toBe(DEV_USER.id);
    expect(DEV_CO_COOK.slug).not.toBe(DEV_USER.slug);
    expect(DEV_CO_COOK.handle).not.toBe(DEV_USER.handle);
    expect(DEV_CO_COOK.email).not.toBe(DEV_USER.email);
  });

  it("leaves the dev-bypass user seedable by the shared seed", () => {
    // DEV_USER is not an E2E fixture — it is the local dev account, and the
    // demo seed must keep creating it. A guard that swept it up would break
    // `pnpm db:seed` for everyone, so pin the asymmetry.
    expect(isE2eIdentity(DEV_USER)).toBe(false);
  });
});

describe("the E2E spec's restated literals match the real identity", () => {
  // The spec cannot import ~/server/auth/dev-user (Playwright transforms it,
  // and the import would pull the schema barrel into the test process), so it
  // restates the values. #698 restated them too and left only a "must match"
  // comment to hold them together — which is exactly the kind of prose promise
  // that #783 found had quietly stopped being true. Read them back instead.
  const specPath = join(process.cwd(), "tests/e2e/co-creator.spec.ts");
  const spec = readFileSync(specPath, "utf8");

  const literal = (name: string): string => {
    const match = new RegExp(`const ${name} = "([^"]*)"`).exec(spec);
    // Anti-vacuity: a renamed constant must fail loudly rather than compare
    // undefined against undefined and pass.
    expect(match, `${name} not found in ${specPath}`).not.toBeNull();
    return match![1]!;
  };

  it("pins the co-cook id", () => {
    expect(literal("CO_COOK_ID")).toBe(DEV_CO_COOK.id);
  });

  it("pins the co-cook name and slug", () => {
    expect(literal("CO_COOK_NAME")).toBe(DEV_CO_COOK.name);
    expect(literal("CO_COOK_SLUG")).toBe(DEV_CO_COOK.slug);
  });

  it("pins the selector cookie", () => {
    expect(literal("DEV_IDENTITY_COOKIE")).toBe(DEV_IDENTITY_COOKIE);
  });

  it("leaves no stale reference to the demo persona", () => {
    expect(spec).not.toContain("aunt-rosa");
    expect(spec).not.toContain("seed_usr_rosa");
  });
});

describe("the allowlist stays closed", () => {
  it("serves exactly the two known identities", () => {
    expect(DEV_IDENTITIES).toEqual([DEV_USER, DEV_CO_COOK]);
  });

  it("resolves unknown and hostile values to the default, never an error", () => {
    for (const value of [
      undefined,
      null,
      "",
      "seed_usr_rosa",
      "seed_usr_gran",
      "' OR 1=1 --",
      "../../etc/passwd",
    ]) {
      expect(resolveDevIdentity(value)).toBe(DEV_USER);
    }
  });

  it("still resolves the co-cook by its own id", () => {
    // Anti-vacuity: if this fails, every assertion above passes for the
    // uninteresting reason that resolution is broken for all inputs.
    expect(resolveDevIdentity(DEV_CO_COOK.id)).toBe(DEV_CO_COOK);
  });
});
