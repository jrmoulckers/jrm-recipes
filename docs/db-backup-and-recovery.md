# Database backup and recovery

Heirloom stores application data in Postgres through `DATABASE_URL`, Drizzle ORM, and generated
SQL migrations in `drizzle/*.sql`. The Drizzle schema source of truth is
`src/server/db/schema/`, with `drizzle.config.ts` pointing migration output to `./drizzle`.

The production database host is deployment-dependent. The recommendations below assume managed
Postgres with automated backups and point-in-time recovery, such as Neon, Supabase, or RDS,
without requiring one specific provider.

## First-line recovery: soft deletes

Before restoring a database, check whether the data was soft-deleted.

Recipes use `deletedAt`/`deletedBy` tombstones instead of immediate hard deletion.
`src/server/recipes/mutations.ts` includes owner-guarded delete and restore paths, and read
queries filter tombstoned rows while preserving child history.

Use soft-delete recovery first when:

- a user accidentally deleted a recipe.
- recipe versions, events, ratings, or comments still exist.
- the issue affects one or a small number of rows.
- no schema or broad data corruption occurred.

Use backup/PITR only when soft-delete restore is insufficient, data was hard-deleted, many rows
were corrupted, or a migration/application bug changed data broadly.

## Backup strategy

Recommended production baseline:

1. Use managed Postgres automated backups.
2. Enable **daily snapshots**.
3. Enable **continuous WAL archiving / PITR** where the host supports it.
4. Keep backups in the same region for fast restore and, if supported by the provider, an
   additional cross-region or logically separate copy for disaster recovery.
5. Protect backup administration with SSO/MFA and least-privilege access.

Local Docker Postgres from `docker-compose.yml` is for development only and is not a production
backup strategy.

## Retention recommendation

