# Performance budgets: how to attribute a regression

Route budgets live in `bundle-budgets.json` and are enforced by
`scripts/check-bundle-budget.mjs` against a manifest of initial Webpack chunks
emitted during `next build`. The checker sums their gzip sizes using the same
whole-kB convention as the former Next.js route table. This document is about the
part the gate cannot enforce: **the stated reason a route grew.**

Every budget bump in that file carries a prose `//` note explaining what caused
it. Those notes are read as precedent — later bumps cite earlier ones — so a wrong
one propagates. Four have had to be corrected after the fact. This is what they
have in common and how to avoid adding a fifth.

## Two different failure modes, not one

The four corrections are usually described as a single pattern. They are not.
Read individually they split cleanly, and the split matters because only one of
them is guardable.

| Correction  | Failure                                                     | Kind        |
| ----------- | ----------------------------------------------------------- | ----------- |
| #674 / #690 | "catalog copy lands in the shared chunk, ~1 kB every route" | attribution |
| #763        | #690's own replacement guess: "likely #666's URL rename"    | attribution |
| #820        | a recorded `307` that the route had since outgrown          | decay       |
| #821 / #857 | "the food classifier import lands in first-load"            | attribution |

**Attribution errors** state the wrong cause for a real number. The number is
sound; the explanation is invented. All three were reached the same way — by
reasoning about which module _must_ be responsible, rather than removing it and
rebuilding.

**Decay** is different in kind. #820's `307` was _correct when written_. Nothing
was mis-reasoned. The route grew to 308, the note did not, and a figure that was
once a measurement quietly became a guess. A planned tightening to 306 was
abandoned on the strength of it.

### A correction of my own count

`//food-classifier-correction` in `bundle-budgets.json` says this was "the third
diagnosis in this file corrected by measurement (#674 catalogs, #820 stale figure,
this one), and all three were reached by reasoning about which module 'must' be
responsible." **That grouping is wrong in both directions.** It includes #820,
which was decay and involved no module reasoning at all, and it omits #763, which
was an attribution error and belongs in the set.

The tempting generalisation — _all four corrections came from guessing at
modules_ — over-reaches in the same way. It sweeps decay into a category whose
remedy does not apply to it. Stubbing an import cannot fix a number that was right
when recorded.

### The sweep that applied a correction was itself keyed to wording

#929 marked the refuted catalog-growth claim at its point of assertion in
`//planner-serving-allocations`, `//media-picker` and `//multi-creator`. Three notes,
three markers, and the count came from a peer rather than from a census.

There were four. The top-level `//` header note carried the same mechanism for #476's
`+~13 kB` re-baseline, in different words — _"messages mount in the root layout and
land in the shared chunk, so every route pays it"_ rather than _"lands in the shared
chunk and so costs every route about 1 kB"_. Same property, different phrasing, so a
sweep keyed to the quoted sentence found three and stopped.

**The remediation for an identifier-keyed defect was itself identifier-keyed**, and it
failed in the reassuring direction: three found, three fixed, closed. It was the
highest-traffic prose in the file and the largest budget movement recorded in it.

Key the census to the mechanism, then classify each site — the raw counts do not
compare:

```powershell
$j = Get-Content bundle-budgets.json -Raw
foreach ($m in [regex]::Matches($j, 'shared chunk')) {
  $pre = $j.Substring(0, $m.Index)
  # a retained claim lives inside an escaped-quote span; odd parity == inside
  $inClaim = (([regex]::Matches($pre, '\\"')).Count % 2) -eq 1
  "{0,6}  {1}" -f $m.Index, $(if ($inClaim) { "CLAIM SITE" } else { "correction prose" })
}
([regex]::Matches($j, 'ORIGINAL DIAGNOSIS, REFUTED')).Count   # every marker
```

**PASS is `claim sites == markers`.** On `7d34940d` that is 4 and 4, from 7 raw
mentions.

##### Comparing the raw counts never terminates

The rule first written here was "a mention count exceeding the marker count is the
discrepancy to resolve." It cannot be satisfied. **Every correction quotes the claim
it refutes**, so the prose adds mentions that will never acquire markers — 7 against 4
on a file with nothing wrong with it, reading as a 3-instance gap forever. A probe
that always reports a problem is as useless as one that never does, and it is worse
than useless here: it sends the next reader to audit a file that is already correct,
and there is no result that would stop them.

Every other defect recorded in this file fails toward false-clean. This one fails
toward false-alarm, which is why it survived being written down — an audit that
demands more work looks conservative.

##### The obvious fix is wording-keyed too

Classifying by the preamble — `retained verbatim as the record, not as a live claim:`
— returns **3 claim sites, not 4**. It misses `//multi-creator`, whose retained block
opens _"the precedent was already withdrawn when it was invoked:"_ instead. So the
probe written to close a wording-keyed defect was defeated by a paraphrase, in the
same file, on the same property, one section below the paragraph explaining that
failure mode.

