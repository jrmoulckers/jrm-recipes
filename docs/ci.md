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

## Five ways a green check list still lies

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

#### Which base changes actually invalidate a check

The warning tells you the base moved. It does not tell you whether that matters,
and the natural rule for deciding is wrong. Since `prettier.config.js` imports the
vendored `config/engineering/prettier/index.js`, it is tempting to say _a
`chore(config)` or `chore(deps)` merge expires any formatting and lint verification
taken against an earlier base_. Measured against every such merge to date, that rule
fires three times out of three and is right none of them:

| merge           | touched                            | vendored rules     | `src/` reformatted |
| --------------- | ---------------------------------- | ------------------ | ------------------ |
| #881 `89ff57d9` | introduced `config/engineering/**` | new                | 0 files            |
| #883 `b0b98294` | re-pin `v0.15.1` → `v0.15.7`       | **byte-identical** | 0 files            |
| #886 `2a7e1987` | `package.json`, `pnpm-lock.yaml`   | untouched          | 0 files            |

The re-pin is the instructive one. The version moved two minor releases while
`git diff 89ff57d9 b0b98294 -- config/engineering` came back **empty**, so the
version is not a proxy for the rules. Neither is the title: nothing stops a config
edit landing under a `feat(...)` or `fix(...)` subject, and there the title-keyed
rule is silent — it misses the only case that would have mattered.

Ask the property instead. It is one command and it does not care what anything was
called:

```bash
git diff --stat <base-you-verified-against>..origin/main -- \
  config/engineering .prettierignore prettier.config.js eslint.config.js
```

Empty means prior `format:check` and `lint` results survive the base change,
whatever the commit subjects were. Non-empty means re-run them, likewise. This is
the same move as the section below: **select on the property in question, not on a
name you have to guess right first.**

### 4. Run concluded, gate job never did

Observed on PR #878. `Quality gate` sat at `IN_PROGRESS` for 24+ minutes while the
run containing it reported `completed` / `success`:

```
run:  created=14:39:38  updated=14:48:38  status=completed  conclusion=success
job:  Quality gate  started=14:48:35  completed=null  status=in_progress
```

The run was marked complete **three seconds after the gate job started**. Every
other job had finished. `gh pr checks` and the `check-runs` API both said
`in_progress`; only the run conclusion said success — and the run conclusion is the
one that would have authorised a merge, past a gate that never ran.

So the rule is: **the run conclusion is not a substitute for the gate's own
verdict.** A stuck gate is _unread_, not green. Get a real verdict by re-running
that job:

```bash
# Select on .status, not on a name. Prints every non-terminal job with its id.
gh api repos/jrmoulckers/jrm-recipes/actions/runs/<run-id>/jobs?per_page=50 \
  --jq '.jobs[] | select(.status != "completed") | "\(.name) \(.status) \(.id)"'
gh api -X POST repos/jrmoulckers/jrm-recipes/actions/jobs/<job-id>/rerun
```

**It is not specific to `Quality gate`.** That is where it was first seen, but a
later report put `Migration drift` in the same state — unverifiable after the fact,
for the reason in the caveat below — and a PR run carries 15 jobs. A probe written
as `select(.name=="Quality gate")` answers a stuck `Migration drift` run with empty
output, which is the same answer it gives for a clean one. Select on `.status`,
which is the property actually in question, rather than on a name you have to guess
right before you can detect anything.

That returned `completed/success` in about a minute, and the merge proceeded on a
verdict rather than an inference.

**Both of that probe's inputs are assumptions, and both fail on PR #534 today.** It
assumes the run it is handed contains jobs, and that the run it is handed is the
right one. Two CI runs exist on that PR's head commit `3aad1077`:

```
31561428763  completed/action_required  event=pull_request       jobs=0   non-terminal=0
31561427745  in_progress/null           event=workflow_dispatch  jobs=11  non-terminal=3
```

`gh run list --branch <branch> --limit 1` returns the first of those, and the probe
prints nothing for it — the same output a fully-completed healthy run gives. So the
procedure certifies the commit as clean **while three jobs are in progress on it**,
in a run it never opened.

Two separate faults, both toward false-clean:

- **A zero-job run is unread, not clean.** `action_required` means the workflow is
  awaiting approval and no job ever started. `select(...)` over an empty array is
  empty, which is what every-job-passed also looks like. That is this section's own
  rule — a stuck gate is _unread_, not green — reaching a case the section did not
  cover.
- **Newest-run-for-the-branch is the wrong population.** The question is about the
  commit being merged, not the branch. The two runs above differ only by `event`,
  which nothing in the older procedure inspects.

Key on the commit, and assert the population is non-empty before reading it:

```bash
# every run on the merge candidate, not the newest run on its branch
gh api "repos/jrmoulckers/jrm-recipes/actions/runs?head_sha=<full-head-sha>" \
  --jq '.workflow_runs[] | "\(.id) \(.name) \(.status)/\(.conclusion)"'

# per run: jobs=0 means UNREAD -- do not read the emptiness as agreement
gh api "repos/jrmoulckers/jrm-recipes/actions/runs/<run-id>/jobs?per_page=50" \
  --jq 'if (.jobs|length) == 0 then "UNREAD: no jobs (check conclusion for action_required)"
        else (.jobs[] | select(.status != "completed") | "\(.name) \(.status) \(.id)") end'
```

An empty result from the second command means what you want **only once both hold**:
a run was found for the commit, and it contains jobs. The thing that actually
authorises a merge is still the affirmative `Quality gate == SUCCESS`, not the
absence of failures — on #534 `gh pr checks` shows no `Quality gate` row at all,
and nothing in that output says one is missing.

Two caveats on the frequency. A census of the 40 most recent completed `ci.yml`
runs found **0** jobs in a non-terminal state, so this is transient rather than
standing; re-measured later at n=30 with the `.status` probe above, still **0**, so
the figure survives the generalization. But that number is weaker than it looks:
**re-running the job erases the evidence**, so the census can only find instances
nobody fixed, and fixing them is the natural response to hitting one. Record the run
id and timestamps _before_ re-running.

### 5. A cancelled run leaves a failure attached to a commit that passed

Observed on PR #896. One commit carried **two `Quality gate` check-runs with
opposite terminal conclusions**:

```
8179044a  Quality gate  completed/success   run=31523484411  started 18:44:59Z
8179044a  Quality gate  completed/failure   run=31522626458  started 18:30:56Z
```

Both belong to the same head SHA, so nothing distinguishes them by commit. The
discriminator is one level up, at the run:

```
run 31523484411  completed/success    head=8179044a  created 18:35:10Z
run 31522626458  completed/cancelled  head=8179044a  created 18:25:20Z
```

The `failure` belongs to a run that concluded **`cancelled`**. Cancellation
records the individual jobs as `failure` while the run itself concludes
`cancelled`, so anything reading job or check-run conclusions sees a red that the
run conclusion would have explained away.

How a commit ends up with two: push A, push B on top (B's run cancels A's
in-flight run under branch concurrency), then force-push back to A. A's second
run is new; A's first, cancelled run stays attached to A forever. Rebase-heavy
branches and any `--force-with-lease` reset reach this state routinely.

`gh pr checks` transiently reported `FAILURE Quality gate` for a commit whose
gate had not failed. **A check-run whose parent run concluded `cancelled` carries
no information about the code** — it records that a run was interrupted, not that
anything was measured. It is neither a pass nor a fail; it is unread, exactly like
the stuck gate in §4.

