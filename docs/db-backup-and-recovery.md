# Database backup and recovery

Heirloom stores application data in Postgres through `DATABASE_URL`, Drizzle ORM, and generated SQL migrations in `drizzle/*.sql`. The Drizzle schema source of truth is `src/server/db/schema/`, with `drizzle.config.ts` pointing migration output to `./drizzle`.

The production database host is deployment-dependent. The recommendations below assume managed Postgres with automated backups and point-in-time recovery, such as Neon, Supabase, or RDS, without requiring one specific provider.

## First-line recovery: soft deletes

Before restoring a database, check whether the data was soft-deleted.

Recipes use `deletedAt`/`deletedBy` tombstones instead of immediate hard deletion. `src/server/recipes/mutations.ts` includes owner-guarded delete and restore paths, and read queries filter tombstoned rows while preserving child history.

Use soft-delete recovery first when:

- a user accidentally deleted a recipe;
- recipe versions, events, ratings, or comments still exist;
- the issue affects one or a small number of rows;
- no schema or broad data corruption occurred.

Use backup/PITR only when soft-delete restore is insufficient, data was hard-deleted, many rows were corrupted, or a migration/application bug changed data broadly.

## Backup strategy

Recommended production baseline:

1. Use managed Postgres automated backups.
2. Enable **daily snapshots**.
3. Enable **continuous WAL archiving / PITR** where the host supports it.
4. Keep backups in the same region for fast restore and, if supported by the provider, an additional cross-region or logically separate copy for disaster recovery.
5. Protect backup administration with SSO/MFA and least-privilege access.

Local Docker Postgres from `docker-compose.yml` is for development only and is not a production backup strategy.

## Retention recommendation

Fill in the final retention policy for the chosen managed Postgres host.

| Backup type | Recommended retention | Notes |
| --- | --- | --- |
| Automated daily snapshots | 14-30 days | Enough to catch most accidental deletion/corruption reports. |
| PITR/WAL window | 7-14 days minimum | Larger windows improve recovery from slow-discovered corruption. |
| Pre-destructive-migration snapshot | Keep until the migration has been healthy through one normal business cycle | Required before risky schema/data changes. |
| Restore-drill artifacts | Keep latest drill notes and verification evidence | Do not keep exported production data outside approved secure storage. |

## RPO/RTO targets

These are recommended targets to confirm with product and operations owners.

| Scenario | Recommended RPO | Recommended RTO | Owner to confirm |
| --- | --- | --- | --- |
| Single recipe accidentally deleted | Near-zero if soft-delete restore applies | Same business day | Product / Eng lead |
| Application bug corrupts recent rows | 15 minutes or provider PITR granularity | 2-4 hours | Eng lead |
| Bad migration affects schema/data | Last clean pre-migration snapshot or PITR point | 2-6 hours | Eng lead / repo admins |
| Regional database outage | Deployment-dependent | 4-24 hours unless cross-region failover is configured | Operations owner |

## What PITR means

Point-in-time recovery restores a database to a chosen timestamp by combining a base backup with Write-Ahead Log records. It is useful when the desired recovery point is after the last daily snapshot but before a bad event, such as:

- a destructive migration;
- an accidental bulk update/delete;
- a compromised credential modifying data;
- application logic writing corrupt values.

PITR should usually restore to a **new database instance or branch first**, not overwrite production in place.

## Recovery runbook

### 1. Declare and contain the incident

1. Name an incident lead.
2. Record the symptom, first-known-bad time, suspected cause, and affected users/data.
3. Stop the source of corruption:
   - disable the bad scheduled job;
   - roll back or pause the faulty deploy;
   - revoke exposed credentials if applicable;
   - pause destructive admin scripts.
4. Decide whether soft-delete restore is enough. If yes, use that path and avoid full database restore.

### 2. Choose a recovery point