The key that works is **structural rather than lexical**: a retained claim is inside
an escaped-quote span, and quote parity is a property of the JSON, not of anyone's
phrasing. Prefer a key the format guarantees over a key an author has to keep
consistent.

Two further points fell out of the original sweep:

- **Half-true is worse than false.** The header welded a real cost
  (`NextIntlClientProvider` is client code and does reach the shared chunk) to a
  refuted one (the messages do not). A reader who checks the first half finds it
  confirmed and carries the second along. Mark only the refuted half.
- **A correction can misstate its own provenance.** `//catalog-growth-correction`
  claimed the reasoning "was first written in `//media-picker`" when the header note
  predates it — and provenance is what makes a precedent citable, which is the thing
  that note exists to shut down.

## Only one of the two is guarded

`bundle-budgets.json` carries a machine-checked `//measured.claims` array, and
`check-bundle-budget.mjs` verifies each entry against the same build that enforces
the budgets, failing on a mismatch (#858). **That closes decay and nothing else.**
A claim's `kb` is compared to a measurement; its surrounding prose is not read.
The one route proven to alternate across a whole-kB display boundary carries
`toleranceKb: 1` (#1055). The checker rejects wider tolerances and still fails a
movement of 2 kB, so this is measured whole-kB noise rather than budget headroom.
No route budget receives that tolerance.

So the guard would have caught #820 — the `307` — on the first CI run after the
route reached 308. It would not have caught #674, #763 or #821, because in each of
those the number was already right.

Two properties of that guard worth knowing before you rely on it:

- **A claim is only about the platform that produced it.** Linux CI reads roughly
  1 kB above a local Windows build, so entries for another platform `SKIP`. On a
  developer machine all four currently skip and zero are verified — a clean local
  `pnpm check:bundle` is therefore not evidence about claims. They are only ever
  checked on Linux CI.
- **A claim with no `platform` fails as malformed**, rather than skipping. An
  unqualified number is not checkable, and silently skipping it would reopen the
  hole.

Attribution has no equivalent and cannot get one. No gate can verify "this import
is why". Only removing the module and rebuilding can. The route-chunk checker below
can prove the narrower fact that a module marker is present or absent from a route's
first-load chunks.

## The experiment that settles a cause

Before writing "route X grew because of module Y", or bumping a budget on that
basis:

1. **Stub it.** Replace the suspected import with an inline constant.
2. **Rebuild** and compare First Load JS for the route.
3. **Assert the referent is actually gone** — check the route's first-load chunks
   for a distinctive identifier from the removed module and confirm zero hits.
4. **Keep a positive control** — a second identifier that should _still_ be
   present, confirming the build changed the thing you meant and not more.

After `next build`, make both assertions in one scriptable check:

```bash
pnpm bundle:route-chunks -- \
  --route '/recipes/[cook]/[recipe]' \
  --expect-absent 'recipeCard.macroEstimated' \
  --expect-present 'useState'
```

The command reads `.next/bundle-budget-manifest.json`, limits the search to that
route's first-load chunks, reports matching chunk paths and exits non-zero when an
expectation fails. An absence assertion without `--expect-present` is rejected:
zero hits are evidence only when the same search proves it can find something.

Step 3 is what makes a null result readable. Without it, "removing it changed
nothing" and "the removal did not happen" are the same observation. The #821 work
did this: `volumeClass` appeared in **0 of 33** first-load chunks in the stubbed
build while `buttermilk` still appeared in **6** and `sodiumMg` in **1**. Zero
delta, and the zero meant something.

Stronger still, where the change is a merge you can build both sides of: compare
**shared-chunk content hashes**, not just kB totals. #763 showed `/recipes`
byte-identical across #683 despite ~37 new catalog keys x 4 locales. Hash equality
also rules out compensating changes that a kB total would hide, and `next build`
prints whole kB at this magnitude, so a total can conceal up to a kilobyte of
movement.

## When you cannot establish the cause, say so

Do not substitute a replacement guess. **#763 exists because a correction
introduced one** — #690 fixed the catalog claim and offered #666's URL rename as
"the likely explanation, but it is untested", which then needed correcting in
turn. A correction is a claim like any other and decays like one.

The rule the file settled on: decline to substitute a guess, but **replace an
abstention with a measurement as soon as one exists.** Add the measurement in
place of the abstention rather than beside it — leaving both standing reads as
though the measurement settled nothing.

## Practical rules

- Size a new budget from **CI figures, not local ones** (Linux reads ~1 kB high).
- A new or raised budget must leave **2 kB of headroom** (#796). Inheriting an
  existing tight budget is not a failure.
- A sub-kB webpack redistribution can move a route a full recorded kilobyte with
  no code change — measured at **145 bytes** in #789. A route that moved 1 kB has
  not necessarily gained anything.
- When you update a claim, **update its `runId` too.** A value you cannot
  re-derive is a value you cannot audit.
- Zero headroom is the underlying fault behind most of these notes. A route with
  no margin turns `main` red on an unrelated PR, and the red route is usually not
  the cause.