Read the newest run for the current head SHA, and check the run's own conclusion
before believing a job-level red:

```bash
gh run list --branch <branch> --limit 8 \
  --json databaseId,workflowName,status,conclusion,headSha,createdAt \
  --jq '.[] | "\(.databaseId) \(.headSha[0:8]) \(.workflowName) \(.status)/\(.conclusion)"'
```

Note the failure direction. §1–§4 are all ways a **red is hidden**; this one
manufactures a **spurious red**. That makes it the more dangerous of the two
shapes in practice, because the standard response to an inexplicable red is to
re-run — which produces a third check-run, resolves nothing, and trains the habit
of re-running until green. The evidence that would have identified it as a
cancellation is one API call away and is not erased by the re-run, so read it
first.

## Reading the signal

Never read green as green without confirming a real run exists and is newer than
the base:

```bash
gh pr view <n> --json mergeable,mergeStateStatus,baseRefOid
gh pr checks <n>
```

- No GitHub Actions rows at all → nothing ran. Check for conflicts.
- `Quality gate` not present or not `pass` → something did not run. If it is stuck
  at `IN_PROGRESS` while the run reports success, see §4 above — re-run the job
  rather than reading the run conclusion instead. If it is red for no reason you
  can find in the diff, see §5 — check whether its run concluded `cancelled`
  before re-running.
- `Base freshness` warning → the results describe an older base.
- A red **Vercel** check is never a verdict on your diff, and it is **not a
  required check** — `Quality gate` is the name that matters. But it is not
  uninformative either, and it currently has two distinct causes that need
  telling apart, because only one of them ever clears on its own:
  - **A 401 installing `@jrmoulckers/*`** — deterministic, and the state since
    #804 added the private presets. Actions authenticates to GitHub Packages;
    Vercel has no credential. Every build fails identically. Tracked by #826.
  - **`Deployment rate limited`** — account-wide saturation. The cap is shared
    across every PR and every session, not per branch.

  In both cases: **merge through it, and do not push to clear it.** A retry
  cannot fix the 401, and either way a fresh build spends budget belonging to
  the other open PRs — pushing to clear one red takes it from everyone else.

  Note the asymmetry that let the first cause hide behind the second for so
  long: `Deployment rate limited` is emitted for deploys that **never started**,
  so it is structurally incapable of reporting on builds that ran. A saturation
  error is never a diagnosis.

  "Carries no information about the diff" does not generalise to "carries no
  information". Right now this check is the only surface reporting that
  production deploys are broken at all — see #828, which is the same gap stated
  from the other end.

### Which red is this?

`gh pr checks` prints `Vercel fail` for both causes, so the colour cannot tell you
them apart and neither can `state`. The discriminator is the `description`, which is
already recorded and free to read:

```bash
gh api repos/jrmoulckers/jrm-recipes/commits/<sha>/status \
  --jq '.statuses[] | select(.context == "Vercel") | .description'
```

- `Deployment rate limited — retry in 24 hours.` → account-wide quota.
- `Deployment has failed — run this Vercel CLI command: ...` → the build ran and
  broke. Do not assume it is #826; a third cause would look the same. You cannot
  read the log from here, so bound the phase instead — see below.

A second discriminator needs no prose parsing, because a quota-blocked deploy is
**never created**:

```bash
gh api 'repos/jrmoulckers/jrm-recipes/deployments?environment=Production&per_page=40' \
  --jq '.[] | "\(.id) \(.created_at) \(.sha[0:8])"'
```

That absence carries a counting hazard worth stating explicitly: enumerating
_failed_ Production deployments **undercounts** undeployed commits, because
quota-blocked commits are missing from that list rather than present-and-red. To
measure real drift, compare `main` against the last **successful** deployment sha
rather than counting failures:

```bash
git rev-list --count <last-successful-sha>..origin/main
```

**Quote that range in PowerShell**, which is the shell most sessions here run. `..`
is PowerShell's range operator, so an unquoted `$sha..origin/main` is split into two
arguments before git sees it:

```powershell
$sha = "5c23673f"
git rev-list --count $sha..origin/main     # varies  <- wrong
git rev-list --count "$sha..origin/main"   # 69      <- correct
```

```
unquoted -> ["5c23673f", "..origin/main"]   two arguments
quoted   -> ["5c23673f..origin/main"]       one argument
```

Two corrections to how this entry was first written, both from re-measuring it after
a second session reported a different wrong number.

**Only the variable form splits.** A literal `5c23673f..origin/main`, unquoted,
survives as a single token and returns the right answer; it is the `$var..` sequence
PowerShell tokenizes. So the hand-typed spelling is safe and the scripted one is not,
which is the reverse of the usual advice.

**The wrong number is not stable, and not always small.** Split into two arguments,
git counts commits reachable from `<sha>` _or_ `origin/main`, minus those reachable
from `HEAD` — because a bare `..origin/main` means `HEAD..origin/main`. The result is
therefore a function of where your checkout happens to sit, not a symptom:

| `HEAD`                 | unquoted returns         |
| ---------------------- | ------------------------ |
| `origin/main` (synced) | **0**                    |
| one commit behind      | 1                        |
| ~20 commits behind     | 22                       |
| at the served sha      | **69 — correct by luck** |

The quoted truth in every row is 69.

Three consequences, in increasing order of danger. It **can return zero**, on a
checkout synced to `main` — which is exactly where a drift check is most naturally
run, and where zero reads as "production is current". It can be **larger** than the
truth as readily as smaller: two sessions reported `1` and `54` for the same
repository on the same day, and neither figure is a sign to watch for, since both are
just `f(HEAD)`. And it can return **exactly the right answer** when `HEAD` sits at the
served sha — so verifying the command in the obvious way passes while the command
stays broken.

The only durable claim is therefore: **unquoted is wrong and does not error.** Do not
learn a number to recognise. Like `Select-String -SimpleMatch` and the stuck-gate run
conclusion, the instrument returns a well-formed value describing something other than
what you asked.

**Fetch first, for the same reason.** `origin/main` is a local ref that only moves
when you move it, so in a fleet merging steadily the range silently measures how
far a stale copy is behind, and reports it as drift:

```bash
git fetch origin main            # without this the count is against your last fetch
git rev-list --count "<last-successful-sha>..origin/main"
```

A session verifying a reported drift of 58 got 36, from correct arithmetic against
an `origin/main` 22 commits old, and reported it as reproducing the number exactly.
That is the worse half of this failure: a stale ref returns a number that looks like
agreement — and per the table above, so can the quoting bug. Neither reliably
announces itself. Two sessions
running the same command on the same repository can differ by exactly their fetch
gap and neither sees an error.

