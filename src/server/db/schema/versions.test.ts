import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { recipeVersions } from './recipes';

/**
 * Issue #170. `Recipe_versions.snapshot` must be stored as `jsonb`, not `text`,
 * so Postgres validates the JSON structurally and future timeline/diff features
 * can query inside a snapshot. Asserted at the schema source of truth.
 */
describe('recipe_versions.snapshot column (issue #170)', () => {
  it('is a jsonb column', () => {
    const snapshot = getTableConfig(recipeVersions).columns.find((c) => c.name === 'snapshot');
    expect(snapshot, 'expected a snapshot column').toBeDefined();
    expect(snapshot?.getSQLType()).toBe('jsonb');
    expect(snapshot?.notNull).toBe(true);
  });
});

/**
 * Issue #151. `(Recipe_id, version_number)` is unique at the database level so
 * two concurrent edits can't both claim the same version number. The btree the
 * constraint creates also serves the version-ordered history reads that the old
 * non-unique `recipe_versions_recipe_idx` index used to back.
 */
describe('recipe_versions version-number uniqueness (issue #151)', () => {
  it('has a unique constraint on (recipe_id, version_number)', () => {
    const { uniqueConstraints } = getTableConfig(recipeVersions);
    const uq = uniqueConstraints.find((u) => u.name === 'recipe_versions_recipe_version_uq');
    expect(uq, 'expected a unique constraint').toBeDefined();
    expect(uq?.columns.map((c) => c.name)).toEqual(['recipeId', 'versionNumber']);
  });

  it('no longer declares the redundant non-unique recipe index', () => {
    const { indexes } = getTableConfig(recipeVersions);
    expect(indexes.some((i) => i.config.name === 'recipe_versions_recipe_idx')).toBe(false);
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
 * The check is source-level because the property is an *absence* — "nothing
 * outside these files destroys the diff basis" — and an absence can only be
 * checked by reading the tree rather than by exercising any one call.
 *
 * Issue #711 widened it from one mechanism to three. Deleting version rows is
 * only the most obvious way to lose the diff basis; two foreign keys declared
 * in `./recipes.ts` destroy it without the phrase `.delete(recipeVersions)`
 * appearing anywhere:
 *
 * - `recipeId` is `ON DELETE cascade`, so a hard delete of a *recipe* takes its
 *   whole version history with it. This is the likely one: `deleteRecipe` is a
 *   soft delete, which invites a future "empty the trash after N days" job —
 *   written while reasoning about table growth, reviewing perfectly clean.
 * - `authorId` is `ON DELETE set null`, so a hard delete of a *user* severs
 *   attribution on every surviving row. It deletes nothing and leaves the
 *   snapshot text intact; it destroys only the record of who wrote it, which is
 *   precisely what derived provenance needs, and it leaves a table that still
 *   looks fully populated.
 *
 * A source-level guard cannot follow a cascade. But the foreign keys are
 * declared in the same file this guard already exists to protect, so the
 * *mechanisms* are enumerable even though the cascade itself is not traceable.
 *
 * Known limit: raw SQL naming `recipe_versions` inside a `sql` template would
 * evade all of these. That is detectable in principle, but the table name
 * appears throughout comments, docs and this guard's own prose, so the check
 * would be noisy enough that someone eventually disables it — which is worse
 * than a limit written down. There is no raw DML in `src` today; the only
 * `.execute` calls are a healthcheck select, the slug advisory lock and one
 * read query.
 *
 * Issue #716 closes the door the two cascade mechanisms leave open. Every check
 * below asserts *who* may perform a mechanism; none says whether a mechanism is
 * still what it is described as being. Both `ON DELETE` actions are
 * load-bearing premises, so changing one silently invalidates the reasoning
 * while every call-site check stays green — see the `FK_ACTIONS` block.
 */
describe('recipe_versions retention (issue #699)', () => {
  const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

  const ERASURE = join('server', 'users', 'erasure.ts');

  /**
   * Every way the version-history diff basis can be destroyed, with the files
   * allowed to do it. `harm` completes the sentence "doing this outside the
   * sanctioned files ..." in the failure message.
   */
  const MECHANISMS: {
    what: string;
    pattern: RegExp;
    harm: string;
    /** Files allowed to do this, relative to `src/`. Empty means never. */
    sanctioned: string[];
    /** A literal the pattern must match, so a typo can't silence the check. */
    probe: string;
    /** A literal the pattern must *not* match, where confusion is possible. */
    rejects?: string;
  }[] = [
    {
      what: 'deleting recipe_versions rows',
      // Matches `.delete(recipeVersions)` through any builder receiver (db, tx,
      // sp, t), which is how every existing delete in the codebase is written.
      pattern: /\.delete\(\s*recipeVersions\s*\)/,
      harm: 'destroys the snapshots outright',
      sanctioned: [
        // Account erasure, scoped to the departing user's own rows.
        ERASURE,
        // Dev-only reseed of an existing recipe.
        join('server', 'db', 'seed.ts'),
      ],
      probe: 'await tx.delete(recipeVersions).where(eq(x, y))',
    },
    {
      what: 'hard-deleting recipes',
      pattern: /\.delete\(\s*recipes\s*\)/,
      harm:
        'cascades to recipe_versions via `recipeId ON DELETE cascade` and takes the ' +
        'whole history with it. `deleteRecipe` is a soft delete, so if this is a ' +
        'trash-purge job, it is exactly the change #699 exists to catch',
      sanctioned: [ERASURE],
      probe: 'await db.delete(recipes).where(eq(x, y))',
      // `recipes` must not swallow `recipeVersions`, or the seed -- sanctioned
      // for versions but not for recipes -- would be reported as an offender.
      rejects: 'await tx.delete(recipeVersions)',
    },
    {
      what: 'hard-deleting users',
      pattern: /\.delete\(\s*users\s*\)/,
      harm:
        'nulls recipe_versions.author_id via `authorId ON DELETE set null`, which ' +
        'deletes no row and no text but severs the attribution that derived ' +
        'provenance (#686) needs, leaving a table that still looks fully populated',
      sanctioned: [ERASURE],
      probe: 't.delete(users).where(eq(users.id, userId))',
    },
    {
      // #715. The schema calls these "immutable snapshots" and nothing enforced
      // it. An update destroys the diff basis as effectively as a delete while
      // matching none of the mechanisms above, which read deletes only.
      what: 'updating recipe_versions rows',
      pattern: /\.update\(\s*recipeVersions\s*\)/,
      harm:
        'rewrites history in place, which the schema forbids by calling these ' +
        'snapshots immutable: a `snapshot` edit corrupts the diff basis and an ' +
        '`authorId` edit severs attribution. It is worse than a delete, because a ' +
        'missing row shows up as a gap in version_number while a mutated row still ' +
        'looks entirely valid',
      // Empty: never permitted anywhere. See the vacuity note below.
      sanctioned: [],
      probe: 'await db.update(recipeVersions).set({ snapshot })',
    },
  ];

  const toPosix = (file: string) => file.split(sep).join('/');

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

  /**
   * The source tree, read exactly once (#791, #799).
   *
   * Every check below asks a different question of the same bytes, so reading
   * the tree per test multiplied the I/O by the number of mechanisms for no
   * added assurance. That cost rises with every merge, and it had pushed the
   * four call-site checks past vitest's 5000ms default under full-suite load —
   * an intermittently red gate, which is worse than a permanently red one
   * because it trains re-running over reading, and a real regression here is
   * then indistinguishable from noise.
   *
   * Scope deliberately unchanged. Narrowing the walk to `src/server/**` was the
   * other candidate and it is not equivalent: 38 files outside `src/server`
   * import the db or drizzle, including `app/api/cron/erasure-backlog/route.ts`
   * — a cron route, which is exactly the shape of the "empty the trash after N
   * days" job these mechanisms exist to catch. That change would have kept the
   * guard's name while shrinking what it guards, which is the substitution this
   * file was written to prevent. `SCAN_ANCHORS` below pins the breadth so a
   * future narrowing has to be deliberate.
   */
  const SOURCES: { file: string; source: string }[] = walk(srcRoot)
    .map((full) => ({
      file: toPosix(relative(srcRoot, full)),
      source: readFileSync(full, 'utf8'),
    }))
    .sort((a, b) => a.file.localeCompare(b.file));

  it.each(MECHANISMS)(
    '$what happens only at the sanctioned call sites',
    ({ pattern, harm, sanctioned }) => {
      const allowed = sanctioned.map(toPosix);

      const offenders = SOURCES.filter(({ source }) => pattern.test(source))
        .map(({ file }) => file)
        .filter((file) => !allowed.includes(file))
        .sort();

      const where = allowed.length
        ? `outside ${allowed.join(', ')}`
        : 'anywhere (this one is never permitted)';

      expect(
        offenders,
        `recipe_versions rows are the only provenance record for text a user wrote into someone else's recipe (#699). Doing this ${where} ${harm}, and does it silently — the erasure remedy #678 depends on the diff basis being intact. If this is legitimate, add it to MECHANISMS[].sanctioned with the reason.`,
      ).toEqual([]);
    },
  );

  /**
   * Anti-vacuity, part one (#683): a mechanism that permits call sites must
   * still find them, or renaming those sites away leaves the check above green
   * while asserting nothing.
   *
   * Mechanisms with an empty `sanctioned` list are excluded, because "the
   * pattern still matches somewhere" is the wrong question for one that is
   * supposed to match nowhere. They are covered by part two instead — which is
   * the whole reason part two exists.
   */
  it.each(MECHANISMS.filter((m) => m.sanctioned.length > 0))(
    '$what still occurs at every sanctioned site, so the guard cannot pass vacuously',
    ({ pattern, sanctioned }) => {
      for (const relPath of sanctioned) {
        // Read through the shared scan rather than the filesystem, so that a
        // scan which silently came back empty fails here too instead of only
        // in its own check (#799).
        const entry = SOURCES.find((s) => s.file === toPosix(relPath));
        expect(entry, `expected ${toPosix(relPath)} in the scanned source tree`).toBeDefined();
        expect(
          pattern.test(entry?.source ?? ''),
          `expected ${toPosix(relPath)} to still match ${String(pattern)}`,
        ).toBe(true);
      }
    },
  );

  /**
   * Anti-vacuity, part two (#715): every pattern is tested against a literal it
   * must match, and where ambiguity is possible, one it must not.
   *
   * Part one anchors a pattern to real call sites, but a never-permitted
   * mechanism has none, so a typo in its regex would produce a check that can
   * never fire and can never be noticed — a guard that is green because it is
   * broken. This applies to all four rather than only the new one: the same
   * typo in any of them fails the same silent way, and part one would only
   * catch it for those with sanctioned sites.
   */
  it.each(MECHANISMS)('$what has a pattern that actually matches', (m) => {
    expect(
      m.pattern.test(m.probe),
      `${String(m.pattern)} failed to match its own probe: ${m.probe}`,
    ).toBe(true);

    if (m.rejects !== undefined) {
      expect(m.pattern.test(m.rejects), `${String(m.pattern)} wrongly matched: ${m.rejects}`).toBe(
        false,
      );
    }
  });

  /**
   * Anti-vacuity, part three (#799): the shared scan must have actually read a
   * source tree.
   *
   * Parts one and two anchor the *patterns*. Neither anchors the *corpus*, and
   * sharing one scan across every check moved the risk there: if `SOURCES` ever
   * came back empty — a changed `walk` filter, a moved file, a wrong `srcRoot`
   * — then `offenders` is `[]` for every mechanism and all four call-site
   * checks report the tree as clean because nothing was read. That is the
   * failure this whole file is built to refuse, so the refactor that introduced
   * a single point of failure has to assert it.
   *
   * `SCAN_ANCHORS` doubles as the record of the scan's breadth. The cron route
   * is outside `src/server` on purpose: it is the file that makes narrowing the
   * walk to the server directory a visible change rather than a silent one.
   */
  const SCAN_ANCHORS = [
    ERASURE,
    join('server', 'db', 'seed.ts'),
    join('server', 'db', 'schema', 'recipes.ts'),
    join('app', 'api', 'cron', 'erasure-backlog', 'route.ts'),
  ].map(toPosix);

  describe('the shared source scan (#791, #799)', () => {
    it('read a real tree, so no check above can pass by having scanned nothing', () => {
      // A floor, not the exact count: the tree grows, and a brittle equality
      // here would be a second maintenance burden. 400 is well under the ~620
      // files present when this landed and far above any plausible mis-walk.
      expect(SOURCES.length).toBeGreaterThan(400);
      expect(SOURCES.every(({ source }) => source.length > 0)).toBe(true);
    });

    it.each(SCAN_ANCHORS)('includes %s', (anchor) => {
      expect(SOURCES.map(({ file }) => file)).toContain(anchor);
    });

    it('still excludes test files, which name the sanctioned call sites in prose', () => {
      expect(SOURCES.filter(({ file }) => /\.test\.tsx?$/.test(file))).toEqual([]);
    });
  });

  /**
   * The `ON DELETE` actions the two cascade mechanisms above are *premised* on.
   *
   * The call-site checks police who may run each mechanism. They cannot notice
   * that a mechanism has changed shape, because a foreign key is not a call
   * site: flipping an action rewrites what an already-sanctioned delete does,
   * touching none of the source those checks read.
   *
   * `authorId` is the dangerous direction. Most sibling FKs in `./recipes.ts`
   * are `cascade`, so flipping this one to match reads as a consistency
   * cleanup. It would turn the sanctioned `.delete(users)` in `erasure.ts` into
   * a hard delete of every version row the departing user authored — including
   * versions of recipes owned by *other people*, which is exactly the diff
   * basis the #678 remedy consumes — while every check above stays green.
   * Erasure's blast radius would widen and the guard would still report the
   * property as protected.
   *
   * These also keep the `harm` strings honest: they name the actions in prose,
   * so an unasserted change leaves the guard emitting a message that
   * misdescribes the mechanism and sends the next reader after a cascade that
   * no longer exists.
   *
   * The schema is the right layer: it is the source of truth, and the Migration
   * drift CI job already fails when generated SQL diverges from it.
   */
  const FK_ACTIONS = [
    {
      column: 'recipeId',
      onDelete: 'cascade',
      why: "hard-deleting a recipe must take its version history with it; without the cascade, mechanism 2's stated harm is false and erasure's recipe delete would fail or orphan rows",
    },
    {
      column: 'authorId',
      onDelete: 'set null',
      why: "erasure must sever attribution WITHOUT deleting the snapshot. `cascade` here would silently widen the sanctioned `.delete(users)` into a hard delete of the diff basis, on other people's recipes, with every call-site check still green",
    },
  ];

  it.each(FK_ACTIONS)(
    'recipe_versions.$column is ON DELETE $onDelete, which the cascade mechanisms above assume',
    ({ column, onDelete, why }) => {
      const fk = getTableConfig(recipeVersions).foreignKeys.find((f) =>
        f
          .reference()
          .columns.map((c) => c.name)
          .includes(column),
      );

      expect(fk, `expected a foreign key on ${column}`).toBeDefined();
      expect(
        fk?.onDelete,
        `recipe_versions.${column} must stay ON DELETE ${onDelete} (#716): ${why}. Changing it does not trip the checks above — it changes what they are guarding. If this change is deliberate, the MECHANISMS list above and the schema comment in ./recipes.ts both describe the old behaviour and must be rewritten with it.`,
      ).toBe(onDelete);
    },
  );
});
