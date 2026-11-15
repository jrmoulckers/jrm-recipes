# ADR 0014: Reversible Node hosting

Status: Proposed; repository preparation only, no provider activated.

Issue: [#1261](https://github.com/jrmoulckers/jrm-recipes/issues/1261).

## Context

Hosting capacity must not tie the product to one provider. Azure Container Apps is
the first alternative. Its database must be separately operated, without Vercel
deployment, runtime or database-management dependencies. Preserve existing data
and external media, identity, billing and analytics integrations. Native Vercel is
only a potential future compute target, not a prerequisite or currently usable rollback.

## Decision

Package standard Next.js standalone Node output in a non-root container. Identify
both builds by a full source SHA, stable canonical origin, matching public build
configuration and shared Server Actions encryption key. Refuse mismatched container
startup; production deployment markers cannot be overridden by CI escape flags.
Use dependency-free liveness separately from database readiness.

Keep the initial Azure application to one active revision and at most one replica.
Disable its persistent Next data cache rather than introducing a distributed cache.
The existing process-local rate limiter is not made distributed by this decision.
Use standard postgres-js/Drizzle against separately owned PostgreSQL. Prepare a
new VNet-integrated workload-profiles ACA environment (Consumption), separate
delegated ACA/PostgreSQL subnets and private PostgreSQL DNS. The existing
non-VNet rehearsal environment cannot change network type and stays untouched.
Select PostgreSQL 15, Burstable B2s (2 vCPU/4 GiB), seven-day automated backups
and no HA. Burstable CPU credits and single-server outage/restore limitations
were accepted for configuration preparation, not provisioning. Storage size,
backup redundancy, network ranges/names and recovery-copy expiry remain review inputs.

Require an explicit provider-independent rolling recovery bound and optionally
the latest offset-aware fixed-copy expiry; record their maximum for new erasures.
Validate before database/media effects. No six-hour or seven-day fallback is safe.
Preserve historical tombstones, unknown NULL horizons and the existing hash salt;
do not rewrite cohorts automatically. An unknown source/export expiry blocks promotion.

Preserve all five schedules from `vercel.json`. Azure jobs are manual by default.
Endpoint ownership and sender checks supplement the existing shared bearer secret;
operators transfer scheduling break-before-make. Configuration is not a distributed
lease and does not promise exactly-once execution.

Migrations remain an explicit release operation outside container startup. Every
switch requires compatibility with the retained target's application/schema.
Data-preserving cutover additionally requires complete old-writer fencing,
private-network migration access, authoritative erasure reconciliation and one
writable database. Independently writable databases are not synchronized.
There is no source maintenance guard in this change.

## Consequences

The same source is portable; the native Vercel artifact is not the image. No automatic
provider hopping, executed database move, guaranteed fifteen-minute switch, or assumed account
quota recovery is introduced. Returning after Azure writes requires secure connectivity
to the private database or a fenced, reconciled reverse transfer; the old Neon copy
is stale immediately. Custom-VNet ACA creates a separate managed infrastructure
resource group and billed load-balancer/IP infrastructure. No speculative NAT,
VPN, Bastion, public database access or migration runner is provisioned.
Cold starts and additional database reads are accepted
in exchange for a smaller correctness surface. Scaling beyond one replica requires
distributed rate limiting and an independently reviewed cache strategy.

See the [runbook](../reversible-hosting.md) for preparation, rehearsal, transfer,
rollback, outstanding decisions and integration with the quota-policy proposal.
