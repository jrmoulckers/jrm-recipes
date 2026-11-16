# Database backup and recovery

Heirloom stores application data in Postgres through `DATABASE_URL`, Drizzle ORM, and generated
SQL migrations in `drizzle/*.sql`. The Drizzle schema source of truth is
`src/server/db/schema/`, with `drizzle.config.ts` pointing migration output to `./drizzle`.

The last approved production baseline uses Neon history (#855). The independently
operated Azure target is repository preparation only: PostgreSQL 15, B2s, seven-day
automated backups, no HA and private access. No database or recovery copy was
provisioned by this change. See [reversible hosting](reversible-hosting.md).

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

> **Historical approved production setting (#855): Neon's History window is 6 hours (21,600 seconds).**
> A human confirmed the saved production setting and chose to keep it. At that approval,
> Neon history was the only production database recovery copy, with no separate retained backups.
> The longer periods below remain recommendations, not claims about deployed snapshots.

| Backup type                        | Recommended retention                                              | Notes                                                                     |
| ---------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Separate automated daily snapshots | 14-30 days _(recommended; not deployed)_                           | Would extend recovery and the erasure horizon if introduced.              |
| Neon history / PITR                | 6 hours _(historically approved; reverify before relying on it)_   | Shorter than the recommended 7-14 days for slow-discovered corruption.    |
| Pre-destructive-migration snapshot | Explicit reviewed expiry covering the migration observation window | Required before risky schema/data changes; inventory and verify disposal. |
| Restore-drill artifacts            | Keep latest drill notes and verification evidence                  | Do not keep exported production data outside approved secure storage.     |

### Configuring the recovery-copy policy

The historical **Neon** baseline has a single **History window** that
retains the restore history for six hours; it is not a separate daily-snapshot policy. The
approved choice trades recovery from slow-discovered corruption for a shorter period of backup
exposure after account erasure. The RPO/RTO targets below remain recommendations, not verified
recovery results; a corruption discovered after six hours may have no recoverable point.

The shared erasure writer now requires explicit `BACKUP_RETENTION_HOURS` covering the
longest rolling recovery copy, validated before database lookup, transactions or
media effects. Six hours is valid only for a verified six-hour-only inventory;
the selected Azure seven-day setting requires at least 168 hours. There is no
provider default. The shared policy also accepts optional `RECOVERY_COPY_EXPIRES_AT`:
a strict valid calendar instant with explicit known UTC offset, not a local date
or RFC3339 unknown offset `-00:00`. New tombstones record the **maximum** of
`completedAt + rolling hours` and that fixed-copy expiry.

Inventory every containing copy: old-source PITR and branches, destination backups
and geo copies, export/staging files, migration runner disks, snapshots and drill
copies. Record each approved retention/expiry and its enforceable disposal evidence.
An absent fixed-copy setting is justified only by a reviewed inventory showing
none lasts later; an unknown source/export expiry blocks promotion, not a reason to
invent a deadline. Changing retention or creating another copy requires reviewing
the bound again and revisiting the deletion notice with qualified legal review.

Preserve all existing deletion records and the SAME salt, including `NULL` unknown
horizons. No startup migration or automatic tombstone rewrite is provided. A newly
created post-erasure dump does not contain a subject merely because it lasts seven
days; an earlier copy may. Review historical cohorts against actual containing
copies and their deadlines. Any authorized reconciliation must only extend known
horizons conservatively from evidence, never shorten them or fill unknowns with
`now + 7 days` / `completedAt + 7 days`. Provider retry and legal-hold evidence must
survive reconciliation. If a valid horizon cannot be established, retain unknown
status and block promotion until resolved.

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

1. Reconcile the restored ledger with a separately secured authoritative erasure
   ledger through the fenced transfer/recovery cutoff. A restore before an
   erasure loses that tombstone even when the table existed; equal row counts do
   not prove matching subjects or evidence. Verify membership and content,
   including completed/held/provider-retry records and unknown horizons, using the
   same salt. Missing authority or unresolved ledger differences block promotion.

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

Only after reconciliation, normal-path erasure and database/media/version/dietary
verification may the restored instance serve traffic. A zero join alone is not
sufficient if the ledger or salt is wrong. Historical tombstones remain unchanged
on conflict; policy changes do not silently relabel old evidence.

### 6. Repoint the application

1. Schedule a maintenance window if user-visible downtime or lost writes are possible.
2. Completely fence/drain every old writer at origin/provider and database role/session
   boundaries, including webhooks, Server Actions, lazy-read writes and cron.
   An Azure-only setting cannot fence old unavailable Vercel code; inability to
   demonstrate the fence blocks a lossless transition. Validate retry/replay for
   external events; never acknowledge dropped events as successful.
3. Update `DATABASE_URL` in the active host's approved private configuration store.
4. Update any direct migration URL, such as `DATABASE_URL_UNPOOLED` or
   `POSTGRES_URL_NON_POOLING`, if used.
5. Redeploy production.
6. Confirm `/api/health` reports database health and complete functional checks before
   releasing the fence and promoting exactly one scheduler. Dependency-free
   `/api/health/live` alone does not establish DB readiness.
7. After new writes, the old database is stale. Switching back needs secure connectivity
   to the authoritative private DB or another fenced, verified reverse transfer,
   including erasure reconciliation. Never run two independently writable authorities.

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
3. Take a managed-Postgres snapshot immediately before applying the destructive step. This is a
   required pre-migration safeguard, **not** an assertion that separately retained snapshots
   exist in the current production configuration; do not perform a destructive migration without
   confirming the snapshot is available and its retention is included in the erasure horizon.
4. Record:
   - snapshot identifier.
   - migration file(s).
   - deploy SHA.
   - expected rollback/repair plan.
5. Agree an explicit snapshot expiry and include it in the recovery-copy inventory
   before creation. Keep it through the reviewed verification period, then verify
   disposal; do not extend it silently.

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

For new erasures, `deletion_records.backup_horizon_at` records the upper bound
the validated rolling/fixed-copy maximum inside the shared transaction, whether deletion came from the app,
Clerk, or legacy-hold replay (#806). Earlier rows can remain `NULL`: their historical setting
is unknown, so today's policy must not be backfilled automatically. A null does **not** mean there
was no backup exposure.

The user-facing deletion notice still states no numeric backup horizon. Updating its versioned
copy in all locales requires qualified legal and localization review; recording the database
horizon does not itself approve that wording. Backups are not selectively edited: re-application
on restore is the control that prevents erased data from serving traffic.

### Dietary profiles and assessments

ADR-0011 dietary data uses this same database and restore boundary. There is no separate dietary
backup and no shorter promise that bypasses the reviewed recovery-copy inventory.

Restore verification and `assertUserErased` coverage include the profile-personal and
actor-attributed dietary tables introduced by #1101. Re-applying an erasure must:

- delete profiles, custom restrictions, personalized assessments, and private corrections;
- retain only schema-constrained current built-in recipe facts/corrections with no personal text or
  context, remove their erased-user attribution, and delete any private, free-text, or identifying
  correction content even when the ADR-0009 recipe survives;
- confirm no retained row contains a profile id, custom-restriction id/name, severity, personalized
  verdict, or hidden subject/manager linkage;
- preserve only aggregate dietary deletion/retention counts in `deletion_records`.

Browser model, worker, analysis, IndexedDB, and personalized recipe-page caches are outside the database.
They are handled by the account-bound cleanup coordinator landed in #1109 and
[`docs/privacy/dietary-retention-and-rights.md`](./privacy/dietary-retention-and-rights.md), not by
database restore.

Configuring a database horizon does not clear qualified legal review of dietary deletion
copy or the outstanding restore/erasure drill evidence required for production.

_Related issues: #257, #678, #806, #855, and #1106._
