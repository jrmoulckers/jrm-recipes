# CI: what runs, and when green is not green

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) is the quality gate. Vercel
deploys from `main`, so this workflow is the last thing standing between a change
and production.

## What runs

| Trigger                                   | What runs                                                       |
| ----------------------------------------- | --------------------------------------------------------------- |
| Push to `main` or `staging`               | The full gate.                                                  |
| **Every pull request, whatever its base** | The full gate.                                                  |
| `workflow_dispatch`                       | The full gate, but only for the verified Release Please branch. |

Jobs: `Verify dispatch source`, `Quality` (lint, format, semantic PR title),
`Security` (package audit, secret scan), `Copy and i18n guards`, `Web`
(typecheck, unit tests, production build), `Performance`, `Migration drift`,
`Migrations`, `E2E`, `Lighthouse`, plus two jobs that exist to make the signal
readable: `Base freshness` and `Quality gate`.

## Why the pull request trigger has no branch filter

It used to be `pull_request: branches: [main]`, so a PR based on any other branch
ran **none** of the above.

The problem was not the missing checks. It was that their absence presented as
**success**. Vercel and its preview comment are not GitHub Actions, so they
reported regardless, and a stacked PR showed a green check list and
`MERGEABLE`. PR #670 was green for as long as it was stacked and failed the
first-load JS budget the moment it was retargeted at `main`.

Running the gate on every PR costs runner minutes on stacked work. That is the
intended trade: a stacked PR is exactly the PR nobody has validated.

**If you stack a PR,** the gate now runs — but it validates your branch merged
into _its own base_, not into `main`. The `Base freshness` job says so in the run
summary. Retarget at `main` before merging.

## Three ways a green check list still lies

### 1. Stacked PR — fixed

Closed by removing the branch filter. A non-`main`-based PR now runs the same
jobs as any other.

### 2. Conflicting PR — no run at all

When a PR conflicts with its base, GitHub cannot build `refs/pull/N/merge`, so
**no runs are created**. The PR shows no failures because it shows nothing.

No workflow can fix this, because no workflow runs. Two things do:

- Read the mergeability, not just the check list:
  `gh pr view <n> --json mergeable,mergeStateStatus`.
- Required status checks in branch protection. A required check that never runs
  blocks the merge instead of appearing green. `main` is currently unprotected;
  the `Quality gate` job exists so that a single, stable check name can be
  required once someone enables it.

`gh pr update-branch` merges the base in and produces a conflicted merge when the
conflict is real. Rebase instead.

### 3. Stale merge ref — reported, not blocked

A `pull_request` run tests `refs/pull/N/merge`, a merge commit built when the PR
last changed. If the base has moved since, the run pairs one side's tests with
the other side's source. Both directions mislead:

- **Red** looks like a defect in your diff. On PR #690 the failing test had
  already been fixed on `main` by #693; the run predated it.
- **Green** certifies a tree that no longer exists. This is the expensive
  direction, because red invites scrutiny and green does not.

`gh run rerun --failed` does **not** help. It replays the original event payload,
so it checks out the same stale merge commit and fails on identical assertions.
Only a rebase produces a new merge ref:

```bash
git fetch origin && git rebase origin/main
git push --force-with-lease
```

The `Base freshness` job reports how many commits the base gained after the merge
ref was built, as a warning annotation and a run summary. It is deliberately
**non-blocking**: failing a PR because `main` moved would go red constantly for a
reason that is not the author's diff, and the fix is a rebase the workflow must
not perform on your branch. Treat the warning as a review-time question — if it
says the base has moved and the change is not trivial, rebase before merging.

## Reading the signal

Never read green as green without confirming a real run exists and is newer than
the base:

```bash
gh pr view <n> --json mergeable,mergeStateStatus,baseRefOid
gh pr checks <n>
```

- No GitHub Actions rows at all → nothing ran. Check for conflicts.
- `Quality gate` not present or not `pass` → something did not run.
- `Base freshness` warning → the results describe an older base.
- A red **Vercel** check carries no information about the diff: it is an
  account-wide build-rate limit, intermittent rather than a 24-hour lockout. The
  remedy is a retry, not a wait. It is not a required check.

## After merge

A PR stops being updated the moment it merges, so the post-merge run on `main` is
attached to nothing anyone reads. `gh pr checks` reports the head ref's run, not
`main`'s. To check the branch that actually ships:

```bash
gh api repos/jrmoulckers/jrm-recipes/commits/main/status --jq '.state'
gh run list --branch main --limit 5
```
