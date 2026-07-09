# North-star metric and KPI dashboard

Heirloom's core loop is documented in `docs/analytics/activation.md` as
_write a recipe → cook it → keep it in the family_. The retained action in
`docs/analytics/retention.md` is cooking, measured with `cook_started` and
`cook_completed`, and the durable unit is the household (`householdId`).

## North-star metric

**Weekly active cooking households (WACH):** the count of distinct non-null
`householdId` values with at least one `cook_started` event in a calendar week.

Source:

- Event: `cook_started`
- Properties: `householdId: string | null`, `recipeId: string`,
  `totalSteps: number`
- Taxonomy: `src/lib/analytics/events.ts`
- Call site: `src/components/cook/use-cook-session.ts`

Use `cook_started` because it is the retained action: a family came back to cook
from Heirloom. Use households because the product is about preserving and using
recipes together, and `docs/analytics/retention.md` explicitly defines household
roll-ups. `cook_completed` is a deeper-engagement quality check, not the primary
reach metric.

WACH beats vanity metrics such as pageviews, signups, or recipe count because it
measures repeated family value. A recipe that never gets cooked is content
inventory; a household that cooks weekly is an active family habit.

Personal cooks have `householdId: null`. Track them as a companion segment or
singleton-household view, but keep the headline WACH focused on real group
households so the metric matches the family-retention definition.

## KPI dashboard

| KPI | Definition | Source event(s) | Why it matters |
| --- | --- | --- | --- |
| Activation rate | Share of `signup_completed` users who fire both `first_recipe_created` and `first_cook_started` within 7 days, or who join a recipe-bearing group per `docs/analytics/activation.md`. | `signup_completed`, `first_recipe_created`, `first_cook_started`, plus invite/group context from `invite_accepted` | Measures whether new users reach the core loop quickly. |
| D1 / D7 / W4 returning-cook retention | Share of signup-week cohorts with at least one `cook_started` in the D1, D7, or W4 window, per `docs/analytics/retention.md`. | `signup_completed`, `cook_started`; `householdId` for household view | Shows whether cooking becomes a habit. |
| Recipe creation volume | Count of `recipe_created` events by week, with optional breakdowns by `visibility`, `hasPhoto`, ingredient count, and step count. | `recipe_created` | Healthy recipe supply feeds future cooking sessions. |
| Editor failure rate | `editor_save_failed / editor_opened`, broken down by `mode`. | `editor_opened`, `editor_save_failed` | Creation friction can suppress activation and recipe supply. |
| Invite funnel | Conversion from `invite_sent` to `invite_accepted`, plus share-link creation volume. | `invite_sent`, `invite_accepted`, `invite_link_created` | Family collaboration is the household growth loop. |
| Share and virality | Weekly counts of recipe shares, share-card downloads, share-link copies, and reel exports. | `recipe_shared`, `share_card_downloaded`, `share_link_copied`, `reel_exported` | Sharing creates referral and emotional-value loops. |
| Signup funnel | Ordered funnel from landing to signup completion. | `landing_viewed` → `signup_started` → `signup_completed` | Diagnoses top-of-funnel conversion before product activation. |
| Weekly digest engagement | Net digest opt-ins and opt-outs. | `digest_opt_in_changed` | Digest is a retention loop; opt-outs can warn that messaging is mistimed or low value. |
| Experiment exposure and conversion | Exposure-based conversion by flag value. | `$feature_flag_called`; metric event such as `first_recipe_created` | Keeps activation experiments tied to real outcomes. See `docs/analytics/experiments/empty-library-cta.md`. |

## Guardrail metrics

| Guardrail | Definition | Source | Why it must not get worse |
| --- | --- | --- | --- |
| Cook completion rate | `cook_completed / cook_started` by week and household segment. | `cook_started`, `cook_completed` | WACH growth is low quality if more sessions are abandoned. |
| Editor save failure rate | `editor_save_failed / editor_opened`, especially in create mode. | `editor_opened`, `editor_save_failed` | Growth work must not make authoring recipes harder. |
| Privacy and PII safety | No event properties containing emails, names, handles, phone numbers, or person ids; verify taxonomy and scrub output. | `src/lib/analytics/events.ts`, `src/lib/analytics/scrub.ts`, `src/lib/analytics/identity.ts` | Trust is core to family data; analytics must remain non-identifying. |
| Consent compliance | Capture respects DNT/GPC, explicit denial, and opt-in mode before dispatch. | `src/lib/analytics/consent.ts`, `src/lib/analytics/server.ts` | Growth should not come from bypassing user privacy choices. |
| Digest opt-out rate | Share of `digest_opt_in_changed` events where `optedIn=false`. | `digest_opt_in_changed` | Retention messaging should not train families to disengage. |
| Subscription churn | Weekly paid subscriptions with `status='canceled'` or `cancelAtPeriodEnd=true`. | `subscriptions.status`, `subscriptions.cancelAtPeriodEnd` in `src/server/db/schema/billing.ts` | Paid growth is not healthy if more families cancel. |
| Trial conversion health | Family trials that become active before/after `trialEnd`. | `subscriptions.status`, `subscriptions.trialEnd` in `src/server/db/schema/billing.ts` | The 14-day trial should create confidence, not surprise or churn. |
| Performance/error budget | Page and server-action errors for key surfaces: editor, Cook Mode, sharing, billing. | App monitoring plus call-site paths in `src/components/cook/use-cook-session.ts`, `src/components/recipe/recipe-editor.tsx`, `src/server/billing/actions.ts` | A larger funnel is bad if reliability regresses. |

## Building the dashboard in PostHog

- **North star:** create a weekly trends insight on `cook_started`, aggregate by
  unique `householdId`, and filter out `householdId is null` for headline WACH.
- **Activation:** build the ordered funnel from
  `landing_viewed → signup_started → signup_completed → first_recipe_created →
  first_cook_started` with a 7-day conversion window, matching
  `docs/analytics/activation.md`.
- **Retention:** use `signup_completed` as the performed event and
  `cook_started` as the returning event, unbounded, weekly, then duplicate the
  view by `householdId`, matching `docs/analytics/retention.md`.
- **Invite and signup funnels:** use PostHog funnel insights on the event
  sequences in the KPI table.
- **Guardrails:** add trend cards for ratios such as
  `cook_completed / cook_started` and `editor_save_failed / editor_opened`, plus
  a billing query or warehouse table for subscription status.

_Related issue: #329._
