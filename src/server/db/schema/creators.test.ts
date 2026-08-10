import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { recipeCreatorRole, recipeCreatorStatus, recipeCreators } from './recipes';

/**
 * Issue #668. `recipe_creators` carries the permission and URL-namespace
 * semantics for co-created recipes, so its structural invariants are asserted
 * here rather than left to the mutation layer. The unit-test environment has no
 * Postgres, so we assert against the Drizzle table config that `db:generate`
 * compiles into DDL, and against the emitted DDL itself where the enum literals
 * and referential actions only survive as text.
 */
function migrationContaining(needle: string): string {
  const dir = join(process.cwd(), 'drizzle');
  const body = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .find((sql) => sql.includes(needle));
  expect(body, `no migration contains ${needle}`).toBeDefined();
  return body!;
}

describe('recipe_creators schema (issue #668)', () => {
  it('has no `owner` role, because the owner is recipes.authorId', () => {
    // A row for the owner would be a second representation of a fact the
    // `notNull` authorId FK already guarantees, and could only ever drift from
    // it. Ownership stays single-sourced.
    expect(recipeCreatorRole.enumValues).toEqual(['creator']);
  });

  it('defaults an invitation to pending, never accepted', () => {
    // Adding someone publishes a recipe under *their* public namespace, so it
    // needs their consent. A default of `accepted` would grant access and a URL
    // on a bare insert.
    expect(recipeCreatorStatus.enumValues).toEqual(['pending', 'accepted']);
    const status = getTableConfig(recipeCreators).columns.find((c) => c.name === 'status');
    expect(status?.default).toBe('pending');
  });

  it('allows only one row per person per recipe', () => {
    const { uniqueConstraints } = getTableConfig(recipeCreators);
    const uq = uniqueConstraints.find((u) => u.name === 'recipe_creators_recipe_user_uq');
    expect(uq?.columns.map((c) => c.name)).toEqual(['recipeId', 'userId']);
  });

  it("keeps a creator's slug unique inside their own namespace", () => {
    const { uniqueConstraints } = getTableConfig(recipeCreators);
    const uq = uniqueConstraints.find((u) => u.name === 'recipe_creators_user_slug_uq');
    expect(uq?.columns.map((c) => c.name)).toEqual(['userId', 'slug']);
  });

  it('leaves the slug nullable so a pending invite occupies nothing', () => {
    // Postgres treats NULLs as distinct under a unique constraint, so any number
    // of pending invitations coexist without colliding — which is the point: a
    // pending row must not reserve a slug in the invitee's namespace.
    const slug = getTableConfig(recipeCreators).columns.find((c) => c.name === 'slug');
    expect(slug?.notNull).toBe(false);
  });

  it('binds status to the slug/acceptedAt pair with a CHECK', () => {
    const { checks } = getTableConfig(recipeCreators);
    const check = checks.find((c) => c.name === 'recipe_creators_status_check');
    expect(check, 'missing recipe_creators_status_check').toBeDefined();
    // The predicate itself is asserted against the generated DDL below, where
    // the enum literals survive as text rather than as SQL chunk objects.
  });

  it('compiles the status CHECK into the migration DDL', () => {
    // Accepted implies a namespace slug and a timestamp; pending implies
    // neither. This is what makes "pending grants nothing" checkable at the DB
    // rather than merely intended by the mutation layer.
    const body = migrationContaining('recipe_creators_status_check');
    const start = body.indexOf('CONSTRAINT "recipe_creators_status_check"');
    const clause = body.slice(start, body.indexOf('\n', start));
    expect(clause).toContain("'accepted'");
    expect(clause).toContain("'pending'");
    expect(clause).toContain('"slug" is not null');
    expect(clause).toContain('"slug" is null');
    expect(clause).toContain('"accepted_at" is not null');
    expect(clause).toContain('"accepted_at" is null');
  });

  it('cascades away with either side of the relationship', () => {
    // Deleting the recipe or the user must not leave a row that still grants
    // access or resolves a URL. Account deletion in particular has to stop the
    // departing user's creator paths resolving on other people's recipes.
    // Asserted against the emitted DDL, which is what the live database runs.
    const body = migrationContaining('CREATE TABLE "recipe_creators"');
    expect(body).toMatch(
      /"recipe_creators_recipe_id_recipes_id_fk" FOREIGN KEY \("recipe_id"\)[^;]*ON DELETE cascade/,
    );
    expect(body).toMatch(
      /"recipe_creators_user_id_users_id_fk" FOREIGN KEY \("user_id"\)[^;]*ON DELETE cascade/,
    );
    // The inviter is audit metadata, not an access grant, so it survives their
    // departure rather than taking the membership with it.
    expect(body).toMatch(
      /"recipe_creators_invited_by_id_users_id_fk" FOREIGN KEY \("invited_by_id"\)[^;]*ON DELETE set null/,
    );
  });

  it('indexes both reverse lookups on accepted rows only', () => {
    const { indexes } = getTableConfig(recipeCreators);
    for (const name of ['recipe_creators_user_idx', 'recipe_creators_recipe_idx']) {
      const found = indexes.find((i) => i.config.name === name);
      expect(found, `expected index "${name}"`).toBeDefined();
      // Partial on `accepted`, because every access path filters on it and a
      // pending invitation is never consulted.
      expect(found?.config.where).toBeDefined();
    }
  });
});
