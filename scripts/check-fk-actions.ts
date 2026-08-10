// @ts-check
/**
 * Assert that the *deployed* foreign-key actions match the ones the Drizzle
 * schema declares (issue #736).
 *
 * ## Why this exists
 *
 * `src/server/db/schema/versions.test.ts` pins the `ON DELETE` actions that the
 * `recipe_versions` retention guard argues from, because flipping one silently
 * changes what an already-sanctioned delete does. But it reads them through
 * `getTableConfig`, which reports the **TypeScript declaration** — not the
 * database. Nothing in that path touches Postgres.
 *
 * That leaves a gap every other gate also misses. A hand-written migration that
 * alters a constraint, with the schema file left untouched:
 *
 *   - passes `Migration drift`, because `drizzle-kit generate` diffs the schema
 *     against its own snapshot and both still say `set null`, so it emits
 *     nothing and `git diff -- drizzle` is clean;
 *   - passes `Migrations`, which only proves the chain applies and is
 *     idempotent, never that the result matches the schema;
 *   - passes every unit test, which reads the same unchanged declaration.
 *
 * Demonstrated on #736: a migration flipping `recipe_versions.author_id` to
 * `cascade` cleared all three while the deployed constraint read `cascade` and
 * every artifact in the repo read `set null`. The declaration and the database
 * are two different sources of truth, and only this check compares them.
 *
 * ## Matching is structural, not by name
 *
 * `drizzle.config.ts` sets `casing: "snake_case"`, which drizzle-**kit** applies
 * when generating SQL. The runtime `getTableConfig` does not apply it, so an
 * implicitly named column reports as `userId` here and exists as `user_id` in
 * Postgres, and generated constraint names differ the same way. Matching on
 * those names reports every such key as missing — a check that fails on a
 * correct database, which is worse than no check at all.
 *
 * So entries are matched on (table, columns, referenced table), with identifiers
 * canonicalized by lowercasing and dropping underscores. That compares the two
 * sides without reimplementing drizzle-kit's casing rules, which would be one
 * more copy of a rule free to drift from the original.
 *
 * ## Scope
 *
 * Every foreign key in the schema barrel, and every foreign key in the database
 * — the comparison runs in **both** directions (issue #744).
 *
 * Declared-to-deployed alone left two ways to violate the property while the run
 * printed a match and exited 0:
 *
 *   - Postgres allows two foreign keys on the same column with *different*
 *     actions, and enforces both. Keying deployed rows by (table, columns,
 *     referenced table) collapses such a pair, so one of them is compared to
 *     nothing. Which one survives is decided by physical order — and dropping
 *     and re-adding the canonical constraint, which is what a migration
 *     correcting an action does, moves it last and hides the stray.
 *   - A constraint with no declaration at all was never looked at, so a table
 *     missing from the barrel below took its foreign keys out of scope silently.
 *
 * Both were demonstrated on the real migration chain: a second `cascade` key on
 * `recipe_versions.author_id` destroyed a co-creator's version row on account
 * deletion — the diff basis erasure reads — while this check reported 115 keys
 * matching and every other gate stayed green.
 *
 * Sweeping the deployed side is also what makes "every foreign key" true rather
 * than aspirational. The barrel is a hand-written list of `export *` lines, so
 * the declared side is only as complete as that file; requiring every deployed
 * key to be declared no longer depends on it.
 *
 * Compares `ON DELETE` and `ON UPDATE`.
 *
 * Runs against the throwaway database in the `Migrations` CI job, after the
 * chain has been applied.
 */
import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import postgres from 'postgres';

import * as schema from '../src/server/db/schema/index.js';

/** Postgres encodes referential actions as a single char in `pg_constraint`. */
const ACTION_BY_CODE: Record<string, string> = {
  a: 'no action',
  r: 'restrict',
  c: 'cascade',
  n: 'set null',
  d: 'set default',
};

/**
 * Drizzle omits `onDelete`/`onUpdate` when the action is the SQL default, which
 * Postgres reports as `no action`. Normalize both sides before comparing.
 */
function normalizeAction(action: string | undefined): string {
  return (action ?? 'no action').toLowerCase();
}

/** Case- and underscore-insensitive identifier form; see the note above. */
function canon(identifier: string): string {
  return identifier.toLowerCase().split('_').join('');
}

function keyFor(table: string, columns: string[], foreignTable: string): string {
  const cols = columns.map(canon).sort().join(',');
  return `${canon(table)}(${cols})->${canon(foreignTable)}`;
}

type Entry = {
  label: string;
  key: string;
  onDelete: string;
  onUpdate: string;
};

function declaredForeignKeys(): Entry[] {
  const out: Entry[] = [];
  for (const exported of Object.values(schema)) {
    if (!is(exported, PgTable)) continue;
    const config = getTableConfig(exported);
    for (const fk of config.foreignKeys) {
      const ref = fk.reference();
      out.push({
        label: `${config.name}.${fk.getName()}`,
        key: keyFor(
          config.name,
          ref.columns.map((column) => column.name),
          getTableConfig(ref.foreignTable).name,
        ),
        onDelete: normalizeAction(fk.onDelete),
        onUpdate: normalizeAction(fk.onUpdate),
      });
    }
  }
  return out;
}

