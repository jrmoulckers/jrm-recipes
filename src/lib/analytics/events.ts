/**
 * The Heirloom analytics **taxonomy** — the single source of truth for every
 * event name and its property shape (issue #305).
 *
 * `track`/`captureServer` are typed against {@link EventProperties} so a misnamed
 * event or a wrong/missing property fails at **compile time**, preventing the
 * `recipe_created` vs `create_recipe` drift that plagues ad-hoc instrumentation.
 *
 * Rules for properties:
 * - **No PII, ever** — no emails, names, handles, or raw ids of people. Recipe
 *   and group ids are opaque cuids and are fine; user identity is attached only
 *   via server-side `identify` (issue #321), never as an event property.
 * - Values are constrained to enums/counts/flags wherever possible so insights
 *   stay low-cardinality and safe.
 */

/** Recipe visibility, mirrored from the recipe validation enum. */
export type RecipeVisibility = "private" | "group" | "unlisted" | "public";

/** How a recipe entered the app. */
export type RecipeSource = "manual" | "import";

/** Cook Mode ingredient unit system. */
export type CookUnitSystem = "original" | "us" | "metric" | "grams";

/** How a recipe was shared. */
export type ShareMethod = "native" | "file" | "copy_link";

/** Reel export shape + delivery. */
export type ReelExportKind = "image" | "video";
export type ReelExportMethod = "download" | "share";

/** Group roles that can be invited/assigned (never "owner"). */
export type InviteRole = "admin" | "member" | "kid";

/** Where a waitlist email was captured (mirrors the waitlist source enum). */
export type WaitlistSource = "landing" | "hero" | "closing";

/** Coarse group-size buckets — keeps household size low-cardinality + non-identifying. */
export type GroupSizeBucket = "1" | "2-5" | "6-10" | "11+";

/**
 * Event name → property shape. Events with no properties map to
 * `Record<string, never>` so their call sites pass `{}` and can't smuggle in
 * stray (possibly identifying) properties.
 */
export interface EventProperties {
  // --- Pageviews & navigation (#322) ---
  $pageview: { pathname: string; $current_url: string };

  // --- Recipe creation & editing funnel (#310) ---
  recipe_created: {
    recipeId: string;
    ingredientCount: number;
    stepCount: number;
    hasPhoto: boolean;
    visibility: RecipeVisibility;
    source: RecipeSource;
  };
  recipe_updated: {
    recipeId: string;
    ingredientCount: number;
    stepCount: number;
    hasPhoto: boolean;
    visibility: RecipeVisibility;
  };
  recipe_deleted: { recipeId: string };
  recipe_forked: { recipeId: string; sourceId: string };
  recipe_reverted: { recipeId: string; versionNumber: number };
  recipe_imported: { ok: boolean };
  editor_opened: { mode: "create" | "edit" };
  editor_save_failed: { mode: "create" | "edit"; fieldCount: number };

  // --- Cook Mode lifecycle (#313) ---
  // householdId (#338): the recipe's owning group, or null for a personal
  // recipe — lets returning-cook retention roll up per family/household.
  cook_started: {
    recipeId: string;
    totalSteps: number;
    householdId: string | null;
  };
  cook_step_advanced: {
    recipeId: string;
    stepIndex: number;
    totalSteps: number;
  };
  cook_completed: {
    recipeId: string;
    totalSteps: number;
    durationMs: number;
    householdId: string | null;
  };
  cook_timer_started: { recipeId: string };
  cook_timer_completed: { recipeId: string };
  cook_servings_scaled: { recipeId: string; servings: number };
  cook_unit_system_changed: { recipeId: string; system: CookUnitSystem };

  // --- Share & reel virality loop (#316) ---
  recipe_shared: { method: ShareMethod };
  share_card_downloaded: Record<string, never>;
  share_link_copied: Record<string, never>;
  // Owner-facing share-link revocation / rotation (issue #207).
  share_link_disabled: Record<string, never>;
  share_link_rotated: Record<string, never>;
  reel_exported: { kind: ReelExportKind; method: ReelExportMethod };

  // --- Group collaboration & invite funnel (#317) ---
  group_created: { groupId: string; sizeBucket: GroupSizeBucket };
  invite_sent: { groupId: string; role: InviteRole; sizeBucket: GroupSizeBucket };
  invite_accepted: { groupId: string; role: string };
  // Shareable invite links (#343): a manager minted a link; joins reuse
  // `invite_accepted`. Role is the (non-privileged) role the link grants.
  invite_link_created: { groupId: string; role: InviteRole };
  // Invite-link revocation (#366): a manager killed a shareable link so it can
  // no longer be redeemed. Keyed by group slug (the action's revoke handle).
  invite_link_revoked: { slug: string };
  member_role_changed: { groupId: string; role: InviteRole };
  group_left: { groupId: string };
  group_deleted: { groupId: string };

  // --- Activation & onboarding funnel (#328) ---
  landing_viewed: Record<string, never>;
  signup_started: Record<string, never>;
  signup_completed: Record<string, never>;
  first_recipe_created: { recipeId: string };
  first_cook_started: { recipeId: string };

  // --- Top-of-funnel waitlist capture (#351) ---
  // `duplicate` flags a resubmission of an already-captured email so the
  // conversion funnel can dedupe. No PII — the email is never an event property.
  waitlist_joined: { source: WaitlistSource; duplicate: boolean };

  // --- Weekly digest retention loop (#354) ---
  digest_opt_in_changed: { optedIn: boolean };

  // --- Experimentation (#335/#336) ---
  $feature_flag_called: {
    $feature_flag: string;
    $feature_flag_response: string | boolean;
  };
  experiment_exposed: { experiment: string; variant: string };
}

/** Every allowed event name. */
export type AnalyticsEventName = keyof EventProperties;

/**
 * A fully-formed, taxonomy-valid event. The discriminated union means a `name`
 * is only ever paired with its own property shape.
 */
export type AnalyticsEvent = {
  [K in AnalyticsEventName]: {
    name: K;
    properties: EventProperties[K];
  };
}[AnalyticsEventName];
