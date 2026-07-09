# Pricing and packaging

Heirloom's plan catalog is defined in `src/config/plans.ts`. That file is the
source of truth for plan ids, display copy, feature flags, numeric limits, trial
length, seat rules, and gift configuration. Real Stripe prices live in Stripe and
are referenced by environment variable names such as `STRIPE_PRICE_FAMILY`; the
display prices in code are product-display values.

## Current tiers

| Tier | Display price | Trial | Tagline | Highlights from code |
| --- | ---: | ---: | --- | --- |
| Free | $0/month | 0 days | "Everything a family needs to start cooking together." | Up to 50 saved recipes; one family group up to 5 members; 200 MB photo storage; Cook Mode, meal planning, and shopping lists. |
| Family | $5/month | 14 days | "Unlimited recipes and AI help for the whole family." | Unlimited recipes; up to 20 family members across unlimited groups; 10 GB photo and video storage; AI recipe generation, cooking tutor, and substitutions; video and reel exports; 500 AI credits every month. |

## Entitlement comparison

In `src/config/plans.ts`, boolean entitlements are feature flags. Numeric limits
use `null` for unlimited and `0` for off.

| Entitlement | Free | Family |
| --- | ---: | ---: |
| `aiGeneration` | Off | On |
| `aiTutor` | Off | On |
| `aiSubstitutions` | Off | On |
| `videoExport` | Off | On |
| `advancedCollaboration` | Off | On |
| `maxRecipes` | 50 | Unlimited (`null`) |
| `maxStorageMb` | 200 MB | 10,240 MB (10 GB) |
| `maxFamilyMembers` | 5 | 20 |
| `maxGroups` | 1 | Unlimited (`null`) |
| `aiCreditsPerMonth` | 0 | 500 |
| `stripePriceEnvKey` | `null` | `STRIPE_PRICE_FAMILY` |
| `trialDays` | 0 | 14 |

## Packaging strategy

The implemented strategy is generous freemium. Free is not a demo: its tagline
is "Everything a family needs to start cooking together," and it includes the
core cooking workflow, planner, shopping lists, one group, five members, 50
recipes, and 200 MB of storage. That lets a family experience the loop before
upgrading.

The value metric for Family is family scale plus premium creation/sharing power:

- **Scale:** unlimited recipes, unlimited groups, 20 family members, and 10 GB of
  storage.
- **AI:** generation, tutor, substitutions, and 500 monthly AI credits.
- **Sharing:** video and reel export.
- **Collaboration:** `advancedCollaboration` is enabled only on Family.

The main Free → Family conversion levers in code are the 50-recipe cap, five
member cap, one-group cap, 200 MB storage cap, and all AI/video features being
locked on Free.

## Billing model facts from code

- Plan ids are `free` and `family` (`PLAN_IDS` in `src/config/plans.ts`).
- Free is the default plan (`DEFAULT_PLAN_ID`) and the fallback entitlements.
- `src/server/db/schema/billing.ts` models `billing_customers` with exactly one
  owner: `userId` XOR `groupId`, enforced by the
  `billing_customers_owner_check` constraint. That supports personal
  user-owned billing and group-owned family billing.
- The entitlement resolver in `src/server/billing/entitlements.ts` checks the
  user's personal billing customer and billing customers for every group they
  belong to. Active or trialing paid subscriptions win over Free.
- The current checkout action in `src/server/billing/actions.ts` creates or
  finds a personal Stripe customer for the user; group/family billing is
  represented separately by the group-owned side of the schema.
- Family subscriptions store `status`, `currentPeriodEnd`, `trialEnd`,
  `cancelAtPeriodEnd`, and `seats` in the `subscriptions` table
  (`src/server/db/schema/billing.ts`).
- Seat enforcement uses `SEAT_RULES.kidsCountAsSeats = false` from
  `src/config/plans.ts`. Kids ride free so families are not nudged to leave a
  child off the account. `src/server/groups/mutations.ts` enforces this before
  adding seat-consuming members.
- Family has a 14-day trial (`trialDays: 14`), and `trialEnd` is persisted so
  billing UI can show the real end date.
- Gifts are configured by `GIFT_CONFIG` in `src/config/plans.ts` (#331): a
  one-time Stripe price `STRIPE_PRICE_GIFT_FAMILY` grants 12 months of the
  Family plan. Gift rows are modeled in `gift_codes` in
  `src/server/db/schema/billing.ts`.

## Future directions, not implemented

These are strategy ideas, not current behavior:

- Annual Family pricing with a discount.
- Add-on AI credit packs above the included 500 monthly credits.
- Larger extended-family or community plans with higher seat/storage limits.
- Gift bundles for holidays or family reunions.

Any new package should start by updating `src/config/plans.ts`, because that is
the source of truth for entitlements and plan display data.

_Related issue: #332._