type DeployedRow = {
  constraint_name: string;
  table_name: string;
  foreign_table: string;
  columns: string[] | null;
  del: string;
  upd: string;
};

async function main(): Promise<void> {
  const url =
    process.env.DATABASE_URL_UNPOOLED ??
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.DATABASE_URL;

  if (!url) {
    console.error(
      'check-fk-actions: no DATABASE_URL set. This check compares the schema ' +
        'against a real database, so skipping it would pass for the wrong ' +
        'reason. Run it after the migration chain has been applied.',
    );
    process.exit(1);
  }

  const declared = declaredForeignKeys();
  if (declared.length === 0) {
    console.error(
      'check-fk-actions: found no foreign keys in the schema barrel. That is ' +
        'almost certainly a loading fault rather than a real schema, and a ' +
        'check that inspects nothing would pass while asserting nothing.',
    );
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const rows = await sql<DeployedRow[]>`
      select
        c.conname                   as constraint_name,
        c.conrelid::regclass::text  as table_name,
        c.confrelid::regclass::text as foreign_table,
        c.confdeltype               as del,
        c.confupdtype               as upd,
        (
          select array_agg(a.attname order by u.ord)
          from unnest(c.conkey) with ordinality as u(attnum, ord)
          join pg_attribute a
            on a.attrelid = c.conrelid and a.attnum = u.attnum
        )                           as columns
      from pg_constraint c
      join pg_namespace n on n.oid = c.connamespace
      where c.contype = 'f' and n.nspname = 'public'
    `;

    if (rows.length === 0) {
      console.error(
        'check-fk-actions: the database reports no foreign keys at all. The ' +
          'migration chain has probably not been applied to this database.',
      );
      process.exit(1);
    }

    // Collect *all* rows per key rather than one. Two constraints can share a
    // key (same columns, same target, different action) and Postgres enforces
    // both, so keeping one would silently discard the other (#744).
    const deployed = new Map<string, DeployedRow[]>();
    for (const row of rows) {
      const key = keyFor(row.table_name, row.columns ?? [], row.foreign_table);
      const bucket = deployed.get(key);
      if (bucket) bucket.push(row);
      else deployed.set(key, [row]);
    }

    const problems: string[] = [];
    const matched = new Set<string>();
    for (const fk of declared) {
      const bucket = deployed.get(fk.key);
      if (!bucket) {
        problems.push(
          `${fk.label}: declared in the schema but no matching constraint exists in the database`,
        );
        continue;
      }
      matched.add(fk.key);

      if (bucket.length > 1) {
        const detail = bucket
          .map((row) => {
            const del = ACTION_BY_CODE[row.del] ?? row.del;
            return `${row.constraint_name} (ON DELETE ${del})`;
          })
          .join(', ');
        problems.push(
          `${fk.label}: ${bucket.length} constraints cover the same columns and target — ${detail}. ` +
            'Postgres enforces every one of them, so the effective behaviour is not the declared ' +
            'action: a cascade alongside a set null deletes the row',
        );
      }

      // Every constraint on the key must agree; checking one would make the
      // result depend on which row the scan happened to yield first.
      for (const row of bucket) {
        const onDelete = ACTION_BY_CODE[row.del] ?? row.del;
        const onUpdate = ACTION_BY_CODE[row.upd] ?? row.upd;
        if (onDelete !== fk.onDelete) {
          problems.push(
            `${row.table_name}.${row.constraint_name}: schema declares ON DELETE ${fk.onDelete}, database has ${onDelete}`,
          );
        }
        if (onUpdate !== fk.onUpdate) {
          problems.push(
            `${row.table_name}.${row.constraint_name}: schema declares ON UPDATE ${fk.onUpdate}, database has ${onUpdate}`,
          );
        }
      }
    }

    // The other direction. A constraint the schema never declares is not
    // covered by the loop above at all, and the most likely cause is a table
    // missing from the schema barrel — which takes all of its foreign keys out
    // of scope without changing this count (#744).
    for (const [key, bucket] of deployed) {
      if (matched.has(key)) continue;
      for (const row of bucket) {
        const del = ACTION_BY_CODE[row.del] ?? row.del;
        problems.push(
          `${row.table_name}.${row.constraint_name}: exists in the database (ON DELETE ${del}) ` +
            'but the schema declares no such foreign key. Either it was added by a hand-written ' +
            'migration, or its table is missing from src/server/db/schema/index.ts',
        );
      }
    }

    if (problems.length > 0) {
      console.error(
        `check-fk-actions: ${problems.length} foreign key(s) differ between the schema and the database.\n`,
      );
      for (const problem of problems) console.error(`  - ${problem}`);
      console.error(
        '\nThe TypeScript declaration and the deployed constraint are two ' +
          'different sources of truth, and unit tests only ever read the ' +
          'first. A referential action decides what an existing delete does, ' +
          'so a mismatch changes behaviour without changing any call site. In ' +
          'particular recipe_versions.author_id must stay ON DELETE set null: ' +
          'it is the diff basis account erasure reads (see ' +
          'src/server/users/erasure.ts and schema/versions.test.ts).',
      );
      process.exit(1);
    }

    console.log(
      `check-fk-actions: ${declared.length} declared and ${rows.length} deployed foreign key(s) match.`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await main();