**ORIGINAL DIAGNOSIS, REFUTED (#936) — retained as the record, not as a live
claim.** The hazard above is real and the remedy stands; this specimen is not an
instance of it. Measured:

```text
5c23673f..174c754c -> 36   174c754c committed 2026-08-11T05:03:51-07:00
5c23673f..187213ca -> 37   187213ca committed 2026-08-11T05:31:44-07:00
174c754c..187213ca -> 1
```

36 and 37 were each exactly right for the true tip when reported, 28 minutes apart,
and the increment matches the single commit that landed between them. **A stale ref
cannot increment** — an unfetched `origin/main` is fixed, so its count is constant.
A ref that advances in step with the true tip is one being fetched, and "22 commits
old, then 23" asks it to move and to fall further behind at once.

The staleness was real and mislocated: the diagnosis was written when `main` stood
at 58, the quoted 36 was compared against that, and it must read low, being from
05:03. **`what` was re-derived correctly and `when` was inherited from context** —
the failure this document describes, committed while describing it.

Both hypotheses predict "36" exactly, which is why reconstructing it felt like
proof. The increment is the discriminator, and it refutes rather than merely
failing to support: _an exact reconstruction of a wrong-looking value is not
evidence of the mechanism that would produce it, when a correct process produces it
too._

**Better: measure with no local ref at all.** `gh api` compares two refs on the
server, so there is nothing to be stale and nothing to remember to fetch:

```bash
gh api repos/jrmoulckers/jrm-recipes/compare/<served-sha>...main --jq .ahead_by
```

That is the form to reach for, with `fetch` + `rev-list` as the offline fallback.
Unlike `deployments?sha=` further down, this endpoint **accepts an abbreviated
sha** — `compare/5c23673f...main` and the full 40-character form both return 79,
matching `rev-list`. Do not carry that tolerance across: the deployments endpoint
answers an abbreviated sha with an empty array and HTTP 200.

The paragraph above was the first attempt at this problem and it was procedural —
it works only for a reader who already has the current file. The same session
reported a stale figure **again** one message later (37, against a ref 23 commits
old), after the mechanism had been explained in detail, because the fix had landed
23 commits ahead of the tree they were reading. **A documentation remedy for
staleness cannot reach a stale reader.** Where that is the failure, change the
command so it cannot express the error, rather than warning about it.

That last rule is the durable part and is unaffected. The 37 is the second half of
the specimen refuted above (#936): it was correct for `187213ca`, the true tip when
it was reported. Read the sentence as an argument for the server-side form, which
holds on its own, and not as an observation of a session reading a stale tree.

#### Attach the referent to the claim, not only to the number

That principle is stated above for the scalar. It needs stating for the
conclusions drawn from it, because the scalar is the half that already survives.

A session reported `main fc4963fa, drift 58`. The number was exactly right —
`5c23673f..fc4963fa` is 58 — and merely 21 commits old. All counting forms agree
at a given tip (`--first-parent`, `--no-merges`, plain; the history is linear with
0 merge commits), so the referent was the entire discrepancy, and **because the
number was quoted with its referent, repairing it took one command.**

The same message relayed a conclusion — that most commits get no deploy attempt,
so a single spot check is likely uninformative and reads as healthy — with no
referent, onward to a third party. The conclusion is wrong; the correction had
already been sent; the two crossed. **A correction travelling peer-to-peer loses
every race against a claim that has already been forwarded.**

#### A crossed repetition is one assertion delivered twice

What happens on the _next_ arrival is worse, because it looks like the opposite. A
peer asserted the same thing in two consecutive messages — that three zero results in
their reflog meant absent — and the second arrival read as reaffirmation under
challenge: a position restated after contradiction, which normally signals the
objection was considered and rejected.

It was not. The message was written before the correction reached them. **One
assertion, delivered twice, and counting it as two inflates confidence in a claim
that has already been refuted** — two of those three negatives were void, the numbers
queried being PRs, which the reflog never holds. Confidence errors in that direction
are the expensive ones.

The discriminator is already in every message and costs one command, because peers
here quote their tip alongside their numbers:

```bash
git log -1 --format='%cI' <their-tip>          # what they could have known
git rev-list --count "<their-tip>..origin/main"
```

`b36d479a` is `2026-08-11T20:03:51`, thirteen commits back; the correction they would
have needed cites `81519901`, which is later. So the message could not have been a
response to it, and its repetition carries nothing new.

**The referent that makes a peer's number self-correcting also dates every other
statement in the same message.** Only the first half of that was written down here,
and the second half is free — no lookup, no recall, and it works on any message
following the convention. It also disposes of the recurring reports of settled work
as still open (`#927` "is yours to merge on the gate"; `#927` is merged) without
re-verifying each one: the tip explains them all at once.

So: we attach provenance to numbers and not to the claims drawn from them, and the
claim is what gets acted on. `79 unshipped as of 1064af59` self-corrects. `reads as
healthy` does not. The remedy is structural rather than a warning, matching the
paragraph above: **a claim that will be acted on belongs at the site of action, not
only in a channel that forwards.** The measured census below went on the blocking
issue for that reason — the next reader arrives there anyway, and cannot arrive in
a message thread.

The disputed claim, measured over 14 `main` commits on both channels at once:
**6 of 14 have no deployment object, and 0 of 14 read as healthy.** Quota posts a
terminal `failure` on the statuses channel without ever creating a deployment
object, so no commit reads clear and a one-commit spot check is informative,
provided it is taken on the channel that can express both modes.

### `version` is not a drift signal

`/api/health` also reports a `version`, and it is tempting to read as a coarser
drift axis. Measured across a 60-commit gap, at `3590f177`:

```
package.json at the served commit : 0.2.0
package.json on main              : 0.2.0
health endpoint                   : 0.2.0
```

Identical, because `version` moves only when a release PR merges. It therefore
agrees no matter how far behind production is, and can disagree only in a narrow
window after a release lands. It can produce false reassurance and cannot detect
drift; reading its agreement as currency is the same error as reading an absent
deployment record as success. Compare `sha`.

That same absence sets a subtler trap, and a concurrent session walked into it while
this was being written. Pull the description off every recent **deployment** and they
are byte-identical:

```
dpl_B5rFBz…  Deployment has failed — run this Vercel CLI command: npx vercel inspect … --logs
dpl_2dPR38…  Deployment has failed — run this Vercel CLI command: npx vercel inspect … --logs
dpl_2XTMUf…  Deployment has failed — run this Vercel CLI command: npx vercel inspect … --logs
```

The natural reading is that the deployments channel is **lossy** — that it collapses
both causes into one generic string, and that the fix is to enrich it. That reading
is wrong, and the right one is stronger. The text is uniform because the
**population is filtered**: a quota-blocked attempt never creates a deployment
object, so a list of deployments is already a list of build failures only. Every row
says `has failed` because every row _is_ one. Nothing was lost in encoding.

So absence is not a gap in the instrument, it **is** the instrument — and the same
observation supports the opposite conclusion depending on which reading you take.

The practical consequence, for anyone editing `.github/workflows/deploy-watch.yml`:
**do not classify the failure mode from `deployment_status.description`.** That job
is only ever reached by one of the two modes, so a classifier built on it would look
correct, pass every test written against real events, and be structurally incapable
of seeing the quota case — it would never fire wrongly, it would simply never fire.
Classify from **commit** statuses, which see both, or from duration.

The reason to write this down is that the previous two entries were correct and
still left the red unread. Naming a cause lets you _recall_ an explanation; only a
command lets you _re-derive_ which one is in front of you, and an explanation that
is never re-derived decays into a guess that happens to be phrased confidently.

### The answer is per-attempt, so do not generalise it

The two modes **interleave commit by commit**. There is no boundary and no window to
wait out. Classifying the newest twelve commits on `main` gave:

```
BREAK  3f9fe3cb   QUOTA  cedf27e4   QUOTA  1ceb399b   QUOTA  ebd85b52
BREAK  88d90018   QUOTA  5dae741a   BREAK  7690a1bc   QUOTA  eb5a7350
BREAK  adb09543   BREAK  41b6a583   BREAK  48602be3   QUOTA  8ca0b100
```

The decisive case is a pair with **byte-identical trees** — a PR head and its own
squash-merge commit:

```bash
git diff --stat 33e54369 3f9fe3cb   # empty
# 33e54369 -> Deployment rate limited — retry in 24 hours.
# 3f9fe3cb -> Deployment has failed — ...
```

Same bytes, minutes apart, opposite modes. **The mode is a property of the deploy
attempt — not of the diff, and not of the hour.** One observation therefore licenses
no claim about any other commit, including a rerun of the same one. Statements like
"the quota window has passed" or "Vercel red is quota right now" are unsupportable
from a single read, in either direction, and both have been asserted here.

Re-derive per commit. It is two API calls, and the two discriminators are genuinely
independent: `rate limited` holds **if and only if** no Production deployment object
exists, and `has failed` **if and only if** one exists and failed — 14 of 14 commits
agreed, 0 disagreed. Checking either one confirms the other.

### You cannot read the log, but you can bound the phase

The previous entry says to read the log before assuming a `has failed` is #826.
Nobody here can: `npx vercel inspect <id> --logs` is human-run, so no session can
see the actual error. That is why the 401 diagnosis gets **carried** between
sessions instead of re-derived — and a carried cause decays exactly like a carried
status, because it was true when made and nothing revisits it.

Duration is the instrument that does not need log access. The Vercel commit status
goes `pending` → terminal, and the delta between them bounds **where in the build it
died**:

```bash
gh api repos/jrmoulckers/jrm-recipes/commits/<sha>/statuses?per_page=100 \
  --jq '.[] | select(.context|test("vercel";"i")) | "\(.state) \(.created_at) \(.description)"'
```

Measured over every commit in `5c23673f..main` plus the four successes before it.
Both failure counts keep climbing, so treat them as a snapshot with a vintage, not a
constant — the command above is the part worth keeping:

| state                     |   n | `pending` → terminal           |
| ------------------------- | --: | ------------------------------ |
| success                   |   4 | 155 / 162 / 170 / 201 s        |
| `Deployment has failed`   |  17 | **11–17 s**                    |
| `Deployment rate limited` |  29 | **no `pending` status at all** |

The bands do not overlap and are ~9x apart. A build that dies in 11–17 s has not
finished `pnpm install`, let alone `next build`, so every failure in that census
died **at or before install**.

The counts moved (15 → 17 and 25 → 29) while the **bands did not**. That is the
useful part: re-measuring twice, hours apart, changed the population and left the
signature alone, which is much better evidence that the phase is stable than a
single census could ever be.

The quota row is a third discriminator, and a structural one: a rate-limited attempt
emits no `pending` status because no build ever starts. That agrees with the
deployment-object rule above from a different direction and needs no prose parsing.

**What this establishes:** the failure _phase_ is unchanged. "The 401 was partially
fixed and it now fails later" predicts a duration change, and across ~12 hours and 17
attempts there is none — re-measured at n=15 and again at n=17, min 11 s and max 17 s
both times.

**What it does not:** duration cannot name the error. A lockfile fault, a missing
install-time variable, or a registry outage would all produce the same 11–17 s
signature. So the honest claim is "still failing in the install phase, cause
unconfirmed" — not "still the 401". That is a smaller statement, and unlike the
inherited one, any session can re-derive it in a single command.

**`Deploy watch` now runs that command for you.** The failure report used to end
with "read the logs above", pointing at a `log_url` that is the deployment's URL
rather than its build output — an instruction nobody in this repo can follow, which
is precisely how the 401 came to be inherited. It now reports the measured
`pending` → terminal delta and classifies it, so the phase arrives _with_ the
notification. The arm worth knowing about is the second one: a failure that
survives past ~20 s does **not** match the signature of every failure since #804,
and the report says so in those words. Treat that as the standing diagnosis having
expired, not as a slower version of the same fault.

Its **untimed** cases are separated too, because they are not one case. A failed
statuses call and a deploy that recorded no `pending` status used to arrive as the
same empty string and print the same sentence — so an instrument fault read as a
property of the deploy, which is the precise inheritance this job exists to stop.
They are separable in the data: a quota row has a terminal status and no `pending`
one, a failed call has neither. The report now names which it is, and an API failure
says outright that it is an instrument fault to read no cause into.

## Every session is the same GitHub user

Concurrent sessions all authenticate as one account, so the platform cannot tell
them apart:

```bash
gh api user --jq .login   # jrmoulckers, from every session
```

Three things follow, and each one has already cost real rounds of work.

**An approval cannot arrive.** GitHub refuses self-approval — `gh pr review <n>
--approve` returns `Review Can not approve your own pull request` — so `reviews[]`
stays empty and `reviewDecision` stays blank however many sessions read the diff:

```bash
gh pr view <n> --json reviewDecision,reviews --jq '"[\(.reviewDecision)] \(.reviews|length)"'
# [] 0   — even with four review comments posted
```

Waiting for an approval before merging is waiting for something structurally
impossible. **A PR comment is the only available form of second-party review**, so
read the comments, not `reviewDecision`. Authors self-merge once `Quality gate`
passes and the PR is `MERGEABLE`; nobody is coming to approve it.

**Authorship is unverifiable.** Every issue, PR, comment and review renders under
the same login, so no session can confirm which session wrote anything. This has
misattributed work in both directions. It also means any tally of the form
"session X did this N times" is unsound — the platform cannot distinguish the
sessions being counted, so the count is not evidence.

The rule this forces: **provenance must be self-declared in the body**, because
nothing on the platform will supply it. The `(#819)` / `RECONFIRMED (#819)`
markers in `bundle-budgets.json` are the pattern. It is the same discipline as
recording a run id and platform beside a measurement, for the same reason — a
claim you cannot re-derive is a claim you cannot audit, and that applies to _who
said it_ exactly as it applies to _what they measured_.

#### A declaration is checkable: the reflog is per-session

Self-declaration is the only record _on GitHub_. It is not the only record. A
session runs in a worktree, and a worktree's `.git` is a file rather than a
directory:

```text
gitdir: C:/Users/jrmou/src/jrm-recipes/.git/worktrees/<worktree-name>
```

`logs/HEAD` lives under that per-worktree path, so **the HEAD reflog is
per-worktree, and therefore per-session.** It is contemporaneous, and it survives
the loss of the context that produced it:

```bash
git reflog --date=iso | grep 'commit:' | grep '#<issue>'
```

**Key it to the issue, never to the PR number.** The local commit message carries
the issue reference; GitHub appends `(#PR)` when it squashes, so the two numbers
never coexist in the reflog and a PR-keyed search returns nothing for work you did:

```text
reflog:  bd933f18 ... commit: docs(ci): attach referents to claims ... (#934)
main:    9c600eff       docs(ci): attach referents to claims ... (#934) (#935)
```

| issue | PR   | reflog `#issue` | reflog `#PR` |
| ----- | ---- | --------------- | ------------ |
| #930  | #931 | PRESENT         | absent       |
| #932  | #933 | PRESENT         | absent       |
| #934  | #935 | PRESENT         | absent       |

The PR number is the one a peer quotes and the one `git log` shows on `main`, so it
is the natural thing to paste in — and it fails in the reassuring direction. It
nearly cost a live error here: a peer attributed the paragraphs above to this
session, `#907` and `#909` came back absent within a covering horizon, and the
conclusion drawn was "not mine". Re-keyed, `#905` and `#908` are both **PRESENT**;
the work is this session's and the attribution was right. #925 documents this
instrument being used to retract a true declaration on memory; this is the same
loss through the instrument itself, which is worse, because it reads as having
been checked.

Prefer it to memory, and **do not retract a declaration on memory alone** when
this can be read instead. Memory fails silently in the way this document is
otherwise entirely about: absence from a session's surviving context and absence
of authorship produce the same output. #925 is the worked case — a declaration of
#820 was retracted as unremembered, and the reflog held two commits for it
(`91a7da93`, `535f5b05`), while four issues the same session had _not_ disputed
were absent. Exactly inverted, and the retraction was the destructive move.

#### Better still: key it to the commit subject

The issue number is an improvement on the PR number, not the best available key, and
it has a failure case that routes straight back into the defect it was written to
prevent. It assumes you can recover the issue for a PR, and sometimes you cannot:

```
$ gh pr view 857 --json closingIssuesReferences -q '.closingIssuesReferences[].number'
(empty)
```

`#857` references `#821` in its subject but does not close it, `#821` being
deliberately still open. A reader following the rule literally is left with no key,
and the fallback nearest to hand is the PR number — the void probe.

**The commit subject has none of these problems.** It survives squash unchanged;
GitHub appends the PR number and touches nothing else:

```text
reflog:  fix(perf): correct the food-classifier diagnosis by measurement (#821)
main:    fix(perf): correct the food-classifier diagnosis by measurement (#821) (#857)
```

So it needs no API lookup, it works when `closingIssuesReferences` is empty, and it
does one thing the issue number structurally cannot: **tell apart two PRs that close
the same issue.** A peer's probe returned three hits all keyed `#674`, spanning
`#690` and `#763` — the issue number could not separate them and the subject text
did. That probe already depended on the subject; the number contributed nothing to
the distinction actually drawn.

Both arms, before trusting it:

```text
POSITIVE  "food-classifier diagnosis by measurement"       -> aeaf69f3  (mine)
NEGATIVE  "catalog-growth diagnosis in the bundle budgets" -> (no matches)
NEGATIVE  "replace the multi-creator budget guess"         -> (no matches)
```

#### A void probe can return the correct answer

Before trusting any absent result, **check whether the number queried was a PR**:

```bash
gh api repos/jrmoulckers/jrm-recipes/issues/<n> --jq 'if .pull_request then "PR" else "ISSUE" end'
```

A peer reported `#819`, `#820` and `#857` all returning zero within a covering
horizon, and concluded the negative meant absent. `#819` is an issue, so that arm was
valid. **`#820` and `#857` are PRs, so their zeros were structurally guaranteed** and
carried no information at all.

The conclusion drawn from them was nonetheless **correct** — `#857` is this session's,
confirmed by a valid probe on `#821`. That is what makes this the worst form of the
entailed-outcome defect. A void test that disagrees with reality eventually gets
contradicted by something. A void test that **agrees** is never revisited, because the
answer checks out, and an invalid instrument gets banked as a validated one.

Note also that the issue-keyed rule was already written down when this happened. A
rule that exists but is not reached at the point of use has the same effect as no
rule, which is an argument for the key that needs no lookup and no recall.

Two conditions, or the negative result means nothing:

| condition        | check                                   | why                                                         |
| ---------------- | --------------------------------------- | ----------------------------------------------------------- |
| Covers the event | `git reflog \| tail -1` for the horizon | Before the worktree existed, absence has an unrelated cause |
| Has not decayed  | `gc.reflogExpire`, default 90 days      | An expired entry is indistinguishable from work never done  |

**`git branch --list` is not this evidence, though it looks like it.** Worktrees
_share_ refs with the clone, so a session sees every other session's branches —
~230 here, including whichever branch a peer currently occupies. Branch presence
is a property of the clone, so the probe answers _present_ to every query and
reads as confirmation of whatever was asked. It is the identifier-keyed probe in
§`Which base changes actually invalidate a check`, one more time: it was reached
for first, and it "confirmed" #820 for a reason unconnected to authorship.

Two further heuristics get proposed and both fail the same way, so test any
candidate by asking whether **a session that did not do the work would read a
different value**:

| candidate                    | why it fails                                                                                                                                                                                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR head branch name          | Names the _work_, not the author. `gh pr view 861 --json headRefName` returns `feat/verify-measurement-claims-858` to every session alike, and that branch is in this worktree's `branch --list` too. It also does not reliably encode an issue — `fix/closingsep` (#924) carries no number. |
| Session display name ≈ title | Self-declared and mutable, and a session shipping two PRs can match at most one.                                                                                                                                                                                                             |

Measured against the same pair, the reflog does discriminate: the peer's branch
has **no** entry in this worktree, while `fix/closingsep` has its checkout. That
positive-and-negative pair is what qualifies it as a check — a probe seen only
agreeing has not been shown able to disagree.

**Adding more instruments is not a substitute for exercising one.** The corollary
matters because triangulation is the natural next move when a single probe feels
thin, and it is worthless against a subject that is not moving. Production status
here is checked against four things — `/api/health`, the deployments API, the
commit statuses channel, and `package.json` — and all four agree on the served sha.

Nothing has deployed in 20 hours, so the served sha is a **constant**, and every
instrument that reads it correctly must return the same value. Four agreeing
instruments over a frozen subject are not four confirmations; they are one
observation restated four times, and the result would be identical if three of them
were broken.

The information was in the axis where they _disagreed_ — drift, which separates
what is on `main` from what is serving. **Under a static system agreement is free,
and only disagreement carries information.** The `version` axis below is the worked
case: it was proposed as a second signal precisely because it agreed, and it agrees
no matter how far behind production runs.

Branch names are also not immutable: they can be force-pushed, deleted and
recreated.

**`AGENTS.md`'s author-based gate is not observable.** It distinguishes actions on
"your own" PRs from gated ones on "a PR you did not author", but with one identity
every PR reads as your own; the platform will not tell a session which it wrote.
That text is canonical (synced `studio:base` block) and is not reinterpreted here
— the observability gap is tracked in #859 for routing upstream. Until then,
treat the gate as binding on what you _know_ you authored — and when that is in
doubt, read the reflog above rather than deciding from memory, because this is
the gate where a misremembered answer merges someone else's work.

Note the shape, because it is the same one this document is otherwise about: an
empty `reviewDecision` reads as _not yet reviewed_ when it actually means _cannot
be reviewed_. **The impossible state and the pending state are the same value.**

## A closing keyword cannot be negated

GitHub scans the whole of a commit message or PR body for closing keywords. There
is no negation handling and no scoping, so there is no way to _mention_ one
without arming it. Commit `41b6a583` wrote this, and meant it:

```text
Closes #855 is NOT claimed -- #855 stays open for the human decision.

Refs #855, #806, #805
```

#855 closed at `09:10:41Z`. It was reopened a minute later. The sentence existed
only to prevent the close, and typing it caused the close — **the caveat was the
payload.** Note that the correct `Refs` line was already there, one line below;
adding the right reference does not disarm the wrong one.

It failed in the direction that hides work. #855 pins the Neon history-retention
number, an open and human-gated privacy gap, and a closed issue reads as a settled
matter. That commit's own subject was _"point the erasure horizon's blocker at an
open tracker"_, and its body warned that a stale pointer resolving to a closed
issue makes "an open compliance gap look resolved". It then did exactly that, by a
different mechanism, in the same commit.

**The rule: never type a closing keyword you do not mean.** Not under negation,
not in quotes, not to explain that you are not using it. Use `Refs #N` and say the
rest in words — "#N stays open for the human decision" carries the full meaning
with nothing to parse. When you must show the pattern itself, replace the number
with a placeholder (`Closes #NNN`). Do not assume a code fence or an indent
suppresses the scanner; it does not.

### Knowing the rule is not enough — the past tense is the trap

The section above shipped in PR #893. Its body and commit message narrated the
incident with the phrase `closed #855`, and GitHub closed #855 at `17:56:01Z`,
two seconds after the merge commit. **The pull request documenting the bug
reproduced the bug, in the sentence describing it**, written by someone who had
just spent an hour on the mechanism.

That is not carelessness, it is the specific shape of the trap. The keyword set is
nine words, and every tense counts:

|           |            |            |
| --------- | ---------- | ---------- |
| `close`   | `closes`   | `closed`   |
| `fix`     | `fixes`    | `fixed`    |
| `resolve` | `resolves` | `resolved` |

The imperative forms _look_ like instructions, so they get caught by eye. **The
past tense does not.** "…and closed #855 anyway" is narration — a statement about
something that already happened, in a paragraph about history — and it is
indistinguishable to the scanner from an order. The same goes for "fixed #N in the
earlier PR" and "resolved #N last week", which are the most natural way to write a
changelog, a postmortem, or a reply to another session.

So the rule needs its stronger form: **do not put any of those nine words next to
an issue number, in any tense, for any reason.** Write "#N was closed by
`41b6a583`" — passive voice moves the number away from the keyword — or drop the
number.

### It is guarded, and the reason it can be

PR #893 also claimed this could not be checked, because bodies are not in the tree
and any check would run after the close had fired. **The second half is wrong, and
it is the load-bearing half.** The close fires when the pull request _merges_, not
when it is pushed. A check that runs on the pull request therefore lands squarely
before the damage, which makes it a guard and not a report.

`scripts/check-closing-keywords.mjs` runs in the `Copy and i18n guards` job, which
is in the `Quality gate` needs list, so a violation blocks the merge that would
otherwise perform the close. It reads `github.event.pull_request.body` from the
workflow context and every commit message on the PR, and enforces the convention
already written down elsewhere: **a closing reference gets a line of its own.**
Prose mentions are mid-sentence by construction, so "alone on its line" separates
intent from narration without the guard having to understand meaning.

It deliberately does not skip fenced code blocks, because GitHub does not skip
them either — a guard that ignored fences would pass the exact text that closes the
issue, including PR #893's own quotation of the incident.

It was verified against both real pull requests rather than fixtures alone: it
fails #893 (two hits — the body and commit `7a0f1df0`) and passes #891. The pair
matters more than either half; a guard only proven to fire has not been shown to
be capable of passing.

The residue this cannot reach is a body edited after the last CI run, since the
merge uses the current body and the check saw an earlier one. Same shelf-life
problem as `Base freshness`, and worth knowing rather than papering over.

It belongs to the family this document is otherwise about: a scanner reads a
pattern out of surrounding text and cannot see the text that qualifies it. Same
shape as `Select-String -SimpleMatch` matching nothing and reading as _nothing
there_, or a ban on `unsafe-eval` passing over a policy with no `script-src` at
all. This is the sharpest member, because the qualifying text was the entire point
of the sentence — twice, in consecutive pull requests, the second of which was the
fix for the first.

### The other half: a correct close that discards the request

The keyword can also be entirely deliberate and still do damage, because of what
the issue on the other end contains.

`AGENTS.md` tells an agent that when it cannot finish a human-gated step it should
leave a section headed `Needs Human Action`. That note is the fleet's only channel
for routing work back to a person, and nothing stopped a pull request from closing
the issue carrying it.

#859 recorded that the author-based merge gate is unevaluable here, because every
session authenticates as the same GitHub user, and asked a human to decide. PR
#860 documented the trap in this file and closed #859 along with it. The
documentation shipped; the routing request went into a state nobody triages. A
peer session found it by reading the closed issue directly — no check saw it. The
ask was then re-routed by hand to `jrmoulckers/.github#308`, which worked only
because someone happened to look.

Correct syntax, discarded content — so the same script carries a second check.
For each issue a pull request would close, if that issue is **open** and its body
carries that heading, the build fails and names it. The way out is `Refs #N` with
the issue left open, or removing the section if the PR really does resolve it, or
routing the ask somewhere that stays visible and saying so first.

It skips rather than fails on anything it cannot read — a missing issue, an API
error, a pull-request target — because a guard against a silent failure must not
become a source of spurious red. Only bare `#N` is checked; a cross-repository URL
close acts on another repository's issue, and resolving the number here would read
an unrelated one. Already-closed issues are skipped, since merging discards
nothing new.

That skip-safety is also the thing to watch. The lookup needs an explicit
`issues: read` scope, because the job's `permissions` block **replaces** the
default rather than adding to it. Without it every lookup 404s, the check reports
that it skipped, and "skipped" prints the same green as "found nothing wrong" —
this document's own subject, aimed at its own guard. `scripts/workflow-policy.test.mjs`
pins the scope for that reason, and the pin was proved by deleting the line and
watching it fail.

Verified in both directions against live issues rather than fixtures alone: it
fails on #855, which is open and carries the section, and passes on #901, which is
open and does not.

**Quoting the marker re-arms it**, exactly as quoting a closing keyword does. The
first draft of #901 reproduced the heading verbatim to show what #859 had carried,
and the finished guard then refused any pull request that would close #901 —
correctly, by its own rule. Fences do not help, for the reason above and its
mirror: if a fence suppressed this check, an issue could hide its own request for
a human inside one. So describe a hazardous marker; do not reproduce it in a
position where it is live. The same rule applies to issue titles, which is why
#822 was retitled by describing its old title rather than repeating it.

## After merge

A PR stops being updated the moment it merges, so the post-merge run on `main` is
attached to nothing anyone reads. `gh pr checks` reports the head ref's run, not
`main`'s. To check the branch that actually ships:

```bash
gh api repos/jrmoulckers/jrm-recipes/commits/main/status --jq '.state'
gh run list --branch main --limit 5
```

`deploy-watch.yml` covers the deploy half of this, in three jobs that fail for
different reasons — and the split is the point:

- **Report failed production deployment** fires on `deployment_status`. It sees
  builds that ran and broke.
- **Production drift** polls hourly and compares `main` against the commit
  production reports it is serving. It exists because the first job cannot
  see a deploy that never started: a quota-blocked attempt creates no deployment
  object, so no event is published and no run appears at all (#868). Over twelve
  consecutive commits, a Deploy watch run existed if and only if a deployment
  object did — five never reached production and produced no run, no event, and a
  green Actions tab.
- **Verify production is serving the deployed commit** fires on a _successful_
  `deployment_status`. It sees deploys that reported success without reaching
  users.

The drift job asserts the property actually wanted — production is serving `main`
— rather than the absence of a known failure. That is why it needs no knowledge
of either mode and will not go blind when a third appears. An event-triggered
check can only ever report things that happened; **absence has to be polled for.**

### Only `main` commits are evidence about production, and absent is not success

Both of those modes make deployment records treacherous to reason from by hand,
and two sessions have now drawn structural conclusions from them. The two rules
that would have caught it:

**A non-`main` SHA has no Production deployment by construction.** Production
deploys attach to `main`, so a feature-branch tip returns nothing — not a preview,
nothing — and that absence says nothing about deploys. A session tested whether
failure is a property of the attempt rather than the tree by comparing
`33e54369` (no deployment object) against `3f9fe3cb` (failure) with an empty
`git diff` between them. Both facts were structural: `33e54369` is the tip of
`docs/vercel-red-discriminator-864` and `3f9fe3cb` is that same change
squash-merged as #865, so identical trees is what a clean squash _is_, and only
one of the two was ever eligible for a production attempt. Filter to `main` first:

```bash
git branch -a --contains <sha>    # if it is not on main, it is not evidence
```

#### The general defect: a probe whose outcome was entailed by its setup

Filtering to `main` fixes that comparison. It does not help a reader holding a
different probe, so state what actually went wrong: **both observations were
entailed by how the pair was built.** Identical trees is what a clean squash _is_,
and a feature-branch tip cannot carry a production deployment. Neither could have
come out any other way.

Both were true. Both reproduced on demand — a second session re-ran them, got the
same two results, and reported the reproduction to the user as confirmation.
Reproducibility was never the missing property. A measurement that cannot vary
reproduces perfectly and carries no information, while feeling like the strongest
confirmation available.

This is not the absence-read-as-pass mode the rest of this file catalogues. The
probe returns a positive, informative-looking result; it just could not have
returned another one. The test:

> Before reporting a result as confirmation, name the outcome that would have
> falsified it. If none was reachable, the probe measured its own setup.

Here that control was one command — is this commit even eligible for a production
attempt? — and it voids the pair.

This is the same rule as the mutation-proof requirement for a checked-in guard: a
guard observed only agreeing has not been shown capable of disagreeing, which is
why #930's `jq` was run against a jobless run, a non-terminal run, **and** an
all-terminal control before it shipped. Guards and one-off observations get the
same treatment, because a guard is only an observation someone committed.

#### A census inherits the blindness of the channel it is taken on

A `main`-only census over the deployments API found no-deployment-object to be the
majority result, and concluded that a session spot-checking one recent commit is
likely to draw an uninformative reading and take it as clear. The first half holds;
the second does not follow. Measured over the 8 most recent `main` commits, both
channels at once:

| commit     | `deployments?sha=` | Vercel states on `/statuses` |
| ---------- | ------------------ | ---------------------------- |
| `c46531c6` | 1                  | `failure`, `pending`         |
| `c112974f` | 0                  | `failure`                    |
| `b48b79c9` | 0                  | `failure`                    |
| `ec3b694c` | 0                  | `failure`                    |
| `de45d007` | 1                  | `failure`, `pending`         |
| `04cf9aef` | 1                  | `failure`, `pending`         |
| `b36d479a` | 1                  | `failure`, `pending`         |
| `667bee3d` | 1                  | `failure`, `pending`         |

3 absent and 5 present on the deployments API — and **8 of 8 carry a Vercel
`failure` on the statuses channel**, because quota posts a terminal failure without
ever creating a deployment object. No commit reads as clear, so the single most
likely spot-check is informative, provided it is taken on the channel that answers
for both modes.

The conclusion inherited a documented property of the instrument — the mode table
below is what it was blind to — rather than a property of the subject. **Take a
census only on a channel that can express every mode it means to count**, and when
a count is the evidence, say which channel produced it.

**Absent is not success — but read it on the right channel, with a full sha.** The
census behind this rule used the deployments API alone, and that instrument is
wrong twice.

First, **`deployments?sha=` requires the full 40-character sha.** An abbreviated one
returns `[]` — HTTP 200, empty array, no error. Every sha in prose, in
`git log --oneline`, and in `gh pr view` output is abbreviated, so the natural way
to run this census reports "absent" for every commit, including ones that deployed
successfully. `5c23673f` abbreviated returns 0 deployment objects; the same commit
at full length returns 1, and it is the build production is serving right now.
This is **not** a general rule about the API: the `compare` endpoint used for drift
accepts an abbreviated sha and answers correctly, so the tolerance of one endpoint
says nothing about the other.

Second, an absent deployment object at full length does not mean "never attempted,
cause unmeasured". **It means quota**, and Vercel says so on the statuses channel —
which is posted either way, so the two modes are directly distinguishable:

| mode    | deployment object | `pending` status | terminal status                                            |
| ------- | ----------------- | ---------------- | ---------------------------------------------------------- |
| attempt | 1                 | yes              | `success` / `failure`                                      |
| quota   | 0                 | **none**         | `failure` — "Deployment rate limited — retry in 24 hours." |

```bash
gh api repos/jrmoulckers/jrm-recipes/commits/<sha>/statuses \
  --jq '[.[]|select(.context|test("[Vv]ercel"))|"\(.state) \(.description)"]'
```

#### Prefer the statuses channel outright: it dominates the deployments endpoint

The remedy above — keep using `deployments?sha=`, but remember the full sha — is the
weaker one. The statuses channel is better on every axis measured, so the instrument
should be replaced rather than annotated. At `c1d5c55d`:

```
commits/c1d5c55d/statuses    (8 chars)  -> failure,pending
commits/<40 chars>/statuses             -> failure,pending    (agrees)
deployments?sha=c1d5c55d     (8 chars)  -> 0                  (wrong, silently)
```

**The statuses channel tolerates an abbreviated sha**, so the constraint that defeats
the deployments endpoint does not apply to it, and wrapping these calls in
`$(git rev-parse …)` propagates a fault the endpoint does not have. It also answers in
one call instead of two, and it **names the cause in the description** — something the
deployments endpoint cannot do at all, since it only reports existence.

And it loses nothing. Over the most recent 14 `main` commits at `c1d5c55d`, the
correlation with deployment-object existence is **14 of 14 exact**: every
`failure`-alone commit has no deployment object, every `failure,pending` commit has
one. The deployments endpoint carries no information the statuses channel is missing,
while carrying a silent failure mode it does not have.

This is the same move as replacing the local drift count with `gh api compare`: when an
instrument has a silent failure mode and a sound alternative exists, **replace the
instrument instead of documenting its quirk.** A documented quirk still has to be
remembered by every future reader; a retired instrument does not.

#### A census with any PRESENT row proves its own sha width

A census run entirely with abbreviated shas returns **100% absent**. So any non-zero
PRESENT count proves full shas were used — the output validates itself, and no
inspection of the command is needed.

This is worth stating because it is the rare control that is **free and retroactive**.
Most checks in this document require re-running something; this one can be applied to
an archived table whose command is long gone. Both censuses below pass it on their own
face: 5 present of 8, and 10 of 14.

So the original worry — that a session drawing an unattempted commit would read
production as healthy — overstates the hazard on the statuses channel and
understates a different one. **No commit looks healthy:** re-running the census over
the last 14 `main` commits with full shas gives 5 attempts and 9 quota, and all 14
carry a Vercel `failure`. What the deployments API alone cannot do is tell quota
apart from a sha typed at eight characters, because it answers both with `[]`.

Quota is also the larger blocker by count. A correct registry token fixes the 5, and
leaves the 9 without an attempt. — **ORIGINAL RATIO, SUPERSEDED (#942); the conclusion
drawn from it has since inverted.** Re-measured at `c1d5c55d` over the most recent 14
`main` commits: **10 attempts and 4 quota.** The majority are now failing on the
registry credential, so a correct token repairs the **majority**, not the minority.

Both counts were right when taken. "The last 14 commits" is a **sliding window**, and
six merges moved it. The defect is not the number but the standing operational
conclusion built on the ratio — _"the token fixes the minority, expect a staggered
partial recovery"_ — which reversed without anything marking it as stale, and was
relayed onward in that form. All 14 still carry a `failure`, so the part of the finding
that matters for spot-checking is unaffected.

**A ratio needs its window and tip attached, exactly like a count needs its referent.**
A ratio is worse, because a count that goes stale merely reads low, while a ratio that
goes stale can flip the action it recommends and still look plausible.

### The duration band bounds the phase, and that is all it does

Terminal timings across those attempts, taken as `pending` → terminal on the statuses
channel: failures at 12, 12, 13, 13, 14 and 16 seconds, against the single success at 162. Non-overlapping by an order of magnitude, so a terminal failure inside the band
died at or before install.

It cannot name the error. A lockfile fault, a missing install-time variable and a
registry outage all land in the same band. The supportable claim is **"still failing
at or before install, cause unconfirmed"** — strictly smaller than naming a 401, and
re-derivable by anyone in one command.

Its real value is as a **falsifiable success criterion**, which nothing else here
provides: once the registry credential lands, a repaired install phase must move a
failing deploy's terminal status out of the 12–16 s band. A deploy that still dies at
~14 s falsifies the credential as the cause, and does so without waiting for a green.

Recorded because a right conclusion resting on a measurement that cannot support it
survives only until someone re-derives it (#903) — which is what happened to the
6-and-8 figure this section used to quote.

### Ask production, don't ask the API

`GET /api/health` returns the commit the running build was produced from, plus a
live database probe:

```bash
curl -s https://heirloom.jrmoulckers.com/api/health
# {"status":"ok","version":"0.2.0","sha":"5c23673f…","db":"ok","time":"…"}
```

That `sha` is **ground truth and the deployments API is not.** The API records
what Vercel _intended_; the endpoint records what users are actually being
served. They agree almost always, and diverge in exactly the case no
"successful" record can show you — a build that succeeded but never became the
live alias. So the drift job reads the endpoint and uses the API only to
tolerate an in-flight deploy and to classify the failure mode (#871).

This also collapses the cost: finding the last successful deploy through the API
took a walk of up to 100 requests to infer a fact one unauthenticated GET states
outright.

Use it when a peer reports a deploy state, before believing either of you:

```bash
curl -s https://heirloom.jrmoulckers.com/api/health   # what is served
gh api repos/jrmoulckers/jrm-recipes/compare/<that sha>...main --jq .ahead_by
```

Both halves are remote, so neither can be stale. The `git fetch origin main` plus
`git rev-list --count "<that sha>..origin/main"` pair measures the same thing
offline, at the cost of a fetch you have to remember.

### To know what production says, read the deployed tree

The sha above is not just for drift arithmetic. It tells you which tree to read when the
question is _what does production actually say right now_ — a question that comes up
constantly for user-facing copy and that **cannot be answered from `main` or from a diff.**

```bash
sha=$(curl -s https://heirloom.jrmoulckers.com/api/health | jq -r .sha)
git show "$sha":src/components/settings/delete-account-panel.tsx
git show "$sha":src/messages/en.json
```

Read the _rendered whole_, not the change that produced it. A commit tells you what moved;
it does not tell you what a given user sees, because what they see is the sum of every
commit before it plus the conditions around it.

The worked example is #873. A held user's deletion panel was correctly reported as showing
a contradiction in production. The accompanying claim — that this made production worse than
the state before it — was false, and it was false because it was read off where the diff
placed a block. The same commit also swapped the confirmation help and the button label from
"Permanently delete everything" to "Send my deletion request", so the decision point was
truthful even while the list above it was not. One `git show` of the deployed tree shows
both; the diff shows one and reads as complete.

Corollary, and it has now bitten in both directions: **merged is not live.** A fix that is
on `main` is not a fix a user has. Before describing production behaviour — especially
privacy copy — resolve the deployed sha first.

### That answers what a user sees, not what happens when they act

Component × catalogue × condition at one tree tells you which string renders. For a
_safety_ claim it is still not enough, because the condition that picks the copy is
client-side, and the server may or may not re-derive it. The two cases fail in opposite
directions:

- **Server re-derives.** The client condition is presentational. A stale or wrong preview
  can only mislabel; it cannot change what happens. Failures are safe-direction only.
- **Server trusts the client.** The client condition is load-bearing, and a stale preview
  is a security bug rather than a cosmetic one.

Which case you are in is invisible from the component — it looks identical either way — so
read the server path too. **Read the signature, not the identifiers.** The question is
whether any caller-supplied value can reach the hold decision, and that is answered by
types:

```ts
export type ErasureOptions = {
  trigger: DeletionTrigger;
  noticeVersion?: string; // which copy the user was shown
  backupHorizonAt?: Date; // when the last backup expires
};

export async function eraseUserAccount(userId: string, options: ErasureOptions);
```

Three fields, none able to express a hold, and `findEntanglement(userId: string)` takes only
the id. `options` reaches `recordErasureHold` — the _record_ of the hold — never the branch
that decides it. So the property is: **the hold decision's only inputs are the user id and
server-derived state, and the type system forbids a caller supplying anything else.**

The obvious check is weaker and should not be the verdict:

```bash
grep -n "willBeHeld\|heldRecipeCount" src/server/users/erasure.ts   # corroborating only
```

It asks whether two identifiers appear and gets read as whether the decision is independent
of the client. Those come apart under a rename or a differently-routed value, and when they
do it returns **no hits** — indistinguishable from safe. That is the identifier-keyed probe
this document catalogues everywhere else, here in the one section where a silent pass
licenses the sentence "failures are safe-direction only".

The signature read also yields a review trigger a grep cannot: **adding a field to
`ErasureOptions` is the change that would invalidate the bound.** Watch for that rather than
re-running a string search.

The worked example is the panel from #873. `delete-account-panel.tsx` computes
`willBeHeld = preview.heldRecipeCount > 0` to choose `held.cta` over `confirm.cta`, but
`eraseUserAccount` calls `findEntanglement(userId)` itself and records the hold from its
own result; neither name appears anywhere in `erasure.ts`. The client's condition never
reaches the decision. So a stale preview can show "everything is deleted immediately" to a
user the server will hold, and cannot show "nothing is deleted today" to a user the server
will erase.

That bound is what retires the question, and note what supplies it: not the copy, which is
where the whole investigation was looking. The unconditional consequences list above the
button still says "permanently deleted" and "no undo" to a held user who will lose nothing
today — a real contradiction, and reading further copy would never have settled whether it
was dangerous. Only the server path does.

### What the success check does not cover

The post-deploy job is unauthenticated, so it asserts two things only: the sha
production serves matches the sha Vercel deployed, and `status`/`db` are `ok`.
It does **not** exercise the deletion panel or any signed-in privacy surface —
those need a session and belong in E2E.

Worth stating because the failure it guards against is subtle: a check that
covers part of a surface reads, later and to someone else, as covering the
surface. That is how #868 happened — a workflow that went red on real deploy
failures became the evidence people cited that failed deploys were visible,
while a whole class of them produced no run at all.
