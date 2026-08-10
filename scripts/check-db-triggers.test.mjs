import { describe, expect, it } from "vitest";

import { evaluate } from "./check-db-triggers.ts";

/**
 * Unit tests for the trigger/rule guard's verdict (issue #764).
 *
 * Every behaviour asserted here was first measured by hand against a live
 * `postgres:16-alpine` running the real migration chain on #761. That is the
 * problem this file solves: hand verification rots, and the CI step only ever
 * runs against a clean database, which is the case that says least. The guard
 * was correct as written -- these tests exist to notice when it stops being.
 *
 * Two of these paths had never been exercised at all before #764. The allowlist
 * is empty, so both are dead code until the first legitimate trigger lands; a
 * broken allowlist would then block a contributor whose obvious remedy is to
 * weaken the guard.
 *
 * This file is `.mjs` deliberately. `vitest.config.ts` includes
 * `scripts/**´/*.test.mjs` -- `.mjs` only -- so the `.ts` sibling this was
 * nearly written as would have been silently excluded and "passed" by never
 * running. That is the exact failure class the guard family exists to prevent.
 */
const trigger = (table_name, name) => ({ table_name, name });

/** A migrated database reports many internal triggers; the real one had 460. */
const MIGRATED = 460;

describe("check-db-triggers verdict (#764)", () => {
  it("passes on a clean migrated database", () => {
    const verdict = evaluate({
      triggers: [],
      rules: [],
      internalCount: MIGRATED,
    });

    expect(verdict).toEqual({ vacuous: false, problems: [] });
  });

  it("reports an unexpected trigger", () => {
    const verdict = evaluate({
      triggers: [trigger("users", "users_purge_versions")],
      rules: [],
      internalCount: MIGRATED,
    });

    expect(verdict.problems).toEqual([
      "unexpected trigger: users.users_purge_versions",
    ]);
  });

  it("reports an unexpected rule", () => {
    const verdict = evaluate({
      triggers: [],
      rules: [trigger("recipe_versions", "no_delete_versions")],
      internalCount: MIGRATED,
    });

    expect(verdict.problems).toEqual([
      "unexpected rule: recipe_versions.no_delete_versions",
    ]);
  });

  /**
   * The benign case. A fix that converts silence into noise has to be checked
   * in the direction that should stay quiet, or the sweep shows three red rows
   * and looks like success.
   */
  it("passes a trigger that is deployed and allowlisted", () => {
    const verdict = evaluate({
      triggers: [trigger("users", "users_touch")],
      rules: [],
      internalCount: MIGRATED,
      allowedTriggers: ["users.users_touch"],
    });

    expect(verdict).toEqual({ vacuous: false, problems: [] });
  });

  it("passes a rule that is deployed and allowlisted", () => {
    const verdict = evaluate({
      triggers: [],
      rules: [trigger("recipes", "recipes_noop")],
      internalCount: MIGRATED,
      allowedRules: ["recipes.recipes_noop"],
    });

    expect(verdict).toEqual({ vacuous: false, problems: [] });
  });

  /**
   * The other direction. A stale exemption would silently pre-approve whatever
   * object next takes that name, so an allowlist entry with nothing behind it
   * is itself a problem.
   */
  it("reports an allowlist entry with nothing deployed behind it", () => {
    const verdict = evaluate({
      triggers: [],
      rules: [],
      internalCount: MIGRATED,
      allowedTriggers: ["users.users_touch"],
    });

    expect(verdict.problems).toEqual([
      "allowlisted but not deployed: users.users_touch",
    ]);
  });

  it("does not let a rule's name satisfy a trigger's allowlist entry", () => {
    const verdict = evaluate({
      triggers: [],
      rules: [trigger("users", "users_touch")],
      internalCount: MIGRATED,
      allowedTriggers: ["users.users_touch"],
    });

    expect(verdict.problems).toEqual([
      "unexpected rule: users.users_touch",
      "allowlisted but not deployed: users.users_touch",
    ]);
  });

  /**
   * Anti-vacuity. Observed for real: a probe container that had not finished
   * starting reported zero of everything, and an unguarded check would have
   * called that a clean database.
   */
  it("refuses to reach a verdict when the scan found no internal triggers", () => {
    const verdict = evaluate({
      triggers: [],
      rules: [],
      internalCount: 0,
    });

    expect(verdict.vacuous).toBe(true);
  });

  it("stays vacuous even when a trigger is present, since the scan is untrustworthy", () => {
    const verdict = evaluate({
      triggers: [trigger("users", "users_purge_versions")],
      rules: [],
      internalCount: 0,
    });

    expect(verdict.vacuous).toBe(true);
  });
});
