import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { recipeVersions } from "./recipes";

/**
 * Issue #170. `Recipe_versions.snapshot` must be stored as `jsonb`, not `text`,
 * so Postgres validates the JSON structurally and future timeline/diff features
 * can query inside a snapshot. Asserted at the schema source of truth.
 */
describe("recipe_versions.snapshot column (issue #170)", () => {
  it("is a jsonb column", () => {
    const snapshot = getTableConfig(recipeVersions).columns.find(
      (c) => c.name === "snapshot",
    );
    expect(snapshot, "expected a snapshot column").toBeDefined();
    expect(snapshot?.getSQLType()).toBe("jsonb");
    expect(snapshot?.notNull).toBe(true);
  });
});

/**
 * Issue #151. `(Recipe_id, version_number)` is unique at the database level so
 * two concurrent edits can't both claim the same version number. The btree the
 * constraint creates also serves the version-ordered history reads that the old
 * non-unique `recipe_versions_recipe_idx` index used to back.
 */
describe("recipe_versions version-number uniqueness (issue #151)", () => {
  it("has a unique constraint on (recipe_id, version_number)", () => {
    const { uniqueConstraints } = getTableConfig(recipeVersions);
    const uq = uniqueConstraints.find(
      (u) => u.name === "recipe_versions_recipe_version_uq",
    );
    expect(uq, "expected a unique constraint").toBeDefined();
    expect(uq?.columns.map((c) => c.name)).toEqual([
      "recipeId",
      "versionNumber",
    ]);
  });

  it("no longer declares the redundant non-unique recipe index", () => {
    const { indexes } = getTableConfig(recipeVersions);
    expect(
      indexes.some((i) => i.config.name === "recipe_versions_recipe_idx"),
    ).toBe(false);
  });
});

/**
 * Issue #699. Enforcement for the retention constraint stated on
 * `recipeVersions` in `./recipes.ts`, and in `docs/db-backup-and-recovery.md`.
 * Read the schema comment for *why* version history is load-bearing for account
 * erasure; this file exists so that reasoning survives someone who doesn't.
 *
 * A comment is advisory. The change it warns against — a "keep the last N
 * versions" cap, written while reasoning about table growth rather than about
 * erasure — reviews clean precisely because nothing contradicts it, and then
 * fails silently in the dangerous direction: erasure keeps reporting success
 * while a departed user's text stays on the site. So the constraint is
 * asserted, not just written down.
 *
 * The check is source-level because the property is an *absence* — "no other
 * module deletes version rows" — and an absence can only be checked by reading
 * the tree rather than by exercising any one call.
 */
describe("recipe_versions retention (issue #699)", () => {
  const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

  /** Files permitted to delete version rows, relative to `src/`. */
  const SANCTIONED = [
    // Account erasure, scoped to the departing user's own rows.
    join("server", "users", "erasure.ts"),
    // Dev-only reseed of an existing recipe.
    join("server", "db", "seed.ts"),
  ];

  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) return [];
      // Tests are excluded: mocks, fixtures and prose about the delete sites
      // legitimately name them, and test code never runs against production.
      return /\.test\.tsx?$/.test(entry.name) ? [] : [full];
    });
  }

  it("is deleted from only the sanctioned call sites", () => {
    // Matches `.delete(recipeVersions)` through any builder receiver (db, tx,
    // sp, t), which is how every existing delete in the codebase is written.
    const deletion = /\.delete\(\s*recipeVersions\s*\)/;

    const offenders = walk(srcRoot)
      .filter((file) => deletion.test(readFileSync(file, "utf8")))
      .map((file) => relative(srcRoot, file))
      // Normalize so the expectation reads the same on Windows and Linux CI.
      .map((file) => file.split(sep).join("/"))
      .filter(
        (file) => !SANCTIONED.map((s) => s.split(sep).join("/")).includes(file),
      )
      .sort();

    expect(
      offenders,
      "recipe_versions rows are the only provenance record for text a user wrote into someone else's recipe (#699). A new delete site destroys the diff basis that #678's erasure remedy depends on, and does it silently. If this delete is legitimate, add it to SANCTIONED with the reason.",
    ).toEqual([]);
  });

  it("still finds the sanctioned deletes, so the guard cannot pass vacuously", () => {
    // Without this, deleting or renaming both call sites would leave the guard
    // above green while asserting nothing at all.
    const deletion = /\.delete\(\s*recipeVersions\s*\)/;
    for (const relPath of SANCTIONED) {
      const source = readFileSync(join(srcRoot, relPath), "utf8");
      expect(
        deletion.test(source),
        `expected ${relPath.split(sep).join("/")} to still delete recipe_versions`,
      ).toBe(true);
    }
  });
});
