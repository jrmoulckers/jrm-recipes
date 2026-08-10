/**
 * Assert the deployed database installs no triggers or rules (issue #761).
 *
 * `check-fk-actions.ts` (#739, #744) justifies itself with this sentence:
 *
 *   "Referential actions decide what an existing delete does, so that changes
 *    behaviour without changing any call site."
 *
 * Referential actions are not the only thing that decides what a delete does. A
 * `BEFORE DELETE` trigger reaches the same state without being a foreign key,
 * and a rule can rewrite the statement outright. Measured on a throwaway
 * `postgres:16` running the real migration chain, a trigger of six lines
 *
 *   create trigger users_purge_versions before delete on users
 *   for each row execute function purge_authored_versions();
 *
 * destroyed the `recipe_versions` row that the control run left alive with
 * `author_id` nulled -- that row is the diff basis account erasure reads (#678,
 * and the ordering hazard on #731/#737). Every gate stayed green while it was
 * installed: `db:check-fks` reported `115 declared and 115 deployed ... match`,
 * both migration passes exited 0, `db:generate` produced no drift, and
 * `versions.test.ts` + `erasure.test.ts` passed 27/27. Those five are the whole
 * surface, because the `Migrations` job is exactly migrate -> migrate ->
 * db:check-fks. Nothing we run looks at triggers, so this does.
 *
 * This is a separate script and a separate CI step on purpose. The property
 * `check-fk-actions.ts` states is foreign keys; widening a guard past its
 * stated property is the mistake #720 and #726 both record.
 *
 * Two design notes, both load-bearing:
 *
 * 1. The expected set is an explicit allowlist below, NOT something derived by
 *    scanning `drizzle/*.sql` for `CREATE TRIGGER`. A hand-written migration is
 *    the arrival route -- it is the documented arrival route of the guard this
 *    extends -- so a derived expectation would learn about the trigger from the
 *    same migration that adds it and pass. Making a new trigger require an edit
 *    here is the point: that edit is the review moment.
 *
 * 2. It compares extracted sets rather than asserting the absence of a literal,
 *    so it fails closed (#758). A rotted query yields no rows, and no rows can
 *    never equal a non-empty expected set. The remaining direction is covered
 *    by the internal-trigger control, which counts rows from *the same scan*
 *    rather than from a query of its own. That is deliberate and was found the
 *    hard way: the first version asked a second question with its own
 *    `nspname` filter, so pointing only the main scan at a schema that does
 *    not exist passed with a live trigger installed -- and printed "460
 *    internal trigger(s) confirm the scan reached a migrated database" while
 *    doing it. An anchor only protects the literal it pins. There is now
 *    exactly one schema literal in this file and one scan, so a rot in either
 *    takes the control down with it.
 */
import postgres from "postgres";

/**
 * The only schema literal in this file. Both scans bind it, so a typo here
 * empties both and the internal-trigger control below fails rather than
 * reporting a clean database.
 */
const SCHEMA = "public";

/**
 * Triggers this repository deliberately installs, as `table.trigger_name`.
 *
 * Empty, and a freshly migrated database agrees: zero non-internal triggers.
 * Adding an entry means a trigger now decides what a write does, so it must
 * name the mechanism and say what reads the state it touches.
 */
const ALLOWED_TRIGGERS: readonly string[] = [];

/** Rules this repository deliberately installs, as `table.rule_name`. */
const ALLOWED_RULES: readonly string[] = [];

type TriggerRow = { table_name: string; name: string; internal: boolean };
type RuleRow = { table_name: string; name: string };

function describe(rows: readonly { table_name: string; name: string }[]) {
  return rows.map((row) => `${row.table_name}.${row.name}`).sort();
}

async function main(): Promise<void> {
  const url =
    process.env.DATABASE_URL_UNPOOLED ??
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.DATABASE_URL;

  if (!url) {
    console.error(
      "check-db-triggers: no DATABASE_URL set. This check inspects a real " +
        "database, so skipping it would pass for the wrong reason. Run it " +
        "after the migration chain has been applied.",
    );
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const allTriggers = await sql<TriggerRow[]>`
      select c.relname as table_name, t.tgname as name, t.tgisinternal as internal
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = ${SCHEMA}
    `;

    const rules = await sql<RuleRow[]>`
      select c.relname as table_name, r.rulename as name
      from pg_rewrite r
      join pg_class c on c.oid = r.ev_class
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = ${SCHEMA} and r.rulename <> '_RETURN'
    `;

    /**
     * Anti-vacuity, read off the same scan as the check. Enforcing a foreign
     * key installs internal triggers, so a migrated database has many; this one
     * reported 460. Zero means the connection, the schema filter or the join is
     * broken, or the migration chain was never applied -- in every case the
     * partition below proves nothing, so fail rather than pass empty.
     */
    const internalCount = allTriggers.filter((row) => row.internal).length;
    const triggers = allTriggers.filter((row) => !row.internal);

    if (internalCount === 0) {
      console.error(
        "check-db-triggers: the scan found no internal triggers at all. " +
          "Enforcing a foreign key installs them, so either the migration " +
          "chain has not been applied to this database or this scan is not " +
          "looking where it thinks it is. Either way its verdict on " +
          "non-internal triggers proves nothing, so this fails rather than " +
          "passing empty.",
      );
      process.exit(1);
    }

    const unexpectedTriggers = describe(triggers).filter(
      (name) => !ALLOWED_TRIGGERS.includes(name),
    );
    const unexpectedRules = describe(rules).filter(
      (name) => !ALLOWED_RULES.includes(name),
    );
    const missing = [...ALLOWED_TRIGGERS, ...ALLOWED_RULES].filter(
      (name) =>
        !describe(triggers).includes(name) && !describe(rules).includes(name),
    );

    if (
      unexpectedTriggers.length > 0 ||
      unexpectedRules.length > 0 ||
      missing.length > 0
    ) {
      console.error(
        "check-db-triggers: the deployed database does not match the " +
          "allowlist in scripts/check-db-triggers.ts.\n",
      );
      for (const name of unexpectedTriggers) {
        console.error(`  - unexpected trigger: ${name}`);
      }
      for (const name of unexpectedRules) {
        console.error(`  - unexpected rule: ${name}`);
      }
      for (const name of missing) {
        console.error(`  - allowlisted but not deployed: ${name}`);
      }
      console.error(
        "\nA trigger or rule decides what a write does without being a " +
          "foreign key and without changing any call site, so db:check-fks, " +
          "both migration passes, drizzle drift and the schema unit tests all " +
          "stay green while it is installed (measured on #761). If one of " +
          "these is intended, add it to the allowlist in the same PR that " +
          "adds the migration and say what reads the state it touches -- in " +
          "particular recipe_versions.author_id must stay ON DELETE set null " +
          "AND its rows must survive the delete, because that row is the diff " +
          "basis account erasure reads (src/server/users/erasure.ts).",
      );
      process.exit(1);
    }

    console.log(
      `check-db-triggers: no unexpected triggers or rules (${internalCount} ` +
        `internal trigger(s) from the same scan confirm it reached a ` +
        `migrated database).`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await main();