1. Identify the last-known-good timestamp.
2. Identify the first-known-bad timestamp from deploy logs, app logs, provider logs, Stripe/Clerk webhook timing, or user reports.
3. Pick a recovery timestamp just before the bad event.
4. Record timezone and precision. Use UTC unless the provider requires otherwise.

### 3. Restore to a new instance

1. In the managed Postgres provider, restore the daily snapshot or PITR timestamp to a **new instance/branch/database**.
2. Do not repoint production yet.
3. Create a temporary `DATABASE_URL` for the restored instance.
4. Restrict access to the incident team.

Provider specifics are deployment-dependent; use the host's documented restore flow for Neon, Supabase, RDS, or the selected managed Postgres service.

### 4. Verify the restored database

Run checks against the restored instance before promotion:

1. Confirm the app can connect with the restored `DATABASE_URL`.
2. Check Drizzle migration state:
   - inspect the Drizzle migrations table used by `drizzle-orm` migrator;
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
   - affected recipe(s);
   - recipe visibility and group membership;
   - soft-delete tombstones;
   - billing subscription/customer rows if the incident touched billing.
6. Verify no unexpected secrets, local test data, or preview data are present.

Example verification queries to adapt:

```sql
select count(*) from recipes;
select count(*) from recipes where deleted_at is not null;
select count(*) from users;
select count(*) from audit_log;
```

### 5. Repoint the application

1. Schedule a maintenance window if user-visible downtime or lost writes are possible.
2. Put the app into a safe state if the platform supports it, or pause writes at the application/provider layer.
3. Update the production `DATABASE_URL` in Vercel to the restored instance.
4. Update any direct migration URL, such as `DATABASE_URL_UNPOOLED` or `POSTGRES_URL_NON_POOLING`, if used.
5. Redeploy production.
6. Confirm `/api/health` reports database health.

### 6. Apply pending migrations if needed

If the restore point predates migrations that are still present on `main`:

1. Review `docs/migrations.md` before applying anything.
2. Confirm the restored schema state and committed `drizzle/*.sql` are compatible.
3. Run the normal migration path against the restored database.
4. Prefer forward-fix migrations for partial or bad migrations; do not edit already-committed migration files.
5. If a pending migration is destructive, take another provider snapshot first.

### 7. Smoke test

After repointing:

1. Sign in through Clerk.
2. Load the recipe library for a known user.
3. Open public, private, group, and unlisted/share-token recipe paths as appropriate.
4. Create, edit, delete, and restore a non-critical test recipe.
5. Confirm Cloudinary-backed media still renders.
6. Confirm Stripe billing pages and webhooks if billing data was involved.
7. Confirm PostHog analytics does not block core flows when configured or unconfigured.

### 8. Close out

1. Keep the old production instance read-only until the incident lead confirms no data needs to be copied forward.
2. Document the final recovery timestamp, data-loss window, validation evidence, and user impact.
3. File follow-up work for missing alerts, insufficient backups, migration guardrails, or restore-drill gaps.
4. Rotate database credentials if the incident involved possible credential exposure.

## Pre-destructive-migration backup

Before merging any migration that drops, renames, narrows, or rewrites data:

1. Follow the expand/contract process in [`docs/migrations.md`](migrations.md).
2. Confirm the PR's destructive-change checklist is complete.
3. Take a managed-Postgres snapshot immediately before applying the destructive step.
4. Record:
   - snapshot identifier;
   - migration file(s);
   - deploy SHA;
   - expected rollback/repair plan.
5. Keep the snapshot until the migration has been healthy through one normal business cycle.

## Restore drills

Run a restore drill at least quarterly and after changing database providers or backup settings.

Drill checklist:

1. Restore the latest backup/PITR point to a non-production instance.
2. Connect a disposable local or preview deployment to the restored database.
3. Verify migrations, row counts, auth-dependent reads, and representative recipe flows.
4. Measure actual restore time and compare it with the RTO target.
5. Record gaps and update this runbook.

_Related issue: #257._
