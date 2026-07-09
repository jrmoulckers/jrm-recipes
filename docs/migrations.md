# Database migrations: expand/contract & rollback runbook

Heirloom applies migrations automatically at deploy time: `vercel-build` runs
`scripts/migrate.mjs` (all committed `drizzle/*.sql` in order) and then
`next build`, and Vercel promotes the new deployment immediately afterward.

Two consequences drive the conventions below:

1. **There is a window where old and new code run against the same schema.**
   During a deploy the _previous_ instances keep serving requests while
   migrations run and the new build boots. A migration that drops or renames a
   column the still-serving code reads will break production mid-deploy.
2. **Migrations are forward-only.** There is no `down` step. A half-applied or
   bad migration must be recovered by rolling _forward_ with a fix, not by an
   automatic rollback.

## Expand / contract (backward-compatible) convention

Never make a breaking schema change in a single migration. Split it across
**separate deploys** so that at every moment the running code and the live
schema are compatible.

| Phase        | What ships                                                                 | Safe because                                       |
| ------------ | -------------------------------------------------------------------------- | -------------------------------------------------- |
| **Expand**   | Additive DDL only: new nullable column / new table / new index.            | Old code ignores it; new code can start writing.   |
| **Backfill** | Data migration + code that dual-writes (writes both old and new shape).    | Both shapes stay valid; no reader sees a gap.      |
| **Contract** | Remove the old column/table/constraint _after_ no deployed code reads it.  | Nothing references the old shape anymore.          |

Ship each phase in its **own PR/deploy** and wait for the previous one to be
fully rolled out before the next.

### Worked example: rename `recipes.notes` → `recipes.cook_notes`

1. **Expand** — add `cook_notes` as a nullable column (`ADD COLUMN IF NOT
   EXISTS`). Deploy. Old code still reads/writes `notes`.
2. **Backfill + dual-write** — copy `notes` → `cook_notes`
   (`UPDATE … WHERE cook_notes IS NULL`) and change the app to write **both**
   columns and read `cook_notes` (falling back to `notes`). Deploy.
3. **Contract** — once that deploy is live and healthy and nothing reads
   `notes`, drop `notes`. Deploy.

A pure add (new table/column/index) is a single expand-only step and needs no
contract. A pure drop is only ever a _contract_ step — it must follow a deploy
that already stopped using the thing being dropped.

## Idempotency (required)

Migrations may re-run against a shared preview/branch database, so every
statement must be safe to apply twice:

- `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`.
- `ALTER TABLE IF EXISTS … ADD COLUMN IF NOT EXISTS`.
- Wrap enum/constraint/FK creation in a `DO $$ … EXCEPTION WHEN
  duplicate_object THEN null; WHEN duplicate_table THEN null; END $$` block so a
  re-apply doesn't error on `42710`/`42P07`.

## Destructive-change checklist (for any PR touching `drizzle/`)

Before merging a migration that **drops, renames, or narrows** a column/table/
constraint, confirm:

- [ ] The change is the **contract** phase of a previously deployed expand step
      (or is purely additive).
- [ ] No code in the **current** `main` still reads/writes the removed shape.
- [ ] The migration is **idempotent** (guards as above).
- [ ] It applies cleanly from empty (the CI "Migrations" job) **and** on top of
      production's current schema.
- [ ] The seed (`pnpm db:seed`) still succeeds against the new schema.
- [ ] For large-table rewrites, the operation won't hold a long exclusive lock
      (prefer `ADD COLUMN` + backfill over table rewrites).

## Rollback / repair runbook

Because migrations are forward-only, recovery is **forward-fix first**:

1. **Assess.** Read the Vercel deploy/build logs. Did `scripts/migrate.mjs`
   fail before or after applying? Drizzle records each applied migration in the
   `drizzle.__drizzle_migrations` table — check what actually landed.
2. **Partial failure (migration half-applied).**
   - Prefer a **forward fix**: write a new, idempotent migration that completes
     or corrects the state, then redeploy. Idempotent guards mean re-running the
     original set is safe.
   - Do **not** hand-edit an already-committed migration file — add a new one.
3. **Bad-but-applied migration.**
   - If the app is broken but the schema is intact, **revert the code** (Vercel
     → Deployments → promote the previous good deployment) to restore service
     while you prepare a forward fix. The expand/contract discipline is what
     makes the previous build still schema-compatible.
   - If the schema itself is wrong, ship a **compensating** migration
     (e.g. re-add a wrongly dropped column and backfill) rather than editing
     history.
4. **Data loss risk / restore.** Only when data is lost and cannot be
   reconstructed forward: restore from the provider's backup (Neon
   point-in-time restore / branch) — this is the last resort, not the default.
5. **After recovery.** Add a regression note and, if the gap was catchable,
   strengthen the CI migration job or the checklist above.

## Related

- Deploy flow & environment setup: [`DEPLOY.md`](../DEPLOY.md)
- Schema source of truth: [`src/server/db/schema/`](../src/server/db/schema/)
- Migration runner: [`scripts/migrate.mjs`](../scripts/migrate.mjs)
