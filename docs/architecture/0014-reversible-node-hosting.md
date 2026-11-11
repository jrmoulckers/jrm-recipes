# ADR 0014: Reversible Node hosting

Status: Proposed; repository preparation only, no provider activated.

Issue: [#1261](https://github.com/jrmoulckers/jrm-recipes/issues/1261).

## Context

Hosting capacity must not tie the product to one provider. Azure Container Apps is
the first alternative, not a migration of database, media, identity, billing or
analytics. Native Vercel remains a separately built rollback target.

## Decision

Package standard Next.js standalone Node output in a non-root container. Identify
both builds by a full source SHA, stable canonical origin, matching public build
configuration and shared Server Actions encryption key. Refuse mismatched container
startup; production deployment markers cannot be overridden by CI escape flags.
Use dependency-free liveness separately from database readiness.

Keep the initial Azure application to one active revision and at most one replica.
Disable its persistent Next data cache rather than introducing a distributed cache.
The existing process-local rate limiter is not made distributed by this decision.
Keep durable user data in the existing external services.

Preserve all five schedules from `vercel.json`. Azure jobs are manual by default.
Endpoint ownership and sender checks supplement the existing shared bearer secret;
operators transfer scheduling break-before-make. Configuration is not a distributed
lease and does not promise exactly-once execution.

Migrations remain an explicit release operation outside container startup. Every
switch requires compatibility with the retained target's application/schema.

## Consequences

The same source is portable; the native Vercel artifact is not the image. No automatic
provider hopping, database move, guaranteed fifteen-minute switch, or assumed account
quota recovery is introduced. Cold starts and additional database reads are accepted
in exchange for a smaller correctness surface. Scaling beyond one replica requires
distributed rate limiting and an independently reviewed cache strategy.

See the [runbook](../reversible-hosting.md) for preparation, rehearsal, transfer,
rollback, outstanding decisions and integration with the quota-policy proposal.