> **Unpinned. These are recommendations, not the deployed policy.** The ranges below were written
> before a host was chosen and no one has replaced them with the values actually in force. Until
> that happens, no honest erasure horizon can be stated to a user. See
> [Pinning the retention numbers](#pinning-the-retention-numbers) directly below for who decides
> and how to read the current setting.

| Backup type                        | Recommended retention                                                       | Notes                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Automated daily snapshots          | 14-30 days _(unpinned)_                                                     | Enough to catch most accidental deletion/corruption reports.          |
| PITR/WAL window                    | 7-14 days minimum _(unpinned)_                                              | Larger windows improve recovery from slow-discovered corruption.      |
| Pre-destructive-migration snapshot | Keep until the migration has been healthy through one normal business cycle | Required before risky schema/data changes.                            |
| Restore-drill artifacts            | Keep latest drill notes and verification evidence                           | Do not keep exported production data outside approved secure storage. |

### Pinning the retention numbers

This is the blocking item. It is a hosting and cost decision with a compliance consequence, so it
needs a human with authority over the Neon plan. It is recorded here rather than left implicit
because a reader has no other way to tell that the table above is aspirational. Tracked in #855.

Production runs on **Neon** (`.env.example`, `DEPLOY.md` step 1). Neon does not expose the two
mechanisms in the table as separate knobs. It has a single **history retention** window: the
project retains WAL history for that period and any restore, whether to a named point or an
implicit daily boundary, is served from it. So one number governs both rows, and the longest
backup lifetime is exactly that window.

To pin it:

1. Read the current value in the Neon console under the production project, **Settings then Storage
   and history** (also returned by `GET /projects/{id}` as `history_retention_seconds`). The ceiling
   is capped by the plan, so raising it may require a plan change.
2. Decide the value against the RPO/RTO targets below, not in isolation. A longer window buys
   recovery from slow-discovered corruption and lengthens the erasure horizon by the same amount.
   Those pull in opposite directions and the trade-off is the decision.
3. Replace the ranges in the table with that single number, drop the _(unpinned)_ markers, and
   remove the warning above it.
4. Then wire it into erasure so the horizon is actually recorded per deletion (see
   [Erasure and backups](#erasure-and-backups)), and revisit the deletion notice, which today omits
   the horizon because there is no honest value to state.

If the two rows are ever backed by genuinely different mechanisms (for example a separate logical
dump shipped elsewhere for disaster recovery), pin them separately, and note that the erasure
horizon is bounded by the **longer** of the two.

Backup retention above is about copies of the database. This is about the live table, and it is
called out here because it is where someone looking to reclaim storage would reasonably start.

`recipe_versions` is append-only and grows without bound, which makes it an obvious pruning
candidate. It must not be pruned while it is load-bearing for account erasure.

Since #685 an accepted co-creator can edit a recipe they do not own, so a departing user's prose
can end up inside another user's `recipes.story`, `notes` and step text, reachable by no
author-scoped delete. `recipe_versions.authorId` plus the full per-save `snapshot` is the only
record of which words belonged to whom, and therefore the only basis for computing what to back
out. See #678.

Pruning it fails silently and in the dangerous direction: erasure would continue to report
success while leaving a departed user's text on the site. If versions ever need capping, the
erasure remedy has to be settled first, not afterwards.

## RPO/RTO targets

These are recommended targets to confirm with product and operations owners.

| Scenario                             | Recommended RPO                                 | Recommended RTO                                       | Owner to confirm       |
| ------------------------------------ | ----------------------------------------------- | ----------------------------------------------------- | ---------------------- |
| Single recipe accidentally deleted   | Near-zero if soft-delete restore applies        | Same business day                                     | Product / Eng lead     |
| Application bug corrupts recent rows | 15 minutes or provider PITR granularity         | 2-4 hours                                             | Eng lead               |
| Bad migration affects schema/data    | Last clean pre-migration snapshot or PITR point | 2-6 hours                                             | Eng lead / repo admins |
| Regional database outage             | Deployment-dependent                            | 4-24 hours unless cross-region failover is configured | Operations owner       |

## What PITR means

Point-in-time recovery restores a database to a chosen timestamp by combining a base backup with
Write-Ahead Log records. It is useful when the desired recovery point is after the last daily
snapshot but before a bad event, such as:

- a destructive migration.
- an accidental bulk update/delete.
- a compromised credential modifying data.
- application logic writing corrupt values.

PITR should usually restore to a **new database instance or branch first**, not overwrite
production in place.

## Recovery runbook

### 1. Declare and contain the incident

1. Name an incident lead.
2. Record the symptom, first-known-bad time, suspected cause, and affected users/data.
3. Stop the source of corruption:
   - disable the bad scheduled job.
   - roll back or pause the faulty deploy.
   - revoke exposed credentials if applicable.
   - pause destructive admin scripts.
4. Decide whether soft-delete restore is enough. If yes, use that path and avoid full database
   restore.

### 2. Choose a recovery point

1. Identify the last-known-good timestamp.
2. Identify the first-known-bad timestamp from deploy logs, app logs, provider logs,
   Stripe/Clerk webhook timing, or user reports.
3. Pick a recovery timestamp just before the bad event.
4. Record timezone and precision. Use UTC unless the provider requires otherwise.

### 3. Restore to a new instance

1. In the managed Postgres provider, restore the daily snapshot or PITR timestamp to a **new
   instance/branch/database**.
2. Do not repoint production yet.
3. Create a temporary `DATABASE_URL` for the restored instance.
4. Restrict access to the incident team.

Provider specifics are deployment-dependent. Use the host's documented restore flow for Neon,
Supabase, RDS, or the selected managed Postgres service.

### 4. Verify the restored database

Run checks against the restored instance before promotion:

1. Confirm the app can connect with the restored `DATABASE_URL`.
2. Check Drizzle migration state:
   - inspect the Drizzle migrations table used by `drizzle-orm` migrator.
   - compare applied migrations with committed `drizzle/*.sql`.
3. Run schema sanity checks for critical tables:
   - `users`
   - `groups`
   - `group_members`
   - `recipes`
   - `recipe_versions`
   - `recipe_events`
   - `audit_log`
   - billing tables if Stripe state is affected
4. Run row-count comparisons against the current production database when safe.
5. Spot-check representative records:
   - affected recipe(s).
   - recipe visibility and group membership.
   - soft-delete tombstones.
   - billing subscription/customer rows if the incident touched billing.
6. Verify no unexpected secrets, local test data, or preview data are present.

Example verification queries to adapt:

```sql
select count(*) from recipes;
select count(*) from recipes where deleted_at is not null;
select count(*) from users;
select count(*) from audit_log;
```

### 5. Re-apply erasures (mandatory gate)

**A restored instance must not be promoted until this step passes.** A backup taken before an
account erasure still contains that account. Restoring it resurrects a user who exercised their
right to erasure, silently reinstating personal data that was lawfully deleted — a fresh breach
committed by the recovery itself. See [ADR-0004](./architecture/0004-account-erasure.md) and #678.

`deletion_records` exists precisely so this is answerable after the identifying rows are gone. It
stores a salted SHA-256 of each erased `users.id`, so a restored row can be hashed and matched.

1. Confirm the restored database still carries the tombstones. They are only lost if the restore
   point predates the erasure _and_ the table itself — if `deletion_records` is missing or shorter
   than production's, stop and take the list from production before proceeding.

   ```sql
   select count(*) from deletion_records where completed_at is not null;
   ```

2. Find resurrected subjects. Run this against the restored instance with the **same**
   `DELETION_HASH_SALT` the erasures used; a different salt produces no matches and a false all-clear.

   ```sql
   select u.id
   from users u
   join deletion_records d
     on d.subject_hash = encode(sha256((:salt || ':' || u.id)::bytea), 'hex')
   where d.completed_at is not null;
   ```

3. Re-run the erasure for every id returned, using the normal path
   (`eraseUserAccount(id, { trigger: "admin" })`) so media, cascades and verification all apply.
   Do not hand-delete rows: the ordering is load-bearing.
4. Re-run the query and confirm it returns zero rows. Record the count re-applied in the incident
   notes.
5. Check whether any Cloudinary assets were also restored from a provider-side backup. If so, re-run
   the media purge for those subjects.

Only once this returns clean may the restored instance serve production traffic.

### 6. Repoint the application

1. Schedule a maintenance window if user-visible downtime or lost writes are possible.
2. Put the app into a safe state if the platform supports it, or pause writes at the
   application/provider layer.
3. Update the production `DATABASE_URL` in Vercel to the restored instance.
4. Update any direct migration URL, such as `DATABASE_URL_UNPOOLED` or
   `POSTGRES_URL_NON_POOLING`, if used.
5. Redeploy production.
6. Confirm `/api/health` reports database health.

### 7. Apply pending migrations if needed

If the restore point predates migrations that are still present on `main`:

1. Review `docs/migrations.md` before applying anything.
2. Confirm the restored schema state and committed `drizzle/*.sql` are compatible.
3. Run the normal migration path against the restored database.
4. Prefer forward-fix migrations for partial or bad migrations. Do not edit already-committed
   migration files.
5. If a pending migration is destructive, take another provider snapshot first.

### 8. Smoke test

After repointing:

1. Sign in through Clerk.
2. Load the recipe library for a known user.
3. Open public, private, group, and unlisted/share-token recipe paths as appropriate.
4. Create, edit, delete, and restore a non-critical test recipe.
5. Confirm Cloudinary-backed media still renders.
6. Confirm Stripe billing pages and webhooks if billing data was involved.
7. Confirm PostHog analytics does not block core flows when configured or unconfigured.

### 9. Close out

1. Keep the old production instance read-only until the incident lead confirms no data needs to
   be copied forward.
2. Document the final recovery timestamp, data-loss window, validation evidence, and user
   impact.
3. File follow-up work for missing alerts, insufficient backups, migration guardrails, or
   restore-drill gaps.
4. Rotate database credentials if the incident involved possible credential exposure.

## Pre-destructive-migration backup

Before merging any migration that drops, renames, narrows, or rewrites data:

1. Follow the expand/contract process in [`docs/migrations.md`](migrations.md).
2. Confirm the PR's destructive-change checklist is complete.
3. Take a managed-Postgres snapshot immediately before applying the destructive step.
4. Record:
   - snapshot identifier.
   - migration file(s).
   - deploy SHA.
   - expected rollback/repair plan.
5. Keep the snapshot until the migration has been healthy through one normal business cycle.

## Restore drills

Run a restore drill at least quarterly and after changing database providers or backup settings.

Drill checklist:

1. Restore the latest backup/PITR point to a non-production instance.
2. Connect a disposable local or preview deployment to the restored database.
3. Verify migrations, row counts, auth-dependent reads, and representative recipe flows.
4. **Exercise the erasure gate.** Erase a disposable test account in a pre-production environment,
   restore a backup taken _before_ that erasure, and confirm step 5 of the runbook detects the
   resurrected subject and re-erases it. A gate nobody has ever seen fire is not a control.
5. Measure actual restore time and compare it with the RTO target.
6. Record gaps and update this runbook.

## Erasure and backups

Deleting an account removes it from the live database immediately, but backups taken beforehand
still contain it until they expire. Between those two moments the data is _beyond use_ — retained
only in an immutable backup, restorable only through the runbook above, and re-erased by its
mandatory gate before that instance can ever serve traffic — rather than truly gone.

That window is the **erasure horizon** disclosed to the user, and it is bounded by the longest
retention period in the table above.

> **Not currently recorded.** `deletion_records.backup_horizon_at` exists for this purpose and
> `eraseUserAccount` persists whatever it is given, but the parameter is optional and **neither
> caller supplies it**: the in-app path (`src/server/users/actions.ts`) passes only the trigger and
> notice version, and the Clerk webhook path (`src/server/auth/index.ts`) passes only the trigger.
> The column is therefore `NULL` for every erasure performed so far, and it cannot honestly be
> populated until the retention number above is pinned, since the horizon is computed from it.
> Do not read a `NULL` there as "no backup exposure". The blocking decision is tracked in #855; the
> code change it unblocks is #806. (#805 documented these blockers and is closed — following a
> closed issue here is not evidence the number has been pinned.)

Three consequences:

- The retention numbers above must be **pinned to actual values**, not left as ranges. An honest
  erasure horizon cannot be stated to a user while the longest backup lifetime is unknown.
- Until they are, the deletion notice deliberately states **no** horizon, and no per-deletion record
  exists from which one could be reconstructed afterwards. Both follow from the same unpinned
  number, so pinning it is the single unblocking step.
- Backups are deliberately not selectively edited. Surgically removing a user from an immutable
  backup would compromise its integrity as a recovery artifact, which is why re-application on
  restore is the control instead.

_Related issues: #257, #678, #855 (pin the retention number — blocking), #806 (record the horizon)._
