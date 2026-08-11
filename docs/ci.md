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
gh api repos/jrmoulckers/jrm-recipes/actions/runs/<run-id>/jobs?per_page=50 \
  --jq '.jobs[] | select(.name=="Quality gate") | .id'
gh api -X POST repos/jrmoulckers/jrm-recipes/actions/jobs/<job-id>/rerun
```

That returned `completed/success` in about a minute, and the merge proceeded on a
verdict rather than an inference.

Two caveats on the frequency. A census of the 40 most recent completed `ci.yml`
runs found **0** jobs in a non-terminal state, so this is transient rather than
standing. But that number is weaker than it looks: **re-running the job erases the
evidence**, so the census can only find instances nobody fixed, and fixing them is
the natural response to hitting one. Record the run id and timestamps _before_
re-running.

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
git rev-list --count $sha..origin/main     # 1   <- wrong
git rev-list --count "$sha..origin/main"   # 48  <- correct
```

```
unquoted -> 5c23673f945a05d3ca89b65736c5d396a8c852df ..origin/main
quoted   -> 5c23673f945a05d3ca89b65736c5d396a8c852df..origin/main
```

The unquoted form does not error and does not return zero. It returns a plausible
small number **in the reassuring direction** — "1 commit behind" reads as basically
current, when the measured answer was 48, including every privacy-copy correction
that is the reason anyone watches drift. Like `Select-String -SimpleMatch` and the
stuck-gate run conclusion, the instrument returns a well-formed value describing
something other than what you asked.

**Fetch first, for the same reason.** `origin/main` is a local ref that only moves
when you move it, so in a fleet merging steadily the range silently measures how
far a stale copy is behind, and reports it as drift:

```bash
git fetch origin main            # without this the count is against your last fetch
git rev-list --count "<last-successful-sha>..origin/main"
```

A session verifying a reported drift of 58 got 36, from correct arithmetic against
an `origin/main` 22 commits old, and reported it as reproducing the number exactly.
That is the worse half of this failure: the quoting bug returns `1` and looks
wrong, while a stale ref returns a number that looks like agreement. Two sessions
running the same command on the same repository can differ by exactly their fetch
gap and neither sees an error.

**Better: measure with no local ref at all.** `gh api` compares two refs on the
server, so there is nothing to be stale and nothing to remember to fetch:

```bash
gh api repos/jrmoulckers/jrm-recipes/compare/<served-sha>...main --jq .ahead_by
```

That is the form to reach for, with `fetch` + `rev-list` as the offline fallback.
The paragraph above was the first attempt at this problem and it was procedural —
it works only for a reader who already has the current file. The same session
reported a stale figure **again** one message later (37, against a ref 23 commits
old), after the mechanism had been explained in detail, because the fix had landed
23 commits ahead of the tree they were reading. **A documentation remedy for
staleness cannot reach a stale reader.** Where that is the failure, change the
command so it cannot express the error, rather than warning about it.

### `version` is not a drift signal

`/api/health` also reports a `version`, and it is tempting to read as a coarser
drift axis. Measured across the current 60-commit gap:

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

The rule this forces: **provenance must be self-declared in the body, or it does
not exist.** The `(#819)` / `RECONFIRMED (#819)` markers in `bundle-budgets.json`
are the pattern. It is the same discipline as recording a run id and platform
beside a measurement, for the same reason — a claim you cannot re-derive is a
claim you cannot audit, and that applies to _who said it_ exactly as it applies to
_what they measured_.

**`AGENTS.md`'s author-based gate is not observable.** It distinguishes actions on
"your own" PRs from gated ones on "a PR you did not author", but with one identity
every PR reads as your own; a session can only know the difference from its own
memory of creating it. That text is canonical (synced `studio:base` block) and is
not reinterpreted here — the observability gap is tracked in #859 for routing
upstream. Until then, treat the gate as binding on what you _know_ you authored,
not on what the platform reports.

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

**Absent is not success.** Classifying the last 14 `main` commits gave 6 with a
Production deployment, all `failure`, and 8 with none. A session checking a single
recent commit therefore has a better-than-even chance of drawing one that was never
attempted and reading production as healthy. It is the same shape as a permission
error that degrades into a skip: the absence of a failure record looks exactly like
the absence of a failure. Classify a run of commits, or ask the endpoint below,
which answers the question directly instead.

The conclusion that session drew was correct — the 6/8 split shows both modes
occurring within the eligible population — which is the reason this is written
down rather than merely corrected. A right claim resting on a measurement that
cannot support it survives only until someone re-derives it (#903).

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
read the server path too:

```bash
grep -n "willBeHeld\|heldRecipeCount" src/server/users/erasure.ts   # no hits = re-derived
```

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
