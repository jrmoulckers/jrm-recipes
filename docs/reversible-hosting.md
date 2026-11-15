# Reversible hosting

This is **preparation, not activation** ([#1261](https://github.com/jrmoulckers/jrm-recipes/issues/1261)).
Azure Container Apps and a separately owned PostgreSQL instance form an independent
target: no Vercel deployment, runtime or database-management dependency. Preserve
production data and identities through a separately authorized transfer, retain
Cloudinary, Clerk, Stripe and PostHog, and keep the canonical HTTPS domain unchanged.
Native Vercel is a potential later target, not a prerequisite or available rollback.

The initial preparation was published as [#1262](https://github.com/jrmoulckers/jrm-recipes/pull/1262)
under separate approval accepting possible preview attempts. The independent-database
delta remains local-only until separately authorized. Neither approval authorizes
merge, provisioning, secret access, data transfer, deployment, DNS or activation.
The independent [#1260](https://github.com/jrmoulckers/jrm-recipes/pull/1260)
quota-policy proposal owns Git-deployment suppression, warming/watcher removal and
bounded production verification. This preparation neither activates nor replaces it.
Do not infer suppression from an older branch's configuration.

## Release inputs

`src/config/deployment.js` is the release contract. Every production host sets
`APP_ENV=production` (Vercel's `VERCEL_ENV=production` also qualifies).
`SKIP_ENV_VALIDATION`, dev-auth bypass and the E2E identity selector are forbidden
on production, including standalone builds. Marker-free local/CI builds remain
zero-config; they are not deployment artifacts.

Set `SOURCE_REVISION` to the exact full lowercase Git SHA. A platform-provided
`VERCEL_GIT_COMMIT_SHA` or `GITHUB_SHA` must agree. Release build ID, deployment ID,
PWA revision and `/api/health/live` all identify that revision. Image digest,
native Vercel deployment ID and rollback target ID must be recorded separately:
the source SHA is not proof two independent artifacts are byte-identical.

Supply `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` as the **same base64-encoded 32-byte
secret** at build and runtime on prepared targets. A human must arrange the secret
through approved stores before this change is activated on Vercel. Docker reads it
through a BuildKit secret mount, never an ARG; only a one-way digest enters the
private build contract. Treat images as private artifacts: Next's server output
contains sensitive server-action material. Do not publish images publicly.

All eleven `NEXT_PUBLIC_*` release values enumerated in `publicBuildVariables`
are build inputs, not runtime switches. Use identical public configuration for
the native Vercel and container builds. Unused optional values must be identically
unset. `NEXT_PUBLIC_APP_URL` stays the canonical HTTPS origin even on a prepared
target; optional `NEXT_PUBLIC_SITE_URL` must match that host/origin. Changing any
of these values requires rebuilding. Container startup refuses revision, public
configuration or Actions-key drift.

Keep server-only integration settings in each host's approved secret/config store:
database, Clerk, Cloudinary, Stripe webhook/billing, email, analytics server access,
deletion salt and cron secret. Map the existing enabled features completely; the
startup minimum (DB and Clerk) does not prove optional integrations are configured.
Never read real `.env` files to create a build context. `.dockerignore` is allowlisted.

## Build and infrastructure preparation

Use the repository-pinned pnpm and Node versions. The Dockerfile builds on Debian
Node 24.15.0, copies standalone tracing output, static and generated public assets,
and runs as `node`. It does not migrate or install anything at replica startup.
The build requires the same eleven public build arguments plus `SOURCE_REVISION`.

Approved release tooling supplies the Actions key as:
`--secret id=actions_key,env=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`.
For private package restore, optionally mount an approved npm configuration with
`--secret id=npmrc,src=YOUR_APPROVED_TEMP_CONFIG`; never pass a token ARG.
Record the resulting immutable image digest, build log, source revision and public
configuration fingerprint. Pin/review the base image digest in release tooling
before publication; the Dockerfile's version tag alone is not immutable.

`infra/azure/main.bicep` targets an **existing reviewed resource group, managed
environment, registry, managed identity and Key Vault**. It does not establish
their networking, grants, cost controls or compliance. Parameters contain references,
not secret values:

| Input                                           | Meaning                                                                      |
| ----------------------------------------------- | ---------------------------------------------------------------------------- |
| `location`                                      | Human-selected region; no default regional assumption                        |
| `imageRepository`, `imageDigest`                | Approved private registry repository and SHA-256 digest (not a tag)          |
| `environmentId`, `identityId`, `registryServer` | Existing approved resources and registry pull identity                       |
| `sourceRevision`, `publicEnvironment`           | Exact build inputs                                                           |
| `secretReferences`                              | `{name, keyVaultUrl, envName}` for runtime secrets, including Actions key    |
| `schedulerOwner`, `enableSchedules`             | Default `none` and `false`; web ownership and job triggering must agree      |
| `minReplicas`                                   | 0 by default; 1 only after cold-start/cost review; maximum remains 1         |
| `backupRetentionHours`                          | Required reviewed longest rolling bound, at least 168 for this Azure adapter |
| `recoveryCopyExpiresAt`                         | Required review input; empty only after inventory proves no later fixed copy |

Use a unique prepared app name of 3-10 characters so suffixed job names stay bounded.
The template runs 0.5 vCPU/1 GiB web compute with
single active revision, max one replica, HTTPS ingress, independent startup/liveness
probes and database readiness. Readiness allows five seconds, beyond the application's
two-second database deadline; startup allows ten failures at thirty-second intervals.
These custom probe thresholds stay within the API reference's published maximum of ten;
platform-injected defaults are not assumed to be valid custom settings.
Jobs use 0.25 vCPU/0.5 GiB, concurrency one per
execution, zero retries and a 600-second timeout. There is no global job-overlap
lease: drain/inspect executions during transfer and do not manually overlap runs.
Do not raise replica limits without reviewing process-local rate limiting.
Disable unwanted revision traffic explicitly; never rely on a weighted overlap.

Do not apply the template until access, location, resource choices, registry
publication and secrets are separately approved. Run Bicep build and a human-reviewed
what-if before deployment; compilation does not establish resource availability or grants.
Scheduler jobs receive only the cron secret reference, owner, target and revision;
they do not need database, Clerk or Actions secrets.

## Independent private database preparation

`infra/azure/private-data.bicep` prepares NEW resources only. Do not point its
names at the existing foundation: the current non-VNet ACA environment cannot
change network type. Keep that environment, registry, vault and runtime identity
untouched. Feed the new `environmentId` output to the app template. Reuse the
approved registry/vault identity by reference; AcrPull/Secrets User do not grant
PostgreSQL login.

Required non-secret parameters are `location`, `virtualNetworkName`,
`virtualNetworkCidr`, `appSubnetName`, `appSubnetCidr`, `postgresSubnetName`,
`postgresSubnetCidr`, `environmentName`, `infrastructureResourceGroupName`,
`postgresServerName`, `postgresPrivateDnsZoneName`, `postgresAdministratorLogin`,
`postgresStorageSizeGB` and `geoRedundantBackup`. None has a default.
`postgresAdministratorPassword` is a secure private-entry parameter, never a
checked-in parameter value or output. Prepare least-privilege runtime and migration
roles separately; never use the administrator connection as `DATABASE_URL`.

The template selects PostgreSQL 15 / Standard_B2s / Burstable, seven-day automated
backups and HA Disabled. B2s CPU-credit limits and restore downtime are real:
backups are not HA. **32 GiB remains proposed**, not approved; storage and geo-backup
redundancy require explicit review. Validate actual regional API/SKU/storage and
redundancy availability before provisioning; local compilation cannot establish them.
Production eligibility/terms for the supplied subscription remain a human prerequisite.

The new external-ingress workload-profiles environment uses Consumption. Its ACA
subnet is exclusively delegated to `Microsoft.App/environments` (/27 or larger);
the distinct PG subnet exclusively to `Microsoft.DBforPostgreSQL/flexibleServers`
(/28 or larger). Review CIDR validity, containment, non-overlap with each other and
connected networks, name availability and required outbound service access before
deployment. Azure validates network parameters; compilation alone does not.
Private PG uses a linked private DNS zone ending `.postgres.database.azure.com`
and disables public access. No allow-Azure firewall, NAT, VPN, Bastion or migration
runner is added. The existing ACA ingress IP is not an outbound firewall address.
Private app-to-DB traffic alone does not require NAT.

Azure creates the separately named **managed infrastructure resource group** and
billable load-balancer/public-IP components for custom-VNet ACA. This is a side
effect beyond the target resource group, requiring explicit approval. The parent
planning example at 730 hours was USD25.55/month for that network infrastructure
and USD78.87 including B2s/proposed32GiB, before app, registry, vault, DNS, traffic,
logs and other charges. These are review estimates, not a live quote or spend cap.

Migration requires a separately authorized runner with private routing and DNS,
direct source connectivity, encrypted transport and approved temporary storage.
No data-copy tool executes from this template. Preserve users, Clerk/Stripe IDs,
media ownership, the Drizzle journal, deletion records and the SAME deletion salt.
The template allowlists `pg_trgm`/`pgcrypto` through `azure.extensions` for the
existing migrations. Verify PG15 compatibility, actual extension availability, TLS and role grants
before applying reviewed migrations explicitly, never at replica startup.

Set `BACKUP_RETENTION_HOURS` to the longest verified rolling bound (selected Azure
backup setting is 168 hours), not simply the target's setting if other copies last
longer. Optionally set `RECOVERY_COPY_EXPIRES_AT` to the latest reviewed expiry of
fixed source/export/snapshot copies, including timezone offset. The shared policy
requires whole hours 1..876000 (a technical 100-year bound, not approved retention),
strict calendar instants with explicit offset, and records the maximum of rolling
completion time and fixed expiry. Production boot and every erasure fail closed
on missing/invalid rolling policy; erasure validates before DB/media effects.
Marker-free builds still work without it; actual local erasure requires it.
An omitted fixed expiry means an inventory established there is no later containing
copy, NOT that unknown copies expired. Unknown/unbounded expiry is a promotion blocker.
See [backup recovery](db-backup-and-recovery.md) for historical-cohort reconciliation.

## Scheduler ownership

`vercel.json` remains the authoritative five UTC schedules:

| Task                 | UTC cron     |
| -------------------- | ------------ |
| Digest               | `0 14 * * 1` |
| Cook-along reminders | `0 15 * * *` |
| Food graph           | `0 8 * * *`  |
| Erasure backlog      | `0 9 * * *`  |
| Dietary retention    | `0 10 * * *` |

Every endpoint requires the existing exact bearer secret **and** active owner.
Vercel defaults to `vercel` ownership; all other hosts default `none`. Azure jobs
send `x-heirloom-scheduler: azure`, verify the prepared target's revision, then
make one bounded request without redirects or automatic retry. Vercel's headerless
cron requests are accepted only on the active Vercel owner.

Transfer: set old host `CRON_OWNER=none`, disable its provider triggers, wait for
in-flight executions, verify no active work, then set the new web owner and enable
its five triggers. Azure requires both `schedulerOwner=azure` and
`enableSchedules=true`; otherwise jobs stay manual. On any uncertainty leave both
off and reconcile missed windows from task logs before re-enabling. Ownership env
vars cannot stop two independently misconfigured hosts; this is an operational
interlock, not an exactly-once guarantee. A dry rehearsal never calls mutating
business routes against production.

## Prepared-target rehearsal

Use synthetic/non-production integration accounts and data unless separately
approved. Do not probe production as part of repository preparation.

1. Build the independent target from a recorded SHA; verify parity with any other prepared artifact.
2. Start the target with scheduling disabled. `/api/health/live` must report that
   SHA without DB/Clerk network access; `/api/health` must pass its database probe.
   A live probe is not readiness. Exercise invalid startup inputs and confirm refusal.
3. Check traced fonts, optimized images/sharp, static chunks, generated Serwist
   worker/offline fallbacks, OCR assets and dietary runtime modules. Browser-test
   sign-in/callback, recipe read/write, import/upload, cook mode, offline/update,
   consent and `/ingest` proxy on the target. Existing external media stays external.
4. With approved test provider settings, exercise Clerk and Stripe signed webhooks,
   billing return URLs and CSP. Nonce CSP, signature checks and auth remain unchanged;
   allowlist the prepared host where providers require it. Never weaken canonical
   origin/CSRF checks to make a rehearsal pass.
5. Test a stale tab/Server Action across the switch. Shared key, build ID and source
   reduce skew; independently built action manifests can still differ. Expect
   controlled reload/retry on deployment skew, not transparent in-flight action
   replay. Never replay a payment or mutation blindly.
6. Record start/end timestamps, artifact IDs, checks, failures and rollback time.
   Fifteen minutes is a **measurement target**, not a promise or DNS guarantee.

The container disables Next's persistent data cache and in-memory incremental
cache. This prevents cross-replica invalidation assumptions; it increases DB reads.
Image optimization caches and temporary files remain ephemeral. No user upload or
durable state may depend on the container filesystem. Browser offline stores are
not deleted on host transfer; preserve the service-worker scope and canonical domain.
Native Vercel retains its native cache, so check stale content explicitly on rollback.
The existing DB client has a small per-process pool; jobs/revision overlap still
multiply connections and must be budgeted.

## Switch and rollback

Before any real switch, a human approves DNS/domain/TLS, provider changes,
publication/deployment, scheduler transfer and production verification. Pre-attach
the canonical domain/certificate and review TTL/verification requirements on both
providers. Keeping the same URL avoids changing auth redirects, Stripe returns,
webhook destinations and browser origin storage.

Freeze releases; record the old and prepared immutable targets. Confirm DB
migrations are backward-compatible with **both** retained application revisions.
Use expand/contract migrations in a separate approved release step; defer destructive
contract changes until the rollback window closes. Container replicas never migrate.
Any later native Vercel migration-on-build path must be coordinated as that one
release step, not independently raced against Azure. Restoring an old image does
not restore a schema or roll back data.

**Fence all old writers before final transfer**, not only schedules: old ingress,
Server Actions, GET cron routes, lazy-read writes, signed webhooks, background
workers, direct DB clients and in-flight work. An Azure-only setting cannot fence
unavailable old Vercel code. Use separately approved origin/provider controls and
DB runtime-role fencing/session termination while retaining a separate export
role. A default read-only transaction setting is not a hard fence and does not
prevent pre-DB external effects. If complete fencing cannot be demonstrated,
lossless cutover is blocked. Do not claim this repository implements that fence.
During the window, use retryable 503/Retry-After with verified provider replay or
an approved durable queue; never return 2xx while dropping a webhook.

Take the final consistent transfer only after fencing/draining, compare required
data and identifiers, reconcile the authoritative erasure ledger by membership
and content (not counts), reapply erasures and verify readiness/functional checks.
Keep one writable authority; independent writable databases do not synchronize.
Then perform the approved traffic/domain switch. Check forwarded host/protocol,
secure cookies, canonical links, CSP, signed webhooks, uploads, analytics proxy
and data writes. Enable exactly one scheduler only after traffic settles.

Once Azure accepts writes, the old Neon database is stale. Returning requires
either separately designed secure Vercel-to-private-PG connectivity, or a separately
authorized reverse transfer: fence/drain Azure, transfer/catch up all accepted
writes and erasures, verify identities/media/ledger/schema and only then promote
the destination and one scheduler. A traffic-only reversal loses data. Before
Azure accepts any writes, a source return still requires verified source health,
fence release and webhook reconciliation. Never rebuild an arbitrary old branch,
run down migrations or assume Vercel recovers after thirty days. No fifteen-minute
switch is promised without prepared connectivity, readiness and measured data evidence.

## Cost and human decisions

The stated monthly allowance is a planning input, **not an enforceable ceiling**.
Choose subscription/access scope, region, compute, minimum replicas, environment,
registry, Key Vault, logs retention, networking and domain/TLS with a human.
Estimate web active/idle CPU and memory, job active seconds, requests, image storage,
log ingestion/retention, egress and existing service charges separately.

[Azure billing](https://learn.microsoft.com/en-us/azure/container-apps/billing)
free grants are subscription-wide; minimum replicas are not automatically idle,
and job execution uses active rates. Optional environment/network features can
add management charges. Validate a regional estimate against current public meters
and actual workload before provisioning. No regional price or total is guaranteed
by this template.

[Budget alerts](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/tutorial-acm-create-budgets)
do not stop consumption; data can lag. Set alerts below the allowance, restrict
scaling and log retention, and agree a human response/stop procedure. There is no
automatic provider hopping or spend cutoff here.
