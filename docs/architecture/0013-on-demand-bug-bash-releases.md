# ADR-0013: On-demand bug-bash release batches

- **Status:** Proposed; human activation required
- **Issue:** [#1259](https://github.com/jrmoulckers/jrm-recipes/issues/1259)
- **Amends:** [ADR-0012](0012-reported-bug-fast-lane.md) delivery cadence and
  timing only; its classifier and quality gates remain unchanged.

## Context

Per-fix main merges produce production candidates as well as PR previews.
Merging nearby commits does not guarantee one Vercel build. The prior warming
schedule offered 72 runs/day before retries; the watcher also polled hourly and
up to 20 times per successful deployment. Each health request can wake Neon.
These are configured opportunities, not measured executions or account usage.
The precise exhausted quota and hosting-resumption conditions are unmeasured.

## Decision

Prepare on-demand tested batches in one isolated integration session per release.
Per-bug children keep their own issues, branches, regression evidence and PRs,
targeting the explicitly authorized integration branch. One fully tested
integration PR targets current `main`, which remains Vercel's production branch.
Do not introduce a permanent shared staging branch or a new release controller.

Use the supported `git.deploymentEnabled` branch policy to suppress automatic
non-main deployments. Remove scheduled warming and hourly drift polling. Keep
failed-production reporting, one bounded health request per successful-production
event, and deliberate manual diagnostics. Require exact served SHA and healthy
database, not ancestry or HTTP 200 alone. Retain all five business/privacy crons.

The executable human-gated procedure lives in the
[bug loop](../bug-loop.md#on-demand-bug-bash-releases); activation and bootstrap
constraints live in [DEPLOY](../../DEPLOY.md#quota-policy-activation).
The fifteen-minute target now ends at validated fix / PR readiness, not live.

## Consequences

This reduces intended main updates for selected fixes and removes recurring
diagnostic traffic; it does not cap total builds, account usage or user traffic.
CI still tests every fix PR and the integrated batch. Release Please remains
versioning automation, not the deployment controller.

There are no automatic per-fix preview URLs. Local production builds and CI
browser checks replace that iteration surface. Cold starts are allowed; there
is no scheduled outage or missing-deployment detection. The release owner must
notice a missing event and choose the bounded manual check. Propagation can
produce a first-check failure; a deliberate later diagnosis costs another
request and never erases first-attempt acceptance evidence.

Old branch configuration, outstanding deployments and dashboard overrides need
separate human review. Merging this preparation is itself deployment-affecting
and is not authorized by preparing it. Existing withheld/live-pending campaign
items gain no acceptance credit from this policy.
