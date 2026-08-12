import { getTableColumns } from 'drizzle-orm';
import { pgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { fk, pk } from './_shared';

/**
 * These assertions guard the coupling between cuid2 and the schema: `pk()` is
 * the default factory for every primary key in the product, and the column it
 * fills is `varchar(24)`. A cuid2 release that changed the default id length
 * would not fail the build, the linter or the type-checker -- it would fail at
 * runtime with Postgres `22001` on the first insert.
 *
 * `seed-library.test.ts` names the same bound but only checks hard-coded seed
 * strings (`'r_gravy'`), so before #994 nothing in the suite ever called the
 * generator. That is why the width below is read back out of a real table built
 * from the helpers rather than written as a literal `24`: the test cannot drift
 * away from `_shared.ts`, and it fails if either side moves alone.
 */
const probe = pgTable('cuid2_probe', { id: pk(), ref: fk() });
const columns = getTableColumns(probe);

/** The `$defaultFn` Drizzle invokes to mint a primary key on insert. */
const mintId = columns.id.defaultFn;

/**
 * `getTableColumns` widens to `PgColumn`, which hides the varchar width that
 * `PgVarchar` carries at runtime. Reading it through this accessor keeps the
 * test free of `any` and, more importantly, throws instead of yielding
 * `undefined` -- a missing width would otherwise make every comparison below
 * vacuously true, which is the exact failure this file exists to prevent.
 */
function declaredWidth(column: unknown): number {
  const width = (column as { length?: unknown }).length;
  if (typeof width !== 'number') {
    throw new TypeError('column no longer exposes a varchar width');
  }
  return width;
}

/** Large enough to expose a probabilistic charset or collision change. */
const SAMPLE = 10_000;

function generate(count: number): string[] {
  if (typeof mintId !== 'function') {
    throw new TypeError('pk() no longer carries a $defaultFn');
  }
  return Array.from({ length: count }, () => String(mintId()));
}

const ids = generate(SAMPLE);

describe('pk()/fk() id generation (#994)', () => {
  it('mints primary keys through a default factory', () => {
    // Without this, every assertion below would pass vacuously on an empty or
    // constant generator.
    expect(typeof mintId).toBe('function');
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('declares the same width for fk() as for pk()', () => {
    expect(declaredWidth(columns.ref)).toBe(declaredWidth(columns.id));
  });

  it('generates ids that fit the declared column width', () => {
    const width = declaredWidth(columns.id);
    expect(width).toBeGreaterThan(0);
    // Asserted over the set of observed lengths so a failure names the new id
    // size directly instead of pointing at one arbitrary offending value.
    const lengths = [...new Set(ids.map((id) => id.length))].sort((a, b) => a - b);
    expect(lengths.filter((length) => length > width)).toEqual([]);
  });

  it('generates ids that need no URL or SQL escaping', () => {
    // `_shared.ts` calls these "URL-safe"; recipe and collection ids reach the
    // address bar directly, and share tokens are minted the same way.
    expect(ids.filter((id) => !/^[a-z0-9]+$/.test(id)).slice(0, 5)).toEqual([]);
  });

  it('does not collide across a large sample', () => {
    expect(new Set(ids).size).toBe(ids.length);
  });
});
