# Retention & cohort analysis

This doc defines how Heirloom measures **returning-cook retention** — do families
keep cooking week over week? — and how to reproduce the cohort curves and table
in the analytics tool. Retention is measured **per household (family group)** as
well as per user.

## The retention event

The core retained action is **cooking**: the `cook_started` event (with
`cook_completed` as the deeper-engagement variant). Both now carry stable
identifiers so retention can be sliced per person and per household:

| Identifier    | Source                                                                 |
| ------------- | ---------------------------------------------------------------------- |
| Person        | the event's distinct id — the internal user id set by identify (#321). |
| `householdId` | event property = the recipe's owning group id, or `null` if personal.  |

Person-level identity also carries `household_active` (true when the user
belongs to ≥1 group) and `group_count`, set on `identify` (see
`../../src/lib/analytics/identity.ts`), so households can be rolled up without
joining any PII.

> Privacy: `householdId` is an opaque group id — never a family name — and the
> distinct id is the internal user id, never an email/name/Clerk id. Capture is
> consent-gated (#324).

## Signup-week cohorts

A user's **cohort** is the ISO week of their `signup_completed` event (the
`created_at` person trait — a date-only cohort anchor — is the fallback when
reconstructing historical cohorts). All users who signed up in the same week
form one cohort.

## Retention curves: D1 / D7 / W4

For a cohort, retention at an offset is the share of the cohort that has a
`cook_started` event within the window:

- **D1** — cooked on the day after signup (day offset 1).
- **D7** — cooked on day 7 (the key weekly-habit signal for a cooking app).
- **W4** — cooked during week 4 after signup (28–34 days) — the medium-term
  "stuck" signal.

Use **unbounded** (a.k.a. "returning") retention keyed on the person:
denominator = users in the signup-week cohort; numerator = those with ≥1
`cook_started` in the offset window.

### Per-household roll-up

To measure family retention, run the same analysis with the **household** as the
unit: group cooks by `householdId` (ignoring `null` / personal cooks, or
bucketing them as single-person households). A household is "retained" in a
window if **any** member has a `cook_started` with that `householdId`. This is
why the event carries the group id and identify carries `household_active` — a
family stays retained even when different members cook in different weeks.

## Cohort retention table

Build a standard triangular cohort table in the analytics tool:

| Signup week (cohort) | Users | Week 0 | Week 1 | Week 2 | Week 3 | Week 4 |
| -------------------- | ----- | ------ | ------ | ------ | ------ | ------ |
| 2024-W01             | n     | 100%   | …      | …      | …      | …      |
| 2024-W02             | n     | 100%   | …      | …      | …      | —      |
| …                    | …     | …      | …      | …      | —      | —      |

- **Rows:** signup-week cohorts (from `signup_completed` / `created_at`).
- **Columns:** weeks since signup; each cell = share of the cohort with a
  `cook_started` in that week.
- **Weekly** granularity smooths the day-of-week seasonality of home cooking
  (weekend spikes) better than daily.

Produce two versions of the table — **per user** and **per household**
(grouped by `householdId`) — so activation experiments and onboarding changes
can be judged on whether they move *durable family* retention, not just
first-week user activity.

## Reproducing it

1. **Curves:** retention insight, performed event `signup_completed`, returning
   event `cook_started`, unbounded, weekly, broken down by signup-week cohort;
   read D1/D7/W4 off the curve.
2. **Table:** cohort/retention table on the same events, weekly columns.
3. **Household view:** duplicate 1–2 with the aggregation unit switched to
   `householdId` (filter out `null` or treat as singleton households).

Tie the top-of-funnel to activation (`activation.md`) and experiments
(`experiments/`) so a win in first-recipe conversion can be traced through to
whether those families are still cooking at W4.
