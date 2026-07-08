/**
 * Subscription plans & entitlements — the single source of truth for what
 * Heirloom sells and exactly what each tier unlocks (issue #298).
 *
 * This module is intentionally **pure**: it imports nothing from the database,
 * Stripe, Clerk, or `~/env`, so it can be imported from client components,
 * server code, and the Drizzle schema alike, and stays trivially testable.
 *
 * How to read this as a non-engineer:
 * - Each plan below has marketing copy (`name`, `tagline`, `highlights`) plus an
 *   `entitlements` object.
 * - `entitlements` has two kinds of keys:
 *     • feature flags (true/false) — is this premium feature switched on?
 *     • numeric limits — how many recipes / MB of storage / family members /
 *       monthly AI credits the plan allows. `null` means "unlimited".
 * - Real prices live in Stripe (looked up by the env var named in
 *   `stripePriceEnvKey`); the numbers here are for display only.
 */

/** Every plan id we sell. `free` is the default, unpaid tier. */
export const PLAN_IDS = ["free", "family"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

/**
 * Premium feature switches. Mirrors the roadmap's premium surfaces: AI
 * generation/tutor/substitutions, video/reels export, and advanced family
 * collaboration.
 */
export type FeatureFlagKey =
  | "aiGeneration"
  | "aiTutor"
  | "aiSubstitutions"
  | "videoExport"
  | "advancedCollaboration";

/**
 * Numeric caps. A value of `null` means "unlimited" (see {@link isUnlimited} /
 * {@link limitToNumber}); `0` means the feature is fully off for that plan.
 */
export type LimitKey =
  | "maxRecipes"
  | "maxStorageMb"
  | "maxFamilyMembers"
  | "maxGroups"
  | "aiCreditsPerMonth";

/** A limit value: a concrete cap, or `null` for unlimited. */
export type LimitValue = number | null;

/** The complete, per-plan capability object. Every key is always present. */
export type Entitlements = Record<FeatureFlagKey, boolean> &
  Record<LimitKey, LimitValue>;

/** Any single entitlement key (feature flag or limit). */
export type EntitlementKey = keyof Entitlements;

/** All feature-flag keys, exported so callers/tests can iterate exhaustively. */
export const FEATURE_FLAG_KEYS: readonly FeatureFlagKey[] = [
  "aiGeneration",
  "aiTutor",
  "aiSubstitutions",
  "videoExport",
  "advancedCollaboration",
];

/** All numeric-limit keys, exported so callers/tests can iterate exhaustively. */
export const LIMIT_KEYS: readonly LimitKey[] = [
  "maxRecipes",
  "maxStorageMb",
  "maxFamilyMembers",
  "maxGroups",
  "aiCreditsPerMonth",
];

export type Plan = {
  id: PlanId;
  /** Display name, e.g. "Family". */
  name: string;
  /** One-line value proposition. */
  tagline: string;
  /** Marketing bullet points rendered on `/pricing`. */
  highlights: readonly string[];
  /**
   * Display price in whole USD per month (0 for Free). This is for the pricing
   * UI only — the amount actually charged is controlled by the Stripe Price
   * referenced via {@link stripePriceEnvKey}.
   */
  monthlyPriceUsd: number;
  /**
   * Name of the environment variable that holds this plan's Stripe **Price ID**
   * (e.g. `price_123…`). Kept as a reference, never the value, so no billing id
   * or secret is committed. `null` for Free (nothing to buy).
   */
  stripePriceEnvKey: string | null;
  /** Free-trial length in days offered at checkout. `0` = no trial. */
  trialDays: number;
  entitlements: Entitlements;
};

/**
 * Free — the generous, always-available tier. No feature flags, comfortable but
 * finite limits so families can fully use Heirloom before deciding to upgrade.
 */
const free: Plan = {
  id: "free",
  name: "Free",
  tagline: "Everything a family needs to start cooking together.",
  highlights: [
    "Up to 50 saved recipes",
    "One family group, up to 5 members",
    "200 MB of photo storage",
    "Cook Mode, meal planning & shopping lists",
  ],
  monthlyPriceUsd: 0,
  stripePriceEnvKey: null,
  trialDays: 0,
  entitlements: {
    aiGeneration: false,
    aiTutor: false,
    aiSubstitutions: false,
    videoExport: false,
    advancedCollaboration: false,
    maxRecipes: 50,
    maxStorageMb: 200,
    maxFamilyMembers: 5,
    maxGroups: 1,
    aiCreditsPerMonth: 0,
  },
};

/**
 * Family / Premium — unlocks the AI features, video/reels export, and lifts the
 * limits so a whole extended family can keep every recipe forever.
 */
const family: Plan = {
  id: "family",
  name: "Family",
  tagline: "Unlimited recipes and AI help for the whole family.",
  highlights: [
    "Unlimited recipes",
    "Up to 20 family members across unlimited groups",
    "10 GB of photo & video storage",
    "AI recipe generation, cooking tutor & substitutions",
    "Video & reel exports to share your dishes",
    "500 AI credits every month",
  ],
  monthlyPriceUsd: 5,
  stripePriceEnvKey: "STRIPE_PRICE_FAMILY",
  trialDays: 14,
  entitlements: {
    aiGeneration: true,
    aiTutor: true,
    aiSubstitutions: true,
    videoExport: true,
    advancedCollaboration: true,
    maxRecipes: null,
    maxStorageMb: 10 * 1024,
    maxFamilyMembers: 20,
    maxGroups: null,
    aiCreditsPerMonth: 500,
  },
};

/** All plans keyed by id. */
export const PLANS: Record<PlanId, Plan> = { free, family };

/** Ordered list for rendering Free → paid on the pricing page. */
export const PLAN_LIST: readonly Plan[] = [free, family];

/** The default plan for anyone without an active paid subscription. */
export const DEFAULT_PLAN_ID: PlanId = "free";

/** Entitlements granted when no active subscription resolves. */
export const FREE_ENTITLEMENTS: Entitlements = free.entitlements;

/**
 * Seat-counting rules for Family group subscriptions (issue #325), kept here as
 * the single documented source of truth.
 */
export const SEAT_RULES = {
  /**
   * Whether a `kid`-role member consumes one of the plan's paid seats. Kids ride
   * free so families are never nudged to leave a child off the account.
   */
  kidsCountAsSeats: false,
} as const;

/**
 * Gift purchase configuration (issue #331): a one-time payment that grants a
 * fixed span of Family to whoever redeems the code.
 */
export const GIFT_CONFIG = {
  planId: "family" as PlanId,
  /** How long a redeemed gift grants Family for. */
  durationMonths: 12,
  /** Env var holding the Stripe one-time Price ID for the gift. */
  stripePriceEnvKey: "STRIPE_PRICE_GIFT_FAMILY",
} as const;

/** True when a limit value means "unlimited". */
export function isUnlimited(value: LimitValue): boolean {
  return value === null;
}

/** Coerce a limit to a comparable number (`null` → `Infinity`). */
export function limitToNumber(value: LimitValue): number {
  return value ?? Number.POSITIVE_INFINITY;
}

/** Type guard for a known plan id. */
export function isPlanId(value: string): value is PlanId {
  return (PLAN_IDS as readonly string[]).includes(value);
}

/** Look up a plan by id. Falls back to Free for an unknown id. */
export function getPlan(id: string): Plan {
  return isPlanId(id) ? PLANS[id] : free;
}

/** The entitlements for a plan id (Free for anything unknown). */
export function getPlanEntitlements(id: string): Entitlements {
  return getPlan(id).entitlements;
}
